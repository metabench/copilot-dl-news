#!/usr/bin/env node
/**
 * crawl-remote.js — CLI for controlling the Multi-Domain Crawl Server
 * ════════════════════════════════════════════════════════════════════
 *
 * Controls the remote multi-domain crawl server and pulls data
 * in 10-second batches for instant ingestion into local news.db.
 *
 * Commands:
 *   status          Show all domain crawl status
 *   health          Quick health check
 *   start           Start crawling (all or specific domains)
 *   stop            Stop crawling (all or specific domains)
 *   seed            Seed URLs for a domain
 *   add             Add a new domain to the remote server
 *   remove          Remove a domain from the remote server
 *   pull            Pull a single batch and save to local DB
 *   sync            Continuous sync loop (pull every 10s)
 *   errors          Show recent errors
 *   content         Content stats by domain
 *   queue-summary   Read-only queue/deploy-readiness summary
 *   queue-checklist Read-only queue maintenance checklist
 *   readiness-report File-only combined graph/queue/deploy readiness report
 *   maintenance-decision File-only approval-gated queue maintenance decision
 *   maintenance-execution-plan File-only dry-run maintenance execution skeleton
 *   sync-proof-readiness File-only sync/local DB proof readiness plan
 *   second-seed-readiness File-only second graph-feedback seed readiness gate
 *   profiles        List available crawl profiles
 *
 * Usage:
 *   node tools/crawl/crawl-remote.js status --host 141.144.193.218:3200
 *   node tools/crawl/crawl-remote.js --profile remote-guardian-bbc-2new
 *   npm run crawl:remote -- --profile remote-status
 *   npm run crawl:remote:bbc-guardian
 *
 * @module tools/crawl/crawl-remote
 */

'use strict';

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
const {
  findMissingDomains,
  normalizeCollectOptions,
  normalizeDomains,
  resolveTargetDomains,
  summarizeHostVerification,
  summarizeBoundedRun,
} = require('./lib/crawl-remote-bounded');
const { createAdaptiveBatchController } = require('./lib/adaptive-sync-batching');
const {
  shouldPruneAfterIngest: shouldPruneAfterIngestPure,
  validatePruneExportConfig: validatePruneExportConfigPure,
} = require('./lib/prune-config');
const { evaluateStorageBudget, normalizeStorageBudgetOptions } = require('./lib/storage-budget');
const { evaluateBackpressure } = require('./lib/backpressure');
const { createPerfReporter } = require('./lib/perf-reporter');
const {
  buildCombinedReadinessReport,
  buildQueueMaintenanceDecisionArtifact,
  buildQueueMaintenanceExecutionPlanArtifact,
  buildQueueMaintenanceChecklist,
  buildQueueSummary,
  buildSecondSeedReadinessArtifact,
  buildSyncLocalProofReadinessArtifact,
  normalizeQueueOptions,
  renderCombinedReadinessReportText,
  renderQueueMaintenanceDecisionText,
  renderQueueMaintenanceExecutionPlanText,
  renderQueueMaintenanceChecklistText,
  renderQueueSummaryText,
  renderSecondSeedReadinessText,
  renderSyncLocalProofReadinessText,
} = require('./lib/remote-queue-summary');

// ── Arg Parsing ─────────────────────────────────────────────

const argv = process.argv.slice(2);
// If argv[0] is a flag (starts with --), treat all as flags and default to 'status'
const command = (argv[0] && !argv[0].startsWith('--')) ? argv[0] : 'status';
const argsStartIdx = (argv[0] && !argv[0].startsWith('--')) ? 1 : 0;

const args = {};
for (let i = argsStartIdx; i < argv.length; i++) {
  const arg = argv[i];
  if (arg.startsWith('--')) {
    const eqIdx = arg.indexOf('=');
    if (eqIdx !== -1) {
      args[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
    } else {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
}

// ── Profile Loading ─────────────────────────────────────────
// --profile <name-or-path> loads a JSON file whose keys become arg defaults.
// Bare names (no path separators, no .json suffix) are resolved from the
// profiles/ directory next to this script, e.g. --profile remote-guardian-bbc-2new
// Explicit CLI flags always override profile values.
const PROFILES_DIR = path.join(__dirname, 'profiles');
let resolvedProfilePath = null;
let effectiveCommand = command;

if (args.profile) {
  const raw = String(args.profile);
  // Try as-is first (absolute or relative path)
  let profilePath = path.resolve(raw);
  if (!fs.existsSync(profilePath)) {
    // Try adding .json
    profilePath = path.resolve(raw + '.json');
  }
  if (!fs.existsSync(profilePath)) {
    // Try inside the profiles/ directory
    profilePath = path.join(PROFILES_DIR, raw);
    if (!fs.existsSync(profilePath)) {
      profilePath = path.join(PROFILES_DIR, raw + '.json');
    }
  }
  if (!fs.existsSync(profilePath)) {
    // List available profiles to help the user
    const available = fs.existsSync(PROFILES_DIR)
      ? fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))
      : [];
    console.error(`Profile not found: ${raw}`);
    if (available.length) {
      console.error(`Available profiles: ${available.join(', ')}`);
    }
    process.exit(1);
  }
  resolvedProfilePath = profilePath;
  try {
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    // Merge profile.options (the common structure) into args as defaults
    const optionsToMerge = profile.options || {};
    for (const [key, value] of Object.entries(optionsToMerge)) {
      if (key.startsWith('$')) continue;
      if (args[key] === undefined) {
        args[key] = value;
      }
    }
    // Also merge top-level keys (excluding reserved ones) for backward compat
    for (const [key, value] of Object.entries(profile)) {
      if (['options', 'positionals', 'tool', 'description', '$comment', '$schema'].includes(key)) continue;
      if (key.startsWith('$')) continue;
      if (args[key] === undefined) {
        args[key] = value;
      }
    }
    // Profile can specify the command via positionals[0] when no explicit command was given
    if (profile.positionals && profile.positionals[0] && command === 'status') {
      effectiveCommand = profile.positionals[0];
    }
  } catch (err) {
    console.error(`Failed to parse profile ${profilePath}: ${err.message}`);
    process.exit(1);
  }
  delete args.profile; // consumed
}

if (effectiveCommand === 'help' || args.help || args.h) {
  console.log(`crawl-remote.js — Multi-Domain Crawl Server CLI

Usage:  node tools/crawl/crawl-remote.js <command> [options]

Commands:
  status                    Show all domain crawl status
  health                    Quick health check
  start [--domain d|--all]  Start crawling
  launch [--domain d|--domains d1,d2] Register missing domains, start crawling, and return
  collect [--domains d1,d2] One-command crawl: preflight, start, sync, verify, stop, drain
  graph-seeds [--domains d1,d2]  Explore local DB link graph to find unvisited pages
  bounded [--domain d|--domains d1,d2]  Start bounded crawl and wait for completion
  stop  [--domain d|--all]  Stop crawling
  run   [--domain d|--all]  Start crawling, sync continuously, and stop on exit
  seed  --domain d --urls u1,u2  Seed URLs
  add   --domain d          Add domain to server
  remove --domain d         Remove domain from server
  pull  [--window 10]       Pull one batch to local DB
  sync  [--interval 5]      Continuous timestamped batch sync loop
  errors [--limit 50]       Show recent errors
  content                   Content stats by domain
  queue-summary [--domains d1,d2]
                            Read-only queue/deploy-readiness summary
  queue-checklist [--domains d1,d2]
                            Read-only queue maintenance checklist
  readiness-report --queue-summary <path>
                            File-only combined graph/queue/deploy readiness report
  maintenance-decision --readiness-report <path>
                            File-only approval-gated queue maintenance decision
  maintenance-execution-plan --maintenance-decision <path>
                            File-only dry-run maintenance execution skeleton
  sync-proof-readiness --readiness-report <path>
                            File-only bounded sync/local proof readiness plan
  second-seed-readiness --queue-summary <path>
                            File-only second graph-feedback seed readiness gate
  watch [--domains d1,d2]   Stay attached and poll status until terminal
                              (--watch-interval ms, --watch-timeout sec, --json)
  profiles                  List available crawl profiles

Shortcuts (npm run):
  npm run crawl:remote -- <command> [options]
  npm run crawl:remote -- --profile <name>
  npm run crawl:remote:bbc-guardian          (BBC+Guardian streaming crawl)
  npm run crawl:remote:profiles              (list profiles)

Options:
  --host <host:port>     Remote server (default: env/resolver or 141.144.193.218:3200)
  --db <path>            Local DB path (default: data/news.db)
  --profile <name|path>  Load a JSON profile (bare name resolved from profiles/ dir)
                         e.g. --profile remote-guardian-bbc-2new
  --domain <domain>      Target domain for start/stop/seed/add/remove
  --all                  Affect all domains
  --seed-from-graph      Explore local link graph and push unvisited URLs as remote seeds (default: true for collect)
  --graph-seed-limit <n> Max unvisited URLs to seed per domain from local graph (default: target-pages * 2)
  --sync-mode <mode>     Sync mode: 'polling' (default) or 'streaming' (SSE push)
  --sync-batch-size <n>  Streaming: flush after N pages (default: 1 = immediate)
  --sync-batch-window-ms <n> Streaming: flush after N ms (default: 500)
  --window <seconds>     Batch window in seconds (default: 10)
  --since <timestamp>    Override the first sync watermark for catch-up/drain runs
  --interval <seconds>   Sync polling interval (default: 5 for sync, 10 for run)
  --rounds <n>           Stop sync after n rounds (useful for checks)
  --limit <n>            Limit for queries (default: 500)
  --max-domains <n>      Queue summary domain cap (default: 25, max: 50)
  --error-limit <n>      Queue summary recent error cap (default: 10, max: 50)
  --maintenance-checklist Print queue maintenance checklist from queue-summary
  --queue-summary <path> Readiness report input: saved queue-summary JSON
  --deploy-proof <path>  Readiness report input: saved deploy preflight JSON
  --graph-artifact <path> Readiness report input: saved graph-feedback artifact JSON
  --preview-evidence <path> Readiness report input: saved live-seed preview evidence JSON
  --post-seed-checklist <path> Readiness report input: saved post-seed proof/checklist JSON
  --stale-after-min <n>  Readiness report freshness warning threshold (default: 60)
  --readiness-report <path> Maintenance/sync-proof input: saved readiness-report JSON
  --maintenance-decision <path> Execution-plan input: saved maintenance-decision JSON
  --sync-proof-readiness <path> Execution-plan input: saved sync-proof-readiness JSON
  --maintenance-execution-plan <path> Second-seed input: saved maintenance execution plan JSON
  --max-hosts <n>       Second-seed readiness cap (default: 1, max: 5)
  --max-candidates-per-host <n> Second-seed readiness cap (default: 3, max: 10)
  --max-total-candidates <n> Second-seed readiness cap (default: 3, max: 25)
  --maintenance-action <a> Maintenance action: retain-queue, sync-local-proof, stop-only, prune, drain, clear, force-deploy
  --approval-token <token> Record approval token presence in file-only decision output
  --out <path>           Write queue summary/checklist/report JSON to a compact file
  --adaptive-limit       Adjust sync export limit toward --target-sync-ms
  --adaptive-batching    Alias for --adaptive-limit
  --target-sync-ms <n>   Target fetch+ingest+verify+prune duration; enables adaptive batching
  --min-limit <n>        Minimum adaptive export limit (default: 1)
  --max-limit <n>        Maximum adaptive export limit (default: initial --limit)
  --include-content <bool> Include content blobs in export batches (default: true)
  --include-links <bool> Include discovered links in export batches when supported (default: true)
  --prune-after-ingest   Confirm local save, then prune exported payloads from the remote node
  --prune-delete-links   Also delete exported link rows; default keeps them for future frontier promotion
  --prune-delete-urls    Also delete remote URL state rows after ingest (unsafe while crawls are active)
  --no-backoff           Keep the configured interval even after empty sync rounds
  --remote-storage-budget-mb <n>   Soft cap on remote content storage (MB); above this, sync prefers small drain batches
  --remote-storage-reserve-mb <n>  Hard reserve above the budget; above (budget+reserve), request remote /api/throttle pause
  --normal-concurrency <n>         Worker concurrency to restore when budget returns to normal (default: --max-concurrent or 10)
  --reduced-concurrency <n>        Worker concurrency under storage pressure (default: 2)
  --perf-summary-every <n>         Print p50/p95 perf summary every N rounds (default: 10)
  --max-pages <n>        Max pages when adding domain (default: 50)
  --max-depth <n>        Remote link-follow depth for start/collect (default: remote server default)
  --max-concurrent <n>   Max domains to crawl in parallel for start/bounded/run
  --seed-urls <csv>      Hub/front-page URLs to queue for all requested domains when not already known
  --seed-urls-by-domain <spec> Domain hub URL map: domain=url1|url2;domain=url3
  --use-graph-feedback-seeds
                         Not supported here; use tools/crawl/index.js with
                         --graph-feedback-artifact and explicit live seed gates
  --target-pages <n>     Local successful downloaded pages per host for collect (default: 100)
  --min-new-pages <n>    Require N genuinely new pages per host (stored after collect starts)
  --min-complete-hosts <n> Number of hosts that must reach --target-pages (and --min-new-pages) before collect stops
  --verify-every <n>     Verify local host counts every N collect rounds (default: 1)
  --drain-empty-rounds <n> Empty export rounds to drain after collect target is met (default: 3)
  --max-status-failures <n> Exit collect after empty rounds plus repeated status failures (default: max(3, drain+1))
  --start-retries <n>    Retry transient remote start failures (default: 3 for collect)
  --no-prune-after-ingest Disable collect's default confirmed exact-ID remote prune
  --agent-log <path>    Write structured JSONL telemetry for agents ({ts} and {command} supported)
  --verbose-telemetry     Enable all verbose output (page latency, phase timing, per-host stats)
  --show-page-latency    Show per-page download timings with latency in each batch
  --show-phase-timing    Show timing breakdown for each crawl phase (preflight, graph, seeding, sync)
  --show-per-host-stats  Show per-host download stats in each batch
  --no-color             Disable ANSI colour in human output
  --no-emoji             Disable emoji markers in human output
  --poll <seconds>       Poll interval for bounded wait (default: 5)
  --timeout-min <n>      Timeout in minutes for bounded wait (default: 30)
  --json                 Output raw JSON
  --help                 Show this help
`);
  process.exit(0);
}

if (args['use-graph-feedback-seeds'] || args.useGraphFeedbackSeeds || args['graph-feedback-artifact'] || args.graphFeedbackArtifact) {
  console.error('Graph-feedback live seeding is only supported through tools/crawl/index.js remote start-like commands.');
  console.error('Use: node tools/crawl/index.js remote bounded --domains <hosts> --graph-feedback-artifact <path> --use-graph-feedback-seeds');
  process.exit(1);
}

let defaultHost = '127.0.0.1:3200';
try {
  const { getFleetHostSync } = require('./lib/fleet-host-resolver');
  defaultHost = `${getFleetHostSync()}:3200`;
} catch (e) {
  // fallback if resolver fails
}

const REMOTE_HOST = args.host || process.env.CRAWL_REMOTE_HOST || defaultHost;
const LOCAL_DB_PATH = args.db || path.resolve(__dirname, '../../data/news.db');
const WATERMARK_FILE = path.resolve(__dirname, '.crawl-remote-watermark.json');
const JSON_OUTPUT = args.json === true;
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const COLOR_OUTPUT = !JSON_OUTPUT
  && args['no-color'] !== true
  && process.env.NO_COLOR === undefined
  && (process.stdout.isTTY || process.env.FORCE_COLOR);
const EMOJI_OUTPUT = !JSON_OUTPUT && args['no-emoji'] !== true;
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};
const ICONS = {
  adaptive: '⚙️',
  batch: '📦',
  collect: '🕷️',
  db: '🗄️',
  drain: '🚰',
  error: '❌',
  feature: '✨',
  health: '💚',
  ledger: '📒',
  ok: '✅',
  prune: '🧹',
  remote: '🌐',
  setup: '🧰',
  start: '🚀',
  stop: '⏹️',
  sync: '🔄',
  target: '🎯',
  verify: '🔎',
  warn: '⚠️',
};

function paint(name, text) {
  const value = String(text);
  if (!COLOR_OUTPUT || !ANSI[name]) return value;
  return `${ANSI[name]}${value}${ANSI.reset}`;
}

function icon(name, fallback = '') {
  return EMOJI_OUTPUT ? (ICONS[name] || fallback) : fallback;
}

function printBanner(title, subtitle = '') {
  if (JSON_OUTPUT) return;
  console.log(paint('cyan', '═══════════════════════════════════════════════════════'));
  console.log(`  ${paint('bold', title)}`);
  if (subtitle) console.log(`  ${paint('dim', subtitle)}`);
  console.log(paint('cyan', '═══════════════════════════════════════════════════════'));
}

function printFeature(iconName, label, value, detail = '') {
  if (JSON_OUTPUT) return;
  const head = `${icon(iconName)} ${paint('bold', label)}`.trim();
  const suffix = detail ? ` ${paint('dim', detail)}` : '';
  console.log(`  ${head}: ${value}${suffix}`);
}

function printStep(iconName, message, color = 'cyan') {
  if (JSON_OUTPUT) return;
  console.log(`  ${icon(iconName)} ${paint(color, message)}`);
}

let agentLogFile = undefined;

function resolveAgentLogFile() {
  const raw = args['agent-log'] ?? args.agentLog;
  if (!raw) return null;
  const template = raw === true
    ? 'data/crawl-agent-runs/crawl-{command}-{ts}.jsonl'
    : String(raw);
  const rendered = template
    .replace(/\{ts\}/g, RUN_ID)
    .replace(/\{command\}/g, effectiveCommand);
  return path.resolve(process.cwd(), rendered);
}

function initAgentLog() {
  if (agentLogFile !== undefined) return agentLogFile;
  agentLogFile = resolveAgentLogFile();
  if (agentLogFile) {
    fs.mkdirSync(path.dirname(agentLogFile), { recursive: true });
    if (!isTrueArg('agent-log-append') && !isTrueArg('agentLogAppend')) {
      fs.writeFileSync(agentLogFile, '');
    }
  }
  return agentLogFile;
}

let taskEventWriter = null;

function writeAgentEvent(type, payload = {}) {
  const ts = new Date().toISOString();
  const file = initAgentLog();
  if (file) {
    const event = {
      ts,
      runId: RUN_ID,
      command: effectiveCommand,
      type,
      ...payload,
    };
    fs.appendFileSync(file, `${JSON.stringify(event)}\n`);
  }

  // Push to local db task_events for UI observability
  if (effectiveCommand === 'collect' && localDb) {
    if (!taskEventWriter) {
      const { TaskEventWriter } = require('../../src/db/TaskEventWriter');
      taskEventWriter = new TaskEventWriter(localDb, { batchWrites: false });
    }

    // Map event type for task_events readability
    let mappedType = type;
    if (type.startsWith('collect:')) {
      mappedType = type.replace('collect:', 'crawl:');
    }

    // Format payload for task_events schema requirements
    let item_count = payload.downloaded || payload.count || payload.urls || payload.pagesDownloaded || 0;

    taskEventWriter.write({
      taskType: 'remote_crawl',
      taskId: RUN_ID,
      eventType: mappedType,
      data: { ...payload, count: item_count },
      ts: ts,
    });
  }
}

