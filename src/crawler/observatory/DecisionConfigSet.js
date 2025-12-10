/**
 * @fileoverview Decision Config Set - A complete, versioned set of decision-making rules
 * 
 * A DecisionConfigSet bundles together ALL the configuration needed for crawl decisions:
 * - Priority configuration (bonuses, weights, thresholds)
 * - Decision trees (page classification, URL patterns, hub detection)
 * - Classification patterns (URL regex patterns, content signals)
 * - Feature flags (which intelligent features are enabled)
 * 
 * This allows working on multiple different decision-making strategies simultaneously,
 * saving them as named sets, comparing them, and promoting good ones to production.
 * 
 * @example
 * // Save current production config as a baseline
 * const baseline = await DecisionConfigSet.fromProduction('baseline-2025-12-08');
 * await baseline.save();
 * 
 * // Create an experimental variant
 * const experiment = baseline.clone('aggressive-hub-focus');
 * experiment.setPriorityBonus('hub-validated', 25); // Was 3
 * experiment.setFeature('totalPrioritisation', true);
 * await experiment.save();
 * 
 * // Later, promote experiment to production
 * await experiment.promoteToProduction({ backup: true });
 */

const fs = require('fs');
const path = require('path');

/**
 * @typedef {Object} DecisionConfigSetSpec
 * @property {string} name - Human-readable name
 * @property {string} slug - URL-safe identifier
 * @property {string} description - What this config set is for
 * @property {string} [parentSlug] - If cloned, the parent's slug
 * @property {Object} priorityConfig - Queue priority settings
 * @property {Object} decisionTrees - All decision tree definitions
 * @property {Object} features - Feature flags
 * @property {Object} metadata - Creation time, author, etc.
 */

/**
 * Paths to production config files
 */
const PRODUCTION_PATHS = {
  priorityConfig: 'config/priority-config.json',
  decisionTrees: 'config/decision-trees',
  classificationPatterns: 'config/classification-patterns.json'
};

/**
 * Storage directory for config sets
 */
const CONFIG_SETS_DIR = 'config/decision-sets';

class DecisionConfigSet {
  /**
   * @param {DecisionConfigSetSpec} spec
   */
  constructor(spec = {}) {
    this.slug = spec.slug || this._generateSlug();
    this.name = spec.name || 'Unnamed Config Set';
    this.description = spec.description || '';
    this.parentSlug = spec.parentSlug || null;
    
    // Core config components
    this.priorityConfig = spec.priorityConfig || { queue: { bonuses: {}, weights: {} }, features: {} };
    this.decisionTrees = spec.decisionTrees || {};
    this.classificationPatterns = spec.classificationPatterns || {};
    
    // Extracted feature flags (also in priorityConfig.features)
    this.features = spec.features || spec.priorityConfig?.features || {};
    
    // Metadata
    this.metadata = {
      createdAt: spec.metadata?.createdAt || new Date().toISOString(),
      createdBy: spec.metadata?.createdBy || 'system',
      modifiedAt: spec.metadata?.modifiedAt || new Date().toISOString(),
      modifiedBy: spec.metadata?.modifiedBy || 'system',
      version: spec.metadata?.version || '1.0.0',
      isProduction: spec.metadata?.isProduction || false,
      notes: spec.metadata?.notes || []
    };
    
    // Track changes from parent
    this._changeLog = spec._changeLog || [];
  }

  /**
   * Load a config set from production files
   * @param {string} name - Name for this snapshot
   * @param {string} [rootDir] - Project root directory
   * @returns {Promise<DecisionConfigSet>}
   */
  static async fromProduction(name, rootDir = process.cwd()) {
    const spec = {
      name,
      slug: DecisionConfigSet._slugify(name),
      description: `Snapshot of production config at ${new Date().toISOString()}`,
      priorityConfig: {},
      decisionTrees: {},
      classificationPatterns: {},
      metadata: {
        isProduction: true,
        createdAt: new Date().toISOString(),
        notes: ['Loaded from production files']
      }
    };

    // Load priority config
    const priorityPath = path.join(rootDir, PRODUCTION_PATHS.priorityConfig);
    if (fs.existsSync(priorityPath)) {
      spec.priorityConfig = JSON.parse(fs.readFileSync(priorityPath, 'utf8'));
    }

    // Load all decision trees
    const treesDir = path.join(rootDir, PRODUCTION_PATHS.decisionTrees);
    if (fs.existsSync(treesDir)) {
      const treeFiles = fs.readdirSync(treesDir).filter(f => f.endsWith('.json') && !f.includes('schema'));
      for (const file of treeFiles) {
        const treeName = path.basename(file, '.json');
        const treePath = path.join(treesDir, file);
        spec.decisionTrees[treeName] = JSON.parse(fs.readFileSync(treePath, 'utf8'));
      }
    }

    // Load classification patterns if exists
    const patternsPath = path.join(rootDir, PRODUCTION_PATHS.classificationPatterns);
    if (fs.existsSync(patternsPath)) {
      spec.classificationPatterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
    }

    // Extract features
    spec.features = spec.priorityConfig.features || {};

    return new DecisionConfigSet(spec);
  }

