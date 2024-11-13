let itemsBeingUpdated = false;

async function startSyncForSection(section) {
    try {
        logStart(section.dataset.id)
        let activateButton = section.querySelector('.activate-button')
        activateButton.textContent = 'Processing'
        activateButton.classList.add('processing');
        activateButton.classList.remove('active');
        activateButton.classList.remove('inactive');
        // Initialize an object to store input values
        const sectionData = {
            stockDict: {},
            attDict: {},
            sectionId: section.dataset.id,
            supplier: section.querySelector('.section-label-input').value,
            ftpInputs: {
                address: section.querySelector('.ftp-address').value,
                port: section.querySelector('.ftp-port').value,
                filepath: section.querySelector('.ftp-filepath').value
            },
            url: section.querySelector('.url-input').value,
            filepath: section.querySelector('.file-input')?.files?.[0]?.path
        };

        const delimiterInput = section.querySelector('.delimiter-input');
        if (delimiterInput) {
            sectionData.delimiter = delimiterInput.value;
        }


        const labelInput = section.querySelector('.section-label-input');
        if (labelInput) {
            sectionData.supplier = labelInput.value;
        }

        // Get all other inputs in the section
        const inputs = section.querySelectorAll('input');

        // First loop: Collect general inputs
        inputs.forEach(input => {
            const name = input.name;
            const value = input.value;

            // Check if input name exists
            if (name) {
                // Skip stock level and attribute inputs for now
                if (name.startsWith('stockLevelName') || name.startsWith('stockLevelQty') || name.startsWith('attributeName') || name.startsWith('attributeHeader')) {
                    return; // Skip processing this input
                }
                // Add other inputs to sectionData
                sectionData[name] = value;
            }
        });

        // Second loop: Collect and process stock level names and quantities
        const stockLevels = section.querySelectorAll('.input-group');
        stockLevels.forEach(group => {
            const nameInput = group.querySelector('input[name^="stockLevelName"]');
            const qtyInput = group.querySelector('input[name^="stockLevelQty"]');
            
            if (nameInput && qtyInput) {
                sectionData.stockDict[nameInput.value.toLowerCase()] = qtyInput.value;
            }
        });

        // Third loop: Collect and process attribute names and headers
        const attributes = section.querySelectorAll('.dynamic-inputs .input-group');
        attributes.forEach(group => {
            const nameInput = group.querySelector('input[name^="attributeName"]');
            const headerInput = group.querySelector('input[name^="attributeHeader"]');

            if (nameInput && headerInput) {
                sectionData.attDict[nameInput.value.toLowerCase()] = {
                    rawValue: headerInput.value,
                    header: headerInput.value.split(':::')[0],
                    mod: 1 + ((headerInput.value.split(':::')[1]) / 100)
                }
            }
        });

        // Process the collected data
        await processData(sectionData);
        await makeCSVs(sectionData)
        activateButton.textContent = 'Deactivate'
        activateButton.classList.add('active');
        activateButton.classList.remove('processing');
        activateButton.classList.remove('inactive');
        logDelete(section.dataset.id)
    } catch (error) {
        ipcRenderer.send('Section-Failed', document.getElementById('logFilePath').value, document.getElementById('emailAddress').value, section.dataset.id, section.querySelector('.section-label-input').value, accountKey, error);
        console.error('Error in startSyncForSection:', error);
        let activateButton = section.querySelector('.activate-button')
        activateButton.textContent = 'Deactivate'
        activateButton.classList.add('active');
        activateButton.classList.remove('processing');
        activateButton.classList.remove('inactive');
        logDelete(section.dataset.id)
    }
}

async function processData(sectionData) {
    let promiseArr = [];
    let currentStock = {};



    if (sectionData.stockHeader.trim() !== '') {
        promiseArr.push((async () => {
            try {
                const locationResponse = await requester('get', `https://${enviroment}/v0/locations?filter=[status]=={0}%26%26[name]=={${sectionData.location}}`);
                sectionData.locationId = locationResponse.data[0].locationId;
    
                const binResponse = await requester('get', `https://${enviroment}/v0/locations/${sectionData.locationId}/bins?filter=[name]=={${sectionData.bin}}`);
                sectionData.binId = binResponse.data[0].binId;
    
                await loopThrough(`https://${enviroment}/v1/inventory-records`, 'size=1000&sortDirection=ASC&sortField=itemId', `[locationId]=={${sectionData.locationId}}%26%26([onHand]!={0}||[quarantined]!={0})%26%26[binId]=={${sectionData.binId}}`, (record) => {
                        currentStock[record.itemId] = record.onHand;
                });
    
                return true;
            } catch (error) {
                return error;
            }
        })());
    }


    sectionData.attributes = {}
    promiseArr.push((async()=>{
        try{
            await loopThrough(`https://${enviroment}/v0/item-attributes`, 'size=1000&sortDirection=ASC&sortField=name', `[status]!={1}%26%26[name]=*{${[...Object.keys(sectionData.attDict), sectionData.stoklyIdentifier].join(',')}}`, (attribute) => {
                sectionData.attributes[attribute.name.toLowerCase()] = attribute;
            })
            return true
        } catch (error) {
            return error;
        }
    })())

    promiseArr.push((async ()=>{
        try{
            if (sectionStatus[sectionData.sectionId].inputMode == 'url') {
                await axios({
                   method: 'get',
                   maxBodyLength: Infinity,
                   url: sectionData.url,
                   headers: {
                       'Authorization': `Basic ` + btoa(`${sectionData.userName}:${sectionData.password}`)
                   }
               }).then(async r => {
                   sectionData.csvData = await processFile(r.data)
               });
           } else if(sectionStatus[sectionData.sectionId].inputMode == 'upload') {
               sectionData.csvData = await processFile(fs.readFileSync(sectionData.filepath, 'utf8'))
           } else {
               sectionData.csvData = await getFileByFTP(sectionData.ftpInputs, sectionData.userName, sectionData.password).then(async r=>{
                   return processFile(r)
               })
           }
           return true
        } catch (error) {
            return error;
        }
    })())

    promiseArr.push((async()=>{
        try{
            await requester('get', `https://${enviroment}/v1/suppliers?filter=[status]!={1}%26%26[name]=={${sectionData.supplier}}`).then(r=>{
                sectionData.supplierId = r.data[0].supplierId
            })
            return true
        } catch (error) {
            return error;
        }
    })())

    while (itemsBeingUpdated) {
        await sleep(500);
    }

    await updateItems(sectionData)

    await Promise.all(promiseArr).then(r=>{
        for (const i of r){
            if (i !== true){
                throw new Error(i)
            }
        }
    })
    await processCSV(sectionData, currentStock);
}

