# Compression Bucket Storage System - Implementation Plan

**Scope**: Bucket storage infrastructure only (no assignment logic, no benchmarks)  
**Goal**: Create tables and utilities to store/retrieve compressed buckets  
**Status**: ✅ Complete (Implemented on 2025-10-08)

**When to Read**:
- Implementing or reviewing the compression bucket schema/utility modules prior to coding
- Coordinating Phase 0/1 normalization work where bucket storage interacts with new content tables
- Planning tests, migrations, or follow-on tasks for compressed content retrieval

---

## What We're Building

### ✅ In Scope
1. Database tables (`compression_types`, `compression_buckets`, `content_storage`)
2. Compression utility module (gzip, brotli at all levels)
3. Bucket creation utilities (given a list of items)
4. Bucket retrieval utilities (extract content from bucket)
5. Basic tests

### ❌ Out of Scope (For Later)
- ❌ Bucket assignment logic (which items go in which bucket?)
- ❌ Similarity detection algorithms
- ❌ Automatic bucketing strategies
- ❌ Benchmarking tools
- ❌ Background jobs for compression
- ❌ Migration of existing content

---

## Part 1: Database Schema

### Tables to Create

```sql
-- 1. Compression types registry (17 variants: gzip 1-9, brotli 0-11, zstd 3/19)
CREATE TABLE IF NOT EXISTS compression_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,           -- 'gzip_6', 'brotli_11', etc.
  algorithm TEXT NOT NULL,             -- 'gzip' | 'brotli' | 'zstd' | 'none'
  level INTEGER NOT NULL,              -- Compression level
  mime_type TEXT,
  extension TEXT,
  memory_mb INTEGER DEFAULT 0,         -- Memory usage estimate
  window_bits INTEGER,                 -- Brotli: window size (10-24)
  block_bits INTEGER,                  -- Brotli: block size (16-24)
  description TEXT
);

-- 2. Compression buckets (each bucket = one compressed archive)
CREATE TABLE IF NOT EXISTS compression_buckets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket_type TEXT NOT NULL,           -- 'html_similar', 'json_api', etc.
  domain_pattern TEXT,                 -- Domain grouping (optional)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finalized_at TEXT,                   -- When bucket is sealed
  content_count INTEGER DEFAULT 0,
  uncompressed_size INTEGER DEFAULT 0,
  compressed_size INTEGER DEFAULT 0,
  compression_ratio REAL,
  compression_type_id INTEGER REFERENCES compression_types(id),
  bucket_blob BLOB,                    -- Compressed tar archive
  index_json TEXT                      -- JSON map: filename -> { size, sha256 }
);

CREATE INDEX IF NOT EXISTS idx_compression_buckets_type 
  ON compression_buckets(bucket_type);
CREATE INDEX IF NOT EXISTS idx_compression_buckets_domain 
  ON compression_buckets(domain_pattern);
CREATE INDEX IF NOT EXISTS idx_compression_buckets_finalized 
  ON compression_buckets(finalized_at);

-- 3. Content storage (points to either bucket or individual blob)
CREATE TABLE IF NOT EXISTS content_storage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  storage_type TEXT NOT NULL,          -- 'db_inline' | 'db_compressed' | 'bucket_compressed' | 'file'
  compression_type_id INTEGER REFERENCES compression_types(id),
  compression_bucket_id INTEGER REFERENCES compression_buckets(id),
  bucket_entry_key TEXT,               -- Filename within bucket
  content_blob BLOB,                   -- Content (NULL if in bucket)
  content_sha256 TEXT,
  uncompressed_size INTEGER,
  compressed_size INTEGER,
  compression_ratio REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_content_storage_bucket 
  ON content_storage(compression_bucket_id);
CREATE INDEX IF NOT EXISTS idx_content_storage_sha256 
  ON content_storage(content_sha256);
CREATE INDEX IF NOT EXISTS idx_content_storage_type 
  ON content_storage(storage_type);
```

---

## Part 2: Compression Utility Module

### src/utils/compression.js

**Purpose**: Core compression/decompression functions for gzip and brotli

**Functions**:
```javascript
// Compress content with specified algorithm and level
compress(content, { algorithm, level, windowBits, blockBits })
  → { compressed: Buffer, uncompressedSize, compressedSize, ratio, sha256 }

// Decompress content
decompress(compressedBuffer, algorithm)
  → Buffer

// Get compression type from database
getCompressionType(db, name)
  → { id, name, algorithm, level, ... }
```

