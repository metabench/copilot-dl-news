/**
 * Download Evidence Queries
 * 
 * Evidence-based queries that prove downloads happened.
 * Never claim a download without querying these functions.
 * 
 * @module src/db/queries/downloadEvidence
 */
'use strict';

/**
 * Get verified download count for a time range
 * A download is "verified" if: http_status=200 AND bytes_downloaded>0
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} startTime - ISO timestamp (inclusive)
 * @param {string} endTime - ISO timestamp (inclusive)
 * @returns {{ verified: number, failed: number, total: number, bytes: number }}
 */
function getDownloadStats(db, startTime, endTime) {
  const stmt = db.prepare(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN http_status = 200 AND bytes_downloaded > 0 THEN 1 END) as verified,
      COUNT(CASE WHEN http_status != 200 OR bytes_downloaded = 0 THEN 1 END) as failed,
      COALESCE(SUM(CASE WHEN http_status = 200 THEN bytes_downloaded ELSE 0 END), 0) as bytes
    FROM http_responses
    WHERE fetched_at BETWEEN ? AND ?
  `);
  return stmt.get(startTime, endTime);
}

/**
 * Get full evidence bundle for downloads in a time range
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} startTime - ISO timestamp
 * @param {string} endTime - ISO timestamp
 * @param {number} [limit=100] - Max results
 * @returns {Array<DownloadProof>}
 */
function getDownloadEvidence(db, startTime, endTime, limit = 100) {
  const stmt = db.prepare(`
    SELECT 
      u.id as url_id,
      u.url,
      r.id as http_response_id,
      r.http_status,
      r.bytes_downloaded,
      r.fetched_at,
      r.ttfb_ms,
      r.download_ms,
      r.content_type
    FROM http_responses r
    JOIN urls u ON r.url_id = u.id
    WHERE r.fetched_at BETWEEN ? AND ?
    ORDER BY r.fetched_at
    LIMIT ?
  `);
  return stmt.all(startTime, endTime, limit);
}

/**
 * Get evidence for a specific URL
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} url - The URL to check
 * @returns {DownloadProof|null}
 */
function getUrlEvidence(db, url) {
  const stmt = db.prepare(`
    SELECT 
      u.id as url_id,
      u.url,
      r.id as http_response_id,
      r.http_status,
      r.bytes_downloaded,
      r.fetched_at,
      r.ttfb_ms,
      r.download_ms,
      r.content_type
    FROM urls u
    LEFT JOIN http_responses r ON r.url_id = u.id
    WHERE u.url = ?
    ORDER BY r.fetched_at DESC
    LIMIT 1
  `);
  return stmt.get(url) || null;
}

/**
 * Verify a claimed download count against database
 * 
 * @param {Database} db - better-sqlite3 database instance  
 * @param {string} startTime - ISO timestamp
 * @param {string} endTime - ISO timestamp
 * @param {number} claimedCount - The count being claimed
 * @returns {{ valid: boolean, actual: number, claimed: number, discrepancy: number }}
 */
function verifyDownloadClaim(db, startTime, endTime, claimedCount) {
  const stats = getDownloadStats(db, startTime, endTime);
  const actual = stats.verified;
  return {
    valid: actual === claimedCount,
    actual,
    claimed: claimedCount,
    discrepancy: claimedCount - actual
  };
}

/**
 * Get download timeline for progress tracking
 * Groups downloads by second for progress visualization
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} startTime - ISO timestamp
 * @param {string} endTime - ISO timestamp
 * @returns {Array<{ second: string, count: number, cumulative: number, bytes: number }>}
 */
function getDownloadTimeline(db, startTime, endTime) {
  const stmt = db.prepare(`
    WITH downloads AS (
      SELECT 
        strftime('%Y-%m-%dT%H:%M:%S', fetched_at) as second,
        COUNT(*) as count,
        SUM(bytes_downloaded) as bytes
      FROM http_responses
      WHERE fetched_at BETWEEN ? AND ?
        AND http_status = 200
        AND bytes_downloaded > 0
      GROUP BY strftime('%Y-%m-%dT%H:%M:%S', fetched_at)
      ORDER BY second
    )
    SELECT 
      second,
      count,
      bytes,
      SUM(count) OVER (ORDER BY second) as cumulative
    FROM downloads
  `);
  return stmt.all(startTime, endTime);
}

/**
 * Get global download statistics (all-time)
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @returns {{ total_responses: number, verified_downloads: number, total_bytes: number, first_download: string, last_download: string }}
 */
function getGlobalStats(db) {
  const stmt = db.prepare(`
    SELECT 
      COUNT(*) as total_responses,
      COUNT(CASE WHEN http_status = 200 AND bytes_downloaded > 0 THEN 1 END) as verified_downloads,
      COALESCE(SUM(CASE WHEN http_status = 200 THEN bytes_downloaded ELSE 0 END), 0) as total_bytes,
      MIN(fetched_at) as first_download,
      MAX(fetched_at) as last_download
    FROM http_responses
  `);
  return stmt.get();
}

module.exports = {
  getDownloadStats,
  getDownloadEvidence,
  getUrlEvidence,
  verifyDownloadClaim,
  getDownloadTimeline,
  getGlobalStats
};
