const { PredictionStrategyManager } = require('../../services/shared/PredictionStrategyManager');
const { UrlClassificationService } = require('../../services/UrlClassificationService');
const { CountryHubPlanner } = require('../../crawler/planner/CountryHubPlanner');
const { SequenceContextAdapter } = require('../../crawler/operations/sequenceContext');

async function check() {
  console.log('[Check] Verifying Batch 6 components...');

  try {
    // 1. PredictionStrategyManager
    const manager = new PredictionStrategyManager({
      dspls: new Map(),
      entityType: 'country',
      buildMetadata: () => ({})
    });
    if (manager.db && manager.db.prepare('SELECT 1').get()) {
      console.log('[Check] PredictionStrategyManager initialized: true');
    } else {
      console.error('[Check] PredictionStrategyManager initialized: false');
      process.exit(1);
    }

    // 2. UrlClassificationService
    const classifier = new UrlClassificationService();
    if (classifier.db && classifier.db.prepare('SELECT 1').get()) {
      console.log('[Check] UrlClassificationService initialized: true');
    } else {
      console.error('[Check] UrlClassificationService initialized: false');
      process.exit(1);
    }

    // 3. CountryHubPlanner
    const planner = new CountryHubPlanner();
    if (planner.db && planner.db.prepare('SELECT 1').get()) {
      console.log('[Check] CountryHubPlanner initialized: true');
    } else {
      console.error('[Check] CountryHubPlanner initialized: false');
      process.exit(1);
    }

    // 4. SequenceContextAdapter
    const adapter = new SequenceContextAdapter();
    if (adapter.hasPlaybook) {
      console.log('[Check] SequenceContextAdapter initialized with default DB: true');
    } else {
      console.error('[Check] SequenceContextAdapter initialized with default DB: false');
      process.exit(1);
    }

    console.log('[Check] All Batch 6 components verified successfully.');

  } catch (err) {
    console.error('[Check] Verification failed:', err);
    process.exit(1);
  }
}

check();
