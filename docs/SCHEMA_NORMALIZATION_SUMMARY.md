# Database Schema Normalization & Compression - Executive Summary

**Date**: 2025-10-06  
**Author**: GitHub Copilot (at user request)  
**Full Details**: See `DATABASE_NORMALIZATION_PLAN.md`

---

## Your Questions Answered

### 1. Where can the database be normalized?

#### **Critical Issues** (Must Fix)

**`articles` table** (★★★★★):
- **Problem**: 30+ columns mixing 5 different concerns (URL identity, HTTP metadata, content, timing, analysis)
- **Violations**: Breaks 2NF (non-key attributes depend on URL not primary key), 3NF (transitive dependencies)
- **Impact**: Storage waste (duplicate data with `fetches`), update anomalies, can't query efficiently
- **Solution**: Split into `http_responses`, `content_storage`, `content_analysis`, `discovery_events`

**`fetches` table** (★★★★☆):
- **Problem**: Mixes HTTP protocol metadata with storage concerns and analysis results
- **Violations**: Breaks single responsibility principle
- **Impact**: Can't query "all HTTP requests" vs "all content storage" independently
- **Solution**: Split into `http_responses` (protocol) + `content_storage` (storage)

#### **Moderate Issues** (Should Fix)

**`places` table** (★★★☆☆):
- **Problem**: Mixes core place identity with provenance data and JSON blobs
- **Violations**: JSON blobs (`extra`, `wikidata_props`, `osm_tags`) can't be indexed or queried efficiently
- **Impact**: Slow queries on Wikidata properties, multiple external IDs in different columns
- **Solution**: Split into `places` (core) + `place_provenance` (sources) + `place_attributes` (normalized properties)

**`urls` table** (★★☆☆☆):
- **Problem**: Has `analysis` TEXT column (JSON blob)
- **Impact**: Minor—can't index or query analysis efficiently
- **Solution**: Separate `url_analysis` table

#### **Summary of Normalization Opportunities**

| Table | Current Columns | Issues | Normalized Into |
|-------|----------------|--------|-----------------|
| `articles` | 30+ | 5 mixed concerns | `http_responses`, `content_storage`, `content_analysis`, `discovery_events` |
| `fetches` | 20+ | 3 mixed concerns | `http_responses`, `content_storage` |
| `places` | 25+ | JSON blobs, mixed provenance | `places`, `place_provenance`, `place_attributes` |
| `urls` | 6 | JSON analysis blob | `urls`, `url_analysis` |

---

### 2. How can compression be implemented?

#### **Three-Tier Compression Strategy**

**Tier 1: Individual Compression** (for warm data)
```javascript
// Store compressed content individually
async function storeCompressed(content) {
  const compressed = await zstd.compress(content, 3); // Level 3 for speed
  
  db.prepare(`
    INSERT INTO content_storage (
      storage_type, 
      compression_type_id,
      content_blob,
      uncompressed_size,
      compressed_size
    ) VALUES ('db_compressed', 3, ?, ?, ?)
  `).run(compressed, content.length, compressed.length);
}

// Retrieve
async function retrieveCompressed(id) {
  const row = db.prepare('SELECT content_blob FROM content_storage WHERE id = ?').get(id);
  return await zstd.decompress(row.content_blob);
}
```

**Performance**: 3x compression, ~2ms decompression

**Tier 2: Bucket Compression** (for cold data)
```javascript
// Group similar files (same domain, same type)
class CompressionBucketManager {
  async createBucket(domainPattern, bucketType) {
    // Create bucket for "bbc.co.uk HTML articles"
    return db.prepare(`
      INSERT INTO compression_buckets (bucket_type, domain_pattern)
      VALUES (?, ?)
    `).run(bucketType, domainPattern).lastInsertRowid;
  }
  
  async addToBucket(bucketId, filename, content) {
    // 1. Get existing bucket tar archive
    // 2. Add new file to tar
    // 3. Compress entire tar with zstd level 19 (maximum)
    // 4. Update bucket_blob and index_json
    // 5. Store mapping in content_storage
  }
  
  async retrieveFromBucket(bucketId, filename) {
    // 1. Check LRU cache for decompressed bucket
    // 2. If miss: decompress bucket, cache it
    // 3. Extract specific file from tar archive
    // 4. Return content
  }
}
```

