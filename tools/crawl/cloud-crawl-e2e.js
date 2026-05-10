#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

const {
  normalizeValidationOptions,
  buildRemoteRunArgs,
  buildDrainArgs,
  summarizeLedgerState,
  parseRunLogMetrics,
  validateEvidence,
  createPlan,
} = require('./lib/cloud-crawl-e2e-validation');
const { loadLedger } = require('./lib/sync-ledger');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const REMOTE_SCRIPT = path.join(__dirname, 'crawl-remote.js');
const DEFAULT_DB_PATH = path.join(REPO_ROOT, 'data', 'news.db');
const DEFAULT_LEDGER_PATH = path.join(__dirname, '.crawl-remote-ledger.json');
const DEFAULT_ARTIFACT_DIR = path.join(REPO_ROOT, 'tmp', 'cloud-crawl-e2e');

function parseCliArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const name = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[name] = true;
      continue;
    }
    args[name] = next;
    index += 1;
  }
  return args;
}

function printHelp() {
  console.log(`cloud-crawl-e2e - 15-minute bounded cloud crawl validation

Usage:
  node tools/crawl/cloud-crawl-e2e.js [options]
  npm run crawl -- news-10x1000-15m-e2e

Options:
  --duration-min <n>              Total hard time budget (default: 15)
  --host <host:port>              Remote crawler host (default: 141.144.193.218:3200)
  --domains <csv>                 Target domains (default: 10 major news domains)
  --max-pages <n>                 Remote max pages per domain (default: 1000)
  --min-new-responses <n>         Required local http_response delta (default: 25)
  --min-success-responses <n>     Required 2xx response count/delta (default: 10)
  --min-content-rows <n>          Required content_storage delta (default: 5)
  --min-distinct-hosts <n>        Required distinct hosts in validation window (default: 3)
  --max-failure-ratio <n>         Max failed/total response ratio (default: 0.6)
  --artifact-dir <path>           Directory for JSON/log artifacts (default: tmp/cloud-crawl-e2e)
  --db <path>                     Local news DB path (default: data/news.db)
  --ledger <path>                 Sync ledger path (default: tools/crawl/.crawl-remote-ledger.json)
  --dry-run                       Print the exact bounded plan without network or DB work
  --preflight-only                Check remote health/throttle/content stats, then exit
  --allow-missing-throttle        Warn instead of failing if /api/throttle is absent
  --json                          Print full JSON report
`);
}

function normalizeBaseUrl(host) {
  const value = String(host || '').trim();
  if (/^https?:\/\//i.test(value)) return value.replace(/\/$/, '');
  return `http://${value}`.replace(/\/$/, '');
}

function requestJson(method, url, body = null, timeoutMs = 10_000) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const request = transport.request({
      method,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: `${parsed.pathname}${parsed.search}`,
      timeout: timeoutMs,
      headers: payload ? {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
      } : {},
    }, (response) => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
        resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode, data, text });
      });
    });
    request.on('timeout', () => request.destroy(new Error(`timeout after ${timeoutMs}ms`)));
    request.on('error', error => resolve({ ok: false, status: null, data: null, error: error.message }));
    if (payload) request.write(payload);
    request.end();
  });
}

async function collectRemotePreflight(baseUrl) {
  const result = {
    checkedAt: new Date().toISOString(),
    healthOk: false,
    throttleOk: false,
    contentStatsOk: false,
    statusOk: false,
  };

  const health = await requestJson('GET', `${baseUrl}/api/health`, null, 10_000);
  result.healthStatus = health.status;
  result.healthError = health.error || null;
  result.health = health.data || null;
  result.healthOk = health.ok;

  const throttle = await requestJson('GET', `${baseUrl}/api/throttle`, null, 8_000);
  result.throttleStatus = throttle.status;
  result.throttleError = throttle.error || null;
  result.throttle = throttle.data || null;
  result.throttleOk = throttle.ok;

  const contentStats = await requestJson('GET', `${baseUrl}/api/content/stats`, null, 8_000);
  result.contentStatsStatus = contentStats.status;
  result.contentStatsError = contentStats.error || null;
  result.contentStats = contentStats.data || null;
  result.contentStatsOk = contentStats.ok;

  const status = await requestJson('GET', `${baseUrl}/api/status`, null, 12_000);
  result.statusStatus = status.status;
  result.statusError = status.error || null;
  result.statusOk = status.ok;
  if (status.data && Array.isArray(status.data.domains)) {
    result.remoteDomains = status.data.domains.map(domain => ({
      domain: domain.domain,
      state: domain.state,
      isRunning: Boolean(domain.isRunning),
      fetched: domain.stats?.fetched || domain.stats?.done || 0,
      errors: domain.stats?.errors || 0,
    }));
  }

  return result;
}

