#!/usr/bin/env node

/**
 * current-analysis-version.js
 *
 * Prints the highest analysis version referenced in the database along with
 * helpful context (record counts, latest runs, telemetry snapshots).
 */

const path = require('path');
const { findProjectRoot } = require('../../src/shared/utils/project-root');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

function createColors() {
  const enabled = Boolean(process.stdout.isTTY);
  const wrap = (code) => (enabled ? code : '');
  return {
    enabled,
    reset: wrap('\x1b[0m'),
    bold: wrap('\x1b[1m'),
    cyan: wrap('\x1b[36m'),
    yellow: wrap('\x1b[33m'),
    green: wrap('\x1b[32m'),
    red: wrap('\x1b[31m'),
    gray: wrap('\x1b[90m'),
    magenta: wrap('\x1b[35m')
  };
}

function parseArgs(argv) {
  const options = {
    dbPath: null,
    json: false,
    topN: 5,
    help: false
  };

  for (const raw of argv.slice(2)) {
    if (raw === '--json') {
      options.json = true;
    } else if (raw === '--help' || raw === '-h') {
      options.help = true;
    } else if (raw.startsWith('--db=')) {
      options.dbPath = raw.slice('--db='.length);
    } else if (raw.startsWith('--top=')) {
      const value = Number(raw.slice('--top='.length));
      if (!Number.isNaN(value) && value > 0) options.topN = value;
    }
  }

  return options;
}

function formatNumber(value) {
  if (value == null || Number.isNaN(Number(value))) return '0';
  return Number(value).toLocaleString('en-US');
}

function formatTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

function safeParse(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    return null;
  }
}

function extractSummaryStats(summary) {
  if (!summary || typeof summary !== 'object') return { processed: null, updated: null };
  const candidate = summary.totals || summary.summary || summary;
  let processed = candidate.processed ?? candidate.analysed ?? candidate.analyzed ?? candidate.totalProcessed ?? candidate.total_processed ?? null;
  let updated = candidate.updated ?? candidate.totalUpdated ?? candidate.total_updated ?? null;

  if ((processed == null || updated == null) && summary.steps && typeof summary.steps === 'object') {
    const pagesStep = summary.steps.pages;
    if (pagesStep && typeof pagesStep === 'object') {
      processed = processed ?? pagesStep.processed ?? pagesStep.analysed ?? pagesStep.analyzed ?? null;
      updated = updated ?? pagesStep.updated ?? null;
    }
  }

  return {
    processed: processed != null ? Number(processed) : null,
    updated: updated != null ? Number(updated) : null
  };
}

function tableExists(db, tableName) {
  return getDbModule().analysisMaintenanceTableExists(db, tableName);
}

function collectContentAnalysisStats(db, topN = 5) {
  return getDbModule().collectContentAnalysisVersionStats(db, { topN });
}

function collectAnalysisRuns(db) {
  return getDbModule().collectRecentAnalysisRunsWithVersions(db);
}

function collectCompressionStatus(db) {
  return getDbModule().getAnalysisCompressionStatus(db);
}

function getDbModule() {
  const dbModule = resolveNewsCrawlerDbModule();
  if (!dbModule || typeof dbModule.collectCurrentAnalysisVersionReport !== 'function') {
    throw new Error('news-crawler-db analysis maintenance helpers are unavailable. Rebuild news-crawler-db.');
  }
  return dbModule;
}

function printHelp(colors) {
  console.log(`${colors.bold}Usage${colors.reset}: node tools/maintenance/current-analysis-version.js [options]`);
  console.log('');
  console.log('Options:');
  console.log('  --db=PATH    Override database path (defaults to data/news.db)');
  console.log('  --json       Output JSON only (no human-readable summary)');
  console.log('  --top=N      Show top N versions with counts (default: 5)');
  console.log('  --help       Show this message');
}

