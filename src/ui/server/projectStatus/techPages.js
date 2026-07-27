'use strict';

/**
 * techPages.js — the three SMAC-style branch pages (owner directive 2026-07-27:
 * "different parts of the tech tree, like in SMAC... just 3 pages for the moment"):
 *
 *   /tech/agi      — 💡 cold blue-white light   (#4d9ec8, palette-validated)
 *   /tech/tree     — 🖥 a tree on a monitor      (#55a377)
 *   /tech/crawler  — 🕷 a spider on its web      (#b8862e)
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

const { ICONS, headerScape } = require('./techArt');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NAV = [
  { key: 'status', href: '/', label: 'STATUS' },
  { key: 'agi', href: '/tech/agi', label: 'AGI' },
  { key: 'tree', href: '/tech/tree', label: 'TECH TREE' },
  { key: 'crawler', href: '/tech/crawler', label: 'CRAWLER' }
];

function navBar(currentKey, branches) {
  const items = NAV.map((n) => {
    const b = branches.find((x) => x.key === n.key);
    const icon = b ? ICONS[b.icon](16) : '';
    const cur = n.key === currentKey;
    return `<a class="tp-nav__item${cur ? ' tp-nav__item--cur' : ''}" href="${n.href}"${cur ? ' aria-current="page"' : ''}>${icon}<span>${esc(n.label)}</span></a>`;
  }).join('');
  return `<nav class="tp-nav">${items}</nav>`;
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

function node(cls, inner) { return `<div class="tp-node ${cls}">${inner}</div>`; }

function tierColumn(title, bodyHtml, hint) {
  return `<section class="tp-tier"><h2 class="tp-tier__head">${esc(title)}</h2>${hint ? `<div class="tp-tier__hint">${esc(hint)}</div>` : ''}<div class="tp-tier__list">${bodyHtml}</div></section>`;
}

function renderTechPage(branchKey, techTree) {
  const branches = techTree.branches || [];
  const b = branches.find((x) => x.key === branchKey);
  if (!b) return null;
  const icon = ICONS[b.icon] || (() => '');

  const rootsHtml = b.roots.map((r) => node('tp-node--root',
    `<div class="tp-node__t">${esc(r.id)} · ${esc(r.title)}</div><div class="tp-node__s">${esc(r.note)}</div>`)).join('')
    || node('tp-node--seed', 'no foundations recorded for this branch');

  const grownHtml = b.grown.map((g) => node('tp-node--grown',
    `<div class="tp-node__t">✓ ${esc(g.id)} · ${esc(g.title)}</div><div class="tp-node__s">researched ${esc(g.researchedOn)}</div>${prereqChips(g.prereqs, branches)}`)).join('');

  const availHtml = b.available.map((a) => node('tp-node--avail',
    `<div class="tp-node__t">${branchKey === 'agi' ? ICONS.iceBulb(15) : '💡'} ${esc(a.id)} · ${esc(a.title)}</div>` +
    `<div class="tp-node__s">research: ${esc(a.research)}</div>${prereqChips(a.prereqs, branches)}`)).join('')
    || node('tp-node--seed', 'no research currently available on this branch');

  const gatedHtml = b.gated.map((g) => node('tp-node--gated',
    `<div class="tp-node__t">🔒 ${esc(g.id)} · ${esc(g.title)}</div><div class="tp-node__s">${esc(g.note)}</div>${prereqChips(g.prereqs, branches)}`)).join('')
    || node('tp-node--seed', 'nothing gated');

  const fogHtml = b.future.map((f) => node('tp-node--fog', `<div class="tp-node__t">❓ ${esc(f.title)}</div>`)).join('');

  const others = branches.filter((x) => x.key !== branchKey)
    .map((o) => `<a class="tp-cross" href="/tech/${o.key}" style="border-color:${o.color}">${ICONS[o.icon](14)} ${esc(o.label)}: ${o.available.length} research available</a>`)
    .join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(b.label)} — tech tree</title>
<style>${CSS.replace(/__ACCENT__/g, b.color)}</style></head>
<body class="tp-body">
${navBar(branchKey, branches)}
<div class="tp-scape">${headerScape(b.color)}</div>
<header class="tp-head">
  <div class="tp-head__icon">${icon(44)}</div>
  <div><h1 class="tp-h1">${esc(b.label)}</h1><div class="tp-tag">${esc(b.tagline)}</div></div>
</header>
<main class="tp-tiers">
  ${tierColumn('FOUNDATIONS', rootsHtml, 'what already exists — new research combines, extends or improves these')}
  ${tierColumn('RESEARCH AVAILABLE', (grownHtml || '') + availHtml, 'the frontier — researchable now')}
  ${tierColumn('GATED', gatedHtml, 'needs an owner decision')}
  ${tierColumn('BEYOND', fogHtml, 'blind research — not yet conceptualised')}
</main>
<div class="tp-others">${others}</div>
<footer class="tp-foot">rendered per request from tech-tree.json (structure) · RESEARCH_BACKLOG states · roadmap.json cutoff · reload to refresh — this page cannot go stale${techTree.absorbed ? ` · ${techTree.absorbed} pre-tree research items absorbed into the foundations` : ''}</footer>
</body></html>`;
}

const CSS = `
* { box-sizing: border-box; margin: 0; }
.tp-body { background: #101216; color: #e8e4d8; font-family: 'Segoe UI', system-ui, sans-serif; min-height: 100vh; padding-bottom: 24px; }
.tp-nav { display: flex; gap: 6px; padding: 10px 18px; background: #0c0e11; border-bottom: 1px solid #232833; }
.tp-nav__item { display: inline-flex; align-items: center; gap: 6px; color: #8a8778; text-decoration: none; font-size: 11px; letter-spacing: 0.12em; padding: 5px 10px; border: 1px solid transparent; border-radius: 4px; }
.tp-nav__item:hover { color: #e8e4d8; border-color: #2e3440; }
.tp-nav__item--cur { color: __ACCENT__; border-color: __ACCENT__; }
.tp-scape { border-bottom: 1px solid #232833; }
.tp-head { display: flex; align-items: center; gap: 14px; padding: 16px 22px 6px; }
.tp-h1 { font-size: 22px; letter-spacing: 0.18em; color: __ACCENT__; }
.tp-tag { font-size: 11px; color: #8a8778; margin-top: 3px; }
.tp-tiers { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 14px 22px; }
@media (max-width: 980px) { .tp-tiers { grid-template-columns: repeat(2, 1fr); } }
.tp-tier__head { font-size: 11px; letter-spacing: 0.16em; color: #8a8778; border-bottom: 2px solid __ACCENT__; padding-bottom: 5px; }
.tp-tier__hint { font-size: 9.5px; color: #6b675a; margin: 5px 0 8px; }
.tp-node { background: #14171c; border: 1px solid #2e3440; border-left: 3px solid #2e3440; border-radius: 5px; padding: 8px 10px; margin-bottom: 8px; }
.tp-node__t { font-size: 11.5px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.tp-node__s { font-size: 10px; color: #8a8778; margin-top: 4px; }
.tp-node__req { font-size: 9.5px; color: #6b675a; margin-top: 6px; }
.tp-chip { display: inline-block; border: 1px solid; border-radius: 3px; padding: 0 5px; font-size: 9px; letter-spacing: 0.06em; }
.tp-node--root { border-left-color: #8a8778; }
.tp-node--grown { border-left-color: __ACCENT__; opacity: 0.85; }
.tp-node--avail { border-color: __ACCENT__; border-left-width: 3px; box-shadow: 0 0 8px color-mix(in srgb, __ACCENT__ 22%, transparent); }
.tp-node--gated { border-left-color: #b34d4d; opacity: 0.85; }
.tp-node--fog { border-style: dashed; opacity: 0.45; text-align: center; }
.tp-node--seed { border-style: dashed; opacity: 0.55; font-size: 10px; color: #8a8778; text-align: center; }
.tp-others { display: flex; gap: 10px; padding: 4px 22px 10px; flex-wrap: wrap; }
.tp-cross { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; color: #8a8778; text-decoration: none; border: 1px dashed; border-radius: 4px; padding: 5px 9px; }
.tp-cross:hover { color: #e8e4d8; }
.tp-foot { font-size: 9.5px; color: #6b675a; padding: 8px 22px; border-top: 1px solid #232833; }
`;

module.exports = { renderTechPage, NAV };
