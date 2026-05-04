#!/usr/bin/env node
/**
 * Lab: Test body download with compression strategies.
 * 
 * Usage:
 *   node lab-body-download.js [--count N] [--compress gzip|none]
 * 
 * Tests downloading actual page content and measures:
 * - Raw download size
 * - Compressed transfer size
 * - Decompression overhead
 * - Total time breakdown
 */

const REMOTE_WORKER = 'http://144.21.42.149:8081';
const zlib = require('zlib');

const db = require('better-sqlite3')('data/news.db');

function getUnfetchedUrls(limit = 10) {
  return db.prepare(`
    SELECT u.id, u.url, u.host 
    FROM urls u 
    WHERE u.id NOT IN (SELECT url_id FROM http_responses WHERE url_id IS NOT NULL)
    ORDER BY RANDOM() LIMIT ?
  `).all(limit);
}

async function fetchWithCompression(urls, compress = 'gzip') {
  const payload = {
    requests: urls.map(u => ({ url: u.url, method: 'GET', urlId: u.id })),
    maxConcurrency: 20,
    batchSize: 20,
    timeoutMs: 30000,
    includeBody: true,
    compress,
  };

  const started = Date.now();
  
  // Use undici for raw access to compressed response (Node's fetch auto-decompresses)
  const http = require('http');
  const respData = await new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const req = http.request(`${REMOTE_WORKER}/batch`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(postData),
        ...(compress === 'gzip' ? { 'accept-encoding': 'gzip' } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          encoding: res.headers['content-encoding'],
          uncompressedLength: parseInt(res.headers['x-uncompressed-length'] || '0', 10),
          buffer: Buffer.concat(chunks),
        });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  const { encoding, uncompressedLength, buffer } = respData;
  const transferBytes = buffer.length;
  
  // Decompress if needed
  const decompressStart = Date.now();
  let jsonStr;
  if (encoding === 'gzip') {
    const decompressed = zlib.gunzipSync(buffer);
    jsonStr = decompressed.toString('utf8');
  } else {
    jsonStr = buffer.toString('utf8');
  }
  const decompressMs = Date.now() - decompressStart;
  
  const json = JSON.parse(jsonStr);
  const totalMs = Date.now() - started;

  // Calculate body stats
  let totalBodyBytes = 0;
  let bodiesReceived = 0;
  json.results.forEach(r => {
    if (r.bodyBytes) {
      totalBodyBytes += r.bodyBytes;
      bodiesReceived++;
    }
  });

  return {
    compress,
    encoding,
    urlCount: urls.length,
    bodiesReceived,
    totalBodyBytes,
    transferBytes,
    uncompressedLength,
    compressionRatio: uncompressedLength > 0 ? (transferBytes / uncompressedLength).toFixed(3) : 'N/A',
    decompressMs,
    totalMs,
    workerMs: json.summary?.durationMs || 0,
    ok: json.summary?.ok || 0,
    errors: json.summary?.errors || 0,
    throughputMB: ((totalBodyBytes / 1024 / 1024) / (totalMs / 1000)).toFixed(2),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const count = parseInt(args.find(a => a.startsWith('--count='))?.split('=')[1] || '10', 10);

  console.log('=== Body Download Compression Lab ===\n');
  console.log(`Remote worker: ${REMOTE_WORKER}`);
  console.log(`URLs to download: ${count}`);
  console.log();

  // Get unfetched URLs
  const urls = getUnfetchedUrls(count);
  console.log(`Found ${urls.length} unfetched URLs\n`);

  if (urls.length === 0) {
    console.log('No unfetched URLs found.');
    db.close();
    return;
  }

  const results = [];

  // Test without compression
  console.log('--- Without Compression ---');
  const noCompResult = await fetchWithCompression(urls, 'none');
  results.push(noCompResult);
  console.log(`  Transfer: ${(noCompResult.transferBytes / 1024).toFixed(1)} KB`);
  console.log(`  Bodies: ${noCompResult.bodiesReceived}, total ${(noCompResult.totalBodyBytes / 1024).toFixed(1)} KB`);
  console.log(`  Time: ${noCompResult.totalMs}ms (worker: ${noCompResult.workerMs}ms)`);
  console.log(`  Throughput: ${noCompResult.throughputMB} MB/sec`);
  console.log();

  // Get fresh URLs for fair comparison
  const urls2 = getUnfetchedUrls(count);

  // Test with gzip compression
  console.log('--- With Gzip Compression ---');
  const gzipResult = await fetchWithCompression(urls2, 'gzip');
  results.push(gzipResult);
  console.log(`  Transfer: ${(gzipResult.transferBytes / 1024).toFixed(1)} KB (was ${(gzipResult.uncompressedLength / 1024).toFixed(1)} KB)`);
  console.log(`  Compression ratio: ${gzipResult.compressionRatio}`);
  console.log(`  Bodies: ${gzipResult.bodiesReceived}, total ${(gzipResult.totalBodyBytes / 1024).toFixed(1)} KB`);
  console.log(`  Time: ${gzipResult.totalMs}ms (worker: ${gzipResult.workerMs}ms, decompress: ${gzipResult.decompressMs}ms)`);
  console.log(`  Throughput: ${gzipResult.throughputMB} MB/sec`);
  console.log();

  // Comparison
  console.log('=== Comparison ===');
  const bytesSaved = noCompResult.transferBytes - gzipResult.transferBytes;
  const timeSaved = noCompResult.totalMs - gzipResult.totalMs;
  console.log(`Bytes saved with gzip: ${(bytesSaved / 1024).toFixed(1)} KB (${((bytesSaved / noCompResult.transferBytes) * 100).toFixed(0)}%)`);
  console.log(`Time difference: ${timeSaved > 0 ? '-' : '+'}${Math.abs(timeSaved)}ms`);
  
  if (timeSaved > 0) {
    console.log(`\n✓ Gzip is ${(noCompResult.totalMs / gzipResult.totalMs).toFixed(2)}x faster due to reduced transfer`);
  } else {
    console.log(`\n✗ Gzip is slower by ${Math.abs(timeSaved)}ms - transfer savings don't offset compression overhead`);
  }

  // Save results
  const fs = require('fs');
  const resultPath = `labs/distributed-crawl/results/body-download-${Date.now()}.json`;
  fs.mkdirSync('labs/distributed-crawl/results', { recursive: true });
  fs.writeFileSync(resultPath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
  console.log(`\nResults saved to: ${resultPath}`);

  db.close();
}

main().catch(err => {
  console.error(err);
  db.close();
  process.exit(1);
});
