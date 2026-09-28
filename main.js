const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const axios = require('axios');
const AdmZip = require('adm-zip');
const StreamZip = require('node-stream-zip');
const sevenBin = require('7zip-bin');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Helper function to get the correct path to 7za executable
// Handles both development and packaged builds (with asar unpacking)
function get7zaPath() {
  let sevenZipPath = sevenBin.path7za;
  
  // Check if we're running from a packaged app
  if (app.isPackaged && process.resourcesPath) {
    // In packaged builds, check if path points to app.asar
    if (sevenZipPath.includes('app.asar')) {
      // Replace app.asar with app.asar.unpacked
      const unpackedPath = sevenZipPath.replace('app.asar', 'app.asar.unpacked');
      
      // Check if unpacked version exists
      if (fsSync.existsSync(unpackedPath)) {
        return unpackedPath;
      }
      
      // Alternative: construct path from resources directory
      // Extract the relative path from app.asar
      const asarIndex = sevenZipPath.indexOf('app.asar');
      if (asarIndex !== -1) {
        const pathAfterAsar = sevenZipPath.substring(asarIndex + 'app.asar'.length);
        const unpackedFullPath = path.join(process.resourcesPath, 'app.asar.unpacked', pathAfterAsar);
        if (fsSync.existsSync(unpackedFullPath)) {
          return unpackedFullPath;
        }
      }
    }
  }
  
  return sevenZipPath;
}

// Load package.json to get version
const packageJson = require('./package.json');

let mainWindow;

// Logging helper - only log in development or when explicitly enabled
const isDevelopment = process.env.NODE_ENV === 'development' || !app.isPackaged;
const logger = {
  log: (...args) => {
    if (isDevelopment) console.log(...args);
  },
  error: (...args) => {
    // Always log errors
    console.error(...args);
  },
  warn: (...args) => {
    if (isDevelopment) console.warn(...args);
  }
};

