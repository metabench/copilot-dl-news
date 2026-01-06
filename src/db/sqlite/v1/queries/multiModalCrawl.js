"use strict";

/**
 * Multi-Modal Crawl Queries (SQLite)
 *
 * Centralizes SQL used by the multi-modal crawler so services/orchestrators
 * can remain adapter-agnostic.
 */

function assertDatabase(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new Error("createMultiModalCrawlQueries requires a better-sqlite3 database handle");
  }
}

function createMultiModalCrawlQueries(db) {
  assertDatabase(db);

  const optionalErrors = Object.create(null);

  const safePrepare = (key, sql) => {
    try {
      return db.prepare(sql);
    } catch (error) {
      optionalErrors[key] = error;
      return null;
    }
  };

  const pendingAnalysisCountStmt = safePrepare("pendingAnalysisCount", `
    SELECT COUNT(*) as count
      FROM content_analysis ca
      JOIN content_storage cs ON ca.content_id = cs.id
      JOIN http_responses hr ON cs.http_response_id = hr.id
      JOIN urls u ON hr.url_id = u.id
     WHERE u.host = ?
       AND (
         ca.analysis_json IS NULL
         OR ca.analysis_version IS NULL
         OR ca.analysis_version < ?
       )
  `);

  const patternHubCandidatesStmt = safePrepare("patternHubCandidates", `
    SELECT
      u.url,
      u.host,
      COUNT(*) as link_count,
      EXISTS (
        SELECT 1
          FROM place_page_mappings ppm
         WHERE ppm.url = u.url
           AND ppm.status = 'verified'
      ) as is_verified
    FROM urls u
    JOIN links l ON u.id = l.src_url_id
    WHERE u.host = ?
      AND u.url NOT LIKE '%/article/%'
      AND u.url NOT LIKE '%/story/%'
      AND u.url NOT LIKE '%/gallery/%'
      AND u.url NOT LIKE '%/video/%'
    GROUP BY u.url
    HAVING link_count >= ?
    ORDER BY link_count DESC
    LIMIT ?
  `);

  const reanalysisUrlsStmt = safePrepare("reanalysisUrls", `
    SELECT u.url
      FROM urls u
      JOIN http_responses hr ON hr.url_id = u.id
      JOIN content_storage cs ON cs.http_response_id = hr.id
      JOIN content_analysis ca ON ca.content_id = cs.id
     WHERE u.host = ?
       AND (
         COALESCE(ca.confidence_score, 0) < ?
         OR ca.analysis_version < (
           SELECT MAX(ca2.analysis_version)
             FROM content_analysis ca2
             JOIN content_storage cs2 ON ca2.content_id = cs2.id
             JOIN http_responses hr2 ON cs2.http_response_id = hr2.id
             JOIN urls u2 ON hr2.url_id = u2.id
            WHERE u2.host = ?
         )
       )
     ORDER BY COALESCE(ca.confidence_score, 0) ASC
     LIMIT ?
  `);

  const queueDepthStmt = safePrepare("queueDepth", `
    SELECT COUNT(*) as count
      FROM crawl_queue
     WHERE status = 'pending'
  `);

  return {
    /**
     * Count pages for a host that still need analysis.
     * @param {string} host
     * @param {Object} [options]
     * @param {number} [options.analysisVersion=1]
     * @returns {number|null}
     */
    getPendingAnalysisCount(host, { analysisVersion = 1 } = {}) {
      if (!pendingAnalysisCountStmt || !host) return null;
      try {
        const version = Number.isFinite(analysisVersion) ? analysisVersion : 1;
        const row = pendingAnalysisCountStmt.get(host, version);
        return row?.count ?? 0;
      } catch (_) {
        return null;
      }
    },

    /**
     * Find candidate hub URLs based on common path patterns.
     * @param {string} host
     * @param {Object} [options]
     * @param {number} [options.minLinkCount=5]
     * @param {number} [options.limit=10]
     * @returns {Array<{url: string, host: string, link_count: number, is_verified: number}>}
     */
    getPatternHubCandidates(host, { minLinkCount = 5, limit = 25 } = {}) {
      if (!patternHubCandidatesStmt || !host) return [];
      try {
        return patternHubCandidatesStmt.all(host, minLinkCount, limit) || [];
      } catch (_) {
        return [];
      }
    },

    /**
     * Find URLs for re-analysis by confidence/version drift.
     * @param {string} host
     * @param {Object} [options]
     * @param {number} [options.minConfidence=0.6]
     * @param {number} [options.limit=500]
     * @returns {Array<string>}
     */
    getReanalysisUrls(host, { minConfidence = 0.6, limit = 500 } = {}) {
      if (!reanalysisUrlsStmt || !host) return [];
      try {
        const rows = reanalysisUrlsStmt.all(host, minConfidence, host, limit);
        return rows.map(row => row.url);
      } catch (_) {
        return [];
      }
    },

    /**
     * Placeholder for signature-based reanalysis lookups.
     * Currently returns an empty list because signature-to-URL mappings
     * are not persisted in the schema.
     * @param {Array<string>} _signatureHashes
     * @param {Object} [_options]
     * @returns {Array<string>}
     */
    getReanalysisUrlsForSignatures(_signatureHashes, _options = {}) {
      return [];
    },

    /**
     * Count pending items in the crawl queue.
     * @returns {number|null}
     */
    getQueueDepth() {
      if (!queueDepthStmt) return null;
      try {
        const row = queueDepthStmt.get();
        return row?.count ?? 0;
      } catch (_) {
        return null;
      }
    }
  };
}

module.exports = { createMultiModalCrawlQueries };
