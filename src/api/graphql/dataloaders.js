'use strict';

/**
 * DataLoaders for batching and caching GraphQL queries
 * @module api/graphql/dataloaders
 */

/**
 * Simple DataLoader implementation
 * Batches multiple requests in a single tick into one database call
 */
class DataLoader {
  /**
   * Create a DataLoader
   * @param {Function} batchFn - Batch loading function
   * @param {Object} [options] - Options
   */
  constructor(batchFn, options = {}) {
    this.batchFn = batchFn;
    this.cache = options.cache !== false ? new Map() : null;
    this.batch = null;
    this.batchScheduled = false;
  }

  /**
   * Load a single key
   * @param {*} key - Key to load
   * @returns {Promise<*>} Loaded value
   */
  async load(key) {
    // Check cache first
    if (this.cache) {
      const cached = this.cache.get(key);
      if (cached !== undefined) {
        return cached;
      }
    }

    // Add to current batch
    if (!this.batch) {
      this.batch = [];
    }

    const promise = new Promise((resolve, reject) => {
      this.batch.push({ key, resolve, reject });
    });

    // Schedule batch execution
    if (!this.batchScheduled) {
      this.batchScheduled = true;
      process.nextTick(() => this.executeBatch());
    }

    return promise;
  }

  /**
   * Load multiple keys
   * @param {Array} keys - Keys to load
   * @returns {Promise<Array>} Loaded values
   */
  async loadMany(keys) {
    return Promise.all(keys.map(key => this.load(key)));
  }

  /**
   * Execute the current batch
   */
  async executeBatch() {
    const batch = this.batch;
    this.batch = null;
    this.batchScheduled = false;

    if (!batch || batch.length === 0) return;

    const keys = batch.map(item => item.key);

    try {
      const values = await this.batchFn(keys);

      // Verify batch function returned correct number of values
      if (values.length !== keys.length) {
        throw new Error(
          `DataLoader batch function returned ${values.length} values for ${keys.length} keys`
        );
      }

      // Resolve all promises and cache values
      batch.forEach((item, index) => {
        const value = values[index];
        if (this.cache) {
          this.cache.set(item.key, value);
        }
        item.resolve(value);
      });
    } catch (error) {
      batch.forEach(item => item.reject(error));
    }
  }

  /**
   * Clear a key from cache
   * @param {*} key - Key to clear
   * @returns {DataLoader} This loader
   */
  clear(key) {
    if (this.cache) {
      this.cache.delete(key);
    }
    return this;
  }

  /**
   * Clear all cached values
   * @returns {DataLoader} This loader
   */
  clearAll() {
    if (this.cache) {
      this.cache.clear();
    }
    return this;
  }

  /**
   * Prime the cache with a value
   * @param {*} key - Key
   * @param {*} value - Value
   * @returns {DataLoader} This loader
   */
  prime(key, value) {
    if (this.cache && !this.cache.has(key)) {
      this.cache.set(key, value);
    }
    return this;
  }
}

/**
 * Create DataLoaders for a request context
 * @param {Object} services - Service instances
 * @returns {Object} DataLoader instances
 */
