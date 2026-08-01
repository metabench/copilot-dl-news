'use strict';

const { Control } = require('../shared/jsgui');
const { el } = require('../shared/el');
const { of_type } = require('../shared/page-controls');
const { buildNodeIndexFromTree } = require('../shared/tree-layout');
const Tech_Tree_Board = require('./Tech_Tree_Board');
const Tech_Detail_Panel = require('../detail/Tech_Detail_Panel');

/**
 * Tree_View — the board and its detail panel, and the state that binds them.
 *
 * This control exists to hold what used to be six module-level mutables:
 * TREE_SELECTED, TECH_INDEX, SIGNAL_HISTORY, NODE_CTRLS, HASH_GUARD and
 * TRAIL_CACHE. Module state was wrong twice over — shared by every page the
 * process renders, and reachable only by code that happened to sit in the same
 * file. Here it is per-view state on the control that owns the view, and nodes
 * and the panel reach it through the page's own control registry.
 *
 * It is also the app's router. One activated jsgui3 app serves every view, so
 * the old /tech/* URLs 302 into hash routes handled here:
 *   #node=<id>    → select that node (through the mixin, so panel and button follow)
 *   #branch=<key> → scroll the board to that band
 * Selecting writes the hash back, so every selection is a shareable deep link.
 */
class Tree_View extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'tree_view';
    super({ ...spec, tagName: 'div' });
    this.add_class('ps-treeview');

    // View state — one owner, no module globals.
    this.nodes = {};        // techId → activated Tech_Tree_Node
    this.selected = null;
    this.index = {};        // techId → node model, refreshed by every /api/status
    this.history = [];      // the owner's requests, for the panel's YOUR REQUESTS
    this.trails = {};       // techId → ledger trail rows, fetched once per node
    this.hash_guard = false;

    if (!spec.el) {
      const tree = spec.tree;
      this.index = buildNodeIndexFromTree(tree);
      this.history = spec.history || [];
      const scroll = el(this.context, 'div', 'ps-board-scroll');
      if (tree && tree.branches && tree.branches.length) {
        scroll.add(new Tech_Tree_Board({ context: this.context, tree }));
      } else {
        scroll.add(el(this.context, 'div', 'ps-quest-item ps-muted', 'tree unavailable'));
      }
      this.add(scroll);
      this.add(new Tech_Detail_Panel({ context: this.context }));
    }
  }

  panel() {
    return of_type(this, 'tech_detail_panel');
  }

  register_node(node) {
    this.nodes[node.techId] = node;
  }

  /** Exactly-one-selected, plus the panel and the deep link. */
  node_selected(node) {
    if (this.selected && this.selected !== node) this.selected.selected = false;
    this.selected = node;
    const panel = this.panel();
    if (panel) panel.show(node.techId);
    if (!this.hash_guard && typeof location !== 'undefined') {
      this.hash_guard = true;
      location.hash = 'node=' + encodeURIComponent(node.techId);
      setTimeout(() => { this.hash_guard = false; }, 0);
    }
  }

  /** Fresh status: the panel's data is as live as the rest of the page. */
  set_status(s) {
    this.index = buildNodeIndexFromTree(s.techTree);
    this.history = s.signalHistory || [];
    const panel = this.panel();
    if (panel && this.selected && this.selected.techId) panel.show(this.selected.techId);
  }

  apply_hash() {
    if (typeof location === 'undefined') return;
    const h = location.hash.replace(/^#/, '');
    const mNode = /^node=(.+)$/.exec(h);
    const mBranch = /^branch=(.+)$/.exec(h);
    if (mNode) {
      const ctrl = this.nodes[decodeURIComponent(mNode[1])];
      if (ctrl) {
        this.hash_guard = true;
        ctrl.selected = true;
        setTimeout(() => { this.hash_guard = false; }, 0);
        if (ctrl.dom.el && ctrl.dom.el.scrollIntoView) ctrl.dom.el.scrollIntoView({ block: 'center' });
      }
    } else if (mBranch) {
      const band = document.querySelector(`[data-band="${decodeURIComponent(mBranch[1])}"]`);
      if (band && band.scrollIntoView) band.scrollIntoView({ block: 'start' });
    }
  }

  activate() {
    if (this.__active) return;
    super.activate();
    // Nodes register during the same activation pass; the tick lets them all
    // land before a #node= link tries to resolve one.
    setTimeout(() => this.apply_hash(), 60);
    window.addEventListener('hashchange', () => this.apply_hash());
  }
}

Tree_View.css = `
.ps-treeview { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 12px; align-items: start; margin-bottom: 14px; }
@media (max-width: 1000px) { .ps-treeview { grid-template-columns: 1fr; } }
.ps-board-scroll { overflow: auto; border: 2px solid #2e3440; border-radius: 6px; background: #0c0e11; max-height: 74vh; }
`;

module.exports = Tree_View;
