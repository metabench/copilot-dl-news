/**
 * Predictive Hub Discovery - Proactive hub prediction
 * 
 * Predicts likely hub URLs before crawling:
 * - Pattern-based sibling prediction (if /world/france exists, predict /world/germany)
 * - Gazetteer-driven URL generation (use Wikidata/place data)
 * - Confidence scoring for predictions
 * - Domain-specific strategy learning
 */

class PredictiveHubDiscovery {
  constructor({ db, logger = console } = {}) {
    this.db = db;
    this.logger = logger;

    // Prediction caches
    this.urlPatterns = new Map(); // domain -> patterns
    this.predictedHubs = new Map(); // domain -> predictions
    this.strategyPerformance = new Map(); // strategy -> performance stats

    // Prediction strategies
    this.strategies = {
      'sibling-pattern': { weight: 1.0, enabled: true },
      'gazetteer-place': { weight: 0.9, enabled: true },
      'parent-child': { weight: 0.8, enabled: true },
      'url-template': { weight: 0.7, enabled: true }
    };
  }

  /**
   * Predict hub siblings based on existing hub patterns
   * e.g., /world/france → /world/germany, /world/spain
   */
  async predictSiblingHubs(domain, knownHubUrl, context = {}) {
    const predictions = [];
    
    try {
      // Extract URL pattern
      const pattern = this._extractUrlPattern(knownHubUrl);
      if (!pattern) {
        return [];
      }

      // Get sibling entities based on hub type
      const hubType = this._inferHubType(knownHubUrl, pattern);
      const siblings = await this._findSiblingEntities(domain, knownHubUrl, hubType, context);

      for (const sibling of siblings) {
        const predictedUrl = this._generateSiblingUrl(knownHubUrl, pattern, sibling);
        if (predictedUrl) {
          predictions.push({
            url: predictedUrl,
            hubType: hubType,
            strategy: 'sibling-pattern',
            confidence: this._calculateSiblingConfidence(sibling, context),
            source: knownHubUrl,
            entity: sibling.name,
            reasoning: `Sibling of ${knownHubUrl} based on ${hubType} pattern`
          });
        }
      }

      this.logger.log?.('[PredictiveHub]', `Predicted ${predictions.length} sibling hubs from ${knownHubUrl}`);
      
    } catch (error) {
      this.logger.error?.('Failed to predict sibling hubs', error);
    }

    return predictions;
  }

  /**
   * Generate hub predictions using gazetteer/Wikidata
   */
  async predictFromGazetteer(domain, parentHubUrl, context = {}) {
    const predictions = [];

    if (!this.db) {
      return predictions;
    }

    try {
      // Get URL pattern from parent
      const pattern = this._extractUrlPattern(parentHubUrl);
      if (!pattern) {
        return [];
      }

      // Query gazetteer for places
      const places = await this._queryGazetteerPlaces(domain, context);

      for (const place of places) {
        const predictedUrl = this._generatePlaceUrl(parentHubUrl, pattern, place);
        if (predictedUrl) {
          predictions.push({
            url: predictedUrl,
            hubType: this._placeTypeToHubType(place.type),
            strategy: 'gazetteer-place',
            confidence: this._calculateGazetteerConfidence(place, context),
            source: parentHubUrl,
            entity: place.name,
            metadata: {
              population: place.population,
              isCapital: place.isCapital,
              wikidataId: place.wikidataId
            },
            reasoning: `Generated from gazetteer: ${place.name} (${place.type})`
          });
        }
      }

      this.logger.log?.('[PredictiveHub]', `Generated ${predictions.length} gazetteer-based predictions`);
      
    } catch (error) {
      this.logger.error?.('Failed to predict from gazetteer', error);
    }

    return predictions;
  }

