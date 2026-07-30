'use strict';

/**
 * controls.js — project-status page controls (isomorphic esbuild entry). v2.
 *
 * jsgui3 trio: jsgui3-html composes server-side, jsgui3-server SSRs + bundles this
 * file, jsgui3-client (required in the browser branch) SELF-ACTIVATES on window
 * load and reattaches by data-jsgui-id/type through jsgui.controls — hence the
 * registrations at the bottom. (Omitting either was a proven silent no-op.)
 *
 * v2: in-place refresh. Key nodes carry data-ps-* attributes at compose time;
 * activate() fetches /api/status (60 s interval + the REFRESH button) and updates
 * the DOM in place — no page reload, matching the ThroughputStrip idiom of
 * "update the cells, don't re-render". CHIP_DEFS is shared between server compose
 * and client apply so the two sides cannot drift. A HISTORY panel embeds the
 * committed progress SVG (served at /progress.svg, cache-busted on refresh).
 *
 * Visual design: game-UI look, plain engineering vocabulary (owner, 2026-07-27).
 */

const IS_BROWSER = typeof window !== 'undefined' && typeof document !== 'undefined';
// Both branches bundle statically; only one executes per environment.
const jsgui = IS_BROWSER
  ? require('../../../../../jsgui3-client/client')
  : require('jsgui3-html');
const { Control } = jsgui;
const Active_HTML_Document = require('../../../../../jsgui3-server/controls/Active_HTML_Document');

// STOCK jsgui3 CONTROLS (cycle 162). The library ships 155 controls and 48
// mixins; this app had been hand-rolling panels, chips, tables and buttons out
// of anonymous divs. Verified present on BOTH the server and client builds
// before adoption, so reattachment cannot break. Adopt, never reinvent — the
// survey comes before the build list.
const { Panel, Stat_Card, Data_Grid, Key_Value_Table, Progress_Bar, Chip, Button } = jsgui.controls;

// Shared by server compose AND client apply — one definition, no drift.
const CHIP_DEFS = [
  { key: 'cycles', label: 'cycles recorded', fmt: (st) => String(st.cycles) },
  { key: 'preShipPct', label: 'defects caught pre-ship', fmt: (st) => `${st.preShipPct}%` },
  { key: 'defectsPre', label: 'defects found', fmt: (st) => String(st.defectsPre) },
  { key: 'corrections', label: 'corrections issued', fmt: (st) => String(st.corrections) },
  { key: 'pages', label: 'pages archived', fmt: (st) => `${(st.pages / 1000).toFixed(1)}k` }
];
const xpLabelText = (p) =>
  `${p.xpPerLevel - p.xpInLevel} to the next ${p.xpPerLevel}-improvement milestone · data through ${p.dataThrough}`;
const owedText = (q) => `▸ ${q.label} (from cycle ${q.cycle})`;
const recentText = (r) => `${r.correction ? '↺' : '·'} c${r.cycle} — ${r.label}`;
// One definition for SSR compose AND the client refresh (the isomorphic rule):
// what the agent is doing now, or nothing at all when idle — an empty box beats
// a line that presents an hours-old phase as if it were live (cycle 150's lesson).
const activityLines = (a) => {
  if (!a || a.idle) return [];
  const age = a.ageMinutes === 0 ? 'just now' : `${a.ageMinutes}m ago`;
  return [`⚙ AGENT WORKING — ${a.phase}${a.cycle ? ` (cycle ${a.cycle})` : ''}: ${a.note || 'in progress'} · ${age}`];
};

// ---- tech tree + path ahead (SMAC-style; owner directive 2026-07-27) ----
// Shared MODELS between server compose and client apply — same one-definition rule
// as CHIP_DEFS. States derive from the backlog's state column; only open/partial
// rows earn the 💡 (they are exactly the ▶ candidates next-prompt offers). The tree
// is deliberately not fully visible: '❓ Future Technology' marks the fog of war.
// The hub shows one CARD per branch, linking to its SMAC-style page (/tech/<key>)
// where the full tiers + SVG art render per request. Emoji stand in for the branch
// icons here (the isomorphic bundle treats control text as text, so inline SVG art
// belongs on the server-rendered pages); the branch COLOR carries on the card border.
const BRANCH_EMOJI = { iceBulb: '💡', treeMonitor: '🖥️', spiderWeb: '🕷️', factorySpanner: '🏭' };
function branchCardModel(b) {
  return {
    key: b.key,
    href: `/tech/${b.key}`,
    color: b.color,
    title: `${BRANCH_EMOJI[b.icon] || '▣'} ${b.label}`,
    tagline: b.tagline || '',
    counts: `${b.roots.length} foundations · ${b.grown.length + b.available.length} research (${b.available.length} open) · ${b.gated.length} gated · ${b.future.length} beyond`
  };
}
const absorbedText = (n) => `🌱 ${n || 0} pre-tree research items absorbed into the foundations — the deep roots are not displayed`;
function roadCardModels(s) {
  const cards = [];
  const r = s.roadmap || {};
  if (r.block) cards.push({ cls: 'ps-road__card ps-road__card--now', top: 'NOW', main: r.block.label, sub: r.block.why || '' });
  (r.steps || []).forEach((st, i) => cards.push({ cls: 'ps-road__card', top: `NEXT ${i + 1}`, main: st.label, sub: st.detail || '' }));
  cards.push({ cls: 'ps-road__card ps-road__card--future', top: 'BEYOND', main: '❓ Future Technology', sub: 'not yet conceptualised' });
  return cards;
}

// ---- RESEARCH TREE as real jsgui3 SVG controls (owner directive, cycle 160) --
// The owner's correction stands on the record: this page is jsgui3 — SSR +
// client activation — so the tree is BUILT FROM CONTROLS, not markup strings.
// The idiom is jsgui3-html's own charts family (Chart_Base.svg_element): an
// svg-tagged Control containing g/rect/text/line child controls. Selection is
// the jsgui3 `selectable` mixin (control_mixins/selectable.js): reactive
// `selected` field, 'selected' CSS class, mousedown wiring — single click
// selects; the detail renders in a SIDE PANEL control, never a modal; the
// BEGIN RESEARCH button arms when the selection is researchable.
const selectable_mixin = require('../../../../../jsgui3-html/control_mixins/selectable');

// Module-level selection coordination (browser only). The mixin owns each
// node's state; this owns "exactly one selected" and the panel hookup —
// deliberately NOT selection-scope, whose sibling-walk assumptions predate
// this reattachment stack.
let TREE_SELECTED = null;
let TREE_PANEL = null;
let TECH_INDEX = {};
let SIGNAL_HISTORY = [];          // full request/answer history (from /api/status)
let PAGE_WIDGET = null;           // the activated Status_Widget (client only)
let SIGNAL_GRID = null;           // the activated signal-log Data_Grid
const TRAIL_CACHE = {};           // techId → ledger-trail rows (fetched once)

/**
 * activateChildren — activate controls composed INTO an already-activated
 * parent (cycle 162, browser only).
 *
 * jsgui3 activates the control tree once, on page activation. Anything added
 * afterwards has its markup inserted but never receives activate(), so any
 * control that does work there — Data_Grid renders its rows from activate()
 * after browser reconstruction — renders empty. Walking the new subtree once
 * is the small, explicit price of composing controls at runtime.
 */
function activateChildren(ctrl) {
  if (typeof document === 'undefined') return;
  const walk = (c) => {
    if (!c || typeof c !== 'object') return;
    for (const child of (c.content && c.content._arr) || []) {
      try { if (child && !child.__active && typeof child.activate === 'function') child.activate(); } catch (_) {}
      walk(child);
    }
  };
  walk(ctrl);
}
const NODE_CTRLS = {};            // techId → activated Tech_Tree_Node (hash deep links)
let HASH_GUARD = false;           // selecting sets the hash; the hash selects — guard the loop

