const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  detectGame: () => ipcRenderer.invoke('detect-game'),
  browseGameFolder: () => ipcRenderer.invoke('browse-game-folder'),
  validateGamePath: (path) => ipcRenderer.invoke('validate-game-path', path),
  getModsList: () => ipcRenderer.invoke('get-mods-list'),
  installMods: (data) => ipcRenderer.invoke('install-mods', data),
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
