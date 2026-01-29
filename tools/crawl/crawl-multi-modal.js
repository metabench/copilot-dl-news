#!/usr/bin/env node
'use strict';

/**
 * Multi-Modal Intelligent Crawl CLI
 *
 * Runs a continuous crawl with learning loops:
 * - Downloads pages in batches
 * - Analyzes content after each batch
 * - Learns patterns and re-analyzes when improved
 * - Discovers new hub structures
 * - Balances historical backfill with newest articles
 *
 * Usage:
 *   node tools/crawl-multi-modal.js <domain> [options]
 *
 * Examples:
 *   node tools/crawl-multi-modal.js www.theguardian.com
 *   node tools/crawl-multi-modal.js www.bbc.com --batch-size 500 --max-batches 10
 *   node tools/crawl-multi-modal.js www.reuters.com --historical 0.4 --strategy adaptive
 */

const path = require('path');
const { CliArgumentParser } = require(path.join(__dirname, '../src/shared/utils/CliArgumentParser'));
const { CliFormatter } = require(path.join(__dirname, '../src/shared/utils/CliFormatter'));

// Parse arguments
const parser = new CliArgumentParser({
  description: 'Multi-modal intelligent crawl with learning loops',
  examples: [
    'node tools/crawl-multi-modal.js www.theguardian.com',
    'node tools/crawl-multi-modal.js www.bbc.com --batch-size 500 --max-batches 10',
    'node tools/crawl-multi-modal.js www.reuters.com --historical 0.4 --json'
  ]
});

parser.addPositional('domain', {
  description: 'Domain to crawl (e.g., www.theguardian.com)'
});

parser.addOption('batch-size', {
  alias: 'b',
  type: 'number',
  default: 1000,
  description: 'Pages per batch'
});

parser.addOption('max-batches', {
  alias: 'n',
  type: 'number',
  default: null,
  description: 'Maximum batches (null = indefinite)'
});

parser.addOption('max-pages', {
  type: 'number',
  default: null,
  description: 'Maximum total pages'
});

parser.addOption('historical', {
  alias: 'h',
  type: 'number',
  default: 0.3,
  description: 'Historical ratio (0-1)'
});

parser.addOption('strategy', {
  alias: 's',
  choices: ['fixed', 'adaptive', 'priority', 'time-based'],
  default: 'adaptive',
  description: 'Balancing strategy'
});

parser.addOption('domains', {
  type: 'string',
  description: 'Comma-separated list of domains to crawl concurrently'
});

parser.addOption('max-parallel', {
  type: 'number',
  default: 2,
  description: 'Max concurrent domains when --domains is used'
});

parser.addOption('hub-interval', {
  type: 'number',
  default: 60,
  description: 'Hub refresh interval (minutes)'
});

parser.addOption('hub-sequence', {
  type: 'string',
  default: 'intelligentCountryHubDiscovery',
  description: 'Hub discovery sequence preset (empty to disable)'
});

parser.addOption('hub-sequence-downloads', {
  type: 'number',
  default: 250,
  description: 'Max downloads for hub discovery sequence'
});

parser.addFlag('no-hub-sequence', {
  description: 'Disable hub discovery sequence runs'
});

parser.addOption('hub-guess-kinds', {
  type: 'string',
  description: 'Comma-separated place kinds for hub guessing (e.g. country,region,city)'
});

parser.addOption('hub-guess-limit', {
  type: 'number',
  default: 50,
  description: 'Max places/topics to probe during hub guessing'
});

parser.addFlag('no-hub-guessing', {
  description: 'Disable hub guessing pass'
});

parser.addOption('pause-between', {
  type: 'number',
  default: 5,
  description: 'Pause between batches (seconds)'
});

parser.addOption('status-interval', {
  type: 'number',
  default: 60,
  description: 'Status summary interval (seconds, 0 disables)'
});

parser.addFlag('stop-on-exhaustion', {
  description: 'Stop when queue is exhausted'
});

parser.addFlag('no-hub-discovery', {
  description: 'Disable hub discovery'
});

parser.addFlag('dry-run', {
  description: 'Show configuration without running'
});

parser.addFlag('json', {
  alias: 'j',
  description: 'Output as JSON'
});

parser.addFlag('verbose', {
  alias: 'v',
  description: 'Verbose output'
});

parser.addFlag('quiet', {
  description: 'Suppress per-batch logs (status summaries only)'
});

const args = parser.parse();

