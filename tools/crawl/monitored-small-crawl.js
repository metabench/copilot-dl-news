#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  buildMonitoredSmallCrawlCadence,
  buildMonitoredSmallCrawlComparison,
  buildLocalSmokePlan,
  buildLocalSmokeRunReport,
  collectBaseline,
  collectRecentCrawlOverview,
  collectVerification,
  renderMonitoredSmallCrawlCadenceText,
  renderMonitoredSmallCrawlComparisonText,
  renderMonitoredSmallCrawlText,
} = require('./lib/monitored-small-crawl');

function assignArg(args, rawKey, value) {
  const key = rawKey === 'command' ? 'crawlCommand' : rawKey;
  if (key === 'report' || key === 'reports') {
    const nextValues = Array.isArray(value) ? value : [value];
    args[key] = [...(Array.isArray(args[key]) ? args[key] : []), ...nextValues];
    return;
  }
  args[key] = value;
}

function parseArgs(argv = process.argv.slice(2)) {
  const mode = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'recent';
  const start = mode === argv[0] ? 1 : 0;
  const args = {
    mode,
    json: false,
    pretty: false,
  };

  for (let index = start; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') {
      args.json = true;
      continue;
    }
    if (token === '--pretty') {
      args.pretty = true;
      args.json = true;
      continue;
    }
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (!token.startsWith('--')) {
      throw new Error(`unexpected positional argument: ${token}`);
    }
    const eqIndex = token.indexOf('=');
    if (eqIndex !== -1) {
      const key = token.slice(2, eqIndex);
      assignArg(args, key, token.slice(eqIndex + 1));
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      assignArg(args, key, true);
      continue;
    }
    assignArg(args, key, next);
    index += 1;
  }

  return args;
}

function showHelp() {
  console.log(`monitored-small-crawl - bounded small-crawl DB evidence

Usage:
  node tools/crawl/monitored-small-crawl.js policy
  node tools/crawl/monitored-small-crawl.js baseline --hosts bbc.com --out tmp/baseline.json --json
  node tools/crawl/monitored-small-crawl.js recent --hosts bbc.com --window-min 60 --json
  node tools/crawl/monitored-small-crawl.js verify --baseline tmp/baseline.json --since <iso> --until <iso> --expected-min-downloads 3 --hosts bbc.com --json
  node tools/crawl/monitored-small-crawl.js compare --report tmp/local-smoke-report-1.json --report tmp/local-smoke-report-2.json --json
  node tools/crawl/monitored-small-crawl.js cadence --report tmp/local-smoke-report-1.json --report tmp/local-smoke-report-2.json --json
  node tools/crawl/monitored-small-crawl.js local-smoke --json
  node tools/crawl/monitored-small-crawl.js local-smoke --execute --json --out tmp/local-smoke-report.json

Options:
  --db <path>                  DB path, default data/news.db
  --hosts <a,b>                Exact host/domain list for evidence filters
  --since <iso>                Window start, default now - --window-min
  --until <iso>                Window end, default now
  --window-min <n>             Recent window in minutes, default 60, max 1440
  --limit <n>                  Bounded download sample limit, default 10, max 50
  --expected-min-downloads <n> Verification threshold for successful downloads
  --expected-min-hosts <n>     Local-smoke watch threshold for distinct requested hosts
  --command <text>             Operator command that produced the crawl
  --profile <name>             Crawl profile name for evidence labels
  --baseline <path>            Baseline artifact for verify
  --report <path>              Monitored report for compare; repeatable
  --reports <a,b>              Comma-separated monitored reports for compare
  --execute                    For local-smoke only: run the bounded local crawl
  --url <url>                  For local-smoke only: one http(s) URL
  --max-pages <n>              For local-smoke only: 1-3 pages, default 1
  --max-depth <n>              For local-smoke only: 0-1, default 0
  --ui-host <host>             For local-smoke only, default 127.0.0.1
  --ui-port <port>             For local-smoke only, default 3171
  --watch-timeout <sec>        For local-smoke only, default 180
  --out <path>                 Write compact JSON report
  --json / --pretty            Machine-readable output

Recent/verify reports include bounded DB evidence timings so slow proof queries
are visible without changing crawl behavior. compare reads saved reports only and
summarizes DB deltas, command identity, timing regressions, no-new-data evidence,
and stable pass/fail evidence for local-smoke cadence tracking. cadence/trend
adds compact aggregate pass/fail counts, DB deltas, job caveats, and a bounded
timeline for repeated local-smoke development loops.

No-action policy:
  policy/baseline/recent/verify and local-smoke without --execute do not start
  crawlers, contact remote hosts, write DB rows, prune queues, force deploy, or
  change collect behavior. local-smoke --execute starts one bounded local crawl
  and expects DB writes as the thing being verified.`);
}

