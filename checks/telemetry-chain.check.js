'use strict';

/**
 * Test the telemetry integration chain:
 * Crawler (EventEmitter) -> CrawlTelemetryBridge -> TelemetryIntegration -> TaskEventWriter -> DB
 */

const path = require('path');
const Database = require('better-sqlite3');
const { TelemetryIntegration } = require('../src/crawler/telemetry/TelemetryIntegration');
const EventedCrawlerBase = require('../src/crawler/core/EventedCrawlerBase');

async function main() {
  const db = new Database(':memory:');

  // Create task_events table with correct schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_events (
      id INTEGER PRIMARY KEY,
      task_type TEXT NOT NULL,
      task_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      ts TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_category TEXT,
      severity TEXT,
      scope TEXT,
      target TEXT,
      payload TEXT,
      duration_ms INTEGER,
      http_status INTEGER,
      item_count INTEGER
    )
  `);

  const telemetry = new TelemetryIntegration({ 
    db,
    eventWriterOptions: { batchWrites: false }
  });

  console.log('Has eventWriter:', !!telemetry.eventWriter);
  console.log('Has bridge:', !!telemetry.bridge);

  // Simulate connecting a crawler
  const fakeCrawler = new EventedCrawlerBase();
  fakeCrawler.jobId = 'test-job-123';

  console.log('\n--- Connecting crawler ---');
  const disconnect = telemetry.connectCrawler(fakeCrawler, { jobId: 'test-job-123', crawlType: 'test' });
  console.log('Connected crawler');

  // Check bridge state
  console.log('Bridge state after connect:', telemetry.bridge.getState());

  console.log('\n--- Emitting events ---');
  
  // Emit started
  fakeCrawler.emit('started', { startUrl: 'http://test.com' });
  console.log('Emitted started');
  
  // Emit progress
  fakeCrawler.emit('progress', { stats: { pagesVisited: 5, errors: 0 }, paused: false });
  console.log('Emitted progress');
  
  // Emit another progress
  fakeCrawler.emit('progress', { stats: { pagesVisited: 10, errors: 1 }, paused: false });
  console.log('Emitted progress (2)');

  // Emit stopped
  fakeCrawler.emit('stopped', { reason: 'complete', stats: { pagesVisited: 10 } });
  console.log('Emitted stopped');

  // Wait for batch flush
  console.log('\n--- Waiting 700ms for batch flush ---');
  await new Promise(resolve => setTimeout(resolve, 700));

  const events = db.prepare('SELECT * FROM task_events ORDER BY seq').all();
  console.log(`\nEvents in DB: ${events.length}`);
  for (const evt of events) {
    console.log(` - seq=${evt.seq} type=${evt.event_type} task=${evt.task_id}`);
  }

  telemetry.destroy();
  db.close();

  console.log('\n--- Summary ---');
  console.log(`Expected: started(1) + progress(batched=1) + stopped(1) = 3 events`);
  console.log(`Got: ${events.length} events`);
  console.log(events.length >= 3 ? '✅ PASS' : '❌ FAIL');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
