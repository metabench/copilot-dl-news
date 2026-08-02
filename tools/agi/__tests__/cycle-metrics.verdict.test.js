'use strict';

/**
 * The verdict's honesty guards (2026-08-02).
 *
 * Before this, deriveVerdict had exactly three inputs — cost_turns, second_order
 * and ncdb_debt — and every one of them is a field the agent types into its own
 * cycle stanza. A loop grading itself on its own self-report reported
 * COMPOUNDING for 40 cycles during which the crawler engine changed zero lines
 * and 26 pages were crawled. These tests exist so that cannot silently return.
 */

const { deriveVerdict, productOutcome } = require('../cycle-metrics.js');
const path = require('path');

const healthy = () => ({
  costTrend: { dir: 'falling', n: 10 },
  secondOrder: { rate: 0.9 },
  ncdbDebt: { delta: -5 },
  scaffold: { added: 2, retired: 2, net: 0 },
  haveStanzas: true
});

describe('deriveVerdict — the product gate', () => {
  test('COMPOUNDING requires the product to have actually moved', () => {
    const v = deriveVerdict({ ...healthy(), product: { measurable: true, lines: 500, since: '2026-07-01' } });
    expect(v.label).toBe('COMPOUNDING');
  });

  test('zero product churn vetoes COMPOUNDING however good the self-report is', () => {
    // Every self-reported signal here is maximally healthy: cost falling,
    // second-order rate 0.9, debt falling, scaffold balanced. The only thing
    // wrong is that nothing shipped — which is the whole point.
    const v = deriveVerdict({ ...healthy(), product: { measurable: true, lines: 0, since: '2026-07-01' } });
    expect(v.label).toBe('SELF-REFERENTIAL');
    expect(v.rationale).toMatch(/ZERO lines/);
  });

  test('fails OPEN when git cannot be read — absence of evidence is not evidence', () => {
    expect(deriveVerdict({ ...healthy(), product: { measurable: false } }).label).toBe('COMPOUNDING');
    expect(deriveVerdict(healthy()).label).toBe('COMPOUNDING');
  });
});

describe('deriveVerdict — scaffold accretion', () => {
  test('BLOATING fires at FLAT cost when the added:retired ratio is bad', () => {
    // The old rule required cost to be RISING, so the measured 4.5:1 accretion
    // across 120 cycles could never trip it.
    const v = deriveVerdict({
      ...healthy(),
      costTrend: { dir: 'flat', n: 10 },
      scaffold: { added: 365, retired: 81, net: 284 },
      product: { measurable: true, lines: 500, since: '2026-07-01' }
    });
    expect(v.label).toBe('BLOATING');
    expect(v.rationale).toMatch(/365:81/);
  });

  test('retiring nothing while adding is bloat, not neutral', () => {
    const v = deriveVerdict({
      ...healthy(),
      costTrend: { dir: 'flat', n: 10 },
      scaffold: { added: 24, retired: 0, net: 24 },
      product: { measurable: true, lines: 500, since: '2026-07-01' }
    });
    expect(v.label).toBe('BLOATING');
  });

  test('a small young window is NOT bloat — the floor stops a false positive', () => {
    // 2 added / 0 retired over a handful of cycles is normal early scaffolding.
    const v = deriveVerdict({
      ...healthy(),
      scaffold: { added: 2, retired: 0, net: 2 },
      product: { measurable: true, lines: 500, since: '2026-07-01' }
    });
    expect(v.label).toBe('COMPOUNDING');
  });

  test('a healthy prune ratio does not trip it', () => {
    const v = deriveVerdict({
      ...healthy(),
      scaffold: { added: 4, retired: 2, net: 2 },
      product: { measurable: true, lines: 500, since: '2026-07-01' }
    });
    expect(v.label).toBe('COMPOUNDING');
  });
});

describe('productOutcome — measured from git, not from the stanza', () => {
  const root = path.resolve(__dirname, '..', '..');

  test('reports lines changed under the product since the window opened', () => {
    const out = productOutcome([{ date: '2026-07-01' }, { date: '2026-07-15' }], root);
    expect(out.measurable).toBe(true);
    expect(out.since).toBe('2026-07-01'); // oldest date in the window
    expect(Number.isFinite(out.lines)).toBe(true);
  });

  test('is unmeasurable, not zero, when the window has no dates', () => {
    // Reporting 0 here would fabricate a SELF-REFERENTIAL verdict out of missing data.
    expect(productOutcome([{}, {}], root).measurable).toBe(false);
  });

  test('excludes generated output so committing a bundle cannot fake progress', () => {
    // Measured while building this: one commit of an esbuild bundle contributed
    // 5,694 of 5,922 "product" lines in the 20-cycle window.
    const src = require('fs').readFileSync(path.join(__dirname, '..', 'cycle-metrics.js'), 'utf8');
    for (const pat of ['dist', 'public', 'node_modules', '*.min.js', '*.bundle.js', '*-client.js', 'package-lock.json']) {
      expect([pat, src.includes(pat)]).toEqual([pat, true]);
    }
  });

  test('never counts the loop\'s own instrumentation as product', () => {
    const src = require('fs').readFileSync(path.join(__dirname, '..', 'cycle-metrics.js'), 'utf8');
    expect(src).toMatch(/:\(exclude\)src\/ui/);      // the status app is not product
    expect(src).not.toMatch(/PRODUCT_REPOS[\s\S]{0,400}tools\/agi/); // nor is the tooling
  });
});
