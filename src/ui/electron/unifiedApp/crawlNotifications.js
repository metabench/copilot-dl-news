'use strict';

/**
 * crawlNotifications.js — desktop notifications when a crawl job finishes
 * (RB-010's last residue, 2026-07-20).
 *
 * Pure watcher logic with INJECTED fetchJobs/notify so the module is fully
 * unit-testable without Electron: main.js supplies a notify() built on
 * Electron's Notification (main process; the server child knows job state
 * but cannot show OS toasts, so the watcher polls the jobs API from here —
 * the same boundary the rest of the app already uses).
 *
 * Semantics: a job is announced ONCE, when its id transitions from running
 * (seen in a previous poll) to any terminal status. Jobs that were never
 * seen running are not announced (a watcher started mid-history must not
 * replay old completions).
 */

function summarizeJob(job) {
  const status = job && job.status ? String(job.status) : 'finished';
  const target = job && job.startUrl ? String(job.startUrl) : 'crawl job';
  const progress = job && job.progress && typeof job.progress === 'object' ? job.progress : null;
  const counts = progress && (progress.downloaded != null || progress.errors != null)
    ? ` — ${Number(progress.downloaded || 0)} downloaded, ${Number(progress.errors || 0)} errors`
    : '';
  return { title: `Crawl ${status}`, body: `${target}${counts}` };
}

function startCrawlCompletionNotifier({ fetchJobs, notify, intervalMs = 10000, logger = console }) {
  const running = new Set();
  let stopped = false;

  async function tick() {
    if (stopped) return;
    let items;
    try {
      items = await fetchJobs();
    } catch (_) {
      return; // transient — keep prior running-set, retry next tick
    }
    if (!Array.isArray(items)) return;
    const nowRunning = new Set();
    for (const job of items) {
      if (!job || !job.id) continue;
      if (job.status === 'running') {
        nowRunning.add(job.id);
      } else if (running.has(job.id)) {
        // running -> terminal transition we witnessed: announce once.
        try {
          const summary = summarizeJob(job);
          notify(summary);
          logger.log(`[notify] shown: ${summary.title} | ${summary.body}`);
        } catch (err) {
          logger.warn(`[notify] failed: ${err.message}`);
        }
        running.delete(job.id);
      }
    }
    for (const id of nowRunning) running.add(id);
    // Drop ids that vanished from the list entirely (registry pruned them
    // while we weren't looking — no reliable terminal status to announce).
    for (const id of Array.from(running)) {
      if (!nowRunning.has(id) && !items.some((j) => j && j.id === id)) running.delete(id);
    }
  }

  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return {
    tick, // exposed for tests and the --notify-test path
    stop() { stopped = true; clearInterval(timer); }
  };
}

module.exports = { startCrawlCompletionNotifier, summarizeJob };
