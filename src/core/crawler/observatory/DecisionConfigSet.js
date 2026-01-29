/**
 * @fileoverview Decision Config Set model (pure, no I/O)
 * 
 * Represents a complete, versioned set of decision-making rules:
 * - Priority configuration (bonuses, weights, thresholds)
 * - Decision trees (page classification, URL patterns, hub detection)
 * - Classification patterns (URL regex patterns, content signals)
 * - Feature flags (which intelligent features are enabled)
 * 
 * Persistence, loading from production, and promotion are handled by
 * repository/service classes (see DecisionConfigSetRepository and
 * DecisionConfigPromotionService). This model remains side-effect free.
 * 
 * @example
 * const set = new DecisionConfigSet({ name: 'baseline', priorityConfig: {...} });
 * set.setPriorityBonus('hub-validated', 10);
 * repository.save(set);
 */

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
 */
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
    this.articleSignals = spec.articleSignals || {};
    
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
   * Clone this config set with a new name
   * @param {string} name - Name for the clone
   * @returns {DecisionConfigSet}
   */
  clone(name) {
    const cloneSpec = {
      name,
      slug: DecisionConfigSet.slugify(name),
      description: `Cloned from ${this.name}`,
      parentSlug: this.slug,
      priorityConfig: JSON.parse(JSON.stringify(this.priorityConfig)),
      decisionTrees: JSON.parse(JSON.stringify(this.decisionTrees)),
      classificationPatterns: JSON.parse(JSON.stringify(this.classificationPatterns)),
      articleSignals: JSON.parse(JSON.stringify(this.articleSignals || {})),
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
      articleSignals: this.articleSignals,
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

  static slugify(name) {
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

module.exports = { DecisionConfigSet };
