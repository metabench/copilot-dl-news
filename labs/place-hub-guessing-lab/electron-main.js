/**
 * Place Hub Guessing Lab - Electron Entry Point
 * 
 * Wraps the lab server in an Electron window for native desktop experience.
 * Provides event capture and logging back to AI agents.
 */
'use strict';

const { app: electronApp, BrowserWindow, ipcMain } = require('electron');
const { createLabServer } = require('./lab-server');

let mainWindow = null;
let server = null;

const DEFAULT_PORT = 3120;

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
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: '🧪 Place Hub Guessing Lab',
    backgroundColor: '#0f0a08',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true
  });

  mainWindow.loadURL(url);

  // Log page events
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (server?.logEvent) {
      server.logEvent('browser:console', {
        level: ['debug', 'info', 'warning', 'error'][level] || 'info',
        message,
        source: sourceId
      });
    }
  });

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
  const verbose = hasArg('--verbose');
  const verifyOnly = hasArg('--verify');

  console.log('[electron-main] Starting Place Hub Guessing Lab...');
  console.log(`  Port: ${port}`);
  console.log(`  Verbose: ${verbose}`);
  console.log(`  Verify only: ${verifyOnly}`);

  // Start the lab server
  server = createLabServer({
    port,
    verbose
  });

  const { url } = await server.start();

  // If verify-only mode, run tests and exit
  if (verifyOnly) {
    console.log('\n[electron-main] Running verification tests...\n');
    
    const http = require('http');
    http.get(`${url}/api/verify-tests`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', async () => {
        try {
          const result = JSON.parse(data);
          
          console.log('═══════════════════════════════════════════════════════════════');
          console.log('Verification Results');
          console.log('═══════════════════════════════════════════════════════════════');
          console.log('');
          
          for (const test of result.tests) {
            const icon = test.passed ? '✅' : '❌';
            console.log(`${icon} ${test.name}`);
            console.log(`   ${test.details}`);
          }
          
          console.log('');
          console.log('Stats:', JSON.stringify(result.stats, null, 2));
          console.log('');
          console.log(result.allPassed ? '✅ All tests passed' : '❌ Some tests failed');
          
          await server.stop();
          electronApp.exit(result.allPassed ? 0 : 1);
        } catch (err) {
          console.error('Failed to parse results:', err);
          await server.stop();
          electronApp.exit(2);
        }
      });
    }).on('error', async (err) => {
      console.error('Failed to run tests:', err);
      await server.stop();
      electronApp.exit(2);
    });
    
    return;
  }

  // Create window pointing to server
  const win = createWindow(url);

  // Log window creation
  server.logEvent('electron:window-created', { 
    url,
    size: { width: 1400, height: 900 }
  });

  // Handle shutdown
  let shuttingDown = false;
  const shutdown = async (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log('[electron-main] Shutting down...');
    server.logEvent('electron:shutdown', { code });

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
  if (server?.logEvent) {
    server.logEvent('electron:error', { 
      type: 'uncaughtException',
      message: err.message,
      stack: err.stack
    });
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('[electron-main] Unhandled rejection:', reason);
  if (server?.logEvent) {
    server.logEvent('electron:error', { 
      type: 'unhandledRejection',
      reason: String(reason)
    });
  }
});
