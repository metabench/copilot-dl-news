'use strict';

const { createPauseResumeControls } = require('./pauseControls');

const chalk = require('chalk');
const path = require('path');
const NewsCrawler = require('../NewsCrawler');
const ProcessStatus = require('../../../shared/utils/processStatus');

const { ensureDatabase } = require('../../../data/db/sqlite');
const { createCliLogger } = require('./progressReporter');
const { setupLegacyCliEnvironment } = require('./bootstrap');
const { normalizeLegacyArguments } = require('./argumentNormalizer');

const HELP_TEXT = `
News Crawl CLI

Usage:
  node src/crawl.js [options] [start-url]

If no start URL is provided, the crawler defaults to https://www.theguardian.com for web crawls
and uses an internal placeholder for geography/gazetteer runs.

Core modes:
  --crawl-type=news (default)         Standard intelligent news crawl
  --crawl-type=intelligent            Enables opportunistic hub planner
  --crawl-type=discover-structure     Focus on hub discovery without article storage
  --crawl-type=geography              Gazetteer ingestion (countries → regions → cities → boundaries)
  --crawl-type=gazetteer              Alias for geography
  --crawl-type=wikidata               Wikidata-powered geography bootstrap

Primary options:
  --depth=<n>                         Maximum link depth to follow (default 2; ignored for geography modes)
  --max-pages=<n>                     Hard cap on pages/downloads for this run
  --max-age=<seconds|m|h|d>           Refetch content older than the given age (alias: --refetch-if-older-than)
  --max-age-article=<age>             Refetch threshold specifically for article pages
  --max-age-hub=<age>                 Refetch threshold for hub/index pages (default 10 minutes)
  --seed-from-cache                   Serve the start URL from cache when available
  --cached-seed=<url>                 Queue cached URLs as additional seeds (repeat flag per URL)
  --max-queue=<n>                     Limit in-flight queue size before backpressure
  --concurrency=<n>                   Parallel downloads (treated as max for geography modes)
  --rate-limit-ms=<n>                 Minimum delay between requests in milliseconds
  --request-timeout-ms=<n>            HTTP request timeout in milliseconds
  --pacer-jitter-min-ms=<n>           Randomized pacing: minimum jitter window
  --pacer-jitter-max-ms=<n>           Randomized pacing: maximum jitter window
  --fast-start / --no-fast-start      Toggle startup optimizations (default: fast start enabled)
  --no-sitemap                        Skip sitemap discovery entirely
  --sitemap-only                      Process sitemap URLs without page crawling
  --sitemap-max=<n>                   Cap sitemap URLs ingested this run
  --allow-query-urls                  Permit crawling URLs with query strings (default: skip)
  --verbose                           Show full telemetry, milestones, and debug output

Database controls:
  --db <path> or --db=<path>          Use an explicit SQLite database file
  --newdb                             Create a new data/news_*.db in the working directory
  --no-db                             Disable persistence (in-memory crawl only)

Planner & hub discovery:
  --hub-max-pages=<n>                 Limit article fetches per discovered hub
  --hub-max-days=<n>                  Stop exploring hubs older than n days
  --int-max-seeds=<n>                 Cap initial intelligent planner seeds
  --int-target-hosts=a,b,c            Force planner focus to selected hosts
  --planner-verbosity=<0-3>           Increase intelligent planner logging detail

Geography & gazetteer helpers:
  --country=code[,code]               Restrict geography crawl to specific countries (iso2/iso3/Wikidata QID/name)
  --gazetteer-stages=stage[,stage]    Run only selected stages (countries, adm1, adm2, cities, boundaries)
  --limit-countries=<n>               Stop after ingesting N countries

Miscellaneous:
  --job-id=<id>                       Attach crawl run to an external job identifier
  --max-downloads=<n>                 Alias for --max-pages
  --refetch-article-if-older-than=<age>  Alias for --max-age-article
  --refetch-hub-if-older-than=<age>      Alias for --max-age-hub
  --no-prefer-cache                   Always fetch fresh content (default prefers cached content when possible)
  --interactive-controls              Force-enable pause/resume commands even when stdin is not a TTY
  --no-interactive-controls           Disable pause/resume controls entirely
  --sequence-config=<name>            Execute a sequence defined in configuration files
  --config-host=<host>                Host-specific override when selecting sequence configs
  --config-dir=<path>                 Custom directory for sequence configuration files
  --config-cli=<json>                 JSON object merged into sequence CLI overrides
  --shared-overrides=<json>           JSON object applied to every step in the sequence
  --step-overrides=<json>             JSON object mapping step IDs to per-step overrides
  --continue-on-error                 Continue running sequence steps when failures occur

Examples:
  node src/crawl.js                                   # Intelligent crawl of The Guardian
  node src/crawl.js https://news.example.com --depth=3
  node src/crawl.js --crawl-type=geography --country=GB,IE --limit-countries=1
  node src/crawl.js --crawl-type=intelligent --max-pages=200 --newdb

Use --verbose for rich telemetry and --allow-query-urls to inspect query-string feeds.
`;

