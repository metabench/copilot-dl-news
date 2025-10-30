#!/usr/bin/env node

const fetch = (...args) => import('node-fetch').then(({ 
  default: fetch 
}) => fetch(...args));
const robotsParser = require('robots-parser');
const fs = require('fs').promises;
const { existsSync } = require('fs');
const path = require('path');
const readline = require('readline');
const { tof, is_array } = require('lang-tools');
const { buildOptions } = require('./utils/optionsBuilder');
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
const {
  ensureGazetteer,
  ensureDatabase
} = require('./db/sqlite');
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
const {
  ProblemResolutionService
} = require('./crawler/ProblemResolutionService');
const {
  CrawlPlaybookService
} = require('./crawler/CrawlPlaybookService');
const {
  CountryHubGapService
} = require('./crawler/CountryHubGapService');
const {
  CountryHubBehavioralProfile
} = require('./crawler/CountryHubBehavioralProfile');
const chalk = require('chalk');

const CLI_COLORS = Object.freeze({
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
  progress: chalk.cyan,
  muted: chalk.gray,
  neutral: chalk.white,
  accent: chalk.magenta,
  dim: chalk.dim
});

const CLI_ICONS = Object.freeze({
  info: 'ℹ',
  success: '✓',
  warning: '⚠',
  error: '✖',
  progress: '⚙',
  pending: '⏳',
  complete: '✅',
  geography: '🌍',
  schema: '🗂',
  compass: '🧭',
  features: '🧠',
  stageCountries: '🌐',
  stageRegions: '🗺️',
  stageCities: '🏙️',
  stageBoundaries: '🛡️',
  summary: '📊',
  idle: '○',
  bullet: '•',
  debug: '…'
});

const CLI_STAGE_LABELS = Object.freeze({
  countries: 'Countries',
  adm1: 'Regions',
  adm2: 'Sub-regions',
  cities: 'Cities',
  boundaries: 'Boundaries'
});

const CLI_STAGE_ICONS = Object.freeze({
  countries: CLI_ICONS.stageCountries,
  adm1: CLI_ICONS.stageRegions,
  adm2: CLI_ICONS.stageRegions,
  cities: CLI_ICONS.stageCities,
  boundaries: CLI_ICONS.stageBoundaries
});

const CLI_STAGE_COLORS = Object.freeze({
  countries: CLI_COLORS.info,
  adm1: CLI_COLORS.accent,
  adm2: CLI_COLORS.accent,
  cities: CLI_COLORS.success,
  boundaries: CLI_COLORS.warning,
  default: CLI_COLORS.progress
});

const colorText = (colorFn, text) => (colorFn ? colorFn(text) : text);
const colorBold = (colorFn, text) => (colorFn?.bold ? colorFn.bold(text) : colorText(colorFn, text));

// Global verbose flag (set by CLI argument)
let VERBOSE_MODE = false;

const log = {
  success: (msg) => console.log(CLI_COLORS.success(CLI_ICONS.success), msg),
  error: (msg) => console.log(CLI_COLORS.error(CLI_ICONS.error), msg),
  warn: (msg) => console.log(CLI_COLORS.warning(CLI_ICONS.warning), msg),
  info: (msg) => console.log(CLI_COLORS.info(CLI_ICONS.info), msg),
  progress: (stage, current, total, details = '') => {
    const pct = Math.round((current / total) * 100);
    const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
    const detailText = details ? CLI_COLORS.muted(` ${details}`) : '';
    console.log(CLI_COLORS.progress(`[${bar}] ${pct}% ${stage}`) + detailText);
  },
  stat: (label, value) => console.log(CLI_COLORS.muted(`${label}:`), CLI_COLORS.neutral(value)),
  debug: (...args) => VERBOSE_MODE && console.error(CLI_COLORS.dim('[DEBUG]'), ...args),

  // Format geography crawl progress into concise one-liner
  formatGeographyProgress: (data) => {
    if (!data || !data.gazetteer) return null;

    const g = data.gazetteer;
    const parts = [];
    const progressPayload = g.lastProgress?.payload;

    if (g.status === 'running') {
      parts.push(CLI_COLORS.progress(CLI_ICONS.progress));
    } else if (g.status === 'completed') {
      parts.push(CLI_COLORS.success(CLI_ICONS.complete));
    } else if (g.error) {
      parts.push(CLI_COLORS.error(CLI_ICONS.error));
    } else {
      parts.push(CLI_COLORS.muted(CLI_ICONS.idle));
    }

    if (g.currentStage) {
      const stageKey = g.currentStage;
      const stageLabel = CLI_STAGE_LABELS[stageKey] || stageKey;
      const stageColor = CLI_STAGE_COLORS[stageKey] || CLI_STAGE_COLORS.default;
      const stageIcon = CLI_STAGE_ICONS[stageKey] || CLI_ICONS.progress;
      const innerPayload = (progressPayload?.phase === 'ingestor-progress') ? progressPayload?.payload : progressPayload;

      let descriptor = `${colorText(stageColor, stageIcon)} ${colorBold(stageColor, stageLabel)}`;

      if (stageKey === 'boundaries' && innerPayload?.canonicalName) {
        const locationLabel = innerPayload.countryCode
          ? `${innerPayload.canonicalName} (${innerPayload.countryCode})`
          : innerPayload.canonicalName;
        descriptor = `${descriptor} ${colorText(stageColor, locationLabel)}`;
      } else if ((stageKey === 'cities' || stageKey === 'adm1') && innerPayload?.countryCode) {
        descriptor = `${descriptor} ${colorText(stageColor, innerPayload.countryCode)}`;
      }

      parts.push(descriptor);
    }

    if (progressPayload) {
      const payload = progressPayload;

      if (payload.phase === 'stage-start') {
        parts.push(CLI_COLORS.muted(`starting (${payload.ingestorCount || 0} ingestors)`));
      } else if (payload.phase === 'ingestor-start') {
        parts.push(CLI_COLORS.muted(`ingestor: ${payload.ingestor || 'unknown'}`));
      } else if (payload.phase === 'discovery') {
        if (payload.totalCountries) {
          parts.push(CLI_COLORS.muted(`discovering from ${payload.totalCountries} countries`));
        }
        if (payload.estimatedTotal) {
          parts.push(CLI_COLORS.muted(`~${payload.estimatedTotal} expected`));
        }
      } else if (payload.phase === 'processing') {
        if (payload.current != null && payload.totalItems != null) {
          parts.push(CLI_COLORS.neutral(`[${payload.current}/${payload.totalItems}]`));
        }

        if (payload.citiesProcessed != null) {
          parts.push(CLI_COLORS.muted(`${payload.citiesProcessed} cities`));
        } else if (payload.regionsProcessed != null) {
          parts.push(CLI_COLORS.muted(`${payload.regionsProcessed} regions`));
        }

        if (payload.percentComplete != null) {
          const pct = payload.percentComplete;
          const pctColor = pct < 33 ? CLI_COLORS.error : pct < 66 ? CLI_COLORS.warning : CLI_COLORS.success;
          parts.push(pctColor(`${pct}%`));
        }

        if (payload.totalUpserted != null || payload.totalProcessed != null) {
          const upserted = payload.totalUpserted || 0;
          const processed = payload.totalProcessed || 0;
          const errors = payload.totalErrors || 0;

          if (upserted > 0) {
            parts.push(CLI_COLORS.success(`${CLI_ICONS.success}${upserted}`));
          }
          if (processed > 0) {
            parts.push(CLI_COLORS.muted(`${processed} total`));
          }
          if (errors > 0) {
            parts.push(CLI_COLORS.error(`${CLI_ICONS.error}${errors}`));
          }
        }
      }

      if (payload.timing && payload.timing.estimatedRemainingMs != null) {
        const remainingSec = Math.round(payload.timing.estimatedRemainingMs / 1000);
        const remainingMin = Math.floor(remainingSec / 60);
        if (remainingMin > 0) {
          parts.push(CLI_COLORS.dim(`~${remainingMin}m left`));
        } else if (remainingSec > 0) {
          parts.push(CLI_COLORS.dim(`~${remainingSec}s left`));
        }
      }

      if (payload.message && !payload.countryCode) {
        parts.push(CLI_COLORS.muted(payload.message));
      }
    }

    return parts.join(' ');
  }
};

