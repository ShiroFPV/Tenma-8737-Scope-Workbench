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
  saveSetup: (data, defaultName) => ipcRenderer.invoke('save-setup', { data, defaultName }),
  loadSetup: () => ipcRenderer.invoke('load-setup'),

  // System Hardware Tools
  openDeviceManager: () => ipcRenderer.invoke('open-device-manager'),
  getComPortsDetailed: () => ipcRenderer.invoke('get-com-ports-detailed'),
  getAllUsbDevices: () => ipcRenderer.invoke('get-all-usb-devices'),

  // Native Serial Bridge
  serialConnect: (port, baudRate) => ipcRenderer.invoke('serial-connect', { port, baudRate }),
  serialSend: (command) => ipcRenderer.invoke('serial-send', command),
  serialDisconnect: () => ipcRenderer.invoke('serial-disconnect'),
  onSerialData: (callback) => {
    ipcRenderer.on('serial-rx-data', (event, data) => callback(data));
  },
  onSerialRawData: (callback) => {
    ipcRenderer.on('serial-rx-raw', (event, data) => callback(data));
  },
  onSerialDisconnected: (callback) => {
    ipcRenderer.on('serial-disconnected', () => callback());
  },
  onComPortsChanged: (callback) => {
    ipcRenderer.on('com-ports-changed', (event, ports) => callback(ports));
  },

  // Native Hardware Bridge
  bridgeSendCmd: (hexVal) => ipcRenderer.invoke('bridge-cmd', hexVal),
  bridgeGetSample: () => ipcRenderer.invoke('bridge-sample')
});
