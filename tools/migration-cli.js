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

const { MigrationOrchestrator } = require('../src/db/migration/orchestrator');
const { SchemaVersionManager } = require('../src/db/migration/schema-versions');
const { DataValidator } = require('../src/db/migration/validator');
const { ensureDb } = require('../src/db/sqlite/v1/ensureDb');
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
    await this.init();

    const args = process.argv.slice(2);

    // Check for help flag first
    if (args.includes('--help') || args.includes('-h')) {
      this.showHelp();
      return;
    }

    const [command, ...commandArgs] = args;

    if (!command) {
      this.showHelp();
      return;
    }

    try {
      switch (command) {
        case 'status':
          await this.showStatus();
          break;
        case 'export':
          await this.exportDatabase(commandArgs[0]);
          break;
        case 'import':
          await this.importDatabase(commandArgs[0]);
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
  status                    Show current migration status and history
  export <dir>             Export database to directory (default: ./migration-export)
  import <dir>             Import database from directory
  migrate <target-db>      Migrate to new database file
  backup <file>            Create database backup file (default: ./backup.json)
  restore <file>           Restore from backup file
  validate                 Validate current database integrity

Options:
  --db-path <path>         Database file path (default: data/db.sqlite)
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
    const dir = exportDir || './migration-export';
    console.log(`Exporting database to ${dir}...`);

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
    if (!importDir || !fs.existsSync(importDir)) {
      console.error(`Import directory not found: ${importDir}`);
      process.exit(1);
    }

    console.log(`Importing database from ${importDir}...`);

    try {
      // Find manifest file
      const manifestPath = path.join(importDir, 'manifest.json');
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