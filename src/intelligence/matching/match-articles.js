#!/usr/bin/env node

/**
 * Article-Place Matching Tool
 *
 * Run place matching on articles with configurable rule levels.
 * Supports batch processing and performance monitoring.
 */

const { ensureDatabase } = require('../../data/db/sqlite');
const ArticlePlaceMatcher = require('./ArticlePlaceMatcher');

class ArticlePlaceMatchingTool {
  constructor(dbPath) {
    this.db = ensureDatabase(dbPath);
    this.matcher = new ArticlePlaceMatcher(this.db);
  }

  /**
   * Match places for a specific article by content ID
   */
  async matchArticle(contentId, ruleLevel = 1) {
    console.log(`Matching places for content ID ${contentId} (rule level ${ruleLevel})...`);

    const matches = await this.matcher.matchArticlePlaces(contentId, ruleLevel);

    console.log(`Found ${matches.length} matches:`);
    for (const match of matches) {
      console.log(`  ${match.placeId}: ${match.confidence.toFixed(3)} (${match.method}) - ${match.evidence}`);
    }

    return matches;
  }

  /**
   * Match places for multiple articles
   */
  async matchBatch(contentIds, ruleLevel = 1, batchSize = 10) {
    console.log(`Processing ${contentIds.length} articles in batches of ${batchSize}...`);

    const results = [];
    let processed = 0;

    for (let i = 0; i < contentIds.length; i += batchSize) {
      const batch = contentIds.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(contentIds.length / batchSize)}...`);

      for (const contentId of batch) {
        try {
          const matches = await this.matchArticle(contentId, ruleLevel);
          results.push({ contentId, matches, success: true });
        } catch (error) {
          console.error(`Failed to match content ${contentId}:`, error.message);
          results.push({ contentId, matches: [], success: false, error: error.message });
        }
      }

      processed += batch.length;
      console.log(`Processed ${processed}/${contentIds.length} articles`);
    }

    return results;
  }

  /**
   * Match places for articles that haven't been processed yet
   */
  async matchUnprocessed(ruleLevel = 1, limit = 100) {
    console.log(`Finding unprocessed articles (limit: ${limit})...`);

    const unprocessedContentIds = this.db.prepare(`
      SELECT cs.id
      FROM content_storage cs
      LEFT JOIN article_matching_runs amr ON cs.id = amr.content_id AND amr.rule_level = ?
      WHERE amr.id IS NULL
      LIMIT ?
    `).all(ruleLevel, limit).map(row => row.id);

    console.log(`Found ${unprocessedContentIds.length} unprocessed articles`);

    if (unprocessedContentIds.length === 0) {
      return [];
    }

    return this.matchBatch(unprocessedContentIds, ruleLevel);
  }

  /**
   * Upgrade existing matches to a higher rule level
   */
  async upgradeMatches(ruleLevel, limit = 50) {
    console.log(`Finding articles to upgrade to rule level ${ruleLevel}...`);

    const toUpgrade = this.db.prepare(`
      SELECT DISTINCT content_id
      FROM article_place_matches
      WHERE matching_rule_level < ?
      LIMIT ?
    `).all(ruleLevel, limit).map(row => row.content_id);

    console.log(`Found ${toUpgrade.length} articles to upgrade`);

    for (const contentId of toUpgrade) {
      console.log(`Upgrading content ${contentId} to rule level ${ruleLevel}...`);
      await this.matcher.upgradeMatches(contentId, ruleLevel);
    }

    return toUpgrade.length;
  }

  /**
   * Get matching statistics
   */
  getStats() {
    const stats = {
      totalArticles: 0,
      matchedArticles: 0,
      totalMatches: 0,
      matchesByRuleLevel: {},
      matchesByMethod: {},
      averageConfidence: 0,
      topPlaces: []
    };

    // Basic counts
    const basicStats = this.db.prepare(`
      SELECT
        COUNT(DISTINCT content_id) as total_articles,
        COUNT(DISTINCT CASE WHEN apm.id IS NOT NULL THEN content_id END) as matched_articles,
        COUNT(apm.id) as total_matches,
        AVG(apm.confidence_score) as avg_confidence
      FROM content_storage cs
      LEFT JOIN article_place_matches apm ON cs.id = apm.content_id
    `).get();

    stats.totalArticles = basicStats.total_articles;
    stats.matchedArticles = basicStats.matched_articles;
    stats.totalMatches = basicStats.total_matches;
    stats.averageConfidence = basicStats.avg_confidence || 0;

    // Matches by rule level
    const ruleLevelStats = this.db.prepare(`
      SELECT matching_rule_level, COUNT(*) as count
      FROM article_place_matches
      GROUP BY matching_rule_level
      ORDER BY matching_rule_level
    `).all();

    for (const stat of ruleLevelStats) {
      stats.matchesByRuleLevel[stat.matching_rule_level] = stat.count;
    }

    // Matches by method
    const methodStats = this.db.prepare(`
      SELECT match_method, COUNT(*) as count
      FROM article_place_matches
      GROUP BY match_method
      ORDER BY count DESC
    `).all();

    for (const stat of methodStats) {
      stats.matchesByMethod[stat.match_method] = stat.count;
    }

    // Top matched places
    stats.topPlaces = this.db.prepare(`
      SELECT
        p.id,
        COALESCE(pn.name, 'Unknown') as name,
        p.kind,
        COUNT(apm.id) as match_count,
        AVG(apm.confidence_score) as avg_confidence
      FROM article_place_matches apm
      JOIN places p ON apm.place_id = p.id
      LEFT JOIN place_names pn ON p.canonical_name_id = pn.id
      GROUP BY p.id, pn.name, p.kind
      ORDER BY match_count DESC
      LIMIT 10
    `).all();

    return stats;
  }

  close() {
    this.db.close();
  }
}

// CLI interface
async function main() {
  const command = process.argv[2];
  const dbPath = process.argv[3] || './data/database.db';

  const tool = new ArticlePlaceMatchingTool(dbPath);

  try {
    switch (command) {
      case 'match':
        const contentId = parseInt(process.argv[4]);
        const ruleLevel = parseInt(process.argv[5] || '1');
        await tool.matchArticle(contentId, ruleLevel);
        break;

      case 'batch':
        const ids = process.argv.slice(4).map(id => parseInt(id));
        const batchRuleLevel = parseInt(process.argv[process.argv.length - 1] || '1');
        await tool.matchBatch(ids, batchRuleLevel);
        break;

      case 'unprocessed':
        const limit = parseInt(process.argv[4] || '100');
        const unprocessedRuleLevel = parseInt(process.argv[5] || '1');
        await tool.matchUnprocessed(unprocessedRuleLevel, limit);
        break;

      case 'upgrade':
        const upgradeRuleLevel = parseInt(process.argv[4] || '2');
        const upgradeLimit = parseInt(process.argv[5] || '50');
        const upgraded = await tool.upgradeMatches(upgradeRuleLevel, upgradeLimit);
        console.log(`Upgraded ${upgraded} articles`);
        break;

      case 'stats':
        const stats = tool.getStats();
        console.log('Article-Place Matching Statistics:');
        console.log(`  Total articles: ${stats.totalArticles}`);
        console.log(`  Matched articles: ${stats.matchedArticles} (${((stats.matchedArticles / stats.totalArticles) * 100).toFixed(1)}%)`);
        console.log(`  Total matches: ${stats.totalMatches}`);
        console.log(`  Average confidence: ${(stats.averageConfidence * 100).toFixed(1)}%`);

        console.log('\nMatches by rule level:');
        for (const [level, count] of Object.entries(stats.matchesByRuleLevel)) {
          console.log(`  Level ${level}: ${count}`);
        }

        console.log('\nMatches by method:');
        for (const [method, count] of Object.entries(stats.matchesByMethod)) {
          console.log(`  ${method}: ${count}`);
        }

        console.log('\nTop matched places:');
        for (const place of stats.topPlaces) {
          console.log(`  ${place.name} (${place.kind}): ${place.match_count} matches, ${(place.avg_confidence * 100).toFixed(1)}% avg confidence`);
        }
        break;

      default:
        console.log('Usage:');
        console.log('  node match-articles.js match <contentId> [ruleLevel]');
        console.log('  node match-articles.js batch <contentId1> <contentId2> ... [ruleLevel]');
        console.log('  node match-articles.js unprocessed [limit] [ruleLevel]');
        console.log('  node match-articles.js upgrade <ruleLevel> [limit]');
        console.log('  node match-articles.js stats');
        break;
    }
  } finally {
    tool.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ArticlePlaceMatchingTool;