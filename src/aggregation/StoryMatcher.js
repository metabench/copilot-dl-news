'use strict';

/**
 * StoryMatcher - Cross-source story matching
 * 
 * Links articles about the same event using:
 * - SimHash fingerprint distance (content similarity)
 * - Entity overlap (shared people, organizations, locations)
 * - Time proximity (articles within 48h)
 * - Location matching
 * 
 * Uses existing:
 * - SimHasher from similarity engine
 * - StoryClustering from topic modeling
 * 
 * @module StoryMatcher
 */

const SimHasher = require('../intelligence/analysis/similarity/SimHasher');

// Configuration constants
const MAX_HAMMING_DISTANCE = 3;
const MIN_SHARED_ENTITIES = 2;
const MAX_TIME_DIFF_HOURS = 48;
const LOOKBACK_HOURS = 48;

/**
 * StoryMatcher class for cross-source article matching
 */
class StoryMatcher {
  /**
   * Create a StoryMatcher instance
   * 
   * @param {Object} [options] - Configuration
   * @param {Object} options.topicAdapter - Topic database adapter (for story_clusters)
   * @param {Object} options.similarityAdapter - Similarity adapter (for fingerprints)
   * @param {Object} options.tagAdapter - Tag adapter (for entities)
   * @param {Object} options.articlesAdapter - Articles adapter (for article details)
   * @param {Object} [options.logger] - Logger instance
   * @param {number} [options.maxHammingDistance=3] - Max SimHash distance for match
   * @param {number} [options.minSharedEntities=2] - Min shared entities required
   * @param {number} [options.maxTimeDiffHours=48] - Max time difference in hours
   */
  constructor(options = {}) {
    this.topicAdapter = options.topicAdapter;
    this.similarityAdapter = options.similarityAdapter;
    this.tagAdapter = options.tagAdapter;
    this.articlesAdapter = options.articlesAdapter;
    this.logger = options.logger || console;
    
    this.maxHammingDistance = options.maxHammingDistance || MAX_HAMMING_DISTANCE;
    this.minSharedEntities = options.minSharedEntities || MIN_SHARED_ENTITIES;
    this.maxTimeDiffHours = options.maxTimeDiffHours || MAX_TIME_DIFF_HOURS;
  }
  
  /**
   * Match an article to existing stories
   * 
   * Algorithm:
   * 1. Get SimHash fingerprint for article
   * 2. Query story_clusters updated in last 48h
   * 3. For each cluster, compare SimHash distance AND entity overlap
   * 4. If match, add to cluster. If no match, potentially create new cluster
   * 
   * @param {Object} article - Article to match
   * @param {number} article.id - Content ID
   * @param {string} article.title - Article title
   * @param {string} [article.text] - Article body text
   * @param {string|Date} article.publishedAt - Publication date
   * @param {string} [article.host] - Source host/domain
   * @returns {Object} Match result with cluster info
   */
  async matchArticle(article) {
    const { id: contentId, title, text, publishedAt, host } = article;
    
    // Get article fingerprint
    let simhash = null;
    if (this.similarityAdapter) {
      const fp = this.similarityAdapter.getFingerprint(contentId);
      simhash = fp ? fp.simhash : null;
      
      // If no fingerprint exists, compute it
      if (!simhash && text) {
        simhash = SimHasher.compute(text);
      }
    } else if (text) {
      simhash = SimHasher.compute(text);
    }
    
    // Get article entities
    let entities = [];
    if (this.tagAdapter) {
      entities = this.tagAdapter.getEntities(contentId) || [];
    }
    
    // Get article locations (GPE entities)
    const locations = entities
      .filter(e => e.entity_type === 'GPE' || e.type === 'GPE')
      .map(e => (e.entity_text || e.text).toLowerCase());
    
    // Find matching cluster
    const match = await this._findMatchingCluster({
      contentId,
      simhash,
      entities,
      locations,
      publishedAt,
      host
    });
    
    if (match) {
      return {
        matched: true,
        clusterId: match.cluster.id,
        headline: match.cluster.headline,
        confidence: match.confidence,
        signals: match.signals,
        articleCount: match.cluster.article_count
      };
    }
    
    return {
      matched: false,
      reason: 'No matching story cluster found',
      contentId
    };
  }
  
