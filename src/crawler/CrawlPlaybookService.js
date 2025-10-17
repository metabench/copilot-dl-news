/**
 * Crawl Playbook Service - Site-specific crawl intelligence
 * 
 * Coordinates pattern learning, problem clustering, and resolution services
 * to build per-host "playbooks" that capture effective crawl strategies.
 * 
 * Features:
 * - Multi-level hub trees (section → country → region → city)
 * - Adaptive retry cadence based on problem patterns
 * - Cross-crawl knowledge sharing for similar domains
 * - Integration with milestone tracker for goal-directed planning
 * - Explainable intelligence (decision logging and reasoning)
 * - Intelligent budget allocation (ROI-based resource distribution)
 * - Temporal pattern recognition (update frequency learning)
 */

const { DecisionExplainer } = require('./DecisionExplainer');
const { BudgetAllocator } = require('./BudgetAllocator');
const { TemporalPatternLearner } = require('./TemporalPatternLearner');

class CrawlPlaybookService {
  constructor({
    db,
    plannerKnowledgeService,
    problemClusteringService,
    problemResolutionService,
    logger = console
  } = {}) {
    this.db = db;
    this.plannerKnowledgeService = plannerKnowledgeService;
    this.problemClusteringService = problemClusteringService;
    this.problemResolutionService = problemResolutionService;
    this.logger = logger || console;

    // In-memory playbook cache per host
    this.playbookCache = new Map();
    this.cacheExpiry = 3600 * 1000; // 1 hour

    // Active learning: track what we're currently learning
    this.activeLearning = new Map();

    // Quick Win #1: Explainable Intelligence
    this.decisionExplainer = new DecisionExplainer({ logger });

    // Quick Win #2: Intelligent Budget Allocation
    this.budgetAllocator = new BudgetAllocator({ db, logger });

    // Quick Win #3: Temporal Pattern Recognition
    this.temporalLearner = new TemporalPatternLearner({ db, logger });
  }

  /**
   * Load or create playbook for a domain
   * Hydrates from database and applies cross-crawl intelligence
   */
  async loadPlaybook(domain, options = {}) {
    const cacheKey = this._normalizeDomain(domain);
    
    // Check cache first
    if (!options.force && this.playbookCache.has(cacheKey)) {
      const cached = this.playbookCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.playbook;
      }
    }

