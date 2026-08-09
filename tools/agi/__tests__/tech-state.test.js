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

  test('ratchet reads BOTH flags — this repo uses --max and --ceiling', () => {
    // ncdb-debt-scan takes --max; engine-debt and ui-debt take --ceiling.
    // Reading only one silently reported "ratchet not found" for half the guards.
    const { buildContext } = require('../tech-state');
    const real = buildContext();
    expect(real.ratchetCeiling('ncdb-debt-ratchet')).toBeGreaterThan(0);   // --max
    expect(real.ratchetCeiling('engine-debt-ratchet')).toBeGreaterThan(0); // --ceiling
  });

  test('nodeField: met when any node carries the field', () => {
    const c = { ...ctx, nodesWithField: (f) => (f === 'flavor' ? 3 : 0) };
    expect(evaluatePredicate({ nodeField: 'flavor' }, c).met).toBe(true);
    expect(evaluatePredicate({ nodeField: 'edgeVerb' }, c).met).toBe(false);
  });

  test('nodeField exists to avoid a SELF-REFERENTIAL contains predicate', () => {
    // The trap: `{contains: 'config/tech-tree.json', text: '"flavor"'}` is
    // itself stored in tech-tree.json, so the file gains the needle the moment
    // the check is written. It reads false today only because JSON escapes the
    // quotes — correct by accident. nodeField inspects parsed nodes instead, so
    // writing the predicate cannot satisfy it.
    const spec = { techs: [{ id: 'A', doneWhen: { nodeField: 'flavor' } }] };
    const nodesWithField = (f) => spec.techs.filter((t) => t[f] !== undefined).length;
    expect(evaluatePredicate({ nodeField: 'flavor' }, { ...ctx, nodesWithField }).met).toBe(false);
  });

  describe('reviewOf — reviews recur, `done` does not', () => {
    const dated = (record, subject) => ({
      ...ctx,
      exists: (p) => p === 'rec.md',
      lastCommit: (p) => (p === 'rec.md' ? record : subject)
    });

    test('a review never written is NOT met', () => {
      const r = evaluatePredicate({ record: 'missing.md', reviewOf: 'src/x' }, ctx);
      expect(r.met).toBe(false);
      expect(r.evidence).toMatch(/never recorded/);
    });

    test('a review NEWER than its subject is current', () => {
      const r = evaluatePredicate({ record: 'rec.md', reviewOf: 'src/x' },
        dated('2026-08-07T00:00:00Z', '2026-08-01T00:00:00Z'));
      expect(r.met).toBe(true);
      expect(r.stale).toBe(false);
      expect(r.evidence).toMatch(/current as of/);
    });

    test('a review OLDER than its subject is met but STALE', () => {
      // The whole point: the review happened, and the thing it reviewed has
      // moved on. `done` cannot express that; this can.
      const r = evaluatePredicate({ record: 'rec.md', reviewOf: 'src/x' },
        dated('2026-08-01T00:00:00Z', '2026-08-07T00:00:00Z'));
      expect(r.met).toBe(true);
      expect(r.stale).toBe(true);
      expect(r.evidence).toMatch(/STALE/);
    });

    test('staleness does NOT make it a contradiction — it is information', () => {
      // A repo under active development would otherwise be permanently red.
      const rows = classify(
        [{ id: 'R', state: 'done', doneWhen: { record: 'rec.md', reviewOf: 'src/x' } }],
        dated('2026-08-01T00:00:00Z', '2026-08-07T00:00:00Z')
      );
      expect(rows[0].verdict).toBe('verified-done');
      expect(rows[0].stale).toBe(true);
    });

    test('missing git dates report unavailable rather than claiming currency', () => {
      const r = evaluatePredicate({ record: 'rec.md', reviewOf: 'src/x' },
        { ...ctx, exists: () => true, lastCommit: () => null });
      expect(r.met).toBe(true);
      expect(r.stale).toBeUndefined();
      expect(r.evidence).toMatch(/dates unavailable/);
    });

    test('a reviewOf without a record path throws', () => {
      expect(() => evaluatePredicate({ reviewOf: 'src/x' }, ctx)).toThrow(/needs a record path/);
    });
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

  test('TECH-CSLIVE was mislabelled and the evidence corrected it', () => {
    // The mechanism's first real catch: typed `available` while
    // news-crawler-ui/checks/console.live.check.js — its own deliverable, the
    // live harness for the crawler UI — had shipped on 2026-08-03. Promoted
    // after reading the file, not after trusting the predicate.
    const cs = rows.find((r) => r.id === 'TECH-CSLIVE');
    expect(cs.verdict).toBe('verified-done');
  });

  test('NO predicate in the real tree is self-referential', () => {
    // A `contains` predicate pointed at config/tech-tree.json would be stored
    // in the file it searches. Two were, briefly; both are nodeField now.
    const spec = JSON.parse(fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'config', 'tech-tree.json'), 'utf8'));
    const selfRef = (spec.techs || []).filter(
      (t) => t.doneWhen && t.doneWhen.contains === 'config/tech-tree.json');
    expect(selfRef.map((t) => t.id)).toEqual([]);
  });
});
