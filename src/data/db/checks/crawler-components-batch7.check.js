const { GazetteerPriorityScheduler } = require('../../../core/crawler/gazetteer/GazetteerPriorityScheduler');
const { MultiGoalOptimizer } = require('../../../core/crawler/MultiGoalOptimizer');
const { PredictiveHubDiscovery } = require('../../../core/crawler/PredictiveHubDiscovery');
const { HierarchicalPlanner } = require('../../../core/crawler/HierarchicalPlanner');
const { checkEnhancedDatabaseHealth } = require('news-crawler-db');

function hasHealthyDb(db) {
  return Boolean(db && checkEnhancedDatabaseHealth(db).ok);
}

async function check() {
  console.log('[Check] Verifying Batch 7 components...');

  try {
    // 1. GazetteerPriorityScheduler
    const scheduler = new GazetteerPriorityScheduler();
    if (hasHealthyDb(scheduler.db)) {
      console.log('[Check] GazetteerPriorityScheduler initialized: true');
    } else {
      console.error('[Check] GazetteerPriorityScheduler initialized: false');
      process.exit(1);
    }

    // 2. MultiGoalOptimizer
    const optimizer = new MultiGoalOptimizer();
    if (hasHealthyDb(optimizer.db)) {
      console.log('[Check] MultiGoalOptimizer initialized: true');
    } else {
      console.error('[Check] MultiGoalOptimizer initialized: false');
      process.exit(1);
    }

    // 3. PredictiveHubDiscovery
    const discovery = new PredictiveHubDiscovery();
    if (hasHealthyDb(discovery.db)) {
      console.log('[Check] PredictiveHubDiscovery initialized: true');
    } else {
      console.error('[Check] PredictiveHubDiscovery initialized: false');
      process.exit(1);
    }

    // 4. HierarchicalPlanner
    const planner = new HierarchicalPlanner();
    if (hasHealthyDb(planner.db)) {
      console.log('[Check] HierarchicalPlanner initialized: true');
    } else {
      console.error('[Check] HierarchicalPlanner initialized: false');
      process.exit(1);
    }

    console.log('[Check] All Batch 7 components verified successfully.');

  } catch (err) {
    console.error('[Check] Verification failed:', err);
    process.exit(1);
  }
}

check();
