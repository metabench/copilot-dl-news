#!/usr/bin/env node
'use strict';

/**
 * Crawl Daemon — Detached background crawl server with HTTP API
 * 
 * This module provides the core daemon functionality that can be run:
 * - Detached from terminal (background mode)
 * - Controlled via HTTP API
 * - Monitored via CLI tools designed for AI agents
 * 
 * Usage (direct):
 *   node src/cli/crawl/daemon.js --start          # Start daemon (foreground)
 *   node src/cli/crawl/daemon.js --start --detach # Start daemon (background)
 *   node src/cli/crawl/daemon.js --stop           # Stop daemon
 *   node src/cli/crawl/daemon.js --status         # Check daemon status
 * 
 * Usage (via CLI):
 *   node tools/dev/crawl-daemon.js start --detach
 *   node tools/dev/crawl-api.js jobs list
 *   node tools/dev/crawl-api.js jobs start siteExplorer https://bbc.com
 */

// ─────────────────────────────────────────────────────────────
// Early console filter setup (BEFORE any requires that might log)
// Reduces noise from internal modules during daemon operation
// ─────────────────────────────────────────────────────────────

const _daemonBlockPatterns = [
  /^\[ProxyManager\]/i,
  /^\[PuppeteerDomainManager\]/i,
  /^\[Resilience\]/i,
  /^Priority config loaded/i,
  /^Enhanced features/i,
  /^Initializing enhanced/i,
  /^SQLite DB initialized/i,
  /^\[dspl\]/i,
  /^\[CountryHub/i,
  /^Country hub/i,
  /^robots\.txt loaded/i,
  /^Found \d+ sitemap/i,
  /^Starting crawler for/i,
  /^Data will be saved/i,
  /^Sitemap enqueue complete/i,
  /^Reached max downloads limit/i,
  /^QUEUE\s/i,           // Queue events (enqueue/dequeue/drop)
  /^PROGRESS\s/i,        // Progress events
  /^TELEMETRY\s/i,       // Telemetry events
  /^MILESTONE\s/i,       // Milestone events
  /^PLANNER_STAGE\s/i,   // Planner events
  /^PROBLEM\s/i,         // Problem events (unless errors)
  /^Enhanced database adapter/i,   // DB adapter initialization
  /^Priority scorer initialized/i, // Planner init
  /^Planner knowledge service/i,   // Planner init
  /^Crawl playbook service/i,      // Planner init
  /Enhanced features enabled/i,    // Enhanced feature summary (anywhere in line)
  /^Fetching:/i,                   // Individual page fetches
  /^Following redirect/i,          // Redirect logging
  /^CACHE\s/i,                     // Cache hit/miss logging
  /^ANALYSIS:/i,                   // Page analysis logging
  /^Saved article:/i,              // Article save logging
  /Crawl completed$/i,             // Crawl completion (at end of line after stripping)
  /Exit reason:/i,                 // Exit reason (anywhere in line)
  /^Pages visited:/i,              // Per-crawl stats (use API instead)
  /^Pages downloaded:/i,           // Per-crawl stats (use API instead)
  /^Articles found:/i,             // Per-crawl stats (use API instead)
  /^Articles saved:/i,             // Per-crawl stats (use API instead)
  /^Database articles:/i           // DB count (use API instead)
];

const _daemonAllowPatterns = [
  /^\[DAEMON\]/i,         // Daemon messages always shown
  /^\[INFO\]/i,           // Logger info always shown
  /^\[WARN\]/i,           // Logger warn always shown
  /^\[ERROR\]/i,          // Logger error always shown
  /^(URL|Operation|Max Pages|Job ID|Duration|Status|Pages|Links):/i
];

// Strip ANSI escape codes for pattern matching
const _stripAnsi = (text) => String(text).replace(/\x1b\[[0-9;]*m/g, '');

const _shouldDaemonBlock = (text) => {
  const raw = String(text);
  const stripped = _stripAnsi(raw).trim();
  // Allow if matches allow pattern (check raw first for logger prefixes)
  if (_daemonAllowPatterns.some(p => p.test(raw.trim()))) return false;
  // Block if matches block pattern (use stripped for content patterns)
  if (_daemonBlockPatterns.some(p => p.test(stripped))) return true;
  return false;
};

// Check if any argument in the console call should be blocked
const _shouldDaemonBlockAny = (args) => {
  // Check each argument - if any matches a block pattern, block the whole line
  for (const arg of args) {
    if (_shouldDaemonBlock(arg)) return true;
  }
  return false;
};

const _origConsoleLog = console.log.bind(console);
const _origConsoleInfo = console.info.bind(console);

console.log = (...args) => {
  if (args.length === 0) return;
  if (!_shouldDaemonBlockAny(args)) _origConsoleLog(...args);
};

console.info = (...args) => {
  if (args.length === 0) return;
  if (!_shouldDaemonBlockAny(args)) _origConsoleInfo(...args);
};

// ─────────────────────────────────────────────────────────────

const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

// Default configuration
const DEFAULT_PORT = 3099;
const PID_FILE = path.join(process.cwd(), 'tmp', 'crawl-daemon.pid');
const LOG_FILE = path.join(process.cwd(), 'tmp', 'crawl-daemon.log');

/**
 * Configuration for the daemon
 */
function getDaemonConfig(overrides = {}) {
  const base = {
    port: overrides.port || parseInt(process.env.CRAWL_DAEMON_PORT, 10) || DEFAULT_PORT,
    pidFile: overrides.pidFile || PID_FILE,
    logFile: overrides.logFile || LOG_FILE,
    quietMode: overrides.quietMode ?? true,  // Minimize console output by default
    logLevel: overrides.logLevel || 'info'   // info, warn, error, debug
  };
  
  // Only spread overrides that are defined (don't overwrite with undefined)
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) {
      base[k] = v;
    }
  }
  
  return base;
}

