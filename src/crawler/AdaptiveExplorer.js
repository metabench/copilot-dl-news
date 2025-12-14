const { getDb } = require('../db');

/**
 * Adaptive Exploration vs Exploitation - Dynamic strategy switching
 * 
 * Features:
 * - Multi-armed bandit algorithms for hub selection
 * - Explore new hub types when current strategy plateaus
 * - Exploit known productive patterns when time-constrained
 * - Thompson sampling for trying uncertain high-upside actions
 * - Learn per-domain exploration coefficient
 */

class AdaptiveExplorer {
  constructor({ db, logger = console, initialEpsilon = 0.2 } = {}) {
    this.db = db;
    if (!this.db) this.db = getDb();
    if (this.db && typeof this.db.getHandle === 'function') this.db = this.db.getHandle();

    this.logger = logger;

    // Exploration parameters
    this.epsilon = initialEpsilon; // ε-greedy parameter
    this.decayRate = 0.99; // Epsilon decay per decision
    this.minEpsilon = 0.05;

    // Multi-armed bandit state
    this.arms = new Map(); // arm -> { pulls, totalReward, alpha, beta }

    // Domain-specific exploration coefficients
    this.domainCoefficients = new Map();

    // Plateau detection
    this.recentRewards = [];
    this.plateauWindow = 5;
    this.plateauThreshold = 0.05; // <5% improvement = plateau
  }

  /**
   * Select action using exploration/exploitation strategy
   */
  async selectAction(candidates, context = {}) {
    const {
      domain,
      strategy = 'thompson-sampling', // 'epsilon-greedy', 'ucb', 'thompson-sampling'
      timeRemaining = null,
      forceExplore = false,
      forceExploit = false
    } = context;

    // Detect plateau
    const plateauDetected = this._detectPlateau();

    // Adjust exploration based on context
    let explorationRate = this._getExplorationRate(domain, {
      timeRemaining,
      plateauDetected,
      forceExplore,
      forceExploit
    });

    // Select action based on strategy
    let selected;
    switch (strategy) {
      case 'epsilon-greedy':
        selected = this._epsilonGreedy(candidates, explorationRate);
        break;
      case 'ucb':
        selected = this._upperConfidenceBound(candidates, context);
        break;
      case 'thompson-sampling':
        selected = this._thompsonSampling(candidates);
        break;
      default:
        selected = candidates[0];
    }

    // Record decision
    await this._recordDecision(domain, selected, strategy, explorationRate);

    return {
      action: selected,
      strategy,
      explorationRate,
      plateauDetected,
      reasoning: this._explainSelection(selected, strategy, explorationRate)
    };
  }

  /**
   * Update after action outcome
   */
  async updateOutcome(action, reward, context = {}) {
    const { domain } = context;

    // Update arm statistics
    this._updateArm(action, reward);

    // Update recent rewards for plateau detection
    this.recentRewards.push(reward);
    if (this.recentRewards.length > this.plateauWindow * 2) {
      this.recentRewards.shift();
    }

    // Decay exploration rate
    this.epsilon = Math.max(this.minEpsilon, this.epsilon * this.decayRate);

    // Record outcome for learning
    if (domain) {
      await this._recordOutcome(domain, action, reward);
    }

    // Learn domain-specific coefficient
    if (domain && this.arms.size > 10) {
      await this._learnDomainCoefficient(domain);
    }
  }

  /**
   * Detect if current strategy has plateaued
   */
  detectPlateau() {
    return this._detectPlateau();
  }

  /**
   * Get recommended exploration rate for domain
   */
  async getExplorationRate(domain) {
    let coefficient = this.domainCoefficients.get(domain);

    if (!coefficient && this.db) {
      coefficient = await this._loadDomainCoefficient(domain);
    }

    return coefficient || this.epsilon;
  }

  /**
   * Force exploration mode (discover new patterns)
   */
  forceExploration(duration = 10) {
    const originalEpsilon = this.epsilon;
    this.epsilon = 0.8; // High exploration

    setTimeout(() => {
      this.epsilon = originalEpsilon;
    }, duration * 1000);

    this.logger.log?.(`[Explore] Forced exploration for ${duration}s`);
  }

  /**
   * Force exploitation mode (use known patterns)
   */
  forceExploitation(duration = 10) {
    const originalEpsilon = this.epsilon;
    this.epsilon = 0.0; // Pure exploitation

    setTimeout(() => {
      this.epsilon = originalEpsilon;
    }, duration * 1000);

    this.logger.log?.(`[Exploit] Forced exploitation for ${duration}s`);
  }

  /**
   * Get exploration statistics
   */
  getStats() {
    const armStats = Array.from(this.arms.entries()).map(([key, arm]) => ({
      arm: key,
      pulls: arm.pulls,
      avgReward: arm.totalReward / arm.pulls,
      confidence: this._calculateConfidence(arm)
    }));

    return {
      epsilon: this.epsilon,
      arms: armStats,
      totalPulls: armStats.reduce((sum, a) => sum + a.pulls, 0),
      plateauDetected: this._detectPlateau(),
      recentAvgReward: this._calculateRecentAvg(),
      domainsLearned: this.domainCoefficients.size
    };
  }

