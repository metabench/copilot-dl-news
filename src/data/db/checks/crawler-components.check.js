const { HierarchicalPlanner } = require('../../../core/crawler/HierarchicalPlanner');
const { MultiGoalOptimizer } = require('../../../core/crawler/MultiGoalOptimizer');
const { PredictiveHubDiscovery } = require('../../../core/crawler/PredictiveHubDiscovery');
const { getDb } = require('../../../db');
const { checkDatabaseHealth } = require('news-crawler-db');

async function run() {
  console.log('[Check] Verifying Crawler Components instantiation...');

  const components = [
    { name: 'HierarchicalPlanner', Class: HierarchicalPlanner },
    { name: 'MultiGoalOptimizer', Class: MultiGoalOptimizer },
    { name: 'PredictiveHubDiscovery', Class: PredictiveHubDiscovery }
  ];

  for (const { name, Class } of components) {
    try {
      console.log(`\n[Check] Testing ${name}...`);
      const instance = new Class();
      
      if (instance.db) {
        console.log(`[Check] ${name} has a DB handle.`);
        try {
            console.log(`[Check] DB health: ${checkDatabaseHealth(instance.db)}`);
        } catch (e) {
            console.error(`[Check] DB health check failed for ${name}:`, e.message);
        }
      } else {
        console.error(`[Check] ${name} has NO DB handle!`);
      }
    } catch (error) {
      console.error(`[Check] Failed to instantiate ${name}:`, error.message);
    }
  }
}

run().catch(err => console.error(err));
