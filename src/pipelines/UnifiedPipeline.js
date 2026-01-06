'use strict';

/**
 * UnifiedPipeline - High-level facade for crawl→analysis→disambiguation workflows
 * 
 * Provides a simplified API over PipelineOrchestrator for common use cases.
 * 
 * @example
 * const { UnifiedPipeline } = require('./UnifiedPipeline');
 * 
 * // Simple usage
 * const result = await UnifiedPipeline.crawlAndAnalyze({
 *   url: 'https://bbc.com',
 *   maxPages: 100
 * });
 * 
 * // With progress tracking
 * const pipeline = new UnifiedPipeline({ url: 'https://bbc.com', maxPages: 100 });
 * pipeline.on('progress', (p) => console.log(p));
 * await pipeline.run();
 * 
 * @module pipelines/UnifiedPipeline
 */

const { PipelineOrchestrator, STAGES, STAGE_STATE } = require('./PipelineOrchestrator');

/**
 * Simplified pipeline facade for common workflows
 */
class UnifiedPipeline extends PipelineOrchestrator {
  /**
   * @param {Object} options - Pipeline options
   * @param {string} options.url - Starting URL (alias for crawlUrl)
   * @param {number} [options.maxPages=100] - Maximum pages to crawl
   * @param {boolean} [options.analyze=true] - Run analysis after crawl
   * @param {boolean} [options.disambiguate=false] - Run disambiguation
   * @param {string} [options.operation='siteExplorer'] - Crawl operation
   */
  constructor(options = {}) {
    // Normalize options
    const normalized = {
      crawlUrl: options.url || options.crawlUrl,
      crawlOperation: options.operation || options.crawlOperation || 'siteExplorer',
      maxPages: options.maxPages || 100,
      maxDepth: options.maxDepth || 3,
      analyze: options.analyze !== false,
      disambiguate: options.disambiguate || false,
      manageDaemon: options.manageDaemon !== false,
      stopOnError: options.stopOnError !== false,
      ...options
    };
    
    super(normalized);
  }
  
  /**
   * Static factory: Crawl and analyze in one call
   * @param {Object} options - Pipeline options
   * @returns {Promise<Object>} Pipeline results
   */
  static async crawlAndAnalyze(options) {
    const pipeline = new UnifiedPipeline({
      ...options,
      analyze: true,
      disambiguate: false
    });
    
    return pipeline.run();
  }
  
  /**
   * Static factory: Full pipeline with disambiguation
   * @param {Object} options - Pipeline options
   * @returns {Promise<Object>} Pipeline results
   */
  static async full(options) {
    const pipeline = new UnifiedPipeline({
      ...options,
      analyze: true,
      disambiguate: true
    });
    
    return pipeline.run();
  }
  
  /**
   * Static factory: Analysis only (skip crawl)
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Analysis results
   */
  static async analyzeOnly(options) {
    const pipeline = new UnifiedPipeline({
      ...options,
      skipStages: ['crawl'],
      analyze: true
    });
    
    return pipeline.run();
  }
  
  /**
   * Get a human-readable status string
   * @returns {string} Current status
   */
  getStatusString() {
    const progress = this.getProgress();
    
    if (!progress.isRunning) {
      return 'Not running';
    }
    
    const stage = progress.currentStage;
    const idx = progress.stageIndex + 1;
    const total = progress.totalStages;
    
    return `Stage ${idx}/${total}: ${stage}`;
  }
}

module.exports = { UnifiedPipeline, STAGES, STAGE_STATE };