const formatStageStart = (stageKey) => {
  if (!stageKey) return null;
  const label = CLI_STAGE_LABELS[stageKey] || stageKey;
  const colorFn = CLI_STAGE_COLORS[stageKey] || CLI_STAGE_COLORS.default;
  const icon = CLI_STAGE_ICONS[stageKey] || CLI_ICONS.progress;
  const statusIcon = CLI_COLORS.progress(CLI_ICONS.pending);
  const stageIcon = colorText(colorFn, icon);
  const stageLabel = colorBold(colorFn, label);
  return `${statusIcon} ${stageIcon} ${stageLabel} ${CLI_COLORS.muted('starting')}`;
};

const formatStageComplete = (stageKey, stats) => {
  if (!stageKey) return null;
  const summary = stats && typeof stats === 'object' ? stats : null;
  const label = CLI_STAGE_LABELS[stageKey] || stageKey;
  const colorFn = CLI_STAGE_COLORS[stageKey] || CLI_STAGE_COLORS.default;
  const icon = CLI_STAGE_ICONS[stageKey] || CLI_ICONS.progress;
  const stageIcon = colorText(colorFn, icon);
  const stageLabel = colorBold(colorFn, label);

  const processed = summary?.recordsProcessed;
  const upserted = summary?.recordsUpserted;
  const errors = summary?.errors;
  const ingestors = summary?.ingestorsCompleted ?? summary?.ingestorsAttempted;

  const detailParts = [];
  if (processed != null) {
    detailParts.push(CLI_COLORS.muted(`${processed} processed`));
  }
  if (upserted != null) {
    detailParts.push(upserted > 0
      ? CLI_COLORS.success(`${CLI_ICONS.success}${upserted} new`)
      : CLI_COLORS.muted('0 new'));
  }
  if (errors != null) {
    detailParts.push(errors > 0
      ? CLI_COLORS.error(`${CLI_ICONS.error}${errors}`)
      : CLI_COLORS.muted('0 errors'));
  }
  if (ingestors != null) {
    detailParts.push(CLI_COLORS.muted(`${ingestors} ingestor${ingestors === 1 ? '' : 's'}`));
  }

  const bullet = CLI_COLORS.muted(` ${CLI_ICONS.bullet} `);
  const detailText = detailParts.filter(Boolean).join(bullet);
  return `${CLI_COLORS.success(CLI_ICONS.complete)} ${stageIcon} ${stageLabel}${detailText ? ' ' + detailText : ''}`;
};

const formatAllStagesSummary = (summary) => {
  if (!summary || typeof summary !== 'object') return null;
  const stages = summary.stagesCompleted ?? summary.stagesAttempted;
  const processed = summary.recordsProcessed;
  const upserted = summary.recordsUpserted;
  const errors = summary.errors;

  const detailParts = [];
  if (stages != null) {
    detailParts.push(CLI_COLORS.muted(`${stages} stages`));
  }
  if (processed != null) {
    detailParts.push(CLI_COLORS.muted(`${processed} processed`));
  }
  if (upserted != null) {
    detailParts.push(upserted > 0
      ? CLI_COLORS.success(`${CLI_ICONS.success}${upserted} new`)
      : CLI_COLORS.muted('0 new'));
  }
  if (errors != null) {
    detailParts.push(errors > 0
      ? CLI_COLORS.error(`${CLI_ICONS.error}${errors}`)
      : CLI_COLORS.muted('0 errors'));
  }

  const bullet = CLI_COLORS.muted(` ${CLI_ICONS.bullet} `);
  const detailText = detailParts.filter(Boolean).join(bullet);
  return `${CLI_COLORS.success(CLI_ICONS.summary)} ${colorBold(CLI_COLORS.success, 'Gazetteer summary')}${detailText ? ' ' + detailText : ''}`;
};

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
const {
  NavigationDiscoveryService
} = require('./crawler/NavigationDiscoveryService');
const {
  ContentAcquisitionService
} = require('./crawler/ContentAcquisitionService');
const ArticleSignalsService = require('./crawler/ArticleSignalsService');
const {
  GazetteerModeController
} = require('./crawler/gazetteer/GazetteerModeController');
const {
  StagedGazetteerCoordinator
} = require('./crawler/gazetteer/StagedGazetteerCoordinator');
const {
  WikidataCountryIngestor
} = require('./crawler/gazetteer/ingestors/WikidataCountryIngestor');
const WikidataAdm1Ingestor = require('./crawler/gazetteer/ingestors/WikidataAdm1Ingestor');
const WikidataCitiesIngestor = require('./crawler/gazetteer/ingestors/WikidataCitiesIngestor');
const OsmBoundaryIngestor = require('./crawler/gazetteer/ingestors/OsmBoundaryIngestor');
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
  TargetedAnalysisRunner
} = require('./crawler/planner/TargetedAnalysisRunner');
const {
  NavigationDiscoveryRunner
} = require('./crawler/planner/navigation/NavigationDiscoveryRunner');
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
  maxAgeHubMs: { type: 'number', default: undefined, validator: (val) => val >= 0 },
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
  skipQueryUrls: { type: 'boolean', default: true },
  connectionResetWindowMs: { type: 'number', default: 2 * 60 * 1000, validator: (val) => val > 0 },
  connectionResetThreshold: { type: 'number', default: 3, validator: (val) => val > 0 }
};

