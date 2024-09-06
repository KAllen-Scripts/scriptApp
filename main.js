const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const Database = require('better-sqlite3');
const { exec } = require('child_process');
const os = require('os');

const store = new Store();

if (process.env.NODE_ENV !== 'production') {
    require('electron-reloader')(module);
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

    ipcMain.on('save-data', (event, data) => {
        store.set(data);
        event.sender.send('save-dataResponse');
    });

    ipcMain.on('load-data', (event, prop) => {
        event.reply('load-dataResponse', store.get(prop));
    });

    try {
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
            supplier TEXT COLLATE NOCASE,
            supplierSku TEXT COLLATE NOCASE,
            cost REAL,
            PRIMARY KEY (itemId, supplier)
        )`);

        ipcMain.handle('get-items', async (event, property, values) => {
            if (!Array.isArray(values)) {
                throw new Error('Expected an array of values');
            }

            const placeholders = values.map(() => '?').join(', ');
            const query = `SELECT * FROM items WHERE LOWER("${property}") IN (${placeholders})`;

            try {
                const stmt = itemsAttributesDB.prepare(query);
                // Pass the values as lowercase for comparison, but retain original case in database
                return stmt.all(values.map(v => v.toLowerCase()));
            } catch (error) {
                console.error('Database error:', error);
                throw error;
            }
        });

        ipcMain.handle('upsert-item-property', async (event, itemId, propertyName, propertyValue) => {
            try {
                // Ensure the column exists in itemsAttributesDB
                itemsAttributesDB.exec(`ALTER TABLE items ADD COLUMN "${propertyName}" TEXT COLLATE NOCASE`);
            } catch (error) {
                // Ignore error if column already exists
            }

            try {
                const query = `INSERT INTO items (itemId, "${propertyName}") 
                               VALUES (?, ?)
                               ON CONFLICT(itemId) DO UPDATE SET 
                               "${propertyName}" = excluded."${propertyName}"`;
                const stmt = itemsAttributesDB.prepare(query);
                // Store propertyValue without converting it to lowercase
                const info = stmt.run(itemId.toLowerCase(), propertyValue ? propertyValue.toString() : null);

                return info.changes > 0;
            } catch (error) {
                console.error('Error upserting item property:', error);
                throw error;
            }
        });

        ipcMain.handle('upsert-item-cost', async (event, itemId, supplier, supplierSku, cost, uomID) => {
            try {
                const query = `INSERT INTO itemCosts (itemId, supplier, supplierSku, cost, uomID)
                               VALUES (?, ?, ?, ?)
                               ON CONFLICT(itemId, supplier) DO UPDATE SET 
                               supplierSku = excluded.supplierSku,
                               cost = excluded.cost,
                               uomID = excluded.uomID`;
                const stmt = itemCostsDB.prepare(query);
                // Store supplierSku and other values without converting them to lowercase
                const info = stmt.run(itemId.toLowerCase(), supplier.toLowerCase(), supplierSku, cost, uomID);

                return info.changes > 0;
            } catch (error) {
                console.error('Error upserting item cost:', error);
                throw error;
            }
        });

    } catch (error) {
        console.error('Error setting up databases:', error);
    }
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
