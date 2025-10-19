# Database Migration Tools

This directory contains the complete Phase 0 migration infrastructure for safe, incremental database schema evolution. These tools enable the transition from the current denormalized schema to the HTTP-centric architecture outlined in the normalization plan.

## Overview

The migration system consists of four main components:

1. **SchemaVersionManager** - Tracks migration history and current schema version
2. **DatabaseExporter** - Exports database tables to NDJSON format for backup/migration
3. **DatabaseImporter** - Imports data with optional transformations
4. **DataValidator** - Validates data integrity after migrations
5. **MigrationOrchestrator** - Coordinates the full migration process
6. **Migration CLI** - Command-line interface for running migrations

## Quick Start

### Check Current Status
```bash
node tools/migration-cli.js status
```

### Create a Backup
```bash
node tools/migration-cli.js backup ./my-backup.json
```

### Export Database for Migration
```bash
node tools/migration-cli.js export ./migration-export
```

### Validate Database Integrity
```bash
node tools/migration-cli.js validate
```

## Architecture

### Schema Version Tracking

The system uses a `schema_migrations` table to track applied migrations:

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Export Format

Data is exported as NDJSON (Newline-Delimited JSON) files, one per table:

```
{"id":1,"url":"http://example.com","created_at":"2025-01-01T00:00:00.000Z"}
{"id":2,"url":"http://example.org","created_at":"2025-01-02T00:00:00.000Z"}
```

Each export includes a `manifest.json` with metadata:

```json
{
  "schema_version": 1,
  "exported_at": "2025-10-15T10:30:00.000Z",
  "tables": {
    "urls": {
      "row_count": 150,
      "file": "urls.ndjson",
      "error": null
    }
  }
}
```

## API Reference

### SchemaVersionManager

```javascript
const { SchemaVersionManager } = require('./schema-versions');
const versionManager = new SchemaVersionManager(db);

// Get current version
const version = await versionManager.getCurrentVersion();

// Record a migration
await versionManager.recordMigration(2, 'Added http_responses table');

// Check if version exists
const hasVersion = await versionManager.hasVersion(1);

// Get migration history
const history = await versionManager.getMigrationHistory();
```

### DatabaseExporter

```javascript
const { DatabaseExporter } = require('./exporter');
const exporter = new DatabaseExporter(db);

// Export single table
const stream = await exporter.exportTable('urls', './export/urls.ndjson');

// Export full database
const manifest = await exporter.exportFullDatabase('./export-dir');
```

### DatabaseImporter

```javascript
const { DatabaseImporter } = require('./importer');
const importer = new DatabaseImporter(db);

// Import single table
await importer.importTable('./data/urls.ndjson', 'urls');

// Import with transformations
const transformers = {
  urls: (row) => ({ ...row, normalized_url: normalizeUrl(row.url) })
};
await importer.importFromManifest(manifest, { transformers });
```

### DataValidator

```javascript
const { DataValidator } = require('./validator');
const validator = new DataValidator(db);

// Check database integrity
const integrity = validator.checkIntegrity();

// Validate table structure
const result = validator.validateTableStructure('urls', expectedColumns);

// Validate migration
const validation = await validator.validateMigration(sourceManifest, targetDb);
```

### MigrationOrchestrator

```javascript
const { MigrationOrchestrator } = require('./orchestrator');
const orchestrator = new MigrationOrchestrator(db);

// Full migration
const result = await orchestrator.migrateTo(targetDb, {
  newVersion: 2,
  migrationDescription: 'Normalize HTTP responses'
});

// Create backup
const backup = await orchestrator.createBackup('./backup.json');

// Get status
const status = await orchestrator.getMigrationStatus();
```

## Command Line Interface

### Status Check
```bash
node tools/migration-cli.js status
```

Shows:
- Current schema version
- Database health status
- Migration history
- Any integrity issues

### Database Export
```bash
node tools/migration-cli.js export [directory]
```

Exports all tables to NDJSON files in the specified directory (default: `./migration-export`).

### Database Import
```bash
node tools/migration-cli.js import <directory>
```

Imports data from NDJSON files in the specified directory.

### Full Migration
```bash
node tools/migration-cli.js migrate <target-database>
```

Performs a complete migration to a new database file.

### Backup Operations
```bash
# Create backup
node tools/migration-cli.js backup [filename]

# Restore from backup
node tools/migration-cli.js restore <filename>
```

### Validation
```bash
node tools/migration-cli.js validate
```

Runs integrity checks on the current database.

## Data Transformation

The importer supports data transformations during import:

```javascript
const transformers = {
  articles: (row) => {
    // Transform denormalized article to normalized format
    return {
      http_response_id: row.http_response_id,
      content: row.content,
      extracted_at: row.created_at,
      analysis_status: 'pending'
    };
  }
};

await importer.importFromManifest(manifest, { transformers });
```

## Error Handling

All components include comprehensive error handling:

- **Export errors**: Logged per table, manifest includes error details
- **Import errors**: Batch failures don't stop entire import
- **Validation errors**: Detailed error reports with specific issues
- **Migration errors**: Phase-by-phase error reporting with rollback guidance

## Testing

Run the migration tests:

```bash
npm test -- src/db/migration/__tests__/
```

Tests cover:
- Schema version management
- Export/import operations
- Data validation
- Migration orchestration
- Error handling scenarios

## Integration with Normalization Plan

This Phase 0 infrastructure enables the 6-phase normalization plan:

1. **Phase 0** ✅ - Migration infrastructure (this implementation)
2. **Phase 1** - Add normalized tables alongside existing schema
3. **Phase 2** - Dual-write to both old and new schemas
4. **Phase 3** - Backfill historical data
5. **Phase 4** - Switch reads to normalized tables
6. **Phase 5** - Remove legacy tables

## Safety Features

- **Dry-run capability**: All operations can be tested without modifying data
- **Backup before migration**: Automatic backup creation
- **Validation after migration**: Integrity checks ensure data consistency
- **Version tracking**: Prevents duplicate or out-of-order migrations
- **Transactional imports**: Batch operations with rollback on failure
- **Foreign key validation**: Ensures referential integrity

## Performance Considerations

- **Streaming exports**: Large tables processed without loading into memory
- **Batch imports**: Configurable batch sizes for optimal performance
- **Parallel processing**: Multiple tables can be exported/imported concurrently
- **Compression support**: Integrated with brotli/gzip/zstd compression via `tools/compression/`

## Future Extensions

- **Compression integration**: ✅ Implemented - see `tools/compression/` for migration and backfill tools
- **Incremental migrations**: Support for partial table updates
- **Migration rollbacks**: Automated rollback capabilities
- **Multi-database support**: Migrate between different database systems
- **Progress reporting**: Real-time migration progress for long operations