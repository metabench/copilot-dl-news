const { CrawlStrategyTemplates } = require('../../../core/crawler/CrawlStrategyTemplates');
const { TopicHubGapAnalyzer } = require('../../../services/TopicHubGapAnalyzer');
const { CityHubGapAnalyzer } = require('../../../services/CityHubGapAnalyzer');
const { RegionHubGapAnalyzer } = require('../../../services/RegionHubGapAnalyzer');
const { checkEnhancedDatabaseHealth } = require('news-crawler-db');

function assertHealthyDb(db, label) {
  if (!db) throw new Error(`${label} failed to resolve DB`);
  const health = checkEnhancedDatabaseHealth(db);
  if (!health.ok) throw new Error(`${label} DB health check failed: ${health.error}`);
  console.log(`[Check] ${label} DB health: ${JSON.stringify(health)}`);
}

async function check() {
  console.log('[Check] Verifying DB injection for Batch 4 components...');

  try {
    // 1. CrawlStrategyTemplates
    const templates = new CrawlStrategyTemplates();
    assertHealthyDb(templates.db, 'CrawlStrategyTemplates');

    // 2. TopicHubGapAnalyzer
    const topicAnalyzer = new TopicHubGapAnalyzer();
    assertHealthyDb(topicAnalyzer.db, 'TopicHubGapAnalyzer');

    // 3. CityHubGapAnalyzer
    const cityAnalyzer = new CityHubGapAnalyzer();
    assertHealthyDb(cityAnalyzer.db, 'CityHubGapAnalyzer');

    // 4. RegionHubGapAnalyzer
    const regionAnalyzer = new RegionHubGapAnalyzer();
    assertHealthyDb(regionAnalyzer.db, 'RegionHubGapAnalyzer');

    console.log('[Check] All Batch 4 components verified successfully.');
  } catch (err) {
    console.error('[Check] Verification failed:', err);
    process.exit(1);
  }
}

check();
