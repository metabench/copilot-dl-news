#!/usr/bin/env node
'use strict';

/**
 * progress-svg.js — render the AGI loop's progress as a self-contained SVG dashboard.
 *
 * WHY (owner directive 2026-07-27): the workflow should PRODUCE visible progress
 * artifacts, not just append-only prose. The ledger already carries a machine stanza
 * (`<!-- cycle:{...} -->`) under every row, so progress is renderable from data the
 * loop already emits — no new bookkeeping for agents.
 *
 * DESIGN DECISION — regenerate, never mutate. The SVG is a pure function of
 * (ledger stanzas + annotations sidecar). "Modifying" the picture means editing the
 * DATA (append a stanza, add an annotation), then re-rendering. Mutating SVG markup
 * directly would rot the moment the layout changes, and would let the picture drift
 * from the ledger it claims to summarise.
 *
 * DETERMINISM: same inputs => byte-identical output (no timestamps, no randomness),
 * so the committed SVG diffs meaningfully in git and CI can verify it is current.
 *
 * Colors validated 2026-07-27 with the dataviz palette validator (dark surface):
 * gold #b8862e / green #55a377 / red #b34d4d — all four checks pass, worst adjacent
 * CVD dE 16.1. Text always wears ink/muted, never series colors.
 *
 *   node tools/agi/progress-svg.js                          # render default
 *   node tools/agi/progress-svg.js --last 40                # only the last 40 cycles
 *   node tools/agi/progress-svg.js --annotate "118=Warm-up bug fixed"   # add marker + render
 *   node tools/agi/progress-svg.js --print-metrics          # numbers only, no file
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_LEDGER = path.join(ROOT, 'docs', 'agi', 'IMPROVEMENT_LEDGER.md');
const DEFAULT_OUT = path.join(ROOT, 'docs', 'agi', 'progress', 'progress.svg');
const DEFAULT_ANNOTATIONS = path.join(ROOT, 'docs', 'agi', 'progress', 'annotations.json');

// ---- data ------------------------------------------------------------------

/** Extract every `<!-- cycle:{...} -->` stanza; malformed ones are counted, not fatal. */
function parseCycleStanzas(text) {
  const cycles = [];
  let skipped = 0;
  const re = /<!--\s*cycle:(\{[\s\S]*?\})\s*-->/g;
  let m;
  while ((m = re.exec(text))) {
    try { cycles.push(JSON.parse(m[1])); } catch (_) { skipped++; }
  }
  cycles.sort((a, b) => (a.id || 0) - (b.id || 0));
  return { cycles, skipped };
}

/** Per-cycle series + running totals. Every tile value is recountable from stanzas. */
function computeSeries(cycles) {
  let cum = 0;
  const rows = cycles.map((c) => {
    const vi = Number(c.verified_improvements) || 0;
    cum += vi;
    const defects = Array.isArray(c.defects) ? c.defects : [];
    const pre = defects.filter((d) => d && d.preship).length;
    const post = defects.length - pre;
    // A cycle that RETRACTED or CORRECTED an earlier claim carries a retracts/corrects
    // field in its stanza. These are marked on the chart deliberately: an honest loop
    // shows its reversals, not only its wins.
    const correction = Boolean(c.retracts || c.corrects);
    return {
      id: c.id, date: c.date || '', vi, cum, pre, post,
      pages: Number(c.pages_crawled) || 0, correction
    };
  });
  const totals = {
    cycles: rows.length,
    improvements: cum,
    defectsPre: rows.reduce((a, r) => a + r.pre, 0),
    defectsPost: rows.reduce((a, r) => a + r.post, 0),
    corrections: rows.filter((r) => r.correction).length,
    pages: rows.reduce((a, r) => a + r.pages, 0),
    maxDate: rows.reduce((a, r) => (r.date > a ? r.date : a), '')
  };
  return { rows, totals };
}

// ---- svg -------------------------------------------------------------------

