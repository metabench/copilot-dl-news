/**
 * Migration Orchestrator
 *
 * Coordinates the full migration process: export → transform → import → validate
 */

const { DatabaseExporter } = require('./exporter');
const { DatabaseImporter } = require('./importer');
const { DataValidator } = require('./validator');
const { SchemaVersionManager } = require('./schema-versions');
const fs = require('fs');
const path = require('path');

class MigrationOrchestrator {
  constructor(db, options = {}) {
    if (!db) {
      throw new Error('MigrationOrchestrator requires an open better-sqlite3 Database');
    }

    this.db = db;
    this.exporter = new DatabaseExporter(db);
    this.importer = new DatabaseImporter(db);
    this.validator = new DataValidator(db);
    this.versionManager = new SchemaVersionManager(db);

    this.options = {
      exportDir: options.exportDir || './migration-export',
      tempDir: options.tempDir || './migration-temp',
      batchSize: options.batchSize || 1000,
      ...options
    };
  }

  /**
   * Run a complete migration from source to target database
   * @param {Database} targetDb - Target database to migrate to
   * @param {Object} options - Migration options
   * @returns {Promise<Object>} Migration results
   */
  async migrateTo(targetDb, options = {}) {
    const startTime = Date.now();
    const results = {
      success: false,
      phases: [],
      errors: [],
      duration: 0
    };

    try {
      // Phase 1: Export source database
      console.log('Phase 1: Exporting source database...');
      const exportResult = await this._exportPhase();
      results.phases.push({ phase: 'export', ...exportResult });

      if (!exportResult.success) {
        throw new Error(`Export failed: ${exportResult.error}`);
      }

      // Phase 2: Transform data (if transformers provided)
      if (options.transformers) {
        console.log('Phase 2: Transforming data...');
        const transformResult = await this._transformPhase(exportResult.manifest, options.transformers);
        results.phases.push({ phase: 'transform', ...transformResult });

        if (!transformResult.success) {
          throw new Error(`Transform failed: ${transformResult.error}`);
        }
      } else {
        results.phases.push({ phase: 'transform', success: true, skipped: true });
      }

      // Phase 3: Import to target database
      console.log('Phase 3: Importing to target database...');
      const importResult = await this._importPhase(targetDb, exportResult.manifest, options.transformers);
      results.phases.push({ phase: 'import', ...importResult });

      if (!importResult.success) {
        throw new Error(`Import failed: ${importResult.error}`);
      }

      // Phase 4: Validate migration
      console.log('Phase 4: Validating migration...');
      const validationResult = await this.validator.validateMigration(exportResult.manifest, targetDb);
      results.phases.push({ 
        phase: 'validation', 
        success: validationResult.valid,
        ...validationResult 
      });

      if (!validationResult.valid) {
        throw new Error(`Validation failed: ${validationResult.errors.length} errors found`);
      }

      // Phase 5: Update schema version
      if (options.newVersion) {
        console.log('Phase 5: Updating schema version...');
        const versionResult = await this._updateVersionPhase(targetDb, options.newVersion, options.migrationDescription);
        results.phases.push({ phase: 'version_update', ...versionResult });

        if (!versionResult.success) {
          throw new Error(`Version update failed: ${versionResult.error}`);
        }
      } else {
        results.phases.push({ phase: 'version_update', success: true, skipped: true });
      }

      results.success = true;
      results.duration = Date.now() - startTime;
      console.log(`Migration completed successfully in ${results.duration}ms`);

    } catch (error) {
      results.errors.push(error.message);
      results.duration = Date.now() - startTime;
      console.error(`Migration failed: ${error.message}`);
    }

    return results;
  }

  /**
   * Export phase implementation
   */
  async _exportPhase() {
    try {
      // Ensure export directory exists
      if (!fs.existsSync(this.options.exportDir)) {
        fs.mkdirSync(this.options.exportDir, { recursive: true });
      }

      // Export full database
      const manifest = await this.exporter.exportFullDatabase(this.options.exportDir);

      return {
        success: true,
        manifest,
        exportDir: this.options.exportDir
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Transform phase implementation
   */
  async _transformPhase(manifest, transformers) {
    try {
      // For now, transformations are applied during import
      // Future: implement separate transform phase if needed
      return {
        success: true,
        transformers: Object.keys(transformers || {})
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Import phase implementation
   */
  async _importPhase(targetDb, manifest, transformers) {
    try {
      const targetImporter = new DatabaseImporter(targetDb, transformers);
      const importResult = await targetImporter.importFromManifestObject(manifest, {
        baseDir: this.options.exportDir,
        batchSize: this.options.batchSize
      });

      return {
        success: true,
        ...importResult
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Version update phase implementation
   */
  async _updateVersionPhase(targetDb, newVersion, description) {
    try {
      const targetVersionManager = new SchemaVersionManager(targetDb);
      await targetVersionManager.recordMigration(newVersion, description || 'Migration completed');

      return {
        success: true,
        newVersion
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a backup of the current database
   * @param {string} backupPath - Path for backup file
   * @returns {Promise<Object>} Backup results
   */
  async createBackup(backupPath) {
    try {
      // Don't create directories - let it fail for invalid paths
      const backupDir = path.dirname(backupPath);
      if (!fs.existsSync(backupDir)) {
        throw new Error(`Backup directory does not exist: ${backupDir}`);
      }

      // Export to the same directory as the backup file
      const exportDir = backupDir;
      const manifest = await this.exporter.exportFullDatabase(exportDir);

      // Create a single backup file with manifest
      const backupData = {
        manifest,
        created_at: new Date().toISOString(),
        source_version: await this.versionManager.getCurrentVersion()
      };

      fs.writeFileSync(
        backupPath,
        JSON.stringify(backupData, null, 2)
      );

      return {
        success: true,
        backupPath,
        manifest,
        fileCount: Object.keys(manifest.tables).length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Restore from a backup
   * @param {string} backupPath - Path to backup file
   * @param {Database} targetDb - Target database to restore to
   * @returns {Promise<Object>} Restore results
   */
  async restoreFromBackup(backupPath, targetDb) {
    try {
      const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      const { manifest } = backupData;

      const targetImporter = new DatabaseImporter(targetDb);
      const importResult = await targetImporter.importFromManifestObject(manifest, {
        baseDir: path.dirname(backupPath)
      });

      return {
        success: true,
        ...importResult,
        sourceVersion: backupData.source_version,
        restoredAt: backupData.created_at
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get migration status and history
   * @returns {Object} Migration status
   */
  async getMigrationStatus() {
    try {
      const currentVersion = await this.versionManager.getCurrentVersion();
      const history = await this.versionManager.getMigrationHistory();
      const integrity = this.validator.checkIntegrity();

      return {
        currentVersion,
        migrationHistory: history,
        databaseHealthy: integrity.healthy,
        issues: integrity.issues
      };
    } catch (error) {
      return {
        error: error.message,
        currentVersion: null,
        migrationHistory: [],
        databaseHealthy: false,
        issues: [error.message]
      };
    }
  }
}

module.exports = { MigrationOrchestrator };