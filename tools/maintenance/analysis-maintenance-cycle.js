#!/usr/bin/env node

/**
 * analysis-maintenance-cycle.js
 *
 * Orchestrates a full maintenance pass using the improved analysis pipeline.
 * Steps:
 *   1. Run the article analysis pipeline (optionally in dry-run mode)
 *   2. Persist the post-run compression snapshot (if not dry-running)
 *   3. Optionally compress any remaining uncompressed content blobs
 *   4. Surface a friendly summary of actionable insights
 */

const path = require('path');
const { findProjectRoot } = require('../../src/shared/utils/project-root');
const { analysePages } = require('../../src/tools/analyse-pages-core');
const { runAnalysisPostProcessing } = require('../../src/tools/analyze-post-run');
const { ensureDatabase } = require('../../src/data/db/sqlite/v1');
const { main: compressUncompressedRecords } = require('../compress-uncompressed-records');

function createColorPalette() {
  const enabled = Boolean(process.stdout.isTTY);
  const color = (value) => (enabled ? value : '');
  return {
    enabled,
    reset: color('\x1b[0m'),
    bold: color('\x1b[1m'),
    dim: color('\x1b[2m'),
    cyan: color('\x1b[36m'),
    green: color('\x1b[32m'),
    yellow: color('\x1b[33m'),
    red: color('\x1b[31m'),
    gray: color('\x1b[90m'),
    magenta: color('\x1b[35m')
  };
}

function parseArgs(argv) {
  const options = {
    analysisVersion: 1,
    analysisLimit: 10000,
    listLimit: 5,
    includeEvidence: false,
    dryRun: false,
    skipAnalysis: false,
    skipCompression: false,
    verbose: false,
    progressIntervalMs: 1200,
    dbPath: null,
    help: false
  };

  for (const raw of argv.slice(2)) {
    if (raw === '--dry-run' || raw === '--plan') {
      options.dryRun = true;
    } else if (raw === '--skip-analysis') {
      options.skipAnalysis = true;
    } else if (raw === '--skip-compression') {
      options.skipCompression = true;
    } else if (raw === '--verbose') {
      options.verbose = true;
    } else if (raw === '--include-evidence') {
      options.includeEvidence = true;
    } else if (raw === '--help' || raw === '-h') {
      options.help = true;
    } else if (raw.startsWith('--db=')) {
      options.dbPath = raw.slice('--db='.length);
    } else if (raw.startsWith('--analysis-version=')) {
      const value = Number(raw.slice('--analysis-version='.length));
      if (!Number.isNaN(value) && value > 0) options.analysisVersion = value;
    } else if (raw.startsWith('--analysis-limit=')) {
      const value = Number(raw.slice('--analysis-limit='.length));
      if (!Number.isNaN(value) && value >= 0) options.analysisLimit = value;
    } else if (raw.startsWith('--limit=')) {
      const value = Number(raw.slice('--limit='.length));
      if (!Number.isNaN(value) && value >= 0) options.analysisLimit = value;
    } else if (raw.startsWith('--list-limit=')) {
      const value = Number(raw.slice('--list-limit='.length));
      if (!Number.isNaN(value) && value >= 0) options.listLimit = value;
    } else if (raw.startsWith('--progress-interval=')) {
      const value = Number(raw.slice('--progress-interval='.length));
      if (!Number.isNaN(value) && value >= 250) options.progressIntervalMs = value;
    }
  }

  return options;
}

function printHelp(colors) {
  const c = colors || createColorPalette();
  console.log(`${c.bold}Usage${c.reset}: node tools/maintenance/analysis-maintenance-cycle.js [options]`);
  console.log('');
  console.log('Options:');
  console.log('  --db=PATH                 Override database path (defaults to data/news.db)');
  console.log('  --analysis-version=N      Target analysis version (default: 1)');
  console.log('  --analysis-limit=N        Limit number of pages analysed (default: 10000)');
  console.log('  --list-limit=N            Hub/unknown-term preview count (default: 5, 0 to disable)');
  console.log('  --include-evidence        Include evidence blobs when listing hub assignments');
  console.log('  --progress-interval=MS    Progress update cadence (default: 1200)');
  console.log('  --dry-run | --plan        Analyse without writing results or running cleanup');
  console.log('  --skip-analysis           Skip the analysis stage');
  console.log('  --skip-compression        Skip the compression cleanup stage');
  console.log('  --verbose                 Pass verbose=true to the analysis engine');
  console.log('  --help                    Show this help message');
}