function buildNodeIndexFromTree(tree) {
  const index = {};
  for (const b of ((tree && tree.branches) || [])) {
    for (const r of b.roots) index[r.id] = { ...r, kind: 'root', branch: b.key, branchLabel: b.label, color: b.color };
    for (const g of b.grown) index[g.id] = { ...g, kind: 'grown', branch: b.key, branchLabel: b.label, color: b.color };
    for (const a of b.available) index[a.id] = { ...a, kind: 'avail', branch: b.key, branchLabel: b.label, color: b.color };
    for (const g of b.gated) index[g.id] = { ...g, kind: 'gated', branch: b.key, branchLabel: b.label, color: b.color };
    for (const f of b.future) index[f.id] = { ...f, kind: 'fog', branch: b.key, branchLabel: b.label, color: b.color };
  }
  return index;
}

// Pure layered layout, shared by compose (SSR) and nothing else — the board is
// SSR'd; structural changes arrive as a fresh page (rare: promotions).
const TB = { nodeW: 176, nodeH: 30, colGap: 30, rowGap: 8, bandHead: 24, bandGap: 20, pad: 12 };
function treeBoardModel(tree) {
  const bands = [];
  const nodes = [];
  const edges = [];
  let y = TB.pad;
  let maxCols = 0;
  for (const b of ((tree && tree.branches) || [])) {
    const techs = [...b.grown.map((n) => ({ ...n, kind: 'grown' })), ...b.available.map((n) => ({ ...n, kind: 'avail' })), ...b.gated.map((n) => ({ ...n, kind: 'gated' }))];
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
    // column 0: every distinct prereq that is NOT a tech on this band (roots + foreign)
    const baseIds = [];
    for (const t of techs) for (const p of (t.prereqs || [])) {
      if (!techIds.has(p.id) && !baseIds.includes(p.id)) baseIds.push(p.id);
    }
    const cols = [];
    cols[0] = baseIds.map((id) => ({ id, kind: p_kind(tree, b, id), foreign: !belongsTo(b, id) }));
    for (const t of techs) {
      const d = depthOf(t);
      (cols[d] = cols[d] || []).push(t);
    }
    const fogCol = Math.max(cols.length, 2);
    cols[fogCol] = (b.future || []).map((f) => ({ ...f, kind: 'fog' }));
    maxCols = Math.max(maxCols, cols.length);

    const bandTop = y;
    bands.push({ label: b.label, color: b.color, y: bandTop });
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
        const a = pos[p.id], c = pos[t.id];
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
function belongsTo(b, id) {
  return b.roots.some((r) => r.id === id) || b.grown.concat(b.available, b.gated).some((t) => t.id === id);
}
function p_kind(tree, band, id) {
  for (const bb of tree.branches) if (bb.roots.some((r) => r.id === id)) return 'root';
  return 'root';
}
function shortLabel(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

class Tech_Tree_Node extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'tech_tree_node';
    super({ ...spec, tag_name: 'g' });
    this.add_class('ps-tn');
    // The jsgui3 selectable mixin — isomorphic half runs now; the DOM half
    // re-applies on the client where dom.el exists (mx_state guards doubles).
    selectable_mixin(this);
    if (!spec.el && spec.node) {
      const n = spec.node;
      this.add_class(`ps-tn--${n.kind}`);
      if (n.foreign) this.add_class('ps-tn--foreign');
      this.dom.attributes.transform = `translate(${n.x},${n.y})`;
      this.dom.attributes['data-node-id'] = n.id;
      const rect = new Control({ context: this.context, tag_name: 'rect' });
      rect.dom.attributes.width = TB.nodeW;
      rect.dom.attributes.height = TB.nodeH;
      rect.dom.attributes.rx = 4;
      rect.add_class('ps-tn__box');
      this.add(rect);
      const t1 = new Control({ context: this.context, tag_name: 'text' });
      t1.dom.attributes.x = 8; t1.dom.attributes.y = 13;
      t1.add_class('ps-tn__id');
      t1.add(String(n.title));
      this.add(t1);
      const t2 = new Control({ context: this.context, tag_name: 'text' });
      t2.dom.attributes.x = 8; t2.dom.attributes.y = 25;
      t2.add_class('ps-tn__sub');
      t2.add(String(n.sub));
      this.add(t2);
    }
  }

  activate() {
    if (!this.__active) {
      super.activate();
      selectable_mixin(this); // DOM half now that dom.el exists
      const el = this.dom.el;
      this.techId = el ? el.getAttribute('data-node-id') : null;
      if (this.techId) NODE_CTRLS[this.techId] = this; // hash deep links resolve here
      const kind = el && el.getAttribute('class') || '';
      const isFog = kind.indexOf('ps-tn--fog') >= 0;
      if (!isFog) {
        this.selectable = true;
        // Single-click select (the mixin's own wiring is mousedown-based; this
        // explicit trigger is belt-and-braces for this reattachment stack —
        // selected=true is idempotent through the reactive field).
        this.add_dom_event_listener('mousedown', () => { this.selected = true; });
        this.on('change', (e) => {
          if (e.name === 'selected' && e.value === true) {
            if (TREE_SELECTED && TREE_SELECTED !== this) TREE_SELECTED.selected = false;
            TREE_SELECTED = this;
            if (TREE_PANEL) TREE_PANEL.show(this.techId);
            // Selection is deep-linkable: #node=<id> (guard: the hash handler
            // also selects, and must not re-trigger itself).
            if (!HASH_GUARD && typeof location !== 'undefined') {
              HASH_GUARD = true;
              location.hash = 'node=' + encodeURIComponent(this.techId);
              setTimeout(() => { HASH_GUARD = false; }, 0);
            }
          }
        });
      }
    }
  }
}

/**
 * applyHash — the app's router (cycle 161). One activated jsgui3 app serves
 * every view; old /tech/* URLs 302 into these hash routes:
 *   #node=<id>    → select the node (mixin selection + panel + scroll to it)
 *   #branch=<key> → scroll the board to that branch band
 */
function applyHash() {
  if (typeof location === 'undefined') return;
  const h = location.hash.replace(/^#/, '');
  const mNode = /^node=(.+)$/.exec(h);
  const mBranch = /^branch=(.+)$/.exec(h);
  if (mNode) {
    const id = decodeURIComponent(mNode[1]);
    const ctrl = NODE_CTRLS[id];
    if (ctrl) {
      HASH_GUARD = true;
      ctrl.selected = true;
      setTimeout(() => { HASH_GUARD = false; }, 0);
      if (ctrl.dom.el && ctrl.dom.el.scrollIntoView) ctrl.dom.el.scrollIntoView({ block: 'center' });
    }
  } else if (mBranch) {
    const band = document.querySelector(`[data-band="${decodeURIComponent(mBranch[1])}"]`);
    if (band && band.scrollIntoView) band.scrollIntoView({ block: 'start' });
  }
}

class Tech_Tree_Board extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'tech_tree_board';
    super({ ...spec, tag_name: 'svg' });
    this.add_class('ps-board');
    if (!spec.el && spec.tree) {
      const m = treeBoardModel(spec.tree);
      this.dom.attributes.width = m.width;
      this.dom.attributes.height = m.height;
      this.dom.attributes.viewBox = `0 0 ${m.width} ${m.height}`;
      for (const e of m.edges) {
        const line = new Control({ context: this.context, tag_name: 'line' });
        line.dom.attributes.x1 = e.x1; line.dom.attributes.y1 = e.y1;
        line.dom.attributes.x2 = e.x2; line.dom.attributes.y2 = e.y2;
        line.dom.attributes.stroke = e.color;
        line.dom.attributes['stroke-width'] = 1.4;
        if (e.dashed) line.dom.attributes['stroke-dasharray'] = '4,3';
        line.dom.attributes.opacity = e.dashed ? 0.35 : 0.55;
        this.add(line);
      }
      const BAND_KEYS = { AGI: 'agi', 'TECH TREE': 'tree', CRAWLER: 'crawler', 'TOOL FACTORY': 'factory' };
      for (const b of m.bands) {
        const t = new Control({ context: this.context, tag_name: 'text' });
        t.dom.attributes.x = TB.pad; t.dom.attributes.y = b.y + 15;
        t.dom.attributes.fill = b.color;
        t.dom.attributes['data-band'] = BAND_KEYS[b.label] || b.label.toLowerCase();
        t.add_class('ps-board__band');
        t.add(String(b.label));
        this.add(t);
      }
      for (const n of m.nodes) this.add(new Tech_Tree_Node({ context: this.context, node: n }));
    }
  }
}

