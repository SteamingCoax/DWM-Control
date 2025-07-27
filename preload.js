const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // DFU functionality
  getDfuDevices: () => ipcRenderer.invoke('get-dfu-devices'),
  uploadFirmware: (data) => ipcRenderer.invoke('upload-firmware', data),
  selectHexFile: () => ipcRenderer.invoke('select-hex-file'),
  
  // Serial port functionality
  getSerialPorts: () => ipcRenderer.invoke('get-serial-ports'),
  
  // Event listeners
  onUploadProgress: (callback) => {
    ipcRenderer.on('upload-progress', callback);
    return () => ipcRenderer.removeListener('upload-progress', callback);
  },
  
  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
