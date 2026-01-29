'use strict';

/**
 * GazetteerReasonerPlugin: Reasons about geographic data priorities for PlannerHost.
 * 
 * Purpose:
 * - Prioritize country hubs over regional hubs (breadth-first coverage)
 * - Identify missing country data that should be fetched first
 * - Calculate priority scores based on crawl depth and coverage gaps
 * - Propose optimal stage ordering (countries → adm1 → adm2 → cities)
 * 
 * Integration with PlannerHost:
 * - init(): Query database for current gazetteer state (countries cached, missing, etc.)
 * - tick(): Propose place hubs to fetch based on priority rules
 * - teardown(): Finalize recommendations
 * 
 * Blackboard outputs:
 * - ctx.bb.proposedHubs: Array of place hubs to fetch (with priority scores)
 * - ctx.bb.gapAnalysis: Missing countries/regions that need prioritization
 * - ctx.bb.stageOrdering: Recommended stage execution order
 * - ctx.bb.rationale: Explanations for prioritization decisions
 */
class GazetteerReasonerPlugin {
  constructor({ priority = 85 } = {}) {
    this.pluginId = 'GazetteerReasonerPlugin';
    this.priority = priority; // Higher than GraphReasonerPlugin (80) for gazetteer-specific logic
    this._initialized = false;
    this._done = false;
  }

  async init(ctx) {
    this._initialized = true;
    this._done = false;

    // Initialize blackboard structures
    if (!ctx.bb.proposedHubs) {
      ctx.bb.proposedHubs = [];
    }
    if (!ctx.bb.gapAnalysis) {
      ctx.bb.gapAnalysis = {
        missingCountries: [],
        missingRegions: [],
        lowCoverageCountries: []
      };
    }
    if (!ctx.bb.stageOrdering) {
      ctx.bb.stageOrdering = [];
    }
    if (!ctx.bb.rationale) {
      ctx.bb.rationale = [];
    }

    ctx.logger.info('[GazetteerReasonerPlugin] Initialized');
  }

  async tick(ctx) {
    if (this._done) {
      return true;
    }

    try {
      // Phase 1: Analyze current gazetteer state
      await this._analyzeGazetteerState(ctx);

      // Phase 2: Identify priority gaps
      await this._identifyPriorityGaps(ctx);

      // Phase 3: Propose place hubs to fetch
      await this._proposeHubs(ctx);

      // Phase 4: Determine optimal stage ordering
      await this._determineStageOrdering(ctx);

      this._done = true;
      return true; // Signal completion
    } catch (err) {
      ctx.logger.error('[GazetteerReasonerPlugin] Error during tick:', err.message);
      ctx.bb.rationale.push(`GazetteerReasonerPlugin failed: ${err.message}`);
      this._done = true;
      return true; // Mark done even on error
    }
  }

  async teardown(ctx) {
    ctx.logger.info('[GazetteerReasonerPlugin] Teardown complete');
  }

  // Private methods

  async _analyzeGazetteerState(ctx) {
    const { dbAdapter } = ctx;
    if (!dbAdapter || typeof dbAdapter.db !== 'object') {
      ctx.logger.warn('[GazetteerReasonerPlugin] No database adapter available, skipping state analysis');
      return;
    }

    try {
      // Query current countries in database
      const countries = dbAdapter.db.prepare(`
        SELECT COUNT(*) as count FROM places WHERE kind = 'country'
      `).get();

      const countriesCount = countries?.count || 0;

      // Query regions (adm1, adm2)
      const regions = dbAdapter.db.prepare(`
        SELECT COUNT(*) as count FROM places WHERE kind IN ('region', 'adm1', 'adm2')
      `).get();

      const regionsCount = regions?.count || 0;

      // Query cities
      const cities = dbAdapter.db.prepare(`
        SELECT COUNT(*) as count FROM places WHERE kind = 'city'
      `).get();

      const citiesCount = cities?.count || 0;

      ctx.bb.gazetteerState = {
        countriesCount,
        regionsCount,
        citiesCount,
        totalPlaces: countriesCount + regionsCount + citiesCount
      };

      ctx.logger.info('[GazetteerReasonerPlugin] Current state:', ctx.bb.gazetteerState);
    } catch (err) {
      ctx.logger.error('[GazetteerReasonerPlugin] Error analyzing gazetteer state:', err.message);
    }
  }

