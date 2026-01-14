/**
 * Fast test to verify server can be created
 * TIMEOUT: 3s per test (fail fast if initialization hangs)
 */

const { describe, test, expect, afterEach } = require('@jest/globals');
const path = require('path');
const os = require('os');
const fs = require('fs');

describe('Server Creation (Fast)', () => {
  let dbPath;
  let app;

  afterEach(async () => {
    // Force cleanup of background tasks and timers BEFORE database cleanup
    if (app && app.locals) {
      try {
        // Stop background task manager
        if (app.locals.backgroundTaskManager) {
          await app.locals.backgroundTaskManager.shutdown?.();
        }
        // Stop compression worker pool
        if (app.locals.compressionWorkerPool) {
          await app.locals.compressionWorkerPool.shutdown?.();
        }
        // Stop analysis run manager
        if (app.locals.analysisRunManager) {
          app.locals.analysisRunManager.stop?.();
        }
        // Stop config manager watchers
        if (app.locals.configManager) {
          app.locals.configManager.stopWatching?.();
        }
        // Close database connection
        if (app.locals.getDb) {
          try {
            const db = app.locals.getDb();
            if (db && typeof db.close === 'function') {
              db.close();
            }
          } catch (_) {}
        }
      } catch (e) {
        // Silent cleanup errors
      }
    }
    
    // Small delay to let async operations complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Cleanup database files
    if (dbPath) {
      const suffixes = ['', '-shm', '-wal'];
      for (const suffix of suffixes) {
        try { 
          fs.unlinkSync(dbPath + suffix); 
        } catch (_) {}
      }
    }
  });

  test('should create app without errors', () => {
    const tmpDir = path.join(os.tmpdir(), 'server-fast-test');
    fs.mkdirSync(tmpDir, { recursive: true });
    const unique = `${process.pid}-${Date.now()}-${Math.random()}`;
    dbPath = path.join(tmpDir, `test-${unique}.db`);

    let error = null;
    try {
      const { createApp } = require('../server');
      app = createApp({ 
        dbPath, 
        verbose: false,
        requestTiming: false 
      });
    } catch (e) {
      error = e;
      throw new Error(`Server creation failed: ${e.message}`);
    }
    
    if (!app) {
      throw new Error('createApp returned null/undefined');
    }
    if (!app.locals) {
      throw new Error('app.locals is missing');
    }
    if (!app.locals.getDb) {
      throw new Error('app.locals.getDb is missing');
    }
  }, 3000);

  test('should require database module without errors', () => {
    let dbModule;
    try {
      dbModule = require('../../../data/db/sqlite');
    } catch (e) {
      throw new Error(`Failed to require db/sqlite: ${e.message}`);
    }
    
    if (!dbModule.ensureDatabase) throw new Error('ensureDatabase not exported');
    if (!dbModule.wrapWithTelemetry) throw new Error('wrapWithTelemetry not exported');
    if (!dbModule.createInstrumentedDb) throw new Error('createInstrumentedDb not exported');
  }, 1000);
});
