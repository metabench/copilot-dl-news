'use strict';

/**
 * NotificationService - Multi-channel notification delivery
 * 
 * Supports:
 * - webhook: POST to user-defined URLs
 * - email: SMTP-based email delivery (requires nodemailer)
 * - inApp: Store in database for in-app display
 * 
 * Features:
 * - Throttling: Max 10 alerts/hour per user (unless breaking news)
 * - Deduplication: Don't alert same story twice
 * - Retry: Exponential backoff for webhook delivery
 * - Batching: Group email alerts to avoid spam
 * 
 * @module NotificationService
 */

const crypto = require('crypto');

/**
 * Default configuration
 */
const DEFAULTS = {
  // Max alerts per hour per user (unless breaking news)
  MAX_ALERTS_PER_HOUR: 10,
  
  // Webhook retry settings
  WEBHOOK_MAX_RETRIES: 3,
  WEBHOOK_INITIAL_DELAY_MS: 1000,
  WEBHOOK_TIMEOUT_MS: 10000,
  
  // Email batching window
  EMAIL_BATCH_WINDOW_MS: 5 * 60 * 1000, // 5 minutes
  
  // Dedup window
  DEDUP_WINDOW_HOURS: 24
};

/**
 * Notification channels
 */
const CHANNELS = {
  WEBHOOK: 'webhook',
  EMAIL: 'email',
  IN_APP: 'inApp',
  PUSH: 'push' // For future PWA push notifications
};

/**
 * NotificationService class
 */
class NotificationService {
  /**
   * Create a NotificationService
   * 
   * @param {Object} [options] - Configuration
   * @param {Object} [options.alertAdapter] - Alert database adapter
   * @param {Object} [options.userAdapter] - User database adapter
   * @param {Object} [options.eventBroadcaster] - EventBroadcaster for real-time push
   * @param {Object} [options.emailTransport] - Nodemailer transport (optional)
   * @param {Object} [options.logger] - Logger instance
   * @param {Object} [options.config] - Override default config
   */
  constructor(options = {}) {
    this.alertAdapter = options.alertAdapter || null;
    this.userAdapter = options.userAdapter || null;
    this.eventBroadcaster = options.eventBroadcaster || null;
    this.emailTransport = options.emailTransport || null;
    this.logger = options.logger || console;
    
    this.config = { ...DEFAULTS, ...options.config };
    
    // Email batch queue
    // Map<userId, { emails: Array, flushTimeout: NodeJS.Timeout }>
    this._emailBatches = new Map();
    
    // Track alerts per user for throttling (in-memory cache)
    // Map<userId, { count: number, resetAt: number }>
    this._alertCounts = new Map();
  }

  /**
   * Send notification through specified channels
   * 
   * @param {Object} notification - Notification data
   * @param {number} notification.userId - User ID
   * @param {string} notification.title - Notification title
   * @param {string} [notification.body] - Notification body
   * @param {number} [notification.articleId] - Related article ID
   * @param {number} [notification.storyId] - Related story ID
   * @param {number} [notification.ruleId] - Triggering rule ID
   * @param {string[]} channels - Channels to use
   * @param {Object} [options] - Additional options
   * @param {boolean} [options.isBreakingNews] - Bypass throttling
   * @param {string} [options.webhookUrl] - Webhook URL for webhook channel
   * @param {string} [options.email] - Email address for email channel
   * @returns {Promise<{success: boolean, channels: Object, errors: string[]}>}
   */
  async send(notification, channels, options = {}) {
    const errors = [];
    const channelResults = {};
    
    // Check throttling (unless breaking news)
    if (!options.isBreakingNews) {
      const throttled = this._isThrottled(notification.userId);
      if (throttled) {
        return {
          success: false,
          channels: {},
          errors: ['Rate limit exceeded (max 10 alerts/hour)']
        };
      }
    }

    // Check deduplication
    const dedupHash = this._generateDedupHash(notification.userId, notification.storyId);
    if (this._isDuplicate(dedupHash)) {
      return {
        success: false,
        channels: {},
        errors: ['Duplicate notification (same story already notified)']
      };
    }

    // Process each channel
    for (const channel of channels) {
      try {
        const result = await this._sendToChannel(channel, notification, options);
        channelResults[channel] = result;
        
        if (result.success) {
          // Record in history
          this._recordAlert(notification, channel, dedupHash);
        } else if (result.error) {
          errors.push(`${channel}: ${result.error}`);
        }
      } catch (err) {
        errors.push(`${channel}: ${err.message}`);
        channelResults[channel] = { success: false, error: err.message };
      }
    }

    // Update throttle counter
    this._incrementAlertCount(notification.userId);

    const anySuccess = Object.values(channelResults).some(r => r.success);
    
    return {
      success: anySuccess,
      channels: channelResults,
      errors
    };
  }

