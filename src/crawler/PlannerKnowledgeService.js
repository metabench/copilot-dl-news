const { PlannerDatabase } = require('../db/PlannerDatabase');

/**
 * Planner knowledge reuse service for intelligent crawling
 * Integrates with existing planner to provide pattern learning and hub validation
 */
class PlannerKnowledgeService {
  constructor(enhancedDb, configManager) {
    this.enhancedDb = enhancedDb;
    this.configManager = configManager;
    this.plannerDb = enhancedDb?.planner;
    
    // Cache for frequently accessed patterns and hubs
    this.patternCache = new Map();
    this.hubValidationCache = new Map();
    this.cacheExpiry = 30 * 60 * 1000; // 30 minutes
    
    console.log('Planner knowledge service initialized');
  }

  /**
   * Learn patterns from successful hub discoveries
   */
  async learnFromHubDiscovery({ domain, hubUrl, discoveryMethod, success, metadata = {} }) {
    if (!this.plannerDb) return;

    try {
      // Extract pattern from successful hub URL
      const pattern = this._extractPattern(hubUrl, discoveryMethod);
      if (!pattern) return;

      const patternType = this._classifyPatternType(discoveryMethod, hubUrl);
      
      if (success) {
        // Record successful pattern
        this.plannerDb.recordPattern({
          domain,
          patternType,
          patternRegex: pattern.regex,
          successIncrement: 1,
          metadata: {
            ...pattern.metadata,
            ...metadata,
            learnedFrom: hubUrl,
            discoveryMethod,
            learnedAt: new Date().toISOString()
          }
        });

        console.log(`Learned successful pattern: ${pattern.regex} for ${domain}`);
      } else {
        // Record failed pattern
        this.plannerDb.recordPattern({
          domain,
          patternType,
          patternRegex: pattern.regex,
          failureIncrement: 1,
          metadata: {
            ...pattern.metadata,
            failedUrl: hubUrl,
            failureReason: metadata.failureReason || 'unknown'
          }
        });
      }

      // Clear cache for this domain to force refresh
      this._clearDomainCache(domain);
    } catch (error) {
      console.error('Failed to learn from hub discovery:', error);
    }
  }

