/**
 * Country Hub Gap Service
 * 
 * **Note**: Country hubs are a specific type of PLACE HUB. Place hubs follow a hierarchy:
 * Continent > Country > Region > City. This service specifically handles country-level
 * place hubs.
 * 
 * **Architecture**: This is a facade/adapter that integrates CountryHubGapAnalyzer
 * with the crawler's state management, telemetry, and enhanced database features.
 * 
 * Detects missing country hubs and uses gap-driven prioritization with pattern discovery
 * to systematically collect all country hubs for a domain.
 * 
 * Features:
 * - Identifies missing country hubs from gazetteer
 * - Generates gap predictions for missing countries
 * - Learns URL patterns from discovered hubs
 * - Prioritizes hub collection based on coverage gaps
 * - Emits milestone when all country hubs are collected
 * 
 * Related services (future):
 * - ContinentHubGapService for continent-level place hubs
 * - RegionHubGapService for region-level place hubs
 * - CityHubGapService for city-level place hubs
 */

const { CountryHubGapAnalyzer } = require('../services/CountryHubGapAnalyzer');

class CountryHubGapService {
  constructor({ 
    state, 
    telemetry, 
    enhancedDb = null, 
    plannerKnowledge = null,
    logger = console 
  } = {}) {
    this.state = state;
    this.telemetry = telemetry;
    this.enhancedDb = enhancedDb;
    this.plannerKnowledge = plannerKnowledge;
    this.logger = logger;
    
    // Get database handle from enhancedDb
    const db = enhancedDb?.db || null;
    if (!db) {
      throw new Error('CountryHubGapService requires database connection via enhancedDb');
    }
    
    // Create standalone analyzer
    this.analyzer = new CountryHubGapAnalyzer({
      db,
      logger
    });
    
    // Track countries we've attempted
    this.attemptedCountries = new Set();
    
    // Cached analysis
    this.lastAnalysis = null;
    this.lastAnalysisTime = 0;
    this.analysisCacheMs = 5000; // Cache for 5 seconds
  }

  /**
   * Analyze country hub coverage and return gap summary
   * 
   * This is a facade method that integrates the standalone analyzer with
   * crawler state management.
   */
  analyzeCountryHubGaps(jobId = null) {
    const hubStats = this.state?.getHubVisitStats?.() || {};
    const countryStats = hubStats.perKind?.country || { seeded: 0, visited: 0 };
    
    // Delegate to analyzer for gap analysis
    const domain = this.state?.getDomain?.() || '';
    const analysis = this.analyzer.analyzeGaps(domain, countryStats);
    
    // Enhance with crawler-specific data (missing URLs from state)
    const missingUrls = [];
    const missingCountries = [];
    
    if (this.state?.getSeededHubSet && typeof this.state.getSeededHubSet === 'function') {
      const seededSet = Array.from(this.state.getSeededHubSet());
      
      for (const url of seededSet) {
        const meta = this.state.getSeededHubMeta?.(url) || {};
        
        // Only interested in country hubs
        if (meta.kind !== 'country') continue;
        
        // Check if visited
        const isVisited = this.state.hasVisitedHub?.(url);
        if (isVisited) continue;
        
        // This is a missing country hub
        missingUrls.push(url);
        
        // Extract country name from metadata or URL
        const countryName = meta.name || this.analyzer.extractCountryNameFromUrl(url);
        if (countryName) {
          missingCountries.push({ name: countryName, url, meta });
        }
      }
    }
    
    // Merge with crawler state data
    return {
      ...analysis,
      missingUrls,
      missingCountries
    };
  }

  /**
   * Generate gap predictions for missing country hubs
   * Creates high-priority queue entries for missing countries
   * 
   * This is a facade method that uses analyzer predictions and integrates
   * with crawler database and telemetry.
   */
  async generateGapPredictions(analysis, jobId, domain) {
    if (!this.enhancedDb?.queue) {
      this.logger.warn?.('[CountryHubGap] Enhanced DB not available, skipping gap predictions');
      return [];
    }

    const predictions = [];
    
    // Get predictions from analyzer
    const analyzerPredictions = this.analyzer.generatePredictions(
      domain,
      analysis.missingCountries.slice(0, 20)
    );
    
    for (const prediction of analyzerPredictions) {
      // Don't re-predict countries we've already attempted
      if (this.attemptedCountries.has(prediction.url)) {
        continue;
      }

      try {
        // Record gap prediction in database
        const result = this.enhancedDb.queue.recordGapPrediction({
          jobId,
          predictedUrl: prediction.url,
          predictionSource: 'country-hub-gap-analysis',
          confidenceScore: prediction.confidence,
          gapType: 'missing-country-hub',
          expectedCoverageLift: 1.0 / Math.max(analysis.missing, 1) // Each hub fills X% of gap
        });

        if (result) {
          predictions.push({
            ...prediction,
            predictionId: result.lastInsertRowid
          });

          this.attemptedCountries.add(prediction.url);

          // Emit telemetry for gap prediction
          this.telemetry?.milestone?.({
            kind: 'gap-prediction',
            scope: 'country-hubs',
            message: `Gap prediction: ${prediction.country} hub missing`,
            details: {
              country: prediction.country,
              url: prediction.url,
              missingTotal: analysis.missing,
              coveragePercent: analysis.coveragePercent,
              confidence: prediction.confidence
            }
          });
        }
      } catch (error) {
        this.logger.error?.('[CountryHubGap] Failed to record gap prediction:', error);
      }
    }

    if (predictions.length > 0) {
      this.logger.log?.(`[CountryHubGap] Generated ${predictions.length} gap predictions for missing country hubs`);
    }

    return predictions;
  }

