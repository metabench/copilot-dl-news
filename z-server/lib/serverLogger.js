"use strict";

/**
 * Server Activity Logger for Z-Server
 * 
 * Maintains persistent logs of server start/stop events, successes, and failures.
 * Logs are stored in z-server/logs/ directory.
 */

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', 'logs');
const ACTIVITY_LOG = path.join(LOGS_DIR, 'server-activity.log');
const ERROR_LOG = path.join(LOGS_DIR, 'server-errors.log');

/**
 * Ensure logs directory exists
 */
function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

/**
 * Format timestamp for logs
 */
function timestamp() {
  return new Date().toISOString();
}

/**
 * Get relative file path for display
 */
function getRelativePath(filePath, basePath) {
  return path.relative(basePath, filePath).replace(/\\/g, '/');
}

/**
 * Append entry to activity log
 */
function logActivity(entry) {
  ensureLogsDir();
  const line = `[${timestamp()}] ${entry}\n`;
  fs.appendFileSync(ACTIVITY_LOG, line, 'utf8');
  console.log('[ServerLogger]', entry);
}

/**
 * Append entry to error log
 */
function logError(entry, error) {
  ensureLogsDir();
  const errorDetail = error ? `\n  Error: ${error.message || error}` : '';
  const line = `[${timestamp()}] ${entry}${errorDetail}\n`;
  fs.appendFileSync(ERROR_LOG, line, 'utf8');
  console.error('[ServerLogger]', entry, error || '');
}

/**
 * Log server start request
 */
function logStartRequest(filePath, basePath) {
  const rel = getRelativePath(filePath, basePath);
  logActivity(`START_REQUEST: ${rel}`);
}

/**
 * Log server start success
 */
function logStartSuccess(filePath, basePath, pid) {
  const rel = getRelativePath(filePath, basePath);
  logActivity(`START_SUCCESS: ${rel} (PID: ${pid})`);
}

/**
 * Log server start failure
 */
function logStartFailure(filePath, basePath, error) {
  const rel = getRelativePath(filePath, basePath);
  logError(`START_FAILURE: ${rel}`, error);
  logActivity(`START_FAILURE: ${rel} - ${error.message || error}`);
}

/**
 * Log server stop request
 */
function logStopRequest(filePath, basePath) {
  const rel = getRelativePath(filePath, basePath);
  logActivity(`STOP_REQUEST: ${rel}`);
}

/**
 * Log server stop success
 */
function logStopSuccess(filePath, basePath, pid) {
  const rel = getRelativePath(filePath, basePath);
  logActivity(`STOP_SUCCESS: ${rel} (PID: ${pid})`);
}

/**
 * Log server stop failure
 */
function logStopFailure(filePath, basePath, error) {
  const rel = getRelativePath(filePath, basePath);
  logError(`STOP_FAILURE: ${rel}`, error);
  logActivity(`STOP_FAILURE: ${rel} - ${error.message || error}`);
}

/**
 * Log server crash/unexpected exit
 */
function logServerExit(filePath, basePath, code, signal) {
  const rel = getRelativePath(filePath, basePath);
  if (signal) {
    logActivity(`SERVER_EXIT: ${rel} - killed by signal ${signal}`);
  } else if (code !== 0) {
    logError(`SERVER_CRASH: ${rel} - exit code ${code}`);
    logActivity(`SERVER_CRASH: ${rel} - exit code ${code}`);
  } else {
    logActivity(`SERVER_EXIT: ${rel} - clean exit`);
  }
}

/**
 * Log server output that contains an error
 */
function logServerError(filePath, basePath, errorOutput) {
  const rel = getRelativePath(filePath, basePath);
  logError(`SERVER_ERROR: ${rel}`, { message: errorOutput.trim() });
}

/**
 * Log detection of already-running server
 */
function logDetectedRunning(filePath, basePath, port, pid, method) {
  const rel = getRelativePath(filePath, basePath);
  const methodStr = method ? ` [${method}]` : '';
  logActivity(`DETECTED_RUNNING: ${rel} on port ${port} (PID: ${pid})${methodStr}`);
}

/**
 * Log z-server startup
 */
function logZServerStart() {
  logActivity('═══════════════════════════════════════════════════════════════');
  logActivity('Z-SERVER STARTED');
  logActivity('═══════════════════════════════════════════════════════════════');
}

/**
 * Get recent log entries (for display in UI)
 */
function getRecentLogs(count = 50) {
  ensureLogsDir();
  if (!fs.existsSync(ACTIVITY_LOG)) {
    return [];
  }
  
  const content = fs.readFileSync(ACTIVITY_LOG, 'utf8');
  const lines = content.trim().split('\n').filter(Boolean);
  return lines.slice(-count);
}

/**
 * Get recent errors (for display in UI)
 */
function getRecentErrors(count = 20) {
  ensureLogsDir();
  if (!fs.existsSync(ERROR_LOG)) {
    return [];
  }
  
  const content = fs.readFileSync(ERROR_LOG, 'utf8');
  const lines = content.trim().split('\n').filter(Boolean);
  return lines.slice(-count);
}

module.exports = {
  logActivity,
  logError,
  logStartRequest,
  logStartSuccess,
  logStartFailure,
  logStopRequest,
  logStopSuccess,
  logStopFailure,
  logServerExit,
  logServerError,
  logDetectedRunning,
  logZServerStart,
  getRecentLogs,
  getRecentErrors,
  LOGS_DIR,
  ACTIVITY_LOG,
  ERROR_LOG
};