/**
 * Live_Strip — the SSE-fed status line (migrated from the retired string pages,
 * cycle 161; semantics from cycles 157/158): 'activity' patches this strip in
 * place and never touches the page; 'cards' re-applies live data through the
 * page's _apply and, when the tree STRUCTURE itself changed (node set differs
 * from the SSR'd board), self-refreshes with scroll preserved.
 */
class Live_Strip extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'live_strip';
    super({ ...spec, tagName: 'div' });
    this.add_class('ps-live');
    if (!spec.el) {
      const dot = new Control({ context: this.context, tagName: 'span' });
      dot.add_class('ps-live__dot');
      dot.dom.attributes['data-live-dot'] = 'true';
      this.add(dot);
      const text = new Control({ context: this.context, tagName: 'span' });
      text.add_class('ps-live__text');
      text.dom.attributes['data-live-text'] = 'true';
      text.add('connecting to live events…');
      this.add(text);
    }
  }

  paint(s) {
    const el = this.dom.el;
    if (!el) return;
    const dot = el.querySelector('[data-live-dot]');
    const text = el.querySelector('[data-live-text]');
    const a = s.activity || s.agentActivity || {};
    if (dot) dot.className = 'ps-live__dot' + (a.idle ? ' ps-live__dot--idle' : ' ps-live__dot--busy');
    if (text) {
      text.textContent = a.idle
        ? `agent idle — ${a.reason || ''}`
        : `${(a.phase || 'working').toUpperCase()}${a.cycle ? ` (c${a.cycle})` : ''}: ${a.note || ''} · ${a.ageMinutes === 0 ? 'just now' : (a.ageMinutes + 'm ago')}`;
    }
  }

  activate() {
    if (!this.__active) {
      super.activate();
      const page = () => PAGE_WIDGET; // resolved lazily — activation order varies
      const boardIds = () => new Set([...document.querySelectorAll('.ps-tn[data-node-id]')].map((n) => n.getAttribute('data-node-id')));
      const ssrIds = boardIds();
      const es = new EventSource('/api/events');
      es.addEventListener('hello', (e) => { try { this.paint(JSON.parse(e.data)); } catch (_) {} });
      es.addEventListener('activity', (e) => { try { this.paint(JSON.parse(e.data)); } catch (_) {} });
      es.addEventListener('cards', (e) => {
        try { this.paint(JSON.parse(e.data)); } catch (_) {}
        fetch('/api/status', { cache: 'no-store' }).then((r) => r.json()).then((s) => {
          const p = page();
          if (p && p._apply) p._apply(s);
          // Structure change (promotion, new tech): the SSR'd board can't know —
          // self-refresh, preserving the reading position (cycle 157 rule).
          const now = new Set(Object.keys(buildNodeIndexFromTree(s.techTree)));
          const same = now.size === ssrIds.size && [...ssrIds].every((id) => now.has(id));
          if (!same) {
            try { sessionStorage.setItem('tp-scroll-restore', String(window.scrollY || 0)); } catch (_) {}
            location.reload();
          }
        }).catch(() => {});
      });
    }
  }
}

/**
 * Settings_Control — the gear + page-scale dialog (migrated, cycle 161).
 * The retired pages scaled rem-based CSS via root font-size; this app's CSS is
 * px-based, so the scale applies as zoom on the app root instead — same owner
 * control (80–250%, persisted), different mechanism (recorded in the
 * migration report as a deviation to revisit if rem conversion happens).
 */
class Settings_Control extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'settings_control';
    super({ ...spec, tagName: 'div' });
    this.add_class('ps-settings');
    if (!spec.el) {
      const btn = new Control({ context: this.context, tagName: 'button' });
      btn.add_class('ps-settings__gear');
      btn.dom.attributes['data-settings-gear'] = 'true';
      btn.dom.attributes.type = 'button';
      btn.dom.attributes['aria-label'] = 'settings';
      btn.add('⚙');
      this.add(btn);
      const dlg = new Control({ context: this.context, tagName: 'dialog' });
      dlg.add_class('ps-settings__dlg');
      dlg.dom.attributes['data-settings-dlg'] = 'true';
      const label = new Control({ context: this.context, tagName: 'div' });
      label.add_class('ps-settings__label');
      label.dom.attributes['data-settings-label'] = 'true';
      label.add('page scale: 100%');
      dlg.add(label);
      const range = new Control({ context: this.context, tagName: 'input' });
      range.dom.attributes.type = 'range';
      range.dom.attributes.min = '80';
      range.dom.attributes.max = '250';
      range.dom.attributes.step = '5';
      range.dom.attributes.value = '100';
      range.dom.attributes['data-settings-range'] = 'true';
      dlg.add(range);
      const reset = new Control({ context: this.context, tagName: 'button' });
      reset.dom.attributes.type = 'button';
      reset.dom.attributes['data-settings-reset'] = 'true';
      reset.add_class('ps-settings__reset');
      reset.add('reset');
      dlg.add(reset);
      this.add(dlg);
    }
  }

  activate() {
    if (!this.__active) {
      super.activate();
      const el = this.dom.el;
      if (!el) return;
      const dlg = el.querySelector('[data-settings-dlg]');
      const range = el.querySelector('[data-settings-range]');
      const label = el.querySelector('[data-settings-label]');
      const apply = (pct) => {
        const root = document.querySelector('.ps-root');
        if (root) root.style.zoom = String(pct / 100);
        if (label) label.textContent = `page scale: ${pct}%`;
        if (range) range.value = String(pct);
        try { localStorage.setItem('tp-settings', JSON.stringify({ scalePct: pct })); } catch (_) {}
      };
      try {
        const saved = JSON.parse(localStorage.getItem('tp-settings') || '{}');
        if (saved.scalePct) apply(Number(saved.scalePct));
      } catch (_) {}
      el.querySelector('[data-settings-gear]').addEventListener('click', () => { if (dlg && dlg.showModal) dlg.showModal(); });
      if (range) range.addEventListener('input', () => apply(Number(range.value)));
      el.querySelector('[data-settings-reset]').addEventListener('click', () => apply(100));
      if (dlg) dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    }
  }
}

/**
 * Signal_Log — the lightbulb queue on the page (migrated from the factory
 * page, cycle 161): every request and its answer, newest first, repainted by
 * every _apply so it is as live as the rest.
 */
/**
 * Signal_Log — the lightbulb queue as a jsgui3 Data_Grid (cycle 162).
 *
 * Was a hand-built list of concatenated strings, repainted by innerHTML. The
 * grid is a connected control: columns, rows, sorting and empty_text are its
 * concern, and the cells carry values rather than pre-formatted sentences —
 * so the owner can sort by state or tech, and escaping is structural.
 */
class Signal_Log extends Panel {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'signal_log';
    super({ ...spec, title: 'SIGNAL LOG — every request and its answer' });
    this.add_class('ps-panel');
    if (!spec.el) {
      const grid = new Data_Grid({
        context: this.context,
        columns: SIGNAL_COLUMNS,
        rows: signalLogRows(spec.history || []),
        empty_text: 'no requests yet — click a node and BEGIN RESEARCH'
      });
      grid.dom.attributes['data-ps-siglog'] = 'true';
      this.grid = grid;
      this.add(grid);
    }
  }

  activate() {
    if (!this.__active) {
      super.activate();
      // Hold the reattached grid so _apply can push it fresh rows.
      SIGNAL_GRID = this.grid || null;
    }
  }
}
const SIGNAL_COLUMNS = ['state', 'when', 'tech', 'note'];
function signalLogRows(history) {
  return (history || []).slice(-25).reverse().map((r) => ({
    state: r.status === 'pending' ? '⚡ pending' : '✓ answered',
    when: String(r.status === 'pending' ? r.at : (r.ackAt || r.at) || '').slice(0, 16).replace('T', ' '),
    tech: r.tech || '',
    note: (r.status === 'pending' ? (r.requested || '') : (r.ackNote || '')).slice(0, 200)
  }));
}