/**
 * Create a quiet logger that minimizes console noise
 */
function createDaemonLogger(config) {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const currentLevel = levels[config.logLevel] || 1;

  const logToFile = (level, ...args) => {
    if (config.logFile) {
      const timestamp = new Date().toISOString();
      const message = `[${timestamp}] [${level.toUpperCase()}] ${args.join(' ')}\n`;
      try {
        fs.appendFileSync(config.logFile, message);
      } catch (e) {
        // Ignore file write errors
      }
    }
  };

  const shouldLog = (level) => levels[level] >= currentLevel;

  return {
    debug: (...args) => {
      logToFile('debug', ...args);
      if (!config.quietMode && shouldLog('debug')) console.log('[DEBUG]', ...args);
    },
    info: (...args) => {
      logToFile('info', ...args);
      if (!config.quietMode && shouldLog('info')) console.log('[INFO]', ...args);
    },
    warn: (...args) => {
      logToFile('warn', ...args);
      if (shouldLog('warn')) console.warn('[WARN]', ...args);
    },
    error: (...args) => {
      logToFile('error', ...args);
      if (shouldLog('error')) console.error('[ERROR]', ...args);
    },
    // Always log (for startup/shutdown messages)
    always: (...args) => {
      logToFile('info', ...args);
      console.log(...args);
    }
  };
}

/**
 * Check if daemon is already running
 */
function isDaemonRunning(config) {
  const { pidFile } = config;
  
  if (!fs.existsSync(pidFile)) {
    return { running: false, pid: null };
  }
  
  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    
    // Check if process is actually running
    try {
      process.kill(pid, 0); // Signal 0 = check existence
      return { running: true, pid };
    } catch (e) {
      // Process not running, clean up stale PID file
      fs.unlinkSync(pidFile);
      return { running: false, pid: null };
    }
  } catch (e) {
    return { running: false, pid: null };
  }
}

/**
 * Write PID file
 */
