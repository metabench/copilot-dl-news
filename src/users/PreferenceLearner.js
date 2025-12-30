'use strict';

/**
 * PreferenceLearner - Learn user preferences from behavior
 * 
 * Analyzes user events (article views, completions, shares) to build
 * a preference profile with weighted interests across:
 * - Categories (technology, politics, sports, etc.)
 * - Topics (from topic modeling)
 * - Entities (people, organizations, places)
 * - Sources (news domains)
 * 
 * Uses temporal decay: older interactions count less.
 * 
 * @module PreferenceLearner
 */

/**
 * Default decay rate: 30-day half-life
 * weight = e^(-age_days / decayDays)
 */
const DEFAULT_DECAY_DAYS = 30;

/**
 * Event weights for preference learning
 */
const EVENT_WEIGHTS = {
  article_view: 1.0,
  article_complete: 2.0,  // Completion is stronger signal
  article_share: 3.0      // Sharing is strongest signal
};

/**
 * Minimum events needed before generating preferences
 */
const MIN_EVENTS_THRESHOLD = 5;

/**
 * Max weight for any single item (prevents domination)
 */
const MAX_WEIGHT = 10.0;

/**
 * PreferenceLearner class
 */
class PreferenceLearner {
  /**
   * Create a PreferenceLearner
   * 
   * @param {Object} options - Configuration
   * @param {Object} options.userAdapter - User database adapter
   * @param {Object} [options.logger] - Logger instance
   * @param {number} [options.decayDays=30] - Half-life for temporal decay
   */
  constructor(options = {}) {
    if (!options.userAdapter) {
      throw new Error('PreferenceLearner requires a userAdapter');
    }
    
    this.userAdapter = options.userAdapter;
    this.logger = options.logger || console;
    this.decayDays = options.decayDays || DEFAULT_DECAY_DAYS;
  }

  /**
   * Learn preferences for a user from their behavior
   * 
   * @param {number} userId - User ID
   * @param {Object} [options] - Learning options
   * @param {number} [options.lookbackDays=60] - Days of history to analyze
   * @param {boolean} [options.save=true] - Whether to save to database
   * @returns {Object} Learned preferences
   */
  async learnPreferences(userId, { lookbackDays = 60, save = true } = {}) {
    // Get article views with metadata
    const views = this.userAdapter.getArticleViewsWithMetadata(userId, 500);
    
    if (views.length < MIN_EVENTS_THRESHOLD) {
      this.logger.log(`[PreferenceLearner] User ${userId} has only ${views.length} views, below threshold`);
      return {
        userId,
        status: 'insufficient_data',
        viewCount: views.length,
        threshold: MIN_EVENTS_THRESHOLD
      };
    }
    
    // Initialize weight accumulators
    const categoryWeights = {};
    const topicWeights = {};
    const sourceWeights = {};
    const entityWeights = {};
    
    const now = Date.now();
    
    // Process each view
    for (const view of views) {
      // Calculate temporal decay
      const viewTime = new Date(view.timestamp).getTime();
      const ageDays = (now - viewTime) / (1000 * 60 * 60 * 24);
      const decay = Math.exp(-ageDays / this.decayDays);
      
      // Base weight from event type and duration
      let eventWeight = EVENT_WEIGHTS.article_view;
      if (view.durationMs && view.durationMs > 60000) {
        // More than 1 minute = completion signal
        eventWeight = EVENT_WEIGHTS.article_complete;
      }
      
      const weight = eventWeight * decay;
      
      // Accumulate category weight
      if (view.category) {
        categoryWeights[view.category] = (categoryWeights[view.category] || 0) + weight;
      }
      
      // Accumulate source weight
      if (view.host) {
        sourceWeights[view.host] = (sourceWeights[view.host] || 0) + weight;
      }
    }
    
    // Get additional events (shares, searches) for stronger signals
    const allEvents = this.userAdapter.getEventsSince(
      userId, 
      new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString()
    );
    
    for (const event of allEvents) {
      if (event.eventType === 'article_share' && event.contentId) {
        // Find the view for this content to get category
        const view = views.find(v => v.contentId === event.contentId);
        if (view && view.category) {
          categoryWeights[view.category] = (categoryWeights[view.category] || 0) + EVENT_WEIGHTS.article_share;
        }
        if (view && view.host) {
          sourceWeights[view.host] = (sourceWeights[view.host] || 0) + EVENT_WEIGHTS.article_share;
        }
      }
      
      if (event.eventType === 'search_query' && event.metadata) {
        // Extract topics from search queries
        const query = event.metadata.query;
        if (query) {
          // Use query terms as pseudo-topics
          const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
          for (const term of terms) {
            topicWeights[term] = (topicWeights[term] || 0) + 0.5;
          }
        }
      }
    }
    
    // Normalize weights
    const normalizedCategory = this._normalizeWeights(categoryWeights);
    const normalizedTopics = this._normalizeWeights(topicWeights);
    const normalizedSources = this._normalizeWeights(sourceWeights);
    const normalizedEntities = this._normalizeWeights(entityWeights);
    
    const preferences = {
      userId,
      categoryWeights: normalizedCategory,
      topicWeights: normalizedTopics,
      sourceWeights: normalizedSources,
      entityWeights: normalizedEntities,
      metadata: {
        viewCount: views.length,
        eventCount: allEvents.length,
        learnedAt: new Date().toISOString(),
        lookbackDays
      }
    };
    
    // Save to database if requested
    if (save) {
      this.userAdapter.savePreferences({
        userId,
        categoryWeights: normalizedCategory,
        topicWeights: normalizedTopics,
        entityWeights: normalizedEntities,
        sourceWeights: normalizedSources
      });
      
      this.logger.log(`[PreferenceLearner] Saved preferences for user ${userId}: ${Object.keys(normalizedCategory).length} categories, ${Object.keys(normalizedTopics).length} topics`);
    }
    
    return preferences;
  }

