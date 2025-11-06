/**
 * src/db/sqlite/v1/ArticleOperations.js
 *
 * Article-related database operations.
 * Separated from main NewsDatabase class to reduce complexity.
 */

const { ensureUrlId } = require('../urlHelpers');

class ArticleOperations {
  constructor(db, statements, utilities) {
    this.db = db;
    this.statements = statements;
    this.utilities = utilities;
  }

  /**
   * Upsert article data
   */
  upsertArticle(article, options = {}) {
    const { compress = true, compressionType = 'brotli_6', useCase = 'balanced' } = options;

    // Extract host from URL if not provided
    let host = article.host;
    if (!host && article.url) {
      try {
        const u = new URL(article.url);
        host = u.hostname.toLowerCase();
      } catch (_) {
        host = null;
      }
    }

    const withDefaults = {
      host,
      title: null,
      date: null,
      section: null,
      html: null,
      crawled_at: new Date().toISOString(),
      canonical_url: null,
      referrer_url: null,
      discovered_at: null,
      crawl_depth: null,
      fetched_at: null,
      request_started_at: null,
      http_status: null,
      content_type: null,
      content_length: null,
      etag: null,
      last_modified: null,
      redirect_chain: null,
      ttfb_ms: null,
      download_ms: null,
      total_ms: null,
      bytes_downloaded: null,
      transfer_kbps: null,
      html_sha256: null,
      text: null,
      word_count: null,
      language: null,
      article_xpath: null,
      analysis: null,
      ...article
    };

    // Write to normalized schema only (Phase 5: normalized-only)
    const result = this._writeToNormalizedSchema(withDefaults, { compress, compressionType, useCase });
    if (!result) {
      console.warn('[upsertArticle] Failed to write to normalized schema for:', withDefaults.url);
      return null;
    }

    // Upsert domain row based on URL host
    if (host) {
      try {
        this.upsertDomain(host);
        // Ensure urls.host is populated for this url
        try { this.db.prepare(`UPDATE urls SET host = ? WHERE url = ?`).run(host, withDefaults.url); } catch (_) {}
      } catch (_) {}
    }

    return result;
  }

  /**
   * Write article data to normalized schema tables
   */
  _writeToNormalizedSchema(article, options = {}) {
    const { compress = true, compressionType = 'brotli_6', useCase = 'balanced' } = options;

    try {
      // 1. Ensure URL exists and get its ID
      const urlId = this._ensureUrlId(article.url);
      if (!urlId) {
        console.warn('[normalized-write] Failed to ensure URL:', article.url);
        return null;
      }

      // 2. Insert HTTP response (if we have HTTP data)
      let httpResponseId = null;
      if (article.fetched_at || article.http_status || article.content_type) {
        httpResponseId = this._insertHttpResponse({
          url_id: urlId,
          request_started_at: article.request_started_at || article.fetched_at || new Date().toISOString(),
          fetched_at: article.fetched_at,
          http_status: article.http_status,
          content_type: article.content_type,
          content_encoding: null, // Not available in legacy data
          etag: article.etag,
          last_modified: article.last_modified,
          redirect_chain: article.redirect_chain ? JSON.stringify(article.redirect_chain) : null,
          ttfb_ms: article.ttfb_ms,
          download_ms: article.download_ms,
          total_ms: article.total_ms,
          bytes_downloaded: article.bytes_downloaded,
          transfer_kbps: article.transfer_kbps
        });
        if (!httpResponseId) {
          console.warn('[normalized-write] Failed to insert HTTP response for:', article.url);
          return null;
        }
      }

      // 3. Store content (compressed or inline storage)
      let contentId = null;
      if (article.html) {
        if (compress) {
          // Compress content before storing
          const { compressAndStore } = require('../../../utils/CompressionFacade');
          const result = compressAndStore(this.db, article.html, {
            compressionType,
            useCase,
            httpResponseId
          });
          contentId = result.contentId;
        } else {
          // Store uncompressed content inline
          contentId = this._insertContentStorage({
            http_response_id: httpResponseId,
            storage_type: 'db_inline',
            compression_type_id: null, // No compression
            compression_bucket_id: null,
            bucket_entry_key: null,
            content_blob: article.html,
            content_sha256: article.html_sha256,
            uncompressed_size: Buffer.byteLength(article.html, 'utf8'),
            compressed_size: null,
            compression_ratio: null,
            file_path: null
          });
        }
        if (!contentId) {
          console.warn('[normalized-write] Failed to store content for:', article.url);
          return null;
        }
      }

      // 4. Insert content analysis
      let analysisId = null;
      if (contentId && (article.title || article.word_count || article.language)) {
        analysisId = this._insertContentAnalysis({
          content_id: contentId,
          analysis_version: 1,
          classification: 'article', // Assume article for normalized writes
          title: article.title,
          date: article.date,
          section: article.section,
          word_count: article.word_count,
          language: article.language,
          article_xpath: article.article_xpath,
          nav_links_count: null, // Not available in legacy data
          article_links_count: null, // Not available in legacy data
          analysis_json: article.analysis
        });
      }

      // 5. Insert discovery event (if we have discovery metadata)
      let discoveryId = null;
      if (article.referrer_url || article.discovered_at || article.crawl_depth !== null) {
        discoveryId = this._insertDiscoveryEvent({
          url_id: urlId,
          discovered_at: article.discovered_at || article.crawled_at,
          referrer_url: article.referrer_url,
          crawl_depth: article.crawl_depth,
          discovery_method: 'crawl', // Assume crawl for normalized writes
          crawl_job_id: null // Not available in legacy data
        });
      }

      return {
        success: true,
        urlId,
        httpResponseId,
        contentId,
        analysisId,
        discoveryId
      };
    } catch (error) {
      console.warn('[normalized-write] Error writing to normalized schema:', error?.message || error);
      return null;
    }
  }

