'use strict';

/**
 * TopicModeler - Seed-based topic classification for news articles
 * 
 * Uses pre-defined seed topics with keyword lists for classification.
 * Articles are scored against each topic using TF-IDF weighted keyword matching.
 * 
 * Features:
 * - Load seed topics from JSON configuration
 * - Score articles against topics using keyword overlap
 * - Multi-topic assignment with probabilities
 * - Discovery of new topics from unclassified content (future)
 * 
 * @module TopicModeler
 */

const fs = require('fs');
const path = require('path');

// Default path to seed topics
const DEFAULT_SEED_TOPICS_PATH = path.join(__dirname, '../../../data/seed-topics.json');

// Minimum score to assign a topic (0-1 range)
const MIN_TOPIC_SCORE = 0.05;

// Maximum topics to assign per article
const MAX_TOPICS_PER_ARTICLE = 3;

// Stopwords to filter from article text
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'it', 'its',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they',
  'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
  'very', 'just', 'also', 'now', 'here', 'there', 'then', 'once', 'if',
  'because', 'until', 'while', 'although', 'about', 'into', 'over', 'after',
  'before', 'between', 'under', 'during', 'without', 'again', 'further',
  'once', 'any', 'said', 'says', 'say', 'new', 'year', 'years', 'time',
  'first', 'last', 'one', 'two', 'three', 'people', 'get', 'make', 'made'
]);

/**
 * Tokenize text into words
 * 
 * @param {string} text - Input text
 * @returns {string[]} Array of lowercase tokens
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  return text
    .toLowerCase()
    .replace(/['']/g, '')
    .split(/[^a-z]+/)
    .filter(token => 
      token.length >= 3 && 
      token.length <= 30 &&
      !STOPWORDS.has(token) &&
      !/^\d+$/.test(token)
    );
}

/**
 * Calculate term frequencies for tokens
 * 
 * @param {string[]} tokens - Array of tokens
 * @returns {Map<string, number>} Term -> frequency map
 */
function calculateTermFrequencies(tokens) {
  const termCounts = new Map();
  
  for (const token of tokens) {
    termCounts.set(token, (termCounts.get(token) || 0) + 1);
  }
  
  // Normalize by document length
  const docLength = tokens.length;
  const tf = new Map();
  
  for (const [term, count] of termCounts) {
    tf.set(term, count / docLength);
  }
  
  return tf;
}

/**
 * TopicModeler class for topic classification
 */
class TopicModeler {
  /**
   * Create a TopicModeler
   * 
   * @param {Object} [options] - Configuration options
   * @param {string} [options.seedTopicsPath] - Path to seed topics JSON
   * @param {Object} [options.topicAdapter] - Database adapter for topics
   * @param {Object} [options.logger] - Logger instance
   * @param {number} [options.minScore=0.05] - Minimum score to assign topic
   * @param {number} [options.maxTopics=3] - Max topics per article
   */
  constructor(options = {}) {
    this.seedTopicsPath = options.seedTopicsPath || DEFAULT_SEED_TOPICS_PATH;
    this.topicAdapter = options.topicAdapter || null;
    this.logger = options.logger || console;
    this.minScore = options.minScore || MIN_TOPIC_SCORE;
    this.maxTopics = options.maxTopics || MAX_TOPICS_PER_ARTICLE;
    
    // Loaded topics: { id, name, keywords: Set, keywordArray: [] }
    this.topics = [];
    
    // Keyword -> topic mapping for fast lookup
    this.keywordIndex = new Map();
    
    this._initialized = false;
  }
  
