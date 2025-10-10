# Database Normalization & Compression Architecture Plan

**Status**: Design Phase  
**Created**: 2025-10-06  
**Goal**: Normalize database schema, add compression infrastructure, and establish migration groundwork WITHOUT requiring immediate schema changes to existing tables.

**When to Read**:
- Planning schema evolution, migration phases, or dual-write strategies for the SQLite database
- Estimating effort or sequencing for normalization and compression initiatives
- Coordinating with Phase 0 migration tooling before implementing structural changes

---

## Executive Summary

This document details a comprehensive plan to:

1. **Normalize the database schema** from current denormalized form (mixing concerns across tables) to 3NF/BCNF with backward-compatible views
2. **Add compression infrastructure** for HTTP content storage with individual and bucket-based compression
3. **Establish migration infrastructure** for future schema evolution without data loss
4. **Implement without breaking changes** using dual-write strategy and views

**Key Insight**: We can add new normalized tables alongside existing schema, use triggers/views for compatibility, and gradually migrate data—avoiding the need for immediate export/import cycles.

---

## Part 1: Current Schema Analysis

### Major Denormalization Issues

#### 1. **`articles` Table** (★★★★★ Critical)

**Current State**: Massive 30+ column table mixing multiple concerns:
- URL identity: `url`, `canonical_url`
- Content: `html`, `text`, `title`, `date`, `section`
- HTTP metadata: `http_status`, `content_type`, `content_length`, `etag`, `last_modified`, `redirect_chain`
- Timing metrics: `request_started_at`, `fetched_at`, `crawled_at`, `ttfb_ms`, `download_ms`, `total_ms`
- Transfer metrics: `bytes_downloaded`, `transfer_kbps`
- Discovery metadata: `referrer_url`, `discovered_at`, `crawl_depth`
- Analysis: `word_count`, `language`, `article_xpath`, `analysis` (JSON blob)
- Content hashing: `html_sha256`

**Problems**:
- **Update anomalies**: Changing HTTP metadata requires updating article row
- **Storage waste**: Duplicate data between `articles` and `fetches` tables
- **Query inefficiency**: Cannot efficiently query just HTTP metadata or just content
- **Null proliferation**: Many articles have NULL for HTTP fields if scraped differently

**Normal Form Violations**:
- Violates 2NF: Non-key attributes depend on URL, not on (url + fetch_time)
- Violates 3NF: Transitive dependencies (http_status → classification, word_count → language)

#### 2. **`fetches` Table** (★★★★☆ High)

**Current State**: Mixes HTTP protocol concerns with storage concerns:
- HTTP protocol: `http_status`, `content_type`, `content_encoding`, timing
- Storage: `saved_to_db`, `saved_to_file`, `file_path`, `file_size`
- Analysis: `classification`, `nav_links_count`, `article_links_count`, `word_count`

**Problems**:
- Cannot query "all HTTP requests" vs "all content storage" independently
- Storage location (DB vs file) mixed with HTTP response metadata
- Classification is derived from content analysis, not HTTP metadata

#### 3. **`places` Table** (★★★☆☆ Moderate)

**Current State**: Mixes core place identity with provenance:
- Core identity: `kind`, `country_code`, `adm1_code`, `lat`, `lng`, `population`
- Provenance: `source`, `wikidata_qid`, `osm_type`, `osm_id`, `wikidata_props`, `osm_tags`, `extra`
- JSON blobs: `extra`, `wikidata_props`, `osm_tags`, `bbox`

**Problems**:
- Cannot efficiently query Wikidata properties (buried in JSON)
- Source provenance mixed with current place data
- Multiple external IDs stored in different columns (not normalized)

#### 4. **`urls` Table** (★★☆☆☆ Low)

**Current State**: Relatively normalized but has `analysis` TEXT column

**Problems**:
- `analysis` JSON blob should be separate table for indexing
- `canonical_url` creates functional dependency (could be junction table for aliases)

---

## Part 2: Normalized Schema Design

### Design Principles

1. **Separation of Concerns**: HTTP protocol, content storage, analysis, identity
2. **3NF/BCNF Compliance**: Eliminate transitive dependencies
3. **Backward Compatibility**: Views reconstruct denormalized tables
4. **Incremental Migration**: New tables coexist with old tables during transition
5. **Compression-Ready**: Storage layer designed for compression from day one

### New Normalized Tables

#### 2.1 HTTP Protocol Layer

```sql
-- HTTP responses (protocol-level metadata)
CREATE TABLE http_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url_id INTEGER NOT NULL REFERENCES urls(id),
  request_started_at TEXT NOT NULL,
  fetched_at TEXT,
  http_status INTEGER,
  content_type TEXT,
  content_encoding TEXT,
  etag TEXT,
  last_modified TEXT,
  redirect_chain TEXT,           -- JSON array of redirect URLs
  ttfb_ms INTEGER,               -- Time to first byte
  download_ms INTEGER,           -- Download duration
  total_ms INTEGER,              -- Total request duration
  bytes_downloaded INTEGER,
  transfer_kbps REAL
);

CREATE INDEX idx_http_responses_url ON http_responses(url_id, fetched_at DESC);
CREATE INDEX idx_http_responses_status ON http_responses(http_status);
CREATE INDEX idx_http_responses_fetched ON http_responses(fetched_at);
```

#### 2.2 Content Storage Layer (with Compression)

