#!/usr/bin/env node
'use strict';

/**
 * mini-crawl-puppeteer.js — Mini crawl using Puppeteer for sites that block node-fetch
 * 
 * Use this for sites like The Guardian that use TLS fingerprinting to block automation.
 * All events include fetchMethod='puppeteer' for DB tracking.
 */

const path = require('path');
const Database = require('better-sqlite3');
const { PuppeteerFetcher } = require('../../src/crawler/PuppeteerFetcher');
const { TaskEventWriter } = require('../../src/db/TaskEventWriter');

// ─────────────────────────────────────────────────────────────
// Argument parsing
// ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {
    help: false,
    url: null,
    maxPages: 5,
    maxDepth: 1,
    timeout: 30000,
    delayMs: 2000,
    json: false,
    verbose: false,
    db: path.join(process.cwd(), 'data', 'news.db')
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '-h':
      case '--help':
        flags.help = true;
        break;
      case '--json':
        flags.json = true;
        break;
      case '-v':
      case '--verbose':
        flags.verbose = true;
        break;
      case '--max-pages':
        flags.maxPages = parseInt(next, 10);
        i++;
        break;
      case '--max-depth':
        flags.maxDepth = parseInt(next, 10);
        i++;
        break;
      case '--timeout':
        flags.timeout = parseInt(next, 10);
        i++;
        break;
      case '--delay':
        flags.delayMs = parseInt(next, 10);
        i++;
        break;
      case '--db':
        flags.db = next;
        i++;
        break;
      default:
        if (!arg.startsWith('-') && !flags.url) {
          flags.url = arg;
        }
    }
  }

  return flags;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ─────────────────────────────────────────────────────────────
// Simple link extraction and filtering
// ─────────────────────────────────────────────────────────────