  /**
   * Initialize the modeler by loading seed topics
   * 
   * @returns {Promise<number>} Number of topics loaded
   */
  async initialize() {
    if (this._initialized) {
      return this.topics.length;
    }
    
    try {
      // First, try to load from database if adapter available
      if (this.topicAdapter) {
        const dbTopics = this.topicAdapter.getAllTopics({ includeSeed: true });
        if (dbTopics.length > 0) {
          this._loadTopicsFromArray(dbTopics);
          this._initialized = true;
          this.logger.log(`[TopicModeler] Loaded ${this.topics.length} topics from database`);
          return this.topics.length;
        }
      }
      
      // Fall back to seed file
      await this._loadSeedTopics();
      
      // Save seed topics to database if adapter available
      if (this.topicAdapter && this.topics.length > 0) {
        for (const topic of this.topics) {
          this.topicAdapter.saveTopic({
            name: topic.name,
            keywords: topic.keywordArray,
            isSeed: true
          });
        }
        this.logger.log(`[TopicModeler] Saved ${this.topics.length} seed topics to database`);
      }
      
      this._initialized = true;
      return this.topics.length;
    } catch (err) {
      this.logger.error('[TopicModeler] Error initializing:', err);
      throw err;
    }
  }
  
  /**
   * Load seed topics from JSON file
   * @private
   */
  async _loadSeedTopics() {
    const content = fs.readFileSync(this.seedTopicsPath, 'utf8');
    const data = JSON.parse(content);
    
    if (!data.topics || !Array.isArray(data.topics)) {
      throw new Error('Invalid seed topics file format');
    }
    
    this._loadTopicsFromArray(data.topics.map(t => ({
      id: t.id,
      name: t.name,
      keywords: JSON.stringify(t.keywords),
      isSeed: 1
    })));
    
    this.logger.log(`[TopicModeler] Loaded ${this.topics.length} seed topics from file`);
  }
  
  /**
   * Load topics from array (database format)
   * @param {Array} topicsData - Topics from database or file
   * @private
   */
  _loadTopicsFromArray(topicsData) {
    this.topics = [];
    this.keywordIndex.clear();
    
    for (const t of topicsData) {
      const keywordArray = typeof t.keywords === 'string' 
        ? JSON.parse(t.keywords) 
        : t.keywords;
      
      const topic = {
        id: t.id,
        name: t.name,
        keywords: new Set(keywordArray.map(k => k.toLowerCase())),
        keywordArray: keywordArray.map(k => k.toLowerCase()),
        isSeed: t.isSeed || t.is_seed || false
      };
      
      this.topics.push(topic);
      
      // Index keywords for fast lookup
      for (const keyword of topic.keywords) {
        if (!this.keywordIndex.has(keyword)) {
          this.keywordIndex.set(keyword, []);
        }
        this.keywordIndex.get(keyword).push(topic.id);
      }
    }
  }
  
  /**
   * Classify article text into topics
   * 
   * @param {string} text - Article body text
   * @param {Object} [options] - Classification options
   * @param {number} [options.maxTopics] - Override max topics
   * @param {number} [options.minScore] - Override min score
   * @returns {Array<{topicId: number, topicName: string, probability: number, matchedKeywords: string[]}>}
   */
  classify(text, options = {}) {
    if (!this._initialized) {
      throw new Error('TopicModeler not initialized. Call initialize() first.');
    }
    
    const maxTopics = options.maxTopics || this.maxTopics;
    const minScore = options.minScore || this.minScore;
    
    const tokens = tokenize(text);
    
    if (tokens.length === 0) {
      return [];
    }
    
    const tf = calculateTermFrequencies(tokens);
    
    // Score each topic
    const topicScores = [];
    
    for (const topic of this.topics) {
      const { score, matchedKeywords } = this._scoreTopic(topic, tf, tokens);
      
      if (score >= minScore) {
        topicScores.push({
          topicId: topic.id,
          topicName: topic.name,
          probability: score,
          matchedKeywords
        });
      }
    }
    
    // Sort by score descending and take top N
    topicScores.sort((a, b) => b.probability - a.probability);
    
    return topicScores.slice(0, maxTopics);
  }
  
