'use strict';

/**
 * NewsCrawl JavaScript SDK
 * Programmatic access to the news crawler API
 * @module sdk
 */

const https = require('https');
const http = require('http');
const EventEmitter = require('events');

/**
 * HTTP client for API requests
 */
class HttpClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.apiKey = options.apiKey;
    this.timeout = options.timeout || 30000;
  }

  /**
   * Make HTTP request
   * @param {string} method - HTTP method
   * @param {string} path - API path
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response data
   */
  async request(method, path, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      
      if (options.query) {
        Object.entries(options.query).forEach(([key, value]) => {
          if (value !== undefined) {
            url.searchParams.set(key, value);
          }
        });
      }

      const reqOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
          ...options.headers
        }
      };

      const protocol = url.protocol === 'https:' ? https : http;
      const req = protocol.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400) {
              const error = new Error(parsed.error || parsed.message || 'Request failed');
              error.status = res.statusCode;
              error.response = parsed;
              reject(error);
            } else {
              resolve(parsed);
            }
          } catch (e) {
            if (res.statusCode >= 400) {
              const error = new Error(data || 'Request failed');
              error.status = res.statusCode;
              reject(error);
            } else {
              resolve(data);
            }
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      if (options.body) {
        req.write(JSON.stringify(options.body));
      }
      req.end();
    });
  }

  get(path, options) {
    return this.request('GET', path, options);
  }

  post(path, body, options = {}) {
    return this.request('POST', path, { ...options, body });
  }

  put(path, body, options = {}) {
    return this.request('PUT', path, { ...options, body });
  }

  patch(path, body, options = {}) {
    return this.request('PATCH', path, { ...options, body });
  }

  delete(path, options) {
    return this.request('DELETE', path, options);
  }
}

/**
 * Articles API
 */
class ArticlesAPI {
  constructor(client) {
    this.client = client;
  }

  /**
   * Search articles
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results
   */
  async search(query, options = {}) {
    return this.client.get('/api/v1/articles/search', {
      query: { q: query, ...options }
    });
  }

  /**
   * Get article by ID
   * @param {string|number} id - Article ID
   * @returns {Promise<Object>} Article
   */
  async get(id) {
    return this.client.get(`/api/v1/articles/${id}`);
  }

  /**
   * List articles
   * @param {Object} options - List options
   * @returns {Promise<Object>} Articles list
   */
  async list(options = {}) {
    return this.client.get('/api/v1/articles', { query: options });
  }

  /**
   * Save article to reading list
   * @param {string|number} id - Article ID
   * @returns {Promise<Object>} Result
   */
  async save(id) {
    return this.client.post(`/api/v1/articles/${id}/save`);
  }

  /**
   * Unsave article
   * @param {string|number} id - Article ID
   * @returns {Promise<Object>} Result
   */
  async unsave(id) {
    return this.client.delete(`/api/v1/articles/${id}/save`);
  }

  /**
   * Get saved articles
   * @param {Object} options - List options
   * @returns {Promise<Object>} Saved articles
   */
  async getSaved(options = {}) {
    return this.client.get('/api/v1/articles/saved', { query: options });
  }

  /**
   * Export articles
   * @param {Object} options - Export options
   * @returns {Promise<Object>} Export data
   */
  async export(options = {}) {
    return this.client.get('/api/v1/articles/export', { query: options });
  }
}

/**
 * Topics API
 */
class TopicsAPI {
  constructor(client) {
    this.client = client;
  }

  /**
   * List topics
   * @param {Object} options - List options
   * @returns {Promise<Object>} Topics
   */
  async list(options = {}) {
    return this.client.get('/api/v1/topics', { query: options });
  }

  /**
   * Get topic by ID
   * @param {string|number} id - Topic ID
   * @returns {Promise<Object>} Topic
   */
  async get(id) {
    return this.client.get(`/api/v1/topics/${id}`);
  }

  /**
   * Get articles for topic
   * @param {string|number} id - Topic ID
   * @param {Object} options - List options
   * @returns {Promise<Object>} Articles
   */
  async getArticles(id, options = {}) {
    return this.client.get(`/api/v1/topics/${id}/articles`, { query: options });
  }
}

/**
 * Alerts API
 */
class AlertsAPI {
  constructor(client) {
    this.client = client;
  }

  /**
   * List alerts
   * @returns {Promise<Object>} Alerts
   */
  async list() {
    return this.client.get('/api/v1/alerts');
  }

  /**
   * Get alert by ID
   * @param {string|number} id - Alert ID
   * @returns {Promise<Object>} Alert
   */
  async get(id) {
    return this.client.get(`/api/v1/alerts/${id}`);
  }

