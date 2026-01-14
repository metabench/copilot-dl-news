#!/usr/bin/env node
'use strict';

/**
 * mini-crawl.js — Small test crawl with full event logging to task_events
 * 
 * This CLI is a thin wrapper around the shared crawl infrastructure.
 * For long-running crawls, use the daemon-based approach instead:
 *   node tools/dev/crawl-daemon.js start
 *   node tools/dev/crawl-api.js jobs start <operation> <url>
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

// ─────────────────────────────────────────────────────────────
// Early console filter setup (BEFORE any requires that might log)
// Reduces noise from internal modules during crawl
// ─────────────────────────────────────────────────────────────

const _earlyQuiet = process.argv.includes('-q') || process.argv.includes('--quiet');
const _earlyDownloadsOnly = process.argv.includes('-d') || process.argv.includes('--downloads-only');
const _earlyTerse = process.argv.includes('--terse') || process.argv.includes('--no-queue');

if (_earlyQuiet || _earlyDownloadsOnly || _earlyTerse) {
  // Patterns to block (noisy internal logs)
  const _blockPatterns = [
    /^\[ProxyManager\]/i,
    /^\[PuppeteerDomainManager\]/i,
    /^\[Resilience\]/i,
    /^Priority config loaded/i,
    /^Enhanced features/i,
    /^Initializing enhanced/i,
    /^SQLite DB initialized/i,
    /^\[dspl\]/i,
    /^\[CountryHub/i,
    /^Country hub/i,
    /^robots\.txt loaded/i,
    /^Found \d+ sitemap/i,
    /^Starting crawler for/i,
    /^Data will be saved/i,
    /^Sitemap enqueue complete/i,
    /^Reached max downloads limit/i,
    /^QUEUE\s/i,           // Queue events (enqueue/dequeue/drop)
    /^PROGRESS\s/i         // Progress events (unless verbose)
  ];

  // Patterns to always allow
  const _allowPatterns = [
    /^PAGE\s/i,           // Downloaded pages
    /^[🕷️✅📊❌⚠️ℹ️🔍]/,   // Emoji-prefixed output
    /^(URL|Operation|Max Pages|Job ID|Duration|Status|Pages|Links):/i,
    /^mini-crawl/i
  ];

  const _shouldBlock = (text) => {
    const trimmed = String(text).trim();
    // Allow if matches allow pattern
    if (_allowPatterns.some(p => p.test(trimmed))) return false;
    // Block if matches block pattern
    if (_blockPatterns.some(p => p.test(trimmed))) return true;
    // In quiet mode, block everything else too
    if (_earlyQuiet) return true;
    return false;
  };

  const _origLog = console.log.bind(console);
  const _origInfo = console.info.bind(console);

  console.log = (...args) => {
    if (args.length === 0) return;
    if (!_shouldBlock(args[0])) _origLog(...args);
  };

  console.info = (...args) => {
    if (args.length === 0) return;
    if (!_shouldBlock(args[0])) _origInfo(...args);
  };
}

// ─────────────────────────────────────────────────────────────
// Argument parsing (must be first to enable --downloads-only filter)
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
    quiet: false,  // Suppress stdout noise, use CLI tools instead
    noQueue: true, // Suppress QUEUE events (enqueue/dequeue/drop) by default
    downloadsOnly: false, // Show only PAGE events (download activity)
    slow: false,
    rateLimitMs: 0,
    intMaxSeeds: null, // Country seed limit (null = default 50, 0 = all countries)
    adaptive: false, // Use adaptive strategy selection
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
      case '-q':
      case '--quiet':
        flags.quiet = true;
        break;
      case '--no-queue':
      case '--terse':
        flags.noQueue = true;
        break;
      case '--downloads-only':
      case '-d':
        flags.downloadsOnly = true;
        break;
      case '--operation':
      case '-o':
        flags.operation = next;
        i++;
        break;
      case '--max-pages':
      case '--pages':
      case '--limit':
      case '-n':
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
      case '--int-max-seeds':
        flags.intMaxSeeds = parseInt(next, 10);
        i++;
        break;
      case '--adaptive':
      case '-A':
        flags.adaptive = true;
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

function createLogger(verbose, quiet) {
  // Quiet mode: suppress all output except errors
  if (quiet) {
    return {
      info: () => {},
      warn: () => {},
      error: (...args) => console.error('❌', ...args),
      debug: () => {}
    };
  }
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

  // NOTE: Downloads-only console filter is now set up at module load time (see top of file)
  // before any requires can log. The early filter checks process.argv for -d/--downloads-only.

  // Lazy require heavy modules
  const Database = require('better-sqlite3');
  const { createCrawlService } = require('../../src/server/crawl-api');
  const { TelemetryIntegration } = require('../../src/crawler/telemetry/TelemetryIntegration');
  const { AdaptiveDiscoveryService, STRATEGIES } = require('../../src/crawler/strategies');

  if (flags.help) {
    console.log(`
mini-crawl — Small test crawl with full event logging

Usage:
  node tools/dev/mini-crawl.js <url> [options]

Options:
  --operation, -o <name>   Crawl operation (default: basicArticleCrawl)
  --max-pages, -n <n>      Max pages to fetch (default: 3)
                           Aliases: --pages, --limit
  --max-depth <n>          Max link depth (default: 1)
  --timeout <ms>           Timeout in ms (default: 30000)
  --list-operations        List available crawl operations
  --json                   Output results as JSON
  -v, --verbose            Verbose logging
  -d, --downloads-only     Show only download activity (PAGE events)
  --terse                  Hide QUEUE/PROGRESS events, show key telemetry only
  -q, --quiet              Suppress all stdout noise (monitor with crawl-live.js)
  --adaptive, -A           Use adaptive strategy selection (auto-switch strategies)
  --db <path>              Database path (default: data/news.db)
  -h, --help               Show this help

Examples:
  # Quick test crawl (terse output by default)
  node tools/dev/mini-crawl.js https://example.com

  # Adaptive mode - automatically chooses best strategy
  node tools/dev/mini-crawl.js https://bbc.com/news -n 100 --adaptive

  # Quiet mode - use separate CLI to monitor
  node tools/dev/mini-crawl.js https://example.com -n 50 -q &
  node tools/dev/crawl-live.js --last 10

  # Check results after crawl
  node tools/dev/task-events.js --list
  node tools/dev/task-events.js --summary <jobId>

For long-running crawls, use the daemon approach:
  node tools/dev/crawl-daemon.js start
  node tools/dev/crawl-api.js jobs start siteExplorer https://bbc.com -n 100 --json
  node tools/dev/crawl-api.js jobs get <jobId> --json
`);
    return;
  }

  // Open database
  const db = new Database(flags.db);

  // Determine if this is a "small crawl" (≤20 pages) - disable batching for visibility
  const isSmallCrawl = flags.maxPages <= 20;

  // Create telemetry integration with db persistence
  // For small crawls: disable batching for visibility, enable URL events for timing data
  // Quiet mode: suppress stdout telemetry, still write to DB
  const telemetry = new TelemetryIntegration({ 
    db,
    eventWriterOptions: { batchWrites: !isSmallCrawl },
    bridgeOptions: {
      ...(isSmallCrawl ? { 
        broadcastUrlEvents: true,       // Enable per-URL timing events
        urlEventBatchInterval: 0,       // No batching for small crawls  
        urlEventBatchSize: 1            // Flush each event immediately
      } : {}),
      // Quiet mode: disable stdout telemetry
      ...(flags.quiet ? { stdoutEnabled: false } : {})
    }
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

  const logger = createLogger(flags.verbose, flags.quiet);
  const startTime = Date.now();
  const jobId = `mini-crawl-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;

  // ─────────────────────────────────────────────────────────────
  // Adaptive Discovery Mode
  // ─────────────────────────────────────────────────────────────
  let adaptiveService = null;
  let effectiveOperation = flags.operation;
  
  if (flags.adaptive) {
    adaptiveService = new AdaptiveDiscoveryService({ db, logger });
    const domain = new URL(flags.url).hostname;
    
    // Run quick sitemap check to determine capabilities
    const https = require('https');
    const http = require('http');
    const urlObj = new URL(flags.url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    let hasSitemap = false;
    let sitemapUrls = [];
    
    try {
      const robotsUrl = `${urlObj.origin}/robots.txt`;
      const robotsResponse = await new Promise((resolve, reject) => {
        const req = protocol.get(robotsUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' },
          timeout: 5000
        }, resolve);
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      });
      
      if (robotsResponse.statusCode === 200) {
        let robotsBody = '';
        robotsResponse.on('data', chunk => { robotsBody += chunk; if (robotsBody.length > 10000) robotsResponse.destroy(); });
        await new Promise(resolve => robotsResponse.on('end', resolve).on('close', resolve));
        
        const sitemapMatches = robotsBody.match(/Sitemap:\s*(.+)/gi) || [];
        sitemapUrls = sitemapMatches.map(m => m.replace(/Sitemap:\s*/i, '').trim());
        hasSitemap = sitemapUrls.length > 0;
      }
    } catch (err) {
      logger.debug('robots.txt check failed:', err.message);
    }
    
    // Initialize with capabilities
    const selectedStrategy = await adaptiveService.initialize(domain, {
      hasSitemap,
      sitemapUrls: hasSitemap ? sitemapUrls.length * 100 : 0, // Estimate ~100 URLs per sitemap
      sitemapLocations: sitemapUrls
    });
    
    // Map strategy to operation
    const strategyToOperation = {
      [STRATEGIES.SITEMAP]: 'sitemapDiscovery',
      [STRATEGIES.APS]: 'siteExplorer',
      [STRATEGIES.LINK_FOLLOW]: 'basicArticleCrawl',
      [STRATEGIES.HOMEPAGE]: 'basicArticleCrawl'
    };
    effectiveOperation = strategyToOperation[selectedStrategy] || flags.operation;
    
    if (!flags.quiet) {
      console.log(`🧠 Adaptive mode: strategy=${selectedStrategy} → operation=${effectiveOperation}`);
      console.log(`   Sitemap: ${hasSitemap ? `✓ (${sitemapUrls.length} found)` : '✗ none'}`);
    }
  }

  if (!flags.quiet) {
    console.log(`\n🕷️  Starting mini-crawl`);
    console.log(`   URL:        ${flags.url}`);
    console.log(`   Operation:  ${effectiveOperation}${flags.adaptive ? ' (adaptive)' : ''}`);
    console.log(`   Max Pages:  ${flags.maxPages}`);
    console.log(`   Job ID:     ${jobId}\n`);
  } else {
    console.log(`🕷️ ${jobId} started (use crawl-live.js to monitor)`);
  }

  // Initialize the telemetry bridge with the jobId so URL events get the correct task ID
  telemetry.bridge.emitStarted({
    startUrl: flags.url,
    config: { operation: effectiveOperation, maxPages: flags.maxPages, adaptive: flags.adaptive }
  }, {
    jobId,
    crawlType: effectiveOperation
  });

  // Also write start event directly for structured query support
  eventWriter.write({
    taskType: 'mini-crawl',
    taskId: jobId,
    eventType: 'crawl:start',
    category: 'lifecycle',
    data: {
      url: flags.url,
      operation: effectiveOperation,
      adaptiveMode: flags.adaptive,
      maxPages: flags.maxPages,
      maxDepth: flags.maxDepth
    }
  });

  let result;
  try {
    result = await service.runOperation({
      logger,
      operationName: effectiveOperation,
      startUrl: flags.url,
      overrides: {
        maxDownloads: flags.maxPages,
        maxDepth: flags.maxDepth,
        crawlTimeoutMs: flags.timeout,
        jobId,
        // Custom database path (if provided)
        ...(flags.db !== path.join(process.cwd(), 'data', 'news.db') && { dbPath: flags.db }),
        // Adaptive discovery service for strategy tracking
        ...(adaptiveService && { adaptiveDiscoveryService: adaptiveService }),
        // Country hub seed limit (0 = all countries)
        ...(flags.intMaxSeeds !== null && { intMaxSeeds: flags.intMaxSeeds }),
        // Rate limiting for anti-bot protection
        ...(flags.rateLimitMs > 0 && { rateLimitMs: flags.rateLimitMs }),
        ...(flags.slow && { slowMode: true }),
        // For small crawls, disable progress throttle so all events are visible
        ...(isSmallCrawl && !flags.quiet && !flags.downloadsOnly && { progressEmitIntervalMs: 0 }),
        // Downloads-only mode: show only PAGE events
        ...(flags.downloadsOnly && { outputVerbosity: 'downloads' }),
        // Terse mode: hide QUEUE events but show other telemetry
        ...(flags.noQueue && !flags.downloadsOnly && !flags.quiet && { outputVerbosity: 'terse' }),
        // Quiet mode: suppress stdout telemetry lines (PROGRESS, QUEUE, MILESTONE, etc)
        ...(flags.quiet && { outputVerbosity: 'extra-terse' }),
        // Pretty output for human CLI usage (unless JSON or quiet)
        prettyOutput: !flags.json && !flags.quiet
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

  // Get adaptive summary if in adaptive mode
  let adaptiveSummary = null;
  if (adaptiveService) {
    adaptiveSummary = adaptiveService.getSummary();
  }

  if (flags.json) {
    console.log(JSON.stringify({
      jobId,
      url: flags.url,
      operation: effectiveOperation,
      adaptive: flags.adaptive,
      ...(adaptiveSummary && { adaptiveStrategy: adaptiveSummary }),
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
    if (adaptiveSummary) {
      console.log(`\n🧠 Adaptive Strategy Summary:`);
      console.log(`   Strategy:   ${adaptiveSummary.currentStrategy}`);
      console.log(`   Switches:   ${adaptiveSummary.switchCount}`);
      if (adaptiveSummary.recentMetrics) {
        const metrics = adaptiveSummary.recentMetrics;
        console.log(`   Success:    ${(metrics.successRate * 100).toFixed(0)}%`);
        console.log(`   Articles:   ${(metrics.articleYield * 100).toFixed(0)}% yield`);
      }
      if (adaptiveSummary.recommendation) {
        console.log(`   Recommend:  ${adaptiveSummary.recommendation.action} (${adaptiveSummary.recommendation.reason})`);
      }
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
