/**
 * Build ordered step arrays from configuration flags
 * 
 * This module converts configuration options into an ordered array of pipeline steps.
 * Each step is conditionally included based on enabled flags, replacing scattered
 * if-else branches throughout the codebase with a single, declarative build phase.
 * 
 * @module src/crawler/pipeline/buildSteps
 */

const { createStep } = require('./runPipeline');

/**
 * @typedef {Object} CrawlConfig
 * @property {boolean} [enableDb=true] - Enable database operations
 * @property {boolean} [preferCache=true] - Prefer cached content
 * @property {boolean} [useSitemap=true] - Load and process sitemaps
 * @property {boolean} [plannerEnabled=false] - Run intelligent planner
 * @property {boolean} [structureOnly=false] - Skip article processing
 * @property {boolean} [enableEnhancedFeatures=false] - Enable enhanced features
 * @property {boolean} [enableTelemetry=true] - Enable telemetry/metrics
 * @property {boolean} [validateRobots=true] - Check robots.txt
 * @property {string} [crawlType='basic'] - Crawl type (basic, intelligent, gazetteer)
 */

/**
 * @typedef {Object} PageProcessConfig  
 * @property {boolean} [extractLinks=true] - Extract links from pages
 * @property {boolean} [detectArticles=true] - Detect article content
 * @property {boolean} [saveArticles=true] - Save detected articles
 * @property {boolean} [discoverNavigation=true] - Discover navigation patterns
 * @property {boolean} [trackSignals=true] - Track article signals
 */

/**
 * Registry of available step builders
 * Each builder returns a step definition or null if the step should be skipped
 */
