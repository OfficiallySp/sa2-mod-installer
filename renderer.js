// Wizard state
let currentStep = 0;
let currentGameId = null;
let currentGameConfig = null;
let gamePath = null;
let modsList = [];
let selectedMods = [];
let currentModIndex = 0;

const steps = [
    'step-launcher',
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
    
    // Load launcher games
    if (steps[currentStep] === 'step-launcher') {
        loadLauncherGames();
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
        case 'step-launcher':
            loadLauncherGames();
            break;
        case 'step-welcome':
            loadWelcomeScreen();
            break;
        case 'step-detect':
            detectGame();
            break;
        case 'step-mods':
            loadModsList();
            break;
        case 'step-install':
            startInstallation();
            break;
        case 'step-complete':
            loadCompleteScreen();
            break;
    }
    
    updateNavigation();
}

function nextStep() {
    if (currentStep < steps.length - 1) {
        // Validation before moving to next step
        if (steps[currentStep] === 'step-launcher' && !currentGameId) {
            alert('Please select a game to continue.');
            return;
        }
        
        if (steps[currentStep] === 'step-detect' && !gamePath) {
            const gameName = currentGameConfig ? currentGameConfig.name : 'the game';
            alert(`Please select your ${gameName} installation folder before continuing.`);
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
                // All mods shown (or no mods available)
                // Only block if there are mods available but none selected and no required mods
                // Allow proceeding if modsList is empty (games with no mods) or if mods are selected
                if (modsList.length > 0 && selectedMods.length === 0 && !modsList.some(m => m.required)) {
                    alert('Please select at least one mod to install.');
                    return;
                }
                // If modsList is empty, allow proceeding (games with no mods available)
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
    } else if (steps[currentStep] === 'step-launcher') {
        nextBtn.textContent = 'Select Game';
        nextBtn.disabled = !currentGameId;
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

// Launcher functions
async function loadLauncherGames() {
    const gamesGrid = document.getElementById('games-grid');
    if (!gamesGrid) return;
    
    try {
        const games = await window.api.getGamesList();
        
        gamesGrid.innerHTML = games.map(game => `
            <div class="game-card" data-game-id="${game.id}">
                <img src="${game.icon || 'assets/placeholder.png'}" alt="${game.name}" onerror="this.src='assets/placeholder.png'">
                <h3>${game.name}</h3>
            </div>
        `).join('');
        
        // Add click handlers
        gamesGrid.querySelectorAll('.game-card').forEach(card => {
            card.addEventListener('click', () => {
                const gameId = card.getAttribute('data-game-id');
                selectGame(gameId);
            });
        });
    } catch (error) {
        console.error('Failed to load games:', error);
        gamesGrid.innerHTML = '<p>Error loading games. Please restart the application.</p>';
    }
}

async function selectGame(gameId) {
    try {
        // Set current game
        await window.api.setCurrentGame(gameId);
        currentGameId = gameId;
        currentGameConfig = await window.api.getCurrentGame();
        
        // Update UI - highlight selected card
        document.querySelectorAll('.game-card').forEach(card => {
            card.style.borderColor = card.getAttribute('data-game-id') === gameId ? '#3182ce' : '#cbd5e0';
        });
        
        // Enable next button
        updateNavigation();
    } catch (error) {
        console.error('Failed to select game:', error);
        alert('Failed to select game. Please try again.');
    }
}

async function loadWelcomeScreen() {
    if (!currentGameConfig) {
        currentGameConfig = await window.api.getCurrentGame();
    }
    
    if (!currentGameConfig) return;
    
    // Update title
    const welcomeTitle = document.getElementById('welcome-title');
    if (welcomeTitle) {
        welcomeTitle.textContent = `Welcome to ${currentGameConfig.name} Mod Installer`;
    }
    
    // Update description
    const welcomeDesc = document.getElementById('welcome-description');
    if (welcomeDesc) {
        welcomeDesc.textContent = `This installer will help you set up the best mods for ${currentGameConfig.name} on PC.`;
    }
    
    // Load video
    const videoContainer = document.getElementById('welcome-video-container');
    if (videoContainer && currentGameConfig.welcomeVideoUrl) {
        // Extract video ID from YouTube URL
        const videoId = extractYouTubeId(currentGameConfig.welcomeVideoUrl);
        if (videoId) {
            videoContainer.innerHTML = `
                <iframe 
                    src="https://www.youtube.com/embed/${videoId}?rel=0" 
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen>
                </iframe>
            `;
        }
    }
}

function extractYouTubeId(url) {
    // Handle various YouTube URL formats
    const patterns = [
        /youtube\.com\/embed\/([^?&]+)/,
        /youtu\.be\/([^?&]+)/,
        /youtube\.com\/watch\?v=([^&]+)/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

async function loadCompleteScreen() {
    if (!currentGameConfig) {
        currentGameConfig = await window.api.getCurrentGame();
    }
    
    if (!currentGameConfig) return;
    
    // Update all completion messages with the current game name
    const completeSuccessMessage = document.getElementById('complete-success-message');
    if (completeSuccessMessage) {
        completeSuccessMessage.textContent = `${currentGameConfig.name} mods have been installed successfully.`;
    }
    
    // Update install complete message (in case user navigates back/forward)
    const installCompleteMessage = document.getElementById('install-complete-message');
    if (installCompleteMessage && currentGameConfig) {
        const modManagerName = currentGameId === 'sa2' ? 'SA2 Mod Manager' : 'Mod Manager';
        installCompleteMessage.textContent = `You can now launch ${currentGameConfig.name} with the ${modManagerName}.`;
    }
    
    // Update next steps list to reference the specific game
    const nextStepsList = document.getElementById('next-steps-list');
    if (nextStepsList && currentGameConfig) {
        const modManagerName = currentGameId === 'sa2' ? 'SA2 Mod Manager' : 'Mod Manager';
        nextStepsList.innerHTML = `
            <li>Launch the ${modManagerName} from your ${currentGameConfig.name} folder</li>
            <li>Configure any additional mod settings if needed</li>
            <li>Click "Save & Play" in the ${modManagerName} to start the game</li>
        `;
    }
}

// Game detection
async function detectGame() {
    if (!currentGameConfig) {
        currentGameConfig = await window.api.getCurrentGame();
    }
    
    if (!currentGameConfig) {
        alert('No game selected. Please go back and select a game.');
        return;
    }
    
    const spinner = document.getElementById('detection-spinner');
    const message = document.getElementById('detection-message');
    const foundDiv = document.getElementById('game-found');
    const notFoundDiv = document.getElementById('game-not-found');
    const pathElement = document.getElementById('game-path');
    const detectTitle = document.getElementById('detect-title');
    const foundMessage = document.getElementById('game-found-message');
    const notFoundMessage = document.getElementById('game-not-found-message');
    const pathExample = document.getElementById('game-path-example');
    
    // Update titles
    if (detectTitle) detectTitle.textContent = `${currentGameConfig.name} Detection`;
    if (foundMessage) foundMessage.textContent = `✅ ${currentGameConfig.name} found!`;
    if (notFoundMessage) notFoundMessage.textContent = `❌ Could not automatically detect ${currentGameConfig.name}.`;
    if (pathExample && currentGameConfig.steamFolderName) {
        pathExample.textContent = `For Example "C:\\Program Files\\Steam\\steamapps\\common\\${currentGameConfig.steamFolderName}".`;
    }
    
    // Show spinner
    spinner.style.display = 'block';
    message.textContent = `Scanning for ${currentGameConfig.name}...`;
    foundDiv.classList.add('hidden');
    notFoundDiv.classList.add('hidden');
    
    try {
        const result = await window.api.detectGame(currentGameId);
        
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
    if (!currentGameId) {
        alert('No game selected. Please go back and select a game.');
        return;
    }
    
    const result = await window.api.browseGameFolder(currentGameId);
    
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
    if (!currentGameId) {
        currentGameConfig = await window.api.getCurrentGame();
        if (currentGameConfig) {
            currentGameId = currentGameConfig.id;
        }
    }
    
    modsList = await window.api.getModsList(currentGameId);
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
        
        // Build GameBanana link if available
        const gameBananaLink = mod.gameBananaId 
            ? `https://gamebanana.com/mods/${mod.gameBananaId}` 
            : null;
        
        // Build author and link HTML
        let authorLinkHtml = '';
        if (mod.author || gameBananaLink) {
            authorLinkHtml = '<div class="mod-meta">';
            if (mod.author) {
                authorLinkHtml += `<span class="mod-author">By ${mod.author}</span>`;
            }
            if (gameBananaLink) {
                if (mod.author) authorLinkHtml += ' • ';
                authorLinkHtml += `<a href="#" class="mod-link" data-url="${gameBananaLink}">View on GameBanana</a>`;
            }
            authorLinkHtml += '</div>';
        }
        
        // Check if preview is a video URL
        const isVideo = mod.preview && (mod.preview.includes('youtube.com') || mod.preview.includes('youtu.be'));
        let previewHtml = '';
        
        if (isVideo) {
            const videoId = extractYouTubeId(mod.preview);
            if (videoId) {
                previewHtml = `<iframe 
                    src="https://www.youtube.com/embed/${videoId}?rel=0" 
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen>
                </iframe>`;
            } else {
                previewHtml = `<img src="${mod.preview || 'assets/placeholder.png'}" alt="${mod.name}" title="Click to enlarge">`;
            }
        } else {
            previewHtml = `<img src="${mod.preview || 'assets/placeholder.png'}" alt="${mod.name}" title="Click to enlarge">`;
        }
        
        // Create mod showcase HTML
        showcase.innerHTML = `
            <div class="mod-preview">
                ${previewHtml}
            </div>
            <div class="mod-info">
                <h3>${mod.name}</h3>
                ${authorLinkHtml}
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
        
        // Add click handler for preview image (only if img element exists, not iframe)
        const previewImg = showcase.querySelector('.mod-preview img');
        if (previewImg) {
            previewImg.addEventListener('click', () => {
                // Could implement image preview modal here
            });
        }
        
        // Add click handler for GameBanana link
        const gameBananaLinkEl = showcase.querySelector('.mod-link');
        if (gameBananaLinkEl) {
            gameBananaLinkEl.addEventListener('click', (e) => {
                e.preventDefault();
                const url = gameBananaLinkEl.getAttribute('data-url');
                if (url) {
                    window.api.openExternal(url);
                }
            });
        }
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
            openModloader: openModloader,
            gameId: currentGameId
        });
        
        // Update completion message
        if (currentGameConfig) {
            const completeMessage = document.getElementById('install-complete-message');
            const completeSuccessMessage = document.getElementById('complete-success-message');
            const modManagerLabel = document.getElementById('open-modloader-label');
            if (completeMessage) {
                const modManagerName = currentGameId === 'sa2' ? 'SA2 Mod Manager' : 'Mod Manager';
                completeMessage.textContent = `You can now launch ${currentGameConfig.name} with the ${modManagerName}.`;
            }
            if (completeSuccessMessage) {
                completeSuccessMessage.textContent = `${currentGameConfig.name} mods have been installed successfully.`;
            }
            if (modManagerLabel && currentGameConfig.modManagerUrl) {
                const modManagerName = currentGameId === 'sa2' ? 'SA2 Mod Manager' : 'Mod Manager';
                modManagerLabel.textContent = `Open ${modManagerName} after installation`;
            }
        }
        
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

// Initialize first step (launcher)
showStep(0);

