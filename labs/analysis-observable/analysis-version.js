/**
 * Analysis Version Utilities
 *
 * Provides functions to detect and manage analysis versions in the database.
 */
'use strict';

const path = require('path');
const { findProjectRoot } = require('../../src/utils/project-root');

/**
 * Get analysis version statistics from the database
 * @param {string} [dbPath] - Path to database
 * @returns {Object} Version statistics
 */
function getAnalysisVersionStats(dbPath) {
  const NewsDatabase = require('../../src/db');
  const projectRoot = findProjectRoot(__dirname);
  const resolvedDbPath = dbPath || path.join(projectRoot, 'data', 'news.db');

  const db = new NewsDatabase(resolvedDbPath);

  try {
    const q = db.db;

    // Get version distribution
    const versions = q.prepare(`
      SELECT analysis_version, COUNT(*) as count
      FROM content_analysis
      GROUP BY analysis_version
      ORDER BY analysis_version DESC
    `).all();

    // Get max version
    const maxVersionRow = q.prepare(`
      SELECT MAX(analysis_version) as max_version
      FROM content_analysis
    `).get();

    // Get total records
    const totalRow = q.prepare(`
      SELECT COUNT(*) as total FROM content_analysis
    `).get();

    // Get records by host
    const hostCounts = q.prepare(`
      SELECT u.host, COUNT(*) as count
      FROM content_analysis ca
      JOIN content_storage cs ON ca.content_id = cs.id
      JOIN http_responses hr ON cs.http_response_id = hr.id
      JOIN urls u ON hr.url_id = u.id
      GROUP BY u.host
      ORDER BY count DESC
      LIMIT 10
    `).all();

    return {
      maxVersion: maxVersionRow?.max_version || 0,
      nextVersion: (maxVersionRow?.max_version || 0) + 1,
      totalRecords: totalRow?.total || 0,
      versionDistribution: versions,
      topHosts: hostCounts
    };
  } finally {
    db.close();
  }
}

/**
 * Get pending analysis count for a given version
 * @param {number} targetVersion - Target version to analyze to
 * @param {string} [dbPath] - Path to database
 * @returns {number} Number of records needing analysis
 */
function getPendingCount(targetVersion, dbPath) {
  const NewsDatabase = require('../../src/db');
  const projectRoot = findProjectRoot(__dirname);
  const resolvedDbPath = dbPath || path.join(projectRoot, 'data', 'news.db');

  const db = new NewsDatabase(resolvedDbPath);

  try {
    const row = db.db.prepare(`
      SELECT COUNT(*) as count
      FROM content_analysis
      WHERE analysis_version IS NULL OR analysis_version < ?
    `).get(targetVersion);

    return row?.count || 0;
  } finally {
    db.close();
  }
}

/**
 * Print analysis version summary to console
 */
function printVersionSummary(stats) {
  console.log('\n=== Analysis Version Summary ===\n');
  console.log(`Current max version: ${stats.maxVersion}`);
  console.log(`Next version:        ${stats.nextVersion}`);
  console.log(`Total records:       ${stats.totalRecords.toLocaleString()}`);

  console.log('\nVersion distribution:');
  for (const v of stats.versionDistribution.slice(0, 5)) {
    const pct = ((v.count / stats.totalRecords) * 100).toFixed(1);
    console.log(`  v${v.analysis_version}: ${v.count.toLocaleString()} (${pct}%)`);
  }

  console.log('\nTop hosts:');
  for (const h of stats.topHosts.slice(0, 5)) {
    console.log(`  ${h.host}: ${h.count.toLocaleString()}`);
  }
  console.log();
}

// CLI usage
if (require.main === module) {
  const stats = getAnalysisVersionStats();
  printVersionSummary(stats);

  const pendingForNext = getPendingCount(stats.nextVersion);
  console.log(`Records pending for v${stats.nextVersion}: ${pendingForNext.toLocaleString()}`);
}

/**
 * Resolve the target analysis version based on current state
 * @param {Object} stats - Stats from getAnalysisVersionStats
 * @param {boolean} forceNew - Force a new version
 * @returns {number} Target version
 */
function resolveTargetVersion(stats, forceNew = false) {
  if (forceNew) {
    return stats.nextVersion;
  }

  // If we have a max version, check if it's fully applied
  if (stats.maxVersion > 0 && stats.versionDistribution.length > 0) {
    const maxVerStats = stats.versionDistribution.find(v => v.analysis_version === stats.maxVersion);
    // If less than 99.9% complete, continue it (allow for some permanent failures/skips)
    // Actually, let's just check if there are ANY pending records for this version
    // But we don't have that count handy without another query.
    // Simple heuristic: if count < total, continue.
    if (maxVerStats && maxVerStats.count < stats.totalRecords) {
      return stats.maxVersion;
    }
  }

  // Otherwise start new version
  return stats.nextVersion;
}

/**
 * Get items that timed out
 * @param {string} [dbPath] - Path to database
 * @param {number} [limit] - Max items
 * @returns {Array} List of timeout items
 */
function getTimeoutItems(dbPath, limit = 50) {
  const NewsDatabase = require('../../src/db');
  const projectRoot = findProjectRoot(__dirname);
  const resolvedDbPath = dbPath || path.join(projectRoot, 'data', 'news.db');

  const db = new NewsDatabase(resolvedDbPath);

  try {
    return db.db.prepare(`
      SELECT 
        ca.id, u.url, ca.analysis_version, ca.analyzed_at,
        json_extract(ca.analysis_json, '$.meta.durationMs') as duration_ms
      FROM content_analysis ca
      JOIN content_storage cs ON ca.content_id = cs.id
      JOIN http_responses hr ON cs.http_response_id = hr.id
      JOIN urls u ON hr.url_id = u.id
      WHERE json_extract(ca.analysis_json, '$.kind') = 'error'
        AND json_extract(ca.analysis_json, '$.error') = 'Timeout'
      ORDER BY ca.analyzed_at DESC
      LIMIT ?
    `).all(limit);
  } finally {
    db.close();
  }
}

module.exports = {
  getAnalysisVersionStats,
  getPendingCount,
  printVersionSummary,
  resolveTargetVersion,
  getTimeoutItems
};
