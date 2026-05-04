/**
 * Electron wrapper for jsgui3-idiomatic-progress lab
 * 
 * Starts the Express server in the background and opens a BrowserWindow.
 * 
 * Usage:
 *   npx electron labs/jsgui3-idiomatic-progress/electron-main.js
 *   npx electron labs/jsgui3-idiomatic-progress/electron-main.js --smoke
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 3102;
const URL = `http://localhost:${PORT}`;
const SMOKE_TIMEOUT = 5000;

let mainWindow = null;
let serverProcess = null;

/**
 * Start the Express server as a child process
 */
function startServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, 'server.js');
    serverProcess = spawn('node', [serverPath], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let started = false;

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[server]', output.trim());
      
      // Detect when server is ready
      if (!started && output.includes('Server running at')) {
        started = true;
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('[server-err]', data.toString().trim());
    });

    serverProcess.on('error', (err) => {
      reject(err);
    });

    serverProcess.on('close', (code) => {
      if (!started) {
        reject(new Error(`Server exited with code ${code}`));
      }
      console.log('[server] Process exited with code', code);
    });

    // Timeout if server doesn't start
    setTimeout(() => {
      if (!started) {
        reject(new Error('Server startup timeout'));
      }
    }, 10000);
  });
}

/**
 * Create the main browser window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'jsgui3 Idiomatic Progress Lab',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    backgroundColor: '#1a1a2e'
  });

  mainWindow.loadURL(URL);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Cleanup before exit
 */
function cleanup() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
}

app.on('ready', async () => {
  console.log('[electron] Starting jsgui3-idiomatic-progress lab...');

  try {
    await startServer();
    console.log('[electron] Server ready, creating window...');
    createWindow();

    // Smoke test mode - exit after a few seconds
    if (process.argv.includes('--smoke')) {
      console.log('[electron] Smoke test mode - exiting in 5s');
      setTimeout(() => {
        cleanup();
        app.exit(0);
      }, SMOKE_TIMEOUT);
    }
  } catch (err) {
    console.error('[electron] Failed to start:', err);
    cleanup();
    app.exit(1);
  }
});

app.on('window-all-closed', () => {
  cleanup();
  app.quit();
});

app.on('before-quit', () => {
  cleanup();
});
