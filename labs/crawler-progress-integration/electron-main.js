/**
 * Electron wrapper for Unified Progress Dashboard
 * 
 * Usage:
 *   npx electron labs/crawler-progress-integration/electron-main.js
 *   npx electron labs/crawler-progress-integration/electron-main.js --crawl-url https://example.com
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

// Parse args
const args = process.argv.slice(2);
function hasArg(name) { return args.includes(name); }
function getArg(name, def) {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
}

const port = parseInt(getArg('--port', '3100'), 10);
const smokeTest = hasArg('--smoke');

let serverProcess = null;
let mainWindow = null;

async function startServer() {
  return new Promise((resolve, reject) => {
    const serverArgs = [
      path.join(__dirname, 'server.js'),
      '--port', String(port)
    ];

    // Forward relevant args
    if (hasArg('--crawl-url')) {
      serverArgs.push('--crawl-url', getArg('--crawl-url'));
    }
    if (hasArg('--crawl-pages')) {
      serverArgs.push('--crawl-pages', getArg('--crawl-pages'));
    }
    if (hasArg('--analysis-limit')) {
      serverArgs.push('--analysis-limit', getArg('--analysis-limit'));
    }
    if (hasArg('--no-auto-start')) {
      serverArgs.push('--no-auto-start');
    }
    if (hasArg('-v') || hasArg('--verbose')) {
      serverArgs.push('--verbose');
    }

    serverProcess = spawn('node', serverArgs, {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let started = false;

    serverProcess.stdout.on('data', (data) => {
      const text = data.toString();
      process.stdout.write(text);
      
      if (!started && text.includes('http://localhost')) {
        started = true;
        setTimeout(resolve, 500); // Give server a moment to be fully ready
      }
    });

    serverProcess.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    serverProcess.on('error', (err) => {
      if (!started) reject(err);
    });

    serverProcess.on('close', (code) => {
      if (!started) {
        reject(new Error(`Server exited with code ${code}`));
      }
    });

    // Timeout
    setTimeout(() => {
      if (!started) {
        reject(new Error('Server startup timeout'));
      }
    }, 15000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: 'Unified Progress Dashboard',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL(`http://localhost:${port}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function main() {
  await app.whenReady();

  console.log('Starting server...');
  await startServer();
  console.log(`Server ready on port ${port}`);

  createWindow();

  // Smoke test: exit after 8 seconds
  if (smokeTest) {
    console.log('Smoke test mode: exiting in 8 seconds...');
    setTimeout(() => {
      console.log('Smoke test complete');
      app.quit();
    }, 8000);
  }

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

// Cleanup on exit
app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

process.on('SIGINT', () => {
  if (serverProcess) serverProcess.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (serverProcess) serverProcess.kill();
  process.exit(0);
});

main().catch((err) => {
  console.error('Failed to start:', err.message);
  if (serverProcess) serverProcess.kill();
  process.exit(1);
});
