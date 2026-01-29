'use strict';

const EventEmitter = require('events');

/**
 * CrawlPlan - First-class representation of crawl intent.
 *
 * Separates WHAT we want to achieve from HOW we execute it.
 * A plan is declarative: goals, constraints, seeds, and priorities.
 * Execution is handled by the crawler using this plan as guidance.
 *
 * Design principles:
 * - Immutable after freeze() - no changes during execution
 * - Observable goal state transitions
 * - Composable - plans can be merged or extended
 * - Serializable for persistence and sharing
 *
 * @example
 * const plan = CrawlPlan.builder()
 *   .addGoal('discover-articles', { count: 100 })
 *   .setConstraint('maxPages', 500)
 *   .setConstraint('maxDepth', 3)
 *   .addSeed('https://example.com', { priority: 0 })
 *   .build();
 *
 * @extends EventEmitter
 */
class CrawlPlan extends EventEmitter {
  /**
   * Goal type constants.
   */
  static GOALS = Object.freeze({
    DISCOVER_ARTICLES: 'discover-articles',
    MAP_STRUCTURE: 'map-structure',
    REFRESH_CONTENT: 'refresh-content',
    GEOGRAPHIC_COVERAGE: 'geographic-coverage',
    DEPTH_FIRST: 'depth-first',
    BREADTH_FIRST: 'breadth-first',
    SITEMAP_ONLY: 'sitemap-only',
    CUSTOM: 'custom'
  });

  /**
   * Goal status constants.
   */
  static STATUS = Object.freeze({
    PENDING: 'pending',
    IN_PROGRESS: 'in-progress',
    SATISFIED: 'satisfied',
    FAILED: 'failed',
    ABANDONED: 'abandoned'
  });

  /**
   * Priority presets.
   */
  static PRIORITIES = Object.freeze({
    ARTICLES_FIRST: 'articles-first',
    HUBS_FIRST: 'hubs-first',
    DEPTH_FIRST: 'depth-first',
    BREADTH_FIRST: 'breadth-first',
    FRESHNESS: 'freshness',
    DOMAIN_DIVERSITY: 'domain-diversity'
  });

  /**
   * @param {Object} options
   * @param {Array} options.goals - Array of goal objects
   * @param {Object} options.constraints - Constraint key-value pairs
   * @param {Array} options.priorities - Priority configuration
   * @param {Array} options.seeds - Initial seed URLs
   * @param {Object} options.metadata - Additional plan metadata
   */
  constructor(options = {}) {
    super();

    this._goals = [];
    this._constraints = {};
    this._priorities = [];
    this._seeds = [];
    this._metadata = {};
    this._frozen = false;
    this._createdAt = Date.now();
    this._frozenAt = null;

    // Initialize from options
    if (options.goals) {
      options.goals.forEach(g => this._goals.push(this._normalizeGoal(g)));
    }
    if (options.constraints) {
      Object.assign(this._constraints, options.constraints);
    }
    if (options.priorities) {
      this._priorities = [...options.priorities];
    }
    if (options.seeds) {
      options.seeds.forEach(s => this._seeds.push(this._normalizeSeed(s)));
    }
    if (options.metadata) {
      Object.assign(this._metadata, options.metadata);
    }
  }

  // ============================================================
  // GOALS
  // ============================================================

  /**
   * Add a goal to the plan.
   * @param {string} type - Goal type from CrawlPlan.GOALS
   * @param {Object} target - Target specification (e.g., { count: 100 })
   * @param {Object} options - Additional goal options
   * @returns {CrawlPlan} this for chaining
   */
  addGoal(type, target = {}, options = {}) {
    this._checkMutable();
    this._goals.push(this._normalizeGoal({ type, target, ...options }));
    return this;
  }

  /**
   * Normalize a goal object.
   * @private
   */
  _normalizeGoal(goal) {
    const type = typeof goal === 'string' ? goal : goal.type;
    const target = goal.target || {};
    return {
      id: goal.id || `goal-${this._goals.length + 1}`,
      type,
      target,
      status: goal.status || CrawlPlan.STATUS.PENDING,
      priority: goal.priority ?? this._goals.length,
      description: goal.description || null,
      createdAt: Date.now()
    };
  }

