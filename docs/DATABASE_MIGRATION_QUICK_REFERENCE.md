# Database Migration Quick Reference

**For**: AI Agents performing database migrations  
**See Also**: `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` for complete details

---

## Before Starting Any Migration

```bash
# 1. Check current schema version
node -e "const db = require('./src/db/sqlite').ensureDatabase('./data/news.db'); console.log('Schema version:', db.pragma('user_version', { simple: true })); db.close();"

# 2. Check for known schema issues
cat docs/DATABASE_SCHEMA_ISSUES_STATUS.md

# 3. Backup current database
cp data/news.db data/news-backup-$(date +%Y-%m-%d).db
```

---

## Migration Checklist

- [ ] Create migration document: `docs/migrations/YYYY-MM-DD-migration-name.md`
- [ ] Identify affected tables/columns/code files
- [ ] Document rollback plan
- [ ] Check test coverage: `npm run test:file "table-name"`
- [ ] Create dual adapters (LegacyDatabaseAdapter, ModernDatabaseAdapter)
- [ ] Write adapter tests
- [ ] Test export/import on 100 record subset
- [ ] Update schema definitions
- [ ] Add migration to `src/db/sqlite/schema.js`
- [ ] Update all query code
- [ ] Run full test suite: `npm test`
- [ ] Verify critical features work
- [ ] Update documentation

---

## Export/Import Commands

```bash
# Export test subset (100 articles)
node src/db/sqlite/tools/export-subset.js \
  --db data/news.db \
  --output exports/test-100.json \
  --articles 100 \
  --verbose

# Import to new database
node src/db/sqlite/tools/import-subset.js \
  --input exports/test-100.json \
  --db data/news-new.db \
  --validate \
  --verbose

# Export full database (production)
node src/db/sqlite/tools/export-subset.js \
  --db data/news.db \
  --output exports/full-export-$(date +%Y-%m-%d).json \
  --articles 999999 \
  --verbose
```

---

## Test Commands

```bash
# Test adapters
npm run test:file "Adapter"

# Test export/import
npm run test:file "export-import"

# Full test suite
npm test

# Check for schema errors in logs
npm start 2>&1 | grep -i "schema.*error\|failed to initialize"
```

---

## Validation Commands

```bash
# Count table rows (before/after comparison)
node tools/debug/count-tables.js > counts-before.txt
# ... perform migration ...
node tools/debug/count-tables.js > counts-after.txt
diff counts-before.txt counts-after.txt

# Check schema integrity
sqlite3 data/news.db "PRAGMA integrity_check;"

# Verify specific table structure
sqlite3 data/news.db "PRAGMA table_info(articles);"
```

---

## Rollback Procedure

```bash
# 1. Stop server
pkill -f "node.*server.js"

# 2. Restore backup
cp data/news-backup-YYYY-MM-DD.db data/news.db

# 3. Clear WAL files
rm data/news.db-wal data/news.db-shm

# 4. Verify integrity
sqlite3 data/news.db "PRAGMA integrity_check;"

# 5. Restart server
npm start

# 6. Document failure
echo "Migration failed: [reason]" >> docs/migrations/YYYY-MM-DD-migration-name.md
```

---

## Common Migration Patterns

### Add Column to Existing Table

```javascript
// src/db/sqlite/schema.js - Add to initCoreTables()
try {
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='table_name'").get();
  if (tableInfo && !tableInfo.sql.toLowerCase().includes('column_name')) {
    if (verbose) logger.log('[schema] Adding column_name to table_name...');
    db.exec('ALTER TABLE table_name ADD COLUMN column_name TYPE DEFAULT value');
  }
} catch (err) {
  if (verbose) logger.warn('[schema] Warning during column_name migration:', err.message);
}
```

### Change Column Type (Requires Table Recreation)

```javascript
// Create new table with correct type
db.exec(`
  CREATE TABLE table_name_new (
    id TEXT PRIMARY KEY,  -- Changed from INTEGER
    other_columns...
  )
`);

// Copy data
db.exec('INSERT INTO table_name_new SELECT * FROM table_name');

// Swap tables
db.exec('DROP TABLE table_name');
db.exec('ALTER TABLE table_name_new RENAME TO table_name');
```

### Add Index (Defensive)

```javascript
// Won't fail if column doesn't exist
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_table_column ON table_name(column_name)');
} catch (indexErr) {
  if (verbose) logger.warn('[schema] Could not create index:', indexErr.message);
}
```

---

## When Migration State Affects Development

**Check migration state if**:
- Starting new feature that uses database
- Test failures mention "no such column"
- Feature requires schema changes
- Reviewing or debugging database code

**Update migration docs when**:
- Adding new tables or columns
- Changing column types
- Creating new indexes
- Modifying foreign key relationships

---

## Related Documentation

- **`docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md`** ⭐ Complete migration workflow (850+ lines)
- **`docs/DATABASE_SCHEMA_ISSUES_STATUS.md`** - Current schema state and known issues
- **`docs/DATABASE_MIGRATION_IMPLEMENTATION_SUMMARY.md`** - What was created and why
- **`AGENTS.md`** - "Database Architecture" section and "When to Read" table

---

**Quick Start**: Read `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` Section 1-3 before first migration (15 min)
