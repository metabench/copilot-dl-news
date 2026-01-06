'use strict';

/**
 * Electron Crawler App - Main Process
 * 
 * Uses HTTP requests to a crawl-server.js backend instead of forking a worker.
 * This avoids ESM/CommonJS compatibility issues with Electron's bundled Node.js.
 * 
 * Logs are sent to the MCP memory server for AI agent access.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const { createMcpLogger } = require('../src/utils/mcpLogger');

const API_PORT = 3099;
const API_BASE = `http://localhost:${API_PORT}`;

// Create a session ID based on current date
const sessionId = `electron-${new Date().toISOString().slice(0, 10)}`;

// Create logger with MCP integration
const log = createMcpLogger({
  app: 'ELEC',
  session: sessionId,
  console: true,  // Also log to console
  file: true,     // Write to log file
  mcp: false      // Disable async MCP calls (use file-based logging instead)
});

let mainWindow;
let serverProcess = null;
let activeJobId = null;
let pollInterval = null;

let crawlConfig = {
  url: 'https://www.theguardian.com',
  maxPages: 1000,
  maxDepth: 3,
  concurrency: 2
};

// Simple HTTP request helper
function httpRequest(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, API_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function waitForServer(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await httpRequest('GET', '/healthz');
      return true;
    } catch (e) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return false;
}

function startServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, 'crawl-server.js');
    log.info('Starting crawl server', { serverPath });
    
    serverProcess = spawn('node', [serverPath], {
      cwd: path.join(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CRAWL_API_PORT: API_PORT }
    });

    serverProcess.stdout.on('data', (data) => {
      log.debug('Server stdout', { output: data.toString().trim() });
    });

    serverProcess.stderr.on('data', (data) => {
      log.warn('Server stderr', { output: data.toString().trim() });
    });

    serverProcess.on('error', (err) => {
      log.error('Server process error', { error: err.message });
      reject(err);
    });

    serverProcess.on('exit', (code) => {
      log.info('Server exited', { code });
      serverProcess = null;
    });

    // Wait for server to be ready
    waitForServer().then(ok => {
      if (ok) {
        log.info('Server is ready');
        resolve();
      } else {
        reject(new Error('Server failed to start'));
      }
    });
  });
}

function stopServer() {
  if (serverProcess) {
    log.info('Stopping server');
    serverProcess.kill();
    serverProcess = null;
  }
}

async function fetchStats() {
  try {
    const stats = await httpRequest('GET', '/api/stats');
    if (stats.status === 'ok' && mainWindow) {
      mainWindow.webContents.send('article-stats', {
        total: stats.total,
        daily: stats.daily
      });
    }
  } catch (err) {
    log.error('Failed to fetch stats', { error: err.message });
  }
}

async function startCrawl() {
  if (activeJobId) {
    mainWindow.webContents.send('crawl-log', '⚠️ Crawl already running');
    return;
  }

  log.info('Starting crawl', { config: crawlConfig });
  mainWindow.webContents.send('crawl-started', crawlConfig);
  mainWindow.webContents.send('crawl-log', `🕷️ Starting crawl: ${crawlConfig.url}`);
  mainWindow.webContents.send('crawl-log', `   Max pages: ${crawlConfig.maxPages}, Concurrency: ${crawlConfig.concurrency}`);

  try {
    const result = await httpRequest('POST', '/v1/operations/quickDiscovery/start', {
      startUrl: crawlConfig.url,
      overrides: {
        maxPages: crawlConfig.maxPages,
        maxDepth: crawlConfig.maxDepth,
        concurrency: crawlConfig.concurrency
      }
    });

    if (result.status === 'ok' && result.jobId) {
      activeJobId = result.jobId;
      log.info('Job started', { jobId: activeJobId });
      mainWindow.webContents.send('crawl-log', `📋 Job started: ${activeJobId}`);
      startPolling();
    } else {
      throw new Error(result.error?.message || 'Failed to start crawl');
    }
  } catch (err) {
    log.error('Failed to start crawl', { error: err.message });
    mainWindow.webContents.send('crawl-error', err.message);
    mainWindow.webContents.send('crawl-log', `❌ ${err.message}`);
  }
}

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  
  pollInterval = setInterval(async () => {
    if (!activeJobId) {
      clearInterval(pollInterval);
      pollInterval = null;
      return;
    }

    try {
      const result = await httpRequest('GET', `/v1/jobs/${activeJobId}`);
      
      if (result.status === 'ok' && result.job) {
        const job = result.job;
        
        // Send progress update
        mainWindow.webContents.send('crawl-progress', {
          downloaded: job.progress?.downloaded || 0,
          errors: job.progress?.errors || 0,
          lastUrl: job.progress?.lastUrl
        });

        // Check if job is complete
        if (job.status === 'completed') {
          mainWindow.webContents.send('crawl-complete', {
            downloaded: job.progress?.downloaded || 0
          });
          mainWindow.webContents.send('crawl-log', `✅ Crawl complete!`);
          activeJobId = null;
          clearInterval(pollInterval);
          pollInterval = null;
          fetchStats(); // Refresh stats
        } else if (job.status === 'error') {
          mainWindow.webContents.send('crawl-error', job.error || 'Unknown error');
          mainWindow.webContents.send('crawl-log', `❌ ${job.error}`);
          activeJobId = null;
          clearInterval(pollInterval);
          pollInterval = null;
        }
      }
    } catch (err) {
      log.warn('Poll error', { error: err.message });
    }
  }, 1000);
}

async function stopCrawl() {
  if (activeJobId) {
    try {
      log.info('Stopping crawl', { jobId: activeJobId });
      await httpRequest('POST', `/v1/jobs/${activeJobId}/stop`);
      mainWindow.webContents.send('crawl-log', '🛑 Stop requested...');
    } catch (err) {
      log.error('Failed to stop crawl', { error: err.message });
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 500,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#1a1a2e',
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.webContents.send('config-update', crawlConfig);
    fetchStats();
    // Auto-start crawl after window is ready
    setTimeout(() => startCrawl(), 500);
  });
}

// IPC handlers
ipcMain.on('stop-crawl', () => stopCrawl());
ipcMain.on('start-crawl', () => startCrawl());
ipcMain.on('update-config', (event, config) => {
  crawlConfig = { ...crawlConfig, ...config };
  mainWindow.webContents.send('config-update', crawlConfig);
  mainWindow.webContents.send('crawl-log', `⚙️ Config updated`);
});
ipcMain.on('get-config', () => {
  mainWindow.webContents.send('config-update', crawlConfig);
});
ipcMain.on('refresh-stats', () => fetchStats());

// App lifecycle
app.whenReady().then(async () => {
  try {
    log.info('App starting', { session: sessionId });
    await startServer();
    createWindow();
  } catch (err) {
    log.error('Failed to start app', { error: err.message });
    app.quit();
  }
});

app.on('window-all-closed', () => {
  log.info('App closing');
  if (pollInterval) clearInterval(pollInterval);
  stopServer();
  app.quit();
});
