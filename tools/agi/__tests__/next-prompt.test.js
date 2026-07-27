'use strict';

const { parseOpenBacklog, collectMethod, buildPromptModel, render } = require('../next-prompt');

const BACKLOG = [
  '| id | question | priority | status | owner | last_update | links |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  '| RB-001 | A delivered thing | High | **Delivered** fully | Agents | 2026-07-19 | x |',
  '| RB-002 | An open thing | High | Open — generator unbuilt | Agents | 2026-07-27 | x |',
  '| RB-003 | Superseded thing | Low | Superseded — replaced | Agents | 2026-07-19 | x |',
  '| RB-004 | Partially done, v2 items open | Medium | v1 Delivered; v2 items open | Agents | 2026-07-27 | x |'
].join('\n');

const CYCLES = [
  { id: 10, date: '2026-07-01', result: 'first_thing_done', second_order: ['old-rule-one', 'shared-rule'] },
  { id: 11, date: '2026-07-02', result: 'second_thing', second_order: ['newer-rule', 'shared-rule'] },
  { id: 12, date: '2026-07-03', result: 'third-thing_shipped', second_order: ['newest-rule'] }
];

describe('next-prompt', () => {
  it('keeps open and partially-open backlog rows, drops delivered/superseded', () => {
    const open = parseOpenBacklog(BACKLOG);
    expect(open.map((o) => o.id)).toEqual(['RB-002', 'RB-004']);
  });

  it('collects METHOD newest-first, deduped, capped', () => {
    const m = collectMethod(CYCLES, 8, 3);
    // newest cycle first; 'shared-rule' appears once (from the newer cycle's pass)
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
    expect(text).toContain('[CURATE:'); // the tool must not pretend it chose the next step
    expect(text).toContain('RB-002');
    expect(text).not.toContain('RB-001'); // delivered items are not candidates
  });

  it('handles empty inputs without throwing', () => {
    const text = render(buildPromptModel({ cycles: [], status: null, backlogText: '' }));
    expect(text).toContain('none recorded');
  });
});