  /**
   * Find matching cluster for article
   * @private
   */
  async _findMatchingCluster(article) {
    if (!this.topicAdapter) {
      return null;
    }
    
    const { contentId, simhash, entities, locations, publishedAt } = article;
    
    // Get recent active clusters
    const clusters = this.topicAdapter.getStoryClusters({
      activeOnly: true,
      limit: 100
    });
    
    let bestMatch = null;
    let bestConfidence = 0;
    
    for (const cluster of clusters) {
      const articleIds = JSON.parse(cluster.article_ids || '[]');
      
      if (articleIds.length === 0) continue;
      if (articleIds.includes(contentId)) continue; // Already in cluster
      
      // Check time proximity
      const clusterTime = cluster.last_updated || cluster.first_seen;
      const timeDiff = this._timeDiffHours(publishedAt, clusterTime);
      if (timeDiff > this.maxTimeDiffHours) {
        continue;
      }
      
      // Calculate matching signals
      const signals = await this._calculateMatchSignals({
        contentId,
        simhash,
        entities,
        locations,
        publishedAt,
        clusterArticleIds: articleIds,
        timeDiff
      });
      
      // Check if meets threshold
      if (signals.simHashDistance > this.maxHammingDistance) {
        continue;
      }
      
      if (signals.entityOverlap < this.minSharedEntities) {
        continue;
      }
      
      // Calculate confidence score
      const confidence = this._calculateConfidence(signals);
      
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = {
          cluster,
          confidence,
          signals
        };
      }
    }
    
    // Threshold for accepting match
    if (bestMatch && bestConfidence >= 0.5) {
      return bestMatch;
    }
    
