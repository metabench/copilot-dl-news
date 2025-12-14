const { GazetteerPriorityScheduler } = require('../../crawler/gazetteer/GazetteerPriorityScheduler');
const { getDb } = require('../index');

async function run() {
  console.log('[Check] Verifying GazetteerPriorityScheduler instantiation...');

  // 1. Verify it throws currently (or works if already refactored)
  try {
    const scheduler = new GazetteerPriorityScheduler();
    console.log('[Check] Success! Scheduler instantiated without args.');
    
    // Verify it has a DB handle
    if (scheduler.db) {
        console.log('[Check] Scheduler has a DB handle.');
        // Try a simple query to ensure it's a real handle
        try {
            const row = scheduler.db.prepare('SELECT 1 as val').get();
            console.log(`[Check] DB Query result: ${JSON.stringify(row)}`);
        } catch (e) {
            console.error('[Check] DB Query failed:', e.message);
        }
    } else {
        console.error('[Check] Scheduler has NO DB handle!');
    }

  } catch (error) {
    console.log('[Check] Expected failure (or actual failure):', error.message);
    if (error.message.includes('requires a database handle')) {
        console.log('[Check] Confirmed: Currently requires explicit DB handle.');
    }
  }
}

run().catch(err => console.error(err));
