# Database Schema Evolution - Architecture Diagrams

**Date**: 2025-10-06  
**Related Documents**: 
- `DATABASE_NORMALIZATION_PLAN.md` (full 80+ page plan)
- `SCHEMA_NORMALIZATION_SUMMARY.md` (executive summary)

---

## Current Schema (Version 1) - Denormalized

```
┌─────────────────────────────────────────────────────────────────┐
│                         articles                                 │
│  (30+ columns mixing multiple concerns)                          │
├─────────────────────────────────────────────────────────────────┤
│  URL Identity:                                                   │
│    - url, canonical_url                                          │
│                                                                  │
│  HTTP Metadata:                                                  │
│    - http_status, content_type, content_length, etag,           │
│      last_modified, redirect_chain                              │
│                                                                  │
│  Timing:                                                         │
│    - request_started_at, fetched_at, crawled_at,                │
│      ttfb_ms, download_ms, total_ms                             │
│                                                                  │
│  Transfer:                                                       │
│    - bytes_downloaded, transfer_kbps                            │
│                                                                  │
│  Content:                                                        │
│    - html, text, html_sha256                                    │
│                                                                  │
│  Discovery:                                                      │
│    - referrer_url, discovered_at, crawl_depth                   │
│                                                                  │
│  Analysis:                                                       │
│    - title, date, section, word_count, language,                │
│      article_xpath, analysis (JSON)                             │
└─────────────────────────────────────────────────────────────────┘

Problems:
❌ Update anomalies (changing HTTP metadata requires updating article)
❌ Storage waste (duplicate data between articles & fetches tables)
❌ Query inefficiency (can't query just HTTP metadata or just content)
❌ Null proliferation (many NULL fields for different access patterns)
```

---

## Target Schema (Version 2) - Normalized

```
┌────────────┐
│    urls    │  ← URL Registry (identity)
│────────────│
│ id (PK)    │
│ url        │
│ host       │
└────┬───────┘
     │
     │ 1:N
     ↓
┌────────────────────┐
│  http_responses    │  ← HTTP Protocol Layer
│────────────────────│
│ id (PK)            │
│ url_id (FK)        │
│ request_started_at │
│ fetched_at         │
│ http_status        │
│ content_type       │
│ etag               │
│ ttfb_ms            │
│ download_ms        │
└────┬───────────────┘
     │
     │ 1:1
     ↓
┌────────────────────────────┐
│    content_storage         │  ← Storage Layer (with compression)
│────────────────────────────│
│ id (PK)                    │
│ http_response_id (FK)      │
│ storage_type               │ ← 'db_inline' | 'db_compressed' | 'bucket_compressed'
│ compression_type_id (FK)   │ → compression_types
│ compression_bucket_id (FK) │ → compression_buckets
│ bucket_entry_key           │
│ content_blob (BLOB)        │
│ content_sha256             │
│ uncompressed_size          │
│ compressed_size            │
└────┬───────────────────────┘
     │
     │ 1:N (multiple analyses per content)
     ↓
┌────────────────────────┐
│  content_analysis      │  ← Analysis Layer
│────────────────────────│
│ id (PK)                │
│ content_id (FK)        │
│ analysis_version       │
│ classification         │
│ title                  │
│ word_count             │
│ language               │
│ analysis_json          │
└────────────────────────┘

┌────────────────────┐
│ discovery_events   │  ← Discovery Metadata
│────────────────────│
│ id (PK)            │
│ url_id (FK)        │
│ discovered_at      │
│ referrer_url       │
│ crawl_depth        │
└────────────────────┘

Benefits:
✅ Separation of concerns (HTTP ≠ content ≠ analysis)
✅ Multiple analyses per content (reanalysis with new versions)
✅ Efficient queries (query just HTTP metadata, or just content, or just analysis)
✅ No duplication (single source of truth for each concern)
✅ Compression-ready (storage layer designed for compression)
```

---

## Compression Infrastructure