// Formatter
const fmt = new CliFormatter({
  json: args.json,
  quiet: false
});

async function main() {
  const domain = args.domain;
  const domainsArg = args.domains;
  const domainsList = domainsArg
    ? domainsArg.split(',').map((d) => d.trim()).filter(Boolean)
    : [];

  if (!domain && domainsList.length === 0) {
    fmt.error('Domain is required');
    fmt.log('Usage: node tools/crawl-multi-modal.js <domain> [options]');
    process.exit(1);
  }

  const hubSequenceName = typeof args['hub-sequence'] === 'string'
    ? args['hub-sequence'].trim()
    : '';
  const hubSequenceEnabled = !args['no-hub-sequence'] && hubSequenceName.length > 0;
  const hubGuessKinds = typeof args['hub-guess-kinds'] === 'string'
    ? args['hub-guess-kinds'].split(',').map((k) => k.trim()).filter(Boolean)
    : [];

  const config = {
    batchSize: args['batch-size'],
    maxTotalBatches: args['max-batches'],
    maxTotalPages: args['max-pages'],
    historicalRatio: args.historical,
    balancingStrategy: args.strategy,
    hubRefreshIntervalMs: args['hub-interval'] * 60 * 1000,
    pauseBetweenBatchesMs: args['pause-between'] * 1000,
    stopOnExhaustion: args['stop-on-exhaustion'],
    hubDiscoveryPerBatch: !args['no-hub-discovery'],
    hubDiscoverySequence: hubSequenceEnabled ? hubSequenceName : null,
    hubDiscoveryMaxDownloads: args['hub-sequence-downloads'],
    hubGuessingEnabled: !args['no-hub-guessing'],
    hubGuessingLimit: args['hub-guess-limit'],
    ...(hubGuessKinds.length ? { hubGuessingKinds: hubGuessKinds } : {})
  };

  const statusIntervalSec = Number.isFinite(args['status-interval'])
    ? Math.max(0, args['status-interval'])
    : 0;
  const statusIntervalMs = statusIntervalSec > 0
    ? Math.floor(statusIntervalSec * 1000)
    : 0;
  const quietLogger = {
    log: () => {},
    info: () => {},
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  };
  const activeLogger = args.verbose ? console : quietLogger;
  const allowLogs = !args.json;
  const showBatchLogs = allowLogs && !args.quiet;
  const showVerboseLogs = allowLogs && args.verbose && !args.quiet;

  // Dry run mode
  if (args['dry-run']) {
    if (args.json) {
      console.log(JSON.stringify({
        domain: domain || null,
        domains: domainsList.length ? domainsList : null,
        config,
        maxParallel: args['max-parallel'],
        dryRun: true
      }, null, 2));
    } else {
      fmt.header('Multi-Modal Crawl Configuration (Dry Run)');
      fmt.keyValue('Domain', domain || '(multiple)');
      if (domainsList.length) {
        fmt.keyValue('Domains', domainsList.join(', '));
        fmt.keyValue('Max Parallel', args['max-parallel']);
      }
      fmt.section('Configuration');
      fmt.keyValue('Batch Size', config.batchSize);
      fmt.keyValue('Max Batches', config.maxTotalBatches || 'Indefinite');
      fmt.keyValue('Max Pages', config.maxTotalPages || 'Indefinite');
      fmt.keyValue('Historical Ratio', `${(config.historicalRatio * 100).toFixed(0)}%`);
      fmt.keyValue('Strategy', config.balancingStrategy);
      fmt.keyValue('Hub Refresh', `${args['hub-interval']} minutes`);
      fmt.keyValue('Hub Sequence', config.hubDiscoverySequence || 'disabled');
      fmt.keyValue('Hub Sequence Downloads', config.hubDiscoveryMaxDownloads);
      fmt.keyValue('Hub Guessing', config.hubGuessingEnabled);
      if (config.hubGuessingKinds) {
        fmt.keyValue('Hub Guessing Kinds', config.hubGuessingKinds.join(', '));
      }
      fmt.keyValue('Status Interval', `${statusIntervalSec} seconds`);
      fmt.keyValue('Pause Between Batches', `${args['pause-between']} seconds`);
      fmt.keyValue('Stop On Exhaustion', config.stopOnExhaustion);
      fmt.keyValue('Hub Discovery', config.hubDiscoveryPerBatch);
    }
    return;
  }

  // Load dependencies
  const Database = require('better-sqlite3');
  const { CrawlOperations } = require('../src/core/crawler/CrawlOperations');
  const { createMultiModalCrawl, MultiModalCrawlManager } = require('../src/core/crawler/multimodal');

  // Connect to database
  const dbPath = path.join(__dirname, '../data/news.db');
  const db = new Database(dbPath);

  // Create crawl operations facade
  const crawlOperations = new CrawlOperations({
    logger: activeLogger
  });

  const domainsToRun = domainsList.length ? domainsList : [domain];
  const runMultiple = domainsToRun.length > 1;

  // Handle graceful shutdown
  let shuttingDown = false;
  let activeManager = null;
  let activeOrchestrator = null;
  let statusTimer = null;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n⏹️  Stopping gracefully...');
    if (statusTimer) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
    if (activeManager) {
      activeManager.stop();
    } else if (activeOrchestrator) {
      activeOrchestrator.stop();
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (!args.json) {
    fmt.header('Multi-Modal Intelligent Crawl');
    fmt.keyValue('Domains', domainsToRun.join(', '));
    if (runMultiple) fmt.keyValue('Max Parallel', args['max-parallel']);
    fmt.keyValue('Batch Size', config.batchSize);
    fmt.keyValue('Strategy', config.balancingStrategy);
    fmt.keyValue('Historical Ratio', `${(config.historicalRatio * 100).toFixed(0)}%`);
    if (statusIntervalSec > 0) {
      fmt.keyValue('Status Interval', `${statusIntervalSec}s`);
    }
    console.log();
  }

  const formatStatsLine = (stats) => {
    if (!stats) return null;
    const domainLabel = stats.domain ? `[${stats.domain}] ` : '';
    const phase = stats.phase || 'running';
    const batch = Number.isFinite(stats.batchNumber) ? stats.batchNumber : 0;
    const downloaded = Number.isFinite(stats.totalPagesDownloaded) ? stats.totalPagesDownloaded : 0;
    const analyzed = Number.isFinite(stats.totalPagesAnalyzed) ? stats.totalPagesAnalyzed : 0;
    const patterns = Number.isFinite(stats.totalPatternsLearned) ? stats.totalPatternsLearned : 0;
    const hubs = Number.isFinite(stats.totalHubsDiscovered) ? stats.totalHubsDiscovered : 0;
    return `${domainLabel}${phase} batch ${batch} · dl ${downloaded} · analyzed ${analyzed} · patterns ${patterns} · hubs ${hubs}`;
  };

  const startStatusTimer = (getStats) => {
    if (!statusIntervalMs || args.json) return null;
    const report = () => {
      const stats = getStats();
      if (Array.isArray(stats)) {
        stats.forEach((entry) => {
          const line = formatStatsLine(entry?.stats || entry);
          if (line) console.log(line);
        });
      } else {
        const line = formatStatsLine(stats);
        if (line) console.log(line);
      }
    };
    report();
    return setInterval(report, statusIntervalMs);
  };

  try {
    if (runMultiple) {
      const manager = new MultiModalCrawlManager({
        maxParallel: args['max-parallel'],
        logger: activeLogger,
        createOrchestrator: (overrides = {}) => createMultiModalCrawl({
          db,
          crawlOperations,
          config: { ...config, ...overrides },
          logger: activeLogger
        })
      });

      activeManager = manager;
      statusTimer = startStatusTimer(() => manager.getSessionStats());

      if (allowLogs) {
        manager.on('phase-change', ({ domain: d, from, to, batch }) => {
          if (showVerboseLogs) {
            console.log(`  [${d}] Phase ${from} → ${to} (batch ${batch})`);
          }
        });

        manager.on('batch-complete', ({ domain: d, batch, pagesDownloaded, patternsLearned }) => {
          if (showBatchLogs) {
            console.log(`✓ [${d}] Batch ${batch}: ${pagesDownloaded} pages, ${patternsLearned} patterns`);
          }
        });

        manager.on('pattern-learned', ({ domain: d, patternsLearned }) => {
          if (showVerboseLogs) {
            console.log(`  🧠 [${d}] Learned ${patternsLearned} new patterns`);
          }
        });

        manager.on('hub-discovered', ({ domain: d, hubsDiscovered }) => {
          if (showVerboseLogs) {
            console.log(`  🔍 [${d}] Discovered ${hubsDiscovered} new hubs`);
          }
        });

        manager.on('reanalysis-triggered', ({ domain: d, pageCount, reason }) => {
          if (showVerboseLogs) {
            console.log(`  ♻️  [${d}] Re-analyzing ${pageCount} pages (${reason})`);
          }
        });

        manager.on('error', ({ domain: d, error: err }) => {
          console.error(`  ❌ [${d}] Error: ${err}`);
        });
      }

      const results = await manager.start(domainsToRun, config, { maxParallel: args['max-parallel'] });

      if (args.json) {
        console.log(JSON.stringify({ results }, null, 2));
      } else {
        console.log();
        fmt.header('Final Statistics');
        results.forEach((stats) => {
          if (!stats || stats.error) {
            fmt.keyValue(stats.domain || 'unknown', stats.error || 'error');
            return;
          }
          fmt.keyValue(`${stats.domain} Session ID`, stats.sessionId);
          fmt.keyValue(`${stats.domain} Runtime`, stats.runtimeFormatted);
          fmt.keyValue(`${stats.domain} Batches`, stats.batchNumber);
          fmt.keyValue(`${stats.domain} Pages Downloaded`, stats.totalPagesDownloaded);
          fmt.keyValue(`${stats.domain} Pages Analyzed`, stats.totalPagesAnalyzed);
          fmt.keyValue(`${stats.domain} Patterns Learned`, stats.totalPatternsLearned);
          fmt.keyValue(`${stats.domain} Hubs Discovered`, stats.totalHubsDiscovered);
          fmt.keyValue(`${stats.domain} Pages Re-analyzed`, stats.totalReanalyzed);
          fmt.keyValue(`${stats.domain} Pages/Minute`, stats.pagesPerMinute);
        });
      }
    } else {
      const { orchestrator } = createMultiModalCrawl({
        db,
        crawlOperations,
        config,
        logger: activeLogger
      });

      activeOrchestrator = orchestrator;
      statusTimer = startStatusTimer(() => orchestrator.getStatistics());

      if (allowLogs) {
        orchestrator.on('phase-change', ({ from, to, batch }) => {
          if (showVerboseLogs) {
            console.log(`  [Phase] ${from} → ${to} (batch ${batch})`);
          }
        });

        orchestrator.on('batch-complete', ({ batch, pagesDownloaded, patternsLearned }) => {
          if (showBatchLogs) {
            console.log(`✓ Batch ${batch}: ${pagesDownloaded} pages, ${patternsLearned} patterns`);
          }
        });

        orchestrator.on('pattern-learned', ({ batch, patternsLearned }) => {
          if (showVerboseLogs) {
            console.log(`  🧠 Learned ${patternsLearned} new patterns in batch ${batch}`);
          }
        });

        orchestrator.on('hub-discovered', ({ batch, hubsDiscovered }) => {
          if (showVerboseLogs) {
            console.log(`  🔍 Discovered ${hubsDiscovered} new hubs in batch ${batch}`);
          }
        });

        orchestrator.on('reanalysis-triggered', ({ batch, pageCount, reason }) => {
          if (showVerboseLogs) {
            console.log(`  ♻️  Re-analyzing ${pageCount} pages (${reason})`);
          }
        });

        orchestrator.on('error', (error) => {
          console.error(`  ❌ Error: ${error.message}`);
        });
      }

      const stats = await orchestrator.start(domainsToRun[0], config);

      if (args.json) {
        console.log(JSON.stringify(stats, null, 2));
      } else {
        console.log();
        fmt.header('Final Statistics');
        fmt.keyValue('Session ID', stats.sessionId);
        fmt.keyValue('Runtime', stats.runtimeFormatted);
        fmt.keyValue('Batches', stats.batchNumber);
        fmt.keyValue('Pages Downloaded', stats.totalPagesDownloaded);
        fmt.keyValue('Pages Analyzed', stats.totalPagesAnalyzed);
        fmt.keyValue('Patterns Learned', stats.totalPatternsLearned);
        fmt.keyValue('Hubs Discovered', stats.totalHubsDiscovered);
        fmt.keyValue('Pages Re-analyzed', stats.totalReanalyzed);
        fmt.keyValue('Pages/Minute', stats.pagesPerMinute);
      }
    }
  } catch (error) {
    if (args.json) {
      console.log(JSON.stringify({ error: error.message }, null, 2));
    } else {
      fmt.error(`Crawl failed: ${error.message}`);
      if (args.verbose) {
        console.error(error.stack);
      }
    }
    process.exit(1);
  } finally {
    if (statusTimer) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
    db.close();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
