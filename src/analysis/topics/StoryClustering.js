'use strict';

/**
 * StoryClustering - Group related articles into story threads
 * 
 * Clusters articles about the same event/story using:
 * - SimHash Hamming distance (content similarity)
 * - Shared entities (PERSON, ORG)
 * - Time proximity (articles within 48 hours)
 * 
 * Features:
 * - Create new story clusters from similar articles
 * - Merge new articles into existing clusters
 * - Track cluster evolution over time
 * - Generate cluster headlines from articles
 * 
 * @module StoryClustering
 */

const SimHasher = require('../similarity/SimHasher');

// Maximum Hamming distance for articles to be in same story
const MAX_HAMMING_DISTANCE = 3;

// Minimum shared entities required
const MIN_SHARED_ENTITIES = 1;

// Maximum time difference in hours for story grouping
const MAX_TIME_DIFF_HOURS = 48;

// Minimum articles to form a cluster
const MIN_CLUSTER_SIZE = 2;

// Maximum articles per cluster before splitting
const MAX_CLUSTER_SIZE = 100;

/**
 * Calculate Hamming distance between two SimHash fingerprints
 * 
 * @param {Buffer} fp1 - First fingerprint
 * @param {Buffer} fp2 - Second fingerprint
 * @returns {number} Hamming distance (0-64)
 */
function hammingDistance(fp1, fp2) {
  // Handle string hex inputs
  const buf1 = Buffer.isBuffer(fp1) ? fp1 : Buffer.from(fp1, 'hex');
  const buf2 = Buffer.isBuffer(fp2) ? fp2 : Buffer.from(fp2, 'hex');
  
  return SimHasher.hammingDistance(buf1, buf2);
}

/**
 * Calculate entity overlap between two entity sets
 * 
 * @param {Array<{text: string, type: string}>} entities1 - First entity list
 * @param {Array<{text: string, type: string}>} entities2 - Second entity list
 * @returns {{count: number, shared: string[]}}
 */
function calculateEntityOverlap(entities1, entities2) {
  if (!entities1 || !entities2 || entities1.length === 0 || entities2.length === 0) {
    return { count: 0, shared: [] };
  }
  
  // Normalize entity text for comparison
  const normalize = (text) => text.toLowerCase().trim();
  
  const set1 = new Set(entities1.map(e => normalize(e.text || e.entity_text)));
  const shared = [];
  
  for (const entity of entities2) {
    const normalized = normalize(entity.text || entity.entity_text);
    if (set1.has(normalized)) {
      shared.push(normalized);
    }
  }
  
  return {
    count: shared.length,
    shared: [...new Set(shared)] // Deduplicate
  };
}

/**
 * Calculate time difference in hours
 * 
 * @param {string|Date} date1 - First date
 * @param {string|Date} date2 - Second date
 * @returns {number} Difference in hours
 */
function timeDiffHours(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.abs(d1 - d2) / (1000 * 60 * 60);
}

/**
 * StoryClustering service
 */
class StoryClustering {
  /**
   * Create a StoryClustering instance
   * 
   * @param {Object} [options] - Configuration
   * @param {Object} options.topicAdapter - Topic database adapter
   * @param {Object} options.similarityAdapter - Similarity adapter for fingerprints
   * @param {Object} options.tagAdapter - Tag adapter for entities
   * @param {Object} [options.logger] - Logger instance
   * @param {number} [options.maxHammingDistance=3] - Max distance for same story
   * @param {number} [options.minSharedEntities=1] - Min shared entities
   * @param {number} [options.maxTimeDiffHours=48] - Max time diff in hours
   */
  constructor(options = {}) {
    this.topicAdapter = options.topicAdapter;
    this.similarityAdapter = options.similarityAdapter;
    this.tagAdapter = options.tagAdapter;
    this.logger = options.logger || console;
    
    this.maxHammingDistance = options.maxHammingDistance || MAX_HAMMING_DISTANCE;
    this.minSharedEntities = options.minSharedEntities || MIN_SHARED_ENTITIES;
    this.maxTimeDiffHours = options.maxTimeDiffHours || MAX_TIME_DIFF_HOURS;
    
    // In-memory cluster index for fast lookup
    // Map<clusterId, {articleIds: Set, fingerprints: [], entities: Set, lastUpdated: Date}>
    this._clusterIndex = new Map();
    this._initialized = false;
  }
  