function filterLinks(links, baseUrl, visited) {
  try {
    const baseHost = new URL(baseUrl).hostname;
    const seen = new Set();
    return links
      .map(link => {
        try {
          const url = new URL(link);
          // Remove fragment
          url.hash = '';
          return url.href;
        } catch {
          return null;
        }
      })
      .filter(link => {
        if (!link) return false;
        try {
          const url = new URL(link);
          // Same domain only
          if (url.hostname !== baseHost) return false;
          // Skip already visited
          if (visited.has(link)) return false;
          // Skip duplicates in this batch
          if (seen.has(link)) return false;
          seen.add(link);
          // Skip anchors, javascript, etc
          if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
          // Skip obvious non-content
          if (link.includes('/signin') || link.includes('/subscribe')) return false;
          return true;
        } catch {
          return false;
        }
      })
      .slice(0, 50); // Limit links per page
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  const flags = parseArgs(process.argv);

  if (flags.help) {
    console.log(`
mini-crawl-puppeteer — Puppeteer-based crawl for anti-bot sites

Usage:
  node tools/dev/mini-crawl-puppeteer.js <url> [options]

Options:
  --max-pages <n>    Max pages to fetch (default: 5)
  --max-depth <n>    Max link depth (default: 1)
  --timeout <ms>     Navigation timeout in ms (default: 30000)
  --delay <ms>       Delay between requests (default: 2000)
  --json             Output results as JSON
  -v, --verbose      Verbose logging
  --db <path>        Database path (default: data/news.db)
  -h, --help         Show this help

Examples:
  # Crawl The Guardian (which blocks node-fetch)
  node tools/dev/mini-crawl-puppeteer.js https://www.theguardian.com --max-pages 10

  # Check results
  node tools/dev/task-events.js --summary <jobId>
`);
    return;
  }

  if (!flags.url) {
    console.error('Error: URL required. Use --help for usage.');
    process.exit(1);
  }

  // Open database
  const db = new Database(flags.db);
  const eventWriter = new TaskEventWriter(db, { batchWrites: false });

  const jobId = `puppeteer-crawl-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  const startTime = Date.now();

  console.log(`\n🕷️  Starting Puppeteer crawl`);
  console.log(`   URL:        ${flags.url}`);
  console.log(`   Max Pages:  ${flags.maxPages}`);
  console.log(`   Max Depth:  ${flags.maxDepth}`);
  console.log(`   Delay:      ${flags.delayMs}ms`);
  console.log(`   Job ID:     ${jobId}\n`);

  // Write start event
  eventWriter.write({
    taskType: 'puppeteer-crawl',
    taskId: jobId,
    eventType: 'crawl:start',
    category: 'lifecycle',
    data: {
      url: flags.url,
      maxPages: flags.maxPages,
      maxDepth: flags.maxDepth,
      fetchMethod: 'puppeteer'
    }
  });

  const fetcher = new PuppeteerFetcher({
    navigationOptions: { timeout: flags.timeout }
  });

  // Simple BFS crawl
  const visited = new Set();
  const queue = [{ url: flags.url, depth: 0 }];
  const results = [];
  const urlEvents = [];

  try {
    await fetcher.init();

    while (queue.length > 0 && results.length < flags.maxPages) {
      const { url, depth } = queue.shift();
      
      if (visited.has(url)) continue;
      visited.add(url);

      if (flags.verbose) {
        console.log(`🔍 Fetching [depth=${depth}]: ${url}`);
      }

      const result = await fetcher.fetch(url, { timeout: flags.timeout });
      results.push(result);

      // Create URL event for DB
      const urlEvent = {
        url: result.url,
        finalUrl: result.finalUrl,
        httpStatus: result.httpStatus,
        contentLength: result.contentLength,
        durationMs: result.durationMs,
        cached: false,
        cacheReason: null,
        status: result.success ? 'ok' : 'failed',
        depth,
        fetchMethod: 'puppeteer',  // Key field for AI analysis
        error: result.error
      };
      urlEvents.push(urlEvent);

      // Log progress
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${result.httpStatus || 'ERR'} ${result.finalUrl} (${result.durationMs}ms)`);

      // Add links to queue
      if (result.success && depth < flags.maxDepth && result.metadata.links) {
        const newLinks = filterLinks(result.metadata.links, flags.url, visited);
        for (const link of newLinks) {
          if (!visited.has(link) && results.length + queue.length < flags.maxPages * 2) {
            queue.push({ url: link, depth: depth + 1 });
          }
        }
      }

      // Rate limiting delay
      if (queue.length > 0 && results.length < flags.maxPages) {
        await new Promise(r => setTimeout(r, flags.delayMs));
      }
    }

    // Write batch URL event to DB
    eventWriter.write({
      taskType: 'puppeteer-crawl',
      taskId: jobId,
      eventType: 'crawl:url:batch',
      category: 'work',
      data: { urls: urlEvents }
    });

    // Write completion event
    const elapsed = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    const totalBytes = results.reduce((sum, r) => sum + (r.contentLength || 0), 0);

    eventWriter.write({
      taskType: 'puppeteer-crawl',
      taskId: jobId,
      eventType: 'crawl:complete',
      category: 'lifecycle',
      data: {
        status: 'completed',
        elapsedMs: elapsed,
        fetchMethod: 'puppeteer',
        stats: {
          pagesVisited: results.length,
          successCount,
          failedCount: results.length - successCount,
          totalBytes
        }
      }
    });

    console.log(`\n✅ Crawl complete`);
    console.log(`   Duration:   ${formatDuration(elapsed)}`);
    console.log(`   Pages:      ${successCount}/${results.length}`);
    console.log(`   Bytes:      ${(totalBytes / 1024).toFixed(1)} KB`);
    console.log(`   Method:     puppeteer`);

    if (flags.json) {
      console.log('\n' + JSON.stringify({
        jobId,
        url: flags.url,
        elapsed,
        fetchMethod: 'puppeteer',
        results: results.map(r => ({
          url: r.url,
          finalUrl: r.finalUrl,
          httpStatus: r.httpStatus,
          contentLength: r.contentLength,
          durationMs: r.durationMs,
          success: r.success,
          error: r.error
        }))
      }, null, 2));
    }

  } catch (error) {
    eventWriter.write({
      taskType: 'puppeteer-crawl',
      taskId: jobId,
      eventType: 'crawl:error',
      category: 'error',
      severity: 'error',
      data: {
        error: error.message,
        fetchMethod: 'puppeteer'
      }
    });
    console.error(`\n❌ Crawl failed: ${error.message}`);
    throw error;

  } finally {
    await fetcher.destroy();
    eventWriter.flush();
    db.close();
  }

  console.log(`\n📊 Analyze with:`);
  console.log(`   node tools/dev/task-events.js --summary ${jobId}`);
  console.log(`   node tools/dev/task-events.js --get ${jobId} --limit 100`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
