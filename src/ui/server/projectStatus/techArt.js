'use strict';

/**
 * techArt.js — hand-authored SVG art for the tech-tree pages (server-side strings;
 * no image model involved — stated plainly because the owner asked about generated
 * images, and inline SVG is what this stack can actually produce and version).
 *
 * Style brief (owner, 2026-07-27): SMAC-like sci-fi. Dark console surfaces, thin
 * luminous linework, and for the AGI branch a COLD BLUE-WHITE light — the bulb's
 * glow runs white-hot core -> ice halo (#4d9ec8, palette-validated), never warm.
 * Icons are the secondary encoding that keeps the branch palette legal where the
 * gold-green tritan distance sits in the floor band: identity is never color alone.
 */

const IDS = { n: 0 };
const uid = (p) => `${p}${++IDS.n}`;

/** 💡 in cold light — white core, ice halo, hex filament (AGI). */
function iceBulb(size = 28) {
  const g = uid('ib');
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="AGI research (cold light)">
<defs><radialGradient id="${g}" cx="50%" cy="42%" r="55%">
<stop offset="0%" stop-color="#ffffff"/><stop offset="45%" stop-color="#cfeaf7"/><stop offset="100%" stop-color="#4d9ec8" stop-opacity="0.15"/>
</radialGradient></defs>
<circle cx="16" cy="13" r="11.5" fill="url(#${g})"/>
<path d="M16 4.5a8.5 8.5 0 0 0-4.6 15.6c.9.6 1.4 1.5 1.5 2.5h6.2c.1-1 .6-1.9 1.5-2.5A8.5 8.5 0 0 0 16 4.5Z" fill="none" stroke="#bfe3f5" stroke-width="1.3"/>
<path d="M13.4 22.6h5.2M13.8 24.8h4.4M14.6 27h2.8" stroke="#7fb8d8" stroke-width="1.2" stroke-linecap="round"/>
<path d="M16 17.5l-2.3-3.4h4.6L16 17.5Z" fill="none" stroke="#e8f6ff" stroke-width="1"/>
<path d="M16 1.2v1.8M25.5 4.6l-1.3 1.3M28.8 13h-1.8M6.5 4.6l1.3 1.3M3.2 13h1.8" stroke="#9fd4ec" stroke-width="1.1" stroke-linecap="round"/>
</svg>`;
}

/** 🖥 a growing tree on a monitor (the tech-tree app itself). */
function treeMonitor(size = 28) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Tech-tree application">
<rect x="3" y="4" width="26" height="17" rx="2" fill="#0c1512" stroke="#55a377" stroke-width="1.3"/>
<path d="M16 18v-8M16 13l-4.2-3M16 13l4.2-3M11.8 10l-2.6-1.8M20.2 10l2.6-1.8M16 10.5V7.5" stroke="#7fc39c" stroke-width="1.2" stroke-linecap="round"/>
<circle cx="16" cy="7" r="1.1" fill="#8fdcb2"/><circle cx="9" cy="7.9" r="1" fill="#55a377"/><circle cx="23" cy="7.9" r="1" fill="#55a377"/>
<circle cx="11.8" cy="9.8" r="0.9" fill="#3f7f5c"/><circle cx="20.2" cy="9.8" r="0.9" fill="#3f7f5c"/>
<path d="M13 24h6M11 27h10" stroke="#3d5c4c" stroke-width="1.4" stroke-linecap="round"/>
<path d="M16 21v3" stroke="#3d5c4c" stroke-width="1.4"/>
</svg>`;
}

