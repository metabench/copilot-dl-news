/**
 * Crawl Widget - Electron Main Process
 * Compact Winamp-style crawl control widget with Industrial Luxury Obsidian theme
 */
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const http = require('http');

let mainWindow;
let crawlProcess = null;
let sseConnection = null;
let newsDb = null;

let telemetryHttpServer = null;
let telemetryExpressApp = null;
let telemetryIntegration = null;
let telemetryJob = null;
let telemetryCrawlType = null;
let telemetryIsPaused = false;
let telemetryLastPhase = null;

const BASE_PATH = path.join(__dirname, '..');
const DEFAULT_SERVER_PORT = 3099; // Port for the telemetry server
const DB_PATH = path.join(BASE_PATH, 'data', 'news.db');

function ensureTelemetryServer(port = DEFAULT_SERVER_PORT) {
  if (telemetryHttpServer && telemetryIntegration && telemetryExpressApp) {
    return getTelemetryInfo(port);
  }

  // Express lives in the repo root (Node resolution finds ../node_modules).
  const express = require('express');
  const { TelemetryIntegration } = require(path.join(BASE_PATH, 'src', 'crawler', 'telemetry'));

  telemetryExpressApp = express();
  telemetryIntegration = new TelemetryIntegration({
    allowOrigin: '*',
    historyLimit: 1000,
    heartbeatInterval: 25_000
  });

  telemetryIntegration.mountSSE(telemetryExpressApp, '/api/crawl-events');

  telemetryExpressApp.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      hasCrawl: Boolean(crawlProcess),
      jobId: telemetryJob,
      crawlType: telemetryCrawlType,
      paused: telemetryIsPaused,
      clients: telemetryIntegration.getClientCount()
    });
  });

  telemetryHttpServer = http.createServer(telemetryExpressApp);
  telemetryHttpServer.listen(port, '127.0.0.1', () => {
    console.log(`[CrawlWidget] Telemetry SSE server listening on http://127.0.0.1:${port}`);
  });

  return getTelemetryInfo(port);
}

function getTelemetryInfo(port = DEFAULT_SERVER_PORT) {
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    baseUrl,
    sseUrl: `${baseUrl}/api/crawl-events`,
    healthUrl: `${baseUrl}/api/health`
  };
}

function shutdownTelemetryServer() {
  if (telemetryHttpServer) {
    try {
      telemetryHttpServer.close();
    } catch {}
    telemetryHttpServer = null;
  }

  if (telemetryIntegration) {
    try {
      telemetryIntegration.destroy();
    } catch {}
    telemetryIntegration = null;
  }

  telemetryExpressApp = null;
  telemetryJob = null;
  telemetryCrawlType = null;
  telemetryIsPaused = false;
  telemetryLastPhase = null;
}

/**
 * Initialize database connection for news sources
 */
function initDatabase() {
  try {
    // Use better-sqlite3 from crawl-widget's node_modules (rebuilt for Electron)
    const Database = require('better-sqlite3');
    const NewsDatabase = require(path.join(BASE_PATH, 'src', 'db', 'sqlite', 'v1', 'SQLiteNewsDatabase.js'));
    
    // Open the database with better-sqlite3
    const dbHandle = new Database(DB_PATH);
    newsDb = new NewsDatabase(dbHandle);
    
    // Run the favicon migration if needed
    try {
      newsDb.db.exec(`ALTER TABLE news_websites ADD COLUMN favicon_data TEXT`);
    } catch (e) { /* Column may already exist */ }
    try {
      newsDb.db.exec(`ALTER TABLE news_websites ADD COLUMN favicon_content_type TEXT`);
    } catch (e) { /* Column may already exist */ }
    try {
      newsDb.db.exec(`ALTER TABLE news_websites ADD COLUMN favicon_updated_at TEXT`);
    } catch (e) { /* Column may already exist */ }
    try {
      newsDb.db.exec(`ALTER TABLE news_websites ADD COLUMN favicon_fetch_error TEXT`);
    } catch (e) { /* Column may already exist */ }
    
    // Seed default news sources
    const { seedNewsSources } = require(path.join(BASE_PATH, 'src', 'db', 'sqlite', 'v1', 'newsSourcesSeeder.js'));
    seedNewsSources(newsDb.db, { logger: console });
    
    console.log('[CrawlWidget] Database initialized');
    return true;
  } catch (err) {
    console.error('[CrawlWidget] Database init failed:', err.message);
    return false;
  }
}

