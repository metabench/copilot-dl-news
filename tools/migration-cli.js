#!/usr/bin/env node

/**
 * Database Migration CLI Tool
 *
 * Command-line interface for database migrations using the MigrationOrchestrator.
 *
 * Usage:
 *   node tools/migration-cli.js <command> [options]
 *
 * Commands:
 *   status          Show current migration status
 *   export <dir>    Export database to directory
 *   import <dir>    Import database from directory
 *   migrate <target-db>  Migrate to new database
 *   backup <file>   Create database backup
 *   restore <file>  Restore from backup
 *   validate        Validate current database integrity
 */

const { MigrationOrchestrator } = require('../src/data/db/migration/orchestrator');
const { SchemaVersionManager } = require('../src/data/db/migration/schema-versions');
const { DataValidator } = require('../src/data/db/migration/validator');
const { ensureDb } = require('../src/data/db/sqlite/v1/ensureDb');
const path = require('path');
const fs = require('fs');

class MigrationCLI {
  constructor() {
    this.dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/db.sqlite');
    this.db = null;
    this.orchestrator = null;
  }

  async init() {
    try {
      this.db = ensureDb(this.dbPath);
      this.orchestrator = new MigrationOrchestrator(this.db);
    } catch (error) {
      console.error(`Failed to initialize database: ${error.message}`);
      process.exit(1);
    }
  }

  async run() {
    const rawArgs = process.argv.slice(2);
    const options = {};
    const positional = [];

    for (let i = 0; i < rawArgs.length; i += 1) {
      const token = rawArgs[i];
      switch (token) {
        case '--help':
        case '-h':
          options.help = true;
          break;
        case '--db-path': {
          const value = rawArgs[i + 1];
          if (!value) {
            console.error('Missing value for --db-path');
            process.exit(1);
          }
          options.dbPath = path.resolve(value);
          i += 1;
          break;
        }
        case '--export-dir': {
          const value = rawArgs[i + 1];
          if (!value) {
            console.error('Missing value for --export-dir');
            process.exit(1);
          }
          options.exportDir = path.resolve(value);
          i += 1;
          break;
        }
        case '--batch-size': {
          const value = rawArgs[i + 1];
          if (!value) {
            console.error('Missing value for --batch-size');
            process.exit(1);
          }
          const parsed = Number.parseInt(value, 10);
          if (!Number.isFinite(parsed) || parsed <= 0) {
            console.error(`Invalid batch size: ${value}`);
            process.exit(1);
          }
          options.batchSize = parsed;
          i += 1;
          break;
        }
        default:
          positional.push(token);
      }
    }

    if (options.help) {
      this.showHelp();
      return;
    }

    const [command, ...commandArgs] = positional;

    if (!command) {
      this.showHelp();
      return;
    }

    if (options.dbPath) {
      this.dbPath = options.dbPath;
    }

    await this.init();

    if (options.batchSize) {
      this.orchestrator.options.batchSize = options.batchSize;
    }

    if (options.exportDir) {
      this.orchestrator.options.exportDir = options.exportDir;
    }

    const orchestratorExportDir = this.orchestrator && this.orchestrator.options
      ? this.orchestrator.options.exportDir
      : undefined;
    const effectiveExportDir = commandArgs[0] || options.exportDir || orchestratorExportDir;

    try {
      switch (command) {
        case 'status':
          await this.showStatus();
          break;
        case 'export':
          await this.exportDatabase(effectiveExportDir);
          break;
        case 'import':
          await this.importDatabase(effectiveExportDir);
          break;
        case 'migrate':
          await this.migrateDatabase(commandArgs[0]);
          break;
        case 'backup':
          await this.createBackup(commandArgs[0]);
          break;
        case 'restore':
          await this.restoreBackup(commandArgs[0]);
          break;
        case 'validate':
          await this.validateDatabase();
          break;
        default:
          console.error(`Unknown command: ${command}`);
          this.showHelp();
          process.exit(1);
      }
    } catch (error) {
      console.error(`Command failed: ${error.message}`);
      process.exit(1);
    } finally {
      if (this.db) {
        this.db.close();
      }
    }
  }



  showHelp() {
    console.log(`
Database Migration CLI Tool

Usage:
  node tools/migration-cli.js <command> [options]

Commands:
  status                   Show current migration status and history
  export [dir]             Export database manifest (default: ./migration-export)
  import <dir>             Import database from directory (default: ./migration-export)
  migrate <target-db>      Migrate to new database file
  backup [file]            Create database backup file (default: ./backup.json)
  restore <file>           Restore from backup file
  validate                 Validate current database integrity

Options:
  --db-path <path>         Database file path (default: data/db.sqlite or DB_PATH)
  --export-dir <path>      Directory for export/import operations (default: ./migration-export)
  --batch-size <number>    Rows per import/export batch (default: 1000)
  --help                   Show this help message

Examples:
  node tools/migration-cli.js status
  node tools/migration-cli.js export ./my-export
  node tools/migration-cli.js backup ./backup-2025-10-15.json
  node tools/migration-cli.js validate
    `);
  }


  async showStatus() {
    console.log('Checking migration status...');

    const status = await this.orchestrator.getMigrationStatus();

    if (status.error) {
      console.error(`Error: ${status.error}`);
      return;
    }

    console.log(`Current Schema Version: ${status.currentVersion}`);
    console.log(`Database Health: ${status.databaseHealthy ? '✓ Healthy' : '✗ Issues found'}`);

    if (status.issues && status.issues.length > 0) {
      console.log('\nIssues:');
      status.issues.forEach(issue => {
        console.log(`  - ${issue.type}: ${issue.details || issue.error || 'Unknown'}`);
      });
    }

    if (status.migrationHistory && status.migrationHistory.length > 0) {
      console.log('\nMigration History:');
      status.migrationHistory.forEach(migration => {
        console.log(`  ${migration.version} - ${migration.description} (${migration.applied_at})`);
      });
    } else {
      console.log('\nNo migration history found.');
    }
  }

