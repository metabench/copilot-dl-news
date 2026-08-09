'use strict';

const fs = require('fs');
const path = require('path');
const { evaluatePredicate, classify, buildContext } = require('../tech-state');

const ctx = {
  probeIds: new Set(['crawl-console-live', 'ncdb-debt-ratchet']),
  readFile: (p) => (p === 'has.js' ? 'contains the needle here' : null),
  exists: (p) => p === 'present/dir',
  ratchetCeiling: (id) => (id === 'ncdb-debt-ratchet' ? 106 : null)
};

describe('evaluatePredicate', () => {
  test('probe: registered means met', () => {
    expect(evaluatePredicate({ probe: 'crawl-console-live' }, ctx).met).toBe(true);
    expect(evaluatePredicate({ probe: 'nope' }, ctx).met).toBe(false);
  });

  test('exists: present means met, absent is a legitimate answer not an error', () => {
    expect(evaluatePredicate({ exists: 'present/dir' }, ctx).met).toBe(true);
    expect(() => evaluatePredicate({ exists: 'gone' }, ctx)).not.toThrow();
    expect(evaluatePredicate({ exists: 'gone' }, ctx).met).toBe(false);
  });

  test('contains: needs both the file and the text', () => {
    expect(evaluatePredicate({ contains: 'has.js', text: 'needle' }, ctx).met).toBe(true);
    expect(evaluatePredicate({ contains: 'has.js', text: 'absent' }, ctx).met).toBe(false);
    expect(evaluatePredicate({ contains: 'missing.js', text: 'needle' }, ctx).met).toBe(false);
  });

  test('ratchet: met when the ceiling is at or below the target', () => {
    expect(evaluatePredicate({ ratchet: 'ncdb-debt-ratchet', atMost: 106 }, ctx).met).toBe(true);
    expect(evaluatePredicate({ ratchet: 'ncdb-debt-ratchet', atMost: 100 }, ctx).met).toBe(false);
    expect(evaluatePredicate({ ratchet: 'absent', atMost: 1 }, ctx).met).toBe(false);
  });

  test('a MALFORMED predicate throws — that is an authoring error, not a state', () => {
    expect(() => evaluatePredicate({ nonsense: 1 }, ctx)).toThrow(/unrecognised doneWhen/);
    expect(() => evaluatePredicate({ ratchet: 'x' }, ctx)).toThrow(/numeric atMost/);
    expect(() => evaluatePredicate({ contains: 'has.js' }, ctx)).toThrow(/needs a text/);
    expect(() => evaluatePredicate(null, ctx)).toThrow(/must be an object/);
  });
});

describe('classify', () => {
  test('agreement between evidence and typed state is verified, either way', () => {
    const rows = classify([
      { id: 'A', state: 'done', doneWhen: { exists: 'present/dir' } },
      { id: 'B', state: 'available', doneWhen: { exists: 'gone' } }
    ], ctx);
    expect(rows[0].verdict).toBe('verified-done');
    expect(rows[1].verdict).toBe('verified-pending');
  });

  test('DISAGREEMENT is a contradiction, reported not resolved', () => {
    const rows = classify([{ id: 'C', state: 'available', doneWhen: { exists: 'present/dir' } }], ctx);
    expect(rows[0].verdict).toBe('CONTRADICTION');
    expect(rows[0].derived).toBe('done');
  });

  test('a node WITHOUT a predicate is unverified, never assumed', () => {
    // Deliberate: TECH-HEADLINE2 completed as a measured crawl outcome with no
    // file-shaped evidence. Forcing a predicate would mean inventing one.
    const rows = classify([{ id: 'D', state: 'done' }], ctx);
    expect(rows[0].verdict).toBe('unverified');
  });

  test('RB-backed nodes are skipped — their state is already derived elsewhere', () => {
    expect(classify([{ ref: 'RB-001' }], ctx)).toEqual([]);
  });
});

describe('the real tech tree — acceptance test against answers already known', () => {
  // The non-negotiable test: the evaluator must AGREE with every node whose
  // state was already settled by hand. If it cannot reproduce those, none of
  // its other verdicts are worth reading.
  const spec = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '..', '..', '..', 'config', 'tech-tree.json'), 'utf8'));
  const rows = classify(spec.techs, buildContext());

  test('NO node contradicts its hand-set state', () => {
    const bad = rows.filter((r) => r.verdict === 'CONTRADICTION');
    expect(bad.map((r) => `${r.id}: typed ${r.typed}, evidence ${r.derived}`)).toEqual([]);
  });

  test('every done node carrying a predicate verifies as done', () => {
    const done = rows.filter((r) => r.typed === 'done' && r.evidence);
    expect(done.length).toBeGreaterThan(0);
    for (const r of done) expect(r.verdict).toBe('verified-done');
  });

  test('at least one predicate reads FALSE — otherwise they are tautologies', () => {
    // A suite of predicates that all pass proves nothing. TECH-GATEGUARD's
    // probe does not exist, and the evaluator must say so.
    const pending = rows.filter((r) => r.verdict === 'verified-pending');
    expect(pending.length).toBeGreaterThan(0);
  });

  test('unverified nodes are counted, not hidden', () => {
    const unverified = rows.filter((r) => r.verdict === 'unverified');
    expect(unverified.length).toBeGreaterThan(0);
    for (const r of unverified) expect(r.evidence).toBeNull();
  });
});
