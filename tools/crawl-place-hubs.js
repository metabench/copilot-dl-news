#!/usr/bin/env node

/**
 * crawl-place-hubs - Crawl place hub URLs to a specified depth
 *
 * Usage:
 *   node tools/crawl-place-hubs.js [--depth N] [--concurrency N] [--max-pages N] [--host HOST]
 *
 * Options:
 *   --depth N          Maximum depth to crawl into each place hub (default: 1)
 *   --concurrency N    Number of parallel downloads (default: 1)
 *   --max-pages N      Maximum total pages to download (default: unlimited)
 *   --host HOST        Only crawl place hubs from this host (default: all hosts)
 *   --verbose          Show detailed output
 *
 * This tool crawls all discovered place hub URLs, using the depth parameter
 * to control how many pages deep to crawl into each hub.
 */

const NewsCrawler = require('../src/crawl.js');
const fs = require('fs');
const path = require('path');
const { ensureDatabase } = require('../src/db/sqlite');
const { sleep, nowMs } = require('../src/crawler/utils');

// Logging utilities (copied from NewsCrawler)
const chalk = require('chalk');

const CLI_COLORS = Object.freeze({
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
  progress: chalk.cyan,
  muted: chalk.gray,
  neutral: chalk.white,
  accent: chalk.magenta,
  dim: chalk.dim
});

const CLI_ICONS = Object.freeze({
  info: 'ℹ',
  success: '✓',
  warning: '⚠',
  error: '✖',
  progress: '⚙',
  pending: '⏳',
  complete: '✅',
  geography: '🌍',
  schema: '🗂',
  compass: '🧭',
  features: '🧠',
  stageCountries: '🌐',
  stageRegions: '🗺️',
  stageCities: '🏙️',
  stageBoundaries: '🛡️',
  summary: '📊',
  idle: '○',
  bullet: '•',
  debug: '…'
});

const log = {
  success: (msg) => console.log(CLI_COLORS.success(CLI_ICONS.success), msg),
  error: (msg) => console.log(CLI_COLORS.error(CLI_ICONS.error), msg),
  warn: (msg) => console.log(CLI_COLORS.warning(CLI_ICONS.warning), msg),
  info: (msg) => console.log(CLI_COLORS.info(CLI_ICONS.info), msg),
  progress: (stage, current, total, details = '') => {
    const pct = Math.round((current / total) * 100);
    const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
    const detailText = details ? CLI_COLORS.muted(` ${details}`) : '';
    console.log(CLI_COLORS.progress(`[${bar}] ${pct}% ${stage}`) + detailText);
  },
  stat: (label, value) => console.log(CLI_COLORS.muted(`${label}:`), CLI_COLORS.neutral(value)),
  debug: (...args) => VERBOSE_MODE && console.error(CLI_COLORS.dim('[DEBUG]'), ...args)
};

// Global verbose flag (set by CLI argument)
let VERBOSE_MODE = false;

// Check for help flag first
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Crawl Place Hubs Tool

Crawls all discovered place hub URLs to a specified depth.

USAGE:
  node tools/crawl-place-hubs.js [options]

OPTIONS:
  --help, -h              Show this help message
  --depth N               Maximum depth to crawl into each hub (default: 1)
  --concurrency N         Number of parallel downloads (default: 1)
  --max-pages N           Maximum total pages to download (default: unlimited)
  --host HOST             Only crawl hubs from this host (e.g., 'www.theguardian.com')
  --verbose               Show detailed output

EXAMPLES:
  node tools/crawl-place-hubs.js                                    # Crawl all hubs to depth 1
  node tools/crawl-place-hubs.js --depth 2 --concurrency 3         # Deeper crawl with parallelism
  node tools/crawl-place-hubs.js --host www.theguardian.com        # Only Guardian hubs
  node tools/crawl-place-hubs.js --max-pages 100 --verbose         # Limited pages with details

