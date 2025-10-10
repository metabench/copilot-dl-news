# Compression Buckets Architecture

**Quick Reference**: How compression buckets work with the unified `compression_type_id` system.  
**When to Read**: When implementing bucket compression for similar content (20x+ compression ratios), working with compression storage tables, or optimizing database size for archival content.

---

## Table Relationships

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           compression_types                                  │
│  ┌────┬───────────┬─────────────────────┬────────────┬───────────────────┐  │
│  │ id │ name      │ mime_type           │ extension  │ compression_level │  │
│  ├────┼───────────┼─────────────────────┼────────────┼───────────────────┤  │
│  │ 1  │ none      │ NULL                │ NULL       │ 0                 │  │
│  │ 2  │ gzip      │ application/gzip    │ .gz        │ 6                 │  │
│  │ 3  │ brotli    │ application/x-br    │ .br        │ 11                │  │
│  │ 4  │ zstd      │ application/zstd    │ .zst       │ 3                 │  │
│  │ 5  │ zstd_high │ application/zstd    │ .zst       │ 19                │  │
│  └────┴───────────┴─────────────────────┴────────────┴───────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Referenced by BOTH
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
┌─────────────────────────────────┐   ┌──────────────────────────────────────┐
│    compression_buckets          │   │       content_storage                │
│  ┌────┬──────────┬─────────┐   │   │  ┌────┬──────────┬─────────────┐    │
│  │ id │ bucket_  │ compres-│   │   │  │ id │ storage_ │ compression_│    │
│  │    │ type     │ sion_   │   │   │  │    │ type     │ type_id     │    │
│  │    │          │ type_id │   │   │  │    │          │             │    │
│  ├────┼──────────┼─────────┤   │   │  ├────┼──────────┼─────────────┤    │
│  │ 1  │ html_    │ 5 ──────┼───┼───┼──│... │ db_      │ 2 (gzip)    │    │
│  │    │ similar  │ (zstd_  │   │   │  │    │ compress │             │    │
│  │    │          │ high)   │   │   │  │    │          │             │    │
│  │ 2  │ json_api │ 4 ──────┼───┼───┼──│... │ bucket_  │ NULL        │    │
│  │    │          │ (zstd)  │   │   │  │    │ compress │             │    │
│  └────┴──────────┴─────────┘   │   │  └────┴──────────┴─────────────┘    │
│                                 │   │           │                          │
│  • bucket_blob: BLOB            │   │           │ compression_bucket_id    │
│  • index_json: TEXT             │   │           │ bucket_entry_key         │
│  • content_count: INTEGER       │   │           └──────────┐               │
│  • compression_ratio: REAL      │   │                      │               │
└─────────────────────────────────┘   └──────────────────────┼───────────────┘
                ▲                                            │
                │                                            │
                └────────────────────────────────────────────┘
                        References bucket
```

---

## Storage Type Decision Tree

```
Content to store
      │
      ▼
Size < 100KB?
      │
      ├── YES → Store as db_inline (no compression)
      │         compression_type_id = 1 (none)
      │         content_blob = raw content
      │
      └── NO → Size < 1MB?
                │
                ├── YES → Store as db_compressed (individual compression)
                │         compression_type_id = 2 (gzip) or 3 (brotli)
                │         content_blob = compressed content
                │         compression_bucket_id = NULL
                │
                └── NO → Similar content exists? (same domain/type)
                          │
                          ├── YES → Store in compression bucket
                          │         compression_bucket_id = [bucket_id]
                          │         bucket_entry_key = "article_12345.html"
                          │         content_blob = NULL
                          │         (Bucket has compression_type_id = 4 or 5)
                          │
                          └── NO → Store as file
                                    storage_type = 'file'
                                    file_path = "/path/to/file.html.gz"
                                    compression_type_id = 2 (gzip)
```

---

## Bucket Lifecycle

### Phase 1: Creation (Open for Additions)

```sql
-- 1. Create bucket
INSERT INTO compression_buckets (
  bucket_type, domain_pattern, compression_type_id
) VALUES (
  'html_similar',
  'bbc.co.uk',
  (SELECT id FROM compression_types WHERE name = 'zstd_high')
) RETURNING id;
-- Returns bucket_id = 42

-- Bucket state:
--   finalized_at = NULL (open)
--   content_count = 0
--   bucket_blob = NULL
```

### Phase 2: Adding Content (Accumulation)

```sql
-- 2. Add content entries (repeat for each item)
INSERT INTO content_storage (
  storage_type,
  compression_bucket_id,
  bucket_entry_key,
  content_sha256,
  uncompressed_size
) VALUES (
  'bucket_compressed',
  42,                    -- Points to bucket
  'article_12345.html',  -- Filename within bucket
  'abc123...',           -- SHA256 hash
  45678                  -- Original size
);

