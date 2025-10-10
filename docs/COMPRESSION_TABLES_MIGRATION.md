# Compression Tables Migration Guide

**When to Read**: Read this when adding compression infrastructure to the database. This is the quick-start guide for creating compression_types, compression_buckets, and content_storage tables. For full compression implementation details, see COMPRESSION_IMPLEMENTATION_FULL.md.  
**Goal**: Add compression infrastructure (compression_types, compression_buckets, content_storage) WITHOUT breaking existing schema.

**Strategy**: Add new tables alongside existing tables. Application can use new tables incrementally without requiring migration of existing data.

---

## Step 1: Create `compression_types` Table

Add to `src/db/sqlite/ensureDb.js`:

```javascript
// In ensureDb() function, add after existing table creation:

db.exec(`
  -- Compression types lookup table
  CREATE TABLE IF NOT EXISTS compression_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,     -- 'none' | 'gzip' | 'brotli' | 'zstd'
    mime_type TEXT,                -- 'application/gzip' | 'application/zstd'
    extension TEXT,                -- '.gz' | '.br' | '.zst'
    compression_level INTEGER,     -- Compression level used
    description TEXT
  );
`);

// Seed compression types (idempotent)
const compressionTypes = [
  { name: 'none', mime_type: null, extension: null, compression_level: 0, description: 'No compression' },
  { name: 'gzip', mime_type: 'application/gzip', extension: '.gz', compression_level: 6, description: 'Gzip compression (level 6)' },
  { name: 'brotli', mime_type: 'application/x-br', extension: '.br', compression_level: 11, description: 'Brotli compression (level 11)' },
  { name: 'zstd', mime_type: 'application/zstd', extension: '.zst', compression_level: 3, description: 'Zstandard compression (level 3)' },
  { name: 'zstd_high', mime_type: 'application/zstd', extension: '.zst', compression_level: 19, description: 'Zstandard compression (level 19, for buckets)' }
];

const insertCompressionType = db.prepare(`
  INSERT OR IGNORE INTO compression_types (name, mime_type, extension, compression_level, description)
  VALUES (?, ?, ?, ?, ?)
`);

for (const type of compressionTypes) {
  insertCompressionType.run(type.name, type.mime_type, type.extension, type.compression_level, type.description);
}
```

---

## Step 2: Create `compression_buckets` Table

Add to `src/db/sqlite/ensureDb.js`:

```javascript
db.exec(`
  -- Compression buckets (group similar files for better compression)
  CREATE TABLE IF NOT EXISTS compression_buckets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bucket_type TEXT NOT NULL,     -- 'html_similar' | 'json_api' | 'css' | 'js' | 'xml_sitemap'
    domain_pattern TEXT,           -- Host pattern for bucket (e.g., 'bbc.co.uk')
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    finalized_at TEXT,             -- When bucket is sealed (no more additions)
    content_count INTEGER DEFAULT 0,
    uncompressed_size INTEGER DEFAULT 0,
    compressed_size INTEGER DEFAULT 0,
    compression_ratio REAL,        -- compressed_size / uncompressed_size
    compression_type_id INTEGER REFERENCES compression_types(id),
    bucket_blob BLOB,              -- Compressed archive (tar.zst, tar.gz, etc.)
    index_json TEXT                -- JSON map: { "filename" -> { offset, size } }
  );
  
  CREATE INDEX IF NOT EXISTS idx_compression_buckets_type ON compression_buckets(bucket_type);
  CREATE INDEX IF NOT EXISTS idx_compression_buckets_domain ON compression_buckets(domain_pattern);
  CREATE INDEX IF NOT EXISTS idx_compression_buckets_finalized ON compression_buckets(finalized_at);
`);
```

---

## Step 3: Create `content_storage` Table

Add to `src/db/sqlite/ensureDb.js`:

