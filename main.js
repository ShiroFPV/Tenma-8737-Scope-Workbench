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

// Comprehensive Windows COM Port Scanner
ipcMain.handle('get-com-ports-detailed', () => {
  return new Promise((resolve) => {
    const cmd = 'powershell -NoProfile -Command "Get-PnpDevice -Class Ports | Select-Object FriendlyName, InstanceId, Status, Present | ConvertTo-Json"';
    exec(cmd, (err, stdout) => {
      let ports = [];
      if (!err && stdout) {
        try {
          const parsed = JSON.parse(stdout);
          const list = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
          ports = list.map(p => {
            const match = p.FriendlyName ? p.FriendlyName.match(/\((COM\d+)\)/i) : null;
            return {
              port: match ? match[1].toUpperCase() : (p.FriendlyName || 'COM1'),
              name: p.FriendlyName || 'Serial Device',
              present: p.Present === true,
              status: p.Status || 'Unknown'
            };
          });
        } catch (e) {}
      }

      // Also query registry HKLM\HARDWARE\DEVICEMAP\SERIALCOMM for active COM mappings
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
                  present: true,
                  status: 'OK'
                });
              }
            });
          }
        }

        if (ports.length === 0) {
          ports.push({ port: 'COM1', name: 'COM1 (Communications Port)', present: true, status: 'OK' });
        }

        resolve(ports);
      });
    });
  });
});

// Query all connected USB & Hardware devices
ipcMain.handle('get-all-usb-devices', () => {
  return new Promise((resolve) => {
    const cmd = 'powershell -NoProfile -Command "Get-PnpDevice -PresentOnly | Where-Object { $_.Class -in @(\'Ports\',\'USB\',\'USBDevice\',\'Unknown\') -or $_.InstanceId -like \'*USB*\' } | Select-Object FriendlyName, InstanceId, Class, Status | ConvertTo-Json"';
    exec(cmd, (err, stdout) => {
      if (err || !stdout) {
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []));
      } catch (e) {
        resolve([]);
      }
    });
  });
});

// Native Windows Serial Port Connection using .NET System.IO.Ports
ipcMain.handle('serial-connect', (event, { port, baudRate }) => {
  return new Promise((resolve) => {
    disconnectSerial();

    const script = `
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
      $sp = New-Object System.IO.Ports.SerialPort '${port}', ${baudRate || 115200}, 'None', 8, 'One'
      $sp.ReadTimeout = 500
      $sp.WriteTimeout = 500
      try {
        $sp.Open()
        Write-Output "OPEN_OK"
      } catch {
        Write-Output "OPEN_ERR: $($_.Exception.Message)"
        exit 1
      }

      $reader = [System.IO.StreamReader]::new([System.Console]::OpenStandardInput())
      while ($sp.IsOpen) {
        if ($reader.Peek() -ge 0) {
          $line = $reader.ReadLine()
          if ($line -eq 'QUIT') { break }
          try { $sp.WriteLine($line) } catch {}
        }
        try {
          if ($sp.BytesToRead -gt 0) {
            $incoming = $sp.ReadExisting()
            Write-Output "RX:$incoming"
          }
        } catch {}
        Start-Sleep -Milliseconds 25
      }
      $sp.Close()
    `;

    activeSerialProcess = spawn('powershell', ['-NoProfile', '-Command', script]);

    let resolved = false;

    activeSerialProcess.stdout.on('data', (data) => {
      const text = data.toString();
      if (!resolved) {
        if (text.includes('OPEN_OK')) {
          resolved = true;
          resolve({ success: true, port });
        } else if (text.includes('OPEN_ERR')) {
          resolved = true;
          resolve({ success: false, error: text.trim() });
        }
      }

      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('RX:')) {
          const payload = line.replace('RX:', '').trim();
          if (mainWindow && payload) {
            mainWindow.webContents.send('serial-rx-data', payload);
          }
        }
      }
    });

    activeSerialProcess.stderr.on('data', (data) => {
      if (!resolved) {
        resolved = true;
        resolve({ success: false, error: data.toString() });
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
