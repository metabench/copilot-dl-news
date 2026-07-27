'use strict';

/**
 * hostHealthClassify — pure per-host crawl-health classifier (extracted from
 * tools/crawl/host-health.js so it is unit-testable without a DB, cycle 59).
 *
 * WHY THIS EXISTS / THE BUG IT FIXES: the original classifier keyed the FAST /
 * POLITE-THROTTLE / SLOW-IRREGULAR verdict on a plain coefficient-of-variation
 * (stddev/mean) over EVERY inter-fetch gap in the window. But a polite crawler
 * fetches many hosts concurrently and moves between them, so a single host's
 * fetches cluster into BURSTS with long IDLE gaps between (the crawler was
 * working other hosts / nothing was scheduled). Those idle gaps (measured live at
 * 100-2200s) are NOT a robots crawl-delay and NOT a stall — but counted as
 * "inter-fetch gaps" they exploded the CV and mislabeled a known-polite host
 * (theguardian, gaps [0,69,1400,1,6]) as "SLOW-IRREGULAR — investigate stall".
 * A meter that cries wolf on a healthy host defeats its own purpose.
 *
 * THE FIX (validated by an adversarial calibration panel, cycle 59 — 5 diverse
 * break-it lenses + synthesis; every fixture below is executed in the unit test,
 * not trusted). Three changes over the naive session-idle idea:
 *
 *  (A) BACKOFF-RUN DETECTOR (runs on the RAW ordered sequence, BEFORE idle-drop).
 *      A 429/backoff blackout is a RUN of consecutive large gaps; scheduling idle
 *      is an ISOLATED large gap bracketed by fast bursts. >= backoffRunMin (3)
 *      consecutive gaps in the backoff band [120,900]s is the timing-only
 *      signature of a live blackout / sustained stall → SLOW-IRREGULAR. Without
 *      this, a regular blackout reads as the reassuring gold POLITE-THROTTLE.
 *  (B) SESSION-IDLE EXCLUSION at 120s (NOT 300s — sub-300s inter-burst idle of
 *      100-260s was still poisoning the median/MAD). Real crawl-delays are 1-60s
 *      (Guardian ~34s; a legit very-polite outlier ~90s), so a gap > 120s that is
 *      NOT part of a backoff run is scheduling idle → drop before dispersion.
 *  (C) ROBUST MAD dispersion + magnitude/thin guards. Use MAD-based robust CV so
 *      one outlier can't flip the verdict; require median <= politeMaxSec (120s)
 *      to earn the gold POLITE-THROTTLE (a steady 250s gap is not "politeness");
 *      and on thin samples (< minActiveGaps active gaps) never emit the gold
 *      health claim — return FAST (fast median) or LOW-DATA.
 *
 * The four live ground-truth hosts (guardian/apnews/aljazeera/thehindu, all with
 * idle gaps between bursts) classify FAST under this rule; a genuine 90s crawl-delay
 * classifies POLITE-THROTTLE (regression guard).
 *
 * TUNABLE / ACCEPTED TRADE-OFF: politeMaxSec and the backoff-band lower bound are
 * both 120s. A real outlet running a Crawl-delay in 120-250s would read
 * SLOW-IRREGULAR; per the crawler's domain facts (crawl-delays 1-60s; a steady
 * 300s+ cadence is more likely a stuck backend than politeness) that is the
 * safe/investigate call. Raise politeMaxSec if operators confirm a genuine
 * very-polite outlier. Timing alone cannot separate our own coarse single-fetch
 * scheduling from a 429 blackout at a steady >=120s cadence; the cheap
 * disambiguation (a follow-up, out of scope here) is to feed HTTP 429 status
 * counts to the classifier rather than add more timing heuristics.
 */

