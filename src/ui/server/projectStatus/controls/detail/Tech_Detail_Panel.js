'use strict';

const { Control, Data_Grid, Key_Value_Table, Chip, Button } = require('../shared/jsgui');
const { el } = require('../shared/el');
const { of_type } = require('../shared/page-controls');
const { activate_children } = require('../shared/activate-children');
const { kindLabel, signalRow } = require('../shared/models');

/**
 * Tech_Detail_Panel — the selected node's record, beside the board.
 *
 * Owner directive: single click selects, and the data appears in a part of the
 * screen — never a modal. Everything here is composed from controls (clear() +
 * compose is the framework's own repaint idiom, the same one
 * Chart_Base.render_chart uses), so escaping is structural and the facts,
 * chips, tables and button are real controls rather than concatenated markup.
 */
class Tech_Detail_Panel extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'tech_detail_panel';
    super({ ...spec, tagName: 'aside' });
    this.add_class('ps-detail');
    if (!spec.el) {
      this.add(el(this.context, 'div', 'ps-detail__empty', 'Select a node on the tree — its data appears here.'));
    }
  }

  activate() {
    if (this.__active) return;
    super.activate();
    // Delegated: BEGIN RESEARCH is re-composed on every selection, so the
    // handler lives on the panel (which stays activated) and reads the current
    // selection from begin_tech.
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

  show(id) {
    const tree = of_type(this, 'tree_view');
    const n = tree && tree.index[id];
    if (!n) return;
    const ctx = this.context;
    this.clear();

    const line = (cls, text, style) => {
      const c = el(ctx, 'div', cls, text);
      if (style) c.dom.attributes.style = style;
      this.add(c);
      return c;
    };

    line('ps-detail__id', n.id, `color:${n.color}`);
    line('ps-detail__title', n.title || n.id);

    const facts = { branch: n.branchLabel || '', state: kindLabel(n) };
    if (n.priority) facts.priority = n.priority;
    if (n.lastUpdate) facts.updated = n.lastUpdate;
    this.add(new Key_Value_Table({ context: ctx, data: facts }));

    if (n.research) { line('ps-detail__h', 'RESEARCH MEANS'); line('ps-detail__p', n.research); }
    if (n.note && !n.research) { line('ps-detail__h', 'WHAT THIS IS'); line('ps-detail__p', n.note); }

    if ((n.prereqs || []).length) {
      line('ps-detail__h', 'BUILT FROM');
      const box = el(ctx, 'div', 'ps-detail__chips');
      // Chip's display text is spec.LABEL. Passing `text` rendered 54 nodes'
      // worth of blank pills for two cycles, and a live check that counted the
      // chips rather than reading them did not catch it.
      for (const pr of n.prereqs) box.add(new Chip({ context: ctx, label: pr.id }));
      this.add(box);
    }

    for (const [head, list] of [['DETAIL — from the record', n.detail], ['PRELIMINARY DATA', n.prelim]]) {
      if ((list || []).length) {
        line('ps-detail__h', head);
        for (const item of list.slice(0, 4)) line('ps-detail__p ps-detail__p--fact', '▪ ' + item);
        if (list.length > 4) line('ps-detail__more', `${list.length - 4} more in the record`);
      }
    }

    const mine = (tree.history || [])
      .filter((s) => s.tech === n.id)
      .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    if (mine.length) {
      line('ps-detail__h', `YOUR REQUESTS — ${mine.length}`);
      this.add(new Data_Grid({
        context: ctx,
        columns: ['state', 'when', 'note'],
        aria_label: 'Your requests for this technology',
        rows: mine.slice(0, 5).map((s) => {
          const row = signalRow(s);
          delete row.tech;
          return row;
        })
      }));
    }

    // LEDGER TRAIL — STATIC rows, resolved before composing.
    //
    // Data_Grid supports an async data_source, but a control added to an
    // ALREADY-ACTIVATED parent has its markup inserted without being activated,
    // so a re-render after the promise resolves never reaches the DOM
    // (measured: the grid sat in .loading / aria-busy forever while the
    // endpoint returned fine). So the data is fetched first and handed in as an
    // array; the per-node cache on Tree_View makes re-selection instant, and
    // the second show() call is what paints the rows.
    line('ps-detail__h', 'LEDGER TRAIL');
    const cached = tree.trails[n.id];
    if (cached === undefined) {
      line('ps-detail__more', 'loading ledger trail…');
      fetch(`/api/node?id=${encodeURIComponent(n.id)}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((j) => {
          tree.trails[n.id] = (j.ledgerTrail || []).slice(-8).reverse()
            .map((tr) => ({ cycle: 'c' + tr.cycle, date: tr.date, what: tr.label }));
          if (tree.selected && tree.selected.techId === n.id) this.show(n.id);
        })
        .catch(() => { tree.trails[n.id] = []; });
    } else if (cached.length) {
      this.add(new Data_Grid({ context: ctx, columns: ['cycle', 'date', 'what'], rows: cached, aria_label: 'Ledger trail for this technology' }));
    } else {
      line('ps-detail__more', 'no ledger cycle mentions this id yet — the trail writes itself as work lands');
    }

    const links = el(ctx, 'div', 'ps-detail__links');
    const a = el(ctx, 'a', null, 'permalink to this node ↗');
    a.dom.attributes.href = `/#node=${encodeURIComponent(n.id)}`;
    links.add(a);
    this.add(links);

    const armed = n.kind === 'avail';
    const btn = new Button({ context: ctx, text: armed ? '⚡ BEGIN RESEARCH' : 'not researchable' });
    btn.add_class(armed ? 'ps-begin ps-begin--armed' : 'ps-begin');
    if (!armed) btn.dom.attributes.disabled = 'disabled';
    this.add(btn);
    this.begin_button = btn;
    this.begin_tech = armed ? n : null;

    activate_children(this);
  }
}

Tech_Detail_Panel.css = `
.ps-detail { border: 2px solid #2e3440; border-radius: 6px; background: #101216; padding: 12px 14px; position: sticky; top: 10px; max-height: 74vh; overflow: auto; }
.ps-detail__empty { font-size: 11px; color: #6b675a; font-style: italic; }
.ps-detail__id { font-size: 11px; letter-spacing: 0.1em; font-weight: 700; }
.ps-detail__title { font-size: 14px; font-weight: 700; color: #e8e4d8; margin: 2px 0 2px; }
.ps-detail__h { font-size: 9px; letter-spacing: 0.14em; color: #b8862e; margin: 10px 0 3px; }
.ps-detail__p { font-size: 11px; color: #b9b4a4; line-height: 1.45; }
.ps-detail__p--fact { border-left: 2px solid #2e3440; padding-left: 7px; margin: 4px 0; }
.ps-detail__more { font-size: 9.5px; color: #6b675a; font-style: italic; }
.ps-detail__chips { display: flex; gap: 5px; flex-wrap: wrap; }
/* Adopted stock controls, seated in this page's palette. Key_Value_Table and
   Chip ship light-themed defaults (white / #f1f5f9), which read as holes cut in
   a dark panel; Data_Grid already ships dark and only needs the density.
   Restyling here rather than forking the controls keeps the adoption real. */
.ps-detail .jsgui-kv-table { background: transparent; border: 1px solid #2e3440; border-radius: 4px; margin-bottom: 4px; }
.ps-detail .kv-row-striped { background: rgba(255,255,255,0.025); }
.ps-detail .kv-key { color: #8a8778; font-size: 9.5px; letter-spacing: 0.08em; text-transform: uppercase; padding: 3px 7px; }
.ps-detail .kv-value, .ps-detail .kv-value-text { color: #e8e4d8; font-size: 11px; padding: 3px 7px; }
.ps-detail .chip { background: #14171c; color: #9a9484; border: 1px solid #3a4150; font-size: 9.5px; padding: 1px 7px; }
.ps-detail .data-table { background: transparent; font-size: 10px; }
.ps-detail .data-table-header { background: #14171c; color: #8a8778; font-size: 9px; letter-spacing: 0.1em; }
.ps-detail .data-table-cell { color: #b9b4a4; font-size: 10px; padding: 3px 6px; }
.ps-detail__links { margin: 10px 0 8px; }
.ps-detail__links a { font-size: 10px; color: #4d9ec8; }
.ps-detail__trail { margin-top: 4px; }
.ps-begin { display: block; width: 100%; margin-top: 6px; padding: 9px 10px; font-size: 12px; letter-spacing: 0.1em; font-weight: 700; border-radius: 5px; border: 2px solid #2e3440; background: #14171c; color: #6b675a; cursor: default; font-family: inherit; }
.ps-begin--armed { border-color: #b8862e; color: #ffd479; background: #241d10; cursor: pointer; box-shadow: 0 0 10px rgba(184,134,46,0.45); animation: ps-armed 1.6s ease-in-out infinite; }
.ps-begin--armed:hover { background: #b8862e; color: #0c0e11; }
@keyframes ps-armed { 50% { box-shadow: 0 0 18px rgba(184,134,46,0.75); } }
`;

module.exports = Tech_Detail_Panel;