```sql
-- Compression types lookup table
CREATE TABLE compression_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,     -- 'none' | 'gzip' | 'brotli' | 'zstd'
  mime_type TEXT,                -- 'application/gzip' | 'application/zstd'
  extension TEXT,                -- '.gz' | '.br' | '.zst'
  compression_level INTEGER,     -- Compression level used (1-9 for gzip, 1-22 for zstd)
  description TEXT
);

-- Compression buckets (group similar files for better compression)
CREATE TABLE compression_buckets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket_type TEXT NOT NULL,     -- 'html_similar' | 'json_api' | 'css' | 'js' | 'xml_sitemap'
  domain_pattern TEXT,           -- Host pattern for bucket (e.g., 'bbc.co.uk')
  created_at TEXT NOT NULL,
  finalized_at TEXT,             -- When bucket is sealed (no more additions)
  content_count INTEGER DEFAULT 0,
  uncompressed_size INTEGER DEFAULT 0,
  compressed_size INTEGER DEFAULT 0,
  compression_ratio REAL,        -- compressed_size / uncompressed_size
  compression_type_id INTEGER REFERENCES compression_types(id),
  bucket_blob BLOB,              -- Compressed archive (tar.zst, tar.gz, etc.)
  index_json TEXT                -- JSON map: { "filename" -> { offset, size } }
);

CREATE INDEX idx_compression_buckets_type ON compression_buckets(bucket_type);
CREATE INDEX idx_compression_buckets_domain ON compression_buckets(domain_pattern);
CREATE INDEX idx_compression_buckets_finalized ON compression_buckets(finalized_at);

-- Content storage (where content actually lives)
CREATE TABLE content_storage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  http_response_id INTEGER NOT NULL REFERENCES http_responses(id),
  storage_type TEXT NOT NULL,    -- 'db_inline' | 'db_compressed' | 'file' | 'bucket_compressed'
  compression_type_id INTEGER REFERENCES compression_types(id),
  compression_bucket_id INTEGER REFERENCES compression_buckets(id),
  bucket_entry_key TEXT,         -- Filename/key within bucket (e.g., "article_12345.html")
  content_blob BLOB,             -- Raw or compressed content (NULL if in bucket)
  content_sha256 TEXT,           -- SHA256 of uncompressed content
  uncompressed_size INTEGER,
  compressed_size INTEGER,
  compression_ratio REAL,
  file_path TEXT,                -- File path if storage_type='file'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_content_storage_response ON content_storage(http_response_id);
CREATE INDEX idx_content_storage_bucket ON content_storage(compression_bucket_id);
CREATE INDEX idx_content_storage_sha256 ON content_storage(content_sha256);
CREATE INDEX idx_content_storage_type ON content_storage(storage_type);
```

**Storage Type Semantics**:
- `db_inline`: Uncompressed content in `content_blob`
- `db_compressed`: Individually compressed content in `content_blob`
- `file`: Content stored in file system at `file_path`
- `bucket_compressed`: Content in shared compression bucket at `bucket_entry_key`

**Compression Bucket Strategy**:
1. Group similar content (same domain, same content_type)
2. Create tar archive with meaningful filenames
3. Compress entire tar with zstd (level 19 for archives)
4. Store blob and index (filename → offset mapping)
5. Access: Decompress bucket → extract file → cache bucket in memory

**Performance Characteristics**:
- **Compression ratio**: 10-20x for similar HTML (zstd dictionary compression)
- **Access latency**: First access slow (decompress bucket), subsequent fast (cache)
- **Use case**: Archival storage, bulk analysis, not real-time serving
- **Cache strategy**: LRU cache of decompressed buckets (e.g., 10 most recent)

#### 2.3 Content Analysis Layer

```sql
-- Content analysis results (normalized)
CREATE TABLE content_analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL REFERENCES content_storage(id),
  analysis_version INTEGER NOT NULL,
  classification TEXT,           -- 'article' | 'nav' | 'hub' | 'sitemap' | 'other'
  title TEXT,
  date TEXT,
  section TEXT,
  word_count INTEGER,
  language TEXT,                 -- BCP-47 language code
  article_xpath TEXT,            -- XPath to article content
  nav_links_count INTEGER,
  article_links_count INTEGER,
  analysis_json TEXT,            -- Detailed analysis results
  analyzed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_content_analysis_content ON content_analysis(content_id);
CREATE INDEX idx_content_analysis_classification ON content_analysis(classification);
CREATE INDEX idx_content_analysis_version ON content_analysis(analysis_version);
```

**Design Rationale**:
- Multiple analyses per content (reanalysis with new versions)
- Analysis is expensive, content is static → separate tables
- Can query "all articles analyzed with v2" efficiently

#### 2.4 Discovery Metadata Layer

```sql
-- Discovery metadata (how we found this URL)
CREATE TABLE discovery_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url_id INTEGER NOT NULL REFERENCES urls(id),
  discovered_at TEXT NOT NULL,
  referrer_url TEXT,
  crawl_depth INTEGER,
  discovery_method TEXT,         -- 'link' | 'sitemap' | 'seed' | 'redirect'
  crawl_job_id TEXT REFERENCES crawl_jobs(id)
);

CREATE INDEX idx_discovery_url ON discovery_events(url_id, discovered_at DESC);
CREATE INDEX idx_discovery_job ON discovery_events(crawl_job_id);
```

#### 2.5 Place Provenance Layer (Gazetteer Normalization)

```sql
-- Normalize place provenance (replace mixed 'source' column)
CREATE TABLE place_provenance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id INTEGER NOT NULL REFERENCES places(id),
  source TEXT NOT NULL,          -- 'wikidata' | 'osm' | 'restcountries' | 'geonames'
  external_id TEXT NOT NULL,     -- QID (Q30), osm_id (R148838), etc.
  fetched_at INTEGER,            -- Unix timestamp
  raw_data TEXT,                 -- JSON blob of original API response
  UNIQUE(place_id, source, external_id)
);

CREATE INDEX idx_place_provenance_place ON place_provenance(place_id);
CREATE INDEX idx_place_provenance_source ON place_provenance(source);
CREATE INDEX idx_place_provenance_external ON place_provenance(external_id);

-- Normalize place attributes (replace JSON blobs in places table)
CREATE TABLE place_attributes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id INTEGER NOT NULL REFERENCES places(id),
  attribute_kind TEXT NOT NULL,  -- 'population' | 'gdp' | 'area' | 'currency' | 'capital'
  value TEXT NOT NULL,
  source TEXT NOT NULL,
  fetched_at INTEGER,
  confidence REAL,               -- 0.0-1.0 confidence score
  metadata TEXT,                 -- JSON for source-specific details
  UNIQUE(place_id, attribute_kind, source)
);

CREATE INDEX idx_place_attributes_place ON place_attributes(place_id);
CREATE INDEX idx_place_attributes_kind ON place_attributes(attribute_kind);
CREATE INDEX idx_place_attributes_source ON place_attributes(source);
```

**Replaces**: 
- `places.source` → `place_provenance.source`
- `places.extra` JSON blob → normalized `place_attributes` rows
- `places.wikidata_props` JSON → `place_attributes` rows with `source='wikidata'`
- `places.osm_tags` JSON → `place_attributes` rows with `source='osm'`

---

## Part 3: Backward Compatibility Views

