'use strict';

const { classifyHost, maxConsecutiveRun, median } = require('../hostHealthClassify');

/**
 * Calibration fixtures for the per-host crawl-health classifier (cycle 59).
 * These are the ground-truth live sequences + the adversarial-panel counterexamples
 * (5 diverse break-it lenses + synthesis). Each asserts the SHIPPED classification —
 * this is the executable validation of the panel's verdict, not a hand-trace.
 *
 * The bug fixed: inter-burst scheduling idle (100-2200s) was counted as inter-fetch
 * gaps and flipped a known-polite host (Guardian) to a false "SLOW-IRREGULAR". The
 * three hardenings: (A) backoff-run detector before idle-drop, (B) idle cutoff 120s,
 * (C) robust MAD + magnitude/thin guards on POLITE-THROTTLE.
 */

// [name, gaps (in crawl order), expected cls]
const FIXTURES = [
  // --- live ground truth: all must be FAST (regression guard) ---
  ['gt-apnews-fast-bursty-idle', [1, 3, 2, 3, 1, 729, 0, 12, 2, 12, 3, 18, 1422, 1, 3, 2, 5, 2, 1, 5, 1, 7, 0, 3], 'FAST'],
  ['gt-guardian-thin-idle', [0, 69, 1400, 1, 6], 'FAST'],
  ['gt-aljazeera-fast-idle', [1, 1, 1, 0, 0, 0, 1, 2204, 1, 0, 2, 0, 0, 0, 0, 1], 'FAST'],
  ['gt-thehindu-fast-idle', [1, 2, 0, 2, 734, 1, 4, 2, 3, 1459, 1, 2, 1, 2, 2, 0, 0], 'FAST'],
  // --- legit throttles: POLITE-THROTTLE ---
  ['polite-90-control', [88, 93, 90, 95, 87, 91, 89, 94, 86, 92], 'POLITE-THROTTLE'],
  ['polite-30-bursty-idle', [30, 30, 200, 30, 30, 200, 30, 30, 200], 'POLITE-THROTTLE'],
  // --- Flaw 1 (false-stall): sub-300 idle poisoned median → now dropped ---
  ['flaw1-fast-pairs-idle', [2, 150, 2, 150, 2, 150], 'FAST'],
  ['flaw1-polite-2burst-idle', [20, 260, 20, 260, 20, 260, 20, 260], 'LOW-DATA'],
  // --- Flaw 2 (missed-stall): backoff/blackout runs → SLOW-IRREGULAR ---
  ['flaw2-blackout-jitter', [2, 1, 300, 285, 300, 270, 300], 'SLOW-IRREGULAR'],
  ['flaw2-blackout-midburst', [2, 2, 1, 3, 2, 2, 1, 3, 300, 600, 900, 600], 'SLOW-IRREGULAR'],
  ['flaw2-fastfloor-hang-run', [12, 12, 12, 12, 12, 200, 200, 200, 200], 'SLOW-IRREGULAR'],
  // --- Flaw 3 (mislabel): unbounded/thin POLITE claims → guarded ---
  ['flaw3-steady-250', [250, 250, 250, 250, 250, 250], 'SLOW-IRREGULAR'],
  ['flaw3-sparse-bimodal', [4, 220, 1900, 6, 280], 'LOW-DATA'],
  // --- LOW-DATA path ---
  ['low-data-all-idle', [1000], 'LOW-DATA'],
];

describe('hostHealthClassify.classifyHost — calibration fixtures', () => {
  test.each(FIXTURES)('%s -> %s', (_name, gaps, expected) => {
    expect(classifyHost(gaps).cls).toBe(expected);
  });

  test('all four live ground-truth hosts classify FAST (no false stall alarm)', () => {
    const gt = FIXTURES.filter(([n]) => n.startsWith('gt-'));
    for (const [, gaps] of gt) expect(classifyHost(gaps).cls).toBe('FAST');
  });

  test('backoff run is detected before idle-drop (order matters)', () => {
    // A consecutive run of in-band gaps trips SLOW-IRREGULAR even amid fast fetches.
    expect(classifyHost([2, 2, 300, 300, 300]).cls).toBe('SLOW-IRREGULAR');
    // The SAME gaps as isolated singletons (bracketed by fast) do NOT trip it.
    expect(classifyHost([2, 300, 2, 300, 2, 300, 2]).cls).not.toBe('SLOW-IRREGULAR');
  });

  test('diagnostics: droppedIdle counts session-idle gaps excluded', () => {
    const r = classifyHost([0, 69, 1400, 1, 6]); // guardian
    expect(r.droppedIdle).toBe(1); // the 1400 idle
    expect(r.activeCount).toBe(4);
  });
});

describe('helpers', () => {
  test('maxConsecutiveRun counts the longest satisfying run', () => {
    expect(maxConsecutiveRun([1, 5, 5, 1, 5, 5, 5], (g) => g === 5)).toBe(3);
    expect(maxConsecutiveRun([1, 2, 3], () => false)).toBe(0);
  });
  test('median handles even/odd', () => {
    expect(median([4, 6])).toBe(5);
    expect(median([1, 2, 3])).toBe(2);
  });
});