**Performance**: 20x compression, ~150ms first access (then cached)

**Tier 3: No Compression** (for hot data)
```javascript
// Store inline uncompressed
db.prepare(`
  INSERT INTO content_storage (storage_type, content_blob)
  VALUES ('db_inline', ?)
`).run(content);
```

#### **Schema for Compression**

```sql
-- Compression types registry
CREATE TABLE compression_types (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE, -- 'none' | 'gzip' | 'zstd'
  compression_level INTEGER
);

-- Compression buckets (shared archives)
CREATE TABLE compression_buckets (
  id INTEGER PRIMARY KEY,
  bucket_type TEXT, -- 'html_similar' | 'json_api'
  domain_pattern TEXT,
  bucket_blob BLOB, -- Compressed tar archive
  index_json TEXT, -- Map: filename → {offset, size}
  compression_ratio REAL -- 20.0 for 20x compression
);

-- Content storage (where content lives)
CREATE TABLE content_storage (
  id INTEGER PRIMARY KEY,
  storage_type TEXT, -- 'db_inline' | 'db_compressed' | 'bucket_compressed'
  compression_type_id INTEGER REFERENCES compression_types(id),
  compression_bucket_id INTEGER REFERENCES compression_buckets(id),
  bucket_entry_key TEXT, -- Filename within bucket
  content_blob BLOB, -- Content (if not in bucket)
  content_sha256 TEXT
);
```

#### **Compression Strategy Decision Tree**

```
Is content frequently accessed?
├─ YES → storage_type='db_inline' (no compression, <1ms access)
└─ NO
   ├─ Accessed occasionally?
   │  └─ YES → storage_type='db_compressed', zstd level 3 (3x compression, ~2ms access)
   └─ Rarely accessed (archival)?
      └─ YES → storage_type='bucket_compressed', zstd level 19 (20x compression, ~150ms first access)
```

---

### 3. How can compression buckets work?

#### **Concept**

**Problem**: Compressing files individually wastes compression potential. Similar files (e.g., 1000 articles from the same news site) have shared vocabulary, structure, and patterns that compression algorithms can exploit.

**Solution**: Group similar files into a tar archive, compress the entire archive with zstd dictionary compression.

#### **Implementation**

```javascript
// 1. Create bucket for BBC articles
const bucketId = await bucketManager.createBucket('bbc.co.uk', 'html_similar');

// 2. Add 1000 articles to bucket
for (let i = 0; i < 1000; i++) {
  const article = await fetchArticle(`https://bbc.co.uk/news/article-${i}`);
  await bucketManager.addToBucket(bucketId, `article-${i}.html`, article.html);
}

// 3. Finalize bucket (seal it, no more additions)
await bucketManager.finalizeBucket(bucketId);

// Result: 45MB uncompressed → 2.3MB compressed (19.6x compression)

// 4. Retrieve specific article
const html = await bucketManager.retrieveFromBucket(bucketId, 'article-42.html');
// First access: ~150ms (decompress entire bucket, cache it)
// Subsequent access: <1ms (bucket cached in memory)
```

#### **Bucket Format**

```
Bucket Blob = zstd_compress(tar_archive, level=19)

tar_archive:
  article-1.html    (45 KB)
  article-2.html    (43 KB)
  article-3.html    (47 KB)
  ...
  article-1000.html (44 KB)

index_json:
{
  "article-1.html": { "size": 45000, "added_at": "2025-10-06T10:00:00Z" },
  "article-2.html": { "size": 43000, "added_at": "2025-10-06T10:01:00Z" },
  ...
}
```

#### **Access Pattern**

```
User requests article-42.html from bucket 123