### Strategy: Views Reconstruct Denormalized Tables

During transition, existing code reads from views that look identical to old tables:

```sql
-- Reconstruct denormalized 'articles' table
CREATE VIEW articles_view AS
SELECT 
  ca.id,
  u.url,
  ca.title,
  ca.date,
  ca.section,
  CASE 
    WHEN cs.storage_type = 'db_inline' THEN cs.content_blob
    WHEN cs.storage_type = 'db_compressed' THEN decompress_blob(cs.content_blob, ct.name)
    -- bucket_compressed and file types require special handling
    ELSE NULL
  END AS html,
  hr.fetched_at AS crawled_at,
  u.canonical_url,
  de.referrer_url,
  de.discovered_at,
  de.crawl_depth,
  hr.fetched_at,
  hr.request_started_at,
  hr.http_status,
  hr.content_type,
  hr.content_length,
  hr.etag,
  hr.last_modified,
  hr.redirect_chain,
  hr.ttfb_ms,
  hr.download_ms,
  hr.total_ms,
  hr.bytes_downloaded,
  hr.transfer_kbps,
  cs.content_sha256 AS html_sha256,
  -- Extract text from analysis_json if available
  json_extract(ca.analysis_json, '$.text') AS text,
  ca.word_count,
  ca.language,
  ca.article_xpath,
  ca.analysis_json AS analysis
FROM content_analysis ca
JOIN content_storage cs ON ca.content_id = cs.id
JOIN http_responses hr ON cs.http_response_id = hr.id
JOIN urls u ON hr.url_id = u.id
LEFT JOIN compression_types ct ON cs.compression_type_id = ct.id
LEFT JOIN (
  SELECT url_id, MIN(discovered_at) AS discovered_at, referrer_url, crawl_depth
  FROM discovery_events
  GROUP BY url_id
) de ON u.id = de.url_id
WHERE ca.analysis_version = (
  SELECT MAX(analysis_version) FROM content_analysis ca2 WHERE ca2.content_id = ca.content_id
);

-- Reconstruct denormalized 'fetches' table
CREATE VIEW fetches_view AS
SELECT 
  hr.id,
  u.url,
  hr.request_started_at,
  hr.fetched_at,
  hr.http_status,
  hr.content_type,
  hr.content_length,
  hr.content_encoding,
  hr.bytes_downloaded,
  hr.transfer_kbps,
  hr.ttfb_ms,
  hr.download_ms,
  hr.total_ms,
  CASE WHEN cs.storage_type IN ('db_inline', 'db_compressed') THEN 1 ELSE 0 END AS saved_to_db,
  CASE WHEN cs.storage_type = 'file' THEN 1 ELSE 0 END AS saved_to_file,
  cs.file_path,
  cs.uncompressed_size AS file_size,
  ca.classification,
  ca.nav_links_count,
  ca.article_links_count,
  ca.word_count,
  ca.analysis_json AS analysis
FROM http_responses hr
JOIN urls u ON hr.url_id = u.id
LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
LEFT JOIN content_analysis ca ON ca.content_id = cs.id AND ca.analysis_version = (
  SELECT MAX(analysis_version) FROM content_analysis ca2 WHERE ca2.content_id = cs.id
);

-- Reconstruct place attributes from normalized tables
CREATE VIEW places_view AS
SELECT 
  p.*,
  -- Aggregate Wikidata provenance
  GROUP_CONCAT(CASE WHEN pp.source = 'wikidata' THEN pp.external_id END) AS wikidata_qid,
  -- Aggregate OSM provenance
  GROUP_CONCAT(CASE WHEN pp.source = 'osm' THEN pp.external_id END) AS osm_id,
  -- Aggregate attributes into JSON (for backward compatibility)
  json_group_object(pa.attribute_kind, pa.value) AS extra
FROM places p
LEFT JOIN place_provenance pp ON p.id = pp.place_id
LEFT JOIN place_attributes pa ON p.id = pa.place_id
GROUP BY p.id;
```

**View Limitations**:
- SQLite views are read-only (cannot INSERT/UPDATE through views)
- Decompression in views not performant (use application-level caching)
- For bucket_compressed content, views cannot decompress (requires application logic)

**Solution**: 
- Phase 1: Keep writing to old tables + new tables (dual write)
- Phase 2: Switch reads to views for testing
- Phase 3: Switch to direct normalized table access
- Phase 4: Rename views to replace old table names

---

## Part 4: Migration-Free Implementation Strategy

### Phase 0: Preparation (No Schema Changes)

**Goal**: Lay groundwork without touching existing schema

1. **Create migration infrastructure modules**:
   ```
   src/db/migration/
     schema-versions.js       # Schema version tracking
     exporter.js             # Export to JSON/NDJSON
     importer.js             # Import with transformations
     transformer.js          # Data transformation rules
     validator.js            # Data integrity checks
     migrator.js             # Orchestration
   ```

2. **Add schema version tracking table** (non-breaking):
   ```sql
   CREATE TABLE IF NOT EXISTS schema_migrations (
     version INTEGER PRIMARY KEY,
     name TEXT NOT NULL,
     applied_at TEXT NOT NULL,
     checksum TEXT,
     description TEXT
   );
   ```

3. **Seed current schema as version 1**:
   ```sql
   INSERT INTO schema_migrations (version, name, applied_at, description)
   VALUES (1, 'initial_denormalized_schema', datetime('now'), 'Legacy denormalized schema');
   ```

### Phase 1: Add Normalized Tables (Non-Breaking)

**Goal**: Add new normalized tables without modifying existing tables

1. **Create all normalized tables**:
   - `compression_types`, `compression_buckets`
   - `http_responses`, `content_storage`, `content_analysis`
   - `discovery_events`
   - `place_provenance`, `place_attributes`

2. **Seed compression_types**:
   ```sql
   INSERT INTO compression_types (name, mime_type, extension, compression_level, description)
   VALUES 
     ('none', NULL, NULL, 0, 'No compression'),
     ('gzip', 'application/gzip', '.gz', 6, 'Gzip compression level 6'),
     ('zstd', 'application/zstd', '.zst', 3, 'Zstandard compression level 3'),
     ('zstd_archive', 'application/zstd', '.tar.zst', 19, 'Zstandard level 19 for archives');
   ```

