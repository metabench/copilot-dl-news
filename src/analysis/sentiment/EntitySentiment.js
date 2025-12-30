'use strict';

/**
 * EntitySentiment - Entity-Level Sentiment Analysis
 * 
 * Analyzes sentiment toward specific entities (people, organizations, places)
 * mentioned in text. Scores sentiment in sentences containing each entity.
 * 
 * For each entity, returns:
 * - entity: Name of the entity
 * - type: Entity type (PERSON, ORG, GPE)
 * - score: Sentiment score toward this entity (-1 to +1)
 * - mentions: Number of mentions
 * - contexts: Sample sentences mentioning the entity
 * 
 * @module EntitySentiment
 */

const { Lexicon } = require('./Lexicon');

// Default configuration
const DEFAULT_ENTITY_CONFIG = {
  // Window size for context around entity mention
  contextWindowChars: 200,
  
  // Maximum contexts to return per entity
  maxContextsPerEntity: 3,
  
  // Minimum mentions for reliable sentiment
  minMentionsForConfidence: 2,
  
  // Negation/intensifier window (words)
  negationWindow: 3,
  intensifierWindow: 2,
  negationMultiplier: -0.8
};

/**
 * EntitySentiment class for entity-level sentiment analysis
 */
class EntitySentiment {
  /**
   * Create an EntitySentiment instance
   * @param {Object} [options] - Configuration options
   * @param {Object} [options.lexicon] - Lexicon instance
   * @param {Object} [options.config] - Configuration overrides
   */
  constructor(options = {}) {
    this.lexicon = options.lexicon || new Lexicon();
    this.config = { ...DEFAULT_ENTITY_CONFIG, ...options.config };
  }
  
  /**
   * Analyze text for entities and their sentiment (auto-extraction)
   * This method attempts to extract entities from text using simple patterns
   * when no EntityRecognizer is available.
   * 
   * @param {string} text - Text to analyze
   * @returns {Array<Object>} Entity sentiment results
   */
  analyzeTextForEntities(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }
    