  /**
   * Load a saved config set by slug
   * @param {string} slug
   * @param {string} [rootDir]
   * @returns {Promise<DecisionConfigSet>}
   */
  static async load(slug, rootDir = process.cwd()) {
    const setPath = path.join(rootDir, CONFIG_SETS_DIR, `${slug}.json`);
    if (!fs.existsSync(setPath)) {
      throw new Error(`Config set not found: ${slug}`);
    }
    
    const spec = JSON.parse(fs.readFileSync(setPath, 'utf8'));
    return new DecisionConfigSet(spec);
  }

  /**
   * List all saved config sets
   * @param {string} [rootDir]
   * @returns {Promise<Array<{slug: string, name: string, createdAt: string, isProduction: boolean}>>}
   */
  static async list(rootDir = process.cwd()) {
    const setsDir = path.join(rootDir, CONFIG_SETS_DIR);
    if (!fs.existsSync(setsDir)) {
      return [];
    }

    const files = fs.readdirSync(setsDir).filter(f => f.endsWith('.json'));
    const sets = [];

    for (const file of files) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(setsDir, file), 'utf8'));
        sets.push({
          slug: content.slug,
          name: content.name,
          description: content.description,
          createdAt: content.metadata?.createdAt,
          modifiedAt: content.metadata?.modifiedAt,
          isProduction: content.metadata?.isProduction || false,
          parentSlug: content.parentSlug
        });
      } catch (e) {
        // Skip invalid files
      }
    }

    return sets.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
  }

  /**
   * Clone this config set with a new name
   * @param {string} name - Name for the clone
   * @returns {DecisionConfigSet}
   */
  clone(name) {
    const cloneSpec = {
      name,
      slug: DecisionConfigSet._slugify(name),
      description: `Cloned from ${this.name}`,
      parentSlug: this.slug,
      priorityConfig: JSON.parse(JSON.stringify(this.priorityConfig)),
      decisionTrees: JSON.parse(JSON.stringify(this.decisionTrees)),
      classificationPatterns: JSON.parse(JSON.stringify(this.classificationPatterns)),
      features: JSON.parse(JSON.stringify(this.features)),
      metadata: {
        createdAt: new Date().toISOString(),
        createdBy: 'user',
        modifiedAt: new Date().toISOString(),
        modifiedBy: 'user',
        version: '1.0.0',
        isProduction: false,
        notes: [`Cloned from ${this.name} (${this.slug})`]
      }
    };

    return new DecisionConfigSet(cloneSpec);
  }

  /**
   * Save this config set to disk
   * @param {string} [rootDir]
   * @returns {Promise<string>} - Path to saved file
   */
  async save(rootDir = process.cwd()) {
    const setsDir = path.join(rootDir, CONFIG_SETS_DIR);
    if (!fs.existsSync(setsDir)) {
      fs.mkdirSync(setsDir, { recursive: true });
    }

    this.metadata.modifiedAt = new Date().toISOString();

    const setPath = path.join(setsDir, `${this.slug}.json`);
    fs.writeFileSync(setPath, JSON.stringify(this.toJSON(), null, 2), 'utf8');

    return setPath;
  }

  /**
   * Delete this config set from disk
   * @param {string} [rootDir]
   */
  async delete(rootDir = process.cwd()) {
    if (this.metadata.isProduction) {
      throw new Error('Cannot delete production config set');
    }

    const setPath = path.join(rootDir, CONFIG_SETS_DIR, `${this.slug}.json`);
    if (fs.existsSync(setPath)) {
      fs.unlinkSync(setPath);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY CONFIG MUTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set a priority bonus value
   * @param {string} key - Bonus key (e.g., 'hub-validated', 'country-hub-discovery')
   * @param {number} value - New value
   * @param {string} [description] - Optional description
   */
  setPriorityBonus(key, value, description) {
    if (!this.priorityConfig.queue) this.priorityConfig.queue = {};
    if (!this.priorityConfig.queue.bonuses) this.priorityConfig.queue.bonuses = {};

    const old = this.priorityConfig.queue.bonuses[key]?.value ?? this.priorityConfig.queue.bonuses[key];
    
    this.priorityConfig.queue.bonuses[key] = {
      value,
      description: description || this.priorityConfig.queue.bonuses[key]?.description || `Bonus for ${key}`
    };

    this._logChange('setPriorityBonus', { key, oldValue: old, newValue: value });
    this._markModified();
  }

  /**
   * Get a priority bonus value
   * @param {string} key
   * @returns {number|undefined}
   */
  getPriorityBonus(key) {
    const bonus = this.priorityConfig.queue?.bonuses?.[key];
    return typeof bonus === 'object' ? bonus.value : bonus;
  }

  /**
   * Set a priority weight value
   * @param {string} key - Weight key (e.g., 'article', 'nav')
   * @param {number} value - New value
   */
  setPriorityWeight(key, value, description) {
    if (!this.priorityConfig.queue) this.priorityConfig.queue = {};
    if (!this.priorityConfig.queue.weights) this.priorityConfig.queue.weights = {};

    const old = this.priorityConfig.queue.weights[key]?.value ?? this.priorityConfig.queue.weights[key];
    
    this.priorityConfig.queue.weights[key] = {
      value,
      description: description || this.priorityConfig.queue.weights[key]?.description || `Weight for ${key}`
    };

    this._logChange('setPriorityWeight', { key, oldValue: old, newValue: value });
    this._markModified();
  }

  /**
   * Get a priority weight value
   * @param {string} key
   * @returns {number|undefined}
   */
  getPriorityWeight(key) {
    const weight = this.priorityConfig.queue?.weights?.[key];
    return typeof weight === 'object' ? weight.value : weight;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FEATURE FLAG MUTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set a feature flag
   * @param {string} key
   * @param {boolean} enabled
   */
  setFeature(key, enabled) {
    const old = this.features[key];
    this.features[key] = enabled;
    
    // Also update in priorityConfig
    if (!this.priorityConfig.features) this.priorityConfig.features = {};
    this.priorityConfig.features[key] = enabled;

    this._logChange('setFeature', { key, oldValue: old, newValue: enabled });
    this._markModified();
  }

  /**
   * Get a feature flag
   * @param {string} key
   * @returns {boolean}
   */
  getFeature(key) {
    return !!this.features[key];
  }

  /**
   * Get all feature flags
   * @returns {Object<string, boolean>}
   */
  getAllFeatures() {
    return { ...this.features };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DECISION TREE MUTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get a decision tree by name
   * @param {string} treeName
   * @returns {Object|undefined}
   */
  getDecisionTree(treeName) {
    return this.decisionTrees[treeName];
  }

  /**
   * Set/update a decision tree
   * @param {string} treeName
   * @param {Object} treeConfig
   */
  setDecisionTree(treeName, treeConfig) {
    const hadExisting = !!this.decisionTrees[treeName];
    this.decisionTrees[treeName] = treeConfig;

    this._logChange('setDecisionTree', { 
      treeName, 
      action: hadExisting ? 'updated' : 'added',
      categories: Object.keys(treeConfig.categories || {})
    });
    this._markModified();
  }

  /**
   * Get all decision tree names
   * @returns {string[]}
   */
  getDecisionTreeNames() {
    return Object.keys(this.decisionTrees);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPARISON & DIFF
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get diff between this config and another
   * @param {DecisionConfigSet} other
   * @returns {Object[]} Array of differences
   */
  diff(other) {
    const diffs = [];

    // Compare priority bonuses
    const allBonuses = new Set([
      ...Object.keys(this.priorityConfig.queue?.bonuses || {}),
      ...Object.keys(other.priorityConfig.queue?.bonuses || {})
    ]);

    for (const key of allBonuses) {
      const thisVal = this.getPriorityBonus(key);
      const otherVal = other.getPriorityBonus(key);
      if (thisVal !== otherVal) {
        diffs.push({
          type: 'bonus',
          key,
          thisValue: thisVal,
          otherValue: otherVal
        });
      }
    }

    // Compare priority weights
    const allWeights = new Set([
      ...Object.keys(this.priorityConfig.queue?.weights || {}),
      ...Object.keys(other.priorityConfig.queue?.weights || {})
    ]);

    for (const key of allWeights) {
      const thisVal = this.getPriorityWeight(key);
      const otherVal = other.getPriorityWeight(key);
      if (thisVal !== otherVal) {
        diffs.push({
          type: 'weight',
          key,
          thisValue: thisVal,
          otherValue: otherVal
        });
      }
    }

    // Compare features
    const allFeatures = new Set([
      ...Object.keys(this.features),
      ...Object.keys(other.features)
    ]);

    for (const key of allFeatures) {
      const thisVal = this.getFeature(key);
      const otherVal = other.getFeature(key);
      if (thisVal !== otherVal) {
        diffs.push({
          type: 'feature',
          key,
          thisValue: thisVal,
          otherValue: otherVal
        });
      }
    }

    // Compare decision trees (just existence and category count for now)
    const allTrees = new Set([
      ...Object.keys(this.decisionTrees),
      ...Object.keys(other.decisionTrees)
    ]);

    for (const treeName of allTrees) {
      const thisTree = this.decisionTrees[treeName];
      const otherTree = other.decisionTrees[treeName];
      
      if (!thisTree && otherTree) {
        diffs.push({ type: 'tree', key: treeName, thisValue: null, otherValue: 'exists' });
      } else if (thisTree && !otherTree) {
        diffs.push({ type: 'tree', key: treeName, thisValue: 'exists', otherValue: null });
      } else if (thisTree && otherTree) {
        const thisCats = Object.keys(thisTree.categories || {}).length;
        const otherCats = Object.keys(otherTree.categories || {}).length;
        if (thisCats !== otherCats) {
          diffs.push({
            type: 'tree',
            key: treeName,
            thisValue: `${thisCats} categories`,
            otherValue: `${otherCats} categories`
          });
        }
      }
    }

    return diffs;
  }

  /**
   * Get the change log for this config set
   * @returns {Array}
   */
  getChangeLog() {
    return [...this._changeLog];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRODUCTION PROMOTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Promote this config set to production
   * @param {Object} options
   * @param {boolean} [options.backup=true] - Create backup of current production
   * @param {string} [rootDir]
   * @returns {Promise<{backupPath: string|null}>}
   */
  async promoteToProduction({ backup = true } = {}, rootDir = process.cwd()) {
    let backupPath = null;

    // Create backup if requested
    if (backup) {
      const backupDir = path.join(rootDir, 'data/backups/config-snapshots');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      backupPath = path.join(backupDir, `production-backup-${timestamp}.json`);
      
      const currentProd = await DecisionConfigSet.fromProduction('backup', rootDir);
      fs.writeFileSync(backupPath, JSON.stringify(currentProd.toJSON(), null, 2), 'utf8');
    }

    // Write priority config
    const priorityPath = path.join(rootDir, PRODUCTION_PATHS.priorityConfig);
    fs.writeFileSync(priorityPath, JSON.stringify(this.priorityConfig, null, 2), 'utf8');

    // Write decision trees
    const treesDir = path.join(rootDir, PRODUCTION_PATHS.decisionTrees);
    if (!fs.existsSync(treesDir)) {
      fs.mkdirSync(treesDir, { recursive: true });
    }
    for (const [treeName, treeConfig] of Object.entries(this.decisionTrees)) {
      const treePath = path.join(treesDir, `${treeName}.json`);
      fs.writeFileSync(treePath, JSON.stringify(treeConfig, null, 2), 'utf8');
    }

    // Write classification patterns if present
    if (Object.keys(this.classificationPatterns).length > 0) {
      const patternsPath = path.join(rootDir, PRODUCTION_PATHS.classificationPatterns);
      fs.writeFileSync(patternsPath, JSON.stringify(this.classificationPatterns, null, 2), 'utf8');
    }

    // Update this set to mark as production
    this.metadata.isProduction = true;
    this.metadata.notes.push(`Promoted to production at ${new Date().toISOString()}`);
    await this.save(rootDir);

    return { backupPath };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SERIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Convert to JSON-serializable object
   * @returns {Object}
   */
  toJSON() {
    return {
      slug: this.slug,
      name: this.name,
      description: this.description,
      parentSlug: this.parentSlug,
      priorityConfig: this.priorityConfig,
      decisionTrees: this.decisionTrees,
      classificationPatterns: this.classificationPatterns,
      features: this.features,
      metadata: this.metadata,
      _changeLog: this._changeLog
    };
  }

  /**
   * Get a summary for display
   * @returns {Object}
   */
  getSummary() {
    const bonuses = this.priorityConfig.queue?.bonuses || {};
    const weights = this.priorityConfig.queue?.weights || {};
    const enabledFeatures = Object.entries(this.features).filter(([, v]) => v).map(([k]) => k);

    return {
      slug: this.slug,
      name: this.name,
      description: this.description,
      parentSlug: this.parentSlug,
      isProduction: this.metadata.isProduction,
      createdAt: this.metadata.createdAt,
      modifiedAt: this.metadata.modifiedAt,
      stats: {
        bonusCount: Object.keys(bonuses).length,
        weightCount: Object.keys(weights).length,
        treeCount: Object.keys(this.decisionTrees).length,
        enabledFeatureCount: enabledFeatures.length,
        changeLogCount: this._changeLog.length
      },
      enabledFeatures
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  _generateSlug() {
    return `config-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  }

  static _slugify(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }

  _logChange(action, details) {
    this._changeLog.push({
      timestamp: new Date().toISOString(),
      action,
      details
    });

    // Keep log manageable
    if (this._changeLog.length > 500) {
      this._changeLog = this._changeLog.slice(-400);
    }
  }

  _markModified() {
    this.metadata.modifiedAt = new Date().toISOString();
    this.metadata.isProduction = false; // No longer matches production
  }
}

module.exports = { DecisionConfigSet, PRODUCTION_PATHS, CONFIG_SETS_DIR };