// Multi-Game Configuration System
const GAMES_CONFIG = {
  sa2: {
    id: 'sa2',
    name: 'Sonic Adventure 2',
    steamAppId: 213610,
    executables: ['sonic2app.exe', 'Sonic Adventure 2.exe'],
    steamFolderName: 'Sonic Adventure 2',
    modManagerUrl: 'https://github.com/X-Hax/SA-Mod-Manager/releases/latest',
    defaultModsPath: 'mods',
    welcomeVideoUrl: 'https://www.youtube.com/embed/4hvMyxoLN2s',
    icon: 'assets/game-icons/sa2.png',
    mods: [
      {
        id: 'sa2_mod_loader',
        name: 'SA2 Mod Loader',
        description: 'Essential mod loader for Sonic Adventure 2 and SADX. Required for all other mods.',
        required: true,
        gameBananaId: null,
        downloadUrl: 'https://github.com/X-Hax/SA-Mod-Manager/releases/latest',
        preview: 'assets/previews/modloader.png',
        author: 'X-Hax'
      },
      {
        id: 'sasdl',
        name: 'SASDL',
        description: 'Common prerequisite for input based mods.',
        required: true,
        gameBananaId: 615843,
        preview: 'assets/previews/sasdl.png',
        author: 'Shaddatic'
      },
      {
        id: 'render',
        name: 'Render Fix',
        description: 'Fixes various rendering issues from the PC/GC versions.',
        required: false,
        gameBananaId: 452445,
        preview: 'assets/previews/renderfix.gif',
        author: 'Shaddatic'
      },
      {
        id: 'cutscene',
        name: 'Cutscene Revamp',
        description: 'Replaces most cutscenes with better quality ones that match the original game while fixing other issues. <strong>See a sample:</strong> <a href="assets/cutsceneicat/index.html" target="_blank" style="color:#fff;background:#0078d7;padding:2px 8px;border-radius:3px;text-decoration:none;font-weight:bold;">Click to open preview</a>.',
        required: false,
        gameBananaId: 48872,
        preview: 'assets/previews/cutscene.gif',
        author: 'SPEEPSHighway & End User'
      },
      {
        id: 'hdgui',
        name: 'HD GUI',
        description: 'Replaces the GUI with a high resolution one.',
        required: false,
        gameBananaId: 33171,
        preview: 'assets/previews/hdgui.gif',
        author: 'SPEEPSHighway'
      },
      {
        id: 'enhancedchaoworld',
        name: 'Chao World Extended',
        description: 'Improves the Chao World with new features and content.',
        required: false,
        gameBananaId: 48840,
        preview: 'assets/previews/chaoext.gif',
        author: 'DarkyBenji & CWE Team'
      },
      {
        id: 'chaoworldextended',
        name: 'Enhanced Chao World',
        description: 'Enhances the Chao World with more features and content. (compatible with Chao World Extended)',
        required: false,
        gameBananaId: 48915,
        preview: 'assets/previews/ehchao.gif',
        author: 'Shaddatic'
      },
      {
        id: 'character',
        name: 'Character Select Plus',
        description: 'Play as any character in any stage.',
        required: false,
        gameBananaId: 33170,
        preview: 'assets/previews/character.gif',
        author: 'Justin113D, MainMemory & SORA'
      },
      {
        id: 'volume',
        name: 'Volume Control',
        description: 'Adjusts the volume mixing of the game.',
        required: false,
        gameBananaId: 381193,
        preview: 'assets/previews/volume.png',
        author: 'Shaddatic'
      },
      {
        id: 'input',
        name: 'Input Fix',
        description: 'Fixes the input system of the game. adds support for many more controllers.',
        required: false,
        gameBananaId: 515637,
        preview: 'assets/previews/input.gif',
        author: 'Shaddatic'
      }
    ]
  },
  heroes: {
    id: 'heroes',
    name: 'Sonic Heroes',
    steamAppId: null,
    executables: ['Tsonic_win.exe', 'Sonic Heroes.exe'],
    steamFolderName: 'Sonic Heroes',
    requiredFolderMarkers: ['dvdroot'],
    folderBrowseHint: 'Choose the folder that contains Tsonic_win.exe (or Sonic Heroes.exe) and a dvdroot folder—typical Sonic PC Collection layout.',
    modManagerUrl: null,
    defaultModsPath: 'mods',
    welcomeVideoUrl: 'https://youtu.be/hL_GSHFhzLQ',
    icon: 'assets/game-icons/heroes.png',
    mods: [
      {
        id: 'heroes_fixed_edition',
        name: 'Sonic Heroes: Fixed Edition',
        description: 'PCGamingWiki-recommended GameBanana bundle (replaces many manual EXE / hex steps). Extracts into your game directory. If you also use Graphics Essentials, avoid duplicate widescreen or D3D hooks—read each readme.',
        required: true,
        gameBananaId: 620838,
        installTarget: 'gameRoot',
        preview: 'assets/placeholder.png',
        author: 'SH Mods Community'
      },
      {
        id: 'reloaded_ii',
        name: 'Reloaded II (next to game)',
        description: 'Current mod loader for Heroes. Installed under Reloaded-II inside your game folder. Run Reloaded-II.exe, register Sonic Heroes, then enable mods from the Reloaded UI.',
        required: false,
        githubRelease: { owner: 'Reloaded-Project', repo: 'Reloaded-II', assetName: 'Release.zip' },
        installTarget: 'reloadedPortable',
        preview: 'assets/placeholder.png',
        author: 'Reloaded-Project'
      },
      {
        id: 'heroes_graphics_essentials',
        name: 'Heroes Graphics Essentials (Reloaded II)',
        description: 'Widescreen/tallscreen, borderless or resizable window, faster stage loads, 2P framerate unlock, ultra-wide crash fixes. Extracts to %AppData%\\Reloaded-II\\Mods. Do not combine with other widescreen ASI fixes unless the readme says it is safe.',
        required: false,
        githubRelease: {
          owner: 'Sewer56',
          repo: 'Heroes.Graphics.Essentials.ReloadedII',
          assetNameIncludes: ['Heroes.Graphics.Essentials'],
          assetNameEndsWith: '.7z'
        },
        installTarget: 'reloadedMods',
        preview: 'assets/placeholder.png',
        author: 'Sewer56'
      },
      {
        id: 'heroes_controller_base',
        name: 'Heroes Controller Hook — base (Reloaded II)',
        description: 'Base Reloaded package for XInput/DInput and camera triggers. Installs into %AppData%\\Reloaded-II\\Mods. Add Custom below if you need remapping.',
        required: false,
        gameBananaId: 50825,
        gameBananaFileIncludes: 'heroes_controller_hook2_2_1',
        installTarget: 'reloadedMods',
        preview: 'assets/placeholder.png',
        author: 'Sewer56'
      },
      {
        id: 'heroes_controller_custom',
        name: 'Heroes Controller Hook — custom / remapping',
        description: 'Optional Reloaded add-on for rebinding and advanced input. Use with the base Controller Hook package.',
        required: false,
        gameBananaId: 50825,
        gameBananaFileIncludes: 'heroes_controller_hook_custom3_0_0',
        installTarget: 'reloadedMods',
        preview: 'assets/placeholder.png',
        author: 'Sewer56'
      }
    ]
  },
  riders: {
    id: 'riders',
    name: 'Sonic Riders',
    steamAppId: null,
    executables: ['Sonic Riders.exe'],
    steamFolderName: 'Sonic Riders',
    modManagerUrl: null,
    defaultModsPath: 'mods',
    welcomeVideoUrl: 'https://www.youtube.com/embed/3nH5SU6cfJ0',
    icon: 'assets/game-icons/riders.png',
    mods: []
  },
  unleashed: {
    id: 'unleashed',
    name: 'Sonic Unleashed',
    steamAppId: null,
    executables: ['Sonic Unleashed.exe'],
    steamFolderName: 'Sonic Unleashed',
    modManagerUrl: null,
    defaultModsPath: 'mods',
    welcomeVideoUrl: 'https://www.youtube.com/embed/1AFH1K3oTDk',
    icon: 'assets/game-icons/unleashed.png',
    mods: []
  },
  unleashed_legacy: {
    id: 'unleashed_legacy',
    name: 'Sonic Unleashed (Legacy)',
    steamAppId: null,
    executables: ['Sonic Unleashed.exe'],
    steamFolderName: 'Sonic Unleashed',
    modManagerUrl: null,
    defaultModsPath: 'mods',
    welcomeVideoUrl: 'https://www.youtube.com/embed/NcMMVbj7BrY',
    icon: 'assets/game-icons/unleashed-legacy.png',
    mods: []
  },
  forces: {
    id: 'forces',
    name: 'Sonic Forces',
    steamAppId: 637100,
    executableSubdir: 'build/main/projects/exec',
    executables: ['Sonic Forces.exe'],
    steamFolderName: 'Sonic Forces',
    modManagerUrl: 'https://github.com/hedge-dev/HedgeModManager/releases/latest',
    modManagerExeFile: 'HedgeModManager.exe',
    modManagerInstallDirRelativeToGame: 'build/main/projects/exec',
    skipModsIniBootstrap: true,
    skipConfigureModsIni: true,
    defaultModsPath: 'build/main/projects/exec/mods',
    folderBrowseHint:
      'Choose the Steam "Sonic Forces" folder (contains build\\main\\projects\\exec\\Sonic Forces.exe)—e.g. ...\\steamapps\\common\\Sonic Forces. Use a legit Steam copy (Steam AppID 637100). Prefer an SSD for large mods like Overclocked.',
    welcomeVideoUrl: 'https://www.youtube.com/embed/MnPCLUsyErA',
    icon: 'assets/game-icons/forces.png',
    mods: [
      {
        id: 'forces_overclocked',
        name: 'Sonic Forces Overclocked',
        description:
          'Large campaign overhaul mod (sequel-style expansion). <strong>Manual download only:</strong> the GameBanana page zip is a placeholder—use the <strong>Google Drive / MEGA / Mediafire</strong> mirrors on the mod page, then extract with <strong>7-Zip</strong> directly into the <strong>mods folder path</strong> shown in Hedge Mod Manager Settings (move the <code>SFO</code> folder there). In HMM: install the mod loader, <strong>Download Community Codes</strong>, enable <strong>Redirect Default Save File</strong>, keep <strong>only this mod</strong> enabled (FreeCam is OK per authors). Prefer <strong>Hedge Mod Manager 8</strong> (multiplatform beta); otherwise <strong>HMM 7.12-4+</strong>. <strong>Overclocked:</strong> cap the game at <strong>60 FPS</strong> and do <strong>not</strong> enable FPS codes—authors require this for stability. <strong>Vanilla / other mods:</strong> high FPS via HMM codes or hex edits can break physics and some stages; cutscenes stay ~30 FPS internally and some QTEs cap at 60. Saves and troubleshooting: https://duckdealer1.github.io/forces-overclocked/about.html',
        required: false,
        gameBananaId: 485051,
        manualDownloadOnly: true,
        preview: 'assets/placeholder.png',
        author: 'Overclocked Team'
      }
    ]
  },
  frontiers: {
    id: 'frontiers',
    name: 'Sonic Frontiers',
    steamAppId: null,
    executables: ['Sonic Frontiers.exe'],
    steamFolderName: 'Sonic Frontiers',
    modManagerUrl: null,
    defaultModsPath: 'mods',
    welcomeVideoUrl: 'https://www.youtube.com/embed/LJ1cK07Am-M',
    icon: 'assets/game-icons/frontiers.png',
    mods: []
  }
};

