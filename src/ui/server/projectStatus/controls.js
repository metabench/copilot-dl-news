'use strict';

/**
 * controls.js — project-status page controls (isomorphic esbuild entry).
 *
 * Uses the full jsgui3 trio per the owner ask:
 *   server: jsgui3-html composes + jsgui3-server SSRs and bundles this file;
 *   browser: jsgui3-client (required below) SELF-ACTIVATES on window load —
 *   it builds a Client_Page_Context, merges jsgui.controls, and reattaches by
 *   data-jsgui-id/type. Custom controls therefore must be REGISTERED on
 *   jsgui.controls before load fires (done at the bottom). Missing that
 *   registration + the jsgui3-client require was why activation silently
 *   no-opped on the first build of this page.
 *
 * Data flow: server.js injects Project_Status_Page.get_status before render;
 * compose runs only server-side (!spec.el). statusData.js (fs/git) is never
 * required from here, so the browser bundle stays clean.
 *
 * Design per owner (2026-07-27, refined mid-review): game-UI VISUAL language —
 * chunky panels, striped progress bar, status cards, badges — but plain
 * engineering VOCABULARY. Palette = the validated progress-SVG set.
 */

const IS_BROWSER = typeof window !== 'undefined' && typeof document !== 'undefined';
// Both branches are statically bundled by esbuild; only one executes per environment.
// jsgui3-client/jsgui3-server are consume-only siblings (owner ruling 2026-07-27).
const jsgui = IS_BROWSER
  ? require('../../../../../jsgui3-client/client')
  : require('jsgui3-html');