function resolveCountryRow(db, statements, spec) {
  if (!spec || typeof spec !== 'object') {
    return null;
  }

  const normalizedCode = spec.code ? String(spec.code).trim().toUpperCase() : null;
  if (normalizedCode) {
    const rowByCode = statements.byCode.get(normalizedCode);
    if (rowByCode) return rowByCode;
  }

  const normalizedQid = spec.qid ? String(spec.qid).trim().toUpperCase() : null;
  if (normalizedQid) {
    const rowByQid = statements.byQid.get(normalizedQid);
    if (rowByQid) return rowByQid;
  }

  const lowerNameCandidates = [];
  if (spec.nameLower) {
    lowerNameCandidates.push(String(spec.nameLower).trim().toLowerCase());
  }
  if (spec.raw) {
    lowerNameCandidates.push(String(spec.raw).trim().toLowerCase());
  }

  for (const candidate of lowerNameCandidates) {
    if (!candidate) continue;
    const rowByName = statements.byName.get(candidate);
    if (rowByName) return rowByName;
  }

  return null;
}

function reportCountryCityCounts(dbPath, countrySpecs, log) {
  if (!countrySpecs || !countrySpecs.length) {
    return;
  }

  let db;
  try {
    db = ensureDatabase(dbPath);
  } catch (err) {
    log.warn(`[GAZETTEER] Unable to open database for city counts: ${err.message}`);
    return;
  }

  try {
    const statements = {
      byCode: db.prepare(`
        SELECT p.country_code AS code,
               COALESCE(pn.name, p.country_code) AS name
        FROM places p
        LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
        WHERE p.kind = 'country'
          AND p.country_code = ?
        LIMIT 1
      `),
      byQid: db.prepare(`
        SELECT p.country_code AS code,
               COALESCE(pn.name, p.country_code) AS name
        FROM places p
        LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
        WHERE p.kind = 'country'
          AND p.wikidata_qid = ?
        LIMIT 1
      `),
      byName: db.prepare(`
        SELECT p.country_code AS code,
               COALESCE(pn.name, p.country_code) AS name
        FROM places p
        LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
        WHERE p.kind = 'country'
          AND pn.name IS NOT NULL
          AND LOWER(pn.name) = ?
        LIMIT 1
      `),
      cityCount: db.prepare(`
        SELECT COUNT(*) AS count
        FROM places
        WHERE kind = 'city'
          AND status = 'current'
          AND country_code = ?
      `)
    };

    const seenCodes = new Set();
    const pendingReports = [];
    const unresolvedSpecs = new Set();

    for (const spec of countrySpecs) {
      const row = resolveCountryRow(db, statements, spec);
      if (row && row.code) {
        const normalizedCode = String(row.code).toUpperCase();
        if (seenCodes.has(normalizedCode)) {
          continue;
        }
        seenCodes.add(normalizedCode);
        pendingReports.push({
          code: normalizedCode,
          name: row.name || normalizedCode
        });
      } else {
        const label = spec?.raw || spec?.code || spec?.qid || 'unknown';
        unresolvedSpecs.add(label);
      }
    }

    for (const report of pendingReports) {
      const countRow = statements.cityCount.get(report.code);
      const count = countRow?.count || 0;
      const formattedCount = Number.isFinite(count) ? count.toLocaleString('en-US') : '0';
      log.info(`Cities in ${report.name} (${report.code}): ${formattedCount}`);
    }

    if (unresolvedSpecs.size > 0) {
      log.warn(`Could not resolve country specifier(s): ${Array.from(unresolvedSpecs).join(', ')}`);
    }
  } catch (err) {
    log.warn(`[GAZETTEER] Failed to report city counts: ${err.message}`);
  } finally {
    try {
      db.close();
    } catch (_) {}
  }
}