function tableExists(db, tableName) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(tableName);
  return Boolean(row);
}

function getCount(db, sql, params = []) {
  const row = db.prepare(sql).get(...params);
  return row ? Number(row.count || 0) : 0;
}

function snapshotDatabase(dbPath) {
  const snapshot = {
    available: false,
    path: dbPath,
    capturedAt: new Date().toISOString(),
    totals: { urls: 0, responses: 0, successResponses: 0, failedResponses: 0, content: 0 },
    latestFetchedAt: null,
    error: null,
  };

  if (!fs.existsSync(dbPath)) {
    snapshot.error = `DB not found: ${dbPath}`;
    return snapshot;
  }

  let db = null;
  try {
    const Database = require('better-sqlite3');
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.pragma('query_only = ON');
    if (tableExists(db, 'urls')) snapshot.totals.urls = getCount(db, 'SELECT COUNT(*) AS count FROM urls');
    if (tableExists(db, 'http_responses')) {
      snapshot.totals.responses = getCount(db, 'SELECT COUNT(*) AS count FROM http_responses');
      snapshot.totals.successResponses = getCount(db, 'SELECT COUNT(*) AS count FROM http_responses WHERE http_status BETWEEN 200 AND 299');
      snapshot.totals.failedResponses = getCount(db, 'SELECT COUNT(*) AS count FROM http_responses WHERE http_status IS NULL OR http_status < 200 OR http_status >= 300');
      const latest = db.prepare('SELECT MAX(fetched_at) AS latestFetchedAt FROM http_responses').get();
      snapshot.latestFetchedAt = latest?.latestFetchedAt || null;
    }
    if (tableExists(db, 'content_storage')) snapshot.totals.content = getCount(db, 'SELECT COUNT(*) AS count FROM content_storage');
    snapshot.available = true;
  } catch (error) {
    snapshot.error = error.message;
  } finally {
    if (db) db.close();
  }
  return snapshot;
}

function buildHostFilter(domains) {
  const clauses = [];
  const params = [];
  for (const domain of domains || []) {
    clauses.push('(u.host = ? OR u.host LIKE ?)');
    params.push(domain, `%.${domain}`);
  }
  if (clauses.length === 0) return { sql: '', params: [] };
  return { sql: ` AND (${clauses.join(' OR ')})`, params };
}

