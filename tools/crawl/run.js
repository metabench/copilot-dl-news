#!/usr/bin/env node
/**
 * tools/crawl/run.js — Easy multi-site crawl dispatcher.
 *
 * One command, many shapes. Examples:
 *
 *   npm run crawl bbc.com                              # 1 site, safe defaults
 *   npm run crawl bbc.com,reuters.com,npr.org          # 3 sites in parallel
 *   npm run crawl https://example.com/news             # 1 site (full URL)
 *   npm run crawl @uk-papers                           # named list (crawl-lists/uk-papers.txt)
 *   npm run crawl @uk-papers --explain                 # show plan, do not run
 *   npm run crawl @uk-papers --max-pages 200           # bounded
 *   npm run crawl --profile fast bbc.com,reuters.com   # use fast defaults profile
 *   npm run crawl --preset news-10                     # legacy hardcoded preset
 *   npm run crawl news-10x1000                         # named profile (delegates)
 *   npm run crawl remote status                        # raw tool (delegates)
 *   npm run crawl list                                 # list tools/profiles/crawl-lists
 *   npm run crawl help                                 # full help
 *
 * Input shape detection (in order):
 *   1. No tokens, or "help"/"--help"/"-h"  → help
 *   2. "list"                              → list tools, profiles, AND user lists
 *   3. First token starts with "@"         → user list lookup
 *   4. First token is a URL/hostname/csv   → batch dispatch via crawl-batch.js
 *   5. Otherwise                            → delegate to existing tools/crawl/index.js
 *                                             (preserves backward compat for tools,
 *                                              named profiles, --preset, etc.)
 *
 * Default-source contract:
 *   All "sensible defaults" come from
 *   src/core/crawler/config/defaultCrawlProfiles.js so that engine, batch CLI,
 *   and this dispatcher never drift apart.
 *
 * Exit codes:
 *   0  ok (or --explain printed)
 *   1  internal error
 *   2  one or more jobs failed (delegated)
 *   3  preflight / arg-validation failure
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const {
  getDefaultCrawlProfile,
  listProfileNames,
  buildOverrides,
  DEFAULT_PROFILE_NAME
} = require('../../src/core/crawler/config/defaultCrawlProfiles');

const indexCli = require('./index');
const {
  startLocalMeter,
  startRemoteMeter
} = require('./lib/throughput-meter');
const { getBackend, CrawlBackend } = require('./lib/crawl-backend');
const {
  runRemoteDeployPreflight,
} = require('./lib/remote-deploy-preflight');
const {
  buildGraphFeedbackArtifactExplanationForHosts,
  renderGraphFeedbackSummary,
} = require('./lib/graph-feedback-artifact-explain');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_CRAWL_LISTS_DIR = path.join(REPO_ROOT, 'crawl-lists');
const BATCH_SCRIPT = path.join(__dirname, 'crawl-batch.js');
const REMOTE_SCRIPT = path.join(__dirname, 'crawl-remote.js');
const UNIFIED_APP_SCRIPT = path.join(REPO_ROOT, 'src', 'ui', 'server', 'unifiedApp', 'server.js');
const DEFAULT_LOCAL_DB = path.join(REPO_ROOT, 'data', 'news.db');
const DEFAULT_METER_INTERVAL_MS = 2000;
const DEFAULT_LAUNCH_TIMEOUT_SEC = 180;
const DEFAULT_NO_OUTPUT_TIMEOUT_SEC = 45;
const DEFAULT_UI_HOST = '127.0.0.1';
const DEFAULT_UI_PORT = 3000;
const SERVER_READY_POLL_MS = 500;
const MAX_CHILD_CAPTURE_CHARS = 256 * 1024;

function positiveIntFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const SERVER_READY_TIMEOUT_MS = positiveIntFromEnv('CRAWL_RUN_SERVER_READY_TIMEOUT_MS', 30000);

// ─────────────────────────────────────────────────────────────────
// Input-shape detection
// ─────────────────────────────────────────────────────────────────

const URL_LIKE_RE = /^(https?:)?\/\//i;
// Hostname-ish: at least one dot, no whitespace, no leading slash, no '=' (not a flag value)
const HOSTNAME_LIKE_RE = /^[a-z0-9][a-z0-9.\-]*\.[a-z]{2,}(\/.*)?$/i;

function isUrlLike(token) {
  if (!token || typeof token !== 'string') return false;
  return URL_LIKE_RE.test(token);
}

function isHostnameLike(token) {
  if (!token || typeof token !== 'string') return false;
  if (token.startsWith('-')) return false;
  if (token.includes(' ')) return false;
  return HOSTNAME_LIKE_RE.test(token);
}

function isCsvOfTargets(token) {
  if (!token || typeof token !== 'string' || !token.includes(',')) return false;
  const parts = token.split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return false;
  return parts.every(p => isUrlLike(p) || isHostnameLike(p) || isUserListRef(p));
}

function isUserListRef(token) {
  return typeof token === 'string' && token.startsWith('@') && token.length > 1;
}

function isBatchTarget(token) {
  return isUrlLike(token) || isHostnameLike(token) || isCsvOfTargets(token) || isUserListRef(token);
}

// ─────────────────────────────────────────────────────────────────
// Normalisation
// ─────────────────────────────────────────────────────────────────

function normalizeUrl(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (URL_LIKE_RE.test(trimmed)) {
    if (trimmed.startsWith('//')) return 'https:' + trimmed;
    return trimmed;
  }
  // Hostname-ish: prepend https://, ensure trailing slash if no path
  const withScheme = 'https://' + trimmed.replace(/^\/+/, '');
  try {
    const u = new URL(withScheme);
    if (!u.pathname || u.pathname === '') u.pathname = '/';
    return u.toString();
  } catch (_err) {
    return null;
  }
}

function loadUserList(listRef, listsDir = DEFAULT_CRAWL_LISTS_DIR) {
  // Strip leading '@'
  const name = listRef.replace(/^@/, '').trim();
  if (!name) throw new Error('Empty list name after "@"');
  // Allow .txt or .json suffix or none
  const candidates = [
    path.join(listsDir, name),
    path.join(listsDir, `${name}.txt`),
    path.join(listsDir, `${name}.json`)
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) {
    const tried = candidates.map(p => path.relative(REPO_ROOT, p)).join(', ');
    throw new Error(
      `User list "@${name}" not found. Looked in: ${tried}\n` +
      `Create one with: mkdir -p ${path.relative(REPO_ROOT, listsDir)} && ` +
      `echo "https://example.com/" > ${path.relative(REPO_ROOT, path.join(listsDir, name + '.txt'))}`
    );
  }
  const text = fs.readFileSync(found, 'utf8').trim();
  if (text.startsWith('[')) {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error(`List ${found} is JSON but not an array.`);
    return { sourcePath: found, urls: parsed.map(String) };
  }
  const lines = text.split(/\r?\n/)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('#'));
  return { sourcePath: found, urls: lines };
}

function listUserLists(listsDir = DEFAULT_CRAWL_LISTS_DIR) {
  if (!fs.existsSync(listsDir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(listsDir)) {
    const full = path.join(listsDir, entry);
    let stat;
    try { stat = fs.statSync(full); } catch (_e) { continue; }
    if (!stat.isFile()) continue;
    if (!/\.(txt|json)$/i.test(entry) && !/^[\w.\-]+$/.test(entry)) continue;
    let count = 0;
    try {
      const txt = fs.readFileSync(full, 'utf8').trim();
      if (txt.startsWith('[')) {
        const parsed = JSON.parse(txt);
        if (Array.isArray(parsed)) count = parsed.length;
      } else {
        count = txt.split(/\r?\n/).filter(s => s.trim() && !s.trim().startsWith('#')).length;
      }
    } catch (_e) { count = -1; }
    out.push({ name: entry.replace(/\.(txt|json)$/i, ''), file: entry, urlCount: count });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────────────────────────────
// Args parsing for the run.js layer
// ─────────────────────────────────────────────────────────────────

/**
 * Parse the dispatcher-level flags (those run.js itself understands)
 * out of argv, returning { runFlags, passthrough } so unknown flags
 * are forwarded verbatim to the underlying tool.
 *
 * Flags consumed here:
 *   --profile <name>          (default profile selector: safe|fast|gentle)
 *   --explain                 (print resolved plan, exit 0)
 *   --max-pages <n>
 *   --max-depth <n>
 *   --concurrency <n>           (per-job worker pool; engine `overrides.concurrency`)
 *   --batch-concurrency <n>     parallel local operation start requests
 *   --batch-retries <n>         retry count for local operation start requests
 *   --batch-retry-delay-ms <n>  delay between local operation start retries
 *   --batch-request-timeout-ms <n>
 *                              timeout for each local operation start request
 *   --per-domain-interval-ms <n> (engine `overrides.domainIntervalMs`; default 2000ms;
 *                                 lower = faster issuance per host, but more polite to drop)
 *   --json
 *   --ui-host <h>
 *   --ui-port <p>
 *   --operation <name>
 *   --override <k=v>          (repeatable; passed through to crawl-batch)
 *   --crawl-lists-dir <path>
 *   --local                   (force local mode — DEFAULT)
 *   --remote                  (dispatch via tools/crawl/crawl-remote.js)
 *   --remote-host <h>         (remote fleet host; default $FLEET_HOST or auto)
 *   --no-meter                (disable live throughput meter)
 *   --meter-interval <ms>     (sample interval, default 2000)
 *   --db <path>               (DB path for local meter; default data/news.db)
 *   --crawl-db <path>         (writer DB path for the crawl engine; default
 *                              <cwd>/data/news.db. Isolates sample crawls from
 *                              production by pointing the writer elsewhere.)
 *   --graph-feedback-artifact <path>
 *                              (with --explain only: attach read-only
 *                               graph-feedback seed consideration output)
 *   --watch                   (after launch, stay attached and poll status until
 *                              all targets reach a terminal state; default for
 *                              `--remote` is fire-and-forget so this is opt-in)
 *   --watch-interval <ms>     (status poll interval; default 5000)
 *   --watch-timeout <sec>     (give up after N seconds; default 1800 = 30 min)
 *   --launch-timeout <sec>    (kill delegated launch after N seconds; default 180)
 *   --no-output-timeout <sec> (kill delegated launch after no output; default 45)
 */
