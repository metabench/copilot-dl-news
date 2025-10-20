/**
 * Country Hub Behavioral Profile
 *
 * Defines goal-driven, state-aware crawling behavior for country hub discovery and utilization.
 * Transforms scattered prioritization logic into a unified behavioral profile with clear objectives.
 *
 * Behavioral Objectives:
 * - Discovery Goal: Systematically find all country hub pages
 * - Validation Goal: Verify discovered hubs contain article links
 * - Indexing Goal: Extract and prioritize article URLs from country hubs
 * - Completion Goal: Achieve comprehensive geographic coverage
 *
 * Behavioral States:
 * - discovery: Generate predictions, prioritize hub discovery
 * - validation: Visit discovered hubs, learn patterns
 * - indexing: Extract article links with high priority
 * - completion: Target remaining coverage gaps
 */

class CountryHubBehavioralProfile {
  constructor(config = {}) {
    this.name = 'country-hub-focused';
    this.description = 'Goal-driven crawling focused on comprehensive country hub discovery and article indexing';

    // Behavioral Goals
    this.goals = {
      coverageTarget: config.coverageTarget || 0.8,      // 80% of gazetteer countries
      validationRate: config.validationRate || 0.9,      // 90% of discovered hubs visited
      articleYield: config.articleYield || 50,           // Articles per hub
      completionTime: config.completionTime || 0.25      // Within first 25% of crawl
    };

    // Behavioral State
    this.state = {
      phase: 'discovery',       // discovery|validation|indexing|completion
      progress: {
        discovered: 0,          // Country hubs discovered
        validated: 0,           // Country hubs successfully visited
        indexed: 0,             // Article URLs indexed from country hubs
        totalCountries: 0,      // Total countries in gazetteer
        crawlProgress: 0        // Overall crawl progress (0-1)
      },
      startTime: Date.now(),
      lastPhaseTransition: Date.now()
    };

    // Behavioral Configuration
    this.config = {
      adaptivePrioritization: config.adaptivePrioritization !== false,
      gapDrivenCompletion: config.gapDrivenCompletion !== false,
      patternLearning: config.patternLearning !== false,
      telemetryEnabled: config.telemetryEnabled !== false
    };

    // Phase-specific settings
    this.phaseSettings = {
      discovery: {
        priorityMultiplier: 1.0,
        focusOnHubs: true,
        maxPredictions: 50
      },
      validation: {
        priorityMultiplier: 0.8,
        focusOnValidation: true,
        retryFailed: true
      },
      indexing: {
        priorityMultiplier: 0.9,
        focusOnArticles: true,
        highYieldOnly: true
      },
      completion: {
        priorityMultiplier: 1.2,
        focusOnGaps: true,
        aggressiveMode: true
      }
    };

    this.logger = config.logger || console;
  }

  /**
   * Initialize behavioral profile with crawler context
   */
  initialize(crawlerContext) {
    this.crawlerContext = crawlerContext;
    this.state.totalCountries = this._getTotalCountries();
    this.logger.log?.(`[CountryHubBehavioralProfile] Initialized with ${this.state.totalCountries} countries`);
    this._emitBehavioralEvent('profile-initialized', {
      goals: this.goals,
      totalCountries: this.state.totalCountries
    });
  }

  /**
   * Update behavioral state based on crawler progress
   */
  updateProgress(crawlerState) {
    const oldPhase = this.state.phase;

    // Update progress metrics
    this.state.progress.discovered = crawlerState.countryHubsDiscovered || 0;
    this.state.progress.validated = crawlerState.countryHubsValidated || 0;
    this.state.progress.indexed = crawlerState.countryArticlesIndexed || 0;
    this.state.progress.crawlProgress = crawlerState.overallProgress || 0;

    // Check for phase transitions
    const newPhase = this._determineCurrentPhase();
    if (newPhase !== oldPhase) {
      this._transitionToPhase(newPhase, oldPhase);
    }

    // Check goal achievement
    this._checkGoalAchievement();
  }

