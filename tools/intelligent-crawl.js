#!/usr/bin/env node
'use strict';

/**
 * intelligent-crawl — Run intelligent crawls with hub discovery summaries.
 */

const fs = require('fs');
const path = require('path');
const { CliFormatter } = require('../src/utils/CliFormatter');
const { CliArgumentParser } = require('../src/utils/CliArgumentParser');
const {
  getPriorityConfig,
  getPriorityConfigPath,
  setPriorityConfigProfile
} = require('../src/utils/priorityConfig');

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

const fmt = new CliFormatter();

try {
  if (process.stdout && typeof process.stdout.on === 'function') {
    process.stdout.on('error', (err) => {
      if (err && err.code === 'EPIPE') process.exit(0);
    });
  }
} catch (_) {}

function createParser() {
  const parser = new CliArgumentParser(
    'intelligent-crawl',
    'Run intelligent crawls with hub discovery and verification modes.'
  );

  parser
    .add('--url <url>', 'Override the start URL')
    .add('--verification', 'Run full system verification without crawling', false, 'boolean')
    .add('--quick-verification', 'Run lightweight verification (skip heavy checks)', false, 'boolean')
    .add('--limit <lines>', 'Limit console output to N lines', undefined, 'int')
    .add('--concurrency <count>', 'Crawler concurrency (default: 1)', 1, 'int')
    .add('--max-downloads <count>', 'Maximum number of pages to download', undefined, 'int')
    .add('--hub-exclusive', 'Restrict crawl to hub-only structure mode (no article downloads)', false, 'boolean')
    .add('--verbose', 'Stream full crawler output', false, 'boolean')
    .add('--compact', 'Show compact progress output', false, 'boolean')
    .add('--json', 'Emit JSON summary (alias for --summary-format json)', false, 'boolean')
    .add('--summary-format <mode>', 'Summary format: ascii | json', 'ascii')
    .add('--quiet', 'Suppress ASCII summary and emit JSON only', false, 'boolean')
    .add('--seed-from-cache', 'Process the start URL directly from cache when available', false, 'boolean')
    .add('--cached-seed <url...>', 'Queue cached URLs as additional seeds (space-separated list)', undefined, 'string');

  return parser;
}

function normalizeOptions(rawOptions) {
  const positional = Array.isArray(rawOptions.positional) ? rawOptions.positional : [];
  const positionalUrl = positional.find((value) => typeof value === 'string' && value.startsWith('http')) || null;

  const limit = rawOptions.limit !== undefined ? rawOptions.limit : null;
  if (limit !== null && (!Number.isFinite(limit) || limit < 1)) {
    throw new CliError('The --limit option must be a positive integer.');
  }

  const concurrency = rawOptions.concurrency !== undefined ? rawOptions.concurrency : 1;
  if (!Number.isFinite(concurrency) || concurrency < 1) {
    throw new CliError('The --concurrency option must be a positive integer.');
  }

  const maxDownloads = rawOptions.maxDownloads !== undefined ? rawOptions.maxDownloads : null;
  if (maxDownloads !== null && (!Number.isFinite(maxDownloads) || maxDownloads < 1)) {
    throw new CliError('The --max-downloads option must be a positive integer.');
  }

  let summaryFormat = rawOptions.summaryFormat || 'ascii';
  if (rawOptions.json) {
    summaryFormat = 'json';
  }
  if (typeof summaryFormat === 'string') {
    summaryFormat = summaryFormat.trim().toLowerCase();
  }
  if (!['ascii', 'json'].includes(summaryFormat)) {
    throw new CliError(`Unsupported summary format: ${rawOptions.summaryFormat}`);
  }

  const quiet = Boolean(rawOptions.quiet);
  if (quiet && summaryFormat !== 'json') {
    throw new CliError('Quiet mode requires JSON output. Use --json or --summary-format json.');
  }

  const seedFromCache = Boolean(rawOptions.seedFromCache);
  const cachedSeedInput = rawOptions.cachedSeed;
  const cachedSeedUrls = Array.isArray(cachedSeedInput)
    ? cachedSeedInput
    : (typeof cachedSeedInput === 'string' && cachedSeedInput.length ? [cachedSeedInput] : []);
  const normalizedCachedSeeds = cachedSeedUrls
    .map((value) => typeof value === 'string' ? value.trim() : '')
    .filter((value) => value.length > 0);

  return {
    providedUrl: rawOptions.url || positionalUrl,
    limit,
    concurrency,
    maxDownloads,
    verbose: Boolean(rawOptions.verbose),
    compact: Boolean(rawOptions.compact),
    verification: Boolean(rawOptions.verification),
    quickVerification: Boolean(rawOptions.quickVerification),
    summaryFormat,
    quiet,
    hubExclusive: Boolean(rawOptions.hubExclusive),
    seedFromCache,
    cachedSeedUrls: normalizedCachedSeeds,
    positional,
  };
}

const parser = createParser();
let rawArgs;
try {
  rawArgs = parser.parse(process.argv);
} catch (error) {
  fmt.error(error.message);
  process.exit(1);
}