function printSummary(result, colors) {
  console.log(`${colors.bold}Analysis version status${colors.reset}`);

  if (!result.contentAnalysis.exists) {
    console.log(`${colors.red}content_analysis table not found.${colors.reset}`);
  } else if (result.contentAnalysis.totalRecords === 0) {
    console.log(`${colors.yellow}No content_analysis rows found.${colors.reset}`);
  } else {
    console.log(`   Highest analysis_version in content_analysis: ${colors.cyan}${result.contentAnalysis.maxVersion ?? 'n/a'}${colors.reset}`);
    console.log(`   Total analysed rows: ${formatNumber(result.contentAnalysis.totalRecords)}`);
    if (result.contentAnalysis.maxVersion != null) {
      console.log(`   Rows at highest version (${result.contentAnalysis.maxVersion}): ${formatNumber(result.contentAnalysis.topVersions[0]?.count || 0)}`);
    }
    if (result.contentAnalysis.belowMax > 0) {
      console.log(`   Rows below highest version: ${colors.yellow}${formatNumber(result.contentAnalysis.belowMax)}${colors.reset}`);
    } else {
      console.log(`   ${colors.green}All rows are already at the highest version.${colors.reset}`);
    }
    if (result.contentAnalysis.nullCount > 0) {
      console.log(`   Rows without analysis_version: ${colors.red}${formatNumber(result.contentAnalysis.nullCount)}${colors.reset}`);
    }

    if (result.contentAnalysis.topVersions.length > 0) {
      console.log(`   Version distribution (top ${result.contentAnalysis.topVersions.length}):`);
      for (const entry of result.contentAnalysis.topVersions) {
        console.log(`      • v${entry.version}: ${formatNumber(entry.count)} rows`);
      }
    }
  }

  console.log('');
  if (result.analysisRuns.exists) {
    if (result.analysisRuns.latest.length === 0) {
      console.log(`${colors.gray}No analysis_runs entries with version recorded.${colors.reset}`);
    } else {
      const latest = result.analysisRuns.latest[0];
      console.log(`${colors.bold}Most recent analysis_runs entry${colors.reset}`);
      console.log(`   Run ID: ${latest.id}`);
      console.log(`   Version: ${latest.analysisVersion}`);
      console.log(`   Started: ${latest.startedAt || 'n/a'}`);
      console.log(`   Completed: ${latest.endedAt || 'n/a'}`);
      if (latest.processed != null) console.log(`   Processed: ${formatNumber(latest.processed)}`);
      if (latest.updated != null) console.log(`   Updated: ${formatNumber(latest.updated)}`);
      if (result.analysisRuns.latest.length > 1) {
        console.log(`   ${colors.gray}${result.analysisRuns.latest.length - 1} more recent run(s) available (use --json for full list).${colors.reset}`);
      }
    }
  } else {
    console.log(`${colors.gray}analysis_runs table not found.${colors.reset}`);
  }

  console.log('');
  if (result.compressionStatus.exists) {
    const row = result.compressionStatus.row;
    if (!row) {
      console.log(`${colors.gray}compression_status row not populated yet.${colors.reset}`);
    } else {
      console.log(`${colors.bold}Compression telemetry snapshot${colors.reset}`);
      console.log(`   Last analysis version: ${row.analysisVersion ?? 'n/a'}`);
      console.log(`   Last analyzed at: ${row.lastAnalyzedAt || 'n/a'}`);
      if (row.analysedPages != null) console.log(`   Pages analysed: ${formatNumber(row.analysedPages)}`);
      if (row.pagesUpdated != null) console.log(`   Pages updated: ${formatNumber(row.pagesUpdated)}`);
      if (row.skippedPages != null) console.log(`   Pages skipped: ${formatNumber(row.skippedPages)}`);
    }
  } else {
    console.log(`${colors.gray}compression_status table not found.${colors.reset}`);
  }
}

async function main() {
  const options = parseArgs(process.argv);
  const colors = createColors();

  if (options.help) {
    printHelp(colors);
    return;
  }

  const projectRoot = findProjectRoot(__dirname);
  const dbPath = options.dbPath
    ? path.resolve(options.dbPath)
    : path.join(projectRoot, 'data', 'news.db');

  const db = openNewsCrawlerDb(dbPath, { readonly: true, fileMustExist: true });
  try {
    const contentAnalysis = collectContentAnalysisStats(db, options.topN);
    const analysisRuns = collectAnalysisRuns(db);
    const compressionStatus = collectCompressionStatus(db);

    const result = {
      dbPath,
      contentAnalysis,
      analysisRuns,
      compressionStatus
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`${colors.gray}Database:${colors.reset} ${dbPath}`);
      printSummary(result, colors);
    }
  } finally {
    try { db.close(); } catch (_) { /* ignore */ }
  }
}

if (require.main === module) {
  main().catch((error) => {
    const colors = createColors();
    console.error(`${colors.red}Error: ${error.message || error}${colors.reset}`);
    process.exit(1);
  });
}