  // Private helpers

  _epsilonGreedy(candidates, epsilon) {
    // With probability ε, explore (random selection)
    // With probability 1-ε, exploit (best known action)

    if (Math.random() < epsilon) {
      // Explore: random selection
      return candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      // Exploit: select best known arm
      return this._selectBestArm(candidates);
    }
  }

  _upperConfidenceBound(candidates, context) {
    // UCB1 algorithm: balance exploitation and exploration
    const totalPulls = Array.from(this.arms.values())
      .reduce((sum, arm) => sum + arm.pulls, 0);

    let bestScore = -Infinity;
    let bestCandidate = candidates[0];

    for (const candidate of candidates) {
      const key = this._getArmKey(candidate);
      const arm = this._getArm(key);

      // UCB score = average reward + exploration bonus
      const avgReward = arm.pulls > 0 ? arm.totalReward / arm.pulls : 0;
      const explorationBonus = Math.sqrt((2 * Math.log(totalPulls + 1)) / (arm.pulls + 1));
      const score = avgReward + explorationBonus;

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    return bestCandidate;
  }

  _thompsonSampling(candidates) {
    // Thompson sampling: sample from posterior distributions
    let bestSample = -Infinity;
    let bestCandidate = candidates[0];

    for (const candidate of candidates) {
      const key = this._getArmKey(candidate);
      const arm = this._getArm(key);

      // Sample from Beta distribution (conjugate prior for Bernoulli)
      const sample = this._sampleBeta(arm.alpha, arm.beta);

      if (sample > bestSample) {
        bestSample = sample;
        bestCandidate = candidate;
      }
    }

    return bestCandidate;
  }

  _selectBestArm(candidates) {
    let bestReward = -Infinity;
    let bestCandidate = candidates[0];

    for (const candidate of candidates) {
      const key = this._getArmKey(candidate);
      const arm = this._getArm(key);

      const avgReward = arm.pulls > 0 ? arm.totalReward / arm.pulls : 0;

      if (avgReward > bestReward) {
        bestReward = avgReward;
        bestCandidate = candidate;
      }
    }

    return bestCandidate;
  }

  _getArmKey(candidate) {
    // Generate unique key for arm (e.g., hub type, domain, etc.)
    return candidate.hubType || candidate.url || 'default';
  }

  _getArm(key) {
    if (!this.arms.has(key)) {
      this.arms.set(key, {
        pulls: 0,
        totalReward: 0,
        alpha: 1, // Beta distribution prior (success)
        beta: 1   // Beta distribution prior (failure)
      });
    }
    return this.arms.get(key);
  }

  _updateArm(action, reward) {
    const key = this._getArmKey(action);
    const arm = this._getArm(key);

    arm.pulls++;
    arm.totalReward += reward;

    // Update Beta distribution parameters
    // Normalize reward to [0, 1] range
    const normalizedReward = Math.max(0, Math.min(1, reward / 100));
    arm.alpha += normalizedReward;
    arm.beta += (1 - normalizedReward);
  }

  _sampleBeta(alpha, beta) {
    // Simple approximation of Beta distribution sampling
    // For production, use a proper stats library
    const gamma1 = this._sampleGamma(alpha);
    const gamma2 = this._sampleGamma(beta);
    return gamma1 / (gamma1 + gamma2);
  }

  _sampleGamma(shape) {
    // Marsaglia and Tsang's method for Gamma sampling
    // Simplified version
    if (shape < 1) {
      return this._sampleGamma(1 + shape) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x, v;
      do {
        x = this._sampleNormal();
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * x * x * x * x) {
        return d * v;
      }

      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v;
      }
    }
  }

  _sampleNormal() {
    // Box-Muller transform for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  _detectPlateau() {
    if (this.recentRewards.length < this.plateauWindow) {
      return false;
    }

    // Calculate improvement over window
    const recent = this.recentRewards.slice(-this.plateauWindow);
    const avg = recent.reduce((sum, r) => sum + r, 0) / recent.length;

    // Compare to previous window
    const previous = this.recentRewards.slice(-this.plateauWindow * 2, -this.plateauWindow);
    if (previous.length < this.plateauWindow) {
      return false;
    }

    const prevAvg = previous.reduce((sum, r) => sum + r, 0) / previous.length;

    // Plateau if improvement < threshold
    const improvement = (avg - prevAvg) / (prevAvg || 1);
    return improvement < this.plateauThreshold;
  }