The tool automatically discovers place hubs from the database and crawls each one
to the specified depth, respecting robots.txt and rate limits.
`);
  process.exit(0);
}

// Parse command line arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');

// Set global verbose flag
VERBOSE_MODE = verbose;

// Parse --depth parameter
let depth = 1;
const depthIndex = args.indexOf('--depth');
if (depthIndex !== -1 && args[depthIndex + 1]) {
  depth = parseInt(args[depthIndex + 1], 10);
  if (isNaN(depth) || depth < 0) {
    console.error('Error: --depth must be a non-negative integer');
    process.exit(1);
  }
}

// Parse --concurrency parameter
let concurrency = 1;
const concurrencyIndex = args.indexOf('--concurrency');
if (concurrencyIndex !== -1 && args[concurrencyIndex + 1]) {
  concurrency = parseInt(args[concurrencyIndex + 1], 10);
  if (isNaN(concurrency) || concurrency < 1) {
    console.error('Error: --concurrency must be a positive integer');
    process.exit(1);
  }
}

// Parse --max-pages parameter
let maxPages = undefined;
const maxPagesIndex = args.indexOf('--max-pages');
if (maxPagesIndex !== -1 && args[maxPagesIndex + 1]) {
  maxPages = parseInt(args[maxPagesIndex + 1], 10);
  if (isNaN(maxPages) || maxPages < 1) {
    console.error('Error: --max-pages must be a positive integer');
    process.exit(1);
  }
}

// Parse --host parameter
let targetHost = undefined;
const hostIndex = args.indexOf('--host');
if (hostIndex !== -1 && args[hostIndex + 1]) {
  targetHost = args[hostIndex + 1];
}

// Initialize database
const dbPath = path.join(__dirname, '..', 'data', 'news.db');
const db = ensureDatabase(dbPath);

// Get place hub URLs from database
let query = `
  SELECT url, host, place_slug, title
  FROM place_hubs
  WHERE 1=1
