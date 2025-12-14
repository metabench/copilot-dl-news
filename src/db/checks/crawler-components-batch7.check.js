const { GazetteerPriorityScheduler } = require('../../crawler/gazetteer/GazetteerPriorityScheduler');
const { MultiGoalOptimizer } = require('../../crawler/MultiGoalOptimizer');
const { PredictiveHubDiscovery } = require('../../crawler/PredictiveHubDiscovery');
const { HierarchicalPlanner } = require('../../crawler/HierarchicalPlanner');

async function check() {
  console.log('[Check] Verifying Batch 7 components...');

  try {
    // 1. GazetteerPriorityScheduler
    const scheduler = new GazetteerPriorityScheduler();
    if (scheduler.db && scheduler.db.prepare('SELECT 1').get()) {
      console.log('[Check] GazetteerPriorityScheduler initialized: true');
    } else {
      console.error('[Check] GazetteerPriorityScheduler initialized: false');
      process.exit(1);
    }

    // 2. MultiGoalOptimizer
    const optimizer = new MultiGoalOptimizer();
    if (optimizer.db && optimizer.db.prepare('SELECT 1').get()) {
      console.log('[Check] MultiGoalOptimizer initialized: true');
    } else {
      console.error('[Check] MultiGoalOptimizer initialized: false');
      process.exit(1);
    }

    // 3. PredictiveHubDiscovery
    const discovery = new PredictiveHubDiscovery();
    if (discovery.db && discovery.db.prepare('SELECT 1').get()) {
      console.log('[Check] PredictiveHubDiscovery initialized: true');
    } else {
      console.error('[Check] PredictiveHubDiscovery initialized: false');
      process.exit(1);
    }

    // 4. HierarchicalPlanner
    const planner = new HierarchicalPlanner();
    if (planner.db && planner.db.prepare('SELECT 1').get()) {
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
