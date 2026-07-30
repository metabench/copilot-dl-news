'use strict';

/**
 * techPages.js — the four SMAC-style branch pages (owner directives 2026-07-27/28),
 * plus the node-detail modal every tree item opens (cycle 142):
 *
 *   /tech/agi      — 💡 cold blue-white light   (#4d9ec8, palette-validated)
 *   /tech/tree     — 🖥 a tree on a monitor      (#55a377)
 *   /tech/crawler  — 🕷 a spider on its web      (#b8862e)
 *   /tech/factory  — 🏭 a factory with a spanner (#a678c8) + live tool inventory
 *
 * SMAC grounding (researched 2026-07-27): research categories form an INTERTWINING
 * tree; each tech has at most two prerequisites; techs sit in tiers from foundations
 * to frontier; blind research means the far tree is not laid bare. Rendered here as
 * four tiers left→right — FOUNDATIONS (the finite curated roots: what already
 * exists), RESEARCH AVAILABLE (💡 the frontier), GATED (🔒 waiting on the owner),
 * and BEYOND (❓ Future Technology fog). Prereq chips are colored by their SOURCE
 * branch, which is what makes the intertwining visible: an AGI tech standing on a
 * crawler foundation wears a gold chip on an ice page.
 *
 * DELIBERATELY SERVER-RENDERED PER REQUEST (no client bundle, no activation): the
 * whole page is built inside the route handler, so it can never serve a boot-time
 * snapshot — the c128.5 SSR-freeze class is structurally impossible here. Reload IS
 * the refresh model for these reference pages, exactly like SMAC's datalinks.
 */

const { ICONS, headerScape, gearIcon } = require('./techArt');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NAV = [
  { key: 'status', href: '/', label: 'STATUS' },
  { key: 'agi', href: '/tech/agi', label: 'AGI' },
  { key: 'tree', href: '/tech/tree', label: 'TECH TREE' },
  { key: 'crawler', href: '/tech/crawler', label: 'CRAWLER' },
  { key: 'factory', href: '/tech/factory', label: 'TOOL FACTORY' }
];

function navBar(currentKey, branches) {
  const items = NAV.map((n) => {
    const b = branches.find((x) => x.key === n.key);
    const icon = b ? ICONS[b.icon](16) : '';
    const cur = n.key === currentKey;
    return `<a class="tp-nav__item${cur ? ' tp-nav__item--cur' : ''}" href="${n.href}"${cur ? ' aria-current="page"' : ''}>${icon}<span>${esc(n.label)}</span></a>`;
  }).join('');
  const settings = `<button class="tp-nav__settings" id="tp-settings-btn" type="button" aria-label="settings" title="settings">${gearIcon(17)}</button>`;
  return `<nav class="tp-nav">${items}${settings}</nav>`;
}

function prereqChips(prereqs, branches) {
  if (!prereqs || !prereqs.length) return '';
  const chip = (p) => {
    const b = branches.find((x) => x.key === p.branch);
    const color = b ? b.color : '#8a8778';
    return `<span class="tp-chip" style="border-color:${color};color:${color}">${esc(p.id)}</span>`;
  };
  return `<div class="tp-node__req">combines ${prereqs.map(chip).join(' + ')}</div>`;
}

function node(cls, inner, nodeId) {
  const attrs = nodeId ? ` data-node-id="${esc(nodeId)}" role="button" tabindex="0"` : '';
  return `<div class="tp-node ${cls}"${attrs}>${inner}</div>`;
}

// ---- node detail modal (owner 2026-07-28: click any tech-tree item, any tree,
// for a popup with further information — a browsing tool for thinking time). ----

/**
 * One flat index of EVERY node across ALL branches rides each page as a JSON data
 * island, so clicking a dashed foreign node opens its real record and chips can hop
 * branch to branch without a page load. The island is the same objects the tiers
 * render from — one source, no drift.
 */
function buildNodeIndex(techTree) {
  const out = {};
  for (const b of (techTree.branches || [])) {
    const base = { branch: b.key, branchLabel: b.label, color: b.color };
    for (const r of b.roots) out[r.id] = { ...r, ...base, kind: 'foundation' };
    for (const g of b.grown) out[g.id] = { ...g, ...base, kind: 'researched' };
    for (const a of b.available) out[a.id] = { ...a, ...base, kind: 'research available' };
    for (const g of b.gated) out[g.id] = { ...g, ...base, kind: 'gated' };
    for (const f of b.future) {
      out[f.id] = {
        ...f, ...base, kind: 'fog',
        note: 'Not yet conceptualised. Blind research: the far tree is deliberately unrevealed, and a fog slot has no edges because what feeds it is unknown. It becomes a named technology when two foundations suggest a combination worth writing down — the reviews (and the owner) do that promotion.'
      };
    }
  }
  return out;
}

function nodeDataIsland(techTree) {
  // </script> inside JSON would end the island early; \u003c keeps it inert.
  return `<script type="application/json" id="tp-node-data">${JSON.stringify(buildNodeIndex(techTree)).replace(/</g, '\\u003c')}</script>`;
}

// ---- settings (owner 2026-07-28: gear top right → modal dialog; font size). ----
// The pages' text sizes are rem-based precisely so this works: the adjuster sets the
// ROOT font size; every rem measurement follows. Stored in localStorage ('tp-settings')
// so it persists across the four pages and across visits. EARLY_SETTINGS applies the
// stored size immediately after <body> opens — before first paint, so no size flash.
const SETTINGS_RANGE = { min: 80, max: 250, step: 5, def: 100 }; // max 250 (owner, 2026-07-28)
const EARLY_SETTINGS = `<script>try{var s=JSON.parse(localStorage.getItem('tp-settings')||'{}');if(s.fontPct)document.documentElement.style.fontSize=(16*s.fontPct/100)+'px';}catch(e){}</script>`;
const SETTINGS_HTML = `<dialog class="tp-modal tp-settings" id="tp-settings-dlg">
  <div class="tp-modal__bar"><span class="tp-modal__id">SETTINGS</span><button class="tp-modal__x" id="tp-settings-close" type="button" aria-label="close">✕</button></div>
  <div class="tp-modal__sec">FONT SIZE</div>
  <div class="tp-settings__row">
    <button class="tp-settings__step" id="tps-minus" type="button" aria-label="smaller">A−</button>
    <input type="range" id="tps-range" min="${SETTINGS_RANGE.min}" max="${SETTINGS_RANGE.max}" step="${SETTINGS_RANGE.step}" value="${SETTINGS_RANGE.def}" aria-label="font size percent">
    <button class="tp-settings__step" id="tps-plus" type="button" aria-label="larger">A+</button>
    <span class="tp-settings__pct" id="tps-pct">100%</span>
    <button class="tp-settings__reset" id="tps-reset" type="button">reset</button>
  </div>
  <p class="tp-modal__p tp-settings__note">applies to text on the tech pages (stored in this browser); diagram text in the tree view keeps its drawn size</p>
</dialog>`;
const SETTINGS_SCRIPT = `<script>
(function () {
  var R = { min: ${SETTINGS_RANGE.min}, max: ${SETTINGS_RANGE.max}, step: ${SETTINGS_RANGE.step}, def: ${SETTINGS_RANGE.def} };
  var dlg = document.getElementById('tp-settings-dlg');
  var range = document.getElementById('tps-range');
  var pctEl = document.getElementById('tps-pct');
  function load() { try { return JSON.parse(localStorage.getItem('tp-settings') || '{}'); } catch (e) { return {}; } }
  function apply(pct, save) {
    pct = Math.max(R.min, Math.min(R.max, Math.round(pct / R.step) * R.step));
    document.documentElement.style.fontSize = (16 * pct / 100) + 'px';
    range.value = pct;
    pctEl.textContent = pct + '%';
    if (save) {
      var st = load(); st.fontPct = pct;
      try { localStorage.setItem('tp-settings', JSON.stringify(st)); } catch (e) {}
    }
    return pct;
  }
  apply(load().fontPct || R.def, false);
  document.getElementById('tp-settings-btn').addEventListener('click', function () { if (!dlg.open) dlg.showModal(); });
  document.getElementById('tp-settings-close').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  range.addEventListener('input', function () { apply(Number(range.value), true); });
  document.getElementById('tps-minus').addEventListener('click', function () { apply(Number(range.value) - R.step, true); });
  document.getElementById('tps-plus').addEventListener('click', function () { apply(Number(range.value) + R.step, true); });
  document.getElementById('tps-reset').addEventListener('click', function () { apply(R.def, true); });
})();
</script>`;

