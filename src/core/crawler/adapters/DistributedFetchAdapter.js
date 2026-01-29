/**
 * DistributedFetchAdapter - Low-level HTTP fetch adapter using remote worker
 * 
 * This adapter provides a drop-in replacement for fetch() that routes requests
 * through the distributed worker for parallel execution. It batches requests
 * automatically and handles compression.
 * 
 * Usage:
 *   const adapter = new DistributedFetchAdapter({ workerUrl: 'http://...' });
 *   const response = await adapter.fetch(url, options);
 *   
 *   // Or batch multiple requests
 *   const results = await adapter.fetchBatch(urls, options);
 */

'use strict';

const http = require('http');
const zlib = require('zlib');
const EventEmitter = require('events');

const DEFAULT_WORKER_URL = 'http://144.21.42.149:8081';

class DistributedFetchAdapter extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.workerUrl - Remote worker URL
   * @param {number} options.batchSize - URLs per batch (default: 50)
   * @param {number} options.maxConcurrency - Worker concurrency (default: 20)
   * @param {number} options.timeoutMs - Request timeout (default: 30000)
   * @param {boolean} options.compress - Enable gzip compression (default: true)
   * @param {number} options.batchDelayMs - Delay before sending batch (default: 50)
   * @param {boolean} options.enabled - Enable distributed mode (default: true)
   * @param {Function} options.localFetch - Fallback fetch function
   */
  constructor(options = {}) {
    super();
    this.workerUrl = options.workerUrl || DEFAULT_WORKER_URL;
    this.batchSize = options.batchSize || 50;
    this.maxConcurrency = options.maxConcurrency || 20;
    this.timeoutMs = options.timeoutMs || 30000;
    this.compress = options.compress !== false;
    this.batchDelayMs = options.batchDelayMs || 50;
    this.enabled = options.enabled !== false;
    this.localFetch = options.localFetch || globalThis.fetch;
    
    // Pending requests waiting to be batched
    this._pendingRequests = [];
    this._batchTimer = null;
    
    // Stats
    this.stats = {
      requestsSent: 0,
      requestsOk: 0,
      requestsError: 0,
      bytesTransferred: 0,
      batchesSent: 0,
      localFallbacks: 0,
    };
    
    // Health tracking
    this._healthy = null; // null = unknown, true = healthy, false = unhealthy
    this._lastHealthCheck = 0;
    this._healthCheckInterval = 30000; // 30 seconds

    // Worker capability/version metadata (optional, via GET /meta)
    this._workerMeta = null;
    this._workerApiVersion = null;
    this._workerCapabilities = null;
  }

  /**
   * Fetch worker metadata via GET /meta (if supported).
   * Older workers may not implement this endpoint.
   */
  async getWorkerMeta({ force = false } = {}) {
    const now = Date.now();
    if (!force && this._workerMeta && (now - this._lastHealthCheck) < this._healthCheckInterval) {
      return this._workerMeta;
    }

    try {
      const meta = await this._rawGetJson('/meta', 5000);
      if (meta && typeof meta === 'object') {
        this._workerMeta = meta;
        this._workerApiVersion = typeof meta.apiVersion === 'string' ? meta.apiVersion : null;
        this._workerCapabilities = meta.capabilities && typeof meta.capabilities === 'object' ? meta.capabilities : null;
        return meta;
      }
    } catch {
      // Older worker or transient failure; ignore.
    }
    return null;
  }

  /**
   * Check if worker is healthy
   */
  async checkHealth() {
    const now = Date.now();
    if (this._healthy !== null && now - this._lastHealthCheck < this._healthCheckInterval) {
      return this._healthy;
    }

    try {
      // Prefer structured metadata endpoint when available.
      await this.getWorkerMeta({ force: true });

      const resp = await this._rawRequest('/batch', {
        requests: [],
        ping: true,
      }, 5000);
      // Worker is healthy if we got any response (even error for empty requests)
      // The response having summary or even error field means worker is alive
      this._healthy = resp && (resp.summary !== undefined || resp.error !== undefined || resp.ok !== undefined);
      this._lastHealthCheck = now;
      return this._healthy;
    } catch (err) {
      this._healthy = false;
      this._lastHealthCheck = now;
      this.emit('health', { healthy: false, error: err.message });
      return false;
    }
  }

  /**
   * Single fetch - compatible with fetch() API
   * 
   * @param {string} url - URL to fetch
   * @param {object} options - Fetch options (method, headers, etc.)
   * @returns {Promise<Response>} - Response object
   */
  async fetch(url, options = {}) {
    if (!this.enabled) {
      return this.localFetch(url, options);
    }

    // Check health before routing to worker
    const healthy = await this.checkHealth();
    if (!healthy) {
      this.stats.localFallbacks++;
      return this.localFetch(url, options);
    }

    // For single requests, send immediately without batching
    const result = await this._sendBatch([{
      url,
      method: options.method || 'GET',
      headers: options.headers,
      includeBody: options.includeBody || false,
    }]);

    const r = (result.results || [])[0];
    if (r.error) {
      throw new Error(r.error);
    }

    // Create a Response-like object
    return this._createResponse(r);
  }

  /**
   * Batch fetch - process multiple URLs efficiently
   * 
   * @param {Array<string|object>} requests - URLs or request objects
   * @param {object} options - Shared options for all requests
   * @returns {Promise<Array>} - Array of results
   */
  async fetchBatch(requests, options = {}) {
    if (!this.enabled) {
      // Fall back to local sequential fetch
      return this._localBatchFetch(requests, options);
    }

    const healthy = await this.checkHealth();
    if (!healthy) {
      this.stats.localFallbacks++;
      return this._localBatchFetch(requests, options);
    }

    const normalizedRequests = requests.map(r => {
      if (typeof r === 'string') {
        return { 
          url: r, 
          method: options.method || 'GET',
          includeBody: options.includeBody || false
        };
      }
      return {
        url: r.url,
        method: r.method || options.method || 'GET',
        urlId: r.urlId,
        headers: r.headers || options.headers,
        includeBody: r.includeBody ?? options.includeBody ?? false,
        usePuppeteer: r.usePuppeteer ?? options.usePuppeteer ?? false,
      };
    });

    // Capability gating: if caller needs body but worker can't supply it, fall back locally.
    const meta = await this.getWorkerMeta({ force: false });
    const caps = meta?.capabilities;
    const wantsBody = normalizedRequests.some(r => r.includeBody);
    if (wantsBody && caps && caps.includeBodyBase64 === false) {
      this.stats.localFallbacks++;
      return this._localBatchFetch(normalizedRequests, options);
    }

    // Split into batches if needed
    const results = [];
    for (let i = 0; i < normalizedRequests.length; i += this.batchSize) {
      const batch = normalizedRequests.slice(i, i + this.batchSize);
      const batchResult = await this._sendBatch(batch, options);
      
      // Normalize worker response to include both status and statusCode
      const normalizedResults = (batchResult.results || []).map(r => {
        let body = r.body;
        if (!body && r.bodyBase64) {
          try {
            body = Buffer.from(r.bodyBase64, 'base64').toString('utf8');
          } catch {
            body = '';
          }
        }

        return {
          ...r,
          statusCode: r.statusCode ?? r.status, // support both field names
          status: r.status ?? r.statusCode,
          body,
        };
      });
      results.push(...normalizedResults);
      
      this.emit('batch', {
        batchIndex: Math.floor(i / this.batchSize),
        processed: results.length,
        total: normalizedRequests.length,
        ok: batchResult.summary?.ok || 0,
        errors: batchResult.summary?.errors || 0,
      });
    }

    return results;
  }

  /**
   * Queue a request for batching (for high-throughput scenarios)
   * 
   * @param {string|object} request - URL or request object
   * @returns {Promise} - Resolves when request completes
   */
  queueRequest(request) {
    return new Promise((resolve, reject) => {
      const normalized = typeof request === 'string' 
        ? { url: request, method: 'GET' }
        : request;
      
      this._pendingRequests.push({
        request: normalized,
        resolve,
        reject,
      });

      // Start batch timer if not already running
      if (!this._batchTimer && this._pendingRequests.length < this.batchSize) {
        this._batchTimer = setTimeout(() => this._flushPendingBatch(), this.batchDelayMs);
      }

      // Flush immediately if batch is full
      if (this._pendingRequests.length >= this.batchSize) {
        this._flushPendingBatch();
      }
    });
  }

  /**
   * Flush pending requests as a batch
   */
  async _flushPendingBatch() {
    if (this._batchTimer) {
      clearTimeout(this._batchTimer);
      this._batchTimer = null;
    }

    if (this._pendingRequests.length === 0) return;

    const pending = this._pendingRequests.splice(0, this.batchSize);
    const requests = pending.map(p => p.request);

    try {
      const results = await this._sendBatch(requests);
      
      // Resolve each pending promise with its result
      pending.forEach((p, i) => {
        const result = results.results[i];
        if (result.error) {
          p.reject(new Error(result.error));
        } else {
          p.resolve(result);
        }
      });
    } catch (err) {
      // Reject all pending on batch failure
      pending.forEach(p => p.reject(err));
    }

    // Continue flushing if more pending
    if (this._pendingRequests.length > 0) {
      this._flushPendingBatch();
    }
  }

  /**
   * Send a batch to the worker
   */
  async _sendBatch(requests, options = {}) {
    const caps = this._workerCapabilities;
    const compress = this.compress && (caps ? caps.gzipResponse !== false : true) ? 'gzip' : 'none';

    const payload = {
      requests,
      maxConcurrency: options.maxConcurrency || this.maxConcurrency,
      batchSize: this.batchSize,
      timeoutMs: options.timeoutMs || this.timeoutMs,
      includeBody: options.includeBody || false,
      compress,
    };

    this.stats.batchesSent++;
    this.stats.requestsSent += requests.length;

    const result = await this._rawRequest('/batch', payload);
    
    this.stats.requestsOk += result.summary?.ok || 0;
    this.stats.requestsError += result.summary?.errors || 0;

    return result;
  }

  /**
   * Raw HTTP request to worker
   */
  async _rawRequest(path, payload, timeout = null) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(payload);
      const url = new URL(path, this.workerUrl);
      
      const req = http.request({
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: 'POST',
        timeout: timeout || this.timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          ...(this.compress ? { 'Accept-Encoding': 'gzip' } : {}),
        },
      }, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          try {
            const buffer = Buffer.concat(chunks);
            this.stats.bytesTransferred += buffer.length;
            
            let jsonStr;
            if (res.headers['content-encoding'] === 'gzip') {
              jsonStr = zlib.gunzipSync(buffer).toString('utf8');
            } else {
              jsonStr = buffer.toString('utf8');
            }
            
            resolve(JSON.parse(jsonStr));
          } catch (err) {
            reject(err);
          }
        });
        res.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Worker request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Raw GET JSON request to worker (used for /meta).
   */
  async _rawGetJson(path, timeout = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.workerUrl);

      const req = http.request({
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: 'GET',
        timeout: timeout || this.timeoutMs,
        headers: {
          'Accept': 'application/json',
        },
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const buffer = Buffer.concat(chunks);
            const jsonStr = buffer.toString('utf8');
            const json = JSON.parse(jsonStr);
            resolve(json);
          } catch (err) {
            reject(err);
          }
        });
        res.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Worker request timeout'));
      });

      req.end();
    });
  }

  /**
   * Local fallback batch fetch
   */
  async _localBatchFetch(requests, options = {}) {
    const results = [];
    for (const req of requests) {
      const url = typeof req === 'string' ? req : req.url;
      const method = (typeof req === 'object' ? req.method : null) || options.method || 'GET';
      const includeBody = (typeof req === 'object' && req && req.includeBody !== undefined)
        ? !!req.includeBody
        : !!options.includeBody;
      
      const started = Date.now();
      try {
        const resp = await this.localFetch(url, { method, ...options });
        let body;
        if (includeBody && method.toUpperCase() !== 'HEAD') {
          try {
            body = await resp.text();
          } catch {
            body = '';
          }
        }
        results.push({
          url,
          urlId: req.urlId,
          statusCode: resp.status,
          ok: resp.ok,
          durationMs: Date.now() - started,
          headers: Object.fromEntries(resp.headers.entries()),
          body,
        });
      } catch (err) {
        results.push({
          url,
          urlId: req.urlId,
          error: err.message,
          durationMs: Date.now() - started,
        });
      }
    }
    return results;
  }

  /**
   * Create a Response-like object from worker result
   */
  _createResponse(result) {
    const headers = new Map(Object.entries(result.headers || {}));
    const status = result.statusCode ?? result.status;
    const body = result.body || (result.bodyBase64 ? Buffer.from(result.bodyBase64, 'base64').toString('utf8') : '');
    
    return {
      ok: result.ok,
      status,
      statusText: result.statusText || '',
      url: result.finalUrl || result.url,
      headers: {
        get: (name) => headers.get(name.toLowerCase()),
        has: (name) => headers.has(name.toLowerCase()),
        entries: () => headers.entries(),
      },
      text: async () => body,
      json: async () => JSON.parse(body || '{}'),
      arrayBuffer: async () => Buffer.from(body || ''),
    };
  }

  /**
   * Get current stats
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset stats
   */
  resetStats() {
    this.stats = {
      requestsSent: 0,
      requestsOk: 0,
      requestsError: 0,
      bytesTransferred: 0,
      batchesSent: 0,
      localFallbacks: 0,
    };
  }
}

// Singleton instance for easy access
let defaultAdapter = null;

function getDistributedFetchAdapter(options = {}) {
  if (!defaultAdapter) {
    defaultAdapter = new DistributedFetchAdapter(options);
  }
  return defaultAdapter;
}

function createDistributedFetchAdapter(options = {}) {
  return new DistributedFetchAdapter(options);
}

module.exports = {
  DistributedFetchAdapter,
  getDistributedFetchAdapter,
  createDistributedFetchAdapter,
  DEFAULT_WORKER_URL,
};
