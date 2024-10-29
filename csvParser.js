async function processCSV(sectionData, currentStock) {
    try {
        let stockUpdate = {
            "locationId": sectionData.locationId,
            "binId": sectionData.binId,
            "reason": "Stokly Sync",
            "items": []
        };

        let attributeUpdateArr = [];

        const parsePromise = new Promise((resolve, reject) => {
            Papa.parse(sectionData.csvData, {
                header: sectionStatus[sectionData.sectionId].headers,
                skipEmptyLines: true,
                delimiter: sectionData.delimiter,
                transformHeader: (header) => header.toLowerCase(),
                complete: async (results) => {
                    try {
                        let itemBatch = []
                        for (const row of results.data) {

                            itemBatch.push(row[sectionData.supplierIdentifier.toLowerCase()])
                            if (itemBatch.length >= 200){
                                let itemsFromdb = await getItems(sectionData.stoklyIdentifier, itemBatch)
                                for(const itemFromdb of itemsFromdb){
                                    if(!sectionStatus[sectionData.sectionId].active){continue}
                                    let itemid = itemFromdb?.itemid;
                                    if (!itemid){continue}
        
                                    if(sectionData.stockHeader.trim() != ''){
                                        let stockLevel = row[sectionData.stockHeader.toLowerCase()].toLowerCase();
        
                                        let stockLevelValue
                                        if (sectionData.stockDict[stockLevel] != undefined){
                                            stockLevelValue = sectionData.stockDict[stockLevel]
                                        } else {
                                            stockLevelValue = stockLevel
                                        }
            
            
                                        let quantity = stockLevelValue - (currentStock?.[itemid] || 0);
                                        if (quantity != 0) {
                                            stockUpdate.items.push({
                                                ...itemFromdb,
                                                itemId: itemid,
                                                quantity
                                            });
                                        }
            
                                        if (stockUpdate.items.length >= 200 && sectionStatus[sectionData.sectionId].active) {
                                            try{
                                                await requester('post', `https://${enviroment}/v1/adjustments`, stockUpdate);
                                                itemInventoryUpdated(stockUpdate.items, sectionData.sectionId)
                                            } catch {
                                                itemInventoryUpdatedFailed(stockUpdate.items, sectionData.sectionId)
                                            }
        
                                            stockUpdate.items = [];
                                        }
            
                                        delete currentStock[itemid]
                                    }
        
                                    let attributeUpdate = updateAttributes(sectionData, row, itemFromdb)
                                    if(attributeUpdate){attributeUpdateArr.push(attributeUpdate)}
        
                                    if (attributeUpdateArr.length >= 50) {
                                        await Promise.all(attributeUpdateArr);
                                        attributeUpdateArr = []
                                    }
                                }
                                itemBatch = []
                            }
                        }

                        resolve();
                    } catch (error) {
                        reject(error); // Ensure error is propagated
                    }
                }
            });
        });

        await parsePromise;

        if(sectionData.stockHeader.trim() != ''){
            for (const item in currentStock){
                if(currentStock[item] != 0){
                    stockUpdate.items.push({
                        itemId: item,
                        quantity: currentStock[item] * -1
                    });
                }
                if (stockUpdate.items.length >= 200 && sectionStatus[sectionData.sectionId].active) {
                    try{
                        await requester('post', `https://${enviroment}/v1/adjustments`, stockUpdate);
                        itemInventorySetToZero(stockUpdate.items, sectionData.sectionId)
                    } catch {
                        itemInventoryUpdatedFailed(stockUpdate.items, sectionData.sectionId)
                    }
                    stockUpdate.items = [];
                }
            }
    
            if (stockUpdate.items.length > 0 && sectionStatus[sectionData.sectionId].active) {
                try{
                    await requester('post', `https://${enviroment}/v1/adjustments`, stockUpdate);
                    itemInventoryUpdated(stockUpdate.items, sectionData.sectionId)
                } catch {
                    itemInventoryUpdatedFailed(stockUpdate.items, sectionData.sectionId)
                }
            }
        }

        await Promise.all(attributeUpdateArr);
    } catch (error) {
        console.error('Error in processCSV:', error);
        throw error; // Ensure error is propagated
    }
}

