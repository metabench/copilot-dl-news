#!/usr/bin/env node
'use strict';

/**
 * mini-crawl.js — Small test crawl with full event logging to task_events
 * 
 * Usage:
 *   node tools/dev/mini-crawl.js <url>                    # Crawl a single page
 *   node tools/dev/mini-crawl.js <url> --max-pages 5      # Crawl up to 5 pages
 *   node tools/dev/mini-crawl.js <url> --operation discovery  # Run specific operation
 *   node tools/dev/mini-crawl.js --list-operations        # List available operations
 * 
 * All events are logged to task_events table for later analysis with:
 *   node tools/dev/task-events.js --summary <jobId>
 *   node tools/dev/task-events.js --problems <jobId>
 */

const path = require('path');
const Database = require('better-sqlite3');
const { createCrawlService } = require('../../src/server/crawl-api');
const { TelemetryIntegration } = require('../../src/crawler/telemetry/TelemetryIntegration');

// ─────────────────────────────────────────────────────────────
// Argument parsing
// ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {
    help: false,
    url: null,
    operation: 'basicArticleCrawl',
    maxPages: 3,
    maxDepth: 1,
    timeout: 30000,
    listOperations: false,
    json: false,
    verbose: false,
    slow: false,
    rateLimitMs: 0,
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
      case '--operation':
      case '-o':
        flags.operation = next;
        i++;
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
      case '--slow':
      case '-s':
        flags.slow = true;
        flags.rateLimitMs = 2000; // 2 seconds between requests
        break;
      case '--rate-limit':
        flags.rateLimitMs = parseInt(next, 10);
        i++;
        break;
      case '--list-operations':
        flags.listOperations = true;
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

// ─────────────────────────────────────────────────────────────
// Logging helpers
// ─────────────────────────────────────────────────────────────

