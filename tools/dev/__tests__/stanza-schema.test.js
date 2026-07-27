'use strict';

const { validateStanza } = require('../checks/stanza-schema.check');

describe('stanza-schema validateStanza', () => {
  it('accepts a minimal stanza (early cycles predate most fields)', () => {
    expect(validateStanza({ id: 3, date: '2026-07-18' })).toEqual([]);
  });

  it('accepts a fully-populated modern stanza', () => {
    expect(validateStanza({
      id: 126, date: '2026-07-27', tracks: ['A'], cost_turns: 1.0,
      verified_improvements: 2, ncdb_debt: 241, pages_crawled: 0,
      defects: [{ caught_by: 'probe', preship: true }],
      second_order: ['x'], scaffold_added: [], scaffold_retired: [],
      verification: ['jest'], owed: [], owed_closed: [], reused: ['y'],
      extra_field_ok: 'lenient by design'
    })).toEqual([]);
  });

  it('rejects a string id — the real "73b" defect the probe caught on first run', () => {
    expect(validateStanza({ id: '73b', date: '2026-07-22' })).toContain('id must be a number');
  });

  it('accepts a fractional id (73.5 is how the addendum row was repaired)', () => {
    expect(validateStanza({ id: 73.5, date: '2026-07-22' })).toEqual([]);
  });

  it('rejects string defect entries — the real cycle-58 defect (a bare string silently counts as post-ship)', () => {
    expect(validateStanza({ id: 58, date: '2026-07-21', defects: ['slug-only'] }))
      .toContain('defects entries must be objects');
  });

  it('rejects non-boolean preship', () => {
    expect(validateStanza({ id: 1, date: '2026-07-01', defects: [{ caught_by: 'x', preship: 'yes' }] }))
      .toContain('defects[].preship must be boolean');
  });

  it('rejects a malformed date', () => {
    expect(validateStanza({ id: 1, date: '07/01/2026' })).toContain('date must be YYYY-MM-DD');
    expect(validateStanza({ id: 1 })).toContain('date must be YYYY-MM-DD');
  });

  it('type-checks the prose fields (headline feeds next-prompt PROGRESS lines)', () => {
    expect(validateStanza({ id: 1, date: '2026-07-01', headline: 'A readable sentence' })).toEqual([]);
    expect(validateStanza({ id: 1, date: '2026-07-01', headline: 42 })).toContain('headline must be a string');
    expect(validateStanza({ id: 1, date: '2026-07-01', result: ['a'] })).toContain('result must be a string');
  });

  it('type-checks numeric and string-array optionals when present', () => {
    expect(validateStanza({ id: 1, date: '2026-07-01', cost_turns: 'one' }))
      .toContain('cost_turns must be a number');
    expect(validateStanza({ id: 1, date: '2026-07-01', second_order: [1] }))
      .toContain('second_order must be an array of strings');
    expect(validateStanza({ id: 1, date: '2026-07-01', owed: 'not-an-array' }))
      .toContain('owed must be an array of strings');
  });
});