const STEP_BUILDERS = {
  // === Initialization Steps ===
  
  validateUrl: (config) => createStep('validate-url', async (ctx, deps) => {
    const { url } = ctx;
    if (!url || typeof url !== 'string') {
      return { ok: false, reason: 'invalid-url', err: new Error('URL is required') };
    }
    try {
      const parsed = new URL(url);
      ctx.parsedUrl = parsed;
      ctx.host = parsed.hostname;
      return { ok: true, value: { host: parsed.hostname, protocol: parsed.protocol } };
    } catch (err) {
      return { ok: false, reason: 'url-parse-error', err };
    }
  }, { label: 'Validate URL' }),

  normalizeUrl: (config, normalizer) => createStep('normalize-url', async (ctx, deps) => {
    if (!normalizer) {
      return { ok: true, value: { normalized: ctx.url } };
    }
    const normalized = normalizer(ctx.url);
    if (!normalized) {
      return { ok: false, reason: 'normalize-failed' };
    }
    ctx.normalizedUrl = normalized;
    return { ok: true, value: { normalized } };
  }, { label: 'Normalize URL' }),

  // === Policy Steps ===

  checkRobots: (config, robotsChecker) => {
    if (!config.validateRobots) return null;
    return createStep('check-robots', async (ctx, deps) => {
      if (!robotsChecker) {
        return { ok: true, value: { allowed: true, reason: 'no-checker' } };
      }
      const url = ctx.normalizedUrl || ctx.url;
      const allowed = robotsChecker(url);
      if (!allowed) {
        return { ok: false, reason: 'robots-blocked' };
      }
      return { ok: true, value: { allowed: true } };
    }, { label: 'Check robots.txt' });
  },

  checkVisited: (config, visitedChecker) => createStep('check-visited', async (ctx, deps) => {
    if (ctx.allowRevisit) {
      return { ok: true, value: { visited: false, reason: 'revisit-allowed' } };
    }
    if (!visitedChecker) {
      return { ok: true, value: { visited: false, reason: 'no-checker' } };
    }
    const url = ctx.normalizedUrl || ctx.url;
    const visited = visitedChecker(url);
    if (visited) {
      return { ok: false, reason: 'already-visited' };
    }
    return { ok: true, value: { visited: false } };
  }, { label: 'Check if visited' }),

  checkPolicy: (config, policyChecker) => createStep('check-policy', async (ctx, deps) => {
    if (!policyChecker) {
      return { ok: true, value: { allowed: true } };
    }
    const url = ctx.normalizedUrl || ctx.url;
    const decision = policyChecker(url, ctx);
    if (!decision.allow) {
      return { ok: false, reason: decision.reason || 'policy-blocked', value: { decision } };
    }
    ctx.policyDecision = decision;
    return { ok: true, value: { decision } };
  }, { label: 'Check URL policy' }),

  // === Cache Steps ===

  tryCache: (config, cacheGetter) => {
    if (!config.preferCache) return null;
    return createStep('try-cache', async (ctx, deps) => {
      if (!cacheGetter) {
        return { ok: true, value: { cached: false, reason: 'no-cache' } };
      }
      const url = ctx.normalizedUrl || ctx.url;
      const cached = await cacheGetter(url);
      if (cached && cached.html) {
        ctx.html = cached.html;
        ctx.source = 'cache';
        ctx.cachedAt = cached.crawledAt;
        return { ok: true, value: { cached: true, source: cached.source } };
      }
      return { ok: true, value: { cached: false } };
    }, { 
      label: 'Try cache',
      optional: true // Cache miss is not an error
    });
  },

  // === Network Steps ===

  acquireRateToken: (config, tokenAcquirer) => {
    if (!config.rateLimitMs) return null;
    return createStep('acquire-rate-token', async (ctx, deps) => {
      if (!tokenAcquirer) {
        return { ok: true };
      }
      await tokenAcquirer();
      return { ok: true };
    }, { label: 'Acquire rate limit token' });
  },

  acquireDomainToken: (config, domainTokenAcquirer) => createStep('acquire-domain-token', async (ctx, deps) => {
    if (!domainTokenAcquirer) {
      return { ok: true };
    }
    const host = ctx.host || (ctx.parsedUrl && ctx.parsedUrl.hostname);
    if (!host) {
      return { ok: true };
    }
    await domainTokenAcquirer(host);
    return { ok: true };
  }, { label: 'Acquire domain token' }),

  fetch: (config, fetcher) => createStep('fetch', async (ctx, deps) => {
    // Skip if we already have HTML from cache
    if (ctx.html && ctx.source === 'cache') {
      return { ok: true, value: { source: 'cache', skipped: true } };
    }
    
    if (!fetcher) {
      return { ok: false, reason: 'no-fetcher', err: new Error('Fetcher not provided') };
    }

    const url = ctx.normalizedUrl || ctx.url;
    const result = await fetcher({ url, context: ctx });
    
    if (result.meta?.status === 'error') {
      return { 
        ok: false, 
        reason: result.meta.error?.kind || 'fetch-error',
        err: new Error(result.meta.error?.message || 'Fetch failed')
      };
    }

    if (result.html) {
      ctx.html = result.html;
      ctx.source = result.source || 'network';
      ctx.fetchMeta = result.meta?.fetchMeta || null;
    }

    return { ok: true, value: { source: ctx.source, meta: result.meta } };
  }, { label: 'Fetch page' }),

  // === Processing Steps ===

  parseHtml: (config, parser) => createStep('parse-html', async (ctx, deps) => {
    if (!ctx.html) {
      return { ok: false, reason: 'no-html' };
    }
    
    // Default to cheerio if no parser provided
    if (!parser) {
      try {
        const cheerio = require('cheerio');
        ctx.$ = cheerio.load(ctx.html);
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: 'parse-error', err };
      }
    }

    const result = parser(ctx.html);
    if (result.$) {
      ctx.$ = result.$;
    }
    return { ok: true, value: result };
  }, { label: 'Parse HTML' }),

  extractLinks: (config, linkExtractor) => {
    if (config.structureOnly === false && !config.extractLinks) return null;
    return createStep('extract-links', async (ctx, deps) => {
      if (!ctx.$ || !linkExtractor) {
        return { ok: true, value: { links: [] } };
      }
      const url = ctx.normalizedUrl || ctx.url;
      const links = linkExtractor(ctx.$, url, ctx);
      ctx.links = links;
      return { ok: true, value: { count: links.length } };
    }, { label: 'Extract links' });
  },

  detectArticle: (config, articleDetector) => {
    if (config.structureOnly) return null;
    return createStep('detect-article', async (ctx, deps) => {
      if (!articleDetector) {
        return { ok: true, value: { isArticle: false, reason: 'no-detector' } };
      }
      const result = articleDetector(ctx.$, ctx.html, ctx);
      ctx.isArticle = result.isArticle || false;
      ctx.articleSignals = result.signals || null;
      ctx.articleConfidence = result.confidence || 0;
      return { ok: true, value: result };
    }, { 
      label: 'Detect article',
      optional: true
    });
  },

  saveArticle: (config, articleSaver) => {
    if (config.structureOnly || !config.saveArticles) return null;
    return createStep('save-article', async (ctx, deps) => {
      if (!ctx.isArticle) {
        return { ok: true, value: { saved: false, reason: 'not-article' } };
      }
      if (!articleSaver) {
        return { ok: true, value: { saved: false, reason: 'no-saver' } };
      }
      const url = ctx.normalizedUrl || ctx.url;
      await articleSaver({
        url,
        html: ctx.html,
        signals: ctx.articleSignals,
        fetchMeta: ctx.fetchMeta
      });
      ctx.articleSaved = true;
      return { ok: true, value: { saved: true } };
    }, { 
      label: 'Save article',
      optional: true
    });
  },

  enqueueLinks: (config, enqueuer) => createStep('enqueue-links', async (ctx, deps) => {
    if (!ctx.links || ctx.links.length === 0) {
      return { ok: true, value: { enqueued: 0 } };
    }
    if (!enqueuer) {
      return { ok: true, value: { enqueued: 0, reason: 'no-enqueuer' } };
    }
    
    let enqueued = 0;
    const depth = (ctx.depth || 0) + 1;
    
    for (const link of ctx.links) {
      const success = enqueuer({
        url: link.url || link,
        depth,
        type: link.type || 'nav',
        meta: link.meta || null
      });
      if (success) enqueued++;
    }
    
    return { ok: true, value: { enqueued, total: ctx.links.length } };
  }, { label: 'Enqueue links' }),

  // === Telemetry Steps ===

  recordMetrics: (config) => {
    if (!config.enableTelemetry) return null;
    return createStep('record-metrics', async (ctx, deps) => {
      if (!deps.metrics) {
        return { ok: true };
      }
      
      const metrics = {
        url: ctx.normalizedUrl || ctx.url,
        source: ctx.source,
        isArticle: ctx.isArticle || false,
        linksFound: ctx.links?.length || 0,
        depth: ctx.depth || 0
      };
      
      if (ctx.fetchMeta) {
        metrics.ttfbMs = ctx.fetchMeta.ttfbMs;
        metrics.totalMs = ctx.fetchMeta.totalMs;
        metrics.bytesDownloaded = ctx.fetchMeta.bytesDownloaded;
      }
      
      deps.metrics.record?.(metrics);
      return { ok: true, value: metrics };
    }, { 
      label: 'Record metrics',
      optional: true
    });
  }
};