  /**
   * Predict child hubs from parent hub
   * e.g., /world → /world/europe, /world/asia, /world/americas
   */
  async predictChildHubs(domain, parentHubUrl, context = {}) {
    const predictions = [];

    try {
      const parentType = this._inferHubType(parentHubUrl);
      const childTypes = this._getExpectedChildTypes(parentType);

      for (const childType of childTypes) {
        const entities = await this._findEntitiesByType(domain, childType, context);
        
        for (const entity of entities) {
          const predictedUrl = this._generateChildUrl(parentHubUrl, entity);
          if (predictedUrl) {
            predictions.push({
              url: predictedUrl,
              hubType: childType,
              strategy: 'parent-child',
              confidence: this._calculateChildConfidence(entity, parentType, context),
              source: parentHubUrl,
              entity: entity.name,
              reasoning: `Child of ${parentHubUrl} (${parentType} → ${childType})`
            });
          }
        }
      }

      this.logger.log?.('[PredictiveHub]', `Predicted ${predictions.length} child hubs from ${parentHubUrl}`);
      
    } catch (error) {
      this.logger.error?.('Failed to predict child hubs', error);
    }

    return predictions;
  }

  /**
   * Generate predictions using URL templates learned from domain
   */
  async predictFromTemplates(domain, context = {}) {
    const predictions = [];

    try {
      const templates = await this._loadUrlTemplates(domain);
      
      for (const template of templates) {
        const entities = await this._findEntitiesForTemplate(domain, template, context);
        
        for (const entity of entities) {
          const predictedUrl = this._applyTemplate(template, entity);
          if (predictedUrl) {
            predictions.push({
              url: predictedUrl,
              hubType: template.hubType,
              strategy: 'url-template',
              confidence: template.confidence * this._entityMatchScore(entity, template),
              source: template.pattern,
              entity: entity.name,
              reasoning: `Template match: ${template.pattern}`
            });
          }
        }
      }

      this.logger.log?.('[PredictiveHub]', `Generated ${predictions.length} template-based predictions`);
      
    } catch (error) {
      this.logger.error?.('Failed to predict from templates', error);
    }

    return predictions;
  }

  /**
   * Predict all hub URLs for a domain using all strategies
   */
  async predictHubsForDomain(domain, context = {}) {
    const allPredictions = [];

    try {
      // Get known hubs
      const knownHubs = await this._loadKnownHubs(domain);

      // Strategy 1: Sibling prediction from known hubs
      for (const hub of knownHubs.slice(0, 10)) { // Limit to prevent explosion
        const siblings = await this.predictSiblingHubs(domain, hub.url, context);
        allPredictions.push(...siblings);
      }

      // Strategy 2: Gazetteer-based prediction
      const parentHub = knownHubs.find(h => h.type === 'section-hub' || h.type === 'root');
      if (parentHub) {
        const gazetteerPreds = await this.predictFromGazetteer(domain, parentHub.url, context);
        allPredictions.push(...gazetteerPreds);
      }

      // Strategy 3: Parent-child prediction
      for (const hub of knownHubs.filter(h => h.hasChildren !== false)) {
        const children = await this.predictChildHubs(domain, hub.url, context);
        allPredictions.push(...children);
      }

      // Strategy 4: Template-based prediction
      const templatePreds = await this.predictFromTemplates(domain, context);
      allPredictions.push(...templatePreds);

      // Deduplicate and rank by confidence
      const uniquePredictions = this._deduplicatePredictions(allPredictions);
      const rankedPredictions = this._rankPredictions(uniquePredictions, domain);

      // Cache predictions
      this.predictedHubs.set(domain, rankedPredictions);

      this.logger.log?.('[PredictiveHub]', `Total ${rankedPredictions.length} unique predictions for ${domain}`);

      return rankedPredictions;
      
    } catch (error) {
      this.logger.error?.('Failed to predict hubs for domain', error);
      return [];
    }
  }

