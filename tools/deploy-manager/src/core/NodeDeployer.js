'use strict';

/**
 * NodeDeployer - Multi-node code deployment orchestrator
 * 
 * Deploys crawler code to multiple worker nodes using RemoteServer.
 */

const path = require('path');
const RemoteServer = require('./RemoteServer');

class NodeDeployer {
    /**
     * @param {Object} options
     * @param {Object} options.registry - NodeRegistry instance
     * @param {Function} options.logger - Logging function
     */
    constructor(options = {}) {
        this.registry = options.registry;
        this.log = options.logger || console.log;
    }

    /**
     * Deploy code to a single node
     * @param {Object} node - Node configuration from registry
     * @param {string} sourcePath - Local path to deploy
     * @param {Object} options - Deployment options
     */
    async deployToNode(node, sourcePath, options = {}) {
        const server = new RemoteServer({
            host: node.host,
            username: node.username,
            privateKeyPath: node.privateKeyPath,
        });

        const remoteDir = options.remoteDir || node.remoteDir;

        this.log(`[NodeDeployer] Deploying to ${node.id} (${node.host})...`);

        try {
            await server.connect();
            const result = await server.deploy(sourcePath, remoteDir);
            this.log(`[NodeDeployer] ${node.id}: ${result}`);

            // Optionally restart worker
            if (options.restart !== false) {
                await this.restartWorker(node, remoteDir);
            }

            return { success: true, node: node.id, message: result };
        } catch (err) {
            this.log(`[NodeDeployer] ${node.id} FAILED: ${err.message}`);
            return { success: false, node: node.id, error: err.message };
        } finally {
            server.disconnect();
        }
    }

    /**
     * Deploy to all enabled nodes
     * @param {string} sourcePath - Local path to deploy
     * @param {Object} options - Deployment options
     */
    async deployToAll(sourcePath, options = {}) {
        const nodes = this.registry.listEnabledNodes();

        if (nodes.length === 0) {
            this.log('[NodeDeployer] No enabled nodes in registry');
            return { success: false, results: [], message: 'No nodes available' };
        }

        this.log(`[NodeDeployer] Deploying to ${nodes.length} nodes...`);

        const results = [];
        const parallel = options.parallel !== false;

        if (parallel) {
            // Deploy in parallel
            const promises = nodes.map(node => this.deployToNode(node, sourcePath, options));
            results.push(...await Promise.all(promises));
        } else {
            // Deploy sequentially
            for (const node of nodes) {
                const result = await this.deployToNode(node, sourcePath, options);
                results.push(result);
            }
        }

        const succeeded = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        this.log(`[NodeDeployer] Complete: ${succeeded} succeeded, ${failed} failed`);

        return {
            success: failed === 0,
            succeeded,
            failed,
            results,
        };
    }

    /**
     * Restart worker process on a node
     * @param {Object} node - Node configuration
     * @param {string} remoteDir - Remote working directory
     */
    async restartWorker(node, remoteDir) {
        const server = new RemoteServer({
            host: node.host,
            username: node.username,
            privateKeyPath: node.privateKeyPath,
        });

        try {
            await server.connect();

            // Kill existing worker and restart
            const startScript = `
        cd ${remoteDir} && \
        pkill -f server.js || true && \
        export NVM_DIR="$HOME/.nvm" && \
        [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && \
        nvm use 20 2>/dev/null || true && \
        nohup node server.js > out.log 2>&1 < /dev/null &
      `;

            const result = await server.exec(startScript);
            this.log(`[NodeDeployer] ${node.id}: Worker restarted`);

            return { success: true, ...result };
        } catch (err) {
            this.log(`[NodeDeployer] ${node.id}: Restart failed - ${err.message}`);
            return { success: false, error: err.message };
        } finally {
            server.disconnect();
        }
    }

    /**
     * Check health of all nodes
     */
    async checkAllHealth() {
        const nodes = this.registry.listEnabledNodes();
        const results = [];

        for (const node of nodes) {
            try {
                const http = require('http');
                const url = new URL('/api/speed', node.workerUrl);

                const healthy = await new Promise((resolve) => {
                    const req = http.get({
                        hostname: url.hostname,
                        port: url.port || 80,
                        path: url.pathname,
                        timeout: 5000,
                    }, (res) => {
                        resolve(res.statusCode === 200);
                    });

                    req.on('error', () => resolve(false));
                    req.on('timeout', () => {
                        req.destroy();
                        resolve(false);
                    });
                });

                this.registry.updateHealth(node.id, healthy);
                results.push({ node: node.id, host: node.host, healthy });

            } catch (err) {
                this.registry.updateHealth(node.id, false, { error: err.message });
                results.push({ node: node.id, host: node.host, healthy: false, error: err.message });
            }
        }

        return results;
    }

    /**
     * Get worker status via SSH
     */
    async getWorkerStatus(node) {
        const server = new RemoteServer({
            host: node.host,
            username: node.username,
            privateKeyPath: node.privateKeyPath,
        });

        try {
            await server.connect();
            const result = await server.exec('pgrep -a -f server.js || echo "Not running"');
            return {
                node: node.id,
                running: !result.stdout.includes('Not running'),
                output: result.stdout.trim(),
            };
        } catch (err) {
            return { node: node.id, running: false, error: err.message };
        } finally {
            server.disconnect();
        }
    }
}

module.exports = NodeDeployer;