  /**
   * Create alert
   * @param {Object} data - Alert data
   * @returns {Promise<Object>} Created alert
   */
  async create(data) {
    return this.client.post('/api/v1/alerts', data);
  }

  /**
   * Update alert
   * @param {string|number} id - Alert ID
   * @param {Object} data - Update data
   * @returns {Promise<Object>} Updated alert
   */
  async update(id, data) {
    return this.client.patch(`/api/v1/alerts/${id}`, data);
  }

  /**
   * Delete alert
   * @param {string|number} id - Alert ID
   * @returns {Promise<void>}
   */
  async delete(id) {
    return this.client.delete(`/api/v1/alerts/${id}`);
  }

  /**
   * Test alert
   * @param {string|number} id - Alert ID
   * @returns {Promise<Object>} Test result
   */
  async test(id) {
    return this.client.post(`/api/v1/alerts/${id}/test`);
  }
}

/**
 * User API
 */
class UserAPI {
  constructor(client) {
    this.client = client;
  }

  /**
   * Get current user
   * @returns {Promise<Object>} User data
   */
  async me() {
    return this.client.get('/api/v1/me');
  }

  /**
   * Get user preferences
   * @returns {Promise<Object>} Preferences
   */
  async getPreferences() {
    return this.client.get('/api/v1/me/preferences');
  }

  /**
   * Update preferences
   * @param {Object} preferences - Preference updates
   * @returns {Promise<Object>} Updated preferences
   */
  async updatePreferences(preferences) {
    return this.client.patch('/api/v1/me/preferences', preferences);
  }

  /**
   * Get usage stats
   * @returns {Promise<Object>} Usage stats
   */
  async getUsage() {
    return this.client.get('/api/v1/me/usage');
  }
}

/**
 * Streaming API for real-time events
 */
class StreamAPI extends EventEmitter {
  constructor(client) {
    super();
    this.client = client;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.subscriptions = new Set();
  }

  /**
   * Connect to event stream
   * @returns {Promise<void>}
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL('/api/v1/stream', this.client.baseUrl);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        
        if (this.client.apiKey) {
          url.searchParams.set('token', this.client.apiKey);
        }

        // In Node.js, we'd need ws package
        // This is a simplified version for the SDK interface
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emit('connected');
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Subscribe to event type
   * @param {string} eventType - Event type to subscribe
   * @param {Function} callback - Event handler
   */
  subscribe(eventType, callback) {
    this.subscriptions.add(eventType);
    this.on(eventType, callback);
    
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ type: 'subscribe', event: eventType }));
    }
  }

  /**
   * Unsubscribe from event type
   * @param {string} eventType - Event type to unsubscribe
   * @param {Function} callback - Event handler to remove
   */
  unsubscribe(eventType, callback) {
    this.subscriptions.delete(eventType);
    this.off(eventType, callback);
    
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ type: 'unsubscribe', event: eventType }));
    }
  }

  /**
   * Disconnect from stream
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.emit('disconnected');
  }
}

/**
 * Main NewsCrawl client
 */
class NewsCrawl {
  /**
   * Create a NewsCrawl client
   * @param {Object} options - Client options
   * @param {string} options.apiKey - API key
   * @param {string} options.baseUrl - Base URL (default: http://localhost:3000)
   * @param {number} options.timeout - Request timeout in ms
   */
  constructor(options = {}) {
    this.options = options;
    this.http = new HttpClient(options);
    
    // Initialize API namespaces
    this.articles = new ArticlesAPI(this.http);
    this.topics = new TopicsAPI(this.http);
    this.alerts = new AlertsAPI(this.http);
    this.user = new UserAPI(this.http);
    this.stream = new StreamAPI(this.http);
  }

  /**
   * Set API key
   * @param {string} apiKey - API key
   */
  setApiKey(apiKey) {
    this.http.apiKey = apiKey;
  }

  /**
   * Set base URL
   * @param {string} baseUrl - Base URL
   */
  setBaseUrl(baseUrl) {
    this.http.baseUrl = baseUrl;
  }

  /**
   * Check if client is authenticated
   * @returns {Promise<boolean>}
   */
  async isAuthenticated() {
    try {
      await this.user.me();
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get raw HTTP client for custom requests
   * @returns {HttpClient}
   */
  getHttpClient() {
    return this.http;
  }
}

// Export everything
module.exports = {
  NewsCrawl,
  HttpClient,
  ArticlesAPI,
  TopicsAPI,
  AlertsAPI,
  UserAPI,
  StreamAPI
};