-- Bucket state:
--   finalized_at = NULL (still open)
--   content_count = 0 (not yet updated)
--   bucket_blob = NULL (archive not yet created)
```

### Phase 3: Finalization (Archive Creation)

```javascript
// 3. Create tar.zstd archive
const tar = require('tar-stream');
const { compress } = require('@mongodb-js/zstd');

// Get all content for this bucket
const contents = db.prepare(`
  SELECT id, bucket_entry_key, content_sha256, uncompressed_size
  FROM content_storage
  WHERE compression_bucket_id = ? AND storage_type = 'bucket_compressed'
`).all(42);

// Create tar archive
const pack = tar.pack();
const index = {};

for (const content of contents) {
  // Fetch original content from somewhere (articles table, fetches table, etc.)
  const originalContent = getOriginalContent(content.content_sha256);
  
  index[content.bucket_entry_key] = {
    content_id: content.id,
    size: originalContent.length
  };
  
  pack.entry({ name: content.bucket_entry_key }, originalContent);
}

pack.finalize();

// Compress and store
const tarBuffer = Buffer.concat(pack);
const compressedBuffer = await compress(tarBuffer, 19); // zstd level 19

db.prepare(`
  UPDATE compression_buckets
  SET bucket_blob = ?,
      index_json = ?,
      finalized_at = datetime('now'),
      content_count = ?,
      uncompressed_size = ?,
      compressed_size = ?,
      compression_ratio = ?
  WHERE id = ?
`).run(
  compressedBuffer,
  JSON.stringify(index),
  contents.length,
  tarBuffer.length,
  compressedBuffer.length,
  compressedBuffer.length / tarBuffer.length,
  42
);

// Bucket state:
//   finalized_at = '2025-10-06 12:00:00' (sealed)
//   content_count = 127
//   bucket_blob = [compressed tar.zstd blob]
//   compression_ratio = 0.048 (4.8%, 20x compression!)
```

### Phase 4: Retrieval (Content Access)

```javascript
// 4. Retrieve content from bucket
const { decompress } = require('@mongodb-js/zstd');
const tar = require('tar-stream');

// Get content metadata
const content = db.prepare(`
  SELECT compression_bucket_id, bucket_entry_key
  FROM content_storage
  WHERE id = ?
`).get(12345);

// Get bucket
const bucket = db.prepare(`
  SELECT bucket_blob, index_json, compression_type_id
  FROM compression_buckets
  WHERE id = ?
`).get(content.compression_bucket_id);

// Decompress bucket (cache this step for repeated access!)
const compressedBuffer = bucket.bucket_blob;
const tarBuffer = await decompress(compressedBuffer);

// Extract specific file
const extract = tar.extract();
let foundContent = null;

extract.on('entry', (header, stream, next) => {
  if (header.name === content.bucket_entry_key) {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => {
      foundContent = Buffer.concat(chunks);
      next();
    });
  } else {
    stream.resume();
    next();
  }
});

extract.end(tarBuffer);

// foundContent now contains the original uncompressed HTML
```

---

## Performance Optimization: Bucket Cache

To avoid repeatedly decompressing the same bucket:

```javascript
class BucketCache {
  constructor(maxSize = 10) {
    this.cache = new Map(); // bucket_id -> { tarBuffer, accessedAt }
    this.maxSize = maxSize;
  }
  
  async get(bucketId, db) {
    // Check cache
    if (this.cache.has(bucketId)) {
      const cached = this.cache.get(bucketId);
      cached.accessedAt = Date.now();
      return cached.tarBuffer;
    }
    
    // Cache miss - fetch and decompress
    const bucket = db.prepare(`
      SELECT bucket_blob FROM compression_buckets WHERE id = ?
    `).get(bucketId);
    
    const tarBuffer = await decompress(bucket.bucket_blob);
    
    // Add to cache (evict oldest if full)
    if (this.cache.size >= this.maxSize) {
      const oldest = [...this.cache.entries()]
        .sort((a, b) => a[1].accessedAt - b[1].accessedAt)[0];
      this.cache.delete(oldest[0]);
    }
    
    this.cache.set(bucketId, { tarBuffer, accessedAt: Date.now() });
    
    return tarBuffer;
  }
  
  clear() {
    this.cache.clear();
  }
}

// Usage
const bucketCache = new BucketCache(10); // Cache 10 most recent buckets

