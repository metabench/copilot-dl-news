const { app, BrowserWindow, ipcMain, shell, globalShortcut } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const treeKill = require('tree-kill');

let mainWindow;
const runningProcesses = new Map(); // filePath -> { pid, process }

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#121212',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true  // Keep available but don't open automatically
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#121212',
      symbolColor: '#D4AF37',
      height: 30
    }
  });

  mainWindow.loadFile('index.html');
  
  // Register Ctrl+Shift+I to toggle dev tools (for debugging)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers

ipcMain.handle('scan-servers', async () => {
  return new Promise((resolve, reject) => {
    const tool = path.join(__dirname, '..', 'tools', 'dev', 'js-server-scan.js');
    const child = spawn('node', [tool, '--progress', '--html-only'], {
      cwd: path.join(__dirname, '..')
    });

    let servers = null;
    let error = '';
    let buffer = '';

    child.stdout.on('data', (data) => {
      buffer += data.toString();
      
      // Process complete JSON lines
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const msg = JSON.parse(line);
          
          if (msg.type === 'count') {
            // Initial count - send to renderer
            if (mainWindow) {
              mainWindow.webContents.send('scan-progress', { type: 'count', total: msg.total });
            }
          } else if (msg.type === 'progress') {
            // Progress update - already debounced at source, forward directly
            if (mainWindow) {
              mainWindow.webContents.send('scan-progress', {
                type: 'progress',
                current: msg.current,
                total: msg.total,
                file: msg.file
              });
            }
          } else if (msg.type === 'result') {
            // Final result
            servers = msg.servers;
          }
        } catch (e) {
          // Not JSON, ignore
        }
      }
    });

    child.stderr.on('data', (data) => {
      error += data.toString();
    });

    child.on('close', (code) => {
      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const msg = JSON.parse(buffer);
          if (msg.type === 'result') {
            servers = msg.servers;
          }
        } catch (e) {
          // Ignore
        }
      }
      
      if (servers === null) {
        console.error('Scan failed:', error);
        reject(new Error(`Scan failed with code ${code}: ${error}`));
        return;
      }
      
      try {
        // Filter out the tool itself and test files if desired
        const filtered = servers.filter(s => !s.file.includes('js-server-scan.js'));
        
        // Add running status
        const result = filtered.map(s => ({
          ...s,
          running: runningProcesses.has(s.file),
          pid: runningProcesses.get(s.file)?.pid
        }));
        
        // Send completion signal
        if (mainWindow) {
          mainWindow.webContents.send('scan-progress', { type: 'complete' });
        }
        
        resolve(result);
      } catch (e) {
        reject(e);
      }
    });
  });
});

ipcMain.handle('start-server', async (event, filePath) => {
  if (runningProcesses.has(filePath)) {
    return { success: false, message: 'Already running' };
  }

  const child = spawn('node', [filePath], {
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  runningProcesses.set(filePath, { pid: child.pid, process: child });

  // Track startup state - servers that exit quickly with errors are startup failures
  let startupPhase = true;
  let stderrBuffer = '';
  let stdoutBuffer = '';
  const STARTUP_WINDOW_MS = 3000; // Consider it a startup failure if it crashes within 3 seconds
  
  setTimeout(() => {
    startupPhase = false;
  }, STARTUP_WINDOW_MS);

  child.stdout.on('data', (data) => {
    const text = data.toString();
    if (startupPhase) {
      stdoutBuffer += text;
    }
    if (mainWindow) {
      mainWindow.webContents.send('server-log', { filePath, type: 'stdout', data: text });
    }
  });

  child.stderr.on('data', (data) => {
    const text = data.toString();
    if (startupPhase) {
      stderrBuffer += text;
    }
    if (mainWindow) {
      mainWindow.webContents.send('server-log', { filePath, type: 'stderr', data: text });
    }
  });

  child.on('close', (code) => {
    runningProcesses.delete(filePath);
    if (mainWindow) {
      // If server exited during startup phase with non-zero code, it's a startup failure
      if (startupPhase && code !== 0) {
        const errorMessage = stderrBuffer || stdoutBuffer || `Server exited with code ${code}`;
        mainWindow.webContents.send('server-startup-error', { 
          filePath, 
          code, 
          error: errorMessage 
        });
      }
      mainWindow.webContents.send('server-status-change', { filePath, running: false });
    }
  });

  return { success: true, pid: child.pid };
});

ipcMain.handle('stop-server', async (event, filePath) => {
  const procInfo = runningProcesses.get(filePath);
  if (!procInfo) {
    return { success: false, message: 'Not running' };
  }

  return new Promise((resolve) => {
    treeKill(procInfo.pid, 'SIGKILL', (err) => {
      if (err) {
        resolve({ success: false, message: err.message });
      } else {
        runningProcesses.delete(filePath);
        resolve({ success: true });
      }
    });
  });
});

ipcMain.handle('open-in-browser', async (event, url) => {
  // Try Chrome Canary first, fall back to default browser
  const chromeCanaryPaths = [
    'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\Google\\Chrome SxS\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome SxS\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome SxS\\Application\\chrome.exe'
  ];
  
  let chromeCanaryPath = null;
  const fs = require('fs');
  for (const p of chromeCanaryPaths) {
    if (fs.existsSync(p)) {
      chromeCanaryPath = p;
      break;
    }
  }
  
  if (chromeCanaryPath) {
    spawn(chromeCanaryPath, [url], { detached: true, stdio: 'ignore' }).unref();
    return { success: true, browser: 'Chrome Canary' };
  } else {
    // Fall back to default browser
    await shell.openExternal(url);
    return { success: true, browser: 'default' };
  }
});
