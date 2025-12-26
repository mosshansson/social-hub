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
  saveTabs: (tabs) => ipcRenderer.send('save-tabs', tabs),
  
  // External links
  openExternal: (url) => ipcRenderer.send('open-external', url),
  
  // Cookie import
  importBrowserCookies: (partition, domain) => ipcRenderer.invoke('import-browser-cookies', partition, domain),
  
  // Email client APIs
  getEmailPresets: () => ipcRenderer.invoke('get-email-presets'),
  testEmailConnection: (config) => ipcRenderer.invoke('test-email-connection', config),
  connectEmail: (tabId, config) => ipcRenderer.invoke('connect-email', tabId, config),
  getEmails: (tabId, folder, limit) => ipcRenderer.invoke('get-emails', tabId, folder, limit),
  getMailboxes: (tabId) => ipcRenderer.invoke('get-mailboxes', tabId),
  sendEmail: (tabId, to, subject, text, html) => ipcRenderer.invoke('send-email', tabId, to, subject, text, html),
  markEmailRead: (tabId, uid) => ipcRenderer.invoke('mark-email-read', tabId, uid),
  deleteEmail: (tabId, uid) => ipcRenderer.invoke('delete-email', tabId, uid),
  disconnectEmail: (tabId) => ipcRenderer.send('disconnect-email', tabId),
  getEmailConfig: (tabId) => ipcRenderer.invoke('get-email-config', tabId)
});
