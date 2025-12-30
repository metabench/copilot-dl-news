'use strict';

/**
 * AlertEngine - Main orchestrator for alert processing
 * 
 * Listens to EventBroadcaster for new articles, evaluates rules,
 * detects breaking news, and triggers notification delivery.
 * 
 * Integration flow:
 * 1. Subscribe to 'article:new' events from EventBroadcaster
 * 2. For each new article, extract entities/category/sentiment
 * 3. Get all enabled rules and evaluate each one
 * 4. Queue notifications for matching rules
 * 5. Check for breaking news patterns
 * 
 * @module AlertEngine
 */

const { RuleEvaluator } = require('./RuleEvaluator');
const { BreakingNewsDetector } = require('./BreakingNewsDetector');
const { NotificationService, CHANNELS } = require('./NotificationService');

/**
 * AlertEngine class
 */
class AlertEngine {
  /**
   * Create an AlertEngine
   * 
   * @param {Object} options - Configuration
   * @param {Object} options.alertAdapter - Alert database adapter
   * @param {Object} [options.userAdapter] - User database adapter
   * @param {Object} [options.eventBroadcaster] - EventBroadcaster for events
   * @param {Object} [options.entityRecognizer] - EntityRecognizer for entity extraction
   * @param {Object} [options.topicModeler] - TopicModeler for category matching
   * @param {Object} [options.sentimentAnalyzer] - SentimentAnalyzer for sentiment
   * @param {Object} [options.trendDetector] - TrendDetector for breaking news baseline
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    this.alertAdapter = options.alertAdapter;
    this.userAdapter = options.userAdapter;
    this.eventBroadcaster = options.eventBroadcaster;
    this.logger = options.logger || console;

    // Create sub-components
    this.ruleEvaluator = new RuleEvaluator({
      entityRecognizer: options.entityRecognizer,
      topicModeler: options.topicModeler,
      sentimentAnalyzer: options.sentimentAnalyzer,
      logger: this.logger
    });

    this.breakingNewsDetector = new BreakingNewsDetector({
      alertAdapter: this.alertAdapter,
      topicAdapter: options.topicAdapter,
      trendDetector: options.trendDetector,
      logger: this.logger
    });

    this.notificationService = new NotificationService({
      alertAdapter: this.alertAdapter,
      userAdapter: this.userAdapter,
      eventBroadcaster: this.eventBroadcaster,
      emailTransport: options.emailTransport,
      logger: this.logger
    });

    // Store component references for analysis
    this.entityRecognizer = options.entityRecognizer;
    this.topicModeler = options.topicModeler;
    this.sentimentAnalyzer = options.sentimentAnalyzer;

    // Subscription handle
    this._subscription = null;
    this._initialized = false;

    // Processing stats
    this._stats = {
      articlesProcessed: 0,
      rulesEvaluated: 0,
      alertsSent: 0,
      breakingNewsDetected: 0,
      errors: 0,
      startedAt: null
    };
  }

  /**
   * Initialize the alert engine and start listening for events
   * 
   * @returns {Promise<boolean>}
   */
  async init() {
    if (this._initialized) {
      return true;
    }

    this.logger.log('[AlertEngine] Initializing...');

    // Subscribe to article events
    if (this.eventBroadcaster) {
      this._subscription = this.eventBroadcaster.subscribe(
        async (event) => {
          await this._handleEvent(event);
        },
        { types: ['article:new', 'article:classified'] }
      );
      this.logger.log('[AlertEngine] Subscribed to article events');
    }

    this._stats.startedAt = new Date().toISOString();
    this._initialized = true;

    this.logger.log('[AlertEngine] Initialized successfully');
    return true;
  }

  /**
   * Handle incoming event
   * @private
   */
  async _handleEvent(event) {
    try {
      if (event.type === 'article:new') {
        await this.processNewArticle(event.payload);
      } else if (event.type === 'article:classified') {
        // Article already has classification data
        await this.processNewArticle(event.payload);
      }
    } catch (err) {
      this.logger.error('[AlertEngine] Error handling event:', err.message);
      this._stats.errors++;
    }
  }