const MODAL_HTML = `<dialog class="tp-modal" id="tp-modal">
  <div class="tp-modal__bar"><span class="tp-modal__id" id="tpm-id"></span><button class="tp-modal__x" id="tpm-close" type="button" aria-label="close">✕</button></div>
  <h2 class="tp-modal__title" id="tpm-title"></h2>
  <div class="tp-modal__meta" id="tpm-meta"><a class="tp-modal__page" id="tpm-page" href="#">open datalinks page ↗</a></div>
  <div class="tp-modal__body" id="tpm-body"></div>
</dialog>`;

const MODAL_SCRIPT = `<script>
(function () {
  var data = {};
  try { data = JSON.parse(document.getElementById('tp-node-data').textContent); } catch (e) {}
  var dlg = document.getElementById('tp-modal');
  var el = function (tag, cls, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text !== undefined) d.textContent = text;
    return d;
  };
  function chipRow(label, ids) {
    if (!ids || !ids.length) return null;
    var row = el('div', 'tp-modal__chips');
    row.appendChild(el('span', 'tp-modal__chiplabel', label));
    ids.forEach(function (id) {
      var n = data[id] || {};
      var c = el('button', 'tp-chip tp-chip--hop', id);
      c.type = 'button';
      if (n.color) { c.style.borderColor = n.color; c.style.color = n.color; }
      c.addEventListener('click', function () { openNode(id); });
      row.appendChild(c);
    });
    return row;
  }
  function section(title) { return el('div', 'tp-modal__sec', title); }
  function openNode(id) {
    var n = data[id];
    if (!n) return;
    document.getElementById('tpm-id').textContent = (n.branchLabel || '') + ' · ' + (id.indexOf('future') >= 0 ? 'FOG OF WAR' : id);
    document.getElementById('tpm-title').textContent = n.title || id;
    var meta = [n.kind];
    if (n.priority) meta.push('priority ' + n.priority);
    if (n.researchedOn) meta.push('researched ' + n.researchedOn);
    if (n.lastUpdate) meta.push('updated ' + n.lastUpdate);
    var metaEl = document.getElementById('tpm-meta');
    while (metaEl.firstChild) metaEl.removeChild(metaEl.firstChild);
    metaEl.appendChild(document.createTextNode(meta.filter(Boolean).join(' · ') + ' · '));
    var pageLink = document.createElement('a');
    pageLink.className = 'tp-modal__page';
    pageLink.href = '/tech/node?id=' + encodeURIComponent(id);
    pageLink.textContent = 'open datalinks page ↗';
    metaEl.appendChild(pageLink);
    dlg.style.setProperty('--accent', n.color || '#8a8778');
    var body = document.getElementById('tpm-body');
    while (body.firstChild) body.removeChild(body.firstChild);
    if (n.research) { body.appendChild(section('RESEARCH MEANS')); body.appendChild(el('p', 'tp-modal__p', n.research)); }
    if (n.note && !n.research) { body.appendChild(section(n.kind === 'fog' ? 'THE FOG' : 'WHAT THIS IS')); body.appendChild(el('p', 'tp-modal__p', n.note)); }
    if (n.question) { body.appendChild(section('THE QUESTION')); body.appendChild(el('p', 'tp-modal__p', n.question)); }
    var combines = chipRow('combines', (n.prereqs || []).map(function (p) { return p.id; }));
    if (combines) { body.appendChild(section('BUILT FROM')); body.appendChild(combines); }
    var unlocks = chipRow('unlocks', n.unlocks);
    if (unlocks) { body.appendChild(section('UNLOCKS')); body.appendChild(unlocks); }
    if (n.statusProse) { body.appendChild(section('FULL RECORD (research backlog, live)')); body.appendChild(el('p', 'tp-modal__p tp-modal__p--prose', n.statusProse)); }
    (n.detail || []).length && body.appendChild(section('DETAIL — from the project record'));
    (n.detail || []).forEach(function (d) { body.appendChild(el('p', 'tp-modal__p tp-modal__p--fact', '▪ ' + d)); });
    (n.prelim || []).length && body.appendChild(section('PRELIMINARY DATA — ' + n.prelim.length + ' notes'));
    (n.prelim || []).forEach(function (p) { body.appendChild(el('p', 'tp-modal__p', p)); });
    if (typeof dlg.showModal === 'function' && !dlg.open) dlg.showModal();
    dlg.scrollTop = 0;
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('button.tp-signal') || e.target.closest('button.tp-signal-mini') || e.target.closest('.tp-prelim')) return;
    var host = e.target.closest('[data-node-id]');
    if (host) openNode(host.getAttribute('data-node-id'));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var host = e.target.closest && e.target.closest('[data-node-id]');
    if (host) { e.preventDefault(); openNode(host.getAttribute('data-node-id')); }
  });
  document.getElementById('tpm-close').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
})();
</script>`;

/** 'Preliminary Data' — a tech's ideation, collapsed until the reader wants it. */
function prelimBlock(prelim) {
  if (!prelim || !prelim.length) return '';
  const notes = prelim.map((p) => `<p class="tp-prelim__p">${esc(p)}</p>`).join('');
  return `<details class="tp-prelim"><summary>PRELIMINARY DATA — ${prelim.length} note${prelim.length === 1 ? '' : 's'}</summary>${notes}</details>`;
}

