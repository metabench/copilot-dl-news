/**
 * Multi-Goal Optimization - Balance competing objectives
 * 
 * Features:
 * - Simultaneous goals: breadth coverage + depth quality + speed + resource efficiency
 * - Pareto optimization: maximize articles while minimizing requests
 * - Dynamic goal prioritization based on progress
 * - User-configurable priority weights
 * - Learn which goal combinations work best per domain type
 */

const { getDb } = require('../db');

class MultiGoalOptimizer {
  constructor({ db, logger = console } = {}) {
    this.db = db;
    if (!this.db) this.db = getDb();
    if (this.db && typeof this.db.getHandle === 'function') this.db = this.db.getHandle();

    this.logger = logger;

    // Goal weights (sum to 1.0)
    this.defaultWeights = {
      breadth: 0.25,    // Coverage of hub types
      depth: 0.25,      // Quality/completeness per hub
      speed: 0.25,      // Time to completion
      efficiency: 0.25  // Resource usage (requests/articles ratio)
    };

    // Dynamic weight adjustment thresholds
    this.thresholds = {
      breadthToDepth: 0.80,  // Shift focus when 80% hubs discovered
      depthToSpeed: 0.90,    // Accelerate when 90% complete
      plateauDetection: 5    // Consecutive actions with <5% improvement
    };

    // Pareto frontier tracking
    this.paretoFrontier = [];
    this.solutionCache = new Map();

    // Domain-specific learning
    this.domainProfiles = new Map();
  }

  /**
   * Optimize action selection for multiple goals
   */
  async optimizeAction(candidates, context = {}) {
    const {
      domain,
      currentProgress = {},
      timeElapsed = 0,
      resourcesUsed = {},
      weights = this.defaultWeights
    } = context;

    // Adjust weights dynamically based on progress
    const adjustedWeights = this._adjustWeights(weights, currentProgress, timeElapsed);

    // Score each candidate on all dimensions
    const scoredCandidates = candidates.map(candidate => {
      const scores = this._scoreCandidate(candidate, context, currentProgress);
      const weightedScore = this._calculateWeightedScore(scores, adjustedWeights);
      
      return {
        ...candidate,
        scores,
        weightedScore,
        paretoOptimal: false
      };
    });

    // Identify Pareto optimal solutions
    const paretoOptimal = this._findParetoFrontier(scoredCandidates);

    // Select best action considering all goals
    const selected = this._selectFromPareto(paretoOptimal, adjustedWeights, context);

    // Record decision for learning
    await this._recordOptimization(domain, selected, adjustedWeights, context);

    return {
      action: selected,
      weights: adjustedWeights,
      paretoFrontier: paretoOptimal,
      reasoning: this._explainSelection(selected, adjustedWeights)
    };
  }

  /**
   * Configure goal weights
   */
  setWeights(weights) {
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
    if (Math.abs(total - 1.0) > 0.01) {
      throw new Error(`Weights must sum to 1.0 (got ${total})`);
    }

    return {
      breadth: weights.breadth || this.defaultWeights.breadth,
      depth: weights.depth || this.defaultWeights.depth,
      speed: weights.speed || this.defaultWeights.speed,
      efficiency: weights.efficiency || this.defaultWeights.efficiency
    };
  }

  /**
   * Learn optimal goal combinations per domain
   */
  async learnDomainProfile(domain) {
    if (!this.db) {
      return null;
    }

    try {
      // Get historical optimizations for this domain
      const stmt = this.db.prepare(`
        SELECT 
          goal_weights,
          outcome_metrics,
          success_score
        FROM goal_optimizations
        WHERE domain = ?
        ORDER BY created_at DESC
        LIMIT 100
      `);

      const rows = stmt.all(domain);

      if (rows.length === 0) {
        return null;
      }

      // Analyze which weight combinations performed best
      const analysis = this._analyzeDomainPerformance(rows);

      // Cache profile
      this.domainProfiles.set(domain, analysis);

      return analysis;
    } catch (error) {
      this.logger.error?.('Failed to learn domain profile', error);
      return null;
    }
  }

  /**
   * Get recommended weights for a domain
   */
  async getRecommendedWeights(domain) {
    let profile = this.domainProfiles.get(domain);

    if (!profile) {
      profile = await this.learnDomainProfile(domain);
    }

    if (!profile) {
      return this.defaultWeights;
    }

    return profile.optimalWeights;
  }

  /**
   * Evaluate outcome against goals
   */
  evaluateOutcome(outcome, goals) {
    const scores = {
      breadth: this._evaluateBreadth(outcome),
      depth: this._evaluateDepth(outcome),
      speed: this._evaluateSpeed(outcome),
      efficiency: this._evaluateEfficiency(outcome)
    };

    const overallScore = this._calculateWeightedScore(scores, goals);

    return {
      scores,
      overallScore,
      paretoOptimal: this._isParetoOptimal(scores)
    };
  }

