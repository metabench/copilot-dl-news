# HTTP Request/Response Caching Infrastructure Analysis & Migration Plan

## Executive Summary

The current system has a robust HTTP request/response storage infrastructure for crawled webpages, but Wikidata API responses are cached separately on the filesystem. This report analyzes the existing system and proposes a unified facade pattern to support caching all HTTP requests (HTML pages, SPARQL queries, Wikidata API calls) using the same database infrastructure.

## Current HTTP Storage System Architecture

### Core Tables

#### `http_responses` Table
- **Purpose**: Stores HTTP response metadata for all fetched content
- **Key Fields**:
  - `url_id`: Foreign key to `urls` table
  - `http_status`, `content_type`, `content_encoding`
  - `etag`, `last_modified` (HTTP caching headers)
  - `ttfb_ms`, `download_ms`, `total_ms` (performance metrics)
  - `bytes_downloaded`, `transfer_kbps` (size/speed metrics)
- **Current Usage**: All webpage crawls store response metadata here

#### `content_storage` Table
- **Purpose**: Stores actual response content with compression support
- **Key Fields**:
  - `http_response_id`: Links to `http_responses`
  - `storage_type`: `'db_inline'`, `'bucket'`, `'file'`
  - `compression_type_id`: References compression algorithms
  - `content_blob`: BLOB storage for compressed content
  - `content_sha256`: Content hash for deduplication
  - `uncompressed_size`, `compressed_size`, `compression_ratio`
- **Current Usage**: HTML content from crawled pages

#### `urls` Table
- **Purpose**: Canonical URL storage and deduplication
- **Key Fields**: `url`, `host`, `created_at`, `last_seen_at`
- **Current Usage**: All HTTP requests are registered here

#### Supporting Tables
- `content_analysis`: Content classification and metadata
- `discovery_events`: How URLs were discovered
- `compression_types`: Available compression algorithms
- `compression_buckets`: Bucketed storage for large content

### Existing Facade Patterns

#### `CompressionFacade` (`src/utils/CompressionFacade.js`)
```javascript
// Unified interface for compression operations
const { compress, decompress, PRESETS } = require('./CompressionFacade');
const result = compress(content, { preset: PRESETS.BROTLI_6 });
```

**Responsibilities**:
- Algorithm validation and level clamping
- Preset definitions (`PRESETS` constants)
- Consistent stats object creation
- Compression type lookups

#### `NewsWebsiteService` (`src/services/NewsWebsiteService.js`)
```javascript
// Service facade for news website operations
class NewsWebsiteService {
  constructor(db) {
    this.db = db;
    this.statsCache = new NewsWebsiteStatsCache(db);
  }
}
```

**Responsibilities**:
- Wrap database operations with business logic
- Maintain statistics cache consistency
- Provide high-level operations

## Current Wikidata Caching Implementation

### Filesystem-Based Caching
- **Location**: `data/cache/gazetteer/wikidata/`
- **File Types**:
  - `adm1-{country}-{hash}.json`: Administrative regions
  - `sparql-{hash}.json`: SPARQL query results
  - `entities-{hash}.json`: Wikidata entity batches

### Cache Implementation Details

#### WikidataAdm1Ingestor.js
```javascript
_getCachePath(country, regions) {
  const content = JSON.stringify({ country, regions: regions.map(r => r.qid).sort() });
  const hash = crypto.createHash('sha1').update(content).digest('hex').substring(0, 8);
  return path.join(this.cacheDir, `adm1-${country}-${hash}.json`);
}

_cacheRegions(country, regionsData) {
  const cachePath = this._getCachePath(country, regionsData);
  const data = { timestamp: new Date().toISOString(), country, regions: regionsData };
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
}
```

#### populate-gazetteer.js
```javascript
function sparqlCachePath(query) {
  const hash = crypto.createHash('sha1').update(query).digest('hex');
  return path.join(cacheDir, 'sparql', `${hash}.json`);
}

async function fetchSparql(query) {
  const cpath = sparqlCachePath(query);
  if (fs.existsSync(cpath)) {
    return JSON.parse(fs.readFileSync(cpath, 'utf8'));
  }
  // ... API call ...
  fs.writeFileSync(cpath, JSON.stringify(jr));
}
```

#### WikidataCountryIngestor.js
```javascript
const cacheKey = crypto.createHash('sha1').update(qids.sort().join('|')).digest('hex');
const cachePath = path.join(this.cacheDir, `entities-${cacheKey}.json`);

if (fs.existsSync(cachePath)) {
  return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
}
// ... API call ...
fs.writeFileSync(cachePath, JSON.stringify(data));
```

## Problems with Current Approach

### 1. **Dual Storage Systems**
- Webpage content: Database storage with compression and indexing
- API responses: Filesystem storage with manual cache management
- **Impact**: Inconsistent caching behavior, duplicate code, maintenance burden

