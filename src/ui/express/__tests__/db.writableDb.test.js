const { createWritableDbAccessor } = require('../db/writableDb');

describe('createWritableDbAccessor', () => {
  function createMockDb() {
    const insertRuns = [];
    return {
      exec: jest.fn(),
      prepare: jest.fn((sql) => {
        if (sql.includes('INSERT INTO crawl_types')) {
          const run = jest.fn((name, description, declaration) => {
            insertRuns.push({ name, description, declaration: JSON.parse(declaration) });
          });
          return { run };
        }
        return {
          get: jest.fn(() => ({})),
          run: jest.fn(),
          all: jest.fn(() => [])
        };
      }),
      insertRuns
    };
  }

  it('lazily initializes the writable DB once and seeds default crawl types', () => {
    const mockDb = createMockDb();
    const ensureDb = jest.fn(() => mockDb);
    const logger = { log: jest.fn(), warn: jest.fn() };

    const getDbRW = createWritableDbAccessor({
      ensureDb,
      urlsDbPath: '/tmp/test.db',
      queueDebug: true,
      verbose: false,
      logger
    });

    const dbA = getDbRW();
    const dbB = getDbRW();

    expect(dbA).toBe(mockDb);
    expect(dbB).toBe(mockDb);
    expect(ensureDb).toHaveBeenCalledTimes(1);
  expect(mockDb.exec.mock.calls.length).toBeGreaterThanOrEqual(2); // schema + index batches (may include migrations)
  expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO crawl_types'));
    expect(mockDb.insertRuns).toHaveLength(4);
    expect(mockDb.insertRuns.map((entry) => entry.name)).toEqual([
      'basic',
      'sitemap-only',
      'basic-with-sitemap',
      'intelligent'
    ]);
    expect(logger.log).toHaveBeenCalledWith('[db] opened writable queue DB at', '/tmp/test.db');
  });

  it('logs a warning and returns null when ensureDb throws', () => {
    const error = new Error('boom');
    const ensureDb = jest.fn(() => { throw error; });
    const logger = { log: jest.fn(), warn: jest.fn() };

    const getDbRW = createWritableDbAccessor({
      ensureDb,
      urlsDbPath: '/tmp/fail.db',
      queueDebug: false,
      verbose: true,
      logger
    });

    expect(getDbRW()).toBeNull();
    expect(getDbRW()).toBeNull();
    expect(ensureDb).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith('[db] failed to open writable DB:', 'boom');
  });
});