class Tech_Detail_Panel extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'tech_detail_panel';
    super({ ...spec, tagName: 'aside' });
    this.add_class('ps-detail');
    if (!spec.el) {
      const ph = new Control({ context: this.context, tagName: 'div' });
      ph.add_class('ps-detail__empty');
      ph.add('Select a node on the tree — its data appears here.');
      this.add(ph);
    }
  }

  activate() {
    if (!this.__active) {
      super.activate();
      TREE_PANEL = this;
      // Delegated click: the BEGIN RESEARCH button is re-composed on every
      // selection, so the handler lives on the panel (which stays activated)
      // and reads the current selection from begin_tech.
      this.add_dom_event_listener('click', (e) => {
        const t = e && (e.target || e.srcElement);
        const btn = t && t.closest && t.closest('.ps-begin--armed');
        if (!btn || !this.begin_tech || btn.disabled) return;
        const n = this.begin_tech;
        btn.disabled = true;
        btn.textContent = 'signalling…';
        fetch('/api/research-signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tech: n.id, requested: n.research || n.title })
        }).then((r) => r.json()).then((j) => {
          btn.textContent = j.ok
            ? '⚡ requested — the agent picks it up at its next orient'
            : ('failed: ' + (j.error || 'unknown'));
        }).catch(() => { btn.textContent = 'failed — server away?'; });
      });
    }
  }

  // Client-side render from TECH_INDEX (refreshed by every /api/status fetch) —
  // the hub's plain-DOM repaint idiom, same as _apply's list rebuilds.
  /**
   * Render the selected node — COMPOSED FROM CONTROLS (cycle 162), not built
   * with createElement. clear() + compose is the framework's own repaint idiom
   * (Chart_Base.render_chart does exactly this), so escaping is structural and
   * the panel's parts are real controls that can be styled and tested.
   */
  show(id) {
    const n = TECH_INDEX[id];
    if (!n) return;
    this.clear();
    const ctx = this.context;
    const kind_label = {
      root: 'foundation',
      grown: 'researched' + (n.researchedOn ? ' ' + n.researchedOn : ''),
      avail: 'research available',
      gated: 'gated — yours to authorize',
      fog: 'future technology'
    }[n.kind] || n.kind;

    const line = (cls, text, style) => {
      const c = new Control({ context: ctx, tagName: 'div' });
      c.add_class(cls);
      if (style) c.dom.attributes.style = style;
      if (text !== undefined) c.add(String(text));
      this.add(c);
      return c;
    };

    line('ps-detail__id', n.id, `color:${n.color}`);
    line('ps-detail__title', n.title || n.id);

    // Facts as a Key_Value_Table rather than hand-laid divs.
    const facts = { branch: n.branchLabel || '', state: kind_label };
    if (n.priority) facts.priority = n.priority;
    if (n.lastUpdate) facts.updated = n.lastUpdate;
    this.add(new Key_Value_Table({ context: ctx, data: facts }));

    if (n.research) { line('ps-detail__h', 'RESEARCH MEANS'); line('ps-detail__p', n.research); }
    if (n.note && !n.research) { line('ps-detail__h', 'WHAT THIS IS'); line('ps-detail__p', n.note); }

    if ((n.prereqs || []).length) {
      line('ps-detail__h', 'BUILT FROM');
      const box = new Control({ context: ctx, tagName: 'div' });
      box.add_class('ps-detail__chips');
      for (const pr of n.prereqs) box.add(new Chip({ context: ctx, text: pr.id }));
      this.add(box);
    }

    for (const [head, list] of [['DETAIL — from the record', n.detail], ['PRELIMINARY DATA', n.prelim]]) {
      if ((list || []).length) {
        line('ps-detail__h', head);
        for (const item of list.slice(0, 4)) line('ps-detail__p ps-detail__p--fact', '▪ ' + item);
        if (list.length > 4) line('ps-detail__more', `${list.length - 4} more in the record`);
      }
    }

    const mine = SIGNAL_HISTORY.filter((s2) => s2.tech === n.id)
      .sort((a2, b2) => String(b2.at || '').localeCompare(String(a2.at || '')));
    if (mine.length) {
      line('ps-detail__h', `YOUR REQUESTS — ${mine.length}`);
      this.add(new Data_Grid({
        context: ctx,
        columns: ['state', 'when', 'note'],
        rows: mine.slice(0, 5).map((s2) => ({
          state: s2.status === 'pending' ? '⚡ pending' : '✓ answered',
          when: String(s2.status === 'pending' ? s2.at : (s2.ackAt || s2.at) || '').slice(0, 16).replace('T', ' '),
          note: (s2.status === 'pending' ? (s2.requested || '') : (s2.ackNote || '')).slice(0, 200)
        }))
      }));
    }

    // LEDGER TRAIL — STATIC rows, resolved before composing.
    //
    // Data_Grid supports an async data_source, but a control added to an
    // ALREADY-ACTIVATED parent has its composed markup inserted without being
    // activated itself, so a re-render that happens after the promise resolves
    // never reaches the DOM (measured: the grid sat in .loading / aria-busy
    // forever while the endpoint returned fine). So the data is fetched first
    // and handed in as an array; the per-node cache makes re-selection instant
    // and the second show() call is what paints the rows.
    line('ps-detail__h', 'LEDGER TRAIL');
    const cached = TRAIL_CACHE[n.id];
    if (cached === undefined) {
      line('ps-detail__more', 'loading ledger trail…');
      fetch(`/api/node?id=${encodeURIComponent(n.id)}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((j) => {
          TRAIL_CACHE[n.id] = (j.ledgerTrail || []).slice(-8).reverse()
            .map((tr) => ({ cycle: 'c' + tr.cycle, date: tr.date, what: tr.label }));
          if (TREE_SELECTED && TREE_SELECTED.techId === n.id) this.show(n.id);
        })
        .catch(() => { TRAIL_CACHE[n.id] = []; });
    } else if (cached.length) {
      this.add(new Data_Grid({ context: ctx, columns: ['cycle', 'date', 'what'], rows: cached }));
    } else {
      line('ps-detail__more', 'no ledger cycle mentions this id yet — the trail writes itself as work lands');
    }

    const links = new Control({ context: ctx, tagName: 'div' });
    links.add_class('ps-detail__links');
    const a = new Control({ context: ctx, tagName: 'a' });
    a.dom.attributes.href = `/#node=${encodeURIComponent(n.id)}`;
    a.add('permalink to this node ↗');
    links.add(a);
    this.add(links);

    // BEGIN RESEARCH — a jsgui3 Button, armed only when researchable.
    const armed = n.kind === 'avail';
    const btn = new Button({ context: ctx, text: armed ? '⚡ BEGIN RESEARCH' : 'not researchable' });
    btn.add_class(armed ? 'ps-begin ps-begin--armed' : 'ps-begin');
    if (!armed) btn.dom.attributes.disabled = 'disabled';
    this.add(btn);
    this.begin_button = btn;
    this.begin_tech = armed ? n : null;

    // Controls added to an ALREADY-ACTIVATED parent do not activate themselves.
    // Data_Grid in particular defers its row rendering to activate() after
    // browser reconstruction, so without this the grids render headers only and
    // sit in .loading forever (measured before this line existed).
    activateChildren(this);
  }
}

class Status_Widget extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'status_widget';
    super({ ...spec, tagName: 'div' });
    this.add_class('ps-root');
    if (!spec.el) this.compose(spec.status || null);
  }

  _el(tag, cls, text) {
    const c = new Control({ context: this.context, tagName: tag });
    if (cls) c.add_class(cls);
    if (text !== undefined) c.add(String(text));
    return c;
  }

  compose(s) {
    if (!s) { this.add(this._el('p', 'ps-empty', 'No status data — is the ledger readable?')); return; }

    // ---- live strip + settings (migrated into the app, cycle 161) ----
    this.add(new Live_Strip({ context: this.context }));
    this.add(new Settings_Control({ context: this.context }));

    // ---- header ----
    const bar = this._el('header', 'ps-player');
    bar.add(this._el('div', 'ps-studio', 'PROJECT STATUS — news-crawler ecosystem'));
    const lvl = this._el('div', 'ps-level');
    const big = this._el('span', 'ps-level__num', String(s.player.xpTotal));
    big.dom.attributes['data-ps-total'] = 'true';
    lvl.add(big);
    lvl.add(this._el('span', 'ps-level__title', 'verified improvements'));
    bar.add(lvl);
    // XP bar: jsgui3 Progress_Bar rather than a hand-built div + inline width.
    const xp = new Progress_Bar({
      context: this.context,
      value: s.player.xpInLevel,
      max: s.player.xpPerLevel
    });
    xp.dom.attributes['data-ps-xp'] = 'true';
    bar.add(xp);
    const xpl = this._el('div', 'ps-xp__label', xpLabelText(s.player));
    xpl.dom.attributes['data-ps-xp-label'] = 'true';
    bar.add(xpl);
    this.add(bar);

    // ---- stat chips: jsgui3 Stat_Card, the dashboard-metric control ----
    const chips = this._el('div', 'ps-chips');
    for (const def of CHIP_DEFS) {
      const card = new Stat_Card({ context: this.context, value: def.fmt(s.stats), label: def.label });
      // data-ps-chip marks the value node for the in-place refresh; Stat_Card
      // owns the markup, so the hook goes on the card itself.
      card.dom.attributes['data-ps-chip'] = def.key;
      chips.add(card);
    }
    this.add(chips);

    // ---- two columns: work | modules ----
    const cols = this._el('div', 'ps-cols');

    const work = new Panel({ context: this.context, title: 'WORK' });
    work.add_class('ps-panel');
    work.add(this._el('div', 'ps-quest-tag', 'CURRENT FOCUS'));
    const focus = this._el('div', 'ps-quest-main', `cycle ${s.mainQuest.cycle}: ${s.mainQuest.label}`);
    focus.dom.attributes['data-ps-focus'] = 'true';
    work.add(focus);
    work.add(this._el('div', 'ps-quest-tag', 'FOLLOW-UPS OWED'));
    // Containers always exist (even when empty) so the client can repopulate them.
    const owedBox = this._el('div', 'ps-list');
    owedBox.dom.attributes['data-ps-owed'] = 'true';
    if (s.sideQuests.length) for (const q of s.sideQuests) owedBox.add(this._el('div', 'ps-quest-item', owedText(q)));
    else owedBox.add(this._el('div', 'ps-quest-item ps-muted', 'none — all clear'));
    work.add(owedBox);
    // What the agent is doing right now (cycle 155) — the agent→owner direction,
    // rebuilt by the same client refresh that already runs every 60s.
    const actBox = this._el('div', 'ps-list');
    actBox.dom.attributes['data-ps-activity'] = 'true';
    for (const line of activityLines(s.agentActivity)) actBox.add(this._el('div', 'ps-quest-item ps-activity-line', line));
    work.add(actBox);
    const sigBox = this._el('div', 'ps-list');
    sigBox.dom.attributes['data-ps-signals'] = 'true';
    for (const sig of (s.pendingSignals || [])) {
      sigBox.add(this._el('div', 'ps-quest-item ps-signal-line', `⚡ SIGNAL PENDING — ${sig.tech} (clicked ${sig.at.slice(0, 16).replace('T', ' ')}; picked up at the agent's next orient)`));
    }
    work.add(sigBox);
    work.add(this._el('div', 'ps-quest-tag ps-blink', 'AWAITING OWNER DECISION'));
    for (const p of s.playerInput) work.add(this._el('div', 'ps-quest-item ps-input', p));
    work.add(this._el('div', 'ps-quest-tag', 'RECENT CYCLES'));
    const recentBox = this._el('div', 'ps-list');
    recentBox.dom.attributes['data-ps-recent'] = 'true';
    for (const r of s.recent) recentBox.add(this._el('div', `ps-quest-item${r.correction ? ' ps-retcon' : ''}`, recentText(r)));
    work.add(recentBox);
    cols.add(work);

    const modules = new Panel({ context: this.context, title: `MODULES — ${s.party.length}` });
    modules.add_class('ps-panel');
    const grid = this._el('div', 'ps-party');
    for (const m of s.party) {
      const card = this._el('div', `ps-card${m.danger ? ' ps-card--danger' : ''}`);
      card.dom.attributes['data-ps-card'] = m.name;
      card.add(this._el('div', 'ps-card__name', m.name));
      card.add(this._el('div', 'ps-card__role', m.role));
      const meta = this._el('div', 'ps-card__meta');
      meta.add(this._el('span', `ps-badge${m.status === 'ACTIVE' ? '' : ' ps-badge--dim'}`, m.status));
      const cond = this._el('span', `ps-cond${m.danger ? ' ps-cond--danger' : ''}`,
        m.danger ? `⚠ ${m.condition}` : m.condition);
      cond.dom.attributes['data-ps-cond'] = m.name;
      meta.add(cond);
      card.add(meta);
      if (m.lastCommit) card.add(this._el('div', 'ps-card__commit', `last commit ${m.lastCommit}`));
      grid.add(card);
    }
    modules.add(grid);
    cols.add(modules);
    this.add(cols);

    // ---- path ahead + tech tree ----
    const research = new Panel({ context: this.context, title: 'PATH AHEAD' });
    research.add_class('ps-panel');
    const strip = this._el('div', 'ps-road');
    strip.dom.attributes['data-ps-road'] = 'true';
    const roadCards = roadCardModels(s);
    roadCards.forEach((c, i) => {
      if (i > 0) strip.add(this._el('div', 'ps-road__arrow', '→'));
      const card = this._el('div', c.cls);
      card.add(this._el('div', 'ps-road__top', c.top));
      card.add(this._el('div', 'ps-road__main', c.main));
      if (c.sub) card.add(this._el('div', 'ps-road__sub', c.sub));
      strip.add(card);
    });
    research.add(strip);

    // ---- THE RESEARCH TREE (cycle 160): jsgui3 SVG controls + selectable
    // mixin + side detail panel. Deliberately the LARGEST section on the page.
    research.add(this._el('h2', 'ps-h', 'RESEARCH TREE — click a node to select it'));
    const treeWrap = this._el('div', 'ps-treeview');
    const scroll = this._el('div', 'ps-board-scroll');
    if (s.techTree && s.techTree.branches && s.techTree.branches.length) {
      scroll.add(new Tech_Tree_Board({ context: this.context, tree: s.techTree }));
    } else {
      scroll.add(this._el('div', 'ps-quest-item ps-muted', 'tree unavailable'));
    }
    treeWrap.add(scroll);
    treeWrap.add(new Tech_Detail_Panel({ context: this.context }));
    research.add(treeWrap);

    research.add(this._el('h2', 'ps-h', 'RESEARCH — TECH TREE BRANCHES'));
    if (s.techTree && s.techTree.error) {
      research.add(this._el('div', 'ps-quest-item ps-input', `tech tree unavailable: ${s.techTree.error}`));
    }
    const branchesBox = this._el('div', 'ps-branches');
    branchesBox.dom.attributes['data-ps-branches'] = 'true';
    for (const b of ((s.techTree && s.techTree.branches) || [])) {
      const m = branchCardModel(b);
      const card = this._el('a', 'ps-branch');
      card.dom.attributes.href = m.href;
      card.dom.attributes.style = `border-color:${m.color};`;
      card.add(this._el('div', 'ps-branch__t', m.title));
      card.add(this._el('div', 'ps-branch__tag', m.tagline));
      card.add(this._el('div', 'ps-branch__n', m.counts));
      branchesBox.add(card);
    }
    research.add(branchesBox);
    const absorbedLine = this._el('div', 'ps-tree__roots', absorbedText(s.techTree && s.techTree.absorbed));
    absorbedLine.dom.attributes['data-ps-absorbed'] = 'true';
    research.add(absorbedLine);
    this.add(research);

    // ---- signal log (migrated from the factory page, cycle 161) ----
    this.add(new Signal_Log({ context: this.context, history: s.signalHistory || [] }));

    // ---- history: the committed progress SVG, same data substrate ----
    const hist = new Panel({ context: this.context, title: 'HISTORY' });
    hist.add_class('ps-panel');
    const img = this._el('img', 'ps-history__img');
    img.dom.attributes.src = '/progress.svg';
    img.dom.attributes.alt = 'Cycle history: cumulative verified improvements and defects caught, rendered from the ledger';
    img.dom.attributes['data-ps-history'] = 'true';
    hist.add(img);
    this.add(hist);

    // ---- milestones ----
    const mile = new Panel({ context: this.context, title: 'MILESTONES' });
    mile.add_class('ps-panel');
    const row = this._el('div', 'ps-ach');
    for (const a of s.achievements) {
      const b = this._el('div', 'ps-ach__badge');
      b.add(this._el('div', 'ps-ach__icon', a.icon));
      b.add(this._el('div', 'ps-ach__label', a.label));
      b.add(this._el('div', 'ps-ach__detail', a.detail));
      row.add(b);
    }
    mile.add(row);
    this.add(mile);

    const foot = this._el('footer', 'ps-foot',
      'sources: IMPROVEMENT_LEDGER stanzas · repo-scope.json · RESEARCH_BACKLOG states · roadmap.json · annotations.json — every number recountable · ');
    const btn = this._el('button', 'ps-refresh', '↻ REFRESH');
    btn.dom.attributes['data-ps-refresh'] = 'true';
    foot.add(btn);
    const stamp = this._el('span', 'ps-stamp', '');
    stamp.dom.attributes['data-ps-stamp'] = 'true';
    foot.add(stamp);
    this.add(foot);
  }

  // Apply fresh /api/status data to the existing DOM — no reload, no re-render.
  _apply(s) {
    const root = this.dom.el;
    if (!root || !s || !s.player) return;
    // The detail panel reads from this index; every fetch refreshes it so the
    // panel's data is as fresh as the rest of the page.
    TECH_INDEX = buildNodeIndexFromTree(s.techTree);
    SIGNAL_HISTORY = s.signalHistory || [];
    // Signal log: hand the grid a new data source and let it re-render itself
    // (set_data_source → refresh_rows). No DOM building here — that is the
    // whole point of adopting Data_Grid.
    if (SIGNAL_GRID && SIGNAL_GRID.set_data_source) {
      SIGNAL_GRID.set_data_source(signalLogRows(SIGNAL_HISTORY));
    }
    const q = (sel) => root.querySelector(sel);
    const setText = (sel, text) => { const el = q(sel); if (el) el.textContent = text; };

    setText('[data-ps-total]', String(s.player.xpTotal));
    const xpBar = q('[data-ps-xp]');
    if (xpBar) xpBar.setAttribute('aria-valuenow', String(s.player.xpInLevel));
    const fill = q('[data-ps-xp] .jsgui-progress-fill');
    if (fill) fill.style.width = `${Math.round((s.player.xpInLevel / s.player.xpPerLevel) * 100)}%`;
    setText('[data-ps-xp-label]', xpLabelText(s.player));
    // Stat_Card owns its markup; the value lives in .stat-card-value.
    for (const def of CHIP_DEFS) setText(`[data-ps-chip="${def.key}"] .stat-card-value`, def.fmt(s.stats));
    setText('[data-ps-focus]', `cycle ${s.mainQuest.cycle}: ${s.mainQuest.label}`);

    const rebuild = (sel, items, build, emptyText) => {
      const box = q(sel);
      if (!box) return;
      while (box.firstChild) box.removeChild(box.firstChild);
      if (!items.length && emptyText) {
        const d = document.createElement('div');
        d.className = 'ps-quest-item ps-muted';
        d.textContent = emptyText;
        box.appendChild(d);
        return;
      }
      for (const it of items) box.appendChild(build(it));
    };
    rebuild('[data-ps-activity]', activityLines(s.agentActivity), (line) => {
      const d = document.createElement('div');
      d.className = 'ps-quest-item ps-activity-line';
      d.textContent = line;
      return d;
    }, null);
    rebuild('[data-ps-signals]', s.pendingSignals || [], (sig) => {
      const d = document.createElement('div');
      d.className = 'ps-quest-item ps-signal-line';
      d.textContent = `⚡ SIGNAL PENDING — ${sig.tech} (clicked ${sig.at.slice(0, 16).replace('T', ' ')}; picked up at the agent's next orient)`;
      return d;
    }, null);
    rebuild('[data-ps-owed]', s.sideQuests, (it) => {
      const d = document.createElement('div');
      d.className = 'ps-quest-item';
      d.textContent = owedText(it);
      return d;
    }, 'none — all clear');
    rebuild('[data-ps-recent]', s.recent, (it) => {
      const d = document.createElement('div');
      d.className = `ps-quest-item${it.correction ? ' ps-retcon' : ''}`;
      d.textContent = recentText(it);
      return d;
    }, null);

    for (const m of s.party) {
      const cond = q(`[data-ps-cond="${m.name}"]`);
      if (cond) {
        cond.textContent = m.danger ? `⚠ ${m.condition}` : m.condition;
        cond.className = `ps-cond${m.danger ? ' ps-cond--danger' : ''}`;
      }
      const card = q(`[data-ps-card="${m.name}"]`);
      if (card) card.className = `ps-card${m.danger ? ' ps-card--danger' : ''}`;
    }

    // path ahead + tech tree — rebuilt from the same models the server composed with
    const road = q('[data-ps-road]');
    if (road && s.roadmap) {
      while (road.firstChild) road.removeChild(road.firstChild);
      roadCardModels(s).forEach((c, i) => {
        if (i > 0) {
          const a = document.createElement('div');
          a.className = 'ps-road__arrow';
          a.textContent = '→';
          road.appendChild(a);
        }
        const card = document.createElement('div');
        card.className = c.cls;
        for (const [cls, text] of [['ps-road__top', c.top], ['ps-road__main', c.main], ['ps-road__sub', c.sub]]) {
          if (!text) continue;
          const d = document.createElement('div');
          d.className = cls;
          d.textContent = text;
          card.appendChild(d);
        }
        road.appendChild(card);
      });
    }
    if (s.techTree && Array.isArray(s.techTree.branches)) {
      setText('[data-ps-absorbed]', absorbedText(s.techTree.absorbed));
      const box = q('[data-ps-branches]');
      if (box) {
        while (box.firstChild) box.removeChild(box.firstChild);
        for (const b of s.techTree.branches) {
          const m = branchCardModel(b);
          const card = document.createElement('a');
          card.className = 'ps-branch';
          card.href = m.href;
          card.style.borderColor = m.color;
          for (const [cls, text] of [['ps-branch__t', m.title], ['ps-branch__tag', m.tagline], ['ps-branch__n', m.counts]]) {
            const d = document.createElement('div');
            d.className = cls;
            d.textContent = text;
            card.appendChild(d);
          }
          box.appendChild(card);
        }
      }
    }

    const img = q('[data-ps-history]');
    if (img) img.src = `/progress.svg?t=${Date.now()}`; // regenerated picture shows next refresh
    setText('[data-ps-stamp]', `updated ${new Date().toLocaleTimeString()}`);
  }

  activate() {
    if (!this.__active) {
      super.activate();
      PAGE_WIDGET = this;
      // Visible proof activation ran (checked by the verification pass).
      this.add_class('ps-client-active');
      // Hash routing (cycle 161): the old tech-page URLs 302 here as
      // #branch= / #node= . Applied after the first paint so NODE_CTRLS is
      // populated. (Deliberately not written with slash-star in this comment:
      // that character pair opens a block comment for naive strippers — the
      // progress-surface probe's analyzer lost 6KB of code to it.)
      setTimeout(applyHash, 60);
      window.addEventListener('hashchange', applyHash);
      const refresh = () => {
        fetch('/api/status', { cache: 'no-store' })
          .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
          .then((s) => this._apply(s))
          .catch(() => {
            const el = this.dom.el && this.dom.el.querySelector('[data-ps-stamp]');
            if (el) el.textContent = 'refresh failed — server away?';
          });
      };
      this.add_dom_event_listener('click', (e) => {
        const t = e && (e.target || e.srcElement);
        if (t && t.getAttribute && t.getAttribute('data-ps-refresh')) refresh();
      });
      // Refresh IMMEDIATELY, not only on the interval. The Server({Ctrl}) recipe
      // serves the page through HTTP_Webpage_Publisher, which renders the SSR HTML
      // ONCE at publish (server start) — so the markup a visitor first sees carries
      // whatever the numbers were when the server booted, and stays that way until
      // the client rewrites it. Without this call that was a full 60 s of confidently
      // wrong numbers on every page load (measured: SSR said 82 cycles while the same
      // process's /api/status said 84).
      refresh();
      setInterval(refresh, 60000);
    }
  }
}

