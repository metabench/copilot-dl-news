'use strict';

/**
 * Place Hub Guessing Matrix — Electron App
 * 
 * Dedicated Electron wrapper for the Place Hub Guessing Matrix UI.
 * Provides interactive matrix showing places × websites with verification status.
 * 
 * Features:
 * - Matrix view of places (rows) × websites (columns)
 * - Cell click popup showing place name variants and URL patterns
 * - Hub check commands for verifying place hubs
 * - Analysis freshness indicator
 */

const path = require('path');
const express = require('express');
const { app: electronApp, BrowserWindow, Menu, shell } = require('electron');

/** @type {BrowserWindow|null} */
let mainWindow = null;
let serverCloseHandler = null;

function getDevRepoRoot() {
  // __dirname = <repo>/src/ui/electron/placeHubGuessingApp
  return path.resolve(__dirname, '..', '..', '..', '..');
}

function resolveAppRoot() {
  if (electronApp.isPackaged) {
    return process.resourcesPath;
  }
  return getDevRepoRoot();
}

/**
 * Start the place hub guessing server
 */
async function startServer({ port }) {
  const appRoot = resolveAppRoot();
  process.chdir(appRoot);

  // Load DB access and place hub guessing router
  const { openNewsDb } = require('../../../data/db/dbAccess');
  const { createPlaceHubGuessingRouter } = require('../../server/placeHubGuessing/server');

  // Open database with read-write handle
  const dbConnection = openNewsDb();
  const db = dbConnection.db;

  function getDbRW() {
    return { db };
  }

  // Create Express app
  const expressApp = express();
  expressApp.use(express.urlencoded({ extended: true }));
  expressApp.use(express.json());

  // Mount the place hub guessing routes at root
  const { router, close: closeRouter } = await createPlaceHubGuessingRouter({
    getDbRW
  });
  expressApp.use('/', router);

  // Start listening
  const httpServer = await new Promise((resolve, reject) => {
    const s = expressApp.listen(port, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  const close = async () => {
    try {
      closeRouter();
    } catch {
      // ignore
    }

    try {
      db.close();
    } catch {
      // ignore
    }

    await new Promise((resolve) => {
      try {
        httpServer.close(() => resolve());
      } catch {
        resolve();
      }
    });
  };

  return { server: httpServer, close, appRoot };
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: '🏷️ Place Hub Guessing Matrix',
    backgroundColor: '#101113',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Create application menu
  const menu = Menu.buildFromTemplate([
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Navigate',
      submenu: [
        {
          label: 'Matrix View',
          accelerator: 'CmdOrCtrl+1',
          click: () => mainWindow?.loadURL(url)
        },
        {
          label: 'Refresh Data',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.reload()
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://github.com/your-repo/docs/place-hub-guessing.md')
        }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);

  mainWindow.loadURL(url);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function parsePortFromArgv() {
  const argv = process.argv;
  const index = argv.indexOf('--port');
  if (index >= 0 && argv[index + 1]) {
    const n = Number(argv[index + 1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 3171; // Default port for place hub guessing app
}

function hasArg(flag) {
  return process.argv.includes(flag);
}

function parseNumberArg(flag, defaultValue) {
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) {
    const n = Number(process.argv[index + 1]);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return defaultValue;
}

electronApp.whenReady().then(async () => {
  const port = parsePortFromArgv();
  const smoke = hasArg('--smoke');
  const smokeTimeoutMs = parseNumberArg('--smoke-timeout-ms', 12_000);

  // Build the base URL - navigate to the matrix page
  const url = `http://127.0.0.1:${port}/`;

  try {
    const { close } = await startServer({ port });
    serverCloseHandler = close;
  } catch (err) {
    console.error('Failed to start server:', err);
    electronApp.exit(1);
    return;
  }

  const win = createWindow(url);

  let shuttingDown = false;
  const shutdown = async (code) => {
    if (shuttingDown) return;
    shuttingDown = true;

    try {
      if (serverCloseHandler) await serverCloseHandler();
    } catch {
      // ignore
    }

    try {
      electronApp.exit(code);
    } catch {
      process.exit(code);
    }
  };

  if (smoke) {
    const timer = setTimeout(() => {
      shutdown(1);
    }, smokeTimeoutMs);

    win.webContents.once('did-finish-load', () => {
      clearTimeout(timer);
      shutdown(0);
    });

    win.webContents.once('did-fail-load', () => {
      clearTimeout(timer);
      shutdown(1);
    });
  }

  win.on('closed', async () => {
    await shutdown(0);
  });

  electronApp.on('before-quit', async (e) => {
    e.preventDefault();
    await shutdown(0);
  });

  electronApp.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(url);
    }
  });
});

electronApp.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    electronApp.quit();
  }
});