1. Check LRU cache: bucketCache.get('bucket:123')
   ├─ Cache HIT → Extract article-42.html from cached tar (< 1ms)
   └─ Cache MISS:
      1. Query: SELECT bucket_blob FROM compression_buckets WHERE id = 123
      2. Decompress: tarData = zstd.decompress(bucket_blob) (~150ms for 2.3MB)
      3. Cache: bucketCache.set('bucket:123', tarData)
      4. Extract: tar.extract(tarData, 'article-42.html')
      5. Return: article HTML

2. Next request for article-84.html from same bucket:
   → Cache HIT → Extract from cached tar (< 1ms) ✓
```

#### **When to Use Buckets**

**Good Use Cases**:
- **Archival storage**: Old articles unlikely to be accessed individually
- **Bulk analysis**: Scan all articles from a domain (read entire bucket anyway)
- **Similar content**: Same site, same content type (HTML, JSON, CSS)

**Bad Use Cases**:
- **Real-time serving**: 150ms first access too slow for web serving
- **Diverse content**: Random files won't compress well together
- **Frequently accessed**: Cache thrashing if many buckets accessed

---

### 4. Can we avoid schema migration (export/import)?

**YES!** That's the key innovation of this plan.

#### **Migration-Free Strategy**

**Traditional approach** (requires downtime):
```
1. Export all data from old schema → JSON files
2. Create new database with new schema
3. Import JSON → transform data → insert into new schema
4. Switch application to new database
5. Drop old database

Problem: Requires downtime, risky, hard to rollback
```

**Our approach** (zero downtime):
```
1. Add new normalized tables ALONGSIDE existing tables
2. Modify app to write to BOTH schemas (dual-write)
3. Backfill historical data incrementally (background job)
4. Create views that reconstruct old tables from new tables
5. Switch reads to views (backward compatible)
6. Eventually switch to direct normalized access
7. Archive old tables (rename to _legacy)
8. Drop legacy tables after validation period

Benefits: No downtime, gradual migration, easy rollback
```

#### **Concrete Example**

```sql
-- Step 1: Add new tables (no changes to existing schema)
CREATE TABLE http_responses (
  id INTEGER PRIMARY KEY,
  url_id INTEGER,
  http_status INTEGER,
  fetched_at TEXT
);

CREATE TABLE content_storage (
  id INTEGER PRIMARY KEY,
  http_response_id INTEGER,
  content_blob BLOB
);

-- Step 2: Create view that looks like old 'articles' table
CREATE VIEW articles_view AS
SELECT 
  cs.id,
  u.url,
  hr.http_status,
  hr.fetched_at AS crawled_at,
  cs.content_blob AS html
FROM content_storage cs
JOIN http_responses hr ON cs.http_response_id = hr.id
JOIN urls u ON hr.url_id = u.id;

-- Step 3: Modify app to write to both schemas
function upsertArticle(article) {
  // Write to old schema (existing code)
  db.prepare('INSERT INTO articles (url, html, ...) VALUES (?, ?, ...)').run(article);
  
  // ALSO write to new schema
  const urlId = ensureUrl(article.url);
  const httpId = db.prepare('INSERT INTO http_responses (url_id, ...) VALUES (?, ...)').run(urlId);
  db.prepare('INSERT INTO content_storage (http_response_id, content_blob) VALUES (?, ?)').run(httpId, article.html);
}

// Step 4: Read from view (looks identical to old table)
function getArticle(url) {
  return db.prepare('SELECT * FROM articles_view WHERE url = ?').get(url);
  // Returns same shape as old 'articles' table ✓
}