function formatNumber(value) {
  if (value == null || Number.isNaN(Number(value))) return '0';
  return Number(value).toLocaleString('en-US');
}

function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(Number(bytes))) return '0 B';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 2)} ${sizes[i]}`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '0s';
  const seconds = ms / 1000;
  if (seconds < 1) return `${seconds.toFixed(2)}s`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}m ${remaining}s`;
}

function computeDelta(afterValue, beforeValue) {
  if (afterValue == null || beforeValue == null) return null;
  return Number(afterValue) - Number(beforeValue);
}

function formatDelta(delta, colors) {
  if (delta == null) return '';
  if (delta === 0) return ` ${colors.gray}(Δ 0)${colors.reset}`;
  const prefix = delta > 0 ? '+' : '';
  const color = delta > 0 ? colors.yellow : colors.green;
  return ` ${color}(Δ ${prefix}${formatNumber(delta)})${colors.reset}`;
}

function truncate(value, maxLength = 80) {
  if (typeof value !== 'string') return value;
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function formatTimestamp(value) {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().replace('T', ' ').replace('Z', 'Z');
}

function createProgressPrinter({ colors, intervalMs = 1200 }) {
  const minInterval = Math.max(250, intervalMs);
  let lastLogged = 0;
  let latestSnapshot = null;

  const log = (snapshot, force = false) => {
    latestSnapshot = snapshot;
    const now = Date.now();
    if (!force && now - lastLogged < minInterval) return;
    lastLogged = now;
    console.log(formatProgressLine(snapshot, colors));
  };

  log.flush = () => {
    if (latestSnapshot) {
      log(latestSnapshot, true);
    }
  };

  return log;
}

function formatProgressLine(progress, colors) {
  const pieces = [
    `${colors.bold}${formatNumber(progress.processed)} processed${colors.reset}`,
    `updated ${formatNumber(progress.updated)}`,
    `hubs +${formatNumber(progress.hubsInserted)}/${formatNumber(progress.hubsUpdated)}`,
    `unknown +${formatNumber(progress.unknownInserted)}`,
    `skipped ${formatNumber(progress.skipped)}`
  ];
  if (progress.dryRun) pieces.push('dry-run');
  return `   ${colors.gray}↺${colors.reset} ${pieces.join(`${colors.gray} | ${colors.reset}`)}`;
}

function tableExists(db, tableName) {
  try {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1").get(tableName);
    return Boolean(row);
  } catch (error) {
    return false;
  }
}

function collectMaintenanceSnapshot(dbPath, { topUnknownLimit = 5 } = {}) {
  const db = ensureDatabase(dbPath);
  try {
    const snapshot = {
      unknownCount: null,
      topUnknownTerms: [],
      compressionStatus: null,
      uncompressedCount: null
    };

    if (tableExists(db, 'place_hub_unknown_terms')) {
      const countRow = db.prepare('SELECT COUNT(*) AS count FROM place_hub_unknown_terms').get();
      snapshot.unknownCount = countRow ? Number(countRow.count) : 0;
      if (topUnknownLimit > 0) {
        snapshot.topUnknownTerms = db.prepare(`
          SELECT host, term_label, term_slug, reason, confidence, occurrences, last_seen_at
            FROM place_hub_unknown_terms
        ORDER BY occurrences DESC, last_seen_at DESC
           LIMIT ?
        `).all(topUnknownLimit);
      }
    }

    if (tableExists(db, 'compression_status')) {
      snapshot.compressionStatus = db.prepare('SELECT * FROM compression_status WHERE id = 1').get() || null;
      if (snapshot.compressionStatus && snapshot.compressionStatus.uncompressed_items != null) {
        snapshot.uncompressedCount = Number(snapshot.compressionStatus.uncompressed_items);
      }
    }

    if (snapshot.uncompressedCount == null && tableExists(db, 'content_storage')) {
      const row = db.prepare(`
        SELECT COUNT(*) AS count
          FROM content_storage
         WHERE compression_type_id IS NULL
           AND content_blob IS NOT NULL
      `).get();
      snapshot.uncompressedCount = row ? Number(row.count) : 0;
    }

    return snapshot;
  } finally {
    try { db.close(); } catch (_) { /* ignore */ }
  }
}

async function runStage(label, taskFn, colors) {
  console.log(`${colors.cyan}➤ ${label}${colors.reset}`);
  const start = Date.now();
  try {
    const result = await taskFn();
    const duration = Date.now() - start;
    console.log(`${colors.green}✔ ${label}${colors.reset} (${formatDuration(duration)})\n`);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`${colors.red}✖ ${label} failed after ${formatDuration(duration)}${colors.reset}`);
    throw error;
  }
}

