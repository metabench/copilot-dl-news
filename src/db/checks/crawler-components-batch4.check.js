const { CrawlStrategyTemplates } = require('../../crawler/CrawlStrategyTemplates');
const { TopicHubGapAnalyzer } = require('../../services/TopicHubGapAnalyzer');
const { CityHubGapAnalyzer } = require('../../services/CityHubGapAnalyzer');
const { RegionHubGapAnalyzer } = require('../../services/RegionHubGapAnalyzer');

async function check() {
  console.log('[Check] Verifying DB injection for Batch 4 components...');

  try {
    // 1. CrawlStrategyTemplates
    const templates = new CrawlStrategyTemplates();
    if (!templates.db) throw new Error('CrawlStrategyTemplates failed to resolve DB');
    const res1 = templates.db.prepare('SELECT 1 as val').get();
    console.log(`[Check] CrawlStrategyTemplates DB Query result: ${JSON.stringify(res1)}`);

    // 2. TopicHubGapAnalyzer
    const topicAnalyzer = new TopicHubGapAnalyzer();
    if (!topicAnalyzer.db) throw new Error('TopicHubGapAnalyzer failed to resolve DB');
    const res2 = topicAnalyzer.db.prepare('SELECT 1 as val').get();
    console.log(`[Check] TopicHubGapAnalyzer DB Query result: ${JSON.stringify(res2)}`);

    // 3. CityHubGapAnalyzer
    const cityAnalyzer = new CityHubGapAnalyzer();
    if (!cityAnalyzer.db) throw new Error('CityHubGapAnalyzer failed to resolve DB');
    const res3 = cityAnalyzer.db.prepare('SELECT 1 as val').get();
    console.log(`[Check] CityHubGapAnalyzer DB Query result: ${JSON.stringify(res3)}`);

    // 4. RegionHubGapAnalyzer
    const regionAnalyzer = new RegionHubGapAnalyzer();
    if (!regionAnalyzer.db) throw new Error('RegionHubGapAnalyzer failed to resolve DB');
    const res4 = regionAnalyzer.db.prepare('SELECT 1 as val').get();
    console.log(`[Check] RegionHubGapAnalyzer DB Query result: ${JSON.stringify(res4)}`);

    console.log('[Check] All Batch 4 components verified successfully.');
  } catch (err) {
    console.error('[Check] Verification failed:', err);
    process.exit(1);
  }
}

check();
