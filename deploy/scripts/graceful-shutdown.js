#!/usr/bin/env node
/**
 * graceful-shutdown.js - Graceful Shutdown Handler
 * =================================================
 * 
 * Handles SIGTERM/SIGINT signals for clean container shutdown:
 * - Stops accepting new work
 * - Drains in-flight requests
 * - Closes database connections
 * - Exits cleanly
 * 
 * Usage:
 *   Import and call setupGracefulShutdown() early in your main script.
 * 
 * Example:
 *   const { setupGracefulShutdown } = require('./deploy/scripts/graceful-shutdown');
 *   setupGracefulShutdown({ timeout: 60000 });
 */

const EventEmitter = require('events');

// Shutdown state
let isShuttingDown = false;
let shutdownTimeout = null;
const shutdownEmitter = new EventEmitter();

// Registered cleanup handlers
const cleanupHandlers = [];

/**
 * Register a cleanup handler
 * @param {string} name - Handler name for logging
 * @param {() => Promise<void>} handler - Async cleanup function
 * @param {number} [priority=10] - Lower runs first
 */
function onShutdown(name, handler, priority = 10) {
  cleanupHandlers.push({ name, handler, priority });
  cleanupHandlers.sort((a, b) => a.priority - b.priority);
}

/**
 * Check if shutdown is in progress
 * @returns {boolean}
 */
function isShutdownInProgress() {
  return isShuttingDown;
}

/**
 * Execute all cleanup handlers
 * @param {number} timeout - Maximum time to wait for cleanup
 */
async function executeCleanup(timeout) {
  const startTime = Date.now();
  
  console.log(`[shutdown] Executing ${cleanupHandlers.length} cleanup handlers...`);
  
  for (const { name, handler } of cleanupHandlers) {
    const elapsed = Date.now() - startTime;
    const remaining = timeout - elapsed;
    
    if (remaining <= 0) {
      console.warn(`[shutdown] Timeout reached, skipping remaining handlers`);
      break;
    }
    
    try {
      console.log(`[shutdown] Running: ${name}...`);
      
      await Promise.race([
        handler(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Handler timeout')), Math.min(remaining, 10000))
        )
      ]);
      
      console.log(`[shutdown] Completed: ${name}`);
    } catch (error) {
      console.error(`[shutdown] Failed: ${name} - ${error.message}`);
    }
  }
}

/**
 * Main shutdown handler
 * @param {string} signal - Signal that triggered shutdown
 * @param {number} timeout - Maximum shutdown time in ms
 */
async function handleShutdown(signal, timeout) {
  if (isShuttingDown) {
    console.log(`[shutdown] Already shutting down, ignoring ${signal}`);
    return;
  }
  
  isShuttingDown = true;
  console.log(`\n[shutdown] Received ${signal}, starting graceful shutdown...`);
  
  // Set hard timeout
  shutdownTimeout = setTimeout(() => {
    console.error('[shutdown] Timeout exceeded, forcing exit');
    process.exit(1);
  }, timeout);
  
  // Notify listeners
  shutdownEmitter.emit('shutdown', signal);
  
  try {
    await executeCleanup(timeout - 1000); // Leave 1s buffer
    
    clearTimeout(shutdownTimeout);
    console.log('[shutdown] Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error(`[shutdown] Error during shutdown: ${error.message}`);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

/**
 * Setup graceful shutdown handlers
 * @param {Object} options
 * @param {number} [options.timeout=30000] - Maximum shutdown time in ms
 * @param {string[]} [options.signals=['SIGTERM', 'SIGINT']] - Signals to handle
 */
function setupGracefulShutdown(options = {}) {
  const {
    timeout = 30000,
    signals = ['SIGTERM', 'SIGINT']
  } = options;
  
  console.log(`[shutdown] Graceful shutdown configured (timeout: ${timeout}ms)`);
  
  // Register signal handlers
  for (const signal of signals) {
    process.on(signal, () => handleShutdown(signal, timeout));
  }
  
  // Handle uncaught exceptions during shutdown
  process.on('uncaughtException', (error) => {
    console.error('[shutdown] Uncaught exception:', error);
    if (!isShuttingDown) {
      handleShutdown('uncaughtException', timeout);
    }
  });
  
  process.on('unhandledRejection', (reason) => {
    console.error('[shutdown] Unhandled rejection:', reason);
    if (!isShuttingDown) {
      handleShutdown('unhandledRejection', timeout);
    }
  });
  
  return {
    onShutdown,
    isShutdownInProgress,
    emitter: shutdownEmitter
  };
}

// =============================================================================
// Common Cleanup Handlers
// =============================================================================

/**
 * Create a database connection cleanup handler
 * @param {string} name - Connection name
 * @param {Object} connection - Connection with close/end method
 * @returns {{ name: string, handler: () => Promise<void> }}
 */
function createDbCleanupHandler(name, connection) {
  return {
    name: `db:${name}`,
    handler: async () => {
      if (connection.end) {
        await connection.end();
      } else if (connection.close) {
        connection.close();
      }
    }
  };
}

/**
 * Create an HTTP server cleanup handler
 * @param {string} name - Server name
 * @param {import('http').Server} server - HTTP server
 * @returns {{ name: string, handler: () => Promise<void> }}
 */
function createServerCleanupHandler(name, server) {
  return {
    name: `server:${name}`,
    handler: () => new Promise((resolve, reject) => {
      // Stop accepting new connections
      server.close((err) => {
        if (err && err.code !== 'ERR_SERVER_NOT_RUNNING') {
          reject(err);
        } else {
          resolve();
        }
      });
      
      // Force-close existing connections after delay
      setTimeout(() => {
        server.closeAllConnections?.();
      }, 5000);
    })
  };
}

/**
 * Create a crawler cleanup handler
 * @param {Object} crawler - Crawler instance with stop method
 * @returns {{ name: string, handler: () => Promise<void> }}
 */
function createCrawlerCleanupHandler(crawler) {
  return {
    name: 'crawler',
    handler: async () => {
      if (crawler.stop) {
        await crawler.stop({ drain: true });
      }
    }
  };
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  setupGracefulShutdown,
  onShutdown,
  isShutdownInProgress,
  shutdownEmitter,
  
  // Helper factories
  createDbCleanupHandler,
  createServerCleanupHandler,
  createCrawlerCleanupHandler
};

// =============================================================================
// Standalone Usage
// =============================================================================

if (require.main === module) {
  // Demo/test mode
  console.log('Graceful shutdown module loaded');
  console.log('Import and use setupGracefulShutdown() in your application');
  
  // Quick test
  const { onShutdown: register } = setupGracefulShutdown({ timeout: 5000 });
  
  register('test-handler', async () => {
    console.log('Test cleanup running...');
    await new Promise(r => setTimeout(r, 100));
    console.log('Test cleanup done');
  });
  
  console.log('Send SIGTERM or SIGINT to test shutdown (or Ctrl+C)');
}
