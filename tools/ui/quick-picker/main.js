const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const fs = require('fs');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    frame: false, // Frameless for a "tool" feel
    alwaysOnTop: true,
    transparent: true,
    resizable: true
  });

  mainWindow.loadFile('index.html');

  // Parse args to find options file
  // Electron args are weird, they include the binary and script
  // We look for --options-file=<path>
  const argv = process.argv;
  let optionsFilePath = null;
  
  for (const arg of argv) {
    if (arg.startsWith('--options-file=')) {
      optionsFilePath = arg.split('=')[1];
    }
  }

  if (optionsFilePath) {
    try {
      const content = fs.readFileSync(optionsFilePath, 'utf8');
      const options = JSON.parse(content);
      
      mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('set-options', options);
      });
    } catch (e) {
      console.error('Failed to read options file:', e);
      app.quit();
    }
  }

  // Handle selection
  ipcMain.on('selection-made', (event, payload) => {
    // Allow payload to be a string or structured object
    const data = (payload && typeof payload === 'object' && !Array.isArray(payload)) ? payload : { selection: payload };
    const option = data.option || null;
    const selection = data.selection ?? (option ? option.value || option.label : null);
    const phase = data.phase || (option && option.phase) || null;

    console.log(JSON.stringify({ selection, option, phase }));
    app.quit();
  });

  // Handle close/cancel
  ipcMain.on('cancel', () => {
    console.log(JSON.stringify({ selection: null, cancelled: true }));
    app.quit();
  });

  // Context menu per option
  ipcMain.on('context-menu', (event, payload) => {
    if (!payload || !payload.option) return;
    const option = payload.option;
    const targetWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;

    const sendAction = (action) => {
      event.sender.send('context-action', { action, option });
    };

    const menu = Menu.buildFromTemplate([
      { label: '🔍 Explore', click: () => sendAction('explore') },
      { label: '🧪 Test', click: () => sendAction('test') },
      { label: '🛠️ Implement', click: () => sendAction('implement') },
      { label: '🛡️ Fix', click: () => sendAction('fix') }
    ]);

    menu.popup({ window: targetWindow });
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