// Registry paths (shared across games)
const REGISTRY_PATHS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
];

// Current selected game (set by launcher)
let currentGameId = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    autoHideMenuBar: true
  });

  mainWindow.loadFile('index.html');
  
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers

// Get list of available games
ipcMain.handle('get-games-list', async () => {
  return Object.values(GAMES_CONFIG).map(game => ({
    id: game.id,
    name: game.name,
    icon: game.icon,
    welcomeVideoUrl: game.welcomeVideoUrl
  }));
});

// Set current game selection
ipcMain.handle('set-current-game', async (event, gameId) => {
  if (GAMES_CONFIG[gameId]) {
    currentGameId = gameId;
    return { success: true };
  }
  return { success: false, error: 'Invalid game ID' };
});

// Get current game config
ipcMain.handle('get-current-game', async () => {
  if (!currentGameId || !GAMES_CONFIG[currentGameId]) {
    return null;
  }
  return GAMES_CONFIG[currentGameId];
});

// Detect game installation
ipcMain.handle('detect-game', async (event, gameId) => {
  if (!gameId) {
    gameId = currentGameId;
  }
  
  if (!gameId || !GAMES_CONFIG[gameId]) {
    return { found: false, path: null, method: null, error: 'Invalid game ID' };
  }

  const gameConfig = GAMES_CONFIG[gameId];
  
  try {
    // Check Steam installation
    const steamPath = await findSteamGame(gameConfig);
    if (steamPath) {
      return { found: true, path: steamPath, method: 'steam' };
    }

    // Check registry for other installations
    const registryPath = await findGameInRegistry(gameConfig);
    if (registryPath) {
      return { found: true, path: registryPath, method: 'registry' };
    }

    // Manual browse fallback will be handled by renderer
    return { found: false, path: null, method: null };
  } catch (error) {
    console.error('Error detecting game:', error);
    return { found: false, path: null, method: null, error: error.message };
  }
});

// Browse for game folder
ipcMain.handle('browse-game-folder', async (event, gameId) => {
  if (!gameId) {
    gameId = currentGameId;
  }
  
  if (!gameId || !GAMES_CONFIG[gameId]) {
    return { found: false, error: 'Invalid game ID' };
  }

  const gameConfig = GAMES_CONFIG[gameId];
  
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: `Select ${gameConfig.name} Installation Folder`
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const gamePath = result.filePaths[0];
    const isValid = await validateGamePath(gamePath, gameConfig);
    if (isValid) {
      return { found: true, path: gamePath };
    } else {
      return { found: false, error: `Invalid game folder. Could not find ${gameConfig.name} executable.` };
    }
  }
  return { found: false };
});

