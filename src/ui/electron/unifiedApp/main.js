'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
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
  const serverPath = path.join(appRoot, 'src', 'ui', 'server', 'unifiedApp', 'server.js');
  const nodeExecutable = process.env.COPILOT_NODE_PATH || process.env.NODE_EXE || 'node';
  const output = { stdout: '', stderr: '' };

  const server = spawn(nodeExecutable, [serverPath, '--port', String(port)], {
    cwd: appRoot,
    env: {
      ...process.env,
      DB_PATH: process.env.DB_PATH || path.join(appRoot, 'data', 'news.db')
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  server.stdout?.on('data', (chunk) => {
    output.stdout += chunk.toString();
  });

  server.stderr?.on('data', (chunk) => {
    output.stderr += chunk.toString();
  });

  await waitForHttp(`http://127.0.0.1:${port}/`, 20_000, server, output);

  const close = async () => {
    try {
      server.kill('SIGTERM');
    } catch {
      // ignore
    }

    await new Promise((resolve) => setTimeout(resolve, 300));

    try {
      server.kill('SIGKILL');
    } catch {
      // ignore
    }
  };

  return { server, close, appRoot };
}

function waitForHttp(url, timeoutMs, child, output) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    let finished = false;

    const fail = (error) => {
      if (finished) return;
      finished = true;
      reject(error);
    };

    const check = () => {
      if (finished) return;
      if (Date.now() > deadline) {
        return fail(new Error([
          `Unified server did not respond at ${url}`,
          output.stdout ? `--- stdout ---\n${output.stdout.slice(0, 1200)}` : '',
          output.stderr ? `--- stderr ---\n${output.stderr.slice(0, 1200)}` : ''
        ].filter(Boolean).join('\n')));
      }

      const req = http.get(url, { timeout: 1000, headers: { Connection: 'close' }, agent: false }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          finished = true;
          resolve();
          return;
        }
        setTimeout(check, 250);
      });

      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', () => setTimeout(check, 250));
    };

    child.once('exit', (code, signal) => {
      fail(new Error([
        `Unified server exited before responding (code=${code}, signal=${signal || 'none'})`,
        output.stdout ? `--- stdout ---\n${output.stdout.slice(0, 1200)}` : '',
        output.stderr ? `--- stderr ---\n${output.stderr.slice(0, 1200)}` : ''
      ].filter(Boolean).join('\n')));
    });

    check();
  });
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

function parseStringArg(flag, defaultValue = null) {
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return defaultValue;
}

async function captureScreenshot(win, screenshotPath, delayMs) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  const image = await win.webContents.capturePage();
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  fs.writeFileSync(screenshotPath, image.toPNG());
}

electronApp.whenReady().then(async () => {
  const port = parsePortFromArgv();
  const smoke = hasArg('--smoke');
  const screenshotPath = parseStringArg('--screenshot');
  const urlPath = parseStringArg('--url-path', '/');
  const smokeTimeoutMs = parseNumberArg('--smoke-timeout-ms', 12_000);
  const closeTimeoutMs = parseNumberArg('--smoke-close-timeout-ms', 3_000);
  const screenshotDelayMs = parseNumberArg('--screenshot-delay-ms', 1_200);
  const smokeReadyDelayMs = parseNumberArg('--smoke-ready-delay-ms', 1_000);

  // Keep a stable URL so cached assets work.
  const url = `http://127.0.0.1:${port}${urlPath}`;

  const { close } = await startUnifiedServer({ port });

  const win = createWindow(url);

  let shuttingDown = false;
  const shutdown = async (code) => {
    if (shuttingDown) return;
    shuttingDown = true;

    const closeDeadline = smoke ? closeTimeoutMs : 10_000;
    try {
      await Promise.race([
        close(),
        new Promise((resolve) => setTimeout(resolve, closeDeadline))
      ]);
    } catch {
      // ignore
    }

    try {
      electronApp.exit(code);
    } catch {
      process.exit(code);
    }

    if (smoke) {
      setTimeout(() => {
        process.exit(code);
      }, 500);
    }
  };

  if (smoke || screenshotPath) {
    const timer = setTimeout(() => {
      shutdown(1);
    }, smokeTimeoutMs);

    win.webContents.once('did-finish-load', async () => {
      clearTimeout(timer);
      if (screenshotPath) {
        try {
          await captureScreenshot(win, path.resolve(screenshotPath), screenshotDelayMs);
        } catch (error) {
          console.error('[Electron Unified] screenshot failed:', error.message);
          await shutdown(1);
          return;
        }
      } else if (smokeReadyDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, smokeReadyDelayMs));
      }
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
    if (shuttingDown) {
      return;
    }
    e.preventDefault();
    await shutdown(0);
  });

  electronApp.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(url);
    }
  });
}).catch((error) => {
  console.error('[Electron Unified] startup failed:', error && error.stack ? error.stack : String(error));
  try {
    electronApp.exit(1);
  } catch {
    process.exit(1);
  }
});

electronApp.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    electronApp.quit();
  }
});
