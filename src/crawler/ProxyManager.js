'use strict';

/**
 * ProxyManager — Manages proxy rotation for crawler requests
 * 
 * Features:
 * - Round-robin and priority-based proxy selection
 * - Automatic failover on blocked/banned responses
 * - Temporary banning of failing proxies
 * - Health check support
 * - Telemetry tracking
 * 
 * @module ProxyManager
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// Lazy-load proxy agent to avoid requiring when proxies are disabled
let HttpsProxyAgent = null;
function getHttpsProxyAgent() {
  if (!HttpsProxyAgent) {
    try {
      HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent;
    } catch {
      // Package not installed, proxies won't work
      HttpsProxyAgent = null;
    }
  }
  return HttpsProxyAgent;
}

const DEFAULT_CONFIG_PATH = path.join(__dirname, '../../config/proxies.json');

const DEFAULT_CONFIG = {
  enabled: false,
  providers: [],
  strategy: 'round-robin',
  failover: {
    enabled: true,
    banThresholdFailures: 3,
    banDurationMs: 300000,
    triggerOnStatusCodes: [403, 429, 503]
  }
};

/**
 * @typedef {Object} ProxyProvider
 * @property {string} name - Unique provider name
 * @property {'http'|'https'|'socks4'|'socks5'} type - Proxy type
 * @property {string} host - Proxy host
 * @property {number} port - Proxy port
 * @property {Object} [auth] - Authentication credentials
 * @property {string} [auth.username] - Username
 * @property {string} [auth.password] - Password
 * @property {boolean} [enabled=true] - Whether provider is enabled
 * @property {number} [priority=1] - Selection priority (lower = higher priority)
 * @property {string[]} [tags] - Tags for filtering
 */

/**
 * @typedef {Object} ProxyStats
 * @property {string} name - Provider name
 * @property {number} successes - Successful requests
 * @property {number} failures - Failed requests
 * @property {boolean} banned - Currently banned
 * @property {number|null} bannedUntil - Ban expiry timestamp
 * @property {number} consecutiveFailures - Consecutive failures
 */

