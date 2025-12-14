const { TopicHubGapAnalyzer } = require('../../services/TopicHubGapAnalyzer');
const { CrawlStrategyTemplates } = require('../../crawler/CrawlStrategyTemplates');

async function check() {
  console.log('[Check] Verifying Batch 8 components...');

  try {
    // 1. TopicHubGapAnalyzer
    const analyzer = new TopicHubGapAnalyzer();
    if (analyzer.db && analyzer.db.prepare('SELECT 1').get()) {
      console.log('[Check] TopicHubGapAnalyzer initialized: true');
    } else {
      console.error('[Check] TopicHubGapAnalyzer initialized: false');
      process.exit(1);
    }

    // 2. CrawlStrategyTemplates
    const templates = new CrawlStrategyTemplates();
    if (templates.db && templates.db.prepare('SELECT 1').get()) {
      console.log('[Check] CrawlStrategyTemplates initialized: true');
    } else {
      console.error('[Check] CrawlStrategyTemplates initialized: false');
      process.exit(1);
    }

    console.log('[Check] All Batch 8 components verified successfully.');

  } catch (err) {
    console.error('[Check] Verification failed:', err);
    process.exit(1);
  }
}

check();
