const dbAccess = require('../dbAccess');
const path = require('path');
const fs = require('fs');

describe('dbAccess', () => {
  const testDbPath = path.join(__dirname, 'test-dbaccess.db');

  beforeEach(() => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  afterEach(() => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('openNewsDb', () => {
    test('should open database with explicit path', () => {
      const db = dbAccess.openNewsDb(testDbPath);
      expect(db).toBeDefined();
      expect(db.db).toBeDefined();
      db.close();
    });

    test('should default to data/news.db when no path provided', () => {
      // This will use the actual database path - just test that it returns something
      const db = dbAccess.openNewsDb();
      expect(db).toBeDefined();
      db.close();
    });
  });

  describe('withNewsDb', () => {
    test('should execute function with db and auto-close', async () => {
      let dbInsideFunction;
      const result = await dbAccess.withNewsDb(testDbPath, (db) => {
        dbInsideFunction = db;
        expect(db).toBeDefined();
        return 'test-result';
      });

      expect(result).toBe('test-result');
      // Verify db was closed (accessing closed db should throw)
      expect(() => {
        dbInsideFunction.db.prepare('SELECT 1').get();
      }).toThrow();
    });

    test('should handle async functions', async () => {
      const result = await dbAccess.withNewsDb(testDbPath, async (db) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async-result';
      });

      expect(result).toBe('async-result');
    });

    test('should close db even if function throws', async () => {
      let dbInsideFunction;
      try {
        await dbAccess.withNewsDb(testDbPath, (db) => {
          dbInsideFunction = db;
          throw new Error('test error');
        });
      } catch (err) {
        expect(err.message).toBe('test error');
      }

      // Verify db was still closed
      expect(() => {
        dbInsideFunction.db.prepare('SELECT 1').get();
      }).toThrow();
    });
  });

  describe('createDbMiddleware', () => {
    test('should add db to req object', () => {
      const mockDb = { type: 'mock-db' };
      const getDbRW = jest.fn().mockReturnValue(mockDb);
      const middleware = dbAccess.createDbMiddleware(getDbRW);

      const req = {};
      const res = {};
      const next = jest.fn();

      middleware(req, res, next);

      expect(req.db).toBe(mockDb);
      expect(next).toHaveBeenCalledTimes(1);
      expect(getDbRW).toHaveBeenCalledTimes(1);
    });

    test('should set db to null if getDbRW throws', () => {
      const getDbRW = jest.fn().mockImplementation(() => {
        throw new Error('db connection failed');
      });
      const middleware = dbAccess.createDbMiddleware(getDbRW);

      const req = {};
      const res = {};
      const next = jest.fn();

      middleware(req, res, next);

      expect(req.db).toBeNull();
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDbOrError', () => {
    test('should return db when available', () => {
      const mockDb = { type: 'mock-db' };
      const getDbRW = jest.fn().mockReturnValue(mockDb);
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const result = dbAccess.getDbOrError(getDbRW, res);

      expect(result).toBe(mockDb);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    test('should send 503 error if db is null', () => {
      const getDbRW = jest.fn().mockReturnValue(null);
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const result = dbAccess.getDbOrError(getDbRW, res);

      expect(result).toBeNull();
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: 'Database not available' });
    });

    test('should send 503 error if getDbRW throws', () => {
      const getDbRW = jest.fn().mockImplementation(() => {
        throw new Error('connection failed');
      });
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const result = dbAccess.getDbOrError(getDbRW, res);

      expect(result).toBeNull();
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: 'Database connection failed' });
    });
  });

  describe('isDbAvailable', () => {
    test('should return true if db is available', () => {
      const mockDb = { type: 'mock-db' };
      const getDbRW = jest.fn().mockReturnValue(mockDb);

      const result = dbAccess.isDbAvailable(getDbRW);

      expect(result).toBe(true);
    });

    test('should return false if db is null', () => {
      const getDbRW = jest.fn().mockReturnValue(null);

      const result = dbAccess.isDbAvailable(getDbRW);

      expect(result).toBe(false);
    });

    test('should return false if getDbRW throws', () => {
      const getDbRW = jest.fn().mockImplementation(() => {
        throw new Error('connection failed');
      });

      const result = dbAccess.isDbAvailable(getDbRW);

      expect(result).toBe(false);
    });
  });
});
