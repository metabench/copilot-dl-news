#!/usr/bin/env node
'use strict';

/**
 * tools/crawl/sample.js — ONE command: bounded, observable sample crawl + PASS/FAIL scorecard.
 *
 *   npm run crawl:sample -- https://www.bbc.com/news
 *   npm run crawl:sample -- bbc.com --rung small
 *   npm run crawl:sample -- theguardian.com --rung medium --json
 *
 * What it does, in order:
 *   1. Resolve the seed URL(s) and the isolated sample DB (data/samples/<rung>-sample.db).
 *   2. Start from a fresh sample DB (default) so the scorecard measures THIS run.
 *   3. Delegate the real crawl to tools/crawl/run.js (--local --crawl-db <db> --watch),
 *      which auto-starts the unified UI, obeys robots + Crawl-delay, and follows the
 *      job to a terminal state.
 *   4. Read the sample DB read-only and score it (success rate, politeness, host
 *      coverage, freshness, dedup) with tools/crawl/lib/quality-scorecard.js.
 *   5. Print a PASS/FAIL scorecard and exit 0 (PASS) / 2 (FAIL) / 3 (usage/preflight).
 *
 * Safety: local + isolated sample DB only. Never writes data/news.db, never
 * contacts the remote crawler, and honours the engine's robots/Crawl-delay floor.
 */

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RUN_SCRIPT = path.join(__dirname, 'run.js');
const SAMPLES_DIR = path.join(REPO_ROOT, 'data', 'samples');

const { uniqueHostnamesFromUrls, normalizeUrl } = require('./run');
const { readSampleDbSignals, waitForEvidenceSettle, NativeDbUnavailableError } = require('./lib/sample-db-signals');
const { sampleWriterDb } = require('./lib/crawl-progress-monitor');
const { buildQualityScorecard, renderScorecardText } = require('./lib/quality-scorecard');

// Per-rung crawl caps. Deliberately small + gentle: politeness is a hard floor.
const RUNGS = Object.freeze({
  small: { maxPages: 20, maxDepth: 1, concurrency: 1, watchTimeoutSec: 240 },
  medium: { maxPages: 120, maxDepth: 2, concurrency: 1, watchTimeoutSec: 900 },
});
const DEFAULT_RUNG = 'small';
const DEFAULT_PROFILE = 'gentle';

function parseSampleArgs(argv = []) {
  const args = {
    urls: [],
    rung: DEFAULT_RUNG,
    profile: DEFAULT_PROFILE,
    dbPath: undefined,
    maxPages: undefined,
    maxDepth: undefined,
    concurrency: undefined,
    perDomainIntervalMs: undefined,
    watchTimeoutSec: undefined,
    json: false,
    keepDb: false,
    overrides: [],
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    const next = () => argv[++i];
    switch (t) {
      case '-h': case '--help': args.help = true; break;
      case '--rung': args.rung = String(next() || DEFAULT_RUNG).toLowerCase(); break;
      case '--profile': args.profile = String(next() || DEFAULT_PROFILE).toLowerCase(); break;
      case '--crawl-db': case '--db': args.dbPath = String(next()); break;
      case '--max-pages': args.maxPages = Number(next()); break;
      case '--max-depth': args.maxDepth = Number(next()); break;
      case '--concurrency': args.concurrency = Number(next()); break;
      case '--per-domain-interval-ms': case '--domain-interval-ms': args.perDomainIntervalMs = Number(next()); break;
      case '--watch-timeout': args.watchTimeoutSec = Number(next()); break;
      case '--json': args.json = true; break;
      case '--keep-db': args.keepDb = true; break;
      case '--fresh': args.keepDb = false; break;
      case '--override': {
        const kv = String(next() || '');
        if (!kv.includes('=')) throw new Error(`--override requires key=value, got: ${kv}`);
        args.overrides.push(kv);
        break;
      }
      default:
        if (typeof t === 'string' && !t.startsWith('-')) {
          // URL / hostname / csv of targets
          for (const part of t.split(',').map((s) => s.trim()).filter(Boolean)) args.urls.push(part);
        } else {
          throw new Error(`Unknown option: ${t}`);
        }
    }
  }
  return args;
}

