function createSection(sectionData = {}) {
    const sectionsContainer = document.getElementById('sectionsContainer');
    const sectionWrapper = document.createElement('div');
    sectionWrapper.classList.add('section-wrapper');
    sectionWrapper.dataset.id = sectionData.id || [...Array(12)].map(() => Math.random().toString(36)[2]).join('') + Date.now().toString(36);

    sectionStatus[sectionWrapper.dataset.id] = {
        active: false,
        scheduledJobs: [],
        inputMode: sectionData.inputType || 'url',
        headers: sectionData.inputMode !== 'Columns',
        workbook: sectionData.fileType
    };

    // Create editable label
    const labelDiv = document.createElement('div');
    labelDiv.classList.add('section-label');
    
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = sectionData.label || 'Section ' + (document.querySelectorAll('.section-wrapper').length + 1);
    labelInput.classList.add('section-label-input');
    
    labelDiv.appendChild(labelInput);

    const removeSectionButton = document.createElement('button');
    removeSectionButton.textContent = 'Remove Section';
    removeSectionButton.classList.add('remove-section');
    removeSectionButton.type = 'button';
    removeSectionButton.addEventListener('click', function() {
        sectionsContainer.removeChild(sectionWrapper);
        const sectionId = sectionWrapper.dataset.id;
        if (sectionStatus[sectionId] && sectionStatus[sectionId].scheduledJobs) {
            sectionStatus[sectionId].scheduledJobs.forEach(job => clearTimeout(job));
        }
        delete sectionStatus[sectionId];
    });

    const inputDiv = document.createElement('div');
    inputDiv.classList.add('form-section');
    
    // Default to URL mode if no value is given
    const inputMode = sectionData.inputType || 'url';
    
    inputDiv.innerHTML = `
      <label for="inputMode">
        Input Mode:
        <select class="input-mode-select">
          <option value="url" ${inputMode === 'url' ? 'selected' : ''}>URL</option>
          <option value="upload" ${inputMode === 'upload' ? 'selected' : ''}>Upload</option>
          <option value="ftp" ${inputMode === 'ftp' ? 'selected' : ''}>FTP</option>
          <option value="sftp" ${inputMode === 'sftp' ? 'selected' : ''}>SFTP</option>
        </select>
      </label>
      <input 
        type="text" 
        class="url-input" 
        placeholder="Enter URL" 
        value="${sectionData.url || ''}" 
        style="display: ${inputMode === 'url' ? 'block' : 'none'};"
      >
      <input 
        type="file" 
        class="file-input" 
        accept=".csv" 
        style="display: ${inputMode === 'upload' ? 'block' : 'none'};"
      >
      <div class="ftp-inputs" style="display: ${(inputMode === 'ftp' || inputMode === 'sftp') ? 'block' : 'none'};">
        <input type="text" class="ftp-address" placeholder="FTP Address" value="${sectionData.ftp?.address || ''}">
        <input type="number" class="ftp-port" placeholder="FTP Port" value="${sectionData.ftp?.port || ''}">
        <input type="text" class="ftp-filepath" placeholder="FTP Filepath" value="${sectionData.ftp?.filepath || ''}">
      </div>
    `;

    const locationDiv = document.createElement('div');
    locationDiv.classList.add('form-section');
    locationDiv.innerHTML = `
        <label for="location">Location:</label>
        <div class="identifier-wrapper">
            <input type="text" name="location" placeholder="Enter Location" value="${sectionData.location?.location || ''}">
            <input type="text" name="bin" placeholder="Enter Bin" value="${sectionData.location?.bin || ''}">
        </div>
    `;

    const stockHeaderDiv = document.createElement('div');
    stockHeaderDiv.classList.add('form-section');
    stockHeaderDiv.innerHTML = `<label for="stockHeader">Stock Level Header:</label><input type="text" name="stockHeader" placeholder="Enter Stock Level Header" value="${sectionData.stockHeader || ''}">`;

    const attributeDiv = document.createElement('div');
    attributeDiv.classList.add('form-section');
    attributeDiv.innerHTML = `<label for="price">Attributes:</label>`;
    
    const attributeDynamicInputsDiv = document.createElement('div');
    attributeDynamicInputsDiv.classList.add('dynamic-inputs');

    function addAttributeGroup(name = '', header = '') {
        const inputGroup = document.createElement('div');
        inputGroup.classList.add('input-group');
        inputGroup.innerHTML = `
            <input type="text" name="attributeName" placeholder="Enter Attribute" value="${name}">
            <input type="text" name="attributeHeader" placeholder="Enter Attribute Header" value="${header}">
            <button class="remove-button" type="button">Remove</button>
        `;

        inputGroup.querySelector('.remove-button').addEventListener('click', function() {
            attributeDynamicInputsDiv.removeChild(inputGroup);
        });

        attributeDynamicInputsDiv.appendChild(inputGroup);
    }

    if (sectionData.attributes && sectionData.attributes.length > 0) {
        sectionData.attributes.forEach(attr => addAttributeGroup(attr.name, attr.header));
    }

    const addAttributeButton = document.createElement('button');
    addAttributeButton.textContent = 'Add Attribute';
    addAttributeButton.classList.add('add-schedule-button');
    addAttributeButton.type = 'button';
    addAttributeButton.addEventListener('click', () => addAttributeGroup());

    attributeDiv.appendChild(attributeDynamicInputsDiv);
    attributeDiv.appendChild(addAttributeButton);

    const identifierDiv = document.createElement('div');
    identifierDiv.classList.add('form-section');
    identifierDiv.innerHTML = `
        <label for="identifier">Identifiers:</label>
        <div class="identifier-wrapper">
            <input type="text" name="stoklyIdentifier" placeholder="Enter Stokly Identifier" value="${sectionData.identifiers?.stokly || ''}">
            <input type="text" name="supplierIdentifier" placeholder="Enter Supplier Identifier" value="${sectionData.identifiers?.supplier || ''}">
        </div>
    `;

    const loginCredsDiv = document.createElement('div');
    loginCredsDiv.classList.add('form-section');
    loginCredsDiv.innerHTML = `
        <label for="identifier">Authorisation:</label>
        <div class="identifier-wrapper">
            <input type="text" name="userName" placeholder="Enter User Name" value="${sectionData.authorization?.userName || ''}">
            <input type="password" name="password" placeholder="Enter Password" value="${sectionData.authorization?.password || ''}">
        </div>
    `;

    const schedulerDiv = document.createElement('div');
    schedulerDiv.classList.add('form-section', 'scheduler');
    schedulerDiv.innerHTML = `
        <label>Schedule:</label>
        <div class="schedule-list"></div>
        <button type="button" class="add-schedule-button">Add Schedule</button>
    `;

    const stockLevelDiv = document.createElement('div');
    stockLevelDiv.classList.add('form-section');
    stockLevelDiv.innerHTML = `<label for="stockLevels">Stock Levels:</label>`;
    
    const dynamicInputsDiv = document.createElement('div');
    dynamicInputsDiv.classList.add('dynamic-inputs');

    function addStockLevelGroup(name = '', quantity = '') {
        const inputGroup = document.createElement('div');
        inputGroup.classList.add('input-group');
        inputGroup.innerHTML = `
            <input type="text" name="stockLevelName" placeholder="Stock Level Name" value="${name}">
            <input type="text" name="stockLevelQty" placeholder="Stock Level Qty" value="${quantity}">
            <button class="remove-button" type="button">Remove</button>
        `;

        inputGroup.querySelector('.remove-button').addEventListener('click', function() {
            dynamicInputsDiv.removeChild(inputGroup);
        });

        dynamicInputsDiv.appendChild(inputGroup);
    }

    if (sectionData.stockLevels && sectionData.stockLevels.length > 0) {
        sectionData.stockLevels.forEach(level => addStockLevelGroup(level.name, level.quantity));
    }

    const addStockLevelButton = document.createElement('button');
    addStockLevelButton.textContent = 'Add Stock Level';
    addStockLevelButton.classList.add('add-schedule-button');
    addStockLevelButton.type = 'button';
    addStockLevelButton.addEventListener('click', () => addStockLevelGroup());

    stockLevelDiv.appendChild(dynamicInputsDiv);
    stockLevelDiv.appendChild(addStockLevelButton);

    const activateButton = document.createElement('button');
    activateButton.textContent = 'Activate';
    activateButton.classList.add('activate-button', 'inactive');
    activateButton.type = 'button';
    activateButton.addEventListener('click', function() {
        const sectionId = sectionWrapper.dataset.id;
        const scheduleInputs = sectionWrapper.querySelectorAll('.schedule-input');
    
        const validSchedules = Array.from(scheduleInputs).filter(input => {
            const day = input.querySelector('.schedule-day').value;
            const time = input.querySelector('.schedule-time').value;
            return day && time;
        });
    
        const isActive = sectionStatus[sectionId].active;
    
        if (isActive) {
            sectionStatus[sectionId].active = false;
            activateButton.textContent = 'Activate';
            activateButton.classList.add('inactive');
            activateButton.classList.remove('active');
    
            if (sectionStatus[sectionId].scheduledJobs) {
                sectionStatus[sectionId].scheduledJobs.forEach(job => job.cancel());
            }
            sectionStatus[sectionId].scheduledJobs = [];
        } else {
            if (validSchedules.length === 0) {
                return;
            }
            sectionStatus[sectionId].active = true;
            sectionStatus[sectionId].scheduledJobs = [];
            scheduleJobs(sectionId, validSchedules, sectionWrapper);
            activateButton.textContent = 'Deactivate';
            activateButton.classList.add('active');
            activateButton.classList.remove('inactive');
        }
    });

    sectionWrapper.appendChild(labelDiv);
    sectionWrapper.appendChild(removeSectionButton);
    sectionWrapper.appendChild(inputDiv);
    sectionWrapper.appendChild(loginCredsDiv);
    sectionWrapper.appendChild(stockHeaderDiv);
    sectionWrapper.appendChild(locationDiv);
    sectionWrapper.appendChild(identifierDiv);
    sectionWrapper.appendChild(attributeDiv);
    sectionWrapper.appendChild(schedulerDiv);
    sectionWrapper.appendChild(stockLevelDiv);

    const buttonContainer = document.createElement('div');
    buttonContainer.classList.add('button-container');
    buttonContainer.appendChild(activateButton);

    const columnToggle = document.createElement('button');
    columnToggle.textContent = sectionStatus[sectionWrapper.dataset.id].headers ? 'Headers' : 'Columns';
    columnToggle.classList.add('inputModeButton');
    columnToggle.type = 'button';
    columnToggle.onclick = function(event) {
        const button = event.target;
        sectionStatus[sectionWrapper.dataset.id].headers = !sectionStatus[sectionWrapper.dataset.id].headers;
        button.textContent = sectionStatus[sectionWrapper.dataset.id].headers ? 'Headers' : 'Columns';
    };

    const workbookToggle = document.createElement('button');
    workbookToggle.textContent = sectionData.fileType || 'CSV';
    workbookToggle.classList.add('fileTypeButton');
    workbookToggle.type = 'button';
    workbookToggle.onclick = function(event) {
        const button = event.target;
        button.textContent = button.textContent == 'Workbook' ? 'CSV' : 'Workbook';
        sectionStatus[sectionWrapper.dataset.id].workbook = button.textContent
    };

    const delimiterInput = document.createElement('input');
    delimiterInput.type = 'text';
    delimiterInput.className = 'delimiter-input';
    delimiterInput.value = sectionData.delimiter || ',';
    delimiterInput.title = 'Delimiter';

    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'toggle-container';
    toggleContainer.appendChild(columnToggle);
    toggleContainer.appendChild(workbookToggle);
    toggleContainer.appendChild(delimiterInput);

    buttonContainer.appendChild(toggleContainer);

    sectionWrapper.appendChild(buttonContainer);

    sectionsContainer.appendChild(sectionWrapper);

    inputDiv.querySelector('.input-mode-select').addEventListener('change', function() {
        const selectedMode = this.value;
        const urlInput = inputDiv.querySelector('.url-input');
        const fileInput = inputDiv.querySelector('.file-input');
        const ftpInputs = inputDiv.querySelector('.ftp-inputs');

        urlInput.style.display = 'none';
        fileInput.style.display = 'none';
        ftpInputs.style.display = 'none';

        switch(selectedMode) {
            case 'url':
                urlInput.style.display = 'block';
                break;
            case 'upload':
                fileInput.style.display = 'block';
                break;
            case 'ftp':
                ftpInputs.style.display = 'block';
                break;
            case 'sftp':
                ftpInputs.style.display = 'block';
                break;
        }

        sectionStatus[sectionWrapper.dataset.id].inputMode = selectedMode;
    });

    function addScheduleInput(day = '', time = '') {
        const scheduleInput = document.createElement('div');
        scheduleInput.classList.add('schedule-input');
        scheduleInput.innerHTML = `
            <select class="schedule-day">
                ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                    .map(d => `<option value="${d}" ${d === day ? 'selected' : ''}>${d}</option>`)
                    .join('')}
            </select>
            at 
            <input type="time" class="schedule-time" value="${time}">
            <button type="button" class="remove-schedule-button remove-button">Remove</button>
        `;
        
        scheduleInput.querySelector('.remove-schedule-button').addEventListener('click', function() {
            scheduleInput.remove();
        });

        schedulerDiv.querySelector('.schedule-list').appendChild(scheduleInput);
    }

    schedulerDiv.querySelector('.add-schedule-button').addEventListener('click', () => addScheduleInput());

    if (sectionData.schedule && sectionData.schedule.length > 0) {
        sectionData.schedule.forEach(s => addScheduleInput(s.day, s.time));
    } else {
        addScheduleInput();
    }
    if(sectionData.isActive){
        activateButton.dispatchEvent(new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window
        }));
    }
}

