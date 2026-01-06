'use strict';

/**
 * Pipeline Module Exports
 * 
 * Provides unified workflow orchestration for crawl→analysis→disambiguation pipelines.
 * 
 * @example
 * const { UnifiedPipeline, PipelineOrchestrator, STAGES } = require('./src/pipelines');
 * 
 * // Simple usage
 * const result = await UnifiedPipeline.crawlAndAnalyze({
 *   url: 'https://bbc.com',
 *   maxPages: 100
 * });
 * 
 * // Advanced usage with events
 * const pipeline = new PipelineOrchestrator({
 *   crawlUrl: 'https://bbc.com',
 *   maxPages: 100,
 *   analyze: true,
 *   disambiguate: true
 * });
 * 
 * pipeline.on('stage:start', ({ stage }) => console.log(`Starting: ${stage}`));
 * pipeline.on('progress', (p) => console.log(p));
 * pipeline.on('stage:complete', ({ stage, result }) => console.log(`Done: ${stage}`, result));
 * 
 * await pipeline.run();
 * 
 * @module pipelines
 */

const { PipelineOrchestrator, STAGES, STAGE_STATE, DEFAULT_CONFIG } = require('./PipelineOrchestrator');
const { UnifiedPipeline } = require('./UnifiedPipeline');

module.exports = {
  // Main classes
  PipelineOrchestrator,
  UnifiedPipeline,
  
  // Constants
  STAGES,
  STAGE_STATE,
  DEFAULT_CONFIG
};
