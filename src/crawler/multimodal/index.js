'use strict';

/**
 * Multi-Modal Intelligent Crawl Module
 *
 * This module provides a continuous crawl system that:
 * 1. Downloads pages in batches
 * 2. Analyzes content after each batch
 * 3. Learns patterns from the analysis
 * 4. Re-analyzes affected pages when patterns improve
 * 5. Discovers new hub structures
 *
 * The orchestrator runs indefinitely (or until configured limits),
 * balancing historical backfill with newest article acquisition.
 *
 * @module src/crawler/multimodal
 *
 * @example
 * const { MultiModalCrawlOrchestrator, PatternDeltaTracker, CrawlBalancer } = require('./multimodal');
 * const { CrawlOperations } = require('../CrawlOperations');
 *
 * const db = getDatabase();
 * const crawlOperations = new CrawlOperations(db);
 * const patternTracker = new PatternDeltaTracker({ db });
 * const balancer = new CrawlBalancer({ strategy: 'adaptive' });
 *
 * const orchestrator = new MultiModalCrawlOrchestrator({
 *   db,
 *   crawlOperations,
 *   patternTracker,
 *   balancer,
 *   config: {
 *     batchSize: 1000,
 *     historicalRatio: 0.3,
 *     maxTotalBatches: null // Run indefinitely
 *   }
 * });
 *
 * // Subscribe to events
 * orchestrator.on('phase-change', ({ from, to, batch }) => {
 *   console.log(`Phase: ${from} → ${to} (batch ${batch})`);
 * });
 *
 * orchestrator.on('pattern-learned', ({ batch, patternsLearned, significantPatterns }) => {
 *   console.log(`Learned ${patternsLearned} patterns in batch ${batch}`);
 * });
 *
 * orchestrator.on('hub-discovered', ({ batch, hubsDiscovered, newHubs }) => {
 *   console.log(`Discovered ${hubsDiscovered} new hubs in batch ${batch}`);
 * });
 *
 * // Start crawling
 * const stats = await orchestrator.start('www.theguardian.com');
 * console.log('Final stats:', stats);
 */

const { MultiModalCrawlOrchestrator } = require('./MultiModalCrawlOrchestrator');
const { PatternDeltaTracker } = require('./PatternDeltaTracker');
const { CrawlBalancer } = require('./CrawlBalancer');
const { MultiModalCrawlManager } = require('./MultiModalCrawlManager');
const { resolveMultiModalQueries } = require('./multiModalQueries');

/**
 * Create a configured multi-modal crawl instance
 * @param {Object} options
 * @param {Object} options.db - Database connection
 * @param {Object} options.crawlOperations - CrawlOperations facade
 * @param {Object} [options.config] - Configuration overrides
 * @returns {Object} { orchestrator, patternTracker, balancer }
 */
function normalizeBalancingStrategy(config) {
  if (!config) return 'adaptive';
  return config.balancingStrategy || config.balancerStrategy || 'adaptive';
}

function createMultiModalCrawl({ db, crawlOperations, config = {}, logger = console } = {}) {
  const queries = resolveMultiModalQueries(db);
  const patternTracker = new PatternDeltaTracker({ queries, logger });

  const balancer = new CrawlBalancer({
    strategy: normalizeBalancingStrategy(config),
    baseHistoricalRatio: config.historicalRatio || 0.3,
    queries,
    logger
  });

  const orchestrator = new MultiModalCrawlOrchestrator({
    db,
    crawlOperations,
    patternTracker,
    balancer,
    queries,
    config,
    logger
  });

  return { orchestrator, patternTracker, balancer, queries };
}

module.exports = {
  MultiModalCrawlOrchestrator,
  PatternDeltaTracker,
  CrawlBalancer,
  MultiModalCrawlManager,
  createMultiModalCrawl
};
