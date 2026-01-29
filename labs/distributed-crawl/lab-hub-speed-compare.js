#!/usr/bin/env node
/**
 * Lab: Compare hub-checking speed between local fetches and remote worker.
 * 
 * Usage:
 *   node lab-hub-speed-compare.js
 * 
 * This lab:
 * 1. Generates a list of candidate place hub URLs for major publishers
 * 2. Times HEAD requests done locally (from this machine)
 * 3. Times HEAD requests done via the remote worker
 * 4. Reports the speedup
 */

const REMOTE_WORKER = 'http://144.21.42.149:8081';

// Sample place hub URLs to check (mix of existing and non-existing)
const HUB_URLS = [
  // Guardian world hubs
  'https://www.theguardian.com/world/france',
  'https://www.theguardian.com/world/germany',
  'https://www.theguardian.com/world/italy',
  'https://www.theguardian.com/world/spain',
  'https://www.theguardian.com/world/poland',
  'https://www.theguardian.com/world/netherlands',
  'https://www.theguardian.com/world/belgium',
  'https://www.theguardian.com/world/austria',
  'https://www.theguardian.com/world/switzerland',
  'https://www.theguardian.com/world/portugal',
  // BBC world hubs
  'https://www.bbc.com/news/world/europe',
  'https://www.bbc.com/news/world/asia',
  'https://www.bbc.com/news/world/africa',
  'https://www.bbc.com/news/world/middle_east',
  'https://www.bbc.com/news/world/latin_america',
  // Reuters
  'https://www.reuters.com/world/europe/',
  'https://www.reuters.com/world/asia-pacific/',
  'https://www.reuters.com/world/africa/',
  'https://www.reuters.com/world/middle-east/',
  'https://www.reuters.com/world/americas/',
];

async function fetchLocalBatch(urls) {
  const results = [];
  const started = Date.now();
  for (const url of urls) {
    const itemStart = Date.now();
    let status = null;
    let ok = false;
    let error = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(url, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timeout);
      status = resp.status;
      ok = resp.ok;
    } catch (err) {
      error = err.message;
    }
    results.push({ url, status, ok, error, durationMs: Date.now() - itemStart });
  }
  return { results, totalMs: Date.now() - started };
}

async function fetchRemoteBatch(urls) {
  const payload = {
    requests: urls.map(url => ({ url, method: 'HEAD' })),
    maxConcurrency: 20,
    batchSize: 20,
    timeoutMs: 10000,
  };
  const started = Date.now();
  const resp = await fetch(`${REMOTE_WORKER}/batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await resp.json();
  const totalMs = Date.now() - started;
  return { results: json.results, summary: json.summary, totalMs };
}

async function main() {
  console.log('=== Hub Speed Comparison Lab ===\n');
  console.log(`URLs to check: ${HUB_URLS.length}`);
  console.log(`Remote worker: ${REMOTE_WORKER}\n`);

  // Local sequential fetches
  console.log('--- Local fetches (sequential) ---');
  const localResult = await fetchLocalBatch(HUB_URLS);
  const localOk = localResult.results.filter(r => r.ok).length;
  console.log(`  Total time: ${localResult.totalMs}ms`);
  console.log(`  OK: ${localOk}/${localResult.results.length}`);
  console.log(`  Avg per request: ${Math.round(localResult.totalMs / HUB_URLS.length)}ms\n`);

  // Remote parallel fetches
  console.log('--- Remote worker fetches (parallel) ---');
  const remoteResult = await fetchRemoteBatch(HUB_URLS);
  const remoteOk = remoteResult.results.filter(r => r.ok).length;
  console.log(`  Total time: ${remoteResult.totalMs}ms (client-side round trip)`);
  console.log(`  Worker duration: ${remoteResult.summary.durationMs}ms`);
  console.log(`  OK: ${remoteOk}/${remoteResult.results.length}`);
  console.log(`  Avg per request (worker): ${Math.round(remoteResult.summary.durationMs / HUB_URLS.length)}ms\n`);

  // Comparison
  const speedup = (localResult.totalMs / remoteResult.totalMs).toFixed(2);
  console.log('--- Comparison ---');
  console.log(`  Local total:  ${localResult.totalMs}ms`);
  console.log(`  Remote total: ${remoteResult.totalMs}ms`);
  console.log(`  Speedup:      ${speedup}x faster via remote worker\n`);

  // Sample results
  console.log('--- Sample results (first 5) ---');
  for (let i = 0; i < 5 && i < remoteResult.results.length; i++) {
    const r = remoteResult.results[i];
    console.log(`  ${r.url}: ${r.status} (${r.durationMs}ms)`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
