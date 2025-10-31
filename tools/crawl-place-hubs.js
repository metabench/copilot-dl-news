#!/usr/bin/env node
'use strict';

const path = require('path');
const NewsCrawler = require('../src/crawl.js');
const { ensureDb } = require('../src/db/sqlite');
const { CliFormatter } = require('../src/utils/CliFormatter');
const { CliArgumentParser } = require('../src/utils/CliArgumentParser');
const { findProjectRoot } = require('../src/utils/project-root');
const { sleep, nowMs } = require('../src/crawler/utils');
const { createCrawlPlaceHubsQueries } = require('../src/db/sqlite/v1/queries/placeHubs.crawlTool');

const VIRTUAL_START_URL = 'https://place-hubs-crawl.local/virtual-start';
const fmt = new CliFormatter();

function parseCliArgs(argv) {
  const parser = new CliArgumentParser(
    'crawl-place-hubs',
    'Crawl discovered place hub URLs to a specified depth'
  );

  parser
    .add('--db <path>', 'Path to news SQLite database', 'data/news.db')
    .add('--depth <number>', 'Maximum crawl depth per hub', 1, 'number')
    .add('--concurrency <number>', 'Number of parallel downloads', 1, 'number')
    .add(
      '--max-pages <number>',
      'Maximum total pages to download (positive integer, omit for unlimited)',
      undefined,
      'number'
    )
    .add('--host <value>', 'Only crawl place hubs from this host')
    .add('--verbose', 'Enable verbose crawler output', false, 'boolean')
    .add('--summary-format <mode>', 'Summary output format: ascii | json', 'ascii')
    .add('--quiet', 'Suppress formatted summary output (JSON only)', false, 'boolean');

  return parser.parse(argv);
}

function normalizeOptions(rawArgs) {
  const projectRoot = findProjectRoot(__dirname);
  const dbOption = rawArgs.db || 'data/news.db';
  const dbPath = path.isAbsolute(dbOption) ? dbOption : path.join(projectRoot, dbOption);

  const depthRaw = Number.isFinite(rawArgs.depth) ? rawArgs.depth : 1;
  const depth = Math.max(0, Math.trunc(depthRaw));

  const concurrencyRaw = Number.isFinite(rawArgs.concurrency) ? rawArgs.concurrency : 1;
  const concurrency = Math.max(1, Math.trunc(concurrencyRaw));

  let maxPages;
  if (rawArgs.maxPages === undefined || rawArgs.maxPages === null) {
    maxPages = undefined;
  } else {
    const parsedMaxPages = Math.trunc(rawArgs.maxPages);
    if (!Number.isFinite(parsedMaxPages) || parsedMaxPages <= 0) {
      throw new Error('--max-pages must be a positive integer');
    }
    maxPages = parsedMaxPages;
  }

  const host = typeof rawArgs.host === 'string' && rawArgs.host.trim().length
    ? rawArgs.host.trim()
    : undefined;

  const summaryFormat = typeof rawArgs.summaryFormat === 'string'
    ? rawArgs.summaryFormat.trim().toLowerCase()
    : 'ascii';
  if (!['ascii', 'json'].includes(summaryFormat)) {
    throw new Error(`Unsupported summary format: ${rawArgs.summaryFormat}`);
  }

  const quiet = Boolean(rawArgs.quiet);
  if (quiet && summaryFormat !== 'json') {
    throw new Error('--quiet requires --summary-format json');
  }

  return {
    dbPath,
    depth,
    concurrency,
    maxPages,
    host,
    verbose: Boolean(rawArgs.verbose),
    summaryFormat,
    quiet
  };
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'n/a';
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)} s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds - minutes * 60;
  return `${minutes}m ${remainingSeconds.toFixed(1)}s`;
}

function loadPlaceHubs(dbPath, host) {
  let db;
  try {
    db = ensureDb(dbPath);
  } catch (error) {
    throw new Error(`Failed to open database: ${error.message || error}`);
  }

  try {
    const queries = createCrawlPlaceHubsQueries(db);
    return queries.listPlaceHubs({ host });
  } finally {
    try { db.close(); } catch (_) {}
  }
}