  /**
   * Get learned patterns for a domain to guide new discoveries
   */
  async getLearnedPatterns(domain, minConfidence = 0.6) {
    if (!this.plannerDb) return [];

    try {
      // Check cache first
      const cacheKey = `patterns:${domain}:${minConfidence}`;
      if (this.patternCache.has(cacheKey)) {
        const cached = this.patternCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheExpiry) {
          return cached.patterns;
        }
      }

      // Fetch from database
      const patterns = this.plannerDb.getPatternsByDomain(domain, minConfidence);
      
      // Cache the results
      this.patternCache.set(cacheKey, {
        patterns,
        timestamp: Date.now()
      });

      return patterns;
    } catch (error) {
      console.error('Failed to get learned patterns:', error);
      return [];
    }
  }

  /**
   * Validate a hub URL using learned knowledge
   */
  async validateHubUrl({ domain, hubUrl, hubType, force = false }) {
    if (!this.plannerDb) return { valid: false, confidence: 0 };

    try {
      // Check cache first (unless forced)
      const cacheKey = `hub:${domain}:${hubUrl}`;
      if (!force && this.hubValidationCache.has(cacheKey)) {
        const cached = this.hubValidationCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheExpiry) {
          return cached.result;
        }
      }

      // Check if we have existing validation
      const existingValidations = this.plannerDb.getValidatedHubs(domain);
      const existing = existingValidations.find(v => v.hub_url === hubUrl);
      
      if (existing && !force) {
        const result = {
          valid: existing.validation_status === 'valid',
          confidence: existing.classification_confidence || 0.5,
          method: 'cached_validation',
          lastValidated: existing.validated_at,
          contentIndicators: existing.content_indicators
        };
        
        // Cache the result
        this.hubValidationCache.set(cacheKey, {
          result,
          timestamp: Date.now()
        });
        
        return result;
      }

      // Perform pattern-based validation
      const patterns = await this.getLearnedPatterns(domain, 0.4);
      const patternMatches = this._matchPatternsToUrl(hubUrl, patterns);
      
      let confidence = 0.3; // Base confidence for unknown URLs
      let validationMethod = 'pattern_analysis';
      let contentIndicators = [];

      // Boost confidence based on pattern matches
      for (const match of patternMatches) {
        confidence += match.pattern.confidence_score * 0.3;
        contentIndicators.push(`pattern_match:${match.pattern.pattern_type}`);
      }

      // Apply heuristics based on URL structure
      const urlHeuristics = this._analyzeUrlStructure(hubUrl, hubType);
      confidence += urlHeuristics.confidenceBoost;
      contentIndicators.push(...urlHeuristics.indicators);

      // Normalize confidence to 0-1 range
      confidence = Math.min(confidence, 1.0);
      
      const isValid = confidence >= 0.5;
      
      // Store validation result
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Expire in 7 days
      
      this.plannerDb.recordHubValidation({
        domain,
        hubUrl,
        hubType: hubType || 'unknown',
        validationStatus: isValid ? 'valid' : 'uncertain',
        classificationConfidence: confidence,
        lastFetchStatus: null, // Will be updated when actually fetched
        contentIndicators,
        validationMethod,
        expiresAt: expiresAt.toISOString(),
        revalidationPriority: isValid ? 0 : 3,
        metadata: {
          patternMatches: patternMatches.length,
          urlHeuristics,
          validatedAt: new Date().toISOString()
        }
      });

      const result = {
        valid: isValid,
        confidence,
        method: validationMethod,
        contentIndicators,
        patternMatches: patternMatches.length
      };

      // Cache the result
      this.hubValidationCache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      console.error('Failed to validate hub URL:', error);
      return { valid: false, confidence: 0, error: error.message };
    }
  }

  /**
   * Generate candidate hub URLs based on learned patterns
   */
  async generateCandidateHubs(domain, context = {}) {
    if (!this.plannerDb) return [];

    try {
      const patterns = await this.getLearnedPatterns(domain, 0.5);
      const candidates = [];

      for (const pattern of patterns) {
        const urls = this._generateUrlsFromPattern(pattern, context);
        for (const url of urls) {
          const validation = await this.validateHubUrl({
            domain,
            hubUrl: url,
            hubType: pattern.pattern_type
          });

          if (validation.valid) {
            candidates.push({
              url,
              confidence: validation.confidence,
              source: 'learned_pattern',
              patternId: pattern.id,
              patternType: pattern.pattern_type,
              knowledgeReused: {
                type: 'pattern',
                confidence: pattern.confidence_score,
                validated: true
              }
            });
          }
        }
      }

      // Sort by confidence
      candidates.sort((a, b) => b.confidence - a.confidence);

      console.log(`Generated ${candidates.length} candidate hubs from learned patterns for ${domain}`);
      return candidates.slice(0, 20); // Limit to top 20
    } catch (error) {
      console.error('Failed to generate candidate hubs:', error);
      return [];
    }
  }

  /**
   * Record knowledge reuse event for analytics
   */
  recordReuseEvent({ reuseType, sourceId, reusedUrl, success, timeSavedMs, notes }) {
    if (!this.plannerDb || !this.enhancedDb?.jobId) return;

    try {
      this.plannerDb.recordReuseEvent({
        jobId: this.enhancedDb.jobId,
        reuseType,
        sourcePatternId: reuseType === 'pattern' ? sourceId : null,
        sourceHubId: reuseType === 'hub' ? sourceId : null,
        reusedUrl,
        successOutcome: success,
        timeSavedMs,
        confidenceAtReuse: 0.8, // Default confidence
        outcomeDetails: { notes }
      });
    } catch (error) {
      console.error('Failed to record reuse event:', error);
    }
  }

  /**
   * Extract URL pattern from successful discovery
   */
  _extractPattern(url, discoveryMethod) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      
      if (pathParts.length === 0) return null;

      let regex = '';
      let metadata = {};

      // Common patterns
      if (discoveryMethod === 'sitemap') {
        // Sitemap-based patterns are usually structural
        regex = this._createStructuralPattern(pathParts);
        metadata.source = 'sitemap';
      } else if (discoveryMethod === 'intelligent-seed') {
        // Intelligent seeds often follow semantic patterns
        regex = this._createSemanticPattern(pathParts, url);
        metadata.source = 'intelligent';
      } else {
        // Generic link patterns
        regex = this._createGenericPattern(pathParts);
        metadata.source = 'link';
      }

      return {
        regex,
        metadata: {
          ...metadata,
          pathSegments: pathParts.length,
          domain: urlObj.hostname,
          hasQuery: urlObj.search.length > 0
        }
      };
    } catch (error) {
      return null;
    }
  }

  _createStructuralPattern(pathParts) {
    // Create pattern that matches similar structural URLs
    return '^/' + pathParts.map(part => {
      // If part looks like a category/section, make it a variable
      if (/^[a-z-]+$/.test(part) && part.length > 2) {
        return '([a-z-]+)';
      }
      // If part looks like an ID, make it a number pattern
      if (/^\d+$/.test(part)) {
        return '(\\d+)';
      }
      // Otherwise, match literally
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('/') + '/?$';
  }

  _createSemanticPattern(pathParts, originalUrl) {
    // Create pattern based on semantic meaning
    const pattern = pathParts.map(part => {
      // Common hub patterns
      if (['world', 'news', 'sport', 'business', 'tech', 'culture'].includes(part)) {
        return part; // Keep section names literal
      }
      if (part.length <= 3 && /^[a-z]+$/.test(part)) {
        return '([a-z]{2,3})'; // Country codes or short identifiers
      }
      if (/^[a-z-]+$/.test(part) && part.length > 3) {
        return '([a-z-]+)'; // Variable content
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });

    return '^/' + pattern.join('/') + '/?$';
  }

  _createGenericPattern(pathParts) {
    // Simple generic pattern matching
    if (pathParts.length === 1) {
      return '^/([a-z0-9-]+)/?$';
    }
    if (pathParts.length === 2) {
      return '^/([a-z0-9-]+)/([a-z0-9-]+)/?$';
    }
    return '^/' + pathParts.map(() => '([a-z0-9-]+)').join('/') + '/?$';
  }

  _classifyPatternType(discoveryMethod, url) {
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('/world/') || urlLower.includes('/country/')) {
      return 'country-hub';
    }
    if (urlLower.includes('/sport/') || urlLower.includes('/sports/')) {
      return 'sport-hub';
    }
    if (urlLower.includes('/business/') || urlLower.includes('/economy/')) {
      return 'business-hub';
    }
    if (urlLower.includes('/tech/') || urlLower.includes('/technology/')) {
      return 'tech-hub';
    }
    if (urlLower.includes('/archive/') || urlLower.includes('/history/')) {
      return 'archive-hub';
    }
    
    return 'generic-hub';
  }

  _matchPatternsToUrl(url, patterns) {
    const matches = [];
    
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      
      for (const pattern of patterns) {
        try {
          const regex = new RegExp(pattern.pattern_regex, 'i');
          if (regex.test(path)) {
            matches.push({
              pattern,
              confidence: pattern.confidence_score,
              match: path.match(regex)
            });
          }
        } catch (error) {
          // Skip invalid regex patterns
          continue;
        }
      }
    } catch (error) {
      // Skip invalid URLs
    }
    
    return matches;
  }

  _analyzeUrlStructure(url, hubType) {
    let confidenceBoost = 0;
    const indicators = [];
    
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname.toLowerCase();
      const pathParts = path.split('/').filter(Boolean);
      
      // Positive indicators
      if (pathParts.length >= 1 && pathParts.length <= 3) {
        confidenceBoost += 0.1;
        indicators.push('good_path_depth');
      }
      
      if (/\/(world|sport|business|tech|culture|news|politics)\//.test(path)) {
        confidenceBoost += 0.2;
        indicators.push('known_section');
      }
      
      if (path.endsWith('/') || pathParts[pathParts.length - 1].length > 3) {
        confidenceBoost += 0.1;
        indicators.push('hub_like_ending');
      }
      
      // Negative indicators
      if (path.includes('/article/') || path.includes('/story/')) {
        confidenceBoost -= 0.3;
        indicators.push('article_like');
      }
      
      if (/\d{4}\/\d{2}\/\d{2}/.test(path)) {
        confidenceBoost -= 0.2;
        indicators.push('date_in_path');
      }
      
      if (urlObj.search.length > 0) {
        confidenceBoost -= 0.1;
        indicators.push('has_query_params');
      }
      
    } catch (error) {
      confidenceBoost -= 0.2;
      indicators.push('invalid_url');
    }
    
    return { confidenceBoost, indicators };
  }

  _generateUrlsFromPattern(pattern, context) {
    const urls = [];
    
    try {
      // Simple pattern expansion based on context
      const baseUrl = context.baseUrl || `https://${context.domain || 'example.com'}`;
      
      // Generate variations based on pattern metadata
      if (pattern.pattern_type === 'country-hub' && context.countries) {
        for (const country of context.countries.slice(0, 10)) {
          const url = `${baseUrl}/world/${country.toLowerCase().replace(/\s+/g, '-')}`;
          urls.push(url);
        }
      } else if (pattern.pattern_type === 'sport-hub' && context.sports) {
        for (const sport of context.sports.slice(0, 5)) {
          const url = `${baseUrl}/sport/${sport.toLowerCase().replace(/\s+/g, '-')}`;
          urls.push(url);
        }
      }
      
      // Generic pattern expansion
      if (urls.length === 0) {
        const commonSections = ['news', 'world', 'business', 'sport', 'tech', 'culture'];
        for (const section of commonSections.slice(0, 3)) {
          const url = `${baseUrl}/${section}`;
          urls.push(url);
        }
      }
    } catch (error) {
      console.error('Error generating URLs from pattern:', error);
    }
    
    return urls;
  }

  _clearDomainCache(domain) {
    for (const key of this.patternCache.keys()) {
      if (key.includes(domain)) {
        this.patternCache.delete(key);
      }
    }
    for (const key of this.hubValidationCache.keys()) {
      if (key.includes(domain)) {
        this.hubValidationCache.delete(key);
      }
    }
  }

  /**
   * Get knowledge reuse statistics
   */
  getKnowledgeStats(jobId) {
    if (!this.plannerDb) return null;
    
    try {
      return this.plannerDb.getKnowledgeReuseStats(jobId);
    } catch (error) {
      console.error('Failed to get knowledge stats:', error);
      return null;
    }
  }

  /**
   * Cleanup expired knowledge
   */
  async performMaintenance(retentionDays = 90) {
    if (!this.plannerDb) return { cleaned: 0 };
    
    try {
      const result = this.plannerDb.cleanupExpiredKnowledge(retentionDays);
      console.log(`Knowledge maintenance: cleaned ${result.patternsDeleted} patterns, ${result.hubsDeleted} hubs`);
      
      // Clear caches after cleanup
      this.patternCache.clear();
      this.hubValidationCache.clear();
      
      return result;
    } catch (error) {
      console.error('Knowledge maintenance failed:', error);
      return { cleaned: 0, error: error.message };
    }
  }

  close() {
    this.patternCache.clear();
    this.hubValidationCache.clear();
  }
}

module.exports = { PlannerKnowledgeService };