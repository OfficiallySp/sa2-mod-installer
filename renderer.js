// Wizard state
let currentStep = 0;
let gamePath = null;
let modsList = [];
let selectedMods = [];
let currentModIndex = 0;

const steps = [
    'step-welcome',
    'step-detect', 
    'step-mods',
    'step-install',
    'step-complete'
];

// DOM Elements
const backBtn = document.getElementById('back-btn');
const nextBtn = document.getElementById('next-btn');
const cancelBtn = document.getElementById('cancel-btn');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    updateNavigation();
    
    // Load and display version number
    try {
        const version = await window.api.getVersion();
        const versionElement = document.getElementById('version-number');
        if (versionElement && version) {
            versionElement.textContent = `v${version}`;
        }
    } catch (error) {
        console.error('Failed to load version:', error);
    }
    
    // Button event listeners
    backBtn.addEventListener('click', previousStep);
    nextBtn.addEventListener('click', nextStep);
    cancelBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to cancel the installation?')) {
            window.close();
        }
    });
    
    // Browse button listener
    const browseBtn = document.getElementById('browse-btn');
    if (browseBtn) {
        browseBtn.addEventListener('click', browseForGame);
    }
});

// Navigation functions
function showStep(index) {
    // Hide all steps
    steps.forEach(step => {
        document.getElementById(step).classList.remove('active');
    });
    
    // Show current step
    document.getElementById(steps[index]).classList.add('active');
    
    // Execute step-specific logic
    switch(steps[index]) {
        case 'step-detect':
            detectGame();
            break;
        case 'step-mods':
            loadModsList();
            break;
        case 'step-install':
            startInstallation();
            break;
    }
    
    updateNavigation();
}

function nextStep() {
    if (currentStep < steps.length - 1) {
        // Validation before moving to next step
        if (steps[currentStep] === 'step-detect' && !gamePath) {
            alert('Please select your Sonic Adventure 2 installation folder before continuing.');
            return;
        }
        
        if (steps[currentStep] === 'step-mods') {
            // Collect selected mods from the current showcase
            collectSelectedMods();
            
            // Check if we're done showing all mods
            if (currentModIndex < modsList.length) {
                // Show next mod
                showNextMod();
                return;
            } else {
                // All mods shown, check if any selected
                if (selectedMods.length === 0 && !modsList.some(m => m.required)) {
                    alert('Please select at least one mod to install.');
                    return;
                }
            }
        }
        
        currentStep++;
        showStep(currentStep);
    } else {
        // Last step - close the installer
        window.close();
    }
}

function previousStep() {
    if (currentStep > 0) {
        // Reset mod showcase when going back to mod selection
        if (steps[currentStep] === 'step-mods' && currentModIndex > 0) {
            // Go to previous mod
            currentModIndex = Math.max(0, currentModIndex - 2);
            showNextMod();
            return;
        }
        
        currentStep--;
        showStep(currentStep);
    }
}

function updateNavigation() {
    // Update back button
    backBtn.disabled = currentStep === 0;
    
    // Update next button text and state
    if (currentStep === steps.length - 1) {
        nextBtn.textContent = 'Finish';
    } else if (steps[currentStep] === 'step-install') {
        nextBtn.textContent = 'Next →';
        nextBtn.disabled = true; // Will be enabled when installation completes
    } else if (steps[currentStep] === 'step-mods' && currentModIndex < modsList.length - 1) {
        nextBtn.textContent = 'Next →';
    } else {
        nextBtn.textContent = 'Next →';
    }
    
    // Special handling for mod selection step
    if (steps[currentStep] === 'step-mods') {
        if (currentModIndex >= modsList.length - 1) {
            nextBtn.textContent = 'Install';
        }
    }
}

// Game detection
async function detectGame() {
    const spinner = document.getElementById('detection-spinner');
    const message = document.getElementById('detection-message');
    const foundDiv = document.getElementById('game-found');
    const notFoundDiv = document.getElementById('game-not-found');
    const pathElement = document.getElementById('game-path');
    
    // Show spinner
    spinner.style.display = 'block';
    message.textContent = 'Scanning for Sonic Adventure 2...';
    foundDiv.classList.add('hidden');
    notFoundDiv.classList.add('hidden');
    
    try {
        const result = await window.api.detectGame();
        
        spinner.style.display = 'none';
        
        if (result.found) {
            gamePath = result.path;
            message.textContent = 'Game detected successfully!';
            pathElement.textContent = gamePath;
            foundDiv.classList.remove('hidden');
            nextBtn.disabled = false;
        } else {
            message.textContent = 'Automatic detection failed.';
            notFoundDiv.classList.remove('hidden');
            nextBtn.disabled = true;
        }
    } catch (error) {
        console.error('Detection error:', error);
        spinner.style.display = 'none';
        message.textContent = 'Error during detection.';
        notFoundDiv.classList.remove('hidden');
        nextBtn.disabled = true;
    }
}

async function browseForGame() {
    const result = await window.api.browseGameFolder();
    
    if (result.found) {
        gamePath = result.path;
        document.getElementById('game-not-found').classList.add('hidden');
        document.getElementById('game-found').classList.remove('hidden');
        document.getElementById('game-path').textContent = gamePath;
        document.getElementById('detection-message').textContent = 'Game folder selected!';
        nextBtn.disabled = false;
    } else if (result.error) {
        alert(result.error);
    }
}

// Mod selection
async function loadModsList() {
    modsList = await window.api.getModsList();
    currentModIndex = 0;
    selectedMods = [];
    
    // Add required mods to selected list
    modsList.forEach(mod => {
        if (mod.required) {
            selectedMods.push(mod.id);
        }
    });
    
    // Show first mod
    showNextMod();
}