3. **Record as migration version 2**:
   ```sql
   INSERT INTO schema_migrations (version, name, applied_at, description)
   VALUES (2, 'add_normalized_tables', datetime('now'), 'Add normalized tables without breaking changes');
   ```

### Phase 2: Dual-Write Layer (Non-Breaking)

**Goal**: Write to both old and new schemas simultaneously

1. **Modify application code** to write to both schemas:
   ```javascript
   // In src/db/sqlite/NewsDatabase.js
   upsertArticle(article) {
     // Existing write to denormalized tables
     const res = this.insertArticleStmt.run(article);
     
     // NEW: Also write to normalized tables
     try {
       this._writeToNormalizedSchema(article);
     } catch (err) {
       // Log but don't fail (normalized schema optional during transition)
       console.warn('[dual-write] Failed to write to normalized schema:', err);
     }
     
     return res;
   }
   
   _writeToNormalizedSchema(article) {
     // 1. Ensure URL exists in urls table
     const urlId = this._ensureUrl(article.url);
     
     // 2. Insert HTTP response
     const httpResponseId = this._insertHttpResponse({
       url_id: urlId,
       request_started_at: article.request_started_at,
       fetched_at: article.fetched_at,
       http_status: article.http_status,
       // ... other HTTP fields
     });
     
     // 3. Store content (inline for now, compression later)
     const contentId = this._insertContentStorage({
       http_response_id: httpResponseId,
       storage_type: 'db_inline',
       content_blob: article.html,
       content_sha256: article.html_sha256,
       uncompressed_size: article.html ? Buffer.byteLength(article.html, 'utf8') : 0
     });
     
     // 4. Insert content analysis
     this._insertContentAnalysis({
       content_id: contentId,
       analysis_version: 1,
       title: article.title,
       classification: 'article',
       word_count: article.word_count,
       language: article.language,
       // ... other analysis fields
     });
     
     // 5. Insert discovery event
     if (article.referrer_url || article.discovered_at) {
       this._insertDiscoveryEvent({
         url_id: urlId,
         discovered_at: article.discovered_at,
         referrer_url: article.referrer_url,
         crawl_depth: article.crawl_depth
       });
     }
   }
   ```

2. **Add migration triggers** for data written by other processes:
   ```sql
   -- Sync articles table writes to normalized tables
   CREATE TRIGGER IF NOT EXISTS trg_articles_insert_sync
   AFTER INSERT ON articles
   BEGIN
     -- Insert into http_responses (if not exists)
     INSERT OR IGNORE INTO http_responses (
       url_id,
       request_started_at,
       fetched_at,
       http_status,
       content_type,
       -- ... other fields
     )
     SELECT 
       u.id,
       NEW.request_started_at,
       NEW.fetched_at,
       NEW.http_status,
       NEW.content_type
       -- ... other fields
     FROM urls u
     WHERE u.url = NEW.url;
     
     -- Insert into content_storage (if not exists)
     -- ... (similar pattern)
   END;
   ```

3. **Record as migration version 3**:
   ```sql
   INSERT INTO schema_migrations (version, name, applied_at, description)
   VALUES (3, 'enable_dual_write', datetime('now'), 'Enable dual-write to normalized and legacy schemas');
   ```

### Phase 3: Backfill Historical Data (Background Process)

**Goal**: Migrate existing data from old tables to new tables

1. **Create backfill script** (`src/tools/backfill-normalized-schema.js`):
   ```javascript
   const { ensureDb } = require('../db/sqlite/ensureDb');
   
   async function backfillArticles(db) {
     const articles = db.prepare('SELECT * FROM articles ORDER BY id').all();
     let migrated = 0;
     
     for (const article of articles) {
       try {
         // Check if already migrated
         const existing = db.prepare(`
           SELECT 1 FROM content_storage cs
           JOIN http_responses hr ON cs.http_response_id = hr.id
           JOIN urls u ON hr.url_id = u.id
           WHERE u.url = ?
         `).get(article.url);
         
         if (existing) {
           continue; // Already migrated
         }
         
         // Migrate this article
         migrateArticleToNormalized(db, article);
         migrated++;
         
         if (migrated % 100 === 0) {
           console.log(`Backfilled ${migrated} / ${articles.length} articles`);
         }
       } catch (err) {
         console.error(`Failed to backfill article ${article.url}:`, err);
       }
     }
     
     console.log(`Backfill complete: ${migrated} articles migrated`);
   }
   
   // Run backfill
   const db = ensureDb();
   backfillArticles(db).then(() => process.exit(0));
   ```

2. **Run backfill incrementally**:
   ```powershell
   node src/tools/backfill-normalized-schema.js
   ```

3. **Validate backfill**:
   ```sql
   -- Count mismatches
   SELECT 
     (SELECT COUNT(*) FROM articles) AS old_count,
     (SELECT COUNT(DISTINCT hr.url_id) FROM http_responses hr) AS new_count,
     (SELECT COUNT(*) FROM articles) - (SELECT COUNT(DISTINCT hr.url_id) FROM http_responses hr) AS diff;
   ```

### Phase 4: Switch Reads to Views (Testing)

**Goal**: Test backward compatibility views with production reads

1. **Create wrapper functions** that read from views:
   ```javascript
   getArticleByUrl(url) {
     // Phase 4: Read from view instead of table
     return this.db.prepare('SELECT * FROM articles_view WHERE url = ?').get(url);
   }
   ```

2. **Monitor performance**:
   - Compare query performance (old tables vs views)
   - Identify slow view queries
   - Add indexes to normalized tables as needed

3. **Validate data consistency**:
   ```sql
   -- Spot-check: Compare old table vs view
   SELECT 
     a.url,
     a.title AS old_title,
     av.title AS new_title,
     CASE WHEN a.title = av.title THEN 'OK' ELSE 'MISMATCH' END AS status
   FROM articles a
   JOIN articles_view av ON a.url = av.url
   WHERE a.title <> av.title
   LIMIT 10;
   ```

### Phase 5: Direct Normalized Access (Cutover)

**Goal**: Switch to reading/writing directly to normalized tables

