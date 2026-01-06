'use strict';

const { compress, decompress } = require('../../../utils/compression');
const { createAnalysePagesCoreQueries } = require('./queries/analysis.analysePagesCore');
const {
  ensureArticleXPathPatternSchema,
  getArticleXPathPatternsForDomain,
  upsertArticleXPathPattern,
  recordArticleXPathPatternUsage,
  getArticleXPathPatternCount,
  normalizePatternDomain,
  getTopDomains
} = require('./queries/articleXPathPatterns');

class PostgresNewsDatabase {
  constructor(pool) {
    if (!pool) {
      throw new Error('PostgresNewsDatabase constructor requires a pg.Pool instance');
    }
    this.pool = pool;
    
    // Cache for compression types to avoid repeated DB lookups
    this.compressionTypesCache = null;
  }

  async close() {
    await this.pool.end();
  }

  getHandle() {
    return this.pool;
  }

  createAnalysePagesCoreQueries() {
    return createAnalysePagesCoreQueries(this.pool);
  }

  createArticleXPathPatternQueries() {
    return {
      ensureArticleXPathPatternSchema: (opts) => ensureArticleXPathPatternSchema(this.pool, opts),
      getArticleXPathPatternsForDomain: (domain, opts) => getArticleXPathPatternsForDomain(this.pool, domain, opts),
      upsertArticleXPathPattern: (pattern) => upsertArticleXPathPattern(this.pool, pattern),
      recordArticleXPathPatternUsage: (domain, xpath, opts) => recordArticleXPathPatternUsage(this.pool, domain, xpath, opts),
      getArticleXPathPatternCount: () => getArticleXPathPatternCount(this.pool),
      normalizePatternDomain,
      getTopDomains: (limit) => getTopDomains(this.pool, limit)
    };
  }

  async _init() {
    // No-op, schema handled by ensureDb
  }

  // ---------------------------------------------------------------------------
  // Core Article Operations
  // ---------------------------------------------------------------------------

