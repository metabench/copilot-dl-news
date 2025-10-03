#!/usr/bin/env node

const fetch = (...args) => import('node-fetch').then(({ 
  default: fetch 
}) => fetch(...args));
const robotsParser = require('robots-parser');
const fs = require('fs').promises;
const path = require('path');
const {
  URL
} = require('url');
const {
  ArticleCache
} = require('./cache');
const {
  UrlPolicy
} = require('./crawler/urlPolicy');
const {
  DeepUrlAnalyzer
} = require('./crawler/deepUrlAnalysis');
const {
  UrlDecisionService
} = require('./crawler/UrlDecisionService');
const {
  ErrorTracker
} = require('./crawler/ErrorTracker');
const {
  DomainThrottleManager
} = require('./crawler/DomainThrottleManager');
const http = require('http');
const https = require('https');
const {
  createCrawlerDb
} = require('./crawler/dbClient');
// Enhanced features (optional)
const {
  ConfigManager
} = require('./config/ConfigManager');
const {
  EnhancedDatabaseAdapter
} = require('./db/EnhancedDatabaseAdapter');
const {
  PriorityScorer
} = require('./crawler/PriorityScorer');
const {
  ProblemClusteringService
} = require('./crawler/ProblemClusteringService');
const {
  PlannerKnowledgeService
} = require('./crawler/PlannerKnowledgeService');
const {
  EnhancedFeaturesManager
} = require('./crawler/EnhancedFeaturesManager');

const DEFAULT_FEATURE_FLAGS = Object.freeze({
  gapDrivenPrioritization: false,
  plannerKnowledgeReuse: false,
  realTimeCoverageAnalytics: false,
  problemClustering: false
});
const {
  loadSitemaps
} = require('./crawler/sitemap');
const {
  CrawlerState
} = require('./crawler/CrawlerState');
const {
  RobotsAndSitemapCoordinator
} = require('./crawler/RobotsAndSitemapCoordinator');

const QueueManager = require('./crawler/QueueManager');
const {
  UrlEligibilityService
} = require('./crawler/UrlEligibilityService');
const {
  FetchPipeline
} = require('./crawler/FetchPipeline');
const {
  CrawlerEvents
} = require('./crawler/CrawlerEvents');
const {
  CrawlerTelemetry
} = require('./crawler/CrawlerTelemetry');
const {
  LinkExtractor
} = require('./crawler/LinkExtractor');
const {
  ArticleProcessor
} = require('./crawler/ArticleProcessor');
const ArticleSignalsService = require('./crawler/ArticleSignalsService');
const {
  sleep,
  nowMs,
  jitter,
  parseRetryAfter
} = require('./crawler/utils');
const {
  AdaptiveSeedPlanner
} = require('./crawler/planner/AdaptiveSeedPlanner');
const {
  PlannerBootstrap
} = require('./crawler/planner/PlannerBootstrap');
const {
  PatternInference
} = require('./crawler/planner/PatternInference');
const {
  CountryHubPlanner
} = require('./crawler/planner/CountryHubPlanner');
const {
  HubSeeder
} = require('./crawler/planner/HubSeeder');
const {
  PlannerTelemetryBridge
} = require('./crawler/planner/PlannerTelemetryBridge');
const {
  PlannerOrchestrator
} = require('./crawler/planner/PlannerOrchestrator');
const {
  MilestoneTracker
} = require('./crawler/MilestoneTracker');
const {
  PageExecutionService
} = require('./crawler/PageExecutionService');
const {
  IntelligentPlanRunner
} = require('./crawler/IntelligentPlanRunner');
const {
  WorkerRunner
} = require('./crawler/WorkerRunner');
const {
  StartupProgressTracker
} = require('./crawler/StartupProgressTracker');

