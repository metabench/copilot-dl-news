'use strict';

/**
 * Test fixtures for Alert System tests
 */

// Sample articles for testing
const sampleArticles = {
  techNews: {
    id: 1,
    contentId: 'art-001',
    title: 'Apple Announces New iPhone with AI Features',
    body: 'Apple unveiled its latest iPhone today featuring advanced AI capabilities and improved camera technology.',
    url: 'https://techcrunch.com/2024/01/15/apple-iphone-ai',
    host: 'techcrunch.com',
    publishedAt: new Date().toISOString(),
    category: 'technology',
    entities: [
      { text: 'Apple', type: 'ORGANIZATION' },
      { text: 'iPhone', type: 'PRODUCT' }
    ],
    sentiment: { score: 0.6, label: 'positive' }
  },

  politicsNews: {
    id: 2,
    contentId: 'art-002',
    title: 'Senate Passes Major Infrastructure Bill',
    body: 'The US Senate passed a major infrastructure bill today with bipartisan support.',
    url: 'https://nytimes.com/2024/01/15/senate-infrastructure',
    host: 'nytimes.com',
    publishedAt: new Date().toISOString(),
    category: 'politics',
    entities: [
      { text: 'US Senate', type: 'ORGANIZATION' },
      { text: 'Washington', type: 'LOCATION' }
    ],
    sentiment: { score: 0.3, label: 'neutral' }
  },

  breakingNews: {
    id: 3,
    contentId: 'art-003',
    title: 'BREAKING: Major Earthquake Strikes Pacific Region',
    body: 'BREAKING NEWS: A magnitude 7.5 earthquake has struck the Pacific region. Tsunami warning issued.',
    url: 'https://cnn.com/2024/01/15/earthquake-pacific',
    host: 'cnn.com',
    publishedAt: new Date().toISOString(),
    storyId: 'story-earthquake-001',
    category: 'disaster'
  },

  negativeNews: {
    id: 4,
    contentId: 'art-004',
    title: 'Stock Market Crashes Amid Economic Fears',
    body: 'Markets plunged today as investors fear recession.',
    url: 'https://reuters.com/2024/01/15/market-crash',
    host: 'reuters.com',
    publishedAt: new Date().toISOString(),
    category: 'finance',
    sentiment: { score: -0.8, label: 'negative' }
  }
};

// Sample alert rules
const sampleRules = {
  keywordAlert: {
    id: 1,
    userId: 1,
    name: 'Apple News',
    conditions: {
      type: 'keyword_match',
      keywords: ['apple', 'iphone']
    },
    channels: ['inApp', 'email'],
    enabled: true
  },

  entityAlert: {
    id: 2,
    userId: 1,
    name: 'Washington Entities',
    conditions: {
      type: 'entity_mention',
      entityType: 'LOCATION',
      entityName: 'Washington'
    },
    channels: ['inApp'],
    enabled: true
  },

  categoryAlert: {
    id: 3,
    userId: 1,
    name: 'Tech Category',
    conditions: {
      type: 'category_match',
      categories: ['technology', 'science']
    },
    channels: ['inApp', 'webhook'],
    enabled: true
  },

  sentimentAlert: {
    id: 4,
    userId: 2,
    name: 'Negative Sentiment',
    conditions: {
      type: 'sentiment_threshold',
      operator: '<',
      threshold: -0.5
    },
    channels: ['inApp'],
    enabled: true
  },

  complexAlert: {
    id: 5,
    userId: 1,
    name: 'Complex Rule',
    conditions: {
      logic: 'AND',
      conditions: [
        { type: 'keyword_match', keywords: ['apple'] },
        { type: 'category_match', categories: ['technology'] }
      ]
    },
    channels: ['inApp', 'email', 'webhook'],
    enabled: true
  },

  breakingNewsAlert: {
    id: 6,
    userId: 1,
    name: 'Breaking News',
    conditions: {
      type: 'breaking_news',
      includeBreaking: true
    },
    channels: ['inApp', 'push'],
    enabled: true
  },

  disabledRule: {
    id: 7,
    userId: 1,
    name: 'Disabled Rule',
    conditions: {
      type: 'keyword_match',
      keywords: ['test']
    },
    channels: ['inApp'],
    enabled: false
  }
};

// Invalid rule conditions for testing validation
const invalidConditions = {
  missingType: {
    keywords: ['test']
  },
  
  unknownType: {
    type: 'unknown_type',
    value: 'test'
  },
  
  missingKeywords: {
    type: 'keyword_match'
  },
  
  invalidOperator: {
    type: 'sentiment_threshold',
    operator: 'invalid',
    threshold: 0.5
  },
  
  emptyLogic: {
    logic: 'AND',
    conditions: []
  }
};

// Sample notifications
const sampleNotifications = {
  unread: {
    id: 1,
    userId: 1,
    title: 'Apple News Alert',
    body: 'New article matches your "Apple News" alert',
    articleId: 1,
    ruleId: 1,
    isRead: false,
    createdAt: new Date().toISOString()
  },
  
  read: {
    id: 2,
    userId: 1,
    title: 'Tech Category Alert',
    body: 'New article in Technology category',
    articleId: 2,
    ruleId: 3,
    isRead: true,
    createdAt: new Date(Date.now() - 3600000).toISOString()
  }
};