function parseArgs(argv) {
  const tokens = Array.isArray(argv) ? argv.slice() : [];
  const runFlags = {
    profile: DEFAULT_PROFILE_NAME,
    explain: false,
    json: false,
    crawlListsDir: DEFAULT_CRAWL_LISTS_DIR,
    overrides: {},
    rawOverrides: [], // pass-through --override <k=v> repeats
    maxPages: undefined,
    maxDepth: undefined,
    concurrency: undefined,
    batchConcurrency: undefined,
    batchRetries: undefined,
    batchRetryDelayMs: undefined,
    batchRequestTimeoutMs: undefined,
    perDomainIntervalMs: undefined,
    uiHost: undefined,
    uiPort: undefined,
    operation: undefined,
    target: 'local',                  // 'local' | 'remote'
    remoteHost: undefined,
    remoteDeploy: 'auto',
    remoteDeployForce: false,
    remoteDeploySshHost: undefined,
    remoteDeploySshUser: undefined,
    remoteDeploySshPort: undefined,
    remoteDeploySshKey: undefined,
    remoteDeployStatusUrl: undefined,
    remoteDeploySkipDbBuild: false,
    meter: true,
    meterIntervalMs: DEFAULT_METER_INTERVAL_MS,
    dbPath: DEFAULT_LOCAL_DB,
    watch: false,
    watchIntervalMs: 5000,
    watchTimeoutSec: 1800,
    watchMinFetches: 0,
    watchMinHosts: 0,
    watchWaitTerminalAfterDbProof: false,
    watchTerminalTimeoutSec: 30,
    watchTerminalJobPollTimeoutMs: 5000,
    launchTimeoutSec: DEFAULT_LAUNCH_TIMEOUT_SEC,
    noOutputTimeoutSec: DEFAULT_NO_OUTPUT_TIMEOUT_SEC,
    graphFeedbackArtifactPath: undefined,
    useGraphFeedbackSeeds: false,
    autoServer: true,
    keepServer: true,
    autoStop: false,
    concurrencyExplicit: false
  };
  const positional = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = () => tokens[++i];
    switch (t) {
      case '--profile': runFlags.profile = String(next() || DEFAULT_PROFILE_NAME).toLowerCase(); break;
      case '--explain': runFlags.explain = true; break;
      case '--json':    runFlags.json = true; break;
      case '--max-pages': runFlags.maxPages = Number(next()); break;
      case '--max-depth': runFlags.maxDepth = Number(next()); break;
      case '--concurrency': case '-c': runFlags.concurrency = Number(next()); runFlags.concurrencyExplicit = true; break;
      case '--batch-concurrency': runFlags.batchConcurrency = Number(next()); break;
      case '--batch-retries': runFlags.batchRetries = Number(next()); break;
      case '--batch-retry-delay-ms': runFlags.batchRetryDelayMs = Number(next()); break;
      case '--batch-request-timeout-ms': runFlags.batchRequestTimeoutMs = Number(next()); break;
      case '--per-domain-interval-ms': case '--domain-interval-ms': runFlags.perDomainIntervalMs = Number(next()); break;
      case '--ui-host': runFlags.uiHost = String(next()); break;
      case '--ui-port': runFlags.uiPort = Number(next()); break;
      case '--operation': case '-o': runFlags.operation = String(next()); break;
      case '--crawl-lists-dir': runFlags.crawlListsDir = path.resolve(String(next())); break;
      case '--local': runFlags.target = 'local'; break;
      case '--remote': runFlags.target = 'remote'; break;
      case '--remote-host': runFlags.remoteHost = String(next()); break;
      case '--remote-deploy': runFlags.remoteDeploy = String(next() || 'auto').toLowerCase(); break;
      case '--no-remote-deploy': runFlags.remoteDeploy = 'never'; break;
      case '--remote-deploy-force': runFlags.remoteDeployForce = true; break;
      case '--remote-deploy-ssh-host': runFlags.remoteDeploySshHost = String(next()); break;
      case '--remote-deploy-ssh-user': runFlags.remoteDeploySshUser = String(next()); break;
      case '--remote-deploy-ssh-port': runFlags.remoteDeploySshPort = Number(next()); break;
      case '--remote-deploy-ssh-key': runFlags.remoteDeploySshKey = String(next()); break;
      case '--remote-deploy-status-url': runFlags.remoteDeployStatusUrl = String(next()); break;
      case '--remote-deploy-skip-db-build': runFlags.remoteDeploySkipDbBuild = true; break;
      case '--no-meter': runFlags.meter = false; break;
      case '--meter': runFlags.meter = true; break;
      case '--meter-interval': runFlags.meterIntervalMs = Number(next()); break;
      case '--db': runFlags.dbPath = path.resolve(String(next())); break;
      case '--crawl-db': runFlags.crawlDbPath = path.resolve(String(next())); break;
      case '--watch': runFlags.watch = true; break;
      case '--no-watch': runFlags.watch = false; break;
      case '--watch-interval': runFlags.watchIntervalMs = Number(next()); break;
      case '--watch-timeout': runFlags.watchTimeoutSec = Number(next()); break;
      case '--watch-min-fetches': runFlags.watchMinFetches = Number(next()); break;
      case '--watch-min-hosts': runFlags.watchMinHosts = Number(next()); break;
      case '--watch-wait-terminal-after-db-proof': runFlags.watchWaitTerminalAfterDbProof = true; break;
      case '--watch-terminal-timeout': runFlags.watchTerminalTimeoutSec = Number(next()); break;
      case '--watch-terminal-job-poll-timeout': runFlags.watchTerminalJobPollTimeoutMs = Number(next()); break;
      case '--launch-timeout': runFlags.launchTimeoutSec = Number(next()); break;
      case '--no-output-timeout': runFlags.noOutputTimeoutSec = Number(next()); break;
      case '--graph-feedback-artifact': {
        const artifactPath = next();
        if (!artifactPath || String(artifactPath).startsWith('--')) {
          throw new Error('--graph-feedback-artifact requires a path');
        }
        runFlags.graphFeedbackArtifactPath = String(artifactPath);
        break;
      }
      case '--use-graph-feedback-seeds': runFlags.useGraphFeedbackSeeds = true; break;
      case '--auto-server': runFlags.autoServer = true; break;
      case '--no-auto-server': runFlags.autoServer = false; break;
      case '--keep-server': runFlags.keepServer = true; runFlags.autoStop = false; break;
      case '--auto-stop': runFlags.autoStop = true; runFlags.keepServer = false; break;
      case '--override': {
        const kv = next();
        if (!kv || !kv.includes('=')) throw new Error(`--override requires key=value, got: ${kv}`);
        runFlags.rawOverrides.push(kv);
        const [k, ...vparts] = kv.split('=');
        const raw = vparts.join('=');
        // Coerce JSON-shaped values (true/false/numbers/null) so overrides like
        // preferCache=false reach the crawler as real booleans, not truthy
        // strings. Non-JSON values (paths, profile names) stay raw strings.
        let value = raw;
        try { value = JSON.parse(raw); } catch (_) { /* keep raw string */ }
        runFlags.overrides[k] = value;
        break;
      }
      default:
        if (typeof t === 'string' && t.startsWith('--graph-feedback-artifact=')) {
          const artifactPath = t.slice('--graph-feedback-artifact='.length).trim();
          if (!artifactPath) throw new Error('--graph-feedback-artifact requires a path');
          runFlags.graphFeedbackArtifactPath = artifactPath;
          break;
        }
        positional.push(t);
    }
  }
  return { runFlags, positional };
}

// ─────────────────────────────────────────────────────────────────
// Plan building
// ─────────────────────────────────────────────────────────────────

/**
 * Build the resolved plan from positional arg(s) + run flags.
 * Pure: no I/O beyond reading user-list files.
 *
 * @returns {{
 *   mode: 'batch'|'delegate'|'help'|'list',
 *   urls?: string[],
 *   sourceList?: string,
 *   profile: object,
 *   overrides?: object,
 *   batchArgs?: string[],
 *   delegateArgv?: string[]
 * }}
 */
function buildPlan({ runFlags, positional }) {
  if (!positional.length) {
    return { mode: 'help', profile: getDefaultCrawlProfile(runFlags.profile) };
  }
  const head = positional[0];

  if (head === 'help' || head === '--help' || head === '-h') {
    return { mode: 'help', profile: getDefaultCrawlProfile(runFlags.profile) };
  }
  if (head === 'list') {
    return { mode: 'list', profile: getDefaultCrawlProfile(runFlags.profile) };
  }

  // Treat the head OR the merged first segment as a possible batch target.
  // Multiple positionals (e.g. "bbc.com reuters.com") also count as batch targets
  // when each looks like a URL/hostname.
  const allLookLikeTargets = positional.every(p => isBatchTarget(p));
  if (allLookLikeTargets) {
    return buildBatchPlan(positional, runFlags);
  }

  // Otherwise: delegate the whole positional list verbatim to tools/crawl/index.js
  // so existing profile names, raw tool names, --preset, etc. keep working.
  return {
    mode: 'delegate',
    profile: getDefaultCrawlProfile(runFlags.profile),
    delegateArgv: positional.concat(rebuildPassThroughFlags(runFlags))
  };
}

