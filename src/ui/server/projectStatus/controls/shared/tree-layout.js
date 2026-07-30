'use strict';

/**
 * shared/tree-layout — the research tree's node index and its layered layout.
 *
 * Pure geometry over the status payload's techTree. Tree_View uses the index to
 * answer "what is node X?"; Tech_Tree_Board uses the layout to place the SVG
 * controls. Kept out of both so the arithmetic is testable without a framework.
 */

function buildNodeIndexFromTree(tree) {
  const index = {};
  for (const b of ((tree && tree.branches) || [])) {
    const at = (list, kind) => {
      for (const n of list) index[n.id] = { ...n, kind, branch: b.key, branchLabel: b.label, color: b.color };
    };
    at(b.roots, 'root');
    at(b.grown, 'grown');
    at(b.available, 'avail');
    at(b.gated, 'gated');
    at(b.future, 'fog');
  }
  return index;
}

// Board metrics. The board is SSR'd; structural changes arrive as a fresh page
// (rare: promotions), which Live_Strip detects by comparing the node sets.
const TB = { nodeW: 176, nodeH: 30, colGap: 30, rowGap: 8, bandHead: 24, bandGap: 20, pad: 12 };

function belongsTo(b, id) {
  return b.roots.some((r) => r.id === id) || b.grown.concat(b.available, b.gated).some((t) => t.id === id);
}

function shortLabel(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function treeBoardModel(tree) {
  const bands = [];
  const nodes = [];
  const edges = [];
  let y = TB.pad;
  let maxCols = 0;
  for (const b of ((tree && tree.branches) || [])) {
    const techs = [
      ...b.grown.map((n) => ({ ...n, kind: 'grown' })),
      ...b.available.map((n) => ({ ...n, kind: 'avail' })),
      ...b.gated.map((n) => ({ ...n, kind: 'gated' }))
    ];
    const techIds = new Set(techs.map((t) => t.id));
    // depth: 1 + max depth of same-branch TECH prereqs (roots/foreign are col 0)
    const depthOf = (t, seen = new Set()) => {
      if (seen.has(t.id)) return 1;
      seen.add(t.id);
      let d = 1;
      for (const p of (t.prereqs || [])) {
        if (techIds.has(p.id)) {
          const pt = techs.find((x) => x.id === p.id);
          if (pt) d = Math.max(d, depthOf(pt, seen) + 1);
        }
      }
      return d;
    };
    // column 0: every distinct prereq that is NOT a tech on this band
    const baseIds = [];
    for (const t of techs) for (const p of (t.prereqs || [])) {
      if (!techIds.has(p.id) && !baseIds.includes(p.id)) baseIds.push(p.id);
    }
    const cols = [];
    cols[0] = baseIds.map((id) => ({ id, kind: 'root', foreign: !belongsTo(b, id) }));
    for (const t of techs) {
      const d = depthOf(t);
      (cols[d] = cols[d] || []).push(t);
    }
    const fogCol = Math.max(cols.length, 2);
    cols[fogCol] = (b.future || []).map((f) => ({ ...f, kind: 'fog' }));
    maxCols = Math.max(maxCols, cols.length);

    bands.push({ label: b.label, color: b.color, y });
    y += TB.bandHead;
    const rows = Math.max(...cols.map((c) => (c ? c.length : 0)), 1);
    const pos = {};
    cols.forEach((col, ci) => {
      (col || []).forEach((n, ri) => {
        const nx = TB.pad + ci * (TB.nodeW + TB.colGap);
        const ny = y + ri * (TB.nodeH + TB.rowGap);
        pos[n.id] = { x: nx, y: ny };
        nodes.push({
          id: n.id, x: nx, y: ny, kind: n.kind || 'avail', color: b.color, foreign: !!n.foreign,
          title: n.id, sub: shortLabel(n.title || '', 30)
        });
      });
    });
    for (const t of techs) {
      for (const p of (t.prereqs || [])) {
        const a = pos[p.id];
        const c = pos[t.id];
        if (a && c) edges.push({
          x1: a.x + TB.nodeW, y1: a.y + TB.nodeH / 2, x2: c.x, y2: c.y + TB.nodeH / 2,
          color: b.color, dashed: !techIds.has(p.id) && !belongsTo(b, p.id)
        });
      }
    }
    y += rows * (TB.nodeH + TB.rowGap) + TB.bandGap;
  }
  return { width: TB.pad * 2 + maxCols * (TB.nodeW + TB.colGap), height: y, bands, nodes, edges };
}

module.exports = { TB, buildNodeIndexFromTree, treeBoardModel, belongsTo, shortLabel };