  /**
   * Get all goals (frozen copy).
   */
  get goals() {
    return Object.freeze([...this._goals]);
  }

  /**
   * Get goal by ID.
   */
  getGoal(id) {
    return this._goals.find(g => g.id === id) || null;
  }

  /**
   * Get goals by type.
   */
  getGoalsByType(type) {
    return this._goals.filter(g => g.type === type);
  }

  /**
   * Check if a specific goal is satisfied.
   * @param {Object} goal - Goal object
   * @param {Object} context - CrawlContext with current state
   * @returns {boolean}
   */
  isGoalSatisfied(goal, context) {
    const stats = context.stats || context;

    switch (goal.type) {
      case CrawlPlan.GOALS.DISCOVER_ARTICLES:
        return (stats.articles || 0) >= (goal.target.count || 0);

      case CrawlPlan.GOALS.MAP_STRUCTURE:
        return (stats.visited || 0) >= (goal.target.pages || 0);

      case CrawlPlan.GOALS.GEOGRAPHIC_COVERAGE: {
        // Check if we've found enough distinct locations
        const locations = context.getLocationCount?.() || 0;
        return locations >= (goal.target.locations || 0);
      }

      case CrawlPlan.GOALS.REFRESH_CONTENT:
        return (stats.refreshed || 0) >= (goal.target.count || 0);

      case CrawlPlan.GOALS.DEPTH_FIRST:
      case CrawlPlan.GOALS.BREADTH_FIRST:
        // Exploration goals are satisfied when we hit page limit
        return context.isPageBudgetExhausted?.() || false;

      case CrawlPlan.GOALS.SITEMAP_ONLY:
        return context.queuedCount === 0;

      default:
        // Custom goals need external evaluation
        return false;
    }
  }

  /**
   * Check if ALL goals are satisfied.
   */
  isSatisfied(context) {
    return this._goals.every(goal => this.isGoalSatisfied(goal, context));
  }

  /**
   * Check if ANY goal is satisfied.
   */
  hasAnySatisfied(context) {
    return this._goals.some(goal => this.isGoalSatisfied(goal, context));
  }

  /**
   * Get satisfaction percentage across all goals.
   */
  getSatisfactionPercent(context) {
    if (this._goals.length === 0) return 100;

    const progressSum = this._goals.reduce((sum, goal) => {
      return sum + this.getGoalProgress(goal, context);
    }, 0);

    return progressSum / this._goals.length;
  }

  /**
   * Get progress percentage for a single goal.
   */
  getGoalProgress(goal, context) {
    const stats = context.stats || context;

    switch (goal.type) {
      case CrawlPlan.GOALS.DISCOVER_ARTICLES: {
        const current = stats.articles || 0;
        const target = goal.target.count || 1;
        return Math.min(100, (current / target) * 100);
      }

      case CrawlPlan.GOALS.MAP_STRUCTURE: {
        const current = stats.visited || 0;
        const target = goal.target.pages || 1;
        return Math.min(100, (current / target) * 100);
      }

      case CrawlPlan.GOALS.GEOGRAPHIC_COVERAGE: {
        const current = context.getLocationCount?.() || 0;
        const target = goal.target.locations || 1;
        return Math.min(100, (current / target) * 100);
      }

      default:
        return this.isGoalSatisfied(goal, context) ? 100 : 0;
    }
  }

  /**
   * Update goal status.
   */
  updateGoalStatus(goalId, status) {
    const goal = this._goals.find(g => g.id === goalId);
    if (!goal) return false;

    const oldStatus = goal.status;
    goal.status = status;
    goal.statusUpdatedAt = Date.now();

    this.emit('goal:status-changed', { goalId, oldStatus, newStatus: status, goal });
    return true;
  }

  // ============================================================
  // CONSTRAINTS
  // ============================================================