  /**
   * Calculate adaptive priority for URLs based on behavioral state
   */
  calculateAdaptivePriority(url, metadata, basePriority) {
    if (!this.config.adaptivePrioritization) {
      return basePriority;
    }

    const phaseSettings = this.phaseSettings[this.state.phase];
    let adaptivePriority = basePriority;

    // Apply phase-specific priority adjustments
    adaptivePriority *= phaseSettings.priorityMultiplier;

    // Country hub discovery phase
    if (this.state.phase === 'discovery') {
      if (metadata.isCountryHubPrediction) {
        adaptivePriority *= 1.5; // Boost hub predictions
      }
    }

    // Validation phase
    else if (this.state.phase === 'validation') {
      if (metadata.isCountryHub && !metadata.validated) {
        adaptivePriority *= 1.3; // Prioritize unvalidated hubs
      }
    }

    // Indexing phase
    else if (this.state.phase === 'indexing') {
      if (metadata.sourceHubType === 'country') {
        adaptivePriority *= 1.4; // Boost country hub articles
      }
    }

    // Completion phase
    else if (this.state.phase === 'completion') {
      if (metadata.fillsCoverageGap) {
        adaptivePriority *= 1.6; // Aggressively prioritize gap-filling
      }
    }

    return Math.min(adaptivePriority, 100); // Cap at maximum priority
  }

  /**
   * Determine if behavioral goals are being met
   */
  isGoalAchieved(goalName) {
    const progress = this.state.progress;

    switch (goalName) {
      case 'coverage':
        return (progress.discovered / progress.totalCountries) >= this.goals.coverageTarget;

      case 'validation':
        return progress.discovered > 0 ?
          (progress.validated / progress.discovered) >= this.goals.validationRate : false;

      case 'indexing':
        return progress.validated > 0 ?
          (progress.indexed / progress.validated) >= this.goals.articleYield : false;

      case 'completion':
        return progress.crawlProgress <= this.goals.completionTime &&
               (progress.discovered / progress.totalCountries) >= this.goals.coverageTarget;

      default:
        return false;
    }
  }

  /**
   * Get behavioral profile status summary
   */
  getStatusSummary() {
    const progress = this.state.progress;
    const coveragePercent = progress.totalCountries > 0 ?
      (progress.discovered / progress.totalCountries * 100).toFixed(1) : 0;

    const validationPercent = progress.discovered > 0 ?
      (progress.validated / progress.discovered * 100).toFixed(1) : 0;

    const avgArticlesPerHub = progress.validated > 0 ?
      (progress.indexed / progress.validated).toFixed(1) : 0;

    return {
      profile: this.name,
      phase: this.state.phase,
      progress: {
        discovered: progress.discovered,
        validated: progress.validated,
        indexed: progress.indexed,
        totalCountries: progress.totalCountries,
        coveragePercent: parseFloat(coveragePercent),
        validationPercent: parseFloat(validationPercent),
        avgArticlesPerHub: parseFloat(avgArticlesPerHub)
      },
      goals: this.goals,
      goalAchievement: {
        coverage: this.isGoalAchieved('coverage'),
        validation: this.isGoalAchieved('validation'),
        indexing: this.isGoalAchieved('indexing'),
        completion: this.isGoalAchieved('completion')
      }
    };
  }