  /**
   * Send notification to a specific channel
   * @private
   */
  async _sendToChannel(channel, notification, options) {
    switch (channel) {
      case CHANNELS.IN_APP:
        return this._sendInApp(notification);
        
      case CHANNELS.WEBHOOK:
        return this._sendWebhook(notification, options.webhookUrl);
        
      case CHANNELS.EMAIL:
        return this._sendEmail(notification, options.email);
        
      case CHANNELS.PUSH:
        return this._sendPush(notification);
        
      default:
        return { success: false, error: `Unknown channel: ${channel}` };
    }
  }

  /**
   * Send in-app notification (store in database)
   * @private
   */
  async _sendInApp(notification) {
    if (!this.alertAdapter) {
      return { success: false, error: 'Alert adapter not configured' };
    }

    try {
      const result = this.alertAdapter.createNotification({
        userId: notification.userId,
        title: notification.title,
        body: notification.body,
        articleId: notification.articleId,
        storyId: notification.storyId,
        ruleId: notification.ruleId,
        notificationType: notification.isBreakingNews ? 'breaking' : 'alert'
      });

      // Push real-time update if broadcaster available
      if (this.eventBroadcaster) {
        this.eventBroadcaster.emitEvent('notification:new', {
          userId: notification.userId,
          notificationId: result.id,
          title: notification.title,
          type: notification.isBreakingNews ? 'breaking' : 'alert'
        });
      }

      return { success: true, notificationId: result.id };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Send webhook notification
   * @private
   */
  async _sendWebhook(notification, webhookUrl) {
    if (!webhookUrl) {
      return { success: false, error: 'No webhook URL provided' };
    }

    const payload = {
      alertId: notification.id || Date.now(),
      articleId: notification.articleId,
      storyId: notification.storyId,
      title: notification.title,
      body: notification.body,
      url: notification.articleUrl,
      matchedRule: notification.ruleId,
      timestamp: new Date().toISOString()
    };

    // Retry with exponential backoff
    let lastError = null;
    let delay = this.config.WEBHOOK_INITIAL_DELAY_MS;

    for (let attempt = 1; attempt <= this.config.WEBHOOK_MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          this.config.WEBHOOK_TIMEOUT_MS
        );

        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Alert-Signature': this._signPayload(payload)
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (response.ok) {
          return { success: true, statusCode: response.status };
        }

        lastError = `HTTP ${response.status}`;
      } catch (err) {
        lastError = err.message;
      }

      // Wait before retry (exponential backoff)
      if (attempt < this.config.WEBHOOK_MAX_RETRIES) {
        await this._sleep(delay);
        delay *= 2;
      }
    }

    return { 
      success: false, 
      error: `Failed after ${this.config.WEBHOOK_MAX_RETRIES} attempts: ${lastError}` 
    };
  }

  /**
   * Send email notification (batched)
   * @private
   */
  async _sendEmail(notification, email) {
    if (!email) {
      // Try to get email from user adapter
      if (this.userAdapter) {
        const user = this.userAdapter.getUserById(notification.userId);
        if (user && user.email) {
          email = user.email;
        }
      }
      
      if (!email) {
        return { success: false, error: 'No email address provided' };
      }
    }

    // Add to batch queue
    this._addToEmailBatch(notification.userId, {
      to: email,
      title: notification.title,
      body: notification.body,
      articleId: notification.articleId,
      articleUrl: notification.articleUrl
    });

    return { success: true, queued: true };
  }

