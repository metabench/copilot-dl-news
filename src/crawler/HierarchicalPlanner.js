/**
 * Hierarchical Planning with Lookahead - Strategic multi-step planning
 * 
 * Features:
 * - GOFAI integration: plan 3-5 steps ahead
 * - Simulate action sequences to predict outcomes
 * - Backtracking when paths prove unproductive
 * - Branch-and-bound search with learned heuristics
 * - Maintain multiple plan hypotheses, prune low-probability branches
 */

class HierarchicalPlanner {
  constructor({ db, logger = console, maxLookahead = 5, maxBranches = 10, features = {} } = {}) {
    this.db = db;
    this.logger = logger;
    this.maxLookahead = maxLookahead;
    this.maxBranches = maxBranches;
    this.features = features; // Phase 1: Feature flags (e.g., { patternDiscovery: true })

    // Plan hypotheses
    this.activePlans = [];
    this.completedPlans = [];

    // Heuristics cache
    this.heuristics = new Map();

    // Simulation model
    this.outcomePredictor = null;
  }

  /**
   * Generate multi-step plan with lookahead
   */
  async generatePlan(initialState, goal, context = {}) {
    const { domain } = context;
    
    // Phase 2: Adaptive branching based on domain profile
    let lookahead = context.lookahead || this.maxLookahead;
    let maxBranches = context.maxBranches || this.maxBranches;
    
    if (this.features?.adaptiveBranching && domain && this.db) {
      const profile = await this._analyzeDomainProfile(domain);
      lookahead = this._calculateOptimalLookahead(profile, goal);
      maxBranches = this._calculateOptimalBranching(profile);
      
      this.logger.log?.(`[Adaptive Branching] Domain: ${domain}, Lookahead: ${lookahead}, Branches: ${maxBranches}`);
    }

    // Initialize root node
    const root = {
      state: initialState,
      action: null,
      parent: null,
      children: [],
      depth: 0,
      cost: 0,
      estimatedValue: 0,
      probability: 1.0
    };

    // Perform branch-and-bound search
    const plan = await this._branchAndBound(root, goal, lookahead, maxBranches, context);

    // Record plan for learning
    if (plan && domain) {
      await this._recordPlan(domain, plan, context);
    }

    return plan;
  }

  /**
   * Simulate action sequence to predict outcome
   */
  async simulateSequence(actions, initialState, context = {}) {
    let currentState = { ...initialState };
    const predictions = [];
    let cumulativeValue = 0;
    let cumulativeCost = 0;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];

      // Predict next state
      const prediction = await this._predictOutcome(action, currentState, context);

      predictions.push({
        step: i + 1,
        action,
        predictedState: prediction.state,
        expectedValue: prediction.value,
        cost: prediction.cost,
        confidence: prediction.confidence
      });

      // Update cumulative metrics
      cumulativeValue += prediction.value;
      cumulativeCost += prediction.cost;

      // Update state for next iteration
      currentState = prediction.state;

