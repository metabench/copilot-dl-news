'use strict';

const { buildTechTree, shortTitle } = require('../statusData');

const ROWS = [
  { id: 'RB-001', state: 'partial', question: 'Persist a knowledge graph?', status: 'Partially delivered. Remaining: a persisted graph consumer.', lastUpdate: '2026-07-19' },
  { id: 'RB-002', state: 'done', question: 'Resumable refactor plans?', status: 'Delivered', lastUpdate: '2026-07-19' },
  { id: 'RB-005', state: 'superseded', question: 'Journal cadence?', status: 'Superseded', lastUpdate: '2026-07-19' },
  { id: 'RB-011', state: 'done', question: 'Probe-stamped knowledge: what format lets every durable claim carry its own re-verification command?', status: 'Closed', lastUpdate: '2026-07-27' },
  { id: 'RB-015', state: 'blocked', question: 'Progress SVG v2 extras?', status: 'Delivered except hooks. Remaining: /progress skill + hook is owner-gated', lastUpdate: '2026-07-27' },
  { id: 'RB-003', state: 'open', question: 'Which documentation diffing strategy keeps docs aligned?', status: 'Open', lastUpdate: '2026-07-19' },
  { id: 'RB-020', state: 'done', question: 'A tech researched after the tree existed?', status: 'Delivered', lastUpdate: '2026-08-02' }
];
const ROADMAP = {
  rootsCutoff: { date: '2026-07-27' },
  prereqs: { 'RB-001': ['RB-011', 'RB-099'], 'RB-020': ['RB-011'] },
  futureSlots: 2
};

describe('buildTechTree (roots vs grown, owner directive 2026-07-27)', () => {
  const tree = buildTechTree(ROWS, ROADMAP);

  it('collapses tech completed at/before the cutoff into an undisplayed roots COUNT', () => {
    // RB-002, RB-005, RB-011 (2026-07-27 = cutoff day, strictly-after rule) are roots
    expect(tree.roots).toEqual({ count: 3 });
    expect(tree.grown.map((n) => n.id)).not.toContain('RB-011');
  });

  it('displays only research completed AFTER the tree existed as grown nodes', () => {
    expect(tree.grown.map((n) => n.id)).toEqual(['RB-020']);
    expect(tree.grown[0].researchedOn).toBe('2026-08-02');
    expect(tree.grown[0].buildsOn).toEqual(['RB-011']); // phantom RB-099 dropped
  });

  it('a done row with no usable last_update stays a root — never promoted by accident', () => {
    const t = buildTechTree([{ id: 'RB-030', state: 'done', question: 'q', status: 's', lastUpdate: 'soonish' }], ROADMAP);
    expect(t.roots.count).toBe(1);
    expect(t.grown).toEqual([]);
  });

  it('with no cutoff configured everything done is a root (tree starts bare, never guesses)', () => {
    const t = buildTechTree(ROWS, { futureSlots: 1 });
    expect(t.roots.count).toBe(4);
    expect(t.grown).toEqual([]);
  });

  it('maps the frontier unchanged: open+partial available, blocked gated', () => {
    expect(tree.available.map((n) => n.id).sort()).toEqual(['RB-001', 'RB-003']);
    expect(tree.gated.map((n) => n.id)).toEqual(['RB-015']);
  });

  it('offers a partial row by its REMAINDER as the research text', () => {
    expect(tree.available.find((n) => n.id === 'RB-001').research).toBe('a persisted graph consumer.');
  });

  it('renders fog of war: futureSlots placeholder nodes named Future Technology', () => {
    expect(tree.future).toHaveLength(2);
    expect(tree.future.every((n) => n.title === 'Future Technology')).toBe(true);
  });

  it('carries the gated reason so the lock explains itself', () => {
    expect(tree.gated[0].note).toContain('owner-gated');
  });
});

describe('shortTitle', () => {
  it('cuts at the question mark and appends an ellipsis only when it truncated', () => {
    expect(shortTitle('Persist a graph? With extra prose after.')).toBe('Persist a graph…');
    expect(shortTitle('No question mark here')).toBe('No question mark here');
  });
});