  /**
   * Get current preferences for a user
   * 
   * @param {number} userId - User ID
   * @returns {Object|null} Current preferences or null
   */
  getPreferences(userId) {
    return this.userAdapter.getPreferences(userId);
  }

  /**
   * Check if user has enough data for personalization
   * 
   * @param {number} userId - User ID
   * @returns {Object} Status and counts
   */
  checkPersonalizationReadiness(userId) {
    const views = this.userAdapter.getArticleViewsWithMetadata(userId, MIN_EVENTS_THRESHOLD + 1);
    const preferences = this.userAdapter.getPreferences(userId);
    
    return {
      hasEnoughData: views.length >= MIN_EVENTS_THRESHOLD,
      viewCount: views.length,
      threshold: MIN_EVENTS_THRESHOLD,
      hasPreferences: !!preferences,
      preferencesUpdatedAt: preferences?.updatedAt || null
    };
  }

  /**
   * Incrementally update preferences with new event
   * Faster than full relearning for real-time updates
   * 
   * @param {number} userId - User ID
   * @param {Object} event - New event
   * @param {string} [event.category] - Article category
   * @param {string} [event.host] - Article source
   * @param {string} event.eventType - Event type
   * @returns {Object} Updated preferences
   */
  async incrementalUpdate(userId, event) {
    // Get current preferences
    let prefs = this.userAdapter.getPreferences(userId);
    
    if (!prefs) {
      // First time - learn from scratch
      return this.learnPreferences(userId);
    }
    
    // Calculate increment based on event type
    const increment = EVENT_WEIGHTS[event.eventType] || 1.0;
    
    // Update category weight
    if (event.category) {
      prefs.categoryWeights[event.category] = Math.min(
        MAX_WEIGHT,
        (prefs.categoryWeights[event.category] || 0) + increment
      );
    }
    
    // Update source weight
    if (event.host) {
      prefs.sourceWeights[event.host] = Math.min(
        MAX_WEIGHT,
        (prefs.sourceWeights[event.host] || 0) + increment
      );
    }
    
    // Re-normalize
    prefs.categoryWeights = this._normalizeWeights(prefs.categoryWeights);
    prefs.sourceWeights = this._normalizeWeights(prefs.sourceWeights);
    
    // Save
    this.userAdapter.savePreferences({
      userId,
      categoryWeights: prefs.categoryWeights,
      topicWeights: prefs.topicWeights,
      entityWeights: prefs.entityWeights,
      sourceWeights: prefs.sourceWeights
    });
    
    return prefs;
  }

