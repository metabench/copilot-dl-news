'use strict';

/**
 * FactExtractor - Extract verifiable facts from articles
 * 
 * Extracts:
 * - Quotes: Direct quotations from sources
 * - Statistics: Numbers, percentages, amounts
 * - Dates: Specific dates mentioned
 * - Claims: Assertions made by sources
 * 
 * Used for cross-source fact comparison to identify:
 * - Shared facts reported by multiple sources
 * - Conflicting statistics between sources
 * - Unique claims made by specific sources
 * 
 * @module FactExtractor
 */

// Regex patterns for fact extraction
const PATTERNS = {
  // Quotes: text in double quotes, 20+ chars
  quotes: /"([^"]{20,})"/g,
  
  // Single quotes (for British style)
  singleQuotes: /'([^']{20,})'/g,
  
  // Statistics: numbers with units
  statistics: /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(percent|%|million|billion|thousand|trillion|dollars|euros|pounds|people|deaths|cases|votes|points|hours|days|weeks|months|years)/gi,
  
  // Percentages specifically
  percentages: /(\d+(?:\.\d+)?)\s*(?:percent|%)/gi,
  
  // Money amounts
  money: /\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(million|billion|thousand|trillion)?/gi,
  
  // Dates: Month DD, YYYY format
  datesMonthFirst: /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/gi,
  
  // Dates: DD Month YYYY format
  datesDayFirst: /(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s*(\d{4})?/gi,
  
  // Relative dates
  relativeDates: /(last|next|this)\s+(week|month|year|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/gi,
  
  // Claims: sentences with attribution
  claims: /(?:said|claimed|stated|announced|reported|according to|told|confirmed|denied|argued|suggested)\s+(?:that\s+)?([^.!?]+[.!?])/gi,
  
  // Named source claims
  namedClaims: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:said|claimed|stated|told|announced)\s*(?:that\s+)?["']?([^.!?"']+)/gi
};

/**
 * FactExtractor class for extracting verifiable facts
 */
class FactExtractor {
  /**
   * Create a FactExtractor instance
   * 
   * @param {Object} [options] - Configuration
   * @param {Object} [options.logger] - Logger instance
   * @param {number} [options.minQuoteLength=20] - Minimum quote length
   * @param {number} [options.maxQuoteLength=500] - Maximum quote length
   */
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.minQuoteLength = options.minQuoteLength || 20;
    this.maxQuoteLength = options.maxQuoteLength || 500;
  }
  
  /**
   * Extract all facts from text
   * 
   * @param {string} text - Article text
   * @param {Object} [options] - Extraction options
   * @param {boolean} [options.includePositions=false] - Include character positions
   * @returns {Object} Extracted facts by type
   */
  extract(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return this._emptyResult();
    }
    
    const { includePositions = false } = options;
    
    const quotes = this._extractQuotes(text, includePositions);
    const statistics = this._extractStatistics(text, includePositions);
    const dates = this._extractDates(text, includePositions);
    const claims = this._extractClaims(text, includePositions);
    
    return {
      quotes,
      statistics,
      dates,
      claims,
      summary: {
        totalFacts: quotes.length + statistics.length + dates.length + claims.length,
        quoteCount: quotes.length,
        statisticCount: statistics.length,
        dateCount: dates.length,
        claimCount: claims.length
      },
      extractedAt: new Date().toISOString()
    };
  }
  
  /**
   * Extract and compare facts from multiple articles
   * 
   * @param {Array<{id: number, text: string, host: string}>} articles - Articles to compare
   * @returns {Object} Comparison result with shared and unique facts
   */
  compareArticles(articles) {
    const allFacts = articles.map(article => ({
      articleId: article.id,
      host: article.host,
      facts: this.extract(article.text)
    }));
    
    // Group facts by type and find overlaps/conflicts
    const comparison = {
      quotes: this._compareFactType(allFacts, 'quotes'),
      statistics: this._compareStatistics(allFacts),
      dates: this._compareFactType(allFacts, 'dates'),
      claims: this._compareFactType(allFacts, 'claims')
    };
    
    // Find conflicts (different statistics for same metric)
    comparison.conflicts = this._findConflicts(allFacts);
    
    // Calculate overall agreement
    comparison.agreement = this._calculateAgreement(comparison);
    
    return comparison;
  }
  
  /**
   * Extract quotes from text
   * @private
   */
  _extractQuotes(text, includePositions) {
    const quotes = [];
    const seen = new Set();
    
    // Double quotes
    let match;
    const doubleQuotePattern = new RegExp(PATTERNS.quotes.source, 'g');
    while ((match = doubleQuotePattern.exec(text)) !== null) {
      const quote = match[1].trim();
      const normalized = quote.toLowerCase();
      
      if (quote.length >= this.minQuoteLength && 
          quote.length <= this.maxQuoteLength &&
          !seen.has(normalized)) {
        seen.add(normalized);
        
        const fact = {
          text: quote,
          type: 'quote'
        };
        
        if (includePositions) {
          fact.start = match.index;
          fact.end = match.index + match[0].length;
        }
        
        // Try to find speaker (name before quote)
        const speaker = this._findSpeaker(text, match.index);
        if (speaker) {
          fact.speaker = speaker;
        }
        
        quotes.push(fact);
      }
    }
    
    // Single quotes (British style)
    const singleQuotePattern = new RegExp(PATTERNS.singleQuotes.source, 'g');
    while ((match = singleQuotePattern.exec(text)) !== null) {
      const quote = match[1].trim();
      const normalized = quote.toLowerCase();
      
      if (quote.length >= this.minQuoteLength && 
          quote.length <= this.maxQuoteLength &&
          !seen.has(normalized)) {
        seen.add(normalized);
        
        const fact = {
          text: quote,
          type: 'quote'
        };
        
        if (includePositions) {
          fact.start = match.index;
          fact.end = match.index + match[0].length;
        }
        
        const speaker = this._findSpeaker(text, match.index);
        if (speaker) {
          fact.speaker = speaker;
        }
        
        quotes.push(fact);
      }
    }
    
    return quotes;
  }
  
  /**
   * Find speaker name before a quote
   * @private
   */
  _findSpeaker(text, quoteIndex) {
    // Look at 100 chars before quote
    const before = text.substring(Math.max(0, quoteIndex - 100), quoteIndex);
    
    // Pattern: Name said, Name claimed, etc.
    const speakerPattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:said|says|told|claimed|stated|added|noted),?\s*$/;
    const match = before.match(speakerPattern);
    
    if (match) {
      return match[1];
    }
    
    return null;
  }
  
  /**
   * Extract statistics from text
   * @private
   */
  _extractStatistics(text, includePositions) {
    const statistics = [];
    const seen = new Set();
    
    // General statistics
    let match;
    const statsPattern = new RegExp(PATTERNS.statistics.source, 'gi');
    while ((match = statsPattern.exec(text)) !== null) {
      const value = match[1].replace(/,/g, '');
      const unit = match[2].toLowerCase();
      const key = `${value}:${unit}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        
        const fact = {
          value: parseFloat(value),
          unit,
          text: match[0],
          type: 'statistic'
        };
        
        if (includePositions) {
          fact.start = match.index;
          fact.end = match.index + match[0].length;
        }
        
        // Try to find context (what the statistic refers to)
        fact.context = this._findStatContext(text, match.index, match[0].length);
        
        statistics.push(fact);
      }
    }
    
    // Money amounts
    const moneyPattern = new RegExp(PATTERNS.money.source, 'gi');
    while ((match = moneyPattern.exec(text)) !== null) {
      const value = match[1].replace(/,/g, '');
      const multiplier = match[2] ? match[2].toLowerCase() : '';
      const key = `$${value}:${multiplier}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        
        let numericValue = parseFloat(value);
        if (multiplier === 'million') numericValue *= 1000000;
        else if (multiplier === 'billion') numericValue *= 1000000000;
        else if (multiplier === 'trillion') numericValue *= 1000000000000;
        else if (multiplier === 'thousand') numericValue *= 1000;
        
        const fact = {
          value: numericValue,
          unit: 'dollars',
          text: match[0],
          type: 'money'
        };
        
        if (includePositions) {
          fact.start = match.index;
          fact.end = match.index + match[0].length;
        }
        
        fact.context = this._findStatContext(text, match.index, match[0].length);
        
        statistics.push(fact);
      }
    }
    
    return statistics;
  }
  
  /**
   * Find context around a statistic
   * @private
   */
  _findStatContext(text, index, matchLength) {
    // Get surrounding sentence
    const start = Math.max(0, text.lastIndexOf('.', index) + 1);
    const end = text.indexOf('.', index + matchLength);
    
    if (end > start) {
      const sentence = text.substring(start, end + 1).trim();
      // Extract key nouns/context from sentence (simplified)
      return sentence.length > 200 ? sentence.substring(0, 200) + '...' : sentence;
    }
    
    return null;
  }
  
  /**
   * Extract dates from text
   * @private
   */
  _extractDates(text, includePositions) {
    const dates = [];
    const seen = new Set();
    
    // Month DD, YYYY format
    let match;
    const monthFirstPattern = new RegExp(PATTERNS.datesMonthFirst.source, 'gi');
    while ((match = monthFirstPattern.exec(text)) !== null) {
      const dateStr = match[0];
      const key = dateStr.toLowerCase();
      
      if (!seen.has(key)) {
        seen.add(key);
        
        const fact = {
          text: dateStr,
          month: match[1],
          day: parseInt(match[2], 10),
          year: match[3] ? parseInt(match[3], 10) : null,
          type: 'date'
        };
        
        if (includePositions) {
          fact.start = match.index;
          fact.end = match.index + match[0].length;
        }
        
        dates.push(fact);
      }
    }
    
    // DD Month YYYY format
    const dayFirstPattern = new RegExp(PATTERNS.datesDayFirst.source, 'gi');
    while ((match = dayFirstPattern.exec(text)) !== null) {
      const dateStr = match[0];
      const key = dateStr.toLowerCase();
      
      if (!seen.has(key)) {
        seen.add(key);
        
        const fact = {
          text: dateStr,
          day: parseInt(match[1], 10),
          month: match[2],
          year: match[3] ? parseInt(match[3], 10) : null,
          type: 'date'
        };
        
        if (includePositions) {
          fact.start = match.index;
          fact.end = match.index + match[0].length;
        }
        
        dates.push(fact);
      }
    }
    
    return dates;
  }
  
  /**
   * Extract claims from text
   * @private
   */
  _extractClaims(text, includePositions) {
    const claims = [];
    const seen = new Set();
    
    // Named source claims
    let match;
    const namedPattern = new RegExp(PATTERNS.namedClaims.source, 'gi');
    while ((match = namedPattern.exec(text)) !== null) {
      const speaker = match[1];
      const claim = match[2].trim();
      const key = claim.toLowerCase().substring(0, 50);
      
      if (claim.length >= 20 && claim.length <= 300 && !seen.has(key)) {
        seen.add(key);
        
        const fact = {
          text: claim,
          speaker,
          type: 'claim'
        };
        
        if (includePositions) {
          fact.start = match.index;
          fact.end = match.index + match[0].length;
        }
        
        claims.push(fact);
      }
    }
    
    // General claims with "according to"
    const accordingPattern = /according to\s+([^,]+),?\s+([^.!?]+)/gi;
    while ((match = accordingPattern.exec(text)) !== null) {
      const source = match[1].trim();
      const claim = match[2].trim();
      const key = claim.toLowerCase().substring(0, 50);
      
      if (claim.length >= 20 && claim.length <= 300 && !seen.has(key)) {
        seen.add(key);
        
        const fact = {
          text: claim,
          source,
          type: 'claim'
        };
        
        if (includePositions) {
          fact.start = match.index;
          fact.end = match.index + match[0].length;
        }
        
        claims.push(fact);
      }
    }
    
    return claims;
  }
  
  /**
   * Compare a specific fact type across articles
   * @private
   */
  _compareFactType(allFacts, factType) {
    const factsByArticle = new Map();
    const allFactTexts = new Map(); // text -> [{articleId, host, fact}]
    
    for (const articleFacts of allFacts) {
      const facts = articleFacts.facts[factType] || [];
      factsByArticle.set(articleFacts.articleId, facts);
      
      for (const fact of facts) {
        const key = this._normalizeFactKey(fact.text || fact.value?.toString());
        if (!allFactTexts.has(key)) {
          allFactTexts.set(key, []);
        }
        allFactTexts.get(key).push({
          articleId: articleFacts.articleId,
          host: articleFacts.host,
          fact
        });
      }
    }
    
    // Categorize as shared or unique
    const shared = [];
    const unique = [];
    
    for (const [key, occurrences] of allFactTexts) {
      if (occurrences.length >= 2) {
        shared.push({
          text: occurrences[0].fact.text,
          sources: occurrences.map(o => o.host),
          sourceCount: occurrences.length
        });
      } else {
        unique.push({
          text: occurrences[0].fact.text,
          source: occurrences[0].host,
          articleId: occurrences[0].articleId
        });
      }
    }
    
    return { shared, unique };
  }
  
  /**
   * Compare statistics specifically to find conflicts
   * @private
   */
  _compareStatistics(allFacts) {
    const result = this._compareFactType(allFacts, 'statistics');
    
    // Group statistics by context to find potential conflicts
    const byContext = new Map();
    
    for (const articleFacts of allFacts) {
      const stats = articleFacts.facts.statistics || [];
      for (const stat of stats) {
        if (stat.context) {
          const contextKey = this._normalizeFactKey(stat.context.substring(0, 30));
          if (!byContext.has(contextKey)) {
            byContext.set(contextKey, []);
          }
          byContext.get(contextKey).push({
            articleId: articleFacts.articleId,
            host: articleFacts.host,
            stat
          });
        }
      }
    }
    
    // Find contexts with different values
    result.potentialConflicts = [];
    for (const [context, stats] of byContext) {
      if (stats.length >= 2) {
        const values = new Set(stats.map(s => s.stat.value));
        if (values.size > 1) {
          result.potentialConflicts.push({
            context: stats[0].stat.context,
            values: stats.map(s => ({
              value: s.stat.value,
              unit: s.stat.unit,
              source: s.host
            }))
          });
        }
      }
    }
    
    return result;
  }
  
  /**
   * Find conflicting facts between sources
   * @private
   */
  _findConflicts(allFacts) {
    const conflicts = [];
    
    // Check statistics for same metric with different values
    const statsByMetric = new Map();
    
    for (const articleFacts of allFacts) {
      const stats = articleFacts.facts.statistics || [];
      for (const stat of stats) {
        // Use unit + context fragment as metric key
        const metricKey = `${stat.unit}:${(stat.context || '').substring(0, 20)}`.toLowerCase();
        
        if (!statsByMetric.has(metricKey)) {
          statsByMetric.set(metricKey, []);
        }
        statsByMetric.get(metricKey).push({
          articleId: articleFacts.articleId,
          host: articleFacts.host,
          value: stat.value,
          unit: stat.unit,
          context: stat.context
        });
      }
    }
    
    // Find metrics with conflicting values
    for (const [metric, stats] of statsByMetric) {
      if (stats.length >= 2) {
        const values = [...new Set(stats.map(s => s.value))];
        if (values.length > 1) {
          // Calculate variance to determine if conflict is significant
          const variance = this._calculateVariance(values);
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          const coefficientOfVariation = Math.sqrt(variance) / mean;
          
          // Only flag as conflict if variation is significant (>10%)
          if (coefficientOfVariation > 0.1) {
            conflicts.push({
              type: 'statistic_conflict',
              metric: stats[0].unit,
              context: stats[0].context,
              values: stats.map(s => ({
                value: s.value,
                source: s.host
              })),
              severity: coefficientOfVariation > 0.5 ? 'high' : 'moderate'
            });
          }
        }
      }
    }
    
    return conflicts;
  }
  
  /**
   * Calculate variance
   * @private
   */
  _calculateVariance(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }
  
  /**
   * Calculate overall agreement score
   * @private
   */
  _calculateAgreement(comparison) {
    let sharedCount = 0;
    let uniqueCount = 0;
    let conflictCount = comparison.conflicts.length;
    
    for (const type of ['quotes', 'statistics', 'dates', 'claims']) {
      if (comparison[type]) {
        sharedCount += comparison[type].shared?.length || 0;
        uniqueCount += comparison[type].unique?.length || 0;
      }
    }
    
    const total = sharedCount + uniqueCount;
    if (total === 0) return { score: 0, level: 'insufficient_data' };
    
    const sharedRatio = sharedCount / total;
    const conflictPenalty = Math.min(0.3, conflictCount * 0.1);
    const score = Math.max(0, sharedRatio - conflictPenalty);
    
    let level = 'low';
    if (score >= 0.7) level = 'high';
    else if (score >= 0.4) level = 'moderate';
    
    return {
      score: Math.round(score * 100) / 100,
      level,
      sharedFacts: sharedCount,
      uniqueFacts: uniqueCount,
      conflicts: conflictCount
    };
  }
  
  /**
   * Normalize fact key for comparison
   * @private
   */
  _normalizeFactKey(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);
  }
  
  /**
   * Empty result for missing text
   * @private
   */
  _emptyResult() {
    return {
      quotes: [],
      statistics: [],
      dates: [],
      claims: [],
      summary: {
        totalFacts: 0,
        quoteCount: 0,
        statisticCount: 0,
        dateCount: 0,
        claimCount: 0
      },
      extractedAt: new Date().toISOString()
    };
  }
  
  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    return {
      minQuoteLength: this.minQuoteLength,
      maxQuoteLength: this.maxQuoteLength,
      patternCount: Object.keys(PATTERNS).length
    };
  }
}

module.exports = {
  FactExtractor,
  PATTERNS
};