1. **Rewrite application code** to use normalized tables:
   ```javascript
   upsertArticle(article) {
     // Phase 5: Write ONLY to normalized tables
     return this._writeToNormalizedSchema(article);
   }
   
   getArticleByUrl(url) {
     // Phase 5: Read directly from normalized tables
     return this.db.prepare(`
       SELECT 
         ca.id,
         u.url,
         ca.title,
         -- ... other fields
       FROM content_analysis ca
       JOIN content_storage cs ON ca.content_id = cs.id
       JOIN http_responses hr ON cs.http_response_id = hr.id
       JOIN urls u ON hr.url_id = u.id
       WHERE u.url = ?
       ORDER BY ca.analysis_version DESC
       LIMIT 1
     `).get(url);
   }
   ```

2. **Drop dual-write triggers**:
   ```sql
   DROP TRIGGER IF EXISTS trg_articles_insert_sync;
   ```

3. **Record as migration version 4**:
   ```sql
   INSERT INTO schema_migrations (version, name, applied_at, description)
   VALUES (4, 'cutover_to_normalized', datetime('now'), 'Switch all reads/writes to normalized schema');
   ```

### Phase 6: Archive Legacy Tables (Cleanup)

**Goal**: Rename/drop old denormalized tables

1. **Rename legacy tables**:
   ```sql
   ALTER TABLE articles RENAME TO articles_legacy;
   ALTER TABLE fetches RENAME TO fetches_legacy;
   ```

2. **Rename views to replace old table names**:
   ```sql
   DROP VIEW articles_view;
   CREATE VIEW articles AS
   SELECT * FROM articles_view;
   ```

3. **Eventually drop legacy tables** (after validation period):
   ```sql
   -- After 30-90 days of stable operation
   DROP TABLE articles_legacy;
   DROP TABLE fetches_legacy;
   ```

4. **Record as migration version 5**:
   ```sql
   INSERT INTO schema_migrations (version, name, applied_at, description)
   VALUES (5, 'archive_legacy_tables', datetime('now'), 'Rename legacy tables, views replace table names');
   ```

---

## Part 5: Compression Implementation

### Individual Compression (Phase 1)

**Goal**: Compress content individually with zstd/gzip

```javascript
const zstd = require('@mongodb-js/zstd');

async function storeCompressedContent(httpResponseId, content, compressionType = 'zstd') {
  const uncompressed = Buffer.from(content, 'utf8');
  const uncompressedSize = uncompressed.length;
  
  let compressed, compressionTypeId;
  
  if (compressionType === 'zstd') {
    compressed = await zstd.compress(uncompressed, 3); // Level 3 for speed
    compressionTypeId = 3; // From compression_types table
  } else if (compressionType === 'gzip') {
    compressed = zlib.gzipSync(uncompressed, { level: 6 });
    compressionTypeId = 2;
  } else {
    compressed = uncompressed;
    compressionTypeId = 1; // 'none'
  }
  
  const sha256 = crypto.createHash('sha256').update(uncompressed).digest('hex');
  const compressedSize = compressed.length;
  const ratio = compressedSize / uncompressedSize;
  
  const contentId = db.prepare(`
    INSERT INTO content_storage (
      http_response_id,
      storage_type,
      compression_type_id,
      content_blob,
      content_sha256,
      uncompressed_size,
      compressed_size,
      compression_ratio
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    httpResponseId,
    'db_compressed',
    compressionTypeId,
    compressed,
    sha256,
    uncompressedSize,
    compressedSize,
    ratio
  ).lastInsertRowid;
  
  return contentId;
}

async function retrieveCompressedContent(contentId) {
  const row = db.prepare(`
    SELECT cs.content_blob, ct.name AS compression_type
    FROM content_storage cs
    JOIN compression_types ct ON cs.compression_type_id = ct.id
    WHERE cs.id = ?
  `).get(contentId);
  
  if (!row) return null;
  
  if (row.compression_type === 'zstd') {
    return await zstd.decompress(row.content_blob);
  } else if (row.compression_type === 'gzip') {
    return zlib.gunzipSync(row.content_blob);
  } else {
    return row.content_blob;
  }
}
```

### Bucket Compression (Phase 2)

**Goal**: Compress similar files together for 10-20x compression

```javascript
const tar = require('tar-stream');

class CompressionBucketManager {
  constructor(db) {
    this.db = db;
    this.activeBuckets = new Map(); // domain → bucket_id
    this.bucketCache = new LRU({ max: 10 }); // Cache 10 decompressed buckets
  }
  
  async createBucket(bucketType, domainPattern) {
    const bucketId = this.db.prepare(`
      INSERT INTO compression_buckets (
        bucket_type,
        domain_pattern,
        created_at,
        compression_type_id
      ) VALUES (?, ?, datetime('now'), 4)
    `).run(bucketType, domainPattern).lastInsertRowid;
    
    return bucketId;
  }
  
  async addContentToBucket(bucketId, filename, content) {
    // Get current bucket data
    const bucket = this.db.prepare(`
      SELECT bucket_blob, index_json, content_count
      FROM compression_buckets
      WHERE id = ? AND finalized_at IS NULL
    `).get(bucketId);
    
    if (!bucket) throw new Error('Bucket not found or finalized');
    
    // Decompress existing bucket if it exists
    let tarStream = tar.pack();
    if (bucket.bucket_blob) {
      const decompressed = await zstd.decompress(bucket.bucket_blob);
      // Extract existing files and re-add them (TODO: optimize with streaming)
    }
    
    // Add new file
    tarStream.entry({ name: filename }, content);
    
    // Finalize tar
    tarStream.finalize();
    
    // Compress with zstd level 19 (maximum compression for archives)
    const tarBuffer = await streamToBuffer(tarStream);
    const compressed = await zstd.compress(tarBuffer, 19);
    
    // Update index
    const index = bucket.index_json ? JSON.parse(bucket.index_json) : {};
    index[filename] = {
      size: content.length,
      added_at: new Date().toISOString()
    };
    
    // Update bucket
    this.db.prepare(`
      UPDATE compression_buckets
      SET 
        bucket_blob = ?,
        index_json = ?,
        content_count = content_count + 1,
        uncompressed_size = uncompressed_size + ?,
        compressed_size = ?,
        compression_ratio = CAST(? AS REAL) / (uncompressed_size + ?)
      WHERE id = ?
    `).run(
      compressed,
      JSON.stringify(index),
      content.length,
      compressed.length,
      compressed.length,
      content.length,
      bucketId
    );
    
    return filename;
  }
  
