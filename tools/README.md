# CLI Tools Reference

This directory contains CLI tools for database operations, data analysis, automation workflows, and system maintenance.

## Tool Categories

### Database Tools
- `db-schema.js` - Database schema inspection and queries
- `db-query.js` - Execute custom database queries
- `db-table-sizes.js` - Analyze table sizes and statistics
- `db-table-sizes-fast.js` - Fast table size analysis

### Data Analysis & Crawling
- `intelligent-crawl.js` - Analyze crawl data and patterns
- `analyze-country-hub-patterns.js` - Country hub pattern analysis
- `crawl-place-hubs.js` - Place hub discovery and validation
- `analysis/` - Hub analysis and discovery scripts
  - `enhanced-hub-discovery.js` - Enhanced hub discovery workflow
  - `hub-analysis-workflow.js` - Hub analysis workflow
  - `unified-hub-discovery.js` - Unified hub discovery

### Data Correction & Maintenance
- `corrections/` - Data cleanup and integrity tools
  - `cleanup-hubs.js` - Hub cleanup operations
  - `fix-article-place-relations.js` - Fix article-place relationships
- `maintenance/` - Database and system maintenance
  - `build-components.js` - Build UI components
  - `build-ui.js` - Build user interface
  - `check-db-tables.js` - Check database tables
  - `check-db.js` - Database health check
  - `check-fk.js` - Foreign key validation
  - `check-tables.js` - Table structure validation
  - `check_schema.js` - Schema validation
  - `fix-foreign-key.js` - Foreign key fixes
  - `phase-1-add-normalized-tables.js` - Schema normalization phase 1
  - `review-non-db-data.js` - Review non-database data
- `vacuum-db.js` - Database vacuum and optimization
- `db-maintenance.js` - General database maintenance
- `cleanup-test-logs.js` - Test log cleanup
- `move-docs-to-docs.js` - Move documentation files from root to docs/ directory
- `move-scripts-to-tools.js` - Move scripts to categorized subdirectories
- `update-script-references.js` - Update documentation references after script moves

### Performance & Benchmarking
- `benchmarks/` - Performance benchmarking tools
- `compression-benchmark.cjs` - Compression performance testing

### Debug & Development
- `debug/` - Debugging and monitoring tools
  - `analyze_failures.js` - Analyze test failures
  - `analyze_url.js` - URL analysis
  - `check-analysis-data.js` - Analysis data validation
  - `check-compression-stats.js` - Compression statistics
  - `check-content-analysis.js` - Content analysis validation
  - `check-export.js` - Export validation
  - `check_duplicates.js` - Duplicate detection
  - `check_missing_storage.js` - Missing storage check
  - `extract-urls.js` - URL extraction
  - `show-analyzed-urls.js` - Display analyzed URLs
  - `temp_check.js` - Temporary checks
- `manual-tests/` - Manual testing utilities
- `count-testlogs.js` - Test log analysis

### Examples & Migrations
- `examples/` - Example scripts and demonstrations
  - `sample-place-matching.js` - Place matching examples
- `migrations/` - Database migration scripts
  - `migrate-places-add-wikidata-columns.js` - Add Wikidata columns to places
  - `phase-2-enable-dual-write.js` - Enable dual-write operations
  - `seed-topics-and-skip-terms.js` - Seed topics and skip terms

## Safety Features

All tools follow safety-first patterns:
- **Dry-run mode** by default for destructive operations
- **Clear output formatting** with emojis and structured data
- **Progress indicators** for long-running operations
- **Error handling** with actionable error messages

## Usage Examples

```bash
# Database inspection
node tools/db-schema.js tables
node tools/db-schema.js describe articles

# Data analysis
node tools/intelligent-crawl.js --limit 50
node tools/analyze-country-hub-patterns.js
node tools/analysis/enhanced-hub-discovery.js

# Data corrections
node tools/corrections/fix-article-place-relations.js --dry-run
node tools/corrections/fix-article-place-relations.js --fix

# Database maintenance
node tools/maintenance/check-db.js
node tools/maintenance/build-components.js

# Debug and analysis
node tools/debug/check-analysis-data.js
node tools/debug/analyze_failures.js

# Migrations
node tools/migrations/seed-topics-and-skip-terms.js

# Documentation organization
node tools/move-docs-to-docs.js  # Dry run
node tools/move-docs-to-docs.js --fix  # Actually move files

# Script organization
node tools/move-scripts-to-tools.js  # Dry run categorization
node tools/move-scripts-to-tools.js --fix  # Move and categorize scripts
node tools/update-script-references.js --fix  # Update documentation references

# Performance testing
node tools/compression-benchmark.cjs
```

## Agentic Workflows

Tools are designed for composition in automated workflows with:
- Structured JSON output for parsing
- Exit codes for decision logic (0=success, 1=error, 2=warning)
- Idempotent operations (safe to re-run)

See `AGENTS.md` "Agentic CLI Workflows" for multi-step automation patterns.