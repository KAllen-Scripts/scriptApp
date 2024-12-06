let sectionStatus = {};
// require('dotenv').config();
const axios = require('axios');
const JSZip = require("jszip");
const xlsx = require('xlsx');
const iconv = require('iconv-lite');
const chardet = require('chardet');
const { findMatch } = require("magic-bytes.js");
const { ipcRenderer } = require('electron');
const fs = require('fs');
const Papa = require('papaparse');
const schedule = require('node-schedule');
const ftp = require('ftp');
const { Writable } = require('stream');
const crypto = require('crypto');
const enviroment = 'api.stok.ly';
const accountKey = 'accessmodels'
const clientId = '584gjbgku0qbt2e5selgshi32u'
const secretKey = '1g51sacef5b0ktaj25hkaafh5dqvr4moepqbrpholl5gtc7eua1v'

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
    // try {
        const result = await ipcRenderer.invoke('get-items', property, values);
        // Transform the keys to lowercase while preserving the values
        const transformedResult = result.map(item => {
            return Object.keys(item).reduce((acc, key) => {
                acc[key.toLowerCase()] = item[key];
                return acc;
            }, {});
        });
        return transformedResult;
    // } catch (error) {
    //     console.error('Failed to get items:', error);
    //     throw error;
    // }
}

async function upsertItem(items) {
    await ipcRenderer.invoke('upsert-items', items);
}

async function upsertItemCost(itemCostEntries) {
    try {
        // Pass the entire object through IPC
        await ipcRenderer.invoke('upsert-item-cost', itemCostEntries);
    } catch (error) {
        console.error('Error upserting item costs:', error);
        throw error;
    }
}


async function getItemCosts(filters) {
    // try {
        const result = await ipcRenderer.invoke('get-item-costs', filters);
        // Transform the keys to lowercase while preserving the values
        const transformedResult = result.map(item => {
            return Object.keys(item).reduce((acc, key) => {
                acc[key.toLowerCase()] = item[key];
                return acc;
            }, {});
        });
        return transformedResult;
    // } catch (error) {
    //     console.error('Failed to get item costs:', error);
    //     throw error;
    // }
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
            isActive: !section.querySelector('button.activate-button').classList.contains('inactive'),
            id: section.dataset.id,
            label: section.querySelector('.section-label-input').value,
            url: section.querySelector('.url-input').value,
            fileInput: section.querySelector('.file-input').files[0] ? section.querySelector('.file-input').files[0].name : '',
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
            fileType: section.querySelector('.fileTypeButton').textContent,
            delimiter: section.querySelector('.delimiter-input').value,
            ftp: {
                address: section.querySelector('.ftp-address').value,
                port: section.querySelector('.ftp-port').value,
                filepath: section.querySelector('.ftp-filepath').value
            }
        };


        if(section.querySelector('.url-input').style.display == 'block'){
            sectionData.inputType = 'url'
        }
        if(section.querySelector('.file-input').style.display == 'block'){
            sectionData.inputType = 'upload'
        }
        if(section.querySelector('.ftp-inputs').style.display == 'block'){
            sectionData.inputType = 'ftp'
        }

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


async function resetUpdateFlag() {
    try {
        await saveData({ lastUpdate: false });
        await ipcRenderer.invoke('delete-all-databases');
        console.log('Databases deleted successfully');
    } catch (error) {
        console.error('Failed to delete databases:', error.message);
        throw error;
    }
}



//Temp to track number of adjustments made
// Global variable to store the timestamps of calls
let callTimestamps = [];

// Function definition
function rateLimitedFunction(x = 3) {
  const now = Date.now(); // Current time in milliseconds
  const oneMinute = 60000; // One minute in milliseconds

  // Remove timestamps older than one minute from the array
  callTimestamps = callTimestamps.filter(timestamp => now - timestamp < oneMinute);

  // Check if the number of recent calls is less than x
  if (callTimestamps.length < x) {
    callTimestamps.push(now); // Log this call's timestamp
    return; // Proceed immediately if under the limit
  }

  // Otherwise, calculate the time to wait based on the oldest call in memory
  const waitTime = oneMinute - (now - callTimestamps[0]);

  return new Promise(resolve => {
    setTimeout(() => {
      // Reset the call history after waiting
      callTimestamps = [Date.now()];
      resolve();
    }, waitTime);
  });
}

