#!/usr/bin/env node

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const cheerio = require('cheerio');
const robotsParser = require('robots-parser');
const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');
const { ArticleCache } = require('./cache');
const { UrlPolicy } = require('./crawler/urlPolicy');
const { DeepUrlAnalyzer } = require('./crawler/deepUrlAnalysis');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { JSDOM, VirtualConsole } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const { createCrawlerDb } = require('./crawler/dbClient');
// Enhanced features (optional)
const { ConfigManager } = require('./config/ConfigManager');
const { EnhancedDatabaseAdapter } = require('./db/EnhancedDatabaseAdapter');
const { PriorityScorer } = require('./crawler/PriorityScorer');
const { ProblemClusteringService } = require('./crawler/ProblemClusteringService');
const { PlannerKnowledgeService } = require('./crawler/PlannerKnowledgeService');
// Extracted helper modules (structure-only refactor)
const Links = require('./crawler/links');
const { loadSitemaps } = require('./crawler/sitemap');

const QueueManager = require('./crawler/QueueManager');
const { FetchPipeline } = require('./crawler/FetchPipeline');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function nowMs() { return Date.now(); }
function jitter(ms, maxJitter = 250) { return ms + Math.floor(Math.random() * maxJitter); }
function parseRetryAfter(headerVal) {
  if (!headerVal) return null;
  const s = String(headerVal).trim();
  const asInt = parseInt(s, 10);
  if (!Number.isNaN(asInt)) return asInt * 1000;
  const asDate = Date.parse(s);
  if (!Number.isNaN(asDate)) {
    const diff = asDate - Date.now();
    return diff > 0 ? diff : 0;
  }
  return null;
}

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
      typeof options.maxDownloads === 'number' && options.maxDownloads > 0
        ? options.maxDownloads
        : undefined; // Limit number of network downloads
    // Preserve 0 to mean "always refetch" (never accept cache)
    this.maxAgeMs =
      typeof options.maxAgeMs === 'number' && options.maxAgeMs >= 0
        ? options.maxAgeMs
        : undefined; // Freshness window for cached items
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
  this.intTargetHosts = Array.isArray(options.intTargetHosts) ? options.intTargetHosts.map(s => String(s||'').toLowerCase()) : null;
  this.plannerVerbosity = typeof options.plannerVerbosity === 'number' ? options.plannerVerbosity : 0;
    
    // State
    this.visited = new Set();
    this.seededHubUrls = new Set();
    this.historySeedUrls = new Set();
    this.knownArticlesCache = new Map();
    this.articleHeaderCache = new Map();
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
  this.featuresEnabled = {
    gapDrivenPrioritization: false,
    plannerKnowledgeReuse: false,
    realTimeCoverageAnalytics: false,
    problemClustering: false
  };
  // Track in-flight downloads for UI visibility
  this.currentDownloads = new Map(); // url -> { startedAt: epochMs }
  // Track active workers to coordinate idle waiting
  this.busyWorkers = 0;
  // Pause control
  this.paused = false;
  this.abortRequested = false;
  this.usePriorityQueue = this.concurrency > 1; // enable PQ only when concurrent
  // Cache facade
  this.cache = new ArticleCache({ db: null, dataDir: this.dataDir, normalizeUrl: (u) => this.normalizeUrl(u) });
    this.lastRequestTime = 0; // for global spacing
  // Keep-alive agents for connection reuse
  this.httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
  this.httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });
  // Per-domain rate limiting and telemetry
  this.domainLimits = new Map(); // host -> state object
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
  this.urlPolicy = new UrlPolicy({ baseUrl: this.baseUrl, skipQueryUrls: this.skipQueryUrls });
  this.deepUrlAnalyzer = new DeepUrlAnalyzer({ getDb: () => this.dbAdapter?.getDb(), policy: this.urlPolicy });
    // Failure tracking
    this.fatalIssues = [];
    this.errorSamples = [];
    this.lastError = null;
    this.connectionResetState = new Map();
    this.connectionResetWindowMs = typeof options.connectionResetWindowMs === 'number' && options.connectionResetWindowMs > 0
      ? options.connectionResetWindowMs
      : 2 * 60 * 1000; // 2 minutes rolling window
    this.connectionResetThreshold = typeof options.connectionResetThreshold === 'number' && options.connectionResetThreshold > 0
      ? options.connectionResetThreshold
      : 3; // after 3 resets within window we pause
    this.connectionResetProblemEmitted = false;
  this.urlAnalysisCache = new Map();
  this.urlDecisionCache = new Map();
    this.problemCounters = new Map();
    this.problemSamples = new Map();
    this._intelligentPlanSummary = null;
    
    // Statistics
    this.stats = {
      pagesVisited: 0,
      pagesDownloaded: 0,
  articlesFound: 0,
  articlesSaved: 0,
      errors: 0,
      bytesDownloaded: 0,
      depth2PagesProcessed: 0,
      cacheRateLimitedServed: 0,
      cacheRateLimitedDeferred: 0
    };
    this.emittedMilestones = new Set();
    this._plannerStageSeq = 0;
    this.depth2Visited = new Set();

    this.queue = new QueueManager({
      usePriorityQueue: this.usePriorityQueue,
      maxQueue: this.maxQueue,
      maxDepth: this.maxDepth,
      stats: this.stats,
      visited: this.visited,
      knownArticlesCache: this.knownArticlesCache,
      getUrlDecision: (url, ctx) => this._getUrlDecision(url, ctx),
      handlePolicySkip: (decision, info) => this._handlePolicySkip(decision, info),
      isOnDomain: (normalized) => this.isOnDomain(normalized),
      isAllowed: (normalized) => this.isAllowed(normalized),
      looksLikeArticle: (normalized) => this.looksLikeArticle(normalized),
      safeHostFromUrl: (u) => this._safeHostFromUrl(u),
      emitQueueEvent: (evt) => this.emitQueueEvent(evt),
      emitEnhancedQueueEvent: (evt) => this.emitEnhancedQueueEvent(evt),
      computeEnhancedPriority: (args) => this.computeEnhancedPriority(args),
      computePriority: (args) => this.computePriority(args),
      getDbAdapter: () => this.dbAdapter,
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
      hasVisited: (normalized) => this.visited.has(normalized),
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
      currentDownloads: this.currentDownloads,
      emitProgress: () => this.emitProgress(),
      note429: (host, retryAfterMs) => this.note429(host, retryAfterMs),
      noteSuccess: (host) => this.noteSuccess(host),
      recordError: (info) => this._recordError(info),
      handleConnectionReset: (normalized, err) => this._handleConnectionReset(normalized, err),
      articleHeaderCache: this.articleHeaderCache,
      knownArticlesCache: this.knownArticlesCache,
      getDbAdapter: () => this.dbAdapter,
      parseRetryAfter,
      handlePolicySkip: (decision, extras) => {
        const depth = extras?.depth || 0;
        const queueSize = this.queue?.size?.() || 0;
        this._handlePolicySkip(decision, { depth, queueSize });
      },
      onCacheServed: (info) => {
        if (!info) return;
        if (info.forced) {
          this.stats.cacheRateLimitedServed = (this.stats.cacheRateLimitedServed || 0) + 1;
          const milestoneUrl = info.url;
          const host = info.rateLimitedHost || this._safeHostFromUrl(milestoneUrl);
          const milestoneDetails = { url: milestoneUrl };
          if (host) milestoneDetails.host = host;
          this._emitMilestoneOnce(`cache-priority:${host || milestoneUrl}`, {
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

  // --- Analysis helpers: use both URL and content signals ---
  _computeUrlSignals(rawUrl) {
    try {
      const u = new URL(rawUrl, this.baseUrl);
      const host = u.hostname;
      const path = u.pathname || '/';
      const segments = path.split('/').filter(Boolean);
      const section = segments[0] || null;
      const pathDepth = segments.length;
      const slug = segments[pathDepth - 1] || '';
      const slugLen = slug.length;
      const lower = path.toLowerCase();
      const hasDatePath = /\/\d{4}\/\d{2}\/\d{2}\//.test(lower);
      const hasArticleWords = /(article|story|news|post|opinion|uk-news|us-news|world|politics|business|sport|culture|technology)/.test(lower);
      const queryCount = Array.from(new URLSearchParams(u.search)).length;
      const hostParts = host.split('.');
      const tld = hostParts[hostParts.length - 1] || null;
      return { host, tld, section, pathDepth, slugLen, hasDatePath, hasArticleWords, queryCount };
    } catch (_) { return null; }
  }

  _computeContentSignals($, html) {
    let linkDensity = null, h2 = null, h3 = null, aCount = null, pCount = null;
    try {
      const bodyText = ($('body').text() || '').replace(/\s+/g, ' ').trim();
      let aTextLen = 0; $('a').each((_, el) => { const t = $(el).text(); aTextLen += (t||'').trim().length; });
      const len = bodyText.length || 1; linkDensity = Math.min(1, Math.max(0, aTextLen / len));
      h2 = $('h2').length; h3 = $('h3').length; aCount = $('a').length; pCount = $('p').length;
    } catch (_) {}
    return { linkDensity, h2, h3, a: aCount, p: pCount };
  }

  _combineSignals(urlSignals, contentSignals, opts = {}) {
    const votes = { article: 0, nav: 0, other: 0 };
    const consider = [];
    // URL-based votes
    if (urlSignals) {
      if (urlSignals.hasDatePath || urlSignals.hasArticleWords) { votes.article++; consider.push('url-article'); }
      if (urlSignals.pathDepth <= 2 && !urlSignals.hasDatePath) { votes.nav++; consider.push('url-shallow'); }
    }
    // Content-based votes
    const cs = contentSignals || {};
    if (typeof cs.linkDensity === 'number') {
      if (cs.linkDensity > 0.25 && (cs.a || 0) > 40) { votes.nav++; consider.push('content-link-dense'); }
      if (cs.linkDensity < 0.08 && (cs.p || 0) >= 3) { votes.article++; consider.push('content-text-heavy'); }
    }
    if (typeof opts.wordCount === 'number') {
      if (opts.wordCount > 150) { votes.article++; consider.push('wc>150'); }
      if (opts.wordCount < 60 && (cs.a || 0) > 20) { votes.nav++; consider.push('wc<60'); }
    }
    // Decide
    let hint = 'other';
    let maxVotes = -1;
    for (const k of Object.keys(votes)) { if (votes[k] > maxVotes) { maxVotes = votes[k]; hint = k; } }
    const considered = consider.length || 1;
    const confidence = Math.min(1, Math.max(0, maxVotes / Math.max(2, considered))); // crude but bounded
    return { hint, confidence, considered };
  }

  _normalizeSectionSlug(value) {
    if (!value && value !== 0) return null;
    const slug = String(value).trim().toLowerCase();
    if (!slug) return null;
    const cleaned = slug
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9\/-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return cleaned || null;
  }

  _buildAbsolutePathUrl(segments) {
    if (!Array.isArray(segments) || segments.length === 0) return null;
    const encoded = segments
      .map((seg) => String(seg || '').trim())
      .filter(Boolean)
      .map((seg) => encodeURIComponent(seg));
    if (!encoded.length) return null;
    return `${this.baseUrl}/${encoded.join('/')}/`;
  }

  _collectHistoryCandidatesFromSegments(segments) {
    const out = [];
    if (!Array.isArray(segments) || segments.length < 2) return out;
    const yearIdx = segments.findIndex((seg) => /^(19|20)\d{2}$/.test(seg));
    if (yearIdx <= 0) return out;
    const baseSegments = segments.slice(0, yearIdx);
    if (!baseSegments.length) return out;
    const year = segments[yearIdx];
    const baseHubUrl = this._buildAbsolutePathUrl(baseSegments);
    if (baseHubUrl) {
      out.push({ url: baseHubUrl, kind: 'hub-seed', reason: 'section-from-archive' });
    }
    const yearUrl = this._buildAbsolutePathUrl([...baseSegments, year]);
    if (yearUrl) {
      out.push({ url: yearUrl, kind: 'history', reason: 'year-archive' });
    }
    const monthIdx = yearIdx + 1;
    if (monthIdx < segments.length) {
      const monthSegRaw = segments[monthIdx];
      const monthSeg = String(monthSegRaw || '').toLowerCase();
      if (/^(0?[1-9]|1[0-2]|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)$/.test(monthSeg)) {
        const monthUrl = this._buildAbsolutePathUrl([...baseSegments, year, monthSegRaw]);
        if (monthUrl) {
          out.push({ url: monthUrl, kind: 'history', reason: 'month-archive' });
        }
      }
    }
    return out;
  }

  _maybeEnqueueAdaptiveSeeds({ url, metadata, depth }) {
    if (!this.plannerEnabled) return;
    const candidates = [];
    const sectionSlugFromMeta = this._normalizeSectionSlug(metadata?.section);
    if (sectionSlugFromMeta) {
      const hubUrl = this._buildAbsolutePathUrl([sectionSlugFromMeta]);
      if (hubUrl) {
        candidates.push({ url: hubUrl, kind: 'hub-seed', reason: 'section-metadata' });
      }
    }
    try {
      const u = new URL(url, this.baseUrl);
      const segments = (u.pathname || '/').split('/').filter(Boolean);
      if (segments.length > 0) {
        const primarySlug = this._normalizeSectionSlug(segments[0]);
        if (primarySlug) {
          const primaryHub = this._buildAbsolutePathUrl([primarySlug]);
          if (primaryHub) {
            candidates.push({ url: primaryHub, kind: 'hub-seed', reason: 'section-from-path' });
          }
        }
      }
      candidates.push(...this._collectHistoryCandidatesFromSegments(segments));
    } catch (_) {}

    if (!candidates.length) return;
    const seen = new Set();
    for (const cand of candidates) {
      if (!cand || !cand.url) continue;
      let normalized;
      try {
        normalized = this.normalizeUrl(cand.url);
      } catch (_) {
        normalized = cand.url;
      }
      if (!normalized) continue;
      const key = `${cand.kind}:${normalized}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (cand.kind === 'hub-seed') {
        if (this.seededHubUrls.has(normalized) || this.visited.has(normalized)) continue;
        const enqueued = this.enqueueRequest({
          url: cand.url,
          depth: Math.max(0, depth - 1),
          type: { kind: 'hub-seed', reason: cand.reason }
        });
        if (enqueued) {
          this.seededHubUrls.add(normalized);
          this._emitMilestoneOnce(`adaptive-hub:${normalized}`, {
            kind: 'adaptive-hub-seeded',
            message: 'Queued adaptive hub for deeper coverage',
            details: { url: normalized, reason: cand.reason }
          });
        }
      } else if (cand.kind === 'history') {
        if (this.historySeedUrls.has(normalized) || this.visited.has(normalized)) continue;
        const enqueued = this.enqueueRequest({
          url: cand.url,
          depth: Math.max(0, depth - 1),
          type: { kind: 'history', reason: cand.reason }
        });
        if (enqueued) {
          this.historySeedUrls.add(normalized);
          this._emitMilestoneOnce(`history-seed:${normalized}`, {
            kind: 'history-path-seeded',
            message: 'Queued archive/history path discovered from article',
            details: { url: normalized, reason: cand.reason }
          });
        }
      }
    }
  }

  // --- Lightweight emitter for queue instrumentation ---
  emitQueueEvent(evt) {
    try {
      // Shape example: { action: 'enqueued'|'dequeued'|'retry'|'drop', url, depth?, host?, reason?, queueSize? }
      console.log('QUEUE ' + JSON.stringify(evt));
    } catch (_) { /* ignore */ }
  }

  // --- Structured problems surface ---
  emitProblem(problem) {
    try {
      if (!this.problemCounters) this.problemCounters = new Map();
      if (!this.problemSamples) this.problemSamples = new Map();
      const kind = (problem && problem.kind) ? String(problem.kind) : 'unknown';
      const entry = this.problemCounters.get(kind) || { count: 0 };
      entry.count += 1;
      this.problemCounters.set(kind, entry);
      if (!this.problemSamples.has(kind)) {
        const sample = {};
        if (problem && typeof problem === 'object') {
          if (problem.scope) sample.scope = problem.scope;
          if (problem.target) sample.target = problem.target;
          if (problem.message) sample.message = problem.message;
        }
        this.problemSamples.set(kind, sample);
      }
    } catch (_) { /* ignore tracking errors */ }
    
    try {
      // Example: { kind: 'missing-hub', scope: 'country', target: 'France', hintUrl?, details? }
      console.log('PROBLEM ' + JSON.stringify(problem));
    } catch (_) { /* ignore */ }

    // Use enhanced problem processing if enabled
    if (this.featuresEnabled?.problemClustering && this.problemClusteringService) {
      try {
        this.emitEnhancedProblem(problem);
      } catch (error) {
        console.warn('Enhanced problem processing failed:', error.message);
      }
    }
  }

  // --- Structured milestones surface ---
  emitMilestone(milestone) {
    try {
      // Example: { kind: 'patterns-learned', scope: 'guardian', message: 'Homepage sections inferred', details? }
      console.log('MILESTONE ' + JSON.stringify(milestone));
    } catch (_) { /* ignore */ }
  }

  _emitMilestoneOnce(key, milestone) {
    if (!this.emittedMilestones) this.emittedMilestones = new Set();
    if (this.emittedMilestones.has(key)) return;
    this.emittedMilestones.add(key);
    this.emitMilestone(Object.assign({ scope: this.domain }, milestone));
  }

  emitPlannerStage(event) {
    if (!this.plannerEnabled) return;
    try {
      const payload = Object.assign({ scope: this.domain }, event || {});
      const replacer = (_, value) => (value === undefined ? undefined : value);
      console.log('PLANNER_STAGE ' + JSON.stringify(payload, replacer));
    } catch (_) { /* ignore */ }
  }

  _emitIntelligentCompletionMilestone({ outcomeErr } = {}) {
    if (!this.plannerEnabled) return;
    const seededUnique = this.seededHubUrls ? this.seededHubUrls.size : 0;
    const summary = this._intelligentPlanSummary || {};
    const sections = summary.sectionHubCount != null ? summary.sectionHubCount : 0;
    const countryCandidates = summary.countryCandidateCount != null ? summary.countryCandidateCount : 0;
    const requested = summary.requestedCount != null ? summary.requestedCount : sections + countryCandidates;
    const expected = Math.max(requested || 0, sections + countryCandidates, seededUnique);
    const coveragePct = expected > 0 ? Math.min(1, seededUnique / expected) : null;
    const problems = [];
    if (this.problemCounters && this.problemCounters.size) {
      for (const [kind, entry] of this.problemCounters.entries()) {
        if (!entry || !entry.count) continue;
        const sample = this.problemSamples?.get(kind) || null;
        problems.push({
          kind,
          count: entry.count,
          sample: sample && Object.keys(sample).length ? sample : undefined
        });
      }
    }
    problems.sort((a, b) => b.count - a.count);
    const details = {
      outcome: outcomeErr ? 'failed' : 'completed',
      seededHubs: {
        unique: seededUnique,
        requested: requested || 0,
        sectionsFromPatterns: sections,
        countryCandidates,
        sample: Array.isArray(summary.sampleSeeded) ? summary.sampleSeeded.slice(0, 5) : undefined
      },
      coverage: coveragePct != null ? {
        expected,
        seeded: seededUnique,
        coveragePct
      } : undefined,
      problems: problems.length ? problems : undefined,
      stats: {
        visited: this.stats?.pagesVisited || 0,
        downloaded: this.stats?.pagesDownloaded || 0,
        articlesFound: this.stats?.articlesFound || 0,
        articlesSaved: this.stats?.articlesSaved || 0,
        errors: this.stats?.errors || 0
      }
    };
    this.emitMilestone({
      kind: 'intelligent-completion',
      scope: this.domain,
      message: outcomeErr ? 'Intelligent crawl ended with errors' : 'Intelligent crawl completed',
      details
    });
  }

  async _withPlannerStage(stage, contextDetails, fn, options = {}) {
    if (typeof fn !== 'function') {
      return undefined;
    }
    if (!this.plannerEnabled) {
      return fn();
    }
    const seq = (++this._plannerStageSeq) || 1;
    const startTime = Date.now();
    const startEvent = {
      stage,
      status: 'started',
      sequence: seq,
      ts: new Date(startTime).toISOString()
    };
    const context = contextDetails && typeof contextDetails === 'object' && Object.keys(contextDetails).length ? contextDetails : null;
    if (context) {
      startEvent.details = { context };
    }
    this.emitPlannerStage(startEvent);
    try {
      const result = await fn();
      const durationMs = Date.now() - startTime;
      const mapper = typeof options.mapResultForEvent === 'function' ? options.mapResultForEvent : null;
      const mapped = mapper ? mapper(result) : result;
      const completion = {
        stage,
        status: 'completed',
        sequence: seq,
        ts: new Date().toISOString(),
        durationMs
      };
      const details = {};
      if (context) details.context = context;
      if (mapped !== undefined && mapped !== null) {
        if (typeof mapped === 'object') {
          const keys = Object.keys(mapped);
          if (keys.length) details.result = mapped;
        } else {
          details.result = mapped;
        }
      }
      if (Object.keys(details).length) {
        completion.details = details;
      }
      this.emitPlannerStage(completion);
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const failure = {
        stage,
        status: 'failed',
        sequence: seq,
        ts: new Date().toISOString(),
        durationMs,
        details: {
          ...(context ? { context } : {}),
          error: { message: err?.message || String(err) }
        }
      };
      this.emitPlannerStage(failure);
      throw err;
    }
  }

  _noteDepthVisit(normalizedUrl, depth) {
    if (depth !== 2 || !normalizedUrl) return;
    if (!this.depth2Visited) this.depth2Visited = new Set();
    if (this.depth2Visited.has(normalizedUrl)) return;
    this.depth2Visited.add(normalizedUrl);
    this.stats.depth2PagesProcessed = (this.stats.depth2PagesProcessed || 0) + 1;
  }

  _checkAnalysisMilestones({ depth, isArticle }) {
    // depth milestones
    if ((this.stats.depth2PagesProcessed || 0) >= 10) {
      this._emitMilestoneOnce('depth2-coverage-10', {
        kind: 'depth2-coverage',
        message: 'Completed analysis of 10 depth-2 pages from the front page',
        details: { depth: 2, pages: this.stats.depth2PagesProcessed }
      });
    }

    // downloads milestone
    if (this.stats.pagesDownloaded >= 1000) {
      this._emitMilestoneOnce('downloads-1k', {
        kind: 'downloads-1k',
        message: 'Downloaded 1,000 documents',
        details: { count: this.stats.pagesDownloaded }
      });
    }

    // article identification milestones (analysis-driven)
    if (this.stats.articlesFound >= 1000) {
      this._emitMilestoneOnce('articles-found-1k', {
        kind: 'articles-identified-1k',
        message: 'Identified 1,000 articles during analysis',
        details: { count: this.stats.articlesFound }
      });
    }
    if (this.stats.articlesFound >= 10000) {
      this._emitMilestoneOnce('articles-found-10k', {
        kind: 'articles-identified-10k',
        message: 'Identified 10,000 articles during analysis',
        details: { count: this.stats.articlesFound }
      });
    }

  // Provide a hook for intelligent crawls to optionally schedule deeper analysis
  if (this.plannerEnabled && isArticle && typeof this.scheduleWideHistoryCheck === 'function') {
      try {
        this.scheduleWideHistoryCheck({ depth, articlesFound: this.stats.articlesFound });
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
    this.lastError = normalized;
    if (!Array.isArray(this.errorSamples)) this.errorSamples = [];
    if (this.errorSamples.length >= 5) return;
    this.errorSamples.push(normalized);
  }

  _handleConnectionReset(url, error) {
    if (this.connectionResetProblemEmitted) return;
    let host = this.domain;
    try {
      if (url) host = new URL(url).hostname || host;
    } catch (_) {}
    const now = Date.now();
    const windowMs = this.connectionResetWindowMs;
    const threshold = this.connectionResetThreshold;
    const entry = this.connectionResetState.get(host) || { count: 0, firstAt: now, lastAt: now };
    if (now - entry.firstAt > windowMs) {
      entry.count = 0;
      entry.firstAt = now;
    }
    entry.count += 1;
    entry.lastAt = now;
    this.connectionResetState.set(host, entry);
    if (entry.count >= threshold) {
      this.connectionResetProblemEmitted = true;
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
        this.emitProblem({
          kind: 'connection-reset',
          scope: this.domain,
          target: host,
          message: `${message}; crawl aborted`,
          details
        });
      } catch (_) {}
      this.requestAbort('connection-reset', { ...details, message: `${message} for ${host}` });
    }
  }

  _determineOutcomeError() {
    if (Array.isArray(this.fatalIssues) && this.fatalIssues.length > 0) {
      const summary = this.fatalIssues.map((issue) => issue && (issue.message || issue.reason || issue.kind)).filter(Boolean).join('; ');
      const err = new Error(`Crawl failed: ${summary || 'fatal initialization error'}`);
      err.code = 'CRAWL_FATAL';
      err.details = { issues: this.fatalIssues.slice(0, 5) };
      return err;
    }
    const noDownloads = (this.stats.pagesDownloaded || 0) === 0;
    const hadErrors = (this.stats.errors || 0) > 0;
    if (noDownloads && hadErrors) {
      const sample = this.errorSamples && this.errorSamples[0];
      const detail = sample ? `${sample.kind || 'error'}${sample.code ? ` ${sample.code}` : ''}${sample.url ? ` ${sample.url}` : ''}`.trim() : null;
      const err = new Error(`Crawl failed: no pages downloaded after ${this.stats.errors} error${this.stats.errors === 1 ? '' : 's'}${detail ? ` (first: ${detail})` : ''}`);
      err.code = 'CRAWL_NO_PROGRESS';
      err.details = { stats: { ...this.stats }, sampleError: sample || null };
      return err;
    }
    return null;
  }

  _compactUrlAnalysis(analysis) {
    if (!analysis || typeof analysis !== 'object' || analysis.invalid) return null;
    const trimEntries = (list) => Array.isArray(list) ? list.map((entry) => ({ key: entry.key, value: entry.value })) : [];
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
        analysis: { raw: rawUrl, invalid: true },
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
    let state = this.domainLimits.get(host);
    if (!state) {
      state = {
        host,
        // Core state
        isLimited: false,       // True if any 429 has been received
        rpm: null,              // Current requests-per-minute limit
        nextRequestAt: 0,       // Earliest time the next request is allowed
        backoffUntil: 0,        // A hard stop for all requests after a 429
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
      this.domainLimits.set(host, state);
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
    const state = this.domainLimits.get(host);
    if (!state) return null;
    const backoff = state.backoffUntil || 0;
    const nextAt = state.nextRequestAt || 0;
    const resumeAt = Math.max(backoff, nextAt);
    return resumeAt > 0 ? resumeAt : null;
  }

  _isHostRateLimited(host) {
    if (!host) return false;
    const state = this.domainLimits.get(host);
    if (!state) return false;
    const now = nowMs();
    if (state.backoffUntil > now) return true;
    if (state.isLimited && state.nextRequestAt > now) return true;
    return false;
  }


  async init() {
    // Ensure data directory exists
    await fs.mkdir(this.dataDir, { recursive: true });
    
    // Initialize database (optional)
    if (this.enableDb) {
      if (!this.dbAdapter) {
        this.dbAdapter = createCrawlerDb({
          dbPath: this.dbPath,
          fastStart: this.fastStart,
          cache: this.cache,
          domain: this.domain,
          emitProblem: (problem) => {
            try { this.emitProblem(problem); } catch (_) {}
          },
          onFatalIssue: (issue) => {
            try { this.fatalIssues.push(issue); } catch (_) {}
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
        this.seededHubUrls.add(this.startUrlNormalized);
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
        const decision = this._getUrlDecision(u, { phase: 'sitemap', depth: 0, source: 'sitemap' });
        const analysis = decision?.analysis || {};
        const n = analysis && !analysis.invalid ? analysis.normalized : null;
        if (!n) return;
        if (!decision.allow) {
          if (decision.reason === 'query-superfluous') {
            this._handlePolicySkip(decision, { depth: 0, queueSize: this.queue.size() });
          }
          return;
        }
        if (!this.isOnDomain(n) || !this.isAllowed(n)) return;
        const type = this.looksLikeArticle(n) ? 'article' : 'nav';
        this.enqueueRequest({ url: n, depth: 0, type });
        this.sitemapDiscovered = (this.sitemapDiscovered||0) + 1;
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
    const decision = this._getUrlDecision(url, { ...context, phase });
    const analysis = decision?.analysis;
    if (!analysis || analysis.invalid) return null;
    return analysis.normalized;
  }

  emitProgress(force = false) {
    const now = Date.now();
    if (!force && now - this._lastProgressEmitAt < 300) return;
    this._lastProgressEmitAt = now;
    // Prepare a small snapshot of in-flight downloads (most recent up to 5)
    const inflight = [];
    try {
      const entries = Array.from(this.currentDownloads.entries());
      // sort by startedAt desc
      entries.sort((a,b) => (b[1].startedAt||0) - (a[1].startedAt||0));
      for (let i = 0; i < Math.min(5, entries.length); i++) {
        const [u, info] = entries[i];
        inflight.push({ url: u, ageMs: now - (info.startedAt||now) });
      }
    } catch (_) {}
    // Domain RPM metric (for primary domain)
    let domainRpm = null, domainLimit = null, domainBackoffMs = null, domainRateLimited = null, domainIntervalMs = null;
    const perHostLimits = {};
    try {
      const st = this.domainLimits.get(this.domain);
      const now2 = Date.now();
      if (st) {
        domainRpm = st.rpmLastMinute;
        domainLimit = st.rpm;
        domainRateLimited = st.isLimited;
        if (st.rpm > 0) domainIntervalMs = Math.floor(60000 / st.rpm);
        if (st.backoffUntil > now2) domainBackoffMs = st.backoffUntil - now2;
      }
      // Include per-host limiter state for UI badges
      for (const [host, s] of this.domainLimits.entries()) {
        try {
          const backoff = (s.backoffUntil > now2) ? (s.backoffUntil - now2) : null;
          const interval = s.rpm > 0 ? Math.floor(60000 / s.rpm) : null;
          perHostLimits[host] = {
            rateLimited: s.isLimited,
            limit: s.rpm,
            intervalMs: interval,
            backoffMs: backoff
          };
        } catch (_) {}
      }
    } catch(_) {}
    const p = {
      visited: this.stats.pagesVisited,
      downloaded: this.stats.pagesDownloaded,
      found: this.stats.articlesFound,
      saved: this.stats.articlesSaved,
      errors: this.stats.errors,
      bytes: this.stats.bytesDownloaded,
      queueSize: this.queue.size(),
      currentDownloadsCount: this.currentDownloads.size,
      currentDownloads: inflight,
      paused: !!this.paused,
      robotsLoaded: !!this.robotsTxtLoaded,
      sitemapCount: Array.isArray(this.sitemapUrls) ? this.sitemapUrls.length : 0,
      sitemapEnqueued: this.sitemapDiscovered || 0,
      domain: this.domain,
      domainRpm,
      domainLimit,
      domainBackoffMs,
      domainRateLimited,
      domainIntervalMs,
      perHostLimits,
      cacheRateLimitedServed: this.stats.cacheRateLimitedServed || 0,
      cacheRateLimitedDeferred: this.stats.cacheRateLimitedDeferred || 0
    };
    try {
      console.log(`PROGRESS ${JSON.stringify(p)}`);
    } catch (_) {}
  }

  pause() { this.paused = true; this.emitProgress(true); }
  resume() { this.paused = false; this.emitProgress(true); }
  isPaused() { return !!this.paused; }

  requestAbort(reason, details = null) {
    if (this.abortRequested) return;
    this.abortRequested = true;
    this.paused = false;
    if (reason) {
      try { console.log(`Abort requested: ${reason}`); } catch (_) {}
    }
    try { this.queue?.clear?.(); } catch (_) {}
    if (details && typeof details === 'object') {
      this.fatalIssues.push({ kind: reason || 'abort', message: details.message || reason || 'abort', details });
    }
    this.emitProgress(true);
  }

  // JSON file saving removed

  // Try to retrieve a cached article (DB only). Returns {html, crawledAt, source} or null.
  async getCachedArticle(url) {
    return this.cache.get(url);
  }

  findNavigationLinks($) {
    return Links.findNavigationLinks($, (u)=>this.normalizeUrl(u), (u)=>this.isOnDomain(u));
  }

  findArticleLinks($) {
    return Links.findArticleLinks($, (u)=>this.normalizeUrl(u), (u)=>this.looksLikeArticle(u), (u)=>this.isOnDomain(u));
  }

  looksLikeArticle(url) {
    // Heuristics to determine if URL looks like an article
    const urlStr = url.toLowerCase();
    
    // Skip certain patterns that are unlikely to be articles
    const skipPatterns = [
      '/search', '/login', '/register', '/subscribe', '/newsletter',
      '/contact', '/about', '/privacy', '/terms', '/cookies',
      '/rss', '/feed', '.xml', '.json', '/api/', '/admin/',
      '/profile', '/account', '/settings', '/user/',
      '/tag/', '/tags/', '/category/', '/categories/',
      '/page/', '/index', '/sitemap', '/archive',
      '.pdf', '.jpg', '.png', '.gif', '.css', '.js'
    ];

    if (skipPatterns.some(pattern => urlStr.includes(pattern))) {
      return false;
    }

    // Positive indicators for articles
    const articlePatterns = [
      '/article', '/story', '/news', '/post',
      '/world', '/politics', '/business', '/sport',
      '/culture', '/opinion', '/lifestyle', '/technology',
      '/commentisfree', '/uk-news', '/us-news'
    ];

    return articlePatterns.some(pattern => urlStr.includes(pattern)) ||
           /\/\d{4}\/\d{2}\/\d{2}\//.test(urlStr); // Date pattern
  }

  extractArticleMetadata($, url) {
    // Extract title
    const title = $('h1').first().text().trim() || 
                  $('title').text().trim() || 
                  $('[property="og:title"]').attr('content') || 
                  'Unknown Title';

    // Extract date
    let date = '';
    const dateSelectors = [
      '[datetime]',
      '.date',
      '.published',
      '.timestamp',
      '[property="article:published_time"]',
      '[name="article:published_time"]'
    ];

    for (const selector of dateSelectors) {
      const element = $(selector).first();
      if (element.length) {
        date = element.attr('datetime') || element.attr('content') || element.text().trim();
        if (date) break;
      }
    }

    // Extract section from URL or metadata
    let section = '';
    const urlParts = new URL(url).pathname.split('/').filter(Boolean);
    if (urlParts.length > 0) {
      section = urlParts[0];
    }

    // Try to get section from metadata
    const sectionMeta = $('[property="article:section"]').attr('content') ||
                       $('[name="section"]').attr('content') ||
                       $('.section').first().text().trim();
    
    if (sectionMeta) {
      section = sectionMeta;
    }

    return { title, date, section, url };
  }

  async saveArticle(html, metadata, options = {}) {
    try {
      // Prepare article data (used for optional JSON and for DB)
      const articleData = {
        ...metadata,
        html,
        crawledAt: new Date().toISOString()
      };
      
  // JSON file saving removed
      
      // Extract canonical URL
      const canonicalUrl = (() => {
        try {
          const $ = cheerio.load(html);
          const c = $('link[rel="canonical"]').attr('href');
          if (c) return this.normalizeUrl(c);
        } catch (_) {}
        return null;
      })();

      // Compute hash and Readability text
  let htmlSha = null, text = null, wordCount = null, language = null, articleXPath = null;
      try {
        htmlSha = crypto.createHash('sha256').update(html).digest('hex');
        // Mute noisy non-fatal jsdom CSS parse errors using a VirtualConsole
        const vc = new VirtualConsole();
        vc.on('jsdomError', (err) => {
          const msg = (err && err.message) ? err.message : String(err);
          if (/Could not parse CSS stylesheet/i.test(msg)) {
            return; // ignore CSS parse noise
          }
          // For other jsdom errors, keep quiet by default; uncomment to debug:
          // console.warn('jsdomError:', msg);
        });
        const dom = new JSDOM(html, { url: metadata.url, virtualConsole: vc });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();
        if (article && article.textContent) {
          text = article.textContent.trim();
          wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
          language = dom.window.document.documentElement.getAttribute('lang') || null;
          // Identify article container more accurately by scoring candidates against Readability output
          try {
            const { document } = dom.window;
            const targetLen = text.length;
            const targetParas = (() => {
              try {
                const contentHtml = article.content || '';
                // Simple fast count without extra DOM parse
                const m = contentHtml.match(/<p[\s>]/gi);
                return m ? m.length : 0;
              } catch { return 0; }
            })();

            const selectors = [
              'article', '[role="article"]', '[itemprop="articleBody"]',
              'main article', 'main [itemprop="articleBody"]',
              '.article-body', '.content__article-body', '.story-body', '.entry-content', '.post-content', '.rich-text', '.ArticleBody', '.article__body',
              'main', 'section', 'div[class*="article"]', 'div[id*="article"]'
            ];
            const candSet = new Set();
            for (const sel of selectors) {
              const list = document.querySelectorAll(sel);
              for (const el of list) {
                candSet.add(el);
                if (candSet.size > 200) break; // keep it bounded
              }
              if (candSet.size > 200) break;
            }
            if (candSet.size === 0) {
              const fallback = document.body.querySelectorAll('p, article, main, section');
              for (const el of fallback) candSet.add(el);
            }
            const navClassRe = /(nav|menu|footer|sidebar|comment|promo|related|share|social)/i;
            const scoreOf = (el) => {
              const t = (el.textContent || '').trim();
              const len = t.length;
              if (len === 0) return Number.POSITIVE_INFINITY;
              const paras = el.querySelectorAll('p').length;
              let linkText = 0;
              const anchors = el.querySelectorAll('a');
              for (const a of anchors) linkText += ((a.textContent || '').trim()).length;
              const density = len > 0 ? linkText / len : 0;
              let score = Math.abs(len - targetLen);
              score += Math.abs(paras - targetParas) * 50;
              if (density > 0.3) score += 10000;
              const idcl = `${el.id || ''} ${el.className || ''}`;
              if (navClassRe.test(idcl)) score += 5000;
              // Prefer deeper nodes slightly to avoid selecting <main> when a nested article body exists
              let depth = 0; for (let n = el; n && n.parentNode; n = n.parentNode) depth++;
              score -= Math.min(depth, 20) * 5;
              return score;
            };
            let best = null; let bestScore = Number.POSITIVE_INFINITY;
            for (const el of candSet) {
              const s = scoreOf(el);
              // ensure it's at least half the target length to avoid tiny nodes
              const tlen = (el.textContent || '').trim().length;
              if (tlen < targetLen * 0.5) continue;
              if (s < bestScore) { best = el; bestScore = s; }
            }
            let node = best || document.body;
            // Paragraph coverage refinement: choose the smallest ancestor that covers ~all Readability paragraphs
            try {
              const normalize = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
              // Build Readability paragraph set using existing DOM to avoid extra JSDOM instances
              const tmp = document.createElement('div');
              tmp.innerHTML = article.content || '';
              const rbParas = Array.from(tmp.querySelectorAll('p'))
                .map(p => normalize(p.textContent))
                .filter(t => t && t.length >= 60);
              const rbTotal = rbParas.length;
              if (rbTotal >= 3) {
                const rbSet = new Set(rbParas);
                const getNodeParas = (el) => Array.from(el.querySelectorAll('p'))
                  .map(p => normalize(p.textContent))
                  .filter(t => t && t.length >= 60);
                let curr = node;
                const maxSteps = 25;
                let steps = 0;
                while (curr && curr !== document.documentElement && steps++ < maxSteps) {
                  const paras = getNodeParas(curr);
                  if (paras.length) {
                    let matches = 0;
                    for (const t of paras) { if (rbSet.has(t)) matches++; }
                    const coverage = matches / rbTotal;
                    if (coverage >= 0.98) { node = curr; break; }
                  }
                  curr = curr.parentElement;
                }
              }
            } catch (_) { /* ignore refinement errors */ }
            const getXPath = (el) => {
              if (!el || el.nodeType !== 1) return '';
              if (el === document.documentElement) return '/html';
              const segs = [];
              for (let n = el; n && n.nodeType === 1; n = n.parentNode) {
                const name = n.localName;
                if (!name) break;
                let idx = 1;
                if (n.parentNode) {
                  const siblings = Array.from(n.parentNode.children).filter(c => c.localName === name);
                  if (siblings.length > 1) {
                    idx = siblings.indexOf(n) + 1;
                    segs.unshift(`${name}[${idx}]`);
                  } else {
                    segs.unshift(name);
                  }
                } else {
                  segs.unshift(name);
                }
                if (n === document.documentElement) break;
              }
              if (segs[0] !== 'html') segs.unshift('html');
              return '/' + segs.join('/');
            };
            articleXPath = getXPath(node);
          } catch (_) { /* ignore */ }
        }
      } catch (_) {}

      // Save to SQLite if enabled
  if (this.dbAdapter && this.dbAdapter.isEnabled() && !options.skipDb) {
        // Build article-level analysis using URL + content signals
        let articleAnalysis = null;
        try {
          const $a = cheerio.load(html || '');
          const urlSig = this._computeUrlSignals(metadata.url);
          const contentSig = this._computeContentSignals($a, html || '');
          const combined = this._combineSignals(urlSig, contentSig, { wordCount: wordCount ?? undefined });
          articleAnalysis = { url: urlSig, content: { ...contentSig, wordCount: wordCount ?? null, articleXPath: articleXPath || null }, combined };
        } catch (_) {}
  this.dbAdapter.upsertArticle({
          url: metadata.url,
          title: metadata.title,
          date: metadata.date || null,
          section: metadata.section || null,
          html,
          crawled_at: articleData.crawledAt,
          canonical_url: canonicalUrl,
          referrer_url: options.referrerUrl || null,
          discovered_at: options.discoveredAt || null,
          crawl_depth: options.crawlDepth ?? null,
          fetched_at: options.fetchMeta?.fetchedAtIso || null,
          request_started_at: options.fetchMeta?.requestStartedIso || null,
          http_status: options.fetchMeta?.httpStatus ?? null,
          content_type: options.fetchMeta?.contentType || null,
          content_length: options.fetchMeta?.contentLength ?? null,
          etag: options.fetchMeta?.etag || null,
          last_modified: options.fetchMeta?.lastModified || null,
          redirect_chain: options.fetchMeta?.redirectChain || null,
          ttfb_ms: options.fetchMeta?.ttfbMs ?? null,
          download_ms: options.fetchMeta?.downloadMs ?? null,
          total_ms: options.fetchMeta?.totalMs ?? null,
          bytes_downloaded: options.fetchMeta?.bytesDownloaded ?? null,
          transfer_kbps: options.fetchMeta?.transferKbps ?? null,
          html_sha256: htmlSha,
          text,
          word_count: wordCount ?? null,
          language
          ,
          article_xpath: articleXPath,
          analysis: articleAnalysis ? JSON.stringify(articleAnalysis) : null
        });
  } else if (this.dbAdapter && this.dbAdapter.isEnabled() && options.skipDb) {
        console.log(`Skipped DB save (using cached content): ${metadata.url}`);
      }
      
  this.stats.articlesSaved++;
  console.log(`Saved article: ${metadata.title}`);
          this.emitProgress();
  return { filePath: null, fileSize: null };
    } catch (error) {
      console.log(`Failed to save article ${metadata.url}: ${error.message}`);
  try { this.dbAdapter?.insertError({ url: metadata.url, kind: 'save', message: error.message || String(error) }); } catch(_) {}
      try { console.log(`ERROR ${JSON.stringify({ url: metadata.url, kind: 'save', message: error.message||String(error) })}`); } catch(_) {}
      return { filePath: null, fileSize: null };
    }
  }

  async processPage(url, depth = 0, context = {}) {
    if (depth > this.maxDepth) return;

    // Respect max downloads limit
    if (this.maxDownloads !== undefined && this.stats.pagesDownloaded >= this.maxDownloads) {
      return { status: 'skipped' };
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
      return { status: 'failed', retriable: true };
    }

    const { meta = {}, source, html } = fetchResult;
    const fetchMeta = meta.fetchMeta || null;
    const resolvedUrl = meta.url || url;
    let normalizedUrl = null;
    try {
      normalizedUrl = this.normalizeUrl(resolvedUrl);
    } catch (_) {
      normalizedUrl = resolvedUrl;
    }

    if (source === 'skipped') {
      return { status: meta.status || 'skipped' };
    }

    if (source === 'cache') {
      if (normalizedUrl) {
        this.visited.add(normalizedUrl);
        this._noteDepthVisit(normalizedUrl, depth);
      }
      this.stats.pagesVisited++;
      this.emitProgress();
      const isArticleFromCache = this.looksLikeArticle(normalizedUrl || resolvedUrl);
      if (isArticleFromCache) {
        this.stats.articlesFound++;
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
            analysis: JSON.stringify({ kind: 'cache-hit', url: urlSig, content: contentSig, combined })
          });
        } catch (_) {}
      }
      this._checkAnalysisMilestones({ depth, isArticle: isArticleFromCache });
      return { status: 'cache' };
    }

    if (source === 'not-modified') {
      if (normalizedUrl) {
        this.visited.add(normalizedUrl);
        this._noteDepthVisit(normalizedUrl, depth);
      }
      this.stats.pagesVisited++;
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
            analysis: JSON.stringify({ status: 'not-modified', conditional: true })
          });
        } catch (_) {}
      }
      return { status: 'not-modified' };
    }

    if (source === 'error') {
      this.stats.errors++;
      const httpStatus = meta?.error?.httpStatus;
      const retriable = typeof httpStatus === 'number'
        ? (httpStatus === 429 || (httpStatus >= 500 && httpStatus < 600))
        : true;
      return { status: 'failed', retriable, retryAfterMs: meta.retryAfterMs };
    }

    if (normalizedUrl) {
      this.visited.add(normalizedUrl);
      this._noteDepthVisit(normalizedUrl, depth);
    }
    this.stats.pagesVisited++;
    this.stats.pagesDownloaded++;
    if (fetchMeta?.bytesDownloaded != null) {
      this.stats.bytesDownloaded += fetchMeta.bytesDownloaded;
    }
    this.emitProgress();

    const pageData = { url: resolvedUrl, html, fetchMeta };

    const $ = cheerio.load(pageData.html);
    const isArticleByUrl = this.looksLikeArticle(pageData.url);
    if (isArticleByUrl) {
      const metadata = this.extractArticleMetadata($, pageData.url);
      this.stats.articlesFound++;
      this.emitProgress();
      const saveInfo = await this.saveArticle(pageData.html, metadata, {
        skipDb: false,
        referrerUrl: null,
        discoveredAt: new Date().toISOString(),
        crawlDepth: depth,
        fetchMeta: pageData.fetchMeta
      });
      this.emitProgress();
      if (this.dbAdapter && this.dbAdapter.isEnabled() && pageData.fetchMeta) {
        const navLinks = this.findNavigationLinks($).length;
        const artLinks = this.findArticleLinks($).length;
        let wc = null;
        try {
          const vc = new VirtualConsole();
          const dom = new JSDOM(pageData.html, { url: pageData.url, virtualConsole: vc });
          const reader = new Readability(dom.window.document);
          const article = reader.parse();
          if (article && article.textContent) wc = article.textContent.trim().split(/\s+/).filter(Boolean).length;
        } catch (_) {}
        const contentSig = this._computeContentSignals($, pageData.html);
        const urlSig = this._computeUrlSignals(pageData.url);
        const combined = this._combineSignals(urlSig, contentSig, { wordCount: wc ?? undefined });
        this.dbAdapter.insertFetch({
          url: pageData.url,
          request_started_at: pageData.fetchMeta.requestStartedIso || null,
          fetched_at: pageData.fetchMeta.fetchedAtIso || null,
          http_status: pageData.fetchMeta.httpStatus ?? null,
          content_type: pageData.fetchMeta.contentType || null,
          content_length: pageData.fetchMeta.contentLength ?? null,
          content_encoding: pageData.fetchMeta.contentEncoding || null,
          bytes_downloaded: pageData.fetchMeta.bytesDownloaded ?? null,
          transfer_kbps: pageData.fetchMeta.transferKbps ?? null,
          ttfb_ms: pageData.fetchMeta.ttfbMs ?? null,
          download_ms: pageData.fetchMeta.downloadMs ?? null,
          total_ms: pageData.fetchMeta.totalMs ?? null,
          saved_to_db: 1,
          saved_to_file: 0,
          file_path: null,
          file_size: null,
          classification: (isArticleByUrl || (wc != null && wc > 150)) ? 'article' : (navLinks > 10 ? 'nav' : 'other'),
          nav_links_count: navLinks,
          article_links_count: artLinks,
          word_count: wc,
          analysis: JSON.stringify({ url: urlSig, content: { ...contentSig, wordCount: wc ?? null }, combined })
        });
        try {
          const normalizedArticleUrl = (() => {
            try { return this.normalizeUrl(pageData.url); } catch (_) { return pageData.url; }
          })();
          if (normalizedArticleUrl) {
            this.articleHeaderCache.set(normalizedArticleUrl, {
              etag: pageData.fetchMeta.etag || null,
              last_modified: pageData.fetchMeta.lastModified || null,
              fetched_at: pageData.fetchMeta.fetchedAtIso || null
            });
            this.knownArticlesCache.set(normalizedArticleUrl, true);
          }
        } catch (_) {}
      }
      try {
        this._maybeEnqueueAdaptiveSeeds({ url: pageData.url, metadata, depth });
      } catch (_) {}
    }

    const navigationLinks = this.findNavigationLinks($);
    const articleLinks = this.findArticleLinks($);

    console.log(`Found ${navigationLinks.length} navigation links and ${articleLinks.length} article links on ${pageData.url}`);

    this._checkAnalysisMilestones({ depth, isArticle: isArticleByUrl });

    if (this.dbAdapter && this.dbAdapter.isEnabled() && pageData.fetchMeta && !isArticleByUrl) {
      const navLinksCount = navigationLinks.length;
      const articleLinksCount = articleLinks.length;
      let wc = null;
      try {
        const vc = new VirtualConsole();
        const dom = new JSDOM(pageData.html, { url: pageData.url, virtualConsole: vc });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();
        if (article && article.textContent) wc = article.textContent.trim().split(/\s+/).filter(Boolean).length;
      } catch (_) {}
      const contentSig = this._computeContentSignals($, pageData.html);
      const urlSig = this._computeUrlSignals(pageData.url);
      const combined = this._combineSignals(urlSig, contentSig, { wordCount: wc ?? undefined });
      this.dbAdapter.insertFetch({
        url: pageData.url,
        request_started_at: pageData.fetchMeta.requestStartedIso || null,
        fetched_at: pageData.fetchMeta.fetchedAtIso || null,
        http_status: pageData.fetchMeta.httpStatus ?? null,
        content_type: pageData.fetchMeta.contentType || null,
        content_length: pageData.fetchMeta.contentLength ?? null,
        content_encoding: pageData.fetchMeta.contentEncoding || null,
        bytes_downloaded: pageData.fetchMeta.bytesDownloaded ?? null,
        transfer_kbps: pageData.fetchMeta.transferKbps ?? null,
        ttfb_ms: pageData.fetchMeta.ttfbMs ?? null,
        download_ms: pageData.fetchMeta.downloadMs ?? null,
        total_ms: pageData.fetchMeta.totalMs ?? null,
        saved_to_db: 0,
        saved_to_file: 0,
        file_path: null,
        file_size: null,
        classification: (isArticleByUrl || (wc != null && wc > 150)) ? 'article' : (navLinksCount > 10 ? 'nav' : 'other'),
        nav_links_count: navLinksCount,
        article_links_count: articleLinksCount,
        word_count: wc,
        analysis: JSON.stringify({ url: urlSig, content: { ...contentSig, wordCount: wc ?? null }, combined })
      });
    }

    const nowIso = new Date().toISOString();
    const seen = new Set();
    const allLinks = [...navigationLinks.map(l => ({ ...l, type: 'nav' })), ...articleLinks.map(l => ({ ...l, type: 'article' }))];
    for (const link of allLinks) {
      const urlOnly = link.url;
      if (!seen.has(urlOnly)) seen.add(urlOnly);
      this.enqueueRequest({ url: urlOnly, depth: depth + 1, type: link.type });
      if (this.dbAdapter && this.dbAdapter.isEnabled()) {
        this.dbAdapter.insertLink({
          src_url: pageData.url,
          dst_url: urlOnly,
          anchor: link.anchor,
          rel: Array.isArray(link.rel) ? link.rel.join(' ') : link.rel,
          type: link.type,
          depth: depth + 1,
          on_domain: link.onDomain ? 1 : 0,
          discovered_at: nowIso
        });
      }
    }
    return { status: 'success' };
  }

  computePriority({ type, depth, discoveredAt, bias = 0, url = null, meta = null }) {
    // Use enhanced priority computation if available
    if (this.featuresEnabled?.gapDrivenPrioritization && this.priorityScorer) {
      try {
        const result = this.priorityScorer.computeEnhancedPriority({
          type, depth, discoveredAt, bias, url, meta, jobId: this.jobId
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

  _handlePolicySkip(decision, { depth, queueSize }) {
    const analysis = decision?.analysis || {};
    const normalized = analysis.normalized || analysis.raw || null;
    let host = null;
    try { if (normalized) host = new URL(normalized).hostname; } catch (_) {}
    this.emitQueueEvent({
      action: 'drop',
      url: normalized || analysis.raw,
      depth,
      host,
      reason: 'query-skip',
      queueSize,
      alias: decision.guessedUrl || analysis.guessedWithoutQuery || null
    });
    try { this.deepUrlAnalyzer?.analyze(decision); } catch (_) {}
    if (normalized) {
      try {
        console.log(`Skipping query URL (heuristic superfluous): ${normalized} -> ${decision.guessedUrl || analysis.guessedWithoutQuery || '<none>'}`);
      } catch (_) {}
    }
  }

  enqueueRequest({ url, depth, type }) {
    return this.queue.enqueue({ url, depth, type });
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
        const { DomainLimiter } = require('./crawler/limiter');
        if (!this._domainLimiter) this._domainLimiter = new DomainLimiter({ pacerJitterMinMs: this.pacerJitterMinMs, pacerJitterMaxMs: this.pacerJitterMaxMs });
        await this._domainLimiter.acquire(host);
        const s = this._domainLimiter._get(host);
        if (s) Object.assign(before, { isLimited: s.isLimited, rpm: s.rpm, nextRequestAt: s.nextRequestAt, backoffUntil: s.backoffUntil, lastRequestAt: s.lastRequestAt, rpmLastMinute: s.rpmLastMinute, windowStartedAt: s.windowStartedAt, windowCount: s.windowCount });
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
      const { DomainLimiter } = require('./crawler/limiter');
      if (!this._domainLimiter) this._domainLimiter = new DomainLimiter({ pacerJitterMinMs: this.pacerJitterMinMs, pacerJitterMaxMs: this.pacerJitterMaxMs });
      this._domainLimiter.note429(host, retryAfterMs);
      const s = this._domainLimiter._get(host); const st = this._getDomainState(host); if (s && st) Object.assign(st, s);
    } catch (_) {
      const now = nowMs();
      const state = this._getDomainState(host);
      state.isLimited = true; state.last429At = now; state.successStreak = 0; state.err429Streak++;
      const baseBlackout = retryAfterMs != null ? Math.max(30000, retryAfterMs) : 45000; const jitterV = Math.floor(baseBlackout * ((Math.random() * 0.2) - 0.1)); let blackout = baseBlackout + jitterV;
      if (state.err429Streak >= 2) blackout = Math.max(blackout, 5 * 60 * 1000);
      if (state.err429Streak >= 3) blackout = Math.max(blackout, 15 * 60 * 1000);
      state.backoffUntil = now + blackout;
      const currentRpm = state.rpm || 60; const newRpm = Math.max(1, Math.floor(currentRpm * 0.25)); state.rpm = newRpm; state.nextRequestAt = now + Math.floor(60000 / newRpm);
    }
  }

  noteSuccess(host) {
    try {
      const { DomainLimiter } = require('./crawler/limiter');
      if (!this._domainLimiter) this._domainLimiter = new DomainLimiter({ pacerJitterMinMs: this.pacerJitterMinMs, pacerJitterMaxMs: this.pacerJitterMaxMs });
      this._domainLimiter.noteSuccess(host);
      const s = this._domainLimiter._get(host); const st = this._getDomainState(host); if (s && st) Object.assign(st, s);
    } catch (_) {
      const now = nowMs();
      const state = this._getDomainState(host);
      state.lastSuccessAt = now; state.successStreak++; state.err429Streak = 0;
      if (state.isLimited && state.successStreak > 100) {
        const canProbe = (now - state.last429At) > 5 * 60 * 1000; if (canProbe) { const currentRpm = state.rpm || 10; const nextRpm = Math.max(1, Math.floor(currentRpm * 1.1)); state.rpm = Math.min(nextRpm, 300); state.successStreak = 0; }
      }
    }
  }

  _pullNextWorkItem() {
    return this.queue.pullNext();
  }

  async runWorker(workerId) {
    while (true) {
      if (this.abortRequested) {
        return;
      }
      // honor pause
      while (this.paused && !this.abortRequested) {
        await sleep(200);
        this.emitProgress();
      }
      if (this.abortRequested) {
        return;
      }
      if (this.maxDownloads !== undefined && this.stats.pagesDownloaded >= this.maxDownloads) {
        return;
      }
      const pick = await this._pullNextWorkItem();
      if (this.abortRequested) {
        return;
      }
      const now = nowMs();
      if (!pick || !pick.item) {
        const queueSize = this.queue.size();
        const wakeTarget = pick && pick.wakeAt ? Math.max(0, pick.wakeAt - now) : 0;
        const maxWait = wakeTarget > 0 ? Math.min(wakeTarget, 1000) : 1000;
        let waited = 0;
        const waitStep = 100;
        while (waited < maxWait && !this.abortRequested) {
          await sleep(Math.min(waitStep, maxWait - waited));
          waited += waitStep;
          if (this.queue.size() > 0 || this.paused) {
            break;
          }
        }
        if (this.abortRequested) {
          return;
        }
        if (this.queue.size() === 0 && !this.paused) {
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
        this.emitQueueEvent({ action: 'dequeued', url: item.url, depth: item.depth, host, queueSize: sizeNow });
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
      if (this.abortRequested) {
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
          item.priority = this.computePriority({ type: item.type, depth: item.depth, discoveredAt: item.discoveredAt, bias: item.priorityBias || 0 });
          this.queue.reschedule(item);
          // Emit retry event after requeue
          try {
            const host = (() => { try { return new URL(item.url).hostname; } catch (_) { return null; } })();
            const sizeNow = this.queue.size();
            this.emitQueueEvent({ action: 'retry', url: item.url, depth: item.depth, host, reason: 'retriable-error', queueSize: sizeNow });
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
      try { await this.planIntelligent(); } catch (e) { try { this.emitProblem({ kind: 'intelligent-plan-failed', message: e?.message || String(e) }); } catch(_) {} }
    }
    // Optionally preload URLs from sitemaps
    if (this.useSitemap) {
      try { await this.loadSitemapsAndEnqueue(); } catch (_) {}
    }
    // Seed start URL unless we are sitemap-only
    if (!this.sitemapOnly) {
      this.enqueueRequest({ url: this.startUrl, depth: 0, type: 'nav' });
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
    this._emitIntelligentCompletionMilestone({ outcomeErr });
    
    if (this.dbAdapter && this.dbAdapter.isEnabled()) {
      const count = this.dbAdapter.getArticleCount();
      console.log(`Database contains ${count} article records`);
      this.dbAdapter.close();
    }

    if (outcomeErr) {
      if (!outcomeErr.details) outcomeErr.details = {};
      if (!outcomeErr.details.stats) outcomeErr.details.stats = { ...this.stats };
      throw outcomeErr;
    }
  }

  // --- Intelligent planner ---
  async planIntelligent() {
    const host = this.domain.toLowerCase();
    try { console.log(`Intelligent crawl planning for host=${host}`); } catch (_) {}

    const bootstrapResult = await this._withPlannerStage('bootstrap', {
      host,
      targetHosts: Array.isArray(this.intTargetHosts) && this.intTargetHosts.length ? this.intTargetHosts : undefined
    }, async () => {
      if (Array.isArray(this.intTargetHosts) && this.intTargetHosts.length > 0) {
        const ok = this.intTargetHosts.some((h) => host.endsWith(h));
        if (!ok) {
          this.emitProblem({ kind: 'planner-skipped-host', host, targetHosts: this.intTargetHosts });
          return {
            allowed: false,
            skipPlan: true,
            targetHosts: this.intTargetHosts
          };
        }
      }
      return {
        allowed: true,
        skipPlan: false,
        plannerVerbosity: this.plannerVerbosity,
        targetHosts: this.intTargetHosts || null
      };
    }, {
      mapResultForEvent: (res) => {
        if (!res) return null;
        return {
          allowed: res.allowed !== false,
          skipped: !!res.skipPlan,
          plannerVerbosity: res.plannerVerbosity,
          targetHosts: Array.isArray(res.targetHosts) && res.targetHosts.length ? res.targetHosts : undefined
        };
      }
    });

    if (bootstrapResult?.skipPlan) {
      return;
    }

    const patternResult = await this._withPlannerStage('infer-patterns', { startUrl: this.startUrl }, async () => {
      let homepageHtml = null;
      const fetchMeta = { source: 'network', notModified: false };
      try {
        const result = await this.fetchPipeline.fetch({
          url: this.startUrl,
          context: { depth: 0, allowRevisit: true, referrerUrl: null }
        });
        if (result) {
          if (result.source === 'cache') {
            homepageHtml = result.html || null;
            fetchMeta.source = 'cache';
          } else if (result.source === 'not-modified') {
            fetchMeta.notModified = true;
            const cached = await this.getCachedArticle(this.startUrl);
            homepageHtml = cached?.html || null;
            fetchMeta.source = cached?.html ? 'cache' : 'stale';
          } else if (result.source === 'network') {
            homepageHtml = result.html;
            fetchMeta.source = 'network';
          } else if (result.source === 'error') {
            fetchMeta.error = result.meta?.error?.message || result.meta?.error?.kind || 'fetch-error';
          }
        }
      } catch (err) {
        fetchMeta.error = err?.message || String(err);
      }
      const learned = this._inferSitePatternsFromHomepage(homepageHtml);
      if (learned && (learned.sections?.length || learned.articleHints?.length)) {
        this.emitMilestone({ kind: 'patterns-learned', scope: host, details: learned, message: 'Homepage patterns inferred' });
      }
      return { learned, fetchMeta };
    }, {
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
      }
    });

  const learnedSections = Array.isArray(patternResult?.learned?.sections) ? patternResult.learned.sections : [];

    const countryCandidates = await this._withPlannerStage('country-hubs', { host }, async () => {
      const results = await this._computeCountryHubCandidates(host);
      return Array.isArray(results) ? results : [];
    }, {
      mapResultForEvent: (res) => {
        if (!Array.isArray(res)) return { candidateCount: 0 };
        return {
          candidateCount: res.length,
          sample: res.slice(0, 5).map((c) => c?.url).filter(Boolean)
        };
      }
    });

    const seedResult = await this._withPlannerStage('seed-hubs', {
      sectionsFromPatterns: learnedSections.length,
      candidateCount: countryCandidates.length,
      maxSeeds: typeof this.intMaxSeeds === 'number' ? this.intMaxSeeds : 50
    }, async () => {
      const sectionHubs = learnedSections.map((s) => `${this.baseUrl}/${s}/`);
      const hubSet = new Set(sectionHubs.concat(countryCandidates.map((c) => c.url)));
      const cap = typeof this.intMaxSeeds === 'number' ? this.intMaxSeeds : 50;
      const hubs = Array.from(hubSet).slice(0, cap);
      const seeded = [];
      for (const hubUrl of hubs) {
        const enqueued = this.enqueueRequest({ url: hubUrl, depth: 0, type: { kind: 'hub-seed', reason: 'intelligent-seed' } });
        if (enqueued) {
          const norm = (() => { try { return this.normalizeUrl(hubUrl); } catch (_) { return hubUrl; } })();
          if (norm) this.seededHubUrls.add(norm);
          seeded.push(hubUrl);
        }
        try {
          this.db?.db?.prepare(`INSERT OR IGNORE INTO place_hubs(host, url, place_slug, place_kind, topic_slug, topic_label, topic_kind, title, first_seen_at, last_seen_at, nav_links_count, article_links_count, evidence) VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, datetime('now'), datetime('now'), NULL, NULL, ?)`)
            .run(host, hubUrl, JSON.stringify({ by: 'intelligent-plan', reason: 'learned-section-or-country' }));
        } catch (_) {}
      }
      try { console.log(`Intelligent plan: seeded ${seeded.length} hub(s)`); } catch (_) {}
      if (seeded.length === 0) {
        this.emitProblem({ kind: 'no-hubs-seeded', scope: host, message: 'No suitable hubs found from homepage or models' });
      } else {
        this.emitMilestone({
          kind: 'hubs-seeded',
          scope: host,
          message: `Seeded ${seeded.length} hubs`,
          details: {
            count: seeded.length,
            sections: sectionHubs.length,
            countryCandidates: countryCandidates.length
          }
        });
      }
      return {
        seededCount: seeded.length,
        requestedCount: hubs.length,
        sectionHubCount: sectionHubs.length,
        countryCandidateCount: countryCandidates.length,
        sampleSeeded: seeded.slice(0, 5)
      };
    }, {
      mapResultForEvent: (res) => {
        if (!res) return null;
        return {
          seededCount: res.seededCount || 0,
          requestedCount: res.requestedCount || 0,
          sectionHubCount: res.sectionHubCount || 0,
          countryCandidateCount: res.countryCandidateCount || 0,
          sampleSeeded: Array.isArray(res.sampleSeeded) ? res.sampleSeeded.slice(0, 3) : undefined
        };
      }
    });

    if (this.plannerEnabled) {
      this._intelligentPlanSummary = {
        seededCount: seedResult?.seededCount || 0,
        requestedCount: seedResult?.requestedCount || 0,
        sectionHubCount: seedResult?.sectionHubCount || learnedSections.length,
        countryCandidateCount: seedResult?.countryCandidateCount || countryCandidates.length,
        sampleSeeded: Array.isArray(seedResult?.sampleSeeded) ? seedResult.sampleSeeded.slice(0, 5) : [],
        learnedSectionCount: learnedSections.length,
        learnedSectionsPreview: learnedSections.slice(0, 8)
      };
    }

  }

  _inferSitePatternsFromHomepage(html) {
    if (!html) return { sections: [], articleHints: [] };
    const $ = cheerio.load(html);
    const counts = new Map();
    const skip = new Set(['about','contact','privacy','terms','cookies','help','advertising','sitemap','account','login','signup','subscribe','newsletter','careers']);
    const add = (seg) => {
      const s = (seg || '').trim().toLowerCase();
      if (!s || skip.has(s)) return;
      counts.set(s, (counts.get(s) || 0) + 1);
    };
    $('a[href]').each((_, el) => {
      try {
        const href = $(el).attr('href');
        const u = new URL(href, this.baseUrl);
        if (u.hostname !== this.domain) return;
        const seg = (u.pathname || '/').split('/').filter(Boolean)[0] || null;
        if (!seg) return;
        add(seg);
      } catch (_) {}
    });
    const sections = Array.from(counts.entries())
      .sort((a,b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k]) => k);
    // Simple article hints from homepage links
    const articleHints = [];
    try {
      const sample = new Set();
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        try {
          const u = new URL(href, this.baseUrl);
          if (u.hostname !== this.domain) return;
          const p = u.pathname || '/';
          if (/\/\d{4}\/\d{2}\/\d{2}\//.test(p)) sample.add('date-path');
          if (/(?:^|\/)article[s]?\b|\bnews\b|\bstory\b|\bopinion\b/i.test(p)) sample.add('keywords');
        } catch(_){}
      });
      articleHints.push(...Array.from(sample));
    } catch(_){}
    return { sections, articleHints };
  }

  async _computeCountryHubCandidates(host) {
    const out = [];
    // Guardian pattern: https://www.theguardian.com/world/<slug>
    if (/guardian\.com$/.test(host)) {
      // Sense: use a small set of high-confidence country slugs to start; can expand later from gazetteer table.
      const slugs = this._getTopCountrySlugsFromGazetteer(100) || [
        'france','germany','spain','italy','china','india','united-states','russia','brazil','canada','australia','japan','south-africa','mexico','nigeria','argentina','poland','netherlands','sweden','norway','denmark','ireland','portugal','greece','turkey','ukraine','egypt','saudiarabia','iran','iraq','israel'
      ];
      for (const slug of slugs) {
        // Map common variations (spaces -> hyphens, lowercase)
        const s = String(slug).trim().toLowerCase().replace(/\s+/g, '-');
        const url = `${this.baseUrl}/world/${encodeURIComponent(s)}`;
        out.push({ url, slug: s, reason: 'guardian-world-country' });
      }
    }
    // Future: add patterns for BBC, NYTimes, etc.
    return out;
  }

  _getTopCountrySlugsFromGazetteer(limit = 50) {
    try {
      if (!this.db || !this.db.db) return null;
      const rows = this.db.db.prepare(`SELECT name FROM place_names WHERE id IN (SELECT canonical_name_id FROM places WHERE kind='country') ORDER BY name LIMIT ?`).all(limit);
      // Normalize names to slugs similar to Guardian style
      const toSlug = (name) => String(name || '').trim().toLowerCase()
        .replace(/\band\b/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      const uniq = new Set();
      const slugs = [];
      for (const r of rows) {
        const s = toSlug(r.name);
        if (s && !uniq.has(s)) { uniq.add(s); slugs.push(s); }
      }
      return slugs;
    } catch (_) { return null; }
  }

  async crawl() {
    if (this.usePriorityQueue) {
      return this.crawlConcurrent();
    }
    await this.init();
    
    // Start with the initial URL
    this.enqueueRequest({ url: this.startUrl, depth: 0, type: 'nav' });
    
    while (true) {
      if (this.abortRequested) {
        break;
      }
      // honor pause
      while (this.paused && !this.abortRequested) { await sleep(200); this.emitProgress(); }
      if (this.abortRequested) {
        break;
      }
      // Stop if we've reached the download limit
      if (this.maxDownloads !== undefined && this.stats.pagesDownloaded >= this.maxDownloads) {
        console.log(`Reached max downloads limit: ${this.maxDownloads}`);
        break;
      }
      const pick = await this._pullNextWorkItem();
      if (this.abortRequested) {
        break;
      }
      const now = nowMs();
      if (!pick || !pick.item) {
        const queueSize = this.queue.size();
        if (queueSize === 0 && !this.paused) {
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
        this.emitQueueEvent({ action: 'dequeued', url: item.url, depth: item.depth, host, queueSize: this.queue.size() });
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
      if (this.abortRequested) {
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
    this._emitIntelligentCompletionMilestone({ outcomeErr });
    
    if (this.dbAdapter && this.dbAdapter.isEnabled()) {
      const count = this.dbAdapter.getArticleCount();
      console.log(`Database contains ${count} article records`);
      this.dbAdapter.close();
    }

    // Cleanup enhanced features
    this._cleanupEnhancedFeatures();

    if (outcomeErr) {
      if (!outcomeErr.details) outcomeErr.details = {};
      if (!outcomeErr.details.stats) outcomeErr.details.stats = { ...this.stats };
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
  computeEnhancedPriority({ type, depth, discoveredAt, bias = 0, url, meta = null }) {
    if (this.featuresEnabled.gapDrivenPrioritization && this.priorityScorer) {
      try {
        return this.priorityScorer.computeEnhancedPriority({
          type, depth, discoveredAt, bias, url, meta, jobId: this.jobId
        });
      } catch (error) {
        console.warn('Enhanced priority computation failed, falling back to base:', error.message);
      }
    }

    // Fallback to base priority calculation
    const basePriority = this.computePriority({ type, depth, discoveredAt, bias });
    return {
      priority: basePriority,
      prioritySource: 'base',
      bonusApplied: 0,
      basePriority
    };
  }

  /**
   * Enhanced queue event emission with priority metadata and clustering
   */
  emitEnhancedQueueEvent(eventData) {
    // Emit standard queue event first (backward compatibility)
    this.emitQueueEvent(eventData);

    // Add enhanced tracking if features are enabled
    if (this.enhancedDbAdapter && eventData.jobId) {
      try {
        this.enhancedDbAdapter.insertQueueEvent({
          ...eventData,
          priorityScore: eventData.priorityScore,
          prioritySource: eventData.prioritySource,
          bonusApplied: eventData.bonusApplied,
          clusterId: eventData.clusterId,
          gapPredictionScore: eventData.gapPredictionScore
        });
      } catch (error) {
        console.warn('Failed to log enhanced queue event:', error.message);
      }
    }
  }

  /**
   * Enhanced problem processing with clustering and gap prediction
   */
  emitEnhancedProblem(problemData) {
    // Emit standard problem event first (backward compatibility)
    this.emitProblem(problemData);

    // Process for clustering if enabled
    if (this.featuresEnabled.problemClustering && this.problemClusteringService) {
      try {
        const clusterResult = this.problemClusteringService.processProblem({
          ...problemData,
          jobId: this.jobId,
          timestamp: new Date().toISOString()
        });

        if (clusterResult?.shouldBoostRelated) {
          console.log(`Problem cluster ${clusterResult.clusterId} reached occurrence ${clusterResult.occurrenceCount}, priority boost: ${clusterResult.priorityBoost}`);
        }
      } catch (error) {
        console.warn('Problem clustering failed:', error.message);
      }
    }
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
  pacerJitterMaxMs
  , useSitemap, sitemapOnly,
  sitemapMaxUrls: sitemapMaxArg ? parseInt(sitemapMaxArg.split('=')[1], 10) : undefined
  , fastStart
  , crawlType
  , hubMaxPages: hubMaxPagesArg ? parseInt(hubMaxPagesArg.split('=')[1], 10) : undefined
  , hubMaxDays: hubMaxDaysArg ? parseInt(hubMaxDaysArg.split('=')[1], 10) : undefined
  , intMaxSeeds: intMaxSeedsArg ? parseInt(intMaxSeedsArg.split('=')[1], 10) : undefined
  , intTargetHosts: intTargetHostsArg ? String(intTargetHostsArg.split('=')[1]).split(',').map(s => s.trim()).filter(Boolean) : undefined
  , plannerVerbosity: plannerVerbosityArg ? parseInt(plannerVerbosityArg.split('=')[1], 10) : undefined
  , jobId: jobIdArg ? jobIdArg.split('=')[1] : undefined
  , skipQueryUrls: !allowQueryUrls
  });

  // Accept PAUSE/RESUME commands over stdin (for GUI control)
  try {
    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    rl.on('line', (line) => {
      const cmd = String(line || '').trim().toUpperCase();
      if (cmd === 'PAUSE') { crawler.pause(); }
      else if (cmd === 'RESUME') { crawler.resume(); }
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