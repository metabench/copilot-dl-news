#!/usr/bin/env node

/**
 * Unified Country Hub Discovery and Analysis Tool
 *
 * Combines the best features of:
 * - enhanced-hub-discovery.js (ML-based validation)
 * - intelligent-crawl.js (gap analysis and prioritization)
 *
 * Provides comprehensive country hub discovery with:
 * - Multi-strategy URL prediction
 * - ML-based content validation
 * - Gap analysis and prioritization
 * - Batch processing with progress tracking
 * - DSPL pattern learning and updates
 */

const { Command } = require('commander');
const { ensureDatabase } = require('../src/data/db/sqlite');
const { CountryHubGapAnalyzer } = require('../src/services/CountryHubGapAnalyzer');
const { HubValidator } = require('../src/core/crawler/hub-discovery/HubValidator');
const { getAllCountries } = require('../src/data/db/sqlite/v1/queries/gazetteer.places');
const { getCountryHubCoverage } = require('../src/data/db/sqlite/v1/queries/placePageMappings');
const { discoverPatternsFromMappings, updateDsplWithPatterns } = require('../src/services/shared/dspl');
const path = require('path');

class UnifiedHubTool {
  constructor() {
    this.db = null;
    this.analyzer = null;
    this.validator = null;
    this.logger = console;
  }

  async initialize() {
    this.db = ensureDatabase();
    this.analyzer = new CountryHubGapAnalyzer({ db: this.db, logger: this.logger });
    this.validator = new HubValidator({ logger: this.logger });
  }

  /**
   * Discover and validate country hubs for a domain
   */
  async discoverHubs(domain, options = {}) {
    const {
      limit = 10,
      validate = true,
      learn = true,
      updateDspl = false
    } = options;

    this.logger.log(`🔍 Discovering country hubs for ${domain}...`);

    // Get gap analysis
    const gaps = this.analyzer.analyzeGaps(domain);
    this.logger.log(`📊 Found ${gaps.missing} missing countries out of ${gaps.totalCountries}`);

    if (gaps.missing === 0) {
      this.logger.log('✅ All countries already covered!');
      return { discovered: [], validated: [] };
    }

    // Get missing countries (limit if specified)
    const missingCountries = limit 
      ? gaps.missingCountries.slice(0, limit)
      : gaps.missingCountries;

    const discovered = [];
    const validated = [];

    for (const country of missingCountries) {
      this.logger.log(`🎯 Processing ${country.name} (${country.code})...`);

      // Predict URLs using enhanced analyzer
      const predictions = this.analyzer.predictCountryHubUrls(domain, country.name, country.code);

      for (const prediction of predictions) {
        discovered.push({
          country: country.name,
          code: country.code,
          url: prediction.url,
          confidence: prediction.confidence,
          strategy: prediction.strategy
        });

        // Validate if requested
        if (validate) {
          try {
            const validation = await this.validator.validateHubContent(prediction.url, {
              name: country.name,
              code: country.code
            });

            validated.push({
              ...prediction,
              validation
            });

            this.logger.log(`  ${validation.isValid ? '✅' : '❌'} ${prediction.url} (${(validation.confidence * 100).toFixed(1)}%)`);

          } catch (error) {
            this.logger.warn(`  ⚠️  Validation failed for ${prediction.url}: ${error.message}`);
          }
        }
      }
    }

    // Learn patterns if requested
    if (learn && validated.length > 0) {
      await this.learnPatterns(domain, validated);
    }

    // Update DSPL if requested and we have verified patterns
    if (updateDspl) {
      const verifiedPatterns = validated.filter(v => v.validation.isValid);
      if (verifiedPatterns.length > 0) {
        this.updateDspl(domain, verifiedPatterns);
      }
    }

    return { discovered, validated };
  }

  /**
   * Learn new patterns from validated results
   */
  async learnPatterns(domain, validated) {
    this.logger.log('🧠 Learning patterns from validated hubs...');

    try {
      // Discover patterns from existing mappings
      const discoveredPatterns = discoverPatternsFromMappings(this.db, domain, this.logger);

      if (discoveredPatterns.length > 0) {
        this.logger.log(`📚 Discovered ${discoveredPatterns.length} new patterns`);

        // Update DSPL with discovered patterns
        const dsplDir = path.join(__dirname, '..', 'data', 'dspls');
        updateDsplWithPatterns(dsplDir, domain, discoveredPatterns, this.logger);
      }

    } catch (error) {
      this.logger.warn(`Pattern learning failed: ${error.message}`);
    }
  }

