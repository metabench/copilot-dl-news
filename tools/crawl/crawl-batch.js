#!/usr/bin/env node
/**
 * crawl-batch.js — Single-command batch launcher for the unified UI v1 crawl API.
 *
 * Starts N crawl jobs in parallel against the in-process job registry exposed by
 * the unified app at `/api/v1/crawl/operations/:operationName/start`.
 *
 * Synopsis:
 *   node tools/crawl/crawl-batch.js [options] [<startUrl>...]
 *
 * Source of start URLs (first one wins):
 *   1. `--preset <name>`          built-in preset (see PRESETS below)
 *   2. `--urls-file <path>`       newline- or JSON-array-delimited file
 *   3. positional <startUrl> args
 *
 * Common options:
 *   --operation, -o <name>        v1 operation to invoke (default: basicArticleCrawl)
 *   --max-pages <n>               overrides.maxPages and overrides.maxDownloads (default: 1000)
 *   --max-depth <n>               overrides.maxDepth (default: 6)
 *   --concurrency, -c <n>         parallel start requests (default: 5)
 *   --retries <n>                 per-URL retry attempts on transient errors (default: 2)
 *   --retry-delay-ms <n>          delay between retries (default: 1500)
 *   --ui-host <host>              unified UI host (default: 127.0.0.1, env UI_HOST)
 *   --ui-port <port>              unified UI port (default: 3000, env UI_PORT)
 *   --ui-base <path>              v1 base path (default: /api/v1/crawl)
 *   --override <k=v>              extra override key=value (repeatable; numbers/booleans coerced)
 *   --json                        emit machine-readable JSON to stdout
 *   --dry-run                     print the planned plan; do not POST anything
 *   --help, -h                    show this help
 *
 * Exit codes:
 *   0  all jobs accepted (HTTP 200)
 *   2  one or more jobs failed after retries
 *   3  preflight failed (UI not reachable, no URLs, bad args)
 */

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

// ─────────────────────────────────────────────────────────────────
// Built-in presets
// ─────────────────────────────────────────────────────────────────

const PRESETS = Object.freeze({
  'news-10': [
    'https://www.bbc.com/news',
    'https://www.reuters.com/',
    'https://www.theguardian.com/uk',
    'https://www.nytimes.com/',
    'https://www.washingtonpost.com/',
    'https://edition.cnn.com/',
    'https://apnews.com/',
    'https://www.bloomberg.com/',
    'https://www.ft.com/',
    'https://www.npr.org/'
  ],
  'news-5': [
    'https://www.bbc.com/news',
    'https://www.reuters.com/',
    'https://apnews.com/',
    'https://www.npr.org/',
    'https://www.theguardian.com/uk'
  ],
  'smoke-2': [
    'https://www.bbc.com/news',
    'https://apnews.com/'
  ]
});

// ─────────────────────────────────────────────────────────────────
// Arg parsing
// ─────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    preset: null,
    urlsFile: null,
    urls: [],
    operation: 'basicArticleCrawl',
    maxPages: 1000,
    maxDepth: 6,
    concurrency: 5,
    retries: 0,
    retryDelayMs: 1500,
    requestTimeoutMs: 15000,
    uiHost: process.env.UI_HOST || '127.0.0.1',
    uiPort: Number(process.env.UI_PORT || 3000),
    uiBase: '/api/v1/crawl',
    overrides: {},
    json: false,
    dryRun: false,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--help': case '-h': opts.help = true; break;
      case '--json': opts.json = true; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--preset': opts.preset = next(); break;
      case '--urls-file': opts.urlsFile = next(); break;
      case '--operation': case '-o': opts.operation = next(); break;
      case '--max-pages': opts.maxPages = Number(next()); break;
      case '--max-depth': opts.maxDepth = Number(next()); break;
      case '--concurrency': case '-c': opts.concurrency = Number(next()); break;
      case '--retries': opts.retries = Number(next()); break;
      case '--retry-delay-ms': opts.retryDelayMs = Number(next()); break;
      case '--request-timeout-ms': opts.requestTimeoutMs = Number(next()); break;
      case '--ui-host': opts.uiHost = next(); break;
      case '--ui-port': opts.uiPort = Number(next()); break;
      case '--ui-base': opts.uiBase = next(); break;
      case '--override': {
        const kv = next();
        const eq = kv.indexOf('=');
        if (eq < 0) throw new Error(`--override needs key=value, got: ${kv}`);
        opts.overrides[kv.slice(0, eq)] = coerceScalar(kv.slice(eq + 1));
        break;
      }
      default:
        if (a.startsWith('-')) throw new Error(`Unknown flag: ${a}`);
        opts.urls.push(a);
    }
  }
  return opts;
}