```javascript
db.exec(`
  -- Content storage (where content actually lives)
  CREATE TABLE IF NOT EXISTS content_storage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    http_response_id INTEGER,      -- Will be NULL until http_responses table exists
    storage_type TEXT NOT NULL,    -- 'db_inline' | 'db_compressed' | 'file' | 'bucket_compressed'
    compression_type_id INTEGER REFERENCES compression_types(id),
    compression_bucket_id INTEGER REFERENCES compression_buckets(id),
    bucket_entry_key TEXT,         -- Filename/key within bucket
    content_blob BLOB,             -- Raw or compressed content (NULL if in bucket)
    content_sha256 TEXT,           -- SHA256 of uncompressed content
    uncompressed_size INTEGER,
    compressed_size INTEGER,
    compression_ratio REAL,
    file_path TEXT,                -- File path if storage_type='file'
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  
  CREATE INDEX IF NOT EXISTS idx_content_storage_bucket ON content_storage(compression_bucket_id);
  CREATE INDEX IF NOT EXISTS idx_content_storage_sha256 ON content_storage(content_sha256);
  CREATE INDEX IF NOT EXISTS idx_content_storage_type ON content_storage(storage_type);
`);
```

**Note**: `http_response_id` is nullable to allow using `content_storage` before `http_responses` table exists. Initially, you might link via `article_id` or `fetch_id` using JSON metadata.

---

## Step 4: Usage Examples (No Migration Required)

### Example 1: Store Individually Compressed Content

```javascript
const zlib = require('zlib');
const crypto = require('crypto');

// Compress content with gzip
const uncompressedContent = Buffer.from(htmlString, 'utf8');
const compressedContent = zlib.gzipSync(uncompressedContent, { level: 6 });

// Get compression type ID
const compressionType = db.prepare(`
  SELECT id FROM compression_types WHERE name = 'gzip'
`).get();

// Calculate SHA256
const sha256 = crypto.createHash('sha256').update(uncompressedContent).digest('hex');

// Insert into content_storage
db.prepare(`
  INSERT INTO content_storage (
    storage_type, compression_type_id, content_blob, content_sha256,
    uncompressed_size, compressed_size, compression_ratio
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  'db_compressed',
  compressionType.id,
  compressedContent,
  sha256,
  uncompressedContent.length,
  compressedContent.length,
  compressedContent.length / uncompressedContent.length
);
```

### Example 2: Create Compression Bucket

```javascript
// Step 1: Create bucket
const bucketId = db.prepare(`
  INSERT INTO compression_buckets (
    bucket_type, domain_pattern, compression_type_id
  ) VALUES (?, ?, (SELECT id FROM compression_types WHERE name = 'zstd_high'))
  RETURNING id
`).get('html_similar', 'bbc.co.uk').id;

// Step 2: Add content entries to bucket (without archive yet)
const articles = [
  { html: '<html>Article 1...</html>', url: 'https://bbc.co.uk/news/1' },
  { html: '<html>Article 2...</html>', url: 'https://bbc.co.uk/news/2' },
  // ... 100 more similar articles
];