  /**
   * Ensure URL exists in urls table and return its ID
   */
  _ensureUrlId(url) {
    if (!url) return null;

    try {
      return ensureUrlId(this.db, url);
    } catch (error) {
      console.warn(`[dual-write] Failed to ensure URL ${url}:`, error?.message || error);
      return null;
    }
  }

  /**
   * Insert HTTP response data
   */
  _insertHttpResponse(httpData) {
    try {
      const result = this.db.prepare(`
        INSERT INTO http_responses (
          url_id, request_started_at, fetched_at, http_status, content_type,
          content_encoding, etag, last_modified, redirect_chain,
          ttfb_ms, download_ms, total_ms, bytes_downloaded, transfer_kbps
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        httpData.url_id,
        httpData.request_started_at,
        httpData.fetched_at,
        httpData.http_status,
        httpData.content_type,
        httpData.content_encoding,
        httpData.etag,
        httpData.last_modified,
        httpData.redirect_chain,
        httpData.ttfb_ms,
        httpData.download_ms,
        httpData.total_ms,
        httpData.bytes_downloaded,
        httpData.transfer_kbps
      );

      return result.lastInsertRowid;
    } catch (err) {
      console.warn('[dual-write] Failed to insert HTTP response:', err?.message || err);
      return null;
    }
  }

  /**
   * Insert content storage data
   */
  _insertContentStorage(contentData) {
    try {
      const result = this.db.prepare(`
        INSERT INTO content_storage (
          http_response_id, storage_type, compression_type_id, compression_bucket_id,
          bucket_entry_key, content_blob, content_sha256, uncompressed_size,
          compressed_size, compression_ratio
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        contentData.http_response_id,
        contentData.storage_type,
        contentData.compression_type_id,
        contentData.compression_bucket_id,
        contentData.bucket_entry_key,
        contentData.content_blob,
        contentData.content_sha256,
        contentData.uncompressed_size,
        contentData.compressed_size,
        contentData.compression_ratio
      );

      return result.lastInsertRowid;
    } catch (err) {
      console.warn('[dual-write] Failed to insert content storage:', err?.message || err);
      return null;
    }
  }

  /**
   * Insert content analysis data
   */
  _insertContentAnalysis(analysisData) {
    try {
      const result = this.db.prepare(`
        INSERT INTO content_analysis (
          content_id, analysis_version, classification, title, date, section,
          word_count, language, article_xpath, nav_links_count, article_links_count,
          analysis_json, analyzed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        analysisData.content_id,
        analysisData.analysis_version,
        analysisData.classification,
        analysisData.title,
        analysisData.date,
        analysisData.section,
        analysisData.word_count,
        analysisData.language,
        analysisData.article_xpath,
        analysisData.nav_links_count,
        analysisData.article_links_count,
        analysisData.analysis_json
      );

      return result.lastInsertRowid;
    } catch (err) {
      console.warn('[dual-write] Failed to insert content analysis:', err?.message || err);
      return null;
    }
  }

  /**
   * Insert discovery event data
   */
  _insertDiscoveryEvent(discoveryData) {
    try {
      const result = this.db.prepare(`
        INSERT INTO discovery_events (
          url_id, discovered_at, referrer_url, crawl_depth, discovery_method, crawl_job_id
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        discoveryData.url_id,
        discoveryData.discovered_at,
        discoveryData.referrer_url,
        discoveryData.crawl_depth,
        discoveryData.discovery_method,
        discoveryData.crawl_job_id
      );

      return result.lastInsertRowid;
    } catch (err) {
      console.warn('[dual-write] Failed to insert discovery event:', err?.message || err);
      return null;
    }
  }

  /**
   * Upsert domain
   */
  upsertDomain(host, analysis = null) {
    if (!host) return;
    const now = new Date().toISOString();
    const esc = (s) => s.replace(/'/g, "''");
    const tld = host.includes('.') ? host.split('.').slice(-1)[0] : host;
    this.db.exec(`
      INSERT OR IGNORE INTO domains(host, tld, created_at, last_seen_at, analysis)
      VALUES ('${esc(host)}', '${esc(tld)}', '${now}', '${now}', ${analysis ? `'${esc(analysis)}'` : 'NULL'});
      UPDATE domains SET last_seen_at='${now}' WHERE host='${esc(host)}';
      UPDATE domains SET analysis=COALESCE(${analysis ? `'${esc(analysis)}'` : 'NULL'}, analysis) WHERE host='${esc(host)}';
    `);
  }
}

module.exports = { ArticleOperations };