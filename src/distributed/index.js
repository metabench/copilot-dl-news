'use strict';

/**
 * Distributed Module Index
 * 
 * Exports all distributed crawl components.
 */

const { NodeRegistry, getNodeRegistry, createNodeRegistry } = require('./NodeRegistry');
const { config, isDistributedEnabled, getConfig, parseBoolean } = require('./config');

module.exports = {
    // Node Registry
    NodeRegistry,
    getNodeRegistry,
    createNodeRegistry,

    // Configuration
    config,
    isDistributedEnabled,
    getConfig,
    parseBoolean,
};
