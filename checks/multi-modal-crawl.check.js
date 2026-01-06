#!/usr/bin/env node
'use strict';

/**
 * Check: Multi-Modal Crawl Module
 *
 * Verifies the multi-modal crawl module loads correctly and
 * demonstrates the orchestrator's event-driven API.
 */

const path = require('path');
const multimodalPath = path.join(__dirname, '../src/crawler/multimodal');

console.log('┌─ Multi-Modal Crawl Module Check ─────────────────────────────┐');

// Load the module
try {
  const {
    MultiModalCrawlOrchestrator,
    PatternDeltaTracker,
    CrawlBalancer,
    MultiModalCrawlManager,
    createMultiModalCrawl
  } = require(multimodalPath);

  console.log('│ ✓ Module loaded successfully                                 │');

  // Verify exports
  const exports = [
    ['MultiModalCrawlOrchestrator', MultiModalCrawlOrchestrator],
    ['PatternDeltaTracker', PatternDeltaTracker],
    ['CrawlBalancer', CrawlBalancer],
    ['MultiModalCrawlManager', MultiModalCrawlManager],
    ['createMultiModalCrawl', createMultiModalCrawl]
  ];

  for (const [name, exp] of exports) {
    if (exp) {
      console.log(`│ ✓ ${name.padEnd(35)} exported │`);
    } else {
      console.log(`│ ✗ ${name.padEnd(35)} missing  │`);
    }
  }

  // Test instantiation (without DB)
  console.log('│                                                               │');
  console.log('│ Testing instantiation (mocked dependencies)...               │');

  const mockDb = null;
  const mockCrawlOps = { runCustom: async () => ({ stats: { pagesDownloaded: 0 } }) };

  const orchestrator = new MultiModalCrawlOrchestrator({
    db: mockDb,
    crawlOperations: mockCrawlOps,
    config: {
      batchSize: 100,
      maxTotalBatches: 1,
      historicalRatio: 0.3
    }
  });

  console.log(`│ ✓ Orchestrator created                                       │`);
  console.log(`│   Phase: ${orchestrator.phase.padEnd(47)} │`);
  console.log(`│   Batch size: ${String(orchestrator.config.batchSize).padEnd(43)} │`);
  console.log(`│   Max batches: ${String(orchestrator.config.maxTotalBatches).padEnd(42)} │`);

  // Test PatternDeltaTracker
  const tracker = new PatternDeltaTracker();
  tracker.recordPatterns(1, [
    { hash: 'abc123', seenCount: 5 },
    { hash: 'def456', seenCount: 3 }
  ]);
  const trends = tracker.getLearningTrends();
  console.log(`│ ✓ PatternDeltaTracker working (${trends.totalUniqueSignatures} signatures)             │`);

  // Test CrawlBalancer
  const balancer = new CrawlBalancer({ strategy: 'adaptive' });
  const balance = balancer.getBalance(1);
  console.log(`│ ✓ CrawlBalancer working (${(balance.historical * 100).toFixed(0)}% historical)             │`);

  // Test MultiModalCrawlManager (instantiation only)
  const manager = new MultiModalCrawlManager({
    createOrchestrator: () => ({ orchestrator })
  });
  console.log(`│ ✓ MultiModalCrawlManager created                              │`);

  // Test events
  console.log('│                                                               │');
  console.log('│ Event emission test...                                        │');

  let eventsReceived = 0;
  orchestrator.on('phase-change', () => eventsReceived++);
  orchestrator.emit('phase-change', { from: 'idle', to: 'testing' });

  console.log(`│ ✓ Events working (received: ${eventsReceived})                             │`);

  console.log('│                                                               │');
  console.log('│ ✓ All checks passed                                           │');
  console.log('└───────────────────────────────────────────────────────────────┘');

} catch (error) {
  console.log(`│ ✗ Error: ${error.message.substring(0, 48).padEnd(48)} │`);
  console.log('└───────────────────────────────────────────────────────────────┘');
  console.error(error);
  process.exit(1);
}
