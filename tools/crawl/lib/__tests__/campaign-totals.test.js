'use strict';

const { rollupTotals } = require('../campaign-totals');

describe('campaign rollupTotals', () => {
  test('empty / non-array yields a zeroed summary', () => {
    expect(rollupTotals([])).toEqual({
      legsRun: 0, legsSkipped: 0, downloaded: 0, saved: 0, found: 0, errors: 0, bytesDownloaded: 0, mbDownloaded: 0
    });
    expect(rollupTotals(null).legsRun).toBe(0);
  });

  test('sums page counts across run legs and counts skips separately', () => {
    const legs = [
      { report: { downloaded: 20, saved: 15, found: 40, errors: 1, bytesDownloaded: 5_000_000 } },
      { report: { skipped: true, reason: 'preflight:blocked' } },
      { report: { downloaded: 30, saved: 22, found: 55, errors: 2, bytesDownloaded: 8_000_000 } }
    ];
    const t = rollupTotals(legs);
    expect(t.legsRun).toBe(2);
    expect(t.legsSkipped).toBe(1);
    expect(t.downloaded).toBe(50);
    expect(t.saved).toBe(37);
    expect(t.errors).toBe(3);
    expect(t.mbDownloaded).toBe(13); // 13,000,000 bytes
  });

  test('tolerates missing fields and raw/parse-failed reports (run-but-zero)', () => {
    const legs = [
      { report: { raw: 'some non-JSON tail' } }, // parse-failed: counts as a run, zero pages
      { report: { downloaded: 5 } },             // partial fields
      { /* no report at all */ }                 // in-flight leg: skipped entirely
    ];
    const t = rollupTotals(legs);
    expect(t.legsRun).toBe(2);
    expect(t.downloaded).toBe(5);
    expect(t.bytesDownloaded).toBe(0);
  });
});