/**
 * The big lightbulb REQUEST button for a signal-bearing tech. A click POSTs to
 * /api/research-signal; the agent picks the signal up at its next orient (the
 * agi-signal probe goes red + the next-prompt carries a ⚡ line). If a matching
 * signal is already pending, the button renders in its "requested" state.
 */
function signalButton(tech, pendingSignals, signalHistory) {
  const already = (pendingSignals || []).find((s) => s.tech === tech.id && s.status === 'pending');
  if (already) {
    // Past answers stay visible while a NEW request is pending — a re-runnable
    // review node is exactly where the owner wants to see what the last run did.
    return `<div class="tp-signal tp-signal--sent">${ICONS.iceBulb(40)}<div><div class="tp-signal__t">RESEARCH REQUESTED</div><div class="tp-signal__s">signal ${esc(already.id)} pending — the agent picks it up at its next orient</div></div></div>${answeredBlock(tech, signalHistory)}`;
  }
  return `<button class="tp-signal" data-signal-tech="${esc(tech.id)}" data-signal-req="${esc(tech.research || tech.title)}" type="button">${ICONS.iceBulb(40)}<div><div class="tp-signal__t">REQUEST THIS RESEARCH</div><div class="tp-signal__s">sends a signal the agent reads at its next orient</div></div></button>${answeredBlock(tech, signalHistory)}`;
}

/**
 * Compact request control for every OTHER available tech (cycle 147, shipped by the
 * first owner-signalled app review): the review nodes keep the big bulb; any
 * research can now be requested through the same queue -> probe -> prompt path.
 */
function compactSignal(tech, pendingSignals, signalHistory) {
  const already = (pendingSignals || []).find((s) => s.tech === tech.id && s.status === 'pending');
  if (already) return `<div class="tp-signal-mini tp-signal-mini--sent">⚡ requested — pending pickup</div>${answeredBlock(tech, signalHistory)}`;
  return `<button class="tp-signal-mini" data-signal-tech="${esc(tech.id)}" data-signal-req="${esc(tech.research || tech.title)}" type="button">${ICONS.iceBulb(13)} request this research</button>${answeredBlock(tech, signalHistory)}`;
}

/**
 * ANSWERED history for THIS node (cycle 154, second TECH-APPREVIEW run).
 *
 * The protocol's own duty is "answer where the question was asked" — but until
 * now a node showed only its PENDING state, and the moment a signal was acked
 * the node reverted to a plain button with no trace. The answer lived only in
 * the factory page's last-8 SIGNAL LOG, so an owner returning to the node they
 * clicked could not see that they had asked, or what came back. That matters
 * most for the re-runnable review nodes, which never grow and so never show
 * progress any other way.
 *
 * Newest first, capped — the datalinks page is where a long history belongs.
 */
function answeredBlock(tech, signalHistory, limit = 2) {
  const answered = (signalHistory || [])
    .filter((s) => s.tech === tech.id && s.status === 'done')
    .sort((a, b) => String(b.ackAt || '').localeCompare(String(a.ackAt || '')));
  if (!answered.length) return '';
  const rows = answered.slice(0, limit).map((s) => {
    const when = String(s.ackAt || '').slice(0, 16).replace('T', ' ');
    return `<div class="tp-answered__row"><span class="tp-answered__when">✓ requested ${esc(String(s.at || '').slice(0, 10))} · answered ${esc(when)}</span><span class="tp-answered__note">${esc(shortenNote(s.ackNote))}</span></div>`;
  }).join('');
  const more = answered.length > limit
    ? `<div class="tp-answered__more">${answered.length - limit} earlier request${answered.length - limit === 1 ? '' : 's'} — see the datalinks page</div>`
    : '';
  return `<div class="tp-answered"><div class="tp-answered__h">YOUR PAST REQUESTS</div>${rows}${more}</div>`;
}