let options;
try {
  options = normalizeOptions(rawArgs);
} catch (error) {
  if (error instanceof CliError) {
    fmt.error(error.message);
    process.exit(error.exitCode);
  }
  fmt.error(error.message);
  process.exit(1);
}

const shouldStreamOutput = options.summaryFormat === 'ascii' && !options.quiet;
const captureLogsOnly = options.summaryFormat === 'json';
const runLogs = [];
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error
};

const NewsCrawler = require('../src/crawl.js');
const { ensureDatabase } = require('../src/db/sqlite');
const { getAllPlaceNames } = require('../src/db/sqlite/queries/gazetteerPlaceNames');
const { getAllCountries } = require('../src/db/sqlite/queries/gazetteer.places');
const { getTopicTermsForLanguage } = require('../src/db/sqlite/queries/topicKeywords');

// Initialize database for place verification
const dbPath = path.join(__dirname, '..', 'data', 'news.db');
const db = ensureDatabase(dbPath);

// LAZY LOADING: Cache for gazetteer data - load only when needed
let gazetteerCache = {
  placeNames: null,
  allCountries: null,
  newsTopics: null,
  loaded: false
};

// Track discovered hubs throughout the run (place/topic/country)
const discoveredHubs = {
  place: [],
  country: [],
  topic: []
};

// ANSI color helper for console formatting
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

function loadGazetteerData() {
  if (gazetteerCache.loaded) return gazetteerCache;

  console.log('Loading gazetteer data for verification...');
  gazetteerCache.placeNames = getAllPlaceNames(db);
  gazetteerCache.allCountries = getAllCountries(db);
  gazetteerCache.newsTopics = getTopicTermsForLanguage(db, 'en');
  gazetteerCache.loaded = true;

  const countryCount = gazetteerCache.allCountries.length;
  const totalPlaces = gazetteerCache.placeNames.size;

  console.log(`Loaded ${gazetteerCache.placeNames.size} place names for verification`);
  console.log(`🌍 ${countryCount} country hubs available | 🗺️  ${totalPlaces} total place names in gazetteer`);
  console.log(`Loaded ${gazetteerCache.newsTopics.size} topic keywords for verification`);

  return gazetteerCache;
}

// For backward compatibility, expose as direct variables (lazy-loaded)
let placeNames, allCountries, newsTopics;
function ensureGazetteerLoaded() {
  if (!gazetteerCache.loaded) {
    loadGazetteerData();
    placeNames = gazetteerCache.placeNames;
    allCountries = gazetteerCache.allCountries;
    newsTopics = gazetteerCache.newsTopics;
  }
}

const verbose = options.verbose;
const compact = options.compact;
const verification = options.verification;
const quickVerification = options.quickVerification;
const hubExclusiveMode = Boolean(options.hubExclusive);
let outputLimit = options.limit;
let concurrency = options.concurrency;
let maxDownloads = options.maxDownloads;