      // Early termination if low confidence
      if (prediction.confidence < 0.3) {
        this.logger.log?.(`[Plan] Low confidence at step ${i + 1}, stopping simulation`);
        break;
      }
    }

    return {
      steps: predictions,
      finalState: currentState,
      totalValue: cumulativeValue,
      totalCost: cumulativeCost,
      feasible: cumulativeValue > cumulativeCost * 1.5 // 1.5x ROI threshold
    };
  }

  /**
   * Execute plan with backtracking
   */
  async executePlan(plan, context = {}) {
    const {
      onStep = null,
      onBacktrack = null,
      maxBacktracks = 3
    } = context;

    let currentStep = 0;
    let backtracks = 0;
    const executedActions = [];
    const results = [];

    while (currentStep < plan.steps.length) {
      const step = plan.steps[currentStep];

      // Execute action
      const result = onStep ? await onStep(step.action, currentStep) : { success: true };

      executedActions.push(step.action);
      results.push(result);

      // Check if action was productive
      if (result.success && result.value > step.expectedValue * 0.5) {
        // Good progress, continue
        currentStep++;
      } else {
        // Unproductive, consider backtracking
        this.logger.warn?.(`[Plan] Step ${currentStep} underperformed, considering backtrack`);

        if (backtracks < maxBacktracks) {
          // Backtrack to previous decision point
          currentStep = Math.max(0, currentStep - 1);
          backtracks++;

          if (onBacktrack) {
            await onBacktrack(currentStep, backtracks);
          }

          // Replan from this point
          this.logger.log?.(`[Plan] Backtracking to step ${currentStep}, replanning...`);
        } else {
          // Max backtracks reached, abort plan
          this.logger.error?.('[Plan] Max backtracks reached, aborting plan');
          break;
        }
      }
    }

    return {
      completed: currentStep === plan.steps.length,
      stepsExecuted: executedActions.length,
      backtracks,
      results
    };
  }

  /**
   * Learn heuristics from plan outcomes
   */
  async learnHeuristics(domain, planOutcomes) {
    if (!domain || planOutcomes.length === 0) {
      return null;
    }

    // Analyze which action sequences performed well
    const successfulSequences = planOutcomes
      .filter(o => {
        const expected = o.expectedValue ?? o.estimatedValue ?? 0;
        const actual = o.actualValue ?? o.value ?? 0;
        const successFlag = typeof o.success === 'boolean' ? o.success : true;
        // Treat reasonably good outcomes as successful when explicit flags are missing
        return successFlag && (expected === 0 || actual >= expected * 0.7);
      })
      .map(o => o.actionSequence || (o.action ? [o.action] : []))
      .filter(seq => seq.length > 0);

    // Fallback: if nothing qualifies as successful, still learn from provided actions
    const sequences = successfulSequences.length > 0
      ? successfulSequences
      : planOutcomes
          .map(o => o.actionSequence || (o.action ? [o.action] : []))
          .filter(seq => seq.length > 0);

    // Extract common patterns
    const patterns = this._extractPatterns(sequences);

    // Store as heuristics
    const heuristic = {
      domain,
      patterns,
      avgLookahead: this._calculateAvgLookahead(planOutcomes),
      branchingFactor: this._calculateBranchingFactor(planOutcomes),
      updated: new Date().toISOString()
    };

    this.heuristics.set(domain, heuristic);

    // Persist to database
    if (this.db) {
      await this._saveHeuristic(domain, heuristic);
    }

    // Phase 3: Cross-domain knowledge sharing
    if (this.features?.crossDomainSharing && this.db) {
      try {
        const similarDomains = await this._findSimilarDomains(domain);
        
        for (const similarDomain of similarDomains) {
          await this._sharePattern(similarDomain, heuristic, {
            sourceConfidence: 0.8,
            transferConfidence: 0.56, // 0.8 * 0.7 transfer penalty
            shared: true
          });
        }

        if (similarDomains.length > 0) {
          this.logger.log?.(`[Cross-Domain Sharing] Shared patterns from ${domain} to ${similarDomains.length} similar domains`);
        }
      } catch (error) {
        this.logger.warn?.(`[Cross-Domain Sharing] Failed: ${error.message}`);
      }
    }

    return heuristic;
  }

  /**
   * Get planning statistics
   */
  getStats() {
    return {
      activePlans: this.activePlans.length,
      completedPlans: this.completedPlans.length,
      heuristicsLearned: this.heuristics.size,
      maxLookahead: this.maxLookahead,
      maxBranches: this.maxBranches
    };
  }

  // Private helpers

  async _branchAndBound(root, goal, lookahead, maxBranches, context) {
    const queue = [root]; // Priority queue (simulated)
    let bestPlan = null;
    let bestValue = -Infinity;
    let bestNode = null; // Track best node even if goal not reached
    let nodesExplored = 0;

    while (queue.length > 0 && nodesExplored < maxBranches * lookahead) {
      // Get most promising node (highest estimated value)
      queue.sort((a, b) => b.estimatedValue - a.estimatedValue);
      const node = queue.shift();

      nodesExplored++;

      // Check if goal reached
      if (this._isGoalState(node.state, goal)) {
        const plan = this._extractPlan(node);
        if (node.estimatedValue > bestValue) {
          bestValue = node.estimatedValue;
          bestPlan = plan;
          bestNode = node;
        }
        continue;
      }

      // Check if we should continue expanding
      if (node.depth >= lookahead) {
        continue;
      }

      // Prune if estimated value too low
      if (node.estimatedValue < bestValue * 0.5) {
        continue;
      }

      // Generate successor actions
      const actions = await this._generateActions(node.state, goal, context);

      // Limit branching factor
      const topActions = actions
        .sort((a, b) => b.estimatedValue - a.estimatedValue)
        .slice(0, maxBranches);

      // Expand node
      for (const action of topActions) {
        const prediction = await this._predictOutcome(action, node.state, context);

        const child = {
          state: prediction.state,
          action,
          parent: node,
          children: [],
          depth: node.depth + 1,
          cost: node.cost + prediction.cost,
          estimatedValue: node.estimatedValue + prediction.value,
          probability: node.probability * prediction.confidence
        };

        node.children.push(child);

        // Track best node so we always return a plan even if the goal isn't fully met
        if (child.estimatedValue > bestValue) {
          bestValue = child.estimatedValue;
          bestNode = child;
        }

        // Add to queue if promising
        if (child.probability > 0.1) {
          queue.push(child);
        }
      }
    }

    this.logger.log?.(`[Plan] Explored ${nodesExplored} nodes, found ${bestPlan ? 'solution' : 'no solution'}`);

    // Fallback to the best partial plan if we never hit the formal goal
    if (!bestPlan && bestNode) {
      bestPlan = this._extractPlan(bestNode);
    }

    return bestPlan;
  }

  async _predictOutcome(action, currentState, context) {
    // Simple heuristic-based prediction (can be replaced with ML model)
    const baseValue = action.estimatedArticles || 50;
    const baseCost = action.estimatedRequests || 10;
    const confidence = action.confidence || 0.7;

    // Adjust based on state
    const stateBonus = currentState.momentum || 0; // Momentum from previous actions
    const adjustedValue = baseValue * (1 + stateBonus);

    // Predict next state
    const nextState = {
      ...currentState,
      hubsDiscovered: (currentState.hubsDiscovered || 0) + 1,
      articlesCollected: (currentState.articlesCollected || 0) + adjustedValue,
      requestsMade: (currentState.requestsMade || 0) + baseCost,
      momentum: stateBonus * 0.9 + (adjustedValue / baseValue - 1) * 0.1 // Decay + new signal
    };

    return {
      state: nextState,
      value: adjustedValue,
      cost: baseCost,
      confidence
    };
  }

  async _generateActions(state, goal, context) {
    // Generate candidate actions from current state
    let { candidates = [] } = context;
    
    // Phase 1 improvement: Pattern-based hub discovery
    if (this.features?.patternDiscovery && context.domain) {
      const patternCandidates = await this._generateCandidatesFromPatterns(context.domain, state, goal);
      candidates = [...candidates, ...patternCandidates];
    }

    // Estimate value for each candidate
    candidates = candidates.map(c => ({
      ...c,
      estimatedValue: this._estimateActionValue(c, state, goal)
    }));

    // Phase 1: Apply cost-aware priority scoring
    if (this.features?.costAwarePriority && this.priorityScorer) {
      try {
        candidates = candidates.map(c => {
          const priority = this.priorityScorer.calculateEnhancedPriority(
            { url: c.url },
            {
              discoveryMethod: c.source || 'adaptive-seed',
              estimatedCostMs: c.estimatedCostMs || c.cost || 100
            }
          );
          return { ...c, priority };
        });
        
        // Sort by priority (higher = better)
        candidates.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        
        this.logger.log?.(`[Cost-Aware Priority] Adjusted ${candidates.length} candidates by cost`);
      } catch (error) {
        this.logger.warn?.(`[Cost-Aware Priority] Failed to score candidates: ${error.message}`);
      }
    }

    return candidates;
  }
  
  /**
   * Generate hub candidates from learned patterns (Phase 1 improvement).
   * @private
   * @param {string} domain - Target domain
   * @param {Object} state - Current planning state
   * @param {Object} goal - Planning goal
   * @returns {Promise<Array<Object>>} Generated candidates
   */
  async _generateCandidatesFromPatterns(domain, state, goal) {
    if (!this.db) {
      return [];
    }

    try {
      // Query pattern_performance table for high-success patterns
      const patterns = this.db.prepare(`
        SELECT 
          pp.pattern_signature,
          pp.success_count,
          pp.avg_value,
          ph.patterns
        FROM pattern_performance pp
        JOIN planning_heuristics ph ON pp.heuristic_id = ph.id
        WHERE ph.domain = ?
          AND pp.success_count >= 3
          AND pp.avg_value > 20
        ORDER BY pp.avg_value DESC, pp.success_count DESC
        LIMIT 5
      `).all(domain);

      const candidates = [];
      
      for (const pattern of patterns) {
        // Parse pattern signature to extract hub pattern
        // Pattern format: "fetch:/news/" or "explore:/articles/"
        const match = pattern.pattern_signature.match(/^(\w+):(.+)$/);
        if (!match) continue;
        
        const [, actionType, pathPattern] = match;
        
        // Generate candidate hub URL from pattern
        const hubUrl = `https://${domain}${pathPattern}`;
        
        candidates.push({
          url: hubUrl,
          type: 'hub',
          source: 'pattern-learning',
          estimatedArticles: Math.round(pattern.avg_value),
          estimatedRequests: actionType === 'fetch' ? 1 : 3,
          confidence: Math.min(pattern.success_count / 10, 0.95), // Higher confidence with more samples
          patternSignature: pattern.pattern_signature,
          successCount: pattern.success_count
        });
      }
      
      this.logger.log?.(`[Pattern Discovery] Generated ${candidates.length} candidates from learned patterns`);
      return candidates;
      
    } catch (error) {
      this.logger.warn?.(`[Pattern Discovery] Failed to query patterns: ${error.message}`);
      return [];
    }
  }

  _estimateActionValue(action, state, goal) {
    // Simple value estimation (can be enhanced with learned heuristics)
    const baseValue = action.estimatedArticles || 50;
    const goalProgress = this._calculateGoalProgress(state, goal);

    // Higher value for actions that move toward goal
    return baseValue * (1 + goalProgress);
  }

  _calculateGoalProgress(state, goal) {
    // How close are we to goal?
    const hubsRatio = (state.hubsDiscovered || 0) / (goal.hubsTarget || 100);
    const articlesRatio = (state.articlesCollected || 0) / (goal.articlesTarget || 5000);

    return Math.min(hubsRatio + articlesRatio, 2.0) / 2.0;
  }

  /**
   * Analyze domain profile for adaptive branching (Phase 2).
   * @private
   */
  async _analyzeDomainProfile(domain) {
    if (!this.db) return { pageCount: 0, hubTypeCount: 1, complexity: 1 };

    try {
      const row = this.db.prepare(`
        SELECT 
          COUNT(DISTINCT url) as pageCount,
          COUNT(DISTINCT CASE WHEN url LIKE '%/category/%' OR url LIKE '%/section/%' THEN url END) as hubTypeCount
        FROM articles
        WHERE url LIKE ?
        LIMIT 1
      `).get(`%${domain}%`);

      const pageCount = row?.pageCount || 0;
      const hubTypeCount = Math.max(row?.hubTypeCount || 1, 1);
      const complexity = Math.log10(pageCount + 10) * hubTypeCount / 5;

      return { pageCount, hubTypeCount, complexity };
    } catch (error) {
      this.logger.warn?.(`[Adaptive Branching] Profile analysis failed: ${error.message}`);
      return { pageCount: 0, hubTypeCount: 1, complexity: 1 };
    }
  }

  /**
   * Calculate optimal lookahead depth based on domain size (Phase 2).
   * @private
   */
  _calculateOptimalLookahead(profile, goal) {
    const targetSize = goal.articlesTarget || 5000;

    // Small domains: 3 steps
    if (targetSize < 1000) return 3;

    // Medium domains: 5 steps
    if (targetSize < 10000) return 5;

    // Large domains: 7 steps
    return 7;
  }

  /**
   * Calculate optimal branching factor based on domain complexity (Phase 2).
   * @private
   */
  _calculateOptimalBranching(profile) {
    const { hubTypeCount, complexity } = profile;

    // Simple structure: 5 branches
    if (hubTypeCount < 5 || complexity < 3) return 5;

    // Medium complexity: 10 branches
    if (hubTypeCount < 15 || complexity < 8) return 10;

    // High complexity: 15 branches
    return 15;
  }

  _isGoalState(state, goal) {
    // Check if state satisfies goal criteria
    const hubsReached = (state.hubsDiscovered || 0) >= (goal.hubsTarget || 100);
    const articlesReached = (state.articlesCollected || 0) >= (goal.articlesTarget || 5000);

    return hubsReached || articlesReached;
  }

  _extractPlan(node) {
    // Backtrack from goal node to root to extract plan
    const steps = [];
    let current = node;

    while (current.parent) {
      steps.unshift({
        action: current.action,
        expectedValue: current.estimatedValue - current.parent.estimatedValue,
        cost: current.cost - current.parent.cost,
        probability: current.probability
      });
      current = current.parent;
    }

    return {
      steps,
      totalValue: node.estimatedValue,
      totalCost: node.cost,
      probability: node.probability,
      length: steps.length
    };
  }

  _extractPatterns(sequences) {
    // Extract common action patterns from successful sequences
    const patterns = new Map();

    for (const seq of sequences) {
      // Handle short sequences by recording single action types
      if (seq.length === 1) {
        const key = seq[0]?.type || 'unknown';
        patterns.set(key, (patterns.get(key) || 0) + 1);
        continue;
      }

      // Look for 2-3 action subsequences
      for (let len = 2; len <= Math.min(3, seq.length); len++) {
        for (let i = 0; i <= seq.length - len; i++) {
          const subseq = seq.slice(i, i + len);
          const key = subseq.map(a => a.type || 'unknown').join('→');

          patterns.set(key, (patterns.get(key) || 0) + 1);
        }
      }
    }

    // Return top patterns
    return Array.from(patterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([pattern, count]) => ({ pattern, count }));
  }

  _calculateAvgLookahead(outcomes) {
    const lookaheads = outcomes.map(o => o.planLength || 0);
    return lookaheads.reduce((sum, l) => sum + l, 0) / lookaheads.length;
  }

  _calculateBranchingFactor(outcomes) {
    const branchingFactors = outcomes.map(o => o.branchingFactor || 1);
    return branchingFactors.reduce((sum, b) => sum + b, 0) / branchingFactors.length;
  }

  async _recordPlan(domain, plan, context) {
    if (!this.db) {
      return;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT INTO hierarchical_plans (
          domain,
          plan_steps,
          estimated_value,
          probability,
          created_at
        ) VALUES (?, ?, ?, ?, datetime('now'))
      `);

      stmt.run(
        domain,
        JSON.stringify(plan.steps),
        plan.totalValue,
        plan.probability
      );
    } catch (error) {
      this.logger.error?.('Failed to record plan', error);
    }
  }

  async _saveHeuristic(domain, heuristic) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO planning_heuristics (
          domain,
          patterns,
          avg_lookahead,
          branching_factor,
          updated_at
        ) VALUES (?, ?, ?, ?, datetime('now'))
      `);

      stmt.run(
        domain,
        JSON.stringify(heuristic.patterns),
        heuristic.avgLookahead,
        heuristic.branchingFactor
      );
    } catch (error) {
      this.logger.error?.('Failed to save heuristic', error);
    }
  }

  close() {
    this.activePlans = [];
    this.completedPlans = [];
    this.heuristics.clear();
  }

  /**
   * Find similar domains for knowledge sharing (Phase 3).
   * @private
   */
  async _findSimilarDomains(domain) {
    if (!this.db) return [];

    try {
      // Find domains with similar structure (hub patterns, depth)
      // Limit to 5 most similar domains
      const stmt = this.db.prepare(`
        SELECT DISTINCT url
        FROM articles
        WHERE url NOT LIKE ?
          AND (
            url LIKE '%/news/%' OR
            url LIKE '%/category/%' OR
            url LIKE '%/section/%' OR
            url LIKE '%/blog/%'
          )
        LIMIT 100
      `);

      const rows = stmt.all(`%${domain}%`);
      
      // Extract unique domains
      const domains = new Set();
      for (const row of rows) {
        try {
          const url = new URL(row.url);
          domains.add(url.hostname);
          if (domains.size >= 5) break;
        } catch {
          // Skip malformed URLs
        }
      }

      return Array.from(domains);
    } catch (error) {
      this.logger.warn?.(`[Cross-Domain Sharing] Failed to find similar domains: ${error.message}`);
      return [];
    }
  }

  /**
   * Share learned pattern with similar domain (Phase 3).
   * @private
   */
  async _sharePattern(targetDomain, sourceHeuristic, metadata) {
    if (!this.db) return;

    try {
      // Check if target domain already has heuristics
      const existing = this.db.prepare(`
        SELECT patterns, confidence
        FROM planning_heuristics
        WHERE domain = ?
      `).get(targetDomain);

      if (existing) {
        // Merge with existing patterns (don't overwrite)
        this.logger.log?.(`[Cross-Domain Sharing] ${targetDomain} already has patterns, skipping`);
        return;
      }

      // Insert shared patterns with reduced confidence
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO planning_heuristics (
          domain,
          patterns,
          confidence,
          sample_size,
          avg_lookahead,
          branching_factor,
          updated_at
        ) VALUES (?, ?, ?, 0, ?, ?, datetime('now'))
      `);

      const patterns = JSON.stringify(sourceHeuristic.patterns || []);
      stmt.run(
        targetDomain,
        patterns,
        metadata.transferConfidence,
        sourceHeuristic.avgLookahead || 5,
        sourceHeuristic.branchingFactor || 10
      );

      this.logger.log?.(`[Cross-Domain Sharing] Shared patterns to ${targetDomain} (confidence: ${metadata.transferConfidence})`);
    } catch (error) {
      this.logger.warn?.(`[Cross-Domain Sharing] Failed to share pattern: ${error.message}`);
    }
  }
}

module.exports = { HierarchicalPlanner };