function logSkip(label, reason, colors) {
  console.log(`${colors.cyan}➤ ${label}${colors.reset}`);
  console.log(`${colors.yellow}⚠ ${reason}${colors.reset}\n`);
}

function summarizeAnalysis(summary, options, colors) {
  if (!summary) return null;
  return {
    processed: formatNumber(summary.processed || summary.analysed || 0),
    updated: formatNumber(summary.updated || 0),
    placesInserted: formatNumber(summary.placesInserted || 0),
    hubsInserted: formatNumber(summary.hubsInserted || 0),
    hubsUpdated: formatNumber(summary.hubsUpdated || 0),
    unknownInserted: formatNumber(summary.unknownInserted || 0),
    skipped: formatNumber(summary.skipped || 0),
    dryRun: summary.dryRun === true,
    version: summary.version || options.analysisVersion || null,
    hubAssignments: Array.isArray(summary.hubAssignments) ? summary.hubAssignments : []
  };
}

function printHubAssignments(assignments, limit, colors, includeEvidence) {
  if (!Array.isArray(assignments) || assignments.length === 0 || limit === 0) return;
  const shown = assignments.slice(0, limit);
  console.log(`   ${colors.gray}Hub assignments preview (${shown.length}${assignments.length > shown.length ? ` of ${formatNumber(assignments.length)}` : ''})${colors.reset}`);
  for (const entry of shown) {
    const actionEmoji = entry.action === 'update' ? '↺' : '➕';
    const placeLabel = entry.place_slug || entry.place_label || '<unknown place>';
    const topicPart = entry.topic_slug ? ` ${colors.gray}[topic: ${entry.topic_slug}]${colors.reset}` : '';
    const counts = [];
    if (entry.nav_links_count != null) counts.push(`nav ${formatNumber(entry.nav_links_count)}`);
    if (entry.article_links_count != null) counts.push(`article ${formatNumber(entry.article_links_count)}`);
    const countsPart = counts.length ? `${colors.gray} (${counts.join(', ')})${colors.reset}` : '';
    const urlPart = entry.url ? ` → ${truncate(entry.url, 90)}` : '';
    console.log(`      • ${actionEmoji} ${placeLabel} @ ${entry.host || 'unknown'}${topicPart}${countsPart}${urlPart}`);
    if (includeEvidence && entry.evidence) {
      const evidenceStr = typeof entry.evidence === 'string' ? entry.evidence : JSON.stringify(entry.evidence);
      console.log(`        ${colors.gray}evidence:${colors.reset} ${truncate(evidenceStr, 120)}`);
    }
  }
  if (assignments.length > shown.length) {
    console.log(`      ${colors.gray}… ${formatNumber(assignments.length - shown.length)} additional assignment(s) not shown${colors.reset}`);
  }
}

function printTopUnknownTerms(terms, colors) {
  if (!Array.isArray(terms) || terms.length === 0) {
    console.log(`   ${colors.green}No unknown hub terms pending — great job!${colors.reset}`);
    return;
  }
  console.log(`   ${colors.gray}Top unresolved hub terms${colors.reset}`);
  for (const term of terms) {
    const label = term.term_label || term.term_slug || '<missing label>';
    const reason = term.reason ? ` – ${term.reason}` : '';
    const confidence = term.confidence != null ? ` (confidence ${term.confidence})` : '';
    console.log(`      • ${label} @ ${term.host || 'unknown'} ×${formatNumber(term.occurrences || 0)}${reason}${confidence}`);
  }
}

