let sectionStatus = {};
const axios = require('axios');
const { ipcRenderer } = require('electron');
const fs = require('fs');
const Papa = require('papaparse');
const schedule = require('node-schedule');
const crypto = require('crypto');
const enviroment = 'api.dev.stok.ly';
const accountKey = 'webapptest'
const clientId = 'kssiuckpdfe32kmtb3vfianqj'
const secretKey = '25gl2tnp93j8k9gqiv4p70h3qi8ea3rtj1ta4urlig1lf1jsshc'

const tokensOverMinute = 600;
const maxTokensToHold = 3;
let tokens = 0;

const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

function loadData(prop) {
    return new Promise((resolve, reject) => {
        ipcRenderer.send('load-data', prop);
        ipcRenderer.once('load-dataResponse', (event, data) => {
            resolve(data);
        });
    });
}

function saveData(obj) {
    return new Promise((resolve, reject) => {
        ipcRenderer.send('save-data', obj);
        ipcRenderer.once('save-dataResponse', (event, data) => {
            resolve(data);
        });
    });
}

async function getItems(property, values) {
    try {
        const result = await ipcRenderer.invoke('get-items', property, values);
        // Transform the keys to lowercase while preserving the values
        const transformedResult = result.map(item => {
            return Object.keys(item).reduce((acc, key) => {
                acc[key.toLowerCase()] = item[key];
                return acc;
            }, {});
        });
        return transformedResult;
    } catch (error) {
        console.error('Failed to get items:', error);
        throw error;
    }
}

async function upsertItemProperty(itemId, propertyName, propertyValue) {
    try {
        await ipcRenderer.invoke('upsert-item-property', itemId, propertyName, propertyValue);
    } catch (error) {
        console.error('Error upserting item property:', error);
        throw error;
    }
}

async function upsertItemCost(itemId, costEntries) {
    try {
        await ipcRenderer.invoke('upsert-item-cost', itemId, costEntries);
    } catch (error) {
        console.error('Error upserting item costs:', error);
        throw error;
    }
}


async function getItemCosts(filters) {
    try {
        const result = await ipcRenderer.invoke('get-item-costs', filters);
        // Transform the keys to lowercase while preserving the values
        const transformedResult = result.map(item => {
            return Object.keys(item).reduce((acc, key) => {
                acc[key.toLowerCase()] = item[key];
                return acc;
            }, {});
        });
        return transformedResult;
    } catch (error) {
        console.error('Failed to get item costs:', error);
        throw error;
    }
}



function saveFormData() {
    const formData = {
        globalSettings: {
            logFilePath: document.getElementById('logFilePath').value,
            emailAddress: document.getElementById('emailAddress').value
        },
        sections: []
    };

    const sectionWrappers = document.querySelectorAll('.section-wrapper');

    sectionWrappers.forEach((section, index) => {
        const sectionData = {
            id: section.dataset.id,
            label: section.querySelector('.section-label-input').value,
            url: section.querySelector('.url-input').value,
            fileInput: section.querySelector('.file-input').files[0] ? section.querySelector('.file-input').files[0].name : '',
            isUrlMode: section.querySelector('.url-input').style.display !== 'none',
            authorization: {
                userName: section.querySelector('input[name="userName"]').value,
                password: section.querySelector('input[name="password"]').value
            },
            stockHeader: section.querySelector('input[name="stockHeader"]').value,
            location: {
                location: section.querySelector('input[name="location"]').value,
                bin: section.querySelector('input[name="bin"]').value
            },
            identifiers: {
                stokly: section.querySelector('input[name="stoklyIdentifier"]').value,
                supplier: section.querySelector('input[name="supplierIdentifier"]').value
            },
            attributes: [],
            schedule: [],
            stockLevels: [],
            inputMode: section.querySelector('.inputModeButton').textContent,
            delimiter: section.querySelector('.delimiter-input').value
        };

        // Collect attributes
        section.querySelectorAll('.form-section:has(label[for="price"]) .input-group').forEach(attr => {
            sectionData.attributes.push({
                name: attr.querySelector('input[name="attributeName"]').value,
                header: attr.querySelector('input[name="attributeHeader"]').value
            });
        });

        // Collect schedule
        section.querySelectorAll('.schedule-input').forEach(schedule => {
            sectionData.schedule.push({
                day: schedule.querySelector('.schedule-day').value,
                time: schedule.querySelector('.schedule-time').value
            });
        });

        // Collect stock levels
        section.querySelectorAll('.form-section:has(label[for="stockLevels"]) .input-group').forEach(level => {
            sectionData.stockLevels.push({
                name: level.querySelector('input[name="stockLevelName"]').value,
                quantity: level.querySelector('input[name="stockLevelQty"]').value
            });
        });

        formData.sections.push(sectionData);
    });

    saveData({ savedData: JSON.stringify(formData) });
}