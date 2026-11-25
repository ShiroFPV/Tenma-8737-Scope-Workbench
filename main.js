const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');

let mainWindow = null;
let activeSerialProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    frame: false,
    backgroundColor: '#1b1c1f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    icon: path.join(__dirname, 'public', 'icon.png')
  });

  const sess = mainWindow.webContents.session;

  sess.setPermissionCheckHandler(() => true);
  sess.setDevicePermissionHandler(() => true);

  sess.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    if (portList && portList.length > 0) {
      callback(portList[0].portId);
    } else {
      callback('');
    }
  });

  sess.on('select-usb-device', (event, details, callback) => {
    event.preventDefault();
    if (details.deviceList && details.deviceList.length > 0) {
      callback(details.deviceList[0].deviceId);
    } else {
      callback('');
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    disconnectSerial();
  });
}

// Window controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.handle('open-device-manager', () => {
  exec('devmgmt.msc');
  return true;
});

// File save dialogs
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

ipcMain.handle('save-setup', async (event, { data, defaultName }) => {
  if (!mainWindow) return { success: false };
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Oscilloscope Setup',
    defaultPath: defaultName || 'tenma_setup.json',
    filters: [
      { name: 'Oscilloscope Setup (JSON)', extensions: ['json'] },
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

ipcMain.handle('load-setup', async () => {
  if (!mainWindow) return { success: false };
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Recall Oscilloscope Setup',
    properties: ['openFile'],
    filters: [
      { name: 'Oscilloscope Setup (JSON)', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (canceled || !filePaths || filePaths.length === 0) return { success: false, canceled: true };

  try {
    const content = fs.readFileSync(filePaths[0], 'utf-8');
    return { success: true, data: content, filePath: filePaths[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Helper to run PowerShell cleanly without cmd.exe variable stripping
function runPowerShell(psCommand) {
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand]);
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.on('error', () => resolve(''));
    child.on('close', () => resolve(stdout));
  });
}

// Comprehensive Windows COM Port Scanner
ipcMain.handle('get-com-ports-detailed', async () => {
  const stdout = await runPowerShell("Get-PnpDevice -Class Ports | Select-Object FriendlyName, InstanceId, Status, Present | ConvertTo-Json");
  let ports = [];
  if (stdout) {
    try {
      const parsed = JSON.parse(stdout);
      const list = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      ports = list.map(p => {
        const match = p.FriendlyName ? p.FriendlyName.match(/\((COM\d+)\)/i) : null;
        return {
          port: match ? match[1].toUpperCase() : (p.FriendlyName || 'COM1'),
          name: p.FriendlyName || 'Serial Device',
          instanceId: p.InstanceId || '',
          present: p.Present === true,
          status: p.Status || 'Unknown'
        };
      });
    } catch (e) {}
  }

  return new Promise((resolve) => {
    exec('reg query HKLM\\HARDWARE\\DEVICEMAP\\SERIALCOMM', (regErr, regOut) => {
      if (!regErr && regOut) {
        const matches = regOut.match(/REG_SZ\s+(COM\d+)/gi);
        if (matches) {
          matches.forEach(m => {
            const portName = m.replace(/REG_SZ\s+/i, '').trim().toUpperCase();
            const existing = ports.find(p => p.port === portName);
            if (existing) {
              existing.present = true;
              existing.status = 'OK';
            } else {
              ports.push({
                port: portName,
                name: `${portName} (Active Serial Port)`,
                instanceId: '',
                present: true,
                status: 'OK'
              });
            }
          });
        }
      }
      resolve(ports);
    });
  });
});

// Query all connected USB & Hardware devices
ipcMain.handle('get-all-usb-devices', async () => {
  const stdout = await runPowerShell("Get-PnpDevice -PresentOnly | Where-Object { $_.Class -in @('Ports','USB','USBDevice','Unknown') -or $_.InstanceId -like 'USB*' } | Select-Object FriendlyName, InstanceId, Class, Status | ConvertTo-Json");
  if (!stdout) return [];
  try {
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
  } catch (e) {
    return [];
  }
});

function getBridgeExePath() {
  const localPath = path.join(__dirname, 'serial-bridge.exe');
  if (fs.existsSync(localPath)) return localPath;
  const appPath = path.join(process.resourcesPath, 'serial-bridge.exe');
  if (fs.existsSync(appPath)) return appPath;
  const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'serial-bridge.exe');
  if (fs.existsSync(unpackedPath)) return unpackedPath;
  return localPath;
}

// Native Windows Serial Port Connection using high-performance C# serial-bridge
ipcMain.handle('serial-connect', (event, { port, baudRate }) => {
  return new Promise((resolve) => {
    disconnectSerial();

    const exe = getBridgeExePath();
    activeSerialProcess = spawn(exe, [port, String(baudRate || 115200)]);

    let resolved = false;
    let stdoutBuffer = '';

    activeSerialProcess.stdout.on('data', (data) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop();

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        if (!resolved) {
          if (line.startsWith('OPEN_OK:')) {
            resolved = true;
            resolve({ success: true, port });
            continue;
          } else if (line.startsWith('OPEN_ERR:')) {
            resolved = true;
            resolve({ success: false, error: line.replace('OPEN_ERR:', '').trim() });
            continue;
          }
        }

        if (line.startsWith('B64:')) {
          const b64 = line.substring(4);
          try {
            const buf = Buffer.from(b64, 'base64');
            if (mainWindow) {
              mainWindow.webContents.send('serial-rx-raw', buf);
              mainWindow.webContents.send('serial-rx-data', buf.toString('utf-8'));
            }
          } catch (e) {}
        }
      }
    });

    activeSerialProcess.stderr.on('data', (data) => {
      if (!resolved) {
        resolved = true;
        resolve({ success: false, error: data.toString().trim() });
      }
    });

    activeSerialProcess.on('exit', () => {
      activeSerialProcess = null;
      if (mainWindow) {
        mainWindow.webContents.send('serial-disconnected');
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ success: false, error: 'Connection timed out. Check if port is in use or scope is powered on.' });
      }
    }, 3500);
  });
});

// Periodic hardware scanner to alert UI on cable plug / power-on
let lastDetectedPortsKey = '';
setInterval(() => {
  if (!mainWindow) return;
  exec('reg query HKLM\\HARDWARE\\DEVICEMAP\\SERIALCOMM', (err, stdout) => {
    if (!err && stdout) {
      const matches = stdout.match(/REG_SZ\s+(COM\d+)/gi);
      if (matches) {
        const currentPorts = matches.map(m => m.replace(/REG_SZ\s+/i, '').trim().toUpperCase()).sort().join(',');
        if (currentPorts !== lastDetectedPortsKey) {
          lastDetectedPortsKey = currentPorts;
          mainWindow.webContents.send('com-ports-changed', currentPorts.split(','));
        }
      }
    }
  });
}, 1800);

ipcMain.handle('serial-send', (event, command) => {
  if (activeSerialProcess && activeSerialProcess.stdin.writable) {
    activeSerialProcess.stdin.write(command + '\n');
    return true;
  }
  return false;
});

function disconnectSerial() {
  if (activeSerialProcess) {
    try {
      activeSerialProcess.stdin.write('QUIT\n');
      activeSerialProcess.kill();
    } catch (e) {}
    activeSerialProcess = null;
  }
}

ipcMain.handle('serial-disconnect', () => {
  disconnectSerial();
  return true;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  disconnectSerial();
  if (process.platform !== 'darwin') app.quit();
});
