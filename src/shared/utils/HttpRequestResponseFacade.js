/**
 * HttpRequestResponseFacade - Unified HTTP Request/Response Caching Interface
 *
 * Single entry point for all HTTP request/response caching operations. Centralizes:
 * - Cache key generation for different request types
 * - TTL and expiration management
 * - Compression integration for response storage
 * - Analytics and performance monitoring
 * - Migration support from filesystem caches
 *
 * This facade reuses the existing database infrastructure (http_responses, content_storage, urls)
 * instead of creating separate tables, providing a unified caching system for:
 * - Webpage HTML content (existing)
 * - SPARQL query results (new)
 * - Wikidata API responses (new)
 * - Future API integrations (extensible)
 *
 * Usage:
 *   const { cacheHttpResponse, getCachedHttpResponse } = require('./HttpRequestResponseFacade');
 *
 *   // Cache any HTTP response
 *   await cacheHttpResponse(db, {
 *     url: 'https://api.example.com/data',
 *     request: { method: 'GET', headers: {} },
 *     response: { status: 200, headers: {}, body: jsonData },
 *     metadata: { category: 'api-wikidata', ttlMs: 24 * 60 * 60 * 1000 }
 *   });
 *
 *   // Retrieve cached response
 *   const cached = await getCachedHttpResponse(db, 'https://api.example.com/data', {
 *     category: 'api-wikidata'
 *   });
 */

const crypto = require('crypto');
const { compress, decompress, getCompressionType } = require('./CompressionFacade');
// c219: url rows. c220: the http_responses + content_storage lifecycle.
// Cache-key generation, TTL policy, compression-preset choice and response
// assembly stay here; only table access moved.
const {
  ensureUrlId,
  insertHttpResponseCacheEntry,
  insertCachedContent,
  findCachedResponse,
  touchCacheEntry,
  deleteExpiredCacheEntries
} = require('news-crawler-db');

// Configuration constants
const CACHE_CONFIG = {
  // Default TTL per category (milliseconds)
  ttl: {
    'webpage': 7 * 24 * 60 * 60 * 1000,     // 7 days for webpage content
    'api-sparql': 24 * 60 * 60 * 1000,     // 1 day for SPARQL results
    'api-wikidata': 24 * 60 * 60 * 1000,   // 1 day for Wikidata API
    'api-restcountries': 7 * 24 * 60 * 60 * 1000, // 7 days for country data
  },

  // Compression presets per category
  compression: {
    'webpage': 'brotli_6',
    'api-sparql': 'gzip_6',
    'api-wikidata': 'gzip_6',
    'api-restcountries': 'gzip_6',
  },

  // Content type mappings
  contentTypes: {
    'webpage': { type: 'html', subtype: null },
    'api-sparql': { type: 'json', subtype: 'sparql-results' },
    'api-wikidata': { type: 'json', subtype: 'wikidata-api' },
    'api-restcountries': { type: 'json', subtype: 'restcountries-api' },
  }
};

class HttpRequestResponseFacade {
  /**
   * Cache an HTTP request/response pair
   *
   * @param {Database} db - Database connection
   * @param {Object} params - Request/response data
   * @param {string} params.url - Request URL
   * @param {Object} [params.request] - Request details
   * @param {string} [params.request.method='GET'] - HTTP method
   * @param {Object} [params.request.headers={}] - Request headers
   * @param {Object} params.response - Response details
   * @param {number} params.response.status - HTTP status code
   * @param {Object} [params.response.headers={}] - Response headers
   * @param {*} params.response.body - Response body content
   * @param {Object} [params.metadata] - Additional metadata
   * @param {string} [params.metadata.category='webpage'] - Cache category
   * @param {number} [params.metadata.ttlMs] - Custom TTL in milliseconds
   * @returns {Promise<Object>} - { httpResponseId, contentId, cacheKey }
   */
  static async cacheHttpResponse(db, {
    url,
    request = {},
    response = {},
    metadata = {}
  }) {
    if (!url || !response.status) {
      throw new Error('URL and response status are required');
    }

    const category = metadata.category || 'webpage';
    const ttlMs = metadata.ttlMs || CACHE_CONFIG.ttl[category] || CACHE_CONFIG.ttl.webpage;
    const cacheKey = this.generateCacheKey(url, request, metadata);

    try {
      // 1. Ensure URL exists in urls table
      const urlId = await this._ensureUrlId(db, url);

      // 2. Insert HTTP response metadata
      const httpResponseId = await this._insertHttpResponse(db, urlId, request, response, category, cacheKey, ttlMs);

      // 3. Store response content with compression
      const contentId = await this._storeContent(db, httpResponseId, response.body, category);

      return { httpResponseId, contentId, cacheKey };
    } catch (error) {
      console.warn('[HttpRequestResponseFacade] Failed to cache response:', error.message);
      throw error;
    }
  }