function createLoaders(services) {
  const { db, articleService, topicService, userService, sourceService } = services;

  return {
    /**
     * Load articles by ID
     */
    articleLoader: new DataLoader(async (ids) => {
      if (articleService?.getArticlesByIds) {
        const articles = await articleService.getArticlesByIds(ids);
        return ids.map(id => articles.find(a => String(a.id) === String(id)) || null);
      }
      // Fallback to individual loads
      if (db?.getArticle) {
        const articles = await Promise.all(ids.map(id => db.getArticle(id)));
        return articles;
      }
      return ids.map(() => null);
    }),

    /**
     * Load topics by ID
     */
    topicLoader: new DataLoader(async (ids) => {
      if (topicService?.getTopicsByIds) {
        const topics = await topicService.getTopicsByIds(ids);
        return ids.map(id => topics.find(t => String(t.id) === String(id)) || null);
      }
      if (db?.getTopic) {
        const topics = await Promise.all(ids.map(id => db.getTopic(id)));
        return topics;
      }
      return ids.map(() => null);
    }),

    /**
     * Load sources by ID
     */
    sourceLoader: new DataLoader(async (ids) => {
      if (sourceService?.getSourcesByIds) {
        const sources = await sourceService.getSourcesByIds(ids);
        return ids.map(id => sources.find(s => String(s.id) === String(id)) || null);
      }
      if (db?.getSource) {
        const sources = await Promise.all(ids.map(id => db.getSource(id)));
        return sources;
      }
      return ids.map(() => null);
    }),

    /**
     * Load users by ID
     */
    userLoader: new DataLoader(async (ids) => {
      if (userService?.getUsersByIds) {
        const users = await userService.getUsersByIds(ids);
        return ids.map(id => users.find(u => String(u.id) === String(id)) || null);
      }
      if (db?.getUser) {
        const users = await Promise.all(ids.map(id => db.getUser(id)));
        return users;
      }
      return ids.map(() => null);
    }),

    /**
     * Load sentiment for articles
     */
    sentimentLoader: new DataLoader(async (articleIds) => {
      if (services.sentimentService?.getSentimentBatch) {
        const sentiments = await services.sentimentService.getSentimentBatch(articleIds);
        return articleIds.map(id => sentiments.find(s => String(s.articleId) === String(id))?.sentiment || null);
      }
      return articleIds.map(() => null);
    }),

    /**
     * Load topics for articles
     */
    articleTopicsLoader: new DataLoader(async (articleIds) => {
      if (services.topicService?.getTopicsForArticles) {
        const topicsMap = await services.topicService.getTopicsForArticles(articleIds);
        return articleIds.map(id => topicsMap[id] || []);
      }
      return articleIds.map(() => []);
    }),

    /**
     * Load source for articles
     */
    articleSourceLoader: new DataLoader(async (articleIds) => {
      if (services.sourceService?.getSourcesForArticles) {
        const sourcesMap = await services.sourceService.getSourcesForArticles(articleIds);
        return articleIds.map(id => sourcesMap[id] || null);
      }
      return articleIds.map(() => null);
    }),

    /**
     * Load saved status for articles (per user)
     */
    savedArticleLoader: new DataLoader(async (articleIds) => {
      // This is user-specific, so it's handled differently
      return articleIds.map(() => false);
    }),

    /**
     * Load workspace members
     */
    workspaceMembersLoader: new DataLoader(async (workspaceIds) => {
      if (services.workspaceService?.getMembersForWorkspaces) {
        const membersMap = await services.workspaceService.getMembersForWorkspaces(workspaceIds);
        return workspaceIds.map(id => membersMap[id] || []);
      }
      return workspaceIds.map(() => []);
    }),

    /**
     * Load annotations for articles
     */
    annotationsLoader: new DataLoader(async (articleIds) => {
      if (services.annotationService?.getAnnotationsForArticles) {
        const annotationsMap = await services.annotationService.getAnnotationsForArticles(articleIds);
        return articleIds.map(id => annotationsMap[id] || []);
      }
      return articleIds.map(() => []);
    })
  };
}

/**
 * Create a user-specific saved articles loader
 * @param {number} userId - User ID
 * @param {Object} services - Services
 * @returns {DataLoader} Loader
 */
function createSavedArticleLoader(userId, services) {
  return new DataLoader(async (articleIds) => {
    if (services.userService?.getSavedArticleIds) {
      const savedIds = await services.userService.getSavedArticleIds(userId);
      const savedSet = new Set(savedIds.map(String));
      return articleIds.map(id => savedSet.has(String(id)));
    }
    return articleIds.map(() => false);
  });
}

module.exports = { DataLoader, createLoaders, createSavedArticleLoader };