`;
const params = [];

if (targetHost) {
  query += ' AND host = ?';
  params.push(targetHost);
}

query += ' ORDER BY host, place_slug';

const placeHubs = db.prepare(query).all(...params);

if (placeHubs.length === 0) {
  console.log('No place hubs found in database');
  if (targetHost) {
    console.log(`Try removing --host ${targetHost} to crawl all hosts`);
  }
  process.exit(0);
}

console.log(`Found ${placeHubs.length} place hub${placeHubs.length === 1 ? '' : 's'} to crawl`);
if (targetHost) {
  console.log(`Host filter: ${targetHost}`);
}
console.log(`Crawl depth: ${depth}`);
console.log(`Concurrency: ${concurrency}`);
if (maxPages) {
  console.log(`Max pages: ${maxPages}`);
}
console.log('---');

// Create a virtual start URL that will seed all place hubs
const virtualStartUrl = 'https://place-hubs-crawl.local/virtual-start';

// Create crawler with place-hubs crawl type
const crawler = new NewsCrawler(virtualStartUrl, {
  crawlType: 'place-hubs',
  concurrency,
  maxDepth: depth,
  maxDownloads: maxPages,
  enableDb: true,
  useSitemap: false,
  preferCache: true,
  placeHubs: placeHubs, // Pass the place hubs data
  verbose
});

// Override domain filtering for place-hubs crawl type to allow all domains
if (crawler.crawlType === 'place-hubs') {
  crawler.isOnDomain = (url) => true; // Allow all domains for place-hubs
}

// Override the seeding logic to use our place hubs instead of the virtual URL
const originalInit = crawler.init.bind(crawler);
crawler.init = async function() {
  await originalInit();

  // The original init enqueued the virtual start URL. Remove it and seed with place hubs.
  console.log('Replacing virtual start URL with place hub URLs...');

  // Clear the queue (removes the virtual URL)
  if (this.queue && typeof this.queue.clear === 'function') {
    this.queue.clear();
  }

  // Seed with actual place hubs
  console.log('Seeding crawl with place hub URLs...');
  for (const hub of placeHubs) {
    this.enqueueRequest({
      url: hub.url,
      depth: 0,
      type: 'hub-seed',
      meta: {
        placeHub: true,
        placeSlug: hub.place_slug,
        host: hub.host
      }
    });
  }

  console.log(`Seeded ${placeHubs.length} place hub URLs`);
  // Don't call _markStartupComplete here - the original init already did it
};

// Override the crawl method to prevent re-enqueuing the start URL
const originalCrawl = crawler.crawl.bind(crawler);
crawler.crawl = async function() {
  if (this.isGazetteerMode) {
    return this.crawlConcurrent();
  }
  if (this.usePriorityQueue) {
    return this.crawlConcurrent();
  }
  await this.init();

  // Skip the start URL enqueuing for place-hubs crawl type
  if (this.crawlType === 'place-hubs') {
    // Start URL already replaced in init override above
    this._markStartupComplete();
  } else {
    // Original behavior for other crawl types
    this.enqueueRequest({
      url: this.startUrl,
      depth: 0,
      type: 'nav'
    });
    this._markStartupComplete();
  }

  // Rest of the crawl logic...
  while (true) {
    if (this.isAbortRequested()) {
      break;
    }
    // honor pause
    while (this.isPaused() && !this.isAbortRequested()) {
      await sleep(200);
      this.emitProgress();
    }
    if (this.isAbortRequested()) {
      break;
    }
    // Stop if we've reached the download limit
    if (this.maxDownloads !== undefined && this.stats.pagesDownloaded >= this.maxDownloads) {
      console.log(`Reached max downloads limit: ${this.maxDownloads}`);
      break;
    }
    const pick = await this._pullNextWorkItem();
    if (this.isAbortRequested()) {
      break;
    }
    const now = nowMs();
    if (!pick || !pick.item) {
      const queueSize = this.queue.size();
      if (queueSize === 0 && !this.isPaused()) {
        break;
      }
      const wakeTarget = pick && pick.wakeAt ? Math.max(0, pick.wakeAt - now) : (this.rateLimitMs || 100);
      const waitMs = Math.min(Math.max(wakeTarget, 50), 1000);
      await sleep(waitMs);
      continue;
    }

    const item = pick.item;
    const extraCtx = pick.context || {};
    try {
      const host = this._safeHostFromUrl(item.url);
      this.telemetry.queueEvent({
        action: 'dequeued',
        url: item.url,
        depth: item.depth,
        host,
        queueSize: this.queue.size()
      });
    } catch (_) {}

    const processContext = {
      type: item.type,
      allowRevisit: item.allowRevisit
    };
    if (extraCtx && extraCtx.forceCache) {
      processContext.forceCache = true;
      if (extraCtx.cachedPage) processContext.cachedPage = extraCtx.cachedPage;
      if (extraCtx.rateLimitedHost) processContext.rateLimitedHost = extraCtx.rateLimitedHost;
    }

    await this.processPage(item.url, item.depth, processContext);
    if (this.isAbortRequested()) {
      break;
    }

    if (this.stats.pagesVisited % 10 === 0) {
      // Suppressed: too verbose for CLI
    }
  }

  const outcomeErr = this._determineOutcomeError();
  if (outcomeErr) {
    log.error(`Crawl ended: ${outcomeErr.message}`);
  } else {
    log.success('Crawl completed');
  }
  log.stat('Pages visited', this.stats.pagesVisited);
  log.stat('Pages downloaded', this.stats.pagesDownloaded);
  log.stat('Articles found', this.stats.articlesFound);
  log.stat('Articles saved', this.stats.articlesSaved);
  this.emitProgress(true);
  this.milestoneTracker.emitCompletionMilestone({
    outcomeErr
  });

  if (this.dbAdapter && this.dbAdapter.isEnabled()) {
    const count = this.dbAdapter.getArticleCount();
    log.stat('Database articles', count);
    this.dbAdapter.close();
  }

  // Cleanup enhanced features
  this._cleanupEnhancedFeatures();

  if (outcomeErr) {
    if (!outcomeErr.details) outcomeErr.details = {};
    if (!outcomeErr.details.stats) outcomeErr.details.stats = {
      ...this.stats
    };
    throw outcomeErr;
  }
};

// Start the crawl
crawler.crawl()
  .then(() => {
    console.log('✓ Place hubs crawl completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('✗ Place hubs crawl failed:', error.message);
    process.exit(1);
  });