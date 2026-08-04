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
const DEFAULT_ACTIVITY = path.join(ROOT, 'docs', 'agi', 'progress', 'repo-activity.json');
// frontier band inputs (TECH-SVGTIE, cycle 156) — the same three files the
// pages read, so one spec drives both the tree and its picture
const DEFAULT_TECH_SPEC = path.join(ROOT, 'config', 'tech-tree.json');
const DEFAULT_BACKLOG = path.join(ROOT, 'docs', 'agi', 'RESEARCH_BACKLOG.md');
const DEFAULT_ROADMAP = path.join(ROOT, 'config', 'roadmap.json');

// ---- data ------------------------------------------------------------------

/**
 * Extract every `<!-- cycle:{...} -->` stanza; malformed ones are counted, not fatal.
 * PLACEHOLDERS are ignored entirely: ledger prose NAMES the convention literally
 * ("emit a `<!-- cycle:{...} -->` stanza"), and those documentation mentions matched
 * this regex and were miscounted as 2 "malformed stanzas" for several cycles — a
 * defect of the parser, not of the ledger.
 */
function parseCycleStanzas(text) {
  const cycles = [];
  let skipped = 0;
  const re = /<!--\s*cycle:(\{[\s\S]*?\})\s*-->/g;
  let m;
  while ((m = re.exec(text))) {
    if (/^\{\s*(\.\.\.|…)\s*\}$/.test(m[1])) continue; // documentation placeholder
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
      pages: Number(c.pages_crawled) || 0, correction,
      // Debt vector (cycle 197): stanzas carry ratchet readings when a cycle
      // measured them; carry-forward happens at render time so a flat lane is
      // a VISIBLE stall, which is the entire point of the debt panel.
      debt: {
        engine: c.engine_debt != null ? Number(c.engine_debt) : null,
        ui: c.ui_debt != null ? Number(c.ui_debt) : null,
        ncdb: c.ncdb_debt != null ? Number(c.ncdb_debt) : null,
        phantom: c.phantom_edges != null ? Number(c.phantom_edges) : null,
        knownFailures: c.known_failures != null ? Number(c.known_failures) : null
      }
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

/** Enumerate YYYY-MM-DD dates from..to inclusive (UTC math on data dates — deterministic). */
function enumDays(from, to) {
  const out = [];
  let t = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const end = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  while (t <= end && out.length < 400) { out.push(new Date(t).toISOString().slice(0, 10)); t += 86400000; }
  return out;
}

function renderSvg({ rows, totals }, annotations = [], activity = null, frontier = null) {
  const W = 980, PAD = 28;
  // repo lanes (Workflow v3, cycle 127) render only when a committed snapshot exists —
  // without one the output is byte-identical to the pre-lanes layout (backward compat).
  const lanes = activity && activity.window && Array.isArray(activity.repos) && activity.repos.length ? activity : null;
  // research frontier (TECH-SVGTIE, cycle 156, owner-signalled): the same
  // backward-compatible rule — absent or unreadable spec renders the previous
  // layout byte-for-byte, so the staleness compare never breaks on a bad spec.
  const front = frontier && Array.isArray(frontier.branches) && frontier.branches.length ? frontier : null;
  // chart C renders only when stanzas carry debt readings — absent, the layout
  // stays byte-identical to the pre-debt-panel output (the same backward-compat
  // rule as lanes and the frontier band; pinned by progress-surface.test).
  const hasDebt = rows.filter((r) => r.debt && Object.values(r.debt).some((v) => v != null)).length >= 2;
  // frontY0 668 -> 856 when chart C (debt ratchets, 640-806) renders (c197).
  const frontY0 = hasDebt ? 856 : 668, frontStride = 18;
  // trailing space is 34, not 14: the band's legend line sits at the bottom and
  // the repo-lanes heading sits 12px above laneY0 — at 14 they collided, caught
  // by svg-collisions --strict (2 HIGH text-overlaps) before this shipped.
  const frontH = front ? 26 + front.branches.length * frontStride + 34 : 0;
  const laneStride = 16, laneY0 = frontY0 + frontH;
  const H = lanes ? laneY0 + lanes.repos.length * laneStride + 46 : (front ? laneY0 + 10 : (hasDebt ? 830 : 664));
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

  // ---- chart A: cumulative verified improvements ON A TRUE TIME AXIS ----
  // Owner observation (2026-07-28): plotted per-cycle the line could never be flat,
  // because almost every cycle lands an improvement — the apparent steadiness was an
  // axis artifact, not a fact about the work. The x-axis is now CALENDAR DAYS at
  // uniform width; cycles spread within their day band in sequence. Idle days render
  // as genuinely flat line segments (2026-07-24, zero cycles, is the proof case).
  const aTop = 208, aBot = 386, aH = aBot - aTop;
  T(PAD, 196, 'Cumulative verified improvements', 13, C.ink, 'font-weight="600"');
  T(PAD + 268, 196, 'x-axis: calendar days, uniform width — flat = an idle day', 10, C.muted);
  const datedRows = rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(String(r.date)));
  const days = datedRows.length
    ? enumDays(datedRows.reduce((a, r) => (r.date < a ? r.date : a), datedRows[0].date),
               datedRows.reduce((a, r) => (r.date > a ? r.date : a), datedRows[0].date))
    : [];
  const dayIdx = new Map(days.map((d, i) => [d, i]));
  const perDay = new Map();
  for (const r of datedRows) perDay.set(r.date, (perDay.get(r.date) || 0) + 1);
  const seen = new Map();
  const dayW = plotW / Math.max(days.length, 1);
  const xiTime = new Map();
  for (const r of datedRows) {
    const j = seen.get(r.date) || 0;
    seen.set(r.date, j + 1);
    xiTime.set(r.id, x0 + (dayIdx.get(r.date) + (j + 0.5) / perDay.get(r.date)) * dayW);
  }
  const maxCum = Math.max(1, ...rows.map((r) => r.cum));
  const aNice = Math.max(5, Math.ceil(maxCum / 5) * 5);
  const yA = (v) => aBot - (v / aNice) * aH;
  for (let g = 0; g <= 4; g++) {
    const v = (aNice / 4) * g, y = yA(v);
    s.push(`<line x1="${x0}" y1="${r1(y)}" x2="${x1}" y2="${r1(y)}" stroke="${C.grid}" stroke-width="1"/>`);
    T(x0 - 8, y + 4, String(Math.round(v)), 10, C.muted, 'text-anchor="end"');
  }
  // day boundaries + date labels: the time units, stated on the axis itself
  const dayLabelEvery = Math.max(1, Math.ceil(days.length / 12));
  days.forEach((d, i) => {
    const bx = r1(x0 + i * dayW);
    s.push(`<line x1="${bx}" y1="${aTop}" x2="${bx}" y2="${aBot}" stroke="${C.grid}" stroke-width="1" opacity="0.6"/>`);
    if (i % dayLabelEvery === 0 || i === days.length - 1) {
      T(x0 + (i + 0.5) * dayW, aBot + 14, d.slice(5), 9, C.muted, 'text-anchor="middle"');
    }
  });
  if (datedRows.length) {
    const pts = datedRows.map((r) => `${r1(xiTime.get(r.id))},${r1(yA(r.cum))}`);
    const firstX = r1(xiTime.get(datedRows[0].id)), lastX = r1(xiTime.get(datedRows[datedRows.length - 1].id));
    s.push(`<path d="M${firstX},${aBot} L${pts.join(' L')} L${lastX},${aBot} Z" fill="${C.gold}" opacity="0.12"/>`);
    s.push(`<path d="M${pts.join(' L')}" fill="none" stroke="${C.gold}" stroke-width="2" stroke-linejoin="round"/>`);
    // correction markers: red diamonds ON the line — reversals are part of the record
    datedRows.forEach((r) => {
      if (!r.correction) return;
      const x = r1(xiTime.get(r.id)), y = r1(yA(r.cum));
      s.push(`<path d="M${x},${y - 5} L${x + 5},${y} L${x},${y + 5} L${x - 5},${y} Z" fill="${C.red}" stroke="${C.bg}" stroke-width="1.5"><title>cycle ${r.id}: correction/retraction issued</title></path>`);
    });
  }
  // annotations (sidecar): latest 4, dashed markers — the "modify" pathway
  const shown = annotations.filter((a) => xiTime.has(a.cycle)).slice(-4);
  shown.forEach((a, k) => {
    const x = r1(xiTime.get(a.cycle));
    s.push(`<line x1="${x}" y1="${aTop - 2}" x2="${x}" y2="${aBot}" stroke="${C.gold}" stroke-width="1" stroke-dasharray="3,3" opacity="0.55"/>`);
    T(Math.min(x + 4, x1 - 150), aTop + 12 + k * 13, `${a.cycle} · ${a.label}`, 10, C.muted);
  });

  // ---- chart B: defects caught per cycle, pre-ship vs post-ship ----
  // Deliberately stays on the CYCLE-SEQUENCE axis (one bar per cycle) — and says so:
  // an unlabeled axis that could be time is how chart A misled until 2026-07-28.
  const bTop = 452, bBot = 606, bH = bBot - bTop;
  T(PAD, 440, 'Defects caught per cycle', 13, C.ink, 'font-weight="600"');
  T(PAD + 178, 440, 'x-axis: cycle sequence (ticks = cycle ids, not time)', 10, C.muted);
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

  // ---- chart C: debt ratchets (cycle 197, DEBT plan item 6) ----
  // Each metric normalized to ITS OWN first-seen value so every trend is
  // visible on one panel; carry-forward between stanzas so a FLAT lane is a
  // visible stall — which is the panel's entire reason to exist. Current
  // absolute values sit as direct labels at the line ends (identity is never
  // color-alone; the label carries name + number).
  const DEBT_DEFS = [
    { key: 'engine', label: 'engine', color: C.gold },
    { key: 'ui', label: 'ui', color: '#7d9bc0' },
    { key: 'ncdb', label: 'ncdb', color: '#a37fb3' },
    { key: 'phantom', label: 'phantom', color: C.green },
    { key: 'knownFailures', label: 'known-fail', color: C.red }
  ];
  const debtRows = hasDebt ? rows.filter((r) => r.debt && Object.values(r.debt).some((v) => v != null)) : [];
  if (debtRows.length >= 2) {
    const cTop = 652, cBot = 792, cH = cBot - cTop;
    T(PAD, 640, 'Debt ratchets (normalized to first reading; labels carry current absolutes)', 13, C.ink, 'font-weight="600"');
    T(x1 - 232, 640, 'x-axis: cycle sequence · flat = stalled', 10, C.muted);
    s.push(`<line x1="${x0}" y1="${cBot}" x2="${x1}" y2="${cBot}" stroke="${C.axis}" stroke-width="1"/>`);
    const xiC = (i) => x0 + (debtRows.length === 1 ? 0 : (i / (debtRows.length - 1)) * (x1 - x0 - 120));
    DEBT_DEFS.forEach((def, di) => {
      // carry-forward series
      let lastV = null;
      const series = debtRows.map((r) => {
        if (r.debt[def.key] != null) lastV = r.debt[def.key];
        return lastV;
      });
      const firstIdx = series.findIndex((v) => v != null);
      if (firstIdx < 0) return;
      const base = Math.max(1, series[firstIdx]);
      const pts = [];
      series.forEach((v, i) => {
        if (v == null) return;
        const y = r1(cBot - Math.min(1.05, v / base) * (cH - 14));
        pts.push(`${r1(xiC(i))},${y}`);
      });
      if (pts.length < 2) return;
      s.push(`<path d="M${pts.join(' L')}" fill="none" stroke="${def.color}" stroke-width="1.8" stroke-linejoin="round" opacity="0.9"/>`);
      const cur = series[series.length - 1];
      const endY = r1(cBot - Math.min(1.05, cur / base) * (cH - 14));
      T(x1 - 112, Math.max(cTop + 10, Math.min(cBot - 2, endY + 3 + (di === 4 ? 0 : 0))), `${def.label} ${cur}`, 10, def.color);
    });
    debtRows.forEach((r, i) => {
      if (i % Math.max(1, Math.ceil(debtRows.length / 10)) === 0 || i === debtRows.length - 1) {
        T(xiC(i), cBot + 13, String(r.id), 9, C.muted, 'text-anchor="middle"');
      }
    });
  }

  // ---- repo activity lanes (from the committed repo-activity.json snapshot) ----
  if (lanes) {
    const days = enumDays(lanes.window.from, lanes.window.to);
    const gX0 = 262, gW = x1 - gX0, cellW = gW / Math.max(days.length, 1);
    const cw = r1(Math.max(1, cellW - (cellW > 6 ? 2 : 0.5)));
    T(PAD, laneY0 - 12, 'Repo activity — commits landed per day', 13, C.ink, 'font-weight="600"');
    T(PAD + 268, laneY0 - 12, `${lanes.window.from} → ${lanes.window.to} · landing date, not work date (bulk catch-up commits cluster)`, 10, C.muted);
    const maxCount = Math.max(1, ...lanes.repos.flatMap((r) => (r.days || []).map(([, n]) => n)));
    lanes.repos.forEach((r, k) => {
      const y = laneY0 + k * laneStride;
      const active = (r.total || 0) > 0;
      T(gX0 - 10, y + 11, r.name, 10, active ? C.ink : C.muted, `text-anchor="end"${r.status === 'consume-only' ? ' font-style="italic"' : ''}`);
      if (r.note) {
        // an unversioned in-scope repo is the case that most needs to stay visible
        s.push(`<rect x="${gX0}" y="${y}" width="${r1(gW)}" height="14" rx="3" fill="none" stroke="${C.red}" stroke-width="1" stroke-dasharray="4,3" opacity="0.7"/>`);
        T(gX0 + 8, y + 11, `${r.note} — not in the record`, 9, C.red, 'opacity="0.85"');
        return;
      }
      const byDay = new Map(r.days || []);
      days.forEach((d, i) => {
        const x = r1(gX0 + i * cellW), n = byDay.get(d) || 0;
        if (n > 0) {
          const op = r1(0.3 + 0.7 * (n / maxCount));
          s.push(`<rect x="${x}" y="${y}" width="${cw}" height="14" rx="2" fill="${C.gold}" opacity="${op}"><title>${esc(r.name)} · ${d} · ${n} commit${n === 1 ? '' : 's'}</title></rect>`);
        } else {
          s.push(`<rect x="${x}" y="${y}" width="${cw}" height="14" rx="2" fill="${C.panel}" stroke="${C.grid}" stroke-width="0.5"/>`);
        }
      });
    });
    const laneBot = laneY0 + lanes.repos.length * laneStride;
    const dTick = Math.max(1, Math.ceil(days.length / 8));
    days.forEach((d, i) => {
      if (i % dTick === 0 || i === days.length - 1) T(gX0 + i * cellW + cellW / 2, laneBot + 12, d.slice(5), 9, C.muted, 'text-anchor="middle"');
    });
  }

  // ---- research frontier band (TECH-SVGTIE, cycle 156, owner-signalled) ----
  // The lanes say what LANDED; this says what is OPEN. Both are rendered from
  // COMMITTED inputs only (config/tech-tree.json + RESEARCH_BACKLOG.md states via
  // the SAME buildTechTree the pages and the schema probe call), so the picture
  // and the tech tree can never disagree about the counts — and the staleness
  // byte-compare stays sound because nothing here reads live state.
  if (front) {
    T(PAD, frontY0 - 12, 'Research frontier — what is open, per branch', 13, C.ink, 'font-weight="600"');
    T(PAD + 290, frontY0 - 12, `${front.totals.grown} grown · ${front.totals.available} available · ${front.totals.gated} gated${front.absorbed ? ` · ${front.absorbed} absorbed into the foundations` : ''}`, 10, C.muted);
    const barX0 = PAD + 132, barW = 300;
    const maxTotal = Math.max(1, ...front.branches.map((b) => b.grown + b.available + b.gated));
    front.branches.forEach((b, i) => {
      const y = frontY0 + 8 + i * frontStride;
      T(PAD, y + 10, b.label, 10, b.color);
      // one stacked bar per branch: grown (solid) → available (mid) → gated (faint),
      // scaled against the busiest branch so the shapes are comparable at a glance
      let x = barX0;
      const seg = (n, opacity) => {
        if (!n) return;
        const w = r1((n / maxTotal) * barW);
        s.push(`<rect x="${r1(x)}" y="${y}" width="${w}" height="11" rx="2" fill="${b.color}" opacity="${opacity}"><title>${esc(b.label)}: ${n}</title></rect>`);
        x += w + 1.5;
      };
      seg(b.grown, 1);
      seg(b.available, 0.55);
      seg(b.gated, 0.22);
      T(barX0 + barW + 14, y + 10, `${b.grown} grown · ${b.available} available${b.gated ? ` · ${b.gated} gated` : ''}`, 10, C.muted);
    });
    T(PAD, frontY0 + 8 + front.branches.length * frontStride + 12,
      'solid = researched · mid = researchable now · faint = needs an owner decision',
      9, C.muted);
  }

  // footer — no silent caps: say what was truncated
  const dropped = annotations.length - shown.length;
  const hiddenLanes = lanes && Array.isArray(lanes.hiddenZeroConsumeOnly) ? lanes.hiddenZeroConsumeOnly.length : 0;
  T(PAD, H - 18, `regenerate: node tools/agi/repo-activity.js && node tools/agi/progress-svg.js · annotate: --annotate "cycleId=label" · red diamonds = corrections/retractions${dropped > 0 ? ` · ${dropped} older annotation(s) not shown` : ''}${hiddenLanes > 0 ? ` · ${hiddenLanes} zero-activity consume-only repo(s) not shown` : ''}`, 10, C.muted);

  s.push('</svg>');
  return s.join('\n');
}

// ---- cli -------------------------------------------------------------------

function loadAnnotations(p) {
  try { const a = JSON.parse(fs.readFileSync(p, 'utf8')); return Array.isArray(a) ? a : []; } catch (_) { return []; }
}

/**
 * loadTechFrontier — per-branch open-research counts for the frontier band
 * (TECH-SVGTIE, cycle 156, owner-signalled).
 *
 * Calls the SAME buildTechTree the pages and the tech-tree-schema probe use, so
 * one definition produces the counts everywhere — the picture cannot drift from
 * the tree it depicts (the c153 lesson: reuse the conventions verbatim so two
 * subsystems can never disagree). Inputs are repo files, which is exactly what
 * the purity contract means by COMMITTED: no git, no subprocess, no server.
 *
 * Returns null on ANY problem — a missing spec, a broken spec (buildTechTree
 * throws by design on a bad record), a missing backlog. The band then simply
 * does not render, which keeps a bad spec from breaking the picture or the
 * staleness byte-compare. The tech-tree-schema probe is what makes a broken
 * spec loud; this renderer's job is to stay honest and quiet about it.
 */
function loadTechFrontier(specPath, backlogPath, roadmapPath) {
  try {
    const { buildTechTree } = require(path.join(ROOT, 'src', 'ui', 'server', 'projectStatus', 'statusData.js'));
    const { parseBacklog } = require(path.join(ROOT, 'tools', 'agi', 'next-prompt.js'));
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    const rows = parseBacklog(fs.readFileSync(backlogPath, 'utf8'));
    let roadmap = null;
    try { roadmap = JSON.parse(fs.readFileSync(roadmapPath, 'utf8')); } catch (_) { /* optional */ }
    const tree = buildTechTree(rows, roadmap, spec);
    const branches = (tree.branches || []).map((b) => ({
      key: b.key,
      label: b.label || b.key,
      color: b.color || '#8a8778',
      grown: b.grown.length,
      available: b.available.length,
      gated: b.gated.length
    }));
    const totals = branches.reduce((acc, b) => ({
      grown: acc.grown + b.grown, available: acc.available + b.available, gated: acc.gated + b.gated
    }), { grown: 0, available: 0, gated: 0 });
    return { branches, totals, absorbed: tree.absorbed || 0 };
  } catch (_) {
    return null;
  }
}

/** Committed repo-activity snapshot (tools/agi/repo-activity.js writes it); null = no lanes. */
function loadRepoActivity(p) {
  try { const a = JSON.parse(fs.readFileSync(p, 'utf8')); return a && a.window ? a : null; } catch (_) { return null; }
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
  const frontier = loadTechFrontier(
    arg('tech-spec') || DEFAULT_TECH_SPEC,
    arg('backlog') || DEFAULT_BACKLOG,
    arg('roadmap') || DEFAULT_ROADMAP
  );
  if (frontier) {
    console.log(`frontier: ${frontier.totals.grown} grown · ${frontier.totals.available} available · ${frontier.totals.gated} gated across ${frontier.branches.length} branches`);
  } else {
    console.log('frontier: band omitted (tech-tree spec unreadable or invalid — see the tech-tree-schema probe)');
  }
  const svg = renderSvg(series, loadAnnotations(annPath), loadRepoActivity(arg('activity') || DEFAULT_ACTIVITY), frontier);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, svg);
  console.log(`wrote ${path.relative(ROOT, outPath)} (${svg.length} bytes)`);
}

module.exports = {
  parseCycleStanzas, computeSeries, renderSvg, loadAnnotations, loadRepoActivity, loadTechFrontier,
  DEFAULT_LEDGER, DEFAULT_OUT, DEFAULT_ANNOTATIONS, DEFAULT_ACTIVITY,
  DEFAULT_TECH_SPEC, DEFAULT_BACKLOG, DEFAULT_ROADMAP
};
if (require.main === module) main();
