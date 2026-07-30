'use strict';

const { Control, selectable_mixin } = require('../shared/jsgui');
const { role_ctrl } = require('../shared/page-controls');
const { TB } = require('../shared/tree-layout');

/**
 * Tech_Tree_Node — one technology on the research board: an SVG `g` holding a
 * rect and two text controls.
 *
 * SVG AS CONTROLS is jsgui3's own charts idiom (Chart_Base.svg_element) — the
 * board is not a markup string with a chart drawn into it, it is controls all
 * the way down, which is why selection, classes and events work here at all.
 *
 * Selection is the stock `selectable` mixin (control_mixins/selectable.js): a
 * reactive `selected` field, the 'selected' class, and its own mousedown
 * wiring. The isomorphic half runs at construction; the DOM half re-applies on
 * the client where dom.el exists (mx_state guards the double application).
 */
class Tech_Tree_Node extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'tech_tree_node';
    super({ ...spec, tag_name: 'g' });
    this.add_class('ps-tn');
    selectable_mixin(this);
    if (!spec.el && spec.node) {
      const n = spec.node;
      this.add_class(`ps-tn--${n.kind}`);
      if (n.foreign) this.add_class('ps-tn--foreign');
      this.dom.attributes.transform = `translate(${n.x},${n.y})`;
      this.dom.attributes['data-node-id'] = n.id;

      const svg = (tag, attrs, cls, text) => {
        const c = new Control({ context: this.context, tag_name: tag });
        Object.assign(c.dom.attributes, attrs);
        c.add_class(cls);
        if (text !== undefined) c.add(String(text));
        this.add(c);
        return c;
      };
      svg('rect', { width: TB.nodeW, height: TB.nodeH, rx: 4 }, 'ps-tn__box');
      svg('text', { x: 8, y: 13 }, 'ps-tn__id', n.title);
      svg('text', { x: 8, y: 25 }, 'ps-tn__sub', n.sub);
    }
  }

  activate() {
    if (this.__active) return;
    super.activate();
    selectable_mixin(this); // DOM half now that dom.el exists
    const el = this.dom.el;
    this.techId = el ? el.getAttribute('data-node-id') : null;

    const tree = role_ctrl(this, 'tree');
    if (tree && this.techId) tree.register_node(this);

    // Fog nodes are not yet conceptualised — there is nothing to show, so they
    // stay unselectable rather than opening an empty panel.
    const cls = (el && el.getAttribute('class')) || '';
    if (cls.indexOf('ps-tn--fog') >= 0) return;

    this.selectable = true;
    this.on('change', (e) => {
      if (e.name === 'selected' && e.value === true) {
        const tv = role_ctrl(this, 'tree');
        if (tv) tv.node_selected(this);
      }
    });
  }
}

Tech_Tree_Node.css = `
.ps-tn { cursor: pointer; }
.ps-tn--fog { cursor: default; }
.ps-tn__box { fill: #12151a; stroke: #2e3440; stroke-width: 1.2; }
.ps-tn--root .ps-tn__box { fill: #101216; stroke: #3a4150; }
.ps-tn--foreign .ps-tn__box { stroke-dasharray: 4,3; opacity: 0.7; }
.ps-tn--grown .ps-tn__box { stroke: #55a377; }
.ps-tn--avail .ps-tn__box { stroke: #b8862e; stroke-width: 1.6; }
.ps-tn--gated .ps-tn__box { stroke: #b34d4d; opacity: 0.8; }
.ps-tn--fog .ps-tn__box { stroke-dasharray: 3,4; opacity: 0.4; }
.ps-tn__id { font-size: 10px; font-weight: 700; fill: #e8e4d8; font-family: 'Segoe UI', system-ui, sans-serif; }
.ps-tn__sub { font-size: 8.5px; fill: #8a8778; font-family: 'Segoe UI', system-ui, sans-serif; }
.ps-tn:hover .ps-tn__box { filter: brightness(1.35); }
.ps-tn.selected .ps-tn__box { fill: #1d2733; stroke: #4d9ec8; stroke-width: 2.2; filter: drop-shadow(0 0 6px rgba(77,158,200,0.55)); }
.ps-tn.selected .ps-tn__id { fill: #cfe3ff; }
`;

module.exports = Tech_Tree_Node;