// Suppress structured output unless in verbose/compact mode
if (shouldStreamOutput && !verbose && !compact) {
  // Track output line count for --limit functionality
  let lineCount = 0;
  let limitReached = false;

  // Preserve originals
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  // Track consecutive non-hub messages to suppress noise
  let consecutiveNonHubMessages = 0;
  const MAX_CONSECUTIVE_NON_HUB = 2;

  const emitLimitMessageAndExit = () => {
    if (!limitReached) {
      limitReached = true;
      originalLog(colorize(`\n[Output limit of ${outputLimit} lines reached - exiting]`, 'gray'));
      originalLog(colorize('[Use --verbose to see all output, or increase --limit]', 'gray'));
    }
    process.exit(0);
  };

  const incrementLineCount = () => {
    if (!outputLimit) {
      return;
    }
    lineCount++;
    if (lineCount >= outputLimit) {
      emitLimitMessageAndExit();
    }
  };

  console.log = function(...logArgs) {
    const str = logArgs[0];

    if (typeof str === 'string') {
      // Show startup messages in gray so they count toward limit
      if (str.startsWith('Loading priority configuration') || str.startsWith('Loading crawl configuration')) {
        originalLog(colorize(str, 'gray'));
        incrementLineCount();
        return;
      }

      // Skip technical system messages
      if (str.startsWith('[schema]') ||
          str.startsWith('SQLite DB initialized') ||
          str.startsWith('Priority config loaded') ||
          str.startsWith('Enhanced features configuration:') ||
          str.startsWith('Enhanced DB adapter') ||
          str.startsWith('Problem resolution service') ||
          str.startsWith('Crawl playbook service') ||
          str.startsWith('Failed to initialize') ||
          str.startsWith('✓ Partial success') ||
          str.startsWith('[NewsDatabase]') ||
          str.startsWith('Loading robots.txt') ||
          str.startsWith('robots.txt loaded') ||
          (str.startsWith('Found') && str.includes('sitemap URL(s)')) ||
          str.startsWith('Starting crawler') ||
          str.startsWith('Data will be saved') ||
          str.startsWith('[IntelligentPlanning]') ||
          str.startsWith('[APS]') ||
          str.startsWith('QUEUE ') ||
          str.startsWith('MILESTONE ') ||
          str.startsWith('TELEMETRY ') ||
          str.startsWith('PROGRESS ') ||
          str.startsWith('PROBLEM ') ||
          str.startsWith('PLANNER_STAGE ') ||
          str.startsWith('Skipping query URL') ||
          str.includes('duplicate') ||
          str.includes('robots-disallow') ||
          str.includes('Reason:') ||
          str.includes('Enhanced features initialization failed') ||
          str.includes('requires database connection') ||
          str.includes('No countryHubGapService available')) {
        return;
      }

      // Green: successful downloads / saves
      if (str.includes('Saved article:') || str.match(/^✓/)) {
        const titleMatch = str.match(/Saved article: (.+)$/);
        const title = titleMatch ? titleMatch[1] : '';

        const placeHub = title && isActualPlaceHub(title);
        if (placeHub.isHub) {
          const hubStr = `🌐 ${placeHub.name}`;
          originalLog(colorize(hubStr, 'green'));
          discoveredHubs.place.push(placeHub.name);

          const isCountry = allCountries.some(c =>
            c.name.toLowerCase() === placeHub.name.toLowerCase()
          );
          if (isCountry) {
            discoveredHubs.country.push(placeHub.name);
          }
          consecutiveNonHubMessages = 0;
          incrementLineCount();
          return;
        }

        const topicHub = title && isActualTopicHub(title);
        if (topicHub.isHub) {
          const hubStr = `🗂️ ${topicHub.name}`;
          originalLog(colorize(hubStr, 'cyan'));
          discoveredHubs.topic.push(topicHub.name);
          consecutiveNonHubMessages = 0;
          incrementLineCount();
          return;
        }

        consecutiveNonHubMessages++;
        if (consecutiveNonHubMessages > MAX_CONSECUTIVE_NON_HUB) {
          return;
        }
      }

      if (str.includes('Found') && str.includes('navigation links')) {
        const urlMatch = str.match(/on (https?:\/\/.+)$/);
        const url = urlMatch ? urlMatch[1] : '';

        ensureGazetteerLoaded();
        const isPlaceUrl = url && placeNames?.has(url.split('/').pop()?.toLowerCase() || '');
        const isTopicUrl = url && Array.from(newsTopics || []).some(t => url.includes(`/${t}/`) || url.includes(`/${t}`));

        if (isPlaceUrl || isTopicUrl) {
          const countryName = url.split('/').pop();
          originalLog(colorize(`🔗 ${countryName}`, 'cyan'));
          consecutiveNonHubMessages = 0;
          incrementLineCount();
        }
        return;
      }

      if (str.includes('Enqueued') && str.includes('article links')) {
        const countMatch = str.match(/Enqueued (\d+) article links/);
        if (countMatch) {
          const count = parseInt(countMatch[1]);
          if (count > 0) {
            originalLog(colorize(`📄 +${count} articles`, 'green'));
            consecutiveNonHubMessages = 0;
            incrementLineCount();
          }
        }
        return;
      }

      if ((str.includes('Failed to fetch') || (str.includes('Error') && !str.startsWith('ERROR '))) || str.match(/^✗/)) {
        if (str.includes('404')) {
          const urlMatch = str.match(/https?:\/\/[^\/]+\/world\/([^\/\s]+)/);
          if (urlMatch) {
            const countrySlug = urlMatch[1];
            originalLog(colorize(`❌ ${countrySlug.replace(/-/g, ' ')}`, 'red'));
            incrementLineCount();
          }
        }
        return;
      }

      if (str.includes('Intelligent crawl planning') ||
          str.includes('Intelligent plan:') ||
          str.includes('Hub seeded:') ||
          str.includes('Pattern discovered:') ||
          str.match(/^Sitemap enqueue complete: \d+/)) {
        if (str.match(/^Sitemap enqueue complete: \d+/)) {
          const countMatch = str.match(/complete: (\d+)/);
          if (countMatch) {
            originalLog(colorize(`📋 +${countMatch[1]} sitemap URLs`, 'blue'));
            incrementLineCount();
          }
        }
        return;
      }

      if (str.includes('Skipping known 404') || str.includes('CACHE')) {
        return;
      }

      if (str.startsWith('Fetching:')) {
        return;
      }
    }
  };

  console.warn = function(...warnArgs) {
    const str = warnArgs[0];
    if (typeof str === 'string' && str.includes('RATE LIMITED')) {
      return;
    }
    if (compact && typeof str === 'string' && !str.includes('Failed to initialize')) {
      return;
    }
    if (typeof str === 'string') {
      originalWarn(colorize(str, 'yellow'));
    } else {
      originalWarn.apply(console, warnArgs);
    }
    incrementLineCount();
  };

  console.error = function(...errorArgs) {
    const str = errorArgs[0];
    if (compact && typeof str === 'string' && !str.includes('Failed to initialize')) {
      return;
    }
    if (typeof str === 'string') {
      originalError(colorize(str, 'red'));
    } else {
      originalError.apply(console, errorArgs);
    }
    incrementLineCount();
  };
} else if (captureLogsOnly) {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  const record = (level, originalFn) => {
    return (...logArgs) => {
      const message = logArgs
        .map((value) => {
          if (typeof value === 'string') return value;
          try {
            return JSON.stringify(value);
          } catch (serializationError) {
            return String(value);
          }
        })
        .join(' ');

      runLogs.push({ level, message });

      if (verbose) {
        originalFn(...logArgs);
      }
    };
  };

  console.log = record('info', originalLog);
  console.warn = record('warn', originalWarn);
  console.error = record('error', originalError);
}