  /**
   * Process a new article for alerts
   * 
   * @param {Object} article - Article data
   * @param {Object} [options] - Processing options
   * @returns {Promise<{processed: boolean, matches: number, alerts: number, isBreaking: boolean}>}
   */
  async processNewArticle(article, options = {}) {
    this._stats.articlesProcessed++;

    const result = {
      processed: true,
      matches: 0,
      alerts: 0,
      isBreaking: false,
      errors: []
    };

    try {
      // 1. Build analysis context
      const context = await this._buildArticleContext(article);

      // 2. Check for breaking news
      const breakingResult = this.breakingNewsDetector.processArticle(article, context.storyId);
      result.isBreaking = breakingResult.isBreaking;
      
      if (breakingResult.isBreaking) {
        this._stats.breakingNewsDetected++;
        context.isBreakingNews = true;
        
        // Send breaking news alerts to subscribers
        await this._sendBreakingNewsAlerts(article, breakingResult);
      }

      // 3. Get all enabled rules
      const rules = this.alertAdapter ? this.alertAdapter.getEnabledRules() : [];

      // 4. Evaluate each rule
      for (const rule of rules) {
        this._stats.rulesEvaluated++;

        try {
          const evalResult = this.ruleEvaluator.evaluate(rule, article, context);

          if (evalResult.matches) {
            result.matches++;

            // Send notification through configured channels
            const sendResult = await this.notificationService.send(
              {
                userId: rule.userId,
                title: this._generateAlertTitle(article, rule),
                body: this._generateAlertBody(article, evalResult),
                articleId: article.id || article.contentId,
                storyId: context.storyId,
                ruleId: rule.id,
                articleUrl: article.url,
                isBreakingNews: result.isBreaking
              },
              rule.channels,
              {
                isBreakingNews: result.isBreaking,
                webhookUrl: this._getUserWebhookUrl(rule.userId),
                email: this._getUserEmail(rule.userId)
              }
            );

            if (sendResult.success) {
              result.alerts++;
              this._stats.alertsSent++;
            } else if (sendResult.errors.length > 0) {
              result.errors.push(...sendResult.errors);
            }
          }
        } catch (err) {
          this.logger.warn(`[AlertEngine] Rule ${rule.id} evaluation failed:`, err.message);
          result.errors.push(`Rule ${rule.id}: ${err.message}`);
        }
      }

    } catch (err) {
      this.logger.error('[AlertEngine] Article processing failed:', err.message);
      result.processed = false;
      result.errors.push(err.message);
      this._stats.errors++;
    }

    return result;
  }

  /**
   * Build analysis context for article
   * @private
   */
  async _buildArticleContext(article) {
    const context = {
      entities: [],
      category: null,
      topics: [],
      sentiment: null,
      storyId: article.storyId || null,
      isBreakingNews: false
    };

    // Extract entities
    if (this.entityRecognizer) {
      try {
        const text = article.body || article.content || '';
        context.entities = this.entityRecognizer.recognize(text);
      } catch (err) {
        this.logger.warn('[AlertEngine] Entity extraction failed:', err.message);
      }
    }

    // Get category/topics
    if (this.topicModeler) {
      try {
        const text = `${article.title || ''} ${article.body || article.content || ''}`;
        context.topics = this.topicModeler.classify(text);
        if (context.topics.length > 0) {
          context.category = context.topics[0].topicName;
        }
      } catch (err) {
        this.logger.warn('[AlertEngine] Topic classification failed:', err.message);
      }
    }

    // Use pre-computed values if available
    if (article.category) {
      context.category = article.category;
    }
    if (article.entities) {
      context.entities = article.entities;
    }
    if (article.sentiment) {
      context.sentiment = article.sentiment;
    }

    return context;
  }

