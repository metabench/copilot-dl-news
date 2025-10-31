'use strict';

function assertDatabase(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createShowAnalysisQueries requires a better-sqlite3 database handle');
  }
}

function createShowAnalysisQueries(db) {
  assertDatabase(db);

  const maxVersionStmt = db.prepare(
    'SELECT COALESCE(MAX(analysis_version), 0) AS max_version FROM content_analysis'
  );

  const latestAnalysisByUrlStmt = db.prepare(`
    SELECT 
      ca.id AS analysis_id,
      ca.content_id,
      ca.analysis_version,
      ca.analysis_json,
      ca.title,
      ca.section,
      ca.word_count,
      ca.classification,
      ca.article_xpath,
      ca.nav_links_count,
      ca.article_links_count,
      u.url,
      u.host,
      u.canonical_url,
      hr.http_status,
      hr.content_type,
      hr.fetched_at,
      cs.storage_type,
      cs.uncompressed_size,
      cs.compressed_size,
      cs.compression_ratio,
      ct.algorithm AS compression_algorithm
    FROM content_analysis ca
    JOIN content_storage cs ON ca.content_id = cs.id
    JOIN http_responses hr ON cs.http_response_id = hr.id
    JOIN urls u ON hr.url_id = u.id
    LEFT JOIN compression_types ct ON cs.compression_type_id = ct.id
    WHERE u.url = ?
    ORDER BY hr.fetched_at DESC
    LIMIT 1
  `);

  function getMaxAnalysisVersion() {
    const row = maxVersionStmt.get();
    return row ? row.max_version || 0 : 0;
  }

  function getLatestAnalysisForUrl(url) {
    if (!url) return null;
    return latestAnalysisByUrlStmt.get(url);
  }

  return {
    getMaxAnalysisVersion,
    getLatestAnalysisForUrl
  };
}

module.exports = { createShowAnalysisQueries };
