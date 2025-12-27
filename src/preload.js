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
  reconnectEmail: (tabId) => ipcRenderer.invoke('reconnect-email', tabId),
  isEmailConnected: (tabId) => ipcRenderer.invoke('is-email-connected', tabId),
  getEmails: (tabId, folder, limit) => ipcRenderer.invoke('get-emails', tabId, folder, limit),
  getMailboxes: (tabId) => ipcRenderer.invoke('get-mailboxes', tabId),
  sendEmail: (tabId, options) => ipcRenderer.invoke('send-email', tabId, options),
  markEmailRead: (tabId, uid, folder) => ipcRenderer.invoke('mark-email-read', tabId, uid, folder),
  markEmailUnread: (tabId, uid, folder) => ipcRenderer.invoke('mark-email-unread', tabId, uid, folder),
  starEmail: (tabId, uid, folder) => ipcRenderer.invoke('star-email', tabId, uid, folder),
  unstarEmail: (tabId, uid, folder) => ipcRenderer.invoke('unstar-email', tabId, uid, folder),
  archiveEmail: (tabId, uid, folder) => ipcRenderer.invoke('archive-email', tabId, uid, folder),
  trashEmail: (tabId, uid, folder) => ipcRenderer.invoke('trash-email', tabId, uid, folder),
  spamEmail: (tabId, uid, folder) => ipcRenderer.invoke('spam-email', tabId, uid, folder),
  moveEmail: (tabId, uid, destFolder, srcFolder) => ipcRenderer.invoke('move-email', tabId, uid, destFolder, srcFolder),
  deleteEmail: (tabId, uid, folder) => ipcRenderer.invoke('delete-email', tabId, uid, folder),
  disconnectEmail: (tabId) => ipcRenderer.send('disconnect-email', tabId),
  getEmailConfig: (tabId) => ipcRenderer.invoke('get-email-config', tabId)
});