function buildBatchPlan(targets, runFlags) {
  const profile = getDefaultCrawlProfile(runFlags.profile);
  const urls = [];
  const sources = [];
  const expandToken = (t) => {
    if (isUserListRef(t)) {
      const loaded = loadUserList(t, runFlags.crawlListsDir);
      sources.push(loaded.sourcePath);
      for (const raw of loaded.urls) {
        const u = normalizeUrl(raw);
        if (u) urls.push(u);
      }
    } else {
      const u = normalizeUrl(t);
      if (u) urls.push(u);
    }
  };
  for (const t of targets) {
    if (typeof t === 'string' && t.includes(',')) {
      for (const part of t.split(',').map(s => s.trim()).filter(Boolean)) {
        expandToken(part);
      }
    } else {
      expandToken(t);
    }
  }
  const dedupedUrls = Array.from(new Set(urls));
  if (!dedupedUrls.length) {
    throw new Error('No usable URLs after normalisation. Check input.');
  }

  // Build user-effective overrides: profile baseline + user flags + --override repeats
  const userExplicit = {};
  if (runFlags.maxPages !== undefined) {
    userExplicit.maxPages = runFlags.maxPages;
    userExplicit.maxDownloads = runFlags.maxPages;
  }
  if (runFlags.maxDepth !== undefined) userExplicit.maxDepth = runFlags.maxDepth;
  if (runFlags.concurrency !== undefined) userExplicit.concurrency = runFlags.concurrency;
  if (runFlags.perDomainIntervalMs !== undefined) userExplicit.domainIntervalMs = runFlags.perDomainIntervalMs;
  // raw --override values: coerce scalars
  for (const [k, v] of Object.entries(runFlags.overrides)) {
    userExplicit[k] = coerceScalar(v);
  }
  const finalOverrides = buildOverrides(profile.name, userExplicit);
  // Writer DB isolation: when --crawl-db is given, forward it as overrides.dbPath
  // so the in-process crawl engine (NewsCrawler) writes to the requested DB instead
  // of the default <cwd>/data/news.db. Reaches the engine via the --override body.
  if (runFlags.crawlDbPath) {
    finalOverrides.dbPath = runFlags.crawlDbPath;
  }

  // Build args for crawl-batch.js
  const batchArgs = [];
  // Pass each URL positionally
  for (const u of dedupedUrls) batchArgs.push(u);
  // Operation
  batchArgs.push('--operation', runFlags.operation || profile.batch.operation);
  // Batch-level concurrency (job fan-out, not engine concurrency)
  batchArgs.push('--concurrency', String(Number.isFinite(runFlags.batchConcurrency) ? runFlags.batchConcurrency : profile.batch.concurrency));
  batchArgs.push('--retries', String(Number.isFinite(runFlags.batchRetries) ? runFlags.batchRetries : profile.batch.retries));
  batchArgs.push('--retry-delay-ms', String(Number.isFinite(runFlags.batchRetryDelayMs) ? runFlags.batchRetryDelayMs : profile.batch.retryDelayMs));
  if (Number.isFinite(runFlags.batchRequestTimeoutMs)) {
    batchArgs.push('--request-timeout-ms', String(runFlags.batchRequestTimeoutMs));
  }
  // Engine overrides exposed as first-class flags by crawl-batch
  if (finalOverrides.maxPages !== undefined) {
    batchArgs.push('--max-pages', String(finalOverrides.maxPages));
  }
  if (finalOverrides.maxDepth !== undefined) {
    batchArgs.push('--max-depth', String(finalOverrides.maxDepth));
  }
  // Everything else goes through --override k=v (these reach the engine via overrides body)
  const passedAsFlag = new Set(['maxPages', 'maxDownloads', 'maxDepth']);
  for (const [k, v] of Object.entries(finalOverrides)) {
    if (passedAsFlag.has(k)) continue;
    if (v === undefined || v === null) continue;
    batchArgs.push('--override', `${k}=${v}`);
  }
  // UI target
  if (runFlags.uiHost) batchArgs.push('--ui-host', runFlags.uiHost);
  if (runFlags.uiPort) batchArgs.push('--ui-port', String(runFlags.uiPort));
  if (runFlags.json)   batchArgs.push('--json');

  // Remote mode: build a separate args list for crawl-remote.js launch instead.
  if (runFlags.target === 'remote') {
    const remoteHosts = uniqueHostnamesFromUrls(dedupedUrls);
    if (!remoteHosts.length) {
      throw new Error('Remote mode requires resolvable hostnames; got no usable hosts.');
    }
    const remoteArgs = ['launch', '--domains', remoteHosts.join(',')];
    if (finalOverrides.maxPages !== undefined) {
      remoteArgs.push('--max-pages', String(finalOverrides.maxPages));
    }
    if (finalOverrides.maxDepth !== undefined) {
      remoteArgs.push('--max-depth', String(finalOverrides.maxDepth));
    }
    if (runFlags.remoteHost) remoteArgs.push('--host', runFlags.remoteHost);
    if (runFlags.json) remoteArgs.push('--json');
    return {
      mode: 'batch-remote',
      profile,
      urls: dedupedUrls,
      hosts: remoteHosts,
      sourceLists: sources,
      overrides: finalOverrides,
      remoteArgs
    };
  }

  return {
    mode: 'batch',
    profile,
    urls: dedupedUrls,
    sourceLists: sources,
    overrides: finalOverrides,
    batchArgs
  };
}

function uniqueHostnamesFromUrls(urls) {
  const out = [];
  const seen = new Set();
  for (const u of urls) {
    try {
      const h = new URL(u).hostname.toLowerCase();
      if (h && !seen.has(h)) { seen.add(h); out.push(h); }
    } catch (_e) { /* skip */ }
  }
  return out;
}

function coerceScalar(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (raw !== '' && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

function rebuildPassThroughFlags(runFlags) {
  // Forward only the flags that make sense to non-batch tools.
  const out = [];
  if (runFlags.json) out.push('--json');
  if (runFlags.maxPages !== undefined) out.push('--max-pages', String(runFlags.maxPages));
  if (runFlags.maxDepth !== undefined) out.push('--max-depth', String(runFlags.maxDepth));
  if (runFlags.concurrency !== undefined) out.push('--concurrency', String(runFlags.concurrency));
  if (runFlags.uiHost) out.push('--ui-host', runFlags.uiHost);
  if (runFlags.uiPort) out.push('--ui-port', String(runFlags.uiPort));
  if (runFlags.operation) out.push('--operation', runFlags.operation);
  if (runFlags.remoteDeploy && runFlags.remoteDeploy !== 'auto') out.push('--remote-deploy', runFlags.remoteDeploy);
  if (runFlags.remoteDeployForce) out.push('--remote-deploy-force');
  if (runFlags.remoteDeploySshHost) out.push('--remote-deploy-ssh-host', runFlags.remoteDeploySshHost);
  if (runFlags.remoteDeploySshUser) out.push('--remote-deploy-ssh-user', runFlags.remoteDeploySshUser);
  if (runFlags.remoteDeploySshPort) out.push('--remote-deploy-ssh-port', String(runFlags.remoteDeploySshPort));
  if (runFlags.remoteDeploySshKey) out.push('--remote-deploy-ssh-key', runFlags.remoteDeploySshKey);
  if (runFlags.remoteDeployStatusUrl) out.push('--remote-deploy-status-url', runFlags.remoteDeployStatusUrl);
  if (runFlags.remoteDeploySkipDbBuild) out.push('--remote-deploy-skip-db-build');
  for (const kv of runFlags.rawOverrides) out.push('--override', kv);
  return out;
}

// ─────────────────────────────────────────────────────────────────
// Renderers
// ─────────────────────────────────────────────────────────────────

function renderHelp() {
  const profileSummary = listProfileNames()
    .map(n => {
      const p = getDefaultCrawlProfile(n);
      return `  ${n.padEnd(8)} — ${p.description}`;
    })
    .join('\n');
  return [
    'crawl — Easy multi-site crawl dispatcher',
    '',
    'Quick start:',
    '  npm run crawl bbc.com',
    '  npm run crawl bbc.com,reuters.com,npr.org',
    '  npm run crawl @uk-papers',
    '  npm run crawl @uk-papers --explain',
    '  npm run crawl --profile fast bbc.com,reuters.com --max-pages 500',
    '',
    'Backward-compatible delegations:',
    '  npm run crawl --preset news-10                 (legacy hardcoded preset)',
    '  npm run crawl news-10x1000                     (named profile in tools/crawl/profiles)',
    '  npm run crawl remote status                    (raw tool dispatch)',
    '  npm run crawl list                             (full inventory)',
    '',
    'Default profiles (single source of truth):',
    profileSummary,
    '',
    'Top-level options:',
    '  --profile <name>        safe (default), fast, gentle',
    '  --max-pages <n>         per-job page cap (sets maxPages and maxDownloads)',
    '  --max-depth <n>         per-job link depth',
    '  --concurrency <n>       engine concurrency per job',
    '  --batch-concurrency <n> local operation start fan-out (default: profile)',
    '  --batch-retries <n>     local operation start retries (default: profile)',
    '  --batch-retry-delay-ms <n>  retry delay for local operation starts',
    '  --batch-request-timeout-ms <n>  timeout for each local operation start',
    '  --operation <name>      v1 operation (default: from profile)',
    '  --override k=v          extra override (repeatable)',
    '  --ui-host <h>           unified UI host (default: 127.0.0.1)',
    '  --ui-port <p>           unified UI port (default: 3000)',
    '  --crawl-lists-dir <p>   override crawl-lists/ directory',
    '  --local                 force local mode (default)',
    '  --remote                dispatch via tools/crawl/crawl-remote.js (fleet)',
    '  --remote-host <h>       remote fleet host (default $FLEET_HOST or .fleet-host)',
    '  --remote-deploy <mode>  auto (default), never, always; auto deploys stale remote server before remote crawl starts',
    '  --no-remote-deploy      disable automatic remote deploy freshness check',
    '  --remote-deploy-force   allow auto-deploy to interrupt a busy remote server when deployment is needed',
    '  --remote-deploy-ssh-host <host>  SSH target for auto-deploy (for example ubuntu@141.144.193.218)',
    '  --no-meter              disable live throughput meter (docs/s + bytes/s)',
    '  --meter-interval <ms>   meter sample interval (default 2000)',
    '  --db <path>             DB path for local meter (default data/news.db)',
    '  --crawl-db <path>       writer DB path for crawl engine (default data/news.db;',
    '                          isolates sample crawls from production)',
    '  --graph-feedback-artifact <path>  with --explain: validate saved graph-feedback JSON and show seed consideration',
    '  --use-graph-feedback-seeds  not supported by run.js; use tools/crawl/index.js remote ... with an artifact',
    '  --launch-timeout <sec>  fail delegated launch if it runs too long (default 180; 0 disables)',
    '  --no-output-timeout <s> fail delegated launch after silence (default 45; 0 disables)',
    '  --watch-min-fetches <n> require at least N local DB fetches before local watch can stop',
    '  --watch-min-hosts <n>  require local DB evidence for at least N requested hosts before local watch can stop',
    '  --watch-wait-terminal-after-db-proof wait briefly for accepted local jobs after DB proof',
    '  --watch-terminal-timeout <sec> terminal wait budget after DB proof, default 30',
    '  --watch-terminal-job-poll-timeout <ms> per-poll /jobs budget during terminal wait, default 5000 (1500-5000)',
    '  --no-auto-server        do not auto-start the unified UI when --local and it is not running',
    '  --auto-stop             stop the auto-spawned unified UI after dispatch (kills in-flight crawls)',
    '  --explain               print the resolved plan and exit (no crawl runs)',
    '  --json                  machine-readable output',
    '  help                    show this message',
    '',
    'User URL lists:',
    '  Drop one URL per line in crawl-lists/<name>.txt (or .json array).',
    '  Reference it as @<name> on the command line.',
    ''
  ].join('\n');
}

function renderPlan(plan, options = {}) {
  const out = {
    mode: plan.mode,
    profile: plan.profile && {
      name: plan.profile.name,
      description: plan.profile.description
    }
  };
  if (plan.urls) out.urls = plan.urls;
  if (plan.sourceLists && plan.sourceLists.length) {
    out.sourceLists = plan.sourceLists.map(p => path.relative(REPO_ROOT, p));
  }
  if (plan.overrides) out.effectiveOverrides = plan.overrides;
  if (plan.batchArgs) {
    out.delegated = {
      script: path.relative(REPO_ROOT, BATCH_SCRIPT),
      args: plan.batchArgs
    };
  }
  if (plan.remoteArgs) {
    out.delegated = {
      script: path.relative(REPO_ROOT, REMOTE_SCRIPT),
      args: plan.remoteArgs
    };
    out.hosts = plan.hosts;
  }
  if (plan.delegateArgv) {
    out.delegated = {
      script: path.relative(REPO_ROOT, path.join(__dirname, 'index.js')),
      args: plan.delegateArgv
    };
  }
  if (options.graphFeedbackArtifactPath) {
    out.graphFeedback = buildGraphFeedbackArtifactExplanation(plan, options.graphFeedbackArtifactPath, options);
  }
  return out;
}

function plannedHostsForGraphFeedback(plan) {
  if (!plan || typeof plan !== 'object') return [];
  if (Array.isArray(plan.hosts) && plan.hosts.length) {
    return plan.hosts.map(host => String(host || '').trim().toLowerCase()).filter(Boolean);
  }
  if (Array.isArray(plan.urls) && plan.urls.length) {
    return uniqueHostnamesFromUrls(plan.urls);
  }
  return [];
}

/**
 * Attach saved graph-feedback recommendations to an explain-only crawl plan.
 *
 * This is intentionally file-only. It validates the artifact against the hosts
 * that run.js already planned, and only reports how seed candidates would be
 * considered. It never enqueues URLs, seeds remote crawlers, or changes collect.
 *
 * @param {object} plan Resolved run.js plan.
 * @param {string} artifactPath Saved graph-feedback artifact path.
 * @param {object} [options] Test seams.
 * @returns {object} Graph-feedback explain block.
 */
function buildGraphFeedbackArtifactExplanation(plan, artifactPath, options = {}) {
  const plannedHosts = plannedHostsForGraphFeedback(plan);
  if (!plannedHosts.length) {
    throw new Error('--graph-feedback-artifact requires a batch or remote batch plan with resolvable hosts');
  }

  return buildGraphFeedbackArtifactExplanationForHosts(plannedHosts, artifactPath, options);
}

// ─────────────────────────────────────────────────────────────────
// Execution
// ─────────────────────────────────────────────────────────────────

function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0.0s';
  return `${(ms / 1000).toFixed(1)}s`;
}

function timeoutSecToMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1000, Math.round(n * 1000));
}