  /**
   * Retrieve a cached HTTP response
   *
   * @param {Database} db - Database connection
   * @param {string} url - Request URL
   * @param {Object} [options] - Retrieval options
   * @param {Object} [options.request] - Original request details for cache key generation
   * @param {Object} [options.metadata] - Metadata for cache key generation
   * @param {string} [options.category] - Cache category
   * @returns {Promise<Object|null>} - Cached response or null if not found/expired
   */
  static async getCachedHttpResponse(db, url, options = {}) {
    if (!url) {
      throw new Error('URL is required');
    }

    const category = options.category || 'webpage';
    const metadata = { ...options.metadata, category }; // Include category in metadata for key generation
    const cacheKey = this.generateCacheKey(url, options.request || {}, metadata);

    try {
      // Find cached response by cache key and category
      const cached = await this._findCachedResponse(db, cacheKey, category);

      if (!cached || cached.length === 0) {
        // c220: a miss is where the expired rows live — the finder excludes
        // them in SQL, so this is the only point at which they can be seen.
        // Eviction failing must not turn a cache miss into an error.
        try {
          await this._evictExpiredEntries(db, cacheKey, category);
        } catch (evictError) {
          console.warn('[HttpRequestResponseFacade] Failed to evict expired entries:', evictError.message);
        }
        return null;
      }

      const latest = cached[0];

      // Belt-and-braces: the finder already excludes expired rows in SQL.
      if (this._isExpired(latest.cache_expires_at)) {
        await this._evictExpiredEntries(db, cacheKey, category);
        return null;
      }

      // Update hit statistics
      await this._recordCacheHit(db, latest.http_response_id);

      // Assemble and return response
      return await this._assembleResponse(db, latest);
    } catch (error) {
      console.warn('[HttpRequestResponseFacade] Failed to retrieve cached response:', error.message);
      return null;
    }
  }

  /**
   * Generate a deterministic cache key for HTTP requests
   *
   * @param {string} url - Request URL
   * @param {Object} [request={}] - Request details
   * @param {Object} [metadata={}] - Additional metadata
   * @returns {string} - SHA-256 cache key
   */
  static generateCacheKey(url, request = {}, metadata = {}) {
    const components = [url];

    // Include HTTP method if not GET
    if (request.method && request.method !== 'GET') {
      components.push(request.method);
    }

    // Include query parameters if present
    if (request.query) {
      const sortedQuery = Object.keys(request.query)
        .sort()
        .map(key => `${key}=${request.query[key]}`)
        .join('&');
      if (sortedQuery) {
        components.push(sortedQuery);
      }
    }

    // Include SPARQL query for SPARQL requests
    if (metadata.query) {
      components.push(metadata.query);
    }

    // Include sorted entity IDs for Wikidata entity requests
    if (metadata.entityIds && Array.isArray(metadata.entityIds)) {
      components.push(metadata.entityIds.sort().join('|'));
    }

    // Include country for ADM1 requests
    if (metadata.country) {
      components.push(metadata.country);
      if (metadata.regionQids && Array.isArray(metadata.regionQids)) {
        components.push(metadata.regionQids.sort().join('|'));
      }
    }

    // Include category for additional uniqueness
    if (metadata.category) {
      components.push(metadata.category);
    }

    const key = crypto.createHash('sha256')
      .update(components.join('|'))
      .digest('hex');

    return key;
  }

  /**
   * Ensure URL exists in urls table and return its ID
   * @private
   */
  static async _ensureUrlId(db, url) {
    // c219: delegated to ncdb's ensureUrlId, which UrlResolver now also uses
    // — this repo had two url-row writers with different column lists (this
    // one set host + last_seen_at, UrlResolver set neither), against a table
    // with eight insert shapes across the two repos.
    //
    // Two behaviour changes, both deliberate: the host is lowercased, and a
    // malformed url now yields a row with a null host instead of `new URL()`
    // throwing out of a cache write.
    return ensureUrlId(db, url);
  }

  /**
   * Insert HTTP response metadata
   * @private
   */
  static async _insertHttpResponse(db, urlId, request, response, category, cacheKey, ttlMs) {
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();

    const now = new Date().toISOString();

    return insertHttpResponseCacheEntry(db, {
      urlId,
      requestStartedAt: now,
      fetchedAt: now,
      httpStatus: response.status,
      contentType: response.headers?.['content-type'] || null,
      contentEncoding: response.headers?.['content-encoding'] || null,
      etag: response.headers?.etag || null,
      lastModified: response.headers?.['last-modified'] || null,
      bytesDownloaded: response.body ? Buffer.byteLength(JSON.stringify(response.body), 'utf8') : 0,
      requestMethod: request.method || 'GET',
      cacheCategory: category,
      cacheKey,
      cacheCreatedAt: now,
      cacheExpiresAt: expiresAt
    });
  }

