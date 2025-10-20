const fs = require('fs');
const { ensureDatabase } = require('..');
const { createTempDb } = require('../test-utils');
const { CURRENT_SCHEMA_FINGERPRINT } = require('../schemaMetadata');
const Database = require('better-sqlite3');

function createCapturingLogger() {
  const messages = [];
  const capture = (level, args) => {
    messages.push({ level, message: args.map((value) => String(value)).join(' ') });
  };
  return {
    log: (...args) => capture('log', args),
    warn: (...args) => capture('warn', args),
    error: (...args) => capture('error', args),
    messages
  };
}

describe('ensureDatabase fast path', () => {
  let dbPath;

  afterEach(() => {
    if (dbPath && fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
      } catch (_) {
        // ignore cleanup issues on CI
      }
    }
    dbPath = null;
  });

  test('records schema fingerprint after initialization and uses fast path on reuse', () => {
    dbPath = createTempDb('fast-path');

    const firstLogger = createCapturingLogger();
    let db = ensureDatabase(dbPath, { logger: firstLogger, verbose: true });
    db.close();

    const secondLogger = createCapturingLogger();
    db = ensureDatabase(dbPath, { logger: secondLogger, verbose: true });
    db.close();

    const fastPathLog = secondLogger.messages.find((entry) => entry.message.includes('Fast path: schema fingerprint verified'));
    expect(fastPathLog).toBeDefined();

    const verificationDb = new Database(dbPath, { readonly: true, fileMustExist: true });
    const fingerprintRow = verificationDb.prepare("SELECT value FROM schema_metadata WHERE key = 'schema_fingerprint'").get();
    verificationDb.close();

    expect(fingerprintRow).toBeDefined();
    expect(fingerprintRow.value).toBe(CURRENT_SCHEMA_FINGERPRINT);
  });

  test('fallbacks to full initialization when critical table is missing', () => {
    dbPath = createTempDb('fast-path-missing');

    let db = ensureDatabase(dbPath, { verbose: false });
    db.close();

    const raw = new Database(dbPath);
    raw.exec('DROP TABLE IF EXISTS urls');
    raw.close();

    const logger = createCapturingLogger();
    db = ensureDatabase(dbPath, { logger, verbose: true });
    db.close();

    const fallbackLog = logger.messages.find((entry) => entry.message.includes('Fast path unavailable'));
    expect(fallbackLog).toBeDefined();

    const verifyDb = new Database(dbPath, { readonly: true, fileMustExist: true });
    const urlsTable = verifyDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='urls'").get();
    verifyDb.close();

    expect(urlsTable).toBeDefined();
    expect(urlsTable.name).toBe('urls');
  });
});
