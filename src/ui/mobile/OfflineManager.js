'use strict';

/**
 * OfflineManager - IndexedDB wrapper for offline storage
 * 
 * Manages offline reading capabilities:
 * - Save articles for offline reading
 * - Queue actions for background sync
 * - Track reading progress
 * - Manage storage limits
 * 
 * Uses IndexedDB for persistent storage that survives browser restarts.
 * 
 * @module OfflineManager
 */

const DB_NAME = 'newsreader';
const DB_VERSION = 1;

// Object store names
const STORES = {
  SAVED_ARTICLES: 'saved_articles',
  READ_LATER: 'read_later',
  OFFLINE_QUEUE: 'offline_queue',
  READING_PROGRESS: 'reading_progress',
  SETTINGS: 'settings'
};

// Default limits
const DEFAULT_MAX_ARTICLES = 100;
const DEFAULT_MAX_QUEUE_SIZE = 500;

/**
 * OfflineManager class
 */
class OfflineManager {
  /**
   * Create an OfflineManager
   * 
   * @param {Object} [options] - Configuration
   * @param {number} [options.maxArticles=100] - Maximum saved articles
   * @param {number} [options.maxQueueSize=500] - Maximum queue entries
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    this.maxArticles = options.maxArticles || DEFAULT_MAX_ARTICLES;
    this.maxQueueSize = options.maxQueueSize || DEFAULT_MAX_QUEUE_SIZE;
    this.logger = options.logger || console;
    
    this.db = null;
    this._initPromise = null;
    this._isSupported = this._checkSupport();
  }

  /**
   * Check if IndexedDB is supported
   * 
   * @returns {boolean}
   * @private
   */
  _checkSupport() {
    if (typeof indexedDB === 'undefined') {
      return false;
    }
    // Check if we're in a browser context
    if (typeof window === 'undefined') {
      return false;
    }
    return true;
  }

  /**
   * Check if offline storage is supported
   * 
   * @returns {boolean}
   */
  isSupported() {
    return this._isSupported;
  }

  /**
   * Initialize the database
   * 
   * @returns {Promise<IDBDatabase>}
   */
  async init() {
    if (this.db) {
      return this.db;
    }
    
    if (this._initPromise) {
      return this._initPromise;
    }
    
    if (!this._isSupported) {
      throw new Error('IndexedDB not supported');
    }
    
    this._initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => {
        this.logger.error('[OfflineManager] Failed to open database:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        this.logger.log('[OfflineManager] Database opened successfully');
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        this._createStores(db);
      };
    });
    