  /**
   * Set a constraint.
   * @param {string} name - Constraint name
   * @param {*} value - Constraint value
   * @returns {CrawlPlan} this for chaining
   */
  setConstraint(name, value) {
    this._checkMutable();
    this._constraints[name] = value;
    return this;
  }

  /**
   * Set multiple constraints at once.
   */
  setConstraints(constraints) {
    this._checkMutable();
    Object.assign(this._constraints, constraints);
    return this;
  }

  /**
   * Get a constraint value.
   */
  getConstraint(name) {
    return this._constraints[name];
  }

  /**
   * Check if constraint exists.
   */
  hasConstraint(name) {
    return name in this._constraints;
  }

  /**
   * Get all constraints (frozen copy).
   */
  get constraints() {
    return Object.freeze({ ...this._constraints });
  }

  /**
   * Check if any constraint would be violated by an action.
   * @param {Object} context - Current crawl context
   * @param {Object} action - Proposed action
   * @returns {{ violated: boolean, constraint: string, message: string } | null}
   */
  wouldViolateConstraint(context, action = {}) {
    const stats = context.stats || context;

    // Check max pages
    if (this._constraints.maxPages !== undefined) {
      const afterPages = (stats.visited || 0) + (action.pages || 1);
      if (afterPages > this._constraints.maxPages) {
        return {
          violated: true,
          constraint: 'maxPages',
          message: `Would exceed maxPages (${afterPages} > ${this._constraints.maxPages})`
        };
      }
    }

    // Check max depth
    if (this._constraints.maxDepth !== undefined && action.depth !== undefined) {
      if (action.depth > this._constraints.maxDepth) {
        return {
          violated: true,
          constraint: 'maxDepth',
          message: `Would exceed maxDepth (${action.depth} > ${this._constraints.maxDepth})`
        };
      }
    }

    // Check max bytes
    if (this._constraints.maxBytes !== undefined && action.bytes !== undefined) {
      const afterBytes = (stats.bytesDownloaded || 0) + action.bytes;
      if (afterBytes > this._constraints.maxBytes) {
        return {
          violated: true,
          constraint: 'maxBytes',
          message: `Would exceed maxBytes`
        };
      }
    }

    // Check max errors
    if (this._constraints.maxErrors !== undefined) {
      if ((stats.errors || 0) >= this._constraints.maxErrors) {
        return {
          violated: true,
          constraint: 'maxErrors',
          message: `Error limit reached (${stats.errors} >= ${this._constraints.maxErrors})`
        };
      }
    }

    // Check domain restrictions
    if (this._constraints.allowedDomains && action.url) {
      try {
        const domain = new URL(action.url).hostname;
        if (!this._constraints.allowedDomains.includes(domain)) {
          return {
            violated: true,
            constraint: 'allowedDomains',
            message: `Domain ${domain} not in allowed list`
          };
        }
      } catch (e) { /* invalid URL, let other validation catch it */ }
    }

    return null;
  }

  // ============================================================
  // PRIORITIES
  // ============================================================

  /**
   * Set priority configuration.
   * @param {string|Array} priority - Priority preset or custom config
   */
  setPriority(priority) {
    this._checkMutable();
    if (typeof priority === 'string') {
      this._priorities = [{ preset: priority }];
    } else if (Array.isArray(priority)) {
      this._priorities = [...priority];
    } else {
      this._priorities = [priority];
    }
    return this;
  }

  /**
   * Get priority configuration.
   */
  get priorities() {
    return Object.freeze([...this._priorities]);
  }

  /**
   * Get primary priority preset.
   */
  get primaryPriority() {
    return this._priorities[0]?.preset || null;
  }

  // ============================================================
  // SEEDS
  // ============================================================

  /**
   * Add a seed URL.
   * @param {string} url - Seed URL
   * @param {Object} metadata - Additional metadata
   */
  addSeed(url, metadata = {}) {
    this._checkMutable();
    this._seeds.push(this._normalizeSeed({ url, ...metadata }));
    return this;
  }

