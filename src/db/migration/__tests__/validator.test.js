/**
 * Tests for DataValidator
 */

const { DataValidator } = require('../validator');
const { createTempDb, seedTestData } = require('../../../test-utils/db-helpers');

describe('DataValidator', () => {
  let sourceDb;
  let targetDb;
  let validator;

  const BASE_TABLES = ['urls', 'http_responses', 'content_storage', 'places', 'place_names'];

  const countRows = (table) => sourceDb.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;

  const buildManifest = (tableOverrides = {}) => {
    const tables = {};

    for (const table of BASE_TABLES) {
      tables[table] = { row_count: countRows(table), error: null };
    }

    return {
      schema_version: 1,
      exported_at: new Date().toISOString(),
      tables: {
        ...tables,
        ...tableOverrides
      }
    };
  };

  beforeEach(() => {
    sourceDb = createTempDb();
    targetDb = createTempDb();
    seedTestData(sourceDb);
    seedTestData(targetDb);
    validator = new DataValidator(sourceDb);
  });

  afterEach(() => {
    if (sourceDb) sourceDb.close();
    if (targetDb) targetDb.close();
  });

  describe('constructor', () => {
    it('should create validator with database', () => {
      expect(validator).toBeDefined();
      expect(validator.db).toBe(sourceDb);
    });

    it('should throw if no database provided', () => {
      expect(() => new DataValidator()).toThrow('DataValidator requires an open better-sqlite3 Database');
    });
  });

  describe('checkIntegrity', () => {
    it('should return healthy status for valid database', () => {
      const result = validator.checkIntegrity();
      expect(result.healthy).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('should detect foreign key violations', () => {
      sourceDb.prepare('PRAGMA foreign_keys = OFF').run();
      sourceDb.prepare(`
        INSERT INTO content_storage (http_response_id, storage_type)
        VALUES (?, 'db_inline')
      `).run(123456);
      sourceDb.prepare('PRAGMA foreign_keys = ON').run();

      const result = validator.checkIntegrity();
      expect(result.healthy).toBe(false);
      expect(result.issues.some(issue => issue.type === 'foreign_key_violations')).toBe(true);
    });
  });

  describe('validateTableStructure', () => {
    it('should validate correct table structure', () => {
      const expectedColumns = [
        { name: 'id', type: 'INTEGER', notNull: false, primaryKey: true },
        { name: 'url', type: 'TEXT', notNull: true },
        { name: 'canonical_url', type: 'TEXT', notNull: false },
        { name: 'created_at', type: 'TEXT', notNull: false },
        { name: 'last_seen_at', type: 'TEXT', notNull: false },
        { name: 'analysis', type: 'TEXT', notNull: false },
        { name: 'host', type: 'TEXT', notNull: false }
      ];

      const result = validator.validateTableStructure('urls', expectedColumns);
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('should detect missing columns', () => {
      const expectedColumns = [
        { name: 'id', type: 'INTEGER' },
        { name: 'missing_column', type: 'TEXT' }
      ];

      const result = validator.validateTableStructure('urls', expectedColumns);
      expect(result.valid).toBe(false);
      expect(result.issues.some(issue => issue.type === 'missing_column')).toBe(true);
    });

    it('should detect unexpected columns', () => {
      const expectedColumns = [
        { name: 'id', type: 'INTEGER' }
        // Missing 'url' column
      ];

      const result = validator.validateTableStructure('urls', expectedColumns);
      expect(result.valid).toBe(false);
      expect(result.issues.some(issue => issue.type === 'unexpected_column')).toBe(true);
    });
  });

  describe('validateMigration', () => {
    it('should validate successful migration', async () => {
      const result = await validator.validateMigration(buildManifest(), targetDb);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.summary.tables_checked).toBe(BASE_TABLES.length);
    });

    it('should detect row count mismatches', async () => {
      const manifest = buildManifest({
        urls: { row_count: 999, error: null }
      });

      const result = await validator.validateMigration(manifest, targetDb);
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.type === 'row_count_mismatch')).toBe(true);
    });

    it('should detect data integrity issues', async () => {
      const manifest = buildManifest();
      const responseRow = targetDb.prepare('SELECT id FROM http_responses LIMIT 1').get();

      targetDb.prepare('DELETE FROM content_storage WHERE http_response_id = ?').run(responseRow.id);
      targetDb.prepare('PRAGMA foreign_keys = OFF').run();
      targetDb.prepare('DELETE FROM http_responses WHERE id = ?').run(responseRow.id);
      targetDb.prepare('PRAGMA foreign_keys = ON').run();

      const result = await validator.validateMigration(manifest, targetDb);

      expect(result.valid).toBe(false);
      const integrityError = result.errors.find(error => error.type === 'data_integrity' && error.check === 'urls_have_http_responses');
      expect(integrityError).toBeDefined();
      expect(integrityError.actual).not.toBe(integrityError.expected);
      expect(integrityError.delta).not.toBe(0);
    });
  });
});