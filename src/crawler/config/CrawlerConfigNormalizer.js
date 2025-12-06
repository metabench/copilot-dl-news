'use strict';

const path = require('path');
const { buildOptions } = require('../../utils/optionsBuilder');

/** Default output verbosity level */
const DEFAULT_OUTPUT_VERBOSITY = 'normal';

/** Ten minutes in milliseconds */
const TEN_MINUTES_MS = 10 * 60 * 1000;

/**
 * Default feature flags for the crawler.
 * @type {Object<string, boolean>}
 */
const DEFAULT_FEATURE_FLAGS = {
  discoveryTuner: false,
  telemetrySummary: true,
  milestoneProgress: true,
  urlAnalysisDeep: true,
  problemClusters: false,
  errorTrackerEnabled: true,
  adaptiveSeedPlanner: false,
  urlEligibility: true,
  countryHubExclusive: true,
  linkExtractorDomGaps: true
};

/**
 * Normalize output verbosity to a known level.
 * @param {string} value - Raw verbosity value
 * @returns {string} Normalized verbosity: 'quiet', 'normal', or 'verbose'
 */
function normalizeOutputVerbosity(value) {
  if (typeof value !== 'string') {
    return DEFAULT_OUTPUT_VERBOSITY;
  }
  const normalized = value.toLowerCase().trim();
  if (normalized === 'quiet' || normalized === 'silent' || normalized === 'q') {
    return 'quiet';
  }
  if (normalized === 'verbose' || normalized === 'v' || normalized === 'debug') {
    return 'verbose';
  }
  return 'normal';
}

/**
 * Normalize a hostname for consistent comparison.
 * Strips 'www.' prefix if present.
 * @param {string} host - The hostname to normalize
 * @returns {string} Normalized hostname
 */
function normalizeHost(host) {
  if (typeof host !== 'string') {
    return '';
  }
  const lower = host.toLowerCase();
  return lower.startsWith('www.') ? lower.slice(4) : lower;
}

/**
 * Resolve the priority profile name from crawl type.
 * Maps crawl types to their corresponding priority configuration profiles.
 * @param {string} crawlType - The crawl type (e.g., 'basic', 'intelligent', 'gazetteer')
 * @returns {string} The priority profile name
 */
function resolvePriorityProfileFromCrawlType(crawlType) {
  if (typeof crawlType !== 'string') {
    return 'basic';
  }
  const normalized = crawlType.toLowerCase().trim();
  if (normalized === 'basic' || normalized === 'normal' || normalized === 'standard') {
    return 'basic';
  }
  if (normalized.startsWith('intelligent')) {
    return 'intelligent';
  }
  if (normalized === 'gazetteer' || normalized === 'geography' || normalized === 'geo') {
    return 'geography';
  }
  return 'basic';
}

/**
 * Schema for NewsCrawler constructor options.
 * Each key maps to a schema definition with type, default, optional processor, and validator.
 * @type {Object}
 */
const crawlerOptionsSchema = {
  jobId: { type: 'string', default: null },
  slowMode: { type: 'boolean', default: false },
  rateLimitMs: { type: 'number', default: (opts) => opts.slowMode ? 1000 : 0 },
  maxDepth: { type: 'number', default: 3 },
  dataDir: { type: 'string', default: (opts) => path.join(process.cwd(), 'data') },
  // Concurrency: For regular crawls, number of parallel workers.
  // For gazetteer/geography crawls: maximum allowed concurrency (may use less or none).
  // Gazetteer mode currently processes sequentially and ignores this value.
  concurrency: { type: 'number', default: 1, processor: (val) => Math.max(1, val) },
  maxQueue: { type: 'number', default: 10000, processor: (val) => Math.max(1000, val) },
  retryLimit: { type: 'number', default: 3 },
  backoffBaseMs: { type: 'number', default: 500 },
  backoffMaxMs: { type: 'number', default: 5 * 60 * 1000 },
  maxDownloads: { type: 'number', default: undefined, validator: (val) => val > 0 },
  maxAgeMs: { type: 'number', default: undefined, validator: (val) => val >= 0 },
  maxAgeArticleMs: { type: 'number', default: undefined, validator: (val) => val >= 0 },
  maxAgeHubMs: { type: 'number', default: TEN_MINUTES_MS, validator: (val) => val >= 0 },
  dbPath: { type: 'string', default: null }, // Will be computed after dataDir
  fastStart: { type: 'boolean', default: true },
  enableDb: { type: 'boolean', default: true },
  preferCache: { type: 'boolean', default: true },
  useSitemap: { type: 'boolean', default: true },
  sitemapOnly: { type: 'boolean', default: false },
  sitemapMaxUrls: { type: 'number', default: 5000, processor: (val) => Math.max(0, val) },
  hubMaxPages: { type: 'number', default: undefined },
  hubMaxDays: { type: 'number', default: undefined },
  intMaxSeeds: { type: 'number', default: 50 },
  limitCountries: { type: 'number', default: undefined, processor: (val) => (val == null ? undefined : Math.max(1, Math.floor(val))), validator: (val) => val > 0 },
  targetCountries: { type: 'array', default: null },
  gazetteerStages: { type: 'array', default: null },
  intTargetHosts: { type: 'array', default: null, processor: (val) => val ? val.map(s => String(s || '').toLowerCase()) : null },
  plannerVerbosity: { type: 'number', default: 0 },
  requestTimeoutMs: { type: 'number', default: 10000, validator: (val) => val > 0 },
  pacerJitterMinMs: { type: 'number', default: 25, processor: (val) => Math.max(0, val) },
  pacerJitterMaxMs: { type: 'number', default: 50 },
  crawlType: { type: 'string', default: 'basic', processor: (val) => val.toLowerCase() },
  outputVerbosity: { type: 'string', default: DEFAULT_OUTPUT_VERBOSITY, processor: (val) => normalizeOutputVerbosity(val) },
  skipQueryUrls: { type: 'boolean', default: true },
  connectionResetWindowMs: { type: 'number', default: 2 * 60 * 1000, validator: (val) => val > 0 },
  connectionResetThreshold: { type: 'number', default: 3, validator: (val) => val > 0 },
  useSequenceRunner: { type: 'boolean', default: true },
  seedStartFromCache: { type: 'boolean', default: false },
  cachedSeedUrls: { type: 'array', default: () => [] },
  loggingQueue: { type: 'boolean', default: true },
  loggingNetwork: { type: 'boolean', default: true },
  loggingFetching: { type: 'boolean', default: true }
};