function writePidFile(config, pid) {
  const dir = path.dirname(config.pidFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(config.pidFile, String(pid));
}

/**
 * Remove PID file
 */
function removePidFile(config) {
  if (fs.existsSync(config.pidFile)) {
    fs.unlinkSync(config.pidFile);
  }
}

/**
 * Start the daemon server
 */
async function startDaemon(config) {
  const logger = createDaemonLogger(config);
  
  // Check if already running
  const status = isDaemonRunning(config);
  if (status.running) {
    logger.error(`Daemon already running (PID ${status.pid})`);
    return { success: false, error: 'already_running', pid: status.pid };
  }
  
  // Lazy-load heavy modules only when starting
  const { createCrawlApiServer, createCrawlService } = require('../../server/crawl-api');
  const { InProcessCrawlJobRegistry } = require('../../server/crawl-api/v1/core/InProcessCrawlJobRegistry');
  const Database = require('better-sqlite3');
  const { TelemetryIntegration } = require('../../core/crawler/telemetry/TelemetryIntegration');
  
  // Open database
  const dbPath = path.join(process.cwd(), 'data', 'news.db');
  const db = new Database(dbPath);
  
  // Create telemetry with quiet settings
  const telemetry = new TelemetryIntegration({
    db,
    bridgeOptions: {
      stdoutEnabled: !config.quietMode,
      broadcastUrlEvents: false,        // Don't spam URL events
      progressEmitIntervalMs: 10000     // Only emit progress every 10s
    }
  });
  
  // Create job registry
  const jobRegistry = new InProcessCrawlJobRegistry({
    createCrawlService,
    serviceOptions: {
      telemetryIntegration: telemetry,
      // Default overrides for quiet daemon mode
      defaultOverrides: config.quietMode ? {
        outputVerbosity: 'silent'  // Suppress PROGRESS/QUEUE/etc console noise
      } : {}
    },
    allowMultiJobs: false,
    historyLimit: 100
  });
  
  // Create Express server
  const server = createCrawlApiServer({
    version: 'v1',
    framework: 'express',
    port: config.port,
    logger,
    inProcessJobRegistry: jobRegistry
  });
  
  try {
    const { port } = await server.start();
    
    // Write PID file
    writePidFile(config, process.pid);
    
    logger.always(`🕷️ Crawl daemon started on port ${port} (PID ${process.pid})`);
    logger.always(`   API: http://localhost:${port}/v1/`);
    logger.always(`   Logs: ${config.logFile}`);
    
    // Handle shutdown
    const shutdown = async (signal) => {
      logger.always(`\n🛑 Received ${signal}, shutting down...`);
      
      try {
        await server.stop();
        telemetry.destroy();
        db.close();
        removePidFile(config);
        logger.always('✅ Daemon stopped cleanly');
      } catch (e) {
        logger.error('Error during shutdown:', e.message);
      }
      
      process.exit(0);
    };
    
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    return { success: true, port, pid: process.pid };
  } catch (e) {
    logger.error('Failed to start daemon:', e.message);
    db.close();
    return { success: false, error: e.message };
  }
}

/**
 * Start daemon in detached mode (background process)
 */
function startDaemonDetached(config) {
  const logger = createDaemonLogger(config);
  
  // Check if already running
  const status = isDaemonRunning(config);
  if (status.running) {
    logger.error(`Daemon already running (PID ${status.pid})`);
    return { success: false, error: 'already_running', pid: status.pid };
  }
  
  // Ensure log directory exists
  const logDir = path.dirname(config.logFile);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  // Open log file for output
  const out = fs.openSync(config.logFile, 'a');
  const err = fs.openSync(config.logFile, 'a');
  
  // Spawn detached process
  const child = spawn(process.execPath, [__filename, '--start', '--port', String(config.port)], {
    detached: true,
    stdio: ['ignore', out, err],
    cwd: process.cwd(),
    env: { ...process.env, CRAWL_DAEMON_QUIET: '1' }
  });
  
  child.unref();
  
  // Wait briefly to check if it started
  return new Promise((resolve) => {
    setTimeout(() => {
      const status = isDaemonRunning(config);
      if (status.running) {
        logger.always(`🕷️ Crawl daemon started in background (PID ${status.pid})`);
        logger.always(`   API: http://localhost:${config.port}/v1/`);
        logger.always(`   Logs: ${config.logFile}`);
        resolve({ success: true, pid: status.pid, port: config.port });
      } else {
        logger.error('Failed to start daemon - check logs');
        resolve({ success: false, error: 'startup_failed' });
      }
    }, 1500);
  });
}

/**
 * Stop the daemon
 */
function stopDaemon(config) {
  const logger = createDaemonLogger(config);
  const status = isDaemonRunning(config);
  
  if (!status.running) {
    logger.always('Daemon not running');
    return { success: true, wasRunning: false };
  }
  
  try {
    process.kill(status.pid, 'SIGTERM');
    
    // Wait for process to exit
    let attempts = 0;
    while (attempts < 10) {
      try {
        process.kill(status.pid, 0);
        // Still running, wait
        require('child_process').execSync('powershell -Command "Start-Sleep -Milliseconds 500"', { timeout: 1000 });
        attempts++;
      } catch (e) {
        // Process gone
        removePidFile(config);
        logger.always(`✅ Daemon stopped (was PID ${status.pid})`);
        return { success: true, wasRunning: true, pid: status.pid };
      }
    }
    
    // Force kill if still running
    logger.warn('Daemon not responding, force killing...');
    process.kill(status.pid, 'SIGKILL');
    removePidFile(config);
    logger.always(`✅ Daemon force-stopped (was PID ${status.pid})`);
    return { success: true, wasRunning: true, pid: status.pid, forced: true };
  } catch (e) {
    logger.error('Failed to stop daemon:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Get daemon status
 */
async function getDaemonStatus(config) {
  const status = isDaemonRunning(config);
  
  if (!status.running) {
    return {
      running: false,
      pid: null,
      port: null,
      api: null
    };
  }
  
  // Try to ping the API
  const port = config.port;
  
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port,
      path: '/healthz',
      method: 'GET',
      timeout: 2000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const health = JSON.parse(data);
          resolve({
            running: true,
            pid: status.pid,
            port,
            api: `http://localhost:${port}/v1/`,
            health
          });
        } catch (e) {
          resolve({
            running: true,
            pid: status.pid,
            port,
            api: `http://localhost:${port}/v1/`,
            health: null
          });
        }
      });
    });
    
    req.on('error', () => {
      resolve({
        running: true,
        pid: status.pid,
        port: null,
        api: null,
        error: 'API not responding'
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({
        running: true,
        pid: status.pid,
        port: null,
        api: null,
        error: 'API timeout'
      });
    });
    
    req.end();
  });
}

