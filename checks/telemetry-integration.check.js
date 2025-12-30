#!/usr/bin/env node
'use strict';

/**
 * Check that TelemetryIntegration properly persists progress events from connected crawler.
 * 
 * This verifies the full chain:
 * 1. Crawler emits 'progress' event
 * 2. CrawlTelemetryBridge receives it
 * 3. TelemetryIntegration broadcasts it
 * 4. TaskEventWriter persists it with correct jobId
 */

const Database = require('better-sqlite3');
const { Evented_Class } = require('lang-tools');
const { TelemetryIntegration } = require('../src/crawler/telemetry/TelemetryIntegration');

// Create in-memory DB
const db = new Database(':memory:');

// Let TaskEventWriter create the schema
// (We don't manually create the table - TaskEventWriter does it)

// Create a fake crawler that mimics the real one
class FakeCrawler extends Evented_Class {
  constructor(jobId) {
    super();
    this.jobId = jobId;
    this.state = {
      getStats: () => ({
        visited: 10,
        queued: 5,
        errors: 0,
        downloaded: 10,
        articles: 3
      })
    };
  }

  // Mimic the EventedCrawlerBase
  on(event, handler) {
    return super.on(event, handler);
  }
  
  off(event, handler) {
    return super.off(event, handler);
  }
  
  emit(event, data) {
    this.raise(event, data);
  }
}

async function main() {
  console.log('=== TelemetryIntegration Check ===\n');

  const jobId = 'test-job-' + Date.now();
  console.log(`Job ID: ${jobId}\n`);

  // Create TelemetryIntegration with DB persistence
  const telemetry = new TelemetryIntegration({
    db,
    eventWriterOptions: { batchWrites: false }
  });

  // Create and connect fake crawler
  const crawler = new FakeCrawler(jobId);
  const disconnect = telemetry.connectCrawler(crawler, {
    jobId,
    crawlType: 'test'
  });

  console.log('1. Connected crawler to telemetry bridge');

  // Emit a 'started' event first (sets the jobId in bridge state)
  crawler.emit('started', { 
    jobId,
    crawlType: 'test',
    startUrl: 'https://example.com'
  });
  console.log('2. Emitted "started" event');

  // Wait for any batching
  await new Promise(r => setTimeout(r, 100));

  // Emit a 'progress' event
  crawler.emit('progress', {
    visited: 10,
    queued: 5,
    errors: 0,
    downloaded: 10,
    articles: 3
  });
  console.log('3. Emitted "progress" event');

  // Wait for the progress batch interval (500ms in bridge)
  await new Promise(r => setTimeout(r, 600));
  console.log('4. Waited for batch flush');

  // Emit a 'finished' event
  crawler.emit('finished', {
    status: 'completed',
    stats: { visited: 10, downloaded: 10, articles: 3 }
  });
  console.log('5. Emitted "finished" event');

  // Wait for any final writes
  await new Promise(r => setTimeout(r, 100));

  // Cleanup
  disconnect();
  telemetry.destroy();
  console.log('6. Cleanup complete\n');

  // Query the database
  const events = db.prepare(`
    SELECT id, task_id, event_type, event_category, payload 
    FROM task_events 
    WHERE task_id = ?
    ORDER BY id
  `).all(jobId);

  console.log(`=== Results ===`);
  console.log(`Events persisted: ${events.length}\n`);

  if (events.length === 0) {
    console.error('❌ FAIL: No events persisted!');
    
    // Check if any events at all
    const allEvents = db.prepare('SELECT COUNT(*) as count FROM task_events').get();
    console.log(`Total events in DB: ${allEvents.count}`);
    
    if (allEvents.count > 0) {
      const sample = db.prepare('SELECT task_id, event_type FROM task_events LIMIT 5').all();
      console.log('Sample events:', sample);
    }
    
    db.close();
    process.exit(1);
  }

  for (const event of events) {
    console.log(`  [${event.id}] ${event.event_type} (task: ${event.task_id})`);
  }

  const hasProgress = events.some(e => e.event_type === 'crawl:progress');
  const hasStarted = events.some(e => e.event_type === 'crawl:started');
  const hasCompleted = events.some(e => e.event_type === 'crawl:completed');

  console.log(`\nEvent types found:`);
  console.log(`  - crawl:started: ${hasStarted ? '✓' : '✗'}`);
  console.log(`  - crawl:progress: ${hasProgress ? '✓' : '✗'}`);
  console.log(`  - crawl:completed: ${hasCompleted ? '✓' : '✗'}`);

  if (hasStarted && hasProgress && hasCompleted) {
    console.log('\n✅ PASS: All expected event types persisted with correct jobId');
    db.close();
    process.exit(0);
  } else {
    console.error('\n❌ FAIL: Missing expected event types');
    db.close();
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
