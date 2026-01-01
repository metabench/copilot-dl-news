'use strict';

const path = require('path');
const { app: electronApp, BrowserWindow } = require('electron');

function getDevRepoRoot() {
  // __dirname = <repo>/src/ui/electron/unifiedApp
  return path.resolve(__dirname, '..', '..', '..', '..');
}

function resolveAppRoot() {
  // In packaged apps, resources live under process.resourcesPath.
  // We also ship docs/design/data as extraResources in electron-builder config.
  if (electronApp.isPackaged) {
    return process.resourcesPath;
  }

  return getDevRepoRoot();
}

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: '#101113',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadURL(url);

  return win;
}

async function startUnifiedServer({ port }) {
  const appRoot = resolveAppRoot();
  process.chdir(appRoot);

  const unified = require('../../server/unifiedApp/server');
  const unifiedExpressApp = unified.app;

  const mounted = unified.mountDashboardModules(unifiedExpressApp, {
    dbPath: process.env.DB_PATH
  });

  const server = await new Promise((resolve, reject) => {
    const s = unifiedExpressApp.listen(port, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  const close = async () => {
    try {
      mounted.close();
    } catch {
      // ignore
    }

    await new Promise((resolve) => {
      try {
        server.close(() => resolve());
      } catch {
        resolve();
      }
    });
  };

  return { server, close, appRoot };
}

function parsePortFromArgv() {
  const argv = process.argv;
  const index = argv.indexOf('--port');
  if (index >= 0 && argv[index + 1]) {
    const n = Number(argv[index + 1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 3170;
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

  // Keep a stable URL so cached assets work.
  const url = `http://127.0.0.1:${port}`;

  const { close } = await startUnifiedServer({ port });

  const win = createWindow(url);

  let shuttingDown = false;
  const shutdown = async (code) => {
    if (shuttingDown) return;
    shuttingDown = true;

    try {
      await close();
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
    // Ensure we close the server even if window closes quickly.
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
