'use strict';

const { collectGraph, assignDepths, renderTreeSvg } = require('../techPages');

const BRANCHES = [
  { key: 'agi', color: '#4d9ec8' },
  { key: 'factory', color: '#a678c8' }
];
const B = {
  key: 'factory', label: 'TOOL FACTORY',
  roots: [{ id: 'TF-A', title: 'Root A' }, { id: 'TF-B', title: 'Root B' }],
  grown: [],
  available: [
    { id: 'T1', title: 'First tech', prereqs: [{ id: 'TF-A', branch: 'factory' }, { id: 'AG-X', branch: 'agi' }] },
    { id: 'T2', title: 'Depends on a tech', prereqs: [{ id: 'T1', branch: 'factory' }] }
  ],
  gated: [],
  future: [{ id: 'f-1', title: 'Future Technology' }]
};

describe('drawn tree view (owner 2026-07-28: display as an actual tree)', () => {
  it('collects roots, techs, FOREIGN prereqs as layer-0 nodes, and fog', () => {
    const { nodes, edges } = collectGraph(B);
    const kinds = Object.fromEntries(nodes.map((n) => [n.id, n.kind]));
    expect(kinds['TF-A']).toBe('root');
    expect(kinds['AG-X']).toBe('foreign'); // another branch's tech, drawn dashed
    expect(kinds['T2']).toBe('avail');
    expect(kinds['f-1']).toBe('fog');
    expect(edges).toContainEqual({ from: 'T1', to: 'T2', branch: 'factory' });
  });

  it('layers by prereq depth: foundations 0, tech-on-tech one layer deeper, fog beyond all', () => {
    const { nodes, edges } = collectGraph(B);
    const d = assignDepths(nodes, edges);
    expect(d.get('TF-A')).toBe(0);
    expect(d.get('AG-X')).toBe(0);
    expect(d.get('T1')).toBe(1);
    expect(d.get('T2')).toBe(2);
    expect(d.get('f-1')).toBe(3);
  });

  it('never loses a node to a cycle — the guard parks it rather than dropping it', () => {
    const nodes = [{ id: 'X', kind: 'avail' }, { id: 'Y', kind: 'avail' }];
    const edges = [{ from: 'X', to: 'Y' }, { from: 'Y', to: 'X' }];
    const d = assignDepths(nodes, edges);
    expect(d.has('X')).toBe(true);
    expect(d.has('Y')).toBe(true);
  });

  it('renders an SVG with edges (paths), all node ids, and no NaN coordinates', () => {
    const svg = renderTreeSvg(B, BRANCHES);
    expect(svg).toContain('<path d="M');
    for (const id of ['TF-A', 'TF-B', 'T1', 'T2']) expect(svg).toContain(id);
    expect(svg).toContain('Future Technology');
    expect(svg).not.toContain('NaN');
    // foreign nodes dashed, edges colored by source branch (the intertwine)
    expect(svg).toContain('stroke-dasharray="3,2"');
    expect(svg).toContain('stroke="#4d9ec8"');
  });
});