  async _identifyPriorityGaps(ctx) {
    const state = ctx.bb.gazetteerState || {};
    const gaps = ctx.bb.gapAnalysis;

    // Gap rule 1: If we have very few countries, prioritize country fetching
    if (state.countriesCount < 50) {
      gaps.missingCountries.push({
        reason: 'Low country coverage',
        currentCount: state.countriesCount,
        targetCount: 250,
        priority: 1000
      });
      ctx.bb.rationale.push(`Country coverage at ${state.countriesCount} (target: 250) - HIGH PRIORITY`);
    }

    // Gap rule 2: If we have countries but <100 regions, prioritize adm1
    if (state.countriesCount >= 50 && state.regionsCount < 100) {
      gaps.missingRegions.push({
        reason: 'Low regional coverage',
        currentCount: state.regionsCount,
        targetCount: 1000,
        priority: 100
      });
      ctx.bb.rationale.push(`Regional coverage at ${state.regionsCount} (target: 1000) - MEDIUM PRIORITY`);
    }

    // Gap rule 3: Balanced growth - ensure countries are covered before deep regional crawl
    const countryRegionRatio = state.countriesCount > 0 ? state.regionsCount / state.countriesCount : 0;
    if (countryRegionRatio > 10) {
      gaps.lowCoverageCountries.push({
        reason: 'Imbalanced growth - too many regions per country',
        ratio: countryRegionRatio,
        recommendation: 'Fetch more countries before continuing regional expansion',
        priority: 500
      });
      ctx.bb.rationale.push(`Country/region ratio ${countryRegionRatio.toFixed(1)} suggests more country diversity needed`);
    }

    ctx.logger.info('[GazetteerReasonerPlugin] Gap analysis:', gaps);
  }

  async _proposeHubs(ctx) {
    const gaps = ctx.bb.gapAnalysis;
    const proposedHubs = ctx.bb.proposedHubs;

    // Propose hubs based on identified gaps
    if (gaps.missingCountries.length > 0) {
      const countryGap = gaps.missingCountries[0];
      proposedHubs.push({
        type: 'wikidata-countries',
        kind: 'country',
        priority: countryGap.priority,
        estimatedRecords: 250,
        crawlDepth: 0,
        rationale: countryGap.reason
      });
      ctx.logger.info('[GazetteerReasonerPlugin] Proposed country hub fetch (priority: 1000)');
    }

    if (gaps.missingRegions.length > 0) {
      const regionGap = gaps.missingRegions[0];
      proposedHubs.push({
        type: 'wikidata-adm1',
        kind: 'region',
        priority: regionGap.priority,
        estimatedRecords: 3000,
        crawlDepth: 1,
        rationale: regionGap.reason
      });
      ctx.logger.info('[GazetteerReasonerPlugin] Proposed adm1 hub fetch (priority: 100)');
    }

    // Always ensure country stage comes first
    proposedHubs.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  async _determineStageOrdering(ctx) {
    const state = ctx.bb.gazetteerState || {};
    const ordering = ctx.bb.stageOrdering;

    // Stage ordering logic based on breadth-first principle
    const stages = [
      { name: 'countries', priority: 1000, enabled: state.countriesCount < 200 },
      { name: 'adm1', priority: 100, enabled: state.countriesCount >= 50 && state.regionsCount < 1000 },
      { name: 'adm2', priority: 10, enabled: state.regionsCount >= 500 },
      { name: 'cities', priority: 1, enabled: state.regionsCount >= 1000 }
    ];

    // Filter to enabled stages only
    const enabledStages = stages.filter(s => s.enabled);

    // Sort by priority (descending)
    enabledStages.sort((a, b) => b.priority - a.priority);

    ordering.push(...enabledStages.map(s => ({ name: s.name, priority: s.priority })));

    ctx.bb.rationale.push(`Recommended stage order: ${enabledStages.map(s => s.name).join(' → ')}`);
    ctx.logger.info('[GazetteerReasonerPlugin] Stage ordering determined:', ordering);
  }
}

module.exports = { GazetteerReasonerPlugin };
