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

module.exports = {
  getAnalysisVersionStats,
  getPendingCount,
  printVersionSummary
};