  /**
   * Get behavioral recommendations for crawler
   */
  getBehavioralRecommendations() {
    const recommendations = [];
    const status = this.getStatusSummary();

    // Coverage recommendations
    if (!status.goalAchievement.coverage) {
      const remaining = status.progress.totalCountries - status.progress.discovered;
      recommendations.push({
        type: 'coverage',
        priority: 'high',
        message: `Discover ${remaining} more country hubs to reach ${this.goals.coverageTarget * 100}% coverage target`,
        action: 'increase-hub-discovery-priority'
      });
    }

    // Validation recommendations
    if (!status.goalAchievement.validation && status.progress.discovered > 0) {
      recommendations.push({
        type: 'validation',
        priority: 'medium',
        message: `Validate ${status.progress.discovered - status.progress.validated} unvisited country hubs`,
        action: 'prioritize-hub-validation'
      });
    }

    // Indexing recommendations
    if (!status.goalAchievement.indexing && status.progress.validated > 0) {
      const needed = status.progress.validated * this.goals.articleYield - status.progress.indexed;
      recommendations.push({
        type: 'indexing',
        priority: 'medium',
        message: `Index ${Math.ceil(needed)} more articles from validated country hubs`,
        action: 'increase-article-priority'
      });
    }

    // Completion recommendations
    if (status.progress.crawlProgress > this.goals.completionTime && !status.goalAchievement.completion) {
      recommendations.push({
        type: 'completion',
        priority: 'high',
        message: 'Crawl completion time exceeded - switch to aggressive gap-filling mode',
        action: 'enable-aggressive-mode'
      });
    }

    return recommendations;
  }

  // Private methods

  _getTotalCountries() {
    // Get total countries from gazetteer
    try {
      const { getAllCountries } = require('../db/sqlite/v1/queries/gazetteer.places');
      // Use openDatabase to avoid full schema initialization
      const { openDatabase } = require('../db/sqlite/v1/connection');
      const gazetteerDb = openDatabase('./data/gazetteer.db', { readonly: true, fileMustExist: true });
      const countries = getAllCountries(gazetteerDb);
      gazetteerDb.close();
      return countries.length;
    } catch (error) {
      this.logger.warn?.('[CountryHubBehavioralProfile] Could not load country count:', error.message);
      return 250; // Fallback default
    }
  }

  _determineCurrentPhase() {
    const progress = this.state.progress;
    const coverageRatio = progress.discovered / progress.totalCountries;

    // Completion phase: High coverage achieved or late in crawl
    if (coverageRatio >= this.goals.coverageTarget ||
        progress.crawlProgress > this.goals.completionTime) {
      return 'completion';
    }

    // Indexing phase: Good validation rate, focus on article extraction
    if (progress.validated > 5 &&
        (progress.validated / progress.discovered) >= 0.7) {
      return 'indexing';
    }

    // Validation phase: Some hubs discovered, need to validate them
    if (progress.discovered > 3) {
      return 'validation';
    }

    // Discovery phase: Initial state, focus on finding hubs
    return 'discovery';
  }

  _transitionToPhase(newPhase, oldPhase) {
    this.state.phase = newPhase;
    this.state.lastPhaseTransition = Date.now();

    this.logger.log?.(`[CountryHubBehavioralProfile] Phase transition: ${oldPhase} → ${newPhase}`);

    this._emitBehavioralEvent('phase-transition', {
      fromPhase: oldPhase,
      toPhase: newPhase,
      progress: this.state.progress,
      timestamp: this.state.lastPhaseTransition
    });
  }

  _checkGoalAchievement() {
    const goals = ['coverage', 'validation', 'indexing', 'completion'];
    const newlyAchieved = [];

    for (const goal of goals) {
      if (this.isGoalAchieved(goal) && !this._wasGoalAchieved(goal)) {
        newlyAchieved.push(goal);
      }
    }

    if (newlyAchieved.length > 0) {
      this._emitBehavioralEvent('goals-achieved', {
        goals: newlyAchieved,
        progress: this.state.progress
      });
    }
  }

  _wasGoalAchieved(goalName) {
    // Simple tracking - in a real implementation, you'd track this in state
    return false; // For now, assume goals aren't previously achieved
  }

  _emitBehavioralEvent(eventType, data) {
    if (!this.config.telemetryEnabled) return;

    // Emit behavioral telemetry event
    if (this.crawlerContext?.telemetry?.emit) {
      this.crawlerContext.telemetry.emit(`behavioral-${eventType}`, {
        profile: this.name,
        ...data
      });
    }
  }

  /**
   * Cleanup method for behavioral profile
   */
  close() {
    // Cleanup any resources if needed
    this.logger?.log?.('[CountryHubBehavioralProfile] Cleanup completed');
  }
}

module.exports = { CountryHubBehavioralProfile };