/** Resolve the effective plan (caps merged over rung defaults). PURE. */
function resolveSamplePlan(args) {
  const rung = RUNGS[args.rung] ? args.rung : DEFAULT_RUNG;
  const caps = RUNGS[rung];
  const normalized = args.urls.map((u) => normalizeUrl(u)).filter(Boolean);
  const dbPath = args.dbPath
    ? path.resolve(args.dbPath)
    : path.join(SAMPLES_DIR, `${rung}-sample.db`);
  return {
    rung,
    urls: Array.from(new Set(normalized)),
    requestedHosts: uniqueHostnamesFromUrls(normalized),
    dbPath,
    profile: args.profile || DEFAULT_PROFILE,
    maxPages: Number.isFinite(args.maxPages) ? args.maxPages : caps.maxPages,
    maxDepth: Number.isFinite(args.maxDepth) ? args.maxDepth : caps.maxDepth,
    concurrency: Number.isFinite(args.concurrency) ? args.concurrency : caps.concurrency,
    perDomainIntervalMs: Number.isFinite(args.perDomainIntervalMs) ? args.perDomainIntervalMs : undefined,
    watchTimeoutSec: Number.isFinite(args.watchTimeoutSec) ? args.watchTimeoutSec : caps.watchTimeoutSec,
    keepDb: args.keepDb === true,
    json: args.json === true,
    overrides: Array.isArray(args.overrides) ? args.overrides.slice() : [],
  };
}

/** Build the argv handed to tools/crawl/run.js. PURE. */
function buildRunArgs(plan) {
  const out = [];
  for (const u of plan.urls) out.push(u);
  out.push('--local');
  out.push('--crawl-db', plan.dbPath);
  out.push('--db', plan.dbPath);
  out.push('--profile', plan.profile);
  out.push('--max-pages', String(plan.maxPages));
  out.push('--max-depth', String(plan.maxDepth));
  out.push('--concurrency', String(plan.concurrency));
  if (Number.isFinite(plan.perDomainIntervalMs)) {
    out.push('--per-domain-interval-ms', String(plan.perDomainIntervalMs));
  }
  for (const kv of plan.overrides || []) {
    out.push('--override', kv);
  }
  // Follow the crawl to completion so the sample DB is complete before scoring:
  //  --watch-min-fetches 1               wait for real fetch evidence (avoids a
  //                                      "stable at zero" early stop before the
  //                                      first fetch lands under gentle pacing),
  //  --watch-wait-terminal-after-db-proof + --watch-terminal-timeout
  //                                      then follow the job to a terminal state
  //                                      rather than stopping at the first fetch,
  //  --auto-stop                         tear down the auto-spawned UI at the end.
  out.push('--watch');
  out.push('--watch-timeout', String(plan.watchTimeoutSec));
  out.push('--watch-min-fetches', '1');
  out.push('--watch-wait-terminal-after-db-proof');
  out.push('--watch-terminal-timeout', String(plan.watchTimeoutSec));
  out.push('--auto-stop');
  if (plan.json) out.push('--json');
  return out;
}

/**
 * PURE. Per-run signal window: accumulating (--keep-db) runs score only rows
 * fetched after launch; fresh-DB runs score the whole DB (it IS the run).
 */
function runWindowSinceIso(keepDb, startedAtMs) {
  if (!keepDb) return undefined;
  const t = Number(startedAtMs);
  if (!Number.isFinite(t) || t <= 0) return undefined;
  return new Date(t).toISOString();
}

