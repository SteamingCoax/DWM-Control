const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { execFile } = require('child_process');
const fs = require('fs');
const https = require('https');
const {
  SerialManager,
  listPorts,
  listDfuDevices,
  checkWinUsbDriver,
  FirmwareUpdater,
} = require('dwm-core');
const ss = require('simple-statistics');
const os = require('os');
const {
  calculateZeroOffsetPolynomial,
  transpose,
  multiply,
  multiplyVector,
  gaussianElimination,
} = require('./lib/regression');
const { resolveDfuUtilPath } = require('./lib/dfu-path');

// Disable GPU acceleration IMMEDIATELY when requested.
// This must be done before app.whenReady().
const shouldDisableGpu =
  process.argv.includes('--safe-mode') ||
  process.argv.includes('--disable-gpu') ||
  process.env.DWM_DISABLE_GPU === '1';

if (shouldDisableGpu) {
  console.log('GPU acceleration disabled by startup configuration');
  app.disableHardwareAcceleration();
  // Also set additional Chromium flags for complete GPU disable
  app.commandLine.appendSwitch('--disable-gpu');
  app.commandLine.appendSwitch('--disable-gpu-compositing');
  app.commandLine.appendSwitch('--disable-gpu-rasterization');
  app.commandLine.appendSwitch('--disable-gpu-sandbox');
  app.commandLine.appendSwitch('--disable-software-rasterizer');
}

// Add additional GPU-related safeguards for Windows builds
if (process.platform === 'win32') {
  // Disable problematic GPU features that might cause missing DLL issues
  app.commandLine.appendSwitch('--disable-gpu-sandbox');
  app.commandLine.appendSwitch('--disable-software-rasterizer');
  app.commandLine.appendSwitch('--ignore-gpu-blacklist');
  app.commandLine.appendSwitch('--disable-gpu-compositing');
}

// Keep a global reference of the window object
let mainWindow;

let updateCheckStarted = false;
let updateInstallInProgress = false;
let updateDownloadedReady = false;

function isMacAppInstalledInApplications() {
  if (process.platform !== 'darwin') return true;

  const execPath = process.execPath || '';
  const homeApps = path.join(os.homedir(), 'Applications') + path.sep;
  return execPath.startsWith('/Applications/') || execPath.startsWith(homeApps);
}

function getMacCodeSignatureStatus() {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') {
      resolve({ valid: true, reason: 'not-macos' });
      return;
    }

    // app.getPath('exe') resolves to .../DWM Control.app/Contents/MacOS/DWM Control
    const exePath = app.getPath('exe');
    const appBundlePath = path.resolve(exePath, '..', '..', '..');

    execFile('codesign', ['-dv', '--verbose=4', appBundlePath], (error, stdout, stderr) => {
      if (error) {
        resolve({
          valid: false,
          reason: 'codesign-command-failed',
          details: (stderr || stdout || error.message || '').trim()
        });
        return;
      }

      // `codesign -dv` writes metadata to stderr on success.
      const details = String(stderr || stdout || '').trim();
      const hasSignatureMetadata = /Authority=|TeamIdentifier=|Identifier=/.test(details);

      if (!hasSignatureMetadata) {
        resolve({ valid: false, reason: 'signature-metadata-missing', details });
        return;
      }

      resolve({ valid: true, reason: 'ok', details });
    });
  });
}

// Configure auto-updater (only check in production)
if (app.isPackaged && process.env.NODE_ENV !== 'development') {
  // Manual UI flow handles update download/install actions.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
}

// Auto-updater event handlers
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available.');
  // Send to renderer process
  if (mainWindow) {
    mainWindow.webContents.send('update-available', info);
  }
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Update not available.');
  updateDownloadedReady = false;
  if (mainWindow) {
    mainWindow.webContents.send('update-not-available');
  }
});