**Algorithms Supported**:
- Gzip: levels 1, 3, 6, 9
- Brotli: levels 0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11
- Brotli 10-11 use 128-256MB memory with 16MB windows

**Example**:
```javascript
const { compress, decompress } = require('./utils/CompressionFacade');

// Compress with brotli level 11
const result = compress(htmlContent, {
  algorithm: 'brotli',
  level: 11,
  windowBits: 24,  // 16MB window
  blockBits: 24    // 16MB blocks
});

console.log(`Compressed to ${(result.ratio * 100).toFixed(2)}%`);
// Output: Compressed to 12.45%

// Decompress
const original = decompress(result.compressed, 'brotli');
```

---

## Part 3: Bucket Storage Utilities

### src/utils/compressionBuckets.js

**Purpose**: Create and manage compression buckets (tar archives)

**Functions**:
```javascript
// Create bucket from list of items
createBucket(db, {
  bucketType: 'html_similar',
  domainPattern: 'bbc.co.uk',
  compressionType: 'brotli_11',
  items: [
    { key: 'article_1.html', content: Buffer },
    { key: 'article_2.html', content: Buffer },
    // ... more items
  ]
})
  → bucketId (number)

// Retrieve content from bucket
retrieveFromBucket(db, bucketId, entryKey)
  → Buffer (decompressed content)

// List all entries in bucket
listBucketEntries(db, bucketId)
  → [{ key, size, sha256 }, ...]
```

**Internal Flow**:
1. Create tar archive from items
2. Compress tar with specified algorithm (gzip/brotli)
3. Store compressed blob in `compression_buckets.bucket_blob`
4. Store index mapping in `compression_buckets.index_json`
5. Insert references in `content_storage` table

**Example**:
```javascript
const { createBucket, retrieveFromBucket } = require('./utils/compressionBuckets');

// Create bucket with 100 HTML articles
const articles = [
  { key: 'article_1.html', content: '<html>Article 1...</html>' },
  { key: 'article_2.html', content: '<html>Article 2...</html>' },
  // ... 98 more
];

const bucketId = await createBucket(db, {
  bucketType: 'html_similar',
  domainPattern: 'bbc.co.uk',
  compressionType: 'brotli_11',
  items: articles
});

console.log(`Created bucket ${bucketId} with ${articles.length} items`);

// Later: retrieve content
const html = await retrieveFromBucket(db, bucketId, 'article_1.html');
console.log(html.toString('utf8'));
```

---

## Part 4: Bucket Cache (Performance Optimization)

### src/utils/bucketCache.js

**Purpose**: LRU cache to avoid repeatedly decompressing buckets

**Class**:
```javascript
class BucketCache {
  constructor(maxSize = 10)
  
  // Get decompressed tar buffer (from cache or decompress)
  async get(db, bucketId)
    → Buffer (tar buffer)
  
  // Clear cache
  clear()
}
```

**How It Works**:
1. First access: Decompress bucket → cache tar buffer
2. Subsequent access: Return cached tar buffer
3. LRU eviction: Keep only N most recent buckets

**Performance**:
- First access: ~150ms (decompress brotli 11)
- Cached access: <1ms
- Memory: ~50-100MB per cached bucket

**Example**:
```javascript
const { BucketCache } = require('./utils/bucketCache');

const cache = new BucketCache(10);  // Cache 10 buckets

// First access (slow - decompresses)
const tar1 = await cache.get(db, bucketId);
// Time: ~150ms

// Second access (fast - cached)
const tar2 = await cache.get(db, bucketId);
// Time: <1ms
```

---

## Part 5: Implementation Steps

### Step 1: Add Tables to Database (5 minutes)

**File**: `src/db/sqlite/v1/ensureDb.js`

**Action**: Add table creation SQL (see Part 1 above)

**Expected Result**:
- `compression_types` table created
- `compression_buckets` table created
- `content_storage` table created
- All indexes created

### Step 2: Seed Compression Types (10 minutes)

**File**: `src/db/sqlite/v1/ensureDb.js`

**Action**: Insert 17 compression type variants

**Compression Types to Seed**:
- `none` (no compression)
- `gzip_1`, `gzip_3`, `gzip_6`, `gzip_9` (4 variants)
- `brotli_0` through `brotli_11` (12 variants)
- Optional: `zstd_3`, `zstd_19` (2 variants)