// Step 5: Eventually rename view to replace table
ALTER TABLE articles RENAME TO articles_legacy;
ALTER VIEW articles_view RENAME TO articles;
// Now all code reading 'articles' gets normalized data transparently
```

#### **Why This Works**

1. **No breaking changes**: New tables added, old tables unchanged
2. **Dual-write ensures consistency**: Both schemas stay in sync
3. **Views provide compatibility**: Old table structure reconstructed from new tables
4. **Gradual migration**: Can run dual-write for weeks/months while validating
5. **Easy rollback**: Just stop dual-write, revert to old tables

#### **Timeline**

- **Week 1-2**: Add new tables (no risk, no downtime)
- **Week 3-4**: Enable dual-write (low risk, app writes to both schemas)
- **Week 5-10**: Backfill historical data (background job, no impact on app)
- **Week 11-12**: Create views (no risk, just CREATE VIEW statements)
- **Week 13-16**: Switch reads to views (medium risk, monitor performance)
- **Week 17-20**: Switch to direct normalized access (medium risk, monitor carefully)
- **Week 21+**: Archive legacy tables (low risk, keep as backup for 30-90 days)

**Total downtime required**: Zero

---

### 5. What about the programmatic groundwork for future migrations?

#### **Migration Infrastructure Modules**

Even if we use the migration-free approach, we still need infrastructure for:
- Schema version tracking
- Data export/import (for backups, analytics)
- Data validation
- Transformation rules

**Created Modules**:

```
src/db/migration/
  schema-versions.js       # Track which schema version is applied
  exporter.js             # Export tables to JSON/NDJSON
  importer.js             # Import from JSON with transformations
  transformer.js          # Define data transformation rules (v1→v2, v2→v3, etc.)
  validator.js            # Validate data integrity after migration
  migrator.js             # Orchestrate full migration process
  strategies/
    sqlite-workarounds.js # Handle SQLite limitations (DROP COLUMN, etc.)
    compression-migration.js # Migrate existing content to compressed storage
```

#### **Schema Version Tracking**

```javascript
// src/db/migration/schema-versions.js

class SchemaVersionManager {
  constructor(db) {
    this.db = db;
    this._ensureVersionTable();
  }
  
  _ensureVersionTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        description TEXT,
        rollback_sql TEXT
      );
    `);
  }
  
  getCurrentVersion() {
    const row = this.db.prepare(`
      SELECT MAX(version) AS current_version
      FROM schema_migrations
    `).get();
    
    return row?.current_version || 0;
  }
  
  recordMigration(version, name, description) {
    this.db.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at, description)
      VALUES (?, ?, datetime('now'), ?)
    `).run(version, name, description);
  }
  
  getMigrationHistory() {
    return this.db.prepare(`
      SELECT version, name, applied_at, description
      FROM schema_migrations
      ORDER BY version ASC
    `).all();
  }
}

// Usage:
const versionManager = new SchemaVersionManager(db);
console.log('Current schema version:', versionManager.getCurrentVersion());

// Record migration
versionManager.recordMigration(
  2, 
  'add_normalized_tables',
  'Add http_responses, content_storage, compression tables'
);
```

#### **Data Exporter**

```javascript
// src/db/migration/exporter.js

class DatabaseExporter {
  async exportTable(tableName, outputPath) {
    const rows = this.db.prepare(`SELECT * FROM ${tableName}`).all();
    const writeStream = fs.createWriteStream(outputPath);
    const transform = ndjson.stringify();
    
    await pipeline(
      async function* () {
        for (const row of rows) {
          yield row;
        }
      },
      transform,
      writeStream
    );
    
    return rows.length;
  }
  
  async exportFullDatabase(outputDir) {
    // Exports all tables to NDJSON files
    // Creates manifest.json with metadata
  }
}

// Usage:
const exporter = new DatabaseExporter(db);
await exporter.exportFullDatabase('./backups/2025-10-06');
```

#### **Data Transformer**

```javascript
// src/db/migration/transformer.js

class SchemaTransformer {
  constructor(sourceVersion, targetVersion) {
    this.sourceVersion = sourceVersion;
    this.targetVersion = targetVersion;
  }
  
