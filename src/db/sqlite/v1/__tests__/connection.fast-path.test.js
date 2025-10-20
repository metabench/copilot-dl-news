'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const schema = require('../schema');
const { ensureDatabase } = require('../connection');

function createTempDbPath() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'news-db-fastpath-'));
  return { tmpDir, dbPath: path.join(tmpDir, 'news.db') };
}

describe('ensureDatabase fast-path behaviour', () => {
  let spy;
  let logger;
  let tmpDir;
  let dbPath;

  beforeEach(() => {
    ({ tmpDir, dbPath } = createTempDbPath());
    spy = jest.spyOn(schema, 'initializeSchema');
    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
  });

  afterEach(() => {
    if (spy) {
      spy.mockRestore();
    }

    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (err) {
        // On Windows the file handle might be open if a test failed; swallow cleanup errors.
        if (process.env.CI) {
          throw err;
        }
      }
    }
  });

  test('skips full schema initialization when fingerprint matches', () => {
    const dbFirst = ensureDatabase(dbPath, { logger });
    dbFirst.close();

    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockClear();

    const dbSecond = ensureDatabase(dbPath, { logger });
    dbSecond.close();

    expect(spy).not.toHaveBeenCalled();

    const readonlyDb = new Database(dbPath, { readonly: true });
    const fingerprintRow = readonlyDb
      .prepare("SELECT value FROM schema_metadata WHERE key='schema_fingerprint'")
      .get();
    readonlyDb.close();

    expect(fingerprintRow?.value).toBeDefined();
  });
});
