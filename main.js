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

// Load package.json to get version
const packageJson = require('./package.json');

let mainWindow;

// Configuration
const CONFIG = {
  gameExecutables: ['sonic2app.exe', 'Sonic Adventure 2.exe'],
  modManagerUrl: 'https://github.com/X-Hax/SA-Mod-Manager/releases/latest',
  defaultModsPath: 'mods',
  steamAppId: 213610,
  registryPaths: [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
  ]
};

// Mod list with GameBanana IDs (to be configured)
const MODS_LIST = [
  {
    id: 'sa2_mod_loader',
    name: 'SA2 Mod Loader',
    description: 'Essential mod loader for Sonic Adventure 2 and SADX. Required for all other mods.',
    required: true,
    gameBananaId: null, // Not from GameBanana - handled separately
    downloadUrl: 'https://github.com/X-Hax/SA-Mod-Manager/releases/latest', // Official source
    preview: 'assets/previews/modloader.png'
  },
  {
    id: 'sasdl',
    name: 'SASDL',
    description: 'Common prerequisite for input based mods.',
    required: true,
    gameBananaId: 615843,
    preview: 'assets/previews/sasdl.png'
  },
  {
    id: 'render',
    name: 'Render Fix',
    description: 'Fixes various rendering issues from the PC/GC versions.',
    required: false,
    gameBananaId: 452445,
    preview: 'assets/previews/renderfix.gif'
  },
  {
    id: 'cutscene',
    name: 'Cutscene Revamp',
    description: 'Replaces most cutscenes with better quality ones that match the original game while fixing other issues. <strong>See a sample:</strong> <a href="assets/cutsceneicat/index.html" target="_blank" style="color:#fff;background:#0078d7;padding:2px 8px;border-radius:3px;text-decoration:none;font-weight:bold;">Click to open preview</a>.',
    required: false,
    gameBananaId: 48872,
    preview: 'assets/previews/cutscene.gif'
  },
  {
    id: 'hdgui',
    name: 'HD GUI',
    description: 'Replaces the GUI with a high resolution one.',
    required: false,
    gameBananaId: 33171,
    preview: 'assets/previews/hdgui.gif'
  },
  {
    id: 'enhancedchaoworld',
    name: 'Chao World Extended',
    description: 'Improves the Chao World with new features and content.',
    required: false,
    gameBananaId: 48840,
    preview: 'assets/previews/chaoext.gif'
  },
  {
    id: 'chaoworldextended',
    name: 'Enhanced Chao World',
    description: 'Enhances the Chao World with more features and content. (compatible with Enhanced Chao World)',
    required: false,
    gameBananaId: 48915,
    preview: 'assets/previews/chaoext.gif'
  },
  {
    id: 'character',
    name: 'Character Select Plus',
    description: 'Play as any character in any stage.',
    required: false,
    gameBananaId: 33170,
    preview: 'assets/previews/character.gif'
  },
  {
    id: 'volume',
    name: 'Volume Control',
    description: 'Adjusts the volume mixing of the game.',
    required: false,
    gameBananaId: 381193,
    preview: 'assets/previews/volume.png'
  },
  {
    id: 'input',
    name: 'Input Fix',
    description: 'Fixes the input system of the game. adds support for many more controllers.',
    required: false,
    gameBananaId: 515637,
    preview: 'assets/previews/input.gif'
  },
];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 640,
    height: 680,
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

