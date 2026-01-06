#!/usr/bin/env node

/**
 * analyze-post-run.js
 *
 * Post-processing step for the analyse-pages pipeline.
 * Persists summary information about the run and refreshes
 * global compression statistics for telemetry dashboards.
 */

const fs = require('fs');
const path = require('path');
const { findProjectRoot } = require('../utils/project-root');
const { ensureDatabase } = require('../db/sqlite/v1');
const { CompressionAnalytics } = require('../utils/CompressionAnalytics');

function normalizeSummary(summary = {}) {
  const value = summary && typeof summary === 'object' ? summary : {};
  const processed = Number(value.processed ?? value.analysed ?? value.analyzed ?? 0) || 0;
  const updated = Number(value.updated ?? 0) || 0;
  const skipped = Number(value.skipped ?? 0) || 0;
  const version = Number(value.version ?? value.analysisVersion ?? value.analysis_version ?? 0) || null;

  return {
    raw: value,
    processed,
    updated,
    skipped,
    version
  };
}

function ensureCompressionStatusTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS compression_status (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_analyzed_at TEXT,
      analysis_version INTEGER,
      analysed_pages INTEGER DEFAULT 0,
      pages_updated INTEGER DEFAULT 0,
      skipped_pages INTEGER DEFAULT 0,
      last_run_summary TEXT,
      total_items INTEGER DEFAULT 0,
      uncompressed_items INTEGER DEFAULT 0,
      total_uncompressed_bytes INTEGER DEFAULT 0,
      total_compressed_bytes INTEGER DEFAULT 0,
      total_space_saved_bytes INTEGER DEFAULT 0,
      avg_compression_ratio REAL,
      compression_types_json TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

async function collectStorageSummary(db, logger) {
  const analytics = new CompressionAnalytics({ db, logger, enabled: true });
  const summary = await analytics.getStorageSummary();
  if (!summary) {
    return {
      total_items: 0,
      uncompressed_items: 0,
      total_uncompressed_size: 0,
      total_compressed_size: 0,
      total_space_saved: 0,
      avg_compression_ratio: 0,
      compression_types: []
    };
  }
  return summary;
}

function upsertCompressionStatus(db, data) {
  const statement = db.prepare(`
    INSERT INTO compression_status (
      id,
      last_analyzed_at,
      analysis_version,
      analysed_pages,
      pages_updated,
      skipped_pages,
      last_run_summary,
      total_items,
      uncompressed_items,
      total_uncompressed_bytes,
      total_compressed_bytes,
      total_space_saved_bytes,
      avg_compression_ratio,
      compression_types_json,
      updated_at
    ) VALUES (
      1,
      @last_analyzed_at,
      @analysis_version,
      @analysed_pages,
      @pages_updated,
      @skipped_pages,
      @last_run_summary,
      @total_items,
      @uncompressed_items,
      @total_uncompressed_bytes,
      @total_compressed_bytes,
      @total_space_saved_bytes,
      @avg_compression_ratio,
      @compression_types_json,
      @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      last_analyzed_at = excluded.last_analyzed_at,
      analysis_version = excluded.analysis_version,
      analysed_pages = excluded.analysed_pages,
      pages_updated = excluded.pages_updated,
      skipped_pages = excluded.skipped_pages,
      last_run_summary = excluded.last_run_summary,
      total_items = excluded.total_items,
      uncompressed_items = excluded.uncompressed_items,
      total_uncompressed_bytes = excluded.total_uncompressed_bytes,
      total_compressed_bytes = excluded.total_compressed_bytes,
      total_space_saved_bytes = excluded.total_space_saved_bytes,
      avg_compression_ratio = excluded.avg_compression_ratio,
      compression_types_json = excluded.compression_types_json,
      updated_at = excluded.updated_at;
  `);

  statement.run(data);
}

async function runAnalysisPostProcessing({ dbPath, summary, logger = console }) {
  if (!dbPath) {
    const projectRoot = findProjectRoot(__dirname);
    dbPath = path.join(projectRoot, 'data', 'news.db');
  }

  if (!summary || typeof summary !== 'object') {
    throw new Error('Summary object is required for analyze-post-run');
  }

  const db = ensureDatabase(dbPath);
  try {
    ensureCompressionStatusTable(db);

    const normalized = normalizeSummary(summary);
    const storageSummary = await collectStorageSummary(db, logger);
    const now = new Date().toISOString();

    const payload = {
      last_analyzed_at: now,
      analysis_version: normalized.version,
      analysed_pages: normalized.processed,
      pages_updated: normalized.updated,
      skipped_pages: normalized.skipped,
      last_run_summary: JSON.stringify(summary),
      total_items: storageSummary.total_items || 0,
      uncompressed_items: storageSummary.uncompressed_items || 0,
      total_uncompressed_bytes: storageSummary.total_uncompressed_size || 0,
      total_compressed_bytes: storageSummary.total_compressed_size || 0,
      total_space_saved_bytes: storageSummary.total_space_saved || 0,
      avg_compression_ratio: storageSummary.avg_compression_ratio || 0,
      compression_types_json: JSON.stringify(storageSummary.compression_types || []),
      updated_at: now
    };

    upsertCompressionStatus(db, payload);

    return {
      summary: normalized,
      storageSummary,
      payload
    };
  } finally {
    try { db.close(); } catch (_) {}
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const result = {
    dbPath: null,
    summaryPath: null,
    summaryJson: null
  };

  for (const arg of argv) {
    if (arg.startsWith('--db=')) {
      result.dbPath = arg.slice('--db='.length);
    } else if (arg.startsWith('--summary-json=')) {
      result.summaryJson = arg.slice('--summary-json='.length);
    } else if (arg.startsWith('--summary=')) {
      result.summaryPath = arg.slice('--summary='.length);
    }
  }

  return result;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function main() {
  const args = parseArgs();
  let summary = null;

  if (args.summaryJson) {
    summary = JSON.parse(args.summaryJson);
  } else if (args.summaryPath) {
    const fileContents = fs.readFileSync(args.summaryPath, 'utf8');
    summary = JSON.parse(fileContents);
  } else {
    const stdinData = (await readStdin()).trim();
    if (!stdinData) {
      throw new Error('No summary provided. Pass --summary=<path>, --summary-json=<json>, or pipe JSON to stdin.');
    }
    summary = JSON.parse(stdinData);
  }

  const result = await runAnalysisPostProcessing({
    dbPath: args.dbPath,
    summary,
    logger: console
  });

  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[analyze-post-run] Failed:', error.message || error);
    process.exit(1);
  });
}

module.exports = {
  runAnalysisPostProcessing
};