function showNextMod() {
    const showcase = document.getElementById('mod-showcase');
    const selector = document.getElementById('mod-selector');
    
    if (currentModIndex < modsList.length) {
        const mod = modsList[currentModIndex];
        
        // Create mod showcase HTML
        showcase.innerHTML = `
            <div class="mod-preview">
                <img src="${mod.preview || 'assets/placeholder.png'}" 
                     alt="${mod.name}" 
                     title="Click to enlarge">
            </div>
            <div class="mod-info">
                <h3>${mod.name}</h3>
                <p>${mod.description}</p>
            </div>
            <div class="mod-checkbox">
                <input type="checkbox" 
                       id="mod-check-${mod.id}" 
                       value="${mod.id}"
                       ${mod.required ? 'checked disabled' : ''}
                       ${selectedMods.includes(mod.id) ? 'checked' : ''}>
                <label for="mod-check-${mod.id}">
                    Install ${mod.name} ${mod.required ? '(Required)' : ''}
                </label>
            </div>
        `;
        
        currentModIndex++;
        updateNavigation();
        
        // Add click handler for preview image
        const previewImg = showcase.querySelector('.mod-preview img');
        previewImg.addEventListener('click', () => {
            // Could implement image preview modal here
        });
    } else {
        // Show summary of selected mods
        showModSummary();
    }
}

function collectSelectedMods() {
    // Collect the current mod selection
    const checkbox = document.querySelector(`#mod-showcase input[type="checkbox"]`);
    if (checkbox) {
        const modId = checkbox.value;
        if (checkbox.checked && !selectedMods.includes(modId)) {
            selectedMods.push(modId);
        } else if (!checkbox.checked && selectedMods.includes(modId)) {
            const index = selectedMods.indexOf(modId);
            if (index > -1) {
                selectedMods.splice(index, 1);
            }
        }
    }
}

function showModSummary() {
    const showcase = document.getElementById('mod-showcase');
    
    const selectedModsList = selectedMods.map(modId => {
        const mod = modsList.find(m => m.id === modId);
        return mod ? `<li>${mod.name}</li>` : '';
    }).filter(Boolean).join('');
    
    showcase.innerHTML = `
        <div class="mod-summary">
            <h3>Selected Mods for Installation:</h3>
            <ul>${selectedModsList}</ul>
            <p style="margin-top: 20px;">
                <strong>${selectedMods.length}</strong> mod(s) will be installed.
            </p>
        </div>
    `;
}

// Installation
async function startInstallation() {
    const statusElement = document.getElementById('install-status');
    const detailsElement = document.getElementById('install-details');
    const progressFill = document.getElementById('progress-fill');
    const completeDiv = document.getElementById('install-complete');
    const errorDiv = document.getElementById('install-error');
    const openModloaderCheckbox = document.getElementById('open-modloader-checkbox');
    
    // Reset UI
    completeDiv.classList.add('hidden');
    errorDiv.classList.add('hidden');
    nextBtn.disabled = true;
    backBtn.disabled = true;
    cancelBtn.disabled = true;
    
    // Disable checkbox during installation
    openModloaderCheckbox.disabled = true;
    
    // Set up progress listener
    window.api.onInstallProgress((data) => {
        statusElement.textContent = data.message || 'Installing...';
        
        if (data.progress !== undefined) {
            progressFill.style.width = `${data.progress}%`;
        }
        
        if (data.status === 'downloading') {
            detailsElement.textContent = 'Downloading files from GameBanana...';
        } else if (data.status === 'installing') {
            detailsElement.textContent = 'Extracting and configuring mods...';
        } else if (data.status === 'configuring') {
            detailsElement.textContent = 'Setting up mod configuration...';
        }
    });
    
    try {
        const openModloader = openModloaderCheckbox.checked;
        const result = await window.api.installMods({
            gamePath: gamePath,
            selectedMods: selectedMods,
            openModloader: openModloader
        });
        
        if (result.success) {
            progressFill.style.width = '100%';
            statusElement.textContent = 'Installation completed!';
            detailsElement.textContent = '';
            completeDiv.classList.remove('hidden');
            nextBtn.disabled = false;
            nextBtn.textContent = 'Next →';
        } else {
            throw new Error(result.error || 'Installation failed');
        }
    } catch (error) {
        console.error('Installation error:', error);
        errorDiv.classList.remove('hidden');
        document.getElementById('error-message').textContent = error.message;
        backBtn.disabled = false;
        cancelBtn.disabled = false;
    } finally {
        // Re-enable checkbox after installation
        openModloaderCheckbox.disabled = false;
    }
    
    // Clean up listener
    window.api.removeAllListeners('install-progress');
}

// Initialize first step
showStep(0);

// Test GameBanana API function
async function testGameBananaAPI() {
    const resultDiv = document.getElementById('api-test-result');
    resultDiv.innerHTML = 'Testing API connection...';
    
    try {
        // Test with the first mod ID (SA2 Mod Loader)
        const result = await window.api.testApi(15436);
        
        if (result.success) {
            resultDiv.innerHTML = `<span style="color: green;">✅ API Test Successful!</span><br>
                                 Found ${result.data._aFiles ? result.data._aFiles.length : 0} files.`;
            console.log('API Test Result:', result.data);
        } else {
            resultDiv.innerHTML = `<span style="color: red;">❌ API Test Failed:</span><br>
                                 ${result.error}`;
            if (result.response) {
                console.log('Error response:', result.response);
            }
        }
    } catch (error) {
        resultDiv.innerHTML = `<span style="color: red;">❌ Test Error: ${error.message}</span>`;
        console.error('Test error:', error);
    }
}
