'use strict';

/**
 * Plugin API
 * API exposed to plugins for interacting with the system
 * @module plugins/PluginAPI
 */

const EventEmitter = require('events');

/**
 * Plugin API - Sandboxed interface for plugins
 */
class PluginAPI {
  /**
   * Create a PluginAPI
   * @param {Object} options - Options
   * @param {string} options.pluginId - Plugin ID
   * @param {string} options.pluginType - Plugin type
   * @param {Object} options.services - Available services
   * @param {Object} options.config - Configuration service
   */
  constructor(options = {}) {
    this.pluginId = options.pluginId;
    this.pluginType = options.pluginType;
    this._services = options.services || {};
    this._configService = options.config;
    
    // Track registered hooks for cleanup
    this._registeredHooks = [];
    this._registeredListeners = [];
    
    // Public API surfaces
    this.hooks = new HooksAPI(this);
    this.services = new ServicesAPI(this);
    this.config = new ConfigAPI(this);
    this.log = new LogAPI(this);
    this.storage = new StorageAPI(this);
  }

  /**
   * Get plugin ID
   * @returns {string}
   */
  getId() {
    return this.pluginId;
  }

  /**
   * Get plugin type
   * @returns {string}
   */
  getType() {
    return this.pluginType;
  }

  /**
   * Clean up all registered hooks and listeners
   */
  cleanup() {
    // Remove all hooks
    for (const hook of this._registeredHooks) {
      if (hook.emitter && typeof hook.emitter.off === 'function') {
        hook.emitter.off(hook.event, hook.handler);
      }
    }
    this._registeredHooks = [];
    
    // Remove all listeners
    for (const listener of this._registeredListeners) {
      if (listener.emitter && typeof listener.emitter.removeListener === 'function') {
        listener.emitter.removeListener(listener.event, listener.handler);
      }
    }
    this._registeredListeners = [];
  }

  /**
   * Register a hook (tracked for cleanup)
   * @param {EventEmitter} emitter - Event emitter
   * @param {string} event - Event name
   * @param {Function} handler - Handler function
   */
  _registerHook(emitter, event, handler) {
    this._registeredHooks.push({ emitter, event, handler });
    emitter.on(event, handler);
  }

  /**
   * Register a listener (tracked for cleanup)
   * @param {EventEmitter} emitter - Event emitter
   * @param {string} event - Event name
   * @param {Function} handler - Handler function
   */
  _registerListener(emitter, event, handler) {
    this._registeredListeners.push({ emitter, event, handler });
    emitter.on(event, handler);
  }
}

/**
 * Hooks API - Register callbacks for system events
 */
class HooksAPI {
  constructor(api) {
    this.api = api;
    this._hooks = new Map();
  }

  /**
   * Register hook for article extraction complete
   * @param {Function} callback - Callback function
   */
  onArticleExtracted(callback) {
    this._addHook('article:extracted', callback);
  }

  /**
   * Register hook before article save
   * @param {Function} callback - Callback function
   */
  beforeSave(callback) {
    this._addHook('article:beforeSave', callback);
  }

  /**
   * Register hook after article save
   * @param {Function} callback - Callback function
   */
  afterSave(callback) {
    this._addHook('article:afterSave', callback);
  }

  /**
   * Register hook for analysis complete
   * @param {Function} callback - Callback function
   */
  onAnalysisComplete(callback) {
    this._addHook('analysis:complete', callback);
  }

  /**
   * Register hook for crawl start
   * @param {Function} callback - Callback function
   */
  onCrawlStart(callback) {
    this._addHook('crawl:start', callback);
  }

  /**
   * Register hook for crawl end
   * @param {Function} callback - Callback function
   */
  onCrawlEnd(callback) {
    this._addHook('crawl:end', callback);
  }

  /**
   * Register a custom hook
   * @param {string} hookName - Hook name
   * @param {Function} callback - Callback function
   */
  register(hookName, callback) {
    this._addHook(hookName, callback);
  }

  /**
   * Add hook to registry
   * @private
   */
  _addHook(name, callback) {
    if (!this._hooks.has(name)) {
      this._hooks.set(name, []);
    }
    this._hooks.get(name).push(callback);
    
    // Track for cleanup
    this.api._registeredHooks.push({
      emitter: { off: () => this._removeHook(name, callback) },
      event: name,
      handler: callback
    });
  }

  /**
   * Remove hook from registry
   * @private
   */
  _removeHook(name, callback) {
    const hooks = this._hooks.get(name);
    if (hooks) {
      const index = hooks.indexOf(callback);
      if (index >= 0) {
        hooks.splice(index, 1);
      }
    }
  }

