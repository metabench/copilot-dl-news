const path = require('path');
const fs = require('fs');
const os = require('os');
const { createApp } = require('../src/ui/express/server');

describe('Server Connection Test', () => {
  let dbPath;
  let tempDir;
  let app;
  let db;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `copilot-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    dbPath = path.join(tempDir, 'test-db.sqlite');
  });

  afterEach(() => {
    // Close the database connection if it's open
    if (db && db.open) {
      db.close();
    }
    
    // Clean up background resources from createApp
    if (app && app.locals.backgroundTaskManager) {
      // The shutdown method is not available on the manager, so we just clear the active tasks
      app.locals.backgroundTaskManager.activeTasks.clear();
    }
    if (app && app.locals.compressionWorkerPool) {
      app.locals.compressionWorkerPool.destroy();
    }
    if (app && app.locals.realtime) {
      // The shutdown method is not available on the broadcaster, so we just clear the clients
      app.locals.realtime.sseClients.clear();
    }

    // Clean up the temporary database files
    const suffixes = ['', '-shm', '-wal'];
    for (const suffix of suffixes) {
      try {
        if (fs.existsSync(dbPath + suffix)) {
          fs.unlinkSync(dbPath + suffix);
        }
      } catch (err) {
        // Suppress cleanup errors in tests
      }
    }
    try {
      fs.rmdirSync(tempDir, { recursive: true });
    } catch (err) {
      // Suppress cleanup errors in tests
    }
  });

  it('should start the server and establish a database connection', (done) => {
    try {
      app = createApp({ dbPath, verbose: false });
      expect(app).toBeDefined();
      
      const getDb = app.locals.getDb;
      expect(getDb).toBeInstanceOf(Function);

      db = getDb();
      expect(db).toBeDefined();
      expect(db.constructor.name).toBe('Database');

      // Verify that the database is open and we can execute a query
      const stmt = db.prepare('PRAGMA user_version;');
      const result = stmt.get();
      expect(result.user_version).toBeGreaterThanOrEqual(0);
      
      done();
    } catch (err) {
      done(err);
    }
  }, 5000); // 5-second timeout
});
