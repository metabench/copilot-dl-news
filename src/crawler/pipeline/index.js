/**
 * Pipeline module - Pipeline-over-flags pattern for crawler
 * 
 * This module provides the core infrastructure for replacing scattered flag-based
 * branching with declarative, ordered step arrays. The pattern follows:
 * 
 *   configure → buildSteps → runPipeline → observe → commit
 * 
 * ## Core Concepts
 * 
 * - **Steps**: Individual operations with { id, execute, options }
 * - **Context**: Mutable state passed between steps (url, depth, html, links, etc.)
 * - **Dependencies**: Shared services (logger, metrics, dbAdapter, cache)
 * - **Results**: Each step returns { ok, value? } or { ok: false, err?, reason? }
 * 
 * ## Usage
 * 
 * ```javascript
 * const { buildSteps, runPipeline } = require('./pipeline');
 * 
 * // Build steps from configuration
 * const steps = buildSteps(
 *   { preferCache: true, detectArticles: true },
 *   { 
 *     fetcher: (params) => fetchPipeline.fetch(params),
 *     linkExtractor: extractLinksFromHtml
 *   }
 * );
 * 
 * // Execute pipeline
 * const result = await runPipeline(
 *   steps,
 *   { url: 'https://example.com', depth: 0 },
 *   { logger: console, metrics: metricsCollector }
 * );
 * 
 * if (result.ok) {
 *   console.log(`Processed ${result.context.url} in ${result.durationMs}ms`);
 * } else {
 *   console.error(`Failed at ${result.failedStep}: ${result.reason}`);
 * }
 * ```
 * 
 * ## Step Registry
 * 
 * Available step builders (see buildSteps.js):
 * - validateUrl, normalizeUrl
 * - checkRobots, checkVisited, checkPolicy
 * - tryCache
 * - acquireRateToken, acquireDomainToken, fetch
 * - parseHtml, extractLinks, detectArticle, saveArticle, enqueueLinks
 * - recordMetrics
 * 
 * @module src/crawler/pipeline
 */

const { runPipeline, createStep, composePipelines } = require('./runPipeline');
const { buildSteps, getAvailableSteps, registerStepBuilder, STEP_BUILDERS } = require('./buildSteps');
const {
  buildPageProcessingSteps,
  processPagePipeline,
  createCheckDepthStep,
  createCheckDownloadLimitStep,
  createFetchStep,
  createParseHtmlStep,
  createDetectArticleStep,
  createExtractLinksStep,
  createEnqueueLinksStep,
  createProcessArticleStep,
  createUpdateStateStep,
  createRecordMetricsStep
} = require('./pageProcessingPipeline');

module.exports = {
  // Core execution
  runPipeline,
  createStep,
  composePipelines,
  
  // Step building
  buildSteps,
  getAvailableSteps,
  registerStepBuilder,
  STEP_BUILDERS,
  
  // Page processing pipeline
  buildPageProcessingSteps,
  processPagePipeline,
  createCheckDepthStep,
  createCheckDownloadLimitStep,
  createFetchStep,
  createParseHtmlStep,
  createDetectArticleStep,
  createExtractLinksStep,
  createEnqueueLinksStep,
  createProcessArticleStep,
  createUpdateStateStep,
  createRecordMetricsStep
};
