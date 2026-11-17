const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    frame: false, // Frameless for custom ShiroFPV titlebar & window controls
    backgroundColor: '#1b1c1f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      enableWebSQL: false
    },
    icon: path.join(__dirname, 'public', 'icon.png')
  });

  // Automatically approve WebSerial & WebUSB permissions for hardware scope connection
  const sess = mainWindow.webContents.session;

  sess.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    return true;
  });

  sess.setDevicePermissionHandler((details) => {
    return true;
  });

  // When WebSerial requests a port
  sess.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    if (portList && portList.length > 0) {
      // Find matching Tenma/Uni-Trend/STM32 port or pick first
      const tenmaPort = portList.find(p => 
        (p.vendorId && (p.vendorId === '0483' || p.vendorId === '5656' || p.vendorId === '4348' || p.vendorId === '1a86')) ||
        (p.displayName && p.displayName.toLowerCase().includes('serial'))
      );
      callback(tenmaPort ? tenmaPort.portId : portList[0].portId);
    } else {
      callback('');
    }
  });

  // When WebUSB requests a device
  sess.on('select-usb-device', (event, details, callback) => {
    event.preventDefault();
    if (details.deviceList && details.deviceList.length > 0) {
      callback(details.deviceList[0].deviceId);
    } else {
      callback('');
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Window management IPC
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// Native Save File Dialogs
ipcMain.handle('save-csv', async (event, { data, defaultName }) => {
  if (!mainWindow) return { success: false };
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Waveform Data (CSV)',
    defaultPath: defaultName || 'tenma_scope_waveform.csv',
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (canceled || !filePath) return { success: false, canceled: true };

  try {
    fs.writeFileSync(filePath, data, 'utf-8');
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-image', async (event, { dataUrl, defaultName }) => {
  if (!mainWindow) return { success: false };
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Scope Capture',
    defaultPath: defaultName || 'tenma_scope_capture.png',
    filters: [
      { name: 'PNG Image', extensions: ['png'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (canceled || !filePath) return { success: false, canceled: true };

  try {
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(filePath, base64Data, 'base64');
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Hardware Enumeration via PowerShell for Windows 11
ipcMain.handle('get-usb-devices', () => {
  return new Promise((resolve) => {
    const cmd = `powershell -NoProfile -Command "Get-PnpDevice -PresentOnly | Where-Object Class -in @('Ports','USB','USBDevice') | Select-Object FriendlyName, InstanceId | ConvertTo-Json"`;
    exec(cmd, (err, stdout) => {
      if (err) {
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(Array.isArray(parsed) ? parsed : [parsed]);
      } catch (e) {
        resolve([]);
      }
    });
  });
});

ipcMain.handle('get-com-ports', () => {
  return new Promise((resolve) => {
    const cmd = `powershell -NoProfile -Command "[System.IO.Ports.SerialPort]::GetPortNames() | ConvertTo-Json"`;
    exec(cmd, (err, stdout) => {
      if (err) {
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(Array.isArray(parsed) ? parsed : [parsed]);
      } catch (e) {
        resolve([]);
      }
    });
  });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