  /**
   * Send breaking news alerts to all subscribers
   * @private
   */
  async _sendBreakingNewsAlerts(article, breakingResult) {
    // Get all rules that have breaking_news condition type
    const rules = this.alertAdapter ? this.alertAdapter.getEnabledRules() : [];
    
    const breakingRules = rules.filter(rule => {
      const conditions = Array.isArray(rule.conditions) ? rule.conditions : [rule.conditions];
      return conditions.some(c => 
        c && (c.type === 'breaking_news' || c.includeBreaking === true)
      );
    });

    for (const rule of breakingRules) {
      try {
        await this.notificationService.send(
          {
            userId: rule.userId,
            title: `🚨 Breaking: ${article.title || 'New developing story'}`,
            body: `${breakingResult.signals.sourceCount} sources reporting`,
            articleId: article.id || article.contentId,
            ruleId: rule.id,
            articleUrl: article.url,
            isBreakingNews: true
          },
          rule.channels,
          {
            isBreakingNews: true,
            webhookUrl: this._getUserWebhookUrl(rule.userId),
            email: this._getUserEmail(rule.userId)
          }
        );
      } catch (err) {
        this.logger.warn('[AlertEngine] Breaking news alert failed:', err.message);
      }
    }
  }

  /**
   * Generate alert title
   * @private
   */
  _generateAlertTitle(article, rule) {
    const prefix = rule.name ? `[${rule.name}] ` : '';
    return `${prefix}${article.title || 'New article matches your alert'}`;
  }

  /**
   * Generate alert body
   * @private
   */
  _generateAlertBody(article, evalResult) {
    const parts = [];
    
    if (evalResult.matchedConditions && evalResult.matchedConditions.length > 0) {
      const types = evalResult.matchedConditions.map(c => c.type).join(', ');
      parts.push(`Matched: ${types}`);
    }

    if (article.host) {
      parts.push(`Source: ${article.host}`);
    }

    return parts.join(' • ');
  }

  /**
   * Get user's webhook URL
   * @private
   */
  _getUserWebhookUrl(userId) {
    if (this.userAdapter) {
      const user = this.userAdapter.getUserById(userId);
      if (user && user.settings && user.settings.webhookUrl) {
        return user.settings.webhookUrl;
      }
    }
    return null;
  }

  /**
   * Get user's email
   * @private
   */
  _getUserEmail(userId) {
    if (this.userAdapter) {
      const user = this.userAdapter.getUserById(userId);
      if (user && user.email) {
        return user.email;
      }
    }
    return null;
  }

  // =================== Alert Rules API ===================

  /**
   * Create a new alert rule
   * 
   * @param {Object} ruleData - Rule data
   * @param {number} ruleData.userId - User ID
   * @param {string} ruleData.name - Rule name
   * @param {Array|Object} ruleData.conditions - Rule conditions
   * @param {string[]} [ruleData.channels=['inApp']] - Notification channels
   * @returns {{id: number, valid: boolean, errors?: string[]}}
   */
  createRule(ruleData) {
    // Validate rule
    const validation = this.ruleEvaluator.validateRule(ruleData);
    if (!validation.valid) {
      return { id: null, valid: false, errors: validation.errors };
    }

    if (!this.alertAdapter) {
      return { id: null, valid: false, errors: ['Alert adapter not configured'] };
    }

    const result = this.alertAdapter.createRule({
      userId: ruleData.userId,
      name: ruleData.name,
      conditions: ruleData.conditions,
      channels: ruleData.channels || [CHANNELS.IN_APP],
      enabled: ruleData.enabled !== false
    });

    return { id: result.id, valid: true };
  }

  /**
   * Get rules for a user
   * 
   * @param {number} userId - User ID
   * @returns {Array<Object>}
   */
  getRules(userId) {
    if (!this.alertAdapter) return [];
    return this.alertAdapter.getRulesByUser(userId);
  }

