#!/usr/bin/env node
/**
 * Lab: Real crawl using distributed worker - downloads actual page content.
 * 
 * Usage:
 *   node lab-real-crawl.js [--count N] [--method GET|HEAD] [--save]
 * 
 * This lab:
 * 1. Gets unfetched URLs from the database
 * 2. Sends them to the remote worker for parallel downloading
 * 3. Optionally saves results to http_responses table
 */

const REMOTE_WORKER = 'http://144.21.42.149:8081';
const zlib = require('zlib');

const db = require('better-sqlite3')('data/news.db');

function getUnfetchedUrls(limit = 20, host = null) {
  const sql = host
    ? `SELECT u.id, u.url, u.host FROM urls u 
       WHERE u.host = ? 
       AND u.id NOT IN (SELECT url_id FROM http_responses WHERE url_id IS NOT NULL)
       ORDER BY u.id DESC LIMIT ?`
    : `SELECT u.id, u.url, u.host FROM urls u 
       WHERE u.id NOT IN (SELECT url_id FROM http_responses WHERE url_id IS NOT NULL)
       ORDER BY RANDOM() LIMIT ?`;
  
  return host ? db.prepare(sql).all(host, limit) : db.prepare(sql).all(limit);
}

async function crawlBatch(urls, method = 'GET') {
  const payload = {
    requests: urls.map(u => ({ url: u.url, method, urlId: u.id })),
    maxConcurrency: 20,
    batchSize: 20,
    timeoutMs: 30000,
    includeBody: method === 'GET',
  };

  const started = Date.now();
  console.log(`Sending ${urls.length} URLs to remote worker (method=${method})...`);

  const resp = await fetch(`${REMOTE_WORKER}/batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await resp.json();
  const roundTripMs = Date.now() - started;

  return {
    ...json,
    roundTripMs,
    throughput: (urls.length / (roundTripMs / 1000)).toFixed(2),
  };
}

function saveResponses(results) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO http_responses (
      url_id, http_status, content_type, content_length, 
      fetched_at, fetch_duration_ms, headers_json, body_compressed
    ) VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?)
  `);

  let saved = 0;
  const transaction = db.transaction(() => {
    for (const r of results) {
      if (!r.urlId) continue;
      
      const headersJson = r.headers ? JSON.stringify(r.headers) : null;
      const bodyCompressed = r.body 
        ? zlib.gzipSync(Buffer.from(r.body, 'utf-8')) 
        : null;

      try {
        insert.run(
          r.urlId,
          r.status || null,
          r.contentType || null,
          r.contentLength || null,
          r.durationMs || null,
          headersJson,
          bodyCompressed
        );
        saved++;
      } catch (err) {
        // Ignore duplicates
      }
    }
  });

  transaction();
  return saved;
}

async function main() {
  const args = process.argv.slice(2);
  const count = parseInt(args.find(a => a.startsWith('--count='))?.split('=')[1] || '20', 10);
  const method = args.find(a => a.startsWith('--method='))?.split('=')[1]?.toUpperCase() || 'HEAD';
  const save = args.includes('--save');
  const host = args.find(a => a.startsWith('--host='))?.split('=')[1];

  console.log('=== Distributed Real Crawl Lab ===\n');
  console.log(`Remote worker: ${REMOTE_WORKER}`);
  console.log(`URLs to crawl: ${count}`);
  console.log(`Method: ${method}`);
  console.log(`Save to DB: ${save}`);
  if (host) console.log(`Host filter: ${host}`);
  console.log();

  // Get unfetched URLs
  const urls = getUnfetchedUrls(count, host);
  console.log(`Found ${urls.length} unfetched URLs\n`);

  if (urls.length === 0) {
    console.log('No unfetched URLs found.');
    db.close();
    return;
  }

  // Sample URLs
  console.log('Sample URLs:');
  urls.slice(0, 5).forEach(u => console.log(`  ${u.url.slice(0, 80)}...`));
  console.log();

  // Crawl
  const result = await crawlBatch(urls, method);

  console.log('--- Results ---');
  console.log(`Total time: ${result.roundTripMs}ms`);
  console.log(`Worker time: ${result.summary.durationMs}ms`);
  console.log(`Throughput: ${result.throughput} URLs/sec`);
  console.log(`OK: ${result.summary.ok}/${result.summary.count}`);
  console.log(`Errors: ${result.summary.errors}`);
  console.log();

  // Status breakdown
  const statusCounts = {};
  result.results.forEach(r => {
    const key = r.status || 'error';
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  });
  console.log('Status breakdown:', statusCounts);

  // If GET, show body sizes
  if (method === 'GET') {
    const withBody = result.results.filter(r => r.body);
    const totalBytes = withBody.reduce((acc, r) => acc + (r.body?.length || 0), 0);
    console.log(`Bodies received: ${withBody.length}`);
    console.log(`Total body size: ${(totalBytes / 1024).toFixed(1)} KB`);
  }

  // Save if requested
  if (save && method === 'GET') {
    console.log('\nSaving responses to database...');
    const saved = saveResponses(result.results);
    console.log(`Saved ${saved} new responses`);
  }

  // Performance per host
  const byHost = {};
  result.results.forEach(r => {
    try {
      const host = new URL(r.url).hostname;
      if (!byHost[host]) byHost[host] = { count: 0, totalMs: 0 };
      byHost[host].count++;
      byHost[host].totalMs += r.durationMs || 0;
    } catch {}
  });
  console.log('\nPer-host performance:');
  Object.entries(byHost).slice(0, 5).forEach(([h, stats]) => {
    console.log(`  ${h}: ${stats.count} URLs, avg ${(stats.totalMs / stats.count).toFixed(0)}ms`);
  });

  db.close();
}

main().catch(err => {
  console.error(err);
  db.close();
  process.exit(1);
});