function coerceScalar(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (raw !== '' && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

function loadUrlsFromFile(filePath) {
  const txt = fs.readFileSync(path.resolve(filePath), 'utf8').trim();
  if (txt.startsWith('[')) return JSON.parse(txt);
  return txt.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
}

function resolveUrls(opts) {
  if (opts.preset) {
    const preset = PRESETS[opts.preset];
    if (!preset) throw new Error(`Unknown preset "${opts.preset}". Known: ${Object.keys(PRESETS).join(', ')}`);
    return preset.slice();
  }
  if (opts.urlsFile) return loadUrlsFromFile(opts.urlsFile);
  return opts.urls.slice();
}

// ─────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────

function postJson({ host, port, path: urlPath, body }, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      try { req.setTimeout(0); } catch (_e) {}
      fn(value);
    };
    const req = http.request({
      host, port, method: 'POST', path: urlPath,
      headers: { 'content-type': 'application/json', 'content-length': data.length }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
        settle(resolve, { status: res.statusCode, body: parsed });
      });
    });
    req.setTimeout(timeoutMs, () => {
      if (!settled) {
        try { req.destroy(); } catch (_e) {}
        settle(reject, new Error(`request timeout after ${timeoutMs}ms`));
      }
    });
    req.on('error', err => settle(reject, err));
    req.write(data); req.end();
  });
}

function getJson({ host, port, path: urlPath }, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      try { req.setTimeout(0); } catch (_e) {}
      fn(value);
    };
    const req = http.request({ host, port, method: 'GET', path: urlPath }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
        settle(resolve, { status: res.statusCode, body: parsed });
      });
    });
    req.setTimeout(timeoutMs, () => {
      if (!settled) {
        try { req.destroy(); } catch (_e) {}
        settle(reject, new Error(`request timeout after ${timeoutMs}ms`));
      }
    });
    req.on('error', err => settle(reject, err));
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function formatElapsed(startedAt, finishedAt) {
  const elapsedMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
  return `${(elapsedMs / 1000).toFixed(1)}s`;
}