function toSqliteUtcTimestamp(value, round = 'none') {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');

  if (round === 'floor') {
    date.setUTCMilliseconds(0);
  } else if (round === 'ceil' && date.getUTCMilliseconds() > 0) {
    date.setUTCMilliseconds(0);
    date.setUTCSeconds(date.getUTCSeconds() + 1);
  } else if (round === 'ceil') {
    date.setUTCMilliseconds(0);
  }

  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeEvidenceWindow(startedAt, finishedAt) {
  return {
    startedAt: toSqliteUtcTimestamp(startedAt, 'floor'),
    finishedAt: toSqliteUtcTimestamp(finishedAt, 'ceil'),
  };
}

function getRecentEvidence(dbPath, startedAt, finishedAt, domains) {
  const queryWindow = normalizeEvidenceWindow(startedAt, finishedAt);
  const evidence = {
    available: false,
    startedAt,
    finishedAt,
    queryWindow,
    downloads: 0,
    success: 0,
    failed: 0,
    bytes: 0,
    distinctHosts: 0,
    hosts: [],
    statuses: [],
    error: null,
  };

  if (!fs.existsSync(dbPath)) {
    evidence.error = `DB not found: ${dbPath}`;
    return evidence;
  }

  let db = null;
  try {
    const Database = require('better-sqlite3');
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.pragma('query_only = ON');
    if (!tableExists(db, 'http_responses') || !tableExists(db, 'urls')) {
      evidence.error = 'Required tables http_responses/urls not found';
      return evidence;
    }

    const hostFilter = buildHostFilter(domains);
  const params = [queryWindow.startedAt, queryWindow.finishedAt, ...hostFilter.params];
    const totals = db.prepare(`
      SELECT
        COUNT(*) AS downloads,
        SUM(CASE WHEN r.http_status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS success,
        SUM(CASE WHEN r.http_status IS NULL OR r.http_status < 200 OR r.http_status >= 300 THEN 1 ELSE 0 END) AS failed,
        COALESCE(SUM(r.bytes_downloaded), 0) AS bytes,
        COUNT(DISTINCT u.host) AS distinctHosts
      FROM http_responses r
      JOIN urls u ON r.url_id = u.id
      WHERE r.fetched_at BETWEEN ? AND ?${hostFilter.sql}
    `).get(...params);

    evidence.downloads = Number(totals.downloads || 0);
    evidence.success = Number(totals.success || 0);
    evidence.failed = Number(totals.failed || 0);
    evidence.bytes = Number(totals.bytes || 0);
    evidence.distinctHosts = Number(totals.distinctHosts || 0);

    evidence.hosts = db.prepare(`
      SELECT
        u.host,
        COUNT(*) AS downloads,
        SUM(CASE WHEN r.http_status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS success,
        SUM(CASE WHEN r.http_status IS NULL OR r.http_status < 200 OR r.http_status >= 300 THEN 1 ELSE 0 END) AS failed,
        COALESCE(SUM(r.bytes_downloaded), 0) AS bytes,
        MIN(r.fetched_at) AS firstFetchedAt,
        MAX(r.fetched_at) AS lastFetchedAt
      FROM http_responses r
      JOIN urls u ON r.url_id = u.id
      WHERE r.fetched_at BETWEEN ? AND ?${hostFilter.sql}
      GROUP BY u.host
      ORDER BY downloads DESC
      LIMIT 25
    `).all(...params);

    evidence.statuses = db.prepare(`
      SELECT COALESCE(r.http_status, -1) AS status, COUNT(*) AS count
      FROM http_responses r
      JOIN urls u ON r.url_id = u.id
      WHERE r.fetched_at BETWEEN ? AND ?${hostFilter.sql}
      GROUP BY COALESCE(r.http_status, -1)
      ORDER BY count DESC
      LIMIT 25
    `).all(...params);

    evidence.available = true;
  } catch (error) {
    evidence.error = error.message;
  } finally {
    if (db) db.close();
  }
  return evidence;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function createArtifactPaths(artifactDir) {
  ensureDir(artifactDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    report: path.join(artifactDir, `cloud-crawl-e2e-${stamp}.json`),
    log: path.join(artifactDir, `cloud-crawl-e2e-${stamp}.log`),
  };
}

function appendLog(logPath, label, chunk) {
  fs.appendFileSync(logPath, `\n[${label}] ${new Date().toISOString()}\n${chunk.toString('utf8')}\n`);
}

function runProcessWithDeadline(command, args, { cwd, logPath, stopAtMs, hardTimeoutMs, stopSignal = 'SIGINT' }) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const output = [];
    let stoppedAtDeadline = false;
    let hardTimedOut = false;
    let killTimer = null;

    function remember(label, chunk) {
      const text = chunk.toString('utf8');
      output.push(text);
      if (output.length > 2000) output.shift();
      appendLog(logPath, label, text);
    }

    const stopTimer = setTimeout(() => {
      stoppedAtDeadline = true;
      child.kill(stopSignal);
      killTimer = setTimeout(() => {
        hardTimedOut = true;
        child.kill('SIGKILL');
      }, Math.max(1000, hardTimeoutMs - stopAtMs));
    }, stopAtMs);

    const hardTimer = setTimeout(() => {
      hardTimedOut = true;
      child.kill('SIGKILL');
    }, hardTimeoutMs);

    child.stdout.on('data', chunk => remember('stdout', chunk));
    child.stderr.on('data', chunk => remember('stderr', chunk));
    child.on('error', error => remember('error', Buffer.from(error.message)));
    child.on('close', (exitCode, signal) => {
      clearTimeout(stopTimer);
      clearTimeout(hardTimer);
      if (killTimer) clearTimeout(killTimer);
      const finishedAt = new Date().toISOString();
      resolve({
        command,
        args,
        startedAt,
        finishedAt,
        exitCode,
        signal,
        stoppedAtDeadline,
        hardTimedOut,
        outputText: output.join('\n'),
      });
    });
  });
}