function isInsideSamplesDir(p) {
  const rel = path.relative(SAMPLES_DIR, path.resolve(p));
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Delete a sample DB (+ -wal/-shm) for a clean measurement. Guarded to data/samples/. */
function freshenSampleDb(dbPath, out) {
  if (!isInsideSamplesDir(dbPath)) {
    out(`[sample] --keep-db implied: ${dbPath} is outside data/samples/, not resetting it`);
    return false;
  }
  let removed = false;
  for (const suffix of ['', '-wal', '-shm']) {
    const p = `${dbPath}${suffix}`;
    try { if (fs.existsSync(p)) { fs.rmSync(p); removed = true; } } catch (_e) { /* ignore */ }
  }
  return removed;
}

/**
 * Pre-create the sample DB with the full crawler schema in a short-lived child
 * process. Without this the file does not exist until the engine's first write,
 * and run.js's watcher aborts after 5 "db-missing" polls (~25s) before the first
 * gentle fetch lands. Doing it in a child avoids polluting this process with the
 * NewsDatabase getDb() singleton. Best-effort: the engine also creates the schema.
 */
function ensureSampleDbSchema(dbPath, out) {
  const dbModule = path.join(REPO_ROOT, 'src', 'data', 'db');
  const script = 'const Db=require(' + JSON.stringify(dbModule) + ');'
    + 'const i=new Db(process.argv[1]);'
    + 'try{if(i&&typeof i.close==="function")i.close();}catch(e){}'
    + 'process.exit(0);';
  const res = spawnSync(process.execPath, ['-e', script, dbPath], {
    cwd: REPO_ROOT,
    timeout: 30000,
    encoding: 'utf8',
  });
  if (res.status === 0 && fs.existsSync(dbPath)) {
    out(`[sample] initialized sample DB schema: ${dbPath}`);
    return true;
  }
  out(`[sample] warning: could not pre-seed sample DB schema (${(res.stderr || res.error || 'unknown').toString().split('\n')[0]}); engine will create it`);
  return false;
}

function spawnRun(runArgs, { json }) {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      CRAWL_RUN_SERVER_READY_TIMEOUT_MS: process.env.CRAWL_RUN_SERVER_READY_TIMEOUT_MS || '120000',
    });
    const child = spawn(process.execPath, [RUN_SCRIPT, ...runArgs], {
      cwd: REPO_ROOT,
      env,
      stdio: json ? ['ignore', 'ignore', 'inherit'] : 'inherit',
    });
    child.on('exit', (code, signal) => resolve(Number.isInteger(code) ? code : (signal ? 1 : 0)));
    child.on('error', () => resolve(1));
  });
}

function renderHelp() {
  return [
    'crawl:sample — one bounded, observable sample crawl with a PASS/FAIL quality scorecard',
    '',
    'Usage:',
    '  npm run crawl:sample -- <url|host>[,<url2>...] [--rung small|medium] [options]',
    '',
    'Examples:',
    '  npm run crawl:sample -- https://www.bbc.com/news',
    '  npm run crawl:sample -- bbc.com --rung small',
    '  npm run crawl:sample -- theguardian.com --rung medium --json',
    '',
    'Options:',
    '  --rung <small|medium>       crawl size (default small: 20 pages, depth 1)',
    '  --profile <name>            crawl profile (default gentle)',
    '  --crawl-db <path>           writer/sample DB (default data/samples/<rung>-sample.db)',
    '  --max-pages / --max-depth / --concurrency   override rung caps',
    '  --per-domain-interval-ms <n>  extra politeness spacing per host',
    '  --watch-timeout <sec>       give up following the crawl after N seconds',
    '  --keep-db                   accumulate into the existing sample DB (default: fresh)',
    '  --override <k=v>            repeatable; forwarded to run.js crawl overrides (e.g. preferCache=false)',
    '  --json                      machine-readable scorecard on stdout',
    '',
    'Exit codes: 0 PASS · 2 FAIL · 3 usage/preflight error',
    '',
    'Safety: local + isolated sample DB only. Never writes data/news.db; obeys robots + Crawl-delay.',
  ].join('\n');
}

