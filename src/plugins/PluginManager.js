'use strict';

/**
 * Plugin Manager
 * Discovers, loads, and manages plugins
 * @module plugins/PluginManager
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const PluginAPI = require('./PluginAPI');

/**
 * Plugin lifecycle states
 */
const PluginState = {
  DISCOVERED: 'discovered',
  LOADED: 'loaded',
  INITIALIZED: 'initialized',
  ACTIVE: 'active',
  DEACTIVATED: 'deactivated',
  ERROR: 'error'
};

/**
 * Plugin types
 */
const PluginType = {
  EXTRACTOR: 'extractor',
  ANALYZER: 'analyzer',
  INTEGRATION: 'integration',
  UI_WIDGET: 'ui-widget'
};

/**
 * Plugin Manager - Handles plugin lifecycle
 */
class PluginManager extends EventEmitter {
  /**
   * Create a PluginManager
   * @param {Object} options - Options
   * @param {string} options.pluginsDir - Directory to scan for plugins
   * @param {Object} options.services - Services to expose to plugins
   * @param {Object} options.config - Configuration service
   */
  constructor(options = {}) {
    super();
    this.pluginsDir = options.pluginsDir || path.join(process.cwd(), 'plugins');
    this.services = options.services || {};
    this.configService = options.config || null;
    
    this.plugins = new Map(); // id -> plugin info
    this.loadedModules = new Map(); // id -> module exports
    this.pluginAPIs = new Map(); // id -> PluginAPI instance
  }