function printCompressionDetails(compressionResult, colors) {
  if (!compressionResult) return;
  if (!compressionResult.processed) {
    console.log(`   ${colors.gray}No additional compression was required.${colors.reset}`);
    return;
  }
  const savedBytes = Math.max(0, (compressionResult.totalOriginalSize || 0) - (compressionResult.totalCompressedSize || 0));
  const ratio = typeof compressionResult.averageRatio === 'number' ? compressionResult.averageRatio : 0;
  const percentSaved = typeof compressionResult.spaceSavedPercent === 'number'
    ? `${compressionResult.spaceSavedPercent.toFixed(1)}%`
    : 'n/a';
  console.log(`   ${colors.gray}Compression summary${colors.reset}`);
  console.log(`      • Processed records: ${formatNumber(compressionResult.processed)}`);
  console.log(`      • Space saved: ${formatBytes(savedBytes)} (${percentSaved})`);
  console.log(`      • Average ratio: ${ratio ? ratio.toFixed(3) : 'n/a'}`);
}

function printFinalSummary({
  analysisSummary,
  postRunResult,
  compressionResult,
  snapshotBefore,
  snapshotAfter,
  options,
  colors
}) {
  console.log(`${colors.bold}──── Maintenance Summary ────${colors.reset}`);

  console.log(`${colors.cyan}Analysis${colors.reset}`);
  if (analysisSummary) {
    console.log(`   Pages processed: ${analysisSummary.processed}${analysisSummary.dryRun ? ` ${colors.gray}(dry-run)${colors.reset}` : ''}`);
    console.log(`   Pages updated: ${analysisSummary.updated}`);
    console.log(`   Places inserted: ${analysisSummary.placesInserted}`);
    console.log(`   Hubs inserted / updated: ${analysisSummary.hubsInserted} / ${analysisSummary.hubsUpdated}`);
    console.log(`   Unknown terms captured: ${analysisSummary.unknownInserted}`);
    console.log(`   Skipped entries: ${analysisSummary.skipped}`);
    if (analysisSummary.version != null) {
      console.log(`   Analysis version: ${analysisSummary.version}`);
    }
    printHubAssignments(analysisSummary.hubAssignments, options.listLimit, colors, options.includeEvidence);
  } else if (options.skipAnalysis) {
    console.log(`   Stage skipped (--skip-analysis).`);
  } else {
    console.log(`   Analysis stage did not run.`);
  }

  console.log('');
  console.log(`${colors.cyan}Database health${colors.reset}`);
  if (snapshotAfter.unknownCount != null) {
    const delta = computeDelta(snapshotAfter.unknownCount, snapshotBefore.unknownCount);
    console.log(`   Unknown hub terms: ${formatNumber(snapshotAfter.unknownCount)}${formatDelta(delta, colors)}`);
    printTopUnknownTerms(snapshotAfter.topUnknownTerms, colors);
  } else {
    console.log(`   ${colors.gray}Unknown-term tracking table not available in this database.${colors.reset}`);
  }

  if (snapshotAfter.uncompressedCount != null) {
    const delta = computeDelta(snapshotAfter.uncompressedCount, snapshotBefore.uncompressedCount);
    console.log(`   Uncompressed content blobs: ${formatNumber(snapshotAfter.uncompressedCount)}${formatDelta(delta, colors)}`);
  }

  if (snapshotAfter.compressionStatus) {
    const status = snapshotAfter.compressionStatus;
    console.log(`   Last analysis snapshot: ${formatTimestamp(status.last_analyzed_at)} (version ${status.analysis_version ?? 'n/a'})`);
    console.log(`   Indexed items: ${formatNumber(status.total_items || 0)} | Avg ratio: ${(status.avg_compression_ratio ?? 0).toFixed(3)}`);
  } else if (postRunResult && postRunResult.storageSummary) {
    const storage = postRunResult.storageSummary;
    console.log(`   Storage summary — items: ${formatNumber(storage.total_items || 0)}, uncompressed: ${formatNumber(storage.uncompressed_items || 0)}, avg ratio: ${(storage.avg_compression_ratio || 0).toFixed(3)}`);
  }

  console.log('');
  console.log(`${colors.cyan}Compression cleanup${colors.reset}`);
  if (options.dryRun) {
    console.log(`   Skipped (dry-run mode).`);
  } else if (options.skipCompression) {
    console.log(`   Skipped (--skip-compression).`);
  } else {
    printCompressionDetails(compressionResult, colors);
  }

  console.log(`${colors.bold}────────────────────────────${colors.reset}`);
}

