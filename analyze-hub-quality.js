#!/usr/bin/env node

/**
 * Hub Discovery Quality Analyzer
 *
 * Analyzes the quality and effectiveness of the current place hub discovery system.
 * Provides insights into false positives, coverage gaps, and optimization opportunities.
 */

const { ensureDatabase } = require('./src/db/sqlite');
const HubValidator = require('./src/hub-validation/HubValidator');

class HubQualityAnalyzer {
  constructor(db) {
    this.db = db;
    this.validator = new HubValidator(db);
  }

  /**
   * Analyze overall hub discovery quality
   */
  async analyzeQuality() {
    console.log('🔍 Analyzing Place Hub Discovery Quality\n');

    const stats = {
      totalHubs: 0,
      validHubs: 0,
      invalidHubs: 0,
      unvalidated: 0,
      coverage: {},
      quality: {},
      patterns: {}
    };

    // Get all place hubs
    const hubs = this.db.prepare(`
      SELECT id, url, place_slug, place_kind, title, evidence
      FROM place_hubs
      ORDER BY place_kind, place_slug
    `).all();

    stats.totalHubs = hubs.length;
    console.log(`📊 Total Place Hubs: ${stats.totalHubs}`);

    // Analyze by kind
    const byKind = {};
    for (const hub of hubs) {
      const kind = hub.place_kind || 'unknown';
      if (!byKind[kind]) byKind[kind] = [];
      byKind[kind].push(hub);
    }

    console.log('\n📈 Hubs by Kind:');
    Object.entries(byKind).forEach(([kind, hubs]) => {
      console.log(`  ${kind}: ${hubs.length}`);
    });

    // Sample validation of recent hubs
    console.log('\n🔬 Validating Recent Hubs (Sample):');
    const recentHubs = hubs.slice(-10); // Last 10 hubs

    for (const hub of recentHubs) {
      const validation = await this.validateHub(hub);
      console.log(`  ${validation.isValid ? '✅' : '❌'} ${hub.place_slug} (${hub.place_kind}): ${validation.reason}`);
    }

    // Analyze coverage gaps
    console.log('\n🗺️ Coverage Analysis:');
    const coverage = this.analyzeCoverage();
    console.log(`  Countries with hubs: ${coverage.countriesWithHubs}/${coverage.totalCountries}`);
    console.log(`  Coverage percentage: ${(coverage.coveragePercent * 100).toFixed(1)}%`);

    // Identify problematic patterns
    console.log('\n🚨 Potential Issues:');
    const issues = this.identifyIssues(hubs);
    issues.forEach(issue => console.log(`  • ${issue}`));

    // Recommendations
    console.log('\n💡 Recommendations:');
    const recommendations = this.generateRecommendations(stats, issues);
    recommendations.forEach(rec => console.log(`  • ${rec}`));

    return stats;
  }

  /**
   * Validate a single hub
   */
  async validateHub(hub) {
    try {
      // Extract place name from slug
      const placeName = hub.place_slug.split('-').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');

      return await this.validator.validateHubContent(hub.url, placeName);
    } catch (error) {
      return {
        isValid: false,
        reason: `Validation error: ${error.message}`
      };
    }
  }

  /**
   * Analyze coverage across different place kinds
   */
  analyzeCoverage() {
    // Get total countries from gazetteer
    const totalCountries = this.db.prepare('SELECT COUNT(*) as count FROM places WHERE kind = \'country\'').get().count;

    // Get countries with hubs
    const countriesWithHubs = this.db.prepare(`
      SELECT COUNT(DISTINCT place_slug) as count
      FROM place_hubs
      WHERE place_kind = 'country'
    `).get().count;

    return {
      totalCountries,
      countriesWithHubs,
      coveragePercent: countriesWithHubs / totalCountries
    };
  }

  /**
   * Identify potential issues in the hub data
   */
  identifyIssues(hubs) {
    const issues = [];

    // Check for hubs without titles
    const noTitleCount = hubs.filter(h => !h.title).length;
    if (noTitleCount > 0) {
      issues.push(`${noTitleCount} hubs have no title (never fetched content)`);
    }

    // Check for suspicious URLs
    const suspiciousUrls = hubs.filter(h =>
      h.url.includes('/live/') ||
      h.url.includes('/interactive/') ||
      /\d{4}\/\d{2}\/\d{2}/.test(h.url)
    ).length;
    if (suspiciousUrls > 0) {
      issues.push(`${suspiciousUrls} hubs have suspicious URLs (may be articles, not hubs)`);
    }

    // Check for duplicate slugs
    const slugCounts = {};
    hubs.forEach(h => {
      slugCounts[h.place_slug] = (slugCounts[h.place_slug] || 0) + 1;
    });
    const duplicates = Object.values(slugCounts).filter(count => count > 1).length;
    if (duplicates > 0) {
      issues.push(`${duplicates} place slugs have multiple hub entries`);
    }

    // Check for single-domain focus
    const domains = [...new Set(hubs.map(h => new URL(h.url).hostname))];
    if (domains.length === 1) {
      issues.push(`All hubs from single domain: ${domains[0]} (limited validation)`);
    }

    return issues;
  }

  /**
   * Generate improvement recommendations
   */
  generateRecommendations(stats, issues) {
    const recommendations = [];

    if (issues.some(i => i.includes('no title'))) {
      recommendations.push('Implement content fetching for all hubs to enable proper validation');
    }

    if (issues.some(i => i.includes('suspicious URLs'))) {
      recommendations.push('Enhance URL pattern validation to filter out article-like URLs');
    }

    if (issues.some(i => i.includes('single domain'))) {
      recommendations.push('Expand discovery to multiple domains for better pattern learning');
    }

    if (stats.totalHubs < 100) {
      recommendations.push('Increase hub discovery coverage - currently very limited');
    }

    recommendations.push('Implement confidence scoring for hub validation');
    recommendations.push('Add ML-based content analysis beyond simple link counting');
    recommendations.push('Create automated pattern learning from successful discoveries');

    return recommendations;
  }
}

// CLI interface
async function main() {
  const db = ensureDatabase('./data/news.db');
  const analyzer = new HubQualityAnalyzer(db);

  try {
    await analyzer.analyzeQuality();
  } catch (error) {
    console.error('Analysis failed:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { HubQualityAnalyzer };