  /**
   * Upsert article data.
   * This is a complex operation that touches multiple tables:
   * urls, http_responses, content_storage, content_analysis, discovery_events.
   */
  async upsertArticle(article, options = {}) {
    const { compress: shouldCompress = true, compressionType = 'brotli_6', useCase = 'balanced' } = options;
    
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Ensure URL exists
      let urlId;
      const urlRes = await client.query(`
        INSERT INTO urls (url, first_seen_at, last_seen_at)
        VALUES ($1, $2, $2)
        ON CONFLICT (url) DO UPDATE SET last_seen_at = $2
        RETURNING id
      `, [article.url, article.crawled_at || new Date().toISOString()]);
      
      if (urlRes.rows.length > 0) {
        urlId = urlRes.rows[0].id;
      } else {
        // If ON CONFLICT DO UPDATE doesn't return row (it should in Postgres), fetch it
        const fetchRes = await client.query('SELECT id FROM urls WHERE url = $1', [article.url]);
        urlId = fetchRes.rows[0].id;
      }

      // Update host in urls table if available
      if (article.host) {
        await client.query('UPDATE urls SET host = $1 WHERE id = $2', [article.host, urlId]);
        // Also upsert domain
        const tld = article.host.includes('.') ? article.host.split('.').pop() : article.host;
        const now = new Date().toISOString();
        await client.query(`
          INSERT INTO domains (host, tld, created_at, last_seen_at)
          VALUES ($1, $2, $3, $3)
          ON CONFLICT (host) DO UPDATE SET last_seen_at = $3
        `, [article.host, tld, now]);
      }

      // 2. Insert HTTP Response
      let httpResponseId = null;
      if (article.fetched_at || article.http_status || article.content_type) {
        const httpRes = await client.query(`
          INSERT INTO http_responses (
            url_id, request_started_at, fetched_at, http_status, content_type,
            etag, last_modified, redirect_chain,
            ttfb_ms, download_ms, total_ms, bytes_downloaded, transfer_kbps
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id
        `, [
          urlId,
          article.request_started_at || article.fetched_at || new Date().toISOString(),
          article.fetched_at,
          article.http_status,
          article.content_type,
          article.etag,
          article.last_modified,
          article.redirect_chain ? JSON.stringify(article.redirect_chain) : null,
          article.ttfb_ms,
          article.download_ms,
          article.total_ms,
          article.bytes_downloaded,
          article.transfer_kbps
        ]);
        httpResponseId = httpRes.rows[0].id;
      }

      // 3. Store Content
      let contentId = null;
      if (article.html) {
        // Get compression type info
        const compType = await this._getCompressionType(client, compressionType); // Helper method
        
        let contentBlob = article.html;
        let storageType = 'db_inline';
        let compTypeId = null;
        let uncompressedSize = Buffer.byteLength(article.html);
        let compressedSize = uncompressedSize;
        let ratio = 1.0;
        let sha256 = null; // Calculate if needed

        if (shouldCompress && compType.algorithm !== 'none') {
           const compressed = compress(article.html, {
             algorithm: compType.algorithm,
             level: compType.level,
             windowBits: compType.window_bits,
             blockBits: compType.block_bits
           });
           contentBlob = compressed.compressed;
           storageType = 'db_compressed';
           compTypeId = compType.id;
           uncompressedSize = compressed.uncompressedSize;
           compressedSize = compressed.compressedSize;
           ratio = compressed.ratio;
           sha256 = compressed.sha256;
        } else {
           // Calculate SHA256 for uncompressed
           const crypto = require('crypto');
           sha256 = crypto.createHash('sha256').update(article.html).digest('hex');
        }

        const contentRes = await client.query(`
          INSERT INTO content_storage (
            http_response_id, storage_type, compression_type_id,
            content_blob, content_sha256, uncompressed_size,
            compressed_size, compression_ratio
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `, [
          httpResponseId,
          storageType,
          compTypeId,
          contentBlob,
          sha256,
          uncompressedSize,
          compressedSize,
          ratio
        ]);
        contentId = contentRes.rows[0].id;
      }

      // 4. Insert Content Analysis
      let analysisId = null;
      if (contentId && (article.title || article.word_count || article.language)) {
        const analysisRes = await client.query(`
          INSERT INTO content_analysis (
            content_id, analysis_version, classification, title, date, section,
            word_count, language, article_xpath, nav_links_count, article_links_count,
            analysis_json, analyzed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
          RETURNING id
        `, [
          contentId,
          1, // analysis_version
          'article', // classification
          article.title,
          article.date,
          article.section,
          article.word_count,
          article.language,
          article.article_xpath,
          null, // nav_links_count
          null, // article_links_count
          article.analysis // analysis_json
        ]);
        analysisId = analysisRes.rows[0].id;
      }

      // 5. Insert Discovery Event
      if (article.referrer_url || article.discovered_at || article.crawl_depth !== null) {
        await client.query(`
          INSERT INTO discovery_events (
            url_id, discovered_at, referrer_url, crawl_depth, discovery_method
          ) VALUES ($1, $2, $3, $4, $5)
        `, [
          urlId,
          article.discovered_at || article.crawled_at,
          article.referrer_url,
          article.crawl_depth,
          'crawl'
        ]);
      }

      await client.query('COMMIT');
      
      return {
        success: true,
        urlId,
        httpResponseId,
        contentId,
        analysisId
      };

    } catch (e) {
      await client.query('ROLLBACK');
      console.error('Error in upsertArticle:', e);
      throw e;
    } finally {
      client.release();
    }
  }

  async getArticleByUrl(url, accessContext = null) {
    const res = await this.pool.query('SELECT * FROM urls WHERE url = $1', [url]);
    const result = res.rows[0];
    if (result && accessContext) {
      this._recordAccess(result.id, accessContext);
    }
    return result;
  }

  async hasUrl(url) {
    if (!url) return false;
    const res = await this.pool.query('SELECT 1 FROM urls WHERE url = $1', [url]);
    return res.rowCount > 0;
  }

  // ---------------------------------------------------------------------------
  // URL & Domain Helpers
  // ---------------------------------------------------------------------------

  async upsertUrl(url, canonical = null, analysis = null) {
    const now = new Date().toISOString();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      await client.query(`
        INSERT INTO urls (url, canonical_url, created_at, last_seen_at, analysis)
        VALUES ($1, $2, $3, $3, $4)
        ON CONFLICT (url) DO UPDATE SET
          last_seen_at = $3,
          canonical_url = COALESCE($2, urls.canonical_url),
          analysis = COALESCE($4, urls.analysis)
      `, [url, canonical, now, analysis]);

      try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase();
        await client.query('UPDATE urls SET host = $1 WHERE url = $2', [host, url]);
      } catch (_) {}

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async upsertDomain(host, analysis = null) {
    if (!host) return;
    const now = new Date().toISOString();
    const tld = host.includes('.') ? host.split('.').slice(-1)[0] : host;
    
    await this.pool.query(`
      INSERT INTO domains (host, tld, created_at, last_seen_at, analysis)
      VALUES ($1, $2, $3, $3, $4)
      ON CONFLICT (host) DO UPDATE SET
        last_seen_at = $3,
        analysis = COALESCE($4, domains.analysis)
    `, [host, tld, now, analysis]);
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  async getSetting(key, fallback = null) {
    if (!key) return fallback;
    const res = await this.pool.query('SELECT value FROM crawler_settings WHERE key = $1', [key]);
    return res.rows[0] ? res.rows[0].value : fallback;
  }

  async setSetting(key, value) {
    if (!key) return false;
    const val = value != null ? String(value) : null;
    await this.pool.query(`
      INSERT INTO crawler_settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = $2,
        updated_at = NOW()
    `, [key, val]);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Analysis Queue
  // ---------------------------------------------------------------------------

  async getArticlesNeedingAnalysis(limit = 100) {
    // This query finds content that hasn't been analyzed yet
    // It joins content_storage with content_analysis (LEFT JOIN)
    // and filters where content_analysis.id IS NULL
    const res = await this.pool.query(`
      SELECT 
        cs.id as content_id,
        cs.content_blob,
        cs.compression_type_id,
        ct.algorithm,
        u.url,
        hr.fetched_at
      FROM content_storage cs
      JOIN http_responses hr ON cs.http_response_id = hr.id
      JOIN urls u ON hr.url_id = u.id
      LEFT JOIN compression_types ct ON cs.compression_type_id = ct.id
      LEFT JOIN content_analysis ca ON cs.id = ca.content_id
      WHERE ca.id IS NULL
      LIMIT $1
    `, [limit]);

    // Decompress content before returning
    return res.rows.map(row => {
      let content = row.content_blob;
      if (row.algorithm && row.algorithm !== 'none') {
        try {
          content = decompress(row.content_blob, row.algorithm);
          // Convert buffer to string
          content = content.toString('utf8');
        } catch (e) {
          console.error(`Failed to decompress content ${row.content_id}:`, e);
          content = null;
        }
      } else if (Buffer.isBuffer(content)) {
        content = content.toString('utf8');
      }

      return {
        contentId: row.content_id,
        url: row.url,
        html: content,
        fetchedAt: row.fetched_at
      };
    });
  }

  async countArticlesNeedingAnalysis() {
    const res = await this.pool.query(`
      SELECT COUNT(*) as count
      FROM content_storage cs
      LEFT JOIN content_analysis ca ON cs.id = ca.content_id
      WHERE ca.id IS NULL
    `);
    return parseInt(res.rows[0].count, 10);
  }

  // ---------------------------------------------------------------------------
  // Task Queue
  // ---------------------------------------------------------------------------
  
  async createTask(type, params = {}) {
    const res = await this.pool.query(`
      INSERT INTO task_queue (type, params, status, created_at, updated_at)
      VALUES ($1, $2, 'pending', NOW(), NOW())
      RETURNING id
    `, [type, JSON.stringify(params)]);
    return res.rows[0].id;
  }
  
  async getTaskById(id) {
    const res = await this.pool.query('SELECT * FROM task_queue WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      ...row,
      params: JSON.parse(row.params),
      result: row.result ? JSON.parse(row.result) : null,
      error: row.error ? JSON.parse(row.error) : null
    };
  }

  /**
   * Record a place hub seed
   * @param {Object} params - { host, url, evidence }
   * @returns {Promise<boolean>}
   */
  async recordPlaceHubSeed({ host, url, evidence = null } = {}) {
    if (!host || !url) return false;

    let payload = evidence;
    if (payload != null && typeof payload !== 'string') {
      try {
        payload = JSON.stringify(payload);
      } catch (_) {
        payload = null;
      }
    }

    const query = `
      INSERT INTO place_hubs(
        host,
        url,
        place_slug,
        place_kind,
        topic_slug,
        topic_label,
        topic_kind,
        title,
        first_seen_at,
        last_seen_at,
        nav_links_count,
        article_links_count,
        evidence
      ) VALUES (
        $1,
        $2,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NOW(),
        NOW(),
        NULL,
        NULL,
        $3
      )
      ON CONFLICT (url) DO NOTHING
    `;

    try {
      const result = await this.pool.query(query, [host, url, payload]);
      return (result.rowCount || 0) > 0;
    } catch (err) {
      console.error('[Postgres] recordPlaceHubSeed error:', err);
      return false;
    }
  }

  /**
   * Get known hub seeds for a host
   * @param {string} host
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async getKnownHubSeeds(host, limit = 50) {
    if (!host) return [];
    const safeLimit = Math.max(1, Math.min(500, parseInt(limit, 10) || 50));
    const normalizedHost = host.trim().toLowerCase();

    // Try view first, then table
    const queries = [
      `SELECT host, url, evidence, last_seen_at as "lastSeenAt"
       FROM place_hubs_with_urls
       WHERE LOWER(host) = $1
       ORDER BY last_seen_at DESC
       LIMIT $2`,
      `SELECT host, url, evidence, last_seen_at as "lastSeenAt"
       FROM place_hubs
       WHERE LOWER(host) = $1
       ORDER BY last_seen_at DESC
       LIMIT $2`
    ];

    for (const sql of queries) {
      try {
        const res = await this.pool.query(sql, [normalizedHost, safeLimit]);
        return res.rows.map(row => ({
          ...row,
          evidence: typeof row.evidence === 'string' ? JSON.parse(row.evidence) : row.evidence
        }));
      } catch (err) {
        // Ignore error (likely view doesn't exist) and try next
        if (sql === queries[queries.length - 1]) {
           console.warn('[Postgres] getKnownHubSeeds failed:', err.message);
        }
      }
    }
    return [];
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------

  async _recordAccess(articleId, accessContext = null) {
    if (!articleId || !accessContext) return;
    // Optional logging, skip for now or implement later
  }

  // Helper to get compression type
  async _getCompressionType(client, typeName) {
    if (!this.compressionTypesCache) {
      const res = await client.query('SELECT * FROM compression_types');
      this.compressionTypesCache = {};
      res.rows.forEach(row => {
        this.compressionTypesCache[row.name] = row;
      });
    }
    
    const type = this.compressionTypesCache[typeName];
    if (!type) {
      // Fallback to gzip_6 if not found
      return this.compressionTypesCache['gzip_6'] || { algorithm: 'gzip', level: 6 };
    }
    return type;
  }
}

module.exports = PostgresNewsDatabase;
