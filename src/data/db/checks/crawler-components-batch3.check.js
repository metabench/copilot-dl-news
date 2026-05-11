const { TemporalPatternLearner } = require('../../../core/crawler/TemporalPatternLearner');
const { AdaptiveExplorer } = require('../../../core/crawler/AdaptiveExplorer');
const { BudgetAllocator } = require('../../../core/crawler/BudgetAllocator');
const { checkEnhancedDatabaseHealth } = require('news-crawler-db');

function assertHealthyDb(db, label) {
  if (!db) throw new Error(`${label} failed to resolve DB`);
  const health = checkEnhancedDatabaseHealth(db);
  if (!health.ok) throw new Error(`${label} DB health check failed: ${health.error}`);
  console.log(`[Check] ${label} DB health: ${JSON.stringify(health)}`);
}

async function check() {
  console.log('[Check] Verifying DB injection for Batch 3 components...');

  try {
    // 1. TemporalPatternLearner
    const learner = new TemporalPatternLearner();
    assertHealthyDb(learner.db, 'TemporalPatternLearner');

    // 2. AdaptiveExplorer
    const explorer = new AdaptiveExplorer();
    assertHealthyDb(explorer.db, 'AdaptiveExplorer');

    // 3. BudgetAllocator
    const allocator = new BudgetAllocator();
    assertHealthyDb(allocator.db, 'BudgetAllocator');

    console.log('[Check] All Batch 3 components verified successfully.');
  } catch (err) {
    console.error('[Check] Verification failed:', err);
    process.exit(1);
  }
}

check();