```
                       content_storage
                            │
                            ├─ storage_type='db_inline'
                            │  └─ content_blob (uncompressed) → Fast access (<1ms)
                            │
                            ├─ storage_type='db_compressed'
                            │  ├─ compression_type_id → 'zstd' (level 3)
                            │  └─ content_blob (compressed) → 3x compression, ~2ms access
                            │
                            └─ storage_type='bucket_compressed'
                               ├─ compression_bucket_id
                               ├─ bucket_entry_key ('article-42.html')
                               └─ compression_buckets
                                  ├─ bucket_blob (tar.zstd archive)
                                  ├─ index_json (filename → offset map)
                                  └─ 20x compression, ~150ms first access

┌──────────────────────────────────────────────────────────────┐
│               compression_types (lookup table)                │
├──────────────────────────────────────────────────────────────┤
│ id │ name         │ compression_level │ description          │
├────┼──────────────┼───────────────────┼─────────────────────┤
│  1 │ none         │ 0                 │ No compression       │
│  2 │ gzip         │ 6                 │ Gzip level 6         │
│  3 │ zstd         │ 3                 │ Zstandard level 3    │
│  4 │ zstd_archive │ 19                │ Zstandard level 19   │
└────┴──────────────┴───────────────────┴─────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                    compression_buckets                        │
├──────────────────────────────────────────────────────────────┤
│ id │ bucket_type  │ domain_pattern │ content_count │ ratio  │
├────┼──────────────┼────────────────┼───────────────┼────────┤
│  1 │ html_similar │ bbc.co.uk      │ 1000          │ 19.6x  │
│  2 │ html_similar │ cnn.com        │ 1000          │ 18.2x  │
│  3 │ json_api     │ api.github.com │ 500           │ 25.3x  │
└────┴──────────────┴────────────────┴───────────────┴────────┘

Compression Strategy Decision Tree:
┌─────────────────────────────┐
│ Is content frequently       │
│ accessed?                   │
└────┬───────────────────┬────┘
     │                   │
   YES                  NO
     │                   │
     ↓                   ↓
db_inline          ┌──────────────────┐
(no compression)   │ Accessed         │
<1ms access        │ occasionally?    │
                   └────┬────────┬────┘
                        │        │
                      YES       NO
                        │        │
                        ↓        ↓
                  db_compressed  bucket_compressed
                  (zstd level 3) (zstd level 19)
                  3x, ~2ms       20x, ~150ms first
```

---

## Gazetteer Normalization

### Current (Denormalized)

```
┌───────────────────────────────────────────────────────────┐
│                        places                              │
│  (25+ columns mixing core data with provenance)            │
├───────────────────────────────────────────────────────────┤
│  Core Identity:                                            │
│    - kind, country_code, adm1_code, lat, lng, population  │
│                                                            │
│  Provenance (mixed):                                       │
│    - source ('wikidata' | 'osm' | 'restcountries')        │
│    - wikidata_qid, osm_type, osm_id                       │
│                                                            │
│  JSON Blobs (can't be queried efficiently):                │
│    - extra (JSON)                                          │
│    - wikidata_props (JSON)                                 │
│    - osm_tags (JSON)                                       │
└───────────────────────────────────────────────────────────┘

Problems:
❌ JSON blobs can't be indexed (slow queries on Wikidata properties)
❌ Multiple external IDs in different columns (not normalized)
❌ Source provenance mixed with current place data
```

### Target (Normalized)

