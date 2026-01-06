/**
 * Place Matching Observable - Electron App Entry Point
 * 
 * Wraps the place matching progress display in an Electron window.
 */
'use strict';

const { app: electronApp, BrowserWindow } = require('electron');
const path = require('path');
const { createPlaceMatchingServer } = require('./place-matching-server');

let mainWindow = null;
let server = null;

const DEFAULT_PORT = 3098;

function parsePortFromArgv() {
  const portIndex = process.argv.indexOf('--port');
  if (portIndex >= 0 && process.argv[portIndex + 1]) {
    const port = parseInt(process.argv[portIndex + 1], 10);
    if (Number.isFinite(port) && port > 0) return port;
  }
  return DEFAULT_PORT;
}

function parseLimitFromArgv() {
  const limitIndex = process.argv.indexOf('--limit');
  if (limitIndex >= 0 && process.argv[limitIndex + 1]) {
    const limit = parseInt(process.argv[limitIndex + 1], 10);
    if (Number.isFinite(limit) && limit > 0) return limit;
  }
  return null;
}

function parseRuleLevelFromArgv() {
  const idx = process.argv.indexOf('--rule-level');
  if (idx >= 0 && process.argv[idx + 1]) {
    const level = parseInt(process.argv[idx + 1], 10);
    if (Number.isFinite(level) && level > 0) return level;
  }
  return 1;
}

function hasArg(flag) {
  return process.argv.includes(flag);
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    title: 'Place Matching Progress',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true
  });

  mainWindow.loadURL(url);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

electronApp.whenReady().then(async () => {
  const port = parsePortFromArgv();
  const limit = parseLimitFromArgv();
  const ruleLevel = parseRuleLevelFromArgv();
  const autoStart = !hasArg('--no-auto-start');

  console.log('[electron-place-matching] Starting server...');
  console.log(`  Port: ${port}`);
  console.log(`  Limit: ${limit || 'none'}`);
  console.log(`  Rule Level: ${ruleLevel}`);
  console.log(`  Auto start: ${autoStart}`);

  server = createPlaceMatchingServer({
    port,
    limit,
    autoStart,
    ruleLevel
  });

  const { url } = await server.start();

  const win = createWindow(url);

  let shuttingDown = false;
  const shutdown = async (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log('[electron-place-matching] Shutting down...');

    try {
      await server.stop();
    } catch (e) {
      console.error('[electron-place-matching] Server stop error:', e.message);
    }

    try {
      electronApp.exit(code);
    } catch {
      process.exit(code);
    }
  };

  win.on('closed', async () => {
    await shutdown(0);
  });

  electronApp.on('before-quit', async (e) => {
    e.preventDefault();
    await shutdown(0);
  });

  electronApp.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(`http://localhost:${port}`);
    }
  });
});

electronApp.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    electronApp.quit();
  }
});

process.on('uncaughtException', (err) => {
  console.error('[electron-place-matching] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[electron-place-matching] Unhandled rejection:', reason);
});
