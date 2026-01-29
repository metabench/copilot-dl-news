#!/usr/bin/env node
// Lab: send a batch to a remote worker (e.g., OCI node) and print timing summary.
// Usage:
//   node lab-remote-worker.js --worker=https://144.21.42.149:8081 --url https://example.com --url https://example.org/page
// Options:
//   --worker=<url>         Worker base URL (default http://127.0.0.1:8081)
//   --concurrency=<n>      Max concurrency on worker (default 50)
//   --timeoutMs=<n>        Per-request timeout (default 10000)
//   --batchSize=<n>        Batch chunk size (default 20)
//   --includeBody          Include body for GETs
//   --puppeteer            Use puppeteer for all URLs (rendered GET)
//   --head                 Force HEAD for all URLs
//   --urls-file=<path>     File with newline-separated URLs
// Notes:
// - The worker must already be running and reachable from this machine.
// - HTTPS with self-signed cert: prepend with https:// and add NODE_TLS_REJECT_UNAUTHORIZED=0 when running if needed.

const fs = require('fs');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    worker: 'http://127.0.0.1:8081',
    urls: [],
    concurrency: 50,
    timeoutMs: 10000,
    batchSize: 20,
    includeBody: false,
    puppeteer: false,
    head: false,
    urlsFile: null,
  };
  for (const a of args) {
    if (a.startsWith('--worker=')) out.worker = a.slice('--worker='.length);
    else if (a.startsWith('--concurrency=')) out.concurrency = Number(a.slice('--concurrency='.length));
    else if (a.startsWith('--timeoutMs=')) out.timeoutMs = Number(a.slice('--timeoutMs='.length));
    else if (a.startsWith('--batchSize=')) out.batchSize = Number(a.slice('--batchSize='.length));
    else if (a === '--includeBody') out.includeBody = true;
    else if (a === '--puppeteer') out.puppeteer = true;
    else if (a === '--head') out.head = true;
    else if (a.startsWith('--urls-file=')) out.urlsFile = a.slice('--urls-file='.length);
    else if (a.startsWith('--url=')) out.urls.push(a.slice('--url='.length));
  }
  if (out.urlsFile) {
    const text = fs.readFileSync(out.urlsFile, 'utf8');
    out.urls.push(...text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  }
  if (out.urls.length === 0) {
    console.error('No URLs provided. Use --url=... or --urls-file=...');
    process.exit(1);
  }
  return out;
}

async function sendBatch(opts) {
  const requests = opts.urls.map((url) => ({
    url,
    method: opts.head ? 'HEAD' : 'GET',
    includeBody: opts.includeBody,
    usePuppeteer: opts.puppeteer,
  }));
  const payload = {
    requests,
    maxConcurrency: opts.concurrency,
    timeoutMs: opts.timeoutMs,
    batchSize: opts.batchSize,
  };
  const started = Date.now();
  const resp = await fetch(`${opts.worker}/batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await resp.json();
  const elapsed = Date.now() - started;
  return { json, elapsed };
}

async function main() {
  const opts = parseArgs();
  console.log(`Worker: ${opts.worker}`);
  console.log(`URLs: ${opts.urls.length}`);
  console.log(`Concurrency: ${opts.concurrency}, batchSize: ${opts.batchSize}, timeoutMs: ${opts.timeoutMs}`);
  const { json, elapsed } = await sendBatch(opts);
  console.log('Elapsed (client):', `${elapsed}ms`);
  console.log('Worker summary:', json.summary);
  const sample = json.results.slice(0, 5);
  console.log('Sample results (first 5):');
  console.log(sample);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
