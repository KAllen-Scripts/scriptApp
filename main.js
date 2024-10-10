const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const Database = require('better-sqlite3');
const { exec } = require('child_process');
const os = require('os');
const axios = require('axios')
const fs = require('fs')
const Papa = require('papaparse');
let CSVs = {}

const store = new Store();

if (process.env.NODE_ENV !== 'production') {
    try {
        require('electron-reloader')(module);
    } catch (_) {
        console.log('Failed to load electron-reloader.');
    }
}

let mainWindow;
let tray;
let itemsAttributesDB;
let itemCostsDB;
let trayClickTime = 0; // To track the time of the last tray icon click

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    const iconPath = path.join(__dirname, 'stokly icon.ico'); // Path to app icon

    mainWindow = new BrowserWindow({
        width: width,
        height: height,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: iconPath
    });

    mainWindow.loadFile('./index.html');

    mainWindow.on('minimize', function(event) {
        event.preventDefault();
        mainWindow.hide();
    });

    mainWindow.on('close', function(event) {
        if (!app.isQuiting) {
            event.preventDefault();
            mainWindow.hide(); // Hide the window instead of closing
        }
        return true; // Allow window to close if app is quitting
    });

    ipcMain.on('data-sent', (event, csvName, data, sectionId) => {
        if(CSVs[sectionId] == undefined){CSVs[sectionId] = {}}
        if(CSVs[sectionId][csvName] == undefined){CSVs[sectionId][csvName] = []}
        CSVs[sectionId][csvName].push(...data)
        event.sender.send('data-received');
    });

    ipcMain.on('write-CSVs', (event, logPath, email, sectionId, supplier) => {
        let title = `Stock Sync Summary for Supplier ${supplier}`
        let body = ''
        const currentDate = new Date().toISOString().replace(/[:]/g, '-').split('.')[0];
        let fullLogPath = `${logPath}/${supplier}/${currentDate}`
        fs.mkdirSync(fullLogPath, { recursive: true });
        for (const csv in CSVs[sectionId]){
            body += `-${csv}: ${CSVs[sectionId][csv].length}\n`
            saveObjectArrayToCSV(`${fullLogPath}/${csv}`, CSVs[sectionId][csv])
        }
        if(body != ''){
            sendEmailSMTP2GO(email, title, body)
        }
        CSVs[sectionId] = {}
    });

    ipcMain.on('Section-Failed', (event, logPath, email, sectionId, supplier) => {
        sendEmailSMTP2GO(email, `Sync Failed for supplier ${supplier}`, `Sync has failed for supplier ${supplier}: Section ID - ${sectionId}`)
    });

    ipcMain.on('save-data', (event, data) => {
        store.set(data);
        event.sender.send('save-dataResponse');
    });

    ipcMain.on('load-data', (event, prop) => {
        event.reply('load-dataResponse', store.get(prop));
    });


    // try {
        // Initialize better-sqlite3 databases
        itemsAttributesDB = new Database(path.join(app.getPath('userData'), 'itemsAttributesDB.db'));
        itemCostsDB = new Database(path.join(app.getPath('userData'), 'itemCostsDB.db'));

        // Create table in itemsAttributesDB if it doesn't exist with itemId as the primary key
        itemsAttributesDB.exec(`CREATE TABLE IF NOT EXISTS items (
            itemId TEXT PRIMARY KEY COLLATE NOCASE
        )`);

        // Create table in itemCostsDB if it doesn't exist
        itemCostsDB.exec(`CREATE TABLE IF NOT EXISTS itemCosts (
            itemId TEXT COLLATE NOCASE,
            itemIdOnly TEXT COLLATE NOCASE,
            supplier TEXT COLLATE NOCASE,
            supplierSku TEXT COLLATE NOCASE,
            uomID TEXT COLLATE NOCASE,
            supplierId TEXT COLLATE NOCASE,
            quantityInUnit REAL,
            cost REAL,
            PRIMARY KEY (itemId, supplier, quantityInUnit)
        )`);

        ipcMain.handle('get-items', async (event, property, values) => {
            if (!Array.isArray(values)) {
                throw new Error('Expected an array of values');
            }

            const placeholders = values.map(() => '?').join(', ');
            const query = `SELECT * FROM items WHERE LOWER("${property}") IN (${placeholders})`;

            // try {
                const stmt = itemsAttributesDB.prepare(query);
                // Pass the values as lowercase for comparison, but retain original case in database
                return stmt.all(values.map(v => v.toLowerCase()));
            // } catch (error) {
            //     console.error('Database error:', error);
            //     throw error;
            // }
        });

        ipcMain.handle('upsert-item-property', async (event, itemId, propertyName, propertyValue) => {
            // Check if the column already exists
            const columnExistsQuery = `
                SELECT name 
                FROM pragma_table_info('items') 
                WHERE name = ?;
            `;
            
            try {
                const columnCheck = itemsAttributesDB.prepare(columnExistsQuery).get(propertyName);
                
                // If the column doesn't exist, add it
                if (!columnCheck) {
                    itemsAttributesDB.exec(`ALTER TABLE items ADD COLUMN "${propertyName}" TEXT COLLATE NOCASE`);
                }
                
                // Proceed with the upsert operation
                const query = `INSERT INTO items (itemId, "${propertyName}") 
                               VALUES (?, ?)
                               ON CONFLICT(itemId) DO UPDATE SET 
                               "${propertyName}" = excluded."${propertyName}"`;
                const stmt = itemsAttributesDB.prepare(query);
                const info = stmt.run(itemId.toLowerCase(), propertyValue ? propertyValue.toString() : null);
        
                return info.changes > 0;
            } catch (error) {
                console.error('Error upserting item property:', error);
                throw error;
            }
        });

        ipcMain.handle('upsert-item-cost', async (event, itemCostEntries) => {
            try {
                // Loop through the object entries
                for (const [itemId, costEntries] of Object.entries(itemCostEntries)) {
                    // Remove all existing entries for the provided itemId
                    const deleteQuery = `DELETE FROM itemCosts WHERE itemId = ?`;
                    const deleteStmt = itemCostsDB.prepare(deleteQuery);
                    deleteStmt.run(itemId.toLowerCase());
        
                    // Prepare the insert statement
                    const insertQuery = `INSERT INTO itemCosts (itemId, itemIdOnly, supplier, supplierSku, cost, uomID, supplierId, quantityInUnit)
                                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                         ON CONFLICT(itemId, supplier, quantityInUnit) DO UPDATE SET 
                                         itemIdOnly = excluded.itemIdOnly, 
                                         supplierSku = excluded.supplierSku, 
                                         cost = excluded.cost, 
                                         uomID = excluded.uomID, 
                                         supplierId = excluded.supplierId, 
                                         quantityInUnit = excluded.quantityInUnit`;
        
                    const insertStmt = itemCostsDB.prepare(insertQuery);
        
                    // Insert each entry from the costEntries array into the database
                    for (const entry of costEntries) {
                        const { supplier, supplierSku, cost, uomID, supplierId, quantityInUnit } = entry;
        
                        // Run the insert statement
                        insertStmt.run(
                            itemId.toLowerCase(),
                            itemId.toLowerCase(), // itemIdOnly
                            supplier.toLowerCase(),
                            supplierSku,
                            cost,
                            uomID,
                            supplierId,
                            quantityInUnit
                        );
                    }
                }
        
                return true;
            } catch (error) {
                console.error('Error upserting item costs:', error);
                throw error;
            }
        });
        
        
        

        ipcMain.handle('get-item-costs', async (event, filters) => {
            if (typeof filters !== 'object' || Object.keys(filters).length === 0) {
                throw new Error('Expected a valid filters object with at least one field');
            }
        
            const conditions = [];
            const values = [];
        
            for (const [field, fieldValues] of Object.entries(filters)) {
                if (!Array.isArray(fieldValues)) {
                    throw new Error(`Expected an array of values for field "${field}"`);
                }
                const placeholders = fieldValues.map(() => '?').join(', ');
                conditions.push(`LOWER("${field}") IN (${placeholders})`);
                values.push(...fieldValues.map(v => v.toLowerCase()));
            }
        
            const query = `SELECT * FROM itemCosts WHERE ${conditions.join(' AND ')}`;
        
            try {
                const stmt = itemCostsDB.prepare(query);
                return stmt.all(values);
            } catch (error) {
                console.error('Database error in itemCostsDB:', error);
                throw error;
            }
        });
        
    // } catch (error) {
    //     console.error('Error setting up databases:', error);
    // }

    ipcMain.on('save-page', (event, pageContent) => {
        store.set('savedPage', pageContent); // Save the content under a variable
    });
    
    // Function to load the saved page
    ipcMain.handle('load-page', (event) => {
        return store.get('savedPage'); // Return the saved page content
    });

}

