'use strict';

const {
  newestStanza, parseConcurrencyDefault, evaluateCompliance, gatherSurfaces,
  CONCURRENCY_CAP, UNVERIFIABLE
} = require('../checks/ritual-compliance.check');

/** A fully-compliant state; each test perturbs exactly one field. */
const OK = {
  workingNewest: { id: 127, date: '2026-07-27' },
  headNewest: { id: 127, date: '2026-07-27' },
  dirtyRecordPaths: [],
  aheadCount: 0,
  activityWindowTo: '2026-07-27',
  concurrencyDefault: 3,
  gated: { skills: ['singularity', 'wlilo'] },
  surfaces: { hooks: [], skills: ['singularity', 'wlilo'], missingBackups: [], politeness: [] },
  stanzasWithoutVerification: []
};
const run = (over) => evaluateCompliance({ ...OK, ...over });
const idsOf = (r) => r.violations.map((v) => v.id);

describe('ritual-compliance', () => {
  it('passes when every ritual step and gate was honoured', () => {
    const r = run({});
    expect(r.violations).toEqual([]);
    expect(r.checks).toHaveLength(10); // A1-A4, B1, C1-C5
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

  describe('C. standing gates that bind during a turn (RB-008 remainder)', () => {
    it('C1 fires on a hook declared in settings OR dropped in .claude/hooks', () => {
      expect(idsOf(run({ surfaces: { ...OK.surfaces, hooks: ['settings.json:hooks'] } }))).toContain('C1-no-hooks-installed');
      expect(idsOf(run({ surfaces: { ...OK.surfaces, hooks: ['hooks/pre-commit.sh'] } }))).toContain('C1-no-hooks-installed');
    });

    it('C2 fires on a skill added OR removed relative to the approved baseline', () => {
      const added = run({ surfaces: { ...OK.surfaces, skills: ['singularity', 'wlilo', 'sneaky-new'] } });
      expect(idsOf(added)).toContain('C2-skills-baseline');
      expect(added.violations.find((v) => v.id === 'C2-skills-baseline').detail).toContain('sneaky-new');
      expect(idsOf(run({ surfaces: { ...OK.surfaces, skills: ['singularity'] } }))).toContain('C2-skills-baseline');
    });

    it('C3 fires when a gated backup has vanished', () => {
      const r = run({ surfaces: { ...OK.surfaces, missingBackups: ['data/news.db.predup-bak'] } });
      expect(idsOf(r)).toContain('C3-backups-intact');
      expect(r.violations.find((v) => v.id === 'C3-backups-intact').fix).toMatch(/GATED and irreversible/);
    });

    it('C4 fires when 429 backoff escalation is weakened, and when the file is unreadable', () => {
      expect(idsOf(run({ surfaces: { ...OK.surfaces, politeness: ['err429Streak >= 3'] } }))).toContain('C4-politeness-backoff');
      // unreadable gate must FAIL, not silently pass (the c128 rule)
      expect(idsOf(run({ surfaces: { ...OK.surfaces, politeness: null } }))).toContain('C4-politeness-backoff');
    });

    it('C5 fires when a cycle claims work but records no verification', () => {
      const r = run({ stanzasWithoutVerification: ['c131'] });
      expect(idsOf(r)).toContain('C5-verification-recorded');
      expect(r.violations.find((v) => v.id === 'C5-verification-recorded').detail).toContain('c131');
    });

    it('names the directives it cannot check, so green never implies full coverage', () => {
      expect(UNVERIFIABLE.map((u) => u.id)).toEqual(
        expect.arrayContaining(['next-prompt-regen', 'boot-md-read', 'live-db-writes'])
      );
      for (const u of UNVERIFIABLE) expect(typeof u.why).toBe('string');
    });
  });

  describe('gatherSurfaces (reads the real tree)', () => {
    it('detects a required backup that is absent', () => {
      const s = gatherSurfaces({ backups: { mustExist: ['data/definitely-not-here.bak'] } });
      expect(s.missingBackups).toEqual(['data/definitely-not-here.bak']);
    });

    it('reports a required politeness pattern that is not in the real file', () => {
      // Path follows the cycle-179 extraction — and now doubles as proof the
      // gate check reads ACROSS the repo boundary (path.join handles ..).
      const s = gatherSurfaces({
        politeness: { file: '../news-crawler-itself/src/politeness/DomainThrottleManager.js', requiredPatterns: ['err429Streak >= 2', 'NOT_A_REAL_TOKEN'] }
      });
      expect(s.politeness).toEqual(['NOT_A_REAL_TOKEN']); // the real one matched; the fake did not
    });

    it('returns null politeness (gate unenforced) when the file cannot be read', () => {
      expect(gatherSurfaces({ politeness: { file: 'nope/missing.js', requiredPatterns: ['x'] } }).politeness).toBeNull();
    });

    it('lists the real installed skills as directories', () => {
      const s = gatherSurfaces({});
      expect(Array.isArray(s.skills)).toBe(true);
      expect(s.skills).toContain('singularity');
    });
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
