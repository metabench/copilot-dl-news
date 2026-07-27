'use strict';

const {
  humanize, parseBacklog, remainderOf, backlogCandidates,
  collectMethod, buildPromptModel, render
} = require('../next-prompt');

const BACKLOG = [
  '| id | state | question | priority | status | owner | last_update | links |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  '| RB-001 | done | A delivered thing | High | **Delivered** fully | Agents | 2026-07-19 | x |',
  '| RB-002 | open | An open thing | High | Open — generator unbuilt | Agents | 2026-07-27 | x |',
  '| RB-003 | superseded | Superseded thing | Low | Superseded — replaced | Agents | 2026-07-19 | x |',
  '| RB-004 | partial | Can we do the big thing? | Medium | **Answered** — v1 shipped. Remaining: the nightly automation | Agents | 2026-07-27 | x |',
  '| RB-005 | blocked | Owner-gated thing | Low | Delivered except the gated part. Remaining: owner must approve hooks | Agents | 2026-07-27 | x |',
  '| RB-006 | partial | Partial with no remainder stated | Low | **Delivered** mostly | Agents | 2026-07-27 | x |'
].join('\n');

const CYCLES = [
  { id: 10, date: '2026-07-01', result: 'first_thing_done', second_order: ['old-rule-one', 'shared-rule'] },
  { id: 11, date: '2026-07-02', result: 'second_thing', second_order: ['newer-rule', 'shared-rule'] },
  { id: 12, date: '2026-07-03', result: 'third-thing_shipped', second_order: ['newest-rule'] }
];

describe('next-prompt', () => {
  describe('backlog state field (replaces the v1 status-prose heuristic)', () => {
    it('offers only actionable rows: open + partial, never done/superseded/blocked', () => {
      expect(backlogCandidates(BACKLOG).map((o) => o.id)).toEqual(['RB-002', 'RB-004', 'RB-006']);
    });

    it('offers a partial row by its REMAINDER, not its answered question', () => {
      const rb4 = backlogCandidates(BACKLOG).find((o) => o.id === 'RB-004');
      expect(rb4.text).toBe('the nightly automation');
      expect(rb4.isRemainder).toBe(true);
      // the exact v1 defect: an answered row re-offered as if untouched
      expect(rb4.text).not.toContain('Can we do the big thing?');
    });

    it('flags a partial row that never says what is left, instead of quietly re-asking', () => {
      const rb6 = backlogCandidates(BACKLOG).find((o) => o.id === 'RB-006');
      expect(rb6.needsRemainder).toBe(true);
      expect(render(buildPromptModel({ cycles: CYCLES, status: null, backlogText: BACKLOG })))
        .toContain('PARTIAL row with no "Remaining:" clause');
    });

    it('THROWS on an unknown or missing state rather than defaulting to actionable', () => {
      const bad = '| RB-009 | inprogress | q | High | s | Agents | 2026-07-27 | x |';
      expect(() => parseBacklog(bad)).toThrow(/unknown backlog state "inprogress"/);
      expect(() => parseBacklog('| RB-009 |  | q | High | s | Agents | 2026-07-27 | x |')).toThrow(/unknown backlog state/);
    });

    it('remainderOf extracts the clause, or null when absent', () => {
      expect(remainderOf('Delivered. Remaining:  broaden the manifest  ')).toBe('broaden the manifest');
      expect(remainderOf('Delivered.')).toBeNull();
    });
  });

  describe('humanize', () => {
    it('keeps identifiers intact instead of flattening them into words', () => {
      expect(humanize('RB_008_ANSWERED_first_compliance_metatest')).toBe('RB-008 ANSWERED first compliance metatest');
      expect(humanize('repo-activity-lanes-shipped-in-c127')).toBe('repo activity lanes shipped in c127');
    });

    it('still separates ordinary slugs and tolerates empties', () => {
      expect(humanize('third-thing_shipped')).toBe('third thing shipped');
      expect(humanize('')).toBe('');
      expect(humanize(null)).toBe('');
    });
  });

  it('prefers a stanza headline over the slug for PROGRESS lines', () => {
    const withHeadline = CYCLES.concat([{ id: 13, date: '2026-07-04', result: 'x_y', headline: 'Made the prompt trustworthy' }]);
    const model = buildPromptModel({ cycles: withHeadline, status: null, backlogText: BACKLOG });
    expect(model.done[model.done.length - 1].label).toBe('Made the prompt trustworthy');
    // blank headline must not win over the slug
    const blank = CYCLES.concat([{ id: 14, date: '2026-07-05', result: 'a_b', headline: '   ' }]);
    expect(buildPromptModel({ cycles: blank, status: null, backlogText: BACKLOG }).done.slice(-1)[0].label).toBe('a b');
  });

  it('collects METHOD newest-first, deduped, capped', () => {
    const m = collectMethod(CYCLES, 8, 3);
    expect(m[0]).toBe('newest rule');
    expect(m).toContain('shared rule');
    expect(m.filter((x) => x === 'shared rule').length).toBe(1);
    expect(m.length).toBeLessThanOrEqual(3);
  });

  it('builds a model with humanized done lines and passthrough owed/decisions', () => {
    const model = buildPromptModel({
      cycles: CYCLES,
      status: { sideQuests: [{ label: 'pay debt', cycle: 11 }], playerInput: ['decide X'] },
      backlogText: BACKLOG
    });
    expect(model.nextAfter).toBe(12);
    expect(model.done[model.done.length - 1].label).toBe('third thing shipped');
    expect(model.owed[0].label).toBe('pay debt');
    expect(model.decisions).toEqual(['decide X']);
  });

  it('renders every grammar section and marks curation honestly', () => {
    const text = render(buildPromptModel({ cycles: CYCLES, status: { sideQuests: [], playerInput: ['decide X'] }, backlogText: BACKLOG }));
    for (const section of ['REFERENCE', 'ORIENT', 'PROGRESS', 'OWNER DECISIONS STANDING', 'METHOD (earned', 'GATED', 'ON COMPLETION']) {
      expect(text).toContain(section);
    }
    expect(text).toContain('[CURATE:');
    expect(text).toContain('RB-002');
    expect(text).not.toContain('RB-001'); // done
    expect(text).not.toContain('RB-005'); // blocked on the owner, not an agent candidate
  });

  it('handles empty inputs without throwing', () => {
    const text = render(buildPromptModel({ cycles: [], status: null, backlogText: '' }));
    expect(text).toContain('none recorded');
  });
});
