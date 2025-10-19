/**
 * Tests for MigrationOrchestrator
 */

const { MigrationOrchestrator } = require('../orchestrator');
const { createTempDb, seedTestData } = require('../../../test-utils/db-helpers');
const fs = require('fs');
const path = require('path');

describe('MigrationOrchestrator', () => {
  let sourceDb;
  let targetDb;
  let orchestrator;
  let tempDir;

  beforeEach(() => {
    sourceDb = createTempDb();
    targetDb = createTempDb();
    seedTestData(sourceDb);
    orchestrator = new MigrationOrchestrator(sourceDb);

    // Create temp directory for exports
    tempDir = path.join(__dirname, 'temp-test-export');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (sourceDb) sourceDb.close();
    if (targetDb) targetDb.close();

    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should create orchestrator with database', () => {
      expect(orchestrator).toBeDefined();
      expect(orchestrator.db).toBe(sourceDb);
      expect(orchestrator.exporter).toBeDefined();
      expect(orchestrator.importer).toBeDefined();
      expect(orchestrator.validator).toBeDefined();
      expect(orchestrator.versionManager).toBeDefined();
    });

    it('should use custom options', () => {
      const customOrchestrator = new MigrationOrchestrator(sourceDb, {
        exportDir: './custom-export',
        batchSize: 500
      });

      expect(customOrchestrator.options.exportDir).toBe('./custom-export');
      expect(customOrchestrator.options.batchSize).toBe(500);
    });

    it('should throw if no database provided', () => {
      expect(() => new MigrationOrchestrator()).toThrow('MigrationOrchestrator requires an open better-sqlite3 Database');
    });
  });

  describe('migrateTo', () => {
    it('should perform full migration successfully', async () => {
      const result = await orchestrator.migrateTo(targetDb, {
        newVersion: 2,
        migrationDescription: 'Test migration'
      });

      expect(result.success).toBe(true);
      expect(result.phases).toHaveLength(5);
      expect(result.duration).toBeGreaterThan(0);

      // Check that all phases succeeded
      result.phases.forEach(phase => {
        expect(phase.success).toBe(true);
      });
    });

    it('should handle migration failures gracefully', async () => {
      // Create invalid target database that will cause import to fail
      targetDb.close();
      targetDb = null; // This should cause import to fail

      const result = await orchestrator.migrateTo(null, {
        newVersion: 2
      });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.duration).toBeGreaterThan(0);
    });
  });

  describe('createBackup', () => {
    it('should create backup successfully', async () => {
      const backupPath = path.join(tempDir, 'test-backup.json');

      const result = await orchestrator.createBackup(backupPath);

      expect(result.success).toBe(true);
      expect(result.backupPath).toBe(backupPath);
      expect(result.fileCount).toBeGreaterThan(0);

      // Verify backup file exists and is valid JSON
      expect(fs.existsSync(backupPath)).toBe(true);
      const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      expect(backupData.manifest).toBeDefined();
      expect(backupData.created_at).toBeDefined();
    });

    it('should handle backup creation errors', async () => {
      const invalidPath = path.join('C:', 'nonexistent', 'directory', 'backup.json');

      const result = await orchestrator.createBackup(invalidPath);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('restoreFromBackup', () => {
    it('should restore from backup successfully', async () => {
      // First create a backup
      const backupPath = path.join(tempDir, 'test-backup.json');
      await orchestrator.createBackup(backupPath);

      // Create a new empty database to restore to
      const restoreDb = createTempDb();

      try {
        const result = await orchestrator.restoreFromBackup(backupPath, restoreDb);

        expect(result.success).toBe(true);
        expect(result.tablesImported).toBeGreaterThan(0);
        expect(result.totalRows).toBeGreaterThan(0);
      } finally {
        restoreDb.close();
      }
    });

    it('should handle invalid backup files', async () => {
      const invalidBackupPath = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(invalidBackupPath, 'invalid json');

      const restoreDb = createTempDb();

      try {
        const result = await orchestrator.restoreFromBackup(invalidBackupPath, restoreDb);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      } finally {
        restoreDb.close();
      }
    });
  });

  describe('getMigrationStatus', () => {
    it('should return migration status', async () => {
      const status = await orchestrator.getMigrationStatus();

      expect(status).toBeDefined();
      expect(status.currentVersion).toBeDefined();
      expect(status.migrationHistory).toBeDefined();
      expect(status.databaseHealthy).toBeDefined();
    });

    it('should handle database errors gracefully', async () => {
      // Close the database to simulate error
      sourceDb.close();
      sourceDb = null;

      const status = await orchestrator.getMigrationStatus();

      expect(status.error).toBeDefined();
    });
  });

  describe('private methods', () => {
    describe('_exportPhase', () => {
      it('should export database successfully', async () => {
        const result = await orchestrator._exportPhase();

        expect(result.success).toBe(true);
        expect(result.manifest).toBeDefined();
        expect(result.exportDir).toBeDefined();

        // Verify export directory was created
        expect(fs.existsSync(result.exportDir)).toBe(true);
      });
    });

    describe('_importPhase', () => {
      it('should import data successfully', async () => {
        // First export data
        const exportResult = await orchestrator._exportPhase();
        expect(exportResult.success).toBe(true);

        // Then import to target database
        const importResult = await orchestrator._importPhase(targetDb, exportResult.manifest);

        expect(importResult.success).toBe(true);
        expect(importResult.tablesImported).toBeGreaterThan(0);
      });
    });

    describe('_updateVersionPhase', () => {
      it('should update schema version', async () => {
        const result = await orchestrator._updateVersionPhase(targetDb, 2, 'Test version update');

        expect(result.success).toBe(true);
        expect(result.newVersion).toBe(2);
      });
    });
  });
});