  /**
   * Get optimization statistics
   */
  getStats() {
    return {
      paretoFrontierSize: this.paretoFrontier.length,
      solutionsCached: this.solutionCache.size,
      domainsLearned: this.domainProfiles.size,
      defaultWeights: this.defaultWeights,
      thresholds: this.thresholds
    };
  }

  // Private helpers

  _scoreCandidate(candidate, context, progress) {
    return {
      breadth: this._scoreBreadth(candidate, progress),
      depth: this._scoreDepth(candidate, progress),
      speed: this._scoreSpeed(candidate, context),
      efficiency: this._scoreEfficiency(candidate, context)
    };
  }

  _scoreBreadth(candidate, progress) {
    // Score based on hub type diversity
    const discoveredTypes = progress.hubTypes || new Set();
    const candidateType = candidate.hubType || 'unknown';
    
    // Higher score for discovering new hub types
    if (!discoveredTypes.has(candidateType)) {
      return 1.0;
    }

    // Medium score for expanding existing types
    const typeCount = progress.hubTypeCounts?.[candidateType] || 0;
    if (typeCount < 10) {
      return 0.7;
    }

    return 0.3; // Low score for well-explored types
  }

  _scoreDepth(candidate, progress) {
    // Score based on expected article yield
    const estimatedArticles = candidate.estimatedArticles || 50;
    const maxArticles = 500;
    
    // Normalize to 0-1
    return Math.min(estimatedArticles / maxArticles, 1.0);
  }

  _scoreSpeed(candidate, context) {
    // Score based on expected time to complete
    const estimatedTime = candidate.estimatedTime || 60000; // ms
    const maxTime = 300000; // 5 minutes
    
    // Lower time = higher score (inverted)
    return Math.max(0, 1.0 - (estimatedTime / maxTime));
  }

  _scoreEfficiency(candidate, context) {
    // Score based on requests/articles ratio
    const estimatedRequests = candidate.estimatedRequests || 10;
    const estimatedArticles = candidate.estimatedArticles || 50;
    
    const ratio = estimatedArticles / estimatedRequests;
    const maxRatio = 20; // 20 articles per request is excellent
    
    return Math.min(ratio / maxRatio, 1.0);
  }

  _calculateWeightedScore(scores, weights) {
    return (
      scores.breadth * weights.breadth +
      scores.depth * weights.depth +
      scores.speed * weights.speed +
      scores.efficiency * weights.efficiency
    );
  }

  _adjustWeights(weights, progress, timeElapsed) {
    const adjusted = { ...weights };

    // Shift from breadth to depth when 80% discovered
    const breadthProgress = progress.hubsDiscovered / (progress.totalHubsEstimate || 100);
    if (breadthProgress > this.thresholds.breadthToDepth) {
      // Reduce breadth weight, increase depth weight
      const shift = 0.15;
      adjusted.breadth = Math.max(0.1, adjusted.breadth - shift);
      adjusted.depth = Math.min(0.5, adjusted.depth + shift);
    }

    // Shift to speed when 90% complete
    const overallProgress = progress.completionPercent || 0;
    if (overallProgress > this.thresholds.depthToSpeed) {
      const shift = 0.15;
      adjusted.depth = Math.max(0.1, adjusted.depth - shift);
      adjusted.speed = Math.min(0.5, adjusted.speed + shift);
    }

    // Detect plateau - increase exploration (breadth)
    if (progress.plateauDetected) {
      const shift = 0.1;
      adjusted.depth = Math.max(0.15, adjusted.depth - shift);
      adjusted.breadth = Math.min(0.4, adjusted.breadth + shift);
    }

    return adjusted;
  }

  _findParetoFrontier(candidates) {
    const paretoOptimal = [];

    for (const candidate of candidates) {
      let isDominated = false;

      for (const other of candidates) {
        if (candidate === other) continue;

        // Check if 'other' dominates 'candidate'
        if (this._dominates(other.scores, candidate.scores)) {
          isDominated = true;
          break;
        }
      }

      if (!isDominated) {
        candidate.paretoOptimal = true;
        paretoOptimal.push(candidate);
      }
    }

    return paretoOptimal;
  }

  _dominates(scoresA, scoresB) {
    // A dominates B if A is >= B on all dimensions and > B on at least one
    let strictlyBetter = false;

    for (const key of ['breadth', 'depth', 'speed', 'efficiency']) {
      if (scoresA[key] < scoresB[key]) {
        return false; // A is worse on this dimension
      }
      if (scoresA[key] > scoresB[key]) {
        strictlyBetter = true;
      }
    }

    return strictlyBetter;
  }