function runVerification({ quickVerification, startUrl, totalPrioritisation, priorityConfig }) {
  const report = {
    mode: quickVerification ? 'quick' : 'full',
    startUrl,
    success: true,
    database: {
      connected: Boolean(db),
      placeNamesLoaded: null,
      topicKeywordsLoaded: null,
      error: null
    },
    priorityConfig: {
      loaded: false,
      enabledFeatures: [],
      totalPrioritisation: Boolean(totalPrioritisation),
      error: null
    },
    crawler: {
      initialized: false,
      enhancedDbAvailable: false,
      availableFeatures: [],
      missingFeatures: [],
      error: null
    },
    gazetteer: {
      skipped: quickVerification,
      totalCountries: null,
      continentsRepresented: null,
      majorCountries: null,
      error: null
    },
    errors: []
  };

  try {
    if (!quickVerification) {
      ensureGazetteerLoaded();
      report.database.placeNamesLoaded = placeNames.size;
      report.database.topicKeywordsLoaded = newsTopics.size;
    }
  } catch (error) {
    report.database.error = error.message;
    report.success = false;
    report.errors.push(`Database: ${error.message}`);
  }

  try {
    const loaded = priorityConfig && Object.keys(priorityConfig).length > 0;
    report.priorityConfig.loaded = loaded;
    if (loaded && priorityConfig.features) {
      report.priorityConfig.enabledFeatures = Object.entries(priorityConfig.features)
        .filter(([_, enabled]) => enabled)
        .map(([feature]) => feature)
        .sort();
    }
  } catch (error) {
    report.priorityConfig.error = error.message;
    report.success = false;
    report.errors.push(`Priority configuration: ${error.message}`);
  }

  try {
    const testCrawler = new NewsCrawler(startUrl, {
      crawlType: 'intelligent',
      concurrency: 1,
      maxDepth: 2,
      enableDb: true,
      useSitemap: true,
      preferCache: true,
      maxDownloads: 1
    });

    report.crawler.initialized = true;
    report.crawler.enhancedDbAvailable = Boolean(testCrawler.enhancedDbAdapter);

    const criticalFeatures = ['gapDrivenPrioritization', 'patternDiscovery', 'countryHubGaps'];
    const featuresEnabled = testCrawler.featuresEnabled || {};

    report.crawler.availableFeatures = criticalFeatures.filter((feature) => featuresEnabled[feature]).sort();
    report.crawler.missingFeatures = criticalFeatures.filter((feature) => !featuresEnabled[feature]).sort();
  } catch (error) {
    report.crawler.error = error.message;
    report.success = false;
    report.errors.push(`Crawler: ${error.message}`);
  }

  if (!quickVerification) {
    try {
      ensureGazetteerLoaded();

      const continents = ['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania'];
      const majorCountries = ['United States', 'United Kingdom', 'China', 'India', 'Germany', 'France'];

      report.gazetteer.totalCountries = allCountries.length;
      report.gazetteer.continentsRepresented = continents.filter((continent) =>
        allCountries.some((country) => country.continent === continent)
      ).length;
      report.gazetteer.majorCountries = majorCountries.filter((countryName) =>
        allCountries.some((country) => country.name === countryName)
      ).length;
    } catch (error) {
      report.gazetteer.error = error.message;
      report.success = false;
      report.errors.push(`Gazetteer: ${error.message}`);
    }
  }

  return report;
}