// Detect SA2 installation
ipcMain.handle('detect-game', async () => {
  try {
    // Check Steam installation
    const steamPath = await findSteamGame();
    if (steamPath) {
      return { found: true, path: steamPath, method: 'steam' };
    }

    // Check registry for other installations
    const registryPath = await findGameInRegistry();
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
ipcMain.handle('browse-game-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Sonic Adventure 2 Installation Folder'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const gamePath = result.filePaths[0];
    const isValid = await validateGamePath(gamePath);
    if (isValid) {
      return { found: true, path: gamePath };
    } else {
      return { found: false, error: 'Invalid game folder. Could not find game executable.' };
    }
  }
  return { found: false };
});

// Validate game installation path
ipcMain.handle('validate-game-path', async (event, gamePath) => {
  return await validateGamePath(gamePath);
});

// Get mods list
ipcMain.handle('get-mods-list', async () => {
  return MODS_LIST;
});

// Download and install mods
ipcMain.handle('install-mods', async (event, { gamePath, selectedMods, openModloader }) => {
  try {
    const modsPath = path.join(gamePath, CONFIG.defaultModsPath);
    
    // Create mods directory if it doesn't exist
    await fs.mkdir(modsPath, { recursive: true });

    // Download and install mod manager first
    event.sender.send('install-progress', { 
      status: 'downloading', 
      message: 'Downloading SA2 Mod Manager...', 
      progress: 0 
    });
    
    await downloadModManager(gamePath);

    // Download and install selected mods
    let completed = 0;
    const total = selectedMods.length;

    for (const modId of selectedMods) {
      const mod = MODS_LIST.find(m => m.id === modId);
      if (!mod) continue;

      event.sender.send('install-progress', { 
        status: 'downloading', 
        message: `Downloading ${mod.name}...`, 
        progress: Math.round((completed / total) * 100) 
      });

      if (mod.id === 'sa2_mod_loader') {
        // Mod loader is installed with the mod manager, skip separate download
        console.log(`Skipping separate download for ${mod.name} - included with mod manager`);
      } else if (mod.gameBananaId) {
        await downloadModFromGameBanana(mod, modsPath);
      } else {
        console.log(`No download method configured for ${mod.name}, skipping`);
      }

      completed++;
      event.sender.send('install-progress', { 
        status: 'installing', 
        message: `Installed ${mod.name}`, 
        progress: Math.round((completed / total) * 100) 
      });
    }

    // Configure mods
    event.sender.send('install-progress', { 
      status: 'configuring', 
      message: 'Configuring mods...', 
      progress: 100 
    });

    await configureModsIni(gamePath, selectedMods);

    // Open mod manager if requested
    if (openModloader) {
      const modManagerPath = path.join(gamePath, 'SA2ModManager.exe');
      try {
        // Check if the file exists
        await fs.access(modManagerPath);
        // Open the mod manager
        shell.openPath(modManagerPath);
        console.log('Opened SA2 Mod Manager');
      } catch (error) {
        console.error('Failed to open mod manager:', error);
        // Don't fail the installation if we can't open the mod manager
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Installation error:', error);
    return { success: false, error: error.message };
  }
});

// Helper Functions

async function findSteamGame() {
  try {
    // Common Steam installation paths
    const steamPaths = [
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Sonic Adventure 2',
      'C:\\Program Files\\Steam\\steamapps\\common\\Sonic Adventure 2',
      'D:\\Steam\\steamapps\\common\\Sonic Adventure 2',
      'D:\\SteamLibrary\\steamapps\\common\\Sonic Adventure 2'
    ];

    for (const steamPath of steamPaths) {
      if (await validateGamePath(steamPath)) {
        return steamPath;
      }
    }

    // Try to find Steam path from registry using Windows commands
    try {
      const { stdout } = await execAsync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath 2>nul');
      const match = stdout.match(/SteamPath\s+REG_SZ\s+(.+)/);
      if (match) {
        const steamPath = match[1].trim().replace(/\//g, '\\');
        const gamePath = path.join(steamPath, 'steamapps', 'common', 'Sonic Adventure 2');
        if (await validateGamePath(gamePath)) {
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

async function findGameInRegistry() {
  // Search Windows registry for SA2 installation using Windows commands
  try {
    const registryPaths = [
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
    ];

    for (const regPath of registryPaths) {
      try {
        // Get all uninstall entries
        const { stdout } = await execAsync(`reg query "${regPath}" 2>nul`);
        const subKeys = stdout.match(/HKEY_LOCAL_MACHINE\\[^\r\n]+/g) || [];
        
        for (const subKey of subKeys) {
          if (subKey.toLowerCase().includes('sonic') && subKey.toLowerCase().includes('adventure')) {
            try {
              // Query the specific key for InstallLocation
              const { stdout: valueStdout } = await execAsync(`reg query "${subKey}" /v InstallLocation 2>nul`);
              const match = valueStdout.match(/InstallLocation\s+REG_SZ\s+(.+)/);
              if (match) {
                const gamePath = match[1].trim();
                if (await validateGamePath(gamePath)) {
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

async function validateGamePath(gamePath) {
  if (!gamePath) return false;
  
  try {
    const files = await fs.readdir(gamePath);
    return CONFIG.gameExecutables.some(exe => files.includes(exe));
  } catch (error) {
    return false;
  }
}

async function downloadModManager(gamePath) {
  console.log('Downloading SA2 Mod Manager from GitHub...');
  
  try {
    // Get latest release from GitHub API
    const repoUrl = 'https://api.github.com/repos/X-Hax/SA-Mod-Manager/releases/latest';
    const releaseResponse = await axios.get(repoUrl, {
      headers: {
        'User-Agent': 'SA2ModInstaller/1.0',
        'Accept': 'application/vnd.github.v3+json'
      },
      timeout: 30000
    });

    const release = releaseResponse.data;
    console.log(`Found SA Mod Manager ${release.tag_name}`);
    
    // Find the Windows executable in assets
    const windowsAsset = release.assets.find(asset => 
      asset.name.toLowerCase().includes('windows') || 
      asset.name.toLowerCase().endsWith('.exe') ||
      asset.name.toLowerCase().endsWith('.zip')
    );

    if (!windowsAsset) {
      throw new Error('Could not find Windows executable in GitHub releases');
    }

    console.log(`Downloading ${windowsAsset.name} (${Math.round(windowsAsset.size / 1024 / 1024)} MB)`);
    
    // Download the mod manager
    const downloadResponse = await axios.get(windowsAsset.browser_download_url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'SA2ModInstaller/1.0'
      },
      timeout: 300000, // 5 minutes for large download
      onDownloadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          console.log(`Mod Manager download progress: ${percentCompleted}%`);
        }
      }
    });

    // Handle different file types
    const fileName = windowsAsset.name.toLowerCase();
    
    if (fileName.endsWith('.exe')) {
      // Direct executable
      const modManagerPath = path.join(gamePath, 'SA2ModManager.exe');
      await fs.writeFile(modManagerPath, downloadResponse.data);
      console.log('SA2 Mod Manager executable installed');
      
    } else if (fileName.endsWith('.zip')) {
      // ZIP archive - extract it
      console.log('Extracting SA2 Mod Manager from ZIP...');
      
      const tempZipPath = path.join(gamePath, 'temp_modmanager.zip');
      await fs.writeFile(tempZipPath, downloadResponse.data);
      
      const zip = new AdmZip(tempZipPath);
      const entries = zip.getEntries();
      
      // Find the main executable
      const exeEntry = entries.find(entry => entry.entryName.toLowerCase().endsWith('.exe'));
      if (exeEntry) {
        const modManagerPath = path.join(gamePath, 'SA2ModManager.exe');
        await fs.writeFile(modManagerPath, exeEntry.getData());
        console.log(`Extracted ${exeEntry.entryName} as SA2ModManager.exe`);
      }
      
      // Extract other important files (DLLs, etc.)
      for (const entry of entries) {
        if (!entry.isDirectory) {
          const entryPath = path.join(gamePath, path.basename(entry.entryName));
          // Don't overwrite the main executable we already renamed
          if (!entry.entryName.toLowerCase().endsWith('.exe') || !exeEntry) {
            await fs.writeFile(entryPath, entry.getData());
            console.log(`Extracted ${entry.entryName}`);
          }
        }
      }
      
      // Clean up temp file
      await fs.unlink(tempZipPath);
      
    } else {
      throw new Error(`Unsupported mod manager file format: ${fileName}`);
    }

    // Create basic mods.ini if it doesn't exist
    const modsIni = path.join(gamePath, 'mods.ini');
    try {
      await fs.access(modsIni);
    } catch {
      await fs.writeFile(modsIni, `; SA2 Mods Configuration
[Main]
EnabledMods=
UpdateCheck=1

[ModManager]
Theme=Dark
`);
      console.log('Created mods.ini configuration file');
    }
    
    console.log('SA2 Mod Manager installation completed successfully');
    
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

async function downloadModFromGameBanana(mod, modsPath) {
  if (!mod.gameBananaId) {
    console.log(`No GameBanana ID for ${mod.name}, skipping download`);
    return;
  }

  try {
    // GameBanana API endpoint with required properties parameter
    const apiUrl = `https://gamebanana.com/apiv8/Mod/${mod.gameBananaId}?_csvProperties=_aFiles,_sName,_idRow`;
    
    console.log(`Attempting to download ${mod.name} from: ${apiUrl}`);
    
    // Get mod info with proper headers
    const modInfo = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'SA2ModInstaller/1.0',
        'Accept': 'application/json',
      },
      timeout: 30000
    });
    
    console.log(`Mod info retrieved for ${mod.name}`);
    
    // Find download URL (check for _aFiles array)
    if (modInfo.data && modInfo.data._aFiles && modInfo.data._aFiles.length > 0) {
      const fileInfo = modInfo.data._aFiles[0];
      const downloadUrl = fileInfo._sDownloadUrl;
      
      console.log(`Download URL found: ${downloadUrl}`);
      
      // Download the mod with better handling
      const response = await axios.get(downloadUrl, { 
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'SA2ModInstaller/1.0',
          'Accept': 'application/octet-stream, application/zip, */*',
        },
        maxRedirects: 5,
        timeout: 120000, // 2 minutes for download
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            console.log(`Download progress for ${mod.name}: ${percentCompleted}%`);
          }
        }
      });

      console.log(`Downloaded ${response.data.byteLength} bytes for ${mod.name}`);
      console.log(`Content-Type: ${response.headers['content-type']}`);
      
      // Check file type by magic bytes
      const buffer = Buffer.from(response.data);
      const magicBytes = buffer.slice(0, 6);
      
      const zipMagic = Buffer.from([0x50, 0x4b]); // PK (ZIP signature)
      const sevenZMagic = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]); // 7z signature
      
      const isZipFile = buffer.slice(0, 2).equals(zipMagic);
      const is7zFile = magicBytes.equals(sevenZMagic);
      
      console.log(`File type - ZIP: ${isZipFile}, 7z: ${is7zFile}, Magic bytes: ${magicBytes.toString('hex')}`);
      
      if (!isZipFile && !is7zFile) {
        // Check if it's an HTML redirect page
        const contentStr = buffer.toString('utf8', 0, Math.min(500, buffer.length));
        
        if (contentStr.includes('<html') || contentStr.includes('<!DOCTYPE')) {
          throw new Error(`Download appears to be HTML page instead of archive file. The mod may require manual download.`);
        }
        
        console.log('File content start:', contentStr.substring(0, 200));
        throw new Error(`Downloaded file is not a supported archive format (ZIP/7z). Content-Type: ${response.headers['content-type']}`);
      }

      // Save and extract based on file type
      const modFolder = path.join(modsPath, mod.id);
      await fs.mkdir(modFolder, { recursive: true });
      
      console.log(`Extracting ${mod.name}...`);
      
      if (isZipFile) {
        // Handle ZIP files
        const zipPath = path.join(modsPath, `${mod.id}.zip`);
        await fs.writeFile(zipPath, response.data);
        
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(modFolder, true);
        
        // Clean up zip file
        await fs.unlink(zipPath);
        
      } else if (is7zFile) {
        // Handle 7z files using 7zip-bin
        const archivePath = path.join(modsPath, `${mod.id}.7z`);
        await fs.writeFile(archivePath, response.data);
        
        try {
          // Extract using 7zip-bin
          const cmd = `"${sevenBin.path7za}" x "${archivePath}" -o"${modFolder}" -y`;
          console.log(`Executing 7z command: ${cmd}`);
          
          const { stdout, stderr } = await execAsync(cmd);
          
          if (stderr && !stderr.includes('Everything is Ok')) {
            console.error('7z stderr:', stderr);
          }
          
          console.log('7z stdout:', stdout);
          
          // Clean up 7z file
          await fs.unlink(archivePath);
          
        } catch (sevenZError) {
          console.error('7z extraction failed:', sevenZError);
          // Clean up archive file
          try {
            await fs.unlink(archivePath);
          } catch {}
          throw new Error(`Failed to extract 7z archive: ${sevenZError.message}`);
        }
      }
      
      console.log(`Successfully installed ${mod.name}`);
    } else {
      console.warn(`No download files found for ${mod.name}`);
      throw new Error(`No download files available for ${mod.name}`);
    }
  } catch (error) {
    console.error(`Error downloading ${mod.name}:`, error.message);
    
    // More specific error handling
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

async function configureModsIni(gamePath, selectedMods) {
  // Create or update the mods configuration file
  const configPath = path.join(gamePath, 'mods.ini');
  
  let config = '[ModManager]\n';
  config += 'EnabledMods=';
  
  // Add enabled mods
  const enabledMods = selectedMods.map(modId => {
    const mod = MODS_LIST.find(m => m.id === modId);
    return mod ? mod.id : null;
  }).filter(Boolean);
  
  config += enabledMods.join(',') + '\n\n';
  
  // Add mod entries
  for (const modId of selectedMods) {
    const mod = MODS_LIST.find(m => m.id === modId);
    if (mod) {
      config += `[${mod.id}]\n`;
      config += `Name=${mod.name}\n`;
      config += `Enabled=1\n\n`;
    }
  }
  
  await fs.writeFile(configPath, config);
}

// Test GameBanana API connection
ipcMain.handle('test-api', async (event, modId) => {
  try {
    const apiUrl = `https://gamebanana.com/apiv8/Mod/${modId}?_csvProperties=_aFiles,_sName,_idRow`;
    const response = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'SA2ModInstaller/1.0',
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
  shell.openExternal(url);
});

// Get app version
ipcMain.handle('get-version', async () => {
  return packageJson.version;
});