/**
 * Flatten nested logging config from config.json format.
 * @param {Object} options - Raw options object
 * @returns {Object} Options with flattened logging properties
 */
function flattenLoggingConfig(options) {
  if (!options || typeof options !== 'object') {
    return options;
  }
  const result = { ...options };
  if (options.logging && typeof options.logging === 'object') {
    if (options.logging.queue !== undefined && result.loggingQueue === undefined) {
      result.loggingQueue = options.logging.queue;
    }
    if (options.logging.network !== undefined && result.loggingNetwork === undefined) {
      result.loggingNetwork = options.logging.network;
    }
    if (options.logging.fetching !== undefined && result.loggingFetching === undefined) {
      result.loggingFetching = options.logging.fetching;
    }
  }
  return result;
}

/**
 * Build a gazetteer stage filter set from options.
 * @param {Object} opts - Resolved options
 * @returns {Set<string>|null} Set of lowercase stage names, or null if no filter
 */
function buildGazetteerStageFilter(opts) {
  if (!Array.isArray(opts.gazetteerStages) || opts.gazetteerStages.length === 0) {
    return null;
  }
  return new Set(opts.gazetteerStages.map((stage) => String(stage).toLowerCase()));
}

/**
 * Normalize crawler options using the schema.
 * @param {Object} rawOptions - Raw options object
 * @returns {Object} Normalized options object
 */
function normalizeOptions(rawOptions) {
  const effectiveOptions = flattenLoggingConfig(rawOptions);
  return buildOptions(effectiveOptions, crawlerOptionsSchema);
}

/**
 * Create a complete configuration object for a NewsCrawler instance.
 * This includes resolved options and derived values.
 * @param {string} startUrl - The starting URL
 * @param {Object} rawOptions - Raw options object
 * @returns {Object} Complete configuration
 */
function createCrawlerConfig(startUrl, rawOptions = {}) {
  const opts = normalizeOptions(rawOptions);
  
  // Derive domain information
  let domain, domainNormalized, baseUrl;
  try {
    const urlObj = new URL(startUrl);
    domain = urlObj.hostname;
    domainNormalized = normalizeHost(domain);
    baseUrl = `${urlObj.protocol}//${domain}`;
  } catch (err) {
    domain = null;
    domainNormalized = null;
    baseUrl = null;
  }

  // Resolve dbPath if not explicitly set
  const dbPath = opts.dbPath || path.join(opts.dataDir, 'news.db');

  // Build gazetteer stage filter
  const gazetteerStageFilter = buildGazetteerStageFilter(opts);

  // Resolve priority profile
  const priorityProfile = resolvePriorityProfileFromCrawlType(opts.crawlType);

  return {
    ...opts,
    startUrl,
    domain,
    domainNormalized,
    baseUrl,
    dbPath,
    gazetteerStageFilter,
    priorityProfile,
    usePriorityQueue: opts.concurrency > 1
  };
}

/**
 * Determine if the crawl type indicates gazetteer mode.
 * @param {string} crawlType - The crawl type
 * @returns {boolean} True if gazetteer mode
 */
function isGazetteerMode(crawlType) {
  if (typeof crawlType !== 'string') {
    return false;
  }
  const normalized = crawlType.toLowerCase().trim();
  return normalized === 'gazetteer' || normalized === 'geography' || normalized === 'geo';
}

/**
 * Determine if the crawl type indicates intelligent mode.
 * @param {string} crawlType - The crawl type
 * @returns {boolean} True if intelligent mode
 */
function isIntelligentMode(crawlType) {
  if (typeof crawlType !== 'string') {
    return false;
  }
  const normalized = crawlType.toLowerCase().trim();
  return normalized.startsWith('intelligent');
}

/**
 * Determine if the crawl type indicates basic mode.
 * @param {string} crawlType - The crawl type
 * @returns {boolean} True if basic mode
 */
function isBasicMode(crawlType) {
  return !isGazetteerMode(crawlType) && !isIntelligentMode(crawlType);
}

module.exports = {
  // Constants
  DEFAULT_OUTPUT_VERBOSITY,
  DEFAULT_FEATURE_FLAGS,
  TEN_MINUTES_MS,
  crawlerOptionsSchema,
  
  // Normalization functions
  normalizeOutputVerbosity,
  normalizeHost,
  normalizeOptions,
  flattenLoggingConfig,
  
  // Resolution functions
  resolvePriorityProfileFromCrawlType,
  buildGazetteerStageFilter,
  createCrawlerConfig,
  
  // Mode detection
  isGazetteerMode,
  isIntelligentMode,
  isBasicMode
};