  /**
   * Initialize by loading existing clusters from database
   * 
   * @returns {Promise<number>} Number of clusters loaded
   */
  async initialize() {
    if (this._initialized) {
      return this._clusterIndex.size;
    }
    
    if (!this.topicAdapter) {
      this._initialized = true;
      return 0;
    }
    
    try {
      const clusters = this.topicAdapter.getStoryClusters({ activeOnly: true });
      
      for (const cluster of clusters) {
        const articleIds = JSON.parse(cluster.article_ids || cluster.articleIds || '[]');
        
        this._clusterIndex.set(cluster.id, {
          id: cluster.id,
          headline: cluster.headline,
          articleIds: new Set(articleIds),
          lastUpdated: new Date(cluster.last_updated || cluster.lastUpdated),
          isActive: cluster.is_active !== 0
        });
      }
      
      this._initialized = true;
      this.logger.log(`[StoryClustering] Loaded ${this._clusterIndex.size} active clusters`);
      
      return this._clusterIndex.size;
    } catch (err) {
      this.logger.error('[StoryClustering] Error initializing:', err);
      throw err;
    }
  }
  
  /**
   * Find matching cluster for an article
   * 
   * @param {Object} article - Article data
   * @param {number} article.id - Content ID
   * @param {Buffer|string} article.simhash - SimHash fingerprint
   * @param {Array} article.entities - Extracted entities
   * @param {string|Date} article.publishedAt - Publication date
   * @param {Object} [options] - Options
   * @returns {Object|null} Matching cluster or null
   */
  async findMatchingCluster(article, options = {}) {
    if (!this.topicAdapter || !this.similarityAdapter) {
      return null;
    }
    
    const { id: contentId, simhash, entities, publishedAt } = article;
    
    // Get active clusters ordered by recency
    const clusters = this.topicAdapter.getStoryClusters({
      activeOnly: true,
      limit: 100,
      orderBy: 'last_updated DESC'
    });
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const cluster of clusters) {
      const articleIds = JSON.parse(cluster.article_ids || '[]');
      
      if (articleIds.length === 0) continue;
      if (articleIds.includes(contentId)) continue; // Already in cluster
      
      // Check time proximity
      const clusterTime = cluster.last_updated || cluster.first_seen;
      if (publishedAt && timeDiffHours(publishedAt, clusterTime) > this.maxTimeDiffHours) {
        continue;
      }
      
      // Get fingerprints for cluster articles
      const clusterFingerprints = this._getClusterFingerprints(articleIds);
      
      // Check SimHash similarity with any cluster article
      let minDistance = 64;
      for (const fp of clusterFingerprints) {
        if (fp && simhash) {
          const dist = hammingDistance(simhash, fp);
          minDistance = Math.min(minDistance, dist);
        }
      }
      
      if (minDistance > this.maxHammingDistance) {
        continue; // Not similar enough
      }
      
      // Check entity overlap
      const clusterEntities = this._getClusterEntities(articleIds);
      const overlap = calculateEntityOverlap(entities || [], clusterEntities);
      
      if (overlap.count < this.minSharedEntities) {
        continue; // Not enough shared entities
      }
      
      // Calculate match score
      const distanceScore = 1 - (minDistance / 64);
      const entityScore = Math.min(1, overlap.count / 3);
      const score = (distanceScore * 0.6) + (entityScore * 0.4);
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = {
          cluster,
          score,
          hammingDistance: minDistance,
          sharedEntities: overlap.shared
        };
      }
    }
    
    return bestMatch;
  }
  
  /**
   * Get fingerprints for cluster articles
   * @private
   */
  _getClusterFingerprints(articleIds) {
    if (!this.similarityAdapter) return [];
    
    const fingerprints = [];
    for (const id of articleIds.slice(0, 10)) { // Limit to first 10 for performance
      const fp = this.similarityAdapter.getFingerprint(id);
      if (fp && fp.simhash) {
        fingerprints.push(fp.simhash);
      }
    }
    return fingerprints;
  }
  
  /**
   * Get entities for cluster articles
   * @private
   */
  _getClusterEntities(articleIds) {
    if (!this.tagAdapter) return [];
    
    const allEntities = [];
    for (const id of articleIds.slice(0, 10)) { // Limit to first 10
      const entities = this.tagAdapter.getEntities(id);
      if (entities) {
        allEntities.push(...entities);
      }
    }
    return allEntities;
  }
  
  /**
   * Add article to existing cluster
   * 
   * @param {number} clusterId - Cluster ID
   * @param {number} contentId - Article content ID
   * @param {string} [headline] - Optional updated headline
   * @returns {Object} Updated cluster
   */
  addToCluster(clusterId, contentId, headline = null) {
    if (!this.topicAdapter) {
      throw new Error('TopicAdapter required for addToCluster');
    }
    
    const cluster = this.topicAdapter.getStoryCluster(clusterId);
    if (!cluster) {
      throw new Error(`Cluster ${clusterId} not found`);
    }
    
    const articleIds = JSON.parse(cluster.article_ids || '[]');
    
    if (!articleIds.includes(contentId)) {
      articleIds.push(contentId);
    }
    
    const updates = {
      articleIds,
      articleCount: articleIds.length,
      lastUpdated: new Date().toISOString()
    };
    
    if (headline) {
      updates.headline = headline;
    }
    
    this.topicAdapter.updateStoryCluster(clusterId, updates);
    
    // Update in-memory index
    if (this._clusterIndex.has(clusterId)) {
      const cached = this._clusterIndex.get(clusterId);
      cached.articleIds.add(contentId);
      cached.lastUpdated = new Date();
    }
    
    return { clusterId, articleIds, articleCount: articleIds.length };
  }
  
  /**
   * Create a new story cluster
   * 
   * @param {Object} options - Cluster options
   * @param {string} options.headline - Cluster headline
   * @param {number[]} options.articleIds - Initial article IDs
   * @param {string} [options.summary] - Cluster summary
   * @param {number} [options.primaryTopicId] - Primary topic ID
   * @returns {Object} Created cluster
   */
  createCluster(options) {
    if (!this.topicAdapter) {
      throw new Error('TopicAdapter required for createCluster');
    }
    
    const { headline, articleIds, summary = null, primaryTopicId = null } = options;
    
    if (!headline || !articleIds || articleIds.length === 0) {
      throw new Error('headline and articleIds are required');
    }
    
    const cluster = this.topicAdapter.saveStoryCluster({
      headline,
      summary,
      articleIds,
      articleCount: articleIds.length,
      primaryTopicId,
      isActive: true
    });
    
    // Add to in-memory index
    this._clusterIndex.set(cluster.id, {
      id: cluster.id,
      headline,
      articleIds: new Set(articleIds),
      lastUpdated: new Date(),
      isActive: true
    });
    
    return cluster;
  }
  
  /**
   * Process an article for clustering
   * 
   * @param {Object} article - Article data
   * @param {number} article.id - Content ID
   * @param {string} article.title - Article title
   * @param {string} article.text - Article body
   * @param {string|Date} article.publishedAt - Publication date
   * @returns {Object} Clustering result
   */
  async processArticle(article) {
    const { id: contentId, title, text, publishedAt } = article;
    
    // Get article fingerprint
    let simhash = null;
    if (this.similarityAdapter) {
      const fp = this.similarityAdapter.getFingerprint(contentId);
      simhash = fp ? fp.simhash : null;
    }
    
    // Get article entities
    let entities = [];
    if (this.tagAdapter) {
      entities = this.tagAdapter.getEntities(contentId) || [];
    }
    
    // Find matching cluster
    const match = await this.findMatchingCluster({
      id: contentId,
      simhash,
      entities,
      publishedAt
    });
    
    if (match && match.score > 0.5) {
      // Add to existing cluster
      const result = this.addToCluster(match.cluster.id, contentId);
      return {
        action: 'joined',
        clusterId: match.cluster.id,
        headline: match.cluster.headline,
        score: match.score,
        sharedEntities: match.sharedEntities,
        articleCount: result.articleCount
      };
    }
    
    // No match found - don't create single-article cluster
    // Wait until we have at least 2 similar articles
    return {
      action: 'none',
      reason: 'No matching cluster found',
      contentId
    };
  }
  
  /**
   * Find articles that could form new clusters
   * Batch process to find similar pairs
   * 
   * @param {Array<{id: number, simhash: Buffer, entities: Array, publishedAt: Date}>} articles 
   * @returns {Array} Potential clusters
   */
  findPotentialClusters(articles) {
    const potentialClusters = [];
    const processed = new Set();
    
    for (let i = 0; i < articles.length; i++) {
      if (processed.has(articles[i].id)) continue;
      
      const cluster = {
        articleIds: [articles[i].id],
        articles: [articles[i]]
      };
      
      for (let j = i + 1; j < articles.length; j++) {
        if (processed.has(articles[j].id)) continue;
        
        // Check similarity
        if (articles[i].simhash && articles[j].simhash) {
          const dist = hammingDistance(articles[i].simhash, articles[j].simhash);
          
          if (dist <= this.maxHammingDistance) {
            // Check time proximity
            if (articles[i].publishedAt && articles[j].publishedAt) {
              const timeDiff = timeDiffHours(articles[i].publishedAt, articles[j].publishedAt);
              if (timeDiff > this.maxTimeDiffHours) continue;
            }
            
            // Check entity overlap
            const overlap = calculateEntityOverlap(
              articles[i].entities || [],
              articles[j].entities || []
            );
            
            if (overlap.count >= this.minSharedEntities) {
              cluster.articleIds.push(articles[j].id);
              cluster.articles.push(articles[j]);
              processed.add(articles[j].id);
            }
          }
        }
      }
      
      if (cluster.articleIds.length >= MIN_CLUSTER_SIZE) {
        processed.add(articles[i].id);
        potentialClusters.push(cluster);
      }
    }
    
    return potentialClusters;
  }
  
  /**
   * Deactivate old clusters
   * 
   * @param {number} [daysOld=7] - Days since last update to deactivate
   * @returns {number} Number of clusters deactivated
   */
  deactivateOldClusters(daysOld = 7) {
    if (!this.topicAdapter) return 0;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const count = this.topicAdapter.deactivateOldClusters(cutoffDate.toISOString());
    
    // Update in-memory index
    for (const [id, cluster] of this._clusterIndex) {
      if (cluster.lastUpdated < cutoffDate) {
        cluster.isActive = false;
      }
    }
    
    return count;
  }
  
  /**
   * Get cluster statistics
   * 
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      initialized: this._initialized,
      activeClusters: this._clusterIndex.size,
      maxHammingDistance: this.maxHammingDistance,
      minSharedEntities: this.minSharedEntities,
      maxTimeDiffHours: this.maxTimeDiffHours
    };
  }
}

module.exports = {
  StoryClustering,
  hammingDistance,
  calculateEntityOverlap,
  timeDiffHours,
  MAX_HAMMING_DISTANCE,
  MIN_SHARED_ENTITIES,
  MAX_TIME_DIFF_HOURS,
  MIN_CLUSTER_SIZE,
  MAX_CLUSTER_SIZE
};