// Mock services
const createMockAlertAdapter = () => ({
  // Store rules by ID (convert from object keyed by name)
  _rules: (() => {
    const byId = {};
    for (const key in sampleRules) {
      byId[sampleRules[key].id] = { ...sampleRules[key] };
    }
    return byId;
  })(),
  _notifications: [],
  _history: [],
  _breakingNews: [],

  createRule(data) {
    const id = Math.max(0, ...Object.keys(this._rules).map(Number)) + 1;
    this._rules[id] = { ...data, id };
    return { id, changes: 1 };
  },

  getRuleById(id) {
    return this._rules[id] || undefined;
  },

  getRulesByUser(userId) {
    return Object.values(this._rules).filter(r => r.userId === userId);
  },

  getEnabledRules() {
    return Object.values(this._rules).filter(r => r.enabled);
  },

  updateRule(id, updates) {
    const rule = this.getRuleById(id);
    if (rule) {
      Object.assign(rule, updates);
      return { changes: 1 };
    }
    return { changes: 0 };
  },

  deleteRule(id) {
    if (this._rules[id]) {
      delete this._rules[id];
      return { changes: 1 };
    }
    return { changes: 0 };
  },

  createNotification(data) {
    const id = this._notifications.length + 1;
    this._notifications.push({ ...data, id });
    return { id, changes: 1 };
  },

  getNotificationsByUser(userId, limit = 50) {
    return this._notifications
      .filter(n => n.userId === userId)
      .slice(0, limit);
  },

  getUnreadNotifications(userId) {
    return this._notifications.filter(n => n.userId === userId && !n.isRead);
  },

  markNotificationRead(id) {
    const notif = this._notifications.find(n => n.id === id);
    if (notif) {
      notif.isRead = true;
      return { changes: 1 };
    }
    return { changes: 0 };
  },

  markAllNotificationsRead(userId) {
    let count = 0;
    this._notifications.forEach(n => {
      if (n.userId === userId && !n.isRead) {
        n.isRead = true;
        count++;
      }
    });
    return { changes: count };
  },

  recordAlert(data) {
    const id = this._history.length + 1;
    this._history.push({ ...data, id });
    return { id };
  },

  getAlertHistory(userId, limit = 50) {
    return this._history
      .filter(h => h.userId === userId)
      .slice(0, limit);
  },

  checkThrottling(userId, hourLimit) {
    // Always allow for testing
    return false;
  },

  checkDuplicate(articleId, ruleId) {
    return this._history.some(h => h.articleId === articleId && h.ruleId === ruleId);
  },

  countRecentAlerts(userId, windowMs = 3600000) {
    const cutoff = Date.now() - windowMs;
    return this._history.filter(h => 
      h.userId === userId && 
      new Date(h.createdAt || Date.now()).getTime() > cutoff
    ).length;
  },

  recordBreakingNews(data) {
    const id = this._breakingNews.length + 1;
    this._breakingNews.push({ ...data, id });
    return { id };
  },

  getBreakingNewsByStory(storyId) {
    return this._breakingNews.find(b => b.storyId === storyId) || null;
  },

  updateBreakingNewsCount(storyId, sourceCount, velocity) {
    const existing = this._breakingNews.find(b => b.storyId === storyId);
    if (existing) {
      existing.sourceCount = sourceCount;
      existing.velocity = velocity;
      return { changes: 1 };
    }
    return { changes: 0 };
  },

  getActiveBreakingNews(limit = 20) {
    return this._breakingNews.slice(0, limit);
  },

  deleteExpiredBreakingNews() {
    return { changes: 0 };
  },

  // Additional methods needed by NotificationService
  getNotificationsForUser(userId, limit = 50) {
    return this._notifications
      .filter(n => n.userId === userId)
      .slice(0, limit);
  },

  countUnreadNotifications(userId) {
    return this._notifications.filter(n => n.userId === userId && !n.isRead).length;
  },

  getBreakingNews(limit = 20) {
    return this._breakingNews.slice(0, limit);
  },

  deleteOldHistory(days = 30) {
    return { changes: 0 };
  },

  deleteOldNotifications(days = 90) {
    return { changes: 0 };
  },

  getStats() {
    return {
      ruleCount: Object.keys(this._rules).length,
      notificationCount: this._notifications.length,
      historyCount: this._history.length
    };
  }
});

const createMockEventBroadcaster = () => ({
  _subscribers: [],
  
  subscribe(handler, options = {}) {
    const sub = { handler, options };
    this._subscribers.push(sub);
    return {
      unsubscribe: () => {
        const idx = this._subscribers.indexOf(sub);
        if (idx >= 0) this._subscribers.splice(idx, 1);
      }
    };
  },
  
  async emit(type, payload) {
    for (const sub of this._subscribers) {
      if (!sub.options.types || sub.options.types.includes(type)) {
        await sub.handler({ type, payload });
      }
    }
  }
});

const createMockUserAdapter = () => ({
  _users: {
    1: { id: 1, email: 'user1@example.com', settings: { webhookUrl: 'https://example.com/webhook' } },
    2: { id: 2, email: 'user2@example.com', settings: {} }
  },

  getUserById(id) {
    return this._users[id];
  }
});

const createMockUserService = () => ({
  _sessions: {
    'valid-session': { userId: 1, valid: true },
    'user2-session': { userId: 2, valid: true }
  },

  validateSession(sessionId) {
    return this._sessions[sessionId] || { valid: false };
  }
});

module.exports = {
  sampleArticles,
  sampleRules,
  invalidConditions,
  sampleNotifications,
  createMockAlertAdapter,
  createMockEventBroadcaster,
  createMockUserAdapter,
  createMockUserService
};