function appendBoundedCapture(state, chunk) {
  if (!state) return;
  if (state.truncated) return;
  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
  const remaining = MAX_CHILD_CAPTURE_CHARS - state.length;
  if (remaining <= 0) {
    state.truncated = true;
    return;
  }
  if (text.length > remaining) {
    state.parts.push(text.slice(0, remaining));
    state.length += remaining;
    state.truncated = true;
    return;
  }
  state.parts.push(text);
  state.length += text.length;
}

function capturedText(state) {
  if (!state) return '';
  const text = state.parts.join('');
  return state.truncated ? `${text}\n[output truncated after ${MAX_CHILD_CAPTURE_CHARS} chars]` : text;
}

function runChildProcess({ script, args, label, runFlags, captureOutput = false }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const launchTimeoutMs = timeoutSecToMs(runFlags.launchTimeoutSec);
    const noOutputTimeoutMs = timeoutSecToMs(runFlags.noOutputTimeoutSec);
    const stdoutCapture = captureOutput ? { parts: [], length: 0, truncated: false } : null;
    const stderrCapture = captureOutput ? { parts: [], length: 0, truncated: false } : null;
    let lastOutputAt = Date.now();
    let done = false;
    let launchTimer = null;
    let silenceTimer = null;
    let hardKillTimer = null;
    let forceFinishTimer = null;
    let forcedExitCode = null;
    let forcedReason = null;

    const child = spawn(process.execPath, [script, ...args], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const clearTimers = () => {
      if (launchTimer) clearTimeout(launchTimer);
      if (silenceTimer) clearInterval(silenceTimer);
      if (hardKillTimer) clearTimeout(hardKillTimer);
      if (forceFinishTimer) clearTimeout(forceFinishTimer);
    };

    const finish = (code, detail) => {
      if (done) return;
      done = true;
      clearTimers();
      const exitCode = Number.isInteger(code) ? code : 1;
      if (!runFlags.json) {
        const suffix = detail ? ` (${detail})` : '';
        process.stderr.write(`[run] ${label} exit=${exitCode} elapsed=${formatDurationMs(Date.now() - startedAt)}${suffix}\n`);
      }
      if (captureOutput) {
        resolve({
          exitCode,
          detail: detail || '',
          stdout: capturedText(stdoutCapture),
          stderr: capturedText(stderrCapture),
        });
        return;
      }
      resolve(exitCode);
    };

    const failAndKill = (exitCode, reason) => {
      if (done) return;
      forcedExitCode = exitCode;
      forcedReason = reason;
      process.stderr.write(`[run] ${label} failed early: ${reason}; killing child pid=${child.pid || 'unknown'}\n`);
      try { child.kill('SIGTERM'); } catch (_e) {}
      hardKillTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (_e) {}
      }, 2500);
      forceFinishTimer = setTimeout(() => finish(exitCode, `${reason}; child did not exit after SIGKILL`), 7500);
      if (typeof hardKillTimer.unref === 'function') hardKillTimer.unref();
      if (typeof forceFinishTimer.unref === 'function') forceFinishTimer.unref();
    };

    child.stdout.on('data', (chunk) => {
      lastOutputAt = Date.now();
      appendBoundedCapture(stdoutCapture, chunk);
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      lastOutputAt = Date.now();
      appendBoundedCapture(stderrCapture, chunk);
      process.stderr.write(chunk);
    });
    child.on('error', (err) => finish(1, err.message));
    child.on('exit', (code, signal) => {
      if (done) return;
      const exitCode = forcedExitCode != null ? forcedExitCode : (Number.isInteger(code) ? code : (signal ? 1 : 0));
      const detail = forcedReason || (signal ? `signal=${signal}` : '');
      finish(exitCode, detail);
    });

    if (launchTimeoutMs > 0) {
      launchTimer = setTimeout(() => failAndKill(124, `launch-timeout ${Math.round(launchTimeoutMs / 1000)}s`), launchTimeoutMs);
      if (typeof launchTimer.unref === 'function') launchTimer.unref();
    }
    if (noOutputTimeoutMs > 0) {
      silenceTimer = setInterval(() => {
        const silentForMs = Date.now() - lastOutputAt;
        if (silentForMs >= noOutputTimeoutMs) {
          failAndKill(125, `no-output-timeout ${Math.round(noOutputTimeoutMs / 1000)}s`);
        }
      }, Math.min(noOutputTimeoutMs, 5000));
      if (typeof silenceTimer.unref === 'function') silenceTimer.unref();
    }
  });
}

function parseLocalLaunchSummary(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  const tryParse = (candidate) => {
    try {
      const parsed = JSON.parse(candidate);
      return parsed && Array.isArray(parsed.results) ? parsed : null;
    } catch (_error) {
      return null;
    }
  };
  const direct = tryParse(text);
  if (direct) return direct;
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last <= first) return null;
  return tryParse(text.slice(first, last + 1));
}

function summarizeLocalLaunchSummary(summary) {
  const results = Array.isArray(summary?.results) ? summary.results : [];
  const accepted = [];
  const failed = [];
  for (const result of results) {
    const startUrl = result?.startUrl || result?.body?.job?.startUrl || result?.target || null;
    if (result && result.ok) {
      accepted.push({
        startUrl,
        jobId: result.jobId || result?.body?.jobId || result?.body?.job?.id || null,
        attempts: Number(result.attempts || 0) || 0,
      });
    } else {
      failed.push({
        startUrl,
        error: result?.error || null,
        attempts: Number(result?.attempts || 0) || 0,
        retryable: result?.retryable == null ? null : Boolean(result.retryable),
      });
    }
  }
  return {
    status: summary?.status || (failed.length ? 'partial' : 'ok'),
    counts: summary?.counts || { total: results.length, ok: accepted.length, failed: failed.length },
    accepted,
    failed,
  };
}

function summarizeLaunchJobEvidence(launchSummary) {
  const accepted = Array.isArray(launchSummary?.accepted) ? launchSummary.accepted : [];
  const failed = Array.isArray(launchSummary?.failed) ? launchSummary.failed : [];
  if (!accepted.length && !failed.length) return null;
  return {
    source: 'launch-report',
    available: true,
    counts: {
      total: accepted.length + failed.length,
      accepted: accepted.length,
      failed: failed.length,
    },
    items: accepted.slice(0, 5).map(item => ({
      id: item.jobId || null,
      status: 'accepted',
      startUrl: item.startUrl || null,
      attempts: Number(item.attempts || 0) || 0,
    })),
  };
}

function normalizeHostForMatch(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '');
}

function hostMatchesTarget(actualHost, requestedHost) {
  const actual = normalizeHostForMatch(actualHost);
  const requested = normalizeHostForMatch(requestedHost);
  if (!actual || !requested) return false;
  return actual === requested || actual.endsWith(`.${requested}`) || requested.endsWith(`.${actual}`);
}

function localStatusHostCoverage(status, targets) {
  const wanted = Array.from(new Set((targets || [])
    .map(host => normalizeHostForMatch(host))
    .filter(Boolean)));
  const domains = Array.isArray(status?.domains) ? status.domains : [];
  const covered = [];
  const missing = [];
  for (const target of wanted) {
    const row = domains.find(domain => {
      const fetched = Number(domain?.fetched || 0);
      return fetched > 0 && hostMatchesTarget(domain?.domain, target);
    });
    if (row) covered.push(target);
    else missing.push(target);
  }
  return {
    requested: wanted,
    covered,
    missing,
  };
}

