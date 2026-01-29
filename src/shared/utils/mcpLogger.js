'use strict';

/**
 * MCP Logger - Unified logging for AI agent visibility
 * 
 * Logs simultaneously to:
 * - MCP memory server (for AI agent access via docs_memory_getLogs)
 * - Console (for immediate visibility - configurable levels)
 * - NDJSON files (for persistence and CLI tool access)
 * - Optional callbacks (for UI updates via SSE/WebSocket)
 * 
 * Features:
 * - Auto-timestamps all entries
 * - App abbreviation tags (e.g., CRWL, ELEC, API, UI)
 * - Session-based log grouping (default: app-YYYY-MM-DD)
 * - Severity levels (debug, info, warn, error)
 * - Console level filtering (vitalOnly mode: warn/error only to console)
 * - Broadcast support for real-time UI updates
 * 
 * Usage Patterns:
 * 
 *   // Full logging (console + file + MCP)
 *   const logger = createMcpLogger({ app: 'CRWL' });
 *   
 *   // Quiet mode (file + MCP, only vital to console)
 *   const logger = createMcpLogger({ app: 'CRWL', vitalOnly: true });
 *   
 *   // With UI broadcast callback
 *   const logger = createMcpLogger({ app: 'UI', onLog: entry => broadcast(entry) });
 *   
 *   // Preset for background services
 *   const logger = createMcpLogger.service('crawler');
 *   
 *   // Preset for UI servers
 *   const logger = createMcpLogger.uiServer('data-explorer', broadcastFn);
 * 
 * For AI agents:
 *   // Via MCP: docs_memory_getLogs({ session: 'crwl-2026-01-02', limit: 50 })
 *   // Via CLI: node tools/dev/task-events.js --list
 *   // Via file: read docs/agi/logs/<session>.ndjson
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const LOGS_DIR = path.join(__dirname, '..', '..', 'docs', 'agi', 'logs');
const MCP_PORT = parseInt(process.env.MCP_MEMORY_PORT, 10) || 4399;
const MCP_HOST = process.env.MCP_MEMORY_HOST || 'localhost';

// Ensure logs directory exists
function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Log Entry Format
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a log entry with standard format
 * @param {string} level - debug|info|warn|error
 * @param {string} app - App abbreviation (e.g., CRWL, ELEC, API)
 * @param {string} message - Log message
 * @param {object} data - Optional structured data
 * @param {string} session - Optional session ID
 * @returns {object} Formatted log entry
 */
function createLogEntry(level, app, message, data = null, session = null) {
  return {
    ts: new Date().toISOString(),
    level,
    app,
    session,
    msg: message,
    data: data || undefined
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// File-based logging (always available, no MCP dependency)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append a log entry to an NDJSON file
 */
function appendToLogFile(session, entry) {
  ensureLogsDir();
  const fileName = session ? `${session}.ndjson` : 'default.ndjson';
  const filePath = path.join(LOGS_DIR, fileName);
  
  try {
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    // Silently fail - don't want logging to break the app
    if (process.env.DEBUG_MCP_LOGGER) {
      console.error('[mcpLogger] Failed to write log file:', err.message);
    }
  }
}

/**
 * Read logs from a session file
 * @param {string} session - Session ID
 * @param {object} options - { limit, level, since }
 * @returns {object[]} Array of log entries
 */
function readLogFile(session, options = {}) {
  const fileName = session ? `${session}.ndjson` : 'default.ndjson';
  const filePath = path.join(LOGS_DIR, fileName);
  
  if (!fs.existsSync(filePath)) {
    return [];
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let entries = content
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try { return JSON.parse(line); } 
        catch { return null; }
      })
      .filter(Boolean);
    
    // Filter by level
    if (options.level) {
      const levels = ['debug', 'info', 'warn', 'error'];
      const minLevel = levels.indexOf(options.level);
      entries = entries.filter(e => levels.indexOf(e.level) >= minLevel);
    }
    
    // Filter by time
    if (options.since) {
      entries = entries.filter(e => e.ts >= options.since);
    }
    
    // Limit results (from end)
    if (options.limit && entries.length > options.limit) {
      entries = entries.slice(-options.limit);
    }
    
    return entries;
  } catch (err) {
    return [];
  }
}