/**
 * Build an ordered array of steps based on configuration
 * 
 * @param {CrawlConfig & PageProcessConfig} config - Configuration options
 * @param {Object} handlers - Handler functions for each step type
 * @returns {import('./runPipeline').PipelineStep[]}
 * 
 * @example
 * const steps = buildSteps(
 *   { preferCache: true, extractLinks: true, detectArticles: true },
 *   { 
 *     normalizer: (url) => normalizeUrl(url),
 *     cacheGetter: (url) => cache.get(url),
 *     fetcher: (params) => fetchPipeline.fetch(params),
 *     linkExtractor: (html, url) => extractLinks(html, url)
 *   }
 * );
 * const result = await runPipeline(steps, { url, depth: 0 }, { logger });
 */
function buildSteps(config = {}, handlers = {}) {
  const steps = [];
  
  // Merge with defaults
  const effectiveConfig = {
    enableDb: true,
    preferCache: true,
    validateRobots: true,
    enableTelemetry: true,
    extractLinks: true,
    detectArticles: true,
    saveArticles: true,
    structureOnly: false,
    rateLimitMs: 0,
    ...config
  };

  // === Phase 1: Validation ===
  steps.push(STEP_BUILDERS.validateUrl(effectiveConfig));
  
  const normalizeStep = STEP_BUILDERS.normalizeUrl(effectiveConfig, handlers.normalizer);
  if (normalizeStep) steps.push(normalizeStep);

  // === Phase 2: Policy Checks ===
  const robotsStep = STEP_BUILDERS.checkRobots(effectiveConfig, handlers.robotsChecker);
  if (robotsStep) steps.push(robotsStep);
  
  steps.push(STEP_BUILDERS.checkVisited(effectiveConfig, handlers.visitedChecker));
  steps.push(STEP_BUILDERS.checkPolicy(effectiveConfig, handlers.policyChecker));

  // === Phase 3: Cache ===
  const cacheStep = STEP_BUILDERS.tryCache(effectiveConfig, handlers.cacheGetter);
  if (cacheStep) steps.push(cacheStep);

  // === Phase 4: Network ===
  const rateStep = STEP_BUILDERS.acquireRateToken(effectiveConfig, handlers.rateTokenAcquirer);
  if (rateStep) steps.push(rateStep);
  
  steps.push(STEP_BUILDERS.acquireDomainToken(effectiveConfig, handlers.domainTokenAcquirer));
  steps.push(STEP_BUILDERS.fetch(effectiveConfig, handlers.fetcher));

  // === Phase 5: Processing ===
  steps.push(STEP_BUILDERS.parseHtml(effectiveConfig, handlers.parser));
  
  const linksStep = STEP_BUILDERS.extractLinks(effectiveConfig, handlers.linkExtractor);
  if (linksStep) steps.push(linksStep);
  
  const detectStep = STEP_BUILDERS.detectArticle(effectiveConfig, handlers.articleDetector);
  if (detectStep) steps.push(detectStep);
  
  const saveStep = STEP_BUILDERS.saveArticle(effectiveConfig, handlers.articleSaver);
  if (saveStep) steps.push(saveStep);
  
  steps.push(STEP_BUILDERS.enqueueLinks(effectiveConfig, handlers.enqueuer));

  // === Phase 6: Telemetry ===
  const metricsStep = STEP_BUILDERS.recordMetrics(effectiveConfig);
  if (metricsStep) steps.push(metricsStep);

  return steps.filter(Boolean);
}

/**
 * Get available step builder IDs
 * @returns {string[]}
 */
function getAvailableSteps() {
  return Object.keys(STEP_BUILDERS);
}

/**
 * Create a custom step builder
 * 
 * @param {string} id - Step ID
 * @param {Function} builder - Builder function (config, ...handlers) => PipelineStep|null
 * @returns {void}
 */
function registerStepBuilder(id, builder) {
  STEP_BUILDERS[id] = builder;
}

module.exports = {
  buildSteps,
  getAvailableSteps,
  registerStepBuilder,
  STEP_BUILDERS
};
