const path = require('path');
const fs = require('fs');
const { tof, clone, is_array, fp } = require('lang-tools');

function deepMerge(target, source) {
  if (!source || tof(source) !== 'object') return target;
  const output = is_array(target) ? [...target] : { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value && tof(value) === 'object' && !is_array(value)) {
      output[key] = deepMerge(output[key] && tof(output[key]) === 'object' ? output[key] : {}, value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

/**
 * Polymorphic numeric coercion with null handling.
 * Uses functional polymorphism (fp) from lang-tools for signature-based dispatch.
 * 
 * Similar to coerceNumeric in PriorityScorer.js but returns null for invalid values.
 * 
 * Signature handlers:
 * - '[u]' or '[N]': null/undefined returns null
 * - '[n]': Number returns as-is if finite, else null
 * - '[s]': String parsed to number if valid, else null
 * - '[o]': Object recursively unwraps .value property
 * 
 * @param {*} value - Value to coerce to number
 * @returns {number|null} Coerced number or null if invalid
 */
const coerceNumber = fp((a, sig) => {
  // Null/undefined - return null
  if (sig === '[u]' || sig === '[N]') {
    return null;
  }
  
  // Number - return if finite
  if (sig === '[n]') {
    return Number.isFinite(a[0]) ? a[0] : null;
  }
  
  // String - parse to number
  if (sig === '[s]') {
    const trimmed = a[0].trim();
    if (trimmed !== '') {
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }
  
  // Object - recursively unwrap .value property
  if (sig === '[o]') {
    if (tof(a[0].value) !== 'undefined') {
      return coerceNumber(a[0].value);
    }
    return null;
  }
  
  // Default: null
  return null;
});

function toCamelCase(name = '') {
  return String(name)
    .replace(/[-_\s]+(.)?/g, (_, chr) => (chr ? chr.toUpperCase() : ''))
    .replace(/^(.)/, (match) => match.toLowerCase());
}

function toKebabCase(name = '') {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
}

/**
 * Configuration manager for priority system and feature flags
 * Handles loading, validation, and runtime updates of crawl configuration
 */
class ConfigManager {
  constructor(configPath = null, options = {}) {
    this.options = {
      inMemory: !!options.inMemory,
      initialConfig: options.initialConfig || null,
      watch: options.watch !== undefined ? !!options.watch : !process.env.JEST_WORKER_ID,
      fs: options.fs || fs
    };
    this.configPath = configPath || path.join(process.cwd(), 'config', 'priority-config.json');
    this.fs = this.options.fs;
    this.config = null;
    this.watchers = new Set();
    this.lastModified = null;
    this.fileWatcherActive = false;
    this.closed = false;

    if (this.options.inMemory) {
      this.config = this._applyDefaults(this.options.initialConfig);
    } else {
      this.config = this._loadConfig();
      if (this.options.watch) {
        this._setupWatcher();
      }
    }
  }

  _loadConfig() {
    try {
      if (!this.fs.existsSync(this.configPath)) {
        console.warn(`Priority config not found at ${this.configPath}, using defaults`);
        return this._getDefaultConfig();
      }

      const stats = this.fs.statSync(this.configPath);
      const rawData = this.fs.readFileSync(this.configPath, 'utf8');
      const loaded = JSON.parse(rawData);
      const config = this._applyDefaults(loaded);
      this._validateConfig(config);
      this.lastModified = stats.mtime;
      console.log(`Priority config loaded from ${this.configPath}`);
      return config;
    } catch (error) {
      console.error(`Failed to load priority config: ${error.message}`);
      return this._getDefaultConfig();
    }
  }

  _validateConfig(config) {
    if (!config || tof(config) !== 'object') {
      throw new Error('Config must be a valid JSON object');
    }

    if (!config.queue?.bonuses || !config.queue?.weights) {
      throw new Error('Config missing required queue.bonuses or queue.weights');
    }

    // Validate all bonus values are numbers
    for (const [key, bonus] of Object.entries(config.queue.bonuses)) {
      if (tof(bonus.value) !== 'number' || bonus.value < 0) {
        throw new Error(`Invalid bonus value for ${key}: must be non-negative number`);
      }
    }

    // Validate all weight values are numbers
    for (const [key, weight] of Object.entries(config.queue.weights)) {
      if (tof(weight.value) !== 'number' || weight.value < 0) {
        throw new Error(`Invalid weight value for ${key}: must be non-negative number`);
      }
    }
  }

  _getDefaultConfig() {
    return {
      queue: {
        bonuses: {
          'adaptive-seed': { value: 20, description: 'URLs discovered by intelligent planning' },
          'gap-prediction': { value: 15, description: 'URLs predicted to fill gaps' },
          'sitemap': { value: 10, description: 'URLs from sitemap' },
          'hub-validated': { value: 8, description: 'Validated hub pages' },
          'link': { value: 0, description: 'Regular link discovery' }
        },
        weights: {
          'article': { value: 0 },
          'hub-seed': { value: 4 },
          'history': { value: 6 },
          'nav': { value: 10 },
          'refresh': { value: 25 }
        },
        clustering: {
          problemThreshold: 5,
          timeWindowMinutes: 30,
          maxClusterSize: 100,
          boostFactorPerCluster: 2.5
        }
      },
      coverage: {
        telemetryIntervalSeconds: 30,
        milestoneThresholds: {
          hubDiscoveryMinimum: 10,
          coveragePercentageTargets: [25, 50, 75, 90],
          gapReductionSignificant: 0.15
        }
      },
      features: {
        gapDrivenPrioritization: true,
        plannerKnowledgeReuse: true,
        realTimeCoverageAnalytics: true,
        problemClustering: true,
        problemResolution: true
      }
    };
  }

  _applyDefaults(rawConfig) {
    const defaults = this._getDefaultConfig();
    if (!rawConfig || tof(rawConfig) !== 'object') {
      return this._normalizeConfigStructure(clone(defaults));
    }
    const merged = deepMerge(defaults, rawConfig);
    return this._normalizeConfigStructure(merged);
  }

  _normalizeConfigStructure(config) {
    if (!config || tof(config) !== 'object') {
      return config;
    }

    if (!config.queue || tof(config.queue) !== 'object') {
      config.queue = clone(this._getDefaultConfig().queue);
    }

    if (!config.queue.bonuses || tof(config.queue.bonuses) !== 'object') {
      config.queue.bonuses = {};
    }

    if (config.queuePriorityBonuses && tof(config.queuePriorityBonuses) === 'object') {
      for (const [key, value] of Object.entries(config.queuePriorityBonuses)) {
        config.queue.bonuses[key] = tof(value) === 'number'
          ? { value }
          : { ...(value || {}), value: coerceNumber(value?.value ?? value) ?? 0 };
      }
    }

    for (const [key, value] of Object.entries(config.queue.bonuses)) {
      if (tof(value) !== 'object' || value === null || tof(value.value) !== 'number') {
        config.queue.bonuses[key] = { value: coerceNumber(value) ?? 0 };
      }
    }

    if (!config.queue.weights || tof(config.queue.weights) !== 'object') {
      config.queue.weights = {};
    }

    if (config.priorityWeights && tof(config.priorityWeights) === 'object') {
      for (const [key, value] of Object.entries(config.priorityWeights)) {
        config.queue.weights[key] = tof(value) === 'number'
          ? { value }
          : { ...(value || {}), value: coerceNumber(value?.value ?? value) ?? 0 };
      }
    }

    for (const [key, value] of Object.entries(config.queue.weights)) {
      if (tof(value) !== 'object' || value === null || tof(value.value) !== 'number') {
        config.queue.weights[key] = { value: coerceNumber(value) ?? 0 };
      }
    }

    if (config.clustering && tof(config.clustering) === 'object') {
      config.queue.clustering = {
        ...(config.queue.clustering || {}),
        ...config.clustering
      };
    }

    if (!config.queue.clustering || tof(config.queue.clustering) !== 'object') {
      config.queue.clustering = {};
    }

    if (config.features && tof(config.features) === 'object') {
      const normalized = {};
      for (const [key, value] of Object.entries(config.features)) {
        const normalizedKey = toCamelCase(key);
        normalized[normalizedKey] = Boolean(value);
      }
      config.features = normalized;
    }

    return config;
  }

  _writeConfigToDisk(config) {
    const dir = path.dirname(this.configPath);
    if (!this.fs.existsSync(dir)) {
      this.fs.mkdirSync(dir, { recursive: true });
    }
    this.fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');
    try {
      this.lastModified = this.fs.statSync(this.configPath).mtime;
    } catch (_) {
      this.lastModified = new Date();
    }
  }

  _setupWatcher() {
    try {
      if (this.options.inMemory || this.fileWatcherActive) return;
      const configDir = path.dirname(this.configPath);
      if (!this.fs.existsSync(configDir)) {
        this.fs.mkdirSync(configDir, { recursive: true });
      }

      if (!this.fs.existsSync(this.configPath)) {
        this._writeConfigToDisk(this.config);
      }

      this.fs.watchFile(this.configPath, { interval: 1000 }, (curr, prev) => {
        if (this.closed) return;
        if (curr.mtimeMs === prev.mtimeMs || curr.mtimeMs === (this.lastModified?.getTime?.() || prev.mtimeMs)) {
          return;
        }
        try {
          const reloaded = this._applyDefaults(JSON.parse(this.fs.readFileSync(this.configPath, 'utf8')));
          this._validateConfig(reloaded);
          this.config = reloaded;
          this.lastModified = curr.mtime;
          console.log('Priority config file changed, reloading...');
          this._notifyWatchers();
        } catch (error) {
          console.error('Failed to reload priority config:', error.message || error);
        }
      });
      this.fileWatcherActive = true;
    } catch (error) {
      console.warn(`Could not setup config file watcher: ${error.message}`);
    }
  }

  _notifyWatchers() {
    for (const callback of this.watchers) {
      try {
        callback(this.getConfig());
      } catch (error) {
        console.error('Error in config watcher callback:', error);
      }
    }
  }

  // Public API
  getConfig() {
    const snapshot = clone(this.config);
    snapshot.queuePriorityBonuses = Object.fromEntries(
      Object.entries(snapshot.queue?.bonuses || {}).map(([key, meta]) => [key, meta.value])
    );
    snapshot.priorityWeights = Object.fromEntries(
      Object.entries(snapshot.queue?.weights || {}).map(([key, meta]) => [key, meta.value])
    );
    snapshot.clustering = { ...(snapshot.queue?.clustering || {}) };
    if (snapshot.features && tof(snapshot.features) === 'object') {
      const features = { ...snapshot.features };
      for (const [key, value] of Object.entries(snapshot.features)) {
        const kebab = toKebabCase(key);
        if (!(kebab in features)) {
          features[kebab] = value;
        }
      }
      snapshot.features = features;
    }
    return snapshot;
  }

  getBonuses() {
    return clone(this.config?.queue?.bonuses || {});
  }

  getWeights() {
    return clone(this.config?.queue?.weights || {});
  }

  getClusteringConfig() {
    return clone(this.config?.queue?.clustering || {});
  }

  getCoverageConfig() {
    return clone(this.config?.coverage || {});
  }

  getFeatureFlags() {
    return clone(this.config?.features || {});
  }

  isFeatureEnabled(featureName) {
    return Boolean(this.config?.features?.[featureName]);
  }

  getBonusValue(bonusType) {
    return this.config?.queue?.bonuses?.[bonusType]?.value || 0;
  }

  getWeightValue(weightType) {
    return this.config?.queue?.weights?.[weightType]?.value || 10;
  }

  // Watch for config changes
  addWatcher(callback) {
    this.watchers.add(callback);
    return () => this.watchers.delete(callback);
  }

  // Update configuration programmatically (for UI)
  updateConfig(updates = {}) {
    const errors = [];
    if (!updates || tof(updates) !== 'object') {
      return { success: false, errors: ['Updates must be an object'] };
    }

  let nextConfig = clone(this.config);

    const applyBonusUpdate = (key, rawValue) => {
      const value = coerceNumber(rawValue);
      if (value == null || value < 0) {
        errors.push(`Invalid priority bonus value for ${key}`);
        return;
      }
      const existing = nextConfig.queue.bonuses[key] || { description: '' };
      nextConfig.queue.bonuses[key] = { ...existing, value };
      nextConfig.queuePriorityBonuses = {
        ...(nextConfig.queuePriorityBonuses || {}),
        [key]: value
      };
    };

    const applyWeightUpdate = (key, rawValue) => {
      const value = coerceNumber(rawValue);
      if (value == null || value < 0) {
        errors.push(`Invalid priority weight value for ${key}`);
        return;
      }
      const existing = nextConfig.queue.weights[key] || {};
      nextConfig.queue.weights[key] = { ...existing, value };
      nextConfig.priorityWeights = {
        ...(nextConfig.priorityWeights || {}),
        [key]: value
      };
    };

    const applyClusteringUpdate = (key, rawValue) => {
      const value = coerceNumber(rawValue);
      if (value == null || value < 0) {
        errors.push(`Invalid clustering value for ${key}`);
        return;
      }
      nextConfig.queue.clustering[key] = value;
    };

    const bonusSources = [updates.queuePriorityBonuses, updates.queue?.bonuses];
    for (const source of bonusSources) {
      if (!source) continue;
      for (const [key, rawValue] of Object.entries(source)) {
        applyBonusUpdate(key, rawValue);
      }
    }

    const weightSources = [updates.priorityWeights, updates.queue?.weights];
    for (const source of weightSources) {
      if (!source) continue;
      for (const [key, rawValue] of Object.entries(source)) {
        applyWeightUpdate(key, rawValue);
      }
    }

    if (updates.features) {
      for (const [key, rawValue] of Object.entries(updates.features)) {
        if (tof(rawValue) !== 'boolean') {
          errors.push(`Invalid feature flag ${key}: must be boolean`);
        } else {
          const normalizedKey = toCamelCase(key);
          nextConfig.features[normalizedKey] = rawValue;
        }
      }
    }

    const clusteringSources = [updates.clustering, updates.queue?.clustering];
    for (const source of clusteringSources) {
      if (!source) continue;
      for (const [key, rawValue] of Object.entries(source)) {
        applyClusteringUpdate(key, rawValue);
      }
    }

    if (updates.coverage && tof(updates.coverage) === 'object') {
      nextConfig.coverage = deepMerge(nextConfig.coverage, updates.coverage);
    }

    if (updates.queue && tof(updates.queue) === 'object') {
      const { description, version } = updates.queue;
      if (tof(description) === 'string') {
        nextConfig.queue.description = description;
      }
      if (tof(version) === 'string') {
        nextConfig.queue.version = version;
      }
    }

    if (errors.length) {
      return { success: false, errors };
    }

    nextConfig = this._normalizeConfigStructure(nextConfig);

    try {
      this._validateConfig(nextConfig);
    } catch (error) {
      return { success: false, errors: [error.message] };
    }

    nextConfig.lastUpdated = new Date().toISOString();
    this.config = nextConfig;

    if (!this.options.inMemory) {
      try {
        this._writeConfigToDisk(this.config);
      } catch (error) {
        console.error(`Failed to persist priority config: ${error.message}`);
        return { success: false, errors: [`Failed to persist priority config: ${error.message}`] };
      }
    }

    this._notifyWatchers();
    return { success: true, config: this.getConfig() };
  }

  // Close resources
  close() {
    this.closed = true;
    if (this.fileWatcherActive) {
      try { this.fs.unwatchFile(this.configPath); } catch (_) {}
      this.fileWatcherActive = false;
    }
    this.watchers.clear();
  }
}

module.exports = { ConfigManager };