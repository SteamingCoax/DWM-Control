const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // DFU functionality
  getDfuDevices: () => ipcRenderer.invoke('get-dfu-devices'),
  uploadFirmware: (data) => ipcRenderer.invoke('upload-firmware', data),
  selectHexFile: () => ipcRenderer.invoke('select-hex-file'),
  getFileStats: (filePath) => ipcRenderer.invoke('get-file-stats', filePath),
  downloadLatestFirmware: () => ipcRenderer.invoke('download-latest-firmware'),
  getLatestFirmwareVersion: () => ipcRenderer.invoke('get-latest-firmware-version'),
  checkWinUsbDriver: () => ipcRenderer.invoke('check-winusb-driver'),
  installWinUsbDriver: () => ipcRenderer.invoke('install-winusb-driver'),
  
  // Serial port functionality
  getSerialPorts: () => ipcRenderer.invoke('get-serial-ports'),
  openSerialPort: (portPath, baudRate) => ipcRenderer.invoke('open-serial-port', { portPath, baudRate }),
  closeSerialPort: (portPath) => ipcRenderer.invoke('close-serial-port', { portPath }),
  writeSerial: (portPath, data) => ipcRenderer.invoke('write-serial', { portPath, data }),
  onSerialData: (callback) => {
    const listener = (_event, payload) => callback(payload.portPath, payload.data);
    ipcRenderer.on('serial-data', listener);
    return () => ipcRenderer.removeListener('serial-data', listener);
  },
  
  // De-Embed functionality
  sampleVoltage: () => ipcRenderer.invoke('sample-voltage'),
  polynomialRegression: (data) => ipcRenderer.invoke('polynomial-regression', data),
  
  // Auto-updater APIs
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Event listeners
  onUploadProgress: (callback) => {
    ipcRenderer.on('upload-progress', callback);
    return () => ipcRenderer.removeListener('upload-progress', callback);
  },
  
  // Auto-updater event listeners
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
  onUpdateNotAvailable: (callback) => ipcRenderer.on('update-not-available', callback),
  onUpdateError: (callback) => ipcRenderer.on('update-error', callback),
  onUpdateDownloadProgress: (callback) => ipcRenderer.on('update-download-progress', callback),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
  
  // Site View file I/O
  svSaveFile: (opts) => ipcRenderer.invoke('sv-save-file', opts),
  svLoadFile: (opts) => ipcRenderer.invoke('sv-load-file', opts),
  svLoadRecentFile: (filePath) => ipcRenderer.invoke('sv-load-recent-file', filePath),

  // Native menu action relay
  onMenuAction: (channel, callback) => {
    const MENU_CHANNELS = [
      'menu-sv-save', 'menu-sv-load', 'menu-sv-export',
      'menu-sv-undo', 'menu-sv-redo', 'menu-sv-fit',
      'menu-sv-zoom-in', 'menu-sv-zoom-out', 'menu-check-updates',
      'menu-sv-load-recent',
    ];
    if (!MENU_CHANNELS.includes(channel)) return;
    const listener = () => callback();
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },

  // Recent file menu channel (passes filePath as argument)
  onMenuLoadRecent: (callback) => {
    const listener = (_event, filePath) => callback(filePath);
    ipcRenderer.on('menu-sv-load-recent', listener);
    return () => ipcRenderer.removeListener('menu-sv-load-recent', listener);
  },

  // Remove listeners — restricted to known safe channels
  removeAllListeners: (channel) => {
    const ALLOWED_CHANNELS = [
      'serial-data', 'upload-progress', 'update-available', 'update-not-available',
      'update-error', 'update-download-progress', 'update-downloaded',
      'menu-sv-save', 'menu-sv-load', 'menu-sv-export',
      'menu-sv-undo', 'menu-sv-redo', 'menu-sv-fit',
      'menu-sv-zoom-in', 'menu-sv-zoom-out', 'menu-check-updates',
      'menu-sv-load-recent',
    ];
    if (ALLOWED_CHANNELS.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  }
});
