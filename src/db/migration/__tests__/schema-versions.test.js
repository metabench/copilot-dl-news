const Database = require('better-sqlite3');
const { SchemaVersionManager } = require('../schema-versions');

describe('SchemaVersionManager', () => {
  let db;
  let versionManager;

  beforeEach(() => {
    db = new Database(':memory:');
    versionManager = new SchemaVersionManager(db);
  });

  afterEach(() => {
    db.close();
  });

  test('should create schema_migrations table', () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'
    `).all();

    expect(tables).toHaveLength(1);
  });

  test('should return version 0 when no migrations applied', () => {
    expect(versionManager.getCurrentVersion()).toBe(0);
  });

  test('should record migration', () => {
    versionManager.recordMigration(1, 'initial_schema', 'Initial schema setup');

    expect(versionManager.getCurrentVersion()).toBe(1);
    expect(versionManager.hasVersion(1)).toBe(true);
  });

  test('should get migration history', () => {
    versionManager.recordMigration(1, 'initial_schema', 'Initial schema');
    versionManager.recordMigration(2, 'add_normalized_tables', 'Add normalized tables');

    const history = versionManager.getMigrationHistory();

    expect(history).toHaveLength(2);
    expect(history[0].version).toBe(1);
    expect(history[1].version).toBe(2);
  });

  test('should throw on duplicate version', () => {
    versionManager.recordMigration(1, 'initial_schema', 'Initial schema');

    expect(() => {
      versionManager.recordMigration(1, 'duplicate', 'Duplicate version');
    }).toThrow('Migration version 1 already applied');
  });

  test('should get specific migration', () => {
    versionManager.recordMigration(1, 'initial_schema', 'Initial schema');

    const migration = versionManager.getMigration(1);

    expect(migration).toBeDefined();
    expect(migration.version).toBe(1);
    expect(migration.name).toBe('initial_schema');
  });
});