function localLaunchWatchDecision({ plan, runFlags, launchExitCode, launchStdout }) {
  if (!runFlags?.watch) {
    return { shouldWatch: false, reason: 'watch-disabled', plan, launchSummary: null };
  }
  const minFetches = Math.max(0, Number(runFlags.watchMinFetches) || 0);
  const rawSummary = parseLocalLaunchSummary(launchStdout);
  const launchSummary = rawSummary ? summarizeLocalLaunchSummary(rawSummary) : null;
  if (launchExitCode === 0) {
    return { shouldWatch: true, reason: 'launch-ok', plan, launchSummary };
  }
  if (launchExitCode !== 2) {
    return { shouldWatch: false, reason: `launch-exit-${launchExitCode}`, plan, launchSummary: null };
  }
  if (minFetches <= 0) {
    return { shouldWatch: false, reason: 'partial-launch-needs-watch-min-fetches', plan, launchSummary: null };
  }
  if (!launchSummary) {
    return { shouldWatch: false, reason: 'partial-launch-summary-unparseable', plan, launchSummary: null };
  }
  const acceptedUrls = launchSummary.accepted
    .map(item => item.startUrl)
    .filter(Boolean);
  if (!acceptedUrls.length) {
    return { shouldWatch: false, reason: 'partial-launch-no-accepted-jobs', plan, launchSummary };
  }
  return {
    shouldWatch: true,
    reason: 'partial-launch-accepted-jobs',
    plan: { ...plan, urls: acceptedUrls },
    launchSummary,
  };
}

function localWatchRunFlagsForDecision(runFlags, watchDecision) {
  const acceptedCount = watchDecision?.launchSummary?.accepted?.length || 0;
  const requestedMinHosts = Math.max(0, Number(runFlags?.watchMinHosts) || 0);
  if (watchDecision?.reason !== 'partial-launch-accepted-jobs' || acceptedCount <= 0 || requestedMinHosts <= acceptedCount) {
    return runFlags;
  }
  return {
    ...runFlags,
    watchMinHosts: acceptedCount,
    watchMinHostsAdjustedFrom: requestedMinHosts,
  };
}

/**
 * Probe the unified UI availability endpoint; returns true if reachable.
 * No throw — quick connect-or-fail check.
 */
function probeAvailability(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.request({
      host, port, method: 'GET',
      path: '/api/v1/crawl/availability?operations=true&sequences=false'
    }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.setTimeout(timeoutMs, () => { try { req.destroy(); } catch (_e) {} resolve(false); });
    req.on('error', () => resolve(false));
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ensure a unified UI server is reachable for local crawl dispatch.
 *
 * Strategy:
 *   1. Probe the availability endpoint. If 200, return { owned: false }.
 *   2. Otherwise spawn `src/ui/server/unifiedApp/server.js` with
 *      UI_ALLOW_MULTI_JOBS=true (so concurrent batch jobs don't conflict),
 *      poll until ready, and return { owned: true, stop }.
 *
 * The owned server is killed in `stop()` and on process exit/SIGINT/SIGTERM,
 * unless the caller passes runFlags.keepServer = true.
 */
async function ensureLocalServer({ host, port, runFlags }) {
  const targetHost = host || DEFAULT_UI_HOST;
  const targetPort = port || DEFAULT_UI_PORT;
  const reachable = await probeAvailability(targetHost, targetPort);
  if (reachable) {
    if (!runFlags.json) {
      process.stderr.write(`[run] using existing unified UI at http://${targetHost}:${targetPort}\n`);
    }
    return { owned: false, host: targetHost, port: targetPort, stop: async () => {} };
  }
  if (runFlags.autoServer === false) {
    throw new Error(
      `unified UI not reachable at http://${targetHost}:${targetPort} ` +
      `and --no-auto-server set. Start it with: node src/ui/server/unifiedApp/server.js`
    );
  }
  if (!runFlags.json) {
    process.stderr.write(`[run] no unified UI at http://${targetHost}:${targetPort}; auto-starting (UI_ALLOW_MULTI_JOBS=true)\n`);
  }
  const env = Object.assign({}, process.env, {
    UI_ALLOW_MULTI_JOBS: 'true',
    PORT: String(targetPort),
    HOST: targetHost
  });
  // Pipe stdio to a log file so the child can survive parent exit cleanly
  // on Windows (where unref() is not sufficient if stdio is still wired to
  // the parent process). The log doubles as a debugging artifact.
  const logPath = path.join(REPO_ROOT, 'tmp', '_unified-ui.log');
  try { fs.mkdirSync(path.dirname(logPath), { recursive: true }); } catch (_e) {}
  const logHeader = `\n=== unified UI launch ${new Date().toISOString()} pid=parent:${process.pid} ===\n`;
  try { fs.appendFileSync(logPath, logHeader); } catch (_e) {}
  const outFd = fs.openSync(logPath, 'a');
  const errFd = fs.openSync(logPath, 'a');
  const child = spawn(process.execPath, [UNIFIED_APP_SCRIPT], {
    cwd: REPO_ROOT,
    env,
    detached: true,
    stdio: ['ignore', outFd, errFd],
    windowsHide: true
  });
  // Close our own copy of the file descriptors; the child has its own.
  try { fs.closeSync(outFd); } catch (_e) {}
  try { fs.closeSync(errFd); } catch (_e) {}
  let exitedEarly = null;
  child.on('exit', (code, signal) => { exitedEarly = { code, signal }; });

  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  let ready = false;
  while (Date.now() < deadline) {
    if (exitedEarly) {
      throw new Error(`auto-spawned unified UI exited before ready (code=${exitedEarly.code} signal=${exitedEarly.signal || 'none'})`);
    }
    if (await probeAvailability(targetHost, targetPort)) { ready = true; break; }
    await sleep(SERVER_READY_POLL_MS);
  }
  if (!ready) {
    try { child.kill('SIGTERM'); } catch (_e) {}
    throw new Error(`auto-spawned unified UI did not become ready within ${Math.round(SERVER_READY_TIMEOUT_MS/1000)}s`);
  }
  if (!runFlags.json) {
    process.stderr.write(`[run] unified UI ready at http://${targetHost}:${targetPort} (pid=${child.pid})\n`);
  }
  let stopped = false;
  // Default lifecycle: KEEP the spawned UI running after dispatch returns,
  // because the crawls are executing inside that server. Killing it here
  // would silently abort every in-flight crawl. The user opts out of this
  // safety with --auto-stop (fire-and-forget / scripted teardown).
  const shouldStopOnExit = runFlags.autoStop === true;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    if (!shouldStopOnExit) {
      if (!runFlags.json) {
        process.stderr.write(
          `[run] crawls running on auto-spawned UI http://${targetHost}:${targetPort} (pid=${child.pid})\n` +
          `[run] server kept alive so jobs can finish. Stop with: Stop-Process -Id ${child.pid}\n`
        );
      }
      try { child.unref(); } catch (_e) {}
      return;
    }
    try { child.kill('SIGTERM'); } catch (_e) {}
    // Give it a moment for graceful shutdown, then SIGKILL.
    const killDeadline = Date.now() + 3000;
    while (Date.now() < killDeadline && exitedEarly == null) {
      await sleep(100);
    }
    if (exitedEarly == null) {
      try { child.kill('SIGKILL'); } catch (_e) {}
    }
    if (!runFlags.json) {
      process.stderr.write(`[run] --auto-stop: auto-spawned unified UI stopped (in-flight crawls aborted)\n`);
    }
  };
  if (shouldStopOnExit) {
    // Best-effort cleanup if the user Ctrl+Cs us during dispatch.
    const onSignal = () => { stop().catch(() => {}); };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    process.once('exit', () => { try { if (!stopped) child.kill('SIGTERM'); } catch (_e) {} });
  } else {
    // Detach now: the child must outlive this process so the crawls keep
    // running after the dispatcher exits.
    try { child.unref(); } catch (_e) {}
  }
  return { owned: true, host: targetHost, port: targetPort, child, stop };
}

/**
 * Mutate plan.batchArgs to override `--concurrency` to a new value (or append
 * if not present). Used to force sequential behavior when sharing an
 * unowned UI server that may be in single-job mode.
 */
function setBatchArg(args, flag, value) {
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === flag) { args[i + 1] = String(value); return; }
  }
  args.push(flag, String(value));
}

function readBatchArg(args, flag) {
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === flag) return args[i + 1];
  }
  return undefined;
}

async function executeBatch(plan, runFlags) {
  // Make sure a unified UI is reachable. Auto-spawn one (with multi-jobs
  // enabled) if not, so the user never has to start the server by hand.
  let server;
  try {
    server = await ensureLocalServer({
      host: runFlags.uiHost,
      port: runFlags.uiPort,
      runFlags
    });
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    return 3;
  }
  // If we're sharing an existing UI server (we did not spawn it), we cannot
  // assume UI_ALLOW_MULTI_JOBS=true. Force sequential dispatch to avoid
  // JOB_CONFLICT failures, unless the user explicitly chose a concurrency.
  if (!server.owned && !runFlags.concurrencyExplicit) {
    const current = readBatchArg(plan.batchArgs, '--concurrency');
    if (current !== '1') {
      if (!runFlags.json) {
        process.stderr.write(`[run] existing UI may be single-job mode: forcing --concurrency 1 (override with --concurrency N)\n`);
      }
      setBatchArg(plan.batchArgs, '--concurrency', '1');
    }
  }
  // Make sure the spawned/probed host:port is what crawl-batch.js targets.
  setBatchArg(plan.batchArgs, '--ui-host', server.host);
  setBatchArg(plan.batchArgs, '--ui-port', server.port);

  // Watch mode supersedes the throughput meter as the live display so we don't
  // double-poll (meter @ 2s + watch @ 5s) and tangle stderr lines.
  const meter = runFlags.watch ? null : maybeStartMeter(plan, runFlags);
  const watchSinceIso = new Date().toISOString();
  let exitCode = 0;
  let launchStdout = '';
  try {
    const launchResult = await runChildProcess({
      script: BATCH_SCRIPT,
      args: plan.batchArgs,
      label: 'local-launch',
      runFlags,
      captureOutput: runFlags.watch,
    });
    if (typeof launchResult === 'number') {
      exitCode = launchResult;
    } else {
      exitCode = launchResult.exitCode;
      launchStdout = launchResult.stdout || '';
    }
  } finally {
    if (meter) {
      meter.stop();
      if (!runFlags.json) {
        process.stderr.write('\n' + meter.renderSummary());
      } else {
        process.stderr.write(JSON.stringify({ meterSummary: meter.summary() }) + '\n');
      }
    }
  }
  // Only watch when launch succeeded; on launch failure surface the error
  // immediately unless a local partial launch has accepted jobs and an
  // explicit min-fetch DB proof target to follow.
  let watchExit = exitCode;
  if (runFlags.watch) {
    const watchDecision = localLaunchWatchDecision({
      plan,
      runFlags,
      launchExitCode: exitCode,
      launchStdout,
    });
    if (watchDecision.shouldWatch) {
      const effectiveRunFlags = localWatchRunFlagsForDecision(runFlags, watchDecision);
      if (watchDecision.reason === 'partial-launch-accepted-jobs') {
        const acceptedCount = watchDecision.launchSummary?.accepted?.length || 0;
        const failedCount = watchDecision.launchSummary?.failed?.length || 0;
        if (runFlags.json) {
          process.stderr.write(JSON.stringify({
            watchPartialLaunch: {
              policy: 'watch-accepted-local-jobs-preserve-launch-failure',
              accepted: acceptedCount,
              failed: failedCount,
              minFetches: Math.max(0, Number(runFlags.watchMinFetches) || 0),
              minHostsAdjustedFrom: effectiveRunFlags.watchMinHostsAdjustedFrom || null,
              minHosts: effectiveRunFlags.watchMinHostsAdjustedFrom ? effectiveRunFlags.watchMinHosts : null,
            },
          }) + '\n');
        } else {
          const minHostText = effectiveRunFlags.watchMinHostsAdjustedFrom
            ? `; watch minHosts adjusted ${effectiveRunFlags.watchMinHostsAdjustedFrom}->${effectiveRunFlags.watchMinHosts}`
            : '';
          process.stderr.write(`(watch continuing after partial local launch: accepted=${acceptedCount} failed=${failedCount}${minHostText}; final exit preserves launch failure)\n`);
        }
      }
      watchExit = await runWatchLoop({
        kind: 'local',
        plan: watchDecision.plan,
        runFlags: effectiveRunFlags,
        launchExitCode: exitCode,
        sinceIso: watchSinceIso,
        launchSummary: watchDecision.launchSummary,
      });
    } else {
      process.stderr.write(`(watch skipped: ${watchDecision.reason})\n`);
    }
  }
  await server.stop();
  return watchExit;
}