  /**
   * Get a specific rule
   * 
   * @param {number} ruleId - Rule ID
   * @returns {Object|null}
   */
  getRule(ruleId) {
    if (!this.alertAdapter) return null;
    return this.alertAdapter.getRuleById(ruleId);
  }

  /**
   * Update a rule
   * 
   * @param {number} ruleId - Rule ID
   * @param {Object} updates - Fields to update
   * @returns {{success: boolean, errors?: string[]}}
   */
  updateRule(ruleId, updates) {
    if (!this.alertAdapter) {
      return { success: false, errors: ['Alert adapter not configured'] };
    }

    // Validate if conditions are being updated
    if (updates.conditions) {
      const validation = this.ruleEvaluator.validateRule({ conditions: updates.conditions });
      if (!validation.valid) {
        return { success: false, errors: validation.errors };
      }
    }

    const result = this.alertAdapter.updateRule(ruleId, updates);
    return { success: result.changes > 0 };
  }

  /**
   * Delete a rule
   * 
   * @param {number} ruleId - Rule ID
   * @returns {{success: boolean}}
   */
  deleteRule(ruleId) {
    if (!this.alertAdapter) {
      return { success: false };
    }

    const result = this.alertAdapter.deleteRule(ruleId);
    return { success: result.changes > 0 };
  }

  // =================== Notifications API ===================

  /**
   * Get notifications for a user
   * 
   * @param {number} userId - User ID
   * @param {Object} [options] - Options
   * @returns {Array<Object>}
   */
  getNotifications(userId, options = {}) {
    return this.notificationService.getNotifications(userId, options);
  }

  /**
   * Mark notification as read
   * 
   * @param {number} notificationId - Notification ID
   * @returns {{success: boolean}}
   */
  markNotificationRead(notificationId) {
    return this.notificationService.markRead(notificationId);
  }

  /**
   * Mark all notifications as read
   * 
   * @param {number} userId - User ID
   * @returns {{success: boolean, count: number}}
   */
  markAllNotificationsRead(userId) {
    return this.notificationService.markAllRead(userId);
  }

  /**
   * Get unread count
   * 
   * @param {number} userId - User ID
   * @returns {number}
   */
  getUnreadCount(userId) {
    return this.notificationService.getUnreadCount(userId);
  }

  // =================== Alert History API ===================

  /**
   * Get alert history for a user
   * 
   * @param {number} userId - User ID
   * @param {number} [limit=50] - Max alerts
   * @returns {Array<Object>}
   */
  getAlertHistory(userId, limit = 50) {
    if (!this.alertAdapter) return [];
    return this.alertAdapter.getAlertHistory(userId, limit);
  }

  // =================== Breaking News API ===================

  /**
   * Get current breaking news
   * 
   * @param {number} [limit=20] - Max items
   * @returns {Array<Object>}
   */
  getBreakingNews(limit = 20) {
    return this.breakingNewsDetector.getBreakingNews(limit);
  }

  // =================== Lifecycle ===================

  /**
   * Stop the alert engine
   */
  stop() {
    if (this._subscription) {
      this._subscription.unsubscribe();
      this._subscription = null;
    }
    this._initialized = false;
    this.logger.log('[AlertEngine] Stopped');
  }

  /**
   * Get engine statistics
   * 
   * @returns {Object}
   */
  getStats() {
    return {
      ...this._stats,
      breakingNewsDetector: this.breakingNewsDetector.getStats(),
      notificationService: this.notificationService.getStats(),
      initialized: this._initialized
    };
  }

  /**
   * Cleanup old data
   * 
   * @returns {Object}
   */
  cleanup() {
    const results = {};

    if (this.alertAdapter) {
      results.expiredBreakingNews = this.alertAdapter.deleteExpiredBreakingNews();
    }

    results.notifications = this.notificationService.cleanup();

    return results;
  }
}

module.exports = {
  AlertEngine
};
