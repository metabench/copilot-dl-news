const assert = require('assert');

const { resolveBetterSqliteHandle } = require('../../utils/dashboardModule');
const { createCrawlObserverUiQueries } = require('../../../../db/sqlite/v1/queries/crawlObserverUiQueries');

async function main() {
  const resolved = await resolveBetterSqliteHandle();
  const db = resolved.dbHandle;
  const closeDb = resolved.close;

  try {
    const queries = createCrawlObserverUiQueries(db);

    const tasks = queries.listTasks({ limit: 5 });
    assert(Array.isArray(tasks), 'listTasks returns array');

    const first = tasks[0];
    if (!first) {
      console.log('[crawlObserver.smoke] No tasks found; OK (nothing to validate).');
      return;
    }

    const taskId = first.task_id;
    assert(taskId, 'task has task_id');

    const summary = queries.getTaskSummary(taskId);
    assert(summary && typeof summary === 'object', 'getTaskSummary returns object');

    const page = queries.getTaskEventsPage(taskId, { limit: 50 });
    assert(page && typeof page === 'object', 'getTaskEventsPage returns object');
    assert(Array.isArray(page.events), 'getTaskEventsPage.events returns array');
    assert(page.pageInfo && typeof page.pageInfo === 'object', 'getTaskEventsPage.pageInfo present');

    const inc = queries.getIncrementalEvents(taskId, { limit: 10, sinceSeq: null, includePayload: false });
    assert(inc && typeof inc === 'object', 'getIncrementalEvents returns object');
    assert(Array.isArray(inc.events), 'getIncrementalEvents.events returns array');

    const telemetry = queries.getTelemetryStats();
    assert(telemetry && typeof telemetry === 'object', 'getTelemetryStats returns object');

    console.log('[crawlObserver.smoke] OK');
    console.log({ taskId, totalEvents: summary.total_events, maxSeq: summary.max_seq, eventsReturned: page.events.length });
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error('[crawlObserver.smoke] FAILED');
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
