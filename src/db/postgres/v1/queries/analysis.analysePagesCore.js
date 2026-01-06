'use strict';

function assertDatabase(pool) {
  if (!pool || typeof pool.query !== 'function') {
    throw new Error('createAnalysePagesCoreQueries requires a pg.Pool instance');
  }
}

function createAnalysePagesCoreQueries(pool) {
  assertDatabase(pool);

  const optionalErrors = Object.create(null);

  async function getPendingAnalyses(analysisVersion, limit) {
    const normalizedLimit = Number.isFinite(limit) && limit > 0 ? limit : 9999999;
    
    const res = await pool.query(`
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
        OR ca.analysis_version < $1
      )
      AND (ca.classification IS NULL OR ca.classification IN ('article','nav'))
      ORDER BY hr.fetched_at DESC
      LIMIT $2
    `, [analysisVersion, normalizedLimit]);
    
    return res.rows;
  }

  function hasCompressionBucketSupport() {
    return true; // Postgres supports it via same schema
  }

  async function getCompressionBucketById(bucketId) {
    try {
      const res = await pool.query(`
        SELECT cb.bucket_blob, cb.index_json, ct.algorithm
          FROM compression_buckets cb
          JOIN compression_types ct ON cb.compression_type_id = ct.id
         WHERE cb.id = $1
      `, [bucketId]);
      return res.rows[0] || null;
    } catch (error) {
      optionalErrors.compressionBucket = error;
      return null;
    }
  }

  async function updateAnalysis(payload) {
    await pool.query(`
      UPDATE content_analysis
         SET analysis_json = $1,
             analysis_version = $2,
             analyzed_at = NOW(),
             word_count = $3,
             article_xpath = $4
       WHERE id = $5
    `, [
      payload.analysis_json,
      payload.analysis_version,
      payload.word_count,
      payload.article_xpath,
      payload.analysis_id
    ]);
  }

  async function savePlaceHub({
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
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Ensure URL ID
      let urlId;
      const urlRes = await client.query(`
        INSERT INTO urls (url, created_at)
        VALUES ($1, NOW())
        ON CONFLICT (url) DO UPDATE SET last_seen_at = NOW()
        RETURNING id
      `, [url]);
      
      if (urlRes.rows.length > 0) {
        urlId = urlRes.rows[0].id;
      } else {
        const fetchRes = await client.query('SELECT id FROM urls WHERE url = $1', [url]);
        urlId = fetchRes.rows[0].id;
      }

      await client.query(`
        INSERT INTO place_hubs(
          host,
          url_id,
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
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), $9, $10, $11)
        ON CONFLICT (url_id) DO UPDATE SET
           place_slug = COALESCE($3, place_hubs.place_slug),
           place_kind = COALESCE($4, place_hubs.place_kind),
           topic_slug = COALESCE($5, place_hubs.topic_slug),
           topic_label = COALESCE($6, place_hubs.topic_label),
           topic_kind = COALESCE($7, place_hubs.topic_kind),
           title = COALESCE($8, place_hubs.title),
           last_seen_at = NOW(),
           nav_links_count = COALESCE($9, place_hubs.nav_links_count),
           article_links_count = COALESCE($10, place_hubs.article_links_count),
           evidence = COALESCE($11, place_hubs.evidence)
      `, [
        host,
        urlId,
        placeSlug,
        placeKind,
        topicSlug,
        topicLabel,
        topicKind,
        title,
        navLinksCount,
        articleLinksCount,
        evidenceJson
      ]);

      await client.query('COMMIT');
      return true;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async function saveUnknownTerm({
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
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Ensure URL IDs
      const ensureUrl = async (u) => {
        const res = await client.query(`
          INSERT INTO urls (url, created_at) VALUES ($1, NOW())
          ON CONFLICT (url) DO UPDATE SET last_seen_at = NOW()
          RETURNING id
        `, [u]);
        if (res.rows.length > 0) return res.rows[0].id;
        const fetch = await client.query('SELECT id FROM urls WHERE url = $1', [u]);
        return fetch.rows[0].id;
      };

      const urlId = await ensureUrl(url);
      const canonicalUrlId = await ensureUrl(canonicalUrl);

      await client.query(`
        INSERT INTO place_hub_unknown_terms(
          host,
          url_id,
          canonical_url_id,
          term_slug,
          term_label,
          source,
          reason,
          confidence,
          evidence,
          occurrences,
          first_seen_at,
          last_seen_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, NOW(), NOW())
        ON CONFLICT(host, canonical_url_id, term_slug) DO UPDATE SET
          term_label = COALESCE(EXCLUDED.term_label, place_hub_unknown_terms.term_label),
          source = COALESCE(EXCLUDED.source, place_hub_unknown_terms.source),
          reason = COALESCE(EXCLUDED.reason, place_hub_unknown_terms.reason),
          confidence = COALESCE(EXCLUDED.confidence, place_hub_unknown_terms.confidence),
          evidence = COALESCE(EXCLUDED.evidence, place_hub_unknown_terms.evidence),
          occurrences = place_hub_unknown_terms.occurrences + 1,
          last_seen_at = NOW()
      `, [
        host,
        urlId,
        canonicalUrlId,
        termSlug,
        termLabel,
        source,
        reason,
        confidence,
        evidence
      ]);

      await client.query('COMMIT');
      return true;
    } catch (e) {
      await client.query('ROLLBACK');
      return false;
    } finally {
      client.release();
    }
  }

  async function getPlaceHubByUrl(url) {
    if (!url) return null;
    
    const client = await pool.connect();
    try {
      // Ensure URL ID first (or just lookup)
      const fetchRes = await client.query('SELECT id FROM urls WHERE url = $1', [url]);
      if (fetchRes.rows.length === 0) return null;
      const urlId = fetchRes.rows[0].id;

      const res = await client.query('SELECT id, place_slug, topic_slug, topic_label FROM place_hubs WHERE url_id = $1', [urlId]);
      return res.rows[0] || null;
    } catch (error) {
      optionalErrors.urlResolution = error;
      return null;
    } finally {
      client.release();
    }
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
