let removedItemCostsCSV = []
let updateWithNewCostsCSV = []
let itemInventoryUpdatedCSV = []
let itemInventorySetToZeroCSV = []
let attributeUpdatedCSV = []
let failedToUpdateAttributeCSV = []
let itemInventoryUpdatedFailedCSV = []

async function removedItemCosts(itemsToUpdateCosts, sectionData){
    console.log(itemsToUpdateCosts)
    const entries = Object.entries(itemsToUpdateCosts);
    for (let i = 0; i < entries.length; i += 200) {
        const batch = entries.slice(i, i + 200);
        
        console.log(Object.keys(batch))
        const itemCostsFromdb = await getItemCosts({
            itemidonly: Object.keys(batch),
            supplier: [sectionData.supplier]
        });
        for (const dbCost of itemCostsFromdb){
            let costFound = false
            for (const apiCost of itemsToUpdateCosts[dbCost.itemid]){
                if (apiCost.quantityInUnit == dbCost.quantityinunit){
                    costFound = true
                }
            }
            if(!costFound){
                itemCostChangesCSV.push({
                    itemId: dbCost.itemid,
                    supplier: dbCost.supplier,
                    'supplier SKU': dbCost.supplierSku,
                    cost: dbCost.cost,
                    event: 'Item Cost Was Manually Removed'
                })
            }
        }
    }

}

promiseArr = []
async function updateWithNewCosts(costPrices, itemId, sectionData, row){
    promiseArr.push(asyncUpdateWithNewCosts(costPrices, itemId, sectionData, row))
}

let costPricesItemIds = {}
async function asyncUpdateWithNewCosts(costPrices, itemId, sectionData, row){
    costPricesItemIds.push(itemId)
    if (!costPricesItemIds[sectionData.sectionId]){costPricesItemIds[sectionData.sectionId] = []}
    // const itemCostsFromdb = await getItemCosts({
    //     itemidonly: [itemId]
    // });

    // for (const csvCost of costPrices){
    //     let costFound = false
    //     let { csvPrice, csvQuantityInUnit } = parseCostPrice(csvCost);
    //     for (const dbCost of itemCostsFromdb){
    //         if (dbCost.quantityinunit == csvQuantityInUnit){
    //             costFound = true
    //         }
    //     }
    //     if(!costFound){
    //         updateWithNewCostsCSV.push({
    //             supplier: sectionData.supplier,
    //             'supplier SKU': row[sectionData.supplierIdentifier.toLowerCase()],
    //             cost: csvPrice,
    //             event: 'Item Cost Added'
    //         })
    //     }
    // }
    

    // function parseCostPrice(costPrice) {
    //     const parts = costPrice.split(':');
    //     const quantityInUnit = parts[1] === undefined ? 1 : parts[0];
    //     const price = parts[1] === undefined ? parts[0] : parts[1] * quantityInUnit;
    //     return { price, quantityInUnit };
    // }
}

function itemInventoryUpdated(items){
    for (const item of items){
        item.event = 'Item Inventory Updated With New Value'
        delete item.itemId
    }
    itemInventoryUpdatedCSV.push([...items])
}

function itemInventoryUpdatedFailed(items){
    for (const item of items){
        item.event = 'Item Inventory Updated Failed'
        delete item.itemId
    }
    itemInventoryUpdatedFailedCSV.push([...items])
}

function itemInventorySetToZero(items){
    for (const item of items){
        item.event = 'Item Inventory Updated With New Value'
        delete item.itemId
    }
    itemInventorySetToZeroCSV.push([...items])
}

function attributeUpdated(item){
    attributeUpdatedCSV.push(item)
}

function failedToUpdateAttribute(item){
    failedToUpdateAttributeCSV.push(item)
}

async function makeCSVs(sectionData) {
    await Promise.all(promiseArr);

    // Mapping variable names to their respective arrays
    const csvMaps = {
        'Item Costs Removed': removedItemCostsCSV,
        'Item Costs Added': updateWithNewCostsCSV,
        'Inventory Adjusted': itemInventoryUpdatedCSV,
        'Inventory Set To Zero': itemInventorySetToZeroCSV,
        'Attributes Updated': attributeUpdatedCSV,
        'Attributes Failed To Updates': failedToUpdateAttributeCSV,
        'Inventory Failed To Update': itemInventoryUpdatedFailedCSV
    };

    // Iterating over the csvMaps object
    for (const [name, csvArray] of Object.entries(csvMaps)) {

        for (let i = 0; i < csvArray.length; i += 200) {
            const batch = csvArray.slice(i, i + 200);
            await sendBatch(name, batch)
        }

    }

    ipcRenderer.send('write-CSVs', document.getElementById('logFilePath').value, document.getElementById('emailAddress').value, sectionData.sectionId, sectionData.supplier);

    function sendBatch(name, batch) {
        return new Promise((resolve, reject) => {
            ipcRenderer.send('data-sent', name, batch, sectionData.sectionId);
            ipcRenderer.once('data-received', (event) => {
                resolve();
            });
        });
    }
}