function createLogger(verbose) {
  return {
    info: (...args) => verbose && console.log('ℹ️', ...args),
    warn: (...args) => console.warn('⚠️', ...args),
    error: (...args) => console.error('❌', ...args),
    debug: (...args) => verbose && console.log('🔍', ...args)
  };
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  const flags = parseArgs(process.argv);

  if (flags.help) {
    console.log(`
mini-crawl — Small test crawl with full event logging

Usage:
  node tools/dev/mini-crawl.js <url> [options]

Options:
  --operation <name>   Crawl operation (default: quickDiscovery)
  --max-pages <n>      Max pages to fetch (default: 3)
  --max-depth <n>      Max link depth (default: 1)
  --timeout <ms>       Timeout in ms (default: 30000)
  --list-operations    List available crawl operations
  --json               Output results as JSON
  -v, --verbose        Verbose logging
  --db <path>          Database path (default: data/news.db)
  -h, --help           Show this help

Examples:
  # Quick test crawl
  node tools/dev/mini-crawl.js https://example.com

  # Larger discovery
  node tools/dev/mini-crawl.js https://example.com --max-pages 10 --operation discovery

  # Check what happened
  node tools/dev/task-events.js --list
  node tools/dev/task-events.js --summary <jobId>
`);
    return;
  }

  // Open database
  const db = new Database(flags.db);

  // Determine if this is a "small crawl" (≤20 pages) - disable batching for visibility
  const isSmallCrawl = flags.maxPages <= 20;

  // Create telemetry integration with db persistence
  // For small crawls: disable batching for visibility, enable URL events for timing data
  const telemetry = new TelemetryIntegration({ 
    db,
    eventWriterOptions: { batchWrites: !isSmallCrawl },
    bridgeOptions: isSmallCrawl ? { 
      broadcastUrlEvents: true,       // Enable per-URL timing events
      urlEventBatchInterval: 0,       // No batching for small crawls  
      urlEventBatchSize: 1            // Flush each event immediately
    } : {}
  });

  // Use the TelemetryIntegration's eventWriter for lifecycle events too (avoid duplicates)
  const eventWriter = telemetry.getEventWriter();

  // Create crawl service with telemetry
  const service = createCrawlService({ telemetryIntegration: telemetry });

  if (flags.listOperations) {
    const availability = service.getAvailability();
    if (flags.json) {
      console.log(JSON.stringify(availability, null, 2));
    } else {
      console.log('\n📋 Available Operations:\n');
      for (const op of availability.operations) {
        console.log(`  • ${op.name}`);
        if (op.summary) console.log(`    ${op.summary}`);
      }
      console.log('\n📋 Available Sequences:\n');
      for (const seq of availability.sequences) {
        console.log(`  • ${seq.name} (${seq.stepCount} steps)`);
        if (seq.description) console.log(`    ${seq.description}`);
      }
    }
    db.close();
    return;
  }

  if (!flags.url) {
    console.error('Error: URL required. Use --help for usage.');
    process.exit(1);
  }

  const logger = createLogger(flags.verbose);
  const startTime = Date.now();
  const jobId = `mini-crawl-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;

  console.log(`\n🕷️  Starting mini-crawl`);
  console.log(`   URL:        ${flags.url}`);
  console.log(`   Operation:  ${flags.operation}`);
  console.log(`   Max Pages:  ${flags.maxPages}`);
  console.log(`   Job ID:     ${jobId}\n`);

  // Initialize the telemetry bridge with the jobId so URL events get the correct task ID
  telemetry.bridge.emitStarted({
    startUrl: flags.url,
    config: { operation: flags.operation, maxPages: flags.maxPages }
  }, {
    jobId,
    crawlType: flags.operation
  });

  // Also write start event directly for structured query support
  eventWriter.write({
    taskType: 'mini-crawl',
    taskId: jobId,
    eventType: 'crawl:start',
    category: 'lifecycle',
    data: {
      url: flags.url,
      operation: flags.operation,
      maxPages: flags.maxPages,
      maxDepth: flags.maxDepth
    }
  });

  let result;
  try {
    result = await service.runOperation({
      logger,
      operationName: flags.operation,
      startUrl: flags.url,
      overrides: {
        maxPagesPerDomain: flags.maxPages,
        maxDepth: flags.maxDepth,
        crawlTimeoutMs: flags.timeout,
        jobId,
        // Rate limiting for anti-bot protection
        ...(flags.rateLimitMs > 0 && { rateLimitMs: flags.rateLimitMs }),
        ...(flags.slow && { slowMode: true }),
        // For small crawls, disable progress throttle so all events are visible
        ...(isSmallCrawl && { progressEmitIntervalMs: 0 })
      }
    });

    // Write completion event
    eventWriter.write({
      taskType: 'mini-crawl',
      taskId: jobId,
      eventType: 'crawl:complete',
      category: 'lifecycle',
      data: {
        status: result?.status || 'unknown',
        elapsedMs: Date.now() - startTime,
        stats: result?.stats
      }
    });

  } catch (error) {
    // Write error event
    eventWriter.write({
      taskType: 'mini-crawl',
      taskId: jobId,
      eventType: 'crawl:error',
      category: 'error',
      severity: 'error',
      data: {
        error: error.message,
        stack: error.stack
      }
    });
    throw error;

  } finally {
    // Wait for batched events to flush (bridge uses 500ms batch interval)
    await new Promise(resolve => setTimeout(resolve, 600));
    
    // Cleanup - telemetry.destroy() will flush and destroy the eventWriter
    telemetry.destroy();
    db.close();
  }

  const elapsed = Date.now() - startTime;

  if (flags.json) {
    console.log(JSON.stringify({
      jobId,
      url: flags.url,
      operation: flags.operation,
      elapsed,
      result
    }, null, 2));
  } else {
    console.log(`\n✅ Crawl complete`);
    console.log(`   Duration:   ${formatDuration(elapsed)}`);
    console.log(`   Status:     ${result?.status || 'unknown'}`);
    if (result?.stats) {
      console.log(`   Pages:      ${result.stats.pagesVisited || 0}`);
      console.log(`   Links:      ${result.stats.linksFound || 0}`);
    }
    console.log(`\n📊 Analyze with:`);
    console.log(`   node tools/dev/task-events.js --summary ${jobId}`);
    console.log(`   node tools/dev/task-events.js --problems ${jobId}`);
    console.log(`   node tools/dev/task-events.js --get ${jobId} --limit 100`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error.message);
  if (process.env.DEBUG) console.error(error.stack);
  process.exit(1);
});