// Function to schedule jobs
function scheduleJobs(sectionId, scheduleInputs, sectionWrapper) {
    // Cancel all existing jobs
    if (sectionStatus[sectionId].scheduledJobs) {
        sectionStatus[sectionId].scheduledJobs.forEach(job => job.cancel());
    }
    sectionStatus[sectionId].scheduledJobs = [];

    // Schedule new jobs
    scheduleInputs.forEach(input => {
        const day = input.querySelector('.schedule-day').value;
        const time = input.querySelector('.schedule-time').value;

        if (day && time) {
            const [hours, minutes] = time.split(':').map(Number);
            const dayIndex = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(day);

            // Calculate the next occurrence of the specified day and time
            let now = new Date();
            let nextScheduledDate = new Date(now);
            nextScheduledDate.setHours(hours, minutes, 0, 0);
            nextScheduledDate.setDate(now.getDate() + ((dayIndex + 7 - now.getDay()) % 7));

            // If the calculated time is in the past for today, schedule it for the next week
            if (nextScheduledDate < now) {
                nextScheduledDate.setDate(nextScheduledDate.getDate() + 7);
            }

            const job = schedule.scheduleJob(nextScheduledDate, () => {
                sectionStatus[sectionId].ongoing = true;
                globalQueue.push({sectionWrapper:sectionWrapper,sectionId:sectionId})
                // startSyncForSection(sectionWrapper).finally(() => {
                //     sectionStatus[sectionId].ongoing = false;
                // });
            });

            sectionStatus[sectionId].scheduledJobs.push(job);
        }
    });
}

document.addEventListener('DOMContentLoaded', async function() {
    let form = await loadData('savedData').then(r=>{
        if(r){
            return saveDataDebug || JSON.parse(r)}
        }
    )
    if (form){
        document.getElementById('logFilePath').value = form?.globalSettings?.logFilePath || ''
        document.getElementById('emailAddress').value = form?.globalSettings?.emailAddress || ''
        for (const section of form.sections){
            createSection(section)
        }
    }
    // dailyReset()
    startQueue()
});


document.getElementById('addSectionButton').addEventListener('click', createSection);