function getDbApi(name) {
  const dbModule = resolveNewsCrawlerDbModule();
  const fn = dbModule[name];
  if (typeof fn !== 'function') {
    throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
  }
  return fn;
}

let configureRemoteCrawlLocalSyncDb;
let getRemoteCrawlerLocalSetupSnapshot;
let listRemoteCrawlerSuccessfulDownloadCountsByHost;
let verifyRemoteCrawlBatchPersisted;
let listUnvisitedDiscoveredLinksForDomainFn;

function getConfigureRemoteCrawlLocalSyncDb() {
  if (!configureRemoteCrawlLocalSyncDb) {
    configureRemoteCrawlLocalSyncDb = getDbApi('configureRemoteCrawlLocalSyncDb');
  }
  return configureRemoteCrawlLocalSyncDb;
}

function getRemoteCrawlerLocalSetupSnapshotFn() {
  if (!getRemoteCrawlerLocalSetupSnapshot) {
    getRemoteCrawlerLocalSetupSnapshot = getDbApi('getRemoteCrawlerLocalSetupSnapshot');
  }
  return getRemoteCrawlerLocalSetupSnapshot;
}

function getListRemoteCrawlerSuccessfulDownloadCountsByHost() {
  if (!listRemoteCrawlerSuccessfulDownloadCountsByHost) {
    listRemoteCrawlerSuccessfulDownloadCountsByHost = getDbApi('listRemoteCrawlerSuccessfulDownloadCountsByHost');
  }
  return listRemoteCrawlerSuccessfulDownloadCountsByHost;
}

function getVerifyRemoteCrawlBatchPersisted() {
  if (!verifyRemoteCrawlBatchPersisted) {
    verifyRemoteCrawlBatchPersisted = getDbApi('verifyRemoteCrawlBatchPersisted');
  }
  return verifyRemoteCrawlBatchPersisted;
}

function getListUnvisitedDiscoveredLinksForDomain() {
  if (!listUnvisitedDiscoveredLinksForDomainFn) {
    listUnvisitedDiscoveredLinksForDomainFn = getDbApi('listUnvisitedDiscoveredLinksForDomain');
  }
  return listUnvisitedDiscoveredLinksForDomainFn;
}

/**
 * Explore the local DB link graph to find unvisited URLs for the given domains.
 * Returns an object keyed by domain with arrays of unvisited target URLs.
 *
 * @param {string[]} domains - Target domains to explore
 * @param {object} [options] - Options
 * @param {number} [options.limit=20] - Max unvisited links per domain
 * @returns {object} { byDomain: { [domain]: [...urls] }, totalUnvisited: number }
 */
function exploreLocalGraph(domains, options = {}) {
  const limit = Number(options.limit) || 20;
  const db = openLocalDb();
  const fn = getListUnvisitedDiscoveredLinksForDomain();
  const byDomain = {};
  let totalUnvisited = 0;
  for (const domain of domains) {
    try {
      const rows = fn(db, { domain, limit });
      byDomain[domain] = rows;
      totalUnvisited += rows.length;
    } catch (err) {
      byDomain[domain] = { error: err.message };
    }
  }
  return { byDomain, totalUnvisited };
}

/**
 * Push graph-discovered unvisited URLs to the remote server as seeds.
 * This is the "local brain → remote muscle" pipeline: the local DB's
 * link graph decides what to download, the remote server executes.
 *
 * @param {object} graphResult - Result from exploreLocalGraph()
 * @param {string[]} targetDomains - Target domains
 * @param {object} options - { graphSeedLimit: number }
 * @returns {object} { byDomain: { [domain]: { seeded, skipped, error } }, totalSeeded }
 */
async function seedFromLocalGraph(graphResult, targetDomains, options = {}) {
  const limit = Number(options.graphSeedLimit) || 10;
  const results = { byDomain: {}, totalSeeded: 0, totalSkipped: 0 };

  for (const domain of targetDomains) {
    const rows = graphResult.byDomain[domain];
    if (!Array.isArray(rows) || rows.length === 0) {
      results.byDomain[domain] = { seeded: 0, skipped: 0, candidates: 0 };
      continue;
    }

    // Take the top N unvisited URLs (already ranked by link count from the DB query)
    const seedUrls = rows.slice(0, limit).map(r => r.targetUrl);
    try {
      const { data } = await requestWithTimeout('POST', '/api/seed', {
        domain,
        urls: seedUrls,
      }, 15000);
      const seeded = Number(data?.inserted || data?.queued || 0);
      const skipped = seedUrls.length - seeded;
      results.byDomain[domain] = {
        seeded,
        skipped,
        candidates: seedUrls.length,
        response: data,
      };
      results.totalSeeded += seeded;
      results.totalSkipped += skipped;
    } catch (err) {
      results.byDomain[domain] = {
        seeded: 0,
        skipped: 0,
        candidates: seedUrls.length,
        error: err.message,
      };
    }
  }

  return results;
}