const C = {
  bg: '#101216', panel: '#171a20', grid: '#232833', axis: '#2e3440',
  ink: '#e8e4d8', muted: '#8a8778',
  gold: '#b8862e', green: '#55a377', red: '#b34d4d'
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtK = (n) => (n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
const r1 = (n) => Math.round(n * 10) / 10;

function renderSvg({ rows, totals }, annotations = []) {
  const W = 980, H = 664, PAD = 28;
  const s = [];
  s.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="AGI loop progress dashboard">`);
  s.push(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`);
  const T = (x, y, txt, size, fill, opts = '') => s.push(`<text x="${r1(x)}" y="${r1(y)}" font-family="Segoe UI, system-ui, sans-serif" font-size="${size}" fill="${fill}" ${opts}>${esc(txt)}</text>`);

  // header — the data-through date comes from the DATA, keeping output deterministic
  T(PAD, 44, 'AGI loop progress — copilot-dl-news ecosystem', 20, C.ink, 'font-weight="600"');
  T(PAD, 66, `generated from IMPROVEMENT_LEDGER.md cycle stanzas · ${totals.cycles} cycles · data through ${totals.maxDate || 'n/a'}`, 12, C.muted);

  // stat tiles — each value is a COUNT a tool can recompute, never an impression
  const tiles = [
    ['Cycles tracked', String(totals.cycles), ''],
    ['Verified improvements', String(totals.improvements), 'cumulative'],
    ['Defects caught pre-ship', `${totals.defectsPre}/${totals.defectsPre + totals.defectsPost}`,
      totals.defectsPre + totals.defectsPost ? `${Math.round((totals.defectsPre / (totals.defectsPre + totals.defectsPost)) * 100)}% before landing` : ''],
    ['Corrections issued', String(totals.corrections), 'retractions shown, not hidden'],
    ['Pages crawled', fmtK(totals.pages), 'across measured cycles']
  ];
  const tW = (W - PAD * 2 - 14 * 4) / 5;
  tiles.forEach(([label, value, sub], i) => {
    const x = PAD + i * (tW + 14);
    s.push(`<rect x="${r1(x)}" y="84" width="${r1(tW)}" height="78" rx="6" fill="${C.panel}" stroke="${C.grid}"/>`);
    T(x + 12, 106, label, 11, C.muted);
    T(x + 12, 136, value, 24, C.ink, 'font-weight="600"');
    if (sub) T(x + 12, 154, sub, 10, C.muted);
  });

  const x0 = 64, x1 = W - PAD, plotW = x1 - x0;
  const xi = (i) => x0 + ((i + 0.5) * plotW) / Math.max(rows.length, 1);
  const tickEvery = Math.max(1, Math.ceil(rows.length / 8));

  // ---- chart A: cumulative verified improvements ----
  const aTop = 208, aBot = 386, aH = aBot - aTop;
  T(PAD, 196, 'Cumulative verified improvements', 13, C.ink, 'font-weight="600"');
  const maxCum = Math.max(1, ...rows.map((r) => r.cum));
  const aNice = Math.max(5, Math.ceil(maxCum / 5) * 5);
  const yA = (v) => aBot - (v / aNice) * aH;
  for (let g = 0; g <= 4; g++) {
    const v = (aNice / 4) * g, y = yA(v);
    s.push(`<line x1="${x0}" y1="${r1(y)}" x2="${x1}" y2="${r1(y)}" stroke="${C.grid}" stroke-width="1"/>`);
    T(x0 - 8, y + 4, String(Math.round(v)), 10, C.muted, 'text-anchor="end"');
  }
  if (rows.length) {
    const pts = rows.map((r, i) => `${r1(xi(i))},${r1(yA(r.cum))}`);
    s.push(`<path d="M${r1(xi(0))},${aBot} L${pts.join(' L')} L${r1(xi(rows.length - 1))},${aBot} Z" fill="${C.gold}" opacity="0.12"/>`);
    s.push(`<path d="M${pts.join(' L')}" fill="none" stroke="${C.gold}" stroke-width="2" stroke-linejoin="round"/>`);
    // correction markers: red diamonds ON the line — reversals are part of the record
    rows.forEach((r, i) => {
      if (!r.correction) return;
      const x = r1(xi(i)), y = r1(yA(r.cum));
      s.push(`<path d="M${x},${y - 5} L${x + 5},${y} L${x},${y + 5} L${x - 5},${y} Z" fill="${C.red}" stroke="${C.bg}" stroke-width="1.5"><title>cycle ${r.id}: correction/retraction issued</title></path>`);
    });
  }
  // annotations (sidecar): latest 4, dashed markers — the "modify" pathway
  const byId = new Map(rows.map((r, i) => [r.id, i]));
  const shown = annotations.filter((a) => byId.has(a.cycle)).slice(-4);
  shown.forEach((a, k) => {
    const i = byId.get(a.cycle), x = r1(xi(i));
    s.push(`<line x1="${x}" y1="${aTop - 2}" x2="${x}" y2="${aBot}" stroke="${C.gold}" stroke-width="1" stroke-dasharray="3,3" opacity="0.55"/>`);
    T(Math.min(x + 4, x1 - 150), aTop + 12 + k * 13, `${a.cycle} · ${a.label}`, 10, C.muted);
  });
  rows.forEach((r, i) => { if (i % tickEvery === 0 || i === rows.length - 1) T(xi(i), aBot + 14, String(r.id), 9, C.muted, 'text-anchor="middle"'); });

  // ---- chart B: defects caught per cycle, pre-ship vs post-ship ----
  const bTop = 452, bBot = 606, bH = bBot - bTop;
  T(PAD, 440, 'Defects caught per cycle', 13, C.ink, 'font-weight="600"');
  // legend: color + label, identity never color-alone (position also encodes: pre-ship sits on the baseline)
  s.push(`<rect x="${x1 - 218}" y="430" width="9" height="9" rx="2" fill="${C.green}"/>`);
  T(x1 - 205, 439, 'pre-ship', 10, C.muted);
  s.push(`<rect x="${x1 - 138}" y="430" width="9" height="9" rx="2" fill="${C.red}"/>`);
  T(x1 - 125, 439, 'post-ship (escaped)', 10, C.muted);
  const maxDef = Math.max(1, ...rows.map((r) => r.pre + r.post));
  const yB = (v) => (v / maxDef) * bH;
  for (let g = 0; g <= 2; g++) {
    const v = Math.round((maxDef / 2) * g), y = bBot - yB(v);
    s.push(`<line x1="${x0}" y1="${r1(y)}" x2="${x1}" y2="${r1(y)}" stroke="${C.grid}" stroke-width="1"/>`);
    T(x0 - 8, y + 4, String(v), 10, C.muted, 'text-anchor="end"');
  }
  const barW = Math.max(2, Math.min(10, (plotW / Math.max(rows.length, 1)) * 0.66));
  rows.forEach((r, i) => {
    const x = r1(xi(i) - barW / 2);
    const preH = r1(yB(r.pre)), postH = r1(yB(r.post));
    if (r.pre > 0) s.push(`<rect x="${x}" y="${r1(bBot - preH)}" width="${r1(barW)}" height="${preH}" rx="1.5" fill="${C.green}"><title>cycle ${r.id}: ${r.pre} pre-ship</title></rect>`);
    // 2px surface gap between stacked segments (dataviz spacer rule)
    if (r.post > 0) s.push(`<rect x="${x}" y="${r1(bBot - preH - (r.pre ? 2 : 0) - postH)}" width="${r1(barW)}" height="${postH}" rx="1.5" fill="${C.red}"><title>cycle ${r.id}: ${r.post} post-ship</title></rect>`);
  });
  rows.forEach((r, i) => { if (i % tickEvery === 0 || i === rows.length - 1) T(xi(i), bBot + 14, String(r.id), 9, C.muted, 'text-anchor="middle"'); });
  s.push(`<line x1="${x0}" y1="${bBot}" x2="${x1}" y2="${bBot}" stroke="${C.axis}" stroke-width="1"/>`);

  // footer — no silent caps: say what was truncated
  const dropped = annotations.length - shown.length;
  T(PAD, H - 18, `regenerate: node tools/agi/progress-svg.js · annotate: --annotate "cycleId=label" · red diamonds = corrections/retractions${dropped > 0 ? ` · ${dropped} older annotation(s) not shown` : ''}`, 10, C.muted);

  s.push('</svg>');
  return s.join('\n');
}

// ---- cli -------------------------------------------------------------------

function loadAnnotations(p) {
  try { const a = JSON.parse(fs.readFileSync(p, 'utf8')); return Array.isArray(a) ? a : []; } catch (_) { return []; }
}

function main() {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : null; };
  const ledgerPath = arg('ledger') || DEFAULT_LEDGER;
  const outPath = arg('out') || DEFAULT_OUT;
  const annPath = arg('annotations') || DEFAULT_ANNOTATIONS;
  const last = Number(arg('last')) || 0;

  const addAnn = arg('annotate');
  if (addAnn) {
    const eq = addAnn.indexOf('=');
    if (eq < 1) { console.error('--annotate needs "cycleId=label"'); process.exit(2); }
    const entry = { cycle: Number(addAnn.slice(0, eq)), label: addAnn.slice(eq + 1).trim() };
    const all = loadAnnotations(annPath).filter((a) => !(a.cycle === entry.cycle && a.label === entry.label));
    all.push(entry);
    all.sort((a, b) => a.cycle - b.cycle);
    fs.mkdirSync(path.dirname(annPath), { recursive: true });
    fs.writeFileSync(annPath, JSON.stringify(all, null, 2) + '\n');
    console.log(`annotation saved: cycle ${entry.cycle} = "${entry.label}"`);
  }

  const { cycles, skipped } = parseCycleStanzas(fs.readFileSync(ledgerPath, 'utf8'));
  const windowed = last > 0 ? cycles.slice(-last) : cycles;
  const series = computeSeries(windowed);
  if (skipped) console.log(`note: ${skipped} malformed stanza(s) skipped`);
  console.log(`cycles: ${series.totals.cycles} · improvements: ${series.totals.improvements} · defects pre/post: ${series.totals.defectsPre}/${series.totals.defectsPost} · corrections: ${series.totals.corrections} · pages: ${series.totals.pages}`);

  if (process.argv.includes('--print-metrics')) return;
  const svg = renderSvg(series, loadAnnotations(annPath));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, svg);
  console.log(`wrote ${path.relative(ROOT, outPath)} (${svg.length} bytes)`);
}

module.exports = { parseCycleStanzas, computeSeries, renderSvg };
if (require.main === module) main();
