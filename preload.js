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
  
  // Serial port functionality
  getSerialPorts: () => ipcRenderer.invoke('get-serial-ports'),
  
  // De-Embed functionality
  sampleVoltage: () => ipcRenderer.invoke('sample-voltage'),
  polynomialRegression: (data) => ipcRenderer.invoke('polynomial-regression', data),
  
  // Auto-updater APIs
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  
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
  
  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
