const { GazetteerPriorityScheduler } = require('../../../core/crawler/gazetteer/GazetteerPriorityScheduler');
const { getDb } = require('../../../db');
const { checkDatabaseHealth } = require('news-crawler-db');

async function run() {
  console.log('[Check] Verifying GazetteerPriorityScheduler instantiation...');

  // 1. Verify it throws currently (or works if already refactored)
  try {
    const scheduler = new GazetteerPriorityScheduler();
    console.log('[Check] Success! Scheduler instantiated without args.');
    
    // Verify it has a DB handle
    if (scheduler.db) {
        console.log('[Check] Scheduler has a DB handle.');
        try {
            console.log(`[Check] DB health: ${checkDatabaseHealth(scheduler.db)}`);
        } catch (e) {
            console.error('[Check] DB health check failed:', e.message);
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
