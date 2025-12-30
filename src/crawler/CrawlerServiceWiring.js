"use strict";

const ArticleSignalsService = require('./ArticleSignalsService');
const { EnhancedFeaturesManager } = require('./EnhancedFeaturesManager');
const { ArticleCache } = require('../cache');
const HubFreshnessController = require('./HubFreshnessController');
const { UrlPolicy } = require('./urlPolicy');
const { DeepUrlAnalyzer } = require('./deepUrlAnalysis');
const { UrlDecisionService } = require('./UrlDecisionService');
const { LinkExtractor } = require('./LinkExtractor');
const { CrawlerEvents } = require('./CrawlerEvents');
const { CrawlerTelemetry } = require('./CrawlerTelemetry');
const ProblemResolutionHandler = require('./ProblemResolutionHandler');
const ExitManager = require('./ExitManager');
const { MilestoneTracker } = require('./MilestoneTracker');
const { ErrorTracker } = require('./ErrorTracker');
const { DomainThrottleManager } = require('./DomainThrottleManager');
const { ArticleProcessor } = require('./ArticleProcessor');
const { NavigationDiscoveryService } = require('./NavigationDiscoveryService');
const { ContentAcquisitionService } = require('./ContentAcquisitionService');
const { FetchPipeline } = require('./FetchPipeline');
const { PageExecutionService } = require('./PageExecutionService');
const { UrlEligibilityService } = require('./UrlEligibilityService');
const QueueManager = require('./QueueManager');
const { RobotsAndSitemapCoordinator } = require('./RobotsAndSitemapCoordinator');
const { AdaptiveSeedPlanner } = require('./planner/AdaptiveSeedPlanner');
const robotsParser = require('robots-parser');
const { loadSitemaps } = require('./sitemap');
const PriorityCalculator = require('./PriorityCalculator');
const { GazetteerManager } = require('./components/GazetteerManager');
const { ConfigManager } = require('../config/ConfigManager');
const { setPriorityConfigProfile, resolvePriorityProfileFromCrawlType } = require('../utils/priorityConfig');
const { is_array } = require('lang-tools');
const { parseRetryAfter } = require('./utils');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

// Phase 1: Resilience services
const { ResilienceService } = require('./services/ResilienceService');
const { ContentValidationService } = require('./services/ContentValidationService');

// Phase 1: Discovery services
const { ArchiveDiscoveryStrategy } = require('./services/ArchiveDiscoveryStrategy');
const { PaginationPredictorService } = require('./services/PaginationPredictorService');

// Phase 5: Proxy rotation
const { ProxyManager } = require('./ProxyManager');

// Phase 2: Teacher module for Puppeteer-based rendering
let TeacherService;
try {
  TeacherService = require('../teacher/TeacherService').TeacherService;
} catch (e) {
  // TeacherService is optional (requires Puppeteer)
  TeacherService = null;
}

function resolvePriorityProfileFromCrawlTypeLocal(crawlType) {
  if (typeof crawlType !== 'string') return 'basic';
  const normalized = crawlType.trim().toLowerCase();
  if (!normalized) return 'basic';
  if (normalized.startsWith('intelligent')) return 'intelligent';
  if (normalized === 'geography' || normalized === 'gazetteer') return 'geography';
  if (normalized === 'wikidata') return 'wikidata';
  return 'basic';
}