  async exportDatabase(exportDir) {
    const hasExportDir = this.orchestrator && this.orchestrator.options && this.orchestrator.options.exportDir;
    const defaultExportDir = hasExportDir ? this.orchestrator.options.exportDir : path.join(__dirname, '..', 'data', 'exports');
    const resolvedDir = exportDir ? path.resolve(exportDir) : path.resolve(defaultExportDir);

    console.log(`Exporting database to ${resolvedDir}...`);

    if (this.orchestrator && this.orchestrator.options) {
      this.orchestrator.options.exportDir = resolvedDir;
    }

    const result = await this.orchestrator._exportPhase();

    if (result.success) {
      console.log('✓ Export completed successfully');
      console.log(`  Export directory: ${result.exportDir}`);
      console.log(`  Tables exported: ${Object.keys(result.manifest.tables).length}`);
      console.log(`  Total rows: ${Object.values(result.manifest.tables).reduce((sum, t) => sum + (t.row_count || 0), 0)}`);
    } else {
      console.error(`✗ Export failed: ${result.error}`);
      process.exit(1);
    }
  }


  async importDatabase(importDir) {
    const hasExportDir = this.orchestrator && this.orchestrator.options && this.orchestrator.options.exportDir;
    const resolvedDir = importDir
      ? path.resolve(importDir)
      : hasExportDir
        ? path.resolve(this.orchestrator.options.exportDir)
        : null;

    if (!resolvedDir) {
      console.error('Import directory required (no default export directory configured)');
      process.exit(1);
    }

    if (!fs.existsSync(resolvedDir)) {
      console.error(`Import directory not found: ${resolvedDir}`);
      process.exit(1);
    }

    console.log(`Importing database from ${resolvedDir}...`);

    if (this.orchestrator && this.orchestrator.options) {
      this.orchestrator.options.exportDir = resolvedDir;
    }

    try {
      const manifestPath = path.join(resolvedDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        throw new Error('Manifest file not found in import directory');
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const result = await this.orchestrator._importPhase(this.db, manifest);

      if (result.success) {
        console.log('✓ Import completed successfully');
        console.log(`  Tables imported: ${result.tablesImported || 0}`);
        console.log(`  Total rows: ${result.totalRows || 0}`);
      } else {
        console.error(`✗ Import failed: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`✗ Import failed: ${error.message}`);
      process.exit(1);
    }
  }



  async migrateDatabase(targetDbPath) {
    if (!targetDbPath) {
      console.error('Target database path required');
      process.exit(1);
    }

    console.log(`Migrating to new database: ${targetDbPath}`);

    try {
      const targetDb = ensureDb(targetDbPath);
      const result = await this.orchestrator.migrateTo(targetDb);

      if (result.success) {
        console.log('✓ Migration completed successfully');
        console.log(`  Duration: ${result.duration}ms`);
        console.log('  Phases completed:');
        result.phases.forEach(phase => {
          const status = phase.success ? '✓' : '✗';
          const skipped = phase.skipped ? ' (skipped)' : '';
          console.log(`    ${status} ${phase.phase}${skipped}`);
        });
      } else {
        console.error('✗ Migration failed');
        result.errors.forEach(error => console.error(`  - ${error}`));
        process.exit(1);
      }

      targetDb.close();
    } catch (error) {
      console.error(`✗ Migration failed: ${error.message}`);
      process.exit(1);
    }
  }

  async createBackup(backupPath) {
    const file = backupPath || './backup.json';
    console.log(`Creating backup: ${file}`);

    const result = await this.orchestrator.createBackup(file);

    if (result.success) {
      console.log('✓ Backup created successfully');
      console.log(`  Backup file: ${result.backupPath}`);
      console.log(`  Tables backed up: ${result.fileCount}`);
    } else {
      console.error(`✗ Backup failed: ${result.error}`);
      process.exit(1);
    }
  }

  async restoreBackup(backupPath) {
    if (!backupPath || !fs.existsSync(backupPath)) {
      console.error(`Backup file not found: ${backupPath}`);
      process.exit(1);
    }

    console.log(`Restoring from backup: ${backupPath}`);

    const result = await this.orchestrator.restoreFromBackup(backupPath, this.db);

    if (result.success) {
      console.log('✓ Restore completed successfully');
      console.log(`  Tables restored: ${result.tablesImported || 0}`);
      console.log(`  Total rows: ${result.totalRows || 0}`);
      console.log(`  Source version: ${result.sourceVersion}`);
    } else {
      console.error(`✗ Restore failed: ${result.error}`);
      process.exit(1);
    }
  }

  async validateDatabase() {
    console.log('Validating database integrity...');

    const result = this.orchestrator.validator.checkIntegrity();

    if (result.healthy) {
      console.log('✓ Database integrity check passed');
    } else {
      console.log('✗ Database integrity issues found:');
      result.issues.forEach(issue => {
        console.log(`  - ${issue.type}: ${issue.details || issue.error || 'Unknown'}`);
      });
      process.exit(1);
    }
  }
}

// Run CLI if called directly
if (require.main === module) {
  const cli = new MigrationCLI();
  cli.run().catch(error => {
    console.error(`Unexpected error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { MigrationCLI };