function createCrawler(placeHubs, options) {
  const crawler = new NewsCrawler(VIRTUAL_START_URL, {
    crawlType: 'place-hubs',
    concurrency: options.concurrency,
    maxDepth: options.depth,
    maxDownloads: options.maxPages,
    enableDb: true,
    useSitemap: false,
    preferCache: true,
    placeHubs,
    verbose: options.verbose
  });

  crawler.__articleCount = null;

  if (crawler.crawlType === 'place-hubs') {
    crawler.isOnDomain = () => true;
  }

  const originalInit = crawler.init.bind(crawler);
  crawler.init = async function initOverride() {
    await originalInit();

    if (this.queue && typeof this.queue.clear === 'function') {
      this.queue.clear();
    }

    if (!options.quiet) {
      fmt.info('Seeding crawl with place hub URLs...');
    }

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

    if (!options.quiet) {
      fmt.success(`Seeded ${placeHubs.length} place hub${placeHubs.length === 1 ? '' : 's'}`);
    }
  };

  const originalCrawl = crawler.crawl.bind(crawler);
  crawler.crawl = async function crawlOverride() {
    if (this.isGazetteerMode || this.usePriorityQueue) {
      return originalCrawl();
    }

    await this.init();

    if (this.crawlType === 'place-hubs') {
      this._markStartupComplete();
    } else {
      this.enqueueRequest({
        url: this.startUrl,
        depth: 0,
        type: 'nav'
      });
      this._markStartupComplete();
    }

    while (true) {
      if (this.isAbortRequested()) {
        break;
      }

      while (this.isPaused() && !this.isAbortRequested()) {
        await sleep(200);
        this.emitProgress();
      }

      if (this.isAbortRequested()) {
        break;
      }

      if (this.maxDownloads !== undefined && this.stats.pagesDownloaded >= this.maxDownloads) {
        if (!options.quiet) {
          fmt.warn(`Reached max downloads limit: ${this.maxDownloads}`);
        }
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

      if (this.stats.pagesVisited % 10 === 0 && !options.quiet && options.verbose) {
        fmt.info(`Visited ${this.stats.pagesVisited} pages`);
      }
    }

    const outcomeErr = this._determineOutcomeError();

    this.emitProgress(true);
    this.milestoneTracker.emitCompletionMilestone({ outcomeErr });

    if (this.dbAdapter && this.dbAdapter.isEnabled()) {
      try {
        crawler.__articleCount = this.dbAdapter.getArticleCount();
      } catch (_) {
        crawler.__articleCount = null;
      }
      try {
        this.dbAdapter.close();
      } catch (_) {}
    }

    this._cleanupEnhancedFeatures();

    if (outcomeErr) {
      outcomeErr.details = outcomeErr.details || {};
      if (!outcomeErr.details.stats) {
        outcomeErr.details.stats = { ...this.stats };
      }
      if (crawler.__articleCount != null && !outcomeErr.details.articleCount) {
        outcomeErr.details.articleCount = crawler.__articleCount;
      }
      throw outcomeErr;
    }

    if (!options.quiet) {
      fmt.success('Crawl completed');
    }

    return this.stats;
  };

  return crawler;
}

async function run(argv) {
  let rawArgs;
  try {
    rawArgs = parseCliArgs(argv);
  } catch (error) {
    fmt.error(error && error.message ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  let options;
  try {
    options = normalizeOptions(rawArgs);
  } catch (error) {
    fmt.error(error && error.message ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  let placeHubs;
  try {
    placeHubs = loadPlaceHubs(options.dbPath, options.host);
  } catch (error) {
    fmt.error(error && error.message ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  if (placeHubs.length === 0) {
    if (!options.quiet) {
      fmt.warn('No place hubs found in database');
      if (options.host) {
        fmt.info(`Try removing --host ${options.host} to crawl all hosts`);
      }
    }
    return;
  }

  const showAsciiSummary = options.summaryFormat === 'ascii' && !options.quiet;

  if (showAsciiSummary) {
    fmt.header('Place Hub Crawl');
    fmt.section('Configuration');
    fmt.stat('Database path', options.dbPath);
    fmt.stat('Depth', options.depth, 'number');
    fmt.stat('Concurrency', options.concurrency, 'number');
    fmt.stat('Max pages', options.maxPages ?? 'unlimited (default)');
    fmt.stat('Host filter', options.host ?? 'none');
    fmt.stat('Verbose mode', options.verbose ? 'enabled' : 'disabled');

    fmt.section('Discovery');
    fmt.stat('Place hubs to crawl', placeHubs.length, 'number');
  } else if (!options.quiet) {
    fmt.info(`Crawling ${placeHubs.length} place hub${placeHubs.length === 1 ? '' : 's'}`);
  }

  const crawler = createCrawler(placeHubs, options);

  const startedAt = Date.now();
  try {
    await crawler.crawl();
    const finishedAt = Date.now();
    const durationMs = finishedAt - startedAt;

    const stats = crawler.stats || {
      pagesVisited: 0,
      pagesDownloaded: 0,
      articlesFound: 0,
      articlesSaved: 0
    };

    const payload = {
      status: 'ok',
      config: {
        dbPath: options.dbPath,
        depth: options.depth,
        concurrency: options.concurrency,
        maxPages: options.maxPages ?? null,
        host: options.host ?? null,
        verbose: options.verbose
      },
      counts: {
        placeHubs: placeHubs.length,
        databaseArticles: crawler.__articleCount
      },
      stats: {
        pagesVisited: stats.pagesVisited,
        pagesDownloaded: stats.pagesDownloaded,
        articlesFound: stats.articlesFound,
        articlesSaved: stats.articlesSaved
      },
      timings: {
        durationMs
      },
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString()
    };

    if (options.summaryFormat === 'json') {
      if (options.quiet) {
        console.log(JSON.stringify(payload));
      } else {
        console.log(JSON.stringify(payload, null, 2));
      }
      return;
    }

    if (!options.quiet) {
      fmt.section('Results');
      fmt.stat('Pages visited', payload.stats.pagesVisited, 'number');
      fmt.stat('Pages downloaded', payload.stats.pagesDownloaded, 'number');
      fmt.stat('Articles found', payload.stats.articlesFound, 'number');
      fmt.stat('Articles saved', payload.stats.articlesSaved, 'number');
      if (payload.counts.databaseArticles != null) {
        fmt.stat('Database articles', payload.counts.databaseArticles, 'number');
      }
      fmt.stat('Duration', formatDuration(durationMs));
      fmt.success('Place hub crawl completed');
      fmt.footer();
    }
  } catch (error) {
    const finishedAt = Date.now();
    const durationMs = finishedAt - startedAt;
    const message = error && error.message ? error.message : String(error);
    const stats = crawler.stats || {
      pagesVisited: 0,
      pagesDownloaded: 0,
      articlesFound: 0,
      articlesSaved: 0
    };

    const payload = {
      status: 'error',
      error: message,
      config: {
        dbPath: options.dbPath,
        depth: options.depth,
        concurrency: options.concurrency,
        maxPages: options.maxPages ?? null,
        host: options.host ?? null,
        verbose: options.verbose
      },
      counts: {
        placeHubs: placeHubs.length,
        databaseArticles: crawler.__articleCount
      },
      stats: {
        pagesVisited: stats.pagesVisited,
        pagesDownloaded: stats.pagesDownloaded,
        articlesFound: stats.articlesFound,
        articlesSaved: stats.articlesSaved
      },
      timings: {
        durationMs
      },
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString()
    };

    if (options.summaryFormat === 'json') {
      if (options.quiet) {
        console.log(JSON.stringify(payload));
      } else {
        console.log(JSON.stringify(payload, null, 2));
      }
    } else if (!options.quiet) {
      fmt.error(`Place hub crawl failed: ${message}`);
      fmt.section('Partial Results');
      fmt.stat('Pages visited', payload.stats.pagesVisited, 'number');
      fmt.stat('Pages downloaded', payload.stats.pagesDownloaded, 'number');
      fmt.stat('Articles found', payload.stats.articlesFound, 'number');
      fmt.stat('Articles saved', payload.stats.articlesSaved, 'number');
      fmt.stat('Duration', formatDuration(durationMs));
      fmt.footer();
    } else {
      fmt.error(`Place hub crawl failed: ${message}`);
    }

    process.exitCode = 1;
  }
}

if (require.main === module) {
  run(process.argv).catch((error) => {
    const message = error && error.message ? error.message : String(error);
    fmt.error(message);
    process.exitCode = 1;
  });
}