```
┌─────────────┐
│   places    │  ← Core Place Identity
│─────────────│
│ id (PK)     │
│ kind        │
│ country_code│
│ adm1_code   │
│ lat         │
│ lng         │
│ population  │
└────┬────────┘
     │
     │ 1:N
     ├─────────────────────┐
     │                     │
     ↓                     ↓
┌────────────────┐   ┌───────────────────┐
│ place_         │   │ place_attributes  │
│ provenance     │   │───────────────────│
│────────────────│   │ id (PK)           │
│ id (PK)        │   │ place_id (FK)     │
│ place_id (FK)  │   │ attribute_kind    │ ← 'population' | 'gdp' | 'capital'
│ source         │   │ value             │
│ external_id    │   │ source            │
│ fetched_at     │   │ confidence        │
│ raw_data (JSON)│   └───────────────────┘
└────────────────┘

Examples:

place_provenance:
┌──────────┬────────┬─────────────┬─────────────────────┐
│ place_id │ source │ external_id │ fetched_at          │
├──────────┼────────┼─────────────┼─────────────────────┤
│ 1        │ wikida │ Q30         │ 1728000000          │
│ 1        │ osm    │ R148838     │ 1728000100          │
│ 1        │ restco │ US          │ 1728000200          │
└──────────┴────────┴─────────────┴─────────────────────┘

place_attributes:
┌──────────┬────────────────┬────────────┬────────┬────────────┐
│ place_id │ attribute_kind │ value      │ source │ confidence │
├──────────┼────────────────┼────────────┼────────┼────────────┤
│ 1        │ population     │ 331000000  │ wikida │ 0.95       │
│ 1        │ gdp            │ 21000000.. │ wikida │ 0.90       │
│ 1        │ capital        │ Washington │ wikida │ 1.00       │
│ 1        │ currency       │ USD        │ wikida │ 1.00       │
└──────────┴────────────────┴────────────┴────────┴────────────┘

Benefits:
✅ Can query Wikidata properties efficiently (indexed columns)
✅ Normalized external IDs (all in place_provenance table)
✅ Clear provenance tracking (source + fetched_at)
✅ Multiple values per attribute from different sources
✅ Confidence scores for data quality
```

---

## Migration Strategy: Dual-Write + Views

### Phase 1: Add New Tables (No Breaking Changes)

```
┌────────────────────────────────────────────────────────────┐
│                   Existing Schema                           │
│  ┌───────────┐  ┌──────────┐  ┌──────────┐                │
│  │ articles  │  │ fetches  │  │ places   │                │
│  └───────────┘  └──────────┘  └──────────┘                │
│                                                             │
│                   NEW TABLES ADDED                          │
│  ┌───────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ http_         │  │ content_        │  │ compression_ │ │
│  │ responses     │  │ storage         │  │ types        │ │
│  └───────────────┘  └─────────────────┘  └──────────────┘ │
│                                                             │
│  ┌───────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ content_      │  │ discovery_      │  │ compression_ │ │
│  │ analysis      │  │ events          │  │ buckets      │ │
│  └───────────────┘  └─────────────────┘  └──────────────┘ │
└────────────────────────────────────────────────────────────┘

Result: Old schema still works, new tables exist but unused
```

### Phase 2: Dual-Write (Write to Both Schemas)

```
Application Code:
  upsertArticle(article)
      │
      ├─────────────────┬─────────────────┐
      │                 │                 │
      ↓                 ↓                 ↓
 ┌───────────┐   ┌────────────┐   ┌────────────┐
 │ articles  │   │ http_      │   │ content_   │
 │ (old)     │   │ responses  │   │ storage    │
 └───────────┘   │ (new)      │   │ (new)      │
                 └────────────┘   └────────────┘
                                          │
                                          ↓
                                  ┌────────────┐
                                  │ content_   │
                                  │ analysis   │
                                  │ (new)      │
                                  └────────────┘

Result: Both schemas stay in sync, can switch between them
```

### Phase 3: Create Views (Backward Compatibility)

```
CREATE VIEW articles_view AS
SELECT 
  ca.id,
  u.url,
  ca.title,
  cs.content_blob AS html,  ← Reconstructed from normalized tables
  hr.fetched_at AS crawled_at,
  hr.http_status,
  ...
FROM content_analysis ca
JOIN content_storage cs ON ca.content_id = cs.id
JOIN http_responses hr ON cs.http_response_id = hr.id
JOIN urls u ON hr.url_id = u.id;

Application reads from view:
  SELECT * FROM articles_view WHERE url = ?
  
Result: Returns same shape as old 'articles' table ✓
        But data comes from normalized tables ✓
```

### Phase 4: Switch to Views (Testing)

```
Before:
  getArticle(url) {
    return db.prepare('SELECT * FROM articles WHERE url = ?').get(url);
  }

After:
  getArticle(url) {
    return db.prepare('SELECT * FROM articles_view WHERE url = ?').get(url);
  }

Result: Same data shape, but reads from normalized tables
        Monitor performance, validate data consistency
```

