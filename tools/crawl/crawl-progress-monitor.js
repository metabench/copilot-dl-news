#!/usr/bin/env node
'use strict';

/**
 * tools/crawl/crawl-progress-monitor.js
 *
 * Thin CLI over the writer-DB-aware crawl-progress monitor. READ-ONLY: it never
 * starts a crawler, contacts a remote host, writes DB rows, or mutates a queue.
 *
 * Usage:
 *   node tools/crawl/crawl-progress-monitor.js progress \
 *     --writer-db data/samples/internet-small-sample.db \
 *     --target-downloads 1000 --elapsed-ms 42000 --json
 *
 *   # with a baseline snapshot for DB-growth math:
 *   node tools/crawl/crawl-progress-monitor.js progress \
 *     --writer-db data/samples/internet-small-sample.db \
 *     --baseline tmp/iso-sample-before.json --target-downloads 1000 --json
 *
 * The monitor reads the WRITER DB the crawl was redirected to (via
 * `run.js --crawl-db <path>`), NOT the default production meter DB — closing the
 * `fetched=0` false-negative gap for isolated scaled crawls.
 */

const fs = require('fs');
const path = require('path');

const {
  collectCrawlProgress,
  renderCrawlProgressText,
} = require('./lib/crawl-progress-monitor');

function parseArgs(argv = process.argv.slice(2)) {
  const mode = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'progress';
  const start = mode === argv[0] ? 1 : 0;
  const args = { mode, json: false };
  for (let i = start; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--json') { args.json = true; continue; }
    if (token === '--help' || token === '-h') { args.help = true; continue; }
    if (!token.startsWith('--')) throw new Error(`unexpected positional argument: ${token}`);
    const eq = token.indexOf('=');
    if (eq !== -1) { args[token.slice(2, eq)] = token.slice(eq + 1); continue; }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) { args[key] = true; continue; }
    args[key] = next;
    i += 1;
  }
  return args;
}

function showHelp() {
  console.log(`crawl-progress-monitor - writer-DB-aware crawl progress packet (read-only)

Usage:
  node tools/crawl/crawl-progress-monitor.js progress --writer-db <path> [options]

Options:
  --writer-db <path>           Writer (sample) DB the crawl wrote to (required)
  --target-downloads <n>       Operator download target (e.g. 1000)
  --elapsed-ms <ms>            Elapsed crawl time in ms (for throughput/ETA)
  --baseline <path>            Pre-crawl snapshot JSON for DB-growth math
  --stall-timeout-ms <ms>      Stall threshold, default 60000
  --distinct-hosts <n>         Distinct hosts seen (optional)
  --now <iso>                  Override "now" (for deterministic ETA)
  --out <path>                 Write the packet JSON to a file
  --json                       Machine-readable output

No-action policy: read-only. Opens the writer DB read-only and emits a progress
packet. Does NOT start crawlers, contact remote hosts, write DB rows, prune
queues, or force deploy.`);
}

function loadBaselineSnapshot(baselinePath) {
  if (!baselinePath) return null;
  const resolved = path.resolve(baselinePath);
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  // Tolerate several artifact shapes: a raw snapshot, a baseline artifact with
  // database.snapshot, the both-DB snapshot from tmp/snapshot-both-dbs.js
  // (`{ sample: { totals, latestFetchedAt }, production: { totals } }`), or the
  // iso-proof "sample.before" flattened totals.
  if (raw.totals) return raw;
  if (raw.database && raw.database.snapshot) return raw.database.snapshot;
  if (raw.sample && raw.sample.totals) {
    return { totals: raw.sample.totals, latestFetchedAt: raw.sample.latestFetchedAt };
  }
  if (raw.production && raw.production.totals && !raw.sample) {
    return { totals: raw.production.totals, latestFetchedAt: raw.production.latestFetchedAt };
  }
  if (raw.sample && raw.sample.before) return { totals: raw.sample.before, latestFetchedAt: raw.sample.before.latestFetchedAt };
  if (raw.before) return { totals: raw.before, latestFetchedAt: raw.before.latestFetchedAt };
  return raw;
}

function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) { showHelp(); return 0; }
  if (args.mode !== 'progress') {
    console.error(`unknown mode: ${args.mode}`);
    showHelp();
    return 2;
  }
  const writerDb = args['writer-db'] || args.writerDb;
  if (!writerDb || writerDb === true) {
    console.error('error: --writer-db <path> is required');
    return 2;
  }

  const options = {
    writerDbPath: writerDb,
    targetDownloads: args['target-downloads'] != null ? Number(args['target-downloads']) : 0,
    elapsedMs: args['elapsed-ms'] != null ? Number(args['elapsed-ms']) : undefined,
    baseline: loadBaselineSnapshot(args.baseline),
    stallTimeoutMs: args['stall-timeout-ms'] != null ? Number(args['stall-timeout-ms']) : undefined,
    distinctHosts: args['distinct-hosts'] != null ? Number(args['distinct-hosts']) : null,
    now: typeof args.now === 'string' ? args.now : undefined,
  };

  const packet = collectCrawlProgress(options);

  if (args.out && args.out !== true) {
    fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(packet, null, 2)}\n`);
  }
  if (args.json) {
    console.log(JSON.stringify(packet, null, 2));
  } else {
    process.stdout.write(renderCrawlProgressText(packet));
  }
  // Exit code: 0 normal/in-progress/reached; 3 stalled or writer-db missing.
  if (packet.stalled || packet.writerDb.exists === false) return 3;
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = runCli();
  } catch (err) {
    console.error(`crawl-progress-monitor error: ${err.message}`);
    process.exitCode = 2;
  }
}

module.exports = { parseArgs, runCli, loadBaselineSnapshot };