async function runCli(argv = process.argv.slice(2)) {
  let args;
  try { args = parseSampleArgs(argv); }
  catch (err) { process.stderr.write(`Error: ${err.message}\n\n${renderHelp()}\n`); return 3; }

  if (args.help) { process.stdout.write(`${renderHelp()}\n`); return 0; }

  const plan = resolveSamplePlan(args);
  if (!plan.urls.length) {
    process.stderr.write(`Error: no crawlable URL given.\n\n${renderHelp()}\n`);
    return 3;
  }

  const log = (msg) => { if (!plan.json) process.stderr.write(`${msg}\n`); };

  fs.mkdirSync(path.dirname(plan.dbPath), { recursive: true });

  // Fresh DB by default so the scorecard reflects only this run.
  let baseline = null;
  if (!plan.keepDb) {
    const removed = freshenSampleDb(plan.dbPath, log);
    log(`[sample] fresh sample DB: ${plan.dbPath}${removed ? ' (reset)' : ''}`);
    // Pre-seed schema so the crawl watcher can open the DB immediately.
    ensureSampleDbSchema(plan.dbPath, log);
  } else {
    if (!fs.existsSync(plan.dbPath)) ensureSampleDbSchema(plan.dbPath, log);
    try {
      const b = sampleWriterDb(plan.dbPath);
      baseline = b && b.ok ? b.snapshot : null;
      log(`[sample] accumulating into existing DB; baseline responses=${baseline?.totals?.responses ?? 0}`);
    } catch (_e) { baseline = null; }
  }

  log(`[sample] rung=${plan.rung} targets=${plan.urls.join(', ')} profile=${plan.profile} caps: pages=${plan.maxPages} depth=${plan.maxDepth} conc=${plan.concurrency}`);
  log('[sample] launching bounded crawl (obeys robots + Crawl-delay)…\n');

  const runArgs = buildRunArgs(plan);
  const startedAt = Date.now();
  const launchExitCode = await spawnRun(runArgs, { json: plan.json });
  const elapsedSec = Math.round((Date.now() - startedAt) / 100) / 10;
  log(`\n[sample] crawl finished (run.js exit=${launchExitCode}, ${elapsedSec}s); scoring sample DB…`);

  // Late-writer guard: run.js may exit while the crawl child is still
  // committing; score only after evidence counts hold steady (c15 root cause).
  try {
    const settle = await waitForEvidenceSettle(plan.dbPath);
    log(`[sample] evidence ${settle.settled ? 'settled' : 'still moving'} after ${settle.polls} poll(s) (${settle.last})`);
  } catch (_e) { /* settling is best-effort; scoring proceeds regardless */ }

  let signals;
  try {
    signals = readSampleDbSignals(plan.dbPath, {
      baseline,
      // Accumulating runs must score only THIS run's rows; fresh DBs are the
      // run, so no window (also avoids clipping on any clock skew).
      sinceIso: runWindowSinceIso(plan.keepDb, startedAt),
      requestedHosts: plan.requestedHosts,
      requestedUrls: plan.urls,
      elapsedSec,
      launchExitCode,
      stalled: false,
    });
  } catch (err) {
    if (err instanceof NativeDbUnavailableError) {
      process.stderr.write(`\n✗ Cannot score the crawl: ${err.message}\n`);
      return 3;
    }
    process.stderr.write(`\n✗ Failed to read sample DB (${plan.dbPath}): ${err.message}\n`);
    return 3;
  }

  const scorecard = buildQualityScorecard({
    signals,
    context: {
      rung: plan.rung,
      url: plan.urls.join(', '),
      dbPath: path.relative(REPO_ROOT, plan.dbPath),
      profile: plan.profile,
    },
  });

  if (plan.json) {
    process.stdout.write(`${JSON.stringify(scorecard, null, 2)}\n`);
  } else {
    process.stdout.write(`\n${renderScorecardText(scorecard)}`);
  }
  return scorecard.exitCode;
}

if (require.main === module) {
  runCli()
    .then((code) => process.exit(typeof code === 'number' ? code : 0))
    .catch((err) => { process.stderr.write(`Fatal: ${err && err.stack || err}\n`); process.exit(1); });
}

module.exports = {
  RUNGS,
  DEFAULT_RUNG,
  DEFAULT_PROFILE,
  parseSampleArgs,
  resolveSamplePlan,
  buildRunArgs,
  runWindowSinceIso,
  isInsideSamplesDir,
  runCli,
};