  /**
   * Discover plugins in the plugins directory
   * @returns {Promise<Array>} Discovered plugin manifests
   */
  async discoverPlugins() {
    const discovered = [];
    
    if (!fs.existsSync(this.pluginsDir)) {
      return discovered;
    }

    const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const pluginDir = path.join(this.pluginsDir, entry.name);
      const manifestPath = path.join(pluginDir, 'plugin.json');
      
      if (!fs.existsSync(manifestPath)) continue;
      
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        
        if (!this.validateManifest(manifest)) {
          this.emit('error', { plugin: entry.name, error: 'Invalid manifest' });
          continue;
        }
        
        const pluginInfo = {
          id: manifest.id || entry.name,
          manifest,
          dir: pluginDir,
          state: PluginState.DISCOVERED
        };
        
        this.plugins.set(pluginInfo.id, pluginInfo);
        discovered.push(pluginInfo);
        this.emit('discovered', pluginInfo);
      } catch (error) {
        this.emit('error', { plugin: entry.name, error: error.message });
      }
    }
    
    return discovered;
  }

  /**
   * Validate plugin manifest
   * @param {Object} manifest - Plugin manifest
   * @returns {boolean} Is valid
   */
  validateManifest(manifest) {
    if (!manifest.name || typeof manifest.name !== 'string') return false;
    if (!manifest.version || typeof manifest.version !== 'string') return false;
    if (!manifest.type || !Object.values(PluginType).includes(manifest.type)) return false;
    if (!manifest.entrypoint || typeof manifest.entrypoint !== 'string') return false;
    return true;
  }

  /**
   * Load a plugin module
   * @param {string} pluginId - Plugin ID
   * @returns {Promise<Object>} Loaded module exports
   */
  async loadPlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    if (this.loadedModules.has(pluginId)) {
      return this.loadedModules.get(pluginId);
    }

    try {
      const entryPath = path.join(plugin.dir, plugin.manifest.entrypoint);
      const module = require(entryPath);
      
      this.loadedModules.set(pluginId, module);
      plugin.state = PluginState.LOADED;
      this.emit('loaded', plugin);
      
      return module;
    } catch (error) {
      plugin.state = PluginState.ERROR;
      plugin.error = error.message;
      this.emit('error', { plugin: pluginId, error: error.message });
      throw error;
    }
  }

  /**
   * Initialize a plugin
   * @param {string} pluginId - Plugin ID
   * @returns {Promise<void>}
   */
  async initializePlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    const module = await this.loadPlugin(pluginId);
    
    // Create plugin API instance
    const api = new PluginAPI({
      pluginId,
      pluginType: plugin.manifest.type,
      services: this.services,
      config: this.configService
    });
    this.pluginAPIs.set(pluginId, api);
    
    // Call init if exists
    if (typeof module.init === 'function') {
      await module.init(api);
    }
    
    plugin.state = PluginState.INITIALIZED;
    this.emit('initialized', plugin);
  }

  /**
   * Activate a plugin
   * @param {string} pluginId - Plugin ID
   * @returns {Promise<void>}
   */
  async activatePlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    if (plugin.state !== PluginState.INITIALIZED) {
      await this.initializePlugin(pluginId);
    }

    const module = this.loadedModules.get(pluginId);
    const api = this.pluginAPIs.get(pluginId);
    
    if (typeof module.activate === 'function') {
      await module.activate(api);
    }
    
    plugin.state = PluginState.ACTIVE;
    this.emit('activated', plugin);
  }

  /**
   * Deactivate a plugin
   * @param {string} pluginId - Plugin ID
   * @returns {Promise<void>}
   */
  async deactivatePlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    const module = this.loadedModules.get(pluginId);
    const api = this.pluginAPIs.get(pluginId);
    
    if (module && typeof module.deactivate === 'function') {
      await module.deactivate(api);
    }
    
    // Clean up hooks registered by this plugin
    if (api) {
      api.cleanup();
    }
    
    plugin.state = PluginState.DEACTIVATED;
    this.emit('deactivated', plugin);
  }

  /**
   * Destroy a plugin completely
   * @param {string} pluginId - Plugin ID
   * @returns {Promise<void>}
   */
  async destroyPlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    if (plugin.state === PluginState.ACTIVE) {
      await this.deactivatePlugin(pluginId);
    }

    const module = this.loadedModules.get(pluginId);
    const api = this.pluginAPIs.get(pluginId);
    
    if (module && typeof module.destroy === 'function') {
      await module.destroy(api);
    }
    
    this.loadedModules.delete(pluginId);
    this.pluginAPIs.delete(pluginId);
    this.plugins.delete(pluginId);
    this.emit('destroyed', { id: pluginId });
  }

  /**
   * Get plugin info
   * @param {string} pluginId - Plugin ID
   * @returns {Object|null} Plugin info
   */
  getPlugin(pluginId) {
    return this.plugins.get(pluginId) || null;
  }

  /**
   * List all plugins
   * @param {Object} filter - Optional filter
   * @returns {Array} Plugin list
   */
  listPlugins(filter = {}) {
    const plugins = Array.from(this.plugins.values());
    
    return plugins.filter(plugin => {
      if (filter.type && plugin.manifest.type !== filter.type) return false;
      if (filter.state && plugin.state !== filter.state) return false;
      return true;
    });
  }

  /**
   * Get plugins by type
   * @param {string} type - Plugin type
   * @returns {Array} Plugins of that type
   */
  getPluginsByType(type) {
    return this.listPlugins({ type });
  }

  /**
   * Get active plugins
   * @returns {Array} Active plugins
   */
  getActivePlugins() {
    return this.listPlugins({ state: PluginState.ACTIVE });
  }

  /**
   * Load and activate all discovered plugins
   * @returns {Promise<Object>} Results
   */
  async activateAll() {
    await this.discoverPlugins();
    
    const results = { activated: [], failed: [] };
    
    for (const [pluginId] of this.plugins) {
      try {
        await this.activatePlugin(pluginId);
        results.activated.push(pluginId);
      } catch (error) {
        results.failed.push({ id: pluginId, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Deactivate and destroy all plugins
   * @returns {Promise<void>}
   */
  async destroyAll() {
    const pluginIds = Array.from(this.plugins.keys());
    
    for (const pluginId of pluginIds) {
      try {
        await this.destroyPlugin(pluginId);
      } catch (error) {
        this.emit('error', { plugin: pluginId, error: error.message });
      }
    }
  }

  /**
   * Check if a plugin matches a URL pattern
   * @param {string} pluginId - Plugin ID
   * @param {string} url - URL to check
   * @returns {boolean} Matches
   */
  pluginMatchesUrl(pluginId, url) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !plugin.manifest.matches) return false;
    
    const patterns = Array.isArray(plugin.manifest.matches) 
      ? plugin.manifest.matches 
      : [plugin.manifest.matches];
    
    for (const pattern of patterns) {
      const regex = new RegExp(
        pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.')
      );
      if (regex.test(url)) return true;
    }
    
    return false;
  }

  /**
   * Find plugins that match a URL
   * @param {string} url - URL to match
   * @returns {Array} Matching plugins
   */
  findPluginsForUrl(url) {
    return Array.from(this.plugins.keys())
      .filter(id => this.pluginMatchesUrl(id, url))
      .map(id => this.plugins.get(id));
  }

  /**
   * Call extractor plugins for a URL
   * @param {string} url - URL to extract
   * @param {Object} context - Extraction context
   * @returns {Promise<Object|null>} Extracted content or null
   */
  async runExtractors(url, context = {}) {
    const extractors = this.getPluginsByType(PluginType.EXTRACTOR)
      .filter(p => p.state === PluginState.ACTIVE && this.pluginMatchesUrl(p.id, url));
    
    for (const extractor of extractors) {
      const module = this.loadedModules.get(extractor.id);
      if (module && typeof module.extract === 'function') {
        try {
          const result = await module.extract(url, context);
          if (result) return { plugin: extractor.id, result };
        } catch (error) {
          this.emit('error', { plugin: extractor.id, error: error.message });
        }
      }
    }
    
    return null;
  }

  /**
   * Call analyzer plugins on content
   * @param {Object} content - Content to analyze
   * @param {Object} context - Analysis context
   * @returns {Promise<Array>} Analysis results
   */
  async runAnalyzers(content, context = {}) {
    const analyzers = this.getPluginsByType(PluginType.ANALYZER)
      .filter(p => p.state === PluginState.ACTIVE);
    
    const results = [];
    
    for (const analyzer of analyzers) {
      const module = this.loadedModules.get(analyzer.id);
      if (module && typeof module.analyze === 'function') {
        try {
          const result = await module.analyze(content, context);
          if (result) {
            results.push({ plugin: analyzer.id, result });
          }
        } catch (error) {
          this.emit('error', { plugin: analyzer.id, error: error.message });
        }
      }
    }
    
    return results;
  }
}

module.exports = { PluginManager, PluginState, PluginType };