async function executeBatchRemote(plan, runFlags) {
  const deployExit = runRemoteDeployPreflight({
    mode: runFlags.remoteDeploy,
    force: runFlags.remoteDeployForce,
    sshHost: runFlags.remoteDeploySshHost,
    sshUser: runFlags.remoteDeploySshUser,
    sshPort: runFlags.remoteDeploySshPort,
    sshKey: runFlags.remoteDeploySshKey,
    statusUrl: runFlags.remoteDeployStatusUrl || statusUrlFromRemoteHost(runFlags.remoteHost),
    skipDbBuild: runFlags.remoteDeploySkipDbBuild,
    json: runFlags.json,
    out: process.stderr,
    err: process.stderr,
  });
  if (deployExit.status !== 0) return deployExit.status || 1;

  // See note in executeBatch: do not double-poll when --watch is on.
  const meter = runFlags.watch ? null : maybeStartMeter(plan, runFlags);
  let exitCode = 0;
  try {
    exitCode = await runChildProcess({ script: REMOTE_SCRIPT, args: plan.remoteArgs, label: 'remote-launch', runFlags });
  } finally {
    if (meter) {
      meter.stop();
      if (!runFlags.json) {
        process.stderr.write('\n' + meter.renderSummary());
      } else {
        process.stderr.write(JSON.stringify({ meterSummary: meter.summary() }) + '\n');
      }
    }
  }
  if (runFlags.watch && exitCode === 0) {
    return runWatchLoop({ kind: 'remote', plan, runFlags, launchExitCode: exitCode });
  }
  if (runFlags.watch && exitCode !== 0) {
    process.stderr.write(`(watch skipped: launch exit ${exitCode})\n`);
  }
  return exitCode;
}

function statusUrlFromRemoteHost(remoteHost) {
  if (!remoteHost) return undefined;
  const text = String(remoteHost).trim();
  if (!text) return undefined;
  if (/^https?:\/\//i.test(text)) {
    return text.replace(/\/+$/, '') + '/api/status';
  }
  return `http://${text}/api/status`;
}

/**
 * After a launch returns, optionally stay attached and poll the appropriate
 * backend until all targets reach a terminal state (or watch-timeout fires).
 * Used by the `--watch` flag so the CLI can act as a "stay-open" follower
 * instead of fire-and-forget.
 *
 * Returns Promise<number> — propagates the launch exit code unless the watch
 * itself errors.
 */