// Validate game installation path
ipcMain.handle('validate-game-path', async (event, gamePath, gameId) => {
  if (!gamePath || typeof gamePath !== 'string') {
    return false;
  }
  
  if (!gameId) {
    gameId = currentGameId;
  }
  
  if (!gameId || !GAMES_CONFIG[gameId]) {
    return false;
  }
  
  return await validateGamePath(gamePath, GAMES_CONFIG[gameId]);
});

// Get mods list for current game
ipcMain.handle('get-mods-list', async (event, gameId) => {
  if (!gameId) {
    gameId = currentGameId;
  }
  
  if (!gameId || !GAMES_CONFIG[gameId]) {
    return [];
  }
  
  return GAMES_CONFIG[gameId].mods || [];
});

// Download and install mods
ipcMain.handle('install-mods', async (event, { gamePath, selectedMods, openModloader, gameId }) => {
  try {
    // Input validation
    if (!gamePath || typeof gamePath !== 'string') {
      throw new Error('Invalid game path provided');
    }
    if (!Array.isArray(selectedMods)) {
      throw new Error('Invalid mods selection provided');
    }
    
    if (!gameId) {
      gameId = currentGameId;
    }
    
    if (!gameId || !GAMES_CONFIG[gameId]) {
      throw new Error('Invalid game ID');
    }
    
    const gameConfig = GAMES_CONFIG[gameId];

    if (!await validateGamePath(gamePath, gameConfig)) {
      throw new Error('Invalid game installation path');
    }

    let orderedModIds = [...selectedMods];
    if (gameId === 'heroes') {
      const order = ['heroes_fixed_edition', 'reloaded_ii', 'heroes_graphics_essentials', 'heroes_controller_base', 'heroes_controller_custom'];
      orderedModIds.sort((a, b) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });
    }

    const modsPath = path.join(gamePath, gameConfig.defaultModsPath);
    
    // Create mods directory if it doesn't exist
    await fs.mkdir(modsPath, { recursive: true });

    // Download and install mod manager first (if configured)
    if (gameConfig.modManagerUrl) {
      event.sender.send('install-progress', { 
        status: 'downloading', 
        message: `Downloading ${gameConfig.name} Mod Manager...`, 
        progress: 0 
      });
      
      await downloadModManager(gamePath, gameConfig);
    }

    // Download and install selected mods
    let completed = 0;
    const total = selectedMods.length;

    for (const modId of orderedModIds) {
      const mod = gameConfig.mods.find(m => m.id === modId);
      if (!mod) continue;

      event.sender.send('install-progress', { 
        status: 'downloading', 
        message: `Downloading ${mod.name}...`, 
        progress: Math.round((completed / total) * 100) 
      });

      if (mod.id === 'sa2_mod_loader' && gameId === 'sa2') {
        // Mod loader is installed with the mod manager, skip separate download
        console.log(`Skipping separate download for ${mod.name} - included with mod manager`);
      } else if (mod.manualDownloadOnly) {
        event.sender.send('install-progress', {
          status: 'installing',
          message: `${mod.name}: skipped auto-download (use GameBanana alternate mirrors and 7-Zip per mod description).`,
          progress: Math.round((completed / total) * 100)
        });
        console.log(`Skipping auto-download for ${mod.name} (manualDownloadOnly)`);
      } else if (mod.githubRelease) {
        await downloadModFromGithubRelease(mod, gamePath);
      } else if (mod.gameBananaId) {
        await downloadModFromGameBanana(mod, modsPath, gamePath);
      } else if (mod.downloadUrl) {
        console.log(`Direct download URL configured for ${mod.name}, but not implemented yet`);
      } else {
        console.log(`No download method configured for ${mod.name}, skipping`);
      }

      completed++;
      const progressNote = mod.manualDownloadOnly
        ? `${mod.name}: manual install (see description)`
        : `Installed ${mod.name}`;
      event.sender.send('install-progress', {
        status: 'installing',
        message: progressNote,
        progress: Math.round((completed / total) * 100)
      });
    }

    // Configure mods (if mod manager is used)
    if (gameConfig.modManagerUrl) {
      event.sender.send('install-progress', { 
        status: 'configuring', 
        message: 'Configuring mods...', 
        progress: 100 
      });

      if (!gameConfig.skipConfigureModsIni) {
        await configureModsIni(gamePath, selectedMods, gameConfig);
      }

      // Open mod manager if requested
      if (openModloader && gameConfig.modManagerUrl) {
        const modManagerExe =
          gameConfig.modManagerExeFile || (gameId === 'sa2' ? 'SA2ModManager.exe' : 'ModManager.exe');
        const modManagerDir = gameConfig.modManagerInstallDirRelativeToGame
          ? path.join(gamePath, gameConfig.modManagerInstallDirRelativeToGame)
          : gamePath;
        const modManagerPath = path.join(modManagerDir, modManagerExe);
        try {
          // Check if the file exists
          await fs.access(modManagerPath);
          // Open the mod manager
          shell.openPath(modManagerPath);
          console.log(`Opened ${gameConfig.name} Mod Manager`);
        } catch (error) {
          console.error('Failed to open mod manager:', error);
          // Don't fail the installation if we can't open the mod manager
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Installation error:', error);
    return { success: false, error: error.message };
  }
});

// Helper Functions

async function findSteamGame(gameConfig) {
  if (!gameConfig || !gameConfig.steamFolderName) {
    return null;
  }
  
  try {
    // Common Steam installation paths
    const steamPaths = [
      `C:\\Program Files (x86)\\Steam\\steamapps\\common\\${gameConfig.steamFolderName}`,
      `C:\\Program Files\\Steam\\steamapps\\common\\${gameConfig.steamFolderName}`,
      `D:\\Steam\\steamapps\\common\\${gameConfig.steamFolderName}`,
      `D:\\SteamLibrary\\steamapps\\common\\${gameConfig.steamFolderName}`
    ];

    for (const steamPath of steamPaths) {
      if (await validateGamePath(steamPath, gameConfig)) {
        return steamPath;
      }
    }

    // Try to find Steam path from registry using Windows commands
    try {
      const { stdout } = await execAsync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath 2>nul');
      const match = stdout.match(/SteamPath\s+REG_SZ\s+(.+)/);
      if (match) {
        const steamPath = match[1].trim().replace(/\//g, '\\');
        const gamePath = path.join(steamPath, 'steamapps', 'common', gameConfig.steamFolderName);
        if (await validateGamePath(gamePath, gameConfig)) {
          return gamePath;
        }
      }
    } catch (regError) {
      console.log('Steam registry check failed:', regError.message);
    }
  } catch (error) {
    console.error('Error finding Steam game:', error);
  }
  return null;
}

async function findGameInRegistry(gameConfig) {
  if (!gameConfig || !gameConfig.name) {
    return null;
  }
  
  // Search Windows registry for game installation using Windows commands
  try {
    const gameNameLower = gameConfig.name.toLowerCase();
    const searchTerms = gameNameLower.split(' ').filter(term => term.length > 2);
    
    for (const regPath of REGISTRY_PATHS) {
      try {
        // Get all uninstall entries
        const { stdout } = await execAsync(`reg query "${regPath}" 2>nul`);
        const subKeys = stdout.match(/HKEY_LOCAL_MACHINE\\[^\r\n]+/g) || [];
        
        for (const subKey of subKeys) {
          const subKeyLower = subKey.toLowerCase();
          // Check if registry key contains game name terms
          if (searchTerms.some(term => subKeyLower.includes(term))) {
            try {
              // Query the specific key for InstallLocation
              const { stdout: valueStdout } = await execAsync(`reg query "${subKey}" /v InstallLocation 2>nul`);
              const match = valueStdout.match(/InstallLocation\s+REG_SZ\s+(.+)/);
              if (match) {
                const gamePath = match[1].trim();
                if (await validateGamePath(gamePath, gameConfig)) {
                  return gamePath;
                }
              }
            } catch (subError) {
              // Continue searching other keys
            }
          }
        }
      } catch (pathError) {
        // Continue with next registry path
      }
    }
  } catch (error) {
    console.error('Error searching registry:', error);
  }
  return null;
}

async function validateGamePath(gamePath, gameConfig) {
  if (!gamePath || !gameConfig) return false;

  try {
    const exeDir = gameConfig.executableSubdir
      ? path.join(gamePath, gameConfig.executableSubdir)
      : gamePath;
    const files = await fs.readdir(exeDir);
    const hasExe = gameConfig.executables.some(exe => files.includes(exe));
    if (!hasExe) return false;
    if (gameConfig.requiredFolderMarkers?.length) {
      for (const marker of gameConfig.requiredFolderMarkers) {
        try {
          await fs.access(path.join(gamePath, marker));
        } catch {
          return false;
        }
      }
    }
    return true;
  } catch (error) {
    return false;
  }
}

function getReloadedModsDir() {
  return path.join(process.env.APPDATA || '', 'Reloaded-II', 'Mods');
}

function pickGameBananaFile(files, mod) {
  if (!files || !files.length) return null;
  let list = files.filter((f) => f._sFile && f._bHasContents !== false);
  list = list.filter((f) => !/releasemetadata\.json$/i.test(f._sFile));
  if (mod.gameBananaFileIncludes) {
    const inc = mod.gameBananaFileIncludes.toLowerCase();
    const filtered = list.filter((f) => f._sFile.toLowerCase().includes(inc));
    if (filtered.length) list = filtered;
  }
  const nonArchived = list.filter((f) => !f._bIsArchived);
  if (nonArchived.length) list = nonArchived;
  list.sort((a, b) => (b._tsDateAdded || 0) - (a._tsDateAdded || 0));
  return list[0] || files[0];
}

async function promoteDirectoryContents(sourceDir, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  if (entries.length === 1 && entries[0].isDirectory()) {
    const inner = path.join(sourceDir, entries[0].name);
    const innerNames = await fs.readdir(inner);
    for (const name of innerNames) {
      await fs.cp(path.join(inner, name), path.join(destDir, name), { recursive: true, force: true });
    }
  } else {
    for (const ent of entries) {
      await fs.cp(path.join(sourceDir, ent.name), path.join(destDir, ent.name), { recursive: true, force: true });
    }
  }
}

async function extractZipBufferToDir(buffer, destDir) {
  const zip = new AdmZip(buffer);
  const tempDir = path.join(destDir, `_zip_temp_${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });
  zip.extractAllTo(tempDir, true);
  await promoteDirectoryContents(tempDir, destDir);
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function extract7zArchiveToDir(archivePath, destDir) {
  const tempDir = path.join(path.dirname(archivePath), `_7z_temp_${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });
  const sevenZipPath = get7zaPath();
  await fs.access(sevenZipPath);
  const sanitizedSeven = sevenZipPath.replace(/"/g, '');
  const sanitizedArchive = archivePath.replace(/"/g, '');
  const sanitizedTemp = tempDir.replace(/"/g, '');
  await execAsync(`"${sanitizedSeven}" x "${sanitizedArchive}" -o"${sanitizedTemp}" -y`);
  await promoteDirectoryContents(tempDir, destDir);
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function downloadGithubReleaseAsset(mod) {
  const gr = mod.githubRelease;
  if (!gr?.owner || !gr?.repo) {
    throw new Error('Invalid githubRelease configuration');
  }
  const apiUrl = `https://api.github.com/repos/${gr.owner}/${gr.repo}/releases/latest`;
  const releaseResponse = await axios.get(apiUrl, {
    headers: {
      'User-Agent': 'TheDefinitizer/1.0',
      Accept: 'application/vnd.github.v3+json'
    },
    timeout: 30000
  });
  const assets = releaseResponse.data.assets || [];
  let asset = null;
  if (gr.assetName) {
    asset = assets.find((a) => a.name === gr.assetName);
  }
  if (!asset && (gr.assetNameIncludes || gr.assetNameEndsWith)) {
    const includes = Array.isArray(gr.assetNameIncludes)
      ? gr.assetNameIncludes
      : gr.assetNameIncludes
        ? [gr.assetNameIncludes]
        : [];
    asset = assets.find((a) => {
      const n = a.name || '';
      const okInc = !includes.length || includes.every((s) => n.includes(s));
      const okEnd = !gr.assetNameEndsWith || n.endsWith(gr.assetNameEndsWith);
      return okInc && okEnd;
    });
  }
  if (!asset) {
    throw new Error(`No matching GitHub release asset for ${mod.name}`);
  }
  const downloadResponse = await axios.get(asset.browser_download_url, {
    responseType: 'arraybuffer',
    headers: { 'User-Agent': 'TheDefinitizer/1.0' },
    timeout: 300000
  });
  return { buffer: Buffer.from(downloadResponse.data), fileName: asset.name };
}

async function downloadModFromGithubRelease(mod, gamePath) {
  const { buffer, fileName } = await downloadGithubReleaseAsset(mod);
  const lower = fileName.toLowerCase();

  let destDir;
  if (mod.installTarget === 'reloadedPortable') {
    destDir = path.join(gamePath, 'Reloaded-II');
  } else if (mod.installTarget === 'reloadedMods') {
    destDir = getReloadedModsDir();
  } else {
    destDir = path.join(gamePath, mod.id);
  }

  await fs.mkdir(destDir, { recursive: true });

  const scratch = path.join(gamePath, `.def_scratch_${mod.id}_${Date.now()}`);
  await fs.mkdir(scratch, { recursive: true });
  try {
    const archivePath = path.join(scratch, fileName);
    await fs.writeFile(archivePath, buffer);
    if (lower.endsWith('.zip')) {
      const buf = await fs.readFile(archivePath);
      await extractZipBufferToDir(buf, destDir);
    } else if (lower.endsWith('.7z')) {
      await extract7zArchiveToDir(archivePath, destDir);
    } else {
      throw new Error(`Unsupported GitHub asset format: ${fileName}`);
    }
  } finally {
    await fs.rm(scratch, { recursive: true, force: true }).catch(() => {});
  }
}

async function downloadModManager(gamePath, gameConfig) {
  if (!gameConfig || !gameConfig.modManagerUrl) {
    console.log('No mod manager URL configured for this game');
    return;
  }
  
  console.log(`Downloading ${gameConfig.name} Mod Manager...`);
  
  try {
    // Extract GitHub repo from URL (assuming GitHub releases)
    const urlMatch = gameConfig.modManagerUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!urlMatch) {
      throw new Error('Invalid mod manager URL format');
    }
    
    const [, owner, repo] = urlMatch;
    const repoUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    const releaseResponse = await axios.get(repoUrl, {
      headers: {
        'User-Agent': 'SA2ModInstaller/1.0',
        'Accept': 'application/vnd.github.v3+json'
      },
      timeout: 30000
    });

    const release = releaseResponse.data;
    console.log(`Found ${gameConfig.name} Mod Manager ${release.tag_name}`);

    const targetDir = gameConfig.modManagerInstallDirRelativeToGame
      ? path.join(gamePath, gameConfig.modManagerInstallDirRelativeToGame)
      : gamePath;
    await fs.mkdir(targetDir, { recursive: true });

    let windowsAsset = null;
    if (gameConfig.modManagerExeFile) {
      windowsAsset = release.assets.find((a) => a.name === gameConfig.modManagerExeFile);
    }
    if (!windowsAsset) {
      windowsAsset = release.assets.find(
        (asset) =>
          asset.name.toLowerCase().includes('windows') ||
          asset.name.toLowerCase().endsWith('.exe') ||
          asset.name.toLowerCase().endsWith('.zip') ||
          asset.name.toLowerCase().endsWith('.7z')
      );
    }

    if (!windowsAsset) {
      throw new Error('Could not find Windows executable in GitHub releases');
    }

    console.log(`Downloading ${windowsAsset.name} (${Math.round(windowsAsset.size / 1024 / 1024)} MB)`);

    const downloadResponse = await axios.get(windowsAsset.browser_download_url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'TheDefinitizer/1.0'
      },
      timeout: 300000,
      onDownloadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          console.log(`Mod Manager download progress: ${percentCompleted}%`);
        }
      }
    });

    const fileName = windowsAsset.name.toLowerCase();
    const modManagerExe =
      gameConfig.modManagerExeFile || (gameConfig.id === 'sa2' ? 'SA2ModManager.exe' : 'ModManager.exe');

    if (fileName.endsWith('.exe')) {
      const modManagerPath = path.join(targetDir, modManagerExe);
      await fs.writeFile(modManagerPath, Buffer.from(downloadResponse.data));
      console.log(`${gameConfig.name} Mod Manager executable installed`);
    } else if (fileName.endsWith('.zip')) {
      console.log(`Extracting ${gameConfig.name} Mod Manager from ZIP...`);
      const tempZipPath = path.join(targetDir, 'temp_modmanager.zip');
      await fs.writeFile(tempZipPath, Buffer.from(downloadResponse.data));
      const buf = await fs.readFile(tempZipPath);
      await extractZipBufferToDir(buf, targetDir);
      await fs.unlink(tempZipPath).catch(() => {});
    } else if (fileName.endsWith('.7z')) {
      const temp7zPath = path.join(targetDir, 'temp_modmanager.7z');
      await fs.writeFile(temp7zPath, Buffer.from(downloadResponse.data));
      await extract7zArchiveToDir(temp7zPath, targetDir);
      await fs.unlink(temp7zPath).catch(() => {});
    } else {
      throw new Error(`Unsupported mod manager file format: ${fileName}`);
    }

    if (!gameConfig.skipModsIniBootstrap) {
      const modsIni = path.join(gamePath, 'mods.ini');
      try {
        await fs.access(modsIni);
      } catch {
        await fs.writeFile(
          modsIni,
          `; ${gameConfig.name} Mods Configuration
[Main]
EnabledMods=
UpdateCheck=1

[ModManager]
Theme=Dark
`
        );
        console.log('Created mods.ini configuration file');
      }
    }
    
    console.log(`${gameConfig.name} Mod Manager installation completed successfully`);
    
  } catch (error) {
    console.error('Error downloading SA2 Mod Manager:', error);
    
    if (error.response) {
      console.error(`GitHub API Status: ${error.response.status}`);
      if (error.response.status === 403) {
        throw new Error('GitHub API rate limit exceeded. Please try again later.');
      } else if (error.response.status === 404) {
        throw new Error('SA Mod Manager repository not found. Please check the repository URL.');
      }
    }
    
    throw new Error(`Failed to download SA2 Mod Manager: ${error.message}`);
  }
}

async function downloadModFromGameBanana(mod, modsPath, gamePath) {
  if (!mod.gameBananaId) {
    console.log(`No GameBanana ID for ${mod.name}, skipping download`);
    return;
  }

  try {
    const apiUrl = `https://gamebanana.com/apiv8/Mod/${mod.gameBananaId}?_csvProperties=_aFiles,_sName,_idRow`;

    console.log(`Attempting to download ${mod.name} from: ${apiUrl}`);

    const modInfo = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'TheDefinitizer/1.0',
        Accept: 'application/json',
      },
      timeout: 30000
    });

    if (!modInfo.data || !modInfo.data._aFiles || !modInfo.data._aFiles.length) {
      throw new Error(`No download files available for ${mod.name}`);
    }

    const fileInfo = pickGameBananaFile(modInfo.data._aFiles, mod);
    if (!fileInfo || !fileInfo._sDownloadUrl) {
      throw new Error(`Could not pick a download file for ${mod.name}`);
    }

    const downloadUrl = String(fileInfo._sDownloadUrl).replace(/\\\//g, '/');
    console.log(`Download URL found: ${downloadUrl}`);

    const response = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'TheDefinitizer/1.0',
        Accept: 'application/octet-stream, application/zip, */*',
      },
      maxRedirects: 5,
      timeout: 120000,
      onDownloadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          console.log(`Download progress for ${mod.name}: ${percentCompleted}%`);
        }
      }
    });

    const buffer = Buffer.from(response.data);
    const magicBytes = buffer.slice(0, 6);
    const zipMagic = Buffer.from([0x50, 0x4b]);
    const sevenZMagic = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
    const isZipFile = buffer.slice(0, 2).equals(zipMagic);
    const is7zFile = magicBytes.equals(sevenZMagic);

    if (!isZipFile && !is7zFile) {
      const contentStr = buffer.toString('utf8', 0, Math.min(500, buffer.length));
      if (contentStr.includes('<html') || contentStr.includes('<!DOCTYPE')) {
        throw new Error(`Download appears to be HTML page instead of archive file. The mod may require manual download.`);
      }
      throw new Error(`Downloaded file is not a supported archive format (ZIP/7z). Content-Type: ${response.headers['content-type']}`);
    }

    const installTarget = mod.installTarget || 'mods';
    let destDir;
    if (installTarget === 'gameRoot') {
      destDir = gamePath;
    } else if (installTarget === 'reloadedMods') {
      destDir = getReloadedModsDir();
    } else {
      destDir = path.join(modsPath, mod.id);
    }
    await fs.mkdir(destDir, { recursive: true });

    const scratch = path.join(gamePath, `.def_scratch_gb_${mod.id}_${Date.now()}`);
    await fs.mkdir(scratch, { recursive: true });
    try {
      if (isZipFile) {
        await extractZipBufferToDir(buffer, destDir);
      } else {
        const archivePath = path.join(scratch, `${mod.id}.7z`);
        await fs.writeFile(archivePath, buffer);
        await extract7zArchiveToDir(archivePath, destDir);
      }
    } finally {
      await fs.rm(scratch, { recursive: true, force: true }).catch(() => {});
    }

    console.log(`Successfully installed ${mod.name}`);
  } catch (error) {
    console.error(`Error downloading ${mod.name}:`, error.message);

    if (error.response) {
      console.error(`HTTP Status: ${error.response.status}`);
      console.error(`Response data:`, error.response.data);

      if (error.response.status === 400) {
        throw new Error(`Invalid mod ID ${mod.gameBananaId} for ${mod.name}. Please check the GameBanana mod ID.`);
      } else if (error.response.status === 404) {
        throw new Error(`Mod ${mod.name} (ID: ${mod.gameBananaId}) not found on GameBanana.`);
      } else if (error.response.status === 429) {
        throw new Error(`Rate limited by GameBanana. Please try again later.`);
      }
    }

    throw new Error(`Failed to download ${mod.name}: ${error.message}`);
  }
}