  /**
   * Update DSPL with verified patterns
   */
  updateDspl(domain, verifiedPatterns) {
    this.logger.log('💾 Updating DSPL with verified patterns...');

    try {
      const dsplDir = path.join(__dirname, '..', 'data', 'dspls');
      const verifiedForDspl = verifiedPatterns.map(v => ({
        pattern: this.extractPatternFromUrl(v.url, domain),
        confidence: v.validation.confidence,
        examples: 1,
        verified: true
      })).filter(p => p.pattern);

      if (verifiedForDspl.length > 0) {
        updateDsplWithPatterns(dsplDir, domain, verifiedForDspl, this.logger);
      }

    } catch (error) {
      this.logger.warn(`DSPL update failed: ${error.message}`);
    }
  }

  /**
   * Extract pattern from verified URL
   */
  extractPatternFromUrl(url, domain) {
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname !== domain) return null;

      const path = urlObj.pathname;
      // Convert specific country identifiers to placeholders
      return path.replace(/\/[a-z-]+(?=\/|$)/, '/{slug}');
    } catch (error) {
      return null;
    }
  }

  /**
   * Analyze coverage gaps with detailed reporting
   */
  analyzeCoverage(domain) {
    const coverage = getCountryHubCoverage(this.db, domain);

    this.logger.log(`📈 Coverage Analysis for ${domain}:`);
    this.logger.log(`   Total countries: ${coverage.totalCountries}`);
    this.logger.log(`   Seeded: ${coverage.seeded}`);
    this.logger.log(`   Verified: ${coverage.visited}`);
    this.logger.log(`   Coverage: ${coverage.coveragePercent}%`);
    this.logger.log(`   Missing: ${coverage.missing}`);

    if (coverage.missingCountries.length > 0) {
      this.logger.log('\n🔍 Top missing countries:');
      coverage.missingCountries.slice(0, 10).forEach(country => {
        this.logger.log(`   ${country.name} (${country.code}) - Importance: ${country.importance}`);
      });
    }

    return coverage;
  }

  /**
   * Batch process multiple domains
   */
  async batchDiscover(domains, options = {}) {
    const results = {};

    for (const domain of domains) {
      this.logger.log(`\n🌐 Processing ${domain}...`);
      try {
        const result = await this.discoverHubs(domain, options);
        results[domain] = result;
      } catch (error) {
        this.logger.error(`Failed to process ${domain}: ${error.message}`);
        results[domain] = { error: error.message };
      }
    }

    return results;
  }
}

// CLI Interface
async function main() {
  const program = new Command();

  program
    .name('unified-hub-discovery')
    .description('Unified country hub discovery and analysis tool')
    .version('1.0.0');

  program
    .command('discover <domain>')
    .description('Discover country hubs for a domain')
    .option('-l, --limit <number>', 'Limit number of countries to process', parseInt, 10)
    .option('--no-validate', 'Skip content validation')
    .option('--no-learn', 'Skip pattern learning')
    .option('--update-dspl', 'Update DSPL with verified patterns')
    .action(async (domain, options) => {
      const tool = new UnifiedHubTool();
      await tool.initialize();

      const result = await tool.discoverHubs(domain, options);

      console.log('\n📋 Summary:');
      console.log(`Discovered: ${result.discovered.length} URLs`);
      console.log(`Validated: ${result.validated.length} URLs`);

      if (result.validated.length > 0) {
        const valid = result.validated.filter(v => v.validation.isValid);
        console.log(`Valid hubs: ${valid.length}/${result.validated.length}`);
      }
    });

  program
    .command('analyze <domain>')
    .description('Analyze coverage gaps for a domain')
    .action(async (domain) => {
      const tool = new UnifiedHubTool();
      await tool.initialize();
      tool.analyzeCoverage(domain);
    });

  program
    .command('batch <domains...>')
    .description('Batch process multiple domains')
    .option('-l, --limit <number>', 'Limit per domain', parseInt, 5)
    .option('--no-validate', 'Skip validation')
    .action(async (domains, options) => {
      const tool = new UnifiedHubTool();
      await tool.initialize();

      const results = await tool.batchDiscover(domains, options);

      console.log('\n📊 Batch Results:');
      for (const [domain, result] of Object.entries(results)) {
        if (result.error) {
          console.log(`❌ ${domain}: ${result.error}`);
        } else {
          const valid = result.validated?.filter(v => v.validation.isValid) || [];
          console.log(`✅ ${domain}: ${valid.length}/${result.validated?.length || 0} valid hubs`);
        }
      }
    });

  await program.parseAsync();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { UnifiedHubTool };