#!/usr/bin/env node

const fetch = (...args) => import('node-fetch').then(({
  default: fetch
}) => fetch(...args));
const cheerio = require('cheerio');
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
  CompletionReporter
} = require('./crawler/planner/CompletionReporter');
const {
  loadSitemaps
} = require('./crawler/sitemap');
const {
  CrawlerState
} = require('./crawler/CrawlerState');

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
    this.sitemapUrls = [];
    this.sitemapDiscovered = 0;
    this.robotsTxtLoaded = false;
    // Intelligent planner options
    this.hubMaxPages = typeof options.hubMaxPages === 'number' ? options.hubMaxPages : undefined;
    this.hubMaxDays = typeof options.hubMaxDays === 'number' ? options.hubMaxDays : undefined;
    this.intMaxSeeds = typeof options.intMaxSeeds === 'number' ? options.intMaxSeeds : 50;
    this.intTargetHosts = Array.isArray(options.intTargetHosts) ? options.intTargetHosts.map(s => String(s || '').toLowerCase()) : null;
    this.plannerVerbosity = typeof options.plannerVerbosity === 'number' ? options.plannerVerbosity : 0;

    // State containers
    this.state = new CrawlerState();
    this.urlAnalysisCache = this.state.getUrlAnalysisCache();
    this.urlDecisionCache = this.state.getUrlDecisionCache();
    this.usePriorityQueue = this.concurrency > 1; // enable PQ only when concurrent
    this.startUrlNormalized = null;
    this.robotsRules = null;
    this.isProcessing = false;
    this.dbAdapter = null;
    // Enhanced features (initialized later)
    this.configManager = null;
    this.enhancedDbAdapter = null;
    this.priorityScorer = null;
    this.problemClusteringService = null;
    this.plannerKnowledgeService = null;
    this.completionReporter = null;
    this.adaptiveSeedPlanner = null;
    this.articleSignals = new ArticleSignalsService({
      baseUrl: this.baseUrl,
      logger: console
    });
    this.featuresEnabled = {
      gapDrivenPrioritization: false,
      plannerKnowledgeReuse: false,
      realTimeCoverageAnalytics: false,
      problemClustering: false
    };
    // Track active workers to coordinate idle waiting
    this.busyWorkers = 0;
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
      getRobotsInfo: () => ({
        robotsLoaded: !!this.robotsTxtLoaded
      }),
      getSitemapInfo: () => ({
        urls: this.sitemapUrls,
        discovered: this.sitemapDiscovered
      }),
      getFeatures: () => this.featuresEnabled,
      getEnhancedDbAdapter: () => this.enhancedDbAdapter,
      getProblemClusteringService: () => this.problemClusteringService,
      getJobId: () => this.jobId,
      plannerScope: () => this.domain,
      isPlannerEnabled: () => this.plannerEnabled,
      isPaused: () => this.state.isPaused(),
      logger: console
    });

    this.telemetry = new CrawlerTelemetry({
      events: this.events
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
  }

  get stats() {
    return this.state.getStats();
  }

  set stats(nextStats) {
    this.state.replaceStats(nextStats);
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

  _emitIntelligentCompletionMilestone({
    outcomeErr
  } = {}) {
    if (!this.plannerEnabled) return;

    const dependencyPayload = {
      state: this.state,
      telemetry: this.telemetry,
      domain: this.domain,
      getPlanSummary: () => ({
        ...(this._plannerSummary || {}),
        ...(this._intelligentPlanSummary || {})
      }),
      getStats: () => this.stats
    };

    if (!this.completionReporter) {
      this.completionReporter = new CompletionReporter(dependencyPayload);
    } else {
      this.completionReporter.updateDependencies(dependencyPayload);
    }

    this.completionReporter.emit({
      outcomeErr
    });
  }

  _noteDepthVisit(normalizedUrl, depth) {
    this.state.noteDepthVisit(normalizedUrl, depth);
  }

  _checkAnalysisMilestones({
    depth,
    isArticle
  }) {
    // depth milestones
    if ((this.stats.depth2PagesProcessed || 0) >= 10) {
      this.telemetry.milestoneOnce('depth2-coverage-10', {
        kind: 'depth2-coverage',
        message: 'Completed analysis of 10 depth-2 pages from the front page',
        details: {
          depth: 2,
          pages: this.stats.depth2PagesProcessed
        }
      });
    }

    // downloads milestone
    if (this.stats.pagesDownloaded >= 1000) {
      this.telemetry.milestoneOnce('downloads-1k', {
        kind: 'downloads-1k',
        message: 'Downloaded 1,000 documents',
        details: {
          count: this.stats.pagesDownloaded
        }
      });
    }

    // article identification milestones (analysis-driven)
    if (this.stats.articlesFound >= 1000) {
      this.telemetry.milestoneOnce('articles-found-1k', {
        kind: 'articles-identified-1k',
        message: 'Identified 1,000 articles during analysis',
        details: {
          count: this.stats.articlesFound
        }
      });
    }
    if (this.stats.articlesFound >= 10000) {
      this.telemetry.milestoneOnce('articles-found-10k', {
        kind: 'articles-identified-10k',
        message: 'Identified 10,000 articles during analysis',
        details: {
          count: this.stats.articlesFound
        }
      });
    }

    // Provide a hook for intelligent crawls to optionally schedule deeper analysis
    if (this.plannerEnabled && isArticle && typeof this.scheduleWideHistoryCheck === 'function') {
      try {
        this.scheduleWideHistoryCheck({
          depth,
          articlesFound: this.stats.articlesFound
        });
      } catch (_) {
        // Analysis scheduling is best-effort; ignore errors
      }
    }
  }

  _recordError(sample) {
    if (!sample || typeof sample !== 'object') return;
    const normalized = {
      kind: sample.kind || 'unknown',
      code: sample.code != null ? sample.code : null,
      message: sample.message || null,
      url: sample.url || null
    };
    this.state.setLastError(normalized);
    this.state.addErrorSample(normalized);
  }

  _handleConnectionReset(url, error) {
    if (this.state.hasEmittedConnectionResetProblem()) return;
    let host = this.domain;
    try {
      if (url) host = new URL(url).hostname || host;
    } catch (_) {}
    const now = Date.now();
    const windowMs = this.connectionResetWindowMs;
    const threshold = this.connectionResetThreshold;
    const entry = this.state.getConnectionResetState(host) || {
      count: 0,
      firstAt: now,
      lastAt: now
    };
    if (now - entry.firstAt > windowMs) {
      entry.count = 0;
      entry.firstAt = now;
    }
    entry.count += 1;
    entry.lastAt = now;
    this.state.setConnectionResetState(host, entry);
    if (entry.count >= threshold) {
      this.state.markConnectionResetProblemEmitted();
      const message = `Repeated connection resets detected (${entry.count} within ${Math.round(windowMs / 1000)}s)`;
      const details = {
        host,
        count: entry.count,
        windowMs,
        firstAt: new Date(entry.firstAt).toISOString(),
        lastAt: new Date(entry.lastAt).toISOString(),
        sampleUrl: url || null,
        errorCode: error && error.code ? error.code : null,
        errorMessage: error && error.message ? error.message : null
      };
      try {
        this.telemetry.problem({
          kind: 'connection-reset',
          scope: this.domain,
          target: host,
          message: `${message}; crawl aborted`,
          details
        });
      } catch (_) {}
      this.requestAbort('connection-reset', {
        ...details,
        message: `${message} for ${host}`
      });
    }
  }

  _determineOutcomeError() {
    const fatalIssues = this.state.getFatalIssues();
    if (Array.isArray(fatalIssues) && fatalIssues.length > 0) {
      const summary = fatalIssues.map((issue) => issue && (issue.message || issue.reason || issue.kind)).filter(Boolean).join('; ');
      const err = new Error(`Crawl failed: ${summary || 'fatal initialization error'}`);
      err.code = 'CRAWL_FATAL';
      err.details = {
        issues: fatalIssues.slice(0, 5)
      };
      return err;
    }
    const noDownloads = (this.stats.pagesDownloaded || 0) === 0;
    const hadErrors = (this.stats.errors || 0) > 0;
    if (noDownloads && hadErrors) {
      const errorSamples = this.state.getErrorSamples();
      const sample = Array.isArray(errorSamples) ? errorSamples[0] : null;
      const detail = sample ? `${sample.kind || 'error'}${sample.code ? ` ${sample.code}` : ''}${sample.url ? ` ${sample.url}` : ''}`.trim() : null;
      const err = new Error(`Crawl failed: no pages downloaded after ${this.stats.errors} error${this.stats.errors === 1 ? '' : 's'}${detail ? ` (first: ${detail})` : ''}`);
      err.code = 'CRAWL_NO_PROGRESS';
      err.details = {
        stats: {
          ...this.stats
        },
        sampleError: sample || null
      };
      return err;
    }
    return null;
  }

  _compactUrlAnalysis(analysis) {
    if (!analysis || typeof analysis !== 'object' || analysis.invalid) return null;
    const trimEntries = (list) => Array.isArray(list) ? list.map((entry) => ({
      key: entry.key,
      value: entry.value
    })) : [];
    return {
      raw: analysis.raw,
      normalized: analysis.normalized,
      host: analysis.host,
      path: analysis.path,
      hasQuery: !!analysis.hasQuery,
      pathIsSearchy: !!analysis.pathIsSearchy,
      guessedWithoutQuery: analysis.guessedWithoutQuery || null,
      querySummary: {
        essential: trimEntries(analysis.querySummary?.essentialKeys || []),
        ignorable: trimEntries(analysis.querySummary?.ignorableKeys || []),
        uncertain: trimEntries(analysis.querySummary?.uncertainKeys || [])
      },
      queryClassification: analysis.queryClassification || null
    };
  }

  _persistUrlAnalysis(compactAnalysis, decision) {
    if (!this.dbAdapter || !this.dbAdapter.isEnabled() || !compactAnalysis || !compactAnalysis.normalized) return;
    try {
      const payload = {
        analysis: compactAnalysis,
        decision: {
          allow: !!(decision && decision.allow),
          reason: decision?.reason || null,
          classification: decision?.classification || null
        },
        recordedAt: new Date().toISOString()
      };
      this.dbAdapter.upsertUrl(compactAnalysis.normalized, null, JSON.stringify(payload));
    } catch (_) {
      // Persisting analysis is best effort
    }
  }

  _getUrlDecision(rawUrl, context = {}) {
    const phase = context && typeof context === 'object' && context.phase ? String(context.phase) : 'default';
    const cacheKey = `${phase}|${rawUrl}`;
    if (this.urlDecisionCache.has(cacheKey)) {
      return this.urlDecisionCache.get(cacheKey);
    }
    let decision = null;
    try {
      decision = this.urlPolicy.decide(rawUrl, context);
    } catch (e) {
      decision = {
        allow: false,
        reason: 'policy-error',
        analysis: {
          raw: rawUrl,
          invalid: true
        },
        error: e
      };
    }
    const analysis = decision?.analysis;
    if (analysis && !analysis.invalid) {
      const compact = this._compactUrlAnalysis(analysis);
      if (compact) {
        const normalizedKey = compact.normalized || rawUrl;
        this.urlAnalysisCache.set(normalizedKey, compact);
        this.urlAnalysisCache.set(rawUrl, compact);
        this._persistUrlAnalysis(compact, decision);
      }
    }
    this.urlDecisionCache.set(cacheKey, decision);
    return decision;
  }

  // --- Per-domain rate limiter state management ---

  _getDomainState(host) {
    let state = this.state.getDomainLimitState(host);
    if (!state) {
      state = {
        host,
        // Core state
        isLimited: false, // True if any 429 has been received
        rpm: null, // Current requests-per-minute limit
        nextRequestAt: 0, // Earliest time the next request is allowed
        backoffUntil: 0, // A hard stop for all requests after a 429
        // Telemetry for adaptive behavior
        lastRequestAt: 0,
        lastSuccessAt: 0,
        last429At: 0,
        successStreak: 0,
        err429Streak: 0,
        // Metrics for UI
        rpmLastMinute: 0,
        windowStartedAt: 0,
        windowCount: 0
      };
      this.state.setDomainLimitState(host, state);
    }
    return state;
  }

  _safeHostFromUrl(url) {
    if (!url) return null;
    try {
      return new URL(url).hostname;
    } catch (_) {
      return null;
    }
  }

  _getHostResumeTime(host) {
    if (!host) return null;
    const state = this.state.getDomainLimitState(host);
    if (!state) return null;
    const backoff = state.backoffUntil || 0;
    const nextAt = state.nextRequestAt || 0;
    const resumeAt = Math.max(backoff, nextAt);
    return resumeAt > 0 ? resumeAt : null;
  }

  _isHostRateLimited(host) {
    if (!host) return false;
    const state = this.state.getDomainLimitState(host);
    if (!state) return false;
    const now = nowMs();
    if (state.backoffUntil > now) return true;
    if (state.isLimited && state.nextRequestAt > now) return true;
    return false;
  }


  async init() {
    // Ensure data directory exists
    await fs.mkdir(this.dataDir, {
      recursive: true
    });

    // Initialize database (optional)
    if (this.enableDb) {
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
      }

      // Initialize enhanced features if enabled
      await this._initializeEnhancedFeatures();
    }
    try {
      this.startUrlNormalized = this.normalizeUrl(this.startUrl) || this.startUrl;
      if (this.startUrlNormalized) {
        this.state.addSeededHub(this.startUrlNormalized);
      }
    } catch (_) {
      this.startUrlNormalized = this.startUrl;
    }

    // Load robots.txt
    await this.loadRobotsTxt();

    console.log(`Starting crawler for ${this.domain}`);
    console.log(`Data will be saved to: ${this.dataDir}`);
  }

  async loadRobotsTxt() {
    try {
      const robotsUrl = `${this.baseUrl}/robots.txt`;
      console.log(`Loading robots.txt from: ${robotsUrl}`);

      const response = await fetch(robotsUrl);
      if (response.ok) {
        const robotsTxt = await response.text();
        this.robotsRules = robotsParser(robotsUrl, robotsTxt);
        console.log('robots.txt loaded successfully');
        this.robotsTxtLoaded = true;
        // Discover sitemap declarations
        try {
          // Prefer parser method when available
          let sm = [];
          if (typeof this.robotsRules.getSitemaps === 'function') {
            sm = this.robotsRules.getSitemaps() || [];
          } else {
            // Fallback: scan lines
            sm = robotsTxt.split(/\r?\n/)
              .map(l => l.trim())
              .filter(l => /^sitemap\s*:/i.test(l))
              .map(l => l.split(/:/i).slice(1).join(':').trim())
              .filter(Boolean);
          }
          // Normalize and keep on-domain first
          const norm = [];
          for (const u of sm) {
            try {
              const abs = new URL(u, this.baseUrl).href;
              norm.push(abs);
            } catch (_) {}
          }
          this.sitemapUrls = Array.from(new Set(norm));
          if (this.sitemapUrls.length) {
            console.log(`Found ${this.sitemapUrls.length} sitemap URL(s)`);
          }
        } catch (_) {}
      } else {
        console.log('No robots.txt found, proceeding without restrictions');
      }
    } catch (error) {
      console.log('Failed to load robots.txt, proceeding without restrictions');
    }
  }

  async loadSitemapsAndEnqueue() {
    if (!this.useSitemap) return;
    const pushed = await loadSitemaps(this.baseUrl, this.domain, this.sitemapUrls, {
      sitemapMaxUrls: this.sitemapMaxUrls,
      push: (u) => {
        const decision = this._getUrlDecision(u, {
          phase: 'sitemap',
          depth: 0,
          source: 'sitemap'
        });
        const analysis = decision?.analysis || {};
        const n = analysis && !analysis.invalid ? analysis.normalized : null;
        if (!n) return;
        if (!decision.allow) {
          if (decision.reason === 'query-superfluous') {
            this._handlePolicySkip(decision, {
              depth: 0,
              queueSize: this.queue.size()
            });
          }
          return;
        }
        if (!this.isOnDomain(n) || !this.isAllowed(n)) return;
        const type = this.looksLikeArticle(n) ? 'article' : 'nav';
        this.enqueueRequest({
          url: n,
          depth: 0,
          type
        });
        this.sitemapDiscovered = (this.sitemapDiscovered || 0) + 1;
        this.emitProgress();
      }
    });
    console.log(`Sitemap enqueue complete: ${pushed} URL(s)`);
  }

  isAllowed(url) {
    if (!this.robotsRules) return true;
    return this.robotsRules.isAllowed(url, '*');
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
    if (depth > this.maxDepth) return;

    // Respect max downloads limit
    if (this.maxDownloads !== undefined && this.stats.pagesDownloaded >= this.maxDownloads) {
      return {
        status: 'skipped'
      };
    }
    const fetchResult = await this.fetchPipeline.fetch({
      url,
      context: {
        ...context,
        depth,
        referrerUrl: null,
        queueType: context.type
      }
    });

    if (!fetchResult) {
      return {
        status: 'failed',
        retriable: true
      };
    }

    const {
      meta = {}, source, html
    } = fetchResult;
    const fetchMeta = meta.fetchMeta || null;
    const resolvedUrl = meta.url || url;
    let normalizedUrl = null;
    try {
      normalizedUrl = this.normalizeUrl(resolvedUrl);
    } catch (_) {
      normalizedUrl = resolvedUrl;
    }

    if (source === 'skipped') {
      return {
        status: meta.status || 'skipped'
      };
    }

    if (source === 'cache') {
      if (normalizedUrl) {
        this.state.addVisited(normalizedUrl);
        this._noteDepthVisit(normalizedUrl, depth);
      }
      this.state.incrementPagesVisited();
      this.emitProgress();
      const isArticleFromCache = this.looksLikeArticle(normalizedUrl || resolvedUrl);
      if (isArticleFromCache) {
        this.state.incrementArticlesFound();
        this.emitProgress();
      }
      if (this.dbAdapter && this.dbAdapter.isEnabled()) {
        try {
          const cachedHtml = html || '';
          const $c = cheerio.load(cachedHtml);
          const contentSig = this._computeContentSignals($c, cachedHtml);
          const urlSig = this._computeUrlSignals(normalizedUrl || resolvedUrl);
          const combined = this._combineSignals(urlSig, contentSig);
          this.dbAdapter.insertFetch({
            url: normalizedUrl || resolvedUrl,
            request_started_at: null,
            fetched_at: new Date().toISOString(),
            http_status: 200,
            content_type: 'text/html',
            content_length: cachedHtml ? Buffer.byteLength(cachedHtml, 'utf8') : null,
            content_encoding: null,
            bytes_downloaded: 0,
            transfer_kbps: null,
            ttfb_ms: null,
            download_ms: null,
            total_ms: null,
            saved_to_db: 0,
            saved_to_file: 0,
            file_path: null,
            file_size: null,
            classification: isArticleFromCache ? 'article' : 'other',
            nav_links_count: null,
            article_links_count: null,
            word_count: null,
            analysis: JSON.stringify({
              kind: 'cache-hit',
              url: urlSig,
              content: contentSig,
              combined
            })
          });
        } catch (_) {}
      }
      this._checkAnalysisMilestones({
        depth,
        isArticle: isArticleFromCache
      });
      return {
        status: 'cache'
      };
    }

    if (source === 'not-modified') {
      if (normalizedUrl) {
        this.state.addVisited(normalizedUrl);
        this._noteDepthVisit(normalizedUrl, depth);
      }
      this.state.incrementPagesVisited();
      this.emitProgress();
      if (this.dbAdapter && this.dbAdapter.isEnabled() && fetchMeta) {
        try {
          const existing = this.dbAdapter.getArticleRowByUrl?.(resolvedUrl);
          this.dbAdapter.insertFetch({
            url: resolvedUrl,
            request_started_at: fetchMeta.requestStartedIso || null,
            fetched_at: fetchMeta.fetchedAtIso || null,
            http_status: fetchMeta.httpStatus ?? 304,
            content_type: fetchMeta.contentType || null,
            content_length: fetchMeta.contentLength ?? null,
            content_encoding: fetchMeta.contentEncoding || null,
            bytes_downloaded: 0,
            transfer_kbps: null,
            ttfb_ms: fetchMeta.ttfbMs ?? null,
            download_ms: fetchMeta.downloadMs ?? null,
            total_ms: fetchMeta.totalMs ?? null,
            saved_to_db: 0,
            saved_to_file: 0,
            file_path: null,
            file_size: null,
            classification: existing ? 'article' : 'other',
            nav_links_count: null,
            article_links_count: null,
            word_count: existing?.word_count ?? null,
            analysis: JSON.stringify({
              status: 'not-modified',
              conditional: true
            })
          });
        } catch (_) {}
      }
      return {
        status: 'not-modified'
      };
    }

    if (source === 'error') {
      this.state.incrementErrors();
      const httpStatus = meta?.error?.httpStatus;
      const retriable = typeof httpStatus === 'number' ?
        (httpStatus === 429 || (httpStatus >= 500 && httpStatus < 600)) :
        true;
      return {
        status: 'failed',
        retriable,
        retryAfterMs: meta.retryAfterMs
      };
    }

    if (normalizedUrl) {
      this.state.addVisited(normalizedUrl);
      this._noteDepthVisit(normalizedUrl, depth);
    }
    this.state.incrementPagesVisited();
    this.state.incrementPagesDownloaded();
    if (fetchMeta?.bytesDownloaded != null) {
      this.state.incrementBytesDownloaded(fetchMeta.bytesDownloaded);
    }
    this.emitProgress();

    const dbEnabled = this.dbAdapter && typeof this.dbAdapter.isEnabled === 'function' && this.dbAdapter.isEnabled();
    let processorResult = null;
    try {
      processorResult = await this.articleProcessor.process({
        url: resolvedUrl,
        html,
        fetchMeta,
        depth,
        normalizedUrl,
        referrerUrl: context.referrerUrl || null,
        discoveredAt: context.discoveredAt || new Date().toISOString(),
        persistArticle: dbEnabled,
        insertFetchRecord: dbEnabled,
        insertLinkRecords: dbEnabled
      });
    } catch (error) {
      this._recordError({
        url: resolvedUrl,
        kind: 'article-processing',
        message: error?.message || String(error)
      });
      this.telemetry.problem({
        kind: 'article-processing-failed',
        target: resolvedUrl,
        message: error?.message || 'ArticleProcessor failed'
      });
      return {
        status: 'failed',
        retriable: false
      };
    }

    if (processorResult?.statsDelta) {
      const foundDelta = processorResult.statsDelta.articlesFound || 0;
      const savedDelta = processorResult.statsDelta.articlesSaved || 0;
      if (foundDelta) this.state.incrementArticlesFound(foundDelta);
      if (savedDelta) this.state.incrementArticlesSaved(savedDelta);
    }

    const navigationLinks = processorResult?.navigationLinks || [];
    const articleLinks = processorResult?.articleLinks || [];

    try {
      console.log(`Found ${navigationLinks.length} navigation links and ${articleLinks.length} article links on ${resolvedUrl}`);
    } catch (_) {}

    if (processorResult?.isArticle && processorResult.metadata) {
      try {
        this.adaptiveSeedPlanner?.seedFromArticle({
          url: resolvedUrl,
          metadata: processorResult.metadata,
          depth
        });
      } catch (_) {}
    }

    this._checkAnalysisMilestones({
      depth,
      isArticle: !!processorResult?.isArticle
    });

    const seen = new Set();
    const allLinks = processorResult?.allLinks || [];
    for (const link of allLinks) {
      if (!link || !link.url) continue;
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      this.enqueueRequest({
        url: link.url,
        depth: depth + 1,
        type: link.type || 'nav'
      });
    }

    return {
      status: 'success'
    };
  }

  computePriority({
    type,
    depth,
    discoveredAt,
    bias = 0,
    url = null,
    meta = null
  }) {
    // Use enhanced priority computation if available
    if (this.featuresEnabled?.gapDrivenPrioritization && this.priorityScorer) {
      try {
        const result = this.priorityScorer.computeEnhancedPriority({
          type,
          depth,
          discoveredAt,
          bias,
          url,
          meta,
          jobId: this.jobId
        });
        return result.priority;
      } catch (error) {
        console.warn('Enhanced priority computation failed, using base priority:', error.message);
      }
    }

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
    // Delegate to limiter for timing; mirror state to legacy map for UI telemetry
    const before = this._getDomainState(host);
    await (async () => {
      try {
        // Lazy require to avoid circular timing
        const {
          DomainLimiter
        } = require('./crawler/limiter');
        if (!this._domainLimiter) this._domainLimiter = new DomainLimiter({
          pacerJitterMinMs: this.pacerJitterMinMs,
          pacerJitterMaxMs: this.pacerJitterMaxMs
        });
        await this._domainLimiter.acquire(host);
        const s = this._domainLimiter._get(host);
        if (s) Object.assign(before, {
          isLimited: s.isLimited,
          rpm: s.rpm,
          nextRequestAt: s.nextRequestAt,
          backoffUntil: s.backoffUntil,
          lastRequestAt: s.lastRequestAt,
          rpmLastMinute: s.rpmLastMinute,
          windowStartedAt: s.windowStartedAt,
          windowCount: s.windowCount
        });
      } catch (_) {
        // Fall back to old behavior if helper unavailable
        const now = nowMs();
        if (before.backoffUntil > now) await sleep(before.backoffUntil - now);
        before.lastRequestAt = now;
      }
    })();
  }

  note429(host, retryAfterMs) {
    try {
      const {
        DomainLimiter
      } = require('./crawler/limiter');
      if (!this._domainLimiter) this._domainLimiter = new DomainLimiter({
        pacerJitterMinMs: this.pacerJitterMinMs,
        pacerJitterMaxMs: this.pacerJitterMaxMs
      });
      this._domainLimiter.note429(host, retryAfterMs);
      const s = this._domainLimiter._get(host);
      const st = this._getDomainState(host);
      if (s && st) Object.assign(st, s);
    } catch (_) {
      const now = nowMs();
      const state = this._getDomainState(host);
      state.isLimited = true;
      state.last429At = now;
      state.successStreak = 0;
      state.err429Streak++;
      const baseBlackout = retryAfterMs != null ? Math.max(30000, retryAfterMs) : 45000;
      const jitterV = Math.floor(baseBlackout * ((Math.random() * 0.2) - 0.1));
      let blackout = baseBlackout + jitterV;
      if (state.err429Streak >= 2) blackout = Math.max(blackout, 5 * 60 * 1000);
      if (state.err429Streak >= 3) blackout = Math.max(blackout, 15 * 60 * 1000);
      state.backoffUntil = now + blackout;
      const currentRpm = state.rpm || 60;
      const newRpm = Math.max(1, Math.floor(currentRpm * 0.25));
      state.rpm = newRpm;
      state.nextRequestAt = now + Math.floor(60000 / newRpm);
    }
  }

  noteSuccess(host) {
    try {
      const {
        DomainLimiter
      } = require('./crawler/limiter');
      if (!this._domainLimiter) this._domainLimiter = new DomainLimiter({
        pacerJitterMinMs: this.pacerJitterMinMs,
        pacerJitterMaxMs: this.pacerJitterMaxMs
      });
      this._domainLimiter.noteSuccess(host);
      const s = this._domainLimiter._get(host);
      const st = this._getDomainState(host);
      if (s && st) Object.assign(st, s);
    } catch (_) {
      const now = nowMs();
      const state = this._getDomainState(host);
      state.lastSuccessAt = now;
      state.successStreak++;
      state.err429Streak = 0;
      if (state.isLimited && state.successStreak > 100) {
        const canProbe = (now - state.last429At) > 5 * 60 * 1000;
        if (canProbe) {
          const currentRpm = state.rpm || 10;
          const nextRpm = Math.max(1, Math.floor(currentRpm * 1.1));
          state.rpm = Math.min(nextRpm, 300);
          state.successStreak = 0;
        }
      }
    }
  }

  _pullNextWorkItem() {
    return this.queue.pullNext();
  }

  async runWorker(workerId) {
    while (true) {
      if (this.isAbortRequested()) {
        return;
      }
      // honor pause
      while (this.isPaused() && !this.isAbortRequested()) {
        await sleep(200);
        this.emitProgress();
      }
      if (this.isAbortRequested()) {
        return;
      }
      if (this.maxDownloads !== undefined && this.stats.pagesDownloaded >= this.maxDownloads) {
        return;
      }
      const pick = await this._pullNextWorkItem();
      if (this.isAbortRequested()) {
        return;
      }
      const now = nowMs();
      if (!pick || !pick.item) {
        const queueSize = this.queue.size();
        const wakeTarget = pick && pick.wakeAt ? Math.max(0, pick.wakeAt - now) : 0;
        const maxWait = wakeTarget > 0 ? Math.min(wakeTarget, 1000) : 1000;
        let waited = 0;
        const waitStep = 100;
        while (waited < maxWait && !this.isAbortRequested()) {
          await sleep(Math.min(waitStep, maxWait - waited));
          waited += waitStep;
          if (this.queue.size() > 0 || this.isPaused()) {
            break;
          }
        }
        if (this.isAbortRequested()) {
          return;
        }
        if (this.queue.size() === 0 && !this.isPaused()) {
          return;
        }
        continue;
      }
      const item = pick.item;
      const extraCtx = pick.context || {};
      // Dequeue for processing
      try {
        const host = this._safeHostFromUrl(item.url);
        const sizeNow = this.queue.size();
        this.telemetry.queueEvent({
          action: 'dequeued',
          url: item.url,
          depth: item.depth,
          host,
          queueSize: sizeNow
        });
      } catch (_) {}
      this.busyWorkers++;
      const processContext = {
        type: item.type,
        allowRevisit: item.allowRevisit
      };
      if (extraCtx && extraCtx.forceCache) {
        processContext.forceCache = true;
        if (extraCtx.cachedPage) processContext.cachedPage = extraCtx.cachedPage;
        if (extraCtx.rateLimitedHost) processContext.rateLimitedHost = extraCtx.rateLimitedHost;
      }
      const res = await this.processPage(item.url, item.depth, processContext);
      if (this.isAbortRequested()) {
        return;
      }
      this.busyWorkers = Math.max(0, this.busyWorkers - 1);
      if (res && res.status === 'failed') {
        const retriable = !!res.retriable && item.retries < this.retryLimit;
        if (retriable) {
          item.retries += 1;
          const base = res.retryAfterMs != null ? res.retryAfterMs : Math.min(this.backoffBaseMs * Math.pow(2, item.retries - 1), this.backoffMaxMs);
          item.nextEligibleAt = nowMs() + jitter(base);
          // Recompute priority to keep ordering roughly stable
          item.priority = this.computePriority({
            type: item.type,
            depth: item.depth,
            discoveredAt: item.discoveredAt,
            bias: item.priorityBias || 0
          });
          this.queue.reschedule(item);
          // Emit retry event after requeue
          try {
            const host = (() => {
              try {
                return new URL(item.url).hostname;
              } catch (_) {
                return null;
              }
            })();
            const sizeNow = this.queue.size();
            this.telemetry.queueEvent({
              action: 'retry',
              url: item.url,
              depth: item.depth,
              host,
              reason: 'retriable-error',
              queueSize: sizeNow
            });
          } catch (_) {}
        }
      }
      // loop continues
    }
  }

  async crawlConcurrent() {
    await this.init();
    // Optional intelligent planning path
    if (this.plannerEnabled) {
      try {
        await this.planIntelligent();
      } catch (e) {
        try {
          this.telemetry.problem({
            kind: 'intelligent-plan-failed',
            message: e?.message || String(e)
          });
        } catch (_) {}
      }
    }
    // Optionally preload URLs from sitemaps
    if (this.useSitemap) {
      try {
        await this.loadSitemapsAndEnqueue();
      } catch (_) {}
    }
    // Seed start URL unless we are sitemap-only
    if (!this.sitemapOnly) {
      this.enqueueRequest({
        url: this.startUrl,
        depth: 0,
        type: 'nav'
      });
    }
    const workers = [];
    const n = this.concurrency;
    for (let i = 0; i < n; i++) {
      workers.push(this.runWorker(i));
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
    this._emitIntelligentCompletionMilestone({
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
    const host = this.domain.toLowerCase();
    try {
      console.log(`Intelligent crawl planning for host=${host}`);
    } catch (_) {}
    const telemetryBridge = new PlannerTelemetryBridge({
      telemetry: this.telemetry,
      domain: host,
      logger: console
    });
    const orchestrator = new PlannerOrchestrator({
      telemetryBridge,
      logger: console,
      enabled: this.plannerEnabled
    });

    const plannerBootstrap = new PlannerBootstrap({
      telemetry: telemetryBridge,
      plannerVerbosity: this.plannerVerbosity
    });

    const bootstrapResult = await orchestrator.runStage('bootstrap', {
      host,
      targetHosts: Array.isArray(this.intTargetHosts) && this.intTargetHosts.length ? this.intTargetHosts : undefined
    }, () => plannerBootstrap.run({
      host,
      targetHosts: this.intTargetHosts
    }), {
      mapResultForEvent: (res) => {
        if (!res) return null;
        return {
          allowed: res.allowed !== false,
          skipped: !!res.skipPlan,
          plannerVerbosity: res.plannerVerbosity,
          targetHosts: Array.isArray(res.targetHosts) && res.targetHosts.length ? res.targetHosts : undefined
        };
      },
      updateSummaryWithResult: (summary = {}, res) => ({
        ...summary,
        bootstrap: {
          allowed: res?.allowed !== false,
          skipPlan: !!res?.skipPlan,
          targetHosts: Array.isArray(res?.targetHosts) && res.targetHosts.length ? res.targetHosts : null,
          plannerVerbosity: res?.plannerVerbosity ?? this.plannerVerbosity
        }
      })
    });

    if (bootstrapResult?.skipPlan) {
      const summary = orchestrator.buildSummary({
        seededCount: 0,
        requestedCount: 0,
        sectionHubCount: 0,
        countryCandidateCount: 0,
        sampleSeeded: [],
        learnedSectionCount: 0,
        learnedSectionsPreview: []
      });
      this._plannerSummary = summary;
      this._intelligentPlanSummary = summary;
      return;
    }

    const patternInference = new PatternInference({
      fetchPage: ({ url, context }) => this.fetchPipeline.fetch({ url, context }),
      getCachedArticle: (url) => this.getCachedArticle(url),
      telemetry: telemetryBridge,
      baseUrl: this.baseUrl,
      domain: this.domain,
      logger: console
    });

    const patternResult = await orchestrator.runStage('infer-patterns', {
      startUrl: this.startUrl
    }, () => patternInference.run({
      startUrl: this.startUrl
    }), {
      mapResultForEvent: (res) => {
        if (!res) return null;
        const sections = Array.isArray(res.learned?.sections) ? res.learned.sections : [];
        const hints = Array.isArray(res.learned?.articleHints) ? res.learned.articleHints : [];
        return {
          sectionCount: sections.length,
          sectionsPreview: sections.slice(0, 6),
          articleHintsCount: hints.length,
          articleHintsPreview: hints.slice(0, 6),
          homepageSource: res.fetchMeta?.source || null,
          notModified: !!res.fetchMeta?.notModified,
          hadError: !!res.fetchMeta?.error
        };
      },
      updateSummaryWithResult: (summary = {}, res) => ({
        ...summary,
        learnedSections: Array.isArray(res?.learned?.sections) ? res.learned.sections : [],
        articleHints: Array.isArray(res?.learned?.articleHints) ? res.learned.articleHints : []
      })
    });

    const learnedSections = Array.isArray(patternResult?.learned?.sections) ? patternResult.learned.sections : [];

    const countryHubPlanner = new CountryHubPlanner({
      baseUrl: this.baseUrl,
      db: this.dbAdapter,
      knowledgeService: this.plannerKnowledgeService
    });

    const countryCandidates = await orchestrator.runStage('country-hubs', {
      host
    }, () => countryHubPlanner.computeCandidates(host), {
      mapResultForEvent: (res) => {
        if (!Array.isArray(res)) {
          return {
            candidateCount: 0
          };
        }
        return {
          candidateCount: res.length,
          sample: res.slice(0, 5).map((c) => c?.url).filter(Boolean)
        };
      },
      updateSummaryWithResult: (summary = {}, res) => ({
        ...summary,
        countryCandidates: Array.isArray(res) ? res : []
      })
    }) || [];

    const maxSeeds = typeof this.intMaxSeeds === 'number' ? this.intMaxSeeds : 50;
    const hubSeeder = new HubSeeder({
      enqueueRequest: (request) => this.enqueueRequest(request),
      normalizeUrl: (url) => this.normalizeUrl(url),
      state: this.state,
      telemetry: telemetryBridge,
      db: this.dbAdapter,
      baseUrl: this.baseUrl,
      logger: console
    });

    const seedResult = await orchestrator.runStage('seed-hubs', {
      sectionsFromPatterns: learnedSections.length,
      candidateCount: countryCandidates.length,
      maxSeeds
    }, () => hubSeeder.seedPlan({
      host,
      sectionSlugs: learnedSections,
      countryCandidates,
      maxSeeds
    }), {
      mapResultForEvent: (res) => {
        if (!res) return null;
        return {
          seededCount: res.seededCount || 0,
          requestedCount: res.requestedCount || 0,
          sectionHubCount: res.sectionHubCount || 0,
          countryCandidateCount: res.countryCandidateCount || 0,
          sampleSeeded: Array.isArray(res.sampleSeeded) ? res.sampleSeeded.slice(0, 3) : undefined
        };
      },
      updateSummaryWithResult: (summary = {}, res) => ({
        ...summary,
        seedResult: res || null
      })
    });

    const plannerSummary = orchestrator.buildSummary({
      learnedSectionCount: learnedSections.length,
      learnedSectionsPreview: learnedSections.slice(0, 8)
    });

    this._plannerSummary = plannerSummary;
    this._intelligentPlanSummary = {
      seededCount: seedResult?.seededCount || 0,
      requestedCount: seedResult?.requestedCount || 0,
      sectionHubCount: seedResult?.sectionHubCount || learnedSections.length,
      countryCandidateCount: seedResult?.countryCandidateCount || countryCandidates.length,
      sampleSeeded: Array.isArray(seedResult?.sampleSeeded) ? seedResult.sampleSeeded.slice(0, 5) : [],
      learnedSectionCount: learnedSections.length,
      learnedSectionsPreview: learnedSections.slice(0, 8),
      ...plannerSummary
    };
  }

  async crawl() {
    if (this.usePriorityQueue) {
      return this.crawlConcurrent();
    }
    await this.init();

    // Start with the initial URL
    this.enqueueRequest({
      url: this.startUrl,
      depth: 0,
      type: 'nav'
    });

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
    this._emitIntelligentCompletionMilestone({
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
    try {
      // Initialize configuration manager
      this.configManager = new ConfigManager();
      const features = this.configManager.getFeatureFlags();

      console.log('Enhanced features configuration:', features);

      // Initialize enhanced database adapter if features are enabled
      if (Object.values(features).some(enabled => enabled) && this.dbAdapter?.isEnabled()) {
        try {
          this.enhancedDbAdapter = new EnhancedDatabaseAdapter(this.dbAdapter);
          console.log('Enhanced database adapter initialized');
        } catch (error) {
          console.warn('Failed to initialize enhanced database adapter:', error.message);
          this.enhancedDbAdapter = null;
        }
      }

      // Initialize priority scorer if gap-driven prioritization is enabled
      if (features.gapDrivenPrioritization) {
        try {
          this.priorityScorer = new PriorityScorer(this.configManager, this.enhancedDbAdapter);
          this.featuresEnabled.gapDrivenPrioritization = true;
          console.log('Priority scorer initialized for gap-driven prioritization');
        } catch (error) {
          console.warn('Failed to initialize priority scorer:', error.message);
          this.featuresEnabled.gapDrivenPrioritization = false;
        }
      }

      // Initialize problem clustering service if enabled
      if (features.problemClustering && this.enhancedDbAdapter) {
        try {
          this.problemClusteringService = new ProblemClusteringService(this.enhancedDbAdapter, this.configManager);
          this.featuresEnabled.problemClustering = true;
          console.log('Problem clustering service initialized');
        } catch (error) {
          console.warn('Failed to initialize problem clustering service:', error.message);
          this.featuresEnabled.problemClustering = false;
        }
      }

      // Initialize planner knowledge service if enabled
      if (features.plannerKnowledgeReuse && this.enhancedDbAdapter) {
        try {
          this.plannerKnowledgeService = new PlannerKnowledgeService(this.enhancedDbAdapter, this.configManager);
          this.featuresEnabled.plannerKnowledgeReuse = true;
          console.log('Planner knowledge service initialized');
        } catch (error) {
          console.warn('Failed to initialize planner knowledge service:', error.message);
          this.featuresEnabled.plannerKnowledgeReuse = false;
        }
      }

      // Enable other features based on successful initialization
      this.featuresEnabled.realTimeCoverageAnalytics = features.realTimeCoverageAnalytics && Boolean(this.enhancedDbAdapter);

      // Log final feature status
      const enabledFeatures = Object.keys(this.featuresEnabled).filter(k => this.featuresEnabled[k]);
      if (enabledFeatures.length > 0) {
        console.log(`Enhanced features enabled: ${enabledFeatures.join(', ')}`);
      } else {
        console.log('Enhanced features disabled or unavailable');
      }

    } catch (error) {
      console.warn('Enhanced features initialization failed:', error.message);
      // Ensure all enhanced features are disabled on initialization failure
      Object.keys(this.featuresEnabled).forEach(key => {
        this.featuresEnabled[key] = false;
      });
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
    if (this.featuresEnabled.gapDrivenPrioritization && this.priorityScorer) {
      try {
        return this.priorityScorer.computeEnhancedPriority({
          type,
          depth,
          discoveredAt,
          bias,
          url,
          meta,
          jobId: this.jobId
        });
      } catch (error) {
        console.warn('Enhanced priority computation failed, falling back to base:', error.message);
      }
    }

    // Fallback to base priority calculation
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

  /**
   * Cleanup enhanced features on crawler shutdown
   */
  _cleanupEnhancedFeatures() {
    try {
      if (this.problemClusteringService) {
        this.problemClusteringService.close();
      }
      if (this.plannerKnowledgeService) {
        this.plannerKnowledgeService.close();
      }
      if (this.priorityScorer) {
        this.priorityScorer.close();
      }
      if (this.configManager) {
        this.configManager.close();
      }
    } catch (error) {
      console.warn('Error during enhanced features cleanup:', error.message);
    }
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
