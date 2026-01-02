'use strict';

/**
 * Deterministic check for CrawlScheduler.reconcileOverdue.
 *
 * Goal: when many schedules are overdue (e.g. after downtime), keep the top N due now
 * and postpone the rest across a spread window, emitting task_events for observability.
 */

const Database = require('better-sqlite3');
const CrawlScheduler = require('../src/crawler/scheduler/CrawlScheduler');
const { TaskEventWriter } = require('../src/db/TaskEventWriter');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

console.log('=== Scheduler Reconcile Overdue Check ===\n');

const db = new Database(':memory:');
const scheduler = new CrawlScheduler({ db });
const writer = new TaskEventWriter(db, { batchWrites: false });

const asOf = '2026-01-01T12:00:00.000Z';
const asOfMs = Date.parse(asOf);

console.log('✓ Created in-memory DB + CrawlScheduler');

// Seed 10 overdue schedules, with distinct priorities (higher = more important)
for (let i = 0; i < 10; i++) {
  const domain = `domain${i}.example`;
  const nextCrawlAt = new Date(asOfMs - (10 * 60 + i) * 60 * 1000).toISOString();
  const priorityScore = 1 - i * 0.05;
  scheduler.store.save({ domain, nextCrawlAt, priorityScore, avgUpdateIntervalHours: 24 });
}

console.log('✓ Seeded 10 overdue schedules');

const taskId = 'scheduler-reconcile-check';
const result = scheduler.reconcileOverdue({
  asOf,
  maxDueNow: 3,
  spreadWindowMinutes: 60,
  maxPostponeHours: 24,
  taskEventWriter: writer,
  taskId
});

console.log('✓ Ran reconcileOverdue');
console.log(JSON.stringify(result, null, 2));

assert(result.overdueCount === 10, 'Expected overdueCount=10');
assert(result.dueNowCount === 3, 'Expected dueNowCount=3');
assert(result.postponedCount === 7, 'Expected postponedCount=7');
assert(result.postponed.length === 7, 'Expected postponed array length=7');

// Ensure postponed entries are in the future (relative to asOf) and non-decreasing.
let lastMs = asOfMs;
for (const entry of result.postponed) {
  assert(entry.domain, 'Postponed entry missing domain');
  assert(entry.fromNextCrawlAt, 'Postponed entry missing fromNextCrawlAt');
  assert(entry.toNextCrawlAt, 'Postponed entry missing toNextCrawlAt');

  const toMs = Date.parse(entry.toNextCrawlAt);
  assert(Number.isFinite(toMs), `Invalid toNextCrawlAt for ${entry.domain}`);
  assert(toMs >= asOfMs, `Expected postponed nextCrawlAt >= asOf for ${entry.domain}`);
  assert(toMs >= lastMs, `Expected non-decreasing postponed times (at ${entry.domain})`);
  lastMs = toMs;

  // Verify DB reflects the update.
  const schedule = scheduler.getSchedule(entry.domain);
  assert(schedule && schedule.nextCrawlAt === entry.toNextCrawlAt, `DB nextCrawlAt mismatch for ${entry.domain}`);
}

console.log('✓ Postponement schedule looks sane');

// Verify task_events were emitted.
const events = writer.getEvents(taskId);
const types = events.map(e => e.event_type);
assert(types[0] === 'scheduler:reconcile:start', 'Expected first event scheduler:reconcile:start');
assert(types[types.length - 1] === 'scheduler:reconcile:end', 'Expected last event scheduler:reconcile:end');
assert(types.filter(t => t === 'scheduler:reconcile:postpone').length === 7, 'Expected 7 postpone events');

console.log(`✓ task_events emitted: ${events.length} events`);

writer.destroy();
db.close();

console.log('\n=== All checks passed ===');