  /**
   * Record prediction outcome (hit/miss) for learning
   */
  async recordPredictionOutcome(domain, predictedUrl, strategy, outcome) {
    if (!this.db) {
      return;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT INTO prediction_outcomes (
          domain, predicted_url, strategy, outcome, recorded_at
        ) VALUES (?, ?, ?, ?, datetime('now'))
      `);

      stmt.run(domain, predictedUrl, strategy, outcome);

      // Update strategy performance
      await this._updateStrategyPerformance(strategy, outcome);

      this.logger.log?.('[PredictiveHub]', `Recorded ${outcome} for ${strategy} prediction: ${predictedUrl}`);
      
    } catch (error) {
      this.logger.error?.('Failed to record prediction outcome', error);
    }
  }

  /**
   * Get strategy performance statistics
   */
  async getStrategyPerformance(domain = null) {
    if (!this.db) {
      return {};
    }

    try {
      const whereClause = domain ? 'WHERE domain = ?' : '';
      const stmt = this.db.prepare(`
        SELECT 
          strategy,
          COUNT(*) as total,
          SUM(CASE WHEN outcome = 'hit' THEN 1 ELSE 0 END) as hits,
          SUM(CASE WHEN outcome = 'miss' THEN 1 ELSE 0 END) as misses,
          CAST(SUM(CASE WHEN outcome = 'hit' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) as accuracy
        FROM prediction_outcomes
        ${whereClause}
        GROUP BY strategy
      `);

      const rows = domain ? stmt.all(domain) : stmt.all();
      
      const performance = {};
      for (const row of rows) {
        performance[row.strategy] = {
          total: row.total,
          hits: row.hits,
          misses: row.misses,
          accuracy: row.accuracy || 0,
          confidence: this._calculateStrategyConfidence(row)
        };
      }

      return performance;
      
    } catch (error) {
      this.logger.error?.('Failed to get strategy performance', error);
      return {};
    }
  }

  /**
   * Get top N predictions for a domain
   */
  getTopPredictions(domain, limit = 20) {
    const predictions = this.predictedHubs.get(domain) || [];
    return predictions.slice(0, limit);
  }

  /**
   * Get predictions by strategy
   */
  getPredictionsByStrategy(domain, strategy) {
    const predictions = this.predictedHubs.get(domain) || [];
    return predictions.filter(p => p.strategy === strategy);
  }

  /**
   * Get prediction statistics
   */
  getPredictionStats(domain = null) {
    if (domain) {
      const predictions = this.predictedHubs.get(domain) || [];
      return this._calculatePredictionStats(predictions);
    }

    // Global stats
    let totalPredictions = 0;
    const byStrategy = {};
    
    for (const predictions of this.predictedHubs.values()) {
      totalPredictions += predictions.length;
      
      for (const pred of predictions) {
        byStrategy[pred.strategy] = (byStrategy[pred.strategy] || 0) + 1;
      }
    }

    return {
      totalPredictions,
      domains: this.predictedHubs.size,
      byStrategy,
      avgPerDomain: totalPredictions / Math.max(1, this.predictedHubs.size)
    };
  }

  // Private helpers

  _extractUrlPattern(url) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      
      if (pathParts.length === 0) {
        return null;
      }

      // Extract pattern with last component as placeholder
      const pattern = {
        scheme: urlObj.protocol,
        host: urlObj.host,
        pathPrefix: pathParts.slice(0, -1).join('/'),
        lastComponent: pathParts[pathParts.length - 1],
        depth: pathParts.length
      };

      return pattern;
    } catch (error) {
      return null;
    }
  }

  _inferHubType(url, pattern = null) {
    if (!pattern) {
      pattern = this._extractUrlPattern(url);
    }

    if (!pattern) {
      return 'unknown';
    }

    const urlLower = url.toLowerCase();
    const pathLower = pattern.pathPrefix ? pattern.pathPrefix.toLowerCase() : '';
    const lastComponent = pattern.lastComponent ? pattern.lastComponent.toLowerCase() : '';

    // Infer from URL structure (note: pathPrefix doesn't have leading slash)
    if (pathLower.includes('world') || pathLower.includes('international')) {
      return 'country-hub';
    }
    if (pathLower.includes('region') || pathLower.includes('us')) {
      return 'region-hub';
    }
    if (pathLower.includes('city') || pathLower.includes('cities')) {
      return 'city-hub';
    }
    if (pathLower.includes('topic')) {
      return 'topic-hub';
    }
    // Check if lastComponent is a country code or 'us'
    if (lastComponent === 'us' || lastComponent === 'uk' || lastComponent.length === 2) {
      return 'country-hub';
    }
    if (pattern.depth === 1) {
      return 'section-hub';
    }

    return 'generic-hub';
  }

  async _findSiblingEntities(domain, hubUrl, hubType, context) {
    if (!this.db) {
      return [];
    }

    try {
      // Extract entity from URL
      const urlObj = new URL(hubUrl);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const currentEntity = pathParts[pathParts.length - 1];

      // Convert hub type to place type for query
      let placeType;
      if (hubType === 'country-hub') {
        placeType = 'country';
      } else if (hubType === 'city-hub') {
        placeType = 'city';
      } else if (hubType === 'region-hub') {
        placeType = 'state'; // Use state as primary region type
      } else {
        return [];
      }

      // Query gazetteer for siblings
      let query;
      let params = [];

      if (hubType === 'country-hub') {
        query = `
          SELECT name, slug, population, is_capital, wikidata_id
          FROM gazetteer
          WHERE type = 'country' AND slug != ?
          ORDER BY population DESC
          LIMIT 50
        `;
        params = [currentEntity];
      } else if (hubType === 'city-hub') {
        query = `
          SELECT name, slug, population, is_capital, wikidata_id
          FROM gazetteer
          WHERE type = 'city' AND slug != ?
          ORDER BY population DESC
          LIMIT 30
        `;
        params = [currentEntity];
      } else if (hubType === 'region-hub') {
        query = `
          SELECT name, slug, population, is_capital, wikidata_id
          FROM gazetteer
          WHERE type IN ('region', 'state', 'province') AND slug != ?
          ORDER BY population DESC
          LIMIT 40
        `;
        params = [currentEntity];
      } else {
        return [];
      }

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params);

      return rows.map(row => ({
        name: row.name,
        slug: row.slug,
        population: row.population,
        isCapital: row.is_capital === 1,
        wikidataId: row.wikidata_id,
        type: hubType
      }));
      
    } catch (error) {
      this.logger.error?.('Failed to find sibling entities', error);
      return [];
    }
  }

  _generateSiblingUrl(baseUrl, pattern, sibling) {
    try {
      const slug = sibling.slug || sibling.name.toLowerCase().replace(/\s+/g, '-');
      
      if (pattern.pathPrefix) {
        return `${pattern.scheme}//${pattern.host}/${pattern.pathPrefix}/${slug}`;
      } else {
        return `${pattern.scheme}//${pattern.host}/${slug}`;
      }
    } catch (error) {
      return null;
    }
  }

