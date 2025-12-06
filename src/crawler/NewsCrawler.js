const fetch = (...args) => import('node-fetch').then(({ 
  default: fetch 
}) => fetch(...args));
const robotsParser = require('robots-parser');
const fs = require('fs').promises;
const path = require('path');
const { tof, is_array } = require('lang-tools');
const { buildOptions } = require('../utils/optionsBuilder');
const {
  normalizeOutputVerbosity,
  DEFAULT_OUTPUT_VERBOSITY
} = require('../utils/outputVerbosity');
const {
  URL
} = require('url');
const {
  ArticleCache
} = require('../cache');
const {
  UrlPolicy
} = require('./urlPolicy');
const {
  DeepUrlAnalyzer
} = require('./deepUrlAnalysis');
const {
  UrlDecisionService
} = require('./UrlDecisionService');
const {
  ErrorTracker
} = require('./ErrorTracker');
const {
  DomainThrottleManager
} = require('./DomainThrottleManager');
const http = require('http');
const https = require('https');
const {
  createCrawlerDb
} = require('./dbClient');
const {
  ensureGazetteer,
} = require('../db/sqlite');
const {
  createSequenceRunner
} = require('../orchestration/SequenceRunner');
const {
  createSequenceResolverMap
} = require('../orchestration/createSequenceResolvers');
// Enhanced features (optional)
const {
  ConfigManager
} = require('../config/ConfigManager');
const {
  EnhancedDatabaseAdapter
} = require('../db/EnhancedDatabaseAdapter');
const {
  PriorityScorer
} = require('./PriorityScorer');
const {
  ProblemClusteringService
} = require('./ProblemClusteringService');
const {
  PlannerKnowledgeService
} = require('./PlannerKnowledgeService');
const {
  EnhancedFeaturesManager
} = require('./EnhancedFeaturesManager');
const {
  ProblemResolutionService
} = require('./ProblemResolutionService');
const {
  CrawlPlaybookService
} = require('./CrawlPlaybookService');
const {
  CountryHubGapService
} = require('./CountryHubGapService');
const {
  CountryHubBehavioralProfile
} = require('./CountryHubBehavioralProfile');
const { GazetteerManager } = require('./components/GazetteerManager');
const {
  createCliLogger,
  isVerboseMode
} = require('./cli/progressReporter');
const Crawler = require('./core/Crawler');
const { wireCrawlerServices } = require('./CrawlerServiceWiring');

const log = createCliLogger();

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

