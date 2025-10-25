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

### Data Correction & Maintenance
- `corrections/` - Data cleanup and integrity tools
- `vacuum-db.js` - Database vacuum and optimization
- `db-maintenance.js` - General database maintenance
- `cleanup-test-logs.js` - Test log cleanup

### Performance & Benchmarking
- `benchmarks/` - Performance benchmarking tools
- `compression-benchmark.cjs` - Compression performance testing

### Debug & Development
- `debug/` - Debugging and monitoring tools
- `manual-tests/` - Manual testing utilities
- `count-testlogs.js` - Test log analysis

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

# Safe data corrections
node tools/corrections/fix-foreign-keys.js --dry-run
node tools/corrections/fix-foreign-keys.js --fix

# Performance testing
node tools/compression-benchmark.cjs
```

## Agentic Workflows

Tools are designed for composition in automated workflows with:
- Structured JSON output for parsing
- Exit codes for decision logic (0=success, 1=error, 2=warning)
- Idempotent operations (safe to re-run)

See `AGENTS.md` "Agentic CLI Workflows" for multi-step automation patterns.