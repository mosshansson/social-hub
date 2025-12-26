const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');

// Store for tab sessions
const tabSessions = new Map();

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      webSecurity: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Handle new window requests from webviews (OAuth popups, etc.)
  mainWindow.webContents.on('did-attach-webview', (event, webContents) => {
    // Handle OAuth popups and other new windows
    webContents.setWindowOpenHandler(({ url }) => {
      // Open OAuth/login popups in a new window
      if (url.includes('facebook.com') || 
          url.includes('instagram.com') || 
          url.includes('messenger.com') ||
          url.includes('tiktok.com') ||
          url.includes('accounts.google.com')) {
        const popup = new BrowserWindow({
          width: 500,
          height: 700,
          parent: mainWindow,
          modal: false,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            partition: webContents.session.partition || 'default'
          }
        });
        popup.loadURL(url);
        
        // Close popup when redirected back to main site
        popup.webContents.on('did-navigate', (e, navUrl) => {
          if (navUrl.includes('messenger.com') && !navUrl.includes('login')) {
            popup.close();
          }
        });
        
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });
    
    // Allow all permission requests (camera, microphone for video calls, etc.)
    webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(true);
    });
  });
  
  // Window controls
  ipcMain.on('window-minimize', () => mainWindow.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.on('window-close', () => mainWindow.close());
}

// Create isolated session for each tab
ipcMain.handle('create-tab-session', (event, tabId) => {
  const partition = `persist:tab-${tabId}`;
  tabSessions.set(tabId, partition);
  return partition;
});

// Clean up session when tab is closed
ipcMain.on('remove-tab-session', (event, tabId) => {
  tabSessions.delete(tabId);
});

// Get stored tabs
ipcMain.handle('get-stored-tabs', () => {
  const configPath = path.join(app.getPath('userData'), 'tabs.json');
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load tabs:', e);
  }
  return [];
});

// Save tabs
ipcMain.on('save-tabs', (event, tabs) => {
  const configPath = path.join(app.getPath('userData'), 'tabs.json');
  try {
    fs.writeFileSync(configPath, JSON.stringify(tabs, null, 2));
  } catch (e) {
    console.error('Failed to save tabs:', e);
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
