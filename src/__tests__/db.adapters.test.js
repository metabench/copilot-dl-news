const fs = require('fs');
const os = require('os');
const path = require('path');

describe('database adapter registry', () => {
  test('default export constructs sqlite-backed database', () => {
    jest.isolateModules(() => {
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-sqlite-'));
      const dbPath = path.join(tmpRoot, 'news.db');
      const NewsDatabase = require('../db');

      let db;
      try {
        db = new NewsDatabase(dbPath);
        expect(db).toBeTruthy();
        expect(typeof db.getHandle).toBe('function');
        expect(db.getHandle()).toBeTruthy();
      } finally {
        if (db && typeof db.close === 'function') {
          try { db.close(); } catch (_) {}
        }
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    });
  });

  test('custom adapters can be registered and resolved', () => {
    jest.isolateModules(() => {
      const {
        createDatabase,
        registerAdapter,
        getRegisteredAdapters
      } = require('../db');

      const factory = jest.fn(() => ({ name: 'mock-adapter' }));
      registerAdapter('mock', factory);

      const instance = createDatabase({ engine: 'mock' });
      expect(instance).toEqual({ name: 'mock-adapter' });
      expect(factory).toHaveBeenCalledWith({ engine: 'mock' });
      expect(getRegisteredAdapters()).toContain('sqlite');
      expect(getRegisteredAdapters()).toContain('mock');
    });
  });
});
