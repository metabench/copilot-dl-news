#!/usr/bin/env node
// Controller script: send URL batches to a running worker and save artifacts locally.
// Usage:
//   node controller-run.js --worker=http://127.0.0.1:8081 --urls-file=urls.txt --out=artifacts/run1 --includeBody --puppeteer
// Options:
//   --worker=<url>         Worker base URL (default http://127.0.0.1:8081)
//   --urls-file=<path>     Newline-separated URLs (required if no --url provided)
//   --url=<u>              Add a single URL (repeatable)
//   --concurrency=<n>      Max concurrency on worker (default 50)
//   --timeoutMs=<n>        Per-request timeout (default 10000)
//   --batchSize=<n>        Chunk size per worker call (default 20)
//   --includeBody          Include body for GETs
//   --puppeteer            Use puppeteer for all URLs
//   --head                 Force HEAD for all URLs
//   --out=<dir>            Output directory (default artifacts/<timestamp>)
//   --maxBodyBytes=<n>     Optional cap for body bytes (omit for no cap)
// Notes:
// - Worker must be reachable. For self-signed HTTPS set NODE_TLS_REJECT_UNAUTHORIZED=0.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    worker: 'http://127.0.0.1:8081',
    urls: [],
    urlsFile: null,
    concurrency: 50,
    timeoutMs: 10000,
    batchSize: 20,
    includeBody: false,
    puppeteer: false,
    head: false,
    outDir: null,
    maxBodyBytes: null,
  };
  for (const a of args) {
    if (a.startsWith('--worker=')) out.worker = a.slice('--worker='.length);
    else if (a.startsWith('--urls-file=')) out.urlsFile = a.slice('--urls-file='.length);
    else if (a.startsWith('--url=')) out.urls.push(a.slice('--url='.length));
    else if (a.startsWith('--concurrency=')) out.concurrency = Number(a.slice('--concurrency='.length));
    else if (a.startsWith('--timeoutMs=')) out.timeoutMs = Number(a.slice('--timeoutMs='.length));
    else if (a.startsWith('--batchSize=')) out.batchSize = Number(a.slice('--batchSize='.length));
    else if (a === '--includeBody') out.includeBody = true;
    else if (a === '--puppeteer') out.puppeteer = true;
    else if (a === '--head') out.head = true;
    else if (a.startsWith('--out=')) out.outDir = a.slice('--out='.length);
    else if (a.startsWith('--maxBodyBytes=')) out.maxBodyBytes = Number(a.slice('--maxBodyBytes='.length));
  }
  if (out.urlsFile) {
    const text = fs.readFileSync(out.urlsFile, 'utf8');
    out.urls.push(...text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  }
  if (out.urls.length === 0) {
    console.error('No URLs provided. Use --url or --urls-file');
    process.exit(1);
  }
  if (!out.outDir) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    out.outDir = path.join('artifacts', ts);
  }
  return out;
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

async function sendBatch(workerUrl, payload) {
  const resp = await fetch(`${workerUrl}/batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await resp.json();
  return json;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  const opts = parseArgs();
  ensureDir(opts.outDir);
  const ndjsonPath = path.join(opts.outDir, 'results.ndjson');
  const summaryPath = path.join(opts.outDir, 'summary.json');
  const summary = { total: opts.urls.length, batches: [], options: { ...opts, urls: undefined } };
  const batches = chunk(opts.urls, opts.batchSize);
  console.log(`Worker: ${opts.worker}`);
  console.log(`URLs: ${opts.urls.length}, batches: ${batches.length}, batchSize: ${opts.batchSize}`);
  const ndjsonStream = fs.createWriteStream(ndjsonPath, { flags: 'w' });

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    const payload = {
      requests: batch.map((url) => ({
        url,
        method: opts.head ? 'HEAD' : 'GET',
        includeBody: opts.includeBody,
        usePuppeteer: opts.puppeteer,
      })),
      maxConcurrency: opts.concurrency,
      timeoutMs: opts.timeoutMs,
      batchSize: opts.batchSize,
    };
    if (opts.maxBodyBytes != null) payload.maxBodyBytes = opts.maxBodyBytes;
    const started = Date.now();
    const json = await sendBatch(opts.worker, payload);
    const elapsed = Date.now() - started;
    summary.batches.push({ idx: i, count: batch.length, elapsedMs: elapsed, workerSummary: json.summary });
    for (const r of json.results) {
      ndjsonStream.write(`${JSON.stringify(r)}\n`);
    }
    console.log(`Batch ${i + 1}/${batches.length}: ${elapsed}ms, ok=${json.summary.ok}/${json.summary.count}`);
  }
  ndjsonStream.end();
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log('Saved results to', ndjsonPath);
  console.log('Saved summary to', summaryPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
