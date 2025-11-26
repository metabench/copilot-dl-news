const path = require('path');
const { normalizeOutputVerbosity } = require('../utils/outputVerbosity');

const TEN_MINUTES_MS = 10 * 60 * 1000;
const DEFAULT_OUTPUT_VERBOSITY = 'extra-terse';

const DEFAULT_FEATURE_FLAGS = Object.freeze({
  gapDrivenPrioritization: false,
  plannerKnowledgeReuse: false,
  realTimeCoverageAnalytics: false,
  problemClustering: false,
  problemResolution: false,
  crawlPlaybooks: false,
  patternDiscovery: false,
  countryHubGaps: false,
  countryHubBehavioralProfile: false,
  advancedPlanningSuite: false,
  graphReasonerPlugin: false,
  gazetteerAwareReasoner: false,
  totalPrioritisation: false
});

/**
 * Schema for NewsCrawler constructor options
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

module.exports = {
  crawlerOptionsSchema,
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_OUTPUT_VERBOSITY
};
