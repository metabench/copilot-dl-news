const { app, BrowserWindow, ipcMain } = require('electron');
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
  ipcMain.on('selection-made', (event, selection) => {
    // Print selection to stdout as JSON
    console.log(JSON.stringify({ selection }));
    app.quit();
  });

  // Handle close/cancel
  ipcMain.on('cancel', () => {
    console.log(JSON.stringify({ selection: null, cancelled: true }));
    app.quit();
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