async function stopRemoteCrawl(baseUrl, domains) {
  return requestJson('POST', `${baseUrl}/api/stop`, { domains }, 8_000);
}

function remainingMs(deadlineAt) {
  return Math.max(0, deadlineAt - Date.now());
}

function createPreflightReport({ options, artifactPaths, remote, before, ledgerBefore, startedAt, finishedAt }) {
  const validation = validateEvidence({
    options,
    before,
    after: before,
    recent: { downloads: 0, success: 0, failed: 0, bytes: 0, distinctHosts: 0 },
    ledger: ledgerBefore,
    remote,
    timing: { startedAt, finishedAt, elapsedMs: Date.parse(finishedAt) - Date.parse(startedAt) },
    child: { exitCode: 0 },
    runLog: { errorLines: [], roundSamples: [] },
  });
  return {
    ok: remote.healthOk && (options.allowMissingThrottle || remote.throttleOk),
    mode: 'preflight-only',
    startedAt,
    finishedAt,
    artifact: artifactPaths,
    plan: createPlan(options),
    remote,
    before,
    ledgerBefore,
    validation,
  };
}

function writeReport(reportPath, report) {
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

function printHumanSummary(report) {
  console.log('\nCloud crawl e2e validation');
  console.log(`  Result: ${report.ok ? 'PASS' : 'FAIL'}`);
  console.log(`  Mode: ${report.mode}`);
  console.log(`  Report: ${report.artifact.report}`);
  if (report.artifact.log) console.log(`  Log: ${report.artifact.log}`);
  if (report.validation) {
    const validation = report.validation;
    console.log(`  New responses: ${validation.deltas.responses}`);
    console.log(`  Successful responses: ${validation.deltas.successResponses}`);
    console.log(`  Content rows: ${validation.deltas.content}`);
    console.log(`  Downloads/min: ${validation.benchmark.downloadsPerMinute.toFixed(2)}`);
    console.log(`  Success/min: ${validation.benchmark.successPerMinute.toFixed(2)}`);
    const failedChecks = validation.checks.filter(check => !check.ok);
    if (failedChecks.length > 0) {
      console.log('  Diagnostics:');
      for (const item of failedChecks.slice(0, 10)) {
        console.log(`    - ${item.name}: expected ${item.expected}, got ${JSON.stringify(item.actual)}`);
      }
    }
  }
}

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));
  if (cli.help || cli.h) {
    printHelp();
    return 0;
  }

  const options = normalizeValidationOptions(cli);
  const artifactDir = path.resolve(cli['artifact-dir'] || DEFAULT_ARTIFACT_DIR);
  const artifactPaths = createArtifactPaths(artifactDir);
  const plan = createPlan(options);

  if (cli['dry-run']) {
    const report = { ok: true, mode: 'dry-run', artifact: artifactPaths, plan };
    writeReport(artifactPaths.report, report);
    if (cli.json) console.log(JSON.stringify(report, null, 2));
    else printHumanSummary(report);
    return 0;
  }

  const dbPath = path.resolve(cli.db || DEFAULT_DB_PATH);
  const ledgerPath = path.resolve(cli.ledger || DEFAULT_LEDGER_PATH);
  const baseUrl = normalizeBaseUrl(options.host);
  const startedAt = new Date().toISOString();
  const hardDeadlineAt = Date.now() + options.durationMs;

  const before = snapshotDatabase(dbPath);
  const ledgerBefore = summarizeLedgerState(loadLedger(ledgerPath));
  const remote = await collectRemotePreflight(baseUrl);

  if (cli['preflight-only'] || !remote.healthOk || (!options.allowMissingThrottle && !remote.throttleOk)) {
    const finishedAt = new Date().toISOString();
    const report = createPreflightReport({ options, artifactPaths, remote, before, ledgerBefore, startedAt, finishedAt });
    writeReport(artifactPaths.report, report);
    if (cli.json) console.log(JSON.stringify(report, null, 2));
    else printHumanSummary(report);
    return report.ok ? 0 : 1;
  }

  const runArgs = buildRemoteRunArgs(options);
  const runResult = await runProcessWithDeadline(process.execPath, [REMOTE_SCRIPT, ...runArgs], {
    cwd: REPO_ROOT,
    logPath: artifactPaths.log,
    stopAtMs: options.crawlBudgetMs,
    hardTimeoutMs: options.crawlBudgetMs + options.stopGraceMs,
    stopSignal: 'SIGINT',
  });

  const stopResult = await stopRemoteCrawl(baseUrl, options.domains);
  const drainBudget = Math.max(0, remainingMs(hardDeadlineAt) - options.validationMs);
  let drainResult = null;
  if (drainBudget > 5_000) {
    const drainArgs = buildDrainArgs(options, drainBudget);
    drainResult = await runProcessWithDeadline(process.execPath, [REMOTE_SCRIPT, ...drainArgs], {
      cwd: REPO_ROOT,
      logPath: artifactPaths.log,
      stopAtMs: Math.max(1000, drainBudget - 1000),
      hardTimeoutMs: drainBudget,
      stopSignal: 'SIGTERM',
    });
  }

  const finishedAt = new Date().toISOString();
  const after = snapshotDatabase(dbPath);
  const recent = getRecentEvidence(dbPath, startedAt, finishedAt, options.domains);
  const ledgerAfter = summarizeLedgerState(loadLedger(ledgerPath));
  const runLog = parseRunLogMetrics(`${runResult.outputText || ''}\n${drainResult?.outputText || ''}`);
  const elapsedMs = Date.parse(finishedAt) - Date.parse(startedAt);
  const childExitOk = (runResult.exitCode === 0 || runResult.stoppedAtDeadline) && (!drainResult || drainResult.exitCode === 0 || drainResult.stoppedAtDeadline);

  const validation = validateEvidence({
    options,
    before,
    after,
    recent,
    ledger: ledgerAfter,
    remote,
    timing: { startedAt, finishedAt, elapsedMs },
    child: {
      exitCode: childExitOk ? 0 : (runResult.exitCode ?? drainResult?.exitCode ?? 1),
      signal: runResult.signal || drainResult?.signal || null,
      stoppedAtDeadline: runResult.stoppedAtDeadline,
      hardTimedOut: runResult.hardTimedOut || drainResult?.hardTimedOut || false,
    },
    runLog,
  });

  const report = {
    ok: validation.ok,
    mode: 'live',
    startedAt,
    finishedAt,
    artifact: artifactPaths,
    plan,
    remote,
    before,
    after,
    recent,
    ledgerBefore,
    ledgerAfter,
    run: runResult,
    stop: stopResult,
    drain: drainResult,
    validation,
  };

  writeReport(artifactPaths.report, report);
  if (cli.json) console.log(JSON.stringify(report, null, 2));
  else printHumanSummary(report);
  return report.ok ? 0 : 1;
}

if (require.main === module) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseCliArgs,
  normalizeBaseUrl,
  requestJson,
  collectRemotePreflight,
  snapshotDatabase,
  getRecentEvidence,
  normalizeEvidenceWindow,
  toSqliteUtcTimestamp,
  runProcessWithDeadline,
};