function parsePositiveIntArg(name) {
  const value = args[name];
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseSeedUrlList(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  if (!value || value === true) return [];
  return String(value)
    .split(/[,\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function parseSeedUrlsByDomain(value) {
  if (!value || value === true) return null;
  const result = {};
  const entries = String(value).split(';').map(item => item.trim()).filter(Boolean);
  for (const entry of entries) {
    const eqIndex = entry.indexOf('=');
    if (eqIndex <= 0) continue;
    const domain = entry.slice(0, eqIndex).trim().toLowerCase().replace(/^www\./, '');
    const urls = entry.slice(eqIndex + 1).split('|').map(item => item.trim()).filter(Boolean);
    if (domain && urls.length > 0) result[domain] = urls;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function summarizeSeedConfiguration() {
  const seedUrls = parseSeedUrlList(args['seed-urls'] || args.seedUrls);
  const seedUrlsByDomain = parseSeedUrlsByDomain(args['seed-urls-by-domain'] || args.seedUrlsByDomain);
  if (seedUrlsByDomain) {
    return Object.entries(seedUrlsByDomain)
      .map(([domain, urls]) => `${domain}:${urls.length}`)
      .join(', ');
  }
  if (seedUrls.length > 0) return `${seedUrls.length} shared URL(s)`;
  return 'remote configured seeds/default front pages';
}

function applyStartOverrides(body) {
  const maxPages = parsePositiveIntArg('max-pages');
  const maxConcurrent = parsePositiveIntArg('max-concurrent') || parsePositiveIntArg('maxConcurrent');
  const maxDepth = parsePositiveIntArg('max-depth') || parsePositiveIntArg('maxDepth');
  const seedUrls = parseSeedUrlList(args['seed-urls'] || args.seedUrls);
  const seedUrlsByDomain = parseSeedUrlsByDomain(args['seed-urls-by-domain'] || args.seedUrlsByDomain);
  if (maxPages) body.maxPages = maxPages;
  if (maxConcurrent) body.maxConcurrent = maxConcurrent;
  if (maxDepth) body.maxDepth = maxDepth;
  if (seedUrls.length > 0) body.seedUrls = seedUrls;
  if (seedUrlsByDomain) body.seedUrlsByDomain = seedUrlsByDomain;
  return body;
}

function isFalseArg(name) {
  const value = args[name];
  return value === false || String(value).toLowerCase() === 'false' || String(value).toLowerCase() === '0';
}

function isTrueArg(name) {
  const value = args[name];
  return value === true || ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function appendExportOptions(queryPath) {
  const parts = [];
  if (isFalseArg('include-content') || isFalseArg('includeContent')) parts.push('includeContent=false');
  if (isFalseArg('include-links') || isFalseArg('includeLinks')) parts.push('includeLinks=false');
  return parts.length ? `${queryPath}&${parts.join('&')}` : queryPath;
}

function shouldPruneAfterIngest() {
  if (isTrueArg('no-prune-after-ingest') || isTrueArg('noPruneAfterIngest')) return false;
  return shouldPruneAfterIngestPure(args);
}

function getPruneSummary() {
  if (!shouldPruneAfterIngest()) return 'disabled';
  const parts = ['content/http'];
  parts.push(isTrueArg('prune-delete-links') || isTrueArg('pruneDeleteLinks')
    ? 'links deleted'
    : 'links retained for frontier');
  if (isTrueArg('prune-delete-urls') || isTrueArg('pruneDeleteUrls')) parts.push('URL rows deleted');
  return `enabled (${parts.join(', ')})`;
}

function validatePruneExportConfig() {
  validatePruneExportConfigPure(args);
}

function appendWatermark(queryPath, watermark) {
  return watermark ? `${queryPath}&since=${encodeURIComponent(watermark)}` : queryPath;
}

function createSyncBatchController(initialLimit) {
  return createAdaptiveBatchController({
    ...args,
    initialLimit,
    limit: initialLimit,
  });
}

function getAdaptiveSummary(controller) {
  if (!controller.isEnabled()) return 'disabled';
  const options = controller.getOptions();
  return `enabled target=${options.targetMs}ms min=${options.minLimit} max=${options.maxLimit}`;
}

function logAdaptiveDecision(decision) {
  if (!decision?.enabled || decision.action === 'hold') return;
  const duration = Number.isFinite(decision.durationMs) ? `, round=${decision.durationMs}ms` : '';
  console.log(`  Adaptive limit ${decision.action}: ${decision.previousLimit} → ${decision.currentLimit} (${decision.reason}${duration}, target=${decision.targetMs}ms)`);
}

function getRequestedDomains() {
  if (args.domain) return [args.domain];
  if (args.domains) return args.domains.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

async function registerRequestedDomains(targetDomains) {
  const uniqueDomains = [...new Set(targetDomains || [])];
  const maxPagesOverride = parsePositiveIntArg('max-pages');
  for (const domain of uniqueDomains) {
    const body = { domain };
    if (maxPagesOverride) body.maxPages = maxPagesOverride;
    const { data } = await requestWithTimeout('POST', '/api/domains/add', body, 15000);
    if (data?.error) throw new Error(`Failed to register remote domain ${domain}: ${data.error}`);
    if (!JSON_OUTPUT && data?.status === 'added') {
      console.log(`  Registered remote domain: ${domain}${maxPagesOverride ? ` (maxPages=${maxPagesOverride})` : ''}`);
    }
  }
}

// ── HTTP Helpers ────────────────────────────────────────────

/**
 * Make HTTP request to remote server
 */
function request(method, path, body = null, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    const isHttps = REMOTE_HOST.startsWith('https://');
    const host = REMOTE_HOST.replace(/^https?:\/\//, '');
    const [hostname, port] = host.split(':');

    const options = {
      hostname,
      port: port || (isHttps ? 443 : 80),
      path,
      method,
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'Connection': 'close',
      },
      timeout: timeoutMs,
      agent: false,
    };

    if (body) {
      const payload = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const transport = isHttps ? https : http;
    const req = transport.request(options, (res) => {
      const chunks = [];
      const isGzipped = res.headers['content-encoding'] === 'gzip';

      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        if (isGzipped) {
          zlib.gunzip(raw, (err, decompressed) => {
            if (err) return settle(reject, new Error(`Decompression error: ${err.message}`));
            try {
              settle(resolve, {
                status: res.statusCode,
                headers: res.headers,
                rawBytes: raw.length,
                decodedBytes: decompressed.length,
                data: JSON.parse(decompressed.toString('utf8')),
              });
            } catch (e) {
              settle(resolve, { status: res.statusCode, headers: res.headers, rawBytes: raw.length, decodedBytes: decompressed.length, data: decompressed.toString('utf8') });
            }
          });
        } else {
          try {
            settle(resolve, {
              status: res.statusCode,
              headers: res.headers,
              rawBytes: raw.length,
              decodedBytes: raw.length,
              data: JSON.parse(raw.toString('utf8')),
            });
          } catch (e) {
            settle(resolve, { status: res.statusCode, headers: res.headers, rawBytes: raw.length, decodedBytes: raw.length, data: raw.toString('utf8') });
          }
        }
      });
    });

    req.on('error', (err) => settle(reject, err));
    req.on('timeout', () => {
      req.destroy(new Error(`Request ${method} ${path} timed out after ${timeoutMs}ms`));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function requestWithTimeout(method, path, body = null, timeoutMs = 30000) {
  return request(method, path, body, timeoutMs);
}

function isTransientRequestError(err) {
  const code = String(err?.code || '').toUpperCase();
  const message = String(err?.message || '').toLowerCase();
  return [
    'ECONNRESET',
    'ECONNREFUSED',
    'EPIPE',
    'ETIMEDOUT',
    'EAI_AGAIN',
  ].includes(code)
    || message.includes('socket hang up')
    || message.includes('request timed out')
    || message.includes('timeout')
    || message.includes('temporarily unavailable');
}

async function requestWithRetries(method, requestPath, body = null, options = {}) {
  const attempts = Math.max(1, Number(options.attempts) || 1);
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 30000);
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs) || 750);
  const label = options.label || `${method} ${requestPath}`;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    try {
      const response = await requestWithTimeout(method, requestPath, body, timeoutMs);
      const durationMs = Date.now() - startMs;
      if (attempt > 1 && !JSON_OUTPUT) {
        printStep('ok', `${label} succeeded on attempt ${attempt}/${attempts} (${durationMs}ms)`, 'green');
      }
      writeAgentEvent('http:request-success', {
        label,
        method,
        path: requestPath,
        attempt,
        attempts,
        startedAt,
        durationMs,
        status: response.status,
      });
      return { ...response, attempts: attempt };
    } catch (err) {
      lastError = err;
      const durationMs = Date.now() - startMs;
      const retryable = attempt < attempts && isTransientRequestError(err);
      writeAgentEvent('http:request-error', {
        label,
        method,
        path: requestPath,
        attempt,
        attempts,
        startedAt,
        durationMs,
        retryable,
        error: err.message,
        code: err.code || null,
      });
      if (!retryable) break;

      const waitMs = retryDelayMs * attempt;
      if (!JSON_OUTPUT) {
        printStep('warn', `${label} attempt ${attempt}/${attempts} failed: ${err.message}; retrying in ${waitMs}ms`, 'yellow');
      }
      await sleep(waitMs);
    }
  }

  throw lastError;
}

// ── Watermark Management ────────────────────────────────────

function loadWatermark() {
  try {
    if (fs.existsSync(WATERMARK_FILE)) {
      return JSON.parse(fs.readFileSync(WATERMARK_FILE, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return { lastWatermark: null, lastPullAt: null, totalPulled: 0 };
}

function saveWatermark(wm) {
  try {
    fs.writeFileSync(WATERMARK_FILE, JSON.stringify(wm, null, 2));
  } catch (e) {
    console.error(`  Warning: Could not save watermark: ${e.message}`);
  }
}

// ── Local DB Ingestion ──────────────────────────────────────

let localDb;

function openLocalDb() {
  if (localDb) return localDb;
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    console.error(`Local DB not found: ${LOCAL_DB_PATH}`);
    process.exit(1);
  }
  localDb = openNewsCrawlerDb(LOCAL_DB_PATH);
  getConfigureRemoteCrawlLocalSyncDb()(localDb);
  return localDb;
}

function closeLocalDb() {
  if (localDb) {
    localDb.close();
    localDb = null;
  }
}

/**
 * Ingest a v2 batch into local news.db
 * Re-uses the sync-ingest pipeline
 */
function ingestBatch(batch) {
  const { ingestV2Batch } = require('./lib/sync-ingest');
  const db = openLocalDb();
  const result = ingestV2Batch(db, batch);
  return result;
}

function getBatchCounts(batch) {
  return batch.counts || {
    urls: Array.isArray(batch.urls) ? batch.urls.length : 0,
    content: Array.isArray(batch.content) ? batch.content.length : 0,
    httpResponses: Array.isArray(batch.httpResponses) ? batch.httpResponses.length : 0,
    links: Array.isArray(batch.links) ? batch.links.length : 0,
  };
}

function verifyBatchPersisted(batch) {
  const db = openLocalDb();
  return getVerifyRemoteCrawlBatchPersisted()(db, batch);
}

function getBatchUrlIds(batch) {
  if (!Array.isArray(batch?.urls)) return [];
  return batch.urls
    .map((row) => Number(row?.id))
    .filter((id) => Number.isInteger(id) && id > 0);
}

async function pruneRemoteWatermark(watermark, urlIds = []) {
  if (!watermark) return null;
  const exactUrlIds = Array.from(new Set(urlIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)));
  if (exactUrlIds.length === 0) {
    throw new Error('Refusing remote prune without exact exported URL IDs. Watermark-only prune is reserved for manual server-side maintenance.');
  }
  const body = {
    before: watermark,
    urlIds: exactUrlIds,
    vacuum: isTrueArg('prune-vacuum') || isTrueArg('pruneVacuum'),
  };
  if (isTrueArg('prune-delete-urls') || isTrueArg('pruneDeleteUrls')) body.deleteUrls = true;
  if (isTrueArg('prune-delete-links') || isTrueArg('pruneDeleteLinks')) body.deleteLinks = true;
  else if (isTrueArg('prune-keep-links') || isTrueArg('pruneKeepLinks')) body.deleteLinks = false;
  if (args['prune-vacuum-threshold-mb']) body.vacuumThresholdMb = args['prune-vacuum-threshold-mb'];
  const { data } = await requestWithTimeout('POST', '/api/export/prune', body, 60000);
  if (!data?.ok) {
    throw new Error(`Remote prune failed for ${watermark}`);
  }
  return data;
}

async function prunePendingWatermark(wm, batch = null) {
  if (!shouldPruneAfterIngest() || !wm.pendingPruneWatermark) return null;
  const urlIds = getBatchUrlIds(batch).length > 0 ? getBatchUrlIds(batch) : (Array.isArray(wm.pendingPruneUrlIds) ? wm.pendingPruneUrlIds : []);
  const pruneResult = await pruneRemoteWatermark(wm.pendingPruneWatermark, urlIds);
  wm.lastPrunedWatermark = wm.pendingPruneWatermark;
  wm.totalPrunedRecords = (wm.totalPrunedRecords || 0) + Object.values(pruneResult.deleted || {}).reduce((sum, value) => sum + (value || 0), 0);
  delete wm.pendingPruneWatermark;
  delete wm.pendingPruneUrlIds;
  saveWatermark(wm);
  return pruneResult;
}

async function confirmSaveAndMaybePrune(batch, wm, counts) {
  const verification = verifyBatchPersisted(batch);
  if (!verification.ok) {
    throw new Error(`Local DB confirmation failed: ${JSON.stringify({ missingCounts: verification.missingCounts, sampleMissing: verification.sampleMissing })}`);
  }

  let pruneResult = null;
  if (batch.watermark) {
    wm.lastWatermark = batch.watermark;
    wm.lastPullAt = new Date().toISOString();
    wm.totalPulled = (wm.totalPulled || 0) + (counts.urls || 0);
    if (shouldPruneAfterIngest()) {
      wm.pendingPruneWatermark = batch.watermark;
      wm.pendingPruneUrlIds = getBatchUrlIds(batch);
    }
    saveWatermark(wm);

    if (shouldPruneAfterIngest()) {
      pruneResult = await prunePendingWatermark(wm, batch);
    }
  }

  return { verification, pruneResult };
}

// ── Format Helpers ──────────────────────────────────────────

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < 3) { val /= 1024; i++; }
  return `${val.toFixed(1)} ${units[i]}`;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

function formatBytesPerSecond(bytes, ms) {
  if (!Number.isFinite(bytes) || !Number.isFinite(ms) || ms <= 0) return 'n/a';
  return `${formatSize((bytes * 1000) / ms)}/s`;
}

function minIso(values) {
  const filtered = values.filter(Boolean).sort();
  return filtered[0] || null;
}

function maxIso(values) {
  const filtered = values.filter(Boolean).sort();
  return filtered[filtered.length - 1] || null;
}

function printTable(rows, cols) {
  if (rows.length === 0) { console.log('  (empty)'); return; }
  const widths = cols.map(c => Math.max(c.label.length, ...rows.map(r => String(c.get(r) ?? '').length)));
  const header = cols.map((c, i) => c.label.padEnd(widths[i])).join('  ');
  console.log(`  ${paint('bold', header)}`);
  console.log(`  ${paint('gray', cols.map((_, i) => '─'.repeat(widths[i])).join('──'))}`);
  for (const row of rows) {
    console.log(`  ${cols.map((c, i) => String(c.get(row) ?? '').padEnd(widths[i])).join('  ')}`);
  }
}

function getLedgerFile() {
  return path.resolve(__dirname, '.crawl-remote-ledger.json');
}

async function closeDbHandle(db) {
  if (!db || typeof db.close !== 'function') return;
  const result = db.close();
  if (result && typeof result.then === 'function') await result;
}

function formatSetupError(err) {
  const message = err?.message || String(err);
  if (/invalid ELF header|better_sqlite3|NODE_MODULE_VERSION|was compiled against/i.test(message)) {
    return `${message}\n  ${icon('setup')} Native SQLite binding is not usable in this shell. Rebuild it here with npm rebuild better-sqlite3 in copilot-dl-news and news-crawler-db.`;
  }
  if (/SQLITE_IOERR_SHMOPEN|database is locked|SQLITE_BUSY/i.test(message)) {
    return `${message}\n  ${icon('setup')} Local DB access is blocked. Stop any app currently holding data/news.db before running collect.`;
  }
  return message;
}

async function preflightLocalDb() {
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    throw new Error(`Local DB not found: ${LOCAL_DB_PATH}`);
  }

  let db;
  try {
    db = openNewsCrawlerDb(LOCAL_DB_PATH, { readonly: true, fileMustExist: true });
    const setup = getRemoteCrawlerLocalSetupSnapshotFn()(db);
    const stat = fs.statSync(LOCAL_DB_PATH);
    return {
      path: LOCAL_DB_PATH,
      sizeBytes: stat.size,
      tables: setup.tables || [],
      requiredTables: setup.requiredTables || [],
      hasRequiredTables: Boolean(setup.hasRequiredTables),
    };
  } catch (err) {
    throw new Error(formatSetupError(err));
  } finally {
    await closeDbHandle(db);
  }
}

function queryLocalHostVerification(targetDomains, sinceMarker) {
  const db = openLocalDb();
  return getListRemoteCrawlerSuccessfulDownloadCountsByHost()(db, {
    hosts: targetDomains,
    since: sinceMarker,
  });
}

/**
 * Summarize new-pages verification: for each host, check if at least
 * minNewPages genuinely new pages have been stored since the collect started.
 * Uses the collect-start timestamp (not the since marker which may be backdated).
 * @param {string[]} targetDomains
 * @param {string} collectStartISO - ISO timestamp of when this collect run started
 * @param {number} minNewPages - minimum new pages required per host
 */
function summarizeNewPagesVerification(targetDomains, collectStartISO, minNewPages) {
  const db = openLocalDb();
  const rows = getListRemoteCrawlerSuccessfulDownloadCountsByHost()(db, {
    hosts: targetDomains,
    since: collectStartISO,
  });
  const byHost = new Map((rows || [])
    .filter(row => row && (row.host || row.domain))
    .map(row => [String(row.host || row.domain), {
      host: String(row.host || row.domain),
      newPages: Number(row.pages || row.count || 0),
      lastFetched: row.lastFetched || row.last_fetched || null,
    }]));

  const complete = [];
  const incomplete = [];

  for (const host of targetDomains) {
    const row = byHost.get(host) || { host, newPages: 0, lastFetched: null };
    const item = {
      host,
      newPages: Number(row.newPages || 0),
      minNewPages,
      needed: Math.max(0, minNewPages - Number(row.newPages || 0)),
      lastFetched: row.lastFetched || null,
    };
    if (item.newPages >= minNewPages) complete.push(item);
    else incomplete.push(item);
  }

  return {
    minNewPages,
    totalHosts: targetDomains.length,
    complete,
    incomplete,
    completeCount: complete.length,
    allComplete: targetDomains.length > 0 && incomplete.length === 0,
  };
}

function printNewPagesVerification(summary, minCompleteHosts) {
  if (JSON_OUTPUT) return;
  const allMet = summary.completeCount >= minCompleteHosts;
  const completeText = `${summary.completeCount}/${summary.totalHosts} host(s) at ${summary.minNewPages}+ NEW pages`;
  const color = allMet ? 'green' : 'yellow';
  console.log(`  ${icon('verify')} ${paint(color, completeText)} ${paint('dim', `(need ${minCompleteHosts})`)}`);

  const rows = [...summary.complete, ...summary.incomplete]
    .sort((a, b) => b.newPages - a.newPages)
    .slice(0, Math.min(12, summary.totalHosts));
  printTable(rows, [
    { label: 'Host', get: row => row.host },
    { label: 'New', get: row => row.newPages },
    { label: 'Need', get: row => row.needed },
    { label: 'Last fetched', get: row => row.lastFetched || '' },
  ]);
}

function printHostVerification(summary, minCompleteHosts) {
  if (JSON_OUTPUT) return;
  const completeText = `${summary.completeCount}/${summary.totalHosts} host(s) at ${summary.targetPages}+ pages`;
  const color = summary.completeCount >= minCompleteHosts ? 'green' : 'yellow';
  console.log(`  ${icon('verify')} ${paint(color, completeText)} ${paint('dim', `(need ${minCompleteHosts})`)}`);

  const rows = [...summary.complete, ...summary.incomplete]
    .sort((a, b) => b.pages - a.pages)
    .slice(0, Math.min(12, summary.totalHosts));
  printTable(rows, [
    { label: 'Host', get: row => row.host },
    { label: 'Pages', get: row => row.pages },
    { label: 'Need', get: row => row.needed },
    { label: 'Last fetched', get: row => row.lastFetched || '' },
  ]);
}

function printRemoteFrontierTelemetry(remoteStatus) {
  if (JSON_OUTPUT || !remoteStatus?.domains?.length) return;
  const rows = remoteStatus.domains.map(row => {
    const queue = row.queue || {};
    const promotion = row.frontier?.lastPromotion || {};
    return {
      host: row.domain,
      depth: row.maxDepth || '',
      seeds: `${queue.seedQueued || 0}/${queue.seedAlreadyKnown || 0}/${queue.seedRefreshed || 0}`,
      discovered: `${queue.discoveredQueued || 0}/${queue.discoveredAlreadyKnown || 0}`,
      pending: row.pending,
      reason: row.frontier?.lastNoPendingReason || (promotion.reason ? `${promotion.reason}:${promotion.inserted || 0}` : ''),
    };
  });
  console.log(`  ${icon('feature')} Frontier: seeds new/known/refreshed, discovered new/known, pending, no-new reason`);
  printTable(rows, [
    { label: 'Host', get: row => row.host },
    { label: 'Depth', get: row => row.depth },
    { label: 'Seeds', get: row => row.seeds },
    { label: 'Discovered', get: row => row.discovered },
    { label: 'Pending', get: row => row.pending },
    { label: 'Reason', get: row => row.reason },
  ]);
}

function remoteTargetsTerminal(statusData, targetDomains) {
  return summarizeBoundedRun(statusData, targetDomains).allDone;
}

function remoteTargetsRunning(statusData, targetDomains) {
  const targets = normalizeDomains(targetDomains);
  const domains = Array.isArray(statusData?.domains) ? statusData.domains : [];
  const byDomain = new Map(domains.map(row => [String(row.domain || '').toLowerCase(), row]));
  return targets.length > 0 && targets.every(domain => {
    const row = byDomain.get(domain);
    return row && (row.isRunning === true || String(row.state || '').toLowerCase() === 'running');
  });
}

async function stopTargetDomains(targetDomains, timeoutMs = 15000) {
  const stopBody = {};
  if (targetDomains.length === 1) stopBody.domain = targetDomains[0];
  else if (targetDomains.length > 1) stopBody.domains = targetDomains;
  const { data } = await requestWithTimeout('POST', '/api/stop', stopBody, timeoutMs);
  return data;
}

function summarizeBatchRemoteDownloads(batch) {
  const urls = new Map((Array.isArray(batch?.urls) ? batch.urls : [])
    .filter(row => row && row.id !== undefined)
    .map(row => [Number(row.id), row]));
  const contentResponseIds = new Set((Array.isArray(batch?.content) ? batch.content : [])
    .map(row => Number(row?.http_response_id))
    .filter(id => Number.isInteger(id)));
  const responses = Array.isArray(batch?.httpResponses) ? batch.httpResponses : [];
  const summary = {
    responseCount: responses.length,
    successCount: 0,
    contentCount: contentResponseIds.size,
    bytesDownloaded: 0,
    totalDownloadMs: 0,
    totalResponseMs: 0,
    firstFetchedAt: null,
    lastFetchedAt: null,
    remoteBytesPerSec: 0,
    avgResponseMs: 0,
    byHost: {},
  };

  const fetchedTimes = [];
  for (const response of responses) {
    const urlRow = urls.get(Number(response?.url_id));
    const host = String(urlRow?.host || '(unknown)');
    const status = Number(response?.http_status || 0);
    const bytes = Number(response?.bytes_downloaded || 0);
    const downloadMs = Number(response?.download_ms || response?.total_ms || 0);
    const totalMs = Number(response?.total_ms || 0);
    const fetchedAt = response?.fetched_at || null;

    if (!summary.byHost[host]) {
      summary.byHost[host] = {
        host,
        responses: 0,
        success: 0,
        content: 0,
        bytesDownloaded: 0,
        totalDownloadMs: 0,
        firstFetchedAt: null,
        lastFetchedAt: null,
      };
    }

    const hostSummary = summary.byHost[host];
    hostSummary.responses += 1;
    if (status >= 200 && status < 300) {
      summary.successCount += 1;
      hostSummary.success += 1;
    }
    if (contentResponseIds.has(Number(response?.id))) hostSummary.content += 1;
    summary.bytesDownloaded += bytes;
    hostSummary.bytesDownloaded += bytes;
    if (downloadMs > 0) {
      summary.totalDownloadMs += downloadMs;
      hostSummary.totalDownloadMs += downloadMs;
    }
    if (totalMs > 0) summary.totalResponseMs += totalMs;
    if (fetchedAt) fetchedTimes.push(fetchedAt);
    hostSummary.firstFetchedAt = minIso([hostSummary.firstFetchedAt, fetchedAt]);
    hostSummary.lastFetchedAt = maxIso([hostSummary.lastFetchedAt, fetchedAt]);
  }

  summary.firstFetchedAt = minIso(fetchedTimes);
  summary.lastFetchedAt = maxIso(fetchedTimes);
  summary.remoteBytesPerSec = summary.totalDownloadMs > 0
    ? (summary.bytesDownloaded * 1000) / summary.totalDownloadMs
    : 0;
  summary.avgResponseMs = summary.responseCount > 0
    ? summary.totalResponseMs / summary.responseCount
    : 0;
  summary.byHost = Object.fromEntries(Object.entries(summary.byHost).map(([host, row]) => [host, {
    ...row,
    remoteBytesPerSec: row.totalDownloadMs > 0 ? (row.bytesDownloaded * 1000) / row.totalDownloadMs : 0,
  }]));
  summary.pagesDownloaded = summary.successCount;
  return summary;
}

function summarizeRemoteStatus(statusData, targetDomains = []) {
  const targets = new Set(normalizeDomains(targetDomains));
  const domains = (statusData?.domains || [])
    .filter(row => targets.size === 0 || targets.has(row.domain))
    .map(row => ({
      domain: row.domain,
      state: row.state,
      isRunning: Boolean(row.isRunning),
      fetched: Number(row.stats?.fetched || row.stats?.done || 0),
      pending: Number(row.stats?.pending || row.stats?.queued || 0),
      errors: Number(row.stats?.errors || 0),
      stored: Number(row.contentPipeline?.totalStored || row.stats?.stored || 0),
      startedAt: row.startedAt || null,
	      stoppedAt: row.stoppedAt || null,
	      maxPages: row.maxPages || null,
	      maxDepth: row.maxDepth || row.stats?.maxDepth || null,
	      seedUrls: row.seedUrls || 0,
	      frontier: row.frontier || null,
	      queue: {
	        seedQueued: Number(row.stats?.seedQueued || 0),
	        seedAlreadyKnown: Number(row.stats?.seedAlreadyKnown || 0),
	        seedRefreshed: Number(row.stats?.seedRefreshed || 0),
	        discoveredQueued: Number(row.stats?.discoveredQueued || 0),
	        discoveredAlreadyKnown: Number(row.stats?.discoveredAlreadyKnown || 0),
	        discoveredInvalid: Number(row.stats?.discoveredInvalid || 0),
	        discoveredOutsideDomain: Number(row.stats?.discoveredOutsideDomain || 0),
	        depthLimitSkipped: Number(row.stats?.depthLimitSkipped || 0),
	      },
	    }));
  return {
    throughput: {
      fetchesPerSec: Number(statusData?.throughput?.fetchesPerSec || 0),
      writesPerSec: Number(statusData?.throughput?.writesPerSec || 0),
      windowSec: Number(statusData?.throughput?.windowSec || 0),
    },
    totals: statusData?.totals || {},
    orchestrator: statusData?.orchestrator || {},
    domains,
  };
}

function buildCollectDiagnostics({
  ok,
  totalUrls,
  totalContent,
  targetDomains,
  options,
  lastRemoteStatus,
  statusCheckFailures,
  startAttempts,
  startRecoveredFromUncertainResponse,
}) {
  const domains = Array.isArray(lastRemoteStatus?.domains) ? lastRemoteStatus.domains : [];
  const targetSet = new Set(normalizeDomains(targetDomains));
  const targetRows = domains.filter(row => targetSet.has(String(row.domain || '').toLowerCase()));
  const zeroFreshRows = targetRows.filter(row =>
    Number(row.fetched || 0) === 0 &&
    Number(row.pending || 0) === 0 &&
    String(row.state || '').toLowerCase() !== 'running'
  );
  const existingStoredRows = targetRows.filter(row => Number(row.stored || 0) > 0);
  const issues = [];
  const recommendations = [];

  if (startAttempts > 1) {
    issues.push(`Remote start needed ${startAttempts} attempts before a usable response.`);
    recommendations.push('Keep start retry telemetry enabled and consider adding request IDs on the remote API so duplicate start attempts can be correlated.');
  }

  if (startRecoveredFromUncertainResponse) {
    issues.push('The start response failed, but the CLI recovered by observing target domains already running.');
  }

  if (statusCheckFailures > 0) {
    issues.push(`${statusCheckFailures} remote status check(s) failed during verification.`);
    recommendations.push('Add retry/backoff to verification status checks and log request IDs, latency, and error codes for each remote API call.');
  }

	  if (!ok && totalUrls === 0 && totalContent === 0) {
	    issues.push('No export batches contained URL or content rows, so remote download and local ingest speed could not be measured for real pages.');
	    recommendations.push('Expose a pre-start remote queue diagnostic with pending hub/article count, done count, newest fetched_at, and whether a domain will stop immediately before the CLI enters the sync loop.');
	  }

	  if (!ok && zeroFreshRows.length === targetSet.size && targetSet.size > 0) {
	    issues.push(`All target domains stopped with 0 fresh fetched pages and 0 pending URLs: ${zeroFreshRows.map(row => row.domain).join(', ')}.`);
	    recommendations.push('Use hub seed URLs plus discovered-link promotion so exhausted front pages can lead to not-yet-known article URLs without resetting or re-downloading known pages.');
	  }

  if (!ok && existingStoredRows.length > 0) {
    const storedText = existingStoredRows.map(row => `${row.domain}=${row.stored}`).join(', ');
    issues.push(`Remote status shows existing stored content (${storedText}), but none of it was newly fetched after this run's since marker.`);
    recommendations.push('Surface newest remote fetched_at/content stored_at timestamps per target before start, so the operator can see whether the local since marker can export anything.');
  }

  if (!ok && Number(options?.maxPages || 0) <= Number(options?.targetPages || 0)) {
    recommendations.push('For validation crawls, consider max-pages above target-pages to allow for redirects, blocked pages, empty bodies, and duplicate URLs.');
  }

  return {
    issues,
    recommendations,
    statusCheckFailures,
    startAttempts,
    startRecoveredFromUncertainResponse,
    lastRemoteStatus: lastRemoteStatus || null,
  };
}

async function readRemoteStatusTelemetry(targetDomains) {
  try {
    const { data } = await requestWithTimeout('GET', '/api/status', null, 10000);
    return summarizeRemoteStatus(data, targetDomains);
  } catch (err) {
    return { error: err.message, throughput: {}, domains: [] };
  }
}

// ── Commands ────────────────────────────────────────────────

async function cmdStatus() {
  const { data } = await requestWithTimeout('GET', '/api/status');

  if (JSON_OUTPUT) { console.log(JSON.stringify(data, null, 2)); return; }

  printBanner(`${icon('collect')} Multi-Domain Crawl Server Status`, `Remote ${REMOTE_HOST}`);
  printFeature('remote', 'Server', REMOTE_HOST);
  printFeature('feature', 'Version', data.version || '(unknown)', `schema=${data.schemaVersion || '(unknown)'}`);
  printFeature('sync', 'Orchestrator', data.orchestrator?.running ? paint('green', 'RUNNING') : paint('yellow', 'IDLE'));
  printFeature('adaptive', 'Concurrency', `${data.orchestrator?.currentlyRunning}/${data.orchestrator?.maxConcurrent}`);
  console.log('');
  console.log(`  ${icon('batch')} Totals: ${data.totals?.fetched || 0} fetched, ${data.totals?.stored || 0} stored, ${data.totals?.errors || 0} errors, ${data.totals?.pending || 0} pending`);
  console.log('');

  if (data.domains && data.domains.length > 0) {
    printTable(data.domains, [
      { label: 'Domain', get: d => d.domain },
      { label: 'State', get: d => d.state + (d.isRunning ? ' ●' : '') },
      { label: 'Done', get: d => d.stats?.done || 0 },
      { label: 'Pending', get: d => d.stats?.pending || 0 },
      { label: 'Errors', get: d => d.stats?.errors || 0 },
      { label: 'Stored', get: d => d.contentPipeline?.totalStored || 0 },
      { label: 'Size', get: d => `${d.contentPipeline?.totalCompressedMB || 0}MB` },
    ]);
  }
  console.log('');
}

async function cmdHealth() {
  try {
    const { data } = await requestWithTimeout('GET', '/api/health', null, 10000);
    if (JSON_OUTPUT) { console.log(JSON.stringify(data, null, 2)); return; }
    console.log(`  ${icon('ok')} ${paint('green', `${data.mode} server healthy`)} ${paint('dim', `— ${data.domains} domains, ${data.running} running, ${data.stored} stored`)}`);
  } catch (e) {
    console.log(`  ${icon('error')} ${paint('red', `Server unreachable: ${e.message}`)}`);
    process.exit(1);
  }
}

async function cmdWatch() {
  // Watch (follow) mode — polls /api/status until all targets reach a terminal
  // state, watch-timeout fires, or Ctrl-C. Uses the shared CrawlBackend so the
  // same loop works against any backend.
  const { getBackend, CrawlBackend } = require('./lib/crawl-backend');
  const intervalMs = Math.max(1000, Number(args['watch-interval']) || 5000);
  const timeoutMs = Math.max(1000, (Number(args['watch-timeout']) || 1800) * 1000);
  const requestedHosts = args.domains
    ? args.domains.split(',').map(s => s.trim()).filter(Boolean)
    : (args.domain ? [args.domain] : null);

  const backend = getBackend('remote', { host: REMOTE_HOST });
  const startTs = Date.now();
  let firstStatus = null;
  try {
    firstStatus = await backend.status({ hosts: requestedHosts });
  } catch (err) {
    console.error(`  Initial status fetch failed: ${err.message}`);
    process.exit(1);
  }

  // RemoteBackend.status() never throws on HTTP error — it returns ok:false.
  // Detect that here so we don't silently fall through with an empty domain
  // list and print the misleading "No domains to watch" message.
  if (firstStatus && firstStatus.ok === false) {
    console.error(`  Initial status fetch failed: ${firstStatus.error || 'unknown error'} (host=${REMOTE_HOST})`);
    process.exit(1);
  }

  const targets = requestedHosts && requestedHosts.length
    ? requestedHosts
    : firstStatus.domains.map(d => d.domain);
  if (!targets.length) {
    console.error('  No domains to watch');
    process.exit(1);
  }

  if (!JSON_OUTPUT) {
    console.log(`▶ Watching ${REMOTE_HOST} — ${targets.length} target(s), poll ${intervalMs}ms, timeout ${Math.round(timeoutMs/1000)}s`);
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // After ~5 consecutive poll errors, treat the backend as dead and bail so a
  // long timeout doesn't silently hang the CLI for the full window.
  const MAX_CONSECUTIVE_ERRORS = 5;
  const MAX_MISSING_POLLS = 3;
  let consecutiveErrors = 0;
  let consecutiveMissing = 0;
  let last = firstStatus;
  let stoppedReason = null;
  while (true) {
    if (Date.now() - startTs > timeoutMs) {
      stoppedReason = 'timeout';
      if (!JSON_OUTPUT) console.log('⏰ Watch timeout reached');
      break;
    }
    const missingTargets = CrawlBackend.missingHosts(last, targets);
    if (missingTargets.length > 0) {
      consecutiveMissing++;
      if (!JSON_OUTPUT) console.error(`  (missing targets: ${missingTargets.join(', ')}; ${consecutiveMissing}/${MAX_MISSING_POLLS})`);
      if (consecutiveMissing >= MAX_MISSING_POLLS) {
        stoppedReason = 'missing-targets';
        if (!JSON_OUTPUT) console.error(`  ✗ Requested targets never appeared in remote status: ${missingTargets.join(', ')}`);
        break;
      }
    } else {
      consecutiveMissing = 0;
    }
    if (missingTargets.length === 0 && CrawlBackend.allTerminal(last, targets)) {
      stoppedReason = 'terminal';
      if (!JSON_OUTPUT) console.log('✅ All targets reached terminal state');
      break;
    }
    if (JSON_OUTPUT) {
      console.log(JSON.stringify({ watchTick: { ts: new Date().toISOString(), totals: last.totals, throughput: last.throughput, domains: last.domains } }));
    } else {
      const tp = (last.throughput && last.throughput.fetchesPerSec) ? ` ${last.throughput.fetchesPerSec.toFixed(2)}/s` : '';
      console.log(`  · fetched=${last.totals.fetched} stored=${last.totals.stored||0} errors=${last.totals.errors} pending=${last.totals.pending}${tp}`);
    }
    await sleep(intervalMs);
    try {
      const next = await backend.status({ hosts: requestedHosts });
      if (next && next.ok === false) {
        consecutiveErrors++;
        if (!JSON_OUTPUT) console.error(`  (poll error: ${next.error || 'unknown'}; ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`);
      } else {
        consecutiveErrors = 0;
        last = next;
      }
    } catch (err) {
      consecutiveErrors++;
      if (!JSON_OUTPUT) console.error(`  (poll error: ${err.message}; ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`);
    }
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      stoppedReason = 'poll-errors';
      if (!JSON_OUTPUT) console.error(`  ✗ Backend unreachable after ${MAX_CONSECUTIVE_ERRORS} consecutive poll errors — aborting watch`);
      break;
    }
  }
  // Print the last observed state on exit so the user always sees the final
  // counters (the print-then-fetch loop above otherwise drops the final tick).
  if (!JSON_OUTPUT) {
    const tp = (last && last.throughput && last.throughput.fetchesPerSec) ? ` ${last.throughput.fetchesPerSec.toFixed(2)}/s` : '';
    console.log(`  · final fetched=${last.totals.fetched} stored=${last.totals.stored||0} errors=${last.totals.errors} pending=${last.totals.pending}${tp}`);
  } else {
    console.log(JSON.stringify({ watchFinal: { stoppedReason, totals: last.totals, throughput: last.throughput, domains: last.domains, missingTargets: CrawlBackend.missingHosts(last, targets) } }));
  }
  if (stoppedReason === 'poll-errors' || stoppedReason === 'missing-targets') process.exit(2);
}

async function cmdStart() {
  const body = {};
  if (args.domain) body.domain = args.domain;
  else if (args.domains) body.domains = args.domains.split(',').map(s => s.trim());
  applyStartOverrides(body);
  // else: start all (empty body)

  const { data } = await requestWithTimeout('POST', '/api/start', body);
  if (JSON_OUTPUT) { console.log(JSON.stringify(data, null, 2)); return; }

  if (data.results) {
    for (const r of data.results) {
      console.log(`  ${r.status === 'started' ? '▶' : '○'} ${r.domain}: ${r.status}`);
    }
    console.log(`  Started ${data.started || data.results.length} domain(s)`);
  } else {
    console.log(`  ${data.status === 'started' ? '▶' : '○'} ${data.domain}: ${data.status}`);
  }
}

async function ensureDomainsForRun(initialStatus, targetDomains, maxPagesOverride) {
  const missingDomains = findMissingDomains(initialStatus, targetDomains);
  for (const domain of missingDomains) {
    const body = { domain };
    if (maxPagesOverride) body.maxPages = maxPagesOverride;
    const { data: addData } = await requestWithTimeout('POST', '/api/domains/add', body, 15000);
    if (addData?.error) {
      throw new Error(`Failed to register remote domain ${domain}: ${addData.error}`);
    }
    if (!JSON_OUTPUT) {
      console.log(`  Registered remote domain: ${domain}${maxPagesOverride ? ` (maxPages=${maxPagesOverride})` : ''}`);
    }
  }

  if (missingDomains.length > 0) {
    const { data } = await requestWithTimeout('GET', '/api/status', null, 10000);
    return data;
  }

  return initialStatus;
}

function summarizeStartResults(startData, targetDomains = []) {
  const results = Array.isArray(startData?.results)
    ? startData.results
    : (startData?.domain ? [startData] : []);
  const targets = normalizeDomains(targetDomains);
  const byDomain = new Map(results
    .filter(item => item && item.domain)
    .map(item => [String(item.domain).toLowerCase(), item]));
  const failures = results.filter(item => {
    const status = String(item?.status || '').toLowerCase();
    return Boolean(item?.error || /error|fail|failed|rejected|invalid/.test(status));
  });
  const missing = results.length > 0
    ? targets.filter(domain => !byDomain.has(String(domain).toLowerCase()))
    : [];
  const topLevelError = startData?.ok === false || startData?.error;
  return {
    ok: !topLevelError && failures.length === 0 && missing.length === 0,
    results,
    failures,
    missing,
    topLevelError: topLevelError ? (startData.error || 'start returned ok:false') : null,
  };
}

function assertStartSucceeded(startData, targetDomains, label) {
  const summary = summarizeStartResults(startData, targetDomains);
  if (summary.ok) return summary;
  const failureText = summary.failures
    .map(item => `${item.domain || '(unknown)'}:${item.status || item.error || 'error'}`)
    .join(', ');
  const missingText = summary.missing.join(', ');
  const parts = [];
  if (summary.topLevelError) parts.push(summary.topLevelError);
  if (failureText) parts.push(`failed: ${failureText}`);
  if (missingText) parts.push(`missing results: ${missingText}`);
  throw new Error(`${label} did not start cleanly (${parts.join('; ')})`);
}

async function cmdLaunch() {
  let { data: initialStatus } = await requestWithTimeout('GET', '/api/status', null, 10000);
  const targetDomains = resolveTargetDomains(args, initialStatus);
  if (targetDomains.length === 0) {
    throw new Error('No target domains resolved for launch');
  }

  const maxPagesOverride = args['max-pages'] ? parseInt(args['max-pages'], 10) : undefined;
  initialStatus = await ensureDomainsForRun(initialStatus, targetDomains, maxPagesOverride);

  const startBody = {};
  if (args.domain) startBody.domain = args.domain;
  else startBody.domains = targetDomains;
  applyStartOverrides(startBody);

  const { data: startData } = await requestWithTimeout('POST', '/api/start', startBody, 15000);
  const startSummary = assertStartSucceeded(startData, targetDomains, 'Launch');
  const result = { ok: true, targetDomains, started: startData, startSummary };

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (startData.results) {
    for (const item of startData.results) {
      console.log(`  ${item.status === 'started' ? '▶' : '○'} ${item.domain}: ${item.status}`);
    }
  }
  console.log(`  Launch requested for ${targetDomains.length} domain(s).`);
  console.log('  Use `node tools/crawl/crawl-remote.js health` for a lightweight liveness check.');
}

async function cmdCollect() {
  initAgentLog();
  openLocalDb(); // Ensure local DB is open early for telemetry logging
  if (!isTrueArg('no-prune-after-ingest') && args['prune-after-ingest'] === undefined && args.pruneAfterIngest === undefined) {
    args['prune-after-ingest'] = true;
  }
  validatePruneExportConfig();

  const wallClockStartMs = Date.now();
  const phaseTimings = {};
  function startPhase(name) { phaseTimings[name] = { startMs: Date.now() }; }
  function endPhase(name) { if (phaseTimings[name]) phaseTimings[name].durationMs = Date.now() - phaseTimings[name].startMs; }

  const sinceMarker = args.since || new Date(Date.now() - 3000).toISOString();
  printBanner(`${icon('collect')} Remote Crawl Collect`, 'Preflight + start + sync + verify + stop/drain');
  startPhase('preflight');
  printStep('setup', 'Checking remote server and local DB setup...', 'cyan');
  writeAgentEvent('collect:start', {
    remoteHost: REMOTE_HOST,
    localDbPath: LOCAL_DB_PATH,
    sinceMarker,
    agentLogFile: agentLogFile || null,
  });

  const { data: healthData } = await requestWithTimeout('GET', '/api/health', null, 10000);
  let { data: initialStatus } = await requestWithTimeout('GET', '/api/status', null, 10000);
  const targetDomains = resolveTargetDomains(args, initialStatus);
  if (targetDomains.length === 0) {
    throw new Error('No target domains resolved for collect. Use --domain, --domains, or configure remote domains first.');
  }

  const options = normalizeCollectOptions(args, targetDomains);
  if (!parsePositiveIntArg('max-pages')) args['max-pages'] = String(options.maxPages);
  if (!parsePositiveIntArg('limit')) args.limit = String(options.limit);

  const dbInfo = await preflightLocalDb();
  if (!dbInfo.hasRequiredTables) {
    throw new Error(`Local DB is missing required tables. Found: ${dbInfo.tables.join(', ') || '(none)'}`);
  }

  if (!JSON_OUTPUT) {
    printStep('ok', `Remote health: ${healthData.mode || 'server'} (${healthData.domains || 0} domains, ${healthData.running || 0} running)`, 'green');
    printStep('ok', `Local DB ready: ${dbInfo.path} (${formatSize(dbInfo.sizeBytes)})`, 'green');
    console.log('');
    printFeature('remote', 'Remote', REMOTE_HOST);
    printFeature('db', 'Local DB', LOCAL_DB_PATH);
    printFeature('target', 'Targets', `${targetDomains.length} host(s)`, targetDomains.join(', '));
	    printFeature('target', 'Verification', `${options.targetPages} successful stored pages/host`, `need ${options.minCompleteHosts} host(s) complete`);
	    if (options.minNewPages > 0) {
	      printFeature('verify', 'New-page gate', `${options.minNewPages} genuinely NEW pages/host required`, 'stored after collect starts, not just synced');
	    }
	    printFeature('start', 'Remote crawl cap', `${options.maxPages} pages/domain`, options.maxPages > options.targetPages ? 'oversamples to offset blocked/empty pages' : '');
	    printFeature('start', 'Remote depth', parsePositiveIntArg('max-depth') || parsePositiveIntArg('maxDepth') || 'server default', 'follows hub/article links only for not-yet-known URLs');
	    printFeature('feature', 'Hub seeds', summarizeSeedConfiguration(), 'known URLs are skipped, not counted as downloads');
	    printFeature('verify', 'Download target', 'new local saves after since marker', 'already-stored pages do not count');
	    printFeature('sync', 'Sync loop', `window=${options.windowSec}s limit=${options.limit} interval=${options.intervalSec}s`);
    printFeature('health', 'Status guard', `${options.maxStatusFailures} failed status checks`, `after ${options.drainEmptyRounds}+ empty round(s)`);
    printFeature('adaptive', 'Adaptive batching', getAdaptiveSummary(createSyncBatchController(options.limit)));
    printFeature('prune', 'Prune after ingest', getPruneSummary(), 'confirmed exact URL IDs');
    printFeature('ledger', 'Ledger', getLedgerFile());
    if (agentLogFile) printFeature('feature', 'Agent JSONL', agentLogFile);
    printFeature('verify', 'Since marker', sinceMarker);
    printFeature('feature', 'Graph seeding', options.seedFromGraph ? `enabled (limit=${options.graphSeedLimit}/domain)` : 'disabled', 'local link graph → remote seeds');
    printFeature('sync', 'Sync mode', options.syncMode, options.syncMode === 'streaming' ? `batch=${options.syncBatchSize} window=${options.syncBatchWindowMs}ms` : 'poll-based');
    if (options.showPageLatency || options.showPhaseTiming || options.showPerHostStats) {
      const parts = [];
      if (options.showPageLatency) parts.push('page-latency');
      if (options.showPhaseTiming) parts.push('phase-timing');
      if (options.showPerHostStats) parts.push('per-host-stats');
      printFeature('feature', 'Verbose telemetry', parts.join(', '));
    }
    console.log('');
  }
  writeAgentEvent('collect:preflight', {
    health: healthData,
    initialStatus: summarizeRemoteStatus(initialStatus, targetDomains),
    options,
    db: dbInfo,
    targetDomains,
  });

  endPhase('preflight');

  // ── Local graph exploration: find unvisited URLs from existing link graph ──
  startPhase('graph-exploration');
  let graphExploration = null;
  try {
    graphExploration = exploreLocalGraph(targetDomains, { limit: options.targetPages * 5 });
    if (!JSON_OUTPUT && graphExploration.totalUnvisited > 0) {
      printStep('feature', `Local link graph: ${graphExploration.totalUnvisited} unvisited URLs found across ${targetDomains.length} domain(s)`, 'cyan');
      for (const domain of targetDomains) {
        const rows = graphExploration.byDomain[domain];
        if (Array.isArray(rows) && rows.length > 0) {
          const articleRows = rows.filter(r => /article|news/i.test(r.targetUrl));
          console.log(`  ${icon('feature')} ${paint('cyan', domain)}: ${rows.length} unvisited (${articleRows.length} likely articles)`);
          for (const row of rows.slice(0, 3)) {
            console.log(`    ${paint('dim', `[${row.linkCount}x]`)} ${row.targetUrl}`);
          }
          if (rows.length > 3) console.log(`    ${paint('dim', `... and ${rows.length - 3} more`)}`);
        } else if (rows?.error) {
          console.log(`  ${icon('warn')} ${paint('yellow', domain)}: graph exploration failed (${rows.error})`);
        } else {
          console.log(`  ${icon('ok')} ${paint('dim', domain)}: no unvisited links in local graph`);
        }
      }
      console.log('');
    } else if (!JSON_OUTPUT) {
      printStep('ok', 'Local link graph: no unvisited URLs found (all discovered links have been crawled)', 'green');
      console.log('');
    }
    writeAgentEvent('collect:graph-exploration', {
      totalUnvisited: graphExploration.totalUnvisited,
      byDomain: Object.fromEntries(targetDomains.map(d => [d, {
        count: Array.isArray(graphExploration.byDomain[d]) ? graphExploration.byDomain[d].length : 0,
        topUrls: Array.isArray(graphExploration.byDomain[d])
          ? graphExploration.byDomain[d].slice(0, 5).map(r => ({ url: r.targetUrl, linkCount: r.linkCount }))
          : [],
        error: graphExploration.byDomain[d]?.error || null,
      }])),
    });
  } catch (err) {
    if (!JSON_OUTPUT) printStep('warn', `Graph exploration skipped: ${err.message}`, 'yellow');
  }
  endPhase('graph-exploration');

  // ── Graph → Remote seed injection: push unvisited URLs as remote seeds ──
  startPhase('graph-seeding');
  let graphSeedResult = null;
  if (options.seedFromGraph && graphExploration && graphExploration.totalUnvisited > 0) {
    try {
      printStep('start', `Seeding remote server with ${Math.min(graphExploration.totalUnvisited, options.graphSeedLimit * targetDomains.length)} graph-discovered URL(s)...`, 'cyan');
      graphSeedResult = await seedFromLocalGraph(graphExploration, targetDomains, {
        graphSeedLimit: options.graphSeedLimit,
      });
      if (!JSON_OUTPUT) {
        for (const domain of targetDomains) {
          const dr = graphSeedResult.byDomain[domain];
          if (dr?.error) {
            console.log(`  ${icon('warn')} ${paint('yellow', domain)}: seed failed (${dr.error})`);
          } else if (dr?.seeded > 0) {
            console.log(`  ${icon('ok')} ${paint('green', domain)}: ${dr.seeded} URL(s) seeded to remote (${dr.skipped} already known)`);
          } else {
            console.log(`  ${icon('ok')} ${paint('dim', domain)}: all graph URLs already known to remote`);
          }
        }
        console.log('');
      }
      writeAgentEvent('collect:graph-seed', {
        totalSeeded: graphSeedResult.totalSeeded,
        totalSkipped: graphSeedResult.totalSkipped,
        byDomain: graphSeedResult.byDomain,
      });
    } catch (err) {
      if (!JSON_OUTPUT) printStep('warn', `Graph seeding skipped: ${err.message}`, 'yellow');
    }
  }
  endPhase('graph-seeding');

  initialStatus = await ensureDomainsForRun(initialStatus, targetDomains, options.maxPages);
  let lastRemoteStatusSummary = summarizeRemoteStatus(initialStatus, targetDomains);
  let statusCheckFailures = 0;
  let startAttempts = 0;
  let startRecoveredFromUncertainResponse = false;

  const startBody = { domains: targetDomains, maxPages: options.maxPages };
  if (options.maxConcurrent) startBody.maxConcurrent = options.maxConcurrent;
  applyStartOverrides(startBody);
  const startRetries = options.startRetries;

  startPhase('remote-start');
  printStep('start', `Starting ${targetDomains.length} target host(s)...`, 'cyan');
  let startData;
  try {
    const startResponse = await requestWithRetries('POST', '/api/start', startBody, {
      attempts: startRetries,
      timeoutMs: 15000,
      retryDelayMs: 1000,
      label: 'remote start',
    });
    startData = startResponse.data;
    startAttempts = startResponse.attempts || 1;
  } catch (err) {
    printStep('warn', `Remote start response failed after ${startRetries} attempt(s); checking whether target crawls are already running...`, 'yellow');
    const statusTelemetry = await readRemoteStatusTelemetry(targetDomains);
    writeAgentEvent('collect:remote-start-uncertain', {
      startBody,
      attempts: startRetries,
      error: err.message,
      remoteStatus: statusTelemetry,
    });
    if (!remoteTargetsRunning(statusTelemetry, targetDomains)) {
      throw err;
    }
    startRecoveredFromUncertainResponse = true;
    startAttempts = startRetries;
    startData = {
      ok: true,
      results: statusTelemetry.domains.map(row => ({
        domain: row.domain,
        status: 'running-after-uncertain-start',
      })),
    };
    printStep('ok', 'Remote targets are running; continuing the collect from observed status.', 'green');
    writeAgentEvent('collect:remote-start-adopted', {
      startBody,
      attempts: startRetries,
      remoteStatus: statusTelemetry,
    });
  }
  assertStartSucceeded(startData, targetDomains, 'Collect start');
  writeAgentEvent('collect:remote-start', {
    startBody,
    startData,
    attempts: startAttempts,
    recoveredFromUncertainResponse: startRecoveredFromUncertainResponse,
  });
  if (!JSON_OUTPUT && startData.results) {
    for (const item of startData.results) {
      const statusColor = item.status === 'started' ? 'green' : 'yellow';
      console.log(`  ${item.status === 'started' ? icon('start') : '○'} ${paint(statusColor, item.domain)}: ${item.status}`);
    }
  }

  let syncRunning = true;
  let stopIssued = false;
  let shuttingDown = false;
  const shutdown = async (sig) => {
    if (shuttingDown) process.exit(1);
    shuttingDown = true;
    syncRunning = false;
    console.log(`\n  ${icon('stop')} ${paint('yellow', `Received ${sig}; stopping target crawls...`)}`);
    try {
      await stopTargetDomains(targetDomains, 5000);
      console.log(`  ${icon('ok')} ${paint('green', 'Remote target crawls stopped')}`);
    } catch (err) {
      console.error(`  ${icon('error')} ${paint('red', `Failed to stop target crawls: ${err.message}`)}`);
    }
    closeLocalDb();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  const {
    loadLedger, saveLedger, appendBatch: ledgerAppendBatch,
    markConfirmed: ledgerMarkConfirmed, markPruned: ledgerMarkPruned,
    recordPruneFailure: ledgerRecordPruneFailure, findUnpruned,
    generateBatchId, getLastWatermark,
  } = require('./lib/sync-ledger');
  const LEDGER_FILE = getLedgerFile();
  let ledger = loadLedger(LEDGER_FILE);

  const unpruned = shouldPruneAfterIngest() ? findUnpruned(ledger) : [];
  if (unpruned.length > 0) {
    printStep('prune', `Draining ${unpruned.length} confirmed unpruned ledger entr${unpruned.length === 1 ? 'y' : 'ies'} before new sync...`, 'yellow');
    for (const entry of unpruned) {
      try {
        const pruneResult = await pruneRemoteWatermark(entry.watermark, entry.urlIds);
        ledger = ledgerMarkPruned(ledger, entry.batchId, {
          at: new Date().toISOString(),
          deleted: pruneResult.deleted,
        });
        saveLedger(LEDGER_FILE, ledger);
        if (!JSON_OUTPUT) console.log(`    ${icon('ok')} pruned ${entry.batchId} (${entry.urlIds.length} urlIds)`);
      } catch (err) {
        ledger = ledgerRecordPruneFailure(ledger, entry.batchId);
        saveLedger(LEDGER_FILE, ledger);
        if (!JSON_OUTPUT) console.log(`    ${icon('warn')} prune failed for ${entry.batchId}: ${err.message}`);
      }
    }
  }

  const batchController = createSyncBatchController(options.limit);
  const perfReporter = createPerfReporter();
  const perfSummaryEvery = parsePositiveIntArg('perf-summary-every') || 10;
  const noBackoff = args['no-backoff'] === true || args.noBackoff === true;
  const collectStartMs = Date.now();
  const collectStartISO = new Date(collectStartMs).toISOString();
  let round = 0;
  let totalUrls = 0;
  let totalContent = 0;
  let consecutiveEmpty = 0;
  let overrideSince = sinceMarker;
  let lastVerification = summarizeHostVerification([], targetDomains, options.targetPages);
  let lastNewPagesVerification = options.minNewPages > 0
    ? summarizeNewPagesVerification(targetDomains, collectStartISO, options.minNewPages)
    : null;
  let lastRemoteTerminal = false;

  const verifyAndMaybeStop = async (reason) => {
    const rows = queryLocalHostVerification(targetDomains, sinceMarker);
    lastVerification = summarizeHostVerification(rows, targetDomains, options.targetPages);
    let statusData = null;
    try {
      const response = await requestWithTimeout('GET', '/api/status', null, 10000);
      statusData = response.data;
      lastRemoteStatusSummary = summarizeRemoteStatus(statusData, targetDomains);
      lastRemoteTerminal = remoteTargetsTerminal(statusData, targetDomains);
    } catch (err) {
      statusCheckFailures++;
      if (!JSON_OUTPUT) console.log(`  ${icon('warn')} ${paint('yellow', `Status check skipped during verification: ${err.message}`)}`);
    }

    // Run new-pages verification when min-new-pages is configured
    if (options.minNewPages > 0) {
      lastNewPagesVerification = summarizeNewPagesVerification(targetDomains, collectStartISO, options.minNewPages);
    }

    if (!JSON_OUTPUT) {
      console.log(`\n  ${icon('verify')} ${paint('bold', `Local verification after ${reason}`)}`);
      printHostVerification(lastVerification, options.minCompleteHosts);
      if (options.minNewPages > 0 && lastNewPagesVerification) {
        printNewPagesVerification(lastNewPagesVerification, options.minCompleteHosts);
      }
      console.log(`  ${icon('remote')} Remote targets terminal: ${lastRemoteTerminal ? paint('green', 'yes') : paint('yellow', 'not yet')}`);
      if (statusData) printRemoteFrontierTelemetry(lastRemoteStatusSummary);
    }
    writeAgentEvent('collect:verification', {
      reason,
      summary: lastVerification,
      newPagesVerification: lastNewPagesVerification || null,
      remoteTerminal: lastRemoteTerminal,
      remoteStatus: statusData ? lastRemoteStatusSummary : null,
      remoteStatusError: statusData ? null : 'status-check-failed',
    });

    // Both gates must pass: target-pages AND min-new-pages (if configured)
    const targetPagesMet = lastVerification.completeCount >= options.minCompleteHosts;
    const newPagesMet = options.minNewPages === 0 || (lastNewPagesVerification && lastNewPagesVerification.completeCount >= options.minCompleteHosts);
    if (!stopIssued && targetPagesMet && newPagesMet) {
      printStep('stop', `Target met locally; stopping remote crawls and draining export batches...`, 'green');
      await stopTargetDomains(targetDomains, 15000);
      stopIssued = true;
      writeAgentEvent('collect:remote-stop', {
        reason: 'target-met',
        completeCount: lastVerification.completeCount,
        newPagesCompleteCount: lastNewPagesVerification ? lastNewPagesVerification.completeCount : null,
        minCompleteHosts: options.minCompleteHosts,
      });
    }

    return { statusData, summary: lastVerification, newPages: lastNewPagesVerification };
  };

  endPhase('remote-start');

  startPhase('sync-loop');
  if (options.syncMode === 'streaming') {
    // ── Streaming Sync Mode ─────────────────────────────────
    printStep('sync', `Entering streaming sync (SSE push, batch=${options.syncBatchSize}, window=${options.syncBatchWindowMs}ms).`, 'cyan');
    const { createStreamingSync } = require('./lib/streaming-sync');

    let streamingSyncDone = false;
    const streamingSync = createStreamingSync({
      remoteHost: REMOTE_HOST,
      batchSize: options.syncBatchSize,
      batchWindowMs: options.syncBatchWindowMs,
      onConnect: () => {
        if (!JSON_OUTPUT) printStep('ok', 'SSE connected — waiting for page:complete events...', 'green');
      },
      onError: (err) => {
        if (!JSON_OUTPUT) printStep('warn', `SSE error: ${err.message}`, 'yellow');
      },
      onEvent: (eventType, data) => {
        if (eventType === 'page:complete' && !JSON_OUTPUT) {
          console.log(`  ${icon('sync')} page:complete ${paint('cyan', data.domain || '')} ${data.url?.slice(0, 80) || ''}`);
        }
      },
      onBatch: async ({ urlIds, urls, reason, count }) => {
        round++;
        const roundStartMs = Date.now();
        try {
          const idsParam = urlIds.join(',');
          const queryPath = `/api/sync/pull?ids=${idsParam}`;
          const response = await requestWithTimeout('GET', queryPath, null, 60000);
          const { data } = response;
          const fetchMs = Date.now() - roundStartMs;

          if (!data || !data.urls || data.urls.length === 0) {
            if (!JSON_OUTPUT) printStep('warn', `Streaming batch empty (ids=${idsParam})`, 'yellow');
            return;
          }

          const ingestStart = Date.now();
          const result = ingestBatch(data);
          const ingestMs = Date.now() - ingestStart;
          const counts = getBatchCounts(data);
          totalUrls += counts.urls || 0;
          totalContent += counts.content || 0;

          const wm = loadWatermark();
          const confirmStart = Date.now();
          const { verification, pruneResult } = await confirmSaveAndMaybePrune(data, wm, counts);
          const confirmAndPruneMs = Date.now() - confirmStart;

          const roundMs = Date.now() - roundStartMs;
          perfReporter.record({
            fetchMs, ingestMs, verifyMs: 0, pruneMs: confirmAndPruneMs, totalMs: roundMs,
            rows: counts.urls || 0, bytes: response.decodedBytes || 0,
          });

          if (!JSON_OUTPUT) {
            const pruneText = pruneResult ? `, pruned ${JSON.stringify(pruneResult.deleted)}` : '';
            console.log(`  ${icon('ok')} [stream ${round}] ${paint('green', `+${counts.urls} urls, +${counts.content} content`)} (${fetchMs}ms fetch, ${ingestMs}ms ingest${pruneText})`);
          }

          writeAgentEvent('collect:stream-batch', {
            round, reason, urlIds, urls: urls.slice(0, 5), counts,
            timingsMs: { fetch: fetchMs, ingest: ingestMs, confirmAndPrune: confirmAndPruneMs, round: roundMs },
            prune: pruneResult || null,
          });

          // Adaptive batching: auto-tune streaming batch size
          const currentBatchSize = streamingSync.stats().batchSize;
          if (ingestMs < 50 && counts.urls >= currentBatchSize) {
            const newSize = Math.min(500, Math.ceil(currentBatchSize * 1.5));
            if (newSize !== currentBatchSize) {
              streamingSync.setBatchSize(newSize);
              if (!JSON_OUTPUT) console.log(`  📈 Auto-tuning stream batch size UP to ${newSize}`);
            }
          } else if (ingestMs > 200 && currentBatchSize > 5) {
            const newSize = Math.max(5, Math.floor(currentBatchSize * 0.5));
            if (newSize !== currentBatchSize) {
              streamingSync.setBatchSize(newSize);
              if (!JSON_OUTPUT) console.log(`  📉 Auto-tuning stream batch size DOWN to ${newSize}`);
            }
          }

          if (round % options.verifyEveryRounds === 0) {
            const { summary } = await verifyAndMaybeStop(`stream batch ${round}`);
            if (summary.allComplete || stopIssued) {
              streamingSyncDone = true;
              streamingSync.stop();
            }
          }
        } catch (err) {
          console.error(`  ${icon('error')} Stream batch error: ${err.message}`);
          writeAgentEvent('collect:stream-error', { round, error: err.message, urlIds });
        }
      },
    });

    streamingSync.start();

    const streamingMaxMs = (options.maxRounds || 120) * options.intervalSec * 1000;
    const streamingStartMs = Date.now();
    while (syncRunning && !streamingSyncDone) {
      await sleep(1000);
      if (Date.now() - streamingStartMs > streamingMaxMs) {
        printStep('warn', `Streaming sync timeout after ${Math.round(streamingMaxMs / 1000)}s`, 'yellow');
        break;
      }
    }

    await streamingSync.stop();
    const sStats = streamingSync.stats();
    if (!JSON_OUTPUT) {
      printStep('ok', `Streaming sync complete: ${sStats.pagesSynced} pages synced, ${sStats.batchesFlushed} batches, ${sStats.errors} errors`, 'green');
    }
    writeAgentEvent('collect:stream-final', sStats);
    endPhase('sync-loop');

  } else {
    // ── Polling Sync Mode (default) ─────────────────────────
    printStep('sync', `Entering collect sync loop (Ctrl+C stops target crawls).`, 'cyan');

    while (syncRunning && (!options.maxRounds || round < options.maxRounds)) {
      round++;
      const wm = loadWatermark();

      try {
        await prunePendingWatermark(wm);
        const since = overrideSince || getLastWatermark(ledger) || wm.lastWatermark;
        const limit = batchController.getLimit();
        const queryPath = appendWatermark(appendExportOptions(`/api/export/batch?window=${options.windowSec}&limit=${limit}`), since);
        const roundStartTime = Date.now();
        const exportRequestedAt = new Date(roundStartTime).toISOString();
        const response = await requestWithTimeout('GET', queryPath, null, 60000);
        const { data } = response;
        const fetchMs = Date.now() - roundStartTime;
        const exportReceivedAt = new Date().toISOString();

        if (!data.urls || data.urls.length === 0) {
          batchController.recordEmpty({ fetchMs });
          consecutiveEmpty++;
          writeAgentEvent('collect:round-empty', {
            round, exportRequestedAt, exportReceivedAt, fetchMs,
            remoteToLocal: {
              rawBytes: response.rawBytes || 0, decodedBytes: response.decodedBytes || 0,
              rawBytesPerSec: fetchMs > 0 ? ((response.rawBytes || 0) * 1000) / fetchMs : 0,
              decodedBytesPerSec: fetchMs > 0 ? ((response.decodedBytes || 0) * 1000) / fetchMs : 0,
            },
            consecutiveEmpty,
          });
          if (!JSON_OUTPUT) {
            process.stdout.write(`  ${icon('drain')} [${round}] No new data (${fetchMs}ms, empty ${consecutiveEmpty}/${options.drainEmptyRounds})\r`);
          }

          await verifyAndMaybeStop(`empty round ${round}`);
          if ((stopIssued || lastRemoteTerminal) && consecutiveEmpty >= options.drainEmptyRounds) break;
          if (consecutiveEmpty >= options.drainEmptyRounds && statusCheckFailures >= options.maxStatusFailures) {
            printStep('warn', `Status guard exiting after ${consecutiveEmpty} empty round(s) and ${statusCheckFailures} failed status check(s).`, 'yellow');
            writeAgentEvent('collect:status-guard-exit', {
              round, consecutiveEmpty, statusCheckFailures,
              maxStatusFailures: options.maxStatusFailures, drainEmptyRounds: options.drainEmptyRounds,
            });
            break;
          }

          const backoffMs = noBackoff ? options.intervalSec * 1000 : Math.min(consecutiveEmpty * 2000, 30000);
          await sleep(Math.max(options.intervalSec * 1000, backoffMs));
          continue;
        }

        consecutiveEmpty = 0;

        const batchId = generateBatchId();
        const urlIds = getBatchUrlIds(data);
        ledger = ledgerAppendBatch(ledger, {
          batchId, exportedAt: new Date().toISOString(), watermark: data.watermark, urlIds,
        });
        saveLedger(LEDGER_FILE, ledger);

        const ingestStart = Date.now();
        const result = ingestBatch(data);
        const ingestMs = Date.now() - ingestStart;
        const localSavedAt = new Date().toISOString();
        const counts = getBatchCounts(data);
        totalUrls += counts.urls || 0;
        totalContent += counts.content || 0;

        const confirmStart = Date.now();
        const { verification, pruneResult } = await confirmSaveAndMaybePrune(data, wm, counts);
        const confirmAndPruneMs = Date.now() - confirmStart;
        if (data.watermark) overrideSince = null;

        ledger = ledgerMarkConfirmed(ledger, batchId, new Date().toISOString());
        saveLedger(LEDGER_FILE, ledger);
        if (pruneResult) {
          ledger = ledgerMarkPruned(ledger, batchId, {
            at: new Date().toISOString(), deleted: pruneResult.deleted,
          });
          saveLedger(LEDGER_FILE, ledger);
        }

        const roundMs = Date.now() - roundStartTime;
        const decision = batchController.recordSuccess({ durationMs: roundMs, fetchedRows: counts.urls, fetchMs, ingestMs });
        logAdaptiveDecision(decision);
        perfReporter.record({
          fetchMs, ingestMs, verifyMs: 0, pruneMs: confirmAndPruneMs, totalMs: roundMs,
          rows: counts.urls || 0, bytes: response.decodedBytes || 0,
        });
        const downloadSummary = summarizeBatchRemoteDownloads(data);
        const statusTelemetry = await readRemoteStatusTelemetry(targetDomains);
        const remoteToLocalRawRate = formatBytesPerSecond(response.rawBytes || 0, fetchMs);
        const remoteToLocalDecodedRate = formatBytesPerSecond(response.decodedBytes || 0, fetchMs);
        const remoteDownloadRate = formatBytesPerSecond(downloadSummary.bytesDownloaded, downloadSummary.totalDownloadMs);

        if (!JSON_OUTPUT) {
          const pruneText = pruneResult ? `, ${icon('prune')} pruned ${JSON.stringify(pruneResult.deleted)}` : '';
          console.log(`  ${icon('ok')} [${round}] ${paint('green', `+${counts.urls} urls, +${counts.content} content`)} wm=${paint('dim', (data.watermark || '').slice(0, 19))} (${fetchMs}ms fetch, ${ingestMs}ms ingest${pruneText})`);
          console.log(`    ${icon('feature')} Remote downloads: ${downloadSummary.pagesDownloaded} pages, ${formatSize(downloadSummary.bytesDownloaded)} total in ${downloadSummary.totalDownloadMs}ms (${remoteDownloadRate})`);
          console.log(`    ${icon('sync')} Remote->local: ${formatSize(response.rawBytes || 0)} raw / ${formatSize(response.decodedBytes || 0)} decoded in ${fetchMs}ms (${remoteToLocalRawRate} raw, ${remoteToLocalDecodedRate} decoded)`);
          console.log(`    ${icon('db')} Local DB: saved at ${localSavedAt}; ingest ${ingestMs}ms, confirm/prune ${confirmAndPruneMs}ms, round ${roundMs}ms, next limit ${batchController.getLimit()}`);
          if (round % perfSummaryEvery === 0) {
            const ps = perfReporter.summary();
            console.log(`    ${icon('feature')} Perf (${ps.samples} samples): fetch p50=${ps.fetchMs.p50}ms p95=${ps.fetchMs.p95}ms, ingest p50=${ps.ingestMs.p50}ms p95=${ps.ingestMs.p95}ms, round p50=${ps.totalMs.p50}ms p95=${ps.totalMs.p95}ms, ${ps.rowsPerSec.toFixed(1)} rows/s`);
          }

          // ── Per-page download latency (verbose) ──
          if (options.showPageLatency && downloadSummary.responseCount > 0) {
            const responses = Array.isArray(data?.httpResponses) ? data.httpResponses : [];
            const urls = new Map((Array.isArray(data?.urls) ? data.urls : []).map(r => [Number(r.id), r]));
            if (responses.length > 0) {
              console.log(`    ${icon('feature')} ${paint('cyan', 'Page download latency:')}`);
              console.log(`      ${paint('dim', 'Host'.padEnd(22))} ${paint('dim', 'Status')} ${paint('dim', 'Size'.padStart(10))} ${paint('dim', 'DL ms'.padStart(8))} ${paint('dim', 'Total ms'.padStart(9))} ${paint('dim', 'URL')}`);
              console.log(`      ${paint('dim', '─'.repeat(90))}`);
              for (const resp of responses) {
                const urlRow = urls.get(Number(resp?.url_id));
                const host = String(urlRow?.host || '(unknown)').slice(0, 21);
                const status = String(resp?.http_status || '?').padStart(3);
                const bytes = formatSize(Number(resp?.bytes_downloaded || 0)).padStart(10);
                const dlMs = String(Number(resp?.download_ms || 0)).padStart(8);
                const totalMs = String(Number(resp?.total_ms || 0)).padStart(9);
                const urlStr = (urlRow?.url || resp?.url || '').slice(0, 60);
                console.log(`      ${host.padEnd(22)} ${status} ${bytes} ${dlMs} ${totalMs} ${paint('dim', urlStr)}`);
              }
            }
          }

          // ── Per-host download stats (verbose) ──
          if (options.showPerHostStats && Object.keys(downloadSummary.byHost).length > 0) {
            console.log(`    ${icon('feature')} ${paint('cyan', 'Per-host download stats:')}`);
            console.log(`      ${paint('dim', 'Host'.padEnd(22))} ${paint('dim', 'Pages'.padStart(6))} ${paint('dim', 'Content'.padStart(8))} ${paint('dim', 'Size'.padStart(10))} ${paint('dim', 'DL ms'.padStart(8))} ${paint('dim', 'Rate'.padStart(12))}`);
            console.log(`      ${paint('dim', '─'.repeat(70))}`);
            for (const [host, hs] of Object.entries(downloadSummary.byHost)) {
              const pages = String(hs.responses || 0).padStart(6);
              const content = String(hs.content || 0).padStart(8);
              const bytes = formatSize(hs.bytesDownloaded || 0).padStart(10);
              const dlMs = String(hs.totalDownloadMs || 0).padStart(8);
              const rate = formatBytesPerSecond(hs.bytesDownloaded || 0, hs.totalDownloadMs || 0).padStart(12);
              console.log(`      ${host.slice(0, 21).padEnd(22)} ${pages} ${content} ${bytes} ${dlMs} ${rate}`);
            }
          }
        }
        writeAgentEvent('collect:round-batch', {
          round, batchId, exportRequestedAt, exportReceivedAt, localSavedAt, counts,
          inserted: { urls: result.urlsInserted || 0, content: result.contentInserted || 0, responses: result.responsesInserted || 0 },
          verification,
          timingsMs: { remoteExportFetch: fetchMs, localDbIngest: ingestMs, confirmAndPrune: confirmAndPruneMs, round: roundMs },
          remoteDownloads: downloadSummary,
          remoteToLocal: {
            rawBytes: response.rawBytes || 0, decodedBytes: response.decodedBytes || 0,
            rawBytesPerSec: fetchMs > 0 ? ((response.rawBytes || 0) * 1000) / fetchMs : 0,
            decodedBytesPerSec: fetchMs > 0 ? ((response.decodedBytes || 0) * 1000) / fetchMs : 0,
          },
          remoteStatus: statusTelemetry,
          prune: pruneResult || null,
          nextLimit: batchController.getLimit(),
        });

        if (round % options.verifyEveryRounds === 0) {
          await verifyAndMaybeStop(`batch round ${round}`);
        }
      } catch (err) {
        console.error(`  ${icon('error')} [${round}] ${paint('red', `Error: ${err.message}`)}`);
        logAdaptiveDecision(batchController.recordError({ error: err.message }));
        consecutiveEmpty++;
      }

      if (syncRunning) await sleep(options.intervalSec * 1000);
    }
    endPhase('sync-loop');
  } // end sync mode branch

  startPhase('drain-and-verify');
  if (!stopIssued) {
    try {
      printStep('stop', 'Stopping target crawls after collect loop...', 'yellow');
      await stopTargetDomains(targetDomains, 15000);
      stopIssued = true;
      writeAgentEvent('collect:remote-stop', { reason: 'final-loop-exit' });
    } catch (err) {
      if (!JSON_OUTPUT) console.log(`  ${icon('warn')} ${paint('yellow', `Final stop failed: ${err.message}`)}`);
    }
  }

  await verifyAndMaybeStop('final drain');
  endPhase('drain-and-verify');
  const targetPagesMet = lastVerification.completeCount >= options.minCompleteHosts;
  const newPagesMet = options.minNewPages === 0 || (lastNewPagesVerification && lastNewPagesVerification.completeCount >= options.minCompleteHosts);
  const ok = targetPagesMet && newPagesMet;
  const collectDurationMs = Date.now() - collectStartMs;
  const perfSummary = perfReporter.summary();
  const diagnostics = buildCollectDiagnostics({
    ok,
    totalUrls,
    totalContent,
    targetDomains,
    options,
    lastRemoteStatus: lastRemoteStatusSummary,
    statusCheckFailures,
    startAttempts,
    startRecoveredFromUncertainResponse,
  });
  const result = {
    ok,
    targetDomains,
    sinceMarker,
    rounds: round,
    totalUrls,
    totalContent,
    minCompleteHosts: options.minCompleteHosts,
    minNewPages: options.minNewPages,
    durationMs: collectDurationMs,
    wallClockMs: Date.now() - wallClockStartMs,
    phaseTimings: Object.fromEntries(Object.entries(phaseTimings).map(([k, v]) => [k, v.durationMs || 0])),
    perfSummary,
    verification: lastVerification,
    newPagesVerification: lastNewPagesVerification || null,
    remoteTerminal: lastRemoteTerminal,
    ledger: {
      file: LEDGER_FILE,
      entries: ledger.entries.length,
      lastWatermark: getLastWatermark(ledger),
    },
    agentLogFile: agentLogFile || null,
    diagnostics,
  };
  if (!ok && (diagnostics.issues.length > 0 || diagnostics.recommendations.length > 0)) {
    writeAgentEvent('collect:diagnostics', diagnostics);
  }
  writeAgentEvent('collect:final', result);

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('');
    printStep(ok ? 'ok' : 'warn', `Collect ${ok ? 'complete' : 'finished below target'}: ${lastVerification.completeCount}/${lastVerification.totalHosts} host(s) at ${options.targetPages}+ pages`, ok ? 'green' : 'yellow');
    if (options.minNewPages > 0 && lastNewPagesVerification) {
      const npOk = lastNewPagesVerification.completeCount >= options.minCompleteHosts;
      printStep(npOk ? 'ok' : 'warn', `New-page gate: ${lastNewPagesVerification.completeCount}/${lastNewPagesVerification.totalHosts} host(s) at ${options.minNewPages}+ NEW pages`, npOk ? 'green' : 'yellow');
    }
    console.log(`  ${icon('sync')} Pulled ${totalUrls} URL rows and ${totalContent} content rows across ${round} round(s) in ${formatDuration(collectDurationMs)}.`);
    if (perfSummary.samples > 0) {
      console.log(`  ${icon('feature')} Perf (${perfSummary.samples} batches): fetch p50=${perfSummary.fetchMs.p50}ms p95=${perfSummary.fetchMs.p95}ms, ingest p50=${perfSummary.ingestMs.p50}ms p95=${perfSummary.ingestMs.p95}ms, round p50=${perfSummary.totalMs.p50}ms p95=${perfSummary.totalMs.p95}ms, ${perfSummary.rowsPerSec.toFixed(1)} rows/s`);
    }
    console.log(`  ${icon('ledger')} Ledger: ${LEDGER_FILE} (${ledger.entries.length} entries, wm=${getLastWatermark(ledger) || 'none'})`);

    // ── Phase timing breakdown (verbose) ──
    if (options.showPhaseTiming) {
      const wallClockMs = Date.now() - wallClockStartMs;
      console.log('');
      printStep('feature', 'Phase timing breakdown:', 'cyan');
      const phases = [
        ['Preflight (health + status + config)', phaseTimings['preflight']],
        ['Graph exploration (local DB)', phaseTimings['graph-exploration']],
        ['Graph seeding (push to remote)', phaseTimings['graph-seeding']],
        ['Remote start', phaseTimings['remote-start']],
        ['Sync loop', phaseTimings['sync-loop']],
        ['Drain & verify', phaseTimings['drain-and-verify']],
      ];
      console.log(`    ${paint('dim', 'Phase'.padEnd(42))} ${paint('dim', 'Duration'.padStart(10))} ${paint('dim', '%'.padStart(6))}`);
      console.log(`    ${paint('dim', '─'.repeat(60))}`);
      for (const [name, timing] of phases) {
        if (timing && timing.durationMs !== undefined) {
          const dur = formatDuration(timing.durationMs).padStart(10);
          const pct = wallClockMs > 0 ? ((timing.durationMs / wallClockMs) * 100).toFixed(1).padStart(5) + '%' : '';
          console.log(`    ${name.padEnd(42)} ${dur} ${pct}`);
        }
      }
      console.log(`    ${paint('dim', '─'.repeat(60))}`);
      console.log(`    ${'Total wall-clock time'.padEnd(42)} ${formatDuration(wallClockMs).padStart(10)}`);
    } else {
      // Always show total wall-clock time even without verbose phase timing
      const wallClockMs = Date.now() - wallClockStartMs;
      console.log(`  ${icon('feature')} Total wall-clock time: ${formatDuration(wallClockMs)}`);
    }
    if (!ok && diagnostics.issues.length > 0) {
      console.log('');
      printStep('feature', 'Diagnostics for agent review:', 'cyan');
      for (const issue of diagnostics.issues) {
        console.log(`    ${icon('warn')} ${issue}`);
      }
      for (const recommendation of diagnostics.recommendations) {
        console.log(`    ${icon('feature')} ${recommendation}`);
      }
    }
  }

  if (!ok) {
    const parts = [];
    if (!targetPagesMet) parts.push(`${lastVerification.completeCount}/${lastVerification.totalHosts} hosts at ${options.targetPages}+ pages`);
    if (!newPagesMet) parts.push(`${lastNewPagesVerification ? lastNewPagesVerification.completeCount : 0}/${targetDomains.length} hosts at ${options.minNewPages}+ NEW pages`);
    throw new Error(`Collect finished below target: ${parts.join('; ')}; required ${options.minCompleteHosts} host(s).`);
  }
}

async function cmdStop() {
  const body = {};
  if (args.domain) body.domain = args.domain;
  else if (args.domains) body.domains = args.domains.split(',').map(s => s.trim()).filter(Boolean);
  // else: stop all

  const { data } = await requestWithTimeout('POST', '/api/stop', body, 15000);
  if (JSON_OUTPUT) { console.log(JSON.stringify(data, null, 2)); return; }

  if (data.results) {
    for (const r of data.results) {
      console.log(`  ⏹ ${r.domain}: ${r.status}`);
    }
    console.log(`  Stopped ${data.stopped || data.results.length} domain(s)`);
  } else {
    console.log(`  ⏹ ${data.domain}: ${data.status}`);
  }
}

async function cmdSeed() {
  if (!args.domain) { console.error('  --domain required'); process.exit(1); }
  if (!args.urls) { console.error('  --urls required (comma-separated)'); process.exit(1); }

  const urls = args.urls.split(',').map(s => s.trim());
  const { data } = await requestWithTimeout('POST', '/api/seed', { domain: args.domain, urls }, 30000);

  if (JSON_OUTPUT) { console.log(JSON.stringify(data, null, 2)); return; }
  console.log(`  Seeded ${data.inserted}/${data.total} URLs for ${data.domain}`);
}

async function cmdAddDomain() {
  if (!args.domain) { console.error('  --domain required'); process.exit(1); }

  const body = {
    domain: args.domain,
    maxPages: parseInt(args['max-pages'], 10) || undefined,
  };

  if (args.seeds) body.seedUrls = args.seeds.split(',').map(s => s.trim());

  const { data } = await requestWithTimeout('POST', '/api/domains/add', body);
  if (JSON_OUTPUT) { console.log(JSON.stringify(data, null, 2)); return; }
  console.log(`  ➕ ${data.domain}: ${data.status} (maxPages: ${data.maxPages})`);
}

async function cmdRemoveDomain() {
  if (!args.domain) { console.error('  --domain required'); process.exit(1); }
  const { data } = await requestWithTimeout('POST', '/api/domains/remove', { domain: args.domain });
  if (JSON_OUTPUT) { console.log(JSON.stringify(data, null, 2)); return; }
  console.log(`  ➖ ${data.domain}: ${data.status}`);
}

async function cmdErrors() {
  const limit = args.limit || 50;
  const { data } = await requestWithTimeout('GET', `/api/errors?limit=${limit}`);
  if (JSON_OUTPUT) { console.log(JSON.stringify(data, null, 2)); return; }

  console.log(`  Recent errors (${data.count}):`);
  if (data.errors && data.errors.length > 0) {
    printTable(data.errors.slice(0, 20), [
      { label: 'Domain', get: e => e.host },
      { label: 'Kind', get: e => e.kind },
      { label: 'Code', get: e => e.code || '' },
      { label: 'Message', get: e => (e.message || '').substring(0, 60) },
      { label: 'At', get: e => e.at },
    ]);
  }
}

async function cmdContent() {
  const { data } = await requestWithTimeout('GET', '/api/content/stats');
  if (JSON_OUTPUT) { console.log(JSON.stringify(data, null, 2)); return; }

  console.log('  Content Stats:');
  console.log(`  Total stored: ${data.totals?.total_stored || 0}`);
  console.log(`  Total raw: ${formatSize(data.totals?.total_uncompressed)}`);
  console.log(`  Total compressed: ${formatSize(data.totals?.total_compressed)}`);
  console.log(`  Avg compression: ${(data.totals?.avg_compression_ratio * 100 || 0).toFixed(1)}%`);
  console.log('');

  if (data.byDomain && data.byDomain.length > 0) {
    printTable(data.byDomain, [
      { label: 'Domain', get: d => d.domain },
      { label: 'Count', get: d => d.count },
      { label: 'Raw', get: d => formatSize(d.total_uncompressed) },
      { label: 'Compressed', get: d => formatSize(d.total_compressed) },
    ]);
  }
}

async function buildRemoteQueueSummaryFromApi() {
  const queueOptions = normalizeQueueOptions({
    domain: args.domain,
    domains: args.domains,
    maxDomains: args['max-domains'] ?? args.maxDomains,
    errorLimit: args['error-limit'] ?? args.errorLimit,
    remoteHost: REMOTE_HOST,
  });
  const { data: statusPayload } = await requestWithTimeout('GET', '/api/status', null, 10000);
  let errorsPayload = { count: 0, errors: [] };
  let contentStats = { byDomain: [], totals: {} };
  const caveats = [];

  try {
    const { data } = await requestWithTimeout('GET', `/api/errors?limit=${encodeURIComponent(queueOptions.errorLimit)}`, null, 10000);
    errorsPayload = data;
  } catch (err) {
    caveats.push(`Recent error evidence unavailable: ${err.message}`);
  }

  try {
    const { data } = await requestWithTimeout('GET', '/api/content/stats', null, 10000);
    contentStats = data;
  } catch (err) {
    caveats.push(`Content-count evidence unavailable: ${err.message}`);
  }

  const summary = buildQueueSummary(statusPayload, {
    ...queueOptions,
    errorsPayload,
    contentStats,
  });
  if (caveats.length > 0) summary.caveats.push(...caveats);
  return summary;
}

function writeQueueJsonIfRequested(payload) {
  if (!args.out || args.out === true) return null;
  const outPath = path.resolve(process.cwd(), String(args.out));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  return outPath;
}

const MAX_READINESS_EVIDENCE_BYTES = 256 * 1024;

function readBoundedJsonEvidence(rawPath, label) {
  if (!rawPath || rawPath === true) return null;
  const filePath = path.resolve(process.cwd(), String(rawPath));
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    throw new Error(`Unable to read ${label} evidence ${filePath}: ${err.message}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} evidence is not a file: ${filePath}`);
  }
  if (stat.size > MAX_READINESS_EVIDENCE_BYTES) {
    throw new Error(`${label} evidence ${filePath} is ${stat.size} bytes; max supported size is ${MAX_READINESS_EVIDENCE_BYTES}`);
  }
  let value;
  try {
    value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`Invalid ${label} evidence JSON at ${filePath}: ${err.message}`);
  }
  return {
    path: filePath,
    byteSize: stat.size,
    value,
  };
}

function parseReadinessStaleAfterMs() {
  const raw = args['stale-after-min'] ?? args.staleAfterMin;
  if (raw === undefined || raw === null || raw === true || raw === '') return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10080) {
    throw new Error('--stale-after-min must be an integer from 1 to 10080');
  }
  return parsed * 60 * 1000;
}

async function cmdReadinessReport() {
  const payload = buildCombinedReadinessReport({
    generatedAt: args['reference-at'] || args.referenceAt || new Date().toISOString(),
    staleAfterMs: parseReadinessStaleAfterMs(),
    graphArtifact: readBoundedJsonEvidence(args['graph-artifact'] ?? args.graphArtifact, 'graph artifact'),
    queueSummary: readBoundedJsonEvidence(args['queue-summary'] ?? args.queueSummary, 'queue summary'),
    deployProof: readBoundedJsonEvidence(args['deploy-proof'] ?? args.deployProof, 'deploy proof'),
    previewEvidence: readBoundedJsonEvidence(args['preview-evidence'] ?? args.previewEvidence, 'preview evidence'),
    postSeedPlan: readBoundedJsonEvidence(args['post-seed-checklist'] ?? args.postSeedChecklist, 'post-seed checklist'),
  });
  const outPath = writeQueueJsonIfRequested(payload);

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  process.stdout.write(renderCombinedReadinessReportText(payload));
  if (outPath) console.log(`Wrote compact JSON: ${outPath}`);
}

async function cmdMaintenanceDecision() {
  const payload = buildQueueMaintenanceDecisionArtifact({
    generatedAt: args['reference-at'] || args.referenceAt || new Date().toISOString(),
    staleAfterMs: parseReadinessStaleAfterMs(),
    maintenanceAction: args['maintenance-action'] ?? args.maintenanceAction ?? args.action,
    approvalToken: args['approval-token'] ?? args.approvalToken,
    readinessReport: readBoundedJsonEvidence(args['readiness-report'] ?? args.readinessReport, 'readiness report'),
    queueSummary: readBoundedJsonEvidence(args['queue-summary'] ?? args.queueSummary, 'queue summary'),
  });
  const outPath = writeQueueJsonIfRequested(payload);

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  process.stdout.write(renderQueueMaintenanceDecisionText(payload));
  if (outPath) console.log(`Wrote compact JSON: ${outPath}`);
}

async function cmdSyncProofReadiness() {
  const payload = buildSyncLocalProofReadinessArtifact({
    generatedAt: args['reference-at'] || args.referenceAt || new Date().toISOString(),
    staleAfterMs: parseReadinessStaleAfterMs(),
    readinessReport: readBoundedJsonEvidence(args['readiness-report'] ?? args.readinessReport, 'readiness report'),
    queueSummary: readBoundedJsonEvidence(args['queue-summary'] ?? args.queueSummary, 'queue summary'),
  });
  const outPath = writeQueueJsonIfRequested(payload);

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  process.stdout.write(renderSyncLocalProofReadinessText(payload));
  if (outPath) console.log(`Wrote compact JSON: ${outPath}`);
}

async function cmdMaintenanceExecutionPlan() {
  const payload = buildQueueMaintenanceExecutionPlanArtifact({
    generatedAt: args['reference-at'] || args.referenceAt || new Date().toISOString(),
    staleAfterMs: parseReadinessStaleAfterMs(),
    maintenanceAction: args['maintenance-action'] ?? args.maintenanceAction ?? args.action,
    approvalToken: args['approval-token'] ?? args.approvalToken,
    maintenanceDecision: readBoundedJsonEvidence(args['maintenance-decision'] ?? args.maintenanceDecision, 'maintenance decision'),
    syncProofReadiness: readBoundedJsonEvidence(args['sync-proof-readiness'] ?? args.syncProofReadiness, 'sync-proof readiness'),
    readinessReport: readBoundedJsonEvidence(args['readiness-report'] ?? args.readinessReport, 'readiness report'),
    queueSummary: readBoundedJsonEvidence(args['queue-summary'] ?? args.queueSummary, 'queue summary'),
    deployProof: readBoundedJsonEvidence(args['deploy-proof'] ?? args.deployProof, 'deploy proof'),
  });
  const outPath = writeQueueJsonIfRequested(payload);

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  process.stdout.write(renderQueueMaintenanceExecutionPlanText(payload));
  if (outPath) console.log(`Wrote compact JSON: ${outPath}`);
}

async function cmdSecondSeedReadiness() {
  const payload = buildSecondSeedReadinessArtifact({
    generatedAt: args['reference-at'] || args.referenceAt || new Date().toISOString(),
    staleAfterMs: parseReadinessStaleAfterMs(),
    approvalToken: args['approval-token'] ?? args.approvalToken,
    maxHosts: args['max-hosts'] ?? args.maxHosts,
    maxCandidatesPerHost: args['max-candidates-per-host'] ?? args.maxCandidatesPerHost,
    maxTotalCandidates: args['max-total-candidates'] ?? args.maxTotalCandidates,
    graphArtifact: readBoundedJsonEvidence(args['graph-artifact'] ?? args.graphArtifact, 'graph artifact'),
    queueSummary: readBoundedJsonEvidence(args['queue-summary'] ?? args.queueSummary, 'queue summary'),
    deployProof: readBoundedJsonEvidence(args['deploy-proof'] ?? args.deployProof, 'deploy proof'),
    previewEvidence: readBoundedJsonEvidence(args['preview-evidence'] ?? args.previewEvidence, 'preview evidence'),
    postSeedPlan: readBoundedJsonEvidence(args['post-seed-checklist'] ?? args.postSeedChecklist, 'post-seed checklist'),
    readinessReport: readBoundedJsonEvidence(args['readiness-report'] ?? args.readinessReport, 'readiness report'),
    maintenanceExecutionPlan: readBoundedJsonEvidence(args['maintenance-execution-plan'] ?? args.maintenanceExecutionPlan, 'maintenance execution plan'),
  });
  const outPath = writeQueueJsonIfRequested(payload);

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  process.stdout.write(renderSecondSeedReadinessText(payload));
  if (outPath) console.log(`Wrote compact JSON: ${outPath}`);
}

async function cmdQueueSummary() {
  const summary = await buildRemoteQueueSummaryFromApi();
  const wantsChecklist = effectiveCommand === 'queue-checklist'
    || effectiveCommand === 'queue-maintenance-checklist'
    || isTrueArg('maintenance-checklist')
    || isTrueArg('queue-maintenance-checklist');
  const payload = wantsChecklist
    ? buildQueueMaintenanceChecklist(summary)
    : summary;
  const outPath = writeQueueJsonIfRequested(payload);

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  process.stdout.write(wantsChecklist
    ? renderQueueMaintenanceChecklistText(payload)
    : renderQueueSummaryText(payload));
  if (outPath) console.log(`Wrote compact JSON: ${outPath}`);
}

// ── Pull / Sync Commands ────────────────────────────────────

async function cmdPull() {
  validatePruneExportConfig();
  const windowSec = parseInt(args.window, 10) || 10;
  const limit = parseInt(args.limit, 10) || 500;
  const wm = loadWatermark();
  await prunePendingWatermark(wm);
  const since = args.since || wm.lastWatermark;

  // Build query with watermark for incremental sync
  const queryPath = appendWatermark(appendExportOptions(`/api/export/batch?window=${windowSec}&limit=${limit}`), since);

  console.log(`  Pulling batch from ${REMOTE_HOST}...`);
  console.log(`  Window: ${windowSec}s, Limit: ${limit}, Watermark: ${since || '(none)'}`);
  if (shouldPruneAfterIngest()) console.log('  Prune after ingest: enabled (remote URL state retained unless --prune-delete-urls is set)');

  const startTime = Date.now();
  const { data, headers } = await requestWithTimeout('GET', queryPath, null, 60000);
  const fetchMs = Date.now() - startTime;

  const counts = getBatchCounts(data);

  if (!data.urls || data.urls.length === 0) {
    console.log(`  No new data (fetch took ${fetchMs}ms)`);
    return { urls: 0, content: 0, fetchMs };
  }

  console.log(`  Fetched batch: ${counts.urls} URLs, ${counts.content} content, ${counts.httpResponses} responses, ${counts.links} links (${fetchMs}ms)`);

  // Ingest to local DB
  const ingestStart = Date.now();
  const result = ingestBatch(data);
  const ingestMs = Date.now() - ingestStart;
  const { verification, pruneResult } = await confirmSaveAndMaybePrune(data, wm, counts);

  console.log(`  Ingested: ${result.urlsInserted || 0} URLs, ${result.contentInserted || 0} content, ${result.responsesInserted || 0} responses (${ingestMs}ms)`);
  console.log(`  Confirmed local save: ${verification.checked.urls} URLs, ${verification.checked.httpResponses} responses, ${verification.checked.content} content, ${verification.checked.links} links`);
  if (pruneResult) console.log(`  Remote pruned: ${JSON.stringify(pruneResult.deleted)} retained=${JSON.stringify(pruneResult.retained || {})}`);
  console.log(`  Total pulled this session: ${wm.totalPulled}`);

  return { urls: counts.urls, content: counts.content, fetchMs, ingestMs, ...result };
}

async function cmdSync() {
  validatePruneExportConfig();
  const intervalSec = parseInt(args.interval, 10) || 5;
  const maxRounds = args.rounds ? parseInt(args.rounds, 10) : Infinity;
  const initialLimit = parsePositiveIntArg('limit') || 500;
  const batchController = createSyncBatchController(initialLimit);
  const noBackoff = args['no-backoff'] === true || args.noBackoff === true;
  const budgetOptions = normalizeStorageBudgetOptions(args);
  const perfReporter = createPerfReporter({ capacity: 60 });
  const perfPrintEvery = parsePositiveIntArg('perf-summary-every') || 10;
  let lastBackpressureAction = 'normal';

  // ── Ledger (source of truth) ──────────────────────────────
  const {
    loadLedger, saveLedger, appendBatch: ledgerAppendBatch,
    markConfirmed: ledgerMarkConfirmed, markPruned: ledgerMarkPruned,
    recordPruneFailure: ledgerRecordPruneFailure, findUnpruned,
    generateBatchId, getLastWatermark,
  } = require('./lib/sync-ledger');
  const LEDGER_FILE = path.resolve(__dirname, '.crawl-remote-ledger.json');
  let ledger = loadLedger(LEDGER_FILE);

  /** Mirror ledger watermark to legacy file for one release */
  function mirrorLegacyWatermark() {
    const wm = loadWatermark();
    const ledgerWm = getLastWatermark(ledger);
    if (ledgerWm) wm.lastWatermark = ledgerWm;
    wm.totalPulled = ledger.totalPulled || wm.totalPulled || 0;
    saveWatermark(wm);
  }

  /** Extract url ids from a batch export payload */
  function extractUrlIdsFromBatch(data) {
    return getBatchUrlIds(data);
  }

  // ── Drain unpruned ledger entries from previous crash ─────
  const unpruned = findUnpruned(ledger);
  if (unpruned.length > 0) {
    console.log(`  Ledger: draining ${unpruned.length} unpruned entries from previous run...`);
    for (const entry of unpruned) {
      try {
        const pruneResult = await pruneRemoteWatermark(entry.watermark, entry.urlIds);
        ledger = ledgerMarkPruned(ledger, entry.batchId, {
          at: new Date().toISOString(),
          deleted: pruneResult.deleted,
        });
        saveLedger(LEDGER_FILE, ledger);
        console.log(`    ✓ pruned ledger entry ${entry.batchId} (${entry.urlIds.length} urlIds)`);
      } catch (e) {
        ledger = ledgerRecordPruneFailure(ledger, entry.batchId);
        saveLedger(LEDGER_FILE, ledger);
        console.log(`    ✗ prune failed for ${entry.batchId} (retry #${entry.pruneRetries + 1}): ${e.message}`);
      }
    }
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Continuous Sync Loop');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Remote: ${REMOTE_HOST}`);
  console.log(`  Local DB: ${LOCAL_DB_PATH}`);
  console.log(`  Interval: ${intervalSec}s`);
  console.log(`  Window: ${parseInt(args.window, 10) || 5}s`);
  console.log(`  Limit: ${batchController.getLimit()}`);
  console.log(`  Adaptive batching: ${getAdaptiveSummary(batchController)}`);
  console.log(`  Storage budget: ${budgetOptions.enabled ? `enabled budget=${budgetOptions.budgetMb}MB reserve=${budgetOptions.reserveMb || 0}MB` : 'disabled'}`);
  console.log(`  Prune after ingest: ${shouldPruneAfterIngest() ? 'enabled' : 'disabled'}`);
  console.log(`  Backoff: ${noBackoff ? 'disabled' : 'enabled after empty rounds'}`);
  console.log(`  Max rounds: ${maxRounds === Infinity ? '∞' : maxRounds}`);
  console.log(`  Ledger: ${LEDGER_FILE} (${ledger.entries.length} entries, wm=${getLastWatermark(ledger) || 'none'})`);
  console.log('  Press Ctrl+C to stop');
  console.log('');

  let round = 0;
  let totalUrls = 0;
  let totalContent = 0;
  let consecutiveEmpty = 0;
  let overrideSince = args.since || null;

  const windowSec = parseInt(args.window, 10) || 5;

  while (round < maxRounds) {
    round++;
    const wm = loadWatermark();

    try {
      await prunePendingWatermark(wm);
      const since = overrideSince || getLastWatermark(ledger) || wm.lastWatermark;
      const limit = batchController.getLimit();
      const queryPath = appendWatermark(appendExportOptions(`/api/export/batch?window=${windowSec}&limit=${limit}`), since);
      const roundStartTime = Date.now();
      const { data } = await requestWithTimeout('GET', queryPath, null, 60000);
      const fetchMs = Date.now() - roundStartTime;

      if (!data.urls || data.urls.length === 0) {
        batchController.recordEmpty({ fetchMs });
        consecutiveEmpty++;
        const dot = consecutiveEmpty > 3 ? '.' : '';
        process.stdout.write(`  [${round}] No new data (${fetchMs}ms)${dot}\r`);

        // Back off after several empty rounds
        const backoffMs = noBackoff ? intervalSec * 1000 : Math.min(consecutiveEmpty * 2000, 30000);
        await sleep(Math.max(intervalSec * 1000, backoffMs));
        continue;
      }

      consecutiveEmpty = 0;

      // ── Record batch in ledger ─────────────────────────────
      const batchId = generateBatchId();
      const urlIds = extractUrlIdsFromBatch(data);
      ledger = ledgerAppendBatch(ledger, {
        batchId,
        exportedAt: new Date().toISOString(),
        watermark: data.watermark,
        urlIds,
      });
      saveLedger(LEDGER_FILE, ledger);

      // Ingest
      const ingestStart = Date.now();
      const result = ingestBatch(data);
      const ingestMs = Date.now() - ingestStart;
      const counts = getBatchCounts(data);

      totalUrls += counts.urls || 0;
      totalContent += counts.content || 0;
      const { verification, pruneResult } = await confirmSaveAndMaybePrune(data, wm, counts);
      if (data.watermark) overrideSince = null;

      // ── Mark confirmed in ledger ──────────────────────────
      ledger = ledgerMarkConfirmed(ledger, batchId, new Date().toISOString());
      saveLedger(LEDGER_FILE, ledger);

      // ── Mark pruned in ledger (if prune happened) ─────────
      if (pruneResult) {
        ledger = ledgerMarkPruned(ledger, batchId, {
          at: new Date().toISOString(),
          deleted: pruneResult.deleted,
        });
        saveLedger(LEDGER_FILE, ledger);
      }

      // ── Mirror legacy watermark ───────────────────────────
      mirrorLegacyWatermark();

      const roundMs = Date.now() - roundStartTime;
      const decision = batchController.recordSuccess({ durationMs: roundMs, fetchedRows: counts.urls, fetchMs, ingestMs });
      logAdaptiveDecision(decision);

      const ts = new Date().toLocaleTimeString();
      const pruneText = pruneResult ? `, pruned ${JSON.stringify(pruneResult.deleted)}` : '';
      console.log(`  [${round}] ${ts} — ${counts.urls} URLs, ${counts.content} content → ${result.urlsInserted || 0} new URLs, ${result.contentInserted || 0} new content; confirmed ${verification.checked.urls}/${verification.checked.httpResponses}/${verification.checked.content}/${verification.checked.links}${pruneText} (fetch: ${fetchMs}ms, ingest: ${ingestMs}ms, round: ${roundMs}ms, next limit: ${batchController.getLimit()}) | Total: ${totalUrls} URLs, ${totalContent} content`);

      // ── Perf reporter ─────────────────────────────────────
      perfReporter.record({
        fetchMs,
        ingestMs,
        verifyMs: 0,
        pruneMs: pruneResult?.durationMs || 0,
        totalMs: roundMs,
        rows: counts.urls || 0,
        bytes: counts.content || 0,
      });
      if (round % perfPrintEvery === 0) {
        const s = perfReporter.summary();
        if (s.samples) {
          console.log(`  ↳ perf p50/p95 fetch=${s.fetchMs.p50}/${s.fetchMs.p95}ms ingest=${s.ingestMs.p50}/${s.ingestMs.p95}ms total=${s.totalMs.p50}/${s.totalMs.p95}ms rows/s=${s.rowsPerSec.toFixed(2)} samples=${s.samples}`);
        }
      }

      // ── Storage budget + backpressure ─────────────────────
      if (budgetOptions.enabled) {
        try {
          const { data: stats } = await requestWithTimeout('GET', '/api/content/stats', null, 10000);
          const remoteContentBytes = Number(stats?.totals?.compressed_size || stats?.totalBytes || 0);
          const budgetDecision = evaluateStorageBudget({
            remoteContentBytes,
            budgetMb: budgetOptions.budgetMb,
            reserveMb: budgetOptions.reserveMb,
            currentLimit: batchController.getLimit(),
            minLimit: parsePositiveIntArg('min-limit') || 1,
            maxLimit: parsePositiveIntArg('max-limit') || initialLimit,
          });
          if (budgetDecision.action !== 'normal') {
            console.log(`  ↳ storage budget: action=${budgetDecision.action} target-limit=${budgetDecision.targetLimit} headroom=${budgetDecision.headroomMb?.toFixed(1)}MB (${budgetDecision.reason})`);
          }
          if (budgetDecision.action !== lastBackpressureAction) {
            const bp = evaluateBackpressure({
              action: budgetDecision.action,
              currentConcurrency: parsePositiveIntArg('max-concurrent') || 10,
              normalConcurrency: parsePositiveIntArg('normal-concurrency') || parsePositiveIntArg('max-concurrent') || 10,
              reducedConcurrency: parsePositiveIntArg('reduced-concurrency') || 2,
              reason: budgetDecision.reason,
            });
            if (bp.changed) {
              try {
                await requestWithTimeout('POST', '/api/throttle', { maxConcurrent: bp.desiredConcurrency, pause: bp.pause, reason: bp.reason }, 5000);
                console.log(`  ↳ backpressure: requested maxConcurrent=${bp.desiredConcurrency} pause=${bp.pause} (${bp.reason})`);
              } catch (e) {
                // best-effort: remote may not yet expose /api/throttle
                if (!/404|not found|ECONN/i.test(e.message)) {
                  console.log(`  ↳ backpressure (skipped): ${e.message}`);
                }
              }
            }
            lastBackpressureAction = budgetDecision.action;
          }
        } catch (e) {
          // /api/content/stats failures shouldn't fail the sync loop
        }
      }

    } catch (err) {
      console.error(`  [${round}] Error: ${err.message}`);
      logAdaptiveDecision(batchController.recordError({ error: err.message }));
      consecutiveEmpty++;
    }

    await sleep(intervalSec * 1000);
  }

  console.log('');
  console.log(`  Sync complete: ${round} rounds, ${totalUrls} URLs, ${totalContent} content records pulled`);
  console.log(`  Ledger: ${ledger.entries.length} entries, last watermark=${getLastWatermark(ledger) || 'none'}`);
  closeLocalDb();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function cmdRun() {
  validatePruneExportConfig();
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Rapid Coordination: Start + Continuous Sync + Stop');
  console.log('═══════════════════════════════════════════════════════');

  // 1. Start domains
  console.log('  ▶ Starting domains...');
  const targetDomains = getRequestedDomains();
  if (targetDomains.length > 0) {
    await registerRequestedDomains(targetDomains);
  }
  const startBody = {};
  if (args.domain) startBody.domain = args.domain;
  else if (targetDomains.length > 0) startBody.domains = targetDomains;
  applyStartOverrides(startBody);
  const { data: startData } = await requestWithTimeout('POST', '/api/start', startBody, 15000);
  assertStartSucceeded(startData, targetDomains, 'Run start');

  if (startData.results) {
    console.log(`  Started ${startData.started || startData.results.length} domain(s)`);
  } else {
    console.log(`  Started ${startData.domain || 'all'}`);
  }

  // 2. Setup graceful shutdown for Remote Sync
  let isShuttingDown = false;
  let syncRunning = true;

  const shutdown = async (sig) => {
    if (isShuttingDown) {
      console.log(`\n  [Force Quit] Double ${sig} received. Hard exiting.`);
      process.exit(1);
    }
    isShuttingDown = true;
    syncRunning = false;

    console.log(`\n  ⏹ Received ${sig}, stopping remote crawls... (Press Ctrl+C again to force quit)`);

    // Attempt to stop the same domains we started
    const stopBody = {};
    if (targetDomains.length === 1) stopBody.domain = targetDomains[0];
    else if (targetDomains.length > 1) stopBody.domains = targetDomains;

    try {
      // Use an aggressive 5-second timeout for the shutdown hook so we don't hang
      await requestWithTimeout('POST', '/api/stop', stopBody, 5000);
      console.log('  ⏹ Remote crawls stopped successfully.');
    } catch (e) {
      console.error(`  ✗ Failed to stop remote crawls: ${e.message}`);
    }
    closeLocalDb();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 3. Continuous Sync Loop (instrumented — parity with cmdSync)
  const intervalSec = parseInt(args.interval, 10) || 10;
  const windowSec = parseInt(args.window, 10) || 30;
  const initialLimit = parsePositiveIntArg('limit') || 500;
  const batchController = createSyncBatchController(initialLimit);
  const noBackoff = args['no-backoff'] === true || args.noBackoff === true;
  const budgetOptions = normalizeStorageBudgetOptions(args);
  const { createInstrumentation } = require('./lib/sync-loop-instrumentation');
  const instrumentation = createInstrumentation({
    budgetOptions,
    perfPrintEvery: parsePositiveIntArg('perf-summary-every') || 10,
    initialLimit,
    argOverrides: args,
  });
  const {
    loadLedger, saveLedger, appendBatch: ledgerAppendBatch,
    markConfirmed: ledgerMarkConfirmed,
    markPruned: ledgerMarkPruned,
    generateBatchId, getLastWatermark,
  } = require('./lib/sync-ledger');
  const LEDGER_FILE = path.resolve(__dirname, '.crawl-remote-ledger.json');
  let ledger = loadLedger(LEDGER_FILE);
  const ledgerWm = getLastWatermark(ledger);
  if (ledgerWm) {
    const wm = loadWatermark();
    wm.lastWatermark = ledgerWm;
    saveWatermark(wm);
  }

  console.log(`\n  🔄 Entering continuous sync loop (every ${intervalSec}s). Press Ctrl+C to stop.`);
  console.log(`  Initial limit: ${batchController.getLimit()}`);
  console.log(`  Adaptive batching: ${getAdaptiveSummary(batchController)}`);
  console.log(`  Storage budget: ${budgetOptions.enabled ? `enabled budget=${budgetOptions.budgetMb}MB reserve=${budgetOptions.reserveMb || 0}MB` : 'disabled'}`);
  console.log(`  Prune after ingest: ${shouldPruneAfterIngest() ? 'enabled' : 'disabled'}`);
  console.log(`  Ledger: ${LEDGER_FILE} (${ledger.entries.length} entries, wm=${getLastWatermark(ledger) || 'none'})`);

  let round = 0;
  let totalUrls = 0;
  let totalContent = 0;
  let consecutiveEmpty = 0;
  let overrideSince = args.since || null;

  while (syncRunning) {
    round++;
    const wm = loadWatermark();

    try {
      await prunePendingWatermark(wm);
      const since = overrideSince || getLastWatermark(ledger) || wm.lastWatermark;
      const limit = batchController.getLimit();
      const queryPath = appendWatermark(appendExportOptions(`/api/export/batch?window=${windowSec}&limit=${limit}`), since);
      const roundStartTime = Date.now();
      // Generous 60s timeout for bulk batches
      const { data } = await requestWithTimeout('GET', queryPath, null, 60000);
      const fetchMs = Date.now() - roundStartTime;

      if (!data.urls || data.urls.length === 0) {
        batchController.recordEmpty({ fetchMs });
        consecutiveEmpty++;
        const dot = consecutiveEmpty > 3 ? '.' : '';
        process.stdout.write(`  [${round}] No new data (${fetchMs}ms)${dot}\r`);

        const backoffMs = noBackoff ? intervalSec * 1000 : Math.min(consecutiveEmpty * 2000, 30000);
        await sleep(Math.max(intervalSec * 1000, backoffMs));
        continue;
      }
      consecutiveEmpty = 0;

      const batchId = generateBatchId();
      ledger = ledgerAppendBatch(ledger, {
        batchId,
        exportedAt: new Date().toISOString(),
        watermark: data.watermark,
        urlIds: getBatchUrlIds(data),
      });
      saveLedger(LEDGER_FILE, ledger);

      const ingestStart = Date.now();
      const result = ingestBatch(data);
      const ingestMs = Date.now() - ingestStart;
      const counts = getBatchCounts(data);

      totalUrls += counts.urls || 0;
      totalContent += counts.content || 0;
      const { verification, pruneResult } = await confirmSaveAndMaybePrune(data, wm, counts);
      if (data.watermark) overrideSince = null;
      ledger = ledgerMarkConfirmed(ledger, batchId, new Date().toISOString());
      saveLedger(LEDGER_FILE, ledger);
      if (pruneResult) {
        ledger = ledgerMarkPruned(ledger, batchId, {
          at: new Date().toISOString(),
          deleted: pruneResult.deleted,
        });
        saveLedger(LEDGER_FILE, ledger);
      }
      const roundMs = Date.now() - roundStartTime;
      const decision = batchController.recordSuccess({ durationMs: roundMs, fetchedRows: counts.urls, fetchMs, ingestMs });
      logAdaptiveDecision(decision);

      const ts = new Date().toLocaleTimeString();
      const pruneText = pruneResult ? `, pruned ${JSON.stringify(pruneResult.deleted)}` : '';
      console.log(`  [${round}] ${ts} — ${counts.urls} URLs, ${counts.content} content → ${result.urlsInserted || 0} new URLs, ${result.contentInserted || 0} new content; confirmed ${verification.checked.urls}/${verification.checked.httpResponses}/${verification.checked.content}/${verification.checked.links}${pruneText} (fetch: ${fetchMs}ms, ingest: ${ingestMs}ms, round: ${roundMs}ms, next limit: ${batchController.getLimit()}) | Total: ${totalUrls} URLs, ${totalContent} content`);

      // ── Perf reporter (parity with cmdSync) ─────────────────
      const instrResult = instrumentation.onRoundSuccess({
        fetchMs, ingestMs, roundMs,
        rows: counts.urls || 0, bytes: counts.content || 0,
        pruneResult, currentLimit: batchController.getLimit(),
      });
      if (instrResult.perfLine) console.log(instrResult.perfLine);

      // ── Storage budget + backpressure (parity with cmdSync) ─
      if (budgetOptions.enabled) {
        try {
          const { data: stats } = await requestWithTimeout('GET', '/api/content/stats', null, 10000);
          const remoteContentBytes = Number(stats?.totals?.compressed_size || stats?.totalBytes || 0);
          const { budgetDecision, backpressure, transitioned } = instrumentation.evaluateBudget({
            remoteContentBytes,
            currentLimit: batchController.getLimit(),
          });
          if (budgetDecision && budgetDecision.action !== 'normal') {
            console.log(`  ↳ storage budget: action=${budgetDecision.action} target-limit=${budgetDecision.targetLimit} headroom=${budgetDecision.headroomMb?.toFixed(1)}MB (${budgetDecision.reason})`);
          }
          if (transitioned && backpressure?.changed) {
            try {
              await requestWithTimeout('POST', '/api/throttle', { maxConcurrent: backpressure.desiredConcurrency, pause: backpressure.pause, reason: backpressure.reason }, 5000);
              console.log(`  ↳ backpressure: requested maxConcurrent=${backpressure.desiredConcurrency} pause=${backpressure.pause} (${backpressure.reason})`);
            } catch (e) {
              if (!/404|not found|ECONN/i.test(e.message)) {
                console.log(`  ↳ backpressure (skipped): ${e.message}`);
              }
            }
          }
        } catch (e) {
          // /api/content/stats failures shouldn't fail the sync loop
        }
      }
    } catch (err) {
      if (syncRunning) console.error(`  [${round}] Error: ${err.message}`);
      logAdaptiveDecision(batchController.recordError({ error: err.message }));
      instrumentation.onRoundError();
      consecutiveEmpty++;
    }

    if (syncRunning) await sleep(intervalSec * 1000);
  }
}

function formatBoundedSummary(summary) {
  const running = summary.running.map(status => `${status.domain}(${status.stats?.fetched || status.stats?.done || 0})`).join(', ');
  const completed = summary.completed.map(status => `${status.domain}(${status.stats?.fetched || status.stats?.done || 0})`).join(', ');
  const notStarted = summary.notStarted.map(status => status.domain).join(', ');
  const unknown = summary.unknown.map(status => `${status.domain}(${status.reason || 'unknown'})`).join(', ');
  return {
    running: running || '(none)',
    completed: completed || '(none)',
    notStarted: notStarted || '(none)',
    unknown: unknown || '(none)',
  };
}

async function cmdBounded() {
  let { data: initialStatus } = await requestWithTimeout('GET', '/api/status', null, 10000);
  const targetDomains = resolveTargetDomains(args, initialStatus);
  if (targetDomains.length === 0) {
    throw new Error('No target domains resolved for bounded crawl');
  }

  const maxPagesOverride = args['max-pages'] ? parseInt(args['max-pages'], 10) : undefined;
  initialStatus = await ensureDomainsForRun(initialStatus, targetDomains, maxPagesOverride);

  const startBody = {};
  if (args.domain) startBody.domain = args.domain;
  else if (args.domains) startBody.domains = targetDomains;
  applyStartOverrides(startBody);

  const pollMs = Math.max(1000, (parseInt(args.poll, 10) || 5) * 1000);
  const timeoutMs = Math.max(10000, (parseInt(args['timeout-min'], 10) || 30) * 60 * 1000);
  const startedAt = Date.now();

  const { data: startData } = await requestWithTimeout('POST', '/api/start', startBody, 15000);
  assertStartSucceeded(startData, targetDomains, 'Bounded crawl start');
  let lastProgressKey = '';
  let consecutiveUnknown = 0;
  const maxUnknownPolls = 3;

  while (Date.now() - startedAt < timeoutMs) {
    const { data: statusData } = await requestWithTimeout('GET', '/api/status', null, 10000);
    const summary = summarizeBoundedRun(statusData, targetDomains);
    const currentProgressKey = JSON.stringify({
      running: summary.running.map(domain => domain.domain),
      completed: summary.completed.map(domain => domain.domain),
      notStarted: summary.notStarted.map(domain => domain.domain),
      unknown: summary.unknown.map(domain => domain.domain),
    });

    if (!JSON_OUTPUT && currentProgressKey !== lastProgressKey) {
      const formatted = formatBoundedSummary(summary);
      console.log(`  Running: ${formatted.running}`);
      console.log(`  Completed: ${formatted.completed}`);
      console.log(`  Not started: ${formatted.notStarted}`);
      console.log(`  Unknown: ${formatted.unknown}`);
      console.log('');
      lastProgressKey = currentProgressKey;
    }

    if (summary.unknown.length > 0) {
      consecutiveUnknown++;
      if (consecutiveUnknown >= maxUnknownPolls) {
        const formatted = formatBoundedSummary(summary);
        throw new Error(`Remote status did not include requested domains after ${consecutiveUnknown} polls: ${formatted.unknown}`);
      }
    } else {
      consecutiveUnknown = 0;
    }

    if (summary.allDone) {
      const result = {
        ok: true,
        started: startData,
        elapsedMs: Date.now() - startedAt,
        summary,
      };
      if (JSON_OUTPUT) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`  Completed ${summary.completed.length}/${summary.targetDomains.length} domains in ${formatDuration(result.elapsedMs)}`);
      }
      return;
    }

    await sleep(pollMs);
  }

  const { data: finalStatus } = await requestWithTimeout('GET', '/api/status', null, 10000);
  const finalSummary = summarizeBoundedRun(finalStatus, targetDomains);
  const formatted = formatBoundedSummary(finalSummary);
  throw new Error(
    `Timed out waiting for bounded crawl completion after ${formatDuration(timeoutMs)}. ` +
    `Running: ${formatted.running}. Not started: ${formatted.notStarted}. Unknown: ${formatted.unknown}.`
  );
}

// ── graph-seeds: Explore local link graph ─────────────────────

async function cmdGraphSeeds() {
  const { data: remoteStatus } = await requestWithTimeout('GET', '/api/status', null, 10000).catch(() => ({ data: null }));
  const targetDomains = resolveTargetDomains(args, remoteStatus);
  if (targetDomains.length === 0) {
    throw new Error('No target domains. Use --domain or --domains.');
  }

  const limit = parsePositiveIntArg('limit') || 20;
  printBanner(`${icon('feature')} Local Link Graph Explorer`, `${targetDomains.length} domain(s), limit=${limit}`);

  const result = exploreLocalGraph(targetDomains, { limit });

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.totalUnvisited === 0) {
    printStep('ok', 'No unvisited URLs found in the local link graph.', 'green');
    printStep('ok', 'All discovered links have already been crawled.', 'dim');
    return;
  }

  printStep('feature', `Found ${result.totalUnvisited} unvisited URL(s) across ${targetDomains.length} domain(s)`, 'cyan');
  console.log('');

  for (const domain of targetDomains) {
    const rows = result.byDomain[domain];
    if (rows?.error) {
      printStep('warn', `${domain}: ${rows.error}`, 'yellow');
      continue;
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      printStep('ok', `${domain}: fully explored`, 'dim');
      continue;
    }

    console.log(`  ${icon('feature')} ${paint('cyan', domain)} — ${rows.length} unvisited link(s):`);
    printTable(rows.slice(0, limit), [
      { label: 'Links', get: row => row.linkCount },
      { label: 'URL', get: row => row.targetUrl.length > 90 ? row.targetUrl.slice(0, 87) + '...' : row.targetUrl },
      { label: 'Source', get: row => (row.sourceUrl || '').split('/').slice(0, 4).join('/') },
    ]);
    console.log('');
  }
}

// ── Execute Command ─────────────────────────────────────────

async function cmdProfiles() {
  if (!fs.existsSync(PROFILES_DIR)) {
    console.log('No profiles directory found.');
    return;
  }
  const files = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json')).sort();
  if (!files.length) {
    console.log('No profiles found.');
    return;
  }
  console.log(`\n  Available profiles (${PROFILES_DIR}):\n`);
  for (const file of files) {
    const name = file.replace(/\.json$/, '');
    try {
      const profile = JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, file), 'utf8'));
      const desc = profile.description || '';
      const cmd = (profile.positionals && profile.positionals[0]) || '?';
      const domains = (profile.options && profile.options.domains) || '';
      console.log(`  ${paint('cyan', name)}`);
      console.log(`    ${paint('dim', desc)}`);
      console.log(`    command: ${cmd}${domains ? ', domains: ' + domains : ''}`);
      console.log('');
    } catch (err) {
      console.log(`  ${paint('yellow', name)} — error: ${err.message}`);
    }
  }
  console.log(`  Usage: npm run crawl:remote -- --profile <name>`);
  console.log(`     or: node tools/crawl/crawl-remote.js --profile <name>\n`);
}