class NewsCrawler {
  constructor(startUrl, options = {}) {
    this.startUrl = startUrl;
    this.domain = new URL(startUrl).hostname;
    this.baseUrl = `${new URL(startUrl).protocol}//${this.domain}`;
    this.jobId = options.jobId || null;

    // Configuration
    this.slowMode = options.slowMode === true;
    this.rateLimitMs = typeof options.rateLimitMs === 'number' ? options.rateLimitMs : (this.slowMode ? 1000 : 0); // default: no pacing
    this.maxDepth = options.maxDepth || 3;
    this.dataDir = options.dataDir || path.join(process.cwd(), 'data');
    this._lastProgressEmitAt = 0;
    this.concurrency = Math.max(1, options.concurrency || 1);
    this.maxQueue = Math.max(1000, options.maxQueue || 10000);
    this.retryLimit = options.retryLimit || 3;
    this.backoffBaseMs = options.backoffBaseMs || 500;
    this.backoffMaxMs = options.backoffMaxMs || 5 * 60 * 1000;
    this.maxDownloads =
      typeof options.maxDownloads === 'number' && options.maxDownloads > 0 ?
      options.maxDownloads :
      undefined; // Limit number of network downloads
    // Preserve 0 to mean "always refetch" (never accept cache)
    this.maxAgeMs =
      typeof options.maxAgeMs === 'number' && options.maxAgeMs >= 0 ?
      options.maxAgeMs :
      undefined; // Freshness window for cached items
    // Optional per-type freshness windows (override maxAgeMs when provided)
    this.maxAgeArticleMs = typeof options.maxAgeArticleMs === 'number' && options.maxAgeArticleMs >= 0 ? options.maxAgeArticleMs : undefined;
    this.maxAgeHubMs = typeof options.maxAgeHubMs === 'number' && options.maxAgeHubMs >= 0 ? options.maxAgeHubMs : undefined;
    this.dbPath = options.dbPath || path.join(this.dataDir, 'news.db');
    this.fastStart = options.fastStart === true; // skip heavy startup stats
    this.enableDb = options.enableDb !== undefined ? options.enableDb : true;
    this.preferCache = options.preferCache !== false; // default to prefer cache unless explicitly disabled
    // Sitemap support
    this.useSitemap = options.useSitemap !== false; // default true
    this.sitemapOnly = options.sitemapOnly === true; // only crawl URLs from sitemaps
    this.sitemapMaxUrls = Math.max(0, options.sitemapMaxUrls || 5000);
    // Intelligent planner options
    this.hubMaxPages = typeof options.hubMaxPages === 'number' ? options.hubMaxPages : undefined;
    this.hubMaxDays = typeof options.hubMaxDays === 'number' ? options.hubMaxDays : undefined;
    this.intMaxSeeds = typeof options.intMaxSeeds === 'number' ? options.intMaxSeeds : 50;
    this.intTargetHosts = Array.isArray(options.intTargetHosts) ? options.intTargetHosts.map(s => String(s || '').toLowerCase()) : null;
    this.plannerVerbosity = typeof options.plannerVerbosity === 'number' ? options.plannerVerbosity : 0;

    // State containers
    this.state = new CrawlerState();
    this.startupTracker = new StartupProgressTracker({
      emit: (payload, statusText) => this._emitStartupProgress(payload, statusText)
    });
    this.urlAnalysisCache = this.state.getUrlAnalysisCache();
    this.urlDecisionCache = this.state.getUrlDecisionCache();
    this.usePriorityQueue = this.concurrency > 1; // enable PQ only when concurrent
    this.startUrlNormalized = null;
    this.isProcessing = false;
    this.dbAdapter = null;
  // Enhanced features (initialized later)
  this.adaptiveSeedPlanner = null;
    this.articleSignals = new ArticleSignalsService({
      baseUrl: this.baseUrl,
      logger: console
    });
    this.enhancedFeatures = new EnhancedFeaturesManager({
      ConfigManager,
      EnhancedDatabaseAdapter,
      PriorityScorer,
      ProblemClusteringService,
      PlannerKnowledgeService,
      logger: console
    });
    // Track active workers to coordinate idle waiting
    this.busyWorkers = 0;
    this.workerRunner = null;
  this.intelligentPlanRunner = null;
    // Cache facade
    this.cache = new ArticleCache({
      db: null,
      dataDir: this.dataDir,
      normalizeUrl: (u) => this.normalizeUrl(u)
    });
    this.lastRequestTime = 0; // for global spacing
    // Keep-alive agents for connection reuse
    this.httpAgent = new http.Agent({
      keepAlive: true,
      maxSockets: 50
    });
    this.httpsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: 50
    });
    // Per-domain rate limiting and telemetry
    this._domainWindowMs = 60 * 1000;
    // Networking config
    this.requestTimeoutMs = typeof options.requestTimeoutMs === 'number' && options.requestTimeoutMs > 0 ? options.requestTimeoutMs : 10000; // default 10s
    // Pacing jitter to avoid worker alignment
    this.pacerJitterMinMs = typeof options.pacerJitterMinMs === 'number' ? Math.max(0, options.pacerJitterMinMs) : 25;
    this.pacerJitterMaxMs = typeof options.pacerJitterMaxMs === 'number' ? Math.max(this.pacerJitterMinMs, options.pacerJitterMaxMs) : 50;
    // Crawl type determines planner features (e.g., 'intelligent')
    this.crawlType = (options.crawlType || 'basic').toLowerCase();
    this.plannerEnabled = this.crawlType.startsWith('intelligent');
    this.skipQueryUrls = options.skipQueryUrls !== undefined ? !!options.skipQueryUrls : true;
    this.urlPolicy = new UrlPolicy({
      baseUrl: this.baseUrl,
      skipQueryUrls: this.skipQueryUrls
    });
    this.deepUrlAnalyzer = new DeepUrlAnalyzer({
      getDb: () => this.dbAdapter?.getDb(),
      policy: this.urlPolicy
    });
    this.urlDecisionService = new UrlDecisionService({
      urlPolicy: this.urlPolicy,
      urlDecisionCache: this.urlDecisionCache,
      urlAnalysisCache: this.urlAnalysisCache,
      getDbAdapter: () => this.dbAdapter
    });
    // Failure tracking configuration
    this.connectionResetWindowMs = typeof options.connectionResetWindowMs === 'number' && options.connectionResetWindowMs > 0 ?
      options.connectionResetWindowMs :
      2 * 60 * 1000; // 2 minutes rolling window
    this.connectionResetThreshold = typeof options.connectionResetThreshold === 'number' && options.connectionResetThreshold > 0 ?
      options.connectionResetThreshold :
      3; // after 3 resets within window we pause

    this.linkExtractor = new LinkExtractor({
      normalizeUrl: (url, ctx) => this.normalizeUrl(url, ctx),
      isOnDomain: (url) => this.isOnDomain(url),
      looksLikeArticle: (url) => this.looksLikeArticle(url)
    });

    this.events = new CrawlerEvents({
      domain: this.domain,
      getStats: () => this.state.getStats(),
      getQueueSize: () => (this.queue?.size?.() || 0),
      getCurrentDownloads: () => this.state.currentDownloads,
      getDomainLimits: () => this.state.getDomainLimitsSnapshot(),
      getRobotsInfo: () => this.robotsCoordinator?.getRobotsInfo() || {
        robotsLoaded: false
      },
      getSitemapInfo: () => this.robotsCoordinator?.getSitemapInfo() || {
        urls: [],
        discovered: 0
      },
      getFeatures: () => this.featuresEnabled,
      getEnhancedDbAdapter: () => this.enhancedDbAdapter,
      getProblemClusteringService: () => this.problemClusteringService,
      getJobId: () => this.jobId,
      plannerScope: () => this.domain,
      isPlannerEnabled: () => this.plannerEnabled,
      isPaused: () => this.state.isPaused(),
      getGoalSummary: () => this.milestoneTracker ? this.milestoneTracker.getGoalsSummary() : [],
      getQueueHeatmap: () => (this.queue && typeof this.queue.getHeatmapSnapshot === 'function') ? this.queue.getHeatmapSnapshot() : null,
      getCoverageSummary: () => this._getCoverageSummary(),
      logger: console
    });

    this.telemetry = new CrawlerTelemetry({
      events: this.events
    });

    this.milestoneTracker = new MilestoneTracker({
      telemetry: this.telemetry,
      state: this.state,
      domain: this.domain,
      getStats: () => this.stats,
      getPlanSummary: () => ({
        ...(this._plannerSummary || {}),
        ...(this._intelligentPlanSummary || {})
      }),
      plannerEnabled: this.plannerEnabled,
      scheduleWideHistoryCheck: (payload) => {
        if (typeof this.scheduleWideHistoryCheck === 'function') {
          this.scheduleWideHistoryCheck(payload);
        }
      },
      goalPlanExecutor: ({ plan }) => {
        if (!plan || !Array.isArray(plan.actions)) {
          return;
        }
        for (const action of plan.actions) {
          if (!action || typeof action !== 'object') continue;
          if (action.type === 'enqueue-hub-fetch' && action.url) {
            const depth = typeof action.depth === 'number' ? action.depth : 1;
            try {
              this.enqueueRequest({
                url: action.url,
                depth,
                type: action.typeHint || 'nav'
              });
            } catch (_) {}
          }
        }
      }
    });

    this.errorTracker = new ErrorTracker({
      state: this.state,
      telemetry: this.telemetry,
      domain: this.domain,
      connectionResetWindowMs: this.connectionResetWindowMs,
      connectionResetThreshold: this.connectionResetThreshold,
      requestAbort: (reason, details) => this.requestAbort(reason, details)
    });

    this.domainThrottle = new DomainThrottleManager({
      state: this.state,
      pacerJitterMinMs: this.pacerJitterMinMs,
      pacerJitterMaxMs: this.pacerJitterMaxMs,
      getDbAdapter: () => this.dbAdapter
    });

    this.articleProcessor = new ArticleProcessor({
      linkExtractor: this.linkExtractor,
      normalizeUrl: (url, ctx) => this.normalizeUrl(url, ctx),
      looksLikeArticle: (url) => this.looksLikeArticle(url),
      computeUrlSignals: (url) => this._computeUrlSignals(url),
      computeContentSignals: ($, html) => this._computeContentSignals($, html),
      combineSignals: (urlSignals, contentSignals, opts) => this._combineSignals(urlSignals, contentSignals, opts),
      dbAdapter: () => this.dbAdapter,
      articleHeaderCache: this.state.getArticleHeaderCache(),
      knownArticlesCache: this.state.getKnownArticlesCache(),
      events: this.events,
      logger: console
    });

    this.adaptiveSeedPlanner = new AdaptiveSeedPlanner({
      baseUrl: this.baseUrl,
      state: this.state,
      telemetry: this.telemetry,
      normalizeUrl: (url) => this.normalizeUrl(url),
      enqueueRequest: (request) => this.enqueueRequest(request),
      logger: console
    });

    this.urlEligibilityService = new UrlEligibilityService({
      getUrlDecision: (url, ctx) => this._getUrlDecision(url, ctx),
      handlePolicySkip: (decision, info) => this._handlePolicySkip(decision, info),
      isOnDomain: (normalized) => this.isOnDomain(normalized),
      isAllowed: (normalized) => this.isAllowed(normalized),
      hasVisited: (normalized) => this.state.hasVisited(normalized),
      looksLikeArticle: (normalized) => this.looksLikeArticle(normalized),
      knownArticlesCache: this.state.getKnownArticlesCache(),
      getDbAdapter: () => this.dbAdapter
    });

    this.queue = new QueueManager({
      usePriorityQueue: this.usePriorityQueue,
      maxQueue: this.maxQueue,
      maxDepth: this.maxDepth,
      stats: this.state.getStats(),
      safeHostFromUrl: (u) => this._safeHostFromUrl(u),
      emitQueueEvent: (evt) => this.telemetry.queueEvent(evt),
      emitEnhancedQueueEvent: (evt) => this.telemetry.enhancedQueueEvent(evt),
      computeEnhancedPriority: (args) => this.computeEnhancedPriority(args),
      computePriority: (args) => this.computePriority(args),
      urlEligibilityService: this.urlEligibilityService,
      cache: this.cache,
      getHostResumeTime: (host) => this._getHostResumeTime(host),
      isHostRateLimited: (host) => this._isHostRateLimited(host),
      jobIdProvider: () => this.jobId
    });

    this.robotsCoordinator = new RobotsAndSitemapCoordinator({
      baseUrl: this.baseUrl,
      domain: this.domain,
      fetchImpl: fetch,
      robotsParser,
      loadSitemaps,
      useSitemap: this.useSitemap,
      sitemapMaxUrls: this.sitemapMaxUrls,
      getUrlDecision: (url, ctx) => this._getUrlDecision(url, ctx),
      handlePolicySkip: (decision, info) => this._handlePolicySkip(decision, info),
      isOnDomain: (url) => this.isOnDomain(url),
      looksLikeArticle: (url) => this.looksLikeArticle(url),
      enqueueRequest: (request) => this.enqueueRequest(request),
      emitProgress: () => this.emitProgress(),
      getQueueSize: () => this.queue.size(),
      logger: console
    });

    this.fetchPipeline = new FetchPipeline({
      getUrlDecision: (targetUrl, ctx) => this._getUrlDecision(targetUrl, ctx),
      normalizeUrl: (targetUrl, ctx) => this.normalizeUrl(targetUrl, ctx),
      isOnDomain: (targetUrl) => this.isOnDomain(targetUrl),
      isAllowed: (targetUrl) => this.isAllowed(targetUrl),
      hasVisited: (normalized) => this.state.hasVisited(normalized),
      getCachedArticle: (targetUrl) => this.getCachedArticle(targetUrl),
      looksLikeArticle: (targetUrl) => this.looksLikeArticle(targetUrl),
      cache: this.cache,
      preferCache: this.preferCache,
      maxAgeMs: this.maxAgeMs,
      maxAgeArticleMs: this.maxAgeArticleMs,
      maxAgeHubMs: this.maxAgeHubMs,
      acquireDomainToken: (host) => this.acquireDomainToken(host),
      acquireRateToken: () => this.acquireRateToken(),
      rateLimitMs: this.rateLimitMs,
      requestTimeoutMs: this.requestTimeoutMs,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      currentDownloads: this.state.currentDownloads,
      emitProgress: () => this.telemetry.progress(),
      note429: (host, retryAfterMs) => this.note429(host, retryAfterMs),
      noteSuccess: (host) => this.noteSuccess(host),
      recordError: (info) => this._recordError(info),
      handleConnectionReset: (normalized, err) => this._handleConnectionReset(normalized, err),
      articleHeaderCache: this.state.getArticleHeaderCache(),
      knownArticlesCache: this.state.getKnownArticlesCache(),
      getDbAdapter: () => this.dbAdapter,
      parseRetryAfter,
      handlePolicySkip: (decision, extras) => {
        const depth = extras?.depth || 0;
        const queueSize = this.queue?.size?.() || 0;
        this._handlePolicySkip(decision, {
          depth,
          queueSize
        });
      },
      onCacheServed: (info) => {
        if (!info) return;
        if (info.forced) {
          this.state.incrementCacheRateLimitedServed();
          const milestoneUrl = info.url;
          const host = info.rateLimitedHost || this._safeHostFromUrl(milestoneUrl);
          const milestoneDetails = {
            url: milestoneUrl
          };
          if (host) milestoneDetails.host = host;
          this.telemetry.milestoneOnce(`cache-priority:${host || milestoneUrl}`, {
            kind: 'cache-priority-hit',
            message: 'Served cached page while rate limited',
            details: milestoneDetails
          });
        }
      },
      logger: {
        info: (...args) => console.log(...args),
        warn: (...args) => console.warn(...args),
        error: (...args) => console.error(...args)
      }
    });

    this.pageExecutionService = new PageExecutionService({
      maxDepth: this.maxDepth,
      maxDownloads: this.maxDownloads,
      getStats: () => this.stats,
      state: this.state,
      fetchPipeline: this.fetchPipeline,
      articleProcessor: this.articleProcessor,
      milestoneTracker: this.milestoneTracker,
      adaptiveSeedPlanner: this.adaptiveSeedPlanner,
      enqueueRequest: (request) => this.enqueueRequest(request),
      telemetry: this.telemetry,
      recordError: (info) => this._recordError(info),
      normalizeUrl: (targetUrl) => this.normalizeUrl(targetUrl),
      looksLikeArticle: (targetUrl) => this.looksLikeArticle(targetUrl),
      noteDepthVisit: (normalized, depth) => this._noteDepthVisit(normalized, depth),
      emitProgress: () => this.emitProgress(),
      getDbAdapter: () => this.dbAdapter,
      computeContentSignals: ($, html) => this._computeContentSignals($, html),
      computeUrlSignals: (rawUrl) => this._computeUrlSignals(rawUrl),
      combineSignals: (urlSignals, contentSignals, opts) => this._combineSignals(urlSignals, contentSignals, opts)
    });
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
      this.robotsCoordinator.sitemapUrls = Array.isArray(urls) ? urls : [];
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
    try {
      this.startUrlNormalized = this.normalizeUrl(this.startUrl) || this.startUrl;
      if (this.startUrlNormalized) {
        this.state.addSeededHub(this.startUrlNormalized);
      }
    } catch (_) {
      this.startUrlNormalized = this.startUrl;
    }

    await this._trackStartupStage('robots', 'Loading robots.txt', async () => {
      if (!this.robotsCoordinator) {
        return { status: 'skipped', message: 'Robots coordinator unavailable' };
      }
      await this.robotsCoordinator.loadRobotsTxt();
      return { status: 'completed' };
    });

    console.log(`Starting crawler for ${this.domain}`);
    console.log(`Data will be saved to: ${this.dataDir}`);
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
    this.telemetry.progress(force);
  }

  _emitStartupProgress(progressPayload, statusText = null) {
    if (!progressPayload) return;
    if (!this.telemetry || typeof this.telemetry.progress !== 'function') return;
    const patch = {};
    if (progressPayload.stages) {
      patch.startup = {
        stages: Array.isArray(progressPayload.stages) ? progressPayload.stages : [],
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
        } else if (status === 'failed') {
          const errMessage = result && typeof result === 'object' && result.error ? result.error : meta.message || 'Stage failed';
          this.startupTracker.failStage(id, errMessage, meta);
        } else {
          this.startupTracker.completeStage(id, meta);
        }
      }
      return result;
    } catch (error) {
      if (this.startupTracker) {
        this.startupTracker.failStage(id, error, { label });
      }
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
          seeded: Array.isArray(hubStats?.seededSample) ? hubStats.seededSample.slice(0, 5) : [],
          visited: Array.isArray(hubStats?.visitedSample) ? hubStats.visitedSample.slice(0, 5) : []
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
        console.log(`Skipping query URL (heuristic superfluous): ${normalized} -> ${decision.guessedUrl || analysis.guessedWithoutQuery || '<none>'}`);
      } catch (_) {}
    }
  }

  enqueueRequest({
    url,
    depth,
    type
  }) {
    return this.queue.enqueue({
      url,
      depth,
      type
    });
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
        }
      });
    }
    return this.workerRunner;
  }

  _ensureIntelligentPlanRunner() {
    if (!this.intelligentPlanRunner) {
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
        HubSeeder
      });
    }
    return this.intelligentPlanRunner;
  }

  async crawlConcurrent() {
    await this.init();
    // Optional intelligent planning path
    if (this.plannerEnabled) {
      await this._trackStartupStage('planner', 'Planning intelligent crawl', async () => {
        try {
          await this.planIntelligent();
          return { status: 'completed' };
        } catch (e) {
          try {
            this.telemetry.problem({
              kind: 'intelligent-plan-failed',
              message: e?.message || String(e)
            });
          } catch (_) {}
          return { status: 'failed', message: 'Intelligent planner failed', error: e?.message || String(e) };
        }
      });
    } else {
      this._skipStartupStage('planner', 'Planning intelligent crawl', 'Planner disabled');
    }
    // Optionally preload URLs from sitemaps
    if (this.useSitemap) {
      await this._trackStartupStage('sitemaps', 'Loading sitemaps', async () => {
        if (!this.robotsCoordinator) {
          return { status: 'skipped', message: 'Robots coordinator unavailable' };
        }
        try {
          await this.loadSitemapsAndEnqueue();
          return { status: 'completed' };
        } catch (err) {
          return { status: 'failed', message: 'Sitemap load failed', error: err?.message || String(err) };
        }
      });
    } else {
      this._skipStartupStage('sitemaps', 'Loading sitemaps', 'Sitemap ingestion disabled');
    }
    // Seed start URL unless we are sitemap-only
    if (!this.sitemapOnly) {
      this.enqueueRequest({
        url: this.startUrl,
        depth: 0,
        type: 'nav'
      });
    }
    this._markStartupComplete();
    const workers = [];
    const n = this.concurrency;
    const workerRunner = this._ensureWorkerRunner();
    for (let i = 0; i < n; i++) {
      workers.push(workerRunner.run(i));
    }
    await Promise.all(workers);

    const outcomeErr = this._determineOutcomeError();
    const finishedMsg = outcomeErr ? '\nCrawling ended with errors.' : '\nCrawling completed!';
    console.log(finishedMsg);
    if (outcomeErr) {
      console.log(`Failure summary: ${outcomeErr.message}`);
    }
    console.log(`Final stats: ${this.stats.pagesVisited} pages visited, ${this.stats.pagesDownloaded} pages downloaded, ${this.stats.articlesFound} articles found, ${this.stats.articlesSaved} articles saved`);
    this.emitProgress(true);
    this.milestoneTracker.emitCompletionMilestone({
      outcomeErr
    });

    if (this.dbAdapter && this.dbAdapter.isEnabled()) {
      const count = this.dbAdapter.getArticleCount();
      console.log(`Database contains ${count} article records`);
      this.dbAdapter.close();
    }

    if (outcomeErr) {
      if (!outcomeErr.details) outcomeErr.details = {};
      if (!outcomeErr.details.stats) outcomeErr.details.stats = {
        ...this.stats
      };
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
    if (this.usePriorityQueue) {
      return this.crawlConcurrent();
    }
    await this.init();

    if (this.plannerEnabled) {
      this._skipStartupStage('planner', 'Planning intelligent crawl', 'Planner requires concurrent mode');
    } else {
      this._skipStartupStage('planner', 'Planning intelligent crawl', 'Planner disabled');
    }

    if (this.useSitemap) {
      this._skipStartupStage('sitemaps', 'Loading sitemaps', 'Sitemaps processed in concurrent mode only');
    } else {
      this._skipStartupStage('sitemaps', 'Loading sitemaps', 'Sitemap ingestion disabled');
    }

    // Start with the initial URL
    this.enqueueRequest({
      url: this.startUrl,
      depth: 0,
      type: 'nav'
    });

    this._markStartupComplete();

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
        console.log(`Progress: ${this.stats.pagesVisited} pages visited, ${this.stats.pagesDownloaded} pages downloaded, ${this.stats.articlesFound} articles found, ${this.stats.articlesSaved} articles saved`);
      }
    }

    const outcomeErr = this._determineOutcomeError();
    const finishedMsg = outcomeErr ? '\nCrawling ended with errors.' : '\nCrawling completed!';
    console.log(finishedMsg);
    if (outcomeErr) {
      console.log(`Failure summary: ${outcomeErr.message}`);
    }
    console.log(`Final stats: ${this.stats.pagesVisited} pages visited, ${this.stats.pagesDownloaded} pages downloaded, ${this.stats.articlesFound} articles found, ${this.stats.articlesSaved} articles saved`);
    this.emitProgress(true);
    this.milestoneTracker.emitCompletionMilestone({
      outcomeErr
    });

    if (this.dbAdapter && this.dbAdapter.isEnabled()) {
      const count = this.dbAdapter.getArticleCount();
      console.log(`Database contains ${count} article records`);
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
  }

  /**
   * Initialize enhanced features (gap-driven prioritization, knowledge reuse, coverage analytics)
   * Features are enabled based on configuration and gracefully degrade if initialization fails
   */
  async _initializeEnhancedFeatures() {
    if (!this.enhancedFeatures) return;
    await this.enhancedFeatures.initialize({
      dbAdapter: this.dbAdapter,
      jobId: this.jobId
    });
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
    this.enhancedFeatures?.cleanup();
  }
}

