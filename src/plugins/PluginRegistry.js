'use strict';

/**
 * Plugin Registry
 * Manages available plugins and installation
 * @module plugins/PluginRegistry
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

/**
 * Plugin Registry - Lists and manages plugin installations
 */
class PluginRegistry extends EventEmitter {
  /**
   * Create a PluginRegistry
   * @param {Object} options - Options
   * @param {string} options.pluginsDir - Plugins directory
   * @param {string} options.registryUrl - Remote registry URL
   */
  constructor(options = {}) {
    super();
    this.pluginsDir = options.pluginsDir || path.join(process.cwd(), 'plugins');
    this.registryUrl = options.registryUrl || null;
    this.localRegistry = new Map();
    this.remoteCache = null;
    this.remoteCacheTime = 0;
    this.cacheMaxAge = 3600000; // 1 hour
  }

  /**
   * Scan local plugins directory
   * @returns {Promise<Array>} Local plugin list
   */
  async scanLocal() {
    const plugins = [];
    
    if (!fs.existsSync(this.pluginsDir)) {
      return plugins;
    }

    const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const pluginDir = path.join(this.pluginsDir, entry.name);
      const manifestPath = path.join(pluginDir, 'plugin.json');
      
      if (!fs.existsSync(manifestPath)) continue;
      
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const plugin = {
          id: manifest.id || entry.name,
          name: manifest.name,
          version: manifest.version,
          type: manifest.type,
          description: manifest.description || '',
          author: manifest.author || '',
          installed: true,
          path: pluginDir
        };
        
        plugins.push(plugin);
        this.localRegistry.set(plugin.id, plugin);
      } catch (error) {
        this.emit('error', { dir: entry.name, error: error.message });
      }
    }
    
    return plugins;
  }

  /**
   * Get plugin from local registry
   * @param {string} pluginId - Plugin ID
   * @returns {Object|null} Plugin info
   */
  getLocal(pluginId) {
    return this.localRegistry.get(pluginId) || null;
  }

  /**
   * Check if plugin is installed
   * @param {string} pluginId - Plugin ID
   * @returns {boolean} Installed
   */
  isInstalled(pluginId) {
    return this.localRegistry.has(pluginId);
  }

  /**
   * List local plugins
   * @param {Object} filter - Optional filter
   * @returns {Array} Plugins
   */
  listLocal(filter = {}) {
    let plugins = Array.from(this.localRegistry.values());
    
    if (filter.type) {
      plugins = plugins.filter(p => p.type === filter.type);
    }
    
    return plugins;
  }

  /**
   * Fetch remote registry (if configured)
   * @param {boolean} forceRefresh - Force refresh cache
   * @returns {Promise<Array>} Available plugins
   */
  async fetchRemote(forceRefresh = false) {
    if (!this.registryUrl) {
      return [];
    }

    // Return cached if still valid
    if (!forceRefresh && this.remoteCache && 
        Date.now() - this.remoteCacheTime < this.cacheMaxAge) {
      return this.remoteCache;
    }

    try {
      const response = await this._fetchUrl(this.registryUrl);
      this.remoteCache = response.plugins || [];
      this.remoteCacheTime = Date.now();
      return this.remoteCache;
    } catch (error) {
      this.emit('error', { operation: 'fetchRemote', error: error.message });
      return this.remoteCache || [];
    }
  }

  /**
   * Search plugins (local + remote)
   * @param {string} query - Search query
   * @returns {Promise<Array>} Matching plugins
   */
  async search(query) {
    const local = Array.from(this.localRegistry.values());
    const remote = await this.fetchRemote();
    
    const all = [...local];
    
    // Add remote plugins not installed locally
    for (const plugin of remote) {
      if (!this.localRegistry.has(plugin.id)) {
        all.push({ ...plugin, installed: false });
      }
    }
    
    // Filter by query
    const q = query.toLowerCase();
    return all.filter(p => 
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    );
  }

  /**
   * Install a plugin
   * @param {string} pluginId - Plugin ID or URL
   * @param {Object} options - Install options
   * @returns {Promise<Object>} Installed plugin
   */
  async install(pluginId, options = {}) {
    if (this.isInstalled(pluginId)) {
      throw new Error(`Plugin ${pluginId} is already installed`);
    }

    // Create plugins dir if needed
    if (!fs.existsSync(this.pluginsDir)) {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
    }

    // For now, just create a placeholder
    // In a real implementation, this would download from registry
    const pluginDir = path.join(this.pluginsDir, pluginId);
    
    if (options.source === 'local' && options.sourcePath) {
      // Copy from local path
      await this._copyDir(options.sourcePath, pluginDir);
    } else {
      // Create placeholder structure
      fs.mkdirSync(pluginDir, { recursive: true });
      
      const manifest = {
        id: pluginId,
        name: pluginId,
        version: '1.0.0',
        type: options.type || 'extractor',
        entrypoint: 'index.js',
        description: options.description || ''
      };
      
      fs.writeFileSync(
        path.join(pluginDir, 'plugin.json'),
        JSON.stringify(manifest, null, 2)
      );
      
      fs.writeFileSync(
        path.join(pluginDir, 'index.js'),
        `'use strict';\n\nmodule.exports = {\n  init(api) {\n    api.log.info('Plugin initialized');\n  },\n  activate(api) {},\n  deactivate(api) {},\n  destroy(api) {}\n};\n`
      );
    }

    // Rescan and return
    await this.scanLocal();
    return this.getLocal(pluginId);
  }

  /**
   * Uninstall a plugin
   * @param {string} pluginId - Plugin ID
   * @returns {Promise<void>}
   */
  async uninstall(pluginId) {
    const plugin = this.getLocal(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} is not installed`);
    }

    // Remove directory
    await this._removeDir(plugin.path);
    
    // Remove from registry
    this.localRegistry.delete(pluginId);
    
    this.emit('uninstalled', { id: pluginId });
  }

  /**
   * Get plugin version info
   * @param {string} pluginId - Plugin ID
   * @returns {Object|null} Version info
   */
  getVersion(pluginId) {
    const plugin = this.getLocal(pluginId);
    if (!plugin) return null;
    
    return {
      installed: plugin.version,
      latest: null // Would come from remote registry
    };
  }

  /**
   * Check for updates
   * @returns {Promise<Array>} Plugins with updates
   */
  async checkUpdates() {
    const updates = [];
    const remote = await this.fetchRemote(true);
    
    for (const remotePlugin of remote) {
      const local = this.getLocal(remotePlugin.id);
      if (local && this._versionCompare(local.version, remotePlugin.version) < 0) {
        updates.push({
          id: remotePlugin.id,
          currentVersion: local.version,
          latestVersion: remotePlugin.version
        });
      }
    }
    
    return updates;
  }

  /**
   * Compare semantic versions
   * @private
   */
  _versionCompare(a, b) {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    
    for (let i = 0; i < 3; i++) {
      if ((partsA[i] || 0) < (partsB[i] || 0)) return -1;
      if ((partsA[i] || 0) > (partsB[i] || 0)) return 1;
    }
    
    return 0;
  }

  /**
   * Fetch URL helper
   * @private
   */
  async _fetchUrl(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? require('https') : require('http');
      
      protocol.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  }

  /**
   * Copy directory recursively
   * @private
   */
  async _copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        await this._copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Remove directory recursively
   * @private
   */
  async _removeDir(dir) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

module.exports = { PluginRegistry };