### 2. **Limited Queryability**
- Database content is queryable (compression stats, content analysis, etc.)
- Filesystem cache is opaque (no analytics, no cleanup policies)
- **Impact**: Cannot analyze API usage patterns or cache effectiveness

### 3. **Inconsistent Cache Policies**
- Webpage cache: Integrated with crawl lifecycle and compression
- API cache: Manual filesystem management with no TTL or cleanup
- **Impact**: API cache grows indefinitely, no performance monitoring

### 4. **Code Duplication**
- Three separate caching implementations (adm1, sparql, entities)
- Each handles cache keys, file I/O, and error handling
- **Impact**: Bug fixes must be applied in multiple places

## Proposed Solution: HttpRequestResponseFacade

### Architecture Overview

Create a unified facade for all HTTP request/response caching operations, following the same pattern as `CompressionFacade`.

```javascript
// Proposed unified interface
const { cacheHttpResponse, getCachedHttpResponse, PRESETS } = require('./HttpRequestResponseFacade');

// Cache any HTTP response (HTML, JSON, SPARQL results)
await cacheHttpResponse(db, {
  url: 'https://query.wikidata.org/sparql?query=...',
  request: { method: 'GET', headers: {...} },
  response: { status: 200, headers: {...}, body: jsonData },
  metadata: { source: 'wikidata-sparql', ttlMs: 24 * 60 * 60 * 1000 }
});

// Retrieve cached response
const cached = await getCachedHttpResponse(db, 'https://query.wikidata.org/sparql?query=...');
```

### Facade Responsibilities

1. **Unified Cache Interface**: Single API for all HTTP caching needs
2. **Content Type Agnostic**: Handle HTML, JSON, XML, binary content
3. **Compression Integration**: Use existing compression infrastructure
4. **TTL and Cleanup**: Configurable cache expiration policies
5. **Analytics**: Cache hit/miss statistics and performance monitoring
6. **Migration Support**: Import existing filesystem caches

### Database Schema Extensions

#### Extend `http_responses` Table
Add fields for API-specific metadata:
```sql
ALTER TABLE http_responses ADD COLUMN request_method TEXT DEFAULT 'GET';
ALTER TABLE http_responses ADD COLUMN request_headers JSON;
ALTER TABLE http_responses ADD COLUMN response_headers JSON;
ALTER TABLE http_responses ADD COLUMN cache_source TEXT; -- 'webpage', 'wikidata-sparql', 'wikidata-api'
ALTER TABLE http_responses ADD COLUMN cache_ttl_ms INTEGER;
ALTER TABLE http_responses ADD COLUMN cache_created_at TEXT;
```

#### Extend `content_storage` Table
Add support for different content types:
```sql
ALTER TABLE content_storage ADD COLUMN content_type TEXT DEFAULT 'html'; -- 'html', 'json', 'xml', 'sparql-results'
ALTER TABLE content_storage ADD COLUMN content_subtype TEXT; -- 'wikidata-entities', 'sparql-json', etc.
```

#### New `http_cache_metadata` Table
```sql
CREATE TABLE http_cache_metadata (
  id INTEGER PRIMARY KEY,
  http_response_id INTEGER NOT NULL REFERENCES http_responses(id),
  cache_key TEXT NOT NULL UNIQUE,
  cache_category TEXT NOT NULL, -- 'webpage', 'api-sparql', 'api-wikidata'
  hit_count INTEGER DEFAULT 0,
  last_hit_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  UNIQUE(cache_key, cache_category)
);
```

### Facade Implementation

#### Core Interface
```javascript
class HttpRequestResponseFacade {
  /**
   * Cache an HTTP request/response pair
   */
  static async cacheHttpResponse(db, {
    url,
    request = {},
    response = {},
    metadata = {}
  }) {
    // 1. Ensure URL exists
    const urlId = await this._ensureUrlId(db, url);
    
    // 2. Insert HTTP response metadata
    const httpResponseId = await this._insertHttpResponse(db, urlId, request, response, metadata);
    
    // 3. Store response content with compression
    const contentId = await this._storeContent(db, httpResponseId, response.body, metadata);
    
    // 4. Create cache metadata entry
    const cacheKey = this._generateCacheKey(url, request, metadata);
    await this._insertCacheMetadata(db, httpResponseId, cacheKey, metadata);
    
    return { httpResponseId, contentId };
  }

  /**
   * Retrieve cached HTTP response
   */
  static async getCachedHttpResponse(db, url, options = {}) {
    const cacheKey = this._generateCacheKey(url, options.request || {}, options.metadata || {});
    
    // Check cache metadata for hit
    const cacheEntry = await this._getCacheEntry(db, cacheKey, options.category);
    if (!cacheEntry || this._isExpired(cacheEntry)) {
      return null;
    }
    
    // Update hit statistics
    await this._recordCacheHit(db, cacheEntry.id);
    
    // Retrieve response data
    return await this._assembleResponse(db, cacheEntry.http_response_id);
  }
}
```

