let itemsBeingUpdated = false;

async function startSyncForSection(section) {
    try {
        // Initialize an object to store input values
        const sectionData = {
            stockDict: {},
            attDict: {},
            sectionId: section.dataset.id
        };

        const delimiterInput = section.querySelector('.delimiter-input');
        if (delimiterInput) {
            sectionData.delimiter = delimiterInput.value;
        }

        // Get the URL and file input elements
        const urlInput = section.querySelector('.url-input');
        const fileInput = section.querySelector('.file-input');

        const labelInput = section.querySelector('.section-label-input');
        if (labelInput) {
            sectionData.supplier = labelInput.value;
        }

        if (fileInput && fileInput.files.length > 0) {
            sectionData.filepath = fileInput.files[0].path;
        }
        if (urlInput.value.trim() != "") {
            sectionData.url = urlInput.value;
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
    } catch (error) {
        ipcRenderer.send('Section-Failed', document.getElementById('logFilePath').value, document.getElementById('emailAddress').value, section.dataset.id);
        console.error('Error in startSyncForSection:', error);
    }
}

async function processData(sectionData) {
    
    try {
        let promiseArr = [];
        let currentStock = {};

        if(sectionData.stockHeader.trim() != ''){
            promiseArr.push(requester('get', `https://${enviroment}/v0/locations?filter=[status]=={0}%26%26[name]=={${sectionData.location}}`).then(r => {
                sectionData['locationId'] = r.data[0].locationId;
                promiseArr.push(requester('get', `https://${enviroment}/v0/locations/${sectionData.locationId}/bins?filter=[name]=={${sectionData.bin}}`).then(res => {
                    sectionData.binId = res.data[0].binId;
                    promiseArr.push(loopThrough(`https://${enviroment}/v1/inventory-records`, 'size=1000&sortDirection=ASC&sortField=itemId', `[locationId]=={${sectionData['locationId']}}%26%26([onHand]!={0}||[quarantined]!={0})%26%26[binId]=={${res.data[0].binId}}`, (record) => {
                        currentStock[record.itemId] = record.onHand;
                    }));
                }));
            }));
        }

        sectionData.attributes = {}
        promiseArr.push(loopThrough(`https://${enviroment}/v0/item-attributes`, 'size=1000&sortDirection=ASC&sortField=name', `[status]!={1}%26%26[name]=*{${[...Object.keys(sectionData.attDict), sectionData.stoklyIdentifier].join(',')}}`, (attribute) => {
            sectionData.attributes[attribute.name.toLowerCase()] = attribute;
        }));

        if (sectionStatus[sectionData.sectionId].inputMode == 'url') {
            promiseArr.push(axios({
                method: 'get',
                maxBodyLength: Infinity,
                url: sectionData.url,
                headers: {
                    'Authorization': `Basic ` + btoa(`${sectionData.userName}:${sectionData.password}`)
                }
            }).then(r => {
                sectionData.csvData = r.data;
            }));
        } else {
            sectionData.csvData = fs.readFileSync(sectionData.filepath, 'utf8');
        }

        promiseArr.push(requester('get', `https://${enviroment}/v1/suppliers?filter=[status]!={1}%26%26[name]=={${sectionData.supplier}}`).then(r=>{
            sectionData.supplierId = r.data[0].supplierId
        }))

        if (itemsBeingUpdated) {
            while (itemsBeingUpdated) {
                await sleep(500);
            }
        }

        promiseArr.push(updateItems(sectionData));

        await Promise.all(promiseArr);
        await processCSV(sectionData, currentStock);
    } catch (error) {
        console.error('Error in processData:', error);
        throw error; // Ensure error is propagated
    }
}

async function updateItems(sectionData) {
    try {
        let itemsToUpdate = []
        itemsBeingUpdated = true;
        let lastUpdate = await loadData('lastUpdate');
        let updateTimeStamp = new Date().toISOString();

        await loopThrough(`https://${enviroment}/v0/items`, 'size=1000&sortDirection=ASC&sortField=timeCreated', `[status]!={1}${lastUpdate ? `%26%26[timeUpdated]>>{${lastUpdate}}` : ''}`, async (item) => {
            try {
                itemsToUpdate.push(item.itemId)
                const lowerCaseKeysObj = Object.fromEntries(Object.entries(item).map(([k, v]) => [k.toLowerCase(), v]));
                for(const att of [...Object.keys(sectionData.attDict), sectionData.stoklyIdentifier]){
                    let lowerCaseAtt = att.toLowerCase()
                    if(lowerCaseKeysObj[lowerCaseAtt] != undefined){
                        await upsertItemProperty(lowerCaseKeysObj.itemid, lowerCaseAtt, lowerCaseKeysObj[lowerCaseAtt]);
                    }
                }
            } catch (error) {
                console.error('Error upserting item:', error);
                throw error;
            }
        })

        if (Object.keys(sectionData.attributes).length) {
            await loopThrough(`https://${enviroment}/v0/item-attribute-values`, 'size=1000&sortField=timeUpdated&sortDirection=ASC', `[itemAttributeId]=*{${Object.values(sectionData.attributes).map(obj => obj.itemAttributeId)}}%26%26[status]!={1}${lastUpdate ? `%26%26[timeUpdated]>>{${lastUpdate}}` : ''}`, async (attribute) => {
                try {
                    await upsertItemProperty(attribute.itemId, attribute.itemAttributeName, attribute.value);
                } catch (error) {
                    console.error('Error upserting item:', error);
                    throw error;
                }
            });
        }



        let itemsToUpdateCosts = {}
        for (let i = 0; i < itemsToUpdate.length; i += 200) {
            const batch = itemsToUpdate.slice(i, i + 200);
            
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
        }

        await removedItemCosts(itemsToUpdateCosts, sectionData)

        for (const i in itemsToUpdateCosts){
            await upsertItemCost(i, itemsToUpdateCosts[i])
        }
        

        await saveData({ lastUpdate: updateTimeStamp });
        itemsBeingUpdated = false;
    } catch (error) {
        console.error('Error in updateItems:', error);
        itemsBeingUpdated = false;
        throw error;
    }
}