async function configureModsIni(gamePath, selectedMods, gameConfig) {
  if (!gameConfig) {
    return;
  }
  
  // Create or update the mods configuration file
  const configPath = path.join(gamePath, 'mods.ini');
  
  let existingConfig = '';
  let existingMods = new Map();
  
  // Try to read existing config to preserve it
  try {
    existingConfig = await fs.readFile(configPath, 'utf8');
    
    // Parse existing mod entries (simple INI parser)
    const lines = existingConfig.split('\n');
    let currentSection = '';
    let currentMod = {};
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        // Save previous mod if exists
        if (currentSection && currentSection !== 'ModManager' && currentSection !== 'Main') {
          existingMods.set(currentSection, currentMod);
        }
        currentSection = trimmed.slice(1, -1);
        currentMod = {};
      } else if (trimmed && !trimmed.startsWith(';') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').trim();
        currentMod[key.trim()] = value;
      }
    }
    
    // Save last mod
    if (currentSection && currentSection !== 'ModManager' && currentSection !== 'Main') {
      existingMods.set(currentSection, currentMod);
    }
  } catch (error) {
    // File doesn't exist or can't be read, start fresh
    existingConfig = '';
  }
  
  // Build new config
  let config = '[ModManager]\n';
  config += 'EnabledMods=';
  
  // Add enabled mods
  const enabledMods = selectedMods.map(modId => {
    const mod = gameConfig.mods.find(m => m.id === modId);
    return mod ? mod.id : null;
  }).filter(Boolean);
  
  config += enabledMods.join(',') + '\n\n';
  
  // Add mod entries (update existing or add new)
  for (const modId of selectedMods) {
    const mod = gameConfig.mods.find(m => m.id === modId);
    if (mod) {
      config += `[${mod.id}]\n`;
      config += `Name=${mod.name}\n`;
      config += `Enabled=1\n`;
      
      // Preserve other settings from existing config if present
      if (existingMods.has(mod.id)) {
        const existingMod = existingMods.get(mod.id);
        for (const [key, value] of Object.entries(existingMod)) {
          if (key !== 'Name' && key !== 'Enabled') {
            config += `${key}=${value}\n`;
          }
        }
      }
      
      config += '\n';
    }
  }
  
  // Preserve other mods that weren't selected but exist in config
  for (const [modId, modData] of existingMods.entries()) {
    if (!selectedMods.includes(modId)) {
      config += `[${modId}]\n`;
      for (const [key, value] of Object.entries(modData)) {
        config += `${key}=${value}\n`;
      }
      config += '\n';
    }
  }
  
  await fs.writeFile(configPath, config);
}

// Test GameBanana API connection (for debugging)
ipcMain.handle('test-api', async (event, modId) => {
  try {
    if (!modId || (typeof modId !== 'number' && typeof modId !== 'string')) {
      throw new Error('Invalid mod ID provided');
    }
    const apiUrl = `https://gamebanana.com/apiv8/Mod/${modId}?_csvProperties=_aFiles,_sName,_idRow`;
    const response = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'TheDefinitizer/1.0',
        'Accept': 'application/json',
      },
      timeout: 10000
    });
    
    console.log(`API test successful for mod ${modId}`);
    console.log('Response keys:', Object.keys(response.data));
    
    if (response.data._aFiles) {
      console.log(`Found ${response.data._aFiles.length} file(s)`);
      console.log('First file:', response.data._aFiles[0]);
    }
    
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`API test failed for mod ${modId}:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return { success: false, error: error.message, response: error.response?.data };
  }
});

// Open external links
ipcMain.handle('open-external', async (event, url) => {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid URL provided');
  }
  // Basic URL validation
  try {
    new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }
  await shell.openExternal(url);
});

// Get app version
ipcMain.handle('get-version', async () => {
  return packageJson.version;
});