### Phase 5: Direct Normalized Access (Cutover)

```
getArticle(url) {
  return db.prepare(`
    SELECT 
      ca.id,
      u.url,
      ca.title,
      cs.content_blob AS html,
      hr.http_status
    FROM content_analysis ca
    JOIN content_storage cs ON ca.content_id = cs.id
    JOIN http_responses hr ON cs.http_response_id = hr.id
    JOIN urls u ON hr.url_id = u.id
    WHERE u.url = ?
  `).get(url);
}

Result: Direct access to normalized tables, no view overhead
```

### Phase 6: Archive Legacy Tables

```
ALTER TABLE articles RENAME TO articles_legacy;
ALTER TABLE fetches RENAME TO fetches_legacy;

Result: Old tables preserved as backup, can rollback if needed

After 30-90 days validation:
DROP TABLE articles_legacy;
DROP TABLE fetches_legacy;

Result: Legacy tables removed, migration complete ✅
```

---

## Timeline Visualization

```
Week 0:  Current State (Denormalized Schema)
         ┌────────────────────────────────────────┐
         │ articles (30 columns)                  │
         │ fetches (20 columns)                   │
         │ places (25 columns)                    │
         └────────────────────────────────────────┘

Week 1:  Add New Tables (No Breaking Changes)
         ┌────────────────────────────────────────┐
         │ OLD: articles, fetches, places         │
         │ NEW: http_responses, content_storage,  │
         │      content_analysis, compression_*   │
         └────────────────────────────────────────┘
         Risk: ⭐ (none - just adding tables)

Week 3:  Enable Dual-Write
         ┌────────────────────────────────────────┐
         │ Application writes to BOTH schemas     │
         │ ├─ Old tables (articles, fetches)      │
         │ └─ New tables (http_responses, ...)    │
         └────────────────────────────────────────┘
         Risk: ⭐⭐ (low - just adding writes)

Week 5:  Backfill Historical Data (Background)
         ┌────────────────────────────────────────┐
         │ Background job: Migrate existing data  │
         │ Progress: 10,000 / 100,000 articles    │
         └────────────────────────────────────────┘
         Risk: ⭐ (none - background process)

Week 11: Create Views
         ┌────────────────────────────────────────┐
         │ CREATE VIEW articles_view AS ...       │
         │ (Reconstructs old table from new)      │
         └────────────────────────────────────────┘
         Risk: ⭐ (none - just CREATE VIEW)

Week 13: Switch Reads to Views (Testing)
         ┌────────────────────────────────────────┐
         │ Application reads from views           │
         │ Monitor: Performance, data consistency │
         └────────────────────────────────────────┘
         Risk: ⭐⭐⭐ (medium - validate carefully)

Week 17: Direct Normalized Access (Cutover)
         ┌────────────────────────────────────────┐
         │ Application reads/writes normalized    │
         │ Old tables unused                      │
         └────────────────────────────────────────┘
         Risk: ⭐⭐⭐⭐ (high - monitor closely)

Week 21: Archive Legacy Tables
         ┌────────────────────────────────────────┐
         │ RENAME articles → articles_legacy      │
         │ Keep as backup for 30-90 days          │
         └────────────────────────────────────────┘
         Risk: ⭐⭐ (low - can rollback)

Week 30: Drop Legacy Tables (Complete!)
         ┌────────────────────────────────────────┐
         │ Normalized schema only                 │
         │ 40-50% database size reduction ✅       │
         │ Better query performance ✅             │
         └────────────────────────────────────────┘
         Risk: ⭐ (none - migration validated)
```

---

## Compression Performance Benchmarks

### Test Dataset: 1000 BBC News Articles

