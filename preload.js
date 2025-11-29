const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // Game selection
  getGamesList: () => ipcRenderer.invoke('get-games-list'),
  setCurrentGame: (gameId) => ipcRenderer.invoke('set-current-game', gameId),
  getCurrentGame: () => ipcRenderer.invoke('get-current-game'),
  
  // Game detection
  detectGame: (gameId) => ipcRenderer.invoke('detect-game', gameId),
  browseGameFolder: (gameId) => ipcRenderer.invoke('browse-game-folder', gameId),
  validateGamePath: (path, gameId) => ipcRenderer.invoke('validate-game-path', path, gameId),
  
  // Mods
  getModsList: (gameId) => ipcRenderer.invoke('get-mods-list', gameId),
  installMods: (data) => ipcRenderer.invoke('install-mods', data),
  
  // Utilities
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  testApi: (modId) => ipcRenderer.invoke('test-api', modId),
  getVersion: () => ipcRenderer.invoke('get-version'),
  
  // Listen for progress updates
  onInstallProgress: (callback) => {
    ipcRenderer.on('install-progress', (event, data) => callback(data));
  },
  
  // Remove listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});
