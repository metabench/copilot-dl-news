/**
 * Analysis Observable - Electron App Entry Point
 * 
 * Wraps the analysis progress display in an Electron window.
 * Provides a native desktop experience for monitoring long-running analysis.
 */
'use strict';

const { app: electronApp, BrowserWindow } = require('electron');
const path = require('path');
const { createAnalysisServer } = require('./analysis-server');

let mainWindow = null;
let server = null;

const DEFAULT_PORT = 3099;

/**
 * Parse port from command line args
 */
function parsePortFromArgv() {
  const portIndex = process.argv.indexOf('--port');
  if (portIndex >= 0 && process.argv[portIndex + 1]) {
    const port = parseInt(process.argv[portIndex + 1], 10);
    if (Number.isFinite(port) && port > 0) return port;
  }
  return DEFAULT_PORT;
}

/**
 * Parse limit from command line args
 */
function parseLimitFromArgv() {
  const limitIndex = process.argv.indexOf('--limit');
  if (limitIndex >= 0 && process.argv[limitIndex + 1]) {
    const limit = parseInt(process.argv[limitIndex + 1], 10);
    if (Number.isFinite(limit) && limit > 0) return limit;
  }
  return null;
}

/**
 * Parse analysis version from command line args
 */
function parseAnalysisVersionFromArgv() {
  const versionIndex = process.argv.indexOf('--analysis-version');
  if (versionIndex >= 0 && process.argv[versionIndex + 1]) {
    const version = parseInt(process.argv[versionIndex + 1], 10);
    if (Number.isFinite(version) && version > 0) return version;
  }
  return null;
}

/**
 * Check for boolean arg
 */
function hasArg(flag) {
  return process.argv.includes(flag);
}

/**
 * Create the main browser window
 */
function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    title: 'Analysis Progress',
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

/**
 * Main entry point
 */
electronApp.whenReady().then(async () => {
  const port = parsePortFromArgv();
  const limit = parseLimitFromArgv();
  const analysisVersion = parseAnalysisVersionFromArgv();
  const verbose = hasArg('--verbose');
  const dryRun = hasArg('--dry-run');
  const autoStart = !hasArg('--no-auto-start');

  console.log('[electron-main] Starting analysis server...');
  console.log(`  Port: ${port}`);
  console.log(`  Limit: ${limit || 'none'}`);
  console.log(`  Analysis version: ${analysisVersion || 'auto'}`);
  console.log(`  Dry run: ${dryRun}`);
  console.log(`  Auto start: ${autoStart}`);

  // Start the analysis server
  server = createAnalysisServer({
    port,
    limit,
    verbose,
    dryRun,
    autoStart,
    analysisVersion
  });

  const { url } = await server.start();

  // Create window pointing to server
  const win = createWindow(url);

  // Handle shutdown
  let shuttingDown = false;
  const shutdown = async (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log('[electron-main] Shutting down...');

    try {
      await server.stop();
    } catch (e) {
      console.error('[electron-main] Server stop error:', e.message);
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

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('[electron-main] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[electron-main] Unhandled rejection:', reason);
});
