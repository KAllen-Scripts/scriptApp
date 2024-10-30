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
        ipcRenderer.send('Section-Failed', document.getElementById('logFilePath').value, document.getElementById('emailAddress').value, section.dataset.id, section.querySelector('.section-label-input').value);
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
               }).then(r => {
                   sectionData.csvData = r.data
               });
           } else if(sectionStatus[sectionData.sectionId].inputMode == 'upload') {
               sectionData.csvData = fs.readFileSync(sectionData.filepath, 'utf8');
           } else {
               sectionData.csvData = await getFileByFTP(sectionData.ftpInputs, sectionData.userName, sectionData.password).then(r=>{
                   return r
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
        let itemsToUpdate = []
        itemsBeingUpdated = true;
        let lastUpdate = await loadData('lastUpdate');
        let updateTimeStamp = new Date().toISOString();

        await loopThrough(`https://${enviroment}/v0/items`, 'size=1000&sortDirection=ASC&sortField=timeCreated', `[status]!={1}${lastUpdate ? `%26%26[timeUpdated]>>{${lastUpdate}}` : ''}`, async (item) => {
            itemsToUpdate.push(item.itemId)
            const lowerCaseKeysObj = Object.fromEntries(Object.entries(item).map(([k, v]) => [k.toLowerCase(), v]));
            for(const att of [...Object.keys(sectionData.attDict), sectionData.stoklyIdentifier]){
                let lowerCaseAtt = att.toLowerCase()
                if(lowerCaseKeysObj[lowerCaseAtt] != undefined){
                    await upsertItemProperty(lowerCaseKeysObj.itemid, lowerCaseAtt, lowerCaseKeysObj[lowerCaseAtt]);
                }
            }
        })

        await loopThrough(`https://${enviroment}/v0/item-attribute-values`, 'size=1000&sortField=timeUpdated&sortDirection=ASC', `[status]!={1}${lastUpdate ? `%26%26[timeUpdated]>>{${lastUpdate}}` : ''}`, async (attribute) => {
            await upsertItemProperty(attribute.itemId, attribute.itemAttributeName, attribute.value);
        });

        for (let i = 0; i < itemsToUpdate.length; i += 200) {
            const batch = itemsToUpdate.slice(i, i + 200);
            let itemsToUpdateCosts = {}
            
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
    // Check if the file matches the ZIP format using magic bytes
    const fileHeader = Array.from(fileData.slice(0, 4));
    const isZipFile = findMatch(fileHeader).some(match => match.mime === "application/zip");

    if (isZipFile) {
        // Load and unzip the file using JSZip
        const zip = await JSZip.loadAsync(fileData);

        // Assuming there's only one file in the zip, grab the first entry
        const zipEntries = Object.keys(zip.files);
        if (zipEntries.length === 0) {
            throw new Error("The ZIP file is empty");
        }

        // Read the content of the first file in the ZIP
        return await zip.files[zipEntries[0]].async("string");
    } else {
        // Return the file data as-is if it’s not a ZIP file
        return fileData.toString();
    }
}