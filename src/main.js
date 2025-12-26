const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { EmailClient, PROVIDER_PRESETS } = require('./email-client');

// Store for tab sessions
const tabSessions = new Map();

// Store for email clients (one per email tab)
const emailClients = new Map();

// Critical: Spoof as Chrome before app is ready
app.commandLine.appendSwitch('disable-features', 'CrossOriginOpenerPolicy,SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure');
app.commandLine.appendSwitch('user-agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

// Remove Electron from the app user agent
app.on('ready', () => {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    callback({ requestHeaders: details.requestHeaders });
  });
});

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
    // Spoof headers for this webview's session
    webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
      details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      // Remove any Electron identifiers
      delete details.requestHeaders['X-Electron-Version'];
      callback({ requestHeaders: details.requestHeaders });
    });

    // Handle OAuth popups and other new windows
    webContents.setWindowOpenHandler(({ url }) => {
      // Open popups in a new window with same session
      if (url.includes('facebook.com') || 
          url.includes('instagram.com') || 
          url.includes('messenger.com') ||
          url.includes('tiktok.com') ||
          url.includes('google.com') ||
          url.includes('live.com') ||
          url.includes('microsoft.com')) {
        
        const popup = new BrowserWindow({
          width: 600,
          height: 750,
          parent: mainWindow,
          modal: false,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            partition: webContents.session.partition || undefined
          }
        });
        
        // Spoof in popup
        popup.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
          details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
          callback({ requestHeaders: details.requestHeaders });
        });
        
        popup.webContents.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        popup.loadURL(url);
        
        // Close popup when done with auth
        popup.webContents.on('did-navigate', (e, navUrl) => {
          if ((navUrl.includes('mail.google.com') && !navUrl.includes('accounts.google.com') && !navUrl.includes('signin')) ||
              (navUrl.includes('messenger.com') && !navUrl.includes('login')) ||
              (navUrl.includes('outlook.live.com') && !navUrl.includes('login'))) {
            popup.close();
          }
        });
        
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });
    
    // Allow all permission requests
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

// Open URL in default browser
ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
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

// Import cookies / handle special auth
ipcMain.handle('import-browser-cookies', async (event, partition, domain) => {
  try {
    return new Promise((resolve) => {
      // Create a standalone BrowserWindow (not webview) for auth
      // BrowserWindows are less detectable than webviews
      const authWin = new BrowserWindow({
        width: 450,
        height: 650,
        title: 'Sign in - Google Accounts',
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          partition: partition,
          // These help appear more like a regular browser
          webSecurity: true,
          allowRunningInsecureContent: false
        }
      });
      
      // Set user agent at session level
      const ses = session.fromPartition(partition);
      ses.webRequest.onBeforeSendHeaders((details, callback) => {
        details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        // Remove Electron traces
        delete details.requestHeaders['X-Electron-Version'];
        callback({ requestHeaders: details.requestHeaders });
      });

      authWin.loadURL('https://accounts.google.com/ServiceLogin?continue=https://mail.google.com/mail/');
      
      // Watch for successful navigation to Gmail
      const checkSuccess = (url) => {
        if (url.includes('mail.google.com/mail') && 
            !url.includes('accounts.google.com') && 
            !url.includes('ServiceLogin') &&
            !url.includes('signin')) {
          authWin.close();
          resolve(true);
        }
      };
      
      authWin.webContents.on('did-navigate', (e, url) => checkSuccess(url));
      authWin.webContents.on('did-navigate-in-page', (e, url) => checkSuccess(url));
      authWin.webContents.on('did-redirect-navigation', (e, url) => checkSuccess(url));
      
      authWin.on('closed', () => {
        resolve(false);
      });
    });
  } catch (e) {
    console.error('Auth error:', e);
    return false;
  }
});

// Email client handlers
ipcMain.handle('get-email-presets', () => {
  return PROVIDER_PRESETS;
});

ipcMain.handle('test-email-connection', async (event, config) => {
  try {
    const client = new EmailClient(config);
    const result = await client.testConnection();
    return result;
  } catch (e) {
    return { success: false, error: e.error || e.message };
  }
});

ipcMain.handle('connect-email', async (event, tabId, config) => {
  try {
    const client = new EmailClient(config);
    await client.connect();
    emailClients.set(tabId, client);
    
    // Save email config (encrypted in production, plain for now)
    const configPath = path.join(app.getPath('userData'), `email-${tabId}.json`);
    fs.writeFileSync(configPath, JSON.stringify(config));
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.error || e.message };
  }
});

ipcMain.handle('get-emails', async (event, tabId, folder = 'INBOX', limit = 50) => {
  const client = emailClients.get(tabId);
  if (!client) return { success: false, error: 'Not connected' };
  
  try {
    const emails = await client.getEmails(folder, limit);
    return { success: true, emails };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-mailboxes', async (event, tabId) => {
  const client = emailClients.get(tabId);
  if (!client) return { success: false, error: 'Not connected' };
  
  try {
    const mailboxes = await client.getMailboxes();
    return { success: true, mailboxes };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('send-email', async (event, tabId, to, subject, text, html) => {
  const client = emailClients.get(tabId);
  if (!client) return { success: false, error: 'Not connected' };
  
  try {
    await client.sendEmail(to, subject, text, html);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('mark-email-read', async (event, tabId, uid) => {
  const client = emailClients.get(tabId);
  if (!client) return { success: false, error: 'Not connected' };
  
  try {
    await client.markAsRead(uid);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('delete-email', async (event, tabId, uid) => {
  const client = emailClients.get(tabId);
  if (!client) return { success: false, error: 'Not connected' };
  
  try {
    await client.deleteEmail(uid);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.on('disconnect-email', (event, tabId) => {
  const client = emailClients.get(tabId);
  if (client) {
    client.disconnect();
    emailClients.delete(tabId);
  }
});

// Load saved email config
ipcMain.handle('get-email-config', (event, tabId) => {
  const configPath = path.join(app.getPath('userData'), `email-${tabId}.json`);
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load email config:', e);
  }
  return null;
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
