# Working Notes: Classification Types Normalization

## Discovery Phase

### Current State (from db-query.js)

```bash
node tools/db-query.js --sql "SELECT classification, COUNT(*) as count FROM content_analysis WHERE classification IS NOT NULL GROUP BY classification ORDER BY count DESC" --json
```

Result:
```json
[{"classification": "article", "count": 40553}]
```

Currently only one classification value exists in the database: `article`

### Existing Pattern: compression_types table

```sql
CREATE TABLE compression_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  algorithm TEXT NOT NULL,
  level INTEGER NOT NULL,
  mime_type TEXT,
  extension TEXT,
  memory_mb INTEGER DEFAULT 0,
  window_bits INTEGER,
  block_bits INTEGER,
  description TEXT
);
```

This is referenced by `content_storage.compression_type_id` FK.

### Classification Emoji Mapping (from classificationEmoji.js)

Already defined emojis for:
- article: 📰
- nav/navigation: 🧭
- hub: 🔗
- place-hub: 📍
- place-place-hub: 📍📍
- topic-hub: 🏷️
- place-topic-hub: 📍🏷️
- place-place-topic-hub: 📍📍🏷️
- error: ⚠️
- redirect: ↪️
- api: 🔌
- unknown: ❓

## Implementation Notes

### Table in schema-definitions.js

Added to COMPRESSION_TARGETS set since it's part of the content analysis system.

### Seed Data

Pre-populated with 24 known classifications including:
- Content types: article, nav, navigation, article-screened, index, listing, category
- Hub types: hub, place-hub, place-place-hub, topic-hub, place-topic-hub, place-place-topic-hub
- Media types: image, video, audio, document, pdf
- Special types: error, redirect, api, api-response
- Status types: unknown, unclassified

## Implementation Completed

### Files Created/Modified

1. **`src/db/sqlite/v1/schema-definitions.js`** - Added `classification_types` table to TABLE_STATEMENTS and TABLE_DEFINITIONS

2. **`src/db/sqlite/v1/schema.js`** - Added `classification_types` to COMPRESSION_TARGETS set

3. **`tools/migrations/add-classification-types.js`** - Migration script that:
   - Creates the classification_types table
   - Seeds with 24 classification types
   - Reports statistics after completion
   - Supports --dry-run mode

4. **`src/db/sqlite/v1/queries/ui/classificationTypes.js`** - Query functions:
   - `listClassificationTypes()` - List all types
   - `getClassificationById(id)` - Get by ID
   - `getClassificationByName(name)` - Get by name
   - `listClassificationsWithCounts()` - List with document counts
   - `getDocumentsForClassification(name, options)` - Get docs for type
   - `countDocumentsForClassification(name)` - Count docs

5. **`src/db/sqlite/queries/ui/classificationTypes.js`** - Bridge file to v1

6. **`src/ui/server/dataExplorerServer.js`** - Added:
   - Import for `listClassificationsWithCounts`
   - `buildClassificationColumns()` function
   - `buildClassificationRows()` function
   - `renderClassificationsView()` function
   - "Classifications" entry in DATA_VIEWS

### Routes Added

- `/classifications` - Lists all classification types with document counts

### Testing Notes

- Migration tested with `--dry-run` before actual execution
- Query functions tested via inline Node.js evaluation
- Route tested via `Invoke-WebRequest` and Simple Browser

### Schema Relationship Discovery

The content_analysis table doesn't link directly to urls. The chain is:
```
content_analysis → content_storage (via content_id)
content_storage → http_responses (via http_response_id)
http_responses → urls (via url_id)
```

This required updating the `getDocumentsForClassification` query to use proper JOINs.
