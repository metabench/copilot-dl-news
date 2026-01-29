#!/usr/bin/env node
'use strict';

const path = require('path');
// Script is now in tools/cleanup/, so go up 2 levels to reach src/
const { CliFormatter } = require('../../src/shared/utils/CliFormatter');
const { CliArgumentParser } = require('../../src/shared/utils/CliArgumentParser');

const {
  createLargeArtifactsPruneObservable,
  formatBytes
} = require('../../src/tools/largeArtifactsPruner');

const fmt = new CliFormatter();

try {
  if (process.stdout && typeof process.stdout.on === 'function') {
    process.stdout.on('error', (err) => {
      if (err && err.code === 'EPIPE') process.exit(0);
    });
  }
} catch (_) { }

function parseCliArgs(argv) {
  const parser = new CliArgumentParser(
    'prune-large-artifacts',
    'Identify and delete unneeded large repo artifacts (dry-run by default).'
  );

  parser
    .add('--repo <dir>', 'Repo root directory (defaults to current repo)', '')
    .add('--apply', 'Actually delete files (default: dry-run)', false, 'boolean')
    .add('--max-export-mb <n>', 'Maximum exported data to keep (MB)', 512, 'number')
    .add('--keep-db <path...>', 'DB file(s) to always keep (relative to repo root). Repeatable.', ['data/news.db', 'data/gazetteer.db'])
    .add('--no-keep-db-sidecars', 'Do not keep -wal/-shm sidecars for kept DBs', false, 'boolean')
    .add('--export-dir <path...>', 'Export directory roots to enforce the export budget on', ['migration-export'])
    .add('--delete-dir <path...>', 'Directory roots whose files should be deleted entirely', [
      'migration-temp',
      'data/backups',
      'data/perf-snapshots'
    ])
    .add('--json', 'Emit JSON events only (no formatted output)', false, 'boolean')
    .add('--quiet', 'Suppress ASCII summary (still exits with proper code)', false, 'boolean');

  return parser.parse(argv);
}

function normalizeOptions(raw) {
  const repoRoot = raw.repo
    ? (path.isAbsolute(raw.repo) ? raw.repo : path.resolve(process.cwd(), raw.repo))
    : path.resolve(__dirname, '..', '..');  // Go up 2 levels from tools/cleanup/

  const keepDbPaths = Array.isArray(raw.keepDb) ? raw.keepDb : [raw.keepDb].filter(Boolean);
  const exportDirs = Array.isArray(raw.exportDir) ? raw.exportDir : [raw.exportDir].filter(Boolean);
  const deleteDirs = Array.isArray(raw.deleteDir) ? raw.deleteDir : [raw.deleteDir].filter(Boolean);

  const maxExportMb = Number.isFinite(raw.maxExportMb) ? raw.maxExportMb : 512;

  return {
    repoRoot,
    apply: Boolean(raw.apply),
    maxExportMb,
    keepDbPaths,
    keepDbSidecars: raw.keepDbSidecars !== false,
    exportDirs,
    deleteDirs,
    ignoreIfTracked: true,
    json: Boolean(raw.json),
    quiet: Boolean(raw.quiet)
  };
}

function renderPlanSummary(summary) {
  fmt.header('Prune Large Artifacts');

  fmt.section('Mode');
  fmt.stat('Apply deletes', summary.apply ? 'YES' : 'NO (dry-run)');
  fmt.stat('Export budget', `${summary.export.budgetBytes} bytes (${formatBytes(summary.export.budgetBytes)})`);

  fmt.section('Keep (DB)');
  const keepDbItems = [];
  for (const db of summary.keepDb || []) {
    keepDbItems.push(db.path);
    if (db.sidecars) {
      keepDbItems.push(`  ${db.path}-wal`);
      keepDbItems.push(`  ${db.path}-shm`);
      keepDbItems.push(`  ${db.path}-journal`);
    }
  }
  fmt.list('Keep list', keepDbItems.length ? keepDbItems : ['(none)']);

  fmt.section('Export policy');
  fmt.stat('Export roots', (summary.export.dirs || []).join(', ') || '(none)');
  fmt.stat('Keep count', summary.export.keepCount);
  fmt.stat('Keep bytes', formatBytes(summary.export.keepBytes));
  fmt.stat('Delete count', summary.export.deleteCount);
  fmt.stat('Delete bytes', formatBytes(summary.export.deleteBytes));

  fmt.section('Delete dirs (purge)');
  fmt.list('Purge roots', (summary.deleteDirs || []).length ? summary.deleteDirs : ['(none)']);

  fmt.section('Planned deletions');
  fmt.stat('Count', summary.stats.deletionCount);
  fmt.stat('Bytes', summary.stats.deletionBytesHuman);
}

async function main() {
  const raw = parseCliArgs(process.argv);
  const opts = normalizeOptions(raw);

  const obs = createLargeArtifactsPruneObservable({
    repoRoot: opts.repoRoot,
    apply: opts.apply,
    maxExportMb: opts.maxExportMb,
    keepDbPaths: opts.keepDbPaths,
    keepDbSidecars: opts.keepDbSidecars,
    exportDirs: opts.exportDirs,
    deleteDirs: opts.deleteDirs,
    ignoreIfTracked: true
  });

  let hadError = false;
  let summary = null;

  if (!opts.json && !opts.quiet) {
    fmt.info(`Repo: ${opts.repoRoot}`);
    fmt.info(opts.apply ? 'Apply mode enabled (will delete files).' : 'Dry-run mode (no deletions).');
  }

  obs.on('next', (ev) => {
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(ev)}\n`);
      return;
    }

    if (opts.quiet) return;

    if (!ev || typeof ev !== 'object') return;

    if (ev.type === 'plan' && ev.planSummary) {
      summary = ev.planSummary;
      renderPlanSummary(summary);
      return;
    }

    if (ev.type === 'dry-run' && Array.isArray(ev.plannedDeletions)) {
      fmt.section('Top planned deletions (preview)');
      fmt.table(
        ev.plannedDeletions.slice(0, 20).map((d) => ({
          size: d.sizeHuman,
          category: d.category,
          path: d.rel
        }))
      );
      return;
    }

    if (ev.type === 'delete') {
      fmt.success(`Deleted ${ev.sizeHuman}: ${ev.rel}`);
      return;
    }

    if (ev.type === 'skip' && ev.reason === 'git-tracked') {
      fmt.warning(`Skipped tracked file: ${ev.rel}`);
      return;
    }

    if (ev.type === 'delete:error') {
      fmt.error(`Delete failed: ${ev.rel} (${ev.message})`);
      hadError = true;
    }

    if (ev.type === 'done' && ev.result) {
      fmt.section('Result');
      fmt.stat('Applied', ev.result.applied ? 'YES' : 'NO');
      fmt.stat('Planned deletions', ev.result.deletionCount);
      fmt.stat('Planned bytes', ev.result.deletionBytesHuman);
      if (ev.result.applied) {
        fmt.stat('Deleted', ev.result.deletedCount);
        fmt.stat('Deleted bytes', ev.result.deletedBytesHuman);
        fmt.stat('Skipped tracked', ev.result.skippedTracked);
      }
    }
  });

  obs.on('error', (err) => {
    hadError = true;
    if (opts.json) {
      process.stdout.write(`${JSON.stringify({ type: 'error', message: String((err && err.message) || err) })}\n`);
    } else {
      fmt.error(String((err && err.stack) || err));
    }
  });

  obs.on('complete', () => {
    process.exit(hadError ? 1 : 0);
  });
}

main().catch((err) => {
  fmt.error(String((err && err.stack) || err));
  process.exit(1);
});