let saveDataDebug
saveDataDebug =  {"globalSettings":{"logFilePath":"C:\\Users\\Access Models\\Documents\\Stok.ly","emailAddress":"gayle@accessmodels.co.uk"},"sections":[{"isActive":true,"id":"cqtrgcfgs9lqm38oqw3b","label":"CML Distribution","url":" https://www.cmltradedirect.co.uk/csvstocklevel.php","fileInput":"","authorization":{"userName":"","password":""},"stockHeader":"Stock Level","location":{"location":"CML Distribution","bin":"default"},"identifiers":{"stokly":"SKU","supplier":"Part Number"},"attributes":[{"name":"","header":""}],"schedule":[{"day":"Sunday","time":"06:00"},{"day":"Monday","time":"06:00"},{"day":"Tuesday","time":"06:00"},{"day":"Wednesday","time":"06:00"},{"day":"Thursday","time":"06:00"},{"day":"Friday","time":"06:00"},{"day":"Saturday","time":"06:00"},{"day":"Friday","time":"15:02"}],"stockLevels":[{"name":"Out of stock","quantity":"0"},{"name":"In stock","quantity":"4"},{"name":"Low stock","quantity":"1"}],"inputMode":"Headers","delimiter":",","ftp":{"address":"","port":"","filepath":""},"inputType":"url"},{"isActive":true,"id":"pmp7z1xn74hcm38ox2an","label":"JPerkins","url":"http://feeds.jptradedesk.co.uk/stock/stock.csv","fileInput":"","authorization":{"userName":"1046","password":"nakeygwp"},"stockHeader":"JP_In_Stock","location":{"location":"JPerkins","bin":"default"},"identifiers":{"stokly":"SKU","supplier":"id"},"attributes":[{"name":"","header":""}],"schedule":[{"day":"Sunday","time":"07:00"},{"day":"Monday","time":"07:00"},{"day":"Tuesday","time":"07:00"},{"day":"Wednesday","time":"07:00"},{"day":"Thursday","time":"07:00"},{"day":"Friday","time":"07:00"},{"day":"Saturday","time":"07:00"},{"day":"Friday","time":"15:04"}],"stockLevels":[{"name":"TRUE","quantity":"2"},{"name":"FALSE","quantity":"0"}],"inputMode":"Headers","delimiter":",","ftp":{"address":"","port":"","filepath":""},"inputType":"url"},{"isActive":true,"id":"vzj9ysxu65wgm38p5u30","label":"Logic RC","url":"https://www.logicrc.com/edi.aspx?WFN=EDI&Template=STOCKSTATUS3&CustId=ACC010&AuthKey=VF4EZ5UU0L","fileInput":"","authorization":{"userName":"","password":""},"stockHeader":"1","location":{"location":"Logic RC","bin":"default"},"identifiers":{"stokly":"SKU","supplier":"0"},"attributes":[{"name":"","header":""}],"schedule":[{"day":"Sunday","time":"07:30"},{"day":"Monday","time":"07:30"},{"day":"Tuesday","time":"07:30"},{"day":"Wednesday","time":"07:30"},{"day":"Thursday","time":"07:30"},{"day":"Friday","time":"07:30"},{"day":"Saturday","time":"07:30"},{"day":"Friday","time":"15:22"}],"stockLevels":[{"name":"None","quantity":"0"},{"name":"InStock","quantity":"3"},{"name":"Low","quantity":"0"},{"name":"SupplierStock","quantity":"0"}],"inputMode":"Columns","delimiter":"\t","ftp":{"address":"","port":"","filepath":""},"inputType":"url"},{"isActive":true,"id":"41csqm6mrauim38p8cvz","label":"The Hobby Company","url":"https://www.hobbyco.net/content/files/product%20feeds/sanastore/product%20feed%20export/productfeed.csv","fileInput":"","authorization":{"userName":"","password":""},"stockHeader":"InventoryLevel","location":{"location":"The Hobby Company","bin":"default"},"identifiers":{"stokly":"SKU","supplier":"Skuid"},"attributes":[{"name":"","header":""}],"schedule":[{"day":"Monday","time":"08:00"},{"day":"Tuesday","time":"08:00"},{"day":"Wednesday","time":"08:00"},{"day":"Thursday","time":"08:00"},{"day":"Friday","time":"08:00"},{"day":"Saturday","time":"08:00"},{"day":"Sunday","time":"08:00"},{"day":"Friday","time":"15:25"}],"stockLevels":[{"name":"In stock","quantity":"2"},{"name":"Out of stock","quantity":"0"},{"name":"Low stock","quantity":"0"},{"name":"Good Stock","quantity":"2"}],"inputMode":"Headers","delimiter":";","ftp":{"address":"","port":"","filepath":""},"inputType":"url"},{"isActive":true,"id":"9o9g43o1wqx4m38pb7cw","label":"Gaugemaster","url":"","fileInput":"full - 2024-11-21T091028.673.csv","authorization":{"userName":"","password":""},"stockHeader":"Availability","location":{"location":"Gaugemaster","bin":"default"},"identifiers":{"stokly":"SKU","supplier":"Product Code/SKU"},"attributes":[{"name":"","header":""}],"schedule":[{"day":"Friday","time":"15:11"}],"stockLevels":[{"name":"YES","quantity":"2"},{"name":"NO","quantity":"0"},{"name":"1","quantity":"0"},{"name":"2","quantity":"0"},{"name":"3","quantity":"0"}],"inputMode":"Headers","delimiter":",","ftp":{"address":"","port":"","filepath":""},"inputType":"upload"}]}