  /**
   * Trigger hooks for an event
   * @param {string} hookName - Hook name
   * @param {Object} data - Data to pass to hooks
   * @returns {Promise<Array>} Hook results
   */
  async trigger(hookName, data) {
    const hooks = this._hooks.get(hookName) || [];
    const results = [];
    
    for (const hook of hooks) {
      try {
        const result = await hook(data);
        results.push({ success: true, result });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Get all registered hooks
   * @returns {Object} Hook registry
   */
  getAll() {
    const all = {};
    for (const [name, hooks] of this._hooks) {
      all[name] = hooks.length;
    }
    return all;
  }
}

/**
 * Services API - Access system services
 */
class ServicesAPI {
  constructor(api) {
    this.api = api;
  }

  /**
   * Get an article by ID
   * @param {number|string} id - Article ID
   * @returns {Promise<Object|null>} Article
   */
  async getArticle(id) {
    const articleService = this.api._services.articleService;
    if (!articleService) return null;
    return articleService.getById ? articleService.getById(id) : null;
  }

  /**
   * Search articles
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Articles
   */
  async searchArticles(query, options = {}) {
    const searchService = this.api._services.searchService;
    if (!searchService) return [];
    return searchService.search ? searchService.search(query, options) : [];
  }

  /**
   * Save analysis data
   * @param {number|string} articleId - Article ID
   * @param {Object} data - Analysis data
   * @returns {Promise<Object>} Saved analysis
   */
  async saveAnalysis(articleId, data) {
    const analysisService = this.api._services.analysisService;
    if (!analysisService) {
      throw new Error('Analysis service not available');
    }
    return analysisService.save ? analysisService.save(articleId, data) : null;
  }

  /**
   * Get topics
   * @param {Object} options - Options
   * @returns {Promise<Array>} Topics
   */
  async getTopics(options = {}) {
    const topicService = this.api._services.topicService;
    if (!topicService) return [];
    return topicService.list ? topicService.list(options) : [];
  }

  /**
   * Send notification
   * @param {Object} notification - Notification data
   * @returns {Promise<void>}
   */
  async notify(notification) {
    const notificationService = this.api._services.notificationService;
    if (!notificationService) return;
    if (notificationService.send) {
      await notificationService.send(notification);
    }
  }

  /**
   * Get HTTP client for external requests
   * @returns {Object} HTTP client
   */
  getHttpClient() {
    return this.api._services.httpClient || require('http');
  }

  /**
   * Check if a service is available
   * @param {string} serviceName - Service name
   * @returns {boolean} Available
   */
  hasService(serviceName) {
    return !!this.api._services[serviceName];
  }
}

/**
 * Config API - Access plugin configuration
 */
class ConfigAPI {
  constructor(api) {
    this.api = api;
    this._cache = new Map();
  }

  /**
   * Get configuration value
   * @param {string} key - Config key (supports dot notation)
   * @param {*} defaultValue - Default if not found
   * @returns {*} Config value
   */
  get(key, defaultValue = undefined) {
    // Check cache first
    if (this._cache.has(key)) {
      return this._cache.get(key);
    }

    // Build full key path
    const fullKey = `plugins.${this.api.pluginId}.${key}`;
    
    // Try to get from config service
    if (this.api._configService && typeof this.api._configService.get === 'function') {
      const value = this.api._configService.get(fullKey);
      if (value !== undefined) {
        this._cache.set(key, value);
        return value;
      }
    }
    
    return defaultValue;
  }

  /**
   * Set configuration value
   * @param {string} key - Config key
   * @param {*} value - Value to set
   * @returns {Promise<void>}
   */
  async set(key, value) {
    const fullKey = `plugins.${this.api.pluginId}.${key}`;
    
    if (this.api._configService && typeof this.api._configService.set === 'function') {
      await this.api._configService.set(fullKey, value);
    }
    
    this._cache.set(key, value);
  }

  /**
   * Get all plugin configuration
   * @returns {Object} All config
   */
  getAll() {
    const fullKey = `plugins.${this.api.pluginId}`;
    
    if (this.api._configService && typeof this.api._configService.get === 'function') {
      return this.api._configService.get(fullKey) || {};
    }
    
    return Object.fromEntries(this._cache);
  }

  /**
   * Clear configuration cache
   */
  clearCache() {
    this._cache.clear();
  }
}

/**
 * Log API - Logging utilities
 */
class LogAPI {
  constructor(api) {
    this.api = api;
    this.prefix = `[plugin:${api.pluginId}]`;
  }

  /**
   * Log info message
   * @param {...*} args - Arguments to log
   */
  info(...args) {
    console.log(this.prefix, ...args);
  }

  /**
   * Log warning message
   * @param {...*} args - Arguments to log
   */
  warn(...args) {
    console.warn(this.prefix, ...args);
  }

  /**
   * Log error message
   * @param {...*} args - Arguments to log
   */
  error(...args) {
    console.error(this.prefix, ...args);
  }

  /**
   * Log debug message
   * @param {...*} args - Arguments to log
   */
  debug(...args) {
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      console.debug(this.prefix, ...args);
    }
  }
}

/**
 * Storage API - Plugin-scoped storage
 */
class StorageAPI {
  constructor(api) {
    this.api = api;
    this._memory = new Map();
  }

  /**
   * Get value from storage
   * @param {string} key - Key
   * @returns {Promise<*>} Value
   */
  async get(key) {
    // For now, use in-memory storage
    // Can be extended to use DB or file storage
    return this._memory.get(key);
  }

  /**
   * Set value in storage
   * @param {string} key - Key
   * @param {*} value - Value
   * @returns {Promise<void>}
   */
  async set(key, value) {
    this._memory.set(key, value);
  }

  /**
   * Delete value from storage
   * @param {string} key - Key
   * @returns {Promise<boolean>} Deleted
   */
  async delete(key) {
    return this._memory.delete(key);
  }

  /**
   * Check if key exists
   * @param {string} key - Key
   * @returns {Promise<boolean>} Exists
   */
  async has(key) {
    return this._memory.has(key);
  }

  /**
   * Get all keys
   * @returns {Promise<Array>} Keys
   */
  async keys() {
    return Array.from(this._memory.keys());
  }

  /**
   * Clear all storage
   * @returns {Promise<void>}
   */
  async clear() {
    this._memory.clear();
  }
}

module.exports = PluginAPI;