  /**
   * Store response content with compression
   * @private
   */
  static async _storeContent(db, httpResponseId, body, category) {
    if (!body) return null;

    const contentStr = typeof body === 'string' ? body : JSON.stringify(body);
    const compressionPreset = CACHE_CONFIG.compression[category] || 'gzip_6';
    const contentTypeInfo = CACHE_CONFIG.contentTypes[category] || { type: 'json', subtype: null };

    // Get compression type from database
    const compressionType = getCompressionType(db, compressionPreset);
    if (!compressionType) {
      throw new Error(`Unknown compression preset: ${compressionPreset}`);
    }

    // Compress the content
    const compressed = compress(contentStr, {
      algorithm: compressionType.algorithm,
      level: compressionType.level
    });

    return insertCachedContent(db, {
      httpResponseId,
      storageType: 'db_inline',
      compressionTypeId: compressionType.id,
      contentBlob: compressed.compressed,
      contentSha256: compressed.sha256,
      uncompressedSize: compressed.uncompressedSize,
      compressedSize: compressed.compressedSize,
      compressionRatio: compressed.ratio,
      contentCategory: category,
      contentSubtype: contentTypeInfo.subtype
    });
  }

  static async _findCachedResponse(db, cacheKey, category) {
    return findCachedResponse(db, cacheKey, category);
  }

  /**
   * Check if cache entry is expired
   * @private
   */
  static _isExpired(expiresAt) {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  }

  /**
   * Record a cache hit (for analytics)
   * @private
   */
  static async _recordCacheHit(db, httpResponseId) {
    // For now, just update the fetched_at timestamp
    // In the future, we could add hit counting
    touchCacheEntry(db, httpResponseId);
  }

  /**
   * Evict expired cache entries for one key + category.
   *
   * c220: this replaces _cleanupExpiredEntry, which was UNREACHABLE. It was
   * called only from the `_isExpired(latest)` branch of
   * getCachedHttpResponse, but _findCachedResponse filters expired rows out
   * in SQL — so `latest` was never expired and nothing was ever evicted. The
   * live db showed the consequence: all 33 cache rows expired, all 33 still
   * present. Eviction now runs on the MISS path, where the expired rows
   * actually are, and is bounded to the key being looked up so it never
   * becomes a full-table sweep.
   * @private
   */
  static async _evictExpiredEntries(db, cacheKey, category) {
    return deleteExpiredCacheEntries(db, cacheKey, category);
  }

  /**
   * Assemble response object from cached data
   * @private
   */
  static async _assembleResponse(db, cached) {
    let body = null;

    if (cached.content_blob && cached.compression_type_id) {
      // Decompress content
      body = decompress(cached.content_blob, cached.algorithm);

      // Parse JSON if it's API content
      if (cached.content_category && cached.content_category.startsWith('api-')) {
        try {
          body = JSON.parse(body);
        } catch (e) {
          // Keep as string if not valid JSON
        }
      }
    }

    return {
      status: cached.http_status,
      headers: {}, // Headers not stored in current schema
      body,
      cached: true,
      category: cached.content_category,
      expiresAt: cached.cache_expires_at
    };
  }
}

/**
 * Instance wrapper for HttpRequestResponseFacade
 * Provides instance-level API that delegates to static methods
 * Used by gazetteer ingestors and other modules that instantiate the facade
 */
class HttpRequestResponseFacadeInstance {
  constructor(dbOrOptions) {
    // Support both `new Facade(db)` and `new Facade({ db })`
    this.db = dbOrOptions && typeof dbOrOptions === 'object' && 'db' in dbOrOptions
      ? dbOrOptions.db
      : dbOrOptions;
    
    if (!this.db) {
      throw new Error('HttpRequestResponseFacadeInstance requires a database connection');
    }
  }

  /**
   * Instance wrapper for cacheHttpResponse
   * @param {Object} params - Same as static method, but db is pre-bound
   */
  async cacheHttpResponse(params) {
    return HttpRequestResponseFacade.cacheHttpResponse(this.db, params);
  }

  /**
   * Instance wrapper for getCachedHttpResponse
   * @param {string|Object} urlOrParams - URL string or params object
   * @param {Object} [options] - Options if first param is URL
   */
  async getCachedHttpResponse(urlOrParams, options) {
    // Support both signatures:
    // - getCachedHttpResponse(url, options)
    // - getCachedHttpResponse({ url, ...options })
    if (typeof urlOrParams === 'string') {
      return HttpRequestResponseFacade.getCachedHttpResponse(this.db, urlOrParams, options);
    } else {
      const { url, ...opts } = urlOrParams;
      return HttpRequestResponseFacade.getCachedHttpResponse(this.db, url, opts);
    }
  }

  /**
   * Generate cache key (delegates to static method)
   */
  generateCacheKey(url, request, metadata) {
    return HttpRequestResponseFacade.generateCacheKey(url, request, metadata);
  }
}

module.exports = { 
  HttpRequestResponseFacade,
  HttpRequestResponseFacadeInstance,
  CACHE_CONFIG 
};