  transform(tableName, row) {
    // Version 1 → 2: Split articles into normalized tables
    if (this.sourceVersion === 1 && this.targetVersion === 2) {
      if (tableName === 'articles') {
        return {
          http_response: {
            url_id: row.url,
            http_status: row.http_status,
            fetched_at: row.fetched_at
          },
          content_storage: {
            content_blob: row.html,
            content_sha256: row.html_sha256
          },
          content_analysis: {
            title: row.title,
            word_count: row.word_count,
            classification: 'article'
          }
        };
      }
    }
    
    return row; // No transformation needed
  }
}
```

#### **Data Validator**

```javascript
// src/db/migration/validator.js

class DataValidator {
  async validateMigration(sourceManifest, targetDb) {
    const errors = [];
    
    // 1. Check row counts match
    for (const [table, meta] of Object.entries(sourceManifest.tables)) {
      const count = targetDb.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
      if (count !== meta.row_count) {
        errors.push({ type: 'row_count_mismatch', table, expected: meta.row_count, actual: count });
      }
    }
    
    // 2. Check foreign key constraints
    const fkViolations = targetDb.prepare('PRAGMA foreign_key_check').all();
    if (fkViolations.length > 0) {
      errors.push({ type: 'foreign_key_violations', violations: fkViolations });
    }
    
    // 3. Spot-check data integrity
    // ...
    
    return { valid: errors.length === 0, errors };
  }
}
```

#### **When to Use These Modules**

**Now (Phase 0)**:
- Create `schema_migrations` table
- Record current schema as version 1
- Implement version tracking (no impact on app)

**Phase 1** (Add normalized tables):
- Record as version 2
- Use version manager to track which version is applied

**Future** (If export/import ever needed):
- Use exporter to backup database before risky operations
- Use transformer to migrate old exports to new schema
- Use validator to ensure migration succeeded

**Benefits**:
1. **Version tracking**: Always know which schema version is running
2. **Export capability**: Can backup data to JSON for analytics, archival
3. **Transform capability**: Can migrate old backups to new schema
4. **Validate capability**: Can verify data integrity after any change

---

## Summary

### Normalization Opportunities

1. **`articles` table** → Split into 4 tables (`http_responses`, `content_storage`, `content_analysis`, `discovery_events`)
2. **`fetches` table** → Split into 2 tables (`http_responses`, `content_storage`)
3. **`places` table** → Split into 3 tables (`places`, `place_provenance`, `place_attributes`)
4. **Expected benefits**: 40-50% database size reduction, better query performance, easier to maintain

### Compression Strategy

1. **Individual compression**: zstd level 3 (3x compression, ~2ms access) for warm data
2. **Bucket compression**: zstd level 19 on tar archives (20x compression, ~150ms first access) for cold data
3. **Schema**: `compression_types`, `compression_buckets`, `content_storage` with `storage_type` field

### Migration-Free Implementation

1. **Add new tables** alongside existing schema (no breaking changes)
2. **Dual-write**: Write to both schemas simultaneously
3. **Create views**: Reconstruct old tables from new tables
4. **Gradual cutover**: Switch reads to views, then to direct normalized access
5. **Archive legacy**: Rename old tables, keep as backup, eventually drop
6. **Zero downtime**: Entire process happens without service interruption

### Programmatic Groundwork

1. **Schema version tracking**: `SchemaVersionManager` tracks which version is applied
2. **Export/Import**: `DatabaseExporter` and `DatabaseImporter` for backups and data portability
3. **Transformations**: `SchemaTransformer` defines how to convert data between schema versions
4. **Validation**: `DataValidator` ensures data integrity after any migration
5. **Use now**: Create infrastructure, use version tracking immediately

---

**Next Steps**:
1. Review full plan in `DATABASE_NORMALIZATION_PLAN.md`
2. Decide on timeline (can start immediately with no risk)
3. Create migration infrastructure modules (Phase 0)
4. Add normalized tables (Phase 1)
5. Enable compression for new content (Phase 1)

**Key Takeaway**: The entire normalization and compression migration can happen **without export/import cycles** using the dual-write + views strategy. This is safe, gradual, and can be rolled back at any point.