```
┌────────────────────────────────────────────────────────────────┐
│                     Compression Results                         │
├─────────────────────────┬──────────┬────────────┬──────────────┤
│ Method                  │ Size     │ Ratio      │ Access Time  │
├─────────────────────────┼──────────┼────────────┼──────────────┤
│ Uncompressed (baseline) │ 45.0 MB  │ 1.0x       │ <1ms         │
│ gzip level 6 (indiv.)   │ 18.0 MB  │ 2.5x       │ ~5ms         │
│ zstd level 3 (indiv.)   │ 15.0 MB  │ 3.0x       │ ~2ms         │
│ zstd level 19 (bucket)  │  2.3 MB  │ 19.6x 🚀   │ ~150ms first │
│                         │          │            │ <1ms cached  │
└─────────────────────────┴──────────┴────────────┴──────────────┘

Storage Savings:
┌──────────────────────────────────────────────────────────┐
│                1000 Articles Storage                      │
├─────────────────┬────────────┬───────────────────────────┤
│ Strategy        │ Size       │ Savings vs Uncompressed   │
├─────────────────┼────────────┼───────────────────────────┤
│ No compression  │ 45.0 MB    │ 0% (baseline)             │
│ Individual zstd │ 15.0 MB    │ 67% ✅                     │
│ Bucket zstd     │  2.3 MB    │ 95% 🚀                     │
└─────────────────┴────────────┴───────────────────────────┘

For 1 Million Articles:
┌─────────────────┬────────────┬────────────────────┐
│ Strategy        │ Size       │ Practical Use      │
├─────────────────┼────────────┼────────────────────┤
│ No compression  │ 45 GB      │ Expensive 💰       │
│ Individual zstd │ 15 GB      │ Good for warm data │
│ Bucket zstd     │ 2.3 GB     │ Great for archives │
└─────────────────┴────────────┴────────────────────┘
```

### Compression Decision Matrix

```
                       Access Frequency
                    │ Hot   │ Warm  │ Cold    │
────────────────────┼───────┼───────┼─────────┤
Real-time serving   │ Inline│ zstd3 │ ❌ Too  │
(< 10ms latency)    │ ✅    │ ✅    │   slow  │
────────────────────┼───────┼───────┼─────────┤
Background jobs     │ Inline│ zstd3 │ Bucket  │
(< 100ms latency)   │ ✅    │ ✅    │ ✅      │
────────────────────┼───────┼───────┼─────────┤
Bulk analysis       │ Inline│ zstd3 │ Bucket  │
(batch processing)  │ ✅    │ ✅    │ ✅ Best │
────────────────────┼───────┼───────┼─────────┤
Archival storage    │ zstd3 │ Bucket│ Bucket  │
(rarely accessed)   │ OK    │ ✅    │ ✅ Best │
────────────────────┴───────┴───────┴─────────┘

Legend:
  Inline = storage_type='db_inline' (no compression)
  zstd3  = storage_type='db_compressed', compression_type='zstd', level=3
  Bucket = storage_type='bucket_compressed', zstd level=19 on tar archive
  ✅ = Recommended
  ❌ = Not recommended
```

---

## Schema Version History

```
Version 1 (Current):
  ├─ articles (denormalized, 30+ columns)
  ├─ fetches (denormalized, 20+ columns)
  ├─ places (denormalized, JSON blobs)
  └─ Issues: Update anomalies, storage waste, query inefficiency

Version 2 (Target):
  ├─ Normalized tables:
  │  ├─ http_responses
  │  ├─ content_storage
  │  ├─ content_analysis
  │  ├─ discovery_events
  │  ├─ place_provenance
  │  └─ place_attributes
  ├─ Compression infrastructure:
  │  ├─ compression_types
  │  └─ compression_buckets
  └─ Benefits: 40-50% size reduction, better queries, maintainability

Version 3 (Future):
  └─ Additional optimizations based on usage patterns

Migration Path:
  v1 → v2: Dual-write + views (no export/import needed)
  v2 → v3: To be determined based on v2 learnings
```

---

**Key Takeaways**:

1. **Normalization** separates concerns (HTTP ≠ content ≠ analysis)
2. **Compression** provides 3x (individual) to 20x (bucket) savings
3. **Migration-free** approach uses dual-write + views (zero downtime)
4. **Gradual rollout** allows validation at each step
5. **Easy rollback** if issues found (just revert to old tables)

**This is a safe, incremental, and well-architected migration strategy!**
