'use strict';

function assertDatabase(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createAnalysePagesCoreQueries requires a better-sqlite3 database handle');
  }
}

function createAnalysePagesCoreQueries(db) {
  assertDatabase(db);

  const optionalErrors = Object.create(null);

  const pendingAnalysesStmt = db.prepare(`
    SELECT
      ca.id AS analysis_id,
      ca.content_id AS content_id,
      ca.analysis_json AS existing_analysis,
      ca.analysis_version AS existing_version,
      ca.title AS title,
      ca.section AS section,
      ca.word_count AS word_count,
      ca.article_xpath AS article_xpath,
      ca.classification AS classification,
      ca.nav_links_count AS nav_links_count,
      ca.article_links_count AS article_links_count,
      u.url AS url,
      u.host AS host,
      u.canonical_url AS canonical_url,
      hr.id AS http_response_id,
      hr.http_status AS http_status,
      hr.content_type AS content_type,
      hr.fetched_at AS fetched_at,
      cs.storage_type AS storage_type,
      cs.content_blob AS content_blob,
      cs.compression_type_id AS compression_type_id,
      cs.compression_bucket_id AS compression_bucket_id,
      cs.bucket_entry_key AS bucket_entry_key,
      cs.uncompressed_size AS uncompressed_size,
      cs.compressed_size AS compressed_size,
      cs.compression_ratio AS compression_ratio,
      ct.algorithm AS compression_algorithm,
      ct.name AS compression_type_name
    FROM content_analysis ca
    JOIN content_storage cs ON ca.content_id = cs.id
    JOIN http_responses hr ON cs.http_response_id = hr.id
    JOIN urls u ON hr.url_id = u.id
    LEFT JOIN compression_types ct ON cs.compression_type_id = ct.id
    WHERE (
      ca.analysis_json IS NULL
      OR ca.analysis_version IS NULL
      OR ca.analysis_version < ?
    )
    AND (ca.classification IS NULL OR ca.classification IN ('article','nav'))
    ORDER BY hr.fetched_at DESC
    LIMIT ?
  `);

  const compressionBucketStmt = (() => {
    try {
      return db.prepare(`
        SELECT cb.bucket_blob, cb.index_json, ct.algorithm
          FROM compression_buckets cb
          JOIN compression_types ct ON cb.compression_type_id = ct.id
         WHERE cb.id = ?
      `);
    } catch (error) {
      optionalErrors.compressionBucket = error;
      return null;
    }
  })();

  const updateAnalysisStmt = db.prepare(`
    UPDATE content_analysis
       SET analysis_json = @analysis_json,
           analysis_version = @analysis_version,
           analyzed_at = datetime('now'),
           word_count = @word_count,
           article_xpath = @article_xpath
     WHERE id = @analysis_id
  `);

  const placeHubInsertStmt = db.prepare(`
    INSERT OR IGNORE INTO place_hubs(
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?)
  `);

  const placeHubUpdateStmt = db.prepare(`
    UPDATE place_hubs
       SET place_slug = COALESCE(?, place_slug),
           place_kind = COALESCE(?, place_kind),
           topic_slug = COALESCE(?, topic_slug),
           topic_label = COALESCE(?, topic_label),
           topic_kind = COALESCE(?, topic_kind),
           title = COALESCE(?, title),
           last_seen_at = datetime('now'),
           nav_links_count = COALESCE(?, nav_links_count),
           article_links_count = COALESCE(?, article_links_count),
           evidence = COALESCE(?, evidence)
     WHERE url = ?
  `);

  const placeHubUnknownTermStmt = (() => {
    try {
      return db.prepare(`
        INSERT INTO place_hub_unknown_terms(
          host,
          url,
          canonical_url,
          term_slug,
          term_label,
          source,
          reason,
          confidence,
          evidence,
          occurrences,
          first_seen_at,
          last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
        ON CONFLICT(host, canonical_url, term_slug) DO UPDATE SET
          term_label = COALESCE(excluded.term_label, term_label),
          source = COALESCE(excluded.source, source),
          reason = COALESCE(excluded.reason, reason),
          confidence = COALESCE(excluded.confidence, confidence),
          evidence = COALESCE(excluded.evidence, evidence),
          occurrences = occurrences + 1,
          last_seen_at = datetime('now')
      `);
    } catch (_) {
      return null;
    }
  })();

  const selectHubByUrlStmt = (() => {
    try {
      return db.prepare('SELECT id, place_slug, topic_slug, topic_label FROM place_hubs WHERE url = ?');
    } catch (_) {
      return null;
    }
  })();

  function getPendingAnalyses(analysisVersion, limit) {
    const normalizedLimit = Number.isFinite(limit) && limit > 0 ? limit : 9999999;
    return pendingAnalysesStmt.all(analysisVersion, normalizedLimit);
  }

  function hasCompressionBucketSupport() {
    return Boolean(compressionBucketStmt);
  }

  function getCompressionBucketById(bucketId) {
    if (!compressionBucketStmt) return null;
    return compressionBucketStmt.get(bucketId) || null;
  }

  function updateAnalysis(payload) {
    return updateAnalysisStmt.run(payload);
  }

  function savePlaceHub({
    host,
    url,
    placeSlug,
    placeKind,
    topicSlug,
    topicLabel,
    topicKind,
    title,
    navLinksCount,
    articleLinksCount,
    evidenceJson
  }) {
    placeHubInsertStmt.run(
      host,
      url,
      placeSlug,
      placeKind,
      topicSlug,
      topicLabel,
      topicKind,
      title,
      navLinksCount,
      articleLinksCount,
      evidenceJson
    );

    placeHubUpdateStmt.run(
      placeSlug,
      placeKind,
      topicSlug,
      topicLabel,
      topicKind,
      title,
      navLinksCount,
      articleLinksCount,
      evidenceJson,
      url
    );
    return true;
  }

  function saveUnknownTerm({
    host,
    url,
    canonicalUrl,
    termSlug,
    termLabel,
    source,
    reason,
    confidence,
    evidence
  }) {
    if (!placeHubUnknownTermStmt) return false;
    placeHubUnknownTermStmt.run(
      host,
      url,
      canonicalUrl,
      termSlug,
      termLabel,
      source,
      reason,
      confidence,
      evidence
    );
    return true;
  }

  function getPlaceHubByUrl(url) {
    if (!selectHubByUrlStmt) return null;
    return selectHubByUrlStmt.get(url) || null;
  }

  function getOptionalErrors() {
    return { ...optionalErrors };
  }

  return {
    getPendingAnalyses,
    hasCompressionBucketSupport,
    getCompressionBucketById,
    updateAnalysis,
    savePlaceHub,
    saveUnknownTerm,
    getPlaceHubByUrl,
    getOptionalErrors
  };
}

module.exports = { createAnalysePagesCoreQueries };