  /**
   * Learn patterns from successful country hub discoveries
   */
  async learnCountryHubPattern(hubUrl, countryName, discoveryMethod = 'hub-visited') {
    if (!this.plannerKnowledge) {
      return;
    }

    try {
      await this.plannerKnowledge.learnFromHubDiscovery({
        domain: this._extractDomain(hubUrl),
        hubUrl,
        discoveryMethod,
        success: true,
        metadata: {
          hubType: 'country',
          countryName,
          patternType: 'country-hub',
          timestamp: new Date().toISOString()
        }
      });

      this.logger.log?.(`[CountryHubGap] Learned pattern from country hub: ${countryName}`);
    } catch (error) {
      this.logger.error?.('[CountryHubGap] Failed to learn country hub pattern:', error);
    }
  }

  /**
   * Check if all country hubs have been collected and emit milestone
   */
  checkCountryHubCompletion(jobId, domain) {
    const analysis = this.analyzeCountryHubGaps(jobId);

    if (analysis.isComplete && analysis.seeded >= 10) {
      // All country hubs collected!
      const message = `✓ All ${analysis.seeded} country hubs collected (100% coverage)`;

      // Emit MILESTONE event (will be formatted as green console output)
      this.telemetry?.milestone?.({
        kind: 'country-hubs-complete',
        scope: domain || 'unknown',
        message,
        details: {
          totalCountries: analysis.seeded,
          visited: analysis.visited,
          coveragePercent: 100,
          timestamp: new Date().toISOString()
        }
      });

      this.logger.log?.(`[CountryHubGap] ${message}`);

      return true;
    }

    return false;
  }

  /**
   * Generate prioritized action plan for missing country hubs
   */
  generateActionPlan(analysis, maxActions = 10) {
    if (analysis.missing === 0) {
      return [];
    }

    const actions = [];
    
    for (const country of analysis.missingCountries.slice(0, maxActions)) {
      actions.push({
        action: 'fetch-country-hub',
        url: country.url,
        country: country.name,
        priority: 'high',
        reasoning: `Fill gap: ${country.name} hub not yet visited (${analysis.missing} remaining)`,
        estimatedValue: 50, // Estimated articles per country hub
        estimatedCost: 1 // Single HTTP request
      });
    }

    return actions;
  }

  /**
   * Get dense summary for console output (single line, green when complete)
   */
  getSummaryForConsole(analysis) {
    if (!analysis) {
      analysis = this.analyzeCountryHubGaps();
    }

    if (analysis.isComplete && analysis.seeded >= 10) {
      // Complete - format for green output
      return {
        complete: true,
        message: `Country hubs: ${analysis.seeded}/${analysis.seeded} collected (100%)`,
        color: 'green'
      };
    }

    // In progress - show gap
    const missing = analysis.missing;
    const missingNames = analysis.missingCountries
      .slice(0, 5)
      .map(c => c.name)
      .join(', ');
    const moreSuffix = analysis.missingCountries.length > 5 
      ? `, +${analysis.missingCountries.length - 5} more` 
      : '';

    return {
      complete: false,
      message: `Country hubs: ${analysis.visited}/${analysis.seeded} collected (${analysis.coveragePercent}%), ${missing} missing [${missingNames}${moreSuffix}]`,
      color: 'default'
    };
  }

  /**
   * Get all countries from gazetteer (delegates to analyzer)
   */
  getAllCountries() {
    return this.analyzer.getAllCountries();
  }

  /**
   * Get top N countries by importance (delegates to analyzer)
   */
  getTopCountries(limit = 50) {
    return this.analyzer.getTopCountries(limit);
  }

  /**
   * Predict country hub URLs for a domain (delegates to analyzer)
   */
  predictCountryHubUrls(domain, countryName, countryCode) {
    return this.analyzer.predictCountryHubUrls(domain, countryName, countryCode);
  }

  /**
   * Extract domain from URL
   * @private
   */
  _extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      return null;
    }
  }
}

module.exports = { CountryHubGapService };