async function updateAttributes(sectionData, row, itemFromdb) {

    try{
        let attibuteUpdate = {
            "attributes": [],
            "appendAttributes": true,
            itemId: itemFromdb.itemid,
            updated: false
        }
    
    
        for (const attribute in sectionData.attDict){
    
            if(attribute.toLowerCase() == '-cost-'){
                productUpdated = await updateCost(attibuteUpdate, sectionData, row, itemFromdb, attribute)
            } else (
                productAttribute = updateAttribute(attibuteUpdate, sectionData, row, itemFromdb, attribute)
            )
    
        }
    
        if (attibuteUpdate.updated){
            attributeUpdated(itemFromdb, sectionData.sectionId)
            return requester('patch', `https://${enviroment}/v0/items/${itemFromdb.itemid}`, attibuteUpdate)
        }
    }catch{
        failedToUpdateAttribute(itemFromdb, sectionData.sectionId)
    }

}

async function updateCost(update, sectionData, row, itemFromdb, attribute) {
    // Initialize unitsOfMeasure if it's undefined
    if (!update.unitsOfMeasure) {
        update.unitsOfMeasure = [];
    }

    // Helper function to parse costPrice into price and quantityInUnit
    function parseCostPrice(costPrice) {
        const parts = costPrice.split(':');
        const quantityInUnit = parts[1] === undefined ? 1 : parts[0];
        const price = parts[1] === undefined ? parts[0] : parts[1] * quantityInUnit;
        return { price, quantityInUnit };
    }

    // Retrieve costPrices from the given row data
    let costPrices = row[sectionData.attDict[attribute].header.toLowerCase()].split(';');

    // Fetch item costs from the database
    const itemCostsFromdb = await getItemCosts({
        itemidonly: [itemFromdb.itemid],
        supplier: [sectionData.supplier]
    });

    // Loop through each item cost from the database
    for (const itemCost of itemCostsFromdb) {
        let costAdded = false;
        for (let i = 0; i < costPrices.length; i++) {
            let { price, quantityInUnit } = parseCostPrice(costPrices[i]);

            // If the quantity and cost don't match, add the item and remove the cost price
            if (itemCost.quantityinunit == quantityInUnit && price != itemCost.cost) {
                let UOM = {
                    unitOfMeasureId: itemCost.uomid,
                    supplierId: sectionData.supplierId,
                    supplierName: itemCost.supplier,
                    supplierSku: itemCost.suppliersku,
                    cost: { amount: price },
                    quantityInUnit: quantityInUnit
                }
                update.unitsOfMeasure.push(UOM);
                updateWithNewCosts(UOM, sectionData.sectionId)
                update.updated = true;
                costAdded = true;

                // Remove the matched costPrice and exit the inner loop
                costPrices.splice(i, 1);
                break;
            }
        }

        // If no match was found, push the current item cost from the DB
        if (!costAdded) {
            let UOM = {
                unitOfMeasureId: itemCost.uomid,
                supplierId: sectionData.supplierId,
                supplierName: itemCost.supplier,
                supplierSku: itemCost.suppliersku,
                cost: { amount: itemCost.cost },
                quantityInUnit: itemCost.quantityinunit
            }
            update.unitsOfMeasure.push(UOM);
            updateWithNewCosts(UOM, sectionData.sectionId)
        }
    }

    // Add remaining unmatched costPrices
    for (const costPrice of costPrices) {
        let { price, quantityInUnit } = parseCostPrice(costPrice);
        update.unitsOfMeasure.push({
            supplierId: sectionData.supplierId,
            supplierName: sectionData.supplier,
            supplierSku: row[sectionData.supplierIdentifier.toLowerCase()],
            cost: { amount: price },
            quantityInUnit: quantityInUnit
        });
        update.updated = true;
    }
}


function updateAttribute(update, sectionData, row, itemFromdb, attribute){

    let rowValue = row[sectionData.attDict[attribute].header]
    if (!isNaN(sectionData.attDict[attribute].mod) && !isNaN(rowValue)){
        rowValue *= sectionData.attDict[attribute].mod
    }

    if(itemFromdb[attribute.toLowerCase()] == rowValue){return}
    if(sectionData.attributes[attribute]){
        if (sectionData?.attributes?.[attribute]?.type == 7){
            update.attributes.push({
                "itemAttributeId": sectionData.attributes[attribute].itemAttributeId,
                "value": {
                    "amount": rowValue
                }
            })
        } else {
            update.attributes.push({
                "itemAttributeId": sectionData.attributes[attribute].itemAttributeId,
                "value": rowValue
            })
        }
    } else if (attribute.toLowerCase() == 'saleprice'){
        update.salePrice = {
            "amount": rowValue
        }
    } else {
        update[attribute] = rowValue
    }
    update.updated = true
}