**Example**:
```javascript
const compressionTypes = [
  { name: 'none', algorithm: 'none', level: 0 },
  { name: 'gzip_6', algorithm: 'gzip', level: 6, memory_mb: 4 },
  { name: 'brotli_11', algorithm: 'brotli', level: 11, memory_mb: 256, window_bits: 24, block_bits: 24 },
  // ... 14 more
];

for (const type of compressionTypes) {
  db.prepare(`INSERT OR IGNORE INTO compression_types (...) VALUES (...)`).run(...);
}
```

### Step 3: Create Compression Utility (30 minutes)

**File**: `src/utils/compression.js`

**Exports**:
- `compress(content, options)`
- `decompress(buffer, algorithm)`
- `getCompressionType(db, name)`

**Implementation**:
- Use Node.js `zlib` module for gzip and brotli
- Handle all compression levels (1-9 for gzip, 0-11 for brotli)
- Set memory parameters for brotli 10-11

### Step 4: Create Bucket Utilities (1 hour)

**File**: `src/utils/compressionBuckets.js`

**Exports**:
- `createBucket(db, options)`
- `retrieveFromBucket(db, bucketId, entryKey)`
- `listBucketEntries(db, bucketId)`

**Dependencies**:
- `tar-stream` package for tar creation/extraction
- `compression.js` for compression/decompression

### Step 5: Create Bucket Cache (30 minutes)

**File**: `src/utils/bucketCache.js`

**Exports**:
- `class BucketCache`

**Implementation**:
- LRU cache with configurable max size
- Store decompressed tar buffers
- Track access time for eviction

### Step 6: Write Tests (1 hour)

**Files**:
- `src/utils/__tests__/compression.test.js`
- `src/utils/__tests__/compressionBuckets.test.js`
- `src/utils/__tests__/bucketCache.test.js`

**Test Cases**:
- Compress/decompress with all algorithms
- Create bucket with multiple items
- Retrieve content from bucket
- Cache hit/miss behavior
- Error handling (invalid bucket ID, missing entry)

---

## Part 6: Usage Examples

### Example 1: Create Bucket Manually

```javascript
const { ensureDb } = require('./db/sqlite/ensureDb');
const { createBucket } = require('./utils/compressionBuckets');

const db = ensureDb('./data/news.db');

// Manually create bucket with specific items
const items = [
  { key: 'article_1.html', content: fs.readFileSync('./article1.html') },
  { key: 'article_2.html', content: fs.readFileSync('./article2.html') },
  { key: 'article_3.html', content: fs.readFileSync('./article3.html') }
];

const bucketId = await createBucket(db, {
  bucketType: 'html_test',
  domainPattern: 'example.com',
  compressionType: 'brotli_11',
  items
});

console.log(`Created bucket ${bucketId}`);
```

### Example 2: Retrieve Content

```javascript
const { retrieveFromBucket } = require('./utils/compressionBuckets');

const html = await retrieveFromBucket(db, bucketId, 'article_1.html');
console.log(html.toString('utf8'));
```

### Example 3: Store Reference in content_storage

```javascript
// After creating bucket, store references
const bucketId = await createBucket(db, { ... });

// Insert reference for each item
for (const item of items) {
  const sha256 = crypto.createHash('sha256').update(item.content).digest('hex');
  
  db.prepare(`
    INSERT INTO content_storage (
      storage_type,
      compression_bucket_id,
      bucket_entry_key,
      content_sha256,
      uncompressed_size
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    'bucket_compressed',
    bucketId,
    item.key,
    sha256,
    item.content.length
  );
}
```

### Example 4: Retrieve via content_storage

```javascript
// Get content ID from somewhere (e.g., linked to article)
const contentId = 12345;

// Lookup bucket and entry key
const content = db.prepare(`
  SELECT compression_bucket_id, bucket_entry_key
  FROM content_storage
  WHERE id = ?
`).get(contentId);

// Retrieve from bucket
const html = await retrieveFromBucket(
  db,
  content.compression_bucket_id,
  content.bucket_entry_key
);
```

---

## Part 7: Testing Strategy

### Manual Testing

```javascript
// test-bucket-storage.js
const { ensureDb } = require('./db/sqlite/ensureDb');
const { createBucket, retrieveFromBucket } = require('./utils/compressionBuckets');