  /**
   * Apply temporal decay to existing preferences
   * Should be run periodically (e.g., daily)
   * 
   * @param {number} userId - User ID
   * @param {number} [daysSinceUpdate=1] - Days since last update
   * @returns {Object|null} Updated preferences
   */
  async applyDecay(userId, daysSinceUpdate = 1) {
    const prefs = this.userAdapter.getPreferences(userId);
    if (!prefs) return null;
    
    const decayFactor = Math.exp(-daysSinceUpdate / this.decayDays);
    
    // Apply decay to all weights
    for (const key of Object.keys(prefs.categoryWeights)) {
      prefs.categoryWeights[key] *= decayFactor;
    }
    for (const key of Object.keys(prefs.topicWeights)) {
      prefs.topicWeights[key] *= decayFactor;
    }
    for (const key of Object.keys(prefs.sourceWeights)) {
      prefs.sourceWeights[key] *= decayFactor;
    }
    for (const key of Object.keys(prefs.entityWeights)) {
      prefs.entityWeights[key] *= decayFactor;
    }
    
    // Remove near-zero weights
    const threshold = 0.01;
    prefs.categoryWeights = this._pruneWeights(prefs.categoryWeights, threshold);
    prefs.topicWeights = this._pruneWeights(prefs.topicWeights, threshold);
    prefs.sourceWeights = this._pruneWeights(prefs.sourceWeights, threshold);
    prefs.entityWeights = this._pruneWeights(prefs.entityWeights, threshold);
    
    // Save
    this.userAdapter.savePreferences({
      userId,
      categoryWeights: prefs.categoryWeights,
      topicWeights: prefs.topicWeights,
      entityWeights: prefs.entityWeights,
      sourceWeights: prefs.sourceWeights
    });
    
    return prefs;
  }

  /**
   * Get top interests for display
   * 
   * @param {number} userId - User ID
   * @param {number} [topN=5] - Number of top interests per category
   * @returns {Object} Top interests
   */
  getTopInterests(userId, topN = 5) {
    const prefs = this.userAdapter.getPreferences(userId);
    if (!prefs) {
      return {
        categories: [],
        topics: [],
        sources: [],
        entities: []
      };
    }
    
    return {
      categories: this._getTopN(prefs.categoryWeights, topN),
      topics: this._getTopN(prefs.topicWeights, topN),
      sources: this._getTopN(prefs.sourceWeights, topN),
      entities: this._getTopN(prefs.entityWeights, topN)
    };
  }

  // =================== Private Helpers ===================

  /**
   * Normalize weights to sum to 1.0
   * @private
   */
  _normalizeWeights(weights) {
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
    if (total === 0) return weights;
    
    const normalized = {};
    for (const [key, value] of Object.entries(weights)) {
      normalized[key] = Math.round((value / total) * 10000) / 10000; // 4 decimal places
    }
    return normalized;
  }

  /**
   * Remove weights below threshold
   * @private
   */
  _pruneWeights(weights, threshold) {
    const pruned = {};
    for (const [key, value] of Object.entries(weights)) {
      if (value >= threshold) {
        pruned[key] = value;
      }
    }
    return pruned;
  }

  /**
   * Get top N items by weight
   * @private
   */
  _getTopN(weights, n) {
    return Object.entries(weights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([item, weight]) => ({ item, weight }));
  }
}

module.exports = {
  PreferenceLearner,
  EVENT_WEIGHTS,
  MIN_EVENTS_THRESHOLD,
  DEFAULT_DECAY_DAYS
};