  /**
   * Add multiple seeds at once.
   */
  addSeeds(urls) {
    this._checkMutable();
    urls.forEach(u => {
      if (typeof u === 'string') {
        this._seeds.push(this._normalizeSeed({ url: u }));
      } else {
        this._seeds.push(this._normalizeSeed(u));
      }
    });
    return this;
  }

  /**
   * Normalize a seed object.
   * @private
   */
  _normalizeSeed(seed) {
    return {
      url: seed.url,
      priority: seed.priority ?? 0,
      depth: seed.depth ?? 0,
      type: seed.type || 'seed',
      metadata: seed.metadata || {}
    };
  }

  /**
   * Get all seeds (frozen copy).
   */
  get seeds() {
    return Object.freeze([...this._seeds]);
  }

  /**
   * Get seeds sorted by priority.
   */
  getSeedsByPriority() {
    return [...this._seeds].sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get start domains from seeds.
   */
  get startDomains() {
    const domains = new Set();
    for (const seed of this._seeds) {
      try {
        domains.add(new URL(seed.url).hostname);
      } catch (e) { /* ignore invalid URLs */ }
    }
    return [...domains];
  }

  // ============================================================
  // METADATA
  // ============================================================

  /**
   * Set metadata value.
   */
  setMetadata(key, value) {
    this._metadata[key] = value;
    return this;
  }

  /**
   * Get metadata value.
   */
  getMetadata(key) {
    return this._metadata[key];
  }

  /**
   * Get all metadata.
   */
  get metadata() {
    return Object.freeze({ ...this._metadata });
  }

  // ============================================================
  // LIFECYCLE
  // ============================================================

  /**
   * Freeze the plan (make immutable).
   * Call this before starting execution.
   */
  freeze() {
    if (this._frozen) return this;

    this._frozen = true;
    this._frozenAt = Date.now();

    // Deep freeze internal structures
    Object.freeze(this._goals);
    Object.freeze(this._constraints);
    Object.freeze(this._priorities);
    Object.freeze(this._seeds);
    Object.freeze(this._metadata);

    this.emit('frozen', { plan: this });
    return this;
  }

  /**
   * Check if plan is frozen.
   */
  get isFrozen() {
    return this._frozen;
  }

  /**
   * Check if plan is mutable, throw if frozen.
   * @private
   */
  _checkMutable() {
    if (this._frozen) {
      throw new Error('CrawlPlan is frozen and cannot be modified');
    }
  }

  /**
   * Clone the plan (creates mutable copy).
   */
  clone() {
    return new CrawlPlan({
      goals: this._goals.map(g => ({ ...g })),
      constraints: { ...this._constraints },
      priorities: [...this._priorities],
      seeds: this._seeds.map(s => ({ ...s })),
      metadata: { ...this._metadata }
    });
  }

  /**
   * Merge with another plan (returns new plan).
   */
  merge(other) {
    const merged = this.clone();

    // Merge goals (dedupe by type)
    const existingTypes = new Set(merged._goals.map(g => g.type));
    for (const goal of other._goals || other.goals || []) {
      if (!existingTypes.has(goal.type)) {
        merged._goals.push({ ...goal });
      }
    }

    // Merge constraints (other wins on conflict)
    Object.assign(merged._constraints, other._constraints || other.constraints || {});

    // Merge seeds (dedupe by URL)
    const existingUrls = new Set(merged._seeds.map(s => s.url));
    for (const seed of other._seeds || other.seeds || []) {
      if (!existingUrls.has(seed.url)) {
        merged._seeds.push({ ...seed });
      }
    }

    return merged;
  }

  // ============================================================
  // SERIALIZATION
  // ============================================================

  /**
   * Serialize to JSON.
   */
  toJSON() {
    return {
      goals: this._goals,
      constraints: this._constraints,
      priorities: this._priorities,
      seeds: this._seeds,
      metadata: this._metadata,
      frozen: this._frozen,
      createdAt: this._createdAt,
      frozenAt: this._frozenAt
    };
  }

  /**
   * Create from JSON.
   */
  static fromJSON(json) {
    const plan = new CrawlPlan(json);
    if (json.frozen) {
      plan._frozen = true;
      plan._frozenAt = json.frozenAt;
    }
    plan._createdAt = json.createdAt || Date.now();
    return plan;
  }

  /**
   * Create from crawler config object.
   */
  static fromConfig(config) {
    const plan = new CrawlPlan();

    // Set constraints from config
    if (config.maxPages) plan.setConstraint('maxPages', config.maxPages);
    if (config.maxDepth) plan.setConstraint('maxDepth', config.maxDepth);
    if (config.maxBytes) plan.setConstraint('maxBytes', config.maxBytes);
    if (config.maxTimeMs) plan.setConstraint('maxTimeMs', config.maxTimeMs);
    if (config.maxErrors) plan.setConstraint('maxErrors', config.maxErrors);
    if (config.stayOnDomain) plan.setConstraint('stayOnDomain', config.stayOnDomain);
    if (config.allowedDomains) plan.setConstraint('allowedDomains', config.allowedDomains);

    // Add seed URL
    if (config.startUrl) {
      plan.addSeed(config.startUrl, { depth: 0, priority: 0 });
    }
    if (config.seedUrls) {
      config.seedUrls.forEach((url, i) => {
        plan.addSeed(url, { depth: 0, priority: i + 1 });
      });
    }

    // Infer goals from crawl type
    switch (config.crawlType) {
      case 'intelligent':
        plan.addGoal(CrawlPlan.GOALS.DISCOVER_ARTICLES, {
          count: config.targetArticles || config.maxPages || 100
        });
        plan.setPriority(CrawlPlan.PRIORITIES.ARTICLES_FIRST);
        break;

      case 'discover-structure':
      case 'structure':
        plan.addGoal(CrawlPlan.GOALS.MAP_STRUCTURE, {
          pages: config.maxPages || 100
        });
        plan.setPriority(CrawlPlan.PRIORITIES.BREADTH_FIRST);
        break;

      case 'geography':
      case 'gazetteer':
        plan.addGoal(CrawlPlan.GOALS.GEOGRAPHIC_COVERAGE, {
          locations: config.targetLocations || 50
        });
        plan.addGoal(CrawlPlan.GOALS.DISCOVER_ARTICLES);
        break;

      case 'sitemap':
        plan.addGoal(CrawlPlan.GOALS.SITEMAP_ONLY);
        break;

      case 'refresh':
        plan.addGoal(CrawlPlan.GOALS.REFRESH_CONTENT, {
          count: config.refreshCount || config.maxPages
        });
        break;

      default:
        plan.addGoal(CrawlPlan.GOALS.DISCOVER_ARTICLES);
    }

    // Copy relevant metadata
    plan.setMetadata('crawlType', config.crawlType);
    plan.setMetadata('source', 'config');
    if (config.jobId) plan.setMetadata('jobId', config.jobId);

    return plan;
  }

  // ============================================================
  // BUILDER PATTERN
  // ============================================================

  /**
   * Create a builder for fluent construction.
   */
  static builder() {
    return new CrawlPlanBuilder();
  }
}

/**
 * Builder for fluent CrawlPlan construction.
 */
class CrawlPlanBuilder {
  constructor() {
    this._plan = new CrawlPlan();
  }

  addGoal(type, target = {}, options = {}) {
    this._plan.addGoal(type, target, options);
    return this;
  }

  setConstraint(name, value) {
    this._plan.setConstraint(name, value);
    return this;
  }

  setConstraints(constraints) {
    this._plan.setConstraints(constraints);
    return this;
  }

  setPriority(priority) {
    this._plan.setPriority(priority);
    return this;
  }

  addSeed(url, metadata = {}) {
    this._plan.addSeed(url, metadata);
    return this;
  }

  addSeeds(urls) {
    this._plan.addSeeds(urls);
    return this;
  }

  setMetadata(key, value) {
    this._plan.setMetadata(key, value);
    return this;
  }

  /**
   * Build the plan (freezes it).
   */
  build() {
    return this._plan.freeze();
  }

  /**
   * Build without freezing.
   */
  buildMutable() {
    return this._plan;
  }
}

module.exports = CrawlPlan;