// Widget dimensions - compact but readable (80% wider, 20% taller than original)
const WIDGET_WIDTH = 576;
const WIDGET_HEIGHT = 380;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    minWidth: 400,
    minHeight: 280,
    maxWidth: WIDGET_WIDTH + 200,
    maxHeight: WIDGET_HEIGHT + 150,
    backgroundColor: '#050508',
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true
    },
    frame: false, // Frameless for compact look
    titleBarStyle: 'hidden',
    alwaysOnTop: true, // Widget stays on top
    skipTaskbar: false
  });

  mainWindow.loadFile('index.html');
  
  // Open devtools in development
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
  
  // Toggle dev tools with Ctrl+Shift+I
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
}

app.whenReady().then(() => {
  // Initialize database before creating window
  initDatabase();

  // Start telemetry server (Express SSE) so the renderer can use EventSource.
  ensureTelemetryServer(DEFAULT_SERVER_PORT);
  
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  // Clean up crawl process if running
  if (crawlProcess) {
    crawlProcess.kill();
    crawlProcess = null;
  }

  shutdownTelemetryServer();

  // Close database connection
  if (newsDb) {
    try { newsDb.close(); } catch {}
    newsDb = null;
  }
  if (process.platform !== 'darwin') app.quit();
});

// ═══════════════════════════════════════════════════════════════════════════
// IPC Handlers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get available crawl types - matches src/db/sqlite/v1/seeders.js
 */
ipcMain.handle('get-crawl-types', async () => {
  return [
    { id: 'basic', label: 'Basic', icon: '🕷️', description: 'Follow links only (no sitemap)' },
    { id: 'sitemap-only', label: 'Sitemap Only', icon: '🗺️', description: 'Use only the sitemap to discover pages' },
    { id: 'basic-with-sitemap', label: 'Basic + Sitemap', icon: '🔗', description: 'Follow links and also use the sitemap' },
    { id: 'intelligent', label: 'Intelligent', icon: '🧠', description: 'Intelligent planning (hubs + sitemap + heuristics)' },
    { id: 'discover-structure', label: 'Discover Structure', icon: '🔍', description: 'Map site structure without downloading articles' },
    { id: 'gazetteer', label: 'Gazetteer', icon: '🌍', description: 'Legacy alias for geography gazetteer crawl' },
    { id: 'wikidata', label: 'Wikidata', icon: '📚', description: 'Only ingest gazetteer data from Wikidata' },
    { id: 'geography', label: 'Geography', icon: '🗺️', description: 'Aggregate gazetteer data from Wikidata plus OpenStreetMap' }
  ];
});

ipcMain.handle('get-telemetry-info', async () => {
  return { success: true, ...ensureTelemetryServer(DEFAULT_SERVER_PORT) };
});

/**
 * Start a crawl
 */
