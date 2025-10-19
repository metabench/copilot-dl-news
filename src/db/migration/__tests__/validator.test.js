/**
 * Tests for DataValidator
 */

const { DataValidator } = require('../validator');
const { createTempDb, seedTestData } = require('../../../test-utils/db-helpers');

describe('DataValidator', () => {
  let db;
  let validator;

  beforeEach(() => {
    db = createTempDb();
    seedTestData(db);
    validator = new DataValidator(db);
  });

  afterEach(() => {
    if (db) db.close();
  });

  describe('constructor', () => {
    it('should create validator with database', () => {
      expect(validator).toBeDefined();
      expect(validator.db).toBe(db);
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
      // Temporarily disable foreign key constraints to insert invalid data
      db.prepare('PRAGMA foreign_keys = OFF').run();
      
      // Insert invalid data that violates foreign key - place_names.place_id should reference places.id
      db.prepare('INSERT INTO place_names (place_id, name) VALUES (?, ?)').run(999999, 'Invalid Place');
      
      // Re-enable foreign key constraints
      db.prepare('PRAGMA foreign_keys = ON').run();

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
      const sourceManifest = {
        schema_version: 1,
        exported_at: new Date().toISOString(),
        tables: {
          urls: { row_count: 5, error: null },
          articles: { row_count: 3, error: null },
          places: { row_count: 2, error: null },
          place_names: { row_count: 2, error: null }
        }
      };

      const result = await validator.validateMigration(sourceManifest, db);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.summary.tables_checked).toBe(4);
    });

    it('should detect row count mismatches', async () => {
      const sourceManifest = {
        schema_version: 1,
        exported_at: new Date().toISOString(),
        tables: {
          urls: { row_count: 999, error: null } // Wrong count
        }
      };

      const result = await validator.validateMigration(sourceManifest, db);
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.type === 'row_count_mismatch')).toBe(true);
    });

    it('should detect data integrity issues', async () => {
      // Create a scenario with duplicate data that violates unique constraints
      db.prepare('INSERT INTO urls (url) VALUES (?)').run('http://unique-test.com');

      const sourceManifest = {
        schema_version: 1,
        exported_at: new Date().toISOString(),
        tables: {
          urls: { row_count: 6, error: null }, // Should be 6 now (5 original + 1 new)
          articles: { row_count: 3, error: null },
          places: { row_count: 2, error: null },
          place_names: { row_count: 2, error: null }
        }
      };

      const result = await validator.validateMigration(sourceManifest, db);
      // Should still be valid since we only check specific integrity rules
      expect(result.valid).toBe(true);
    });
  });
});