async function runWatchLoop({ kind, plan, runFlags, launchExitCode, sinceIso = null, launchSummary = null }) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let backend;
  try {
    if (kind === 'local') {
      backend = getBackend('local', {
        host: runFlags.uiHost || DEFAULT_UI_HOST,
        port: runFlags.uiPort || DEFAULT_UI_PORT,
        dbPath: runFlags.dbPath,
      });
    } else {
      const host = runFlags.remoteHost || process.env.FLEET_HOST || resolveDefaultFleetHost();
      backend = getBackend('remote', { host });
    }
  } catch (err) {
    process.stderr.write(`(watch disabled: ${err.message})\n`);
    return launchExitCode;
  }

  const targets = (plan && plan.hosts && plan.hosts.length)
    ? plan.hosts
    : (plan && plan.urls ? require('./lib/crawl-backend').uniqueHostnamesFromUrls(plan.urls) : []);
  if (!targets.length) {
    process.stderr.write('(watch: no targets to follow)\n');
    return launchExitCode;
  }

  const watchSinceIso = sinceIso || new Date().toISOString();
  const intervalMs = Math.max(1000, Number(runFlags.watchIntervalMs) || 5000);
  const timeoutMs = Math.max(1000, (Number(runFlags.watchTimeoutSec) || 1800) * 1000);
  const minFetches = Math.max(0, Number(runFlags.watchMinFetches) || 0);
  const minHosts = Math.max(0, Number(runFlags.watchMinHosts) || 0);
  const waitTerminalAfterDbProof = kind === 'local' && Boolean(runFlags.watchWaitTerminalAfterDbProof);
  const terminalWaitTimeoutMs = Math.max(1000, (Number(runFlags.watchTerminalTimeoutSec) || 30) * 1000);
  // During the optional terminal wait the in-process crawl is usually still
  // CPU-bound, so the cheap /jobs/:jobId endpoint can be starved well past the
  // normal 1.5s job-poll budget. Give terminal-wait polls a longer, bounded
  // timeout so an event-loop-starved server still gets a chance to respond.
  const terminalWaitJobPollTimeoutMs = Math.max(1500, Math.min(5000,
    Number(runFlags.watchTerminalJobPollTimeoutMs) || 5000));
  const startTs = Date.now();

  process.stderr.write(`\n▶ Watching ${kind} backend (${backend.label}) — ${targets.length} target(s), poll ${intervalMs}ms, timeout ${Math.round(timeoutMs/1000)}s`);
  if (kind === 'local' && minHosts > 0) {
    process.stderr.write(`, minHosts=${minHosts}`);
  }
  process.stderr.write('\n');

  // Match crawl-remote.js cmdWatch: bail after a streak of poll failures
  // instead of silently looping for the entire watch-timeout window.
  const MAX_CONSECUTIVE_ERRORS = 5;
  const MAX_MISSING_POLLS = 3;
  let consecutiveErrors = 0;
  let consecutiveMissing = 0;
  let stableTicks = 0;
  let lastFetched = -1;
  let lastStatus = null;
  let lastJobEvidence = null;
  let jobPollErrors = 0;
  let stoppedReason = null;
  const terminalWait = waitTerminalAfterDbProof ? {
    enabled: true,
    timeoutSec: Math.round(terminalWaitTimeoutMs / 1000),
    jobPollTimeoutMs: terminalWaitJobPollTimeoutMs,
    startedAt: null,
    finishedAt: null,
    elapsedMs: 0,
    jobPolls: 0,
    jobPollErrors: 0,
    endpointResponded: false,
    outcome: null,
    reason: null,
  } : null;
  const launchJobEvidence = kind === 'local' ? summarizeLaunchJobEvidence(launchSummary) : null;
  const launchJobIds = Array.isArray(launchJobEvidence?.accepted)
    ? launchJobEvidence.accepted.map(job => job.jobId).filter(Boolean)
    : [];
  while (true) {
    const terminalWaitActive = Boolean(terminalWait?.startedAt && !terminalWait.outcome);
    if (Date.now() - startTs > timeoutMs && !terminalWaitActive) {
      stoppedReason = 'timeout';
      process.stderr.write('⏰ Watch timeout reached\n');
      break;
    }
    await sleep(intervalMs);
    let s;
    try {
      s = kind === 'local'
        ? await backend.status({ sinceIso: watchSinceIso, hosts: targets })
        : await backend.status({ hosts: targets });
    } catch (err) {
      consecutiveErrors++;
      process.stderr.write(`(watch poll error: ${err.message}; ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})\n`);
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        stoppedReason = 'poll-errors';
        process.stderr.write(`✗ Backend unreachable after ${MAX_CONSECUTIVE_ERRORS} consecutive poll errors — aborting watch\n`);
        break;
      }
      continue;
    }
    // Backends return ok:false on transport/db failures rather than throwing.
    if (s && s.ok === false) {
      consecutiveErrors++;
      const detail = s.error || (s.raw && s.raw.reason) || 'unknown';
      process.stderr.write(`(watch poll error: ${detail}; ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})\n`);
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        stoppedReason = 'poll-errors';
        process.stderr.write(`✗ Backend unhealthy after ${MAX_CONSECUTIVE_ERRORS} consecutive failures — aborting watch\n`);
        break;
      }
      continue;
    }
    consecutiveErrors = 0;
    lastStatus = s;
    let jobEvidence = null;
    const fetchedNow = Number(s.totals?.fetched || 0);
    const hostCoverage = kind === 'local'
      ? localStatusHostCoverage(s, targets)
      : { requested: [], covered: [], missing: [] };
    const minFetchesMetNow = minFetches <= 0 || fetchedNow >= minFetches;
    const minHostsMetNow = minHosts <= 0 || hostCoverage.covered.length >= minHosts;
    const localDbProofMet = minFetchesMetNow && minHostsMetNow;
    const needsLocalJobEvidence = kind === 'local'
      && backend
      && typeof backend.jobs === 'function'
      && (!localDbProofMet || waitTerminalAfterDbProof);
    const inTerminalWaitPhase = waitTerminalAfterDbProof && localDbProofMet;
    if (needsLocalJobEvidence) {
      // During terminal wait, cap the per-poll budget to the remaining
      // terminal-wait budget so the sum of starved 5s polls cannot overshoot
      // the terminal-wait window.
      const terminalWaitElapsedMs = terminalWait?.startedAt
        ? Date.now() - Date.parse(terminalWait.startedAt)
        : 0;
      const cappedTerminalPoll = inTerminalWaitPhase
        ? clampTerminalWaitJobPollTimeout({
          elapsedMs: terminalWaitElapsedMs,
          totalTimeoutMs: terminalWaitTimeoutMs,
          maxPollTimeoutMs: terminalWaitJobPollTimeoutMs,
        })
        : 0;
      const jobPollTimeoutMs = inTerminalWaitPhase
        ? cappedTerminalPoll
        : Math.max(500, Math.min(1500, Math.floor(intervalMs * 0.75)));
      // Budget exhausted: skip the poll so we do not block past the window.
      if (inTerminalWaitPhase && jobPollTimeoutMs <= 0) {
        jobEvidence = lastJobEvidence;
      } else {
        jobEvidence = await backend.jobs({
          sinceIso: watchSinceIso,
          urls: Array.isArray(plan?.urls) ? plan.urls : [],
          hosts: targets,
          jobIds: launchJobIds,
          timeoutMs: jobPollTimeoutMs,
        });
        if (inTerminalWaitPhase && terminalWait) {
          terminalWait.jobPolls += 1;
          if (jobEvidence && jobEvidence.ok) {
            terminalWait.endpointResponded = true;
          } else {
            terminalWait.jobPollErrors += 1;
          }
        }
      }
      if (jobEvidence && jobEvidence.ok) {
        lastJobEvidence = jobEvidence;
      } else if (jobEvidence) {
        jobPollErrors++;
        lastJobEvidence = jobEvidence;
      }
    }
    if (!runFlags.json) {
      const tp = (s.throughput && s.throughput.fetchesPerSec) ? ` ${s.throughput.fetchesPerSec.toFixed(2)}/s` : '';
      const hp = kind === 'local' && minHosts > 0 ? ` hosts=${hostCoverage.covered.length}/${minHosts}` : '';
      process.stderr.write(`  · fetched=${s.totals.fetched} errors=${s.totals.errors} pending=${s.totals.pending}${hp}${tp}\n`);
      if (jobEvidence && jobEvidence.ok && jobEvidence.counts.total > 0) {
        process.stderr.write(`    jobs: running=${jobEvidence.counts.running} completed=${jobEvidence.counts.completed} failed=${jobEvidence.counts.failed}\n`);
      } else if (jobEvidence && jobEvidence.ok === false && jobPollErrors === 1) {
        process.stderr.write(`    jobs: unavailable (${jobEvidence.error || 'unknown'})\n`);
      }
    } else {
      const tick = { ts: new Date().toISOString(), kind, totals: s.totals, throughput: s.throughput };
      if (kind === 'local' && minHosts > 0) {
        tick.hostCoverage = hostCoverage;
        tick.minHosts = minHosts;
        tick.minHostsMet = minHostsMetNow;
      }
      if (jobEvidence && jobEvidence.ok && jobEvidence.counts.total > 0) {
        tick.jobs = summarizeWatchJobEvidence(jobEvidence);
      } else if (jobEvidence && jobEvidence.ok === false) {
        tick.jobs = summarizeWatchJobEvidence(jobEvidence);
      }
      process.stderr.write(JSON.stringify({ watchTick: tick }) + '\n');
    }

    if (kind === 'remote') {
      const missingTargets = CrawlBackend.missingHosts(s, targets);
      if (missingTargets.length > 0) {
        consecutiveMissing++;
        process.stderr.write(`(watch missing targets: ${missingTargets.join(', ')}; ${consecutiveMissing}/${MAX_MISSING_POLLS})\n`);
        if (consecutiveMissing >= MAX_MISSING_POLLS) {
          stoppedReason = 'missing-targets';
          process.stderr.write(`✗ Requested targets never appeared in remote status: ${missingTargets.join(', ')}\n`);
          break;
        }
        continue;
      }
      consecutiveMissing = 0;
      if (CrawlBackend.allTerminal(s, targets)) {
        stoppedReason = 'terminal';
        process.stderr.write('✅ All targets reached terminal state\n');
        break;
      }
    } else {
      if (localDbProofMet && (minFetches > 0 || minHosts > 0)) {
        if (waitTerminalAfterDbProof) {
          if (!terminalWait.startedAt) {
            terminalWait.startedAt = new Date().toISOString();
          }
          const elapsed = Date.now() - Date.parse(terminalWait.startedAt);
          terminalWait.elapsedMs = Number.isFinite(elapsed) ? elapsed : 0;
          const hasJobs = jobEvidence && jobEvidence.ok && jobEvidence.counts.total > 0;
          if (hasJobs && jobEvidence.counts.terminal >= jobEvidence.counts.total) {
            terminalWait.finishedAt = new Date().toISOString();
            terminalWait.outcome = 'terminal';
            terminalWait.reason = 'accepted-local-jobs-terminal-after-db-proof';
            stoppedReason = minHosts > 0 ? 'min-fetches-and-hosts-and-terminal-met' : 'min-fetches-and-terminal-met';
            process.stderr.write('✅ Local DB proof reached and accepted jobs reached terminal state\n');
            break;
          }
          if (terminalWait.elapsedMs < terminalWaitTimeoutMs) {
            stableTicks = 0;
            lastFetched = s.totals.fetched;
            continue;
          }
          terminalWait.finishedAt = new Date().toISOString();
          const classification = classifyTerminalWaitOutcome({
            hasJobEvidence: Boolean(hasJobs),
            allJobsTerminal: false,
            endpointResponded: Boolean(terminalWait.endpointResponded),
          });
          terminalWait.outcome = classification.outcome;
          terminalWait.reason = classification.reason;
          stoppedReason = minHosts > 0 ? 'min-fetches-and-hosts-met-terminal-wait-timeout' : 'min-fetches-met-terminal-wait-timeout';
          process.stderr.write(`⚠ Local DB proof reached but accepted jobs did not reach terminal state within ${terminalWait.timeoutSec}s\n`);
          break;
        }
        stoppedReason = minHosts > 0 ? 'min-fetches-and-hosts-met' : 'min-fetches-met';
        const hostText = minHosts > 0 ? ` and minHosts=${minHosts}` : '';
        process.stderr.write(`✅ Local DB proof reached minFetches=${minFetches}${hostText}\n`);
        break;
      }
      // Local DB status has no per-domain state field, but the unified API has
      // an in-process job registry. Prefer job terminal proof when available
      // so an accepted local operation is not mistaken for completed work.
      if (jobEvidence && jobEvidence.ok && jobEvidence.counts.total > 0) {
        if (jobEvidence.counts.failed > 0) {
          stoppedReason = 'local-job-failed';
          process.stderr.write('✗ Local job failed before DB proof completed\n');
          break;
        }
        if (jobEvidence.counts.terminal >= jobEvidence.counts.total) {
          if (!minFetchesMetNow) {
            stoppedReason = 'local-job-terminal-without-min-fetches';
            process.stderr.write(`✗ Local job reached terminal state but fetched=${fetchedNow} < minFetches=${minFetches}\n`);
            break;
          }
          if (!minHostsMetNow) {
            stoppedReason = 'local-job-terminal-without-host-coverage';
            process.stderr.write(`✗ Local job reached terminal state but host coverage=${hostCoverage.covered.length} < minHosts=${minHosts}\n`);
            break;
          }
          stoppedReason = 'terminal';
          process.stderr.write('✅ Local job reached terminal state\n');
          break;
        }
        // If a matching local job is still running, keep waiting until either
        // it becomes terminal, DB proof appears, or the bounded watch times out.
        if (jobEvidence.counts.running > 0) {
          stableTicks = 0;
          lastFetched = s.totals.fetched;
          continue;
        }
      }
      // Local fallback when job registry evidence is unavailable: use a
      // "no-growth" heuristic.
      if (!minFetchesMetNow) {
        stableTicks = 0;
        lastFetched = s.totals.fetched;
        continue;
      }
      if (s.totals.fetched === lastFetched) {
        stableTicks++;
        if (stableTicks >= 3) {
          if (!minHostsMetNow) {
            stoppedReason = 'local-host-coverage-not-met';
            process.stderr.write(`✗ Local fetch count stable but host coverage=${hostCoverage.covered.length} < minHosts=${minHosts}\n`);
          } else {
            stoppedReason = 'stable';
            process.stderr.write('✅ Local fetch count stable for 3 polls — stopping watch\n');
          }
          break;
        }
      } else {
        stableTicks = 0;
        lastFetched = s.totals.fetched;
      }
    }
  }

  // Echo the last good observation so the operator always sees final counters.
  if (lastStatus && !runFlags.json) {
    const tp = (lastStatus.throughput && lastStatus.throughput.fetchesPerSec) ? ` ${lastStatus.throughput.fetchesPerSec.toFixed(2)}/s` : '';
    process.stderr.write(`  · final fetched=${lastStatus.totals.fetched} errors=${lastStatus.totals.errors} pending=${lastStatus.totals.pending}${tp} (reason=${stoppedReason||'unknown'})\n`);
    if (launchJobEvidence && (!lastJobEvidence || lastJobEvidence.ok === false)) {
      process.stderr.write(`    launch jobs: accepted=${launchJobEvidence.counts.accepted} failed=${launchJobEvidence.counts.failed} (job endpoint unavailable or empty)\n`);
    }
  } else if (lastStatus && runFlags.json) {
    const fetched = Number(lastStatus.totals?.fetched || 0);
    process.stderr.write(JSON.stringify({
      watchFinal: {
        stoppedReason,
        kind,
        totals: lastStatus.totals,
        throughput: lastStatus.throughput,
        missingTargets: kind === 'remote' ? CrawlBackend.missingHosts(lastStatus, targets) : [],
        minFetches,
        minFetchesMet: minFetches <= 0 || fetched >= minFetches,
        minHosts,
        minHostsMet: kind === 'local' ? (minHosts <= 0 || localStatusHostCoverage(lastStatus, targets).covered.length >= minHosts) : null,
        coveredHosts: kind === 'local' ? localStatusHostCoverage(lastStatus, targets).covered : [],
        missingLocalTargets: kind === 'local' ? localStatusHostCoverage(lastStatus, targets).missing : [],
        jobs: kind === 'local' && lastJobEvidence ? summarizeWatchJobEvidence(lastJobEvidence) : null,
        launchJobs: kind === 'local' ? launchJobEvidence : null,
        jobPollErrors: kind === 'local' ? jobPollErrors : 0,
        terminalWait,
      }
    }) + '\n');
  }

  if (backend && typeof backend.close === 'function') backend.close();
  // Surface poll-error exits even when launch succeeded so single-call
  // run+watch invocations don't pretend everything is fine.
  if (watchStoppedReasonExitCode(stoppedReason) !== 0) return launchExitCode || watchStoppedReasonExitCode(stoppedReason);
  return launchExitCode;
}