  _getExplorationRate(domain, options = {}) {
    const {
      timeRemaining,
      plateauDetected,
      forceExplore,
      forceExploit
    } = options;

    if (forceExplore) {
      return 0.8; // High exploration
    }

    if (forceExploit) {
      return 0.0; // Pure exploitation
    }

    let rate = this.epsilon;

    // Use domain-specific coefficient if available
    if (domain && this.domainCoefficients.has(domain)) {
      rate = this.domainCoefficients.get(domain);
    }

    // Increase exploration when plateaued
    if (plateauDetected) {
      rate = Math.min(0.5, rate * 1.5);
    }

    // Decrease exploration when time-constrained
    if (timeRemaining !== null && timeRemaining < 300) { // <5 minutes
      rate = Math.max(0.01, rate * 0.5);
    }

    return rate;
  }

  _explainSelection(selected, strategy, explorationRate) {
    const key = this._getArmKey(selected);
    const arm = this._getArm(key);
    const avgReward = arm.pulls > 0 ? arm.totalReward / arm.pulls : 0;

    const reasons = [
      `Strategy: ${strategy}`,
      `Exploration rate: ${(explorationRate * 100).toFixed(1)}%`,
      `Arm pulls: ${arm.pulls}`,
      `Avg reward: ${avgReward.toFixed(2)}`
    ];

    if (Math.random() < explorationRate) {
      reasons.push('Mode: EXPLORE (trying new options)');
    } else {
      reasons.push('Mode: EXPLOIT (using best known option)');
    }

    return reasons.join('; ');
  }

  _calculateConfidence(arm) {
    // Confidence based on number of pulls and variance
    if (arm.pulls < 3) {
      return 0.1; // Low confidence
    }

    // Use Beta distribution variance as confidence measure
    const variance = (arm.alpha * arm.beta) / 
      ((arm.alpha + arm.beta) * (arm.alpha + arm.beta) * (arm.alpha + arm.beta + 1));

    return Math.max(0, 1 - variance * 10); // Normalize to 0-1
  }

  _calculateRecentAvg() {
    if (this.recentRewards.length === 0) {
      return 0;
    }
    return this.recentRewards.reduce((sum, r) => sum + r, 0) / this.recentRewards.length;
  }

  async _learnDomainCoefficient(domain) {
    if (!this.db) {
      return;
    }

    try {
      // Analyze exploration vs exploitation outcomes
      const stmt = this.db.prepare(`
        SELECT exploration_rate, reward
        FROM exploration_outcomes
        WHERE domain = ?
        ORDER BY created_at DESC
        LIMIT 100
      `);

      const rows = stmt.all(domain);

      if (rows.length < 20) {
        return; // Not enough data
      }

      // Find optimal exploration rate
      const rateToReward = new Map();
      for (const row of rows) {
        const rate = Math.round(row.exploration_rate * 10) / 10; // Bucket by 0.1
        if (!rateToReward.has(rate)) {
          rateToReward.set(rate, []);
        }
        rateToReward.get(rate).push(row.reward);
      }

      // Find rate with highest average reward
      let bestRate = this.epsilon;
      let bestAvg = -Infinity;

      for (const [rate, rewards] of rateToReward.entries()) {
        const avg = rewards.reduce((sum, r) => sum + r, 0) / rewards.length;
        if (avg > bestAvg) {
          bestAvg = avg;
          bestRate = rate;
        }
      }

      this.domainCoefficients.set(domain, bestRate);
      this.logger.log?.(`[Learn] Optimal exploration rate for ${domain}: ${(bestRate * 100).toFixed(1)}%`);

    } catch (error) {
      this.logger.error?.('Failed to learn domain coefficient', error);
    }
  }

  async _loadDomainCoefficient(domain) {
    try {
      const stmt = this.db.prepare(`
        SELECT optimal_exploration_rate
        FROM domain_exploration_coefficients
        WHERE domain = ?
      `);

      const row = stmt.get(domain);
      return row ? row.optimal_exploration_rate : null;
    } catch (error) {
      return null;
    }
  }

  async _recordDecision(domain, selected, strategy, explorationRate) {
    if (!this.db || !domain) {
      return;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT INTO exploration_decisions (
          domain,
          strategy,
          exploration_rate,
          selected_arm,
          created_at
        ) VALUES (?, ?, ?, ?, datetime('now'))
      `);

      stmt.run(
        domain,
        strategy,
        explorationRate,
        this._getArmKey(selected)
      );
    } catch (error) {
      this.logger.error?.('Failed to record decision', error);
    }
  }

  async _recordOutcome(domain, action, reward) {
    if (!this.db) {
      return;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT INTO exploration_outcomes (
          domain,
          arm,
          exploration_rate,
          reward,
          created_at
        ) VALUES (?, ?, ?, ?, datetime('now'))
      `);

      stmt.run(
        domain,
        this._getArmKey(action),
        this.epsilon,
        reward
      );
    } catch (error) {
      this.logger.error?.('Failed to record outcome', error);
    }
  }

  close() {
    this.arms.clear();
    this.domainCoefficients.clear();
    this.recentRewards = [];
  }
}

module.exports = { AdaptiveExplorer };
