'use strict';

const { runPipeline, createStep } = require('./runPipeline');

/**
 * @typedef {Object} PageContext
 * @property {string} url - The URL to process
 * @property {number} depth - Current crawl depth
 * @property {Object} [meta] - Additional metadata
 * @property {string} [html] - Page HTML content (populated by fetch step)
 * @property {Object} [fetchResult] - Fetch pipeline result
 * @property {Object} [parseResult] - Parse result with cheerio $
 * @property {Object[]} [links] - Extracted links
 * @property {Object} [articleResult] - Article processing result
 */

/**
 * @typedef {Object} PageDeps
 * @property {Object} fetchPipeline - The fetch pipeline service
 * @property {Object} state - Crawler state
 * @property {Function} getStats - Get current stats
 * @property {Object} [articleProcessor] - Article processor service
 * @property {Object} [navigationDiscoveryService] - Link discovery service
 * @property {Function} [enqueueRequest] - Enqueue new URLs
 * @property {Object} [telemetry] - Telemetry service
 * @property {Function} [looksLikeArticle] - Article detection function
 * @property {number} [maxDepth] - Maximum crawl depth
 */

/**
 * Create a page processing pipeline step that checks depth limits.
 * @param {PageDeps} deps - Dependencies
 * @returns {import('./runPipeline').Step}
 */
function createCheckDepthStep(deps) {
  return createStep('checkDepth', async (ctx) => {
    const maxDepth = deps.maxDepth ?? Infinity;
    if (ctx.depth > maxDepth) {
      return { ok: false, reason: 'depth-exceeded', value: ctx };
    }
    return { ok: true, value: ctx };
  }, { optional: false });
}

/**
 * Create a page processing pipeline step that checks download limits.
 * @param {PageDeps} deps - Dependencies
 * @returns {import('./runPipeline').Step}
 */
function createCheckDownloadLimitStep(deps) {
  return createStep('checkDownloadLimit', async (ctx) => {
    const stats = deps.getStats?.() || {};
    const maxDownloads = deps.maxDownloads;
    if (maxDownloads !== undefined && (stats.pagesDownloaded || 0) >= maxDownloads) {
      return { ok: false, reason: 'download-limit-reached', value: ctx };
    }
    return { ok: true, value: ctx };
  }, { optional: true });
}

/**
 * Create a page processing pipeline step that fetches the page.
 * @param {PageDeps} deps - Dependencies
 * @returns {import('./runPipeline').Step}
 */
function createFetchStep(deps) {
  return createStep('fetch', async (ctx) => {
    if (!deps.fetchPipeline) {
      return { ok: false, reason: 'no-fetch-pipeline', err: new Error('FetchPipeline required') };
    }
    
    try {
      const fetchResult = await deps.fetchPipeline.fetch({
        url: ctx.url,
        context: {
          depth: ctx.depth,
          referrerUrl: ctx.meta?.referrerUrl || null,
          queueType: ctx.meta?.type
        }
      });
      
      if (!fetchResult) {
        return { ok: false, reason: 'fetch-empty', value: ctx };
      }
      
      const { meta = {}, source, html } = fetchResult;
      
      return {
        ok: true,
        value: {
          ...ctx,
          html,
          fetchResult,
          fetchMeta: meta,
          fetchSource: source,
          resolvedUrl: meta.url || ctx.url
        }
      };
    } catch (err) {
      return { ok: false, reason: 'fetch-error', err };
    }
  }, { optional: false });
}

/**
 * Create a page processing pipeline step that parses HTML.
 * @param {PageDeps} deps - Dependencies
 * @returns {import('./runPipeline').Step}
 */
function createParseHtmlStep(deps) {
  const cheerio = require('cheerio');
  
  return createStep('parseHtml', async (ctx) => {
    if (!ctx.html) {
      return { ok: true, value: { ...ctx, $: null } };
    }
    
    try {
      const $ = cheerio.load(ctx.html);
      return { ok: true, value: { ...ctx, $ } };
    } catch (err) {
      // Parsing failure is non-fatal; continue with null $
      return { ok: true, value: { ...ctx, $: null, parseError: err.message } };
    }
  }, { optional: false });
}

/**
 * Create a page processing pipeline step that detects if page is an article.
 * @param {PageDeps} deps - Dependencies
 * @returns {import('./runPipeline').Step}
 */
function createDetectArticleStep(deps) {
  return createStep('detectArticle', async (ctx) => {
    const url = ctx.resolvedUrl || ctx.url;
    
    let isArticle = false;
    if (deps.looksLikeArticle) {
      try {
        isArticle = deps.looksLikeArticle(url);
      } catch (_) {}
    }
    
    return { ok: true, value: { ...ctx, isArticle } };
  }, { optional: true });
}

/**
 * Create a page processing pipeline step that extracts links.
 * @param {PageDeps} deps - Dependencies
 * @returns {import('./runPipeline').Step}
 */
function createExtractLinksStep(deps) {
  return createStep('extractLinks', async (ctx) => {
    if (!deps.navigationDiscoveryService || !ctx.$) {
      return { ok: true, value: { ...ctx, links: [] } };
    }
    
    try {
      const links = deps.navigationDiscoveryService.discover({
        $: ctx.$,
        baseUrl: ctx.resolvedUrl || ctx.url,
        depth: ctx.depth
      });
      return { ok: true, value: { ...ctx, links: links || [] } };
    } catch (err) {
      return { ok: true, value: { ...ctx, links: [], linkExtractionError: err.message } };
    }
  }, { optional: true });
}

/**
 * Create a page processing pipeline step that enqueues discovered links.
 * @param {PageDeps} deps - Dependencies
 * @returns {import('./runPipeline').Step}
 */
