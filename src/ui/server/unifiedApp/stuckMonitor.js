'use strict';

/**
 * createStuckMonitor — the guarded EWMA/activity stuck-host trigger for
 * run-multi's per-host wait (task #43, 2026-07-21).
 *
 * Replaces the blind fixed 4-min wait-cap trigger with a MEASURED one: a host's
 * job is STUCK when its live download activity (cumulative bytesTotal, or the
 * progress.downloaded counter — both monotonic, both live in forked-worker mode
 * via the registry's bandwidth-usage / crawler-event messages) has been FROZEN
 * for `stuckSilenceMs`, AND it still holds un-fetched leased rows, AND — the
 * load-bearing SAFETY GUARD — at least one still-active SIBLING job advanced
 * within the same window.
 *
 * Why the sibling guard is mandatory: the Guardian "slow" symptom is
 * whole-process orchestration DEAD-TIME (synchronous frontier reconcile/hydration
 * vs the 30 GB DB stalling the entire crawler between bursts — the #39/#40
 * event-loop family). During that dead-time EVERY host's activity freezes at
 * once. Aborting on a bare per-host freeze would wrongly kill healthy hosts. So
 * we only abort when the silence is host-SPECIFIC: a sibling is demonstrably
 * still emitting while this host is not. If ALL active jobs are frozen together,
 * that is orchestration-idle → abort NOBODY (fall through to the absolute cap).
 *
 * Pure + dependency-injected (getJob + now) so the guard is unit-testable
 * without the crawl machinery. getJob(jobId) returns the registry's public job
 * ({ status, progress, bytesTotal, ... }) or null.
 */
function createStuckMonitor(jobIds, getJob, opts = {}) {
  const stuckSilenceMs = opts.stuckSilenceMs != null ? opts.stuckSilenceMs : 40000;
  const refreshThrottleMs = opts.refreshThrottleMs != null ? opts.refreshThrottleMs : 2000;
  const now = typeof opts.now === 'function' ? opts.now : () => Date.now();

  const t0 = now();
  const act = new Map();
  for (const id of jobIds) act.set(id, { lastSignal: -1, lastAdvanceAt: t0, downloaded: 0, done: false });
  let lastRefreshAt = 0;

  function readActivity(pj) {
    if (!pj) return { signal: null, downloaded: 0, done: false };
    const bytes = Number(pj.bytesTotal) || 0;
    const downloaded = pj.progress ? (Number(pj.progress.downloaded) || 0) : 0;
    // Either the cumulative byte counter or the download counter advancing is
    // "activity" — bytesTotal leads (per bandwidth-usage msg), downloaded is a
    // fallback if the worker only emits progress events.
    return { signal: Math.max(bytes, downloaded), downloaded, done: !!(pj.status && pj.status !== 'running') };
  }

  function refresh(force) {
    const t = now();
    if (!force && (t - lastRefreshAt) < refreshThrottleMs) return;
    lastRefreshAt = t;
    for (const [id, a] of act) {
      const { signal, downloaded, done } = readActivity(getJob(id));
      a.done = done;
      a.downloaded = downloaded;
      if (signal != null && signal > a.lastSignal) { a.lastSignal = signal; a.lastAdvanceAt = t; }
    }
  }

  /**
   * Is this job stuck (and safe to abort)? toFetchLen = the count of URLs the
   * job leased (ctx.toFetch.length) so we can tell it still holds un-fetched work.
   */
  function isStuck(jobId, toFetchLen) {
    refresh();
    const t = now();
    const me = act.get(jobId);
    if (!me || me.done) return false;                          // finished jobs are not "stuck"
    if ((t - me.lastAdvanceAt) < stuckSilenceMs) return false; // still advancing recently
    if ((me.downloaded || 0) >= toFetchLen) return false;      // no un-fetched leased rows held
    // Sibling-relative guard: an ACTIVE (still-running) sibling advanced within
    // the window ⇒ the process IS emitting for others while starving me ⇒ I am
    // host-specifically stuck. If none did (all frozen), it's orchestration-idle.
    for (const [id, a] of act) {
      if (id === jobId) continue;
      if (!a.done && (t - a.lastAdvanceAt) < stuckSilenceMs) return true;
    }
    return false;
  }

  function snapshot() {
    const t = now();
    return Array.from(act.entries()).map(([id, a]) => ({
      jobId: id, done: a.done, downloaded: a.downloaded, frozenMs: t - a.lastAdvanceAt
    }));
  }

  return { refresh, isStuck, snapshot };
}

module.exports = { createStuckMonitor };