async function test() {
  const db = ensureDb('./data/test.db');
  
  // Create test bucket
  const items = [
    { key: 'test1.html', content: '<html>Test 1</html>' },
    { key: 'test2.html', content: '<html>Test 2</html>' }
  ];
  
  console.log('Creating bucket...');
  const bucketId = await createBucket(db, {
    bucketType: 'test',
    compressionType: 'brotli_11',
    items
  });
  console.log(`Bucket created: ${bucketId}`);
  
  // Retrieve content
  console.log('Retrieving content...');
  const html1 = await retrieveFromBucket(db, bucketId, 'test1.html');
  console.log(`Retrieved: ${html1.toString('utf8')}`);
  
  // Verify
  if (html1.toString('utf8') === '<html>Test 1</html>') {
    console.log('✓ Test passed!');
  } else {
    console.log('✗ Test failed!');
  }
  
  db.close();
}

test().catch(console.error);
```

### Automated Tests

```javascript
// src/utils/__tests__/compressionBuckets.test.js
describe('Compression Buckets', () => {
  test('should create bucket and retrieve content', async () => {
    const items = [
      { key: 'item1.txt', content: 'Hello World' },
      { key: 'item2.txt', content: 'Foo Bar' }
    ];
    
    const bucketId = await createBucket(db, {
      bucketType: 'test',
      compressionType: 'gzip_6',
      items
    });
    
    expect(bucketId).toBeGreaterThan(0);
    
    const content = await retrieveFromBucket(db, bucketId, 'item1.txt');
    expect(content.toString('utf8')).toBe('Hello World');
  });
  
  test('should use brotli level 11 compression', async () => {
    const items = [
      { key: 'large.html', content: '<html>'.repeat(10000) + '</html>' }
    ];
    
    const bucketId = await createBucket(db, {
      bucketType: 'test',
      compressionType: 'brotli_11',
      items
    });
    
    const bucket = db.prepare(`
      SELECT compressed_size, uncompressed_size, compression_ratio
      FROM compression_buckets WHERE id = ?
    `).get(bucketId);
    
    expect(bucket.compression_ratio).toBeLessThan(0.2); // Better than 20%
  });
});
```

---

## Part 8: Expected Timeline

| Task | Time | Cumulative |
|------|------|------------|
| Add database tables | 5 min | 5 min |
| Seed compression types | 10 min | 15 min |
| Create compression.js | 30 min | 45 min |
| Create compressionBuckets.js | 1 hour | 1h 45min |
| Create bucketCache.js | 30 min | 2h 15min |
| Write tests | 1 hour | 3h 15min |
| Manual testing | 30 min | 3h 45min |
| **Total** | **~4 hours** | - |

---

## Part 9: Success Criteria

### Tables Created
- ✅ `compression_types` table exists
- ✅ Seeded with 17 compression variants
- ✅ `compression_buckets` table exists
- ✅ `content_storage` table exists
- ✅ All indexes created

### Modules Created
- ✅ `src/utils/compression.js` with compress/decompress
- ✅ `src/utils/compressionBuckets.js` with create/retrieve
- ✅ `src/utils/bucketCache.js` with LRU caching

### Functionality Verified
- ✅ Can create bucket with multiple items
- ✅ Can retrieve content from bucket by key
- ✅ Brotli level 11 achieves <15% compression ratio
- ✅ Cache improves access time (150ms → <1ms)
- ✅ All tests passing

### Ready for Next Phase
- ✅ Bucket storage infrastructure complete
- ✅ Can now work on bucket assignment logic
- ✅ Can benchmark different compression strategies

---

## What's NOT Included (Deferred)

### Bucket Assignment (Phase 2)
- Similarity detection algorithms
- Automatic grouping strategies
- Domain-based bucketing
- Content-type-based bucketing
- Size-based bucketing decisions

### Benchmarking (Phase 3)
- Compression ratio comparisons
- Speed benchmarking
- Memory usage profiling
- Storage savings calculations

### Automation (Phase 4)
- Background jobs for compression
- Age-based compression policies
- Automatic bucket finalization
- Migration of existing content

---

## Ready to Implement?

All the SQL and core utilities are ready. We can start with:

1. **Add tables to `ensureDb.js`** (5 minutes)
2. **Create `compression.js` module** (30 minutes)
3. **Create `compressionBuckets.js` module** (1 hour)
4. **Write basic tests** (1 hour)

**Total: ~3-4 hours of focused work**

Once this foundation is in place, we can work on bucket assignment logic separately.

Would you like me to start with Step 1 (add tables to database)?
