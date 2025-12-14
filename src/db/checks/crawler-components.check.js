const { HierarchicalPlanner } = require('../../crawler/HierarchicalPlanner');
const { MultiGoalOptimizer } = require('../../crawler/MultiGoalOptimizer');
const { PredictiveHubDiscovery } = require('../../crawler/PredictiveHubDiscovery');
const { getDb } = require('../index');

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
        // Try a simple query to ensure it's a real handle
        try {
            const row = instance.db.prepare('SELECT 1 as val').get();
            console.log(`[Check] DB Query result: ${JSON.stringify(row)}`);
        } catch (e) {
            console.error(`[Check] DB Query failed for ${name}:`, e.message);
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