const { Control } = jsgui;
const Active_HTML_Document = require('../../../../../jsgui3-server/controls/Active_HTML_Document');

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

    // ---- header: totals + progress toward the next improvement milestone ----
    const bar = this._el('header', 'ps-player');
    bar.add(this._el('div', 'ps-studio', 'PROJECT STATUS — news-crawler ecosystem'));
    const lvl = this._el('div', 'ps-level');
    lvl.add(this._el('span', 'ps-level__num', String(s.player.xpTotal)));
    lvl.add(this._el('span', 'ps-level__title', 'verified improvements'));
    bar.add(lvl);
    const xp = this._el('div', 'ps-xp');
    const fill = this._el('div', 'ps-xp__fill');
    fill.dom.attributes.style = `width:${Math.round((s.player.xpInLevel / s.player.xpPerLevel) * 100)}%;`;
    xp.add(fill);
    bar.add(xp);
    bar.add(this._el('div', 'ps-xp__label',
      `${s.player.xpPerLevel - s.player.xpInLevel} to the next ${s.player.xpPerLevel}-improvement milestone · data through ${s.player.dataThrough}`));
    this.add(bar);

    // ---- stat chips ----
    const chips = this._el('div', 'ps-chips');
    for (const [v, l] of [
      [s.stats.cycles, 'cycles recorded'], [`${s.stats.preShipPct}%`, 'defects caught pre-ship'],
      [s.stats.defectsPre, 'defects found'], [s.stats.corrections, 'corrections issued'],
      [`${(s.stats.pages / 1000).toFixed(1)}k`, 'pages archived']
    ]) {
      const chip = this._el('div', 'ps-chip');
      chip.add(this._el('span', 'ps-chip__v', v));
      chip.add(this._el('span', 'ps-chip__l', l));
      chips.add(chip);
    }
    this.add(chips);

    // ---- two columns: work | modules ----
    const cols = this._el('div', 'ps-cols');

    const work = this._el('section', 'ps-panel');
    work.add(this._el('h2', 'ps-h', 'WORK'));
    work.add(this._el('div', 'ps-quest-tag', 'CURRENT FOCUS'));
    work.add(this._el('div', 'ps-quest-main', `cycle ${s.mainQuest.cycle}: ${s.mainQuest.label}`));
    if (s.sideQuests.length) {
      work.add(this._el('div', 'ps-quest-tag', 'FOLLOW-UPS OWED'));
      for (const q of s.sideQuests) work.add(this._el('div', 'ps-quest-item', `▸ ${q.label} (from cycle ${q.cycle})`));
    }
    work.add(this._el('div', 'ps-quest-tag ps-blink', 'AWAITING OWNER DECISION'));
    for (const p of s.playerInput) work.add(this._el('div', 'ps-quest-item ps-input', p));
    work.add(this._el('div', 'ps-quest-tag', 'RECENT CYCLES'));
    for (const r of s.recent) {
      work.add(this._el('div', `ps-quest-item${r.correction ? ' ps-retcon' : ''}`,
        `${r.correction ? '↺' : '·'} c${r.cycle} — ${r.label}`));
    }
    cols.add(work);

    const modules = this._el('section', 'ps-panel');
    modules.add(this._el('h2', 'ps-h', `MODULES — ${s.party.length}`));
    const grid = this._el('div', 'ps-party');
    for (const m of s.party) {
      const card = this._el('div', `ps-card${m.danger ? ' ps-card--danger' : ''}`);
      card.add(this._el('div', 'ps-card__name', m.name));
      card.add(this._el('div', 'ps-card__role', m.role));
      const meta = this._el('div', 'ps-card__meta');
      meta.add(this._el('span', `ps-badge${m.status === 'ACTIVE' ? '' : ' ps-badge--dim'}`, m.status));
      meta.add(this._el('span', `ps-cond${m.danger ? ' ps-cond--danger' : ''}`,
        m.danger ? `⚠ ${m.condition}` : m.condition));
      card.add(meta);
      if (m.lastCommit) card.add(this._el('div', 'ps-card__commit', `last commit ${m.lastCommit}`));
      grid.add(card);
    }
    modules.add(grid);
    cols.add(modules);
    this.add(cols);

    // ---- milestones ----
    const mile = this._el('section', 'ps-panel');
    mile.add(this._el('h2', 'ps-h', 'MILESTONES'));
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
      'sources: IMPROVEMENT_LEDGER stanzas · repo-scope.json · annotations.json — every number recountable · ');
    const btn = this._el('button', 'ps-refresh', '↻ REFRESH');
    btn.dom.attributes['data-ps-refresh'] = 'true';
    foot.add(btn);
    this.add(foot);
  }

  activate() {
    if (!this.__active) {
      super.activate();
      // Visible proof the client bundle activated (checked by the verification pass).
      this.add_class('ps-client-active');
      this.add_dom_event_listener('click', (e) => {
        const t = e && (e.target || e.srcElement);
        if (t && t.getAttribute && t.getAttribute('data-ps-refresh')) window.location.reload();
      });
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
.ps-ach { display: flex; gap: 10px; flex-wrap: wrap; }
.ps-ach__badge { border: 2px solid #b8862e; border-radius: 6px; padding: 8px 12px; background: #12151a; min-width: 150px; }
.ps-ach__icon { font-size: 18px; color: #b8862e; }
.ps-ach__label { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; }
.ps-ach__detail { font-size: 10px; color: #8a8778; }
.ps-foot { font-size: 10px; color: #6b675a; margin-top: 4px; display: flex; align-items: center; gap: 10px; }
.ps-refresh { background: #171a20; color: #b8862e; border: 2px solid #b8862e; border-radius: 4px; font-size: 10px; letter-spacing: 0.1em; padding: 4px 10px; cursor: pointer; }
.ps-refresh:hover { background: #b8862e; color: #0c0e11; }
`;

class Project_Status_Page extends Active_HTML_Document {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || 'project_status_page';
    super(spec);
    if (!spec.el) {
      this.title = 'Project Status — news-crawler ecosystem';
      const get = Project_Status_Page.get_status;
      const status = typeof get === 'function' ? get() : null;
      this.body.add(new Status_Widget({ context: this.context, status }));
    }
  }
}
// Injected by server.js before rendering; stays null in the browser bundle.
Project_Status_Page.get_status = null;

// Register for client-side reattachment: jsgui3-client's window-load activation
// resolves DOM nodes by data-jsgui-type through jsgui.controls. Register both key
// casings — the lookup casing differs between paths, and the extra key is harmless.
jsgui.controls = jsgui.controls || {};
jsgui.controls.status_widget = Status_Widget;
jsgui.controls.Status_Widget = Status_Widget;
jsgui.controls.project_status_page = Project_Status_Page;
jsgui.controls.Project_Status_Page = Project_Status_Page;

module.exports = { Status_Widget, Project_Status_Page };
