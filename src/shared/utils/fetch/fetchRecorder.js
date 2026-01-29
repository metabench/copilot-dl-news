'use strict';

function createFetchRecorder({ newsDb = null, legacyDb = null, logger = console, source = 'guess-place-hubs' } = {}) {
  let legacyInsertStmtInitialized = false;
  let legacyInsertStmt = null;

  const ensureLegacyStmt = () => {
    if (legacyInsertStmtInitialized) return;
    legacyInsertStmtInitialized = true;
    if (!legacyDb) return;
    try {
      legacyInsertStmt = legacyDb.prepare(`
        INSERT INTO fetches (
          url,
          request_started_at,
          fetched_at,
          http_status,
          content_type,
          content_length,
          content_encoding,
          bytes_downloaded,
          transfer_kbps,
          ttfb_ms,
          download_ms,
          total_ms,
          saved_to_db,
          saved_to_file,
          file_path,
          file_size,
          classification,
          nav_links_count,
          article_links_count,
          word_count,
          analysis,
          host
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
    } catch (error) {
      legacyInsertStmt = null;
      if (logger && typeof logger.warn === 'function') {
        logger.warn(`[fetch-recorder] Failed to prepare legacy fetch insert: ${error?.message || error}`);
      }
    }
  };

  const recordRateLimit = (fetchRow) => {
    if (!newsDb || !fetchRow) return;
    try {
      newsDb.insertError({
        url: fetchRow.url,
        kind: 'rate-limit',
        code: 429,
        message: 'Rate limited fetch recorded by fetch recorder',
        details: { source }
      });
    } catch (error) {
      if (logger && typeof logger.warn === 'function') {
        logger.warn(`[fetch-recorder] Failed to record rate limit telemetry: ${error?.message || error}`);
      }
    }
  };

  const normalizeAnalysis = (analysis, tags) => {
    let base;
    if (analysis) {
      if (typeof analysis === 'string') {
        try { base = JSON.parse(analysis); } catch (_) { base = { raw: analysis }; }
      } else if (typeof analysis === 'object') {
        base = { ...analysis };
      }
    }
    if (!base) base = {};
    if (tags && typeof tags === 'object') {
      base.tags = Array.isArray(base.tags)
        ? Array.from(new Set([...base.tags, ...tags]))
        : Object.values(tags);
      base.meta = { ...(base.meta || {}), ...tags };
    }
    base.source = base.source || source;
    return JSON.stringify(base);
  };

  const recordLegacy = (fetchRow, tags) => {
    ensureLegacyStmt();
    if (!legacyInsertStmt) return;
    try {
      legacyInsertStmt.run(
        fetchRow.url,
        fetchRow.request_started_at || fetchRow.fetched_at || null,
        fetchRow.fetched_at || fetchRow.request_started_at || null,
        fetchRow.http_status || null,
        fetchRow.content_type || null,
        fetchRow.content_length || null,
        fetchRow.content_encoding || null,
        fetchRow.bytes_downloaded || null,
        fetchRow.transfer_kbps || null,
        fetchRow.ttfb_ms || null,
        fetchRow.download_ms || null,
        fetchRow.total_ms || null,
        fetchRow.saved_to_db || null,
        fetchRow.saved_to_file || null,
        fetchRow.file_path || null,
        fetchRow.file_size || null,
        fetchRow.classification || null,
        fetchRow.nav_links_count || null,
        fetchRow.article_links_count || null,
        fetchRow.word_count || null,
        normalizeAnalysis(fetchRow.analysis, tags),
        fetchRow.host || null
      );
    } catch (error) {
      if (logger && typeof logger.warn === 'function') {
        logger.warn(`[fetch-recorder] Failed to insert legacy fetch row for ${fetchRow.url}: ${error?.message || error}`);
      }
    }
  };

  return {
    record(fetchRow, meta = {}) {
      if (!fetchRow || !fetchRow.url) return null;
      const tags = {
        stage: meta.stage || null,
        retryOfId: meta.retryOfId || null,
        cacheHit: meta.cacheHit || false,
        attemptId: meta.attemptId || null
      };

      if (meta.cacheHit) {
        fetchRow.classification = fetchRow.classification || 'cache-hit';
      }
      if (!fetchRow.analysis) {
        fetchRow.analysis = JSON.stringify({ source, ...tags });
      } else {
        fetchRow.analysis = normalizeAnalysis(fetchRow.analysis, tags);
      }

      let httpResponseId = null;
      if (newsDb && typeof newsDb.insertFetch === 'function') {
        try {
          httpResponseId = newsDb.insertFetch(fetchRow);
        } catch (error) {
          if (logger && typeof logger.warn === 'function') {
            logger.warn(`[fetch-recorder] Failed to insert normalized fetch for ${fetchRow.url}: ${error?.message || error}`);
          }
        }
      }

      recordLegacy(fetchRow, tags);

      if (Number(fetchRow.http_status) === 429) {
        recordRateLimit(fetchRow);
      }

      return httpResponseId;
    }
  };
}

module.exports = {
  createFetchRecorder
};
