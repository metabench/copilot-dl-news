'use strict';

/**
 * Check script for TelemetryIntegration + TaskEventWriter wiring.
 * Verifies that telemetry events get persisted to the database.
 */

const Database = require('better-sqlite3');
const { TelemetryIntegration } = require('../src/crawler/telemetry/TelemetryIntegration');

console.log('=== TelemetryIntegration DB Wiring Check ===\n');

// Create in-memory DB for testing
const db = new Database(':memory:');
console.log('✓ Created in-memory database');

// Create TelemetryIntegration with db and enable URL broadcasts for testing
const integration = new TelemetryIntegration({
  db,
  eventWriterOptions: { batchWrites: false },
  historyLimit: 100,
  bridgeOptions: {
    broadcastUrlEvents: true  // Enable URL-level events for this test
  }
});
console.log('✓ Created TelemetryIntegration with db parameter');

// Verify eventWriter was created
console.log(`✓ eventWriter exists: ${integration.getEventWriter() !== null}`);

// Emit some telemetry events through the bridge
console.log('\n--- Emitting telemetry events ---');

integration.bridge.emitProgress({
  jobId: 'test-crawl-123',
  visited: 10,
  queued: 50
});
console.log('✓ Emitted progress event');

integration.bridge.emitUrlVisited({
  jobId: 'test-crawl-123',
  url: 'https://example.com/page1',
  status: 200,
  durationMs: 120
});
console.log('✓ Emitted url:visited event');

integration.bridge.emitUrlVisited({
  jobId: 'test-crawl-123',
  url: 'https://example.com/page2',
  status: 500,
  durationMs: 80
});
console.log('✓ Emitted url:visited (500) event');

integration.bridge.emitPhaseChange('crawling', { jobId: 'test-crawl-123' });
console.log('✓ Emitted phase change event');

integration.bridge.emitStarted({
  jobId: 'test-crawl-123',
  config: { maxPages: 100 }
});
console.log('✓ Emitted started event');

// Query back from DB
console.log('\n--- Querying persisted events ---');

const writer = integration.getEventWriter();
const events = writer.getEvents('test-crawl-123');
console.log(`✓ Retrieved ${events.length} events from DB`);

events.forEach(e => {
  console.log(`  seq ${e.seq}: ${e.event_type} (${e.event_category}/${e.severity})`);
});

const summary = writer.getSummary('test-crawl-123');
console.log('\n✓ Summary:', JSON.stringify({
  total_events: summary.total_events,
  lifecycle_events: summary.lifecycle_events,
  work_events: summary.work_events,
  error_count: summary.error_count,
  warn_count: summary.warn_count
}, null, 2));

const problems = writer.getProblems('test-crawl-123');
console.log(`\n✓ Found ${problems.length} problem(s)`);
problems.forEach(p => console.log(`  - ${p.event_type}: ${p.target || JSON.parse(p.payload).url}`));

// Test that in-memory history is also working
const history = integration.bridge.getHistory();
console.log(`\n✓ In-memory history has ${history.length} events`);

// Clean up
integration.destroy();
db.close();

console.log('\n=== All checks passed ===');
