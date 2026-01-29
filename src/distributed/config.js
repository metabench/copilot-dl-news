'use strict';

/**
 * Distributed Crawl Configuration
 * 
 * Centralized configuration for distributed crawling.
 * Distributed mode is ENABLED BY DEFAULT when workers are available.
 */

const config = {
    // Master enable/disable switch (default: true)
    enabled: process.env.DISTRIBUTED_CRAWL !== 'false',

    // Default worker URL (fallback if no registry nodes available)
    defaultWorkerUrl: process.env.WORKER_URL || 'http://144.21.35.104:3120',

    // Batch processing settings
    batchSize: parseInt(process.env.DISTRIBUTED_BATCH_SIZE, 10) || 50,
    concurrency: parseInt(process.env.DISTRIBUTED_CONCURRENCY, 10) || 20,

    // Request timeouts
    timeoutMs: parseInt(process.env.DISTRIBUTED_TIMEOUT_MS, 10) || 30000,
    healthCheckIntervalMs: parseInt(process.env.DISTRIBUTED_HEALTH_CHECK_MS, 10) || 30000,

    // Fallback behavior
    fallbackToLocal: process.env.DISTRIBUTED_FALLBACK !== 'false',

    // Compression
    compress: process.env.DISTRIBUTED_COMPRESS !== 'false',

    // Logging
    verbose: process.env.DISTRIBUTED_VERBOSE === 'true',
};

/**
 * Check if distributed crawling should be used
 * @param {Object} options - Override options
 * @returns {boolean}
 */
function isDistributedEnabled(options = {}) {
    if (options.distributed !== undefined) {
        return !!options.distributed;
    }
    return config.enabled;
}

/**
 * Get resolved configuration with overrides
 * @param {Object} overrides - Override values
 * @returns {Object}
 */
function getConfig(overrides = {}) {
    return {
        ...config,
        ...overrides,
    };
}

/**
 * Parse boolean from string or value
 */
function parseBoolean(value, defaultValue = false) {
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        return value.toLowerCase() === 'true' || value === '1';
    }
    return !!value;
}

module.exports = {
    config,
    isDistributedEnabled,
    getConfig,
    parseBoolean,
};