class NewsCrawler {
  constructor(startUrl, options = {}) {
    this.startUrl = startUrl;
    this.domain = new URL(startUrl).hostname;
    this.domainNormalized = normalizeHost(this.domain);
    this.baseUrl = `${new URL(startUrl).protocol}//${this.domain}`;
    
    // Apply schema-driven option validation
    const opts = buildOptions(options, crawlerOptionsSchema);
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
    // Sitemap support
    this.useSitemap = opts.useSitemap;
    this.sitemapOnly = opts.sitemapOnly;
    this.sitemapMaxUrls = opts.sitemapMaxUrls;
    // Intelligent planner options
    this.hubMaxPages = opts.hubMaxPages;
    this.hubMaxDays = opts.hubMaxDays;
    this.intMaxSeeds = opts.intMaxSeeds;
    this.intTargetHosts = opts.intTargetHosts;
    this.plannerVerbosity = opts.plannerVerbosity;
    // Geography crawl limits
    this.limitCountries = opts.limitCountries;
    this.targetCountries = opts.targetCountries && opts.targetCountries.length ? opts.targetCountries : null;
    this.gazetteerStageFilter = Array.isArray(opts.gazetteerStages) && opts.gazetteerStages.length
      ? new Set(opts.gazetteerStages.map(stage => String(stage).toLowerCase()))
      : null;

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
      ProblemResolutionService,
      CrawlPlaybookService,
      CountryHubGapService,
      CountryHubBehavioralProfile,
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
    this.requestTimeoutMs = opts.requestTimeoutMs;
    // Pacing jitter to avoid worker alignment
    this.pacerJitterMinMs = opts.pacerJitterMinMs;
    this.pacerJitterMaxMs = Math.max(this.pacerJitterMinMs, opts.pacerJitterMaxMs);
    // Crawl type determines planner features (e.g., 'intelligent')
    this.crawlType = opts.crawlType;
    this.gazetteerVariant = this._resolveGazetteerVariant(this.crawlType);
    this.isGazetteerMode = !!this.gazetteerVariant;
    this.countryHubExclusiveMode = Boolean(
      opts.exhaustiveCountryHubMode ||
      opts.countryHubExclusiveMode ||
      (typeof opts.priorityMode === 'string' && opts.priorityMode.toLowerCase() === 'country-hubs-only')
    );
    const structureOnlyFromCrawlType = this.crawlType === 'discover-structure';
    if (opts.structureOnly != null) {
      this.structureOnly = !!opts.structureOnly;
    } else {
      this.structureOnly = structureOnlyFromCrawlType || this.countryHubExclusiveMode;
    }
    if (options.concurrency == null && this.structureOnly && this.concurrency < 4) {
      this.concurrency = 4;
      this.usePriorityQueue = this.concurrency > 1;
    }
  this.plannerEnabled = this.crawlType.startsWith('intelligent') || this.structureOnly;
    this.skipQueryUrls = opts.skipQueryUrls;
    if (this.isGazetteerMode) {
      this._applyGazetteerDefaults(options);
    }
    this._gazetteerPipelineConfigured = false;
    this.gazetteerPlanner = null;
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
    this.connectionResetWindowMs = opts.connectionResetWindowMs;
    this.connectionResetThreshold = opts.connectionResetThreshold;

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
  getProblemResolutionService: () => this.problemResolutionService,
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
        if (!plan || !is_array(plan.actions)) {
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

    this.navigationDiscoveryService = new NavigationDiscoveryService({
      linkExtractor: this.linkExtractor,
      normalizeUrl: (url, ctx) => this.normalizeUrl(url, ctx),
      looksLikeArticle: (url) => this.looksLikeArticle(url),
      logger: console
    });

    this.contentAcquisitionService = new ContentAcquisitionService({
      articleProcessor: this.articleProcessor,
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
      shouldBypassDepth: (info) => this._shouldBypassDepth(info),
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
      jobIdProvider: () => this.jobId,
      onRateLimitDeferred: () => {
        try {
          this.state.incrementCacheRateLimitedDeferred();
        } catch (_) {}
      }
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
      dbAdapter: () => this.dbAdapter,
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
      navigationDiscoveryService: this.navigationDiscoveryService,
      contentAcquisitionService: this.contentAcquisitionService,
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
      combineSignals: (urlSignals, contentSignals, opts) => this._combineSignals(urlSignals, contentSignals, opts),
      countryHubGapService: () => this.enhancedFeatures?.getCountryHubGapService?.(),
      jobId: this.jobId,
      domain: this.domain,
      structureOnly: this.structureOnly,
      hubOnlyMode: this.countryHubExclusiveMode,
      getCountryHubBehavioralProfile: () => this.countryHubBehavioralProfile
    });

    if (this.isGazetteerMode) {
      this._setupGazetteerModeController(options);
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

  /**
   * Determine if crawlType represents a specialized gazetteer mode
   * 
   * Specialized modes (gazetteer, geography, wikidata) have different execution
   * characteristics than regular web crawls:
   * - Sequential processing (not concurrent by default)
   * - External API dependencies with rate limits
   * - Hierarchical data relationships requiring ordered processing
   * - concurrency parameter treated as maximum allowed, not requirement
   */
  _resolveGazetteerVariant(crawlType) {
    if (!crawlType) {
      return null;
    }
    const normalized = String(crawlType).toLowerCase();
    if (normalized === 'wikidata') {
      return 'wikidata';
    }
    if (normalized === 'geography' || normalized === 'gazetteer') {
      return 'geography';
    }
    return null;
  }

  /**
   * Apply default settings for gazetteer/geography crawl modes
   * 
   * CONCURRENCY: The concurrency parameter is stored but treated as a MAXIMUM
   * ALLOWED limit, not a requirement. Gazetteer and geography crawls process
   * data sequentially by default due to:
   * - External API rate limits (Wikidata SPARQL: 60 req/min, Overpass API)
   * - Database transaction ordering (parent places must exist before children)
   * - Sequential dependencies (countries → regions → boundaries)
   * 
   * Future optimizations may add limited parallelism (e.g., parallel ingestors
   * within a stage), but will always respect this.concurrency as an upper bound.
   */
  _applyGazetteerDefaults(options = {}) {
    this.structureOnly = false;
    this.useSitemap = false;
    this.sitemapOnly = false;
    if (options.skipQueryUrls == null) {
      this.skipQueryUrls = false;
    }
    if (options.preferCache == null) {
      this.preferCache = false;
    }
    // Store concurrency as maximum allowed, not as required parallelism level
    this.concurrency = Math.max(1, options.concurrency || 1);
    this.usePriorityQueue = false;
    
    // Geography/gazetteer crawls should process all stages regardless of depth
    // Set maxDepth to 999 to effectively disable depth filtering
    if (options.maxDepth == null) {
      this.maxDepth = 999;
    }
  }

  _shouldBypassDepth(info = {}) {
    if (this.isGazetteerMode) {
      return true;
    }
    const meta = info.meta || null;
    if (meta && (meta.depthPolicy === 'ignore' || meta.depthPolicy === 'bypass' || meta.origin === 'gazetteer' || meta.mode === 'gazetteer')) {
      return true;
    }
    const decisionMeta = info.decision?.meta || null;
    if (decisionMeta && (decisionMeta.depthPolicy === 'ignore' || decisionMeta.depthPolicy === 'bypass')) {
      return true;
    }
    return false;
  }

  _setupGazetteerModeController(options = {}) {
    const gazetteerOptions = options.gazetteer || {};
    const controllerOptions = {
      telemetry: this.telemetry,
      milestoneTracker: this.milestoneTracker,
      state: this.state,
      dbAdapter: this.dbAdapter,
      logger: console,
      jobId: this.jobId,
      mode: this.gazetteerVariant || 'gazetteer'
    };
    if (gazetteerOptions.ingestionCoordinator) {
      controllerOptions.ingestionCoordinator = gazetteerOptions.ingestionCoordinator;
    }
    this.gazetteerOptions = gazetteerOptions;
    this.gazetteerModeController = new GazetteerModeController(controllerOptions);
    this.gazetteerModeProfile = controllerOptions.mode;
  }

  _configureGazetteerPipeline() {
    if (!this.isGazetteerMode || this._gazetteerPipelineConfigured) {
      return;
    }
    
    // Emit milestone at start of configuration
    log.debug('[GAZETTEER-DEBUG] _configureGazetteerPipeline() STARTING');
    try {
      this.telemetry.milestoneOnce('gazetteer:pipeline-config-start', {
        kind: 'debug',
        message: '_configureGazetteerPipeline() starting',
        details: { variant: this.gazetteerVariant }
      });
    } catch (_) {}
    
    if (this.gazetteerOptions && this.gazetteerOptions.ingestionCoordinator) {
      this._gazetteerPipelineConfigured = true;
      log.debug('[GAZETTEER-DEBUG] Using provided ingestionCoordinator, returning early');
      return;
    }
    if (!this.dbAdapter || typeof this.dbAdapter.getDb !== 'function') {
      this._gazetteerPipelineConfigured = true;
      log.debug('[GAZETTEER-DEBUG] No dbAdapter, returning early');
      return;
    }

    const dbWrapper = this.dbAdapter.getDb();
    if (!dbWrapper) {
      this._gazetteerPipelineConfigured = true;
      log.debug('[GAZETTEER-DEBUG] No dbWrapper, returning early');
      return;
    }

    // Get raw better-sqlite3 database handle for gazetteer operations
    // Gazetteer ingestors use db.prepare() directly for performance
    const db = dbWrapper.getHandle();
    if (!db) {
      this._gazetteerPipelineConfigured = true;
      log.debug('[GAZETTEER-DEBUG] No db handle, returning early');
      return;
    }

    const variant = this.gazetteerVariant || 'geography';
    const logger = console;
    const testMode = this.maxPages <= 1000;
    const cacheRoot = testMode 
      ? path.join(os.tmpdir(), 'copilot-gazetteer-test-cache')
      : path.join(this.dataDir, 'cache', 'gazetteer');

    const stages = [];

    const resolveIngestorOverrides = (...keys) => {
      if (!this.gazetteerOptions || typeof this.gazetteerOptions !== 'object') {
        return {};
      }
      const sources = [this.gazetteerOptions];
      if (this.gazetteerOptions.ingestors && typeof this.gazetteerOptions.ingestors === 'object') {
        sources.push(this.gazetteerOptions.ingestors);
      }
      const merged = {};
      for (const source of sources) {
        for (const key of keys) {
          const value = source?.[key];
          if (value && typeof value === 'object') {
            Object.assign(merged, value);
          }
        }
      }
      return merged;
    };

    const pickIngestorOptions = (source, allowedKeys) => {
      if (!source || typeof source !== 'object') {
        return {};
      }
      const picked = {};
      for (const key of allowedKeys) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          picked[key] = source[key];
        }
      }
      return picked;
    };

    const normalizeFreshnessWindow = (options) => {
      if (!options || typeof options !== 'object') {
        return {};
      }
      const normalized = { ...options };
      if (normalized.freshnessIntervalMs == null) {
        if (normalized.freshnessIntervalDays != null) {
          const days = Number(normalized.freshnessIntervalDays);
          if (Number.isFinite(days) && days >= 0) {
            normalized.freshnessIntervalMs = days * 24 * 60 * 60 * 1000;
          }
        } else if (normalized.freshnessIntervalHours != null) {
          const hours = Number(normalized.freshnessIntervalHours);
          if (Number.isFinite(hours) && hours >= 0) {
            normalized.freshnessIntervalMs = hours * 60 * 60 * 1000;
          }
        }
      }
      delete normalized.freshnessIntervalDays;
      delete normalized.freshnessIntervalHours;
      return normalized;
    };

    const wikidataCountryOverrides = normalizeFreshnessWindow(pickIngestorOptions(
      resolveIngestorOverrides('countries', 'country', 'wikidataCountry'),
      [
        'entitiesBatchSize',
        'entityBatchDelayMs',
        'freshnessIntervalMs',
        'freshnessIntervalDays',
        'freshnessIntervalHours',
        'transactionChunkSize',
        'timeoutMs',
        'sleepMs',
        'useCache',
        'maxRetries'
      ]
    ));

    const osmBoundaryOverrides = normalizeFreshnessWindow(pickIngestorOptions(
      resolveIngestorOverrides('boundaries', 'boundary', 'osmBoundaries', 'osmBoundary'),
      [
        'batchSize',
        'overpassTimeout',
        'maxConcurrentFetches',
        'maxBatchSize',
        'freshnessIntervalMs',
        'freshnessIntervalDays',
        'freshnessIntervalHours'
      ]
    ));

    if (osmBoundaryOverrides.maxConcurrentFetches != null) {
      const cap = Math.max(1, this.concurrency || 1);
      const requested = Number(osmBoundaryOverrides.maxConcurrentFetches);
      if (Number.isFinite(requested) && requested > 0) {
        osmBoundaryOverrides.maxConcurrentFetches = Math.max(1, Math.min(Math.floor(requested), cap));
      } else {
        delete osmBoundaryOverrides.maxConcurrentFetches;
      }
    }
    
    // Emit milestone before creating WikidataCountryIngestor
    log.debug('[GAZETTEER-DEBUG] About to create WikidataCountryIngestor');
    try {
      this.telemetry.milestoneOnce('gazetteer:creating-wikidata-ingestor', {
        kind: 'debug',
        message: 'Creating WikidataCountryIngestor',
        details: { variant }
      });
    } catch (_) {}

    const maxCountriesForQuery = (this.targetCountries && this.targetCountries.length)
      ? null
      : (this.limitCountries || null);

    const wikidataCountry = new WikidataCountryIngestor({
      db,
      logger,
      cacheDir: path.join(cacheRoot, 'wikidata'),
      useCache: this.preferCache !== false,
      maxCountries: maxCountriesForQuery,
      targetCountries: this.targetCountries,
      verbose: VERBOSE_MODE,
      ...wikidataCountryOverrides
    });

    if (variant === 'wikidata') {
      stages.push({
        name: 'countries',
        kind: 'country',
        crawlDepth: 0,
        priority: 1000,
        ingestors: [wikidataCountry]
      });
    } else {
      stages.push({
        name: 'countries',
        kind: 'country',
        crawlDepth: 0,
        priority: 1000,
        ingestors: [wikidataCountry]
      });
      stages.push({
        name: 'adm1',
        kind: 'region',
        crawlDepth: 1,
        priority: 100,
        ingestors: [
          new WikidataAdm1Ingestor({
            db,
            logger,
            cacheDir: path.join(cacheRoot, 'wikidata'),
            useCache: this.preferCache !== false,
            useDynamicFetch: true,  // Enable dynamic Wikidata fetching per country
            limitCountries: this.limitCountries,
            targetCountries: this.targetCountries
          })
        ]
      });
      
      // Add cities stage for geography crawl
      stages.push({
        name: 'cities',
        kind: 'city',
        crawlDepth: 2,
        priority: 90,
        ingestors: [
          new WikidataCitiesIngestor({
            db,
            logger,
            cacheDir: path.join(cacheRoot, 'wikidata'),
            useCache: this.preferCache !== false,
            maxCitiesPerCountry: 200,  // Increased from 50 to 200
            minPopulation: 10000,  // Lowered from 100000 to 10000
            limitCountries: this.limitCountries,
            targetCountries: this.targetCountries,
            verbose: VERBOSE_MODE
          })
        ]
      });
    }

    if (variant === 'geography') {
      if (this.limitCountries || (this.targetCountries && this.targetCountries.length)) {
        log.debug('[GAZETTEER-DEBUG] Skipping boundaries stage because limit or target countries are set');
      } else {
        stages.push({
          name: 'boundaries',
          kind: 'boundary',
          crawlDepth: 1,
          priority: 80,
          ingestors: [
            new OsmBoundaryIngestor({
              db,
              logger,
              ...osmBoundaryOverrides
            })
          ]
        });
      }
    }

    const originalStageOrder = stages.map(stage => stage.name);
    let selectedStages = stages;

    if (this.gazetteerStageFilter && this.gazetteerStageFilter.size) {
      const requestedStages = Array.from(this.gazetteerStageFilter).map(name => String(name).toLowerCase());
      const availableStages = new Map(stages.map(stage => [stage.name.toLowerCase(), stage.name]));
      const dependencyMap = new Map([
        ['adm1', ['countries']],
        ['adm2', ['adm1', 'countries']],
        ['cities', ['countries', 'adm1']],
        ['boundaries', ['countries']]
      ]);

      const resolvedStages = new Set();
      const missingStages = new Set();

      const addStageWithDependencies = (stageName, stack = []) => {
        const normalized = String(stageName || '').toLowerCase();
        if (!normalized) {
          return;
        }
        if (stack.includes(normalized)) {
          return; // Prevent cyclic dependencies
        }
        if (!resolvedStages.has(normalized) && availableStages.has(normalized)) {
          resolvedStages.add(normalized);
        }
        if (!availableStages.has(normalized) && !dependencyMap.has(normalized)) {
          missingStages.add(normalized);
        }
        const deps = dependencyMap.get(normalized);
        if (deps && deps.length) {
          for (const dep of deps) {
            addStageWithDependencies(dep, stack.concat(normalized));
          }
        }
      };

      for (const stageName of requestedStages) {
        addStageWithDependencies(stageName);
        if (!availableStages.has(stageName) && !dependencyMap.has(stageName)) {
          missingStages.add(stageName);
        }
      }

      if (resolvedStages.size === 0) {
        log.warn('[GAZETTEER] Stage filter requested, but no matching stages were found. Available stages:', originalStageOrder);
      } else {
        selectedStages = stages.filter(stage => resolvedStages.has(stage.name.toLowerCase()));
        const resolvedList = Array.from(resolvedStages);
        log.info('[GAZETTEER] Applying stage filter', {
          requested: requestedStages,
          resolved: resolvedList,
          dependenciesAdded: resolvedList.filter(name => !requestedStages.includes(name)),
          missing: Array.from(missingStages)
        });
        try {
          this.telemetry?.milestoneOnce('gazetteer:stage-filter-applied', {
            kind: 'debug',
            message: 'Gazetteer stage filter applied',
            details: {
              requested: requestedStages,
              resolved: resolvedList,
              missing: Array.from(missingStages)
            }
          });
        } catch (_) {}
      }
    }

    // Create planner for gazetteer mode
    // Uses GazetteerPlanRunner with optional advanced planning support
    try {
      this.telemetry.milestoneOnce('gazetteer:creating-planner', {
        kind: 'debug',
        message: 'Creating GazetteerPlanRunner',
        details: { variant }
      });
    } catch (_) {}
    
    const { GazetteerPlanRunner } = require('./crawler/gazetteer/GazetteerPlanRunner');
    const useAdvancedPlanning = this.config?.features?.advancedPlanningSuite === true;
    
    // Get enhanced database adapter for meta-planning (if available)
    const dbAdapter = this.enhancedDbAdapter || null;
    
    const planner = new GazetteerPlanRunner({
      telemetry: this.telemetry,
      logger,
      config: this.config,
      useAdvancedPlanning,
      dbAdapter
    });
    
    try {
      this.telemetry.milestoneOnce('gazetteer:planner-created', {
        kind: 'debug',
        message: 'GazetteerPlanRunner created successfully',
        details: { 
          useAdvancedPlanning,
          hasDbAdapter: !!dbAdapter 
        }
      });
    } catch (_) {}

    try {
      this.telemetry.milestoneOnce('gazetteer:creating-coordinator', {
        kind: 'debug',
        message: 'Creating StagedGazetteerCoordinator',
        details: { stageCount: selectedStages.length }
      });
    } catch (_) {}

    log.debug('[CRAWL] About to create StagedGazetteerCoordinator with', selectedStages.length, 'stages');
    log.debug('[CRAWL] Stage summary (before depth filter):', selectedStages.map(s => ({ 
      name: s.name, 
      kind: s.kind, 
      priority: s.priority,
      crawlDepth: s.crawlDepth,
      ingestors: s.ingestors.length 
    })));
    
    // Filter stages based on maxDepth (if specified)
    // Stages with crawlDepth <= maxDepth are included
    const filteredStages = typeof this.maxDepth === 'number'
      ? selectedStages.filter(s => s.crawlDepth <= this.maxDepth)
      : selectedStages;
    
    log.debug('[CRAWL] Stages after depth filter:', filteredStages.map(s => ({ 
      name: s.name, 
      crawlDepth: s.crawlDepth 
    })));
    log.debug('[CRAWL] maxDepth:', this.maxDepth);
    
    const ingestionCoordinator = new StagedGazetteerCoordinator({
      db,
      telemetry: this.telemetry,
      logger,
      stages: filteredStages,
      planner
    });
    
    try {
      this.telemetry.milestoneOnce('gazetteer:coordinator-created', {
        kind: 'debug',
        message: 'StagedGazetteerCoordinator created successfully',
        details: {}
      });
    } catch (_) {}

    if (this.gazetteerModeController) {
      this.gazetteerModeController.ingestionCoordinator = ingestionCoordinator;
    }
    this.gazetteerPlanner = planner;
    this._gazetteerPipelineConfigured = true;
    
    try {
      this.telemetry.milestoneOnce('gazetteer:pipeline-config-complete', {
        kind: 'debug',
        message: '_configureGazetteerPipeline() complete',
        details: { stageCount: filteredStages.length }
      });
    } catch (_) {}
  }

  async _runGazetteerMode() {
    if (!this.gazetteerModeController) {
      throw new Error('Gazetteer mode controller not configured');
    }

    await this._trackStartupStage('gazetteer-prepare', 'Preparing gazetteer services', async () => {
      this.gazetteerModeController.dbAdapter = this.dbAdapter;
      
      // Wrap entire preparation phase in timeout
      const prepareTimeout = 30000; // 30 seconds for pipeline + initialization
      
      try {
        await Promise.race([
          (async () => {
            // Emit telemetry before pipeline configuration
            try {
              this.telemetry.milestoneOnce('gazetteer:configuring-pipeline', {
                kind: 'gazetteer-config',
                message: 'Configuring gazetteer ingestion pipeline',
                details: { mode: this.gazetteerVariant || 'geography' }
              });
            } catch (_) {}
            
            this._configureGazetteerPipeline();
            
            // Emit milestone after pipeline configured
            try {
              this.telemetry.milestoneOnce('gazetteer:pipeline-configured', {
                kind: 'gazetteer-config',
                message: 'Gazetteer pipeline configuration complete',
                details: { mode: this.gazetteerVariant || 'geography' }
              });
            } catch (_) {}
            
            // Emit telemetry before controller initialization
            try {
              this.telemetry.milestoneOnce('gazetteer:initializing-controller', {
                kind: 'gazetteer-init',
                message: 'Initializing gazetteer mode controller',
                details: { mode: this.gazetteerVariant || 'geography' }
              });
            } catch (_) {}
            
            // Add separate timeout for initialize() to diagnose hang
            const initTimeout = 15000; // 15 seconds for initialize
            await Promise.race([
              (async () => {
                await this.gazetteerModeController.initialize();
                
                try {
                  this.telemetry.milestoneOnce('gazetteer:controller-initialized', {
                    kind: 'gazetteer-init',
                    message: 'Controller initialization complete',
                    details: {}
                  });
                } catch (_) {}
              })(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`Controller initialize() timeout after ${initTimeout}ms`)), initTimeout)
              )
            ]);
          })(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Gazetteer preparation timeout after ${prepareTimeout}ms`)), prepareTimeout)
          )
        ]);
      } catch (err) {
        const message = err?.message || String(err);
        try {
          this.telemetry.problem({
            kind: 'gazetteer-init-failed',
            scope: this.domain || 'gazetteer',
            message,
            details: { stack: err?.stack || null }
          });
        } catch (_) {}
        throw err;
      }
      
      return { status: 'completed' };
    });

    this._markStartupComplete('Gazetteer services ready');

    let summary = null;
    try {
      summary = await this.gazetteerModeController.run();
      log.success('Gazetteer crawl completed');
      if (summary && summary.totals) {
        try {
          console.log(`[gazetteer] Totals: ${JSON.stringify(summary.totals)}`);
        } catch (_) {}
      }
      this.emitProgress(true);
      this.milestoneTracker.emitCompletionMilestone({ outcomeErr: null });
      await this.gazetteerModeController.shutdown({ reason: 'completed' });
      if (this.dbAdapter && this.dbAdapter.isEnabled && this.dbAdapter.isEnabled()) {
        const count = this.dbAdapter.getArticleCount();
        console.log(`Database contains ${count} article records`);
        this.dbAdapter.close();
      }
    } catch (error) {
      await this.gazetteerModeController.shutdown({ reason: 'failed' });
      this.emitProgress(true);
      if (this.dbAdapter && this.dbAdapter.isEnabled && this.dbAdapter.isEnabled()) {
        this.dbAdapter.close();
      }
      throw error;
    }
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
    type
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
    await this.init();
    if (this.isGazetteerMode) {
      await this._runGazetteerMode();
      return;
    }
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
    if (outcomeErr) {
      log.error(`Crawl ended: ${outcomeErr.message}`);
    } else {
      log.success('Crawl completed');
    }
    log.stat('Pages visited', this.stats.pagesVisited);
    log.stat('Pages downloaded', this.stats.pagesDownloaded);
    log.stat('Articles found', this.stats.articlesFound);
    log.stat('Articles saved', this.stats.articlesSaved);
    this.emitProgress(true);
    this.milestoneTracker.emitCompletionMilestone({
      outcomeErr
    });

    if (this.dbAdapter && this.dbAdapter.isEnabled()) {
      const count = this.dbAdapter.getArticleCount();
      log.stat('Database articles', count);
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
    if (this.isGazetteerMode) {
      return this.crawlConcurrent();
    }
    if (this.usePriorityQueue) {
      return this.crawlConcurrent();
    }
    await this.init();

    // Run intelligent planner even in sequential mode (concurrency 1)
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
        // Suppressed: too verbose for CLI
      }
    }

    const outcomeErr = this._determineOutcomeError();
    if (outcomeErr) {
      log.error(`Crawl ended: ${outcomeErr.message}`);
    } else {
      log.success('Crawl completed');
    }
    log.stat('Pages visited', this.stats.pagesVisited);
    log.stat('Pages downloaded', this.stats.pagesDownloaded);
    log.stat('Articles found', this.stats.articlesFound);
    log.stat('Articles saved', this.stats.articlesSaved);
    this.emitProgress(true);
    this.milestoneTracker.emitCompletionMilestone({
      outcomeErr
    });

    if (this.dbAdapter && this.dbAdapter.isEnabled()) {
      const count = this.dbAdapter.getArticleCount();
      log.stat('Database articles', count);
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
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    const helpText = `
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
  --max-age-hub=<age>                 Refetch threshold for hub/index pages
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

Examples:
  node src/crawl.js                                   # Intelligent crawl of The Guardian
  node src/crawl.js https://news.example.com --depth=3
  node src/crawl.js --crawl-type=geography --country=GB,IE --limit-countries=1
  node src/crawl.js --crawl-type=intelligent --max-pages=200 --newdb

Use --verbose for rich telemetry and --allow-query-urls to inspect query-string feeds.
`; 
    console.log(helpText);
    process.exit(0);
  }
  const crawlTypeArg = args.find(a => a.startsWith('--crawl-type='));
  const crawlType = crawlTypeArg ? String(crawlTypeArg.split('=')[1]) : undefined;

  function parseCountrySpecifier(rawValue) {
    if (!rawValue) return null;
    const trimmed = String(rawValue).trim();
    if (!trimmed) return null;
    if (/^Q\d+$/i.test(trimmed)) {
      return { qid: trimmed.toUpperCase(), raw: trimmed };
    }
    if (/^[a-z]{2}$/i.test(trimmed) || /^[a-z]{3}$/i.test(trimmed)) {
      return { code: trimmed.toUpperCase(), raw: trimmed };
    }
    return { name: trimmed, nameLower: trimmed.toLowerCase(), raw: trimmed };
  }
  
  function collectCountrySpecifiers() {
    const parsed = [];
    const eqArgs = args.filter(a => a.startsWith('--country='));
    for (const eq of eqArgs) {
      const [, valuePart] = eq.split('=');
      if (!valuePart) continue;
      const tokens = valuePart.split(',');
      for (const token of tokens) {
        const spec = parseCountrySpecifier(token);
        if (spec) parsed.push(spec);
      }
    }
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--country') {
        const next = args[i + 1];
        if (next && !next.startsWith('--')) {
          const tokens = next.split(',');
          for (const token of tokens) {
            const spec = parseCountrySpecifier(token);
            if (spec) parsed.push(spec);
          }
        }
      }
    }
    if (!parsed.length) return undefined;
    const seen = new Set();
    const unique = [];
    for (const entry of parsed) {
      const key = entry.qid ? `qid:${entry.qid}`
        : entry.code ? `code:${entry.code}`
        : `name:${entry.nameLower}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(entry);
    }
    return unique.length ? unique : undefined;
  }

  function collectGazetteerStages() {
    const parsed = [];
    const stageArgPrefixes = ['--gazetteer-stages=', '--geography-stages='];
    for (const prefix of stageArgPrefixes) {
      for (const arg of args) {
        if (arg.startsWith(prefix)) {
          const valuePart = arg.substring(prefix.length);
          if (!valuePart) continue;
          for (const token of valuePart.split(',')) {
            const trimmed = String(token || '').trim();
            if (trimmed) {
              parsed.push(trimmed.toLowerCase());
            }
          }
        }
      }
    }
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--gazetteer-stages' || args[i] === '--geography-stages') {
        const next = args[i + 1];
        if (next && !next.startsWith('--')) {
          for (const token of next.split(',')) {
            const trimmed = String(token || '').trim();
            if (trimmed) {
              parsed.push(trimmed.toLowerCase());
            }
          }
        }
      }
      if (args[i] === '--gazetteer-stage' || args[i] === '--geography-stage') {
        const next = args[i + 1];
        if (next && !next.startsWith('--')) {
          parsed.push(String(next).trim().toLowerCase());
        }
      }
    }
    if (!parsed.length) return undefined;
    const seen = new Set();
    const ordered = [];
    for (const stage of parsed) {
      const key = stage.toLowerCase();
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push(key);
    }
    return ordered.length ? ordered : undefined;
  }

  function resolveExplicitDbPath() {
    const eqArg = args.find(a => a.startsWith('--db='));
    if (eqArg) {
      const valuePart = eqArg.substring('--db='.length).trim();
      if (valuePart) {
        return path.resolve(valuePart);
      }
    }
    for (let i = 0; i < args.length - 1; i++) {
      if (args[i] === '--db') {
        const next = args[i + 1];
        if (next && !next.startsWith('--')) {
          return path.resolve(next);
        }
      }
    }
    return null;
  }

  function allocateNewDbPath(dataDir) {
    const baseDir = path.resolve(dataDir);
    let index = 1;
    while (index < 10000) {
      const candidate = path.join(baseDir, `news_${index}.db`);
      if (!existsSync(candidate)) {
        return candidate;
      }
      index += 1;
    }
    throw new Error('Unable to allocate new database filename in data directory');
  }

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

  function reportCountryCityCounts(dbPath, countrySpecs) {
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
  
  // For geography/wikidata/gazetteer crawls, URL is not needed (use placeholder)
  // For other crawl types, require URL or default to The Guardian
  const isGazetteerType = crawlType && ['geography', 'wikidata', 'gazetteer'].includes(crawlType.toLowerCase());
  const firstNonFlagArg = args.find(a => !a.startsWith('--'));
  const startUrl = isGazetteerType 
    ? (firstNonFlagArg || 'https://placeholder.local')
    : (firstNonFlagArg || 'https://www.theguardian.com');
  
  const enableDb = !args.includes('--no-db');
  const newDbRequested = args.includes('--newdb');
  const explicitDbPath = resolveExplicitDbPath();
  const slowMode = args.includes('--slow') || args.includes('--slow-mode');
  const maxDepthArg = args.find(a => a.startsWith('--depth='));
  const maxDepth = maxDepthArg ? parseInt(maxDepthArg.split('=')[1], 10) : 2;
  let dbPath;
  if (explicitDbPath) {
    dbPath = explicitDbPath;
    if (newDbRequested) {
      log.warn('`--newdb` ignored because an explicit --db value was provided.');
    }
  } else if (newDbRequested) {
    try {
      const dataDirDefault = path.join(process.cwd(), 'data');
      dbPath = allocateNewDbPath(dataDirDefault);
      log.info(`Creating new database at ${dbPath}`);
    } catch (err) {
      log.error(err?.message || 'Failed to allocate new database filename');
      process.exit(1);
    }
  }
  const rateLimitArg = args.find(a => a.startsWith('--rate-limit-ms='));
  const rateLimitMs = rateLimitArg ? parseInt(rateLimitArg.split('=')[1], 10) : undefined;
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
  // Geography crawl limits
  const limitCountriesEqArg = args.find(a => a.startsWith('--limit-countries='));
  let limitCountries;
  if (limitCountriesEqArg) {
    const parsed = parseInt(limitCountriesEqArg.split('=')[1], 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      limitCountries = parsed;
    }
  }
  // Cache preference: default is to prefer cache; allow override with --no-prefer-cache
  const preferCache = args.includes('--no-prefer-cache') ? false : true;
  const useSitemap = !args.includes('--no-sitemap');
  const sitemapOnly = args.includes('--sitemap-only');
  const sitemapMaxArg = args.find(a => a.startsWith('--sitemap-max='));
  const fastStartDisabled = args.includes('--no-fast-start');
  const fastStartRequested = args.includes('--fast-start');
  let fastStart = true;
  if (fastStartDisabled) {
    fastStart = false;
  } else if (fastStartRequested) {
    fastStart = true;
  }
  const jobIdArg = args.find(a => a.startsWith('--job-id='));
  const allowQueryUrls = args.includes('--allow-query-urls');
  VERBOSE_MODE = args.includes('--verbose');
  global.__COPILOT_GAZETTEER_VERBOSE = VERBOSE_MODE;
  const targetCountries = collectCountrySpecifiers();
  const gazetteerStages = collectGazetteerStages();

  // Intercept console.log to format PROGRESS output concisely for CLI
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  const TELEMETRY_STYLES = {
    info: { icon: CLI_ICONS.info, color: CLI_COLORS.info },
    success: { icon: CLI_ICONS.success, color: CLI_COLORS.success },
    warning: { icon: CLI_ICONS.warning, color: CLI_COLORS.warning },
    warn: { icon: CLI_ICONS.warning, color: CLI_COLORS.warning },
    error: { icon: CLI_ICONS.error, color: CLI_COLORS.error },
    critical: { icon: CLI_ICONS.error, color: CLI_COLORS.error },
    debug: { icon: CLI_ICONS.debug, color: CLI_COLORS.muted }
  };

  const STARTUP_STAGE_LABELS = {
    'prepare-data': 'Preparing data directory',
    'db-open': 'Opening crawl database',
    'db-gazetteer-schema': 'Ensuring gazetteer schema',
    'enhanced-features': 'Starting enhanced features',
    'gazetteer-prepare': 'Preparing gazetteer services'
  };

  const MILESTONE_ICONS = {
    'gazetteer-schema': { icon: CLI_ICONS.schema, color: CLI_COLORS.progress },
    'gazetteer-config': { icon: CLI_ICONS.compass, color: CLI_COLORS.accent },
    'gazetteer-init': { icon: CLI_ICONS.progress, color: CLI_COLORS.progress },
    'gazetteer-init-complete': { icon: CLI_ICONS.complete, color: CLI_COLORS.success },
    'gazetteer-mode': { icon: CLI_ICONS.geography, color: CLI_COLORS.success },
    'gazetteer-mode-summary': { icon: CLI_ICONS.compass, color: CLI_COLORS.accent },
    debug: { icon: CLI_ICONS.debug, color: CLI_COLORS.muted }
  };

  const SUPPRESSED_PREFIXES = [
    '[WikidataCountryIngestor]',
    '[WikidataAdm1Ingestor]',
    '[WikidataCitiesIngestor]',
    '[createIngestionStatements]',
    '[CountryHubGapAnalyzer]',
    'Enhanced database adapter initialized',
    'Priority scorer initialized',
    'Problem clustering service initialized',
    'Planner knowledge service initialized',
    'Problem resolution service initialized',
    'Crawl playbook service initialized',
    'Country hub gap service initialized',
    '[GazetteerPriorityScheduler]'
  ];

  console.log = function(...args) {
    const firstArg = args[0];
    if (typeof firstArg === 'string' && firstArg.startsWith('PROGRESS ')) {
      try {
        const jsonStr = firstArg.substring('PROGRESS '.length);
        const data = JSON.parse(jsonStr);
        
        // Format geography crawl progress if available
        if (data.gazetteer) {
          const formatted = log.formatGeographyProgress(data);
          if (formatted) {
            originalConsoleLog(formatted);
            return;
          }
        }
        
        // For non-geography progress, just skip it (too verbose)
        // The important info is in TELEMETRY and MILESTONE messages
        return;
      } catch (_) {
        // If parsing fails, fall through to original output
      }
    }

    if (typeof firstArg === 'string' && firstArg.startsWith('TELEMETRY ')) {
      try {
        const payload = JSON.parse(firstArg.substring('TELEMETRY '.length));
        const severity = (payload.severity || 'info').toLowerCase();
        const style = TELEMETRY_STYLES[severity] || TELEMETRY_STYLES.info;
        const message = payload.message || payload.event || 'Telemetry';

        if (payload.event === 'startup-stage') {
          const stageKey = payload.details?.stage || payload.event;
          const stageLabel = STARTUP_STAGE_LABELS[stageKey] || message;
          const status = payload.status || 'info';
          const statusIcon = status === 'completed' ? CLI_ICONS.complete : status === 'started' ? CLI_ICONS.pending : style.icon;
          const statusColor = status === 'completed' ? CLI_COLORS.success : status === 'started' ? CLI_COLORS.progress : style.color;
          originalConsoleLog(statusColor(`${statusIcon} ${stageLabel}`));
          return;
        }

        const shouldShow = severity !== 'info' || VERBOSE_MODE;
        if (!shouldShow) {
          return;
        }

        const text = `${style.icon} ${message}`;
        originalConsoleLog(style.color(text));
        return;
      } catch (_) {
        // fall through
      }
    }

    if (typeof firstArg === 'string' && firstArg.startsWith('MILESTONE ')) {
      try {
        const payload = JSON.parse(firstArg.substring('MILESTONE '.length));
        const kind = payload.kind || 'debug';
        const descriptor = MILESTONE_ICONS[kind] || MILESTONE_ICONS.debug;
        const message = payload.message || kind;
        originalConsoleLog(descriptor.color(`${descriptor.icon} ${message}`));
        return;
      } catch (_) {
        // fall through
      }
    }

    if (!VERBOSE_MODE && typeof firstArg === 'string') {
  const sanitizedFirstArg = firstArg.replace(/\u001b\[[0-9;]*m/g, '');
  const normalizedFirstArg = sanitizedFirstArg.trim();

  const stageStartMatch = normalizedFirstArg.match(/^\[StagedGazetteerCoordinator\] Starting stage: ([^\s]+)/);
      if (stageStartMatch) {
        const formatted = formatStageStart(stageStartMatch[1]);
        if (formatted) {
          originalConsoleLog(formatted);
          return;
        }
      }

      const stageCompleteMatch = normalizedFirstArg.match(/^\[StagedGazetteerCoordinator\] Stage '([^']+)' complete:/);
      if (stageCompleteMatch) {
        let stageStats = typeof args[1] === 'object' && args[1] !== null ? args[1] : null;
        if (!stageStats) {
          const jsonIndex = normalizedFirstArg.indexOf('{', stageCompleteMatch[0].length);
          if (jsonIndex !== -1) {
            try {
              stageStats = JSON.parse(normalizedFirstArg.slice(jsonIndex));
            } catch (_) {
              stageStats = null;
            }
          }
        }
        const formatted = formatStageComplete(stageCompleteMatch[1], stageStats);
        if (formatted) {
          originalConsoleLog(formatted);
          return;
        }
      }

      if (normalizedFirstArg.startsWith('[StagedGazetteerCoordinator] All stages complete')) {
        let summaryStats = typeof args[1] === 'object' && args[1] !== null ? args[1] : null;
        if (!summaryStats) {
          const jsonIndex = normalizedFirstArg.indexOf('{');
          if (jsonIndex !== -1) {
            try {
              summaryStats = JSON.parse(normalizedFirstArg.slice(jsonIndex));
            } catch (_) {
              summaryStats = null;
            }
          }
        }
        const formatted = formatAllStagesSummary(summaryStats);
        if (formatted) {
          originalConsoleLog(formatted);
          return;
        }
      }

      if (normalizedFirstArg.startsWith('[StagedGazetteerCoordinator] Running meta-planning analysis')) {
        originalConsoleLog(CLI_COLORS.muted(`${CLI_ICONS.debug} Meta-planning analysis`));
        return;
      }

      if (normalizedFirstArg.startsWith('[GazetteerPlanRunner] Advanced planning disabled')) {
        originalConsoleLog(CLI_COLORS.muted(`${CLI_ICONS.debug} Advanced planning disabled`));
        return;
      }

      if (normalizedFirstArg.startsWith(CLI_ICONS.progress)) {
        const candidateRaw = normalizedFirstArg.substring(CLI_ICONS.progress.length).trim();
        const normalizedCandidate = candidateRaw.replace(/^[^\w]+/, '').trim();
        const stageLabels = Object.values(CLI_STAGE_LABELS);
        const isStageEcho = stageLabels.some(label =>
          normalizedCandidate === label || normalizedCandidate.startsWith(`${label} `)
        );
        if (isStageEcho) {
          return;
        }
      }

      if (SUPPRESSED_PREFIXES.some(prefix => normalizedFirstArg.startsWith(prefix))) {
        return;
      }

      if (normalizedFirstArg.startsWith('Enhanced features configuration')) {
        originalConsoleLog(CLI_COLORS.accent(`${CLI_ICONS.features} Enhanced features configuration loaded (use --verbose for details)`));
        return;
      }

      if (normalizedFirstArg.startsWith('Priority config loaded from')) {
        const parts = normalizedFirstArg.split(' ');
        const file = parts[parts.length - 1] || '';
        originalConsoleLog(CLI_COLORS.accent(`${CLI_ICONS.compass} Priority config loaded (${path.basename(file)})`));
        return;
      }
    }

    originalConsoleLog.apply(console, args);
  };

  console.warn = function(...args) {
    if (!VERBOSE_MODE && typeof args[0] === 'string' && SUPPRESSED_PREFIXES.some(prefix => args[0].startsWith(prefix))) {
      return;
    }
    originalConsoleWarn.apply(console, args);
  };

  console.error = function(...args) {
    originalConsoleError.apply(console, args);
  };

  console.info = function(...args) {
    console.log.apply(console, args);
  };

  console.debug = function(...args) {
    if (!VERBOSE_MODE) {
      return;
    }
    originalConsoleLog.apply(console, args);
  };

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

  log.info(`Starting: ${chalk.bold(startUrl)}`);

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
    limitCountries,
    targetCountries,
  gazetteerStages,
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
      reportCountryCityCounts(crawler.dbPath, targetCountries);
      log.success('Crawler finished');
      process.exit(0);
    })
    .catch(error => {
      log.error(`Crawler failed: ${error.message}`);
      if (error.stack) console.error(error.stack);
      process.exit(1);
    });
}

module.exports = NewsCrawler;