function sendEmailSMTP2GO(to, subject, text) {
    axios({
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Smtp2go-Api-Key': 'api-2FB182F09AB6447AAE59BF34A301D50D',
            'accept': 'application/json'
        },
        url: 'https://api.smtp2go.com/v3/email/send',
        data: {
            "sender": "k.allen@stok.ly",
            "to": [
              to
            ],
            "subject": subject,
            "text_body": text,
          }
    })
}

function saveObjectArrayToCSV(filePath, objectArray) {
    // Convert the object array to CSV
    const csv = Papa.unparse(objectArray);

    // Write the CSV to a file
    fs.writeFile(filePath, csv, 'utf8', (err) => {
        if (err) {
            console.error('Error writing CSV file:', err);
        } else {
            console.log('CSV file successfully saved at', filePath);
        }
    });
}

function createTray() {
    const trayIconPath = path.join(__dirname, 'stokly icon.ico'); // Path to tray icon
    const trayIcon = nativeImage.createFromPath(trayIconPath);
    tray = new Tray(trayIcon);

    // Track clicks to detect double clicks
    tray.on('click', (event) => {
        const now = Date.now();
        if (now - trayClickTime < 300) { // If two clicks are within 300ms, it's a double-click
            mainWindow.show();
        } else {
            trayClickTime = now; // Update the last click time
        }
    });

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Open',
            click: () => {
                mainWindow.show();
            }
        },
        {
            label: 'Quit',
            click: () => {
                app.isQuiting = true; // Set a flag to indicate that the application is quitting
                if (mainWindow) {
                    mainWindow.destroy(); // Forcefully close the window
                } else {
                    app.quit(); // In case the window is not available
                }
            }
        }
    ]);

    tray.setContextMenu(contextMenu);
    tray.setToolTip('Stokly Sync');
}

// Prevent system sleep
function preventSleep() {
    const platform = os.platform();

    if (platform === 'win32') {
        exec('powercfg -change -standby-timeout-ac 0'); // Prevent sleep on AC power
        exec('powercfg -change -monitor-timeout-ac 0'); // Prevent monitor sleep
    } else if (platform === 'darwin') {
        exec('caffeinate -i &'); // Prevent sleep on macOS
    } else if (platform === 'linux') {
        exec('caffeine &'); // Requires caffeine installed
    }
}

app.on('ready', () => {
    createWindow();
    createTray();
    preventSleep();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Make sure to close the database connections when the app is about to quit
app.on('will-quit', () => {
    if (itemsAttributesDB) {
        itemsAttributesDB.close();
    }
    if (itemCostsDB) {
        itemCostsDB.close();
    }
});

app.on('before-quit', () => {
    console.log('Application is about to quit'); // Debug log
});
