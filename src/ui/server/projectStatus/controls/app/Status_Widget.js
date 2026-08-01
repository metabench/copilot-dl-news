'use strict';

const { Control, Panel } = require('../shared/jsgui');
const { el } = require('../shared/el');
const { of_type } = require('../shared/page-controls');

const Live_Strip = require('../hub/Live_Strip');
const Settings_Control = require('../hub/Settings_Control');
const Player_Bar = require('../hub/Player_Bar');
const Stat_Chips = require('../hub/Stat_Chips');
const Signal_Log = require('../hub/Signal_Log');
const History_Panel = require('../hub/History_Panel');
const Milestones_Panel = require('../hub/Milestones_Panel');
const Status_Footer = require('../hub/Status_Footer');
const Work_Panel = require('../work/Work_Panel');
const Modules_Panel = require('../work/Modules_Panel');
const Road_Strip = require('../tree/Road_Strip');
const Branch_Cards = require('../tree/Branch_Cards');
const Tree_View = require('../tree/Tree_View');

/**
 * Status_Widget — the application control: it lays the page out and, on fresh
 * data, tells each part to update itself.
 *
 * `_apply` used to rebuild six lists with document.createElement. It no longer
 * builds anything: each section is a control that owns its own markup and knows
 * how to repaint from a model, so the page's job is dispatch. That is what
 * makes the difference between a jsgui3 app and markup with a framework around
 * it — the thing that renders a list is the thing that re-renders it.
 */
class Status_Widget extends Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'status_widget';
    super({ ...spec, tagName: 'div' });
    this.add_class('ps-root');
    if (!spec.el) this.compose(spec.status || null);
  }

  compose(s) {
    const ctx = this.context;
    if (!s) {
      this.add(el(ctx, 'p', 'ps-empty', 'No status data — is the ledger readable?'));
      return;
    }

    this.add(new Live_Strip({ context: ctx }));
    this.add(new Settings_Control({ context: ctx }));
    this.add(new Player_Bar({ context: ctx, player: s.player }));
    this.add(new Stat_Chips({ context: ctx, stats: s.stats }));

    const cols = el(ctx, 'div', 'ps-cols');
    cols.add(new Work_Panel({ context: ctx, status: s }));
    cols.add(new Modules_Panel({ context: ctx, party: s.party }));
    this.add(cols);

    // PATH AHEAD + the research tree — deliberately the largest section.
    const research = new Panel({ context: ctx, title: 'PATH AHEAD' });
    research.add_class('ps-panel');
    research.add(new Road_Strip({ context: ctx, status: s }));
    research.add(el(ctx, 'h2', 'ps-h', 'RESEARCH TREE — click a node to select it'));
    research.add(new Tree_View({ context: ctx, tree: s.techTree, history: s.signalHistory || [] }));
    research.add(el(ctx, 'h2', 'ps-h', 'RESEARCH — TECH TREE BRANCHES'));
    if (s.techTree && s.techTree.error) {
      research.add(el(ctx, 'div', 'ps-quest-item ps-input', `tech tree unavailable: ${s.techTree.error}`));
    }
    research.add(new Branch_Cards({ context: ctx, tree: s.techTree }));
    this.add(research);

    this.add(new Signal_Log({ context: ctx, history: s.signalHistory || [] }));
    this.add(new History_Panel({ context: ctx }));
    this.add(new Milestones_Panel({ context: ctx, achievements: s.achievements }));
    this.add(new Status_Footer({ context: ctx }));
  }

  /** Fresh /api/status: hand each part its model. No DOM built here. */
  _apply(s) {
    if (!this.dom.el || !s || !s.player) return;
    // One part failing must not stop the others — but it must not be SILENT
    // either. A swallowed catch here is what let the signal log sit empty
    // through several cycles while everything around it refreshed correctly.
    const to = (type, fn) => {
      const c = of_type(this, type);
      if (!c) { console.warn('[project-status] no control of type', type); return; }
      try { fn(c); } catch (e) { console.error('[project-status] update failed for', type, e); }
    };
    to('player_bar', (c) => c.set_player(s.player));
    to('stat_chips', (c) => c.set_stats(s.stats));
    to('work_panel', (c) => c.set_status(s));
    to('modules_panel', (c) => c.set_party(s.party));
    to('road_strip', (c) => c.set_status(s));
    to('tree_view', (c) => c.set_status(s));
    to('branch_cards', (c) => c.set_tree(s.techTree));
    to('signal_log', (c) => c.set_history(s.signalHistory || []));
    to('history_panel', (c) => c.bust(Date.now()));
    to('status_footer', (c) => c.set_stamp(`updated ${new Date().toLocaleTimeString()}`));
  }

  activate() {
    if (this.__active) return;
    super.activate();
    this.add_class('ps-client-active'); // visible proof activation ran
    const refresh = () => {
      fetch('/api/status', { cache: 'no-store' })
        .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
        .then((s) => this._apply(s))
        .catch(() => {
          const footer = of_type(this, 'status_footer');
          if (footer) footer.set_stamp('refresh failed — server away?');
        });
    };
    this.add_dom_event_listener('click', (e) => {
      const t = e && (e.target || e.srcElement);
      if (t && t.getAttribute && t.getAttribute('data-ps-refresh')) refresh();
    });
    // Refresh IMMEDIATELY, not only on the interval. Server({Ctrl}) publishes
    // the SSR HTML ONCE at server start, so the markup a visitor first sees
    // carries whatever the numbers were at boot and stays that way until the
    // client rewrites it — measured at 82 cycles in the markup while the same
    // process's /api/status said 84.
    refresh();
    setInterval(refresh, 60000);
  }
}

Status_Widget.css = `
.ps-root { min-height: 100vh; background: #101216; color: #e8e4d8; font-family: 'Segoe UI', system-ui, sans-serif; padding: 20px 24px; box-sizing: border-box; }
.ps-root * { box-sizing: border-box; }
.ps-cols { display: grid; grid-template-columns: minmax(300px, 5fr) minmax(320px, 7fr); gap: 14px; align-items: start; }
@media (max-width: 900px) { .ps-cols { grid-template-columns: 1fr; } }
.ps-panel { border: 2px solid #2e3440; background: #171a20; border-radius: 8px; padding: 12px 16px; margin-bottom: 14px; }
.ps-h { font-size: 12px; letter-spacing: 0.16em; color: #b8862e; margin: 0 0 10px; }
.ps-empty { color: #b34d4d; }
`;

module.exports = Status_Widget;