    // Simple entity extraction using capitalization patterns
    const entities = this._extractSimpleEntities(text);
    return this.analyzeEntities(text, entities);
  }
  
  /**
   * Simple entity extraction based on capitalization patterns
   * @private
   */
  _extractSimpleEntities(text) {
    const entities = [];
    
    // Match capitalized words that could be names/organizations
    // Pattern: 2+ capitalized words in sequence, or single capitalized word followed by Inc/Corp/LLC
    const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
    const orgPattern = /\b([A-Z][a-z]+(?:\s+(?:Inc|Corp|LLC|Ltd|Company|Co)\.?))\b/g;
    const singleCapPattern = /\b([A-Z][a-z]{2,})\b/g;
    
    let match;
    const seen = new Set();
    
    // Multi-word names
    while ((match = namePattern.exec(text)) !== null) {
      const name = match[1];
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        entities.push({ text: name, type: 'ENTITY' });
      }
    }
    
    // Organizations with suffixes
    while ((match = orgPattern.exec(text)) !== null) {
      const org = match[1];
      if (!seen.has(org.toLowerCase())) {
        seen.add(org.toLowerCase());
        entities.push({ text: org, type: 'ORG' });
      }
    }
    
    // Limit to most frequent single-cap words (likely to be entities)
    // Skip common words
    const skipWords = new Set(['the', 'a', 'an', 'this', 'that', 'it', 'they', 'we', 'you', 'i']);
    
    return entities.slice(0, 10); // Limit to top 10 entities
  }
  
  /**
   * Analyze sentiment toward entities in text
   * 
   * @param {string} text - Full text to analyze
   * @param {Array<{text: string, type: string}>} entities - Entities to analyze
   * @returns {Array<Object>} Entity sentiment results
   */
  analyzeEntities(text, entities) {
    if (!text || !entities || entities.length === 0) {
      return [];
    }
    
    const textLower = text.toLowerCase();
    const results = [];
    
    // Deduplicate entities by normalized text
    const uniqueEntities = this._deduplicateEntities(entities);
    
    for (const entity of uniqueEntities) {
      const entityResult = this._analyzeEntity(text, textLower, entity);
      
      if (entityResult.mentions > 0) {
        results.push(entityResult);
      }
    }
    
    // Sort by absolute score (most opinionated first)
    results.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
    
    return results;
  }
  
  /**
   * Analyze sentiment toward a single entity
   * @private
   */
  _analyzeEntity(text, textLower, entity) {
    const entityLower = entity.text.toLowerCase();
    const mentions = [];
    let pos = 0;
    
    // Find all mentions of the entity
    while (true) {
      const index = textLower.indexOf(entityLower, pos);
      if (index === -1) break;
      
      // Verify word boundaries
      const before = index > 0 ? textLower[index - 1] : ' ';
      const after = index + entityLower.length < textLower.length 
        ? textLower[index + entityLower.length] 
        : ' ';
      
      if (/\W/.test(before) && /\W/.test(after)) {
        mentions.push(index);
      }
      
      pos = index + 1;
    }
    
    if (mentions.length === 0) {
      return {
        entity: entity.text,
        type: entity.type,
        score: 0,
        confidence: 0,
        mentions: 0,
        contexts: []
      };
    }
    
    // Extract context around each mention and analyze sentiment
    const contexts = [];
    const scores = [];
    
    for (const mentionPos of mentions) {
      // Extract context window
      const contextStart = Math.max(0, mentionPos - this.config.contextWindowChars);
      const contextEnd = Math.min(text.length, mentionPos + entity.text.length + this.config.contextWindowChars);
      const context = text.substring(contextStart, contextEnd);
      
      // Find the sentence containing this mention
      const sentence = this._extractSentence(text, mentionPos);
      
      // Analyze sentiment in this sentence
      const sentenceScore = this._analyzeSentence(sentence);
      scores.push(sentenceScore);
      
      // Store context for output (limit to configured max)
      if (contexts.length < this.config.maxContextsPerEntity) {
        contexts.push({
          text: context.replace(/\s+/g, ' ').trim(),
          score: sentenceScore
        });
      }
    }
    
    // Aggregate scores
    const avgScore = scores.length > 0 
      ? scores.reduce((sum, s) => sum + s, 0) / scores.length 
      : 0;
    
    // Confidence based on mention count and score consistency
    const scoreVariance = this._calculateVariance(scores);
    let confidence = Math.min(1, mentions.length / 5); // More mentions = higher confidence
    
    // Reduce confidence if scores are inconsistent
    if (scoreVariance > 0.5) {
      confidence *= 0.7;
    }
    
    // Reduce confidence for few mentions
    if (mentions.length < this.config.minMentionsForConfidence) {
      confidence *= 0.6;
    }
    
    return {
      entity: entity.text,
      type: entity.type,
      score: Math.round(avgScore * 1000) / 1000,
      confidence: Math.round(confidence * 1000) / 1000,
      mentions: mentions.length,
      contexts
    };
  }
  
  /**
   * Extract the sentence containing a position
   * @private
   */
  _extractSentence(text, position) {
    // Find sentence boundaries
    const beforeText = text.substring(0, position);
    const afterText = text.substring(position);
    
    // Find start of sentence
    const sentenceEnders = /[.!?]\s+/g;
    let sentenceStart = 0;
    let match;
    
    while ((match = sentenceEnders.exec(beforeText)) !== null) {
      sentenceStart = match.index + match[0].length;
    }
    
    // Find end of sentence
    const afterMatch = afterText.match(/[.!?]\s+/);
    const sentenceEnd = position + (afterMatch ? afterMatch.index + 1 : afterText.length);
    
    return text.substring(sentenceStart, sentenceEnd).trim();
  }
  
  /**
   * Analyze sentiment of a sentence
   * @private
   */
  _analyzeSentence(sentence) {
    const words = sentence
      .toLowerCase()
      .replace(/[^a-z0-9'-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);
    
    let totalScore = 0;
    let wordCount = 0;
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const baseScore = this.lexicon.getScore(word);
      
      if (baseScore === null) continue;
      
      let adjustedScore = baseScore;
      
      // Check for negation
      for (let j = Math.max(0, i - this.config.negationWindow); j < i; j++) {
        if (this.lexicon.isNegation(words[j])) {
          adjustedScore = baseScore * this.config.negationMultiplier;
          break;
        }
      }
      
      // Check for intensifier (only if not negated)
      if (adjustedScore === baseScore) {
        for (let j = Math.max(0, i - this.config.intensifierWindow); j < i; j++) {
          const mult = this.lexicon.getIntensifier(words[j]);
          if (mult !== null) {
            adjustedScore = baseScore * mult;
            break;
          }
        }
      }
      
      totalScore += adjustedScore;
      wordCount++;
    }
    
    // Normalize to -1 to +1
    if (wordCount === 0) return 0;
    
    const avgScore = totalScore / wordCount;
    const normalized = avgScore / (1 + Math.abs(avgScore) * 0.5);
    
    return Math.max(-1, Math.min(1, normalized));
  }
  
  /**
   * Deduplicate entities by normalized text
   * @private
   */
  _deduplicateEntities(entities) {
    const seen = new Map();
    
    for (const entity of entities) {
      const key = entity.text.toLowerCase();
      
      if (!seen.has(key)) {
        seen.set(key, entity);
      } else {
        // Keep the one with higher confidence if available
        const existing = seen.get(key);
        if ((entity.confidence || 0) > (existing.confidence || 0)) {
          seen.set(key, entity);
        }
      }
    }
    
    return Array.from(seen.values());
  }
  
  /**
   * Calculate variance of scores
   * @private
   */
  _calculateVariance(scores) {
    if (scores.length < 2) return 0;
    
    const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const squaredDiffs = scores.map(s => Math.pow(s - mean, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / scores.length;
    
    return variance;
  }
  
  /**
   * Get configuration
   * @returns {Object}
   */
  getConfig() {
    return { ...this.config };
  }
}

module.exports = {
  EntitySentiment,
  DEFAULT_ENTITY_CONFIG
};