function buildPolicy() {
  return {
    schemaVersion: 1,
    mode: 'monitored-small-crawl-policy',
    generatedAt: new Date().toISOString(),
    policy: {
      hostCap: 'tiny exact host list, preferably 1-2 hosts',
      pageCap: 'small profile/page limit before any broader crawl',
      runtimeCap: 'bounded timeout/guard required',
      preflight: 'capture baseline and inspect queue/deploy readiness before remote work',
      persistenceProof: 'verify new DB rows after crawl using monitored-small-crawl verify',
      dashboard: 'Cloud Crawl panel and /api/cloud-crawl/status surface recent DB evidence',
      destructiveActions: 'prune/drain/clear/force-deploy require separate approvals',
    },
    sequence: [
      'node tools/crawl/monitored-small-crawl.js baseline --hosts bbc.com --out tmp/small-crawl-baseline.json --json',
      'node tools/crawl/monitored-small-crawl.js local-smoke --json',
      'node tools/crawl/monitored-small-crawl.js local-smoke --execute --json --out tmp/local-smoke-report.json',
      'node tools/crawl/monitored-small-crawl.js compare --report tmp/local-smoke-report.json --json',
      'node tools/crawl/monitored-small-crawl.js cadence --report tmp/local-smoke-report.json --json',
      'node tools/crawl/index.js simple-distributed-smoke --dry-run',
      'run a bounded crawl only when queue/deploy readiness is clean',
      'node tools/crawl/monitored-small-crawl.js verify --baseline tmp/small-crawl-baseline.json --since <crawl-start> --until <crawl-end> --hosts bbc.com --expected-min-downloads 1 --json',
      'open the Cloud Crawl dashboard or query /api/cloud-crawl/status for recent download overview',
    ],
  };
}

function normalizeReportPaths(args) {
  const paths = [];
  for (const key of ['report', 'reports']) {
    const values = Array.isArray(args[key]) ? args[key] : (args[key] ? [args[key]] : []);
    for (const value of values) {
      if (value === true) throw new Error(`--${key} requires a path`);
      for (const item of String(value).split(',')) {
        const trimmed = item.trim();
        if (trimmed) paths.push(trimmed);
      }
    }
  }
  return paths;
}

function normalizeCollectorOptions(args) {
  return {
    dbPath: args.db,
    hosts: args.hosts || args.domains || args.domain,
    since: args.since,
    until: args.until,
    windowMinutes: args['window-min'] || args.windowMin,
    sampleLimit: args.limit || args['sample-limit'] || args.sampleLimit,
    expectedMinDownloads: args['expected-min-downloads'] || args.expectedMinDownloads,
    command: args.crawlCommand,
    profile: args.profile,
    baseline: args.baseline,
    baselinePath: args.baseline,
  };
}

function normalizeLocalSmokeCollectorOptions(args) {
  return {
    dbPath: args.db,
    hosts: args.hosts || args.domains || args.domain || args.host,
    host: args.host,
    url: args.url,
    generatedAt: args.generatedAt || args['generated-at'],
    maxPages: args.maxPages || args['max-pages'],
    maxDepth: args.maxDepth || args['max-depth'],
    uiHost: args.uiHost || args['ui-host'],
    uiPort: args.uiPort || args['ui-port'],
    watchTimeoutSec: args.watchTimeoutSec || args['watch-timeout'],
    launchTimeoutSec: args.launchTimeoutSec || args['launch-timeout'],
    noOutputTimeoutSec: args.noOutputTimeoutSec || args['no-output-timeout'],
    sampleLimit: args.limit || args['sample-limit'] || args.sampleLimit,
    expectedMinDownloads: args['expected-min-downloads'] || args.expectedMinDownloads,
  };
}

