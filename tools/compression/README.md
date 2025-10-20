# Compression Tools

This directory contains tools for managing content compression in the normalized database schema.

## Tools Overview

### migrate-legacy-content.js
Migrates uncompressed content from the legacy `articles` table to the new normalized schema with compression.

**Use Case**: One-time migration when upgrading from legacy schema to normalized schema.

```bash
# Dry run (recommended first)
node tools/compression/migrate-legacy-content.js

# Apply changes
node tools/compression/migrate-legacy-content.js --fix

# Limit to 100 items for testing
node tools/compression/migrate-legacy-content.js --limit 100 --fix
```

### backfill-compression.js
Compresses existing uncompressed content in the `content_storage` table.

**Use Case**: Compress content that was ingested before compression was enabled, or re-compress with different algorithms.

```bash
# Dry run (recommended first)
node tools/compression/backfill-compression.js

# Apply changes
node tools/compression/backfill-compression.js --fix

# Only compress content older than 30 days
node tools/compression/backfill-compression.js --age-days 30 --fix

# Limit to 100 items for testing
node tools/compression/backfill-compression.js --limit 100 --fix
```

## Command Line Help

All compression tools support the `--help` flag for detailed usage information:

```bash
node tools/compression/migrate-legacy-content.js --help
node tools/compression/backfill-compression.js --help
```

The help output includes:
- Available command line options
- Default values and ranges
- Examples of common usage patterns
- Safety notes about dry-run vs live modes

## Safety Features

All tools default to **dry-run mode** and require `--fix` flag to apply changes:

- **Dry Run**: Shows what would be changed without modifying data
- **Live Mode**: Requires explicit `--fix` flag to apply changes
- **Transactional**: Each operation is atomic and can be rolled back if needed
- **Progress Reporting**: Shows progress during long-running operations

## Compression Strategy

The tools apply age-based compression:

- **Hot (< 7 days)**: Brotli level 6 (compressed for storage efficiency)
- **Warm (7-30 days)**: Brotli level 6 (balanced speed/size) 
- **Cold (30+ days)**: Brotli level 11 (maximum compression)

**New content is compressed with Brotli 6 by default** during ingestion for optimal storage efficiency. Additional compression is applied later via the lifecycle task as content ages.

## Expected Results

- **70-85% database size reduction** for compressible content
- **6-25x compression ratios** depending on content type
- **Automatic lifecycle management** via CompressionLifecycleTask

## Integration

These tools work with:

- `CompressionTask`: Bulk compression of existing content
- `CompressionLifecycleTask`: Scheduled age-based compression (compresses content as it ages)
- `upsertArticle()`: **Automatic Brotli 6 compression** during ingestion (new content is compressed by default)
- Background task system: `/api/background-tasks` UI

## Troubleshooting

**"No such table: content_storage"**
- Run database schema migration first
- Check that normalized schema has been deployed

**"compressAndStore is not a function"**
- Ensure compression utilities are properly installed
- Check import paths in tool files

**High error rates during migration**
- Check database connectivity
- Verify content format compatibility
- Review error messages for specific issues

## Performance Notes

- Tools process content in batches to avoid memory issues
- Large datasets may take significant time to process
- Monitor database I/O during compression operations
- Consider running during off-peak hours for large migrations