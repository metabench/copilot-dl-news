'use strict';

const { buildTechTree, shortTitle } = require('../statusData');

const ROWS = [
  { id: 'RB-001', state: 'partial', question: 'Persist a knowledge graph?', status: 'Partially delivered. Remaining: a persisted graph consumer.', lastUpdate: '2026-07-19' },
  { id: 'RB-011', state: 'done', question: 'Probe-stamped knowledge?', status: 'Closed', lastUpdate: '2026-07-27' },
  { id: 'RB-015', state: 'blocked', question: 'Progress SVG v2 extras?', status: 'Delivered except hooks. Remaining: /progress skill + hook is owner-gated', lastUpdate: '2026-07-27' },
  { id: 'RB-020', state: 'done', question: 'Researched after the tree existed?', status: 'Delivered', lastUpdate: '2026-08-02' },
  { id: 'RB-030', state: 'done', question: 'Done but never referenced by the spec?', status: 'Delivered', lastUpdate: '2026-07-19' }
];
const ROADMAP = { rootsCutoff: { date: '2026-07-27' } };
const SPEC = {
  branches: {
    agi: { label: 'AGI', color: '#4d9ec8', icon: 'iceBulb', tagline: 'cold light' },
    crawler: { label: 'CRAWLER', color: '#b8862e', icon: 'spiderWeb', tagline: 'the product' }
  },
  roots: [
    { id: 'AG-HARNESS', branch: 'agi', title: 'Live Browser Harness', note: 'real pages' },
    { id: 'CR-DB', branch: 'crawler', title: 'News Database', note: '30 GB' }
  ],
  techs: [
    { ref: 'RB-001', branch: 'agi', prereqs: ['CR-DB'] },
    { ref: 'RB-011', branch: 'agi', prereqs: [] },
    { ref: 'RB-015', branch: 'agi', prereqs: ['AG-HARNESS'] },
    { ref: 'RB-020', branch: 'crawler', prereqs: ['CR-DB', 'AG-HARNESS'] },
    { id: 'TECH-X', branch: 'crawler', title: 'Curated Thing', research: 'do the thing', prereqs: ['CR-DB'], state: 'available' }
  ],
  fogPerBranch: 2
};

describe('buildTechTree v3 (SMAC branches)', () => {
  const tree = buildTechTree(ROWS, ROADMAP, SPEC);
  const agi = tree.branches.find((b) => b.key === 'agi');
  const crawler = tree.branches.find((b) => b.key === 'crawler');

  it('groups roots, techs and fog by branch, carrying color/icon/tagline', () => {
    expect(tree.branches.map((b) => b.key)).toEqual(['agi', 'crawler']);
    expect(agi.color).toBe('#4d9ec8');
    expect(agi.roots.map((r) => r.id)).toEqual(['AG-HARNESS']);
    expect(agi.future).toHaveLength(2);
    expect(crawler.future[0].title).toBe('Future Technology');
  });

  it('reads RB state live: partial -> available (offered by its REMAINDER), blocked -> gated', () => {
    const rb1 = agi.available.find((n) => n.id === 'RB-001');
    expect(rb1.research).toBe('a persisted graph consumer.');
    expect(agi.gated.map((n) => n.id)).toEqual(['RB-015']);
    expect(agi.gated[0].note).toContain('owner-gated');
  });

  it('splits done rows on the cutoff: post-cutoff grows on the tree, pre-cutoff is absorbed', () => {
    expect(crawler.grown.map((n) => n.id)).toEqual(['RB-020']);
    expect(crawler.grown[0].researchedOn).toBe('2026-08-02');
    // RB-011 (cutoff day, strictly-after rule) + RB-030 (unreferenced done) absorbed
    expect(tree.absorbed).toBe(2);
    expect(agi.grown).toEqual([]);
  });

  it('resolves prereq edges with their SOURCE branch — the SMAC intertwine', () => {
    const rb20 = crawler.grown[0];
    expect(rb20.prereqs).toEqual([
      { id: 'CR-DB', branch: 'crawler' },
      { id: 'AG-HARNESS', branch: 'agi' }
    ]);
  });

  it('THROWS on a third prereq — SMAC caps at two', () => {
    const bad = { ...SPEC, techs: [{ id: 'T', branch: 'agi', title: 't', prereqs: ['CR-DB', 'AG-HARNESS', 'CR-DB'], state: 'available' }] };
    expect(() => buildTechTree(ROWS, ROADMAP, bad)).toThrow(/SMAC caps at two/);
  });

  it('THROWS on a phantom edge, an unknown branch, a bad ref, and a curated tech claiming completion', () => {
    const phantom = { ...SPEC, techs: [{ id: 'T', branch: 'agi', title: 't', prereqs: ['NOPE'], state: 'available' }] };
    expect(() => buildTechTree(ROWS, ROADMAP, phantom)).toThrow(/names no root or tech/);
    const badBranch = { ...SPEC, techs: [{ id: 'T', branch: 'ocean', title: 't', prereqs: [], state: 'available' }] };
    expect(() => buildTechTree(ROWS, ROADMAP, badBranch)).toThrow(/unknown branch/);
    const badRef = { ...SPEC, techs: [{ ref: 'RB-999', branch: 'agi', prereqs: [] }] };
    expect(() => buildTechTree(ROWS, ROADMAP, badRef)).toThrow(/real RB id/);
    // curated promotion (cycle 148): done is legal ONLY with a researchedOn date
    const datelessDone = { ...SPEC, techs: [{ id: 'T', branch: 'agi', title: 't', prereqs: [], state: 'done' }] };
    expect(() => buildTechTree(ROWS, ROADMAP, datelessDone)).toThrow(/never dateless/);
    const otherState = { ...SPEC, techs: [{ id: 'T', branch: 'agi', title: 't', prereqs: [], state: 'shipped' }] };
    expect(() => buildTechTree(ROWS, ROADMAP, otherState)).toThrow(/only be "available"/);
  });

  it('promotes a done+dated curated tech to GROWN — the hand-edit promotion path (cycle 148)', () => {
    const promoted = {
      ...SPEC,
      techs: [...SPEC.techs, { id: 'TECH-X2', branch: 'agi', title: 'Finished thing', research: 'was: do it', prereqs: ['AG-HARNESS'], state: 'done', researchedOn: '2026-07-28' }]
    };
    const t = buildTechTree(ROWS, ROADMAP, promoted);
    const agi2 = t.branches.find((b) => b.key === 'agi');
    const g = agi2.grown.find((n) => n.id === 'TECH-X2');
    expect(g).toBeTruthy();
    expect(g.researchedOn).toBe('2026-07-28');
    expect(agi2.available.map((n) => n.id)).not.toContain('TECH-X2');
  });

  it('THROWS on a missing/malformed spec rather than rendering a guess', () => {
    expect(() => buildTechTree(ROWS, ROADMAP, null)).toThrow(/tech-tree\.json missing/);
  });
});

describe('shortTitle', () => {
  it('cuts at the question mark and appends an ellipsis only when it truncated', () => {
    expect(shortTitle('Persist a graph? With extra prose after.')).toBe('Persist a graph…');
    expect(shortTitle('No question mark here')).toBe('No question mark here');
  });
});
