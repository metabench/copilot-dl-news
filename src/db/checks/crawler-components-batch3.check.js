const { TemporalPatternLearner } = require('../../crawler/TemporalPatternLearner');
const { AdaptiveExplorer } = require('../../crawler/AdaptiveExplorer');
const { BudgetAllocator } = require('../../crawler/BudgetAllocator');

async function check() {
  console.log('[Check] Verifying DB injection for Batch 3 components...');

  try {
    // 1. TemporalPatternLearner
    const learner = new TemporalPatternLearner();
    if (!learner.db) throw new Error('TemporalPatternLearner failed to resolve DB');
    const res1 = learner.db.prepare('SELECT 1 as val').get();
    console.log(`[Check] TemporalPatternLearner DB Query result: ${JSON.stringify(res1)}`);

    // 2. AdaptiveExplorer
    const explorer = new AdaptiveExplorer();
    if (!explorer.db) throw new Error('AdaptiveExplorer failed to resolve DB');
    const res2 = explorer.db.prepare('SELECT 1 as val').get();
    console.log(`[Check] AdaptiveExplorer DB Query result: ${JSON.stringify(res2)}`);

    // 3. BudgetAllocator
    const allocator = new BudgetAllocator();
    if (!allocator.db) throw new Error('BudgetAllocator failed to resolve DB');
    const res3 = allocator.db.prepare('SELECT 1 as val').get();
    console.log(`[Check] BudgetAllocator DB Query result: ${JSON.stringify(res3)}`);

    console.log('[Check] All Batch 3 components verified successfully.');
  } catch (err) {
    console.error('[Check] Verification failed:', err);
    process.exit(1);
  }
}

check();