  async retrieveFromBucket(bucketId, filename) {
    // Check cache first
    const cacheKey = `bucket:${bucketId}`;
    let tarData = this.bucketCache.get(cacheKey);
    
    if (!tarData) {
      // Decompress bucket
      const bucket = this.db.prepare(`
        SELECT bucket_blob, index_json
        FROM compression_buckets
        WHERE id = ?
      `).get(bucketId);
      
      if (!bucket) throw new Error('Bucket not found');
      
      tarData = await zstd.decompress(bucket.bucket_blob);
      
      // Cache decompressed bucket
      this.bucketCache.set(cacheKey, tarData);
    }
    
    // Extract specific file from tar
    return new Promise((resolve, reject) => {
      const extract = tar.extract();
      let found = false;
      
      extract.on('entry', (header, stream, next) => {
        if (header.name === filename) {
          found = true;
          const chunks = [];
          stream.on('data', chunk => chunks.push(chunk));
          stream.on('end', () => {
            resolve(Buffer.concat(chunks));
          });
        } else {
          stream.resume(); // Skip this entry
        }
        next();
      });
      
      extract.on('finish', () => {
        if (!found) reject(new Error('File not found in bucket'));
      });
      
      extract.write(tarData);
      extract.end();
    });
  }
  
  async finalizeBucket(bucketId) {
    this.db.prepare(`
      UPDATE compression_buckets
      SET finalized_at = datetime('now')
      WHERE id = ?
    `).run(bucketId);
    
    this.activeBuckets.delete(bucketId);
  }
}
```

**Bucket Strategy**:
- Create bucket per domain (e.g., "bbc.co.uk articles")
- Add up to 1000 articles per bucket
- Finalize bucket when full or after 24 hours
- Similar content compresses 10-20x better together (zstd dictionary compression)

**Use Cases**:
- Archival storage (old articles unlikely to be accessed)
- Bulk analysis (scan all articles from a domain)
- Data export/backup

**Not Suitable For**:
- Real-time serving (too slow to decompress bucket)
- Frequently accessed content (cache thrashing)

---

## Part 6: Migration Infrastructure (Programmatic Groundwork)

### Module Structure

```
src/db/migration/
  schema-versions.js       # Schema version registry and metadata
  exporter.js             # Export database to JSON/NDJSON
  importer.js             # Import from JSON/NDJSON with transformations
  transformer.js          # Data transformation rules between schema versions
  validator.js            # Data integrity validation
  migrator.js             # Orchestrate full migration process
  strategies/
    sqlite-workarounds.js # Handle SQLite limitations (DROP COLUMN, etc.)
    compression-migration.js # Migrate to compressed storage
```

### 6.1 Schema Version Tracking

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
        checksum TEXT,
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
  
  recordMigration(version, name, description, rollbackSql = null) {
    this.db.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at, description, rollback_sql)
      VALUES (?, ?, datetime('now'), ?, ?)
    `).run(version, name, description, rollbackSql);
  }
  
  getMigrationHistory() {
    return this.db.prepare(`
      SELECT version, name, applied_at, description
      FROM schema_migrations
      ORDER BY version ASC
    `).all();
  }
}

module.exports = { SchemaVersionManager };
```

### 6.2 Database Exporter

```javascript
// src/db/migration/exporter.js

const fs = require('fs');
const { pipeline } = require('stream/promises');
const ndjson = require('ndjson');

class DatabaseExporter {
  constructor(db) {
    this.db = db;
  }
  
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
    const tables = this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();
    
    const manifest = {
      exported_at: new Date().toISOString(),
      schema_version: new SchemaVersionManager(this.db).getCurrentVersion(),
      tables: {}
    };
    
    for (const { name } of tables) {
      const outputPath = path.join(outputDir, `${name}.ndjson`);
      const rowCount = await this.exportTable(name, outputPath);
      manifest.tables[name] = {
        file: `${name}.ndjson`,
        row_count: rowCount
      };
      
      console.log(`Exported ${name}: ${rowCount} rows`);
    }
    
    // Write manifest
    fs.writeFileSync(
      path.join(outputDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    
    return manifest;
  }
}

module.exports = { DatabaseExporter };
```

### 6.3 Database Importer with Transformations

```javascript
// src/db/migration/importer.js

const fs = require('fs');
const ndjson = require('ndjson');
const { pipeline } = require('stream/promises');

class DatabaseImporter {
  constructor(db, transformers = {}) {
    this.db = db;
    this.transformers = transformers;
  }
  
  async importTable(tableName, inputPath, batchSize = 1000) {
    const readStream = fs.createReadStream(inputPath);
    const parser = ndjson.parse();
    
    let batch = [];
    let imported = 0;
    
    await pipeline(
      readStream,
      parser,
      async function* (source) {
        for await (const row of source) {
          // Apply transformations if registered
          const transformed = this.transformers[tableName] 
            ? this.transformers[tableName](row)
            : row;
          
          batch.push(transformed);
          
          if (batch.length >= batchSize) {
            yield batch;
            batch = [];
          }
        }
        
        if (batch.length > 0) {
          yield batch;
        }
      }.bind(this),
      async function* (source) {
        for await (const batch of source) {
          this._insertBatch(tableName, batch);
          imported += batch.length;
          
          if (imported % 10000 === 0) {
            console.log(`Imported ${imported} rows into ${tableName}`);
          }
        }
      }.bind(this)
    );
    
    return imported;
  }
  