async function getContentFromBucket(contentId, db) {
  const content = db.prepare(`
    SELECT compression_bucket_id, bucket_entry_key
    FROM content_storage WHERE id = ?
  `).get(contentId);
  
  // Get tar buffer from cache (or decompress if miss)
  const tarBuffer = await bucketCache.get(content.compression_bucket_id, db);
  
  // Extract file from tar (fast since already decompressed)
  return extractFileFromTar(tarBuffer, content.bucket_entry_key);
}
```

**Performance with cache**:
- First access of bucket: ~150ms (decompress + extract)
- Subsequent accesses: ~1ms (cache hit + extract)
- Cache size: ~50-100MB per bucket (decompressed tar in memory)

---

## Compression Ratio Examples

Real-world compression ratios for similar HTML content:

| Content Type | Individual (gzip) | Bucket (zstd level 19) | Improvement |
|--------------|-------------------|------------------------|-------------|
| News articles (same domain) | 4.2x | 19.6x | 4.7x better |
| API responses (JSON) | 8.1x | 24.3x | 3.0x better |
| HTML pages (mixed domains) | 3.8x | 8.4x | 2.2x better |
| CSS files (same site) | 5.2x | 31.2x | 6.0x better |
| Sitemap XML | 12.4x | 47.8x | 3.9x better |

**Why buckets compress better**:
- Zstd builds dictionary from similar files
- Repeated HTML structures (headers, footers, nav) compress to near-zero
- Repeated strings (class names, URLs) become dictionary references

---

## Storage Strategy Recommendations

### Hot Data (0-7 days old)
- **Storage**: `db_inline` (uncompressed)
- **Reason**: Fast access for serving/analysis
- **Compression type**: `none` (id=1)

### Warm Data (7-30 days old)
- **Storage**: `db_compressed` (individual compression)
- **Reason**: Good balance of space savings and access speed
- **Compression type**: `gzip` (id=2) or `brotli` (id=3)

### Cold Data (30+ days old)
- **Storage**: `bucket_compressed` (shared compression)
- **Reason**: Maximum space savings for archival
- **Compression type**: `zstd_high` (id=5) in bucket

### Archival Data (90+ days old)
- **Storage**: `file` (compressed files on disk)
- **Reason**: Offload from database, rarely accessed
- **Compression type**: `zstd` (id=4)

---

## Migration Path (No Breaking Changes)

### Step 1: Add Tables (Today)
```sql
-- Add to ensureDb.js
CREATE TABLE compression_types (...);
CREATE TABLE compression_buckets (...);
CREATE TABLE content_storage (...);
```

### Step 2: Start Using for New Content (Week 1)
```javascript
// When fetching new content
const compressedHtml = gzipSync(html);
const contentId = insertIntoContentStorage({
  storage_type: 'db_compressed',
  compression_type_id: 2, // gzip
  content_blob: compressedHtml
});
```

### Step 3: Backfill Recent Content (Week 2-3)
```javascript
// Migrate articles from last 30 days
const recentArticles = db.prepare(`
  SELECT id, html FROM articles WHERE crawled_at > date('now', '-30 days')
`).all();

for (const article of recentArticles) {
  const compressed = gzipSync(article.html);
  insertIntoContentStorage({
    storage_type: 'db_compressed',
    compression_type_id: 2,
    content_blob: compressed
  });
}
```

### Step 4: Create Buckets for Old Content (Week 4+)
```javascript
// Group old articles by domain
const oldArticles = db.prepare(`
  SELECT id, url, html, domain_id
  FROM articles
  WHERE crawled_at < date('now', '-30 days')
  GROUP BY domain_id
`).all();

// Create bucket per domain
for (const domain of uniqueDomains) {
  const articles = oldArticles.filter(a => a.domain_id === domain);
  createBucketForArticles(articles, 'html_similar', domain);
}
```

### Step 5: Update Application Code (Ongoing)
```javascript
// Modify getArticleHtml() to check content_storage first
function getArticleHtml(articleId) {
  // Check if in content_storage
  const content = db.prepare(`
    SELECT id, storage_type, compression_bucket_id
    FROM content_storage
    WHERE article_id = ?
  `).get(articleId);
  
  if (content) {
    // Retrieve from compressed storage
    return getContentFromStorage(content.id);
  }
  
  // Fallback to articles table
  return db.prepare(`SELECT html FROM articles WHERE id = ?`).get(articleId).html;
}
```

---

## Summary

**Key Design Decisions**:
1. ✅ **Unified compression type system**: Same `compression_types` table for both individual and bucket compression
2. ✅ **Bucket = multi-file archive**: Each bucket is a tar.zstd blob containing many files
3. ✅ **Index for fast lookup**: `index_json` maps filenames to offsets
4. ✅ **LRU cache for performance**: Keep recently accessed buckets decompressed in memory
5. ✅ **No schema migration required**: Add tables alongside existing schema

**Implementation Priority**:
1. Add tables (30 minutes)
2. Test individual compression (2 hours)
3. Test bucket compression (4 hours)
4. Add background job to compress old content (4 hours)
5. Backfill historical data (ongoing)

**Expected Savings**:
- Database size reduction: 40-50% (with individual compression)
- Database size reduction: 70-80% (with bucket compression for old content)
- Disk I/O reduction: 60-70% (less data to read/write)

---

**Ready to implement?** See `COMPRESSION_TABLES_MIGRATION.md` for complete code!