// CLI interface when run directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  // Parse --port value correctly
  const portIdx = args.indexOf('--port');
  const portValue = portIdx >= 0 && args[portIdx + 1] ? parseInt(args[portIdx + 1], 10) : undefined;
  
  const config = getDaemonConfig({
    port: portValue,
    quietMode: process.env.CRAWL_DAEMON_QUIET === '1' || args.includes('--quiet')
  });
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Crawl Daemon — Background crawl server with HTTP API

Usage:
  node src/cli/crawl/daemon.js --start           # Start (foreground)
  node src/cli/crawl/daemon.js --start --detach  # Start (background)
  node src/cli/crawl/daemon.js --stop            # Stop daemon
  node src/cli/crawl/daemon.js --status          # Check status

Options:
  --port <n>      Port for HTTP API (default: ${DEFAULT_PORT})
  --quiet         Minimize console output
  --detach        Run in background (detached from terminal)
  -h, --help      Show this help
`);
    process.exit(0);
  }
  
  if (args.includes('--start')) {
    if (args.includes('--detach')) {
      startDaemonDetached(config).then(result => {
        process.exit(result.success ? 0 : 1);
      });
    } else {
      startDaemon(config);
      // Keep process running (server handles signals)
    }
  } else if (args.includes('--stop')) {
    const result = stopDaemon(config);
    process.exit(result.success ? 0 : 1);
  } else if (args.includes('--status')) {
    getDaemonStatus(config).then(status => {
      if (status.running) {
        console.log(`✅ Daemon running (PID ${status.pid})`);
        console.log(`   API: ${status.api || 'unknown'}`);
        if (status.health) {
          console.log(`   Health: ${status.health.status}`);
        }
        if (status.error) {
          console.log(`   Warning: ${status.error}`);
        }
      } else {
        console.log('❌ Daemon not running');
      }
      process.exit(status.running ? 0 : 1);
    });
  } else {
    console.error('Unknown command. Use --help for usage.');
    process.exit(1);
  }
}

module.exports = {
  getDaemonConfig,
  createDaemonLogger,
  isDaemonRunning,
  startDaemon,
  startDaemonDetached,
  stopDaemon,
  getDaemonStatus
};
