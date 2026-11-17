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
    frame: false, // Frameless for custom ShiroFPV titlebar & window controls
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

  // WebSerial port selector handler
  sess.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    if (portList && portList.length > 0) {
      callback(portList[0].portId);
    } else {
      callback('');
    }
  });

  // WebUSB device selector handler
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

// Window management IPC
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

// Launch Windows Device Manager
ipcMain.handle('open-device-manager', () => {
  exec('devmgmt.msc');
  return true;
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

// Detailed COM Port Enumeration for Windows 11
ipcMain.handle('get-com-ports-detailed', () => {
  return new Promise((resolve) => {
    const psScript = `
      $ports = Get-CimInstance Win32_PnPEntity | Where-Object { $_.PNPClass -eq 'Ports' -or $_.Name -match '\\(COM\\d+\\)' } | Select-Object Name, DeviceID, Manufacturer
      if ($ports) { $ports | ConvertTo-Json } else { '[]' }
    `;
    exec(`powershell -NoProfile -Command "${psScript.replace(/\r?\n/g, ' ')}"`, (err, stdout) => {
      if (err) {
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        const list = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
        // Extract COM port number e.g. "COM3"
        const formatted = list.map(p => {
          const match = p.Name ? p.Name.match(/\((COM\d+)\)/) : null;
          return {
            port: match ? match[1] : p.Name,
            name: p.Name || 'Serial Device',
            manufacturer: p.Manufacturer || 'Unknown',
            deviceId: p.DeviceID || ''
          };
        });
        resolve(formatted);
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

      # Standard input listener loop
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

      // Relay incoming lines to renderer
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

    // Timeout fallback (3 seconds)
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
