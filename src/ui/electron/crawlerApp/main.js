'use strict';

/**
 * Crawler Electron App - Minimal GUI for running crawls with progress display
 * Uses subprocess approach to avoid native module conflicts.
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');

const DEFAULT_CONFIG = {
  url: 'https://www.theguardian.com',
  maxPages: 1000,
  maxDepth: 3,
  timeout: 60000,
  operation: 'basicArticleCrawl'
};

// Config file path (alongside the app or in user data)
function getConfigPath() {
  // Use config in the crawlerApp directory so it's easy to edit
  return path.join(__dirname, 'crawler-config.json');
}

function loadConfig() {
  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      const loaded = JSON.parse(data);
      console.log('[Config] Loaded from', configPath);
      return { ...DEFAULT_CONFIG, ...loaded };
    }
  } catch (err) {
    console.error('[Config] Error loading config:', err.message);
  }
  console.log('[Config] Using defaults');
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  const configPath = getConfigPath();
  try {
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
    console.log('[Config] Saved to', configPath);
    return true;
  } catch (err) {
    console.error('[Config] Error saving config:', err.message);
    return false;
  }
}

let config = loadConfig();
let mainWindow = null;
let crawlProcess = null;
let crawlState = {
  running: false,
  jobId: null,
  downloaded: 0,
  queued: 0,
  errors: 0,
  startTime: null
};

// Track downloaded URLs for the UI
let downloadedUrls = [];

function getAppRoot() {
  return path.resolve(__dirname, '..', '..', '..', '..');
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 700,
    minWidth: 320,
    minHeight: 500,
    resizable: true,
    backgroundColor: '#0a0d14',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  mainWindow.on('closed', () => {
    if (crawlProcess) {
      crawlProcess.kill();
      crawlProcess = null;
    }
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    sendUpdate();
    // Auto-start crawl if --auto-start flag is passed
    if (process.argv.includes('--auto-start')) {
      // Send loading message to renderer
      mainWindow.webContents.send('loading:show', 'Starting crawler...');
      setTimeout(() => startCrawl(), 800); // Small delay for UI to initialize
    } else {
      // Hide loading overlay immediately if not auto-starting
      mainWindow.webContents.send('loading:hide');
    }
  });
}

function sendUpdate() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('crawl:update', {
      config,
      state: crawlState
    });
  }
}

function startCrawl() {
  if (crawlState.running || crawlProcess) return;

  const miniCrawlPath = path.join(getAppRoot(), 'tools', 'dev', 'mini-crawl.js');
  
  crawlState = {
    running: true,
    jobId: 'crawl-' + Date.now(),
    downloaded: 0,
    queued: 0,
    errors: 0,
    startTime: Date.now()
  };
  downloadedUrls = []; // Reset for new crawl
  sendUpdate();

  crawlProcess = spawn('node', [
    miniCrawlPath,
    config.url,
    '--max-pages', String(config.maxPages),
    '--max-depth', String(config.maxDepth),
    '--timeout', String(config.timeout),
    '--operation', config.operation
  ], {
    cwd: getAppRoot(),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  crawlProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('PAGE ')) {
        // PAGE events can be either "PAGE <url>" or "PAGE {json}"
        const rest = trimmed.slice(5).trim();
        let url = rest;
        let status = 200;
        let size = 0;
        let source = 'network';
        
        // Try parsing as JSON first (new format)
        if (rest.startsWith('{')) {
          try {
            const json = JSON.parse(rest);
            url = json.url || json.normalizedUrl || rest;
            // httpStatus is null for cache hits, so check status string too
            if (json.httpStatus) {
              status = json.httpStatus;
            } else if (json.status === 'cache') {
              status = 304; // Use 304 to indicate cached
            }
            size = json.bytesDownloaded || 0;
            source = json.source || 'network';
          } catch (e) {
            // Not JSON, use as URL
          }
        }
        
        // Add to downloaded URLs (don't increment counter - use PROGRESS for that)
        downloadedUrls.push({
          url,
          timestamp: new Date().toISOString(),
          index: downloadedUrls.length + 1,
          status,
          size,
          source
        });
        sendUpdate();
      }
      else if (trimmed.startsWith('PROGRESS ')) {
        try {
          const json = JSON.parse(trimmed.slice(9));
          // Use downloaded count from PROGRESS JSON as the authoritative source
          const newDownloaded = json.downloaded ?? json.visited ?? crawlState.downloaded;
          crawlState.downloaded = newDownloaded;
          crawlState.queued = json.queueSize || 0;
          crawlState.errors = json.errors || 0;
          console.log(`[PROGRESS] ${crawlState.downloaded}/${config.maxPages} pages, queue=${crawlState.queued}`);
          sendUpdate();
        } catch (e) {}
      }
      else if (trimmed.startsWith('QUEUE ')) {
        try {
          const json = JSON.parse(trimmed.slice(6));
          if (json.queueSize !== undefined) {
            crawlState.queued = json.queueSize;
            sendUpdate();
          }
        } catch (e) {}
      }
    }
  });

  crawlProcess.stderr.on('data', (data) => {
    console.error('stderr:', data.toString());
  });

  crawlProcess.on('close', (code) => {
    crawlProcess = null;
    crawlState.running = false;
    sendUpdate();
  });

  crawlProcess.on('error', (err) => {
    console.error('process error:', err);
    crawlProcess = null;
    crawlState.running = false;
    crawlState.errors++;
    sendUpdate();
  });
}

function stopCrawl() {
  if (crawlProcess) {
    crawlProcess.kill('SIGTERM');
    crawlProcess = null;
  }
  crawlState.running = false;
  sendUpdate();
}

ipcMain.handle('crawl:start', async () => {
  startCrawl();
  return { success: true };
});

ipcMain.handle('crawl:stop', async () => {
  stopCrawl();
  return { success: true };
});

ipcMain.handle('config:get', async () => {
  return config;
});

ipcMain.handle('config:set', async (event, newConfig) => {
  config = { ...config, ...newConfig };
  saveConfig(config); // Persist to file
  sendUpdate();
  return config;
});

ipcMain.handle('state:get', async () => {
  return { config, state: crawlState };
});

ipcMain.handle('urls:get', async () => {
  return downloadedUrls;
});

ipcMain.handle('url:analyze', async (event, url) => {
  // Query the database for URL analysis
  try {
    const Database = require('better-sqlite3');
    const dbPath = path.join(getAppRoot(), 'data', 'news.db');
    const db = new Database(dbPath, { readonly: true });
    
    // Get URL info
    const urlRow = db.prepare('SELECT * FROM urls WHERE url = ?').get(url);
    
    // Get HTTP response info
    let httpResponse = null;
    if (urlRow) {
      httpResponse = db.prepare(`
        SELECT * FROM http_responses 
        WHERE url_id = ? 
        ORDER BY fetched_at DESC 
        LIMIT 1
      `).get(urlRow.id);
    }
    
    // Get content storage info
    let content = null;
    if (urlRow) {
      content = db.prepare(`
        SELECT id, url_id, content_type, byte_size, created_at 
        FROM content_storage 
        WHERE url_id = ? 
        ORDER BY created_at DESC 
        LIMIT 1
      `).get(urlRow.id);
    }
    
    db.close();
    
    return {
      url,
      urlRecord: urlRow || null,
      httpResponse: httpResponse || null,
      content: content || null,
      found: !!urlRow
    };
  } catch (err) {
    console.error('Error analyzing URL:', err);
    return {
      url,
      error: err.message,
      found: false
    };
  }
});

ipcMain.handle('db:stats', async () => {
  try {
    const Database = require('better-sqlite3');
    const dbPath = path.join(getAppRoot(), 'data', 'news.db');
    const db = new Database(dbPath, { readonly: true });
    
    const totalUrls = db.prepare('SELECT COUNT(*) as count FROM urls').get().count;
    const totalFetches = db.prepare('SELECT COUNT(*) as count FROM http_responses').get().count;
    
    // Today's fetches (UTC)
    const todayFetches = db.prepare(`
      SELECT COUNT(*) as count FROM http_responses 
      WHERE date(fetched_at) = date('now')
    `).get().count;
    
    // Unique hosts
    const uniqueHosts = db.prepare('SELECT COUNT(DISTINCT host) as count FROM urls').get().count;
    
    // Content storage stats
    const storageStats = db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(byte_size), 0) as bytes 
      FROM content_storage
    `).get();
    
    // Last fetch
    const lastFetch = db.prepare(`
      SELECT h.fetched_at, u.url 
      FROM http_responses h 
      JOIN urls u ON h.url_id = u.id 
      ORDER BY h.fetched_at DESC 
      LIMIT 1
    `).get();
    
    db.close();
    
    return {
      totalUrls,
      totalFetches,
      todayFetches,
      uniqueHosts,
      storageBytes: storageStats.bytes,
      storageCount: storageStats.count,
      lastFetch: lastFetch?.fetched_at || null,
      lastUrl: lastFetch?.url || null
    };
  } catch (err) {
    console.error('Error getting DB stats:', err);
    return { error: err.message };
  }
});

ipcMain.handle('db:clear-cache', async () => {
  try {
    const Database = require('better-sqlite3');
    const dbPath = path.join(getAppRoot(), 'data', 'news.db');
    const db = new Database(dbPath);
    
    // Only clear http_responses, not urls or content_storage
    const result = db.prepare('DELETE FROM http_responses').run();
    db.close();
    
    return { success: true, count: result.changes };
  } catch (err) {
    console.error('Error clearing cache:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('url:content', async (event, url) => {
  try {
    const Database = require('better-sqlite3');
    const dbPath = path.join(getAppRoot(), 'data', 'news.db');
    const db = new Database(dbPath, { readonly: true });
    
    const urlRow = db.prepare('SELECT id FROM urls WHERE url = ?').get(url);
    if (!urlRow) {
      db.close();
      return { success: false, error: 'URL not found' };
    }
    
    const content = db.prepare(`
      SELECT content FROM content_storage 
      WHERE url_id = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `).get(urlRow.id);
    
    db.close();
    
    if (content?.content) {
      return { success: true, content: content.content };
    } else {
      return { success: false, error: 'No content stored' };
    }
  } catch (err) {
    console.error('Error getting content:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('urls:export', async (event, urls) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export URLs',
      defaultPath: `crawl-urls-${new Date().toISOString().split('T')[0]}.json`,
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'Text', extensions: ['txt'] }
      ]
    });
    
    if (!filePath) {
      return { success: false, cancelled: true };
    }
    
    const ext = path.extname(filePath).toLowerCase();
    let content;
    
    if (ext === '.json') {
      content = JSON.stringify(urls, null, 2);
    } else {
      content = urls.map(u => u.url).join('\n');
    }
    
    fs.writeFileSync(filePath, content);
    return { success: true, count: urls.length, path: filePath };
  } catch (err) {
    console.error('Error exporting URLs:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('logs:open', async () => {
  // Try to find and open log file
  const logsDir = path.join(getAppRoot(), 'tmp');
  shell.openPath(logsDir);
  return { success: true };
});

ipcMain.handle('shell:open', async (event, url) => {
  shell.openExternal(url);
  return { success: true };
});

app.whenReady().then(() => {
  createMainWindow();
  
  // Auto-start crawl if --auto-start flag is passed
  if (process.argv.includes('--auto-start')) {
    console.log('[AUTO-START] Starting crawl automatically...');
    setTimeout(() => startCrawl(), 1000);
  }
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (crawlProcess) {
    crawlProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