  _selectFromPareto(paretoOptimal, weights, context) {
    if (paretoOptimal.length === 0) {
      return null;
    }

    // Select highest weighted score from Pareto frontier
    let best = paretoOptimal[0];
    let bestScore = best.weightedScore;

    for (const candidate of paretoOptimal) {
      if (candidate.weightedScore > bestScore) {
        bestScore = candidate.weightedScore;
        best = candidate;
      }
    }

    return best;
  }

  _explainSelection(selected, weights) {
    if (!selected) {
      return 'No candidates available';
    }

    const scores = selected.scores;
    const reasons = [];

    // Identify dominant factors
    const contributions = {
      breadth: scores.breadth * weights.breadth,
      depth: scores.depth * weights.depth,
      speed: scores.speed * weights.speed,
      efficiency: scores.efficiency * weights.efficiency
    };

    const sorted = Object.entries(contributions)
      .sort((a, b) => b[1] - a[1]);

    reasons.push(`Primary: ${sorted[0][0]} (score ${scores[sorted[0][0]].toFixed(2)}, weight ${weights[sorted[0][0]].toFixed(2)})`);
    reasons.push(`Secondary: ${sorted[1][0]} (score ${scores[sorted[1][0]].toFixed(2)}, weight ${weights[sorted[1][0]].toFixed(2)})`);

    if (selected.paretoOptimal) {
      reasons.push('Pareto optimal (no dominating alternatives)');
    }

    return reasons.join('; ');
  }

  async _recordOptimization(domain, selected, weights, context) {
    if (!this.db || !domain) {
      return;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT INTO goal_optimizations (
          domain,
          goal_weights,
          selected_action,
          pareto_optimal,
          created_at
        ) VALUES (?, ?, ?, ?, datetime('now'))
      `);

      stmt.run(
        domain,
        JSON.stringify(weights),
        JSON.stringify(selected),
        selected?.paretoOptimal ? 1 : 0
      );
    } catch (error) {
      this.logger.error?.('Failed to record optimization', error);
    }
  }

  _analyzeDomainPerformance(rows) {
    // Aggregate weights by success score
    const weightsBySuccess = rows.map(row => ({
      weights: JSON.parse(row.goal_weights),
      success: row.success_score
    }));

    // Find top 25% performers
    const topPerformers = weightsBySuccess
      .sort((a, b) => b.success - a.success)
      .slice(0, Math.ceil(rows.length * 0.25));

    // Average weights from top performers
    const avgWeights = {
      breadth: 0,
      depth: 0,
      speed: 0,
      efficiency: 0
    };

    for (const perf of topPerformers) {
      avgWeights.breadth += perf.weights.breadth;
      avgWeights.depth += perf.weights.depth;
      avgWeights.speed += perf.weights.speed;
      avgWeights.efficiency += perf.weights.efficiency;
    }

    const count = topPerformers.length;
    avgWeights.breadth /= count;
    avgWeights.depth /= count;
    avgWeights.speed /= count;
    avgWeights.efficiency /= count;

    return {
      optimalWeights: avgWeights,
      sampleSize: count,
      avgSuccess: topPerformers.reduce((sum, p) => sum + p.success, 0) / count
    };
  }

  _evaluateBreadth(outcome) {
    // Ratio of discovered hub types to total
    const discovered = outcome.hubTypesDiscovered || 0;
    const total = outcome.totalHubTypes || 10;
    return discovered / total;
  }

  _evaluateDepth(outcome) {
    // Average articles per hub
    const articles = outcome.articlesCollected || 0;
    const hubs = outcome.hubsCrawled || 1;
    const avgArticles = articles / hubs;
    return Math.min(avgArticles / 100, 1.0); // Normalize to 100 articles
  }

  _evaluateSpeed(outcome) {
    // Time vs estimate
    const actual = outcome.timeElapsed || 0;
    const estimated = outcome.estimatedTime || actual;
    return Math.max(0, 1.0 - (actual / (estimated * 1.5))); // 1.5x estimate = 0 score
  }

  _evaluateEfficiency(outcome) {
    // Articles per request
    const articles = outcome.articlesCollected || 0;
    const requests = outcome.requestsMade || 1;
    const ratio = articles / requests;
    return Math.min(ratio / 20, 1.0); // 20:1 = perfect score
  }

  _isParetoOptimal(scores) {
    // Check against cached frontier
    for (const cached of this.paretoFrontier) {
      if (this._dominates(cached, scores)) {
        return false;
      }
    }
    return true;
  }

  close() {
    this.paretoFrontier = [];
    this.solutionCache.clear();
    this.domainProfiles.clear();
  }
}

module.exports = { MultiGoalOptimizer };