    return this._initPromise;
  }

  /**
   * Create object stores
   * 
   * @param {IDBDatabase} db
   * @private
   */
  _createStores(db) {
    this.logger.log('[OfflineManager] Creating object stores...');
    
    // Saved articles store
    if (!db.objectStoreNames.contains(STORES.SAVED_ARTICLES)) {
      const savedStore = db.createObjectStore(STORES.SAVED_ARTICLES, { keyPath: 'id' });
      savedStore.createIndex('savedAt', 'savedAt', { unique: false });
      savedStore.createIndex('synced', 'synced', { unique: false });
    }
    
    // Read later queue
    if (!db.objectStoreNames.contains(STORES.READ_LATER)) {
      const readLaterStore = db.createObjectStore(STORES.READ_LATER, { keyPath: 'id' });
      readLaterStore.createIndex('addedAt', 'addedAt', { unique: false });
    }
    
    // Offline queue for background sync
    if (!db.objectStoreNames.contains(STORES.OFFLINE_QUEUE)) {
      const queueStore = db.createObjectStore(STORES.OFFLINE_QUEUE, { keyPath: 'id', autoIncrement: true });
      queueStore.createIndex('timestamp', 'timestamp', { unique: false });
      queueStore.createIndex('action', 'action', { unique: false });
    }
    
    // Reading progress
    if (!db.objectStoreNames.contains(STORES.READING_PROGRESS)) {
      const progressStore = db.createObjectStore(STORES.READING_PROGRESS, { keyPath: 'articleId' });
      progressStore.createIndex('updatedAt', 'updatedAt', { unique: false });
    }
    
    // Settings
    if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
      db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
    }
  }

  /**
   * Ensure database is initialized
   * 
   * @returns {Promise<IDBDatabase>}
   * @private
   */
  async _ensureDb() {
    if (!this.db) {
      await this.init();
    }
    return this.db;
  }

  // =================== Saved Articles ===================

  /**
   * Save an article for offline reading
   * 
   * @param {Object} article - Article data
   * @param {number} article.id - Article ID (content_id)
   * @param {string} article.title - Article title
   * @param {string} article.body - Article body HTML
   * @param {string} [article.author] - Author name
   * @param {string} [article.url] - Original URL
   * @param {string} [article.host] - Source domain
   * @param {string} [article.publishedAt] - Publication date
   * @param {string} [article.imageUrl] - Featured image URL
   * @returns {Promise<{success: boolean, evicted?: number}>}
   */
  async saveArticle(article) {
    const db = await this._ensureDb();
    
    const savedArticle = {
      id: article.id,
      title: article.title,
      body: article.body,
      author: article.author || null,
      url: article.url || null,
      host: article.host || null,
      publishedAt: article.publishedAt || null,
      imageUrl: article.imageUrl || null,
      savedAt: new Date().toISOString(),
      synced: false
    };
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.SAVED_ARTICLES], 'readwrite');
      const store = transaction.objectStore(STORES.SAVED_ARTICLES);
      
      // Check count first
      const countRequest = store.count();
      
      countRequest.onsuccess = () => {
        const count = countRequest.result;
        let evicted = 0;
        
        // Evict oldest if at limit
        if (count >= this.maxArticles) {
          const evictCount = count - this.maxArticles + 1;
          evicted = evictCount;
          
          const index = store.index('savedAt');
          const cursorRequest = index.openCursor();
          let evictedSoFar = 0;
          
          cursorRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor && evictedSoFar < evictCount) {
              store.delete(cursor.primaryKey);
              evictedSoFar++;
              cursor.continue();
            }
          };
        }
        
        // Add/update the article
        const putRequest = store.put(savedArticle);
        
        putRequest.onsuccess = () => {
          this.logger.log('[OfflineManager] Article saved:', article.id);
          resolve({ success: true, evicted });
        };
        
        putRequest.onerror = () => {
          this.logger.error('[OfflineManager] Failed to save article:', putRequest.error);
          reject(putRequest.error);
        };
      };
      
      countRequest.onerror = () => {
        reject(countRequest.error);
      };
    });
  }

  /**
   * Get a saved article
   * 
   * @param {number} articleId - Article ID
   * @returns {Promise<Object|null>}
   */
  async getArticle(articleId) {
    const db = await this._ensureDb();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.SAVED_ARTICLES], 'readonly');
      const store = transaction.objectStore(STORES.SAVED_ARTICLES);
      const request = store.get(articleId);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all saved articles
   * 
   * @param {Object} [options] - Options
   * @param {number} [options.limit] - Maximum articles to return
   * @param {boolean} [options.sortNewest=true] - Sort newest first
   * @returns {Promise<Object[]>}
   */
  async getAllArticles(options = {}) {
    const db = await this._ensureDb();
    const { limit, sortNewest = true } = options;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.SAVED_ARTICLES], 'readonly');
      const store = transaction.objectStore(STORES.SAVED_ARTICLES);
      const index = store.index('savedAt');
      const articles = [];
      
      const direction = sortNewest ? 'prev' : 'next';
      const cursorRequest = index.openCursor(null, direction);
      
      cursorRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          articles.push(cursor.value);
          if (limit && articles.length >= limit) {
            resolve(articles);
          } else {
            cursor.continue();
          }
        } else {
          resolve(articles);
        }
      };
      
      cursorRequest.onerror = () => reject(cursorRequest.error);
    });
  }

  /**
   * Delete a saved article
   * 
   * @param {number} articleId - Article ID
   * @returns {Promise<boolean>}
   */
  async deleteArticle(articleId) {
    const db = await this._ensureDb();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.SAVED_ARTICLES], 'readwrite');
      const store = transaction.objectStore(STORES.SAVED_ARTICLES);
      const request = store.delete(articleId);
      
      request.onsuccess = () => {
        this.logger.log('[OfflineManager] Article deleted:', articleId);
        resolve(true);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Check if an article is saved
   * 
   * @param {number} articleId - Article ID
   * @returns {Promise<boolean>}
   */
  async isArticleSaved(articleId) {
    const article = await this.getArticle(articleId);
    return article !== null;
  }

  /**
   * Get count of saved articles
   * 
   * @returns {Promise<number>}
   */
  async getSavedCount() {
    const db = await this._ensureDb();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.SAVED_ARTICLES], 'readonly');
      const store = transaction.objectStore(STORES.SAVED_ARTICLES);
      const request = store.count();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // =================== Offline Queue ===================

  /**
   * Queue an action for background sync
   * 
   * @param {string} action - Action type (e.g., 'view', 'share', 'bookmark')
   * @param {Object} payload - Action payload
   * @returns {Promise<number>} Queue entry ID
   */
  async queueAction(action, payload) {
    const db = await this._ensureDb();
    
    const entry = {
      action,
      payload,
      timestamp: new Date().toISOString(),
      retries: 0
    };
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.OFFLINE_QUEUE], 'readwrite');
      const store = transaction.objectStore(STORES.OFFLINE_QUEUE);
      
      // Check queue size
      const countRequest = store.count();
      
      countRequest.onsuccess = () => {
        if (countRequest.result >= this.maxQueueSize) {
          // Remove oldest entries
          const index = store.index('timestamp');
          const deleteRequest = index.openCursor();
          let deleted = 0;
          const toDelete = countRequest.result - this.maxQueueSize + 1;
          
          deleteRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor && deleted < toDelete) {
              store.delete(cursor.primaryKey);
              deleted++;
              cursor.continue();
            }
          };
        }
        
        const addRequest = store.add(entry);
        
        addRequest.onsuccess = () => {
          this.logger.log('[OfflineManager] Action queued:', action);
          resolve(addRequest.result);
        };
        
        addRequest.onerror = () => reject(addRequest.error);
      };
      
      countRequest.onerror = () => reject(countRequest.error);
    });
  }

  /**
   * Get all queued actions
   * 
   * @returns {Promise<Object[]>}
   */
  async getQueuedActions() {
    const db = await this._ensureDb();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.OFFLINE_QUEUE], 'readonly');
      const store = transaction.objectStore(STORES.OFFLINE_QUEUE);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Remove a queued action
   * 
   * @param {number} entryId - Queue entry ID
   * @returns {Promise<boolean>}
   */
  async removeQueuedAction(entryId) {
    const db = await this._ensureDb();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.OFFLINE_QUEUE], 'readwrite');
      const store = transaction.objectStore(STORES.OFFLINE_QUEUE);
      const request = store.delete(entryId);
      
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all queued actions
   * 
   * @returns {Promise<boolean>}
   */
  async clearQueue() {
    const db = await this._ensureDb();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.OFFLINE_QUEUE], 'readwrite');
      const store = transaction.objectStore(STORES.OFFLINE_QUEUE);
      const request = store.clear();
      
      request.onsuccess = () => {
        this.logger.log('[OfflineManager] Queue cleared');
        resolve(true);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // =================== Reading Progress ===================

  /**
   * Save reading progress for an article
   * 
   * @param {number} articleId - Article ID
   * @param {Object} progress - Progress data
   * @param {number} progress.scrollPercent - Scroll position (0-100)
   * @param {number} [progress.timeSpentMs] - Time spent reading
   * @param {boolean} [progress.completed] - Whether article was completed
   * @returns {Promise<boolean>}
   */
  async saveProgress(articleId, progress) {
    const db = await this._ensureDb();
    
    const entry = {
      articleId,
      scrollPercent: progress.scrollPercent || 0,
      timeSpentMs: progress.timeSpentMs || 0,
      completed: progress.completed || false,
      updatedAt: new Date().toISOString()
    };
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.READING_PROGRESS], 'readwrite');
      const store = transaction.objectStore(STORES.READING_PROGRESS);
      const request = store.put(entry);
      
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get reading progress for an article
   * 
   * @param {number} articleId - Article ID
   * @returns {Promise<Object|null>}
   */
  async getProgress(articleId) {
    const db = await this._ensureDb();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.READING_PROGRESS], 'readonly');
      const store = transaction.objectStore(STORES.READING_PROGRESS);
      const request = store.get(articleId);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  // =================== Settings ===================

  /**
   * Save a setting
   * 
   * @param {string} key - Setting key
   * @param {*} value - Setting value
   * @returns {Promise<boolean>}
   */
  async setSetting(key, value) {
    const db = await this._ensureDb();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.SETTINGS], 'readwrite');
      const store = transaction.objectStore(STORES.SETTINGS);
      const request = store.put({ key, value });
      
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get a setting
   * 
   * @param {string} key - Setting key
   * @param {*} [defaultValue] - Default value if not found
   * @returns {Promise<*>}
   */
  async getSetting(key, defaultValue = null) {
    const db = await this._ensureDb();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.SETTINGS], 'readonly');
      const store = transaction.objectStore(STORES.SETTINGS);
      const request = store.get(key);
      
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : defaultValue);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // =================== Storage Management ===================

  /**
   * Get storage usage statistics
   * 
   * @returns {Promise<Object>}
   */
  async getStorageStats() {
    const db = await this._ensureDb();
    
    const stats = {
      savedArticles: 0,
      queuedActions: 0,
      progressEntries: 0,
      settings: 0
    };
    
    const counts = await Promise.all([
      this._countStore(db, STORES.SAVED_ARTICLES),
      this._countStore(db, STORES.OFFLINE_QUEUE),
      this._countStore(db, STORES.READING_PROGRESS),
      this._countStore(db, STORES.SETTINGS)
    ]);
    
    stats.savedArticles = counts[0];
    stats.queuedActions = counts[1];
    stats.progressEntries = counts[2];
    stats.settings = counts[3];
    stats.maxArticles = this.maxArticles;
    stats.maxQueueSize = this.maxQueueSize;
    
    // Estimate storage if available
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        stats.quota = estimate.quota;
        stats.usage = estimate.usage;
        stats.usagePercent = Math.round((estimate.usage / estimate.quota) * 100);
      } catch (err) {
        // Storage estimate not available
      }
    }
    
    return stats;
  }

  /**
   * Count entries in a store
   * 
   * @param {IDBDatabase} db
   * @param {string} storeName
   * @returns {Promise<number>}
   * @private
   */
  _countStore(db, storeName) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.count();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all offline data
   * 
   * @returns {Promise<boolean>}
   */
  async clearAll() {
    const db = await this._ensureDb();
    
    const storeNames = Object.values(STORES);
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeNames, 'readwrite');
      
      let cleared = 0;
      for (const storeName of storeNames) {
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => {
          cleared++;
          if (cleared === storeNames.length) {
            this.logger.log('[OfflineManager] All data cleared');
            resolve(true);
          }
        };
        request.onerror = () => reject(request.error);
      }
    });
  }

  /**
   * Close the database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this._initPromise = null;
      this.logger.log('[OfflineManager] Database closed');
    }
  }
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OfflineManager, STORES, DB_NAME, DB_VERSION };
}

// Browser global
if (typeof window !== 'undefined') {
  window.OfflineManager = OfflineManager;
}
