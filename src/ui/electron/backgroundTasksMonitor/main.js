const http = require('http');
const electron = require('electron');

if (!electron || !electron.app || !electron.BrowserWindow) {
  throw new Error('This entrypoint must be launched via `electron`, not `node`.');
}

const { app, BrowserWindow } = electron;

// This entrypoint opens a "distance monitor" Electron window pointing at an
// ALREADY RUNNING background-tasks server (either unified or deprecated-ui).
// Start the server first with: npm run ui:unified  (port 3007)
//   or: npm run ui:deprecated  (port 3000)
//
// Environment variables:
//   BG_TASKS_URL  - Full URL to background-tasks page (default: auto-detect)
//   BG_TASKS_ZOOM - Zoom factor for distance viewing (default: 1.25)
//   BG_TASKS_DARK - Set to "1" for dark overlay injection

const CANDIDATE_URLS = [
  'http://localhost:41000/background-tasks', // deprecated-ui (auto-port)
  'http://localhost:3000/background-tasks',  // deprecated-ui (standard)
  'http://localhost:3007/background-tasks',  // alternate port
  'http://localhost:3010/background-tasks',  // standalone
];

/**
 * Check if a URL is reachable with a quick HEAD request.
 * @param {string} url
 * @returns {Promise<boolean>}
 */
function isReachable(url) {
  return new Promise((resolve) => {
    const { hostname, port, pathname } = new URL(url);
    const req = http.request({ hostname, port, path: pathname, method: 'HEAD', timeout: 1500 }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

/**
 * Find first reachable background-tasks URL.
 * @returns {Promise<string|null>}
 */
async function findBackgroundTasksUrl() {
  if (process.env.BG_TASKS_URL) {
    return process.env.BG_TASKS_URL;
  }
  for (const url of CANDIDATE_URLS) {
    if (await isReachable(url)) {
      return url;
    }
  }
  return null;
}

/**
 * @param {string} url
 */
function createWindow(url) {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    backgroundColor: '#0b1020',
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  win.once('ready-to-show', () => {
    win.show();
    win.maximize();
  });

  win.webContents.on('did-finish-load', async () => {
    try {
      // Distance-friendly defaults
      const zoom = process.env.BG_TASKS_ZOOM ? Number(process.env.BG_TASKS_ZOOM) : 1.25;
      if (Number.isFinite(zoom) && zoom > 0.5 && zoom < 3) {
        win.webContents.setZoomFactor(zoom);
      }

      // Optional lightweight "dark glass" overlay.
      if (process.env.BG_TASKS_DARK === '1') {
        await win.webContents.insertCSS(`
          body { background: #0b1020 !important; color: #e8eefc !important; }
          .task-creator, .task-list-container, .telemetry-container { background: #121a33 !important; color: #e8eefc !important; }
          .task-card { background: rgba(255,255,255,0.04) !important; border-color: rgba(255,255,255,0.12) !important; }
          .progress-text, .progress-message, .task-metadata { color: rgba(232,238,252,0.75) !important; }
          .task-type { color: #e8eefc !important; }
          .telemetry-stream { background: rgba(0,0,0,0.25) !important; }
          .telemetry-row { border-color: rgba(255,255,255,0.08) !important; }
        `);
      }
    } catch (_) {
      // Non-fatal (some Electron builds may block insertCSS under sandbox).
    }
  });

  win.loadURL(url);

  return win;
}

app.whenReady().then(async () => {
  const url = await findBackgroundTasksUrl();
  
  if (!url) {
    const { dialog } = electron;
    dialog.showErrorBox(
      'No Background Tasks Server Found',
      'Start a server first:\n\n' +
      '  npm run ui:unified    (port 3007)\n' +
      '  npm run ui:deprecated (port 3000)\n\n' +
      'Or set BG_TASKS_URL environment variable.'
    );
    app.quit();
    return;
  }

  console.log(`[background-tasks-monitor] Connecting to ${url}`);
  createWindow(url);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