ipcMain.handle('start-crawl', async (event, { crawlType, startUrl, config = {} }) => {
  if (crawlProcess) {
    return { success: false, message: 'A crawl is already running' };
  }

  try {
    const crawlScript = path.join(BASE_PATH, 'crawl.js');
    const args = [crawlScript];
    
    // Enable JSON progress output for widget parsing
    args.push('--progress-json');
    
    // Pass crawl type to CLI
    if (crawlType && crawlType !== 'basic') {
      args.push('--crawl-type', crawlType);
    }
    
    // Pass start URL if provided
    if (startUrl) {
      args.push('--start-url', startUrl);
    }

    crawlProcess = spawn('node', args, {
      cwd: BASE_PATH,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const pid = crawlProcess.pid;

    // Telemetry session setup for this crawl
    ensureTelemetryServer(DEFAULT_SERVER_PORT);
    telemetryJob = `widget-${pid}-${Date.now()}`;
    telemetryCrawlType = crawlType || 'basic';
    telemetryIsPaused = false;
    telemetryLastPhase = null;

    if (telemetryIntegration?.bridge) {
      telemetryIntegration.bridge.emitStarted({
        jobId: telemetryJob,
        crawlType: telemetryCrawlType,
        startUrl: startUrl || null,
        config: config || null
      }, { jobId: telemetryJob, crawlType: telemetryCrawlType });
    }

    // Stream stdout to renderer + feed standardized telemetry
    crawlProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (mainWindow) {
        mainWindow.webContents.send('crawl-log', { type: 'stdout', data: output });
        
        // Parse progress from output - try multiple formats
        try {
          // Format 1: Explicit JSON progress {"type":"progress",...}
          const jsonMatch = output.match(/\{"type":"progress"[^}]*\}/);
          if (jsonMatch) {
            const progress = JSON.parse(jsonMatch[0]);
            mainWindow.webContents.send('crawl-progress', progress);

            if (telemetryIntegration?.bridge) {
              telemetryIntegration.bridge.emitProgress({
                visited: progress.visited,
                queued: progress.queued,
                errors: progress.errors,
                downloaded: progress.downloaded,
                articles: progress.articles,
                skipped: progress.skipped,
                percentComplete: progress.percentComplete,
                total: progress.total,
                currentUrl: progress.currentUrl,
                currentAction: progress.currentAction,
                phase: progress.phase,
                throttled: progress.throttled,
                throttleReason: progress.throttleReason,
                throttleDomain: progress.throttleDomain
              }, { jobId: telemetryJob, crawlType: telemetryCrawlType });

              if (progress.phase && progress.phase !== telemetryLastPhase) {
                telemetryLastPhase = progress.phase;
                telemetryIntegration.bridge.emitPhaseChange(progress.phase, { jobId: telemetryJob, crawlType: telemetryCrawlType });
              }
            }
            return;
          }
          
          // Format 2: PROGRESS {...} format from CrawlerEvents
          const progressLineMatch = output.match(/PROGRESS\s+(\{.*\})/);
          if (progressLineMatch) {
            try {
              const progress = JSON.parse(progressLineMatch[1]);
              // Extract current URL from currentDownloads if available
              const currentDownloads = progress.currentDownloads || [];
              const currentUrl = currentDownloads.length > 0 ? currentDownloads[0].url : null;
              
              mainWindow.webContents.send('crawl-progress', {
                visited: progress.visited || 0,
                queued: progress.queueSize || 0,
                errors: progress.errors || 0,
                articles: progress.saved || progress.found || 0,
                downloaded: progress.downloaded || 0,
                paused: progress.paused || false,
                throttled: progress.slowMode || false,
                throttleReason: progress.slowModeReason || null,
                currentUrl: currentUrl,
                currentAction: currentDownloads.length > 0 ? 'downloading' : null
              });

              if (telemetryIntegration?.bridge) {
                telemetryIntegration.bridge.emitProgress({
                  visited: progress.visited || 0,
                  queued: progress.queueSize || 0,
                  errors: progress.errors || 0,
                  downloaded: progress.downloaded || 0,
                  articles: progress.saved || progress.found || 0,
                  percentComplete: progress.percentComplete,
                  total: progress.total,
                  currentUrl,
                  currentAction: currentDownloads.length > 0 ? 'downloading' : null,
                  throttled: progress.slowMode || false,
                  throttleReason: progress.slowModeReason || null,
                  phase: progress.phase || null
                }, { jobId: telemetryJob, crawlType: telemetryCrawlType });

                if (progress.phase && progress.phase !== telemetryLastPhase) {
                  telemetryLastPhase = progress.phase;
                  telemetryIntegration.bridge.emitPhaseChange(progress.phase, { jobId: telemetryJob, crawlType: telemetryCrawlType });
                }
              }
              return;
            } catch (e) {
              // Continue to other formats if JSON parse fails
            }
          }
          
          // Format 3: Telemetry progress event {"event":"crawl:progress",...}
          const telemetryMatch = output.match(/\{"event":"crawl:progress"[^}]*"data":\{([^}]+)\}/);
          if (telemetryMatch) {
            const dataStr = '{' + telemetryMatch[1] + '}';
            const progress = JSON.parse(dataStr);
            mainWindow.webContents.send('crawl-progress', progress);

            if (telemetryIntegration?.bridge) {
              telemetryIntegration.bridge.emitProgress(progress, { jobId: telemetryJob, crawlType: telemetryCrawlType });
            }
            return;
          }
          
          // Format 4: Parse stats from log lines like "Visited: 123, Queued: 456"
          const statsPatterns = [
            /visited[:\s]+(\d+)/i,
            /queued?[:\s]+(\d+)/i,
            /queue[:\s]+(\d+)/i,
            /errors?[:\s]+(\d+)/i,
            /downloaded[:\s]+(\d+)/i,
            /articles?[:\s]+(\d+)/i
          ];
          
          const visited = output.match(/visited[:\s]+(\d+)/i);
          const queued = output.match(/queue(?:d)?[:\s]+(\d+)/i);
          const errors = output.match(/errors?[:\s]+(\d+)/i);
          const downloaded = output.match(/downloaded[:\s]+(\d+)/i);
          const articles = output.match(/articles?[:\s]+(\d+)/i);
          
          if (visited || queued || downloaded) {
            const progress = {
              visited: visited ? parseInt(visited[1], 10) : undefined,
              queued: queued ? parseInt(queued[1], 10) : undefined,
              errors: errors ? parseInt(errors[1], 10) : undefined,
              articles: articles ? parseInt(articles[1], 10) : (downloaded ? parseInt(downloaded[1], 10) : undefined)
            };

            mainWindow.webContents.send('crawl-progress', progress);

            if (telemetryIntegration?.bridge) {
              telemetryIntegration.bridge.emitProgress(progress, { jobId: telemetryJob, crawlType: telemetryCrawlType });
            }
            return;
          }
          
          // Format 5: Detect activity from common log patterns
          const activityPatterns = {
            crawling: /(?:crawling|fetching|visiting)[:\s]+(.+)/i,
            downloaded: /(?:downloaded|saved|stored)[:\s]+(.+)/i,
            queued: /(?:queued|enqueued|added)[:\s]+(.+)/i,
            skipped: /(?:skipped|filtered|ignored)[:\s]+(.+)/i,
            error: /(?:error|failed|exception)[:\s]+(.+)/i
          };
          
          for (const [action, pattern] of Object.entries(activityPatterns)) {
            const match = output.match(pattern);
            if (match) {
              const progress = {
                currentAction: action,
                currentUrl: match[1]?.trim().substring(0, 200)
              };

              mainWindow.webContents.send('crawl-progress', progress);

              if (telemetryIntegration?.bridge) {
                telemetryIntegration.bridge.emitProgress(progress, { jobId: telemetryJob, crawlType: telemetryCrawlType });
              }
              break;
            }
          }
        } catch (e) {
          // Ignore parse errors, progress will just not update
        }
      }
    });

    crawlProcess.stderr.on('data', (data) => {
      const output = data.toString();
      if (mainWindow) {
        mainWindow.webContents.send('crawl-log', { type: 'stderr', data: output });
      }
    });

    crawlProcess.on('close', (code, signal) => {
      crawlProcess = null;

      if (telemetryIntegration?.bridge && telemetryJob) {
        telemetryIntegration.bridge.emitStopped({
          reason: signal || (code === 0 ? 'completed' : `exit:${code}`),
          stats: { code, signal }
        }, { jobId: telemetryJob, crawlType: telemetryCrawlType });
      }

      if (mainWindow) {
        mainWindow.webContents.send('crawl-stopped', { code, signal });
      }
    });

    crawlProcess.on('error', (err) => {
      crawlProcess = null;
      if (mainWindow) {
        mainWindow.webContents.send('crawl-error', { message: err.message });
      }
    });

    return { success: true, pid };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

/**
 * Pause/Resume crawl (toggles pause state)
 */
ipcMain.handle('toggle-pause', async () => {
  if (!crawlProcess) {
    return { success: false, message: 'No crawl running' };
  }
  
  // Send SIGUSR1 to toggle pause (if supported by crawler)
  try {
    crawlProcess.kill('SIGUSR1');

    telemetryIsPaused = !telemetryIsPaused;
    if (telemetryIntegration?.bridge && telemetryJob) {
      if (telemetryIsPaused) {
        telemetryIntegration.bridge.emitPaused({ jobId: telemetryJob, crawlType: telemetryCrawlType });
      } else {
        telemetryIntegration.bridge.emitResumed({ jobId: telemetryJob, crawlType: telemetryCrawlType });
      }
    }

    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

/**
 * Stop the crawl
 */
ipcMain.handle('stop-crawl', async () => {
  if (!crawlProcess) {
    return { success: false, message: 'No crawl running' };
  }

  try {
    if (telemetryIntegration?.bridge && telemetryJob) {
      telemetryIntegration.bridge.emitStopped({ reason: 'user-stop' }, { jobId: telemetryJob, crawlType: telemetryCrawlType });
    }

    crawlProcess.kill('SIGTERM');
    // Force kill after 3 seconds if still running
    setTimeout(() => {
      if (crawlProcess) {
        crawlProcess.kill('SIGKILL');
        crawlProcess = null;
      }
    }, 3000);
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

/**
 * Get crawl status
 */
ipcMain.handle('get-crawl-status', async () => {
  return {
    isRunning: crawlProcess !== null,
    pid: crawlProcess?.pid || null
  };
});

/**
 * Close the widget
 */
ipcMain.handle('close-widget', async () => {
  if (crawlProcess) {
    crawlProcess.kill('SIGTERM');
    crawlProcess = null;
  }
  mainWindow.close();
});

/**
 * Minimize the widget
 */
ipcMain.handle('minimize-widget', async () => {
  mainWindow.minimize();
});

/**
 * Connect to telemetry SSE endpoint
 */
ipcMain.handle('connect-telemetry', async (event, { port = DEFAULT_SERVER_PORT }) => {
  // Telemetry is handled via IPC for now (stdout parsing)
  // Future: Could connect to actual SSE endpoint
  return { success: true, connected: true };
});

// ═══════════════════════════════════════════════════════════════════════════
// News Sources IPC Handlers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get news sources for the dropdown (with favicons)
 */
ipcMain.handle('get-news-sources', async () => {
  if (!newsDb) {
    return { success: false, sources: [], message: 'Database not initialized' };
  }
  
  try {
    const sources = newsDb.getNewsWebsitesForWidget(true);
    return { success: true, sources };
  } catch (err) {
    return { success: false, sources: [], message: err.message };
  }
});

/**
 * Fetch missing favicons for news sources
 * This runs in the background and updates the database
 */
ipcMain.handle('fetch-missing-favicons', async () => {
  if (!newsDb) {
    return { success: false, message: 'Database not initialized' };
  }
  
  try {
    const { fetchAndStoreFavicons } = require(path.join(BASE_PATH, 'src', 'utils', 'faviconFetcher.js'));
    const websites = newsDb.getWebsitesNeedingFavicons();
    
    if (websites.length === 0) {
      return { success: true, fetched: 0, failed: 0, message: 'All favicons up to date' };
    }
    
    const result = await fetchAndStoreFavicons(newsDb, websites, {
      onProgress: (current, total, website) => {
        if (mainWindow) {
          mainWindow.webContents.send('favicon-progress', { current, total, url: website.url });
        }
      },
      logger: console
    });
    
    return { success: true, fetched: result.success, failed: result.failed };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

/**
 * Add a custom news source
 */
ipcMain.handle('add-news-source', async (event, { url, label }) => {
  if (!newsDb) {
    return { success: false, message: 'Database not initialized' };
  }
  
  try {
    const { deriveNewsWebsiteFields } = require(path.join(BASE_PATH, 'src', 'db', 'sqlite', 'v1', 'newsSourcesSeeder.js'));
    const fields = deriveNewsWebsiteFields(url);
    
    const id = newsDb.addNewsWebsite({
      url,
      label: label || null,
      parent_domain: fields.parent_domain,
      url_pattern: fields.url_pattern,
      website_type: fields.website_type,
      added_by: 'widget'
    });
    
    return { success: true, id };
  } catch (err) {
    return { success: false, message: err.message };
  }
});
