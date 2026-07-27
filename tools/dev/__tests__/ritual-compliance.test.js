'use strict';

const {
  newestStanza, parseConcurrencyDefault, evaluateCompliance, CONCURRENCY_CAP
} = require('../checks/ritual-compliance.check');

/** A fully-compliant state; each test perturbs exactly one field. */
const OK = {
  workingNewest: { id: 127, date: '2026-07-27' },
  headNewest: { id: 127, date: '2026-07-27' },
  dirtyRecordPaths: [],
  aheadCount: 0,
  activityWindowTo: '2026-07-27',
  concurrencyDefault: 3
};
const run = (over) => evaluateCompliance({ ...OK, ...over });
const idsOf = (r) => r.violations.map((v) => v.id);

describe('ritual-compliance', () => {
  it('passes when every ritual step and gate was honoured', () => {
    const r = run({});
    expect(r.violations).toEqual([]);
    expect(r.checks).toHaveLength(5);
  });

  it('A1 fires when the newest stanza is only in the working copy (row appended, not committed)', () => {
    expect(idsOf(run({ workingNewest: { id: 128, date: '2026-07-27' } }))).toContain('A1-record-committed');
  });

  it('A1 fires when the ledger has never been committed at all', () => {
    expect(idsOf(run({ headNewest: null, workingNewest: { id: 1, date: '2026-07-01' } }))).toContain('A1-record-committed');
  });

  it('A2 fires when the SVG was regenerated but left uncommitted', () => {
    const r = run({ dirtyRecordPaths: ['docs/agi/progress/progress.svg'] });
    expect(idsOf(r)).toContain('A2-record-clean');
    expect(r.violations.find((v) => v.id === 'A2-record-clean').detail).toContain('progress.svg');
  });

  it('A3 fires on unpushed commits, and is skipped (not failed) without a tracking ref', () => {
    expect(idsOf(run({ aheadCount: 2 }))).toContain('A3-pushed');
    expect(idsOf(run({ aheadCount: null }))).not.toContain('A3-pushed');
  });

  it('A4 fires when the snapshot predates the newest stanza — the closing cycle would be missing from the lanes', () => {
    expect(idsOf(run({ activityWindowTo: '2026-07-26' }))).toContain('A4-snapshot-current');
    expect(idsOf(run({ activityWindowTo: null }))).toContain('A4-snapshot-current');
    // a snapshot AHEAD of the stanza date is fine (git ran later in the day)
    expect(idsOf(run({ activityWindowTo: '2026-07-28' }))).not.toContain('A4-snapshot-current');
  });

  it('B1 fires when the gated concurrency default is raised without owner approval', () => {
    expect(idsOf(run({ concurrencyDefault: CONCURRENCY_CAP + 1 }))).toContain('B1-concurrency-gate');
    expect(idsOf(run({ concurrencyDefault: 1 }))).not.toContain('B1-concurrency-gate');
  });

  it('B1 fires when the declaration moved — an unreadable gate is an unenforced gate, not a pass', () => {
    expect(idsOf(run({ concurrencyDefault: null }))).toContain('B1-concurrency-gate');
  });

  it('parseConcurrencyDefault reads the real declaration shape and rejects a moved one', () => {
    expect(parseConcurrencyDefault("concurrency: { type: 'number', default: 3, processor: (v) => v }")).toBe(3);
    expect(parseConcurrencyDefault('concurrency: { type: "number",\n  default: 12 }')).toBe(12);
    expect(parseConcurrencyDefault('const concurrency = 3;')).toBeNull();
  });

  // Static tripwire (same pattern as resilience-wiring.check.js). The dirty-file
  // detection originally parsed `git status --porcelain` with slice(3); git() trims,
  // which eats the leading space of the FIRST line only, so exactly one record file
  // was silently reported clean — a false GREEN in a compliance check. The fix asks
  // git per path and tests emptiness. This guards against reintroducing the parse.
  it('does not positionally parse porcelain output (false-green defect guard)', () => {
    const raw = require('fs').readFileSync(require.resolve('../checks/ritual-compliance.check'), 'utf8');
    // Strip comments before matching. The first version of this tripwire matched the
    // comment that EXPLAINS the defect — documentation read as breakage, the same
    // false-positive class as the cycle-126 stanza placeholders. Check the code only.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain("git(['status', '--porcelain', '--', p])");
    expect(code).not.toMatch(/porcelain[\s\S]{0,200}slice\(3\)/);
  });

  it('newestStanza returns the highest-id stanza (parser sorts, ledger order is not trusted)', () => {
    const text = [
      '<!-- cycle:{"id":12,"date":"2026-07-03"} -->',
      '<!-- cycle:{"id":10,"date":"2026-07-01"} -->'
    ].join('\n');
    expect(newestStanza(text)).toMatchObject({ id: 12 });
    expect(newestStanza('no stanzas here')).toBeNull();
  });
});