  /**
   * Send push notification (for PWA)
   * @private
   */
  async _sendPush(notification) {
    // Push notifications will be implemented with PWA (Item 8)
    // For now, just broadcast via EventBroadcaster
    if (this.eventBroadcaster) {
      this.eventBroadcaster.emitEvent('push:notification', {
        userId: notification.userId,
        title: notification.title,
        body: notification.body,
        data: {
          articleId: notification.articleId,
          url: notification.articleUrl
        }
      });
      return { success: true, broadcast: true };
    }

    return { success: false, error: 'Push notifications not configured' };
  }

  /**
   * Add email to batch queue
   * @private
   */
  _addToEmailBatch(userId, emailData) {
    if (!this._emailBatches.has(userId)) {
      this._emailBatches.set(userId, {
        emails: [],
        flushTimeout: null
      });
    }

    const batch = this._emailBatches.get(userId);
    batch.emails.push({
      ...emailData,
      timestamp: new Date().toISOString()
    });

    // Set/reset flush timeout
    if (batch.flushTimeout) {
      clearTimeout(batch.flushTimeout);
    }
    
    batch.flushTimeout = setTimeout(
      () => this._flushEmailBatch(userId),
      this.config.EMAIL_BATCH_WINDOW_MS
    );
  }

  /**
   * Flush email batch for a user
   * @private
   */
  async _flushEmailBatch(userId) {
    const batch = this._emailBatches.get(userId);
    if (!batch || batch.emails.length === 0) return;

    const emails = batch.emails;
    batch.emails = [];
    
    if (batch.flushTimeout) {
      clearTimeout(batch.flushTimeout);
      batch.flushTimeout = null;
    }

    // Send batched email
    if (this.emailTransport) {
      try {
        const to = emails[0].to;
        const subject = emails.length === 1
          ? `Alert: ${emails[0].title}`
          : `${emails.length} News Alerts`;
        
        const html = this._renderEmailTemplate(emails);
        
        await this.emailTransport.sendMail({
          to,
          subject,
          html
        });
        
        this.logger.log(`[NotificationService] Sent ${emails.length} batched emails to ${to}`);
      } catch (err) {
        this.logger.error('[NotificationService] Email send failed:', err.message);
      }
    }
  }

  /**
   * Render email template for batched alerts
   * @private
   */
  _renderEmailTemplate(emails) {
    const items = emails.map(e => `
      <div style="margin-bottom: 20px; padding: 15px; border-left: 4px solid #4a90d9; background: #f5f5f5;">
        <h3 style="margin: 0 0 10px 0; color: #333;">${this._escapeHtml(e.title)}</h3>
        ${e.body ? `<p style="margin: 0 0 10px 0; color: #666;">${this._escapeHtml(e.body)}</p>` : ''}
        ${e.articleUrl ? `<a href="${e.articleUrl}" style="color: #4a90d9;">Read more →</a>` : ''}
      </div>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>News Alerts</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333; border-bottom: 2px solid #4a90d9; padding-bottom: 10px;">
          🔔 Your News Alerts
        </h2>
        ${items}
        <p style="color: #999; font-size: 12px; margin-top: 30px;">
          You received this because you have alert rules set up. 
          <a href="#" style="color: #4a90d9;">Manage your alerts</a>
        </p>
      </body>
      </html>
    `;
  }

  /**
   * Check if user is throttled
   * @private
   */
  _isThrottled(userId) {
    // Check database for accurate count
    if (this.alertAdapter) {
      const count = this.alertAdapter.countRecentAlerts(userId);
      return count >= this.config.MAX_ALERTS_PER_HOUR;
    }

    // Fallback to in-memory tracking
    const now = Date.now();
    const bucket = this._alertCounts.get(userId);
    
    if (!bucket || bucket.resetAt < now) {
      return false;
    }

    return bucket.count >= this.config.MAX_ALERTS_PER_HOUR;
  }

  /**
   * Increment alert count for throttling
   * @private
   */
  _incrementAlertCount(userId) {
    const now = Date.now();
    let bucket = this._alertCounts.get(userId);
    
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + 3600000 }; // 1 hour
      this._alertCounts.set(userId, bucket);
    }