/**
 * Classify the outcome of the optional post-DB-proof terminal wait into one of
 * three precise states so operators and the packet scorecard can tell apart a
 * server that responded with non-terminal jobs from one whose job endpoint was
 * never observed responding during the wait.
 *
 * @param {object} input
 * @param {boolean} input.hasJobEvidence - Latest poll returned usable job counts.
 * @param {boolean} input.allJobsTerminal - All accepted jobs reached a terminal state.
 * @param {boolean} input.endpointResponded - The job endpoint responded ok at least once during the wait.
 * @returns {{ outcome: string, reason: string }}
 */
function classifyTerminalWaitOutcome({ hasJobEvidence, allJobsTerminal, endpointResponded } = {}) {
  if (hasJobEvidence && allJobsTerminal) {
    return { outcome: 'terminal', reason: 'accepted-local-jobs-terminal-after-db-proof' };
  }
  if (hasJobEvidence || endpointResponded) {
    return { outcome: 'timed-out', reason: 'accepted-local-jobs-still-non-terminal-after-db-proof' };
  }
  return { outcome: 'endpoint-unavailable', reason: 'job-endpoint-unavailable-after-db-proof' };
}

/**
 * Cap the per-poll `/jobs/:jobId` timeout during terminal wait so the sum of
 * job polls never overshoots the terminal-wait budget. When the in-process
 * server is starved each poll blocks for the full `maxPollTimeoutMs`; without a
 * cap, N polls of `maxPollTimeoutMs` can run well past `totalTimeoutMs`
 * (observed 4 x 5s = ~21s against a 15s window). The clamp shrinks the final
 * poll(s) to the remaining budget; once the budget is exhausted it returns 0,
 * signalling the caller to finalize the terminal wait instead of polling again.
 *
 * @param {{ elapsedMs?: number, totalTimeoutMs: number, maxPollTimeoutMs: number }} args
 * @returns {number} clamped per-poll timeout in ms (0 = budget exhausted)
 */
function clampTerminalWaitJobPollTimeout({ elapsedMs, totalTimeoutMs, maxPollTimeoutMs } = {}) {
  const total = Math.max(0, Number(totalTimeoutMs) || 0);
  const max = Math.max(0, Number(maxPollTimeoutMs) || 0);
  const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const remaining = total - elapsed;
  if (remaining <= 0) {
    return 0;
  }
  // Never exceed the remaining budget; use the full per-poll budget when it
  // fits, otherwise shrink to whatever budget is left (which may fall below the
  // usual floor on the final poll — that is intentional to honour the cap).
  return Math.min(max, remaining);
}

function watchStoppedReasonExitCode(stoppedReason) {
  if (
    stoppedReason === 'poll-errors'
    || stoppedReason === 'missing-targets'
    || stoppedReason === 'timeout'
    || stoppedReason === 'local-job-failed'
    || stoppedReason === 'local-job-terminal-without-min-fetches'
    || stoppedReason === 'local-job-terminal-without-host-coverage'
    || stoppedReason === 'local-host-coverage-not-met'
  ) {
    return 2;
  }
  return 0;
}

function summarizeWatchJobEvidence(jobEvidence) {
  const jobs = Array.isArray(jobEvidence?.jobs) ? jobEvidence.jobs : [];
  return {
    available: jobEvidence?.ok !== false,
    error: jobEvidence?.ok === false ? (jobEvidence.error || 'unknown') : null,
    counts: jobEvidence?.counts || { total: 0, running: 0, completed: 0, failed: 0, terminal: 0, statuses: {} },
    items: jobs.slice(0, 5).map(job => ({
      id: job.id || null,
      operationName: job.operationName || null,
      status: job.status || 'unknown',
      startedAt: job.startedAt || null,
      finishedAt: job.finishedAt || null,
      abortRequested: Boolean(job.abortRequested),
    })),
  };
}

function maybeStartMeter(plan, runFlags) {
  if (!runFlags.meter) return null;
  try {
    if (plan.mode === 'batch-remote') {
      const host = runFlags.remoteHost
        || process.env.FLEET_HOST
        || resolveDefaultFleetHost();
      if (!host) return null;
      const [h, pStr] = String(host).split(':');
      const port = pStr ? Number(pStr) : 3200;
      return startRemoteMeter({
        host: h,
        port,
        intervalMs: runFlags.meterIntervalMs,
        json: runFlags.json,
        out: process.stderr
      });
    }
    // local
    return startLocalMeter({
      dbPath: runFlags.dbPath,
      sinceIso: new Date().toISOString(),
      intervalMs: runFlags.meterIntervalMs,
      json: runFlags.json,
      out: process.stderr
    });
  } catch (err) {
    process.stderr.write(`(meter disabled: ${err.message})\n`);
    return null;
  }
}

function resolveDefaultFleetHost() {
  // Prefer the shared resolver (env -> .fleet-host -> documented default).
  try {
    const { getFleetHostSync } = require('./lib/fleet-host-resolver');
    const h = getFleetHostSync();
    if (h) return h;
  } catch (_e) { /* fall through */ }
  // Fallback: read .fleet-host directly.
  const candidate = path.join(REPO_ROOT, '.fleet-host');
  try {
    if (fs.existsSync(candidate)) {
      const txt = fs.readFileSync(candidate, 'utf8').trim();
      if (txt) return txt;
    }
  } catch (_e) { /* ignore */ }
  return null;
}

function executeDelegate(plan) {
  // Re-enter the existing index.js dispatcher in-process (avoids spawning a
  // second node) so behaviour is identical to `npm run crawl -- <args>` today.
  return indexCli.runCli(plan.delegateArgv);
}

function executeList(runFlags) {
  // Re-render the existing index.js list, then append user lists.
  const exitCode = indexCli.runCli(['list', ...(runFlags.json ? ['--json'] : [])]);
  if (runFlags.json) return exitCode;
  const lists = listUserLists(runFlags.crawlListsDir);
  console.log('');
  console.log('User crawl lists (@name):');
  if (!lists.length) {
    console.log(`  (none — drop a file in ${path.relative(process.cwd(), runFlags.crawlListsDir)}/)`);
  } else {
    for (const l of lists) {
      const cnt = l.urlCount < 0 ? 'invalid' : `${l.urlCount} URL${l.urlCount === 1 ? '' : 's'}`;
      console.log(`  @${l.name.padEnd(22)} ${cnt}`);
    }
  }
  console.log('');
  return exitCode;
}

// ─────────────────────────────────────────────────────────────────
// Entry
// ─────────────────────────────────────────────────────────────────

function runCli(argv) {
  let parsed;
  try { parsed = parseArgs(argv); }
  catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    return 3;
  }

  let plan;
  try { plan = buildPlan(parsed); }
  catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    return 3;
  }

  if (parsed.runFlags.useGraphFeedbackSeeds) {
    process.stderr.write('Error: --use-graph-feedback-seeds is only supported by tools/crawl/index.js remote start-like commands.\n');
    return 3;
  }
  if (parsed.runFlags.graphFeedbackArtifactPath && !parsed.runFlags.explain) {
    process.stderr.write('Error: --graph-feedback-artifact is explain-only; add --explain to inspect saved recommendations.\n');
    return 3;
  }

  if (parsed.runFlags.explain) {
    let rendered;
    try {
      rendered = renderPlan(plan, {
        graphFeedbackArtifactPath: parsed.runFlags.graphFeedbackArtifactPath,
      });
    } catch (err) {
      process.stderr.write(`Error: ${err.message}\n`);
      return 3;
    }
    if (parsed.runFlags.json) {
      process.stdout.write(JSON.stringify(rendered, null, 2) + '\n');
    } else {
      process.stdout.write('Resolved crawl plan (no jobs started):\n');
      process.stdout.write(JSON.stringify(rendered, null, 2) + '\n');
      if (rendered.graphFeedback) {
        process.stdout.write(renderGraphFeedbackSummary(rendered.graphFeedback));
      }
    }
    return 0;
  }

  switch (plan.mode) {
    case 'help':
      process.stdout.write(renderHelp());
      return 0;
    case 'list':
      return executeList(parsed.runFlags);
    case 'batch':
      return executeBatch(plan, parsed.runFlags);
    case 'batch-remote':
      return executeBatchRemote(plan, parsed.runFlags);
    case 'delegate':
      if (parsed.runFlags.watch) {
        process.stderr.write('(--watch ignored: delegate mode does not yet support follow-mode; use a batch/batch-remote target or `crawl-remote.js watch`)\n');
      }
      return executeDelegate(plan);
    default:
      process.stderr.write(`Internal error: unknown plan mode "${plan.mode}"\n`);
      return 1;
  }
}

if (require.main === module) {
  Promise.resolve()
    .then(() => runCli(process.argv.slice(2)))
    .then((c) => { process.exit(typeof c === 'number' ? c : 0); })
    .catch((err) => {
      process.stderr.write(`Fatal: ${err && err.stack || err}\n`);
      process.exit(1);
    });
}

module.exports = {
  // Public API for tests
  parseArgs,
  buildPlan,
  renderPlan,
  renderHelp,
  normalizeUrl,
  loadUserList,
  listUserLists,
  isUrlLike,
  isHostnameLike,
  isCsvOfTargets,
  isUserListRef,
  isBatchTarget,
  buildBatchPlan,
  uniqueHostnamesFromUrls,
  plannedHostsForGraphFeedback,
  buildGraphFeedbackArtifactExplanation,
  renderGraphFeedbackSummary,
  coerceScalar,
  runChildProcess,
  parseLocalLaunchSummary,
  summarizeLocalLaunchSummary,
  summarizeLaunchJobEvidence,
  localStatusHostCoverage,
  localLaunchWatchDecision,
  localWatchRunFlagsForDecision,
  watchStoppedReasonExitCode,
  classifyTerminalWaitOutcome,
  clampTerminalWaitJobPollTimeout,
  summarizeWatchJobEvidence,
  runCli,
  ensureLocalServer,
  probeAvailability,
  statusUrlFromRemoteHost,
  positiveIntFromEnv,
  // Constants
  DEFAULT_CRAWL_LISTS_DIR,
  BATCH_SCRIPT,
  REMOTE_SCRIPT,
  UNIFIED_APP_SCRIPT,
  DEFAULT_LOCAL_DB,
  DEFAULT_METER_INTERVAL_MS,
  DEFAULT_LAUNCH_TIMEOUT_SEC,
  DEFAULT_NO_OUTPUT_TIMEOUT_SEC
};
