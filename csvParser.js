async function processCSV(sectionData, currentStock) {
    try {
        let stockUpdate = {
            "locationId": sectionData.locationId,
            "binId": sectionData.bin,
            "reason": "Stokly Sync",
            "items": []
        };

        let attributeUpdateArr = [];

        const parsePromise = new Promise((resolve, reject) => {
            Papa.parse(sectionData.csvData, {
                header: sectionStatus[sectionData.sectionId].headers,
                skipEmptyLines: true,
                transformHeader: (header) => header.toLowerCase(),
                complete: async (results) => {
                    try {
                        for (const row of results.data) {
                            let itemFromdb = await getItems(sectionData.stoklyIdentifier, [row[sectionData.supplierIdentifier.toLowerCase()]]).then(r => { return r[0] });
                            let itemid = itemFromdb?.itemid;
                            if (!itemid){continue}

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
                                    itemId: itemid,
                                    quantity
                                });
                            }
                            
                            let attributeUpdate = updateAttributes(sectionData, row, itemFromdb)
                            if(attributeUpdate){attributeUpdateArr.push(attributeUpdate)}

                            if (stockUpdate.items.length >= 200 && sectionStatus[sectionData.sectionId].active) {
                                await requester('post', `https://${enviroment}/v1/adjustments`, stockUpdate);
                                stockUpdate.items = [];
                            }

                            if (attributeUpdateArr.length >= 50) {
                                await Promise.all(attributeUpdateArr);
                                attributeUpdateArr = []
                            }

                            delete currentStock[itemid]
                        }

                        resolve();
                    } catch (error) {
                        reject(error); // Ensure error is propagated
                    }
                },
                error: (error) => {
                    console.error('Error parsing CSV:', error);
                    reject(error); // Ensure error is propagated
                }
            });
        });

        await parsePromise;

        for (const item in currentStock){
            if(currentStock[item] != 0){
                stockUpdate.items.push({
                    itemId: item,
                    quantity: currentStock[item] * -1
                });
            }
            if (stockUpdate.items.length >= 200 && sectionStatus[sectionData.sectionId].active) {
                await requester('post', `https://${enviroment}/v1/adjustments`, stockUpdate);
                stockUpdate.items = [];
            }
        }

        if (stockUpdate.items.length > 0 && sectionStatus[sectionData.sectionId].active) {
            await requester('post', `https://${enviroment}/v1/adjustments`, stockUpdate);
        }

        await Promise.all(attributeUpdateArr);
    } catch (error) {
        console.error('Error in processCSV:', error);
        throw error; // Ensure error is propagated
    }
}

async function updateAttributes(sectionData, row, itemFromdb) {

    let update = {
        "attributes": [],
        "appendAttributes": true,
    }

    let productUpdated = false

    for (const attribute in sectionData.attDict){
        if(itemFromdb[attribute.toLowerCase()] == row[sectionData.attDict[attribute]]){continue}
        if(sectionData.attributes[attribute]){
            if (sectionData?.attributes?.[attribute]?.type == 7){
                update.attributes.push({
                    "itemAttributeId": itemFromdb.itemid,
                    "value": {
                        "amount": row[sectionData.attDict[attribute]]
                    }
                })
            } else {
                update.attributes.push({
                    "itemAttributeId": itemFromdb.itemid,
                    "value": row[sectionData.attDict[attribute]]
                })
            }
        } else if (attribute.toLowerCase() == 'saleprice'){
            update.salePrice = {
                "amount": row[sectionData.attDict[attribute]]
            }
        } else {
            update[attribute] = row[sectionData.attDict[attribute]]
        }
        productUpdated = true
    }

    if (productUpdated){return requester('patch', `https://${enviroment}/v0/items/${itemFromdb.itemid}`, update)}

}