autoUpdater.on('error', (err) => {
  console.log('Error in auto-updater. ' + err);
  const msg = err?.message || String(err || 'Unknown updater error');

  if (msg.includes('Could not get code signature for running application')) {
    updateInstallInProgress = false;
    updateDownloadedReady = false;
  }

  if (mainWindow) {
    // Handle the case where no update metadata is available (normal when up-to-date)
    if (msg.includes('latest-mac.yml') || msg.includes('latest.yml')) {
      // Don't send an error for this case - it means no updates are available
      mainWindow.webContents.send('update-not-available');
      return;
    }
    
    // Handle actual errors
    let userMessage = 'Update check failed';
    
    if (msg.includes('Could not get code signature for running application')) {
      userMessage = 'Install failed: this app build is not signed for macOS auto-update. Install a signed release build and try again.';
    } else if (msg.includes('404') || msg.includes('HttpError')) {
      userMessage = 'Update server not available';
    } else if (msg.includes('network') || msg.includes('ENOTFOUND')) {
      userMessage = 'Network error - check internet connection';
    } else if (msg.includes('rate limit')) {
      userMessage = 'Too many requests - try again later';
    }
    
    mainWindow.webContents.send('update-error', userMessage);
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  console.log(log_message);
  
  if (mainWindow) {
    mainWindow.webContents.send('update-download-progress', progressObj);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded');
  updateDownloadedReady = true;
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded');
  }
});

autoUpdater.on('before-quit-for-update', () => {
  console.log('Updater is quitting to install update...');
  updateInstallInProgress = true;
});

function createWindow() {
  // Create the browser window with modern styling
  mainWindow = new BrowserWindow({
    width: 2400,
    height: 1000,
    minWidth: 280,
    minHeight: 200,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      // Additional security and compatibility settings
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: 'default',
    show: false // Don't show until ready
  });

  // Load the index.html file
  mainWindow.loadFile('index.html');

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Bring to front on macOS
    if (process.platform === 'darwin') {
      mainWindow.moveTop();
    }
    
    // Check for updates once after startup (skip in development)
    if (!updateCheckStarted) {
      updateCheckStarted = true;
      setTimeout(() => {
        if (process.env.NODE_ENV !== 'development' && app.isPackaged) {
          autoUpdater.checkForUpdates().catch((err) => {
            console.warn('Startup update check failed:', err?.message || err);
          });
        }
      }, 3000);
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Keep DevTools opt-in to avoid noisy Chromium protocol warnings in normal runs.
  if (process.env.DWM_OPEN_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools();
  }
  
  // Handle any renderer process crashes gracefully
  mainWindow.webContents.on('crashed', (event, killed) => {
    console.error('Renderer process crashed:', { killed });
    // Optionally restart the window or show an error dialog
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Application Error',
      message: 'The application has crashed. Please restart the application.',
      buttons: ['OK']
    });
  });
}

// ─── Recent site-view files ────────────────────────────────────────────────

let RECENT_SV_PATH = null;
let recentSiteViews = [];

function getRecentSVPath() {
  if (!RECENT_SV_PATH) RECENT_SV_PATH = path.join(app.getPath('userData'), 'recent-site-views.json');
  return RECENT_SV_PATH;
}

function loadRecentSiteViews() {
  try {
    const raw = fs.readFileSync(getRecentSVPath(), 'utf8');
    recentSiteViews = JSON.parse(raw);
    if (!Array.isArray(recentSiteViews)) recentSiteViews = [];
  } catch (_) {
    recentSiteViews = [];
  }
}

function saveRecentSiteViews() {
  try {
    fs.writeFileSync(getRecentSVPath(), JSON.stringify(recentSiteViews), 'utf8');
  } catch (_) {}
}

function addRecentSiteView(filePath) {
  recentSiteViews = recentSiteViews.filter(p => p !== filePath);
  recentSiteViews.unshift(filePath);
  if (recentSiteViews.length > 10) recentSiteViews = recentSiteViews.slice(0, 10);
  saveRecentSiteViews();
  buildAppMenu(); // refresh menu
}

