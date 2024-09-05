// Function to create a new section
function createSection() {
    const sectionsContainer = document.getElementById('sectionsContainer');
    const sectionWrapper = document.createElement('div');
    sectionWrapper.classList.add('section-wrapper');
    sectionWrapper.dataset.id = Date.now(); // Unique ID based on timestamp

    sectionStatus[sectionWrapper.dataset.id] = {
        active: false,
        scheduledJobs: [],
        inputMode: 'url',
        headers: true
    };

    // Create editable label
    const labelDiv = document.createElement('div');
    labelDiv.classList.add('section-label');
    
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = 'Section ' + (document.querySelectorAll('.section-wrapper').length + 1);
    labelInput.classList.add('section-label-input');
    
    labelDiv.appendChild(labelInput);

    const removeSectionButton = document.createElement('button');
    removeSectionButton.textContent = 'Remove Section';
    removeSectionButton.classList.add('remove-section');
    removeSectionButton.type = 'button'; // Ensure button type is button
    removeSectionButton.addEventListener('click', function() {
        sectionsContainer.removeChild(sectionWrapper);
        // Remove from tracking
        const sectionId = sectionWrapper.dataset.id;
        if (sectionStatus[sectionId] && sectionStatus[sectionId].scheduledJobs) {
            sectionStatus[sectionId].scheduledJobs.forEach(job => clearTimeout(job));
        }
        delete sectionStatus[sectionId];
    });

    const urlDiv = document.createElement('div');
    urlDiv.classList.add('form-section');
    urlDiv.innerHTML = `
        <label for="url">
            URL:
            <button type="button" class="toggle-input-button">Switch to Upload</button>
        </label>
        <input type="text" class="url-input" placeholder="Enter URL">
        <input type="file" class="file-input" accept=".csv" style="display:none;">
    `;

    const locationDiv = document.createElement('div');
    locationDiv.classList.add('form-section');
    locationDiv.innerHTML = `
        <label for="location">Location:</label>
        <div class="identifier-wrapper">
            <input type="text" name="location" placeholder="Enter Location">
            <input type="text" name="bin" placeholder="Enter Bin">
        </div>
    `;

    const stockHeaderDiv = document.createElement('div');
    stockHeaderDiv.classList.add('form-section');
    stockHeaderDiv.innerHTML = '<label for="stockHeader">Stock Level Header:</label><input type="text" name="stockHeader" placeholder="Enter Stock Level Header">';

    const attributeDiv = document.createElement('div');
    attributeDiv.classList.add('form-section');
    attributeDiv.innerHTML = `<label for="price">Attributes:</label>`;
    
    const attributeDynamicInputsDiv = document.createElement('div');
    attributeDynamicInputsDiv.classList.add('dynamic-inputs');

    // Function to add a price attribute group
    function addAttributeGroup() {
        const inputGroup = document.createElement('div');
        inputGroup.classList.add('input-group');
        inputGroup.innerHTML = `
            <input type="text" name="attributeName" placeholder="Enter Attribute">
            <input type="text" name="attributeHeader" placeholder="Enter Atribute Header">
            <button class="remove-button" type="button">Remove</button>
        `;

        // Attach event listener to the remove button within this input group
        inputGroup.querySelector('.remove-button').addEventListener('click', function() {
            attributeDynamicInputsDiv.removeChild(inputGroup);
        });

        attributeDynamicInputsDiv.appendChild(inputGroup);
    }

    // Initially add one price attribute group
    addAttributeGroup();

    // Button to add new price attribute groups
    const addAttributeButton = document.createElement('button');
    addAttributeButton.textContent = 'Add Attribute';
    addAttributeButton.classList.add('add-schedule-button'); // Match the class with the schedule button
    addAttributeButton.type = 'button';
    addAttributeButton.addEventListener('click', addAttributeGroup);

    // Append dynamic inputs and the button to price div
    attributeDiv.appendChild(attributeDynamicInputsDiv);
    attributeDiv.appendChild(addAttributeButton);

    const identifierDiv = document.createElement('div');
    identifierDiv.classList.add('form-section');
    identifierDiv.innerHTML = `
        <label for="identifier">Identifiers:</label>
        <div class="identifier-wrapper">
            <input type="text" name="stoklyIdentifier" placeholder="Enter Stokly Identifier">
            <input type="text" name="supplierIdentifier" placeholder="Enter Supplier Identifier">
        </div>
    `;

    const loginCredsDiv = document.createElement('div');
    loginCredsDiv.classList.add('form-section');
    loginCredsDiv.innerHTML = `
        <label for="identifier">Authorisation:</label>
        <div class="identifier-wrapper">
            <input type="text" name="userName" placeholder="Enter User Name">
            <input type="password" name="password" placeholder="Enter Password">
        </div>
    `;

    const schedulerDiv = document.createElement('div');
    schedulerDiv.classList.add('form-section', 'scheduler');
    schedulerDiv.innerHTML = `
        <label>Schedule:</label>
        <div class="schedule-list"></div>
        <button type="button" class="add-schedule-button">Add Schedule</button>
    `;

    // Container for stock level inputs with a header
    const stockLevelDiv = document.createElement('div');
    stockLevelDiv.classList.add('form-section');
    stockLevelDiv.innerHTML = `<label for="stockLevels">Stock Levels:</label>`;
    
    const dynamicInputsDiv = document.createElement('div');
    dynamicInputsDiv.classList.add('dynamic-inputs');

    // Function to add a stock level group
    function addStockLevelGroup() {
        const inputGroup = document.createElement('div');
        inputGroup.classList.add('input-group');
        inputGroup.innerHTML = `
            <input type="text" name="stockLevelName" placeholder="Stock Level Name">
            <input type="text" name="stockLevelQty" placeholder="Stock Level Qty">
            <button class="remove-button" type="button">Remove</button>
        `;

        // Attach event listener to the remove button within this input group
        inputGroup.querySelector('.remove-button').addEventListener('click', function() {
            dynamicInputsDiv.removeChild(inputGroup);
        });

        dynamicInputsDiv.appendChild(inputGroup);
    }

    // Initially add one stock level group
    addStockLevelGroup();

    // Button to add new stock level groups
    const addStockLevelButton = document.createElement('button');
    addStockLevelButton.textContent = 'Add Stock Level';
    addStockLevelButton.classList.add('add-schedule-button'); // Match the class with the schedule button
    addStockLevelButton.type = 'button';
    addStockLevelButton.addEventListener('click', addStockLevelGroup);

    // Append dynamic inputs and the button to stock level div
    stockLevelDiv.appendChild(dynamicInputsDiv);
    stockLevelDiv.appendChild(addStockLevelButton);

    const activateButton = document.createElement('button');
    activateButton.textContent = 'Activate';
    activateButton.classList.add('activate-button');
    activateButton.type = 'button'; // Ensure button type is button
    activateButton.addEventListener('click', function() {
        const sectionId = sectionWrapper.dataset.id;
        const scheduleInputs = sectionWrapper.querySelectorAll('.schedule-input');
    
        // Filter out schedule inputs that have no value set
        const validSchedules = Array.from(scheduleInputs).filter(input => {
            const day = input.querySelector('.schedule-day').value;
            const time = input.querySelector('.schedule-time').value;
            return day && time;
        });
    
        const isActive = sectionStatus[sectionId].active;

        console.log(sectionStatus[sectionId])
        console.log(sectionStatus[sectionId].scheduledJobs)
    
        if (isActive) {
            // Deactivation logic (always allowed)
            sectionStatus[sectionId].active = false;
            activateButton.textContent = 'Activate';
            activateButton.classList.add('inactive');
            activateButton.classList.remove('active');
    
            // Clear all scheduled jobs
            if (sectionStatus[sectionId].scheduledJobs) {
                sectionStatus[sectionId].scheduledJobs.forEach(job => job.cancel());
            }
            sectionStatus[sectionId].scheduledJobs = [];
        } else {
            // Activation logic (only if there are valid schedules)
            if (validSchedules.length === 0) {
                // If no valid schedules, do nothing
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

    // Append elements to the section wrapper
    sectionWrapper.appendChild(labelDiv);
    sectionWrapper.appendChild(removeSectionButton);
    sectionWrapper.appendChild(urlDiv);
    sectionWrapper.appendChild(loginCredsDiv);
    sectionWrapper.appendChild(stockHeaderDiv);
    sectionWrapper.appendChild(locationDiv);
    sectionWrapper.appendChild(identifierDiv);
    sectionWrapper.appendChild(attributeDiv);
    sectionWrapper.appendChild(schedulerDiv);
    sectionWrapper.appendChild(stockLevelDiv);

    // Create a container for buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.classList.add('button-container');
    buttonContainer.appendChild(activateButton);

    const newButton = document.createElement('button');
    newButton.textContent = 'Headers';
    newButton.classList.add('inputModeButton');
    newButton.type = 'button';
    newButton.onclick = function(event) {
        const button = event.target;
        sectionStatus[sectionWrapper.dataset.id].headers = !sectionStatus[sectionWrapper.dataset.id].headers
        button.textContent = sectionStatus[sectionWrapper.dataset.id].headers ? 'Headers' : 'Columns'
    };

    // Add the new button to the button container
    buttonContainer.appendChild(newButton);

    sectionWrapper.appendChild(buttonContainer);

    sectionsContainer.appendChild(sectionWrapper);

    // Add event listeners to the newly created toggle input buttons
    sectionWrapper.querySelector('.toggle-input-button').addEventListener('click', function() {
        const urlDiv = this.closest('.form-section');
        const textInput = urlDiv.querySelector('.url-input');
        const fileInput = urlDiv.querySelector('.file-input');

        if (textInput.style.display === 'none') {
            textInput.style.display = 'block';
            fileInput.style.display = 'none';
            this.textContent = 'Switch to Upload';
            sectionStatus[sectionWrapper.dataset.id].inputMode = 'url';
        } else {
            textInput.style.display = 'none';
            fileInput.style.display = 'block';
            this.textContent = 'Switch to Text';
            sectionStatus[sectionWrapper.dataset.id].inputMode = 'upload';
        }
    });

    // Function to add a new schedule input
    function addScheduleInput() {
        const scheduleInput = document.createElement('div');
        scheduleInput.classList.add('schedule-input');
        scheduleInput.innerHTML = `
            <select class="schedule-day">
                <option value="Sunday">Sunday</option>
                <option value="Monday">Monday</option>
                <option value="Tuesday">Tuesday</option>
                <option value="Wednesday">Wednesday</option>
                <option value="Thursday">Thursday</option>
                <option value="Friday">Friday</option>
                <option value="Saturday">Saturday</option>
            </select>
            at 
            <input type="time" class="schedule-time">
            <button type="button" class="remove-schedule-button remove-button">Remove</button>
        `;
        
        scheduleInput.querySelector('.remove-schedule-button').addEventListener('click', function() {
            scheduleInput.remove();
        });

        schedulerDiv.querySelector('.schedule-list').appendChild(scheduleInput);
    }

    // Add event listener for the add schedule button
    schedulerDiv.querySelector('.add-schedule-button').addEventListener('click', addScheduleInput);

    // Add one schedule input by default
    addScheduleInput();
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
                if (!sectionStatus[sectionId].ongoing) {
                    sectionStatus[sectionId].ongoing = true;
                    startSyncForSection(sectionWrapper).finally(() => {
                        sectionStatus[sectionId].ongoing = false;
                    });
                }
            });

            sectionStatus[sectionId].scheduledJobs.push(job);
        }
    });
}

// Initialize by creating the first section
createSection();

document.getElementById('addSectionButton').addEventListener('click', createSection);