    return null;
  }
  
  /**
   * Calculate matching signals between article and cluster
   * @private
   */
  async _calculateMatchSignals(params) {
    const { 
      simhash, 
      entities, 
      locations, 
      clusterArticleIds, 
      timeDiff 
    } = params;
    
    // Get fingerprints for cluster articles
    let minDistance = 64;
    if (simhash && this.similarityAdapter) {
      for (const id of clusterArticleIds.slice(0, 10)) {
        const fp = this.similarityAdapter.getFingerprint(id);
        if (fp && fp.simhash) {
          const dist = this._hammingDistance(simhash, fp.simhash);
          minDistance = Math.min(minDistance, dist);
        }
      }
    }
    
    // Calculate entity overlap
    let entityOverlap = 0;
    let sharedEntities = [];
    if (this.tagAdapter && entities.length > 0) {
      const clusterEntities = this._getClusterEntities(clusterArticleIds);
      const overlap = this._calculateEntityOverlap(entities, clusterEntities);
      entityOverlap = overlap.count;
      sharedEntities = overlap.shared;
    }
    
    // Calculate location match
    let locationMatch = false;
    if (locations.length > 0 && this.tagAdapter) {
      const clusterLocations = this._getClusterLocations(clusterArticleIds);
      locationMatch = locations.some(loc => clusterLocations.has(loc));
    }
    
    return {
      simHashDistance: minDistance,
      simHashScore: minDistance <= this.maxHammingDistance ? 1 - (minDistance / 64) : 0,
      entityOverlap,
      sharedEntities,
      timeProximity: Math.max(0, 1 - (timeDiff / this.maxTimeDiffHours)),
      locationMatch: locationMatch ? 1 : 0
    };
  }
  
  /**
   * Calculate confidence score from signals
   * 
   * confidence = 0.4*(simHashScore) + 0.3*(entityOverlap) + 0.2*(timeProximity) + 0.1*(locationMatch)
   * 
   * @private
   */
  _calculateConfidence(signals) {
    const simHashScore = signals.simHashScore;
    const entityScore = Math.min(1, signals.entityOverlap / 3); // Cap at 3 entities
    const timeScore = signals.timeProximity;
    const locationScore = signals.locationMatch;
    
    return (
      0.4 * simHashScore +
      0.3 * entityScore +
      0.2 * timeScore +
      0.1 * locationScore
    );
  }
  
  /**
   * Add article to story cluster
   * 
   * @param {number} clusterId - Cluster ID
   * @param {number} contentId - Article content ID
   * @returns {Object} Updated cluster info
   */
  addToCluster(clusterId, contentId) {
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
      
      this.topicAdapter.updateStoryCluster(clusterId, {
        articleIds,
        articleCount: articleIds.length
      });
    }
    
    return {
      clusterId,
      articleIds,
      articleCount: articleIds.length
    };
  }
  
  /**
   * Create a new story cluster from matched articles
   * 
   * @param {Object} options - Cluster options
   * @param {string} options.headline - Cluster headline
   * @param {number[]} options.articleIds - Article IDs
   * @param {string} [options.summary] - Cluster summary
   * @returns {Object} Created cluster
   */
  createCluster(options) {
    if (!this.topicAdapter) {
      throw new Error('TopicAdapter required for createCluster');
    }
    
    const { headline, articleIds, summary = null } = options;
    
    return this.topicAdapter.saveStoryCluster({
      headline,
      summary,
      articleIds,
      articleCount: articleIds.length,
      isActive: true
    });
  }
  
  /**
   * Get cluster entities
   * @private
   */
  _getClusterEntities(articleIds) {
    if (!this.tagAdapter) return [];
    
    const allEntities = [];
    for (const id of articleIds.slice(0, 10)) {
      const entities = this.tagAdapter.getEntities(id);
      if (entities) {
        allEntities.push(...entities);
      }
    }
    return allEntities;
  }
  
  /**
   * Get cluster locations (GPE entities)
   * @private
   */
  _getClusterLocations(articleIds) {
    const entities = this._getClusterEntities(articleIds);
    const locations = new Set();
    
    for (const entity of entities) {
      if (entity.entity_type === 'GPE' || entity.type === 'GPE') {
        locations.add((entity.entity_text || entity.text).toLowerCase());
      }
    }
    
    return locations;
  }
  
  /**
   * Calculate entity overlap
   * @private
   */
  _calculateEntityOverlap(entities1, entities2) {
    if (!entities1.length || !entities2.length) {
      return { count: 0, shared: [] };
    }
    
    const normalize = (text) => (text || '').toLowerCase().trim();
    
    const set1 = new Set(
      entities1.map(e => normalize(e.entity_text || e.text))
    );
    
    const shared = [];
    for (const entity of entities2) {
      const normalized = normalize(entity.entity_text || entity.text);
      if (set1.has(normalized) && !shared.includes(normalized)) {
        shared.push(normalized);
      }
    }
    
    return {
      count: shared.length,
      shared
    };
  }
  
  /**
   * Calculate Hamming distance between fingerprints
   * @private
   */
  _hammingDistance(fp1, fp2) {
    const buf1 = Buffer.isBuffer(fp1) ? fp1 : Buffer.from(fp1, 'hex');
    const buf2 = Buffer.isBuffer(fp2) ? fp2 : Buffer.from(fp2, 'hex');
    
    return SimHasher.hammingDistance(buf1, buf2);
  }
  
  /**
   * Calculate time difference in hours
   * @private
   */
  _timeDiffHours(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.abs(d1 - d2) / (1000 * 60 * 60);
  }
  
  /**
   * Find articles that could be matched to the same story
   * 
   * @param {Array<Object>} articles - Articles to analyze
   * @returns {Array<{articleIds: number[], confidence: number, signals: Object}>}
   */
  findPotentialMatches(articles) {
    const matches = [];
    const processed = new Set();
    
    for (let i = 0; i < articles.length; i++) {
      if (processed.has(articles[i].id)) continue;
      
      const group = {
        articleIds: [articles[i].id],
        articles: [articles[i]]
      };
      
      for (let j = i + 1; j < articles.length; j++) {
        if (processed.has(articles[j].id)) continue;
        
        // Check SimHash distance
        if (articles[i].simhash && articles[j].simhash) {
          const dist = this._hammingDistance(articles[i].simhash, articles[j].simhash);
          
          if (dist <= this.maxHammingDistance) {
            // Check time proximity
            if (articles[i].publishedAt && articles[j].publishedAt) {
              const timeDiff = this._timeDiffHours(
                articles[i].publishedAt, 
                articles[j].publishedAt
              );
              if (timeDiff > this.maxTimeDiffHours) continue;
            }
            
            // Check entity overlap
            const overlap = this._calculateEntityOverlap(
              articles[i].entities || [],
              articles[j].entities || []
            );
            
            if (overlap.count >= this.minSharedEntities) {
              group.articleIds.push(articles[j].id);
              group.articles.push(articles[j]);
              processed.add(articles[j].id);
            }
          }
        }
      }
      
      if (group.articleIds.length >= 2) {
        processed.add(articles[i].id);
        matches.push({
          articleIds: group.articleIds,
          confidence: group.articleIds.length >= 3 ? 0.9 : 0.7
        });
      }
    }
    
    return matches;
  }
  
  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    return {
      maxHammingDistance: this.maxHammingDistance,
      minSharedEntities: this.minSharedEntities,
      maxTimeDiffHours: this.maxTimeDiffHours,
      hasTopicAdapter: !!this.topicAdapter,
      hasSimilarityAdapter: !!this.similarityAdapter,
      hasTagAdapter: !!this.tagAdapter,
      hasArticlesAdapter: !!this.articlesAdapter
    };
  }
}

module.exports = {
  StoryMatcher,
  MAX_HAMMING_DISTANCE,
  MIN_SHARED_ENTITIES,
  MAX_TIME_DIFF_HOURS,
  LOOKBACK_HOURS
};