  _calculateSiblingConfidence(sibling, context) {
    let confidence = 0.7; // Base confidence

    // Higher confidence for populous places
    if (sibling.population > 1000000) {
      confidence += 0.15;
    } else if (sibling.population > 100000) {
      confidence += 0.05;
    }

    // Higher confidence for capitals
    if (sibling.isCapital) {
      confidence += 0.1;
    }

    // Higher confidence if has Wikidata ID
    if (sibling.wikidataId) {
      confidence += 0.05;
    }

    return Math.min(0.95, confidence);
  }

  async _queryGazetteerPlaces(domain, context) {
    if (!this.db) {
      return [];
    }

    try {
      const stmt = this.db.prepare(`
        SELECT name, slug, type, population, is_capital, wikidata_id
        FROM gazetteer
        WHERE type IN ('country', 'city', 'region', 'state')
        ORDER BY population DESC
        LIMIT ?
      `);

      const limit = context.limit || 100;
      const rows = stmt.all(limit);

      return rows.map(row => ({
        name: row.name,
        slug: row.slug,
        type: row.type,
        population: row.population,
        isCapital: row.is_capital === 1,
        wikidataId: row.wikidata_id
      }));
      
    } catch (error) {
      return [];
    }
  }

  _generatePlaceUrl(parentUrl, pattern, place) {
    try {
      const slug = place.slug || place.name.toLowerCase().replace(/\s+/g, '-');
      
      if (pattern.pathPrefix) {
        return `${pattern.scheme}//${pattern.host}/${pattern.pathPrefix}/${slug}`;
      } else {
        return `${pattern.scheme}//${pattern.host}/${slug}`;
      }
    } catch (error) {
      return null;
    }
  }

  _placeTypeToHubType(placeType) {
    const mapping = {
      'country': 'country-hub',
      'city': 'city-hub',
      'region': 'region-hub',
      'state': 'region-hub',
      'province': 'region-hub'
    };
    return mapping[placeType] || 'generic-hub';
  }

  _calculateGazetteerConfidence(place, context) {
    let confidence = 0.6; // Base confidence for gazetteer

    // Higher confidence for well-documented places
    if (place.wikidataId) {
      confidence += 0.1;
    }

    // Population-based confidence
    if (place.population > 5000000) {
      confidence += 0.15;
    } else if (place.population > 1000000) {
      confidence += 0.1;
    } else if (place.population > 100000) {
      confidence += 0.05;
    }

    // Capital bonus
    if (place.isCapital) {
      confidence += 0.1;
    }

    return Math.min(0.9, confidence);
  }