class ProxyManager extends EventEmitter {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.configPath] - Path to proxy config file
   * @param {Object} [opts.config] - Direct config object (overrides file)
   * @param {Object} [opts.logger] - Logger instance
   */
  constructor(opts = {}) {
    super();
    this.configPath = opts.configPath || DEFAULT_CONFIG_PATH;
    this.logger = opts.logger || console;
    
    /** @type {Object} */
    this._config = { ...DEFAULT_CONFIG };
    
    /** @type {Map<string, ProxyProvider>} */
    this._providers = new Map();
    
    /** @type {Map<string, ProxyStats>} */
    this._stats = new Map();
    
    /** @type {number} */
    this._roundRobinIndex = 0;
    
    /** @type {boolean} */
    this._loaded = false;
    
    // Telemetry
    this._telemetry = {
      totalRequests: 0,
      proxyRequests: 0,
      directRequests: 0,
      bansApplied: 0,
      bansExpired: 0,
      failovers: 0
    };
    
    // Load from direct config if provided
    if (opts.config) {
      this._loadFromObject(opts.config);
    }
  }

  /**
   * Load configuration from file
   * @returns {boolean} Success
   */
  load() {
    try {
      if (!fs.existsSync(this.configPath)) {
        this.logger.info(`[ProxyManager] No config at ${this.configPath}, proxies disabled`);
        this._loaded = true;
        return true;
      }
      
      const data = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      this._loadFromObject(data);
      return true;
    } catch (err) {
      this.logger.error(`[ProxyManager] Failed to load config: ${err.message}`);
      this._loaded = true;
      return false;
    }
  }

  /**
   * Load configuration from object
   * @private
   */
  _loadFromObject(data) {
    this._config = { ...DEFAULT_CONFIG, ...data };
    
    this._providers.clear();
    this._stats.clear();
    
    if (data.providers && Array.isArray(data.providers)) {
      for (const provider of data.providers) {
        if (!provider.name || !provider.host || !provider.port) continue;
        
        this._providers.set(provider.name, {
          ...provider,
          enabled: provider.enabled !== false,
          priority: provider.priority || 1,
          type: provider.type || 'http'
        });
        
        this._stats.set(provider.name, {
          name: provider.name,
          successes: 0,
          failures: 0,
          banned: false,
          bannedUntil: null,
          consecutiveFailures: 0,
          lastUsed: null
        });
      }
    }
    
    this._loaded = true;
    const enabledCount = Array.from(this._providers.values()).filter(p => p.enabled).length;
    this.logger.info(`[ProxyManager] Loaded ${enabledCount} enabled proxies (${this._config.strategy} strategy)`);
  }

  /**
   * Check if proxies are enabled
   * @returns {boolean}
   */
  isEnabled() {
    if (!this._loaded) this.load();
    return this._config.enabled && this._providers.size > 0;
  }

  /**
   * Get a proxy for a request
   * 
   * @param {string} [host] - Target host (for domain-specific rules)
   * @param {Object} [opts] - Selection options
   * @param {string[]} [opts.excludeNames] - Proxy names to exclude
   * @param {string[]} [opts.requireTags] - Required tags
   * @returns {{url: string, name: string, type: string}|null} Proxy info or null for direct
   */
  getProxy(host = null, opts = {}) {
    if (!this._loaded) this.load();
    if (!this._config.enabled) return null;
    
    this._telemetry.totalRequests++;
    
    // Get available proxies (enabled, not banned, not excluded)
    const available = this._getAvailableProxies(opts);
    
    if (available.length === 0) {
      this._telemetry.directRequests++;
      return null;
    }
    
    // Select based on strategy
    let selected;
    switch (this._config.strategy) {
      case 'priority':
        selected = this._selectByPriority(available);
        break;
      case 'least-used':
        selected = this._selectLeastUsed(available);
        break;
      case 'random':
        selected = available[Math.floor(Math.random() * available.length)];
        break;
      case 'round-robin':
      default:
        selected = this._selectRoundRobin(available);
    }
    
    if (!selected) {
      this._telemetry.directRequests++;
      return null;
    }
    
    // Update stats
    const stats = this._stats.get(selected.name);
    if (stats) {
      stats.lastUsed = Date.now();
    }
    
    this._telemetry.proxyRequests++;
    
    return {
      url: this._buildProxyUrl(selected),
      name: selected.name,
      type: selected.type
    };
  }

  /**
   * Get an HttpsProxyAgent for the next available proxy
   * 
   * This creates an actual agent instance that can be passed to fetch/http requests.
   * Uses the same selection logic as getProxy() but returns a ready-to-use agent.
   * 
   * @param {string} [host] - Target host (for domain-specific rules)
   * @param {Object} [opts] - Selection options
   * @param {string[]} [opts.excludeNames] - Proxy names to exclude
   * @param {string[]} [opts.requireTags] - Required tags
   * @returns {{agent: Object, proxyInfo: {url: string, name: string, type: string}}|null}
   */
  getAgent(host = null, opts = {}) {
    const proxyInfo = this.getProxy(host, opts);
    if (!proxyInfo) return null;
    
    const ProxyAgentClass = getHttpsProxyAgent();
    if (!ProxyAgentClass) {
      this.logger.warn('[ProxyManager] https-proxy-agent not available, falling back to direct connection');
      return null;
    }
    
    try {
      const agent = new ProxyAgentClass(proxyInfo.url);
      return {
        agent,
        proxyInfo
      };
    } catch (err) {
      this.logger.error(`[ProxyManager] Failed to create proxy agent: ${err.message}`);
      this.recordFailure(proxyInfo.name, { code: 'AGENT_CREATE_FAILED' });
      return null;
    }
  }

  /**
   * Get available (non-banned, enabled) proxies
   * @private
   */
  _getAvailableProxies(opts = {}) {
    const now = Date.now();
    const available = [];
    
    for (const [name, provider] of this._providers) {
      if (!provider.enabled) continue;
      
      // Check exclusions
      if (opts.excludeNames?.includes(name)) continue;
      
      // Check required tags
      if (opts.requireTags?.length) {
        const hasTags = opts.requireTags.every(tag => provider.tags?.includes(tag));
        if (!hasTags) continue;
      }
      
      // Check ban status
      const stats = this._stats.get(name);
      if (stats?.banned) {
        if (stats.bannedUntil && now > stats.bannedUntil) {
          // Ban expired
          stats.banned = false;
          stats.bannedUntil = null;
          stats.consecutiveFailures = 0;
          this._telemetry.bansExpired++;
          this.emit('proxy:unban', { name });
        } else {
          continue; // Still banned
        }
      }
      
      available.push(provider);
    }
    
    return available;
  }

  /**
   * Select proxy using round-robin
   * @private
   */
  _selectRoundRobin(available) {
    if (available.length === 0) return null;
    this._roundRobinIndex = (this._roundRobinIndex + 1) % available.length;
    return available[this._roundRobinIndex];
  }

  /**
   * Select proxy by priority (lowest first)
   * @private
   */
  _selectByPriority(available) {
    if (available.length === 0) return null;
    available.sort((a, b) => (a.priority || 1) - (b.priority || 1));
    return available[0];
  }

  /**
   * Select least-used proxy
   * @private
   */
  _selectLeastUsed(available) {
    if (available.length === 0) return null;
    
    let leastUsed = available[0];
    let leastCount = Infinity;
    
    for (const provider of available) {
      const stats = this._stats.get(provider.name);
      const useCount = (stats?.successes || 0) + (stats?.failures || 0);
      if (useCount < leastCount) {
        leastUsed = provider;
        leastCount = useCount;
      }
    }
    
    return leastUsed;
  }

  /**
   * Build proxy URL from provider config
   * @private
   */
  _buildProxyUrl(provider) {
    const auth = provider.auth?.username && provider.auth?.password
      ? `${encodeURIComponent(provider.auth.username)}:${encodeURIComponent(provider.auth.password)}@`
      : '';
    
    const protocol = provider.type === 'socks5' ? 'socks5' 
      : provider.type === 'socks4' ? 'socks4'
      : 'http';
    
    return `${protocol}://${auth}${provider.host}:${provider.port}`;
  }

  /**
   * Record a successful request through a proxy
   * @param {string} proxyName - Proxy name
   */
  recordSuccess(proxyName) {
    const stats = this._stats.get(proxyName);
    if (!stats) return;
    
    stats.successes++;
    stats.consecutiveFailures = 0;
    
    this.emit('proxy:success', { name: proxyName, stats: { ...stats } });
  }

  /**
   * Record a failed request through a proxy
   * 
   * @param {string} proxyName - Proxy name
   * @param {Object} [error] - Error details
   * @param {number} [error.httpStatus] - HTTP status code
   * @param {string} [error.code] - Error code
   */
  recordFailure(proxyName, error = {}) {
    const stats = this._stats.get(proxyName);
    if (!stats) return;
    
    stats.failures++;
    stats.consecutiveFailures++;
    
    // Check if this triggers a ban
    const failover = this._config.failover;
    if (failover?.enabled) {
      // Check status code trigger
      const shouldBan = 
        stats.consecutiveFailures >= failover.banThresholdFailures ||
        (error.httpStatus && failover.triggerOnStatusCodes?.includes(error.httpStatus));
      
      if (shouldBan && !stats.banned) {
        stats.banned = true;
        stats.bannedUntil = Date.now() + (failover.banDurationMs || 300000);
        this._telemetry.bansApplied++;
        this._telemetry.failovers++;
        
        this.logger.warn(`[ProxyManager] Banned proxy ${proxyName} until ${new Date(stats.bannedUntil).toISOString()}`);
        this.emit('proxy:ban', { 
          name: proxyName, 
          reason: error.httpStatus ? `HTTP ${error.httpStatus}` : 'consecutive failures',
          bannedUntil: stats.bannedUntil
        });
      }
    }
    
    this.emit('proxy:failure', { name: proxyName, error, stats: { ...stats } });
  }

  /**
   * Check if a proxy is currently banned
   * @param {string} proxyName
   * @returns {boolean}
   */
  isBanned(proxyName) {
    const stats = this._stats.get(proxyName);
    if (!stats) return false;
    
    if (stats.banned && stats.bannedUntil && Date.now() > stats.bannedUntil) {
      stats.banned = false;
      stats.bannedUntil = null;
      stats.consecutiveFailures = 0;
      this._telemetry.bansExpired++;
    }
    
    return stats.banned;
  }

  /**
   * Manually unban a proxy
   * @param {string} proxyName
   * @returns {boolean} Success
   */
  unban(proxyName) {
    const stats = this._stats.get(proxyName);
    if (!stats) return false;
    
    stats.banned = false;
    stats.bannedUntil = null;
    stats.consecutiveFailures = 0;
    this.emit('proxy:unban', { name: proxyName, manual: true });
    return true;
  }

  /**
   * Get statistics for all proxies
   * @returns {Object}
   */
  getStats() {
    const proxies = [];
    
    for (const [name, provider] of this._providers) {
      const stats = this._stats.get(name) || {};
      proxies.push({
        name,
        type: provider.type,
        enabled: provider.enabled,
        priority: provider.priority,
        tags: provider.tags || [],
        stats: {
          successes: stats.successes || 0,
          failures: stats.failures || 0,
          consecutiveFailures: stats.consecutiveFailures || 0,
          banned: stats.banned || false,
          bannedUntil: stats.bannedUntil
        }
      });
    }
    
    return {
      enabled: this._config.enabled,
      strategy: this._config.strategy,
      telemetry: { ...this._telemetry },
      proxies
    };
  }

  /**
   * Get list of available (non-banned) proxy names
   * @returns {string[]}
   */
  getAvailableProxyNames() {
    return this._getAvailableProxies().map(p => p.name);
  }

  /**
   * Reset all statistics
   */
  resetStats() {
    for (const stats of this._stats.values()) {
      stats.successes = 0;
      stats.failures = 0;
      stats.consecutiveFailures = 0;
      stats.banned = false;
      stats.bannedUntil = null;
    }
    
    this._telemetry = {
      totalRequests: 0,
      proxyRequests: 0,
      directRequests: 0,
      bansApplied: 0,
      bansExpired: 0,
      failovers: 0
    };
  }
}

module.exports = { ProxyManager };