function shortenNote(note, max = 220) {
  const text = String(note || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * The LIVE strip + its low-frequency poll (owner directive 2026-07-30).
 *
 * Two owner-visible jobs, one 45s request:
 *   1. show what the agent is doing NOW (or say plainly that it is idle), and
 *   2. notice when finished work lands, WITHOUT yanking the page.
 *
 * REVISED cycle 157, after the owner found a node still reading "pending
 * pickup" long after that request had been answered. The first version updated
 * only the strip and offered a pill for everything else — so the CARDS, which
 * carry the state the owner actually came to read, stayed wrong indefinitely.
 * A page that merely hints while showing a false state is worse than one that
 * refreshes itself. The rule now:
 *
 *   activity changed  → patch the strip in place, NEVER reload (an agent
 *                       reporting progress must not reload the owner's page)
 *   cards changed     → the page is LYING; re-render it, preserving scroll so
 *                       the reload is nearly invisible
 *   dialog open       → the owner is actively reading: hold the reload and show
 *                       the pill instead, then reload once they close it
 *
 * Poll cost is a few stat() calls (see techStateFingerprint); the page stops
 * polling while hidden so a forgotten tab costs nothing.
 */
const LIVE_HTML = `<div class="tp-live" id="tp-live" hidden>
  <span class="tp-live__dot" id="tp-live-dot"></span>
  <span class="tp-live__phase" id="tp-live-phase"></span>
  <span class="tp-live__note" id="tp-live-note"></span>
  <span class="tp-live__counts" id="tp-live-counts"></span>
  <button class="tp-live__pill" id="tp-live-pill" type="button" hidden>● this page is out of date — refresh now</button>
</div>`;

const LIVE_SCRIPT = `<script>
(function () {
  var SCROLL_KEY = 'tp-scroll-restore';
  var started = null, staleCards = false;
  var el = {
    wrap: document.getElementById('tp-live'), dot: document.getElementById('tp-live-dot'),
    phase: document.getElementById('tp-live-phase'), note: document.getElementById('tp-live-note'),
    counts: document.getElementById('tp-live-counts'), pill: document.getElementById('tp-live-pill')
  };
  if (!el.wrap) return;

  // Restore the reading position across a self-refresh, so re-rendering a lying
  // page costs the owner nothing.
  try {
    var saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved !== null) { sessionStorage.removeItem(SCROLL_KEY); window.scrollTo(0, Number(saved) || 0); }
  } catch (e) {}

  function refreshNow() {
    try { sessionStorage.setItem(SCROLL_KEY, String(window.scrollY || 0)); } catch (e) {}
    location.reload();
  }
  el.pill.addEventListener('click', refreshNow);

  // A dialog open means the owner is reading something specific — hold the
  // refresh until they close it, then apply it immediately.
  function dialogOpen() { return !!document.querySelector('dialog[open]'); }
  document.addEventListener('close', function () { if (staleCards && !dialogOpen()) refreshNow(); }, true);

  function paint(s) {
    el.wrap.hidden = false;
    var a = s.activity || {};
    if (a.idle) {
      el.dot.className = 'tp-live__dot tp-live__dot--idle';
      el.phase.textContent = 'agent idle';
      el.note.textContent = a.reason || '';
    } else {
      el.dot.className = 'tp-live__dot tp-live__dot--busy';
      el.phase.textContent = a.phase || 'working';
      var age = a.ageMinutes === 0 ? 'just now' : (a.ageMinutes + 'm ago');
      el.note.textContent = (a.note || '') + ' · ' + age;
    }
    var c = s.counts || {};
    el.counts.textContent = c.grown + ' grown · ' + c.available + ' available'
      + (s.pendingSignals ? ' · ' + s.pendingSignals + ' request pending' : '');
  }

  // Event-driven (cycle 158): the server WATCHES its inputs and PUSHES over
  // SSE the instant one changes — no polling, no 45s anywhere. Event names
  // carry the c157 semantics: 'cards' = the page is now showing something
  // false, so re-render (unless a dialog holds it); 'activity' = only the
  // strip moved, patch it in place and never reload. EventSource reconnects
  // by itself; a changed serverStartedAt on the post-reconnect hello means the
  // server restarted with new code, which is a cards-grade change.
  function onCards() {
    staleCards = true;
    el.pill.hidden = false;
    if (!dialogOpen()) refreshNow();
  }
  var es = new EventSource('/api/events');
  es.addEventListener('hello', function (e) {
    try {
      var s = JSON.parse(e.data);
      paint(s);
      if (started === null) { started = s.serverStartedAt; return; }
      if (s.serverStartedAt !== started) onCards();
    } catch (err) {}
  });
  es.addEventListener('activity', function (e) {
    try { paint(JSON.parse(e.data)); } catch (err) {}
  });
  es.addEventListener('cards', function (e) {
    try { paint(JSON.parse(e.data)); } catch (err) {}
    onCards();
  });
  // es.onerror deliberately unhandled: EventSource retries on its own, and a
  // server that is down mid-cycle is not the page's problem.
})();
</script>`;

const SIGNAL_SCRIPT = `<script>
document.addEventListener('click', function (e) {
  var btn = e.target.closest('button.tp-signal') || e.target.closest('button.tp-signal-mini');
  if (!btn) return;
  btn.disabled = true;
  fetch('/api/research-signal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tech: btn.getAttribute('data-signal-tech'), requested: btn.getAttribute('data-signal-req') })
  }).then(function (r) { return r.json(); }).then(function (j) {
    if (btn.classList.contains('tp-signal-mini')) {
      btn.classList.add('tp-signal-mini--sent');
      btn.textContent = j.ok ? '⚡ requested — pending pickup' : ('signal failed: ' + (j.error || 'unknown'));
      return;
    }
    btn.classList.add('tp-signal--sent');
    btn.querySelector('.tp-signal__t').textContent = j.ok ? 'RESEARCH REQUESTED' : 'SIGNAL FAILED';
    btn.querySelector('.tp-signal__s').textContent = j.ok
      ? ('signal ' + j.id + ' pending — the agent picks it up at its next orient')
      : (j.error || 'unknown error');
  }).catch(function () {
    btn.disabled = false;
    if (btn.classList.contains('tp-signal-mini')) { btn.textContent = 'send failed — is the server up?'; return; }
    btn.querySelector('.tp-signal__s').textContent = 'send failed — is the server up?';
  });
});
</script>`;

// ---- the DRAWN tree (owner 2026-07-28: "make sure the tech tree can actually
// display as a tree") — a server-rendered SVG DAG: layered left→right by prereq
// depth, real node-to-node edges colored by their SOURCE branch, fog dashed at the
// far right with no edges (blind research: what feeds it is unknown by design). ----

/** Collect this branch's drawable nodes + edges (foreign prereqs become layer-0 nodes). */
function collectGraph(b) {
  const nodes = new Map();
  const edges = [];
  for (const r of b.roots) nodes.set(r.id, { id: r.id, title: r.title, kind: 'root', branch: b.key });
  const techs = [
    ...b.grown.map((t) => ({ ...t, kind: 'grown' })),
    ...b.available.map((t) => ({ ...t, kind: 'avail' })),
    ...b.gated.map((t) => ({ ...t, kind: 'gated' }))
  ];
  for (const t of techs) {
    nodes.set(t.id, { id: t.id, title: t.title, kind: t.kind, branch: b.key });
    for (const p of (t.prereqs || [])) {
      if (!nodes.has(p.id)) nodes.set(p.id, { id: p.id, title: p.id, kind: 'foreign', branch: p.branch });
      edges.push({ from: p.id, to: t.id, branch: p.branch });
    }
  }
  for (const f of b.future) nodes.set(f.id, { id: f.id, title: 'Future Technology', kind: 'fog', branch: b.key });
  return { nodes: [...nodes.values()], edges };
}

/** Layer = prereq depth: foundations 0; a tech sits one right of its deepest input. */
function assignDepths(nodes, edges) {
  const depth = new Map();
  for (const n of nodes) if (n.kind === 'root' || n.kind === 'foreign') depth.set(n.id, 0);
  const inbound = (id) => edges.filter((e) => e.to === id).map((e) => e.from);
  let changed = true, guard = 0;
  while (changed && guard++ < 50) {
    changed = false;
    for (const n of nodes) {
      if (n.kind === 'fog' || depth.has(n.id)) continue;
      const ins = inbound(n.id);
      if (ins.every((i) => depth.has(i))) {
        depth.set(n.id, ins.length ? 1 + Math.max(...ins.map((i) => depth.get(i))) : 1);
        changed = true;
      }
    }
  }
  const maxTech = Math.max(0, ...[...depth.values()]);
  for (const n of nodes) if (n.kind === 'fog') depth.set(n.id, maxTech + 1);
  for (const n of nodes) if (!depth.has(n.id)) depth.set(n.id, 1); // cycle guard: never lose a node
  return depth;
}

function renderTreeSvg(b, branches) {
  const { nodes, edges } = collectGraph(b);
  if (!nodes.length) return '';
  const depth = assignDepths(nodes, edges);
  const NW = 148, NH = 30, XGAP = 52, YGAP = 12, PAD = 14;
  const layers = new Map();
  for (const n of nodes) {
    const d = depth.get(n.id);
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d).push(n);
  }
  // One barycentric pass (cycle 143 finishing touch): order each layer >0 by the
  // mean row-index of its inputs in the previous ordering, so edges run flatter
  // and cross less. Stable sort keeps spec order as the tiebreak; a single sweep
  // is deliberate — full crossing minimisation is NP-hard and this is a glance
  // diagram, not a graph editor.
  const sortedDepths = [...layers.keys()].sort((a, b) => a - b);
  const rowOf = new Map();
  for (const d of sortedDepths) {
    const ns = layers.get(d);
    if (d > 0) {
      const bary = (n) => {
        const ins = edges.filter((e) => e.to === n.id).map((e) => rowOf.get(e.from)).filter((v) => v !== undefined);
        return ins.length ? ins.reduce((a, v) => a + v, 0) / ins.length : Number.MAX_SAFE_INTEGER;
      };
      const keyed = ns.map((n, i) => ({ n, i, k: bary(n) }));
      keyed.sort((a, b) => (a.k - b.k) || (a.i - b.i));
      layers.set(d, keyed.map((x) => x.n));
    }
    layers.get(d).forEach((n, i) => rowOf.set(n.id, i));
  }
  const pos = new Map();
  let maxRows = 0;
  for (const [d, ns] of layers) {
    ns.forEach((n, i) => pos.set(n.id, { x: PAD + d * (NW + XGAP), y: PAD + i * (NH + YGAP) }));
    maxRows = Math.max(maxRows, ns.length);
  }
  const W = PAD * 2 + (Math.max(...layers.keys()) + 1) * (NW + XGAP) - XGAP;
  const H = PAD * 2 + maxRows * (NH + YGAP) - YGAP;
  const colorOf = (key) => (branches.find((x) => x.key === key) || {}).color || '#8a8778';

  const edgeSvg = edges.map((e) => {
    const a = pos.get(e.from), z = pos.get(e.to);
    if (!a || !z) return '';
    const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = z.x, y2 = z.y + NH / 2;
    const mx = (x1 + x2) / 2;
    return `<path d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}" fill="none" stroke="${colorOf(e.branch)}" stroke-width="1.3" opacity="0.65"/>`;
  }).join('');

  const nodeSvg = nodes.map((n) => {
    const p = pos.get(n.id);
    const accent = colorOf(n.branch);
    const style = {
      root: `fill="#14171c" stroke="#8a8778" stroke-width="1"`,
      foreign: `fill="#14171c" stroke="${accent}" stroke-width="1" stroke-dasharray="3,2"`,
      grown: `fill="#182019" stroke="${accent}" stroke-width="1.4"`,
      avail: `fill="#14171c" stroke="${accent}" stroke-width="1.8"`,
      gated: `fill="#14171c" stroke="#b34d4d" stroke-width="1.2"`,
      fog: `fill="none" stroke="#5a5648" stroke-width="1" stroke-dasharray="4,3"`
    }[n.kind];
    const glow = n.kind === 'avail' ? `<rect x="${p.x - 1.5}" y="${p.y - 1.5}" width="${NW + 3}" height="${NH + 3}" rx="6" fill="none" stroke="${accent}" stroke-width="0.6" opacity="0.4"/>` : '';
    const t = n.title.length > 21 ? `${n.title.slice(0, 20)}…` : n.title;
    const label = n.kind === 'fog' ? '❓ Future Technology' : t;
    return `<g data-node-id="${esc(n.id)}" style="cursor:pointer">${glow}<rect x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="5" ${style}/>
<text x="${p.x + 7}" y="${p.y + 12}" font-family="Segoe UI, sans-serif" font-size="8" fill="${n.kind === 'fog' ? '#6b675a' : '#8a8778'}">${esc(n.kind === 'fog' ? '' : n.id)}</text>
<text x="${p.x + 7}" y="${p.y + 23}" font-family="Segoe UI, sans-serif" font-size="9" font-weight="600" fill="${n.kind === 'fog' ? '#6b675a' : '#e8e4d8'}">${esc(label)}</text></g>`;
  }).join('');

  return `<section class="tp-treeview"><h2 class="tp-tier__head">TREE VIEW</h2>
<div class="tp-tier__hint">foundations → research, edges colored by their source branch · dashed = another branch's tech · fog stands apart: what feeds it is not yet known</div>
<div class="tp-treeview__scroll"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(b.label)} tech tree graph">${edgeSvg}${nodeSvg}</svg></div></section>`;
}

function tierColumn(title, bodyHtml, hint) {
  return `<section class="tp-tier"><h2 class="tp-tier__head">${esc(title)}</h2>${hint ? `<div class="tp-tier__hint">${esc(hint)}</div>` : ''}<div class="tp-tier__list">${bodyHtml}</div></section>`;
}

function renderTechPage(branchKey, techTree, opts = {}) {
  const branches = techTree.branches || [];
  const b = branches.find((x) => x.key === branchKey);
  if (!b) return null;
  const icon = ICONS[b.icon] || (() => '');
  const pendingSignals = opts.pendingSignals || [];

  const rootsHtml = b.roots.map((r) => node('tp-node--root',
    `<div class="tp-node__t">${esc(r.id)} · ${esc(r.title)}</div><div class="tp-node__s">${esc(r.note)}</div>`, r.id)).join('')
    || node('tp-node--seed', 'no foundations recorded for this branch');

  const signalHistory = Array.isArray(opts.signalHistory) ? opts.signalHistory : [];

  // A grown node keeps its request history: the owner's click is often WHY it
  // grew (TECH-DATALINKS, TECH-DASH2B and TECH-P5AUTO were all owner-chosen),
  // and hiding the answer once the work lands loses the very connection the
  // signal loop exists to show.
  const grownHtml = b.grown.map((g) => node('tp-node--grown',
    `<div class="tp-node__t">✓ ${esc(g.id)} · ${esc(g.title)}</div><div class="tp-node__s">researched ${esc(g.researchedOn)}</div>${prereqChips(g.prereqs, branches)}${answeredBlock(g, signalHistory)}${prelimBlock(g.prelim)}`, g.id)).join('');

  const availHtml = b.available.map((a) => node('tp-node--avail',
    `<div class="tp-node__t">${branchKey === 'agi' ? ICONS.iceBulb(15) : '💡'} ${esc(a.id)} · ${esc(a.title)}</div>` +
    `<div class="tp-node__s">research: ${esc(a.research)}</div>${prereqChips(a.prereqs, branches)}` +
    `${a.signal ? signalButton(a, pendingSignals, signalHistory) : compactSignal(a, pendingSignals, signalHistory)}${prelimBlock(a.prelim)}`, a.id)).join('')
    || node('tp-node--seed', 'no research currently available on this branch');

  // A gated node names its GATE, not just its remainder — the lock is only
  // honest if the reason is legible (cycle 154: RB-007 used to render as
  // clickable research despite needing the owner's own authorization).
  const gatedHtml = b.gated.map((g) => node('tp-node--gated',
    `<div class="tp-node__t">🔒 ${esc(g.id)} · ${esc(g.title)}</div><div class="tp-node__s">${esc(g.note)}</div>` +
    `${g.gate ? `<div class="tp-node__gate">🔑 ${esc(g.gate)} — yours to authorize; the agent will not request it</div>` : ''}` +
    `${prereqChips(g.prereqs, branches)}${answeredBlock(g, signalHistory)}`, g.id)).join('')
    || node('tp-node--seed', 'nothing gated');

  const fogHtml = b.future.map((f) => node('tp-node--fog', `<div class="tp-node__t">❓ ${esc(f.title)}</div>`, f.id)).join('');

  // Signal history (factory page only — the coordination point): the append-only
  // queue rendered as a log, newest first. Clicks and their answers, on the record.
  let historyHtml = '';
  if (branchKey === 'factory' && Array.isArray(opts.signalHistory) && opts.signalHistory.length) {
    const rows = opts.signalHistory.slice(-8).reverse().map((r) => {
      const state = r.status === 'pending' ? '⚡ pending' : ('✓ done ' + String(r.ackAt || '').slice(0, 16).replace('T', ' '));
      return `<div class="tp-sig-log__row"><span class="tp-sig-log__state">${esc(state)}</span><span class="tp-sig-log__tech">${esc(r.tech)}</span><span class="tp-sig-log__note">${esc(r.status === 'pending' ? (r.requested || '') : (r.ackNote || ''))}</span></div>`;
    }).join('');
    historyHtml = `<section class="tp-sig-log"><h2 class="tp-tier__head">SIGNAL LOG</h2><div class="tp-tier__hint">the lightbulb queue — every request and its answer, append-only</div>${rows}</section>`;
  }

  const others = branches.filter((x) => x.key !== branchKey)
    .map((o) => `<a class="tp-cross" href="/tech/${o.key}" style="border-color:${o.color}">${ICONS[o.icon](14)} ${esc(o.label)}: ${o.available.length} research available</a>`)
    .join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(b.label)} — tech tree</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>${CSS.replace(/__ACCENT__/g, b.color)}</style></head>
<body class="tp-body">
${EARLY_SETTINGS}
${navBar(branchKey, branches)}
${LIVE_HTML}
<div class="tp-scape">${headerScape(b.color)}</div>
<header class="tp-head">
  <div class="tp-head__icon">${icon(44)}</div>
  <div><h1 class="tp-h1">${esc(b.label)}</h1><div class="tp-tag">${esc(b.tagline)}</div></div>
</header>
${renderTreeSvg(b, branches)}
<main class="tp-tiers">
  ${tierColumn('FOUNDATIONS', rootsHtml, 'what already exists — new research combines, extends or improves these')}
  ${tierColumn('RESEARCH AVAILABLE', (grownHtml || '') + availHtml, 'the frontier — researchable now')}
  ${tierColumn('GATED', gatedHtml, 'needs an owner decision')}
  ${tierColumn('BEYOND', fogHtml, 'blind research — not yet conceptualised')}
</main>
${historyHtml}
<div class="tp-others">${others}</div>
<footer class="tp-foot">${branchKey === 'factory' && opts.toolInventory ? `live inventory: ${opts.toolInventory.total} scripts across ${opts.toolInventory.dirs} tool directories (counted this request) · ` : ''}rendered per request from tech-tree.json (structure) · RESEARCH_BACKLOG states · roadmap.json cutoff · reload to refresh — this page cannot go stale${techTree.absorbed ? ` · ${techTree.absorbed} pre-tree research items absorbed into the foundations` : ''} · 🤖 AI protocol: docs/agi/TECH_TREE_INTERFACE.md — a click here is an owner instruction; AI proposals arrive as named techs</footer>
${nodeDataIsland(techTree)}
${MODAL_HTML}
${SETTINGS_HTML}
${SIGNAL_SCRIPT}
${MODAL_SCRIPT}
${SETTINGS_SCRIPT}
${LIVE_SCRIPT}
</body></html>`;
}

/**
 * renderNodePage — the SMAC datalinks page proper (cycle 148, owner-signalled
 * TECH-DATALINKS): one page per technology at /tech/node?id=<ID>, with everything
 * the modal shows PLUS the room the modal lacks — the LEDGER TRAIL (every cycle
 * whose record mentions the node, from statusData.ledgerMentions) and Preliminary
 * Data expanded by default. BUILT FROM / UNLOCKS render as server-side LINKS to
 * sibling datalinks pages, so the tree is walkable with no JS at all.
 */
function renderNodePage(id, techTree, opts = {}) {
  const index = buildNodeIndex(techTree);
  const n = index[id];
  if (!n) return null;
  const branches = techTree.branches || [];
  const accent = n.color || '#8a8778';
  const linkChip = (pid) => {
    const t = index[pid] || {};
    const c = t.color || '#8a8778';
    return `<a class="tp-chip tp-chip--link" style="border-color:${c};color:${c}" href="/tech/node?id=${encodeURIComponent(pid)}">${esc(pid)}</a>`;
  };
  const sec = (title) => `<div class="tp-modal__sec">${esc(title)}</div>`;
  const para = (cls, text) => `<p class="tp-modal__p${cls ? ' ' + cls : ''}">${esc(text)}</p>`;
  let body = '';
  if (n.research) body += sec('RESEARCH MEANS') + para('', n.research);
  if (n.note && !n.research) body += sec(n.kind === 'fog' ? 'THE FOG' : 'WHAT THIS IS') + para('', n.note);
  if (n.question) body += sec('THE QUESTION') + para('', n.question);
  if ((n.prereqs || []).length) body += sec('BUILT FROM') + `<div class="tp-modal__chips">${n.prereqs.map((p) => linkChip(p.id)).join(' ')}</div>`;
  if ((n.unlocks || []).length) body += sec('UNLOCKS') + `<div class="tp-modal__chips">${n.unlocks.map(linkChip).join(' ')}</div>`;
  if (n.statusProse) body += sec('FULL RECORD (research backlog, live)') + para('tp-modal__p--prose', n.statusProse);
  if ((n.detail || []).length) body += sec('DETAIL — from the project record') + n.detail.map((d) => para('tp-modal__p--fact', '▪ ' + d)).join('');
  if ((n.prelim || []).length) body += sec('PRELIMINARY DATA — ' + n.prelim.length + ' notes') + n.prelim.map((x) => para('', x)).join('');
  // REQUEST HISTORY (cycle 154): the owner's own clicks on THIS node and the
  // answers they got — the full list, uncapped, which is exactly what a
  // datalinks page is for (the node card shows the newest two).
  const nodeSignals = (opts.signalHistory || [])
    .filter((s) => s.tech === id)
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  if (nodeSignals.length) {
    body += sec('YOUR REQUESTS — ' + nodeSignals.length + ' on this node');
    body += nodeSignals.map((s) => {
      const state = s.status === 'pending'
        ? '⚡ pending — the agent picks it up at its next orient'
        : '✓ answered ' + String(s.ackAt || '').slice(0, 16).replace('T', ' ');
      return `<div class="tp-trail__row"><span class="tp-trail__c">${esc(String(s.at || '').slice(0, 10))}</span><span class="tp-trail__d">${esc(state)}</span><span class="tp-trail__l">${esc(s.status === 'pending' ? (s.requested || '') : (s.ackNote || ''))}</span></div>`;
    }).join('');
  }

  const trail = opts.ledgerTrail || [];
  if (trail.length) {
    body += sec('LEDGER TRAIL — ' + trail.length + ' cycle' + (trail.length === 1 ? '' : 's') + ' mention this') +
      trail.map((t) => `<div class="tp-trail__row"><span class="tp-trail__c">c${esc(String(t.cycle))}</span><span class="tp-trail__d">${esc(t.date)}</span><span class="tp-trail__l">${esc(t.label)}</span></div>`).join('');
  } else if (n.kind !== 'fog') {
    body += sec('LEDGER TRAIL') + para('tp-modal__p--prose', 'no ledger cycle mentions this id yet — the trail writes itself as work lands');
  }
  const meta = [n.kind, n.priority ? 'priority ' + n.priority : '', n.researchedOn ? 'researched ' + n.researchedOn : '', n.lastUpdate ? 'updated ' + n.lastUpdate : ''].filter(Boolean).join(' · ');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(id)} — datalinks</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>${CSS.replace(/__ACCENT__/g, accent)}</style></head>
<body class="tp-body">
${EARLY_SETTINGS}
${navBar(n.branch, branches)}
<header class="tp-head"><div><div class="tp-modal__id" style="color:${accent}">${esc(n.branchLabel || '')} · DATALINKS</div><h1 class="tp-h1" style="color:#e8e4d8">${esc(n.title || id)}</h1><div class="tp-tag">${esc(meta)}</div></div></header>
<main class="tp-node-page">${body}</main>
<footer class="tp-foot">rendered per request · <a class="tp-foot__back" href="/tech/${esc(n.branch)}">◀ back to ${esc(n.branchLabel || 'branch')}</a> · 🤖 AI protocol: docs/agi/TECH_TREE_INTERFACE.md</footer>
${SETTINGS_HTML}
${SETTINGS_SCRIPT}
</body></html>`;
}

const CSS = `
* { box-sizing: border-box; margin: 0; }
.tp-body { background: #101216; color: #e8e4d8; font-family: 'Segoe UI', system-ui, sans-serif; min-height: 100vh; padding-bottom: 24px; }
.tp-nav { display: flex; gap: 6px; padding: 10px 18px; background: #0c0e11; border-bottom: 1px solid #232833; }
.tp-nav__item { display: inline-flex; align-items: center; gap: 6px; color: #8a8778; text-decoration: none; font-size: 0.6875rem; letter-spacing: 0.12em; padding: 5px 10px; border: 1px solid transparent; border-radius: 4px; }
.tp-nav__item:hover { color: #e8e4d8; border-color: #2e3440; }
.tp-nav__item--cur { color: __ACCENT__; border-color: __ACCENT__; }
.tp-scape { border-bottom: 1px solid #232833; }
.tp-head { display: flex; align-items: center; gap: 14px; padding: 16px 22px 6px; }
.tp-h1 { font-size: 1.375rem; letter-spacing: 0.18em; color: __ACCENT__; }
.tp-tag { font-size: 0.6875rem; color: #8a8778; margin-top: 3px; }
.tp-tiers { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 14px 22px; }
@media (max-width: 980px) { .tp-tiers { grid-template-columns: repeat(2, 1fr); } }
.tp-tier__head { font-size: 0.6875rem; letter-spacing: 0.16em; color: #8a8778; border-bottom: 2px solid __ACCENT__; padding-bottom: 5px; }
.tp-tier__hint { font-size: 0.5938rem; color: #6b675a; margin: 5px 0 8px; }
.tp-node { background: #14171c; border: 1px solid #2e3440; border-left: 3px solid #2e3440; border-radius: 5px; padding: 8px 10px; margin-bottom: 8px; }
.tp-node__t { font-size: 0.7188rem; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.tp-node__s { font-size: 0.625rem; color: #8a8778; margin-top: 4px; }
.tp-node__req { font-size: 0.5938rem; color: #6b675a; margin-top: 6px; }
.tp-chip { display: inline-block; border: 1px solid; border-radius: 3px; padding: 0 5px; font-size: 0.5625rem; letter-spacing: 0.06em; }
.tp-node--root { border-left-color: #8a8778; }
.tp-node--grown { border-left-color: __ACCENT__; opacity: 0.85; }
.tp-node--avail { border-color: __ACCENT__; border-left-width: 3px; box-shadow: 0 0 8px color-mix(in srgb, __ACCENT__ 22%, transparent); }
.tp-node--gated { border-left-color: #b34d4d; opacity: 0.85; }
.tp-node--fog { border-style: dashed; opacity: 0.45; text-align: center; }
.tp-node--seed { border-style: dashed; opacity: 0.55; font-size: 0.625rem; color: #8a8778; text-align: center; }
.tp-signal { display: flex; align-items: center; gap: 12px; width: 100%; margin-top: 10px; padding: 10px 12px; background: #0c1218; border: 2px solid __ACCENT__; border-radius: 6px; color: #e8f4fb; cursor: pointer; text-align: left; font-family: inherit; box-shadow: 0 0 14px color-mix(in srgb, __ACCENT__ 40%, transparent); }
.tp-signal:hover:not(:disabled) { box-shadow: 0 0 22px color-mix(in srgb, __ACCENT__ 60%, transparent); background: #0e1620; }
.tp-signal:disabled { cursor: default; }
.tp-signal--sent { border-style: dashed; box-shadow: none; opacity: 0.85; }
.tp-signal__t { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.14em; }
.tp-signal__s { font-size: 0.5938rem; color: #8fb8cf; margin-top: 3px; }
.tp-prelim { margin-top: 8px; border-top: 1px dashed #2e3440; padding-top: 6px; }
.tp-prelim summary { font-size: 0.5625rem; letter-spacing: 0.14em; color: #6b675a; cursor: pointer; }
.tp-prelim summary:hover { color: #8a8778; }
.tp-prelim__p { font-size: 0.625rem; color: #a39f8f; margin: 6px 0 0; line-height: 1.5; }
.tp-treeview { padding: 14px 22px 0; }
.tp-treeview__scroll { overflow-x: auto; background: #0c0e11; border: 1px solid #232833; border-radius: 6px; padding: 6px; }
[data-node-id] { cursor: pointer; }
.tp-node[data-node-id]:hover { border-color: #8a8778; }
.tp-modal { background: #14171c; color: #e8e4d8; border: 2px solid var(--accent, #8a8778); border-radius: 8px; padding: 0 18px 16px; max-width: 640px; width: min(92vw, 640px); max-height: 84vh; box-shadow: 0 0 40px rgba(0,0,0,0.7), 0 0 18px color-mix(in srgb, var(--accent, #8a8778) 25%, transparent); }
.tp-modal::backdrop { background: rgba(6, 8, 11, 0.75); }
.tp-modal__bar { display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; background: #14171c; padding: 12px 0 6px; }
.tp-modal__id { font-size: 0.625rem; letter-spacing: 0.16em; color: var(--accent, #8a8778); }
.tp-modal__x { background: none; border: 1px solid #2e3440; color: #8a8778; border-radius: 4px; cursor: pointer; font-size: 0.6875rem; padding: 2px 8px; }
.tp-modal__x:hover { color: #e8e4d8; border-color: #8a8778; }
.tp-modal__title { font-size: 1.0625rem; letter-spacing: 0.04em; margin: 2px 0 4px; }
.tp-modal__meta { font-size: 0.625rem; color: #8a8778; border-bottom: 1px solid #232833; padding-bottom: 8px; }
.tp-modal__sec { font-size: 0.5938rem; letter-spacing: 0.16em; color: var(--accent, #8a8778); margin: 14px 0 4px; }
.tp-modal__p { font-size: 0.7188rem; line-height: 1.55; color: #cfcabd; margin: 4px 0; }
.tp-modal__p--prose { font-size: 0.6562rem; color: #a39f8f; }
.tp-modal__p--fact { color: #d8d3c4; }
.tp-modal__chips { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.tp-modal__chiplabel { font-size: 0.5625rem; color: #6b675a; margin-right: 3px; }
.tp-chip--hop { cursor: pointer; background: none; font-family: inherit; padding: 2px 7px; }
.tp-chip--hop:hover { background: #1b1f26; }
.tp-nav__settings { margin-left: auto; background: none; border: 1px solid #2e3440; border-radius: 4px; color: #8a8778; cursor: pointer; padding: 4px 8px; display: inline-flex; align-items: center; }
.tp-nav__settings:hover { color: __ACCENT__; border-color: __ACCENT__; }
.tp-settings { max-width: 420px; }
.tp-settings__row { display: flex; align-items: center; gap: 10px; margin: 10px 0 4px; }
.tp-settings__row input[type=range] { flex: 1; accent-color: __ACCENT__; }
.tp-settings__step, .tp-settings__reset { background: none; border: 1px solid #2e3440; border-radius: 4px; color: #cfcabd; cursor: pointer; font-family: inherit; font-size: 0.6875rem; padding: 3px 9px; }
.tp-settings__step:hover, .tp-settings__reset:hover { border-color: __ACCENT__; color: __ACCENT__; }
.tp-settings__pct { font-size: 0.6875rem; color: #8a8778; min-width: 2.6em; text-align: right; font-variant-numeric: tabular-nums; }
.tp-settings__note { color: #6b675a; }
.tp-signal-mini { display: inline-flex; align-items: center; gap: 5px; margin-top: 8px; background: none; border: 1px dashed #2e3440; border-radius: 4px; color: #8a8778; cursor: pointer; font-family: inherit; font-size: 0.5938rem; letter-spacing: 0.08em; padding: 3px 8px; }
.tp-signal-mini:hover:not(:disabled) { border-color: __ACCENT__; color: __ACCENT__; }
.tp-signal-mini--sent { border-style: solid; border-color: #4d9ec8; color: #9fd4ec; cursor: default; }
.tp-live { display: flex; align-items: center; gap: 9px; padding: 5px 22px; background: #0d1014; border-bottom: 1px solid #1b1f26; font-size: 0.5938rem; flex-wrap: wrap; }
.tp-live__dot { width: 7px; height: 7px; border-radius: 50%; background: #6b675a; flex: none; }
.tp-live__dot--busy { background: #55a377; box-shadow: 0 0 6px #55a377; }
.tp-live__dot--idle { background: #4a4a4a; }
.tp-live__phase { color: #cfcabd; letter-spacing: 0.04em; text-transform: uppercase; }
.tp-live__note { color: #8a8778; flex: 1; min-width: 12em; }
.tp-live__counts { color: __ACCENT__; }
.tp-live__pill { background: #1d2733; color: #cfe3ff; border: 1px solid #3a6ea5; border-radius: 10px; padding: 2px 9px; font-size: 0.5625rem; cursor: pointer; font-family: inherit; }
.tp-live__pill:hover { background: #24354a; }
.tp-answered { margin-top: 6px; padding: 5px 7px; border-left: 2px solid #55a377; background: #12161c; border-radius: 0 3px 3px 0; }
.tp-answered__h { font-size: 0.5313rem; letter-spacing: 0.09em; color: #55a377; margin-bottom: 3px; }
.tp-answered__row { display: flex; flex-direction: column; gap: 1px; padding: 2px 0; }
.tp-answered__when { font-size: 0.5625rem; color: #8a8778; }
.tp-answered__note { font-size: 0.5938rem; color: #b8b3a4; line-height: 1.4; }
.tp-answered__more { font-size: 0.5313rem; color: #6b675a; font-style: italic; margin-top: 2px; }
.tp-node__gate { font-size: 0.5938rem; color: #c8a45a; margin-top: 3px; }
.tp-sig-log { padding: 6px 22px 4px; }
.tp-sig-log__row { display: flex; gap: 10px; align-items: baseline; font-size: 0.625rem; color: #8a8778; padding: 3px 0; border-bottom: 1px dashed #1b1f26; }
.tp-sig-log__state { min-width: 9.5em; color: #cfcabd; }
.tp-sig-log__tech { min-width: 10em; color: __ACCENT__; }
.tp-sig-log__note { flex: 1; color: #6b675a; }
.tp-node-page { max-width: 720px; padding: 6px 22px 18px; }
.tp-chip--link { text-decoration: none; }
.tp-chip--link:hover { background: #1b1f26; }
.tp-modal__page { color: #8fb8cf; font-size: 0.625rem; text-decoration: none; }
.tp-modal__page:hover { text-decoration: underline; }
.tp-trail__row { display: flex; gap: 10px; align-items: baseline; font-size: 0.6563rem; padding: 3px 0; border-bottom: 1px dashed #1b1f26; }
.tp-trail__c { min-width: 3.2em; color: __ACCENT__; }
.tp-trail__d { min-width: 6.5em; color: #6b675a; }
.tp-trail__l { flex: 1; color: #a39f8f; }
.tp-foot__back { color: #8a8778; }
.tp-others { display: flex; gap: 10px; padding: 4px 22px 10px; flex-wrap: wrap; }
.tp-cross { display: inline-flex; align-items: center; gap: 6px; font-size: 0.625rem; color: #8a8778; text-decoration: none; border: 1px dashed; border-radius: 4px; padding: 5px 9px; }
.tp-cross:hover { color: #e8e4d8; }
.tp-foot { font-size: 0.5938rem; color: #6b675a; padding: 8px 22px; border-top: 1px solid #232833; }
`;

module.exports = { renderTechPage, renderNodePage, buildNodeIndex, collectGraph, assignDepths, renderTreeSvg, NAV };