  _getExpectedChildTypes(parentType) {
    const hierarchy = {
      'root': ['section-hub', 'country-hub'],
      'section-hub': ['country-hub', 'region-hub', 'topic-hub'],
      'country-hub': ['region-hub', 'city-hub'],
      'region-hub': ['city-hub'],
      'world-hub': ['country-hub'],
      'generic-hub': ['region-hub', 'city-hub']
    };

    return hierarchy[parentType] || [];
  }

  async _findEntitiesByType(domain, entityType, context) {
    if (!this.db) {
      return [];
    }

    try {
      let query;
      let params;
      
      if (entityType === 'region-hub') {
        // Query for state/region types
        query = `
          SELECT name, slug, population, is_capital, wikidata_id
          FROM gazetteer
          WHERE type IN ('state', 'region', 'province')
          ORDER BY population DESC
          LIMIT 50
        `;
        params = [];
      } else {
        const placeType = entityType.replace('-hub', '');
        query = `
          SELECT name, slug, population, is_capital, wikidata_id
          FROM gazetteer
          WHERE type = ?
          ORDER BY population DESC
          LIMIT 50
        `;
        params = [placeType];
      }

      const stmt = this.db.prepare(query);
      const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
      
      return rows.map(row => ({
        name: row.name,
        slug: row.slug,
        population: row.population,
        isCapital: row.is_capital === 1,
        wikidataId: row.wikidata_id
      }));
      
    } catch (error) {
      return [];
    }
  }

  _generateChildUrl(parentUrl, entity) {
    try {
      const parentObj = new URL(parentUrl);
      const slug = entity.slug || entity.name.toLowerCase().replace(/\s+/g, '-');
      
      const childPath = parentObj.pathname.replace(/\/$/, '') + '/' + slug;
      
      return `${parentObj.protocol}//${parentObj.host}${childPath}`;
    } catch (error) {
      return null;
    }
  }

  _calculateChildConfidence(entity, parentType, context) {
    let confidence = 0.65; // Base confidence for parent-child

    // Population bonus
    if (entity.population > 1000000) {
      confidence += 0.1;
    } else if (entity.population > 100000) {
      confidence += 0.05;
    }

    // Capital bonus
    if (entity.isCapital) {
      confidence += 0.15;
    }

    // Wikidata bonus
    if (entity.wikidataId) {
      confidence += 0.05;
    }

    return Math.min(0.9, confidence);
  }

  async _loadUrlTemplates(domain) {
    if (!this.db) {
      return [];
    }

    try {
      const stmt = this.db.prepare(`
        SELECT pattern, hub_type, confidence, examples
        FROM url_templates
        WHERE domain = ?
        ORDER BY confidence DESC
      `);

      const rows = stmt.all(domain);
      
      return rows.map(row => ({
        pattern: row.pattern,
        hubType: row.hub_type,
        confidence: row.confidence,
        examples: JSON.parse(row.examples || '[]')
      }));
      
    } catch (error) {
      return [];
    }
  }

  async _findEntitiesForTemplate(domain, template, context) {
    // Use gazetteer to find entities matching template type
    return await this._findEntitiesByType(domain, template.hubType, context);
  }

  _applyTemplate(template, entity) {
    try {
      // Replace placeholder in template with entity slug
      const slug = entity.slug || entity.name.toLowerCase().replace(/\s+/g, '-');
      return template.pattern.replace('{entity}', slug);
    } catch (error) {
      return null;
    }
  }

  _entityMatchScore(entity, template) {
    // Simple match score based on entity attributes
    let score = 0.5;

    if (entity.wikidataId) {
      score += 0.2;
    }

    if (entity.population > 100000) {
      score += 0.2;
    }

    if (entity.isCapital) {
      score += 0.1;
    }

    return Math.min(1.0, score);
  }

