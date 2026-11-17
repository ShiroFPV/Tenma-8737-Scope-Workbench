const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // Native File dialogs
  saveCSV: (data, defaultName) => ipcRenderer.invoke('save-csv', { data, defaultName }),
  saveImage: (dataUrl, defaultName) => ipcRenderer.invoke('save-image', { dataUrl, defaultName }),

  // System Hardware Enumeration
  getUsbDevices: () => ipcRenderer.invoke('get-usb-devices'),
  getComPorts: () => ipcRenderer.invoke('get-com-ports'),

  // Direct USB / Serial Port selection helper for WebSerial/WebUSB
  requestCustomPort: () => ipcRenderer.invoke('request-custom-port')
});
