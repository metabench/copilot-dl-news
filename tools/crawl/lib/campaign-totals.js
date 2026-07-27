'use strict';

/**
 * Pure rollup of a campaign's per-leg reports into a single at-a-glance
 * totals object — the "how well is the crawl going" summary that
 * campaign-status.json previously lacked (2026-07-20). Kept pure so it is
 * unit-testable without spawning crawls.
 *
 * Each leg record has a `.report`: either { skipped:true, reason } (preflight
 * skip) or the bounded-dispatch result carrying downloaded/saved/found/errors/
 * bytesDownloaded (as of the same-day dispatch fix). Tolerant of missing
 * fields and raw/parse-failed reports (counted as run-but-zero).
 */
function rollupTotals(legs) {
  const t = { legsRun: 0, legsSkipped: 0, downloaded: 0, saved: 0, found: 0, errors: 0, bytesDownloaded: 0 };
  for (const leg of Array.isArray(legs) ? legs : []) {
    const r = leg && leg.report;
    if (!r) continue;
    if (r.skipped) { t.legsSkipped += 1; continue; }
    t.legsRun += 1;
    t.downloaded += Number(r.downloaded || 0);
    t.saved += Number(r.saved || 0);
    t.found += Number(r.found || 0);
    t.errors += Number(r.errors || 0);
    t.bytesDownloaded += Number(r.bytesDownloaded || 0);
  }
  t.mbDownloaded = Number((t.bytesDownloaded / 1e6).toFixed(1));
  return t;
}

module.exports = { rollupTotals };