/**
 * List available log sessions
 * @returns {object[]} Array of { session, size, updated, entryCount }
 */
function listLogSessions() {
  ensureLogsDir();
  
  try {
    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.endsWith('.ndjson'));
    
    return files.map(fileName => {
      const filePath = path.join(LOGS_DIR, fileName);
      const stat = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf8');
      const entryCount = content.split('\n').filter(l => l.trim()).length;
      
      return {
        session: fileName.replace('.ndjson', ''),
        size: stat.size,
        updated: stat.mtime.toISOString(),
        entryCount
      };
    }).sort((a, b) => b.updated.localeCompare(a.updated));
  } catch (err) {
    return [];
  }
}

/**
 * Clear logs for a session
 * @param {string} session - Session ID (or 'all' for all sessions)
 * @returns {object} { cleared: number }
 */
function clearLogs(session) {
  ensureLogsDir();
  
  try {
    if (session === 'all') {
      const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.ndjson'));
      files.forEach(f => fs.unlinkSync(path.join(LOGS_DIR, f)));
      return { cleared: files.length };
    } else {
      const fileName = `${session}.ndjson`;
      const filePath = path.join(LOGS_DIR, fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return { cleared: 1 };
      }
      return { cleared: 0 };
    }
  } catch (err) {
    return { cleared: 0, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP integration (optional - graceful fallback if unavailable)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send log entry to MCP server (fire-and-forget)
 */
function sendToMcp(entry) {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'docs_memory_appendLog',
      arguments: entry
    },
    id: Date.now()
  });
  
  const req = http.request({
    hostname: MCP_HOST,
    port: MCP_PORT,
    path: '/mcp',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    },
    timeout: 1000
  });
  
  req.on('error', () => {
    // Silently ignore - MCP server may not be running
  });
  
  req.write(payload);
  req.end();
}

// ─────────────────────────────────────────────────────────────────────────────
// Logger Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a logger instance
 * @param {object} options
 * @param {string} options.app - App abbreviation (e.g., 'CRWL', 'ELEC', 'API', 'UI')
 * @param {string} options.session - Session ID for grouping logs (default: auto-generated)
 * @param {boolean} options.console - Log to console (default: true)
 * @param {boolean} options.vitalOnly - Only log warn/error to console (default: false)
 * @param {boolean} options.mcp - Send to MCP server (default: true)
 * @param {boolean} options.file - Write to log file (default: true)
 * @param {function} options.onLog - Callback for each log entry (for UI broadcast)
 * @param {string} options.minLevel - Minimum level to log (default: 'debug')
 * @returns {object} Logger instance with debug/info/warn/error methods
 */