// This method will be called when Electron has finished initialization
function buildAppMenu() {
  const isMac = process.platform === 'darwin';

  const sendToFocusedWindow = (channel, ...args) => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    if (win) win.webContents.send(channel, ...args);
  };

  const template = [
    // ── macOS application menu ────────────────────────────────────────────
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),

    // ── File ──────────────────────────────────────────────────────────────
    {
      label: 'File',
      submenu: [
        {
          label: 'New Workspace',
          accelerator: 'CmdOrCtrl+N',
          click() { sendToFocusedWindow('menu-sv-new-ws'); },
        },
        {
          label: 'Open Workspaces…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click() { sendToFocusedWindow('menu-sv-workspaces'); },
        },
        {
          label: 'Save Workspace',
          accelerator: 'CmdOrCtrl+S',
          click() { sendToFocusedWindow('menu-sv-save'); },
        },
        { type: 'separator' },
        {
          label: 'Import Workspace from File…',
          click() { sendToFocusedWindow('menu-sv-import-ws'); },
        },
        {
          label: 'Export Workspace to File…',
          click() { sendToFocusedWindow('menu-sv-export-ws'); },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },

    // ── Edit ──────────────────────────────────────────────────────────────
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Delete Selected',
          click() { sendToFocusedWindow('menu-sv-delete'); },
        },
        {
          label: 'Clear All',
          click() { sendToFocusedWindow('menu-sv-clear'); },
        },
        { type: 'separator' },
        {
          label: 'Lock Workspace',
          click() { sendToFocusedWindow('menu-sv-lock'); },
        },
      ],
    },

    // ── View ──────────────────────────────────────────────────────────────
    {
      label: 'View',
      submenu: [
        {
          label: 'Fit to Screen',
          accelerator: 'CmdOrCtrl+Shift+F',
          click() { sendToFocusedWindow('menu-sv-fit'); },
        },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click() { sendToFocusedWindow('menu-sv-zoom-in'); },
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click() { sendToFocusedWindow('menu-sv-zoom-out'); },
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },

    // ── Logging ───────────────────────────────────────────────────────────
    {
      label: 'Logging',
      submenu: [
        {
          label: 'Toggle Data Logging',
          accelerator: 'CmdOrCtrl+Shift+L',
          click() { sendToFocusedWindow('menu-sv-log-toggle'); },
        },
        { type: 'separator' },
        {
          label: 'Change Log Save Folder…',
          click() { sendToFocusedWindow('menu-sv-log-folder'); },
        },
      ],
    },

    // ── Window ────────────────────────────────────────────────────────────
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        isMac ? { role: 'zoom' } : { role: 'maximize' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
        ] : []),
      ],
    },

    // ── Help ──────────────────────────────────────────────────────────────
    {
      role: 'help',
      submenu: [
        {
          label: 'Check for Updates',
          click() { sendToFocusedWindow('menu-check-updates'); },
        },
        { type: 'separator' },
        {
          label: 'DWM Control on GitHub',
          click() { shell.openExternal('https://github.com/SteamingCoax/DWM-Control'); },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  loadRecentSiteViews();
  buildAppMenu();
  try {
    createWindow();
  } catch (error) {
    console.error('Failed to create window:', error);
    // Try to create a minimal window as fallback
    try {
      app.disableHardwareAcceleration();
      createWindow();
    } catch (fallbackError) {
      console.error('Fallback window creation also failed:', fallbackError);
      app.quit();
    }
  }
  
  app.on('activate', () => {
    // On macOS, re-create a window when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Handle app-level errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS, apps typically stay active until explicitly quit
  if (process.platform !== 'darwin') app.quit();
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

// WinUSB driver installation for DFU devices (Windows only)
// Uses pnputil + an unsigned USBDevice-class INF — no catalog/signature required on Win10 1903+
const DFU_VID = '0483';
const DFU_PID = 'DF11';
const DFU_HARDWARE_ID = `USB\\VID_${DFU_VID}&PID_${DFU_PID}`;

ipcMain.handle('check-winusb-driver', async () => checkWinUsbDriver());

ipcMain.handle('install-winusb-driver', async () => {
  if (process.platform !== 'win32') return { success: false, error: 'Not Windows' };

  const zadigPath = path.join(path.dirname(process.execPath), 'zadig.exe');

  if (!fs.existsSync(zadigPath)) {
    return { success: false, error: `Zadig not found at ${zadigPath}. Please reinstall DWM Control.` };
  }

  try {
    const err = await shell.openPath(zadigPath);
    if (err) return { success: false, error: err };
    return { success: true, launched: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// IPC Handlers for DFU functionality
//
// dwm-core locates and drives dfu-util; everything below is presentation
// policy — deciding which platform-specific guidance the renderer should show.
ipcMain.handle('get-dfu-devices', async () => {
  const result = await listDfuDevices({ command: getDfuUtilPath() });

  if (!result.success) {
    const isWindows = process.platform === 'win32';
    return {
      success: false,
      error: isWindows
        ? `Failed to run dfu-util: ${result.error}. Try running as Administrator.`
        : `Failed to run dfu-util: ${result.error}`,
      output: '',
      needsSetup: true,
      windowsHelp: isWindows,
    };
  }

  if (result.devices.length === 0) {
    if (process.platform === 'win32') {
      return {
        success: false,
        error: 'No DFU devices found',
        output: result.output,
        windowsHelp: true,
      };
    }

    if (
      process.platform === 'linux' &&
      /LIBUSB_ERROR_ACCESS|permission denied|cannot open/i.test(result.output)
    ) {
      return {
        success: false,
        error:
          'USB permission denied. Run: sudo usermod -aG plugdev $USER then log out and back in, or run the app with sudo.',
        output: result.output,
      };
    }
  }

  return { success: true, devices: result.devices, output: result.output };
});

ipcMain.handle('upload-firmware', async (event, { hexFilePath, deviceInfo }) => {
  // Validate: path must be inside home dir and end with .hex
  const resolvedHex = path.resolve(hexFilePath || '');
  const homeDir = os.homedir();
  if (
    !resolvedHex.toLowerCase().endsWith('.hex') ||
    (!resolvedHex.startsWith(homeDir + path.sep) && !resolvedHex.startsWith(__dirname + path.sep))
  ) {
    return { success: false, error: 'Invalid firmware file path.', output: '' };
  }

  const updater = new FirmwareUpdater({ command: getDfuUtilPath() });

  try {
    const result = await updater.upload(resolvedHex, {
      log: (line) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('upload-progress', line);
        }
      },
    });
    return { success: result.success, error: result.error, output: result.output };
  } catch (error) {
    return { success: false, error: error.message, output: '' };
  }
});

// Serial transport is owned by dwm-core; this process only bridges it to the
// renderer over IPC.
const serialManager = new SerialManager();

serialManager.on('data', ({ portPath, data }) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('serial-data', { portPath, data });
  }
});

serialManager.on('error', ({ portPath, error }) => {
  console.error('Serial port error on', portPath, ':', error.message);
});

// IPC Handlers for Serial Port functionality
ipcMain.handle('get-serial-ports', async () => {
  try {
    return { success: true, ports: await listPorts() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Open serial port — supports multiple simultaneous ports
ipcMain.handle('open-serial-port', async (event, { portPath, baudRate }) => {
  try {
    await serialManager.open(portPath, baudRate || 115200);
    return { success: true };
  } catch (error) {
    console.error('Error opening serial port:', error);
    return { success: false, error: error.message };
  }
});

// Close a specific serial port (or all ports if portPath is omitted)
ipcMain.handle('close-serial-port', async (event, { portPath } = {}) => {
  try {
    await serialManager.close(portPath);
    return { success: true };
  } catch (error) {
    console.error('Error closing serial port:', error);
    return { success: false, error: error.message };
  }
});

// Write data to a specific serial port
ipcMain.handle('write-serial', async (event, { portPath, data }) => {
  try {
    await serialManager.write(portPath, data);
    return { success: true };
  } catch (error) {
    console.error('Error writing to serial port:', error);
    return { success: false, error: error.message };
  }
});

// File selection dialog
ipcMain.handle('select-hex-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Firmware (.hex) File',
    filters: [
      { name: 'Intel Hex Files', extensions: ['hex'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return { success: true, filePath: result.filePaths[0] };
  }
  
  return { success: false };
});

// ─── Site View file I/O (routed through main to avoid macOS XPC view-bridge errors) ───

ipcMain.handle('sv-save-file', async (_event, { defaultName, content, filterName, ext }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Site View',
    defaultPath: path.join(os.homedir(), defaultName),
    filters: [{ name: filterName, extensions: [ext] }],
  });
  if (result.canceled || !result.filePath) return { success: false };
  try {
    fs.writeFileSync(result.filePath, content, 'utf8');
    addRecentSiteView(result.filePath);
    return { success: true, filePath: result.filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('sv-load-file', async (_event, { filterName, ext }) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Load Site View',
    filters: [{ name: filterName, extensions: [ext] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return { success: false };
  try {
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf8');
    addRecentSiteView(filePath);
    return { success: true, content, filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('sv-load-recent-file', async (_event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    addRecentSiteView(filePath);
    return { success: true, content, filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── Workspace Browser ────────────────────────────────────────────────────

let WS_PREFS = null;

function getWsPrefsPath() {
  return path.join(app.getPath('userData'), 'ws-prefs.json');
}

function loadWsPrefs() {
  try { WS_PREFS = JSON.parse(fs.readFileSync(getWsPrefsPath(), 'utf8')); }
  catch (_) { WS_PREFS = {}; }
}

function saveWsPrefs() {
  try { fs.writeFileSync(getWsPrefsPath(), JSON.stringify(WS_PREFS, null, 2), 'utf8'); }
  catch (_) {}
}

function getWorkspacesDir() {
  if (!WS_PREFS) loadWsPrefs();
  const dir = WS_PREFS.workspacesDir || path.join(app.getPath('documents'), 'DWM-Control', 'Workspaces');
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  }
  return dir;
}

ipcMain.handle('sv-ws-list', async () => {
  const dir = getWorkspacesDir();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.svws'));
  const workspaces = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const data = JSON.parse(raw);
      workspaces.push({
        id:             f.slice(0, -5),
        name:           data.name || 'Untitled',
        createdAt:      data.createdAt   || null,
        modifiedAt:     data.modifiedAt  || null,
        componentCount: data.componentCount || 0,
        thumbnail:      data.thumbnail   || null,
      });
    } catch (_) {}
  }
  workspaces.sort((a, b) => (b.modifiedAt || '').localeCompare(a.modifiedAt || ''));
  return { workspaces, workspacesDir: dir };
});

ipcMain.handle('sv-ws-save', async (_event, { id, name, schematic, thumbnail, componentCount }) => {
  const dir = getWorkspacesDir();
  const wsId = id || ('ws-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));
  const filePath = path.join(dir, wsId + '.svws');
  let createdAt = new Date().toISOString();
  if (fs.existsSync(filePath)) {
    try { createdAt = JSON.parse(fs.readFileSync(filePath, 'utf8')).createdAt || createdAt; } catch (_) {}
  }
  const data = {
    version: 1, name, createdAt,
    modifiedAt: new Date().toISOString(),
    componentCount, thumbnail, schematic,
  };
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
  return { success: true, id: wsId };
});

ipcMain.handle('sv-ws-load', async (_event, { id }) => {
  const filePath = path.join(getWorkspacesDir(), id + '.svws');
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { success: true, id, name: data.name, schematic: data.schematic };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('sv-ws-delete', async (_event, { id }) => {
  const filePath = path.join(getWorkspacesDir(), id + '.svws');
  try { fs.unlinkSync(filePath); return { success: true }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('sv-ws-rename', async (_event, { id, name }) => {
  const filePath = path.join(getWorkspacesDir(), id + '.svws');
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    data.name = name;
    data.modifiedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('sv-ws-duplicate', async (_event, { id }) => {
  const dir = getWorkspacesDir();
  const srcPath = path.join(dir, id + '.svws');
  try {
    const data = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
    const newId = 'ws-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    data.name = (data.name || 'Untitled') + ' (Copy)';
    data.createdAt = new Date().toISOString();
    data.modifiedAt = new Date().toISOString();
    fs.writeFileSync(path.join(dir, newId + '.svws'), JSON.stringify(data), 'utf8');
    return { success: true, id: newId };
  } catch (e) { return { success: false, error: e.message }; }
});

// Change workspace folder
ipcMain.handle('sv-ws-set-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Workspace Folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  const newDir = result.filePaths[0];
  if (!WS_PREFS) loadWsPrefs();
  WS_PREFS.workspacesDir = newDir;
  saveWsPrefs();
  if (!fs.existsSync(newDir)) {
    try { fs.mkdirSync(newDir, { recursive: true }); } catch (_) {}
  }
  return { success: true, workspacesDir: newDir };
});

// Export a specific workspace to an arbitrary file path
ipcMain.handle('sv-ws-export-file', async (_event, { id, name }) => {
  const srcPath = path.join(getWorkspacesDir(), id + '.svws');
  try {
    const data = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Workspace',
      defaultPath: path.join(os.homedir(), (name || 'workspace') + '.svws'),
      filters: [{ name: 'Site View Workspace', extensions: ['svws'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, JSON.stringify(data), 'utf8');
    return { success: true, filePath: result.filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Import a workspace from an arbitrary file path into the workspace folder
ipcMain.handle('sv-ws-import-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Workspace',
    filters: [{ name: 'Site View Workspace', extensions: ['svws'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  try {
    const raw  = fs.readFileSync(result.filePaths[0], 'utf8');
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return { success: false, error: 'Invalid workspace file' };
    const dir   = getWorkspacesDir();
    const newId = 'ws-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    data.createdAt  = data.createdAt  || new Date().toISOString();
    data.modifiedAt = new Date().toISOString();
    fs.writeFileSync(path.join(dir, newId + '.svws'), JSON.stringify(data), 'utf8');
    return { success: true, id: newId, name: data.name || 'Imported' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── Streaming Data Logger ────────────────────────────────────────────────
// Writes each row immediately to disk — crash-safe, zero memory accumulation.

let activeLogStream  = null;  // fs.WriteStream
let activeLogPath    = null;  // full path to the current log file

function getLogsDir() {
  if (!WS_PREFS) loadWsPrefs();
  const dir = WS_PREFS.logsDir || path.join(
    WS_PREFS.workspacesDir || path.join(app.getPath('documents'), 'DWM-Control', 'Workspaces'),
    'Logs'
  );
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  }
  return dir;
}

ipcMain.handle('sv-log-get-dir', async () => {
  return { logsDir: getLogsDir() };
});

ipcMain.handle('sv-log-set-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Log Save Folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  const newDir = result.filePaths[0];
  if (!WS_PREFS) loadWsPrefs();
  WS_PREFS.logsDir = newDir;
  saveWsPrefs();
  if (!fs.existsSync(newDir)) {
    try { fs.mkdirSync(newDir, { recursive: true }); } catch (_) {}
  }
  return { success: true, logsDir: newDir };
});

// Open log file and write multi-section CSV header
ipcMain.handle('sv-log-open', async (_event, { header, filename }) => {
  // Close any existing stream first
  if (activeLogStream) {
    try { activeLogStream.end(); } catch (_) {}
    activeLogStream = null;
    activeLogPath   = null;
  }
  const dir = getLogsDir();
  const ts  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fname = (filename || `log-${ts}`) + '.csv';
  const filePath = path.join(dir, fname);
  try {
    activeLogStream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8' });
    activeLogStream.on('error', (err) => {
      console.error('Log stream error:', err);
      activeLogStream = null;
      activeLogPath   = null;
    });
    // UTF-8 BOM for Excel compatibility, then the header block (already CRLF-terminated by renderer)
    activeLogStream.write('\uFEFF' + header + '\r\n');
    activeLogPath = filePath;
    return { success: true, filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Append one CSV row — called every logging tick
ipcMain.handle('sv-log-row', async (_event, { row }) => {
  if (!activeLogStream || activeLogStream.destroyed) return { success: false, error: 'No open log stream' };
  try {
    activeLogStream.write(row + '\r\n');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Close the log stream
ipcMain.handle('sv-log-close', async () => {
  if (!activeLogStream) return { success: false, error: 'No open log stream' };
  const filePath = activeLogPath;
  return new Promise((resolve) => {
    activeLogStream.end(() => {
      activeLogStream = null;
      activeLogPath   = null;
      resolve({ success: true, filePath });
    });
  });
});

// Also close the stream on app quit so nothing is lost
app.on('before-quit', () => {
  if (activeLogStream && !activeLogStream.destroyed) {
    try { activeLogStream.end(); } catch (_) {}
    activeLogStream = null;
  }
});

// Get file statistics — path is restricted to the user's home directory
ipcMain.handle('get-file-stats', async (event, filePath) => {
  try {
    const normalizedPath = (typeof filePath === 'string') ? filePath : filePath?.filePath;
    if (typeof normalizedPath !== 'string' || !normalizedPath.trim()) {
      throw new Error('Invalid file path argument');
    }

    const resolvedPath = path.resolve(normalizedPath);
    const homeDir = os.homedir();
    if (!resolvedPath.startsWith(homeDir + path.sep) && resolvedPath !== homeDir) {
      throw new Error('Access denied: path is outside the allowed directory');
    }
    const stats = fs.statSync(resolvedPath);
    return { 
      size: stats.size,
      mtime: stats.mtime,
      ctime: stats.ctime
    };
  } catch (error) {
    throw new Error(`Failed to get file stats: ${error.message}`);
  }
});

// Download latest firmware from GitHub
ipcMain.handle('download-latest-firmware', async () => {
  try {
    console.log('Starting GitHub firmware download...');
    
    // First test network connectivity
    console.log('Testing network connectivity...');
    
    // Fetch latest release info from GitHub API
    const releaseInfo = await fetchLatestRelease();
    console.log('Release info received:', releaseInfo ? releaseInfo.tag_name : 'null');
    
    if (!releaseInfo) {
      throw new Error('No releases found');
    }
    
    // Find .hex file in release assets
    const hexAsset = releaseInfo.assets.find(asset => 
      asset.name.toLowerCase().endsWith('.hex')
    );
    
    console.log('Found assets:', releaseInfo.assets.map(a => a.name));
    console.log('Selected hex asset:', hexAsset ? hexAsset.name : 'none');
    
    if (!hexAsset) {
      throw new Error('No .hex file found in latest release');
    }
    
    // Create downloads directory in a more accessible location
    const os = require('os');
    const downloadsDir = path.join(os.homedir(), 'Downloads', 'DWM-Control-Firmware');
    console.log('Downloads directory:', downloadsDir);
    
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
      console.log('Created downloads directory');
    }
    
    // Download the firmware file
    const fileName = hexAsset.name;
    const filePath = path.join(downloadsDir, fileName);
    
    console.log('Downloading to:', filePath);
    await downloadFile(hexAsset.browser_download_url, filePath);
    console.log('Download completed successfully');
    
    return {
      success: true,
      filePath: filePath,
      fileName: fileName,
      version: releaseInfo.tag_name,
      size: hexAsset.size,
      releaseDate: releaseInfo.published_at
    };
    
  } catch (error) {
    console.error('GitHub download error:', error);
    console.error('Error stack:', error.stack);
    throw new Error(`Failed to download firmware: ${error.message}`);
  }
});

// De-embed voltage sampling
ipcMain.handle('sample-voltage', async () => {
  try {
    // In a real implementation, this would communicate with the actual power meter
    // For now, we'll simulate a realistic voltage reading
    
    // Simulate some delay for actual hardware communication
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    // Generate a realistic voltage reading (0.1 to 2000 mV range)
    // In practice, this would be replaced with actual meter communication
    const voltage = Math.random() * 1900 + 100; // 100-2000 mV range
    
    return {
      success: true,
      voltage: voltage,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Voltage sampling error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get latest firmware version tag from GitHub (without downloading)
ipcMain.handle('get-latest-firmware-version', async () => {
  try {
    const releaseInfo = await fetchLatestRelease();
    if (!releaseInfo) {
      throw new Error('No releases found');
    }
    return {
      success: true,
      tag_name: releaseInfo.tag_name,
      name: releaseInfo.name,
      published_at: releaseInfo.published_at,
    };
  } catch (error) {
    console.error('Firmware version check error:', error);
    throw new Error(`Failed to fetch firmware version: ${error.message}`);
  }
});

// De-embed polynomial regression

// De-embed polynomial regression
ipcMain.handle('polynomial-regression', async (event, { xData, yData, degree = 3 }) => {
  try {
    console.log('Polynomial regression called with data:', { xData, yData, degree });
    
    // Validate input data
    if (!Array.isArray(xData) || !Array.isArray(yData)) {
      throw new Error('Input data must be arrays');
    }
    
    if (xData.length !== yData.length) {
      throw new Error('X and Y data arrays must have the same length');
    }
    
    if (xData.length < degree + 1) {
      throw new Error(`Need at least ${degree + 1} data points for degree ${degree} polynomial`);
    }

    // For polynomial regression, use the existing helper functions
    const coefficients = calculateZeroOffsetPolynomial(xData, yData, degree);
    
    // Calculate R-squared
    const meanY = yData.reduce((sum, y) => sum + y, 0) / yData.length;
    const predictedY = xData.map(x => {
      let result = 0;
      for (let j = 0; j < coefficients.length; j++) {
        result += coefficients[j] * Math.pow(x, j + 1);
      }
      return result;
    });
    
    const ssRes = yData.reduce((sum, y, i) => sum + Math.pow(y - predictedY[i], 2), 0);
    const ssTot = yData.reduce((sum, y) => sum + Math.pow(y - meanY, 2), 0);
    const rSquared = 1 - (ssRes / ssTot);
    
    // Create equation string
    let equation = 'y = ';
    for (let i = coefficients.length - 1; i >= 0; i--) {
      const coeff = coefficients[i];
      const power = i + 1;
      
      if (i === coefficients.length - 1) {
        equation += `${coeff.toFixed(6)}`;
      } else {
        equation += coeff >= 0 ? ` + ${coeff.toFixed(6)}` : ` - ${Math.abs(coeff).toFixed(6)}`;
      }
      
      if (power > 1) {
        equation += `x^${power}`;
      } else {
        equation += 'x';
      }
    }
    
    console.log('Polynomial regression result:', { coefficients, rSquared, equation });
    
    return {
      success: true,
      coefficients: coefficients,
      rSquared: rSquared,
      equation: equation,
      dataPoints: xData.length
    };
    
  } catch (error) {
    console.error('Polynomial regression error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});


// Helper function to fetch latest release from GitHub
function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    console.log('Fetching latest release from GitHub API...');
    
    const options = {
      hostname: 'api.github.com',
      path: '/repos/SteamingCoax/DWM-V2_Firmware/releases/latest',
      method: 'GET',
      headers: {
        'User-Agent': 'DWM-Control-App',
        'Accept': 'application/vnd.github.v3+json'
      }
    };
    
    console.log('Request options:', options);
    
    const req = https.request(options, (res) => {
      let data = '';
      
      console.log('Response status:', res.statusCode);
      console.log('Response headers:', res.headers);
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const releaseInfo = JSON.parse(data);
            console.log('Successfully parsed release info');
            resolve(releaseInfo);
          } else {
            console.log('GitHub API error response:', data);
            reject(new Error(`GitHub API returned status ${res.statusCode}`));
          }
        } catch (error) {
          console.error('JSON parse error:', error);
          reject(new Error(`Failed to parse GitHub API response: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('Request error:', error);
      reject(new Error(`GitHub API request failed: ${error.message}`));
    });
    
    req.setTimeout(30000, () => {
      console.log('Request timed out');
      req.abort();
      reject(new Error('GitHub API request timed out'));
    });
    
    req.end();
  });
}

// Helper function to download a file
function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    console.log('Starting download from:', url);
    console.log('Saving to:', filePath);
    
    const file = fs.createWriteStream(filePath);
    
    const request = https.get(url, (response) => {
      console.log('Download response status:', response.statusCode);
      console.log('Download response headers:', response.headers);
      
      if (response.statusCode === 200) {
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          console.log('File download completed successfully');
          resolve();
        });
        
        file.on('error', (error) => {
          console.error('File write error:', error);
          fs.unlink(filePath, () => {}); // Clean up failed download
          reject(error);
        });
      } else if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlink(filePath, () => {}); // Clean up
        console.log('Following redirect to:', response.headers.location);
        // Handle redirect
        downloadFile(response.headers.location, filePath)
          .then(resolve)
          .catch(reject);
      } else {
        file.close();
        fs.unlink(filePath, () => {}); // Clean up
        reject(new Error(`Download failed with status ${response.statusCode}`));
      }
    });
    
    request.on('error', (error) => {
      console.error('Download request error:', error);
      file.close();
      fs.unlink(filePath, () => {}); // Clean up
      reject(error);
    });
    
    request.setTimeout(60000, () => {
      console.log('Download request timed out');
      request.abort();
      file.close();
      fs.unlink(filePath, () => {}); // Clean up
      reject(new Error('Download timed out'));
    });
  });
}

// Helper functions
function getDfuUtilPath() {
  // Use the same reliable development detection as the auto-updater
  const isExplicitDev = process.env.NODE_ENV === 'development';
  const isRunningFromSource = !app.isPackaged;
  const isDev = isExplicitDev && isRunningFromSource;

  let basePath;
  if (isDev) {
    basePath = __dirname;
  } else {
    // For packaged apps, try multiple possible paths
    basePath = process.resourcesPath || path.dirname(process.execPath);
  }

  console.log('getDfuUtilPath - isExplicitDev:', isExplicitDev);
  console.log('getDfuUtilPath - isRunningFromSource:', isRunningFromSource);
  console.log('getDfuUtilPath - isDev:', isDev);
  console.log('getDfuUtilPath - basePath:', basePath);
  console.log('getDfuUtilPath - __dirname:', __dirname);
  console.log('getDfuUtilPath - process.resourcesPath:', process.resourcesPath);
  console.log('getDfuUtilPath - process.execPath:', process.execPath);
  console.log('getDfuUtilPath - app.isPackaged:', app.isPackaged);

  return resolveDfuUtilPath({
    platform: process.platform,
    arch: process.arch,
    isDev,
    basePath,
    exists: fs.existsSync,
    chmod: fs.chmodSync,
    log: console.log,
  });
}

// IPC handlers for manual update checking
ipcMain.handle('check-for-updates', async () => {
  try {
    updateDownloadedReady = false;

    // Simple and reliable development mode detection
    // Only consider it development if explicitly set or if running from source
    const isExplicitDev = process.env.NODE_ENV === 'development';
    const isRunningFromSource = !app.isPackaged;
    
    console.log('Update check debug info:', {
      NODE_ENV: process.env.NODE_ENV,
      isPackaged: app.isPackaged,
      isExplicitDev: isExplicitDev,
      isRunningFromSource: isRunningFromSource,
      execPath: process.execPath
    });
    
    // Only skip update checks if explicitly in development AND running from source
    if (isExplicitDev && isRunningFromSource) {
      console.log('Development mode: Simulating update check');
      return { 
        success: true, 
        updateInfo: null,
        message: 'Development mode: Update checking is disabled'
      };
    }
    
    console.log('Production mode: Checking for real updates');
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result };
  } catch (error) {
    console.error('Update check error:', error);
    
    // Handle the case where no update metadata is available (normal when up-to-date)
    if (error.message.includes('latest-mac.yml') || error.message.includes('latest.yml')) {
      return { 
        success: true, 
        updateInfo: null, 
        noUpdates: true,
        message: 'You have the latest version'
      };
    }
    
    // Handle actual errors
    let userMessage = 'Failed to check for updates';
    
    if (error.message.includes('404') || error.message.includes('HttpError')) {
      userMessage = 'Update server not available - please try again later';
    } else if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
      userMessage = 'Network error - please check your internet connection';
    } else if (error.message.includes('rate limit')) {
      userMessage = 'Too many requests - please wait a moment before trying again';
    }
    
    return { success: false, error: userMessage };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    // On macOS, electron-updater uses Squirrel.Mac which requires its own internal
    // download from a local proxy server. With autoInstallOnAppQuit=false that
    // proxy-download is deferred until quitAndInstall() — too late, it can fail
    // silently while the app is trying to quit. Setting autoInstallOnAppQuit=true
    // here makes electron-updater trigger Squirrel's proxy-download immediately
    // as part of downloadUpdate(), so Squirrel is fully staged before the user
    // ever clicks "Restart". We reset the flag after so a normal Cmd+Q doesn't
    // auto-install.
    if (process.platform === 'darwin') {
      autoUpdater.autoInstallOnAppQuit = true;
    }
    await autoUpdater.downloadUpdate();
    if (process.platform === 'darwin') {
      autoUpdater.autoInstallOnAppQuit = false;
    }
    updateDownloadedReady = true;
    return { success: true };
  } catch (error) {
    if (process.platform === 'darwin') {
      autoUpdater.autoInstallOnAppQuit = false;
    }
    updateDownloadedReady = false;
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-update', async () => {
  try {
    if (!app.isPackaged) {
      return {
        success: false,
        error: 'Install update is only available in a packaged app build.'
      };
    }

    if (updateInstallInProgress) {
      return { success: true, message: 'Update installation already in progress' };
    }

    if (!updateDownloadedReady) {
      return {
        success: false,
        error: 'No downloaded update is ready to install yet.'
      };
    }

    if (process.platform === 'darwin' && !isMacAppInstalledInApplications()) {
      return {
        success: false,
        error: 'Please move DWM Control to /Applications (or ~/Applications) before installing updates, then try again.'
      };
    }

    if (process.platform === 'darwin') {
      const signature = await getMacCodeSignatureStatus();
      if (!signature.valid) {
        return {
          success: false,
          error: 'This app build is not signed for macOS auto-update. Install an official signed release build and try again.'
        };
      }
    }

    updateInstallInProgress = true;
    updateDownloadedReady = false;
    // Parameters: isSilent=false (show installer behavior), isForceRunAfter=true
    autoUpdater.quitAndInstall(false, true);
    return { success: true };
  } catch (error) {
    updateInstallInProgress = false;
    return { success: false, error: error.message || 'Failed to install update' };
  }
});

ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});
