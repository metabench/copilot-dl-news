'use strict';

const { buildTechTree, shortTitle } = require('../statusData');

const ROWS = [
  { id: 'RB-001', state: 'partial', question: 'Persist a knowledge graph?', status: 'Partially delivered. Remaining: a persisted graph consumer.' },
  { id: 'RB-002', state: 'done', question: 'Resumable refactor plans?', status: 'Delivered' },
  { id: 'RB-005', state: 'superseded', question: 'Journal cadence?', status: 'Superseded' },
  { id: 'RB-011', state: 'done', question: 'Probe-stamped knowledge: what format lets every durable claim carry its own re-verification command?', status: 'Closed' },
  { id: 'RB-015', state: 'blocked', question: 'Progress SVG v2 extras?', status: 'Delivered except hooks. Remaining: /progress skill + hook is owner-gated' },
  { id: 'RB-003', state: 'open', question: 'Which documentation diffing strategy keeps docs aligned?', status: 'Open' }
];
const ROADMAP = { prereqs: { 'RB-001': ['RB-011', 'RB-099'], 'RB-015': ['RB-011'] }, futureSlots: 2 };

describe('buildTechTree', () => {
  const tree = buildTechTree(ROWS, ROADMAP);

  it('maps states to tiers: done+superseded researched, open+partial available, blocked gated', () => {
    expect(tree.researched.map((n) => n.id).sort()).toEqual(['RB-002', 'RB-005', 'RB-011']);
    expect(tree.available.map((n) => n.id).sort()).toEqual(['RB-001', 'RB-003']);
    expect(tree.gated.map((n) => n.id)).toEqual(['RB-015']);
  });

  it('offers a partial row by its REMAINDER as the research text', () => {
    const rb1 = tree.available.find((n) => n.id === 'RB-001');
    expect(rb1.research).toBe('a persisted graph consumer.');
    const rb3 = tree.available.find((n) => n.id === 'RB-003');
    expect(rb3.research).toContain('documentation diffing');
  });

  it('keeps only prereq edges that point at RESEARCHED tech (no edges to phantom ids)', () => {
    expect(tree.available.find((n) => n.id === 'RB-001').buildsOn).toEqual(['RB-011']); // RB-099 dropped
  });

  it('renders fog of war: futureSlots placeholder nodes named Future Technology', () => {
    expect(tree.future).toHaveLength(2);
    expect(tree.future.every((n) => n.title === 'Future Technology')).toBe(true);
  });

  it('carries the gated reason so the lock explains itself', () => {
    expect(tree.gated[0].note).toContain('owner-gated');
  });

  it('defaults sanely with no roadmap at all', () => {
    const bare = buildTechTree(ROWS, null);
    expect(bare.future).toHaveLength(3);
    expect(bare.available.find((n) => n.id === 'RB-001').buildsOn).toEqual([]);
  });
});

describe('shortTitle', () => {
  it('cuts at the question mark and appends an ellipsis only when it truncated', () => {
    expect(shortTitle('Persist a graph? With extra prose after.')).toBe('Persist a graph…');
    expect(shortTitle('No question mark here')).toBe('No question mark here');
  });
});