for (let i = 0; i < articles.length; i++) {
  const article = articles[i];
  const sha256 = crypto.createHash('sha256').update(article.html, 'utf8').digest('hex');
  
  db.prepare(`
    INSERT INTO content_storage (
      storage_type, compression_bucket_id, bucket_entry_key,
      content_sha256, uncompressed_size
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    'bucket_compressed',
    bucketId,
    `article_${i}.html`,  // Entry key within bucket
    sha256,
    Buffer.byteLength(article.html, 'utf8')
  );
}

// Step 3: Create tar.zstd archive (using tar-stream + zstd)
const tar = require('tar-stream');
const { compress } = require('@mongodb-js/zstd'); // npm install @mongodb-js/zstd

const pack = tar.pack();
const index = {};

// Add all articles to tar
for (let i = 0; i < articles.length; i++) {
  const article = articles[i];
  const entryName = `article_${i}.html`;
  const content = Buffer.from(article.html, 'utf8');
  
  index[entryName] = {
    size: content.length,
    offset: pack.position || 0  // Track offset for fast extraction (if available)
  };
  
  pack.entry({ name: entryName, size: content.length }, content);
}

pack.finalize();

// Collect tar stream into buffer
const tarChunks = [];
pack.on('data', chunk => tarChunks.push(chunk));
pack.on('end', async () => {
  const tarBuffer = Buffer.concat(tarChunks);
  
  // Compress with zstd level 19
  const compressedBuffer = await compress(tarBuffer, 19);
  
  // Store bucket
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
    articles.length,
    tarBuffer.length,
    compressedBuffer.length,
    compressedBuffer.length / tarBuffer.length,
    bucketId
  );
  
  console.log(`Bucket ${bucketId} finalized:`);
  console.log(`  Content count: ${articles.length}`);
  console.log(`  Uncompressed: ${(tarBuffer.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Compressed: ${(compressedBuffer.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Ratio: ${(compressedBuffer.length / tarBuffer.length * 100).toFixed(1)}%`);
});
```

### Example 3: Retrieve Content from Bucket

```javascript
const { decompress } = require('@mongodb-js/zstd');
const tar = require('tar-stream');

async function getContentFromBucket(contentStorageId) {
  // Get content metadata
  const content = db.prepare(`
    SELECT compression_bucket_id, bucket_entry_key
    FROM content_storage
    WHERE id = ?
  `).get(contentStorageId);
  
  // Get bucket
  const bucket = db.prepare(`
    SELECT bucket_blob, index_json
    FROM compression_buckets
    WHERE id = ?
  `).get(content.compression_bucket_id);
  
  // Decompress bucket
  const compressedBuffer = bucket.bucket_blob;
  const tarBuffer = await decompress(compressedBuffer);
  
  // Extract specific file from tar
  return new Promise((resolve, reject) => {
    const extract = tar.extract();
    
    extract.on('entry', (header, stream, next) => {
      if (header.name === content.bucket_entry_key) {
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => {
          resolve(Buffer.concat(chunks).toString('utf8'));
        });
        stream.resume();
      } else {
        stream.resume();
        next();
      }
    });
    
    extract.on('finish', () => reject(new Error('Entry not found in bucket')));
    extract.end(tarBuffer);
  });
}

// Usage
const html = await getContentFromBucket(12345);
console.log(html);
```

---

## Step 5: Record as Schema Version 2

Use the schema version manager from Phase 0:

```javascript
const { SchemaVersionManager } = require('../db/migration/schema-versions');

const db = ensureDb('./data/news.db');
const versionManager = new SchemaVersionManager(db);

versionManager.recordMigration(
  2,
  'add_compression_tables',
  'Add compression_types, compression_buckets, and content_storage tables',
  `
    -- Rollback SQL (if needed)
    DROP TABLE IF EXISTS content_storage;
    DROP TABLE IF EXISTS compression_buckets;
    DROP TABLE IF EXISTS compression_types;
  `
);

console.log('Current schema version:', versionManager.getCurrentVersion());
```

---

## Benefits of This Approach

1. **✅ No Breaking Changes**: Existing tables untouched
2. **✅ Incremental Adoption**: Use compression for new content only
3. **✅ Zero Downtime**: No need to stop application
4. **✅ Reversible**: Can rollback if issues arise
5. **✅ Testable**: Test compression on subset before full adoption

---

## Performance Characteristics

### Individual Compression (`db_compressed`)
- **Compression ratio**: 3-5x (gzip/brotli)
- **Access time**: ~2ms (decompress on read)
- **Use case**: Frequently accessed content

### Bucket Compression (`bucket_compressed`)
- **Compression ratio**: 10-20x (zstd level 19, dictionary compression)
- **Access time**: First access ~150ms (decompress entire bucket), subsequent <1ms (cached)
- **Use case**: Archival storage, bulk analysis, similar content

### Recommended Strategy
1. Store recent content as `db_inline` (uncompressed, fast access)
2. After 7 days, compress to `db_compressed` (moderate compression, still fast)
3. After 30 days, move to `bucket_compressed` (high compression, slower access)
4. Keep 10 most recent buckets decompressed in memory cache

---

## Next Steps

1. **Phase 1**: Add tables to `ensureDb.js` (30 minutes)
2. **Phase 2**: Create compression utility module (2-4 hours)
3. **Phase 3**: Test with small dataset (1-2 hours)
4. **Phase 4**: Add background job to compress old content (4-6 hours)
5. **Phase 5**: Monitor compression ratios and adjust strategy (ongoing)

---

**Ready to implement?** All SQL is ready—just add to `ensureDb.js`!
