'use strict';

/**
 * Slack integration client
 * @module integrations/SlackClient
 */

/**
 * Slack client for posting messages
 */
class SlackClient {
  /**
   * Create a SlackClient
   * @param {Object} [options] - Options
   * @param {Object} [options.logger] - Logger
   * @param {Function} [options.fetch] - Fetch implementation
   */
  constructor({ logger = console, fetch = globalThis.fetch } = {}) {
    this.logger = logger;
    this.fetch = fetch;
  }

  /**
   * Post a message to Slack
   * @param {string} webhookUrl - Slack webhook URL
   * @param {Object} message - Message
   * @param {string} [message.text] - Plain text fallback
   * @param {Array} [message.blocks] - Block Kit blocks
   * @returns {Promise<Object>} Result
   */
  async postMessage(webhookUrl, { text, blocks }) {
    if (!webhookUrl) {
      throw new Error('Slack webhook URL is required');
    }
    
    const payload = { text };
    if (blocks && blocks.length > 0) {
      payload.blocks = blocks;
    }
    
    try {
      const response = await this.fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Slack API error: ${response.status} ${body}`);
      }
      
      this.logger.info('Slack message posted successfully');
      return { success: true };
      
    } catch (error) {
      this.logger.error('Slack post failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Format an article for Slack
   * @param {Object} article - Article
   * @returns {Object} Slack message
   */
  formatArticle(article) {
    const text = `📰 ${article.title}`;
    
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📰 New Article',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*<${article.url}|${this.escapeMarkdown(article.title)}>*`
        }
      }
    ];
    
    // Add source if available
    if (article.source) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `📌 Source: ${article.source}`
          }
        ]
      });
    }
    
    // Add summary if available
    if (article.summary) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: article.summary.substring(0, 500)
        }
      });
    }
    
    // Add topics if available
    if (article.topics && article.topics.length > 0) {
      const topicText = article.topics.slice(0, 5).map(t => `\`${t}\``).join(' ');
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `🏷️ Topics: ${topicText}`
          }
        ]
      });
    }
    
    // Add timestamp
    if (article.publishedAt) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `🕐 ${new Date(article.publishedAt).toLocaleString()}`
          }
        ]
      });
    }
    
    return { text, blocks };
  }

  /**
   * Format an alert for Slack
   * @param {Object} alert - Alert
   * @param {Object} [trigger] - What triggered the alert
   * @returns {Object} Slack message
   */
  formatAlert(alert, trigger = {}) {
    const text = `🔔 Alert: ${alert.name}`;
    
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🔔 Alert Triggered',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${this.escapeMarkdown(alert.name)}*`
        }
      }
    ];
    
    // Add trigger info if available
    if (trigger.article) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Triggered by: *<${trigger.article.url}|${this.escapeMarkdown(trigger.article.title)}>*`
        }
      });
    }
    
    // Add conditions if available
    if (alert.conditions) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `📋 Conditions: ${typeof alert.conditions === 'string' ? alert.conditions : JSON.stringify(alert.conditions)}`
          }
        ]
      });
    }
    
    // Add timestamp
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `🕐 ${new Date().toLocaleString()}`
        }
      ]
    });
    
    // Add action button
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View Details',
            emoji: true
          },
          url: trigger.article?.url || '#'
        }
      ]
    });
    
    return { text, blocks };
  }

  /**
   * Format breaking news for Slack
   * @param {Object} news - Breaking news data
   * @returns {Object} Slack message
   */
  formatBreakingNews(news) {
    const text = `🚨 BREAKING: ${news.title || news.headline}`;
    
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🚨 BREAKING NEWS',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${this.escapeMarkdown(news.title || news.headline)}*`
        }
      }
    ];
    
    if (news.summary) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: news.summary.substring(0, 500)
        }
      });
    }
    
    if (news.url) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Read More',
              emoji: true
            },
            style: 'primary',
            url: news.url
          }
        ]
      });
    }
    
    return { text, blocks };
  }

  /**
   * Format crawl completion for Slack
   * @param {Object} crawl - Crawl summary
   * @returns {Object} Slack message
   */
  formatCrawlCompleted(crawl) {
    const text = `✅ Crawl completed: ${crawl.pagesProcessed || 0} pages`;
    
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '✅ Crawl Completed',
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Pages:*\n${crawl.pagesProcessed || 0}`
          },
          {
            type: 'mrkdwn',
            text: `*New Articles:*\n${crawl.newArticles || 0}`
          },
          {
            type: 'mrkdwn',
            text: `*Duration:*\n${this.formatDuration(crawl.duration)}`
          },
          {
            type: 'mrkdwn',
            text: `*Errors:*\n${crawl.errors || 0}`
          }
        ]
      }
    ];
    
    if (crawl.domains && crawl.domains.length > 0) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `🌐 Domains: ${crawl.domains.slice(0, 5).join(', ')}`
          }
        ]
      });
    }
    
    return { text, blocks };
  }

  /**
   * Escape Slack markdown special characters
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Format duration in human-readable form
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted duration
   */
  formatDuration(ms) {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
}

module.exports = { SlackClient };
