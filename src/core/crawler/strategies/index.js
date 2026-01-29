'use strict';

/**
 * Strategy selection and adaptation for crawl discovery
 * 
 * This module provides adaptive strategy selection that dynamically
 * chooses between different URL discovery methods based on real-time
 * effectiveness measurements.
 */

const { DiscoveryStrategySelector, STRATEGIES, STRATEGY_PRIORITIES } = require('./DiscoveryStrategySelector');
const { AdaptiveDiscoveryService } = require('./AdaptiveDiscoveryService');

module.exports = {
  DiscoveryStrategySelector,
  AdaptiveDiscoveryService,
  STRATEGIES,
  STRATEGY_PRIORITIES
};
