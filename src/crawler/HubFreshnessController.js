'use strict';

const { safeCall } = require('./utils');

/**
 * Manages hub freshness configuration and policies for the crawler.
 * 
 * Hub pages (navigation pages, index pages, etc.) have special freshness requirements:
 * - They may need to be refreshed more often than article pages
 * - They may have different cache policies depending on depth
 * - Configuration can come from an enhanced features manager or a standalone ConfigManager
 * 
 * This controller handles:
 * - Selecting and managing the active ConfigManager
 * - Applying hub freshness policies to requests
 * - Watching for configuration changes
 * - Cleanup on shutdown
 * 
 * @example
 * const controller = new HubFreshnessController({
 *   getEnhancedConfigManager: () => crawler.enhancedFeatures?.configManager,
 *   ConfigManager
 * });
 * controller.configure({ preferEnhanced: true });
 * const meta = controller.applyPolicy({ depth: 0, type: 'nav', meta: {} });
 */
class HubFreshnessController {
  /**
   * @param {Object} options
   * @param {Function} [options.getEnhancedConfigManager] - Returns enhanced features ConfigManager if available
   * @param {Function} [options.ConfigManager] - ConfigManager constructor for standalone instance
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    this.getEnhancedConfigManager = options.getEnhancedConfigManager || (() => null);
    this.ConfigManager = options.ConfigManager || null;
    this.logger = options.logger || console;

    // State
    this.config = null;
    this._manager = null;
    this._ownedManager = null;
    this._watcherDispose = null;
  }

  /**
   * Get the current hub freshness configuration snapshot.
   * @returns {Object|null} Current configuration or null if not configured
   */
  getConfig() {
    return this.config;
  }

  /**
   * Configure hub freshness by selecting an appropriate ConfigManager.
   * 
   * @param {Object} [options]
   * @param {boolean} [options.preferEnhanced=false] - Prefer enhanced features ConfigManager
   */
  configure({ preferEnhanced = false } = {}) {
    const previousManager = this._manager;
    const manager = this._selectManager({ preferEnhanced });

    if (manager !== previousManager) {
      this._disposeWatcher();
      
      if (previousManager && previousManager === this._ownedManager && previousManager !== manager) {
        safeCall(() => previousManager.close());
        this._ownedManager = null;
      }
      
      this._manager = manager;
      this._bindWatcher(manager);
    }

    this._applyFromManager(manager);
  }

  /**
   * Apply hub freshness policy to a request's metadata.
   * 
   * This modifies cache behavior for hub-like requests:
   * - Sets maxCacheAgeMs based on configuration
   * - Sets fetchPolicy to 'network-first' for startup (depth=0)
   * - Controls fallback to cache behavior
   * 
   * @param {Object} params
   * @param {number} params.depth - Request depth (0 = seed URL)
   * @param {string} [params.type] - Request type (e.g., 'nav', 'article')
   * @param {Object} [params.meta] - Existing request metadata
   * @returns {Object|null} Modified metadata or original if no changes needed
   */
  applyPolicy({ depth, type, meta }) {
    if (!this.config) {
      return meta;
    }

    if (meta != null && typeof meta !== 'object') {
      return meta;
    }

    const config = this.config || {};
    const baseMeta = meta && typeof meta === 'object' ? { ...meta } : {};
    const isHubLike = this._isHubLikeRequest({ depth, type, meta: baseMeta });

    if (!isHubLike) {
      return meta;
    }

    let changed = false;
    const hasFetchPolicy = typeof baseMeta.fetchPolicy === 'string' && baseMeta.fetchPolicy;
    const fallbackPrefersCache = config.fallbackToCacheOnFailure !== false;
    const maxAgeDefault = Number.isFinite(config.maxCacheAgeMs) ? config.maxCacheAgeMs : null;
    const firstPageMaxAge = Number.isFinite(config.firstPageMaxAgeMs) ? config.firstPageMaxAgeMs : null;
    const effectiveMaxAge = depth === 0
      ? (firstPageMaxAge != null ? firstPageMaxAge : maxAgeDefault)
      : maxAgeDefault;

    if (effectiveMaxAge != null && !(typeof baseMeta.maxCacheAgeMs === 'number' && Number.isFinite(baseMeta.maxCacheAgeMs))) {
      baseMeta.maxCacheAgeMs = effectiveMaxAge;
      changed = true;
    }

    const shouldForceNetwork = depth === 0 && config.refreshOnStartup !== false;
    if (shouldForceNetwork && !hasFetchPolicy) {
      baseMeta.fetchPolicy = 'network-first';
      changed = true;
    }

    if (!fallbackPrefersCache && baseMeta.fallbackToCache !== false) {
      baseMeta.fallbackToCache = false;
      changed = true;
    }

    if (!changed) {
      return meta;
    }

    return baseMeta;
  }