async function updateItems(sectionData) {
    try {
        let itemsToUpdate = {}
        itemsBeingUpdated = true;
        let lastUpdate = await loadData('lastUpdate');
        let updateTimeStamp = new Date().toISOString();

        await loopThrough(`https://${enviroment}/v0/items`, 'size=1000&sortDirection=ASC&sortField=timeCreated', `[status]!={1}${lastUpdate ? `%26%26[timeUpdated]>>{${lastUpdate}}` : ''}`, async (item) => {
            itemsToUpdate[item.itemId] = item
        })

        await loopThrough(`https://${enviroment}/v0/item-attribute-values`, 'size=1000&sortField=timeUpdated&sortDirection=ASC', `[status]!={1}${lastUpdate ? `%26%26[timeUpdated]>>{${lastUpdate}}` : ''}`, async (attribute) => {
            if(itemsToUpdate[attribute.itemId] == undefined){
                await requester('get', `https://${enviroment}/v0/items?filter=[itemId]=={${attribute.itemId}}`).then(r=>{
                    itemsToUpdate[r.data[0].itemId] = r.data[0]
                })
            }
            itemsToUpdate[attribute.itemId][attribute.itemAttributeName] = attribute.value;
        });

        for (let i = 0; i < Object.keys(itemsToUpdate).length; i += 200) {
            const batch = Object.keys(itemsToUpdate).slice(i, i + 200);
            let itemsToUpdateCosts = {}

            let updateBatch = []
            for(const i of batch){
                updateBatch.push(itemsToUpdate[i])
            }
            await upsertItem(updateBatch)
            
            await loopThrough(`https://${enviroment}/v0/units-of-measure`, 'size=1000&sortDirection=ASC&sortField=supplierSku', `[itemId]=*{${batch.join(',')}}`, async (UOM) => {
                if(itemsToUpdateCosts[UOM.itemId] == undefined){itemsToUpdateCosts[UOM.itemId] = []}
                itemsToUpdateCosts[UOM.itemId].push({
                    itemId:UOM.itemId,
                    supplier:UOM.supplierName,
                    supplierSku:UOM.supplierSku,
                    cost:UOM.cost,
                    unitOfMeasureId:UOM.unitOfMeasureId,
                    supplierId:UOM.supplierId,
                    quantityInUnit:UOM.quantityInUnit
                })
            });
            await upsertItemCost(itemsToUpdateCosts)
            await removedItemCosts(itemsToUpdateCosts, sectionData)
        }
        await saveData({ lastUpdate: updateTimeStamp });
        
        itemsBeingUpdated = false;
    } catch (error) {
        console.error('Error in updateItems:', error);
        itemsBeingUpdated = false;
        throw error;
    }
}

async function processFile(fileData) {
    const zip = new JSZip();

    // Check if the data is a zip by attempting to load it
    try {
        const loadedZip = await zip.loadAsync(fileData);
        
        // Find the first directory in the zip file
        for (const relativePath in loadedZip.files) {
            const entry = loadedZip.files[relativePath];
            if (entry.dir) {
                // Get all files within the first directory
                const firstFolderFiles = Object.values(loadedZip.files).filter(file => 
                    file.name.startsWith(relativePath) && !file.dir
                );

                // Extract and return the contents of the first folder as an object
                const folderContents = {};
                for (const file of firstFolderFiles) {
                    folderContents[file.name] = await file.async("nodebuffer"); // return as Buffer
                }
                return folderContents;
            }
        }

        throw new Error("No folders found inside the zip file.");
    } catch (e) {
        // If fileData is not a zip, loadAsync will throw an error, so we return the original data
        return fileData;
    }
}