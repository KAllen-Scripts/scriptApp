let removedItemCostsCSV = []
let updateWithNewCostsCSV = []
let itemInventoryUpdatedCSV = []
let itemInventorySetToZeroCSV = []
let attributeUpdatedCSV = []
let failedToUpdateAttributeCSV = []
let itemInventoryUpdatedFailedCSV = []
let logs = {}

function logStart(sectionId){
    logs[sectionId] = {
        removedItemCostsCSV: [],
        updateWithNewCostsCSV: [],
        itemInventoryUpdatedCSV: [],
        itemInventorySetToZeroCSV: [],
        attributeUpdatedCSV: [],
        failedToUpdateAttributeCSV: [],
        itemInventoryUpdatedFailedCSV: [] 
    }
}

function logDelete(sectionId){
    delete logs[sectionId]
}

async function removedItemCosts(itemsToUpdateCosts, sectionData){
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
                logs[sectionData.sectionId].itemCostChangesCSV.push({
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

async function updateWithNewCosts(UOM, sectionId){
    logs[sectionId].updateWithNewCostsCSV(UOM)
}

function itemInventoryUpdated(items, sectionId){
    for (const item of items){
        item.event = 'Item Inventory Updated With New Value'
        delete item.itemId
    }
    logs[sectionId].itemInventoryUpdatedCSV.push(...[...items])
}

function itemInventoryUpdatedFailed(items, sectionId){
    for (const item of items){
        item.event = 'Item Inventory Updated Failed'
        delete item.itemId
    }
    logs[sectionId].itemInventoryUpdatedFailedCSV.push(...[...items])
}

function itemInventorySetToZero(items, sectionId){
    for (const item of items){
        item.event = 'Item Inventory Updated With New Value'
        delete item.itemId
    }
    logs[sectionId].itemInventorySetToZeroCSV.push(...[...items])
}

function attributeUpdated(item, sectionId){
    logs[sectionId].attributeUpdatedCSV.push(item)
}

function failedToUpdateAttribute(item, sectionId){
    logs[sectionId].failedToUpdateAttributeCSV.push(item)
}

async function makeCSVs(sectionData) {

    // Mapping variable names to their respective arrays
    const csvMaps = {
        'Item Costs Removed': logs[sectionData.sectionId].removedItemCostsCSV,
        'Item Costs Added': logs[sectionData.sectionId].updateWithNewCostsCSV,
        'Inventory Adjusted': logs[sectionData.sectionId].itemInventoryUpdatedCSV,
        'Inventory Set To Zero': logs[sectionData.sectionId].itemInventorySetToZeroCSV,
        'Attributes Updated': logs[sectionData.sectionId].attributeUpdatedCSV,
        'Attributes Failed To Updates': logs[sectionData.sectionId].failedToUpdateAttributeCSV,
        'Inventory Failed To Update': logs[sectionData.sectionId].itemInventoryUpdatedFailedCSV
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
            ipcRenderer.once(`data-received-${sectionData.sectionId}`, (event) => {
                resolve();
            });
        });
    }
    
}
