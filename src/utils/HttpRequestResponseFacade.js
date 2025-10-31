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
        return null;
      }

      const latest = cached[0];

      // Check if expired
      if (this._isExpired(latest.cache_expires_at)) {
        // Optionally clean up expired entries
        await this._cleanupExpiredEntry(db, latest.http_response_id);
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
    // Try to get existing URL ID
    let urlRow = db.prepare('SELECT id FROM urls WHERE url = ?').get(url);
    if (urlRow) return urlRow.id;

    // URL doesn't exist, insert it
    const urlObj = new URL(url);
    const result = db.prepare(`
      INSERT INTO urls (url, host, created_at, last_seen_at)
      VALUES (?, ?, datetime('now'), datetime('now'))
    `).run(url, urlObj.hostname);

    return result.lastInsertRowid;
  }

  /**
   * Insert HTTP response metadata
   * @private
   */
  static async _insertHttpResponse(db, urlId, request, response, category, cacheKey, ttlMs) {
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();

    const result = db.prepare(`
      INSERT INTO http_responses (
        url_id, request_started_at, fetched_at, http_status, content_type,
        content_encoding, etag, last_modified, redirect_chain,
        ttfb_ms, download_ms, total_ms, bytes_downloaded, transfer_kbps,
        request_method,
        cache_category, cache_key, cache_created_at, cache_expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      urlId,
      new Date().toISOString(), // request_started_at
      new Date().toISOString(), // fetched_at
      response.status,
      response.headers?.['content-type'] || null,
      response.headers?.['content-encoding'] || null,
      response.headers?.etag || null,
      response.headers?.['last-modified'] || null,
      null, // redirect_chain
      null, // ttfb_ms
      null, // download_ms
      null, // total_ms
      response.body ? Buffer.byteLength(JSON.stringify(response.body), 'utf8') : 0,
      null, // transfer_kbps
      request.method || 'GET',
      category,
      cacheKey,
      new Date().toISOString(),
      expiresAt
    );

    return result.lastInsertRowid;
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

    const result = db.prepare(`
      INSERT INTO content_storage (
        http_response_id, storage_type, compression_type_id,
        bucket_entry_key, content_blob, content_sha256,
        uncompressed_size, compressed_size, compression_ratio,
        content_category, content_subtype
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      httpResponseId,
      'db_inline',
      compressionType.id,
      null, // bucket_entry_key
      compressed.compressed,
      compressed.sha256,
      compressed.uncompressedSize,
      compressed.compressedSize,
      compressed.ratio,
      category,
      contentTypeInfo.subtype
    );

    return result.lastInsertRowid;
  }

  static async _findCachedResponse(db, cacheKey, category) {
    const result = db.prepare(`
      SELECT
        hr.id as http_response_id,
        hr.http_status,
        hr.content_type,
        hr.cache_expires_at,
        cs.content_blob,
        cs.compression_type_id,
        cs.uncompressed_size,
        cs.compressed_size,
        cs.content_category,
        ct.algorithm
      FROM http_responses hr
      LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
      LEFT JOIN compression_types ct ON cs.compression_type_id = ct.id
      WHERE hr.cache_key = ? AND hr.cache_category = ? AND hr.cache_expires_at > datetime('now')
      ORDER BY hr.fetched_at DESC
    `).all(cacheKey, category);

    return result;
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
    db.prepare(`
      UPDATE http_responses
      SET fetched_at = datetime('now')
      WHERE id = ?
    `).run(httpResponseId);
  }

  /**
   * Clean up expired cache entry
   * @private
   */
  static async _cleanupExpiredEntry(db, httpResponseId) {
    // Remove content storage
    db.prepare('DELETE FROM content_storage WHERE http_response_id = ?').run(httpResponseId);
    // Remove HTTP response
    db.prepare('DELETE FROM http_responses WHERE id = ?').run(httpResponseId);
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

module.exports = { HttpRequestResponseFacade, CACHE_CONFIG };