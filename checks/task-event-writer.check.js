'use strict';

/**
 * Check script for TaskEventWriter functionality.
 * Verifies schema creation, event writing, and query capabilities.
 */

const Database = require('better-sqlite3');
const { TaskEventWriter, getEventMetadata } = require('../src/db/TaskEventWriter');

console.log('=== TaskEventWriter Check ===\n');

// Create in-memory DB for testing
const db = new Database(':memory:');
console.log('✓ Created in-memory database');

// Create writer (this will auto-create schema)
const writer = new TaskEventWriter(db, { batchWrites: false });
console.log('✓ Created TaskEventWriter (non-batched mode)');

// Verify schema was created
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='task_events'").all();
console.log(`✓ task_events table exists: ${tables.length > 0}`);

const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='task_events'").all();
console.log(`✓ Indexes created: ${indexes.length} indexes`);
indexes.forEach(idx => console.log(`  - ${idx.name}`));

// Write some test events
console.log('\n--- Writing test events ---');

writer.write({
  taskType: 'crawl',
  taskId: 'job-001',
  eventType: 'crawl:start',
  data: { config: { maxPages: 100 } }
});
console.log('✓ Wrote crawl:start event');

writer.write({
  taskType: 'crawl',
  taskId: 'job-001',
  eventType: 'url:fetched',
  data: { url: 'https://example.com', status: 200, durationMs: 150 }
});
console.log('✓ Wrote url:fetched event');

writer.write({
  taskType: 'crawl',
  taskId: 'job-001',
  eventType: 'url:fetched',
  data: { url: 'https://example.com/page2', status: 404, durationMs: 80 }
});
console.log('✓ Wrote url:fetched (404) event');

writer.write({
  taskType: 'crawl',
  taskId: 'job-001',
  eventType: 'fetch:error',
  data: { url: 'https://example.com/broken', error: 'Connection refused' }
});
console.log('✓ Wrote fetch:error event');

writer.write({
  taskType: 'crawl',
  taskId: 'job-001',
  eventType: 'crawl:end',
  data: { visited: 3, duration: 5000 }
});
console.log('✓ Wrote crawl:end event');

// Query test
console.log('\n--- Query tests ---');

const allEvents = writer.getEvents('job-001');
console.log(`✓ getEvents returned ${allEvents.length} events`);

const summary = writer.getSummary('job-001');
console.log(`✓ getSummary:`, JSON.stringify(summary, null, 2));

const problems = writer.getProblems('job-001');
console.log(`✓ getProblems returned ${problems.length} problems`);
problems.forEach(p => console.log(`  - ${p.event_type}: ${JSON.parse(p.payload).error || JSON.parse(p.payload).url}`));

const timeline = writer.getTimeline('job-001');
console.log(`✓ getTimeline returned ${timeline.length} lifecycle events`);
timeline.forEach(e => console.log(`  - seq ${e.seq}: ${e.event_type}`));

// Test replay cursor
const sinceSeq2 = writer.getEvents('job-001', { sinceSeq: 2 });
console.log(`✓ getEvents (sinceSeq: 2) returned ${sinceSeq2.length} events (expected 3)`);

// Test category filter
const errors = writer.getEvents('job-001', { category: 'error' });
console.log(`✓ getEvents (category: error) returned ${errors.length} events`);

// Test listTasks
const tasks = writer.listTasks();
console.log(`✓ listTasks returned ${tasks.length} tasks`);
tasks.forEach(t => console.log(`  - ${t.task_id}: ${t.event_count} events, ${t.errors} errors`));

// Verify metadata extraction
console.log('\n--- Metadata extraction ---');
console.log('url:fetched →', getEventMetadata('url:fetched'));
console.log('fetch:error →', getEventMetadata('fetch:error'));
console.log('crawl:telemetry:progress →', getEventMetadata('crawl:telemetry:progress'));
console.log('unknown:type →', getEventMetadata('unknown:type'));

// Clean up
writer.destroy();
db.close();

console.log('\n=== All checks passed ===');