function emitVerificationReport(report, options) {
  if (options.summaryFormat === 'json') {
    const payload = {
      ...report,
      logs: captureLogsOnly && runLogs.length ? runLogs : undefined
    };
    originalConsole.log(JSON.stringify(payload, null, options.quiet ? 0 : 2));
    return;
  }

  const isQuick = report.mode === 'quick';

  fmt.header('Intelligent Crawl Verification');
  fmt.summary({
    Mode: isQuick ? 'Quick verification' : 'Full verification',
    'Start URL': report.startUrl,
    Status: report.success ? 'Ready to crawl' : 'Issues detected'
  });

  fmt.section('Database Systems');
  if (report.database.error) {
    fmt.error(report.database.error);
  } else {
    fmt.stat('SQLite database', report.database.connected ? 'connected' : 'not available');
    if (isQuick) {
      fmt.info('Gazetteer load skipped (quick verification mode).');
    } else {
      fmt.stat('Place names loaded', report.database.placeNamesLoaded ?? 0, 'number');
      fmt.stat('Topic keywords loaded', report.database.topicKeywordsLoaded ?? 0, 'number');
    }
  }

  fmt.section('Priority Configuration');
  if (report.priorityConfig.error) {
    fmt.error(report.priorityConfig.error);
  } else {
    fmt.stat('Config loaded', report.priorityConfig.loaded ? 'yes' : 'no');
    fmt.stat('Total prioritisation', report.priorityConfig.totalPrioritisation ? 'ENABLED' : 'DISABLED');
    if (report.priorityConfig.enabledFeatures.length > 0) {
      fmt.list('Enabled features', report.priorityConfig.enabledFeatures);
    } else {
      fmt.info('No optional priority features enabled.');
    }
  }

  fmt.section('Crawler Systems');
  if (report.crawler.error) {
    fmt.error(report.crawler.error);
  } else {
    fmt.stat('NewsCrawler initialization', report.crawler.initialized ? 'ok' : 'failed');
    fmt.stat('Enhanced DB adapter', report.crawler.enhancedDbAvailable ? 'available' : 'unavailable (optional)');
    if (report.crawler.availableFeatures.length > 0) {
      fmt.list('Available features', report.crawler.availableFeatures);
    }
    if (report.crawler.missingFeatures.length > 0) {
      fmt.warn(`Missing features: ${report.crawler.missingFeatures.join(', ')}`);
    }
  }

  fmt.section('Gazetteer Quality');
  if (isQuick) {
    fmt.info('Quality checks skipped in quick mode.');
  } else if (report.gazetteer.error) {
    fmt.error(report.gazetteer.error);
  } else {
    fmt.stat('Total countries', report.gazetteer.totalCountries ?? 0, 'number');
    fmt.stat('Continents represented', `${report.gazetteer.continentsRepresented ?? 0}/6`);
    fmt.stat('Major countries present', `${report.gazetteer.majorCountries ?? 0}/6`);
  }

  if (report.success) {
    fmt.success('All critical systems are ready for intelligent crawling.');
    fmt.info('Ready to run: node tools/intelligent-crawl.js [url] [options]');
  } else {
    if (report.errors.length > 0) {
      fmt.warn(`Issues detected: ${report.errors.join('; ')}`);
    } else {
      fmt.warn('Some systems are not ready. Fix issues and re-run verification.');
    }
  }

  fmt.footer();
}

function summariseList(items, limit = 25) {
  const bounded = items.slice(0, limit);
  const omitted = Math.max(0, items.length - bounded.length);
  return { bounded, omitted };
}

function describeExitSummary(exitSummary) {
  if (!exitSummary) {
    return 'not recorded';
  }
  const parts = [exitSummary.reason];
  const details = exitSummary.details || {};
  if (typeof details.downloads === 'number' && typeof details.limit === 'number') {
    parts.push(`downloads ${details.downloads}/${details.limit}`);
  } else if (typeof details.downloads === 'number') {
    parts.push(`downloads=${details.downloads}`);
  }
  if (typeof details.visited === 'number') {
    parts.push(`visited=${details.visited}`);
  }
  if (typeof details.errors === 'number' && details.errors > 0) {
    parts.push(`errors=${details.errors}`);
  }
  if (details.message) {
    parts.push(details.message);
  }
  if (exitSummary.at) {
    parts.push(`at ${exitSummary.at}`);
  }
  return parts.filter(Boolean).join(' | ');
}

function buildCrawlReport({ startUrl, totalPrioritisation, crawlConfig, crawlStats = null, exitSummary = null }) {
  ensureGazetteerLoaded();

  const uniqueCountries = [...new Set(discoveredHubs.country)].sort((a, b) => a.localeCompare(b));
  const uniquePlaces = [...new Set(discoveredHubs.place)].sort((a, b) => a.localeCompare(b));
  const uniqueTopics = [...new Set(discoveredHubs.topic)].sort((a, b) => a.localeCompare(b));

  const otherPlaceHubs = uniquePlaces.filter((place) =>
    !uniqueCountries.some((country) => country.toLowerCase() === place.toLowerCase())
  );

  return {
    success: true,
    startUrl,
    stats: {
      countryHubs: uniqueCountries.length,
      otherPlaceHubs: otherPlaceHubs.length,
      topicHubs: uniqueTopics.length,
      totalCountriesAvailable: allCountries ? allCountries.length : null
    },
    discoveredHubs: {
      countries: uniqueCountries,
      otherPlaces: otherPlaceHubs,
      topics: uniqueTopics
    },
    totalPrioritisation: Boolean(totalPrioritisation),
    config: crawlConfig,
    runtime: {
      stats: crawlStats ? { ...crawlStats } : null,
      exitSummary: exitSummary || null
    }
  };
}

