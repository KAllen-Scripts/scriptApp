let sectionStatus = {};
const axios = require('axios');
const { ipcRenderer } = require('electron');
const fs = require('fs');
const Papa = require('papaparse');
const schedule = require('node-schedule');
const crypto = require('crypto');
const enviroment = 'api.stok.ly';
const accountKey = 'productiontest'
const clientId = '1tr380jeegvge3vfad1nj31qcm'
const secretKey = '2pfakbo1n7rks8u8rbpp0ccudktrs5ehsthr3gh7gnf9jlg5f46'

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
    // try {
        await ipcRenderer.invoke('upsert-item-cost', itemId, costEntries);
    // } catch (error) {
    //     console.error('Error upserting item costs:', error);
    //     throw error;
    // }
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