Status_Widget.css = `
.ps-root { min-height: 100vh; background: #101216; color: #e8e4d8; font-family: 'Segoe UI', system-ui, sans-serif; padding: 20px 24px; box-sizing: border-box; }
.ps-root * { box-sizing: border-box; }
.ps-player { border: 2px solid #2e3440; background: #171a20; border-radius: 8px; padding: 14px 18px; }
.ps-studio { font-size: 13px; letter-spacing: 0.18em; color: #8a8778; }
.ps-level { display: flex; align-items: baseline; gap: 12px; margin-top: 4px; }
.ps-level__num { font-size: 26px; font-weight: 700; color: #b8862e; font-variant-numeric: tabular-nums; }
.ps-level__title { font-size: 15px; letter-spacing: 0.08em; text-transform: uppercase; }
.ps-xp { height: 14px; border: 2px solid #2e3440; border-radius: 4px; margin-top: 8px; background: #0c0e11; overflow: hidden; }
.ps-xp__fill { height: 100%; background: repeating-linear-gradient(90deg, #b8862e 0 8px, #9a7026 8px 16px); }
.ps-xp__label { margin-top: 6px; font-size: 11px; color: #8a8778; font-variant-numeric: tabular-nums; }
.ps-chips { display: flex; gap: 10px; margin: 14px 0; flex-wrap: wrap; }
.ps-chip { border: 2px solid #2e3440; background: #171a20; border-radius: 6px; padding: 8px 14px; display: flex; flex-direction: column; min-width: 108px; }
.ps-chip__v { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
.ps-chip__l { font-size: 10px; color: #8a8778; text-transform: uppercase; letter-spacing: 0.06em; }
.ps-cols { display: grid; grid-template-columns: minmax(300px, 5fr) minmax(320px, 7fr); gap: 14px; align-items: start; }
@media (max-width: 900px) { .ps-cols { grid-template-columns: 1fr; } }
.ps-panel { border: 2px solid #2e3440; background: #171a20; border-radius: 8px; padding: 12px 16px; margin-bottom: 14px; }
.ps-h { font-size: 12px; letter-spacing: 0.16em; color: #b8862e; margin: 0 0 10px; }
.ps-quest-tag { font-size: 10px; letter-spacing: 0.14em; color: #8a8778; margin: 10px 0 4px; }
.ps-quest-main { font-size: 13px; color: #e8e4d8; border-left: 3px solid #b8862e; padding-left: 8px; }
.ps-quest-item { font-size: 12px; color: #b9b4a4; padding: 2px 0 2px 8px; }
.ps-quest-item.ps-input { color: #e8e4d8; border-left: 3px solid #b34d4d; margin: 2px 0; }
.ps-quest-item.ps-retcon { color: #b34d4d; }
.ps-muted { color: #6b675a; font-style: italic; }
.ps-blink { color: #b34d4d; animation: ps-blink 1.4s steps(2) infinite; }
@keyframes ps-blink { 50% { opacity: 0.35; } }
.ps-party { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
.ps-card { border: 2px solid #2e3440; border-radius: 6px; padding: 8px 10px; background: #12151a; }
.ps-card--danger { border-color: #b34d4d; }
.ps-card__name { font-size: 12px; font-weight: 700; }
.ps-card__role { font-size: 10px; color: #8a8778; min-height: 24px; margin: 2px 0 6px; }
.ps-card__meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.ps-badge { font-size: 9px; letter-spacing: 0.1em; padding: 2px 6px; border-radius: 3px; background: #55a377; color: #0c0e11; font-weight: 700; }
.ps-badge--dim { background: #2e3440; color: #b9b4a4; }
.ps-cond { font-size: 10px; color: #8a8778; }
.ps-cond--danger { color: #b34d4d; font-weight: 700; }
.ps-card__commit { font-size: 9px; color: #6b675a; margin-top: 5px; }
.ps-history__img { display: block; width: 100%; height: auto; border: 2px solid #2e3440; border-radius: 6px; background: #101216; }
.ps-ach { display: flex; gap: 10px; flex-wrap: wrap; }
.ps-ach__badge { border: 2px solid #b8862e; border-radius: 6px; padding: 8px 12px; background: #12151a; min-width: 150px; }
.ps-ach__icon { font-size: 18px; color: #b8862e; }
.ps-ach__label { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; }
.ps-ach__detail { font-size: 10px; color: #8a8778; }
.ps-road { display: flex; align-items: stretch; gap: 8px; overflow-x: auto; padding: 4px 0 10px; }
.ps-road__card { flex: 0 0 auto; min-width: 180px; max-width: 250px; background: #101216; border: 2px solid #2e3440; border-radius: 6px; padding: 8px 10px; }
.ps-road__card--now { border-color: #b8862e; box-shadow: 0 0 0 1px rgba(184,134,46,0.35); }
.ps-road__card--future { border-style: dashed; opacity: 0.55; }
.ps-road__top { font-size: 9px; letter-spacing: 0.14em; color: #8a8778; margin-bottom: 4px; }
.ps-road__main { font-size: 12px; font-weight: 600; color: #e8e4d8; }
.ps-road__sub { font-size: 10px; color: #8a8778; margin-top: 4px; }
.ps-road__arrow { align-self: center; color: #b8862e; font-size: 16px; flex: 0 0 auto; }
.ps-signal-line { color: #9fd4ec; border-left: 2px solid #4d9ec8; padding-left: 8px; }
.ps-activity-line { color: #8fd0a8; border-left: 2px solid #55a377; padding-left: 8px; }
.ps-tree__roots { font-size: 10px; color: #6b675a; border-top: 1px dashed #2e3440; padding-top: 6px; margin-top: 8px; }
/* ---- migrated app pieces (cycle 161) ---- */
.ps-live { display: flex; align-items: center; gap: 8px; padding: 5px 10px; margin-bottom: 10px; background: #0d1014; border: 1px solid #1b1f26; border-radius: 5px; font-size: 11px; }
.ps-live__dot { width: 8px; height: 8px; border-radius: 50%; background: #6b675a; flex: none; }
.ps-live__dot--busy { background: #55a377; box-shadow: 0 0 6px #55a377; }
.ps-live__dot--idle { background: #4a4a4a; }
.ps-live__text { color: #8a8778; }
.ps-settings { position: fixed; top: 10px; right: 12px; z-index: 40; }
.ps-settings__gear { background: #171a20; border: 2px solid #2e3440; color: #b8862e; border-radius: 6px; font-size: 15px; padding: 3px 8px; cursor: pointer; }
.ps-settings__gear:hover { border-color: #b8862e; }
.ps-settings__dlg { background: #14171c; color: #e8e4d8; border: 2px solid #b8862e; border-radius: 8px; padding: 16px 18px; min-width: 260px; }
.ps-settings__dlg::backdrop { background: rgba(6,8,11,0.7); }
.ps-settings__label { font-size: 12px; margin-bottom: 8px; color: #cfcabd; }
.ps-settings__dlg input[type=range] { width: 100%; }
.ps-settings__reset { margin-top: 10px; background: #171a20; color: #8a8778; border: 1px solid #2e3440; border-radius: 4px; padding: 3px 10px; font-size: 10px; cursor: pointer; }
.ps-siglog__row { color: #9fd4ec; border-left: 2px solid #2e3440; padding-left: 8px; font-variant-numeric: tabular-nums; }
.ps-detail__trail { margin-top: 4px; }
/* ---- research tree board (cycle 160: jsgui3 SVG controls + selectable) ---- */
.ps-treeview { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 12px; align-items: start; margin-bottom: 14px; }
@media (max-width: 1000px) { .ps-treeview { grid-template-columns: 1fr; } }
.ps-board-scroll { overflow: auto; border: 2px solid #2e3440; border-radius: 6px; background: #0c0e11; max-height: 74vh; }
.ps-board { display: block; }
.ps-board__band { font-size: 12px; font-weight: 700; letter-spacing: 0.14em; font-family: 'Segoe UI', system-ui, sans-serif; }
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
.ps-detail { border: 2px solid #2e3440; border-radius: 6px; background: #101216; padding: 12px 14px; position: sticky; top: 10px; max-height: 74vh; overflow: auto; }
.ps-detail__empty { font-size: 11px; color: #6b675a; font-style: italic; }
.ps-detail__id { font-size: 11px; letter-spacing: 0.1em; font-weight: 700; }
.ps-detail__title { font-size: 14px; font-weight: 700; color: #e8e4d8; margin: 2px 0 2px; }
.ps-detail__meta { font-size: 10px; color: #8a8778; margin-bottom: 8px; }
.ps-detail__h { font-size: 9px; letter-spacing: 0.14em; color: #b8862e; margin: 10px 0 3px; }
.ps-detail__p { font-size: 11px; color: #b9b4a4; line-height: 1.45; }
.ps-detail__p--fact { border-left: 2px solid #2e3440; padding-left: 7px; margin: 4px 0; }
.ps-detail__more { font-size: 9.5px; color: #6b675a; font-style: italic; }
.ps-detail__chips { display: flex; gap: 5px; flex-wrap: wrap; }
.ps-detail__chip { font-size: 9.5px; border: 1px solid #3a4150; border-radius: 3px; padding: 1px 6px; color: #8a8778; }
.ps-detail__links { margin: 10px 0 8px; }
.ps-detail__links a { font-size: 10px; color: #4d9ec8; }
.ps-begin { display: block; width: 100%; margin-top: 6px; padding: 9px 10px; font-size: 12px; letter-spacing: 0.1em; font-weight: 700; border-radius: 5px; border: 2px solid #2e3440; background: #14171c; color: #6b675a; cursor: default; font-family: inherit; }
.ps-begin--armed { border-color: #b8862e; color: #ffd479; background: #241d10; cursor: pointer; box-shadow: 0 0 10px rgba(184,134,46,0.45); animation: ps-armed 1.6s ease-in-out infinite; }
.ps-begin--armed:hover { background: #b8862e; color: #0c0e11; }
@keyframes ps-armed { 50% { box-shadow: 0 0 18px rgba(184,134,46,0.75); } }
.ps-branches { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
@media (max-width: 760px) { .ps-branches { grid-template-columns: 1fr; } }
.ps-branch { display: block; background: #101216; border: 2px solid #2e3440; border-radius: 6px; padding: 10px 12px; text-decoration: none; color: inherit; }
.ps-branch:hover { background: #14171c; box-shadow: 0 0 8px rgba(184,134,46,0.15); }
.ps-branch__t { font-size: 13px; font-weight: 600; letter-spacing: 0.08em; color: #e8e4d8; }
.ps-branch__tag { font-size: 10px; color: #8a8778; margin-top: 4px; }
.ps-branch__n { font-size: 9.5px; color: #6b675a; margin-top: 6px; font-variant-numeric: tabular-nums; }
.ps-tech--seed { border-style: dashed; opacity: 0.5; color: #8a8778; font-size: 10px; text-align: center; }
.ps-tree { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
@media (max-width: 900px) { .ps-tree { grid-template-columns: repeat(2, 1fr); } }
.ps-tree__head { font-size: 10px; letter-spacing: 0.12em; color: #8a8778; border-bottom: 1px solid #2e3440; padding-bottom: 4px; margin-bottom: 6px; }
.ps-tech { background: #101216; border: 1px solid #2e3440; border-left: 3px solid #2e3440; border-radius: 4px; padding: 6px 8px; margin-bottom: 6px; }
.ps-tech__t { font-size: 11px; color: #e8e4d8; }
.ps-tech__s { font-size: 9.5px; color: #8a8778; margin-top: 3px; }
.ps-tech--done { opacity: 0.62; border-left-color: #55a377; }
.ps-tech--avail { border-color: #b8862e; border-left-color: #b8862e; box-shadow: 0 0 6px rgba(184,134,46,0.18); }
.ps-tech--gated { border-left-color: #b34d4d; opacity: 0.8; }
.ps-tech--future { border-style: dashed; opacity: 0.45; text-align: center; }
.ps-foot { font-size: 10px; color: #6b675a; margin-top: 4px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ps-refresh { background: #171a20; color: #b8862e; border: 2px solid #b8862e; border-radius: 4px; font-size: 10px; letter-spacing: 0.1em; padding: 4px 10px; cursor: pointer; }
.ps-refresh:hover { background: #b8862e; color: #0c0e11; }
.ps-stamp { color: #8a8778; font-variant-numeric: tabular-nums; }
`;