function emitCrawlReport(report, options) {
  if (options.summaryFormat === 'json') {
    const payload = {
      ...report,
      logs: captureLogsOnly && runLogs.length ? runLogs : undefined
    };
    originalConsole.log(JSON.stringify(payload, null, options.quiet ? 0 : 2));
    return;
  }

  const maxDownloadsDisplay = (() => {
    if (!report.config) {
      return 'default (500)';
    }
    if (report.config.usedDefaultMaxDownloads) {
      return `default (${report.config.maxDownloads})`;
    }
    return report.config.maxDownloads;
  })();
  const runtimeStats = report.runtime?.stats || null;
  const pagesVisited = runtimeStats?.pagesVisited ?? 'n/a';
  const pagesDownloaded = runtimeStats?.pagesDownloaded ?? 'n/a';
  const articlesSaved = runtimeStats?.articlesSaved ?? 'n/a';
  const exitReasonText = describeExitSummary(report.runtime?.exitSummary);

  fmt.header('Intelligent Crawl Summary');
  fmt.success('Crawl completed');
  fmt.summary({
    'Target URL': report.startUrl,
    Concurrency: report.config?.concurrency ?? 'n/a',
    'Max downloads': maxDownloadsDisplay,
    'Pages visited': pagesVisited,
    'Pages downloaded': pagesDownloaded,
    'Articles saved': articlesSaved,
    'Exit reason': exitReasonText,
    'Country hubs discovered': report.stats.countryHubs,
    'Other place hubs': report.stats.otherPlaceHubs,
    'Topic hubs': report.stats.topicHubs,
    'Total prioritisation': report.totalPrioritisation ? 'ENABLED' : 'DISABLED'
  });

  if (report.discoveredHubs.countries.length > 0) {
    const { bounded, omitted } = summariseList(report.discoveredHubs.countries, 25);
    fmt.section('Country hubs');
    fmt.list('Countries', bounded);
    if (omitted > 0) {
      fmt.info(`${omitted} additional country hubs omitted for brevity.`);
    }
  }

  if (report.discoveredHubs.otherPlaces.length > 0) {
    const { bounded, omitted } = summariseList(report.discoveredHubs.otherPlaces, 25);
    fmt.section('Other place hubs');
    fmt.list('Places', bounded);
    if (omitted > 0) {
      fmt.info(`${omitted} additional place hubs omitted for brevity.`);
    }
  }

  if (report.discoveredHubs.topics.length > 0) {
    const { bounded, omitted } = summariseList(report.discoveredHubs.topics, 25);
    fmt.section('Topic hubs');
    fmt.list('Topics', bounded);
    if (omitted > 0) {
      fmt.info(`${omitted} additional topic hubs omitted for brevity.`);
    }
  }

  fmt.footer();
}

function emitCrawlFailure(error, options) {
  if (options.summaryFormat === 'json') {
    const payload = {
      success: false,
      error: error.message,
      logs: captureLogsOnly && runLogs.length ? runLogs : undefined
    };
    originalConsole.log(JSON.stringify(payload, null, options.quiet ? 0 : 2));
    return;
  }

  fmt.header('Intelligent Crawl Summary');
  fmt.error(`Crawl failed: ${error.message}`);
  if (verbose && error.stack) {
    fmt.warn(error.stack);
  }
  fmt.footer();
}

// Load priority configuration
console.log('Loading priority configuration...');
setPriorityConfigProfile('intelligent');
const priorityConfigPath = getPriorityConfigPath();
let priorityConfig = getPriorityConfig() || {};
if (!priorityConfig || typeof priorityConfig !== 'object') {
  console.warn('Warning: Could not load intelligent priority configuration, using defaults');
  priorityConfig = {};
}


// Load configuration
console.log('Loading crawl configuration...');
const configCandidates = [
  path.join(__dirname, '..', 'config.json'),
  path.join(__dirname, 'config.json')
];
let configPath = null;
for (const candidate of configCandidates) {
  if (fs.existsSync(candidate)) {
    configPath = candidate;
    break;
  }
}

let config = { url: 'https://www.theguardian.com' }; // Default fallback

if (configPath) {
  try {
    const configData = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(configData);
    if (parsed && typeof parsed === 'object') {
      config = parsed;
    } else {
      console.warn(`Warning: Config at ${configPath} is not valid JSON object, using default URL`);
    }
  } catch (error) {
    console.warn(`Warning: Could not load config from ${configPath}, using default URL`);
  }
} else {
  console.warn(`Warning: No config.json found (checked root and tools directories), using default URL`);
}

// Determine starting URL (command line arg overrides config)
const configUrl = config.intelligentCrawl?.url || config.url;
const startUrl = options.providedUrl || configUrl || 'https://www.theguardian.com';

