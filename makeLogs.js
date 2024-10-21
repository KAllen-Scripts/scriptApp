let removedItemCostsCSV = []
let updateWithNewCostsCSV = []
let itemInventoryUpdatedCSV = []
let itemInventorySetToZeroCSV = []
let attributeUpdatedCSV = []
let failedToUpdateAttributeCSV = []
let itemInventoryUpdatedFailedCSV = []

function clearLogs(){
    removedItemCostsCSV = []
    updateWithNewCostsCSV = []
    itemInventoryUpdatedCSV = []
    itemInventorySetToZeroCSV = []
    attributeUpdatedCSV = []
    failedToUpdateAttributeCSV = []
    itemInventoryUpdatedFailedCSV = []
}

async function removedItemCosts(itemsToUpdateCosts, sectionData){
    console.log(itemsToUpdateCosts)
    const entries = Object.entries(itemsToUpdateCosts);
    for (let i = 0; i < entries.length; i += 200) {
        const batch = entries.slice(i, i + 200);
        
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

async function updateWithNewCosts(UOM){
    updateWithNewCostsCSV(UOM)
}

function itemInventoryUpdated(items){
    for (const item of items){
        item.event = 'Item Inventory Updated With New Value'
        delete item.itemId
    }
    itemInventoryUpdatedCSV.push(...[...items])
    console.log(JSON.stringify(itemInventoryUpdatedCSV))
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