  async _loadKnownHubs(domain) {
    if (!this.db) {
      return [];
    }

    try {
      // Load from hub tree
      const stmt = this.db.prepare(`
        SELECT knowledge_value
        FROM cross_crawl_knowledge
        WHERE source_domain = ? AND knowledge_type = 'hub-tree'
        ORDER BY updated_at DESC
        LIMIT 1
      `);

      const row = stmt.get(domain);
      if (!row) {
        return [];
      }

      const hubTree = JSON.parse(row.knowledge_value);
      const hubs = [];

      for (const level of hubTree.levels || []) {
        for (const hub of level) {
          hubs.push({
            url: hub.url,
            type: hub.type,
            confidence: hub.confidence || 0.7
          });
        }
      }

      return hubs;
      
    } catch (error) {
      return [];
    }
  }

  _deduplicatePredictions(predictions) {
    const seen = new Map();
    const unique = [];

    for (const pred of predictions) {
      const key = pred.url.toLowerCase();
      
      if (!seen.has(key)) {
        seen.set(key, pred);
        unique.push(pred);
      } else {
        // Keep prediction with higher confidence
        const existing = seen.get(key);
        if (pred.confidence > existing.confidence) {
          seen.set(key, pred);
          const index = unique.indexOf(existing);
          unique[index] = pred;
        }
      }
    }

    return unique;
  }

  _rankPredictions(predictions, domain) {
    // Apply strategy weights
    const weighted = predictions.map(pred => {
      const strategy = this.strategies[pred.strategy];
      const weight = strategy ? strategy.weight : 1.0;
      
      return {
        ...pred,
        weightedConfidence: pred.confidence * weight,
        rank: 0 // Will be set after sorting
      };
    });

    // Sort by weighted confidence
    weighted.sort((a, b) => b.weightedConfidence - a.weightedConfidence);

    // Assign ranks
    weighted.forEach((pred, index) => {
      pred.rank = index + 1;
    });

    return weighted;
  }

  async _updateStrategyPerformance(strategy, outcome) {
    const key = strategy;
    const current = this.strategyPerformance.get(key) || { hits: 0, misses: 0 };

    if (outcome === 'hit') {
      current.hits++;
    } else {
      current.misses++;
    }

    this.strategyPerformance.set(key, current);

    // Adjust strategy weight based on performance
    const accuracy = current.hits / (current.hits + current.misses);
    
    if (this.strategies[strategy]) {
      if (accuracy > 0.7) {
        this.strategies[strategy].weight = Math.min(1.0, this.strategies[strategy].weight + 0.05);
      } else if (accuracy < 0.3) {
        this.strategies[strategy].weight = Math.max(0.3, this.strategies[strategy].weight - 0.05);
      }
    }
  }

  _calculateStrategyConfidence(stats) {
    const total = stats.hits + stats.misses;
    if (total < 10) {
      return 0.5; // Low confidence with insufficient data
    }

    const accuracy = stats.hits / total;
    
    // Wilson score interval lower bound for confidence
    const z = 1.96; // 95% confidence
    const phat = accuracy;
    const n = total;
    
    const confidence = (phat + z*z/(2*n) - z * Math.sqrt((phat*(1-phat)+z*z/(4*n))/n))/(1+z*z/n);
    
    return Math.max(0, Math.min(1, confidence));
  }

  _calculatePredictionStats(predictions) {
    const stats = {
      total: predictions.length,
      byStrategy: {},
      byHubType: {},
      avgConfidence: 0,
      confidenceDistribution: {
        high: 0,    // >= 0.8
        medium: 0,  // 0.5-0.8
        low: 0      // < 0.5
      }
    };

    for (const pred of predictions) {
      // By strategy
      stats.byStrategy[pred.strategy] = (stats.byStrategy[pred.strategy] || 0) + 1;
      
      // By hub type
      stats.byHubType[pred.hubType] = (stats.byHubType[pred.hubType] || 0) + 1;
      
      // Confidence
      stats.avgConfidence += pred.confidence;
      
      if (pred.confidence >= 0.8) {
        stats.confidenceDistribution.high++;
      } else if (pred.confidence >= 0.5) {
        stats.confidenceDistribution.medium++;
      } else {
        stats.confidenceDistribution.low++;
      }
    }

    stats.avgConfidence = predictions.length > 0 ? stats.avgConfidence / predictions.length : 0;

    return stats;
  }

  close() {
    this.urlPatterns.clear();
    this.predictedHubs.clear();
    this.strategyPerformance.clear();
  }
}

module.exports = { PredictiveHubDiscovery };