async function main() {
  const options = parseArgs(process.argv);
  const colors = createColorPalette();

  if (options.help) {
    printHelp(colors);
    return;
  }

  const projectRoot = findProjectRoot(__dirname);
  const dbPath = options.dbPath
    ? path.resolve(options.dbPath)
    : path.join(projectRoot, 'data', 'news.db');
  options.dbPath = dbPath;

  console.log(`${colors.bold}🛠️  Scheduled Maintenance Cycle${colors.reset}`);
  console.log(`${colors.gray}   Database:${colors.reset} ${dbPath}`);
  console.log(`${colors.gray}   Mode:${colors.reset} ${options.dryRun ? 'Dry-run (no changes will be written)' : 'Apply changes'}`);
  console.log(`${colors.gray}   Analysis limit:${colors.reset} ${options.analysisLimit === 0 ? 'no limit' : formatNumber(options.analysisLimit)}`);
  if (options.skipAnalysis) console.log(`${colors.gray}   Analysis stage:${colors.reset} skipped`);
  if (options.skipCompression) console.log(`${colors.gray}   Compression cleanup:${colors.reset} skipped`);
  console.log('');

  const overallStart = Date.now();
  const snapshotBefore = collectMaintenanceSnapshot(dbPath, { topUnknownLimit: options.listLimit });

  let analysisResult = null;
  let analysisSummary = null;
  if (!options.skipAnalysis) {
    const progressPrinter = createProgressPrinter({ colors, intervalMs: options.progressIntervalMs });
    analysisResult = await runStage('Running content analysis', async () => {
      const collectHubs = options.listLimit > 0 || options.includeEvidence;
      const summary = await analysePages({
        dbPath,
        analysisVersion: options.analysisVersion,
        limit: options.analysisLimit,
        verbose: options.verbose,
        dryRun: options.dryRun,
        collectHubSummary: collectHubs,
        hubSummaryLimit: collectHubs ? Math.max(options.listLimit, 0) : 0,
        includeHubEvidence: options.includeEvidence,
        onProgress: progressPrinter
      });
      progressPrinter.flush();
      return summary;
    }, colors);
    analysisSummary = summarizeAnalysis(analysisResult, options, colors);
  } else {
    logSkip('Running content analysis', '--skip-analysis supplied', colors);
  }

  let postRunResult = null;
  if (!options.dryRun && analysisResult) {
    postRunResult = await runStage('Refreshing compression telemetry', async () => {
      return runAnalysisPostProcessing({
        dbPath,
        summary: analysisResult,
        logger: console
      });
    }, colors);
  } else if (options.dryRun) {
    logSkip('Refreshing compression telemetry', 'Dry-run mode', colors);
  } else if (!analysisResult) {
    logSkip('Refreshing compression telemetry', 'Analysis output unavailable', colors);
  }

  let compressionResult = null;
  if (!options.dryRun && !options.skipCompression) {
    const snapshotBeforeCompression = collectMaintenanceSnapshot(dbPath, { topUnknownLimit: 0 });
    if ((snapshotBeforeCompression.uncompressedCount || 0) > 0) {
      compressionResult = await runStage('Compression cleanup', async () => {
        return compressUncompressedRecords({ dbPath });
      }, colors);
    } else {
      logSkip('Compression cleanup', 'No uncompressed records detected', colors);
    }
  } else if (options.skipCompression) {
    logSkip('Compression cleanup', '--skip-compression supplied', colors);
  } else if (options.dryRun) {
    logSkip('Compression cleanup', 'Dry-run mode', colors);
  }

  const snapshotAfter = collectMaintenanceSnapshot(dbPath, { topUnknownLimit: options.listLimit });

  printFinalSummary({
    analysisSummary,
    postRunResult,
    compressionResult,
    snapshotBefore,
    snapshotAfter,
    options,
    colors
  });

  const totalDuration = Date.now() - overallStart;
  console.log(`\n${colors.green}✨ Maintenance cycle completed in ${formatDuration(totalDuration)}.${colors.reset}`);
  if (options.dryRun) {
    console.log(`${colors.gray}Dry-run mode: no changes were written to the database.${colors.reset}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    const colors = createColorPalette();
    console.error(`${colors.red}Fatal error: ${error.message || error}${colors.reset}`);
    process.exit(1);
  });
}