#### Cache Key Generation Strategy

```javascript
_generateCacheKey(url, request, metadata) {
  const components = [url];
  
  // Include relevant request parameters
  if (request.method && request.method !== 'GET') {
    components.push(request.method);
  }
  
  // For SPARQL queries, include the query itself
  if (metadata.query) {
    components.push(metadata.query);
  }
  
  // For Wikidata entity requests, include sorted entity IDs
  if (metadata.entityIds) {
    components.push(metadata.entityIds.sort().join('|'));
  }
  
  // For ADM1 requests, include country and region scope
  if (metadata.country) {
    components.push(metadata.country);
    if (metadata.regionQids) {
      components.push(metadata.regionQids.sort().join('|'));
    }
  }
  
  return crypto.createHash('sha256').update(components.join('|')).digest('hex');
}
```

### Migration Strategy

#### Phase 1: Create Facade Infrastructure
1. Implement `HttpRequestResponseFacade` class
2. Add database schema extensions
3. Create migration scripts for schema changes
4. Add comprehensive tests

#### Phase 2: Update Wikidata Ingestors
1. Replace filesystem caching in `WikidataAdm1Ingestor.js`
2. Replace filesystem caching in `WikidataCountryIngestor.js`
3. Replace filesystem caching in `populate-gazetteer.js`
4. Update cache key generation logic

#### Phase 3: Migration & Cleanup
1. Create migration script to import existing filesystem caches
2. Update configuration to use database caching
3. Remove old filesystem cache files
4. Update documentation

#### Phase 4: Analytics & Monitoring
1. Add cache performance monitoring
2. Implement cache cleanup policies
3. Add cache usage analytics

### Benefits of Unified Approach

#### 1. **Consistency**
- Single caching interface for all HTTP requests
- Consistent cache policies and TTL management
- Unified compression and storage handling

#### 2. **Performance**
- Database indexing for fast cache lookups
- Compression reduces storage footprint
- Analytics enable performance optimization

#### 3. **Maintainability**
- Single codebase for cache operations
- Easier testing and debugging
- Consistent error handling

#### 4. **Analytics**
- Cache hit/miss ratios
- Storage utilization metrics
- Performance monitoring per content type

#### 5. **Extensibility**
- Easy to add new API types (REST Countries, GeoNames, etc.)
- Configurable TTL policies per content type
- Support for different compression strategies

### Implementation Challenges

#### 1. **Schema Evolution**
- Adding columns to existing tables with data
- Backward compatibility during migration
- Handling different content types in same tables

#### 2. **Cache Key Design**
- Ensuring cache keys are deterministic and unique
- Handling query parameter ordering (SPARQL, entity IDs)
- Supporting different caching strategies per API

#### 3. **Migration Complexity**
- Importing 727 existing cache files
- Handling cache expiration during migration
- Ensuring no data loss during transition

#### 4. **Performance Considerations**
- Database vs filesystem I/O performance
- Compression overhead for API responses
- Index maintenance for cache metadata

### Configuration Strategy

```javascript
// config/http-cache.js
module.exports = {
  // Default TTL per content type
  ttl: {
    'webpage-html': 7 * 24 * 60 * 60 * 1000,     // 7 days
    'wikidata-sparql': 24 * 60 * 60 * 1000,     // 1 day
    'wikidata-entities': 24 * 60 * 60 * 1000,   // 1 day
    'wikidata-adm1': 7 * 24 * 60 * 60 * 1000,   // 7 days
  },
  
  // Compression presets per content type
  compression: {
    'webpage-html': 'brotli_6',
    'wikidata-sparql': 'gzip_6',
    'wikidata-entities': 'gzip_6',
    'wikidata-adm1': 'gzip_6',
  },
  
  // Cache size limits
  limits: {
    maxEntries: 100000,
    maxSizeBytes: 10 * 1024 * 1024 * 1024, // 10GB
  }
};
```

### Testing Strategy

#### Unit Tests
- Cache key generation consistency
- TTL and expiration logic
- Compression integration
- Error handling

#### Integration Tests
- Full request/response cycle
- Migration from filesystem to database
- Cache hit/miss scenarios
- Performance benchmarks

#### End-to-End Tests
- Wikidata ingestor integration
- Cache cleanup policies
- Analytics reporting

## Conclusion

The proposed `HttpRequestResponseFacade` would unify HTTP caching across the entire system, eliminating the dual storage approach and providing consistent, queryable, and maintainable caching for all HTTP requests. The facade pattern follows established precedents in the codebase (`CompressionFacade`, `NewsWebsiteService`) and would significantly improve system architecture while maintaining backward compatibility.

The migration would require careful planning but would result in a more robust, analyzable, and maintainable caching system capable of handling webpage content, SPARQL queries, Wikidata API responses, and future API integrations using the same infrastructure.