function writeOutIfRequested(outPath, payload, pretty = false) {
  if (!outPath) return;
  const resolved = path.resolve(outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(payload, null, pretty ? 2 : 0)}\n`);
}

function printPayload(payload, args) {
  writeOutIfRequested(args.out, payload, args.pretty);
  if (args.json) {
    console.log(JSON.stringify(payload, null, args.pretty ? 2 : 0));
    return;
  }
  if (payload.mode === 'monitored-small-crawl-policy') {
    console.log('Monitored Small Crawl Policy');
    for (const item of payload.sequence) console.log(`- ${item}`);
    console.log('No-action policy: this command does not run crawls or mutate remote/local state.');
    return;
  }
  if (payload.mode === 'monitored-small-crawl-local-smoke-plan') {
    console.log('Monitored Local Smoke Plan');
    console.log(`Target: ${payload.target.host} ${payload.target.url}`);
    console.log(`Command: ${payload.command.display}`);
    console.log('No-action policy: this plan does not run the crawl unless --execute is supplied.');
    return;
  }
  if (payload.mode === 'monitored-small-crawl-local-smoke-result') {
    console.log('Monitored Local Smoke Result');
    console.log(`Readiness: ${payload.readinessLabel}`);
    console.log(`Target: ${payload.target.host} ${payload.target.url}`);
    console.log(`Crawl exit: ${payload.crawl.exitCode}${payload.crawl.timedOut ? ' timed-out' : ''}`);
    if (payload.verification) {
      console.log(renderMonitoredSmallCrawlText(payload.verification).trimEnd());
    }
    return;
  }
  if (payload.mode === 'monitored-small-crawl-comparison') {
    console.log(renderMonitoredSmallCrawlComparisonText(payload).trimEnd());
    return;
  }
  if (payload.mode === 'monitored-small-crawl-cadence') {
    console.log(renderMonitoredSmallCrawlCadenceText(payload).trimEnd());
    return;
  }
  console.log(renderMonitoredSmallCrawlText(payload));
}

function getPayloadExitCode(payload) {
  if (
    payload
    && payload.mode === 'monitored-small-crawl-local-smoke-result'
    && Array.isArray(payload.blockers)
    && payload.blockers.length
  ) {
    return 2;
  }
  return 0;
}

function runBoundedLocalSmoke(plan) {
  const startedAt = new Date().toISOString();
  const child = spawnSync(process.execPath, plan.command.args, {
    cwd: path.resolve(__dirname, '..', '..'),
    env: {
      ...process.env,
      CRAWL_RUN_SERVER_READY_TIMEOUT_MS: String(Math.max(90000, (plan.caps.watchTimeoutSec || 180) * 1000)),
    },
    encoding: 'utf8',
    timeout: Math.max(120000, (plan.caps.watchTimeoutSec + plan.caps.launchTimeoutSec + 60) * 1000),
    maxBuffer: 128 * 1024,
  });
  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: child.status,
    signal: child.signal,
    timedOut: Boolean(child.error && child.error.code === 'ETIMEDOUT'),
    error: child.error ? child.error.message : null,
    stdout: child.stdout || '',
    stderr: child.stderr || '',
  };
}

function runLocalSmoke(args, deps = {}) {
  const collectBaselineFn = deps.collectBaseline || collectBaseline;
  const runBoundedLocalSmokeFn = deps.runBoundedLocalSmoke || runBoundedLocalSmoke;
  const collectVerificationFn = deps.collectVerification || collectVerification;
  const options = normalizeLocalSmokeCollectorOptions(args);
  const plan = buildLocalSmokePlan(options);
  if (!args.execute) {
    return plan;
  }

  const baseline = collectBaselineFn({
    dbPath: options.dbPath,
    hosts: plan.target.host,
    generatedAt: plan.generatedAt,
  });
  const crawlResult = runBoundedLocalSmokeFn(plan);
  const verification = collectVerificationFn({
    dbPath: options.dbPath,
    hosts: plan.target.host,
    since: crawlResult.startedAt,
    until: crawlResult.finishedAt,
    expectedMinDownloads: plan.command.expectedMinDownloads,
    sampleLimit: options.sampleLimit,
    command: plan.command.display,
    profile: 'local-tiny-monitored-smoke',
    baselineArtifact: baseline,
  });

  return buildLocalSmokeRunReport({
    plan,
    baseline,
    crawlResult,
    verification,
  });
}

function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args.mode === 'help') {
    showHelp();
    return 0;
  }

  let payload;
  const options = normalizeCollectorOptions(args);
  if (args.mode === 'policy' || args.mode === 'plan') {
    payload = buildPolicy();
  } else if (args.mode === 'baseline') {
    payload = collectBaseline(options);
  } else if (args.mode === 'recent' || args.mode === 'overview') {
    payload = collectRecentCrawlOverview(options);
  } else if (args.mode === 'verify') {
    if (!args.since && !args.baseline) {
      throw new Error('verify requires --since <iso> or --baseline <path>');
    }
    payload = collectVerification(options);
  } else if (args.mode === 'compare' || args.mode === 'compare-reports') {
    const reportPaths = normalizeReportPaths(args);
    payload = buildMonitoredSmallCrawlComparison({ reportPaths });
  } else if (args.mode === 'cadence' || args.mode === 'trend') {
    const reportPaths = normalizeReportPaths(args);
    payload = buildMonitoredSmallCrawlCadence({ reportPaths });
  } else if (args.mode === 'local-smoke' || args.mode === 'tiny-local') {
    payload = runLocalSmoke(args);
  } else {
    throw new Error(`unknown command: ${args.mode}`);
  }

  printPayload(payload, args);
  return getPayloadExitCode(payload);
}

if (require.main === module) {
  try {
    const status = runCli(process.argv.slice(2));
    if (status) process.exit(status);
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

module.exports = {
  buildPolicy,
  getPayloadExitCode,
  parseArgs,
  runBoundedLocalSmoke,
  runCli,
  runLocalSmoke,
};