const COMMANDS = {
  status: cmdStatus,
  health: cmdHealth,
  start: cmdStart,
  launch: cmdLaunch,
  collect: cmdCollect,
  'graph-seeds': cmdGraphSeeds,
  bounded: cmdBounded,
  stop: cmdStop,
  run: cmdRun,
  seed: cmdSeed,
  add: cmdAddDomain,
  remove: cmdRemoveDomain,
  pull: cmdPull,
  sync: cmdSync,
  errors: cmdErrors,
  content: cmdContent,
  'queue-summary': cmdQueueSummary,
  'queue-checklist': cmdQueueSummary,
  'queue-maintenance-checklist': cmdQueueSummary,
  'readiness-report': cmdReadinessReport,
  'maintenance-decision': cmdMaintenanceDecision,
  'queue-maintenance-decision': cmdMaintenanceDecision,
  'maintenance-execution-plan': cmdMaintenanceExecutionPlan,
  'queue-maintenance-execution-plan': cmdMaintenanceExecutionPlan,
  'sync-proof-readiness': cmdSyncProofReadiness,
  'second-seed-readiness': cmdSecondSeedReadiness,
  'live-seed-readiness': cmdSecondSeedReadiness,
  watch: cmdWatch,
  profiles: cmdProfiles,
};

async function main() {
  const fn = COMMANDS[effectiveCommand];
  if (!fn) {
    console.error(`Unknown command: ${effectiveCommand}`);
    console.error(`Valid commands: ${Object.keys(COMMANDS).join(', ')}`);
    process.exit(1);
  }

  try {
    await fn();
  } catch (err) {
    console.error(`  Error: ${err.message}`);
    if (!JSON_OUTPUT) console.error(`  Stack: ${err.stack}`);
    process.exit(1);
  } finally {
    closeLocalDb();
  }
}

main();