function median(a) {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function mad(a) {
  if (!a.length) return 0;
  const m = median(a);
  return median(a.map((x) => Math.abs(x - m)));
}
// Longest run of CONSECUTIVE elements (order preserved) that satisfy pred.
function maxConsecutiveRun(seq, pred) {
  let best = 0, cur = 0;
  for (const g of seq) {
    if (pred(g)) { cur += 1; if (cur > best) best = cur; }
    else cur = 0;
  }
  return best;
}

const DEFAULTS = {
  sessionIdleSec: 120,   // gaps larger than this (and not part of a backoff run) are scheduling-idle, not crawl-delay
  minActiveGaps: 5,      // need at least this many active gaps to responsibly call a stall / claim politeness
  fastMedianSec: 5,      // median active gap below this = FAST
  throttleRobustCv: 0.6, // robust CV below this (with a bounded median) = regular crawl-delay = POLITE-THROTTLE
  politeMaxSec: 120,     // POLITE-THROTTLE asserts a real crawl-delay floor; a steady gap above this is not politeness
  backoffBandSec: [120, 900], // 429/backoff escalation band; lower bound clears the crawl-delay ceiling
  backoffRunMin: 3,      // >= this many CONSECUTIVE in-band gaps = a blackout/stall run (not isolated idle)
};

/**
 * classifyHost(gaps, opts) -> {
 *   cls: 'FAST'|'POLITE-THROTTLE'|'SLOW-IRREGULAR'|'LOW-DATA',
 *   verdict: string,              // operator-facing one-liner
 *   gMed, gMean, robustCv,        // stats over ACTIVE gaps
 *   activeCount, droppedIdle, backoffRun  // diagnostics
 * }
 * `gaps` is the array of seconds between consecutive same-host fetches IN CRAWL ORDER
 * (order matters for the backoff-run detector — do not pre-sort).
 */
function classifyHost(gaps, opts) {
  const o = Object.assign({}, DEFAULTS, opts || {});
  const [bLo, bHi] = o.backoffBandSec;
  const seq = (Array.isArray(gaps) ? gaps : []).filter((g) => Number.isFinite(g) && g >= 0);

  // (A) Backoff-run detector — on the raw ordered sequence, before idle-drop.
  const backoffRun = maxConsecutiveRun(seq, (g) => g >= bLo && g <= bHi);
  if (backoffRun >= o.backoffRunMin) {
    return { cls: 'SLOW-IRREGULAR', verdict: `SLOW/IRREGULAR (${backoffRun} consecutive ${bLo}-${bHi}s gaps — investigate: repeated backoff / 429 blackout?)`, gMed: 0, gMean: 0, robustCv: 0, activeCount: 0, droppedIdle: 0, backoffRun };
  }

  // (B) Drop idle / non-crawl-delay gaps; classify within-burst cadence.
  const active = seq.filter((g) => g <= o.sessionIdleSec);
  const droppedIdle = seq.length - active.length;
  if (!active.length) {
    return { cls: 'LOW-DATA', verdict: 'LOW-DATA (no active-crawl gaps in window — host idle/unscheduled)', gMed: 0, gMean: 0, robustCv: 0, activeCount: 0, droppedIdle, backoffRun };
  }

  const gMed = median(active);
  const gMean = mean(active);
  const robustCv = gMed > 0 ? (1.4826 * mad(active)) / gMed : 0;

  // (C) Thin sample — never emit the gold POLITE-THROTTLE health claim on < minActiveGaps.
  if (active.length < o.minActiveGaps) {
    if (gMed < o.fastMedianSec) {
      return { cls: 'FAST', verdict: 'FAST', gMed, gMean, robustCv, activeCount: active.length, droppedIdle, backoffRun };
    }
    return { cls: 'LOW-DATA', verdict: `LOW-DATA (~${gMed.toFixed(0)}s median over only ${active.length} active gap(s) — too thin to classify)`, gMed, gMean, robustCv, activeCount: active.length, droppedIdle, backoffRun };
  }

  if (gMed < o.fastMedianSec) {
    return { cls: 'FAST', verdict: 'FAST', gMed, gMean, robustCv, activeCount: active.length, droppedIdle, backoffRun };
  }
  if (robustCv < o.throttleRobustCv && gMed <= o.politeMaxSec) {
    return { cls: 'POLITE-THROTTLE', verdict: `POLITE-THROTTLE (~${gMed.toFixed(0)}s crawl-delay — working as intended, NOT a bug)`, gMed, gMean, robustCv, activeCount: active.length, droppedIdle, backoffRun };
  }
  return { cls: 'SLOW-IRREGULAR', verdict: `SLOW/IRREGULAR (active-gap median ~${gMed.toFixed(0)}s, robustCV=${robustCv.toFixed(2)} — investigate: stall? server-side? bandwidth?)`, gMed, gMean, robustCv, activeCount: active.length, droppedIdle, backoffRun };
}

module.exports = { classifyHost, median, mean, mad, maxConsecutiveRun, DEFAULTS };
