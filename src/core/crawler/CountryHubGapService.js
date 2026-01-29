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

const { CountryHubGapAnalyzer } = require('../../services/CountryHubGapAnalyzer');
const { formatMissingCountries } = require('../../services/CountryHubGapReporter');
const { CountryHubMatcher } = require('../../services/CountryHubMatcher');

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

    this.matcher = new CountryHubMatcher({
      db,
      logger
    });
    
    // Track countries we've attempted
    this.attemptedCountries = new Set();
    
    // Cached analysis
    this.lastAnalysis = null;
    this.lastAnalysisTime = 0;
    this.analysisCacheMs = 5000; // Cache for 5 seconds

    // Match attempts (avoid re-running too often)
    this.lastMatchAttempt = {
      domain: null,
      ts: 0,
      linked: 0
    };
    this.matchCooldownMs = 30_000; // 30 seconds between match attempts per domain
    this.lastMatchResult = null;
  }

  /**
   * Analyze country hub coverage and return gap summary
   * 
   * This is a facade method that integrates the standalone analyzer with
   * crawler state management.
   */
  analyzeCountryHubGaps(jobId = null) {
    const hubStats = this.state?.getHubVisitStats?.() || {};
    const domain = this.state?.getDomain?.() || '';

    let analysis = this.analyzer.analyzeGaps(domain, hubStats);
    let matchResult = null;

    if (domain && analysis.missing > 0 && this.matcher) {
      const now = Date.now();
      const shouldAttempt = (
        this.lastMatchAttempt.domain !== analysis.domain ||
        (now - this.lastMatchAttempt.ts) > this.matchCooldownMs
      );

      if (shouldAttempt) {
        try {
          matchResult = this.matcher.matchDomain(domain, {
            dryRun: false,
            hubStats
          });

          this.lastMatchAttempt = {
            domain: analysis.domain,
            ts: now,
            linked: matchResult.linkedCount
          };

          if (matchResult.linkedCount > 0) {
            analysis = matchResult.analysisAfter;
          }

          this.lastMatchResult = matchResult;
        } catch (error) {
          this.logger.error?.('[CountryHubGap] Failed to auto-match existing hubs:', error);
        }
      }
    }

    const missingUrlSet = new Set();
    const missingCountries = Array.isArray(analysis.missingCountries)
      ? analysis.missingCountries.map((country) => {
          if (country?.url) missingUrlSet.add(country.url);
          return { ...country };
        })
      : [];

    if (this.state?.getSeededHubSet && typeof this.state.getSeededHubSet === 'function') {
      const seededSet = Array.from(this.state.getSeededHubSet());

      for (const url of seededSet) {
        const meta = this.state.getSeededHubMeta?.(url) || {};

        if (meta.kind !== 'country') continue;

        const isVisited = this.state.hasVisitedHub?.(url);
        if (isVisited) continue;

        missingUrlSet.add(url);

        const countryName = meta.name || this.analyzer.extractCountryNameFromUrl(url);
        const countryCode = meta.code || meta.countryCode || null;
        const placeId = meta.placeId || null;

        const existing = missingCountries.find((entry) => {
          if (placeId && entry.placeId && entry.placeId === placeId) return true;
          if (countryCode && entry.code && entry.code === countryCode) return true;
          if (countryName && entry.name && entry.name.toLowerCase() === countryName.toLowerCase()) return true;
          return false;
        });

        if (existing) {
          existing.url = existing.url || url;
          existing.status = existing.status || 'pending';
          existing.meta = existing.meta || meta;
        } else {
          missingCountries.push({
            placeId: placeId ?? null,
            name: countryName ?? null,
            code: countryCode ?? null,
            url,
            status: 'pending',
            meta
          });
        }
      }
    }

    const missingUrls = Array.from(missingUrlSet);

    const result = {
      ...analysis,
      missingUrls,
      missingCountries
    };

    if (matchResult) {
      result.matchResult = {
        linkedCount: matchResult.linkedCount,
        candidateCount: matchResult.candidateCount,
        skipped: matchResult.skipped?.length || 0,
        lastRunAt: this.lastMatchAttempt.ts
      };
    }

    return result;
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
    const formatted = formatMissingCountries(analysis.missingCountries, {
      previewLimit: 5,
      includeStatus: false
    });
    const missingNames = formatted.previewNames.join(', ');
    const moreSuffix = formatted.moreAfterPreview > 0
      ? `, +${formatted.moreAfterPreview} more`
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
   * Get top N countries (delegates to analyzer)
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
