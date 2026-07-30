'use strict';

const { Control } = require('../shared/jsgui');
const { TB, treeBoardModel } = require('../shared/tree-layout');
const Tech_Tree_Node = require('./Tech_Tree_Node');

// Band label → the /tech/<key> route that 302s to #branch=<key>.
const BAND_KEYS = { AGI: 'agi', 'TECH TREE': 'tree', CRAWLER: 'crawler', 'TOOL FACTORY': 'factory' };

/**
 * Tech_Tree_Board — the research board: an `svg` Control holding prerequisite
 * lines, band labels and one Tech_Tree_Node per technology.
 *
 * Not a Tree_View: jsgui3's Tree_View/Tree/File_Tree are nested expand/collapse
 * lists (a file-tree idiom). This is a DAG laid out in bands with cross-band
 * prerequisite edges, so the layout is the domain concept and stays custom —
 * checked against the catalogue before building, not assumed.
 */
class Tech_Tree_Board extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'tech_tree_board';
    super({ ...spec, tag_name: 'svg' });
    this.add_class('ps-board');
    if (!spec.el && spec.tree) this.compose(spec.tree);
  }

  compose(tree) {
    const ctx = this.context;
    const m = treeBoardModel(tree);
    this.dom.attributes.width = m.width;
    this.dom.attributes.height = m.height;
    this.dom.attributes.viewBox = `0 0 ${m.width} ${m.height}`;

    for (const e of m.edges) {
      const line = new Control({ context: ctx, tag_name: 'line' });
      Object.assign(line.dom.attributes, {
        x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2,
        stroke: e.color, 'stroke-width': 1.4, opacity: e.dashed ? 0.35 : 0.55
      });
      if (e.dashed) line.dom.attributes['stroke-dasharray'] = '4,3';
      this.add(line);
    }
    for (const b of m.bands) {
      const t = new Control({ context: ctx, tag_name: 'text' });
      Object.assign(t.dom.attributes, {
        x: TB.pad, y: b.y + 15, fill: b.color,
        'data-band': BAND_KEYS[b.label] || b.label.toLowerCase()
      });
      t.add_class('ps-board__band');
      t.add(String(b.label));
      this.add(t);
    }
    for (const n of m.nodes) this.add(new Tech_Tree_Node({ context: ctx, node: n }));
  }
}

Tech_Tree_Board.css = `
.ps-board { display: block; }
.ps-board__band { font-size: 12px; font-weight: 700; letter-spacing: 0.14em; font-family: 'Segoe UI', system-ui, sans-serif; }
`;

module.exports = Tech_Tree_Board;
