'use strict';

/**
 * NodeRegistry - Central registry for distributed worker nodes
 * 
 * Manages worker nodes with persistence, health tracking, and discovery.
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', '..', '..', '..', 'config', 'distributed-nodes.json');

class NodeRegistry extends EventEmitter {
    /**
     * @param {Object} options
     * @param {string} options.configPath - Path to persist node configuration
     */
    constructor(options = {}) {
        super();
        this.configPath = options.configPath || DEFAULT_CONFIG_PATH;
        this.nodes = new Map();
        this._healthCache = new Map();
        this._loaded = false;
    }

    /**
     * Load nodes from persistent storage
     */
    load() {
        if (this._loaded) return;

        try {
            if (fs.existsSync(this.configPath)) {
                const data = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                if (Array.isArray(data.nodes)) {
                    data.nodes.forEach(node => {
                        this.nodes.set(node.id, node);
                    });
                }
            }
        } catch (err) {
            console.warn(`[NodeRegistry] Failed to load config: ${err.message}`);
        }

        this._loaded = true;
    }

    /**
     * Save nodes to persistent storage
     */
    save() {
        try {
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const data = {
                version: 1,
                updatedAt: new Date().toISOString(),
                nodes: Array.from(this.nodes.values()),
            };

            fs.writeFileSync(this.configPath, JSON.stringify(data, null, 2));
        } catch (err) {
            console.error(`[NodeRegistry] Failed to save config: ${err.message}`);
        }
    }

    /**
     * Add a worker node
     * @param {Object} config
     * @param {string} config.id - Unique identifier (e.g., 'oci-worker-1')
     * @param {string} config.host - Host address (IP or hostname)
     * @param {number} config.port - Worker API port (default: 3120)
     * @param {string} config.username - SSH username
     * @param {string} config.privateKeyPath - Path to SSH private key
     * @param {string} config.remoteDir - Remote working directory
     * @param {Object} config.metadata - Additional metadata
     */
    addNode(config) {
        this.load();

        const node = {
            id: config.id || `node-${Date.now()}`,
            host: config.host,
            port: config.port || 3120,
            username: config.username || 'ubuntu',
            privateKeyPath: config.privateKeyPath,
            remoteDir: config.remoteDir || '~/crawler-worker',
            workerUrl: config.workerUrl || `http://${config.host}:${config.port || 3120}`,
            metadata: config.metadata || {},
            addedAt: new Date().toISOString(),
            enabled: config.enabled !== false,
        };

        this.nodes.set(node.id, node);
        this.save();
        this.emit('node:added', node);

        return node;
    }

    /**
     * Remove a node by ID
     */
    removeNode(id) {
        this.load();

        const node = this.nodes.get(id);
        if (node) {
            this.nodes.delete(id);
            this._healthCache.delete(id);
            this.save();
            this.emit('node:removed', node);
            return true;
        }
        return false;
    }

    /**
     * Get a node by ID
     */
    getNode(id) {
        this.load();
        return this.nodes.get(id);
    }

    /**
     * Get node by worker URL
     */
    getNodeByUrl(url) {
        this.load();
        for (const node of this.nodes.values()) {
            if (node.workerUrl === url) {
                return node;
            }
        }
        return null;
    }

    /**
     * List all nodes
     */
    listNodes() {
        this.load();
        return Array.from(this.nodes.values());
    }

    /**
     * List enabled nodes
     */
    listEnabledNodes() {
        return this.listNodes().filter(n => n.enabled);
    }

    /**
     * Update node health status
     */
    updateHealth(id, healthy, details = {}) {
        this._healthCache.set(id, {
            healthy,
            checkedAt: Date.now(),
            ...details,
        });
        this.emit('health:updated', { id, healthy, ...details });
    }

    /**
     * Get cached health status
     */
    getHealth(id) {
        return this._healthCache.get(id) || { healthy: null, checkedAt: 0 };
    }

    /**
     * Get nodes that were recently healthy
     */
    getHealthyNodes(maxAgeMs = 60000) {
        const now = Date.now();
        return this.listEnabledNodes().filter(node => {
            const health = this._healthCache.get(node.id);
            return health && health.healthy && (now - health.checkedAt) < maxAgeMs;
        });
    }

    /**
     * Get worker URLs for all enabled nodes
     */
    getWorkerUrls() {
        return this.listEnabledNodes().map(n => n.workerUrl);
    }
}

// Singleton instance
let defaultRegistry = null;

function getNodeRegistry(options = {}) {
    if (!defaultRegistry) {
        defaultRegistry = new NodeRegistry(options);
    }
    return defaultRegistry;
}

function createNodeRegistry(options = {}) {
    return new NodeRegistry(options);
}

module.exports = {
    NodeRegistry,
    getNodeRegistry,
    createNodeRegistry,
};