  /**
   * Check if a request is hub-like (should have freshness policy applied).
   * 
   * @param {Object} params
   * @param {number} params.depth - Request depth
   * @param {string} [params.type] - Request type
   * @param {Object} [params.meta] - Request metadata
   * @returns {boolean} True if request is hub-like
   */
  _isHubLikeRequest({ depth, type, meta }) {
    if (depth === 0) {
      return true;
    }

    const roleCandidate = typeof meta?.role === 'string' ? meta.role.toLowerCase() : null;
    const kind = this._resolveRequestKind(type, meta);

    if (kind && (kind.includes('hub') || kind === 'nav' || kind === 'navigation')) {
      return true;
    }

    if (roleCandidate && (roleCandidate.includes('hub') || roleCandidate === 'nav' || roleCandidate === 'navigation')) {
      return true;
    }

    return false;
  }

  /**
   * Resolve the request kind from type and metadata.
   * 
   * @param {string} [type] - Request type
   * @param {Object} [meta] - Request metadata
   * @returns {string|null} Lowercase kind string or null
   */
  _resolveRequestKind(type, meta) {
    const candidates = [
      typeof meta?.kind === 'string' ? meta.kind : null,
      typeof meta?.type === 'string' ? meta.type : null,
      typeof meta?.intent === 'string' ? meta.intent : null,
      typeof type === 'string' ? type : null
    ];

    for (const value of candidates) {
      if (value) {
        return value.toLowerCase();
      }
    }

    return null;
  }

  /**
   * Select the appropriate ConfigManager to use.
   * @private
   */
  _selectManager({ preferEnhanced = false } = {}) {
    const enhancedManager = this.getEnhancedConfigManager();
    
    if (enhancedManager && (preferEnhanced || !this._ownedManager)) {
      return enhancedManager;
    }

    if (this._ownedManager) {
      return this._ownedManager;
    }

    if (!this.ConfigManager) {
      return enhancedManager || null;
    }

    try {
      this._ownedManager = new this.ConfigManager(null, {
        watch: !process.env.JEST_WORKER_ID,
        inMemory: false
      });
    } catch (error) {
      this.logger.warn?.('Failed to initialize hub freshness ConfigManager:', error?.message || String(error));
      this._ownedManager = null;
    }

    return this._ownedManager || enhancedManager || null;
  }

  /**
   * Apply configuration from a manager.
   * @private
   */
  _applyFromManager(manager) {
    if (!manager || typeof manager.getHubFreshnessConfig !== 'function') {
      this.config = null;
      return;
    }

    try {
      const snapshot = manager.getHubFreshnessConfig();
      this.config = snapshot && typeof snapshot === 'object' ? { ...snapshot } : null;
    } catch (error) {
      this.logger.warn?.('Failed to load hub freshness config:', error?.message || String(error));
      this.config = null;
    }
  }

  /**
   * Bind a watcher for configuration changes.
   * @private
   */
  _bindWatcher(manager) {
    if (!manager || typeof manager.addWatcher !== 'function') {
      this._watcherDispose = null;
      return;
    }

    this._watcherDispose = manager.addWatcher(() => {
      this._applyFromManager(manager);
    });
  }

  /**
   * Dispose the current watcher.
   * @private
   */
  _disposeWatcher() {
    if (typeof this._watcherDispose === 'function') {
      safeCall(() => this._watcherDispose());
    }
    this._watcherDispose = null;
  }

  /**
   * Cleanup all resources.
   * Call this when the crawler shuts down.
   */
  cleanup() {
    this._disposeWatcher();
    
    if (this._ownedManager) {
      safeCall(() => this._ownedManager.close());
      this._ownedManager = null;
    }
    
    this._manager = null;
    this.config = null;
  }
}

module.exports = HubFreshnessController;
