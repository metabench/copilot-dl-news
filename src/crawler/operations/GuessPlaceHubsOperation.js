'use strict';

const path = require('path');
const { CrawlOperation, cloneOptions } = require('./CrawlOperation');
const { guessPlaceHubsForDomain } = require('../../orchestration/placeHubGuessing');
const { createPlaceHubDependencies } = require('../../orchestration/dependencies');

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
}

function resolveDbPath(overrides = {}, defaults = {}) {
  if (overrides.dbPath) {
    return path.isAbsolute(overrides.dbPath)
      ? overrides.dbPath
      : path.resolve(process.cwd(), overrides.dbPath);
  }

  const dataDirSource = overrides.dataDir || defaults.dataDir || path.resolve(process.cwd(), 'data');
  const dataDir = path.isAbsolute(dataDirSource)
    ? dataDirSource
    : path.resolve(process.cwd(), dataDirSource);

  return path.join(dataDir, 'news.db');
}

async function disposeDependencies(deps, logger = console) {
  if (!deps) {
    return;
  }

  const warn = (label, error) => {
    if (!error) {
      return;
    }
    logger.warn?.(`[GuessPlaceHubsOperation] Failed to dispose ${label}: ${error?.message || error}`);
  };

  try {
    const candidatesStore = deps.stores?.candidates;
    if (candidatesStore && typeof candidatesStore.close === 'function') {
      await candidatesStore.close();
    }
  } catch (error) {
    warn('candidates store', error);
  }

  try {
    const fetchRecorder = deps.stores?.fetchRecorder;
    if (fetchRecorder && typeof fetchRecorder.close === 'function') {
      await fetchRecorder.close();
    }
  } catch (error) {
    warn('fetch recorder', error);
  }

  try {
    if (deps.newsDb && typeof deps.newsDb.close === 'function') {
      deps.newsDb.close();
    }
  } catch (error) {
    warn('newsDb connection', error);
  }

  try {
    if (deps.db && typeof deps.db.close === 'function') {
      deps.db.close();
    }
  } catch (error) {
    warn('db connection', error);
  }
}

function normalizeStartUrl(startUrl, fallbackScheme = 'https') {
  if (!startUrl) {
    return null;
  }
  const trimmed = String(startUrl).trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.includes('://')) {
    return trimmed;
  }
  const scheme = fallbackScheme && typeof fallbackScheme === 'string' ? fallbackScheme : 'https';
  return `${scheme}://${trimmed}`;
}

class GuessPlaceHubsOperation extends CrawlOperation {
  constructor() {
    super({
      name: 'guessPlaceHubs',
      summary: 'Guess place hub candidates and optionally persist them',
      defaultOptions: {
        scheme: 'https',
        kinds: ['country'],
        patternsPerPlace: 3,
        apply: false,
        maxAgeDays: 7,
        refresh404Days: 180,
        retry4xxDays: 7,
        enableTopicDiscovery: false,
        enableCombinationDiscovery: false,
        enableHierarchicalDiscovery: false,
        verbose: false
      }
    });
  }

  async run({
    startUrl,
    overrides = {},
    defaults = {},
    logger = console
  } = {}) {
    if (!startUrl) {
      throw new Error('startUrl is required for guessPlaceHubs operation');
    }

    const normalizedStartUrl = normalizeStartUrl(startUrl, overrides.scheme || this.defaultOptions.scheme);
    if (!normalizedStartUrl) {
      throw new Error('Unable to normalize startUrl for guessPlaceHubs operation');
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(normalizedStartUrl);
    } catch (error) {
      throw new Error(`Invalid startUrl for guessPlaceHubs: ${normalizedStartUrl}`);
    }

    const options = this.buildOptions({}, overrides);
    const domainFromOptions = typeof overrides.domain === 'string' ? overrides.domain.trim().toLowerCase() : null;
    const domain = domainFromOptions || (options.domain ? String(options.domain).trim().toLowerCase() : parsedUrl.hostname.toLowerCase());

    if (!domain) {
      throw new Error('A domain is required for guessPlaceHubs (derive from startUrl or provide overrides.domain)');
    }

    const scheme = (options.scheme || parsedUrl.protocol.replace(':', '') || 'https').toLowerCase();

    const resolvedOptions = {
      ...options,
      domain,
      scheme
    };

    // Pass specific active probe options if present in overrides
    if (overrides.activePattern) {
      resolvedOptions.activePattern = overrides.activePattern;
    }
    if (overrides.mode) {
      resolvedOptions.mode = overrides.mode;
    }
    if (overrides.limit) {
      resolvedOptions.limit = overrides.limit;
    }
    if (overrides.lang) {
      resolvedOptions.lang = overrides.lang;
    }
    if (overrides.kinds) {
      resolvedOptions.kinds = overrides.kinds;
    }
    if (overrides.parentPlace) {
      resolvedOptions.parentPlace = overrides.parentPlace;
    }

    delete resolvedOptions.dbPath;
    delete resolvedOptions.dataDir;

    const dbPath = resolveDbPath(overrides, defaults);
    const fetchFn = typeof overrides.fetchFn === 'function' ? overrides.fetchFn : undefined;
    const now = typeof overrides.now === 'function' ? overrides.now : undefined;
    
    // Distributed fetching support
    const distributed = parseBoolean(
      overrides.distributed,
      parseBoolean(process.env.GUESS_PLACE_HUBS_DISTRIBUTED, true)
    );
    const workerUrl = overrides.workerUrl || 'http://144.21.42.149:8081';

    const dependencies = createPlaceHubDependencies({
      dbPath,
      verbose: Boolean(resolvedOptions.verbose),
      distributed,
      workerUrl,
      distributedOptions: {
        batchSize: overrides.batchSize || 50,
        concurrency: overrides.concurrency || 10
      },
      ...(fetchFn ? { fetchFn } : {}),
      ...(now ? { now } : {})
    });

    if (distributed && dependencies.batchProcessor) {
      logger.info?.(`[CrawlOperations] Distributed mode enabled via ${workerUrl}`);
    }

    if (overrides.telemetryBridge && typeof overrides.telemetryBridge.emitEvent === 'function') {
      dependencies.telemetryBridge = overrides.telemetryBridge;
    }

    const startedAt = Date.now();
    logger.info?.(`[CrawlOperations] guessPlaceHubs starting: ${domain}`);

    const response = {
      operation: this.name,
      startUrl: normalizedStartUrl,
      summary: this.summary,
      options: cloneOptions(resolvedOptions),
      startedAt: new Date(startedAt).toISOString(),
      domain
    };

    try {
      const result = await guessPlaceHubsForDomain(resolvedOptions, dependencies);
      const finishedAt = Date.now();
      response.status = 'ok';
      response.finishedAt = new Date(finishedAt).toISOString();
      response.elapsedMs = finishedAt - startedAt;
      response.result = result;
      logger.info?.(`[CrawlOperations] guessPlaceHubs completed in ${response.elapsedMs}ms`);
    } catch (error) {
      const finishedAt = Date.now();
      response.status = 'error';
      response.finishedAt = new Date(finishedAt).toISOString();
      response.elapsedMs = finishedAt - startedAt;
      response.error = {
        message: error?.message || String(error),
        stack: error?.stack || null
      };
      logger.error?.(`[CrawlOperations] guessPlaceHubs failed: ${response.error.message}`);
    } finally {
      await disposeDependencies(dependencies, logger);
    }

    return response;
  }
}

module.exports = {
  GuessPlaceHubsOperation
};