async function preflight({ host, port, base }, log) {
  const url = `${base}/availability?operations=true&sequences=false`;
  log(`Preflight: GET http://${host}:${port}${url}`);
  try {
    const r = await getJson({ host, port, path: url });
    if (r.status !== 200 || !r.body || !r.body.availability) {
      throw new Error(`availability returned HTTP ${r.status}`);
    }
    const ops = (r.body.availability.operations || []).map(o => o.name);
    return { ok: true, operations: ops };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function isRetryableStartFailure(status, body, errorMessage = '') {
  if (status === 408 || status === 429 || status >= 500) return true;
  const text = `${body && JSON.stringify(body) || ''} ${errorMessage}`;
  if (/ECONNRESET|ETIMEDOUT|timeout|socket hang up/i.test(text)) return true;
  if (/JOB_CONFLICT|already running|single.*job|conflict/i.test(text)) return false;
  if (status >= 400 && status < 500) return false;
  return true;
}

async function startOne({ host, port, base, operation, startUrl, overrides, retries, retryDelayMs, requestTimeoutMs, log }) {
  const urlPath = `${base}/operations/${encodeURIComponent(operation)}/start`;
  let lastErr = null;
  let retryable = true;
  let attempts = 0;
  for (let attempt = 0; attempt <= retries; attempt++) {
    attempts = attempt + 1;
    try {
      const r = await postJson({ host, port, path: urlPath, body: { startUrl, overrides } }, requestTimeoutMs);
      if (r.status >= 200 && r.status < 300) {
        const jobId = r.body && (r.body.jobId || (r.body.job && r.body.job.id));
        return { ok: true, status: r.status, jobId, body: r.body, attempts: attempt + 1 };
      }
      lastErr = new Error(`HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
      retryable = isRetryableStartFailure(r.status, r.body, lastErr.message);
    } catch (err) {
      lastErr = err;
      retryable = isRetryableStartFailure(0, null, err.message);
    }
    if (!retryable) break;
    if (attempt < retries) {
      log(`  retry ${attempt + 1}/${retries} for ${startUrl} (${lastErr.message})`);
      await sleep(retryDelayMs);
    }
  }
  return { ok: false, error: lastErr ? lastErr.message : 'unknown error', attempts, retryable };
}

// Bounded-concurrency runner
async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function pump() {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => pump()));
  return results;
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────

function printHelp() {
  process.stdout.write([
    'crawl-batch — start N crawls against the unified UI v1 API in one command.',
    '',
    'Usage:',
    '  node tools/crawl/crawl-batch.js --preset news-10 --max-pages 1000',
    '  node tools/crawl/crawl-batch.js --urls-file urls.txt --concurrency 4 --json',
    '  node tools/crawl/crawl-batch.js https://a/ https://b/ --operation siteExplorer',
    '',
    'Presets: ' + Object.keys(PRESETS).join(', '),
    '',
    'Run with --help for the full option list (also documented in the source header).',
    ''
  ].join('\n'));
}

async function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); }
  catch (err) { process.stderr.write(`Error: ${err.message}\n`); process.exit(3); }

  if (opts.help) { printHelp(); process.exit(0); }

  const json = opts.json;
  const logLines = [];
  const log = msg => { if (json) logLines.push(msg); else process.stdout.write(msg + '\n'); };

  let urls;
  try { urls = resolveUrls(opts); }
  catch (err) { process.stderr.write(`Error: ${err.message}\n`); process.exit(3); }

  if (!urls.length) {
    process.stderr.write('Error: no URLs supplied. Use --preset, --urls-file, or positional args.\n');
    process.exit(3);
  }

  const overrides = Object.assign(
    { maxPages: opts.maxPages, maxDownloads: opts.maxPages, maxDepth: opts.maxDepth },
    opts.overrides
  );

  const plan = {
    uiHost: opts.uiHost,
    uiPort: opts.uiPort,
    uiBase: opts.uiBase,
    operation: opts.operation,
    concurrency: opts.concurrency,
    retries: opts.retries,
    requestTimeoutMs: opts.requestTimeoutMs,
    overrides,
    urls
  };

  if (opts.dryRun) {
    if (json) process.stdout.write(JSON.stringify({ status: 'dry-run', plan }, null, 2) + '\n');
    else {
      log('Dry run — would launch ' + urls.length + ' job(s):');
      log(JSON.stringify(plan, null, 2));
    }
    process.exit(0);
  }

  const pf = await preflight({ host: opts.uiHost, port: opts.uiPort, base: opts.uiBase }, log);
  if (!pf.ok) {
    const msg = `Preflight failed: ${pf.error}. Is the unified UI running at http://${opts.uiHost}:${opts.uiPort}? Start it with: node src/ui/server/unifiedApp/server.js`;
    if (json) process.stdout.write(JSON.stringify({ status: 'error', error: msg }, null, 2) + '\n');
    else process.stderr.write(msg + '\n');
    process.exit(3);
  }
  if (!pf.operations.includes(opts.operation)) {
    const msg = `Operation "${opts.operation}" not in availability. Known: ${pf.operations.join(', ')}`;
    if (json) process.stdout.write(JSON.stringify({ status: 'error', error: msg }, null, 2) + '\n');
    else process.stderr.write(msg + '\n');
    process.exit(3);
  }
  log(`Preflight ok — ${pf.operations.length} operations available.`);

  const startedAt = new Date().toISOString();
  const results = await runWithConcurrency(urls, opts.concurrency, async (startUrl) => {
    log(`→ ${opts.operation} ${startUrl}`);
    const r = await startOne({
      host: opts.uiHost, port: opts.uiPort, base: opts.uiBase,
      operation: opts.operation, startUrl, overrides,
      retries: opts.retries, retryDelayMs: opts.retryDelayMs, requestTimeoutMs: opts.requestTimeoutMs, log
    });
    log(`  ${r.ok ? '✓' : '✗'} ${startUrl}` + (r.jobId ? ` jobId=${r.jobId}` : '') + (r.error ? ` (${r.error})` : ''));
    return Object.assign({ startUrl }, r);
  });

  const finishedAt = new Date().toISOString();
  const ok = results.filter(r => r.ok).length;
  const fail = results.length - ok;

  const summary = {
    status: fail === 0 ? 'ok' : 'partial',
    startedAt, finishedAt,
    plan,
    counts: { total: results.length, ok, failed: fail },
    results
  };

  if (json) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  } else {
    log('');
    log(`Launch summary: accepted=${ok}/${results.length} failed=${fail} elapsed=${formatElapsed(startedAt, finishedAt)}`);
    if (fail) {
      log('Failed:');
      for (const r of results.filter(r => !r.ok)) log(`  - ${r.startUrl}: ${r.error}`);
    }
  }

  process.exit(fail === 0 ? 0 : 2);
}

if (require.main === module) {
  main().catch(err => {
    process.stderr.write(`Fatal: ${err && err.stack || err}\n`);
    process.exit(1);
  });
}

module.exports = { parseArgs, resolveUrls, PRESETS, runWithConcurrency, startOne, preflight, isRetryableStartFailure, formatElapsed };