    try {
      // Load from database
      const stored = await this._loadPlaybookFromDb(domain);
      
      // Enrich with cross-crawl patterns
      const enriched = await this._enrichWithCrossCrawlKnowledge(stored, domain);
      
      // Apply problem cluster insights
      const withProblemStrategy = await this._applyProblemClusterStrategy(enriched, domain);
      
      // Cache the result
      this.playbookCache.set(cacheKey, {
        playbook: withProblemStrategy,
        timestamp: Date.now()
      });

      this._log('info', `Loaded playbook for ${domain}`, {
        hubTreeLevels: withProblemStrategy.hubTree?.levels || 0,
        learnedPatterns: withProblemStrategy.patterns?.length || 0,
        knownProblems: withProblemStrategy.avoidanceRules?.length || 0
      });

      return withProblemStrategy;
    } catch (error) {
      this._log('error', `Failed to load playbook for ${domain}`, error);
      return this._createEmptyPlaybook(domain);
    }
  }

  /**
   * Learn from a successful hub discovery
   * Updates playbook with new pattern and hub tree location
   */
  async learnFromDiscovery({
    domain,
    hubUrl,
    discoveryMethod,
    hubType,
    placeChain = [],
    metadata = {}
  }) {
    try {
      // Record in planner knowledge service
      if (this.plannerKnowledgeService) {
        await this.plannerKnowledgeService.learnFromHubDiscovery({
          domain,
          hubUrl,
          discoveryMethod,
          success: true,
          metadata: {
            hubType,
            placeChain,
            ...metadata
          }
        });
      }

      // Update hub tree structure
      await this._updateHubTree(domain, {
        url: hubUrl,
        type: hubType,
        placeChain,
        discoveryMethod,
        confidence: metadata.confidence || 0.8
      });

      // Extract and store seed pattern
      await this._learnSeedPattern(domain, {
        hubUrl,
        hubType,
        placeChain,
        discoveryMethod
      });

      // Invalidate cache to force reload
      this.playbookCache.delete(this._normalizeDomain(domain));

      this._log('info', `Learned from discovery: ${hubUrl}`, {
        domain,
        hubType,
        placeDepth: placeChain.length
      });
    } catch (error) {
      this._log('error', 'Failed to learn from discovery', error);
    }
  }

  /**
   * Learn from a problem encounter
   * Updates avoidance rules and retry cadence
   */
  async learnFromProblem({
    domain,
    problemKind,
    url,
    scope,
    details = {},
    shouldAvoid = false
  }) {
    try {
      // Process through problem clustering
      let clusterResult = null;
      if (this.problemClusteringService) {
        clusterResult = this.problemClusteringService.processProblem({
          jobId: details.jobId,
          kind: problemKind,
          scope: scope || domain,
          target: url,
          message: details.message,
          details,
          timestamp: new Date().toISOString()
        });
      }

      // Update avoidance rules if needed
      if (shouldAvoid || this._shouldAvoidBasedOnCluster(clusterResult)) {
        // Calculate confidence: explicit shouldAvoid takes precedence
        let confidence;
        if (shouldAvoid) {
          // Explicit avoidance gets high confidence (0.8)
          // Boost further if cluster shows high occurrence
          confidence = clusterResult?.occurrenceCount && clusterResult.occurrenceCount >= 5
            ? Math.min(clusterResult.occurrenceCount / 10, 0.95)
            : 0.8;
        } else if (clusterResult?.occurrenceCount) {
          // Cluster-based avoidance
          confidence = Math.min(clusterResult.occurrenceCount / 10, 0.95);
        } else {
          // Fallback
          confidence = 0.7;
        }

        await this._addAvoidanceRule(domain, {
          pattern: this._extractAvoidancePattern(url, problemKind),
          kind: problemKind,
          confidence,
          learnedAt: new Date().toISOString(),
          details
        });
      }

      // Adjust retry cadence based on problem type
      await this._adjustRetryCadence(domain, problemKind, clusterResult);

      // Invalidate cache
      this.playbookCache.delete(this._normalizeDomain(domain));

      this._log('info', `Learned from problem: ${problemKind}`, {
        domain,
        url,
        shouldAvoid,
        clusterOccurrences: clusterResult?.occurrenceCount
      });
    } catch (error) {
      this._log('error', 'Failed to learn from problem', error);
    }
  }

  /**
   * Generate candidate actions based on playbook
   * Returns prioritized list of URLs to try next
   */
  async generateCandidateActions(domain, context = {}) {
    try {
      const playbook = await this.loadPlaybook(domain);
      const candidates = [];
      let treeActions = [];
      let patternActions = [];

      // Generate from hub tree (explore known structure)
      if (playbook.hubTree) {
        treeActions = this._generateActionsFromHubTree(
          playbook.hubTree,
          context
        );
        candidates.push(...treeActions);
      }

      // Generate from learned patterns
      if (this.plannerKnowledgeService) {
        patternActions = await this.plannerKnowledgeService.generateCandidateHubs(
          domain,
          context
        );
        candidates.push(...patternActions);
      }

      // Generate from problem resolution
      if (this.problemResolutionService && context.missingHubs) {
        const resolutionActions = context.missingHubs.map(hub => ({
          url: hub.url,
          confidence: 0.6,
          source: 'problem-resolution',
          reason: 'Resolving missing hub'
        }));
        candidates.push(...resolutionActions);
      }

      // Filter by avoidance rules
      const filtered = this._filterByAvoidanceRules(candidates, playbook.avoidanceRules);

      // Sort by confidence and priority
      const sorted = this._prioritizeActions(filtered, playbook, context);

      // Log decisions with explanations
      const selected = sorted.slice(0, context.maxActions || 25);
      for (const action of selected) {
        const explanation = this.decisionExplainer.explainSelection(action.url, action, playbook, {
          alternatives: sorted.filter(a => a.url !== action.url).slice(0, 3)
        });
        this.decisionExplainer.logDecision({
          decision: 'selected',
          url: action.url,
          reason: explanation.summary,
          confidence: action.confidence,
          alternatives: explanation.alternatives,
          context: { domain, source: action.source },
          metadata: { hubType: action.hubType, placeChain: action.placeChain }
        });
      }

      this._log('info', `Generated ${sorted.length} candidate actions for ${domain}`, {
        fromTree: treeActions.length,
        fromPatterns: patternActions?.length || 0,
        filtered: candidates.length - filtered.length
      });

      return selected;
    } catch (error) {
      this._log('error', 'Failed to generate candidate actions', error);
      return [];
    }
  }

  /**
   * Get recommended retry strategy for a URL based on playbook
   */
  getRetryStrategy(domain, url, failureKind) {
    try {
      const cached = this.playbookCache.get(this._normalizeDomain(domain));
      if (!cached) {
        return this._defaultRetryStrategy();
      }

      const playbook = cached.playbook;
      const retryCadence = playbook.retryCadence || {};
      
      // Get cadence for this failure type
      const cadence = retryCadence[failureKind] || retryCadence.default || this._defaultRetryStrategy();

      return {
        maxAttempts: cadence.maxAttempts || 3,
        backoffMs: cadence.backoffMs || [1000, 5000, 15000],
        shouldRetry: !this._matchesAvoidanceRule(url, playbook.avoidanceRules),
        strategy: cadence.strategy || 'exponential',
        learnedFrom: cadence.learnedFrom || 'default'
      };
    } catch (error) {
      return this._defaultRetryStrategy();
    }
  }

  /**
   * Check if URL should be avoided based on playbook
   */
  async shouldAvoidUrl(domain, url) {
    try {
      let cached = this.playbookCache.get(this._normalizeDomain(domain));
      if (!cached) {
        // Load playbook if not cached
        const playbook = await this.loadPlaybook(domain);
        cached = this.playbookCache.get(this._normalizeDomain(domain));
        if (!cached) {
          return false;
        }
      }

      const playbook = cached.playbook;
      const shouldAvoid = this._matchesAvoidanceRule(url, playbook.avoidanceRules);

      if (shouldAvoid) {
        // Log avoidance decision with explanation
        const matchedRule = playbook.avoidanceRules.find(rule => {
          try {
            const pattern = new RegExp(rule.pattern, 'i');
            return pattern.test(url);
          } catch {
            return false;
          }
        });

        const explanation = this.decisionExplainer.explainAvoidance(url, playbook.avoidanceRules, matchedRule);
        this.decisionExplainer.logDecision({
          decision: 'avoided',
          url,
          reason: explanation.summary,
          confidence: explanation.confidence,
          context: { domain },
          metadata: { rule: matchedRule }
        });
      }

      return shouldAvoid;
    } catch (error) {
      return false;
    }
  }

  /**
   * Export playbook for analysis or transfer
   */
  async exportPlaybook(domain) {
    try {
      const playbook = await this.loadPlaybook(domain, { force: true });
      
      return {
        domain,
        version: '1.0',
        exportedAt: new Date().toISOString(),
        playbook,
        statistics: await this._getPlaybookStatistics(domain)
      };
    } catch (error) {
      this._log('error', 'Failed to export playbook', error);
      return null;
    }
  }

  /**
   * Import playbook from external source
   */
  async importPlaybook(data) {
    try {
      if (!data?.domain || !data?.playbook) {
        throw new Error('Invalid playbook data');
      }

      const domain = data.domain;
      
      // Store in database
      await this._storePlaybookInDb(domain, data.playbook);
      
      // Invalidate cache
      this.playbookCache.delete(this._normalizeDomain(domain));

      this._log('info', `Imported playbook for ${domain}`);
      
      return true;
    } catch (error) {
      this._log('error', 'Failed to import playbook', error);
      return false;
    }
  }

  // --- Private Methods ---

  async _loadPlaybookFromDb(domain) {
    const playbook = {
      domain,
      hubTree: null,
      patterns: [],
      seedPatterns: [],
      avoidanceRules: [],
      retryCadence: {},
      statistics: {}
    };

    if (!this.db) {
      return playbook;
    }

    try {
      // Load hub tree
      const treeStmt = this.db.prepare(`
        SELECT * FROM cross_crawl_knowledge 
        WHERE source_domain = ? AND knowledge_type = 'hub-tree'
        ORDER BY created_at DESC LIMIT 1
      `);
      const treeRow = treeStmt.get(domain);
      if (treeRow) {
        playbook.hubTree = JSON.parse(treeRow.knowledge_value);
      }

      // Load learned patterns
      if (this.plannerKnowledgeService) {
        playbook.patterns = await this.plannerKnowledgeService.getLearnedPatterns(domain, 0.3);
      }

      // Load seed patterns
      const seedStmt = this.db.prepare(`
        SELECT * FROM cross_crawl_knowledge 
        WHERE source_domain = ? AND knowledge_type = 'seed-pattern'
        ORDER BY confidence_level DESC
      `);
      const seedRows = seedStmt.all(domain);
      playbook.seedPatterns = seedRows.map(row => ({
        ...JSON.parse(row.knowledge_value),
        confidence: row.confidence_level,
        usageCount: row.usage_count
      }));

      // Load avoidance rules
      const avoidStmt = this.db.prepare(`
        SELECT * FROM cross_crawl_knowledge 
        WHERE source_domain = ? AND knowledge_type = 'avoidance-rule'
        AND confidence_level >= 0.5
        ORDER BY confidence_level DESC
      `);
      const avoidRows = avoidStmt.all(domain);
      playbook.avoidanceRules = avoidRows.map(row => ({
        ...JSON.parse(row.knowledge_value),
        confidence: row.confidence_level
      }));

      // Load retry cadence
      const cadenceStmt = this.db.prepare(`
        SELECT * FROM cross_crawl_knowledge 
        WHERE source_domain = ? AND knowledge_type = 'retry-cadence'
        ORDER BY updated_at DESC LIMIT 1
      `);
      const cadenceRow = cadenceStmt.get(domain);
      if (cadenceRow) {
        playbook.retryCadence = JSON.parse(cadenceRow.knowledge_value);
      }

    } catch (error) {
      this._log('error', 'Error loading playbook from database', error);
    }

    return playbook;
  }

  async _storePlaybookInDb(domain, playbook) {
    if (!this.db) {
      return;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO cross_crawl_knowledge (
          source_domain, knowledge_type, knowledge_key, knowledge_value,
          confidence_level, updated_at
        ) VALUES (?, ?, ?, ?, ?, datetime('now'))
      `);

      // Store hub tree
      if (playbook.hubTree) {
        stmt.run(
          domain,
          'hub-tree',
          'main',
          JSON.stringify(playbook.hubTree),
          0.9
        );
      }

      // Store avoidance rules
      if (playbook.avoidanceRules) {
        for (const rule of playbook.avoidanceRules) {
          stmt.run(
            domain,
            'avoidance-rule',
            rule.pattern || rule.kind,
            JSON.stringify(rule),
            rule.confidence || 0.7
          );
        }
      }

      // Store retry cadence
      if (playbook.retryCadence) {
        stmt.run(
          domain,
          'retry-cadence',
          'main',
          JSON.stringify(playbook.retryCadence),
          0.8
        );
      }
    } catch (error) {
      this._log('error', 'Error storing playbook in database', error);
    }
  }

  async _enrichWithCrossCrawlKnowledge(playbook, domain) {
    // Check similar domains for transferable patterns
    const domainParts = domain.split('.');
    const tld = domainParts[domainParts.length - 1];
    
    // Look for patterns from same TLD (e.g., .com, .co.uk)
    // This is placeholder for now - could be sophisticated ML similarity
    
    return playbook;
  }

  async _applyProblemClusterStrategy(playbook, domain) {
    if (!this.problemClusteringService) {
      return playbook;
    }

    // Analyze problem clusters to refine avoidance rules
    // This would integrate with analytics from ProblemClusteringService
    
    return playbook;
  }

  async _updateHubTree(domain, hubData) {
    if (!this.db) {
      return;
    }

    try {
      // Load existing tree
      const stmt = this.db.prepare(`
        SELECT knowledge_value FROM cross_crawl_knowledge 
        WHERE source_domain = ? AND knowledge_type = 'hub-tree' AND knowledge_key = 'main'
      `);
      const row = stmt.get(domain);
      
      let tree = row ? JSON.parse(row.knowledge_value) : { levels: [], byType: {} };

      // Determine level based on place chain length
      // Empty placeChain [] = level 0 (top level, e.g., 'world')
      // placeChain ['world'] = level 1 (e.g., country under world)
      // placeChain ['world', 'france'] = level 2 (e.g., city under country)
      const level = hubData.placeChain?.length || 0;
      
      // Ensure levels array exists
      while (tree.levels.length <= level) {
        tree.levels.push([]);
      }

      // Add to appropriate level
      tree.levels[level].push({
        url: hubData.url,
        type: hubData.type,
        placeChain: hubData.placeChain,
        confidence: hubData.confidence,
        discoveredAt: new Date().toISOString()
      });

      // Index by type
      if (!tree.byType[hubData.type]) {
        tree.byType[hubData.type] = [];
      }
      tree.byType[hubData.type].push(hubData.url);

      // Store back
      const updateStmt = this.db.prepare(`
        INSERT OR REPLACE INTO cross_crawl_knowledge (
          source_domain, knowledge_type, knowledge_key, knowledge_value,
          confidence_level, updated_at
        ) VALUES (?, 'hub-tree', 'main', ?, 0.9, datetime('now'))
      `);
      updateStmt.run(domain, JSON.stringify(tree));

    } catch (error) {
      this._log('error', 'Error updating hub tree', error);
    }
  }

  async _learnSeedPattern(domain, data) {
    if (!this.db) {
      return;
    }

    try {
      // Extract pattern from URL structure
      const url = new URL(data.hubUrl);
      const pathParts = url.pathname.split('/').filter(Boolean);
      
      let pattern = '';
      if (pathParts.length > 0) {
        // Simple pattern: first path segment + place depth
        pattern = `/${pathParts[0]}/depth:${data.placeChain?.length || 0}`;
      }

      const seedPattern = {
        pattern,
        hubType: data.hubType,
        placeDepth: data.placeChain?.length || 0,
        discoveryMethod: data.discoveryMethod,
        example: data.hubUrl
      };

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO cross_crawl_knowledge (
          source_domain, knowledge_type, knowledge_key, knowledge_value,
          confidence_level, usage_count, updated_at
        ) VALUES (
          ?, 'seed-pattern', ?, ?,
          ?,
          COALESCE((SELECT usage_count FROM cross_crawl_knowledge WHERE source_domain = ? AND knowledge_type = 'seed-pattern' AND knowledge_key = ?), 0),
          datetime('now')
        )
      `);
      
      stmt.run(
        domain,
        pattern,
        JSON.stringify(seedPattern),
        0.7,
        domain,
        pattern
      );

    } catch (error) {
      this._log('error', 'Error learning seed pattern', error);
    }
  }

  async _addAvoidanceRule(domain, rule) {
    if (!this.db) {
      return;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO cross_crawl_knowledge (
          source_domain, knowledge_type, knowledge_key, knowledge_value,
          confidence_level, updated_at
        ) VALUES (?, 'avoidance-rule', ?, ?, ?, datetime('now'))
      `);
      
      stmt.run(
        domain,
        rule.pattern,
        JSON.stringify(rule),
        rule.confidence
      );
    } catch (error) {
      this._log('error', 'Error adding avoidance rule', error);
    }
  }

  async _adjustRetryCadence(domain, problemKind, clusterResult) {
    if (!this.db) {
      return;
    }

    try {
      // Load current cadence
      const stmt = this.db.prepare(`
        SELECT knowledge_value FROM cross_crawl_knowledge 
        WHERE source_domain = ? AND knowledge_type = 'retry-cadence' AND knowledge_key = 'main'
      `);
      const row = stmt.get(domain);
      
      let cadence = row ? JSON.parse(row.knowledge_value) : {};

      // Adjust based on problem kind and cluster severity
      const severity = clusterResult?.occurrenceCount || 1;
      
      if (!cadence[problemKind]) {
        cadence[problemKind] = {
          maxAttempts: 3,
          backoffMs: [1000, 5000, 15000],
          strategy: 'exponential',
          learnedFrom: 'default'
        };
      }

      // Reduce attempts for frequently failing patterns
      if (severity > 5) {
        cadence[problemKind].maxAttempts = Math.max(1, cadence[problemKind].maxAttempts - 1);
        cadence[problemKind].backoffMs = cadence[problemKind].backoffMs.map(ms => ms * 1.5);
        cadence[problemKind].learnedFrom = 'adaptive';
      }

      // Store back
      const updateStmt = this.db.prepare(`
        INSERT OR REPLACE INTO cross_crawl_knowledge (
          source_domain, knowledge_type, knowledge_key, knowledge_value,
          confidence_level, updated_at
        ) VALUES (?, 'retry-cadence', 'main', ?, 0.8, datetime('now'))
      `);
      updateStmt.run(domain, JSON.stringify(cadence));

    } catch (error) {
      this._log('error', 'Error adjusting retry cadence', error);
    }
  }

  _generateActionsFromHubTree(hubTree, context) {
    const actions = [];
    
    if (!hubTree || !hubTree.levels) {
      return actions;
    }

    // Explore next level of hub tree
    const currentDepth = context.currentPlaceDepth || 0;
    const nextLevel = hubTree.levels[currentDepth + 1];
    
    if (nextLevel) {
      for (const hub of nextLevel) {
        actions.push({
          url: hub.url,
          confidence: hub.confidence || 0.7,
          source: 'hub-tree',
          reason: `Explore level ${currentDepth + 1} of hub tree`,
          hubType: hub.type,
          placeChain: hub.placeChain
        });
      }
    }

    return actions;
  }

  _filterByAvoidanceRules(candidates, avoidanceRules) {
    if (!avoidanceRules || avoidanceRules.length === 0) {
      return candidates;
    }

    return candidates.filter(candidate => {
      return !this._matchesAvoidanceRule(candidate.url, avoidanceRules);
    });
  }

  _matchesAvoidanceRule(url, avoidanceRules) {
    if (!avoidanceRules || avoidanceRules.length === 0) {
      return false;
    }

    for (const rule of avoidanceRules) {
      if (rule.confidence < 0.5) continue; // Only apply high-confidence rules
      
      try {
        const pattern = new RegExp(rule.pattern, 'i');
        if (pattern.test(url)) {
          return true;
        }
      } catch (error) {
        // Skip invalid regex
        continue;
      }
    }

    return false;
  }

  _prioritizeActions(actions, playbook, context) {
    // Sort by confidence, then by source priority
    const sourcePriority = {
      'hub-tree': 3,
      'learned_pattern': 2,
      'problem-resolution': 1
    };

    return actions.sort((a, b) => {
      // Primary: confidence
      if (Math.abs(a.confidence - b.confidence) > 0.1) {
        return b.confidence - a.confidence;
      }
      
      // Secondary: source priority
      const aPriority = sourcePriority[a.source] || 0;
      const bPriority = sourcePriority[b.source] || 0;
      
      return bPriority - aPriority;
    });
  }

  _extractAvoidancePattern(url, problemKind) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      
      // Create pattern based on problem kind
      if (problemKind === 'robots-blocked') {
        // Match the specific path segment
        return path.replace(/\d+/g, '\\d+');
      } else if (problemKind === 'paywall') {
        // Match similar article paths
        return path.split('/').slice(0, -1).join('/') + '/.*';
      } else {
        // Generic: match the path structure
        return path.replace(/[^/]+/g, '[^/]+');
      }
    } catch (error) {
      return url;
    }
  }

  _shouldAvoidBasedOnCluster(clusterResult) {
    if (!clusterResult) {
      return false;
    }

    // Avoid if problem is recurring frequently
    return clusterResult.occurrenceCount >= 5;
  }

  _defaultRetryStrategy() {
    return {
      maxAttempts: 3,
      backoffMs: [1000, 5000, 15000],
      shouldRetry: true,
      strategy: 'exponential',
      learnedFrom: 'default'
    };
  }

  _createEmptyPlaybook(domain) {
    return {
      domain,
      hubTree: { levels: [], byType: {} },
      patterns: [],
      seedPatterns: [],
      avoidanceRules: [],
      retryCadence: {},
      statistics: {}
    };
  }

  async _getPlaybookStatistics(domain) {
    if (!this.db) {
      return {};
    }

    try {
      const stmt = this.db.prepare(`
        SELECT 
          knowledge_type,
          COUNT(*) as count,
          AVG(confidence_level) as avg_confidence,
          SUM(usage_count) as total_usage
        FROM cross_crawl_knowledge 
        WHERE source_domain = ?
        GROUP BY knowledge_type
      `);
      
      const rows = stmt.all(domain);
      
      const stats = {};
      for (const row of rows) {
        stats[row.knowledge_type] = {
          count: row.count,
          avgConfidence: row.avg_confidence,
          totalUsage: row.total_usage
        };
      }
      
      return stats;
    } catch (error) {
      return {};
    }
  }

  _normalizeDomain(domain) {
    return domain.toLowerCase().trim();
  }

  _log(level, message, details) {
    if (!this.logger || typeof this.logger[level] !== 'function') {
      return;
    }
    
    try {
      if (details) {
        this.logger[level](`[CrawlPlaybook] ${message}`, details);
      } else {
        this.logger[level](`[CrawlPlaybook] ${message}`);
      }
    } catch (error) {
      // Ignore logging errors
    }
  }

  // ========================================
  // Quick Win #2: Budget Allocation API
  // ========================================

  /**
   * Allocate crawl budget across hubs based on estimated value and ROI
   * @param {string} domain - Domain to allocate budget for
   * @param {number} totalBudget - Total crawl budget (request count or time)
   * @param {object} context - Additional context (strategy, population data, etc.)
   * @returns {Promise<Array>} Sorted allocations with ROI scores
   */
  async allocateCrawlBudget(domain, totalBudget, context = {}) {
    return this.budgetAllocator.allocateBudget(domain, totalBudget, context);
  }

  /**
   * Get recommended crawl depth for a hub
   * @param {string} hubType - Hub type (section, country, region, city)
   * @param {number} estimatedValue - Estimated value of the hub
   * @param {object} context - Additional context (strategy, etc.)
   * @returns {number} Recommended depth (2-8)
   */
  getRecommendedDepth(hubType, estimatedValue, context = {}) {
    return this.budgetAllocator.getRecommendedDepth(hubType, estimatedValue, context);
  }

  /**
   * Update hub performance after crawling
   * @param {string} domain - Domain
   * @param {string} hubUrl - Hub URL
   * @param {string} hubType - Hub type
   * @param {number} actualArticles - Articles found
   * @param {number} depth - Depth explored
   */
  async updateHubPerformance(domain, hubUrl, hubType, actualArticles, depth) {
    await this.budgetAllocator.updateHubPerformance(domain, hubUrl, hubType, actualArticles, depth);
  }

  /**
   * Check if a hub is exhausted (diminishing returns)
   * @param {string} domain - Domain
   * @param {string} hubUrl - Hub URL
   * @returns {Promise<boolean>} True if hub is exhausted
   */
  async isHubExhausted(domain, hubUrl) {
    return this.budgetAllocator.isHubExhausted(domain, hubUrl);
  }

  /**
   * Get budget allocation statistics
   * @returns {object} Allocation stats
   */
  getBudgetStats() {
    return this.budgetAllocator.getStats();
  }

  // ========================================
  // Quick Win #3: Temporal Pattern Learning API
  // ========================================

  /**
   * Learn update pattern for a hub
   * @param {string} domain - Domain
   * @param {string} hubUrl - Hub URL
   * @param {string} hubType - Hub type
   * @returns {Promise<object>} Learned pattern (frequency, confidence, avgNewArticles)
   */
  async learnUpdatePattern(domain, hubUrl, hubType) {
    return this.temporalLearner.learnUpdatePattern(domain, hubUrl, hubType);
  }

  /**
   * Record a hub visit for pattern learning
   * @param {string} domain - Domain
   * @param {string} hubUrl - Hub URL
   * @param {string} hubType - Hub type
   * @param {number} articlesFound - Total articles found
   * @param {number} newArticles - New articles since last visit
   */
  async recordVisit(domain, hubUrl, hubType, articlesFound, newArticles) {
    await this.temporalLearner.recordVisit(domain, hubUrl, hubType, articlesFound, newArticles);
  }

  /**
   * Get recommended next visit time for a hub
   * @param {string} domain - Domain
   * @param {string} hubUrl - Hub URL
   * @returns {Promise<object>} Next visit recommendation
   */
  async getNextVisitTime(domain, hubUrl) {
    return this.temporalLearner.getNextVisitTime(domain, hubUrl);
  }

  /**
   * Check if a hub should be revisited now
   * @param {string} domain - Domain
   * @param {string} hubUrl - Hub URL
   * @returns {Promise<object>} Revisit recommendation with explanation
   */
  async shouldRevisit(domain, hubUrl) {
    return this.temporalLearner.shouldRevisit(domain, hubUrl);
  }

  /**
   * Identify breaking news hubs (high-frequency, high-confidence)
   * @param {string} domain - Domain
   * @param {number} threshold - Confidence threshold (default 0.8)
   * @returns {Promise<Array>} Breaking news hubs sorted by avgNewArticles
   */
  async identifyBreakingNewsHubs(domain, threshold = 0.8) {
    return this.temporalLearner.identifyBreakingNewsHubs(domain, threshold);
  }

  /**
   * Get temporal statistics
   * @returns {object} Temporal pattern statistics
   */
  getTemporalStats() {
    return this.temporalLearner.getStats();
  }

  // ========================================
  // Quick Win #1: Decision Explanation API
  // ========================================

  /**
   * Get decision explanations for recent decisions
   * @param {object} filters - Filter criteria (decision, url, minConfidence, etc.)
   * @returns {Array} Filtered decision logs
   */
  getDecisionExplanations(filters = {}) {
    return this.decisionExplainer.getDecisions(filters);
  }

  /**
   * Get decision statistics
   * @returns {object} Aggregated decision stats
   */
  getDecisionStats() {
    return this.decisionExplainer.getDecisionStats();
  }

  /**
   * Generate decision tree visualization data
   * @param {Array} candidateActions - Candidate actions
   * @param {Array} finalActions - Selected actions
   * @param {Array} avoidanceRules - Avoidance rules
   * @returns {object} Decision tree structure
   */
  generateDecisionTree(candidateActions, finalActions, avoidanceRules) {
    return this.decisionExplainer.generateDecisionTree(candidateActions, finalActions, avoidanceRules);
  }

  /**
   * Export decisions for analysis
   * @param {string} format - Export format ('json', 'csv', 'summary')
   * @returns {string} Exported data
   */
  exportDecisions(format = 'json') {
    return this.decisionExplainer.exportDecisions(format);
  }

  // ========================================
  // Cleanup
  // ========================================

  close() {
    this.playbookCache.clear();
    this.activeLearning.clear();
    
    // Close Quick Win components
    if (this.decisionExplainer) {
      this.decisionExplainer.close();
    }
    if (this.budgetAllocator) {
      this.budgetAllocator.close();
    }
    if (this.temporalLearner) {
      this.temporalLearner.close();
    }
  }
}

module.exports = { CrawlPlaybookService };
