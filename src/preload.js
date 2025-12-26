const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  
  // Tab session management
  createTabSession: (tabId) => ipcRenderer.invoke('create-tab-session', tabId),
  removeTabSession: (tabId) => ipcRenderer.send('remove-tab-session', tabId),
  
  // Tab persistence
  getStoredTabs: () => ipcRenderer.invoke('get-stored-tabs'),
  saveTabs: (tabs) => ipcRenderer.send('save-tabs', tabs)
});