function resolveDbPathFromOptions(options = {}) {
  if (!options || options.enableDb === false) {
    return null;
  }
  if (options.dbPath) {
    return options.dbPath;
  }
  const baseDir = options.dataDir ? path.resolve(options.dataDir) : path.resolve(process.cwd(), 'data');
  return path.join(baseDir, 'news.db');
}

function bindPauseResumeControls(crawler, stdin, { enabled = true, explicit = false, log } = {}) {
  const controller = createPauseResumeControls({
    crawler,
    stdin,
    logger: log
  });

  if (!controller || typeof controller.attach !== 'function') {
    return controller;
  }

  controller.attach({
    enabled,
    explicit
  });

  return controller;
}


async function runLegacyCommand({
  argv = [],
  stdin = process.stdin,
  stdout = console.log,
  stderr = console.error,
  cliMetadata = {}
} = {}) {
  const log = createCliLogger({ stdout, stderr });

  if (argv.includes('--help') || argv.includes('-h')) {
    stdout(HELP_TEXT);
    return { exitCode: 0 };
  }

  const { restoreConsole } = setupLegacyCliEnvironment({ args: argv, log });

  let normalizedArgs;
  try {
    normalizedArgs = normalizeLegacyArguments(argv, { log });
  } catch (error) {
    const message = error?.message || 'Failed to normalize crawl CLI arguments';
    log.error(message);
    if (error?.stack) {
      stderr(error.stack);
    }
    restoreConsole();
    return {
      exitCode: 1,
      error
    };
  }

  const {
    startUrl,
    startUrlExplicit,
    options: crawlerOptions,
    targetCountries,
    sequenceConfig,
    interactiveControls
  } = normalizedArgs;

  if (
    cliMetadata &&
    cliMetadata.origin === 'config' &&
    cliMetadata.configPath &&
    crawlerOptions &&
    crawlerOptions.verbose &&
    typeof log.debug === 'function'
  ) {
    log.debug(`Config arguments loaded from ${cliMetadata.configPath}`);
  }

  if (sequenceConfig) {
    // Initialize process status monitoring for sequence
    const statusId = `crawler-sequence-${process.pid}`;
    const status = new ProcessStatus(statusId, 'Sequence Crawler');
    status.update({
      status: 'starting',
      message: `Starting sequence ${sequenceConfig.name}`,
      metrics: {
        sequence: sequenceConfig.name,
        host: sequenceConfig.configHost
      }
    });

    const resolvedStartForLog = startUrlExplicit ? startUrl : undefined;
    log.info(`Sequence config: ${chalk.bold(sequenceConfig.name)}`);
    if (sequenceConfig.configHost) {
      log.info(`Sequence host: ${sequenceConfig.configHost}`);
    }
    if (resolvedStartForLog) {
      log.info(`CLI start URL: ${chalk.bold(resolvedStartForLog)}`);
    }

    try {
      const sequenceResult = await NewsCrawler.loadAndRunSequence({
        sequenceConfigName: sequenceConfig.name,
        configDir: sequenceConfig.configDir,
        configHost: sequenceConfig.configHost,
        sharedOverrides: sequenceConfig.sharedOverrides,
        stepOverrides: sequenceConfig.stepOverrides,
        continueOnError: sequenceConfig.continueOnError,
        configCliOverrides: sequenceConfig.configCliOverrides,
        startUrl: startUrlExplicit ? startUrl : undefined,
        defaults: crawlerOptions,
        logger: log
      });

      const effectiveStart = sequenceResult.sequenceStartUrl
        || sequenceResult.metadata?.config?.startUrl
        || startUrl;
      log.info(`Sequence start URL: ${chalk.bold(effectiveStart)}`);

      const dbPathForReport = resolveDbPathFromOptions(crawlerOptions);
      if (dbPathForReport) {
        reportCountryCityCounts(dbPathForReport, targetCountries, log);
      }

      log.success('Sequence completed');
      status.complete('Sequence completed');
      return {
        exitCode: 0,
        result: sequenceResult.result,
        metadata: sequenceResult.metadata
      };
    } catch (error) {
      const message = error?.message || 'Sequence execution failed';
      status.error(error);
      log.error(message);
      if (error?.stack) {
        stderr(error.stack);
      }
      return {
        exitCode: 1,
        error
      };
    } finally {
      restoreConsole();
    }
  }

  log.info(`Starting: ${chalk.bold(startUrl)}`);

  const interactiveToggle = interactiveControls || { enabled: true, explicit: false };

  const crawler = new NewsCrawler(startUrl, crawlerOptions || {});

  // Initialize process status monitoring
  const statusId = crawler.jobId ? `crawler-${crawler.jobId}` : `crawler-${process.pid}`;
  const status = new ProcessStatus(statusId, 'News Crawler');
  
  status.update({
    status: 'starting',
    message: `Starting crawl of ${startUrl}`,
    metrics: {
      target: startUrl,
      jobId: crawler.jobId
    }
  });

  crawler.on('progress', (data) => {
    const stats = data.stats || {};
    const isPaused = data.paused;
    
    status.update({
      status: isPaused ? 'paused' : 'running',
      message: isPaused ? 'Paused' : `Crawling ${startUrl}`,
      progress: {
        current: stats.pagesVisited || 0,
        total: crawler.maxDownloads || 0,
        percent: (crawler.maxDownloads && stats.pagesVisited) 
          ? Math.round((stats.pagesVisited / crawler.maxDownloads) * 100) 
          : 0,
        unit: 'pages'
      },
      metrics: {
        downloaded: stats.pagesDownloaded || 0,
        queued: crawler.queue ? crawler.queue.size() : 0,
        errors: stats.errors || 0,
        articles: stats.articlesSaved || 0
      }
    });
  });

  if (crawlerOptions.loggingQueue === false) {
    log.info('Queue logging explicitly disabled');
  }

  let pauseController;

  try {
    pauseController = bindPauseResumeControls(crawler, stdin, {
      enabled: interactiveToggle.enabled !== false,
      explicit: Boolean(interactiveToggle.explicit),
      log
    });

    await crawler.crawl();
    status.complete('Crawl finished successfully');
    reportCountryCityCounts(crawler.dbPath, targetCountries, log);
    log.success('Crawler finished');
    return { exitCode: 0 };
  } catch (error) {
    const message = error?.message || 'Crawler failed';
    status.error(error);
    log.error(`Crawler failed: ${message}`);
    if (error?.stack) {
      stderr(error.stack);
    }
    return {
      exitCode: 1,
      error
    };
  } finally {
    if (pauseController && typeof pauseController.teardown === 'function') {
      pauseController.teardown();
    }
    restoreConsole();
  }
}


module.exports = {
  HELP_TEXT,
  runLegacyCommand
};