function createMcpLogger(options = {}) {
  const {
    app = 'APP',
    session = null,
    console: useConsole = true,
    vitalOnly = false,
    mcp: useMcp = true,
    file: useFile = true,
    onLog = null,
    minLevel = 'debug'
  } = options;
  
  // Auto-generate session if not provided: app-YYYY-MM-DD
  const resolvedSession = session || `${app.toLowerCase()}-${new Date().toISOString().slice(0, 10)}`;
  
  const levels = ['debug', 'info', 'warn', 'error'];
  const minLevelIndex = levels.indexOf(minLevel);
  const vitalLevels = ['warn', 'error'];
  
  function log(level, message, data = null) {
    // Check minimum level
    if (levels.indexOf(level) < minLevelIndex) return;
    
    const entry = createLogEntry(level, app, message, data, resolvedSession);
    
    // Console output (respects vitalOnly mode)
    if (useConsole) {
      const shouldLogToConsole = !vitalOnly || vitalLevels.includes(level);
      if (shouldLogToConsole) {
        const prefix = `[${entry.ts.slice(11, 19)}] [${app}]`;
        const dataStr = data ? ` ${JSON.stringify(data)}` : '';
        switch (level) {
          case 'debug': console.debug(`${prefix} ${message}${dataStr}`); break;
          case 'info':  console.log(`${prefix} ${message}${dataStr}`); break;
          case 'warn':  console.warn(`${prefix} ⚠️ ${message}${dataStr}`); break;
          case 'error': console.error(`${prefix} ❌ ${message}${dataStr}`); break;
        }
      }
    }
    
    // File output (always logs all levels)
    if (useFile) {
      appendToLogFile(resolvedSession, entry);
    }
    
    // MCP output (always logs all levels)
    if (useMcp) {
      sendToMcp(entry);
    }
    
    // Callback for UI broadcast (always logs all levels)
    if (typeof onLog === 'function') {
      try { onLog(entry); } catch {}
    }
    
    return entry;
  }
  
  return {
    debug: (msg, data) => log('debug', msg, data),
    info:  (msg, data) => log('info', msg, data),
    warn:  (msg, data) => log('warn', msg, data),
    error: (msg, data) => log('error', msg, data),
    
    // Session management
    getSession: () => resolvedSession,
    
    // Direct file access
    getLogs: (opts) => readLogFile(resolvedSession, opts),
    clearLogs: () => clearLogs(resolvedSession),
    
    // Child logger with different app tag
    child: (childApp) => createMcpLogger({ ...options, app: childApp, session: resolvedSession })
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Preset Factory Functions (for common use cases)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a logger for background services (vital-only console, full MCP/file logging)
 * @param {string} name - Service name (e.g., 'crawler', 'analyzer')
 * @param {object} overrides - Optional overrides
 */
createMcpLogger.service = function(name, overrides = {}) {
  const appTag = name.slice(0, 4).toUpperCase();
  return createMcpLogger({
    app: appTag,
    vitalOnly: true,  // Only warn/error to console
    ...overrides
  });
};

/**
 * Create a logger for UI servers (full console, with broadcast callback)
 * @param {string} name - Server name (e.g., 'data-explorer', 'docs-viewer')
 * @param {function} broadcastFn - Optional callback to broadcast entries to clients
 * @param {object} overrides - Optional overrides
 */
createMcpLogger.uiServer = function(name, broadcastFn = null, overrides = {}) {
  return createMcpLogger({
    app: 'UI',
    session: `ui-${name}-${new Date().toISOString().slice(0, 10)}`,
    onLog: broadcastFn,
    ...overrides
  });
};

/**
 * Create a logger for CLI tools (minimal console, file + MCP for agent access)
 * @param {string} name - Tool name (e.g., 'js-scan', 'mini-crawl')
 * @param {object} overrides - Optional overrides
 */
createMcpLogger.cliTool = function(name, overrides = {}) {
  return createMcpLogger({
    app: 'CLI',
    session: `cli-${name}-${new Date().toISOString().slice(0, 10)}`,
    vitalOnly: true,
    ...overrides
  });
};

/**
 * Create a logger for Electron apps
 * @param {string} name - App component (e.g., 'main', 'renderer')
 * @param {object} overrides - Optional overrides
 */
createMcpLogger.electron = function(name = 'main', overrides = {}) {
  return createMcpLogger({
    app: 'ELEC',
    session: `electron-${new Date().toISOString().slice(0, 10)}`,
    ...overrides
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Module API
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  createMcpLogger,
  
  // Direct file access (for non-logger contexts)
  readLogFile,
  listLogSessions,
  clearLogs,
  
  // Constants
  LOGS_DIR,
  MCP_PORT,
  MCP_HOST
};