function normalizeHost(host) {
  if (!host && host !== 0) return null;
  const value = String(host).trim().toLowerCase();
  if (!value) return null;
  const withoutScheme = value.replace(/^https?:\/\//, '');
  return withoutScheme.replace(/\/.*$/, '');
}

function resolvePriorityProfileFromCrawlType(crawlType) {
  if (typeof crawlType !== 'string') {
    return 'basic';
  }
  const normalized = crawlType.trim().toLowerCase();
  if (!normalized) {
    return 'basic';
  }
  if (normalized.startsWith('intelligent')) {
    return 'intelligent';
  }
  if (normalized === 'geography' || normalized === 'gazetteer') {
    return 'geography';
  }
  if (normalized === 'wikidata') {
    return 'wikidata';
  }
  return 'basic';
}
const {
  loadSitemaps
} = require('./sitemap');
const {
  CrawlerState
} = require('./CrawlerState');
const {
  RobotsAndSitemapCoordinator
} = require('./RobotsAndSitemapCoordinator');
const {
  setPriorityConfigProfile
} = require('../utils/priorityConfig');

const QueueManager = require('./QueueManager');
const {
  UrlEligibilityService
} = require('./UrlEligibilityService');
const {
  FetchPipeline
} = require('./FetchPipeline');
const {
  CrawlerEvents
} = require('./CrawlerEvents');
const {
  CrawlerTelemetry
} = require('./CrawlerTelemetry');
const {
  LinkExtractor
} = require('./LinkExtractor');
const {
  ArticleProcessor
} = require('./ArticleProcessor');
const {
  NavigationDiscoveryService
} = require('./NavigationDiscoveryService');
const {
  ContentAcquisitionService
} = require('./ContentAcquisitionService');
const ArticleSignalsService = require('./ArticleSignalsService');
const {
  sleep,
  nowMs,
  jitter,
  parseRetryAfter
} = require('./utils');
const {
  AdaptiveSeedPlanner
} = require('./planner/AdaptiveSeedPlanner');
const {
  PlannerBootstrap
} = require('./planner/PlannerBootstrap');
const {
  PatternInference
} = require('./planner/PatternInference');
const {
  CountryHubPlanner
} = require('./planner/CountryHubPlanner');
const {
  HubSeeder
} = require('./planner/HubSeeder');
const {
  PlannerTelemetryBridge
} = require('./planner/PlannerTelemetryBridge');
const {
  PlannerOrchestrator
} = require('./planner/PlannerOrchestrator');
const {
  TargetedAnalysisRunner
} = require('./planner/TargetedAnalysisRunner');
const {
  NavigationDiscoveryRunner
} = require('./planner/navigation/NavigationDiscoveryRunner');
const {
  MilestoneTracker
} = require('./MilestoneTracker');
const {
  PageExecutionService
} = require('./PageExecutionService');
const {
  IntelligentPlanRunner
} = require('./IntelligentPlanRunner');
const {
  WorkerRunner
} = require('./WorkerRunner');
const {
  StartupProgressTracker
} = require('./StartupProgressTracker');

const TEN_MINUTES_MS = 10 * 60 * 1000;

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

class NewsCrawler extends Crawler {
  constructor(startUrl, options = {}, services = null) {
    // Call base class constructor first
    super(startUrl, options);
    
    this.domain = new URL(startUrl).hostname;
    this.domainNormalized = normalizeHost(this.domain);
    this.baseUrl = `${new URL(startUrl).protocol}//${this.domain}`;
    
    // Handle nested logging config from config.json (flatten for schema validation)
    const effectiveOptions = { ...options };
    if (options.logging && typeof options.logging === 'object') {
      if (options.logging.queue !== undefined && effectiveOptions.loggingQueue === undefined) {
        effectiveOptions.loggingQueue = options.logging.queue;
      }
      if (options.logging.network !== undefined && effectiveOptions.loggingNetwork === undefined) {
        effectiveOptions.loggingNetwork = options.logging.network;
      }
      if (options.logging.fetching !== undefined && effectiveOptions.loggingFetching === undefined) {
        effectiveOptions.loggingFetching = options.logging.fetching;
      }
    }

    // Apply schema-driven option validation
    const opts = buildOptions(effectiveOptions, crawlerOptionsSchema);
    this._resolvedOptions = opts;
    this.jobId = opts.jobId;

    // Configuration
    this.slowMode = opts.slowMode;
    this.rateLimitMs = opts.rateLimitMs;
    this.maxDepth = opts.maxDepth;
    this.dataDir = opts.dataDir;
    this._lastProgressEmitAt = 0;
    // Concurrency: for regular crawls = number of parallel workers
    // For specialized crawls (gazetteer, geography) = maximum allowed (may use less)
    this.concurrency = opts.concurrency;
    this.maxQueue = opts.maxQueue;
    this.retryLimit = opts.retryLimit;
    this.backoffBaseMs = opts.backoffBaseMs;
    this.backoffMaxMs = opts.backoffMaxMs;
    this.maxDownloads = opts.maxDownloads;
    this.maxAgeMs = opts.maxAgeMs;
    this.maxAgeArticleMs = opts.maxAgeArticleMs;
    this.maxAgeHubMs = opts.maxAgeHubMs;
    this.dbPath = opts.dbPath || path.join(this.dataDir, 'news.db');
    this.fastStart = opts.fastStart;
    this.enableDb = opts.enableDb;
    this.preferCache = opts.preferCache;
    this.useSitemap = opts.useSitemap;
    this.sitemapOnly = opts.sitemapOnly;
    this.sitemapMaxUrls = opts.sitemapMaxUrls;
    this.hubMaxPages = opts.hubMaxPages;
    this.hubMaxDays = opts.hubMaxDays;
    this.intMaxSeeds = opts.intMaxSeeds;
    this.intTargetHosts = opts.intTargetHosts;
    this.plannerVerbosity = opts.plannerVerbosity;
    this.limitCountries = opts.limitCountries;
    this.targetCountries = opts.targetCountries && opts.targetCountries.length ? opts.targetCountries : null;
    this.gazetteerStageFilter = Array.isArray(opts.gazetteerStages) && opts.gazetteerStages.length
      ? new Set(opts.gazetteerStages.map((stage) => String(stage).toLowerCase()))
      : null;

    this.urlAnalysisCache = this.state.getUrlAnalysisCache();
    this.urlDecisionCache = this.state.getUrlDecisionCache();
    this.usePriorityQueue = this.concurrency > 1;
    this.startUrlNormalized = null;
    this.isProcessing = false;
    this.dbAdapter = null;
    this.exitSummary = null;
    if (this.loggingQueue === false) {
      console.log('NewsCrawler: Queue logging disabled');
    }

    const hasInjectedServices = services && typeof services === 'object';
    const shouldSkipWiring = Boolean(options._skipWiring) || hasInjectedServices;
    if (shouldSkipWiring) {
      if (hasInjectedServices) {
        this._applyInjectedServices(services);
      }
      return;
    }

    wireCrawlerServices(this, { rawOptions: options, resolvedOptions: opts });

    this._configureHubFreshness();
  }

  _applyInjectedServices(services = {}) {
    if (!services || typeof services !== 'object') {
      return;
    }

    const assign = (key) => {
      if (Object.prototype.hasOwnProperty.call(services, key)) {
        this[key] = services[key];
      }
    };

    const keys = [
      'gazetteerManager',
      'gazetteerVariant',
      'isGazetteerMode',
      'countryHubExclusiveMode',
      'structureOnly',
      'plannerEnabled',
      'skipQueryUrls',
      'seedStartFromCache',
      'cachedSeedUrls',
      '_gazetteerPipelineConfigured',
      'gazetteerPlanner',
      'urlPolicy',
      'deepUrlAnalyzer',
      'urlDecisionService',
      'articleSignals',
      'enhancedFeatures',
      'cache',
      'linkExtractor',
      'events',
      'telemetry',
      'milestoneTracker',
      'errorTracker',
      'domainThrottle',
      'articleProcessor',
      'navigationDiscoveryService',
      'contentAcquisitionService',
      'adaptiveSeedPlanner',
      'urlEligibilityService',
      'queue',
      'robotsCoordinator',
      'fetchPipeline',
      'pageExecutionService'
    ];

    for (const key of keys) {
      assign(key);
    }

    if (this.isGazetteerMode && typeof this._setupGazetteerModeController === 'function') {
      this._setupGazetteerModeController({});
    }
  }

  get stats() {
    return this.state.getStats();
  }

  set stats(nextStats) {
    this.state.replaceStats(nextStats);
  }

  get robotsRules() {
    return this.robotsCoordinator?.robotsRules || null;
  }

  set robotsRules(rules) {
    if (this.robotsCoordinator) {
      this.robotsCoordinator.robotsRules = rules;
    }
  }

  get robotsTxtLoaded() {
    return !!(this.robotsCoordinator?.robotsTxtLoaded);
  }

  set robotsTxtLoaded(flag) {
    if (this.robotsCoordinator) {
      this.robotsCoordinator.robotsTxtLoaded = !!flag;
    }
  }

  get sitemapUrls() {
    return this.robotsCoordinator?.sitemapUrls || [];
  }

  set sitemapUrls(urls) {
    if (this.robotsCoordinator) {
      this.robotsCoordinator.sitemapUrls = is_array(urls) ? urls : [];
    }
  }

  get sitemapDiscovered() {
    return this.robotsCoordinator?.sitemapDiscovered || 0;
  }

  set sitemapDiscovered(count) {
    if (this.robotsCoordinator) {
      this.robotsCoordinator.sitemapDiscovered = typeof count === 'number' ? count : 0;
    }
  }

  get featuresEnabled() {
    return this.enhancedFeatures?.getEnabledFeatures() || DEFAULT_FEATURE_FLAGS;
  }

  get enhancedDbAdapter() {
    return this.enhancedFeatures?.getEnhancedDbAdapter() || null;
  }

  get problemClusteringService() {
    return this.enhancedFeatures?.getProblemClusteringService() || null;
  }

  get plannerKnowledgeService() {
    return this.enhancedFeatures?.getPlannerKnowledgeService() || null;
  }

  get problemResolutionService() {
    return this.enhancedFeatures?.getProblemResolutionService() || null;
  }

  get crawlPlaybookService() {
    return this.enhancedFeatures?.getCrawlPlaybookService() || null;
  }

  get countryHubBehavioralProfile() {
    return this.enhancedFeatures?.getCountryHubBehavioralProfile() || null;
  }

  get seededHubUrls() {
    return this.state.getSeededHubSet();
  }

  set seededHubUrls(iterable) {
    this.state.replaceSeededHubs(iterable);
  }

  get problemCounters() {
    return this.state.getProblemCounters();
  }

  set problemCounters(iterable) {
    this.state.replaceProblemCounters(iterable);
  }

  get problemSamples() {
    return this.state.getProblemSamples();
  }

  set problemSamples(iterable) {
    this.state.replaceProblemSamples(iterable);
  }

  get _intelligentPlanSummary() {
    return this.state.getIntelligentPlanSummary();
  }

  set _intelligentPlanSummary(summary) {
    this.state.setIntelligentPlanSummary(summary);
  }

  get fatalIssues() {
    return this.state.getFatalIssues();
  }

  set fatalIssues(list) {
    this.state.replaceFatalIssues(list);
  }

  get errorSamples() {
    return this.state.getErrorSamples();
  }

  set errorSamples(list) {
    this.state.replaceErrorSamples(list);
  }

  get lastError() {
    return this.state.getLastError();
  }

  set lastError(error) {
    this.state.setLastError(error);
  }

  // --- Analysis helpers: use both URL and content signals ---
  _computeUrlSignals(rawUrl) {
    return this.articleSignals.computeUrlSignals(rawUrl);
  }

  _computeContentSignals($, html) {
    return this.articleSignals.computeContentSignals($, html);
  }

  _combineSignals(urlSignals, contentSignals, opts = {}) {
    return this.articleSignals.combineSignals(urlSignals, contentSignals, opts);
  }

  _resolveGazetteerVariant(crawlType) {
    return this.gazetteerManager.resolveVariant(crawlType);
  }

  _applyGazetteerDefaults(options = {}) {
    this.gazetteerManager.applyDefaults(options);
  }

  _shouldBypassDepth(info = {}) {
    return this.gazetteerManager.shouldBypassDepth(info);
  }

  _setupGazetteerModeController(options = {}) {
    this.gazetteerManager.setupController(options);
  }

  _configureGazetteerPipeline() {
    this.gazetteerManager.configurePipeline();
  }

  async _runGazetteerMode() {
    return this.gazetteerManager.run();
  }

  _noteDepthVisit(normalizedUrl, depth) {
    this.state.noteDepthVisit(normalizedUrl, depth);
  }

  _recordError(sample) {
    this.errorTracker?.record(sample);
  }

  _handleConnectionReset(url, error) {
    this.errorTracker?.handleConnectionReset(url, error);
  }

  _determineOutcomeError() {
    return this.errorTracker?.determineOutcomeError(this.stats) || null;
  }

  _recordExit(reason, details = {}) {
    if (!reason || this.exitSummary) {
      return;
    }
    const payload = typeof details === 'object' && details !== null ? { ...details } : {};
    this.exitSummary = {
      reason,
      at: new Date().toISOString(),
      details: payload
    };
    try {
      const telemetryDetails = {
        reason,
        ...payload
      };
      this.telemetry?.milestoneOnce?.(`crawl-exit:${reason}`, {
        kind: 'crawl-exit',
        message: `Crawler exit: ${reason}`,
        details: telemetryDetails
      });
    } catch (_) {}
  }

  _describeExitSummary(summary) {
    if (!summary) {
      return 'not recorded';
    }
    const parts = [summary.reason];
    const details = summary.details || {};
    if (typeof details.downloads === 'number') {
      parts.push(`downloads=${details.downloads}`);
    }
    if (typeof details.limit === 'number') {
      parts.push(`limit=${details.limit}`);
    }
    if (typeof details.visited === 'number') {
      parts.push(`visited=${details.visited}`);
    }
    if (details.message) {
      parts.push(details.message);
    }
    return parts.filter(Boolean).join(' | ');
  }

  getExitSummary() {
    if (!this.exitSummary) {
      return null;
    }
    const clonedDetails = this.exitSummary.details && typeof this.exitSummary.details === 'object'
      ? { ...this.exitSummary.details }
      : {};
    return {
      ...this.exitSummary,
      details: clonedDetails
    };
  }

  _getUrlDecision(rawUrl, context = {}) {
    return this.urlDecisionService.getDecision(rawUrl, context);
  }

  // --- Per-domain rate limiter state management ---

  _getDomainState(host) {
    return this.domainThrottle.getDomainState(host);
  }

  _safeHostFromUrl(url) {
    return this.domainThrottle.safeHostFromUrl(url);
  }

  _getHostResumeTime(host) {
    return this.domainThrottle.getHostResumeTime(host);
  }

  _isHostRateLimited(host) {
    return this.domainThrottle.isHostRateLimited(host);
  }


  /**
   * Public lifecycle method to ensure clean shutdown of all resources.
   * Call this when the crawler instance is no longer needed, especially in tests or scripts.
   */
  close() {
    // Stop processing
    this.state.setPaused(true);
    this.state.requestAbort();

    // Close database
    if (this.dbAdapter && typeof this.dbAdapter.close === 'function') {
      try {
        this.dbAdapter.close();
      } catch (err) {
        console.error('Error closing DB adapter:', err);
      }
    }

    // Cleanup enhanced features (timers, observers)
    try {
      this._cleanupEnhancedFeatures();
    } catch (err) {
      console.error('Error cleaning up enhanced features:', err);
    }
  }

  async init() {
    await this._trackStartupStage('prepare-data', 'Preparing data directory', async () => {
      await fs.mkdir(this.dataDir, {
        recursive: true
      });
    });

    if (this.enableDb) {
      await this._trackStartupStage('db-open', 'Opening crawl database', async () => {
        if (!this.dbAdapter) {
          this.dbAdapter = createCrawlerDb({
            dbPath: this.dbPath,
            fastStart: this.fastStart,
            cache: this.cache,
            domain: this.domain,
            emitProblem: (problem) => {
              try {
                this.telemetry.problem(problem);
              } catch (_) {}
            },
            onFatalIssue: (issue) => {
              try {
                this.state.addFatalIssue(issue);
              } catch (_) {}
            }
          });
        }
        await this.dbAdapter.init();
        if (!this.dbAdapter.isEnabled()) {
          this.enableDb = false;
          return { status: 'skipped', message: 'Database adapter disabled' };
        }
        if (this.isGazetteerMode) {
          await this._trackStartupStage('db-gazetteer-schema', 'Ensuring gazetteer schema ready', async () => {
            try {
              log.debug('[GAZETTEER-DEBUG] Getting database handle for ensureGazetteer...');
              const sqliteDb = this.dbAdapter.getDb();
              const rawDb = sqliteDb && sqliteDb.db ? sqliteDb.db : sqliteDb;
              if (!rawDb) {
                log.debug('[GAZETTEER-DEBUG] No database handle available');
                return { status: 'skipped', message: 'No database handle available' };
              }
              log.debug('[GAZETTEER-DEBUG] About to call ensureGazetteer()...');
              ensureGazetteer(rawDb);
              log.debug('[GAZETTEER-DEBUG] ensureGazetteer() returned successfully');
              this.telemetry.milestoneOnce('gazetteer-schema:ready', {
                kind: 'gazetteer-schema',
                message: 'Gazetteer tables verified',
                details: {
                  jobId: this.jobId,
                  mode: this.gazetteerVariant || 'geography'
                }
              });
              return { status: 'completed' };
            } catch (err) {
              log.debug('[GAZETTEER-DEBUG] ensureGazetteer() threw error:', err);
              const message = err?.message || String(err);
              this.telemetry.problem({
                kind: 'gazetteer-schema-failed',
                scope: this.domain,
                message,
                details: { stack: err?.stack || null }
              });
              throw err;
            }
          });
        }
        return { status: 'completed' };
      });

      if (this.enableDb) {
        await this._trackStartupStage('enhanced-features', 'Starting enhanced features', async () => {
          await this._initializeEnhancedFeatures();
        });
      } else {
        this._skipStartupStage('enhanced-features', 'Starting enhanced features', 'Database disabled');
      }
    } else {
      this._skipStartupStage('db-open', 'Opening crawl database', 'Database disabled');
      this._skipStartupStage('enhanced-features', 'Starting enhanced features', 'Database disabled');
    }

    this._configureHubFreshness({ preferEnhanced: true });

    try {
      this.startUrlNormalized = this.normalizeUrl(this.startUrl) || this.startUrl;
      if (this.startUrlNormalized) {
        this.state.addSeededHub(this.startUrlNormalized);
      }
    } catch (_) {
      this.startUrlNormalized = this.startUrl;
    }

    await this._hydrateResolvedHubsFromHistory();

    if (this.isGazetteerMode) {
      this._skipStartupStage('robots', 'Loading robots.txt', 'Gazetteer mode uses external data sources');
    } else {
      await this._trackStartupStage('robots', 'Loading robots.txt', async () => {
        if (!this.robotsCoordinator) {
          return { status: 'skipped', message: 'Robots coordinator unavailable' };
        }
        await this.robotsCoordinator.loadRobotsTxt();
        return { status: 'completed' };
      });
    }

    console.log(`Starting crawler for ${this.domain}`);
    console.log(`Data will be saved to: ${this.dataDir}`);
    if (this.isGazetteerMode) {
      console.log(`Gazetteer crawl mode enabled (${this.gazetteerVariant || 'geography'})`);
    }
  }

  async loadRobotsTxt() {
    if (!this.robotsCoordinator) return;
    await this.robotsCoordinator.loadRobotsTxt();
  }

  async loadSitemapsAndEnqueue() {
    if (!this.robotsCoordinator) return;
    await this.robotsCoordinator.loadSitemapsAndEnqueue();
  }

  isAllowed(url) {
    if (!this.robotsCoordinator) return true;
    return this.robotsCoordinator.isAllowed(url);
  }

  isOnDomain(url) {
    try {
      const urlObj = new URL(url, this.baseUrl);
      return urlObj.hostname === this.domain;
    } catch {
      return false;
    }
  }

  normalizeUrl(url, context = {}) {
    const phase = context && context.phase ? context.phase : 'normalize';
    const decision = this._getUrlDecision(url, {
      ...context,
      phase
    });
    const analysis = decision?.analysis;
    if (!analysis || analysis.invalid) return null;
    return analysis.normalized;
  }

  emitProgress(force = false) {
    if (this.structureOnly) {
      const snapshot = typeof this.state?.getStructureSnapshot === 'function'
        ? this.state.getStructureSnapshot()
        : null;
      if (snapshot) {
        this.telemetry.progress({
          force: !!force,
          patch: {
            structure: snapshot
          }
        });
        return;
      }
    }
    this.telemetry.progress(force);
  }

  _emitStartupProgress(progressPayload, statusText = null) {
    if (!progressPayload) return;
    if (!this.telemetry || typeof this.telemetry.progress !== 'function') return;
    const patch = {};
    if (progressPayload.stages) {
      patch.startup = {
        stages: is_array(progressPayload.stages) ? progressPayload.stages : [],
        summary: progressPayload.summary || null
      };
    }
    if (statusText) {
      patch.statusText = statusText;
    }
    if (!patch.startup && !patch.statusText) {
      return;
    }
    this.telemetry.progress({
      force: true,
      stage: 'preparing',
      patch
    });
  }

  async _trackStartupStage(id, label, fn) {
    if (typeof fn !== 'function') {
      if (this.startupTracker) {
        this.startupTracker.skipStage(id, { label, message: 'No operation' });
      }
      return undefined;
    }
    if (this.startupTracker) {
      this.startupTracker.startStage(id, { label });
    }
    // Emit telemetry: stage started
    this.telemetry.telemetry({
      event: 'startup-stage',
      status: 'started',
      severity: 'info',
      message: label,
      details: { stage: id, crawlType: this.crawlType }
    });
    try {
      const result = await fn();
      if (this.startupTracker) {
        const status = result && typeof result === 'object' && typeof result.status === 'string'
          ? result.status.toLowerCase()
          : 'completed';
        const meta = {
          label,
          message: result && typeof result === 'object' && result.message ? result.message : undefined,
          details: result && typeof result === 'object' && result.details ? result.details : undefined
        };
        if (status === 'skipped') {
          this.startupTracker.skipStage(id, meta);
          this.telemetry.telemetry({
            event: 'startup-stage',
            status: 'skipped',
            severity: 'info',
            message: `${label} (skipped)`,
            details: { stage: id, reason: meta.message }
          });
        } else if (status === 'failed') {
          const errMessage = result && typeof result === 'object' && result.error ? result.error : meta.message || 'Stage failed';
          this.startupTracker.failStage(id, errMessage, meta);
          this.telemetry.telemetry({
            event: 'startup-stage',
            status: 'failed',
            severity: 'error',
            message: `${label} failed`,
            details: { stage: id, error: errMessage }
          });
        } else {
          this.startupTracker.completeStage(id, meta);
          this.telemetry.telemetry({
            event: 'startup-stage',
            status: 'completed',
            severity: 'info',
            message: `${label} complete`,
            details: { stage: id }
          });
        }
      }
      return result;
    } catch (error) {
      if (this.startupTracker) {
        this.startupTracker.failStage(id, error, { label });
      }
      this.telemetry.telemetry({
        event: 'startup-stage',
        status: 'failed',
        severity: 'error',
        message: `${label} failed with exception`,
        details: { stage: id, error: error?.message || String(error) }
      });
      throw error;
    }
  }

  _skipStartupStage(id, label, message = null) {
    if (!this.startupTracker) return;
    this.startupTracker.skipStage(id, { label, message });
  }

  _markStartupComplete(message = null) {
    if (!this.startupTracker) return;
    this.startupTracker.markComplete(message);
  }

  _getCoverageSummary() {
    try {
      const stats = typeof this.state?.getStats === 'function' ? this.state.getStats() : null;
      const hubStats = typeof this.state?.getHubVisitStats === 'function' ? this.state.getHubVisitStats() : null;
      if (!stats && !hubStats) {
        return null;
      }
      const depth2Visited = stats?.depth2PagesProcessed || 0;
      const seededCount = hubStats?.seeded || 0;
      const visitedCount = hubStats?.visited || 0;
      const percentVisited = seededCount > 0 ? Math.round((visitedCount / seededCount) * 100) : null;
      const perKind = [];
      if (hubStats?.perKind && typeof hubStats.perKind === 'object') {
        for (const [kind, info] of Object.entries(hubStats.perKind)) {
          const seeded = info?.seeded || 0;
          const visited = info?.visited || 0;
          perKind.push({
            kind,
            seeded,
            visited,
            percent: seeded > 0 ? Math.round((visited / seeded) * 100) : null
          });
        }
      }
      return {
        depth2: {
          visited: depth2Visited,
          label: depth2Visited === 1 ? 'page at depth 2' : 'pages at depth 2'
        },
        hubs: {
          seeded: seededCount,
          visited: visitedCount,
          percentVisited,
          perKind
        },
        samples: {
          seeded: is_array(hubStats?.seededSample) ? hubStats.seededSample.slice(0, 5) : [],
          visited: is_array(hubStats?.visitedSample) ? hubStats.visitedSample.slice(0, 5) : []
        },
        updatedAt: Date.now()
      };
    } catch (_) {
      return null;
    }
  }

  pause() {
    this.state.setPaused(true);
    this.emitProgress(true);
  }
  resume() {
    this.state.setPaused(false);
    this.emitProgress(true);
  }
  isPaused() {
    return this.state.isPaused();
  }
  isAbortRequested() {
    return this.state.isAbortRequested();
  }

  requestAbort(reason, details = null) {
    if (this.state.isAbortRequested()) return;
    this.state.requestAbort();
    if (reason) {
      try {
        console.log(`Abort requested: ${reason}`);
      } catch (_) {}
    }
    try {
      this.queue?.clear?.();
    } catch (_) {}
    if (details && typeof details === 'object') {
      this.state.addFatalIssue({
        kind: reason || 'abort',
        message: details.message || reason || 'abort',
        details
      });
    }
    this.emitProgress(true);
  }

  // JSON file saving removed

  // Try to retrieve a cached article (DB only). Returns {html, crawledAt, source} or null.
  async getCachedArticle(url) {
    return this.cache.get(url);
  }

  looksLikeArticle(url) {
    return this.articleSignals.looksLikeArticle(url);
  }

  async processPage(url, depth = 0, context = {}) {
    if (!this.pageExecutionService) {
      throw new Error('PageExecutionService is not initialized');
    }
    return this.pageExecutionService.processPage({
      url,
      depth,
      context
    });
  }

  computePriority({
    type,
    depth,
    discoveredAt,
    bias = 0,
    url = null,
    meta = null
  }) {
    // Base priority calculation (backward compatible)
    let kind = type;
    if (type && typeof type === 'object') {
      kind = type.kind || type.type || type.intent;
    }
    const normalizedKind = typeof kind === 'string' ? kind : 'nav';
    let typeWeight;
    switch (normalizedKind) {
      case 'article':
        typeWeight = 0;
        break;
      case 'hub-seed':
        typeWeight = 4;
        break;
      case 'history':
        typeWeight = 6;
        break;
      case 'nav':
        typeWeight = 10;
        break;
      case 'refresh':
        typeWeight = 25;
        break;
      default:
        typeWeight = 12;
        break;
    }
    const depthPenalty = depth;
    const tieBreaker = discoveredAt || 0;
    return typeWeight + depthPenalty + bias + tieBreaker * 1e-9;
  }

  _handlePolicySkip(decision, {
    depth,
    queueSize
  }) {
    const analysis = decision?.analysis || {};
    const normalized = analysis.normalized || analysis.raw || null;
    let host = null;
    try {
      if (normalized) host = new URL(normalized).hostname;
    } catch (_) {}
    this.telemetry.queueEvent({
      action: 'drop',
      url: normalized || analysis.raw,
      depth,
      host,
      reason: 'query-skip',
      queueSize,
      alias: decision.guessedUrl || analysis.guessedWithoutQuery || null
    });
    try {
      this.deepUrlAnalyzer?.analyze(decision);
    } catch (_) {}
    if (normalized) {
      try {
        // Suppressed: too verbose for CLI
      } catch (_) {}
    }
  }

  enqueueRequest({
    url,
    depth,
    type,
    meta = null,
    priority
  }) {
    if (this.structureOnly) {
      const kind = typeof type === 'string'
        ? type
        : (type && typeof type === 'object' && typeof type.kind === 'string')
          ? type.kind
          : null;
      if (kind === 'article' || kind === 'refresh') {
        try {
          this.telemetry.queueEvent({
            action: 'drop',
            url,
            depth,
            host: this._safeHostFromUrl(url),
            reason: 'structure-skip'
          });
        } catch (_) {}
        try {
          this.state?.incrementStructureArticleSkipped?.();
        } catch (_) {}
        return false;
      }
    }

    const normalizedMeta = this._applyHubFreshnessPolicy({
      url,
      depth,
      type,
      meta
    });

    return this.queue.enqueue({
      url,
      depth,
      type,
      meta: normalizedMeta,
      priority
    });
  }

  _applyHubFreshnessPolicy({ depth, type, meta }) {
    if (!this.hubFreshnessConfig) {
      return meta;
    }

    if (meta != null && typeof meta !== 'object') {
      return meta;
    }

    const config = this.hubFreshnessConfig || {};
    const baseMeta = meta && typeof meta === 'object' ? { ...meta } : {};
    const isHubLike = this._isHubLikeRequest({ depth, type, meta: baseMeta });

    if (!isHubLike) {
      return meta;
    }

    let changed = false;
    const hasFetchPolicy = typeof baseMeta.fetchPolicy === 'string' && baseMeta.fetchPolicy;
    const fallbackPrefersCache = config.fallbackToCacheOnFailure !== false;
    const maxAgeDefault = Number.isFinite(config.maxCacheAgeMs) ? config.maxCacheAgeMs : null;
    const firstPageMaxAge = Number.isFinite(config.firstPageMaxAgeMs) ? config.firstPageMaxAgeMs : null;
    const effectiveMaxAge = depth === 0
      ? (firstPageMaxAge != null ? firstPageMaxAge : maxAgeDefault)
      : maxAgeDefault;

    if (effectiveMaxAge != null && !(typeof baseMeta.maxCacheAgeMs === 'number' && Number.isFinite(baseMeta.maxCacheAgeMs))) {
      baseMeta.maxCacheAgeMs = effectiveMaxAge;
      changed = true;
    }

    const shouldForceNetwork = depth === 0 && config.refreshOnStartup !== false;
    if (shouldForceNetwork && !hasFetchPolicy) {
      baseMeta.fetchPolicy = 'network-first';
      changed = true;
    }

    if (!fallbackPrefersCache && baseMeta.fallbackToCache !== false) {
      baseMeta.fallbackToCache = false;
      changed = true;
    }

    if (!changed) {
      return meta;
    }

    return baseMeta;
  }

  _isHubLikeRequest({ depth, type, meta }) {
    if (depth === 0) {
      return true;
    }

    const roleCandidate = typeof meta?.role === 'string' ? meta.role.toLowerCase() : null;
    const kind = this._resolveRequestKind(type, meta);

    if (kind && (kind.includes('hub') || kind === 'nav' || kind === 'navigation')) {
      return true;
    }

    if (roleCandidate && (roleCandidate.includes('hub') || roleCandidate === 'nav' || roleCandidate === 'navigation')) {
      return true;
    }

    return false;
  }

  _resolveRequestKind(type, meta) {
    const candidates = [
      typeof meta?.kind === 'string' ? meta.kind : null,
      typeof meta?.type === 'string' ? meta.type : null,
      typeof meta?.intent === 'string' ? meta.intent : null,
      typeof type === 'string' ? type : null
    ];

    for (const value of candidates) {
      if (value) {
        return value.toLowerCase();
      }
    }

    return null;
  }

  _configureHubFreshness({ preferEnhanced = false } = {}) {
    const previousManager = this._hubFreshnessManager;
    const manager = this._selectHubFreshnessManager({ preferEnhanced });

    if (manager !== previousManager) {
      this._disposeHubFreshnessWatcher();
      if (previousManager && previousManager === this._ownedHubFreshnessManager && previousManager !== manager) {
        try {
          previousManager.close();
        } catch (_) {}
        this._ownedHubFreshnessManager = null;
      }
      this._hubFreshnessManager = manager;
      this._bindHubFreshnessWatcher(manager);
    }

    this._applyHubFreshnessFromManager(manager);
  }

  _selectHubFreshnessManager({ preferEnhanced = false } = {}) {
    const enhancedManager = this.enhancedFeatures?.configManager || null;
    if (enhancedManager && (preferEnhanced || !this._ownedHubFreshnessManager)) {
      return enhancedManager;
    }

    if (this._ownedHubFreshnessManager) {
      return this._ownedHubFreshnessManager;
    }

    try {
      this._ownedHubFreshnessManager = new ConfigManager(null, {
        watch: !process.env.JEST_WORKER_ID,
        inMemory: false
      });
    } catch (error) {
      console.warn('Failed to initialize hub freshness ConfigManager:', error?.message || String(error));
      this._ownedHubFreshnessManager = null;
    }

    return this._ownedHubFreshnessManager || enhancedManager || null;
  }

  _applyHubFreshnessFromManager(manager) {
    if (!manager || typeof manager.getHubFreshnessConfig !== 'function') {
      this.hubFreshnessConfig = null;
      return;
    }

    try {
      const snapshot = manager.getHubFreshnessConfig();
      this.hubFreshnessConfig = snapshot && typeof snapshot === 'object' ? { ...snapshot } : null;
    } catch (error) {
      console.warn('Failed to load hub freshness config:', error?.message || String(error));
      this.hubFreshnessConfig = null;
    }
  }

  _bindHubFreshnessWatcher(manager) {
    if (!manager || typeof manager.addWatcher !== 'function') {
      this._hubFreshnessWatcherDispose = null;
      return;
    }

    this._hubFreshnessWatcherDispose = manager.addWatcher(() => {
      this._applyHubFreshnessFromManager(manager);
    });
  }

  _disposeHubFreshnessWatcher() {
    if (typeof this._hubFreshnessWatcherDispose === 'function') {
      try {
        this._hubFreshnessWatcherDispose();
      } catch (_) {}
    }
    this._hubFreshnessWatcherDispose = null;
  }

  _cleanupHubFreshnessConfig() {
    this._disposeHubFreshnessWatcher();
    if (this._ownedHubFreshnessManager) {
      try {
        this._ownedHubFreshnessManager.close();
      } catch (_) {}
      this._ownedHubFreshnessManager = null;
    }
    this._hubFreshnessManager = null;
    this.hubFreshnessConfig = null;
  }


  async acquireRateToken() {
    const now = nowMs();
    const earliest = this.lastRequestTime + this.rateLimitMs;
    const wait = Math.max(0, earliest - now);
    if (wait > 0) await sleep(wait);
    this.lastRequestTime = nowMs();
  }

  // Per-domain limiter: waits if a 429 backoff is active or if the current per-host interval requires spacing.
  async acquireDomainToken(host) {
    await this.domainThrottle.acquireToken(host);
  }

  note429(host, retryAfterMs) {
    this.domainThrottle.note429(host, retryAfterMs);
  }

  noteSuccess(host) {
    this.domainThrottle.noteSuccess(host);
  }

  _pullNextWorkItem() {
    return this.queue.pullNext();
  }

  _ensureWorkerRunner() {
    if (!this.workerRunner) {
      this.workerRunner = new WorkerRunner({
        queue: this.queue,
        processPage: (url, depth, context) => this.processPage(url, depth, context),
        computePriority: (args) => this.computePriority(args),
        retryLimit: this.retryLimit,
        backoffBaseMs: this.backoffBaseMs,
        backoffMaxMs: this.backoffMaxMs,
        getStats: () => this.stats,
        getMaxDownloads: () => this.maxDownloads,
        telemetry: this.telemetry,
        sleep,
        nowMs,
        jitter,
        isPaused: () => this.isPaused(),
        isAbortRequested: () => this.isAbortRequested(),
        emitProgress: () => this.emitProgress(),
        safeHostFromUrl: (url) => this._safeHostFromUrl(url),
        getQueueSize: () => this.queue.size(),
        onBusyChange: (delta) => {
          this.busyWorkers = Math.max(0, this.busyWorkers + delta);
        },
        onExitReason: (reason, details) => this._recordExit(reason, details)
      });
    }
    return this.workerRunner;
  }

  _ensureIntelligentPlanRunner() {
    if (!this.intelligentPlanRunner) {
      // Check if APS should be used (from config via EnhancedFeaturesManager)
      const featureFlags = this.enhancedFeatures?.configManager?.getFeatureFlags?.() || {};
      const useAPS = featureFlags.advancedPlanningSuite === true;
      
      // Get country hub gap service if available
      const countryHubGapService = this.enhancedFeatures?.getCountryHubGapService?.() || null;
      
      this.intelligentPlanRunner = new IntelligentPlanRunner({
        telemetry: this.telemetry,
        domain: this.domain,
        baseUrl: this.baseUrl,
        startUrl: this.startUrl,
        plannerEnabled: this.plannerEnabled,
        plannerVerbosity: this.plannerVerbosity,
        intTargetHosts: this.intTargetHosts,
        fetchPage: ({ url, context }) => this.fetchPipeline.fetch({ url, context }),
        getCachedArticle: (url) => this.getCachedArticle(url),
        dbAdapter: this.dbAdapter,
        plannerKnowledgeService: this.plannerKnowledgeService,
        countryHubGapService,
        useAPS,
        enqueueRequest: (request) => this.enqueueRequest(request),
        normalizeUrl: (url) => this.normalizeUrl(url),
        state: this.state,
        intMaxSeeds: this.intMaxSeeds,
        logger: console,
        PlannerTelemetryBridge,
        PlannerOrchestrator,
        PlannerBootstrap,
        PatternInference,
        CountryHubPlanner,
        HubSeeder,
        TargetedAnalysisRunner,
        NavigationDiscoveryRunner,
        enableTargetedAnalysis: !this.structureOnly
      });
    }
    return this.intelligentPlanRunner;
  }

  async crawlConcurrent() {
    if (!this._shouldUseSequenceRunner()) {
      return this._runLegacyConcurrent();
    }

    if (this.isGazetteerMode) {
      await this._runCrawlSequence('gazetteer');
      return;
    }

    let sequenceError = null;

    try {
      await this._runCrawlSequence('concurrent');
    } catch (error) {
      sequenceError = error;
    }

    let finalizeError = null;
    try {
      await this._finalizeRun({ includeCleanup: false });
    } catch (error) {
      finalizeError = error;
    }

    if (sequenceError) {
      throw sequenceError;
    }
    if (finalizeError) {
      throw finalizeError;
    }
  }


  async _runLegacyConcurrent() {
    await this.init();
    if (this.isGazetteerMode) {
      await this._runGazetteerMode();
      return;
    }
    await this._runPlannerStage();
    await this._runSitemapStage();
    this._seedInitialRequest({ respectSitemapOnly: true });
    this._markStartupComplete();
    await this._runConcurrentWorkers();
    await this._finalizeRun({ includeCleanup: false });
  }

  async _runLegacySequential() {
    await this.init();
    await this._runPlannerStage();
    await this._runSitemapStage();
    this._seedInitialRequest({ respectSitemapOnly: false });
    this._markStartupComplete();
    await this._runSequentialLoop();
    await this._finalizeRun({ includeCleanup: true });
  }

  _shouldUseSequenceRunner() {
    if (!this.useSequenceRunner) {
      return false;
    }
    const flag = process.env.NEWS_CRAWLER_SEQUENCE_DISABLED;
    if (flag == null) {
      return true;
    }
    const normalized = String(flag).trim().toLowerCase();
    if (normalized === '' || normalized === '0' || normalized === 'false' || normalized === 'off') {
      return true;
    }
    return false;
  }

  _ensureStartupSequenceRunner() {
    if (this._startupSequenceRunner) {
      return this._startupSequenceRunner;
    }

    const wrap = (handler) => async (_startUrl, overrides = {}) => {
      try {
        const result = await handler.call(this, overrides || {});
        if (result && typeof result === 'object' && typeof result.status === 'string') {
          return result;
        }
        if (result && typeof result === 'object') {
          return { status: 'ok', ...result };
        }
        return { status: 'ok' };
      } catch (error) {
        this._lastSequenceError = error;
        throw error;
      }
    };

    const operations = {
      init: wrap(async () => {
        await this.init();
      }),
      planner: wrap(async () => {
        await this._runPlannerStage();
      }),
      sitemaps: wrap(async () => {
        await this._runSitemapStage();
      }),
      seedStartUrl: wrap(async (overrides) => {
        this._seedInitialRequest(overrides);
      }),
      markStartupComplete: wrap(async (overrides) => {
        const message = overrides && typeof overrides.message === 'string'
          ? overrides.message
          : overrides && typeof overrides.statusText === 'string'
            ? overrides.statusText
            : null;
        this._markStartupComplete(message);
      }),
      runSequentialLoop: wrap(async () => {
        await this._runSequentialLoop();
      }),
      runConcurrentWorkers: wrap(async () => {
        await this._runConcurrentWorkers();
      }),
      runGazetteerMode: wrap(async () => {
        await this._runGazetteerMode();
      })
    };

    operations.listOperations = () => [
      'init',
      'planner',
      'sitemaps',
      'seedStartUrl',
      'markStartupComplete',
      'runSequentialLoop',
      'runConcurrentWorkers',
      'runGazetteerMode'
    ];

    const telemetryAdapter = {
      onSequenceStart: (payload) => {
        if (this.telemetry && typeof this.telemetry.milestoneOnce === 'function') {
          this.telemetry.milestoneOnce(`sequence:start:${payload.sequence?.sequenceName || 'unknown'}`, {
            kind: 'sequence-start',
            message: `Starting sequence ${payload.sequence?.sequenceName || 'unknown'}`,
            details: payload
          });
        }
      },
      onSequenceComplete: (payload) => {
        if (this.telemetry && typeof this.telemetry.milestoneOnce === 'function') {
          this.telemetry.milestoneOnce(`sequence:complete:${payload.sequence?.sequenceName || 'unknown'}`, {
            kind: 'sequence-complete',
            message: `Completed sequence ${payload.sequence?.sequenceName || 'unknown'}`,
            details: payload
          });
        }
      },
      onStepEvent: (payload) => {
        if (this.telemetry && typeof this.telemetry.milestoneOnce === 'function') {
          this.telemetry.milestoneOnce(`sequence:step:${payload.step?.id || 'unknown'}`, {
            kind: 'sequence-step',
            message: `Step ${payload.step?.id || 'unknown'}: ${payload.event}`,
            details: payload
          });
        }
      }
    };

    this._startupSequenceRunner = createSequenceRunner({
      operations,
      logger: log,
      telemetry: telemetryAdapter
    });

    return this._startupSequenceRunner;
  }

  _buildStartupSequence(mode) {
    const metadata = {
      sequenceName: `newsCrawler:${mode}`,
      mode
    };

    if (mode === 'gazetteer') {
      return {
        metadata,
        startUrl: this.startUrl,
        steps: [
          { id: 'init', operation: 'init', label: 'Initialize crawler' },
          { id: 'gazetteer', operation: 'runGazetteerMode', label: 'Run gazetteer mode' }
        ]
      };
    }

    const steps = [
      { id: 'init', operation: 'init', label: 'Initialize crawler' },
      { id: 'planner', operation: 'planner', label: 'Run planner' },
      { id: 'sitemaps', operation: 'sitemaps', label: 'Load sitemaps' },
      {
        id: 'seed-start-url',
        operation: 'seedStartUrl',
        label: 'Seed start URL',
        overrides: { respectSitemapOnly: mode !== 'sequential' }
      },
      { id: 'startup-complete', operation: 'markStartupComplete', label: 'Mark startup complete' }
    ];

    steps.push(mode === 'sequential'
      ? { id: 'sequential-loop', operation: 'runSequentialLoop', label: 'Process crawl queue' }
      : { id: 'concurrent-workers', operation: 'runConcurrentWorkers', label: 'Run crawl workers' });

    return {
      metadata,
      startUrl: this.startUrl,
      steps
    };
  }

  async _runCrawlSequence(mode) {
    const runner = this._ensureStartupSequenceRunner();
    const sequence = this._buildStartupSequence(mode);
    this._lastSequenceError = null;

    const summary = await runner.run({
      sequenceConfig: sequence,
      startUrl: this.startUrl,
      context: { mode }
    });

    if (this._lastSequenceError) {
      throw this._lastSequenceError;
    }

    return summary;
  }

  async _runPlannerStage() {
    if (!this.plannerEnabled) {
      this._skipStartupStage('planner', 'Planning intelligent crawl', 'Planner disabled');
      return { status: 'skipped' };
    }
    return this._trackStartupStage('planner', 'Planning intelligent crawl', async () => {
      try {
        await this.planIntelligent();
        return { status: 'completed' };
      } catch (error) {
        try {
          this.telemetry.problem({
            kind: 'intelligent-plan-failed',
            message: error?.message || String(error)
          });
        } catch (_) {}
        return {
          status: 'failed',
          message: 'Intelligent planner failed',
          error: error?.message || String(error)
        };
      }
    });
  }

  async _runSitemapStage() {
    if (!this.useSitemap) {
      this._skipStartupStage('sitemaps', 'Loading sitemaps', 'Sitemap ingestion disabled');
      return { status: 'skipped' };
    }
    return this._trackStartupStage('sitemaps', 'Loading sitemaps', async () => {
      if (!this.robotsCoordinator) {
        return { status: 'skipped', message: 'Robots coordinator unavailable' };
      }
      try {
        await this.loadSitemapsAndEnqueue();
        return { status: 'completed' };
      } catch (error) {
        return {
          status: 'failed',
          message: 'Sitemap load failed',
          error: error?.message || String(error)
        };
      }
    });
  }

  _seedInitialRequest(options = {}) {
    const respectSitemapOnly = Boolean(options?.respectSitemapOnly);
    if (respectSitemapOnly && this.sitemapOnly) {
      return { seeded: false };
    }
    const seen = new Set();
    let seedsEnqueued = 0;

    const enqueueSeed = (targetUrl, meta = null) => {
      if (typeof targetUrl !== 'string' || !targetUrl.trim()) {
        return;
      }
      const key = targetUrl.trim();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      this.enqueueRequest({
        url: targetUrl,
        depth: 0,
        type: 'nav',
        meta: meta || null
      });
      seedsEnqueued += 1;
    };

    const startMeta = this.seedStartFromCache ? this._buildCachedSeedMeta('start-url') : null;
    enqueueSeed(this.startUrl, startMeta);

    if (Array.isArray(this.cachedSeedUrls) && this.cachedSeedUrls.length) {
      for (const rawUrl of this.cachedSeedUrls) {
        if (typeof rawUrl !== 'string') continue;
        const trimmed = rawUrl.trim();
        if (!trimmed) continue;
        enqueueSeed(trimmed, this._buildCachedSeedMeta('cli-cache-seed'));
      }
    }

    return {
      seeded: seedsEnqueued > 0,
      seedsEnqueued
    };
  }

  _buildCachedSeedMeta(reason = null) {
    const meta = {
      seedFromCache: true,
      processCacheResult: true
    };
    if (reason) {
      meta.seedReason = reason;
    }
    return meta;
  }

  async _runSequentialLoop() {
    while (true) {
      if (this.isAbortRequested()) {
        this._recordExit('abort-requested', {
          phase: 'loop-guard',
          downloads: this.stats.pagesDownloaded,
          visited: this.stats.pagesVisited
        });
        break;
      }
      while (this.isPaused() && !this.isAbortRequested()) {
        await sleep(200);
        this.emitProgress();
      }
      if (this.isAbortRequested()) {
        this._recordExit('abort-requested', {
          phase: 'post-pause',
          downloads: this.stats.pagesDownloaded,
          visited: this.stats.pagesVisited
        });
        break;
      }
      if (this.maxDownloads !== undefined && this.stats.pagesDownloaded >= this.maxDownloads) {
        console.log(`Reached max downloads limit: ${this.maxDownloads}`);
        this._recordExit('max-downloads-reached', {
          downloads: this.stats.pagesDownloaded,
          limit: this.maxDownloads
        });
        break;
      }
      const pick = await this._pullNextWorkItem();
      if (this.isAbortRequested()) {
        this._recordExit('abort-requested', {
          phase: 'post-pull',
          downloads: this.stats.pagesDownloaded,
          visited: this.stats.pagesVisited
        });
        break;
      }
      const now = nowMs();
      if (!pick || !pick.item) {
        const queueSize = this.queue.size();
        if (queueSize === 0 && !this.isPaused()) {
          this._recordExit('queue-exhausted', {
            downloads: this.stats.pagesDownloaded,
            visited: this.stats.pagesVisited
          });
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
      if (extraCtx && extraCtx.processCacheResult) {
        processContext.processCacheResult = true;
      }
      if (extraCtx && extraCtx.forceCache) {
        processContext.forceCache = true;
        if (extraCtx.cachedPage) processContext.cachedPage = extraCtx.cachedPage;
        if (extraCtx.rateLimitedHost) processContext.rateLimitedHost = extraCtx.rateLimitedHost;
      }

      await this.processPage(item.url, item.depth, processContext);
      if (this.isAbortRequested()) {
        this._recordExit('abort-requested', {
          phase: 'post-process',
          downloads: this.stats.pagesDownloaded,
          visited: this.stats.pagesVisited
        });
        break;
      }

      if (this.stats.pagesVisited % 10 === 0) {
        // Suppressed: too verbose for CLI
      }
    }
  }

  async _runConcurrentWorkers() {
    const workers = [];
    const n = this.concurrency;
    const workerRunner = this._ensureWorkerRunner();
    for (let i = 0; i < n; i++) {
      workers.push(workerRunner.run(i));
    }
    await Promise.all(workers);
  }

  async _finalizeRun({ includeCleanup = false } = {}) {
    const outcomeErr = this._determineOutcomeError();
    if (!this.exitSummary) {
      this._recordExit(outcomeErr ? 'failed' : 'completed', {
        downloads: this.stats.pagesDownloaded,
        visited: this.stats.pagesVisited,
        errors: this.stats.errors
      });
    }
    if (outcomeErr) {
      log.error(`Crawl ended: ${outcomeErr.message}`);
    } else {
      log.success('Crawl completed');
    }
    if (this.exitSummary) {
      log.info(`Exit reason: ${this._describeExitSummary(this.exitSummary)}`);
    }
    log.stat('Pages visited', this.stats.pagesVisited);
    log.stat('Pages downloaded', this.stats.pagesDownloaded);
    log.stat('Articles found', this.stats.articlesFound);
    log.stat('Articles saved', this.stats.articlesSaved);
    this.emitProgress(true);
    this.milestoneTracker.emitCompletionMilestone({ outcomeErr });

    if (this.dbAdapter && this.dbAdapter.isEnabled()) {
      const count = this.dbAdapter.getArticleCount();
      log.stat('Database articles', count);
      this.dbAdapter.close();
    }

    if (includeCleanup) {
      this._cleanupEnhancedFeatures();
    }

    if (outcomeErr) {
      if (!outcomeErr.details) outcomeErr.details = {};
      if (!outcomeErr.details.stats) outcomeErr.details.stats = { ...this.stats };
      throw outcomeErr;
    }
  }


  // --- Intelligent planner ---
  async planIntelligent() {
    const runner = this._ensureIntelligentPlanRunner();
    const result = await runner.run();
    if (!result) return;
    if (result.plannerSummary) {
      this._plannerSummary = result.plannerSummary;
    }
    if (result.intelligentSummary) {
      this._intelligentPlanSummary = result.intelligentSummary;
    }
  }

  async crawl() {
    if (this.isGazetteerMode || this.usePriorityQueue) {
      return this.crawlConcurrent();
    }

    if (!this._shouldUseSequenceRunner()) {
      return this._runLegacySequential();
    }

    let sequenceError = null;

    try {
      await this._runCrawlSequence('sequential');
    } catch (error) {
      sequenceError = error;
    }

    let finalizeError = null;
    try {
      await this._finalizeRun({ includeCleanup: true });
    } catch (error) {
      finalizeError = error;
    }

    if (sequenceError) {
      throw sequenceError;
    }
    if (finalizeError) {
      throw finalizeError;
    }
  }



  /**
   * Initialize enhanced features (gap-driven prioritization, knowledge reuse, coverage analytics)
   * Features are enabled based on configuration and gracefully degrade if initialization fails
   */
  async _hydrateResolvedHubsFromHistory() {
    const resolver = this.problemResolutionService;
    if (!resolver || typeof resolver.getKnownHubSeeds !== 'function') {
      return { status: 'skipped', message: 'Problem resolution disabled' };
    }
    const host = this.domain;
    if (!host) {
      return { status: 'skipped', message: 'No domain available' };
    }

    let seeds;
    try {
      seeds = resolver.getKnownHubSeeds({ host, limit: 100 });
      if (seeds && typeof seeds.then === 'function') {
        seeds = await seeds;
      }
    } catch (error) {
      this.telemetry?.problem({
        kind: 'problem-resolution-hydration-failed',
        scope: host,
        message: error?.message || String(error),
        details: { stack: error?.stack || null }
      });
      return { status: 'failed', message: 'Failed to hydrate hub resolutions' };
    }

    if (!Array.isArray(seeds) || seeds.length === 0) {
      return { status: 'skipped', message: 'No stored hub resolutions' };
    }

    const added = [];
    for (const entry of seeds) {
      const normalized = this.normalizeUrl(entry?.url, { phase: 'problem-resolution-hydrated' });
      if (!normalized || this.state.hasSeededHub(normalized)) {
        continue;
      }
      this.state.addSeededHub(normalized, {
        source: 'problem-resolution',
        confidence: entry?.confidence ?? null,
        hydratedFromHistory: true,
        variant: entry?.evidence?.variant || null
      });
      added.push(normalized);
    }

    if (added.length > 0 && this.telemetry && typeof this.telemetry.milestoneOnce === 'function') {
      this.telemetry.milestoneOnce(`problem-resolution:hydrated:${this.domainNormalized || this.domain}`, {
        kind: 'problem-resolution-hydrated',
        message: `Reused ${added.length} known hub${added.length === 1 ? '' : 's'} from history`,
        details: {
          host,
          count: added.length,
          sample: added.slice(0, 5)
        }
      });
    }

    return added.length > 0
      ? { status: 'completed', message: `Hydrated ${added.length} hub${added.length === 1 ? '' : 's'}` }
      : { status: 'skipped', message: 'Known hubs already registered' };
  }

  _handleProblemResolution(payload = {}) {
    if (!payload) {
      return;
    }
    const host = payload?.normalizedHost || normalizeHost(payload?.host);
    if (!host || this.domainNormalized !== host) {
      return;
    }
    const url = payload?.url;
    if (!url) {
      return;
    }
    const normalized = this.normalizeUrl(url, { phase: 'problem-resolution-resolved' });
    if (!normalized || this.state.hasSeededHub(normalized)) {
      return;
    }
    this.state.addSeededHub(normalized, {
      source: 'problem-resolution',
      confidence: payload?.candidate?.confidence ?? null,
      variant: payload?.candidate?.variant || null,
      hydratedFromResolution: true
    });
    if (this.telemetry && typeof this.telemetry.milestoneOnce === 'function') {
      this.telemetry.milestoneOnce(`problem-resolution:resolved:${normalized}`, {
        kind: 'problem-resolution-learned',
        message: `Learned resolved hub ${normalized}`,
        details: {
          host,
          confidence: payload?.candidate?.confidence ?? null,
          sourceUrl: payload?.sourceUrl || null
        }
      });
    }
  }

  async _initializeEnhancedFeatures() {
    if (!this.enhancedFeatures) return;
    await this.enhancedFeatures.initialize({
      dbAdapter: this.dbAdapter,
      jobId: this.jobId,
      state: this.state,
      telemetry: this.telemetry
    });
    const resolver = this.problemResolutionService;
    if (resolver && typeof resolver.setResolutionObserver === 'function') {
      resolver.setResolutionObserver((payload) => this._handleProblemResolution(payload));
    }
  }

  /**
   * Enhanced priority computation with configurable bonuses and gap-driven logic
   * Falls back to base priority calculation if enhanced features are disabled
   */
  computeEnhancedPriority({
    type,
    depth,
    discoveredAt,
    bias = 0,
    url,
    meta = null
  }) {
    if (!this.enhancedFeatures) {
      const basePriority = this.computePriority({
        type,
        depth,
        discoveredAt,
        bias
      });
      return {
        priority: basePriority,
        prioritySource: 'base',
        bonusApplied: 0,
        basePriority
      };
    }

    return this.enhancedFeatures.computePriority({
      type,
      depth,
      discoveredAt,
      bias,
      url,
      meta
    }, {
      computeBasePriority: (input) => this.computePriority(input),
      jobId: this.jobId
    });
  }

  /**
   * Cleanup enhanced features on crawler shutdown
   */
  _cleanupEnhancedFeatures() {
    const resolver = this.problemResolutionService;
    if (resolver && typeof resolver.setResolutionObserver === 'function') {
      resolver.setResolutionObserver(null);
    }
    this.enhancedFeatures?.cleanup();
    this._cleanupHubFreshnessConfig();
  }
}

NewsCrawler.loadAndRunSequence = async function loadAndRunSequence(options = {}) {
  const {
    sequenceConfigName,
    configDir,
    configHost,
    startUrl,
    sharedOverrides,
    stepOverrides,
    continueOnError,
    configCliOverrides,
    logger = console,
    loader,
    facade,
    context,
    onStepComplete,
    defaults,
    telemetry
  } = options;

  if (!sequenceConfigName || typeof sequenceConfigName !== 'string') {
    throw new Error('sequenceConfigName must be provided to loadAndRunSequence');
  }

  const loggerInstance = logger || console;
  const defaultOptions = defaults || {};
  const overrideOptions = configCliOverrides || {};

  const { runSequenceConfig } = require('../orchestration/SequenceConfigRunner');
  const { createSequenceConfigLoader } = require('../orchestration/SequenceConfigLoader');
  const { CrawlOperations } = require('./CrawlOperations');

  const facadeInstance = facade || new CrawlOperations({
    defaults: defaultOptions,
    logger: loggerInstance
  });

  const loaderInstance = loader || createSequenceConfigLoader({
    configDir: configDir || undefined
  });

  const { resolvers, cleanup } = createSequenceResolverMap({
    logger: loggerInstance,
    configHost,
    defaults: defaultOptions,
    configCliOverrides: overrideOptions
  });

  try {
    return await runSequenceConfig({
      facade: facadeInstance,
      loader: loaderInstance,
      sequenceConfigName,
      configHost,
      startUrl,
      sharedOverrides,
      stepOverrides,
      continueOnError,
      configCliOverrides: overrideOptions,
      context,
      onStepComplete,
      resolvers,
      telemetry
    });
  } finally {
    if (typeof cleanup === 'function') {
      cleanup();
    }
  }
};

// Legacy CLI runtime extracted to src/crawler/cli/runLegacyCommand.js
module.exports = NewsCrawler;
NewsCrawler._wireCrawlerServices = wireCrawlerServices;

// wireCrawlerServices moved to CrawlerServiceWiring.js