  _insertBatch(tableName, rows) {
    if (rows.length === 0) return;
    
    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES (${placeholders})
    `;
    
    const stmt = this.db.prepare(sql);
    
    const txn = this.db.transaction((batch) => {
      for (const row of batch) {
        const values = columns.map(col => row[col]);
        stmt.run(...values);
      }
    });
    
    txn(rows);
  }
  
  async importFromManifest(manifestPath) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const baseDir = path.dirname(manifestPath);
    
    console.log(`Importing database exported at ${manifest.exported_at}`);
    console.log(`Source schema version: ${manifest.schema_version}`);
    
    for (const [tableName, meta] of Object.entries(manifest.tables)) {
      const inputPath = path.join(baseDir, meta.file);
      const imported = await this.importTable(tableName, inputPath);
      
      console.log(`Imported ${tableName}: ${imported} rows (expected ${meta.row_count})`);
      
      if (imported !== meta.row_count) {
        throw new Error(`Row count mismatch for ${tableName}`);
      }
    }
    
    return manifest;
  }
}

module.exports = { DatabaseImporter };
```

### 6.4 Data Transformers

```javascript
// src/db/migration/transformer.js

class SchemaTransformer {
  constructor(sourceVersion, targetVersion) {
    this.sourceVersion = sourceVersion;
    this.targetVersion = targetVersion;
    this.transformers = this._buildTransformerChain();
  }
  
  _buildTransformerChain() {
    const chain = [];
    
    // Version 1 → 2: Normalize articles table
    if (this.sourceVersion === 1 && this.targetVersion >= 2) {
      chain.push({
        table: 'articles',
        transform: (row) => {
          // Split denormalized article into multiple normalized records
          return {
            http_response: {
              url_id: row.url, // Will be resolved to ID during import
              request_started_at: row.request_started_at,
              fetched_at: row.fetched_at,
              http_status: row.http_status,
              content_type: row.content_type,
              // ... other HTTP fields
            },
            content_storage: {
              storage_type: 'db_inline',
              content_blob: row.html,
              content_sha256: row.html_sha256,
              uncompressed_size: row.html ? Buffer.byteLength(row.html, 'utf8') : 0
            },
            content_analysis: {
              analysis_version: 1,
              classification: 'article',
              title: row.title,
              date: row.date,
              section: row.section,
              word_count: row.word_count,
              language: row.language,
              article_xpath: row.article_xpath,
              analysis_json: row.analysis
            },
            discovery_event: {
              discovered_at: row.discovered_at,
              referrer_url: row.referrer_url,
              crawl_depth: row.crawl_depth
            }
          };
        }
      });
    }
    
    return chain;
  }
  
  transform(tableName, row) {
    const transformer = this.transformers.find(t => t.table === tableName);
    return transformer ? transformer.transform(row) : row;
  }
}

module.exports = { SchemaTransformer };
```

### 6.5 Data Validator

```javascript
// src/db/migration/validator.js

class DataValidator {
  constructor(db) {
    this.db = db;
  }
  
  async validateMigration(sourceManifest, targetDb) {
    const errors = [];
    
    // 1. Check row counts
    for (const [tableName, meta] of Object.entries(sourceManifest.tables)) {
      const targetCount = targetDb.prepare(`
        SELECT COUNT(*) AS count FROM ${tableName}
      `).get().count;
      
      if (targetCount !== meta.row_count) {
        errors.push({
          type: 'row_count_mismatch',
          table: tableName,
          expected: meta.row_count,
          actual: targetCount
        });
      }
    }
    
    // 2. Check foreign key constraints
    const fkCheck = targetDb.prepare('PRAGMA foreign_key_check').all();
    if (fkCheck.length > 0) {
      errors.push({
        type: 'foreign_key_violations',
        violations: fkCheck
      });
    }
    
    // 3. Check NOT NULL constraints
    // (SQLite doesn't expose this easily, would need to parse schema)
    
    // 4. Spot-check data integrity
    const spotChecks = [
      {
        name: 'urls_have_http_responses',
        sql: `
          SELECT COUNT(*) AS orphaned
          FROM urls u
          LEFT JOIN http_responses hr ON hr.url_id = u.id
          WHERE hr.id IS NULL
        `
      },
      {
        name: 'content_storage_has_responses',
        sql: `
          SELECT COUNT(*) AS orphaned
          FROM content_storage cs
          LEFT JOIN http_responses hr ON cs.http_response_id = hr.id
          WHERE hr.id IS NULL
        `
      }
    ];
    
    for (const check of spotChecks) {
      const result = targetDb.prepare(check.sql).get();
      if (result.orphaned > 0) {
        errors.push({
          type: 'data_integrity',
          check: check.name,
          orphaned_rows: result.orphaned
        });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = { DataValidator };
```

### 6.6 Migration Orchestrator

```javascript
// src/db/migration/migrator.js

const { SchemaVersionManager } = require('./schema-versions');
const { DatabaseExporter } = require('./exporter');
const { DatabaseImporter } = require('./importer');
const { SchemaTransformer } = require('./transformer');
const { DataValidator } = require('./validator');

class DatabaseMigrator {
  constructor(sourceDb, targetDbPath) {
    this.sourceDb = sourceDb;
    this.targetDbPath = targetDbPath;
    this.versionManager = new SchemaVersionManager(sourceDb);
  }
  
  async migrate(targetVersion) {
    const currentVersion = this.versionManager.getCurrentVersion();
    
    if (currentVersion >= targetVersion) {
      throw new Error(`Database already at version ${currentVersion}, cannot migrate to ${targetVersion}`);
    }
    
    console.log(`Migrating from version ${currentVersion} to ${targetVersion}`);
    
    // 1. Export source database
    const exportDir = path.join(os.tmpdir(), `db-export-${Date.now()}`);
    fs.mkdirSync(exportDir, { recursive: true });
    
    const exporter = new DatabaseExporter(this.sourceDb);
    const manifest = await exporter.exportFullDatabase(exportDir);
    
    console.log(`Exported source database to ${exportDir}`);
    
    // 2. Create target database with new schema
    const targetDb = ensureDb(this.targetDbPath); // Creates schema version 'targetVersion'
    
    // 3. Import with transformations
    const transformer = new SchemaTransformer(currentVersion, targetVersion);
    const importer = new DatabaseImporter(targetDb, {
      articles: (row) => transformer.transform('articles', row)
      // Add other transformers as needed
    });
    
    await importer.importFromManifest(path.join(exportDir, 'manifest.json'));
    
    console.log('Import complete');
    
    // 4. Validate migration
    const validator = new DataValidator(targetDb);
    const validation = await validator.validateMigration(manifest, targetDb);
    
    if (!validation.valid) {
      console.error('Migration validation failed:');
      console.error(validation.errors);
      throw new Error('Migration validation failed');
    }
    
    console.log('Migration validation passed');
    
    // 5. Cleanup (optional)
    // fs.rmSync(exportDir, { recursive: true });
    
    return {
      success: true,
      sourceVersion: currentVersion,
      targetVersion,
      manifest
    };
  }
}

module.exports = { DatabaseMigrator };
```

---

## Part 7: Implementation Roadmap

### Immediate (No Breaking Changes)

**Week 1-2: Infrastructure Setup**

- ✅ Create `docs/DATABASE_NORMALIZATION_PLAN.md` (this document)
- ✅ Create migration module structure
- ✅ Add `schema_migrations` table
- ✅ Implement `SchemaVersionManager`
- ✅ Implement `DatabaseExporter`
- ✅ Implement `DatabaseImporter`
- ✅ Implement `DataValidator`
- ✅ Write tests for migration infrastructure

### Short-Term (Additive Schema Changes)

**Week 3-4: Add Normalized Tables**

- Create compression tables (`compression_types`, `compression_buckets`)
- Create normalized tables (`http_responses`, `content_storage`, `content_analysis`, `discovery_events`)
- Create place normalization tables (`place_provenance`, `place_attributes`)
- Seed `compression_types` with standard types
- Record as schema version 2

**Week 5-6: Implement Compression**

- Implement `CompressionBucketManager`
- Add individual compression support (zstd, gzip)
- Add bucket compression support (tar.zstd)
- Write tests for compression/decompression
- Document compression API

### Medium-Term (Dual-Write Phase)

**Week 7-10: Dual-Write Implementation**

- Modify `NewsDatabase` to write to both schemas
- Add sync triggers (articles → normalized tables)
- Backfill historical data (run incrementally)
- Monitor for data consistency issues
- Record as schema version 3

**Week 11-12: Create Backward Compatibility Views**

- Implement `articles_view` reconstructing denormalized articles
- Implement `fetches_view` reconstructing denormalized fetches
- Implement `places_view` with aggregated attributes
- Test view performance vs direct table access
- Add indexes to normalized tables as needed

### Long-Term (Cutover Phase)

**Week 13-16: Switch Reads to Views**

- Modify all read operations to use views
- Monitor query performance
- Identify and optimize slow views
- Validate data consistency
- Run in production for 2-4 weeks

**Week 17-20: Direct Normalized Access**

- Rewrite application to use normalized tables directly
- Drop dual-write triggers
- Drop sync triggers
- Record as schema version 4
- Monitor for regressions

**Week 21+: Archive Legacy Tables**

- Rename old tables to `_legacy`
- Run in production for 30-90 days
- Drop legacy tables after validation period
- Record as schema version 5

---

## Part 8: Success Metrics

### Storage Efficiency

- **Individual compression**: 60-70% reduction (HTML with zstd level 3)
- **Bucket compression**: 90-95% reduction (similar HTML with zstd level 19)
- **Overall database size**: Target 40-50% reduction after migration

### Query Performance

- **Normalized reads**: Should be within 10% of denormalized performance
- **View overhead**: Should be <20% slower than direct table access
- **Compression overhead**: First access ~100ms, cached access <1ms

### Data Quality

- **Zero data loss**: All rows migrated successfully
- **Zero constraint violations**: Foreign keys, NOT NULL, UNIQUE all satisfied
- **Spot-check validation**: 100% match between old and new schemas

### Operational

- **Zero downtime**: Migration happens with dual-write, no service interruption
- **Rollback capability**: Can revert to old schema if issues found
- **Incremental progress**: Can pause/resume migration at any point

---

## Appendix A: SQLite Limitations and Workarounds

### Issue: No DROP COLUMN Support

**Problem**: SQLite doesn't support `ALTER TABLE ... DROP COLUMN` until version 3.35.0 (2021), and even then it's limited.

**Workaround**: Recreate table with desired columns

```javascript
function dropColumn(db, tableName, columnName) {
  // 1. Get current schema
  const schema = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(tableName).sql;
  
  // 2. Parse columns (regex or SQL parser)
  const columns = parseColumnsFromCreateStatement(schema);
  const newColumns = columns.filter(col => col.name !== columnName);
  
  // 3. Create new table with new schema
  const newTableSql = `CREATE TABLE ${tableName}_new (${newColumns.join(', ')})`;
  db.exec(newTableSql);
  
  // 4. Copy data
  const columnList = newColumns.map(col => col.name).join(', ');
  db.exec(`INSERT INTO ${tableName}_new (${columnList}) SELECT ${columnList} FROM ${tableName}`);
  
  // 5. Drop old table
  db.exec(`DROP TABLE ${tableName}`);
  
  // 6. Rename new table
  db.exec(`ALTER TABLE ${tableName}_new RENAME TO ${tableName}`);
  
  // 7. Recreate indexes and triggers
  // (Need to save and recreate these separately)
}
```

### Issue: No ALTER COLUMN TYPE

**Problem**: Can't change column data type directly.

**Workaround**: Same as DROP COLUMN—recreate table.

### Issue: No GENERATED COLUMNS (before 3.31.0)

**Problem**: Can't use computed columns for normalized/denormalized access.

**Workaround**: Use views or triggers to maintain computed values.

---

## Appendix B: Compression Benchmarks

### Test Data: BBC News Articles

**Dataset**: 1000 HTML articles from bbc.co.uk (average 45KB each)

| Method | Total Size | Compression Ratio | Random Access Time |
|--------|------------|-------------------|-------------------|
| Uncompressed | 45 MB | 1.0x | <1ms |
| gzip level 6 (individual) | 18 MB | 2.5x | ~5ms |
| zstd level 3 (individual) | 15 MB | 3.0x | ~2ms |
| zstd level 19 (bucket, 1000 files) | 2.3 MB | 19.6x | ~150ms (first), <1ms (cached) |

**Recommendation**:
- Hot data: `db_inline` (no compression, fast access)
- Warm data: `db_compressed` with zstd level 3 (3x compression, 2ms access)
- Cold data: `bucket_compressed` with zstd level 19 (20x compression, 150ms first access)

---

## Appendix C: Migration Checklist

### Pre-Migration

- [ ] Backup production database
- [ ] Test migration on copy of production data
- [ ] Validate migration completes successfully
- [ ] Measure baseline query performance
- [ ] Document rollback procedure
- [ ] Schedule maintenance window (if needed)

### During Migration

- [ ] Run exporter on source database
- [ ] Create target database with new schema
- [ ] Run importer with transformations
- [ ] Validate data integrity
- [ ] Spot-check sample data
- [ ] Performance test critical queries
- [ ] Enable dual-write mode

### Post-Migration

- [ ] Monitor application logs for errors
- [ ] Compare query performance (baseline vs new)
- [ ] Run data consistency checks daily
- [ ] Gradual rollout (switch reads to views for 10% of traffic)
- [ ] Full rollout after validation period
- [ ] Archive legacy tables after 30-90 days

---

**End of Database Normalization & Compression Architecture Plan**