class Project_Status_Page extends Active_HTML_Document {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'project_status_page';
    super(spec);
    if (!spec.el) {
      this.title = 'Project Status — news-crawler ecosystem';
      // Tab identity (cycle 143). Guarded: only if this document control exposes head.
      try {
        if (this.head) {
          const icon = new Control({ context: this.context, tagName: 'link' });
          icon.dom.attributes.rel = 'icon';
          icon.dom.attributes.type = 'image/svg+xml';
          icon.dom.attributes.href = '/favicon.svg';
          this.head.add(icon);
        }
      } catch (_) { /* head not exposed by this jsgui3 version — favicon.ico route still serves */ }
      const get = Project_Status_Page.get_status;
      const status = typeof get === 'function' ? get() : null;
      this.body.add(new Status_Widget({ context: this.context, status }));
    }
  }
}
// Injected by server.js before rendering; stays null in the browser bundle.
Project_Status_Page.get_status = null;

// Registration for client reattachment — jsgui3-client resolves data-jsgui-type
// through jsgui.controls; both key casings registered (lookup casing varies).
jsgui.controls = jsgui.controls || {};
jsgui.controls.status_widget = Status_Widget;
jsgui.controls.Status_Widget = Status_Widget;
jsgui.controls.project_status_page = Project_Status_Page;
jsgui.controls.Project_Status_Page = Project_Status_Page;
jsgui.controls.tech_tree_node = Tech_Tree_Node;
jsgui.controls.Tech_Tree_Node = Tech_Tree_Node;
jsgui.controls.tech_tree_board = Tech_Tree_Board;
jsgui.controls.Tech_Tree_Board = Tech_Tree_Board;
jsgui.controls.tech_detail_panel = Tech_Detail_Panel;
jsgui.controls.Tech_Detail_Panel = Tech_Detail_Panel;
jsgui.controls.live_strip = Live_Strip;
jsgui.controls.Live_Strip = Live_Strip;
jsgui.controls.settings_control = Settings_Control;
jsgui.controls.Settings_Control = Settings_Control;
jsgui.controls.signal_log = Signal_Log;
jsgui.controls.Signal_Log = Signal_Log;

module.exports = { Status_Widget, Project_Status_Page };