function createEnqueueLinksStep(deps) {
  return createStep('enqueueLinks', async (ctx) => {
    if (!deps.enqueueRequest || !Array.isArray(ctx.links)) {
      return { ok: true, value: ctx };
    }
    
    let enqueued = 0;
    for (const link of ctx.links) {
      try {
        deps.enqueueRequest({
          url: link.url || link.href,
          depth: ctx.depth + 1,
          type: link.type || 'nav',
          meta: link.meta || null
        });
        enqueued++;
      } catch (_) {}
    }
    
    return { ok: true, value: { ...ctx, linksEnqueued: enqueued } };
  }, { optional: true });
}

/**
 * Create a page processing pipeline step that processes articles.
 * @param {PageDeps} deps - Dependencies
 * @returns {import('./runPipeline').Step}
 */
function createProcessArticleStep(deps) {
  return createStep('processArticle', async (ctx) => {
    if (!ctx.isArticle || !deps.articleProcessor) {
      return { ok: true, value: ctx };
    }
    
    try {
      const result = await deps.articleProcessor.process({
        url: ctx.resolvedUrl || ctx.url,
        html: ctx.html,
        $: ctx.$,
        depth: ctx.depth
      });
      return { ok: true, value: { ...ctx, articleResult: result } };
    } catch (err) {
      return { ok: true, value: { ...ctx, articleError: err.message } };
    }
  }, { optional: true });
}

/**
 * Create a page processing pipeline step that updates state.
 * @param {PageDeps} deps - Dependencies
 * @returns {import('./runPipeline').Step}
 */
function createUpdateStateStep(deps) {
  return createStep('updateState', async (ctx) => {
    const url = ctx.resolvedUrl || ctx.url;
    
    try {
      if (deps.state) {
        deps.state.addVisited(url);
        deps.state.incrementPagesVisited();
        if (ctx.isArticle) {
          deps.state.incrementArticlesFound();
        }
      }
    } catch (_) {}
    
    return { ok: true, value: ctx };
  }, { optional: false });
}

/**
 * Create a page processing pipeline step that records metrics.
 * @param {PageDeps} deps - Dependencies
 * @returns {import('./runPipeline').Step}
 */
function createRecordMetricsStep(deps) {
  return createStep('recordMetrics', async (ctx) => {
    if (!deps.telemetry) {
      return { ok: true, value: ctx };
    }
    
    try {
      deps.telemetry.pageProcessed?.({
        url: ctx.resolvedUrl || ctx.url,
        depth: ctx.depth,
        source: ctx.fetchSource,
        isArticle: ctx.isArticle,
        linksFound: ctx.links?.length || 0,
        linksEnqueued: ctx.linksEnqueued || 0
      });
    } catch (_) {}
    
    return { ok: true, value: ctx };
  }, { optional: true });
}

/**
 * Build the default page processing pipeline steps.
 * @param {PageDeps} deps - Dependencies
 * @returns {import('./runPipeline').Step[]}
 */
function buildPageProcessingSteps(deps) {
  return [
    createCheckDepthStep(deps),
    createCheckDownloadLimitStep(deps),
    createFetchStep(deps),
    createParseHtmlStep(deps),
    createDetectArticleStep(deps),
    createExtractLinksStep(deps),
    createEnqueueLinksStep(deps),
    createProcessArticleStep(deps),
    createUpdateStateStep(deps),
    createRecordMetricsStep(deps)
  ];
}

/**
 * Process a page using the pipeline pattern.
 * This is a drop-in replacement for processPage that uses runPipeline.
 * 
 * @param {Object} params - Processing parameters
 * @param {string} params.url - URL to process
 * @param {number} [params.depth=0] - Current depth
 * @param {Object} [params.context={}] - Additional context
 * @param {PageDeps} deps - Dependencies
 * @param {Object} [options] - Pipeline options
 * @returns {Promise<Object>} Pipeline result
 */
async function processPagePipeline({ url, depth = 0, context = {} }, deps, options = {}) {
  const steps = buildPageProcessingSteps(deps);
  
  const initialCtx = {
    url,
    depth,
    meta: context,
    startedAt: Date.now()
  };
  
  const result = await runPipeline(steps, initialCtx, deps, {
    timeoutMs: options.timeoutMs,
    onStepComplete: options.onStepComplete
  });
  
  // Transform pipeline result to match existing processPage return format
  if (!result.ok) {
    // Extract reason from last step result or use abortedAt step ID
    const lastStepResult = result.stepResults?.[result.stepResults.length - 1];
    const reason = lastStepResult?.result?.reason || lastStepResult?.error || result.abortedAt || 'unknown';
    const stepId = result.abortedAt || 'unknown';
    
    return {
      status: reason === 'depth-exceeded' ? 'skipped' :
              reason === 'download-limit-reached' ? 'skipped' :
              'failed',
      reason,
      stepId,
      retriable: stepId === 'fetch' || reason.includes('fetch')
    };
  }
  
  const ctx = result.ctx;
  return {
    status: ctx.fetchSource === 'cache' ? 'cache' : 'ok',
    url: ctx.resolvedUrl || ctx.url,
    isArticle: ctx.isArticle || false,
    linksFound: ctx.links?.length || 0,
    linksEnqueued: ctx.linksEnqueued || 0,
    durationMs: Date.now() - ctx.startedAt
  };
}

module.exports = {
  // Step builders
  createCheckDepthStep,
  createCheckDownloadLimitStep,
  createFetchStep,
  createParseHtmlStep,
  createDetectArticleStep,
  createExtractLinksStep,
  createEnqueueLinksStep,
  createProcessArticleStep,
  createUpdateStateStep,
  createRecordMetricsStep,
  
  // Full pipeline
  buildPageProcessingSteps,
  processPagePipeline
};