function wireCrawlerServices(crawler, { rawOptions = {}, resolvedOptions = {} } = {}) {
  const options = rawOptions || {};
  const opts = Object.keys(resolvedOptions || {}).length ? resolvedOptions : (crawler._resolvedOptions || {});

  let decisionConfigSet = null;
  const decisionConfigSetSlug = (typeof opts.decisionConfigSetSlug === 'string' && opts.decisionConfigSetSlug.trim())
    ? opts.decisionConfigSetSlug.trim()
    : (typeof process.env.DECISION_CONFIG_SET_SLUG === 'string' && process.env.DECISION_CONFIG_SET_SLUG.trim())
      ? process.env.DECISION_CONFIG_SET_SLUG.trim()
      : null;

  if (decisionConfigSetSlug) {
    try {
      const { createDefaultDecisionConfigSetRepository } = require('./observatory/DecisionConfigSetRepository');
      const repo = createDefaultDecisionConfigSetRepository();
      if (typeof repo.loadSync === 'function') {
        decisionConfigSet = repo.loadSync(decisionConfigSetSlug);
      }
    } catch (error) {
      console.warn('Failed to load decision config set for ArticleSignalsService:', error?.message || error);
    }
  }

  crawler.articleSignals = new ArticleSignalsService({ baseUrl: crawler.baseUrl, logger: console, decisionConfigSet });

  // Best-effort: if the config set wasn't explicitly provided, try to load the
  // active slug from DB (async) and apply it when available.
  if (!decisionConfigSet && crawler.dbPath) {
    (async () => {
      try {
        const { createDefaultDecisionConfigSetRepository } = require('./observatory/DecisionConfigSetRepository');
        const { loadActiveDecisionConfigSet } = require('./observatory/DecisionConfigSetState');
        const repo = createDefaultDecisionConfigSetRepository();
        const { configSet } = await loadActiveDecisionConfigSet({
          repository: repo,
          dbPath: crawler.dbPath,
          fallbackToProduction: false
        });
        if (configSet?.articleSignals) {
          crawler.articleSignals.setArticleSignalsConfig(configSet.articleSignals);
        }
      } catch (error) {
        console.warn('Failed to load active decision config set for ArticleSignalsService (DB):', error?.message || error);
      }
    })();
  }
  crawler.enhancedFeatures = new EnhancedFeaturesManager({
    ConfigManager,
    EnhancedDatabaseAdapter: require('../db/EnhancedDatabaseAdapter').EnhancedDatabaseAdapter,
    PriorityScorer: require('./PriorityScorer').PriorityScorer,
    ProblemClusteringService: require('./ProblemClusteringService').ProblemClusteringService,
    PlannerKnowledgeService: require('./PlannerKnowledgeService').PlannerKnowledgeService,
    ProblemResolutionService: require('./ProblemResolutionService').ProblemResolutionService,
    CrawlPlaybookService: require('./CrawlPlaybookService').CrawlPlaybookService,
    CountryHubGapService: require('./CountryHubGapService').CountryHubGapService,
    CountryHubBehavioralProfile: require('./CountryHubBehavioralProfile').CountryHubBehavioralProfile,
    logger: console
  });
  crawler.busyWorkers = 0;
  crawler.workerRunner = null;
  crawler.intelligentPlanRunner = null;
  crawler._startupSequenceRunner = null;
  crawler._lastSequenceError = null;
  crawler.cache = new ArticleCache({ db: null, dataDir: crawler.dataDir, normalizeUrl: (u) => crawler.normalizeUrl(u) });
  crawler.hubFreshnessController = new HubFreshnessController({ getEnhancedConfigManager: () => crawler.enhancedFeatures?.configManager, ConfigManager, logger: console });
  Object.defineProperty(crawler, 'hubFreshnessConfig', { get() { return crawler.hubFreshnessController.getConfig(); }, set(value) { crawler.hubFreshnessController.config = value; } });
  crawler._domainWindowMs = 60 * 1000;
  crawler.requestTimeoutMs = opts.requestTimeoutMs;
  crawler.pacerJitterMinMs = opts.pacerJitterMinMs;
  crawler.pacerJitterMaxMs = Math.max(crawler.pacerJitterMinMs, opts.pacerJitterMaxMs);
  crawler.crawlType = opts.crawlType;
  crawler.outputVerbosity = opts.outputVerbosity;
  crawler.priorityProfile = setPriorityConfigProfile(resolvePriorityProfileFromCrawlTypeLocal(crawler.crawlType));
  crawler.priorityCalculator = new PriorityCalculator();
  crawler.gazetteerManager = new GazetteerManager(crawler);
  crawler.gazetteerVariant = crawler.gazetteerManager.resolveVariant(crawler.crawlType);
  crawler.isGazetteerMode = !!crawler.gazetteerVariant;
  crawler.countryHubExclusiveMode = Boolean(opts.exhaustiveCountryHubMode || opts.countryHubExclusiveMode || (typeof opts.priorityMode === 'string' && opts.priorityMode.toLowerCase() === 'country-hubs-only'));
  const structureOnlyFromCrawlType = crawler.crawlType === 'discover-structure';
  if (opts.structureOnly != null) { crawler.structureOnly = !!opts.structureOnly; } else { crawler.structureOnly = structureOnlyFromCrawlType || crawler.countryHubExclusiveMode; }
  if (options.concurrency == null && crawler.structureOnly && crawler.concurrency < 4) { crawler.concurrency = 4; crawler.usePriorityQueue = crawler.concurrency > 1; }
  crawler.plannerEnabled = crawler.crawlType.startsWith('intelligent') || crawler.structureOnly;
  crawler.skipQueryUrls = opts.skipQueryUrls;
  crawler.seedStartFromCache = !!opts.seedStartFromCache;
  crawler.cachedSeedUrls = Array.isArray(opts.cachedSeedUrls) ? opts.cachedSeedUrls.filter((value) => typeof value === 'string' && value.trim().length > 0) : [];
  if (crawler.isGazetteerMode) { crawler.gazetteerManager.applyDefaults(options); }
  crawler._gazetteerPipelineConfigured = false;
  crawler.gazetteerPlanner = null;
  crawler.urlPolicy = new UrlPolicy({ baseUrl: crawler.baseUrl, skipQueryUrls: crawler.skipQueryUrls });
  crawler.deepUrlAnalyzer = new DeepUrlAnalyzer({ getDb: () => crawler.dbAdapter?.getDb(), policy: crawler.urlPolicy });
  crawler.urlDecisionService = new UrlDecisionService({ urlPolicy: crawler.urlPolicy, urlDecisionCache: crawler.urlDecisionCache, urlAnalysisCache: crawler.urlAnalysisCache, getDbAdapter: () => crawler.dbAdapter });
  crawler.connectionResetWindowMs = opts.connectionResetWindowMs;
  crawler.connectionResetThreshold = opts.connectionResetThreshold;
  crawler.useSequenceRunner = opts.useSequenceRunner !== false;
  crawler.linkExtractor = new LinkExtractor({ normalizeUrl: (url, ctx) => crawler.normalizeUrl(url, ctx), isOnDomain: (url) => crawler.isOnDomain(url), looksLikeArticle: (url) => crawler.looksLikeArticle(url) });
  crawler.events = new CrawlerEvents({ domain: crawler.domain, getStats: () => crawler.state.getStats(), getQueueSize: () => (crawler.queue?.size?.() || 0), getCurrentDownloads: () => crawler.state.currentDownloads, getDomainLimits: () => crawler.state.getDomainLimitsSnapshot(), getRobotsInfo: () => crawler.robotsCoordinator?.getRobotsInfo() || { robotsLoaded: false }, getSitemapInfo: () => crawler.robotsCoordinator?.getSitemapInfo() || { urls: [], discovered: 0 }, getFeatures: () => crawler.featuresEnabled, getEnhancedDbAdapter: () => crawler.enhancedDbAdapter, getProblemClusteringService: () => crawler.problemClusteringService, getProblemResolutionService: () => crawler.problemResolutionService, getJobId: () => crawler.jobId, plannerScope: () => crawler.domain, isPlannerEnabled: () => crawler.plannerEnabled, isPaused: () => crawler.state.isPaused(), getGoalSummary: () => crawler.milestoneTracker ? crawler.milestoneTracker.getGoalsSummary() : [], getQueueHeatmap: () => (crawler.queue && typeof crawler.queue.getHeatmapSnapshot === 'function') ? crawler.queue.getHeatmapSnapshot() : null, getCoverageSummary: () => crawler._getCoverageSummary(), logger: console, outputVerbosity: crawler.outputVerbosity, loggingQueue: crawler.loggingQueue });
  crawler.telemetry = new CrawlerTelemetry({ events: crawler.events });
  crawler.problemResolutionHandler = new ProblemResolutionHandler({ telemetry: crawler.telemetry, state: crawler.state, normalizeUrl: (u, ctx) => crawler.normalizeUrl(u, ctx), domain: crawler.domain, domainNormalized: crawler.domainNormalized });
  crawler.exitManager = new ExitManager({ telemetry: crawler.telemetry });
  crawler.milestoneTracker = new MilestoneTracker({ telemetry: crawler.telemetry, state: crawler.state, domain: crawler.domain, getStats: () => crawler.stats, getPlanSummary: () => ({ ...(crawler._plannerSummary || {}), ...(crawler._intelligentPlanSummary || {}) }), plannerEnabled: crawler.plannerEnabled, scheduleWideHistoryCheck: (payload) => { if (typeof crawler.scheduleWideHistoryCheck === 'function') { crawler.scheduleWideHistoryCheck(payload); } }, goalPlanExecutor: ({ plan }) => { if (!plan || !is_array(plan.actions)) { return; } for (const action of plan.actions) { if (!action || typeof action !== 'object') continue; if (action.type === 'enqueue-hub-fetch' && action.url) { crawler.enqueueRequest({ url: action.url, depth: typeof action.depth === 'number' ? action.depth : 1, type: action.typeHint || 'nav' }); } } }, logger: console });
  crawler.errorTracker = new ErrorTracker({ state: crawler.state, telemetry: crawler.telemetry, logger: console, maxAgeMs: crawler.maxAgeMs, connectionResetWindowMs: crawler.connectionResetWindowMs, connectionResetThreshold: crawler.connectionResetThreshold, log: (...args) => console.log('[Crawler:ErrorTracker]', ...args) });

  // Phase 1: Resilience services for self-monitoring and content validation
  crawler.resilienceService = new ResilienceService({
    telemetry: crawler.telemetry,
    logger: console,
    stallThresholdMs: 60000, // 1 minute without activity triggers stall detection
    heartbeatIntervalMs: 10000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 30000
  });
  crawler.contentValidationService = new ContentValidationService({
    telemetry: crawler.telemetry,
    logger: console
  });

  // Phase 1: Discovery services for archive/sitemap and pagination
  crawler.archiveDiscoveryStrategy = new ArchiveDiscoveryStrategy({
    telemetry: crawler.telemetry,
    logger: console,
    queueThreshold: 10, // Trigger when queue drops below this
    discoveryIntervalMs: 60 * 60 * 1000, // 1 hour between discoveries per domain
    maxYearsBack: 2
  });
  crawler.paginationPredictorService = new PaginationPredictorService({
    telemetry: crawler.telemetry,
    logger: console,
    maxSpeculativePages: 3,
    patternTtlMs: 60 * 60 * 1000 // 1 hour
  });

  // Phase 2: Teacher service for Puppeteer-based rendering of JS-dependent pages
  // This is optional - only initialized if Puppeteer is available
  if (TeacherService && TeacherService.isAvailable()) {
    crawler.teacherService = new TeacherService({
      headless: true,
      poolSize: opts.teacherPoolSize ?? 2, // Conservative default
      renderTimeout: opts.teacherTimeout ?? 30000,
      logger: console
    });
    // Track soft failures that need Teacher rendering
    crawler._teacherQueue = [];
    crawler._teacherQueueMax = opts.teacherQueueMax ?? 100;
  } else {
    crawler.teacherService = null;
    crawler._teacherQueue = [];
  }

  // Phase 5: Proxy rotation for IP-based rate limiting/blocking
  // Loads config from config/proxies.json if it exists
  crawler.proxyManager = new ProxyManager({
    logger: console
  });
  // Only load if a config file exists (silent no-op otherwise)
  crawler.proxyManager.load();

  crawler.domainThrottle = new DomainThrottleManager({ state: crawler.state, pacerJitterMinMs: crawler.pacerJitterMinMs, pacerJitterMaxMs: crawler.pacerJitterMaxMs, getDbAdapter: () => crawler.dbAdapter });
  crawler.articleProcessor = new ArticleProcessor({ linkExtractor: crawler.linkExtractor, normalizeUrl: (url, ctx) => crawler.normalizeUrl(url, ctx), looksLikeArticle: (url) => crawler.looksLikeArticle(url), computeUrlSignals: (url) => crawler._computeUrlSignals(url), computeContentSignals: ($, html) => crawler._computeContentSignals($, html), combineSignals: (urlSignals, contentSignals, opts) => crawler._combineSignals(urlSignals, contentSignals, opts), dbAdapter: () => crawler.dbAdapter, articleHeaderCache: crawler.state.getArticleHeaderCache(), knownArticlesCache: crawler.state.getKnownArticlesCache(), events: crawler.events, logger: console });
  crawler.navigationDiscoveryService = new NavigationDiscoveryService({ linkExtractor: crawler.linkExtractor, normalizeUrl: (url, ctx) => crawler.normalizeUrl(url, ctx), looksLikeArticle: (url) => crawler.looksLikeArticle(url), logger: console });
  crawler.contentAcquisitionService = new ContentAcquisitionService({ articleProcessor: crawler.articleProcessor, logger: console });
  crawler.adaptiveSeedPlanner = new AdaptiveSeedPlanner({ baseUrl: crawler.baseUrl, state: crawler.state, telemetry: crawler.telemetry, normalizeUrl: (url) => crawler.normalizeUrl(url), enqueueRequest: (request) => crawler.enqueueRequest(request), logger: console });
  crawler.urlEligibilityService = new UrlEligibilityService({
    getUrlDecision: (url, ctx) => crawler._getUrlDecision(url, ctx),
    handlePolicySkip: (decision, info) => crawler._handlePolicySkip(decision, info),
    isOnDomain: (normalized) => crawler.isOnDomain(normalized),
    isAllowed: (normalized) => crawler.isAllowed(normalized),
    hasVisited: (normalized) => crawler.state.hasVisited(normalized),
    looksLikeArticle: (normalized) => crawler.looksLikeArticle(normalized),
    knownArticlesCache: crawler.state.getKnownArticlesCache(),
    getDbAdapter: () => crawler.dbAdapter,
    maxAgeHubMs: crawler.maxAgeHubMs,
    urlDecisionOrchestrator: crawler.urlDecisionOrchestrator || null
  });
  crawler.queue = new QueueManager({
    usePriorityQueue: crawler.usePriorityQueue,
    maxQueue: crawler.maxQueue,
    maxDepth: crawler.maxDepth,
    shouldBypassDepth: (info) => crawler._shouldBypassDepth(info),
    stats: crawler.state.getStats(),
    safeHostFromUrl: (u) => crawler._safeHostFromUrl(u),
    emitQueueEvent: (evt) => crawler.telemetry.queueEvent(evt),
    emitEnhancedQueueEvent: (evt) => crawler.telemetry.enhancedQueueEvent(evt),
    computeEnhancedPriority: (args) => crawler.computeEnhancedPriority(args),
    computePriority: (args) => crawler.computePriority(args),
    urlEligibilityService: crawler.urlEligibilityService,
    cache: crawler.cache,
    getHostResumeTime: (host) => crawler._getHostResumeTime(host),
    isHostRateLimited: (host) => crawler._isHostRateLimited(host),
    jobIdProvider: () => crawler.jobId,
    onRateLimitDeferred: () => {
      try {
        crawler.state.incrementCacheRateLimitedDeferred();
      } catch (_) {}
    }
  });
  crawler.robotsCoordinator = new RobotsAndSitemapCoordinator({
    baseUrl: crawler.baseUrl,
    domain: crawler.domain,
    fetchImpl: fetch,
    robotsParser,
    loadSitemaps,
    useSitemap: crawler.useSitemap,
    sitemapMaxUrls: crawler.sitemapMaxUrls,
    getUrlDecision: (url, ctx) => crawler._getUrlDecision(url, ctx),
    handlePolicySkip: (decision, info) => crawler._handlePolicySkip(decision, info),
    isOnDomain: (url) => crawler.isOnDomain(url),
    looksLikeArticle: (url) => crawler.looksLikeArticle(url),
    enqueueRequest: (request) => crawler.enqueueRequest(request),
    emitProgress: () => crawler.emitProgress(),
    getQueueSize: () => crawler.queue.size(),
    dbAdapter: () => crawler.dbAdapter,
    logger: console
  });
  // Wire new abstractions adapter in shadow mode for validation
  // This tracks state in parallel with existing code to validate consistency
  try {
    const NewAbstractionsAdapter = require('./integration/NewAbstractionsAdapter');
    const adapter = NewAbstractionsAdapter.create(crawler, {
      mode: 'shadow',
      logInconsistencies: opts.outputVerbosity >= 2
    });
    adapter.install();
    crawler._newAbstractionsAdapter = adapter;
    crawler.urlDecisionOrchestrator = adapter.decisionOrchestrator;
    crawler.crawlContext = adapter.context;
  } catch (err) {
    // Gracefully degrade if adapter fails to load
    console.warn('[CrawlerServiceWiring] NewAbstractionsAdapter failed to initialize:', err.message);
  }

  crawler.fetchPipeline = new FetchPipeline({
    getUrlDecision: (targetUrl, ctx) => crawler._getUrlDecision(targetUrl, ctx),
    normalizeUrl: (targetUrl, ctx) => crawler.normalizeUrl(targetUrl, ctx),
    isOnDomain: (targetUrl) => crawler.isOnDomain(targetUrl),
    isAllowed: (targetUrl) => crawler.isAllowed(targetUrl),
    hasVisited: (normalized) => crawler.state.hasVisited(normalized),
    getCachedArticle: (targetUrl) => crawler.getCachedArticle(targetUrl),
    looksLikeArticle: (targetUrl) => crawler.looksLikeArticle(targetUrl),
    cache: crawler.cache,
    preferCache: crawler.preferCache,
    maxAgeMs: crawler.maxAgeMs,
    maxAgeArticleMs: crawler.maxAgeArticleMs,
    maxAgeHubMs: crawler.maxAgeHubMs,
    acquireDomainToken: (host) => crawler.acquireDomainToken(host),
    acquireRateToken: () => crawler.acquireRateToken(),
    rateLimitMs: crawler.rateLimitMs,
    requestTimeoutMs: crawler.requestTimeoutMs,
    httpAgent: crawler.httpAgent,
    httpsAgent: crawler.httpsAgent,
    currentDownloads: crawler.state.currentDownloads,
    emitProgress: () => crawler.telemetry.progress(),
    note429: (host, retryAfterMs) => crawler.note429(host, retryAfterMs),
    noteSuccess: (host) => crawler.noteSuccess(host),
    recordError: (info) => crawler._recordError(info),
    handleConnectionReset: (normalized, err) => crawler._handleConnectionReset(normalized, err),
    telemetry: crawler.telemetry,
    // Phase 1: Resilience services for self-monitoring and content validation
    resilienceService: crawler.resilienceService,
    contentValidationService: crawler.contentValidationService,
    // Phase 2: Teacher service for JS-dependent pages
    teacherService: crawler.teacherService,
    // Phase 5: Proxy rotation
    proxyManager: crawler.proxyManager,
    onSoftFailure: crawler.teacherService ? (info) => {
      // Queue soft failures for Teacher rendering
      if (crawler._teacherQueue.length < crawler._teacherQueueMax) {
        crawler._teacherQueue.push({
          url: info.url,
          reason: info.reason,
          timestamp: Date.now()
        });
        crawler.telemetry?.milestone?.(`teacher:queued:${info.url}`, {
          kind: 'teacher-queue',
          message: `Queued for Teacher: ${info.reason}`,
          details: { url: info.url }
        });
      }
    } : null,
    articleHeaderCache: crawler.state.getArticleHeaderCache(),
    knownArticlesCache: crawler.state.getKnownArticlesCache(),
    getDbAdapter: () => crawler.dbAdapter,
    parseRetryAfter,
    urlDecisionOrchestrator: crawler.urlDecisionOrchestrator || null,
    handlePolicySkip: (decision, extras) => {
      const depth = extras?.depth || 0;
      const queueSize = crawler.queue?.size?.() || 0;
      crawler._handlePolicySkip(decision, { depth, queueSize });
    },
    onCacheServed: (info) => {
      if (!info) return;
      if (info.forced) {
        crawler.state.incrementCacheRateLimitedServed();
        const milestoneUrl = info.url;
        const host = info.rateLimitedHost || crawler._safeHostFromUrl(milestoneUrl);
        const milestoneDetails = { url: milestoneUrl };
        if (host) milestoneDetails.host = host;
        crawler.telemetry.milestoneOnce(`cache-priority:${host || milestoneUrl}`, {
          kind: 'cache-priority-hit',
          message: 'Served cached page while rate limited',
          details: milestoneDetails
        });
      }
    },
    logger: {
      info: (...args) => {
        const [msg, meta] = args;
        if (meta && meta.type === 'FETCHING' && crawler.loggingFetching === false) return;
        if (meta && meta.type === 'NETWORK' && crawler.loggingNetwork === false) return;
        if (meta && (meta.type === 'FETCHING' || meta.type === 'NETWORK')) {
          console.log(msg);
          return;
        }
        const strMsg = typeof msg === 'string' ? msg : '';
        if (crawler.loggingNetwork === false && strMsg.includes('[network]')) return;
        console.log(...args);
      },
      warn: (...args) => {
        const [msg, meta] = args;
        if (meta && meta.type === 'NETWORK' && crawler.loggingNetwork === false) return;
        if (meta && meta.type === 'NETWORK') {
          console.warn(msg);
          return;
        }
        const strMsg = typeof msg === 'string' ? msg : '';
        if (crawler.loggingNetwork === false && strMsg.includes('[network]')) return;
        console.warn(...args);
      },
      error: (...args) => {
        const [msg, meta] = args;
        if (meta && meta.type === 'NETWORK' && crawler.loggingNetwork === false) return;
        if (meta && meta.type === 'NETWORK') {
          console.error(msg);
          return;
        }
        const strMsg = typeof msg === 'string' ? msg : '';
        if (crawler.loggingNetwork === false && strMsg.includes('[network]')) return;
        console.error(...args);
      }
    }
  });
  crawler.pageExecutionService = new PageExecutionService({
    maxDepth: crawler.maxDepth,
    maxDownloads: crawler.maxDownloads,
    outputVerbosity: crawler.outputVerbosity,
    getStats: () => crawler.stats,
    state: crawler.state,
    fetchPipeline: crawler.fetchPipeline,
    navigationDiscoveryService: crawler.navigationDiscoveryService,
    contentAcquisitionService: crawler.contentAcquisitionService,
    articleProcessor: crawler.articleProcessor,
    milestoneTracker: crawler.milestoneTracker,
    adaptiveSeedPlanner: crawler.adaptiveSeedPlanner,
    enqueueRequest: (request) => crawler.enqueueRequest(request),
    telemetry: crawler.telemetry,
    recordError: (info) => crawler._recordError(info),
    normalizeUrl: (targetUrl) => crawler.normalizeUrl(targetUrl),
    looksLikeArticle: (targetUrl) => crawler.looksLikeArticle(targetUrl),
    noteDepthVisit: (normalized, depth) => crawler._noteDepthVisit(normalized, depth),
    emitProgress: () => crawler.emitProgress(),
    getDbAdapter: () => crawler.dbAdapter,
    computeContentSignals: ($, html) => crawler._computeContentSignals($, html),
    computeUrlSignals: (rawUrl) => crawler._computeUrlSignals(rawUrl),
    combineSignals: (urlSignals, contentSignals, opts) => crawler._combineSignals(urlSignals, contentSignals, opts),
    countryHubGapService: () => crawler.enhancedFeatures?.getCountryHubGapService?.(),
    jobId: crawler.jobId,
    domain: crawler.domain,
    structureOnly: crawler.countryHubExclusiveMode,
    hubOnlyMode: crawler.countryHubExclusiveMode,
    getCountryHubBehavioralProfile: () => crawler.countryHubBehavioralProfile,
    // Phase 1: Pagination prediction for speculative crawling
    paginationPredictorService: crawler.paginationPredictorService,
    // Emit url:visited event for telemetry persistence (timing data for DB queries)
    emitPageEvent: (pageInfo) => {
      try {
        console.log('[CrawlerServiceWiring] emitting url:visited:', JSON.stringify(pageInfo));
        crawler.emit('url:visited', pageInfo);
      } catch (_) {}
    }
  });
}

module.exports = { wireCrawlerServices };
