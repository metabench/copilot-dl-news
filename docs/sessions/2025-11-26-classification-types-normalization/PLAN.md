# Plan: Classification Types Table Normalization

**Objective**: Create a normalized `classification_types` lookup table and add a foreign key to `content_analysis` for better data integrity and UI support.

**Done when**:
- [ ] `classification_types` table exists with id, name, emoji, description, created_at
- [ ] Existing classifications from `content_analysis` are migrated to new table
- [ ] `content_analysis` has `classification_type_id` FK column (keep `classification` text for backward compatibility)
- [ ] Query functions exist for listing/getting classification types
- [ ] UI routes `/classifications` and `/classifications/:id` are functional
- [ ] Documentation updated

## Change Set

### Database Schema
- `src/db/sqlite/v1/schema-definitions.js` - Add `classification_types` table definition
- `src/db/sqlite/v1/schema.js` - Add to COMPRESSION_TARGETS (or new set)

### Migration
- `tools/migrations/add-classification-types.js` - Migration script

### Queries  
- `src/db/sqlite/v1/queries/ui/classificationTypes.js` - Query functions

### Server
- `src/ui/server/dataExplorerServer.js` - Add routes

### Documentation
- `docs/CONTENT_CLASSIFICATION_SYSTEM.md` - Update with table info
- `docs/DATABASE_SCHEMA_ERD.md` - Add new table

## Risks/Assumptions

- **Backward compatibility**: Keep `classification` TEXT column, add `classification_type_id` FK
- **Data integrity**: Populate FK based on existing text values during migration
- **Performance**: Counts may be slow for large datasets - use async loading

## Schema Design

```sql
CREATE TABLE IF NOT EXISTS classification_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,           -- 'article', 'hub', 'place-hub', etc.
  display_name TEXT NOT NULL,          -- 'Article', 'Hub', 'Place Hub'
  emoji TEXT,                          -- '📰', '🔗', '📍'
  description TEXT,                    -- Longer description
  category TEXT,                       -- 'content', 'hub', 'special'
  sort_order INTEGER DEFAULT 0,        -- For UI ordering
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Migration Strategy

1. Create new `classification_types` table
2. Populate with distinct values from `content_analysis.classification`
3. Add `classification_type_id` column to `content_analysis`
4. Update FK based on name matching
5. Create index on FK column

## Tests

- Query functions return expected data
- Migration is idempotent (can run multiple times safely)
- UI routes render correctly

## Benchmark

- Count query on 40k+ rows should complete in <100ms
- Listing page should load in <500ms
