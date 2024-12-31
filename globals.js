let sectionStatus = {};
let flagResetting = false;
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
const { Client: SFTPClient } = require('ssh2');
const { Writable } = require('stream');
const crypto = require('crypto');
const enviroment = 'api.stok.ly';
const accountKey = 'dyproaudio'
const clientId = '68f9s3e1kl5aaaqfvngg98k7kk'
const secretKey = '7gan52o0fg3e28ifacr1jutq4oo0g55k51j033mptbq17os5b8t'

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
            if (section.querySelector('.input-mode-select').value.toLowerCase() === 'sftp') {
                sectionData.inputType = 'sftp'
            }
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
        flagResetting = true
        await saveData({ lastUpdate: false });
        await ipcRenderer.invoke('delete-all-databases');
        console.log('Databases deleted successfully');
        flagResetting = false
    } catch (error) {
        flagResetting = false
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

async function dailyReset(){
    do{
        resetUpdateFlag()
        await sleep(6*60*60*1000)
    } while (1)
}

let saveDataDebug