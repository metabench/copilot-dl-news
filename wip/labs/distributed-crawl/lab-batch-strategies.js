#!/usr/bin/env node
/**
 * Lab: Test different batching and compression strategies for distributed crawl.
 * 
 * Usage:
 *   node lab-batch-strategies.js [--urls N] [--strategies all|batch|compress|both]
 * 
 * Tests:
 * - Batch sizes: 5, 10, 20, 50, 100
 * - Compression: none, gzip, brotli
 * - Concurrency: 5, 10, 20
 * 
 * Uses real unfetched URLs from the database for authentic performance data.
 */

const REMOTE_WORKER = 'http://144.21.42.149:8081';

const db = require('better-sqlite3')('data/news.db');

function getUnfetchedUrls(limit = 100) {
  return db.prepare(`
    SELECT u.id, u.url, u.host 
    FROM urls u 
    WHERE u.id NOT IN (SELECT url_id FROM http_responses WHERE url_id IS NOT NULL)
    ORDER BY RANDOM()
    LIMIT ?
  `).all(limit);
}

async function testBatchSize(urls, batchSize, maxConcurrency = 20) {
  const payload = {
    requests: urls.map(u => ({ url: u.url, method: 'HEAD' })),
    maxConcurrency,
    batchSize,
    timeoutMs: 15000,
  };

  const started = Date.now();
  const resp = await fetch(`${REMOTE_WORKER}/batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await resp.json();
  const roundTripMs = Date.now() - started;

  return {
    batchSize,
    maxConcurrency,
    urlCount: urls.length,
    roundTripMs,
    workerMs: json.summary?.durationMs || 0,
    ok: json.summary?.ok || 0,
    errors: json.summary?.errors || 0,
    throughput: (urls.length / (roundTripMs / 1000)).toFixed(1),
    avgPerUrl: (roundTripMs / urls.length).toFixed(1),
  };
}

async function testCompression(urls, compression = 'none') {
  const payload = {
    requests: urls.map(u => ({ url: u.url, method: 'HEAD' })),
    maxConcurrency: 20,
    batchSize: 20,
    timeoutMs: 15000,
    responseCompression: compression,
  };

  const started = Date.now();
  const headers = { 'content-type': 'application/json' };
  if (compression !== 'none') {
    headers['accept-encoding'] = compression;
  }

  const resp = await fetch(`${REMOTE_WORKER}/batch`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  
  const contentEncoding = resp.headers.get('content-encoding') || 'none';
  const contentLength = resp.headers.get('content-length') || 'unknown';
  const json = await resp.json();
  const roundTripMs = Date.now() - started;

  return {
    compression,
    actualEncoding: contentEncoding,
    contentLength,
    urlCount: urls.length,
    roundTripMs,
    workerMs: json.summary?.durationMs || 0,
    ok: json.summary?.ok || 0,
  };
}

async function testConcurrency(urls, concurrency) {
  const payload = {
    requests: urls.map(u => ({ url: u.url, method: 'HEAD' })),
    maxConcurrency: concurrency,
    batchSize: 20,
    timeoutMs: 15000,
  };

  const started = Date.now();
  const resp = await fetch(`${REMOTE_WORKER}/batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await resp.json();
  const roundTripMs = Date.now() - started;

  return {
    concurrency,
    urlCount: urls.length,
    roundTripMs,
    workerMs: json.summary?.durationMs || 0,
    ok: json.summary?.ok || 0,
    errors: json.summary?.errors || 0,
    throughput: (urls.length / (roundTripMs / 1000)).toFixed(1),
  };
}

async function runFullBenchmark(urlCount = 50) {
  console.log('=== Distributed Crawl Strategy Lab ===\n');
  console.log(`Remote worker: ${REMOTE_WORKER}`);
  console.log(`URLs to test: ${urlCount}\n`);

  // Get unfetched URLs
  console.log('Fetching unfetched URLs from database...');
  const urls = getUnfetchedUrls(urlCount);
  console.log(`Got ${urls.length} unfetched URLs\n`);

  if (urls.length === 0) {
    console.log('No unfetched URLs found. Exiting.');
    db.close();
    return;
  }

  const results = {
    timestamp: new Date().toISOString(),
    urlCount: urls.length,
    batchSizes: [],
    concurrency: [],
    compression: [],
  };

  // Test batch sizes
  console.log('--- Batch Size Comparison ---');
  for (const batchSize of [5, 10, 20, 50]) {
    const result = await testBatchSize(urls, batchSize);
    results.batchSizes.push(result);
    console.log(`  Batch ${batchSize.toString().padStart(3)}: ${result.roundTripMs}ms total, ${result.throughput} URLs/sec, ${result.ok} OK`);
  }
  console.log();

  // Test concurrency levels
  console.log('--- Concurrency Comparison ---');
  for (const concurrency of [5, 10, 20, 40]) {
    const result = await testConcurrency(urls, concurrency);
    results.concurrency.push(result);
    console.log(`  Conc ${concurrency.toString().padStart(2)}: ${result.roundTripMs}ms total, ${result.throughput} URLs/sec, ${result.ok} OK`);
  }
  console.log();

  // Test compression (if worker supports it)
  console.log('--- Compression Comparison ---');
  for (const compression of ['none', 'gzip']) {
    try {
      const result = await testCompression(urls, compression);
      results.compression.push(result);
      console.log(`  ${compression.padEnd(6)}: ${result.roundTripMs}ms, encoding=${result.actualEncoding}, ${result.ok} OK`);
    } catch (err) {
      console.log(`  ${compression.padEnd(6)}: FAILED - ${err.message}`);
    }
  }
  console.log();

  // Summary
  console.log('=== Summary ===');
  const bestBatch = results.batchSizes.reduce((a, b) => parseFloat(a.throughput) > parseFloat(b.throughput) ? a : b);
  const bestConc = results.concurrency.reduce((a, b) => parseFloat(a.throughput) > parseFloat(b.throughput) ? a : b);
  console.log(`Best batch size: ${bestBatch.batchSize} (${bestBatch.throughput} URLs/sec)`);
  console.log(`Best concurrency: ${bestConc.concurrency} (${bestConc.throughput} URLs/sec)`);

  // Save results
  const fs = require('fs');
  const resultPath = `labs/distributed-crawl/results/strategy-${Date.now()}.json`;
  fs.mkdirSync('labs/distributed-crawl/results', { recursive: true });
  fs.writeFileSync(resultPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${resultPath}`);

  db.close();
  return results;
}

const urlCount = parseInt(process.argv.find(a => a.startsWith('--urls='))?.split('=')[1] || '50', 10);
runFullBenchmark(urlCount).catch(err => {
  console.error(err);
  db.close();
  process.exit(1);
});