// CLI interface
if (require.main === module) {
  const readline = require('readline');
  const args = process.argv.slice(2);
  const startUrl = args[0] || 'https://www.theguardian.com';
  const enableDb = !args.includes('--no-db');
  const slowMode = args.includes('--slow') || args.includes('--slow-mode');
  const maxDepthArg = args.find(a => a.startsWith('--depth='));
  const maxDepth = maxDepthArg ? parseInt(maxDepthArg.split('=')[1], 10) : 2;
  const dbPathArg = args.find(a => a.startsWith('--db='));
  const dbPath = dbPathArg ? dbPathArg.split('=')[1] : undefined;
  const rateLimitArg = args.find(a => a.startsWith('--rate-limit-ms='));
  const rateLimitMs = rateLimitArg ? parseInt(rateLimitArg.split('=')[1], 10) : undefined;
  const crawlTypeArg = args.find(a => a.startsWith('--crawl-type='));
  const crawlType = crawlTypeArg ? String(crawlTypeArg.split('=')[1]) : undefined;
  const reqTimeoutArg = args.find(a => a.startsWith('--request-timeout-ms='));
  const requestTimeoutMs = reqTimeoutArg ? parseInt(reqTimeoutArg.split('=')[1], 10) : undefined;
  const jitterMinArg = args.find(a => a.startsWith('--pacer-jitter-min-ms='));
  const pacerJitterMinMs = jitterMinArg ? parseInt(jitterMinArg.split('=')[1], 10) : undefined;
  const jitterMaxArg = args.find(a => a.startsWith('--pacer-jitter-max-ms='));
  const pacerJitterMaxMs = jitterMaxArg ? parseInt(jitterMaxArg.split('=')[1], 10) : undefined;
  const maxPagesArg = args.find(a => a.startsWith('--max-pages=')) || args.find(a => a.startsWith('--max-downloads='));
  const maxDownloads = maxPagesArg ? parseInt(maxPagesArg.split('=')[1], 10) : undefined;
  const maxAgeArg = args.find(a => a.startsWith('--max-age=')) || args.find(a => a.startsWith('--refetch-if-older-than='));
  const maxAgeArticleArg = args.find(a => a.startsWith('--max-age-article=')) || args.find(a => a.startsWith('--refetch-article-if-older-than='));
  const maxAgeHubArg = args.find(a => a.startsWith('--max-age-hub=')) || args.find(a => a.startsWith('--refetch-hub-if-older-than='));
  const concurrencyArg = args.find(a => a.startsWith('--concurrency='));
  const maxQueueArg = args.find(a => a.startsWith('--max-queue='));
  // Intelligent planner flags
  const hubMaxPagesArg = args.find(a => a.startsWith('--hub-max-pages='));
  const hubMaxDaysArg = args.find(a => a.startsWith('--hub-max-days='));
  const intMaxSeedsArg = args.find(a => a.startsWith('--int-max-seeds='));
  const intTargetHostsArg = args.find(a => a.startsWith('--int-target-hosts='));
  const plannerVerbosityArg = args.find(a => a.startsWith('--planner-verbosity='));
  // Cache preference: default is to prefer cache; allow override with --no-prefer-cache
  const preferCache = args.includes('--no-prefer-cache') ? false : true;
  const useSitemap = !args.includes('--no-sitemap');
  const sitemapOnly = args.includes('--sitemap-only');
  const sitemapMaxArg = args.find(a => a.startsWith('--sitemap-max='));
  const fastStart = args.includes('--fast-start');
  const jobIdArg = args.find(a => a.startsWith('--job-id='));
  const allowQueryUrls = args.includes('--allow-query-urls');

  function parseMaxAgeToMs(val) {
    if (!val) return undefined;
    const s = String(val).trim();
    const m = s.match(/^([0-9]+)\s*([smhd]?)$/i);
    if (!m) return undefined;
    const n = parseInt(m[1], 10);
    const unit = (m[2] || 's').toLowerCase();
    const mult = unit === 's' ? 1000 : unit === 'm' ? 60 * 1000 : unit === 'h' ? 3600 * 1000 : unit === 'd' ? 86400 * 1000 : 1000;
    return n * mult;
  }

  let maxAgeMs = maxAgeArg ? parseMaxAgeToMs(maxAgeArg.split('=')[1]) : undefined;
  let maxAgeArticleMs = maxAgeArticleArg ? parseMaxAgeToMs(maxAgeArticleArg.split('=')[1]) : undefined;
  let maxAgeHubMs = maxAgeHubArg ? parseMaxAgeToMs(maxAgeHubArg.split('=')[1]) : undefined;
  if (maxAgeMs === 0) {
    // explicit 0 means always refetch; pass through
  }

  console.log(`Starting news crawler with URL: ${startUrl}`);

  const crawler = new NewsCrawler(startUrl, {
    rateLimitMs,
    maxDepth,
    enableDb,
    dbPath,

    slowMode,
    maxDownloads,
    maxAgeMs,
    maxAgeArticleMs,
    maxAgeHubMs,
    concurrency: concurrencyArg ? parseInt(concurrencyArg.split('=')[1], 10) : 1,
    maxQueue: maxQueueArg ? parseInt(maxQueueArg.split('=')[1], 10) : undefined,
    preferCache,
    requestTimeoutMs,
    pacerJitterMinMs,
    pacerJitterMaxMs,
    useSitemap,
    sitemapOnly,
    sitemapMaxUrls: sitemapMaxArg ? parseInt(sitemapMaxArg.split('=')[1], 10) : undefined,
    fastStart,
    crawlType,
    hubMaxPages: hubMaxPagesArg ? parseInt(hubMaxPagesArg.split('=')[1], 10) : undefined,
    hubMaxDays: hubMaxDaysArg ? parseInt(hubMaxDaysArg.split('=')[1], 10) : undefined,
    intMaxSeeds: intMaxSeedsArg ? parseInt(intMaxSeedsArg.split('=')[1], 10) : undefined,
    intTargetHosts: intTargetHostsArg ? String(intTargetHostsArg.split('=')[1]).split(',').map(s => s.trim()).filter(Boolean) : undefined,
    plannerVerbosity: plannerVerbosityArg ? parseInt(plannerVerbosityArg.split('=')[1], 10) : undefined,
    jobId: jobIdArg ? jobIdArg.split('=')[1] : undefined,
    skipQueryUrls: !allowQueryUrls
  });

  // Accept PAUSE/RESUME commands over stdin (for GUI control)
  try {
    const rl = readline.createInterface({
      input: process.stdin,
      crlfDelay: Infinity
    });
    rl.on('line', (line) => {
      const cmd = String(line || '').trim().toUpperCase();
      if (cmd === 'PAUSE') {
        crawler.pause();
      } else if (cmd === 'RESUME') {
        crawler.resume();
      }
    });
  } catch (_) {}

  crawler.crawl()
    .then(() => {
      console.log('Crawler finished successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Crawler failed:', error);
      process.exit(1);
    });
}

module.exports = NewsCrawler;