function resolveTotalPrioritySetting(runConfig) {
  if (!runConfig || typeof runConfig !== 'object') {
    return undefined;
  }
  const settings = runConfig.intelligentCrawl;
  if (!settings || typeof settings !== 'object') {
    return undefined;
  }
  if (typeof settings.totalPriority === 'boolean') {
    return settings.totalPriority;
  }
  if (typeof settings.totalPrioritisation === 'boolean') {
    return settings.totalPrioritisation;
  }
  if (typeof settings.mode === 'string') {
    const normalized = settings.mode.trim().toLowerCase();
    if (normalized === 'total-priority' || normalized === 'country-hubs-total') {
      return true;
    }
    if (normalized === 'balanced' || normalized === 'standard') {
      return false;
    }
  }
  return undefined;
}

const totalPriorityOverride = resolveTotalPrioritySetting(config);

if (typeof totalPriorityOverride === 'boolean') {
  if (!priorityConfig.features) {
    priorityConfig.features = {};
  }
  if (priorityConfig.features.totalPrioritisation !== totalPriorityOverride) {
    priorityConfig.features.totalPrioritisation = totalPriorityOverride;
    try {
      fs.writeFileSync(
        priorityConfigPath,
        `${JSON.stringify(priorityConfig, null, 2)}\n`,
        'utf-8'
      );
      console.log(`Priority configuration updated: totalPrioritisation set to ${totalPriorityOverride ? 'ENABLED' : 'DISABLED'} via config.json`);
    } catch (error) {
      console.warn(`Warning: Failed to persist total priority setting to ${path.basename(priorityConfigPath)} (${error.message})`);
    }
  }
}

const totalPrioritisation = (typeof totalPriorityOverride === 'boolean')
  ? totalPriorityOverride
  : priorityConfig.features?.totalPrioritisation === true;


// Function to verify if a title corresponds to a real place
function isActualPlaceHub(title, url) {
  // Ensure gazetteer data is loaded
  ensureGazetteerLoaded();

  // Extract place name from title like "France | The Guardian" or "Latest Australia news"

  // Pattern 1: "PlaceName | The Guardian"
  const pattern1 = title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+\|/);
  if (pattern1) {
    const placeName = pattern1[1];
    // Only consider countries as place hubs for news websites
    const isCountry = allCountries.some(c =>
      c.name.toLowerCase() === placeName.toLowerCase()
    );
    if (isCountry) {
      return { isHub: true, name: placeName };
    }
  }

  // Pattern 2: "Latest PlaceName news"
  const pattern2 = title.match(/Latest\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+news/);
  if (pattern2) {
    const placeName = pattern2[1];
    // Only consider countries as place hubs for news websites
    const isCountry = allCountries.some(c =>
      c.name.toLowerCase() === placeName.toLowerCase()
    );
    if (isCountry) {
      return { isHub: true, name: placeName };
    }
  }

  // Pattern 3: "PlaceName news from"
  const pattern3 = title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+news/);
  if (pattern3) {
    const placeName = pattern3[1];
    // Only consider countries as place hubs for news websites
    const isCountry = allCountries.some(c =>
      c.name.toLowerCase() === placeName.toLowerCase()
    );
    if (isCountry) {
      return { isHub: true, name: placeName };
    }
  }

  return { isHub: false, name: null };
}

// Function to verify if a title/URL corresponds to a topic hub
function isActualTopicHub(title, url) {
  // Ensure gazetteer data is loaded
  ensureGazetteerLoaded();

  // Extract topic candidate from title like "Politics | The Guardian"
  const pattern1 = title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+\|/);
  if (pattern1) {
    const topicName = pattern1[1].toLowerCase();
    if (newsTopics.has(topicName)) {
      return { isHub: true, name: pattern1[1] };
    }
  }

  // Check URL path for topic indicators like /politics/, /sport/, etc.
  if (url) {
    const urlPath = url.toLowerCase();
    for (const topic of newsTopics) {
      if (urlPath.includes(`/${topic}/`) || urlPath.includes(`/${topic}`)) {
        // Verify it's a hub page, not an article (hubs typically don't have dates)
        if (!urlPath.match(/\/\d{4}\/[a-z]{3}\/\d{2}\//)) {
          return { isHub: true, name: topic };
        }
      }
    }
  }

  return { isHub: false, name: null };
}

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

// Handle verification mode
if (verification || quickVerification) {
  const verificationReport = runVerification({
    quickVerification,
    startUrl,
    totalPrioritisation,
    priorityConfig
  });

  emitVerificationReport(verificationReport, options);
  process.exit(verificationReport.success ? 0 : 1);
}

if (verbose) {
  console.log(`Starting intelligent crawl of: ${startUrl}`);
  console.log(`Configuration: concurrency ${concurrency}, depth ${hubExclusiveMode ? 1 : 2}, intelligent mode (${hubExclusiveMode ? 'hub-exclusive' : 'article-enabled'})`);
  console.log('---');
} else if (compact) {
  console.log(colorize('🌍 Country Hub Discovery', 'blue'));
  console.log(colorize(`Target: ${startUrl}`, 'cyan'));
  console.log(colorize(hubExclusiveMode ? 'Mode: Hub-exclusive (structure only)' : 'Mode: Intelligent + article fetch', hubExclusiveMode ? 'yellow' : 'green'));
  console.log('');
} else if (shouldStreamOutput) {
  console.log(colorize('🚀 Starting Intelligent Crawl', 'blue'));
  console.log(colorize(`📍 Target: ${startUrl}`, 'cyan'));
  console.log(colorize(hubExclusiveMode ? '🎯 Mode: Country Hub Structure Mapping' : '🎯 Mode: Intelligent crawl with article downloads', 'green'));
  console.log(colorize('🌍 Focus: Geographic Coverage & Country Hub Discovery', 'yellow'));
  console.log('');
}