  /**
   * Score a single topic against article tokens
   * 
   * @param {Object} topic - Topic object with keywords Set
   * @param {Map<string, number>} tf - Term frequency map
   * @param {string[]} tokens - Original tokens for stats
   * @returns {{score: number, matchedKeywords: string[]}}
   * @private
   */
  _scoreTopic(topic, tf, tokens) {
    const matchedKeywords = [];
    let totalScore = 0;
    
    // For each topic keyword, check if it appears in the document
    for (const keyword of topic.keywords) {
      if (tf.has(keyword)) {
        matchedKeywords.push(keyword);
        // Weight by term frequency and keyword importance
        // Keywords at the start of the list are more important
        const keywordIndex = topic.keywordArray.indexOf(keyword);
        const keywordWeight = 1 - (keywordIndex / topic.keywordArray.length) * 0.5;
        totalScore += tf.get(keyword) * keywordWeight;
      }
    }
    
    // Normalize by number of topic keywords
    // This ensures topics with more keywords don't automatically score higher
    const normalizedScore = totalScore / Math.sqrt(topic.keywords.size);
    
    // Also consider keyword coverage (what fraction of topic keywords matched)
    const coverage = matchedKeywords.length / topic.keywords.size;
    
    // Combined score: weighted average of normalized score and coverage
    const combinedScore = (normalizedScore * 0.7) + (coverage * 0.3);
    
    // Clamp to 0-1 range
    const finalScore = Math.min(1, Math.max(0, combinedScore));
    
    return {
      score: Math.round(finalScore * 10000) / 10000,
      matchedKeywords
    };
  }
  
  /**
   * Batch classify multiple articles
   * 
   * @param {Array<{id: number, text: string}>} articles - Articles to classify
   * @param {Object} [options] - Options
   * @returns {Array<{articleId: number, topics: Array}>}
   */
  classifyBatch(articles, options = {}) {
    const results = [];
    
    for (const article of articles) {
      const topics = this.classify(article.text, options);
      results.push({
        articleId: article.id,
        topics
      });
    }
    
    return results;
  }
  
  /**
   * Process and save article topics to database
   * 
   * @param {number} contentId - Article content ID
   * @param {string} text - Article body text
   * @returns {{topicsAssigned: number, topics: Array}}
   */
  async processArticle(contentId, text) {
    if (!this.topicAdapter) {
      throw new Error('TopicAdapter required for processArticle');
    }
    
    const topics = this.classify(text);
    
    if (topics.length === 0) {
      return { topicsAssigned: 0, topics: [] };
    }
    
    // Save article-topic assignments
    for (const topic of topics) {
      this.topicAdapter.saveArticleTopic({
        contentId,
        topicId: topic.topicId,
        probability: topic.probability
      });
    }
    
    // Update topic article counts
    this.topicAdapter.updateTopicCounts();
    
    return {
      topicsAssigned: topics.length,
      topics
    };
  }
  
  /**
   * Get topic by ID
   * 
   * @param {number} topicId - Topic ID
   * @returns {Object|null} Topic object or null
   */
  getTopic(topicId) {
    return this.topics.find(t => t.id === topicId) || null;
  }
  
  /**
   * Get topic by name
   * 
   * @param {string} name - Topic name
   * @returns {Object|null} Topic object or null
   */
  getTopicByName(name) {
    const lowerName = name.toLowerCase();
    return this.topics.find(t => t.name.toLowerCase() === lowerName) || null;
  }
  
  /**
   * Get all topics
   * 
   * @returns {Array} All topics
   */
  getAllTopics() {
    return this.topics.map(t => ({
      id: t.id,
      name: t.name,
      keywords: t.keywordArray,
      isSeed: t.isSeed
    }));
  }
  
  /**
   * Get modeler statistics
   * 
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      initialized: this._initialized,
      topicCount: this.topics.length,
      seedTopicCount: this.topics.filter(t => t.isSeed).length,
      keywordCount: this.keywordIndex.size,
      minScore: this.minScore,
      maxTopics: this.maxTopics
    };
  }
}

module.exports = {
  TopicModeler,
  tokenize,
  calculateTermFrequencies,
  MIN_TOPIC_SCORE,
  MAX_TOPICS_PER_ARTICLE,
  STOPWORDS
};