    bucket.count++;
  }

  /**
   * Check if notification is duplicate
   * @private
   */
  _isDuplicate(dedupHash) {
    if (!dedupHash) return false;
    
    if (this.alertAdapter) {
      return this.alertAdapter.isDuplicate(dedupHash);
    }

    return false;
  }

  /**
   * Generate deduplication hash
   * @private
   */
  _generateDedupHash(userId, storyId) {
    if (!storyId) return null;
    
    const input = `${userId}:${storyId}`;
    return crypto.createHash('sha256').update(input).digest('hex').substring(0, 32);
  }

  /**
   * Record alert in history
   * @private
   */
  _recordAlert(notification, channel, dedupHash) {
    if (this.alertAdapter) {
      this.alertAdapter.recordAlert({
        userId: notification.userId,
        ruleId: notification.ruleId,
        articleId: notification.articleId,
        storyId: notification.storyId,
        channel,
        dedupHash
      });
    }

    // Update rule trigger count
    if (notification.ruleId && this.alertAdapter) {
      this.alertAdapter.markRuleTriggered(notification.ruleId);
    }
  }

  /**
   * Sign webhook payload
   * @private
   */
  _signPayload(payload) {
    const secret = process.env.WEBHOOK_SECRET || 'default-secret';
    return crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  /**
   * Escape HTML for email
   * @private
   */
  _escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Sleep helper
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get user notifications
   * 
   * @param {number} userId - User ID
   * @param {Object} [options] - Options
   * @param {boolean} [options.unreadOnly] - Only unread
   * @param {number} [options.limit] - Max notifications
   * @returns {Array<Object>}
   */
  getNotifications(userId, options = {}) {
    if (!this.alertAdapter) {
      return [];
    }

    const limit = options.limit || 50;
    
    if (options.unreadOnly) {
      return this.alertAdapter.getUnreadNotifications(userId, limit);
    }
    
    return this.alertAdapter.getNotificationsForUser(userId, limit);
  }

  /**
   * Mark notification as read
   * 
   * @param {number} notificationId - Notification ID
   * @returns {{success: boolean}}
   */
  markRead(notificationId) {
    if (!this.alertAdapter) {
      return { success: false };
    }

    const result = this.alertAdapter.markNotificationRead(notificationId);
    return { success: result.changes > 0 };
  }

  /**
   * Mark all notifications as read for a user
   * 
   * @param {number} userId - User ID
   * @returns {{success: boolean, count: number}}
   */
  markAllRead(userId) {
    if (!this.alertAdapter) {
      return { success: false, count: 0 };
    }

    const result = this.alertAdapter.markAllNotificationsRead(userId);
    return { success: true, count: result.changes };
  }

  /**
   * Get unread notification count
   * 
   * @param {number} userId - User ID
   * @returns {number}
   */
  getUnreadCount(userId) {
    if (!this.alertAdapter) {
      return 0;
    }

    return this.alertAdapter.countUnreadNotifications(userId);
  }

  /**
   * Cleanup old data
   * 
   * @returns {{history: number, notifications: number}}
   */
  cleanup() {
    if (!this.alertAdapter) {
      return { history: 0, notifications: 0 };
    }

    const history = this.alertAdapter.deleteOldHistory(30);
    const notifications = this.alertAdapter.deleteOldNotifications(90);
    
    return {
      history: history.deleted,
      notifications: notifications.deleted
    };
  }

  /**
   * Get service statistics
   * 
   * @returns {Object}
   */
  getStats() {
    const baseStats = {
      emailBatchedUsers: this._emailBatches.size,
      throttledUsers: this._alertCounts.size
    };

    if (this.alertAdapter) {
      return {
        ...baseStats,
        ...this.alertAdapter.getStats()
      };
    }

    return baseStats;
  }
}

module.exports = {
  NotificationService,
  CHANNELS,
  DEFAULTS
};