/** 🕷 a spider on its web (the crawler). */
function spiderWeb(size = 28) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Crawler">
<g stroke="#8a7448" stroke-width="0.8" fill="none" opacity="0.9">
<path d="M16 2v28M2 16h28M6 6l20 20M26 6L6 26"/>
<path d="M16 9a7 7 0 0 1 7 7 7 7 0 0 1-7 7 7 7 0 0 1-7-7 7 7 0 0 1 7-7Z" opacity="0.7"/>
<path d="M16 4.5a11.5 11.5 0 0 1 11.5 11.5A11.5 11.5 0 0 1 16 27.5 11.5 11.5 0 0 1 4.5 16 11.5 11.5 0 0 1 16 4.5Z" opacity="0.5"/>
</g>
<g stroke="#d9b25f" stroke-width="1.1" stroke-linecap="round">
<path d="M13 13l-3.6-2.6M13.4 15.6l-4.4-.4M13.6 17.8l-3.8 1.8M19 13l3.6-2.6M18.6 15.6l4.4-.4M18.4 17.8l3.8 1.8"/>
</g>
<ellipse cx="16" cy="16.6" rx="2.6" ry="3.2" fill="#b8862e"/>
<circle cx="16" cy="12.6" r="1.7" fill="#d9b25f"/>
</svg>`;
}

/** Wide, thin SMAC-ish scape: starfield, planet horizon, luminous grid in the branch color. */
function headerScape(color = '#4d9ec8', w = 960, h = 96) {
  const g1 = uid('hs'); const g2 = uid('hg');
  const stars = [[40, 18], [120, 34], [210, 12], [330, 26], [420, 40], [510, 14], [600, 30], [700, 20], [800, 38], [880, 16], [930, 30], [260, 44], [560, 44], [740, 46]]
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 === 0 ? 1.3 : 0.8}" fill="#e8f4fb" opacity="${i % 2 ? 0.5 : 0.85}"/>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="" style="width:100%;height:${h}px;display:block">
<defs>
<linearGradient id="${g1}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#07090d"/><stop offset="100%" stop-color="#101216"/></linearGradient>
<radialGradient id="${g2}" cx="50%" cy="100%" r="80%"><stop offset="0%" stop-color="${color}" stop-opacity="0.5"/><stop offset="55%" stop-color="${color}" stop-opacity="0.12"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${w}" height="${h}" fill="url(#${g1})"/>${stars}
<ellipse cx="${w / 2}" cy="${h + 150}" rx="${w * 0.75}" ry="170" fill="url(#${g2})"/>
<ellipse cx="${w / 2}" cy="${h + 152}" rx="${w * 0.75}" ry="170" fill="none" stroke="${color}" stroke-width="1.2" opacity="0.8"/>
${[0.25, 0.5, 0.75].map((f) => `<path d="M${w * f} ${h} L${w / 2} ${h - 200}" stroke="${color}" stroke-width="0.5" opacity="0.18"/>`).join('')}
<ellipse cx="${w / 2}" cy="${h + 152}" rx="${w * 0.55}" ry="128" fill="none" stroke="${color}" stroke-width="0.6" opacity="0.3"/>
</svg>`;
}

/** 🏭 a factory wearing a spanner badge (the tool factory). */
function factorySpanner(size = 28) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Tool factory">
<path d="M3.5 26.5V13l6.5 4.4V13l6.5 4.4V13l8.5 5.6v7.9Z" fill="#191320" stroke="#a678c8" stroke-width="1.3" stroke-linejoin="round"/>
<rect x="6" y="6.5" width="3.2" height="7.5" fill="#191320" stroke="#a678c8" stroke-width="1.2"/>
<circle cx="7.6" cy="4.6" r="1.2" fill="#cfa7e0" opacity="0.55"/>
<circle cx="10.2" cy="2.9" r="0.9" fill="#cfa7e0" opacity="0.35"/>
<path d="M7 22.5h3.4M13 22.5h3.4" stroke="#8a5fa8" stroke-width="1.3" stroke-linecap="round"/>
<circle cx="23.6" cy="23.6" r="7" fill="#231a2b" stroke="#cfa7e0" stroke-width="1.2"/>
<path d="M20.6 26.6l3.4-3.4M24 23.2a2.4 2.4 0 1 0 2.4-2.4l-1.7.5-.6 1.9Z" fill="none" stroke="#e6d2f2" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="20.4" cy="26.8" r="1.15" fill="none" stroke="#e6d2f2" stroke-width="1.4"/>
</svg>`;
}

const ICONS = { iceBulb, treeMonitor, spiderWeb, factorySpanner };

module.exports = { iceBulb, treeMonitor, spiderWeb, factorySpanner, headerScape, ICONS };