// Show country hub validation status
if (shouldStreamOutput && !verbose && !compact) {
  console.log(colorize('🌍 Country Hub Validation:', 'blue'));
  ensureGazetteerLoaded();
  console.log(colorize(`   ✓ ${allCountries.length} countries loaded from gazetteer`, 'green'));
  console.log(colorize(`   🎯 Total Prioritisation: ${totalPrioritisation ? 'ENABLED' : 'DISABLED'}`, totalPrioritisation ? 'green' : 'yellow'));
  console.log(colorize(`   🧭 Mode: ${hubExclusiveMode ? 'Hub-exclusive (structure only)' : 'Article downloads enabled'}`, hubExclusiveMode ? 'yellow' : 'green'));
  console.log('');
}

// Create crawler to EXHAUSTIVELY CRAWL ALL COUNTRY HUBS WITH PAGINATION
const effectiveMaxDownloads = typeof maxDownloads === 'number' ? maxDownloads : 500;

const crawler = new NewsCrawler(startUrl, {
  crawlType: 'intelligent',
  concurrency,
  maxDepth: hubExclusiveMode ? 1 : 2,
  maxDownloads: effectiveMaxDownloads,
  enableDb: true,
  useSitemap: false,
  preferCache: true,
  maxAgeMs: 24 * 60 * 60 * 1000,
  plannerEnabled: true,
  behavioralProfile: 'country-hub-focused',
  totalPrioritisation,
  gapDrivenPrioritization: true,
  patternDiscovery: true,
  countryHubGaps: true,
  countryHubBehavioralProfile: true,
  countryHubTargetCount: hubExclusiveMode ? 250 : 150,
  exhaustiveCountryHubMode: hubExclusiveMode,
  countryHubExclusiveMode: hubExclusiveMode,
  disableTopicHubs: hubExclusiveMode,
  disableRegularArticles: hubExclusiveMode,
  priorityMode: hubExclusiveMode ? 'country-hubs-only' : undefined,
  skipQueryUrls: false,
  enablePaginationCrawling: true,
  maxPaginationPages: 50,
  paginationDetectionEnabled: true,
  paginationLoopProtection: true,
  paginationTimeoutMs: 30000,
  hubMaxPages: 50,
  hubMaxDays: 365,
  disableNavigationDiscovery: false,
  disableContentAcquisition: hubExclusiveMode,
  structureOnly: hubExclusiveMode,
  seedStartFromCache: options.seedFromCache,
  cachedSeedUrls: options.cachedSeedUrls
});

// Show planning phase with EXHAUSTIVE mode messaging
if (shouldStreamOutput && !verbose && !compact) {
  if (hubExclusiveMode) {
    console.log(colorize('🧠 Planning Phase - EXHAUSTIVE COUNTRY HUB MODE:', 'blue'));
    console.log(colorize('   🔍 Analyzing existing coverage and gaps...', 'cyan'));
    console.log(colorize('   📊 Prioritizing ALL 250 country hubs for discovery...', 'cyan'));
    console.log(colorize('   🎯 EXHAUSTIVE: Process all country hubs before other content', 'green'));
  } else {
    console.log(colorize('🧠 Planning Phase - HUBS + ARTICLE FETCH:', 'blue'));
    console.log(colorize('   🔍 Seeding hub predictions and article queues...', 'cyan'));
    console.log(colorize('   📄 Articles from hubs will be fetched until max downloads reached', 'green'));
  }
  console.log(colorize(`   🚀 Concurrency: ${concurrency} parallel download${concurrency === 1 ? '' : 's'}`, 'yellow'));
  console.log('');
}

// Start the crawl
crawler.crawl()
  .then(() => {
    const finalStats = crawler && crawler.stats ? { ...crawler.stats } : null;
    const exitSummary = typeof crawler.getExitSummary === 'function'
      ? crawler.getExitSummary()
      : null;
    const report = buildCrawlReport({
      startUrl,
      totalPrioritisation,
      crawlConfig: {
        concurrency,
        maxDownloads: effectiveMaxDownloads,
        usedDefaultMaxDownloads: maxDownloads === null,
        limit: outputLimit,
        summaryFormat: options.summaryFormat,
        verbose,
        compact
      },
      crawlStats: finalStats,
      exitSummary
    });
    emitCrawlReport(report, options);
    process.exit(0);
  })
  .catch(error => {
    emitCrawlFailure(error, options);
    process.exit(1);
  });
