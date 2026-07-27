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

// ---- tech tree + path ahead (SMAC-style; owner directive 2026-07-27) ----
// Shared MODELS between server compose and client apply — same one-definition rule
// as CHIP_DEFS. States derive from the backlog's state column; only open/partial
// rows earn the 💡 (they are exactly the ▶ candidates next-prompt offers). The tree
// is deliberately not fully visible: '❓ Future Technology' marks the fog of war.
const TREE_COLS = [
  { key: 'grown', head: '✓ RESEARCHED ON THE TREE', empty: 'none yet — the tree starts here' },
  { key: 'available', head: '💡 RESEARCH AVAILABLE' },
  { key: 'gated', head: '🔒 GATED' },
  { key: 'future', head: '❓ NOT YET REVEALED' }
];
// Everything completed before the tree existed is its ROOTS: real, load-bearing,
// and deliberately not displayed (owner: don't pigeonhole past work into the tree).
const rootsText = (roots) =>
  `🌱 roots — ${roots && roots.count ? roots.count : 0} technologies researched before the tree; not displayed`;
function techNodeModel(colKey, n) {
  const sub = [];
  if (colKey === 'grown') {
    if (n.researchedOn) sub.push(`researched ${n.researchedOn}`);
    if (n.buildsOn && n.buildsOn.length) sub.push(`builds on ${n.buildsOn.join(' + ')}`);
    return { cls: 'ps-tech ps-tech--done', title: `✓ ${n.id} · ${n.title}`, sub };
  }
  if (colKey === 'available') {
    sub.push(`research: ${n.research}`);
    if (n.buildsOn && n.buildsOn.length) sub.push(`builds on ${n.buildsOn.join(' + ')}`);
    return { cls: 'ps-tech ps-tech--avail', title: `💡 ${n.id} · ${n.title}`, sub };
  }
  if (colKey === 'gated') {
    if (n.note) sub.push(n.note);
    return { cls: 'ps-tech ps-tech--gated', title: `🔒 ${n.id} · ${n.title}`, sub };
  }
  return { cls: 'ps-tech ps-tech--future', title: `❓ ${n.title}`, sub: [] };
}
function roadCardModels(s) {
  const cards = [];
  const r = s.roadmap || {};
  if (r.block) cards.push({ cls: 'ps-road__card ps-road__card--now', top: 'NOW', main: r.block.label, sub: r.block.why || '' });
  (r.steps || []).forEach((st, i) => cards.push({ cls: 'ps-road__card', top: `NEXT ${i + 1}`, main: st.label, sub: st.detail || '' }));
  cards.push({ cls: 'ps-road__card ps-road__card--future', top: 'BEYOND', main: '❓ Future Technology', sub: 'not yet conceptualised' });
  return cards;
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

    // ---- header ----
    const bar = this._el('header', 'ps-player');
    bar.add(this._el('div', 'ps-studio', 'PROJECT STATUS — news-crawler ecosystem'));
    const lvl = this._el('div', 'ps-level');
    const big = this._el('span', 'ps-level__num', String(s.player.xpTotal));
    big.dom.attributes['data-ps-total'] = 'true';
    lvl.add(big);
    lvl.add(this._el('span', 'ps-level__title', 'verified improvements'));
    bar.add(lvl);
    const xp = this._el('div', 'ps-xp');
    const fill = this._el('div', 'ps-xp__fill');
    fill.dom.attributes['data-ps-xp-fill'] = 'true';
    fill.dom.attributes.style = `width:${Math.round((s.player.xpInLevel / s.player.xpPerLevel) * 100)}%;`;
    xp.add(fill);
    bar.add(xp);
    const xpl = this._el('div', 'ps-xp__label', xpLabelText(s.player));
    xpl.dom.attributes['data-ps-xp-label'] = 'true';
    bar.add(xpl);
    this.add(bar);

    // ---- stat chips ----
    const chips = this._el('div', 'ps-chips');
    for (const def of CHIP_DEFS) {
      const chip = this._el('div', 'ps-chip');
      const v = this._el('span', 'ps-chip__v', def.fmt(s.stats));
      v.dom.attributes['data-ps-chip'] = def.key;
      chip.add(v);
      chip.add(this._el('span', 'ps-chip__l', def.label));
      chips.add(chip);
    }
    this.add(chips);

    // ---- two columns: work | modules ----
    const cols = this._el('div', 'ps-cols');

    const work = this._el('section', 'ps-panel');
    work.add(this._el('h2', 'ps-h', 'WORK'));
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
    work.add(this._el('div', 'ps-quest-tag ps-blink', 'AWAITING OWNER DECISION'));
    for (const p of s.playerInput) work.add(this._el('div', 'ps-quest-item ps-input', p));
    work.add(this._el('div', 'ps-quest-tag', 'RECENT CYCLES'));
    const recentBox = this._el('div', 'ps-list');
    recentBox.dom.attributes['data-ps-recent'] = 'true';
    for (const r of s.recent) recentBox.add(this._el('div', `ps-quest-item${r.correction ? ' ps-retcon' : ''}`, recentText(r)));
    work.add(recentBox);
    cols.add(work);

    const modules = this._el('section', 'ps-panel');
    modules.add(this._el('h2', 'ps-h', `MODULES — ${s.party.length}`));
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
    const research = this._el('section', 'ps-panel');
    research.add(this._el('h2', 'ps-h', 'PATH AHEAD'));
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

    research.add(this._el('h2', 'ps-h', 'RESEARCH — TECH TREE'));
    if (s.techTree && s.techTree.error) {
      research.add(this._el('div', 'ps-quest-item ps-input', `tech tree unavailable: ${s.techTree.error}`));
    }
    const rootsLine = this._el('div', 'ps-tree__roots', rootsText(s.techTree && s.techTree.roots));
    rootsLine.dom.attributes['data-ps-tree-roots'] = 'true';
    research.add(rootsLine);
    const tree = this._el('div', 'ps-tree');
    for (const col of TREE_COLS) {
      const colBox = this._el('div', 'ps-tree__col');
      colBox.add(this._el('div', 'ps-tree__head', col.head));
      const list = this._el('div', 'ps-tree__list');
      list.dom.attributes['data-ps-tree'] = col.key;
      const items = (s.techTree && s.techTree[col.key]) || [];
      if (!items.length && col.empty) list.add(this._el('div', 'ps-tech ps-tech--seed', col.empty));
      for (const n of items) {
        const m = techNodeModel(col.key, n);
        const nodeEl = this._el('div', m.cls);
        nodeEl.add(this._el('div', 'ps-tech__t', m.title));
        for (const line of m.sub) nodeEl.add(this._el('div', 'ps-tech__s', line));
        list.add(nodeEl);
      }
      colBox.add(list);
      tree.add(colBox);
    }
    research.add(tree);
    this.add(research);

    // ---- history: the committed progress SVG, same data substrate ----
    const hist = this._el('section', 'ps-panel');
    hist.add(this._el('h2', 'ps-h', 'HISTORY'));
    const img = this._el('img', 'ps-history__img');
    img.dom.attributes.src = '/progress.svg';
    img.dom.attributes.alt = 'Cycle history: cumulative verified improvements and defects caught, rendered from the ledger';
    img.dom.attributes['data-ps-history'] = 'true';
    hist.add(img);
    this.add(hist);

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
    const q = (sel) => root.querySelector(sel);
    const setText = (sel, text) => { const el = q(sel); if (el) el.textContent = text; };

    setText('[data-ps-total]', String(s.player.xpTotal));
    const fill = q('[data-ps-xp-fill]');
    if (fill) fill.style.width = `${Math.round((s.player.xpInLevel / s.player.xpPerLevel) * 100)}%`;
    setText('[data-ps-xp-label]', xpLabelText(s.player));
    for (const def of CHIP_DEFS) setText(`[data-ps-chip="${def.key}"]`, def.fmt(s.stats));
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
    if (s.techTree) {
      setText('[data-ps-tree-roots]', rootsText(s.techTree.roots));
      for (const col of TREE_COLS) {
        const list = q(`[data-ps-tree="${col.key}"]`);
        if (!list) continue;
        while (list.firstChild) list.removeChild(list.firstChild);
        const items = s.techTree[col.key] || [];
        if (!items.length && col.empty) {
          const seed = document.createElement('div');
          seed.className = 'ps-tech ps-tech--seed';
          seed.textContent = col.empty;
          list.appendChild(seed);
        }
        for (const n of items) {
          const m = techNodeModel(col.key, n);
          const nodeEl = document.createElement('div');
          nodeEl.className = m.cls;
          const t = document.createElement('div');
          t.className = 'ps-tech__t';
          t.textContent = m.title;
          nodeEl.appendChild(t);
          for (const line of m.sub) {
            const d = document.createElement('div');
            d.className = 'ps-tech__s';
            d.textContent = line;
            nodeEl.appendChild(d);
          }
          list.appendChild(nodeEl);
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
      // Visible proof activation ran (checked by the verification pass).
      this.add_class('ps-client-active');
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
.ps-tree__roots { font-size: 10px; color: #6b675a; border-bottom: 1px dashed #2e3440; padding-bottom: 6px; margin-bottom: 8px; }
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

module.exports = { Status_Widget, Project_Status_Page };
