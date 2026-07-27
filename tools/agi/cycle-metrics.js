#!/usr/bin/env node
'use strict';

/*
 * cycle-metrics.js — COMPUTE the improvement loop's compounding signal instead of
 * asserting it in prose.
 *
 * The loop's own success criterion (docs/agi/IMPROVEMENT_LEDGER.md header +
 * .claude/skills/singularity/SKILL.md "falsifiable metrics") is "cost-per-verified-
 * improvement falls while second-order tools accrete." Today only ONE of the five
 * signals (ncdb coordination-debt) is machine-checked; the rest are hand-written
 * sentences. This tool reads a small, additive, co-located machine record — a
 * `<!-- cycle:{...} -->` HTML-comment stanza emitted directly under each ledger row
 * (invisible in rendered markdown, cannot drift from its prose) — and computes the
 * trend. It degrades gracefully: with zero stanzas it still prints a baseline cost
 * trend regex-parsed from the existing prose rows, so it is useful on first run.
 *
 *   node tools/agi/cycle-metrics.js                  # text panel + VERDICT
 *   node tools/agi/cycle-metrics.js --json           # machine output
 *   node tools/agi/cycle-metrics.js --window 6       # rolling window (default 6)
 *   node tools/agi/cycle-metrics.js --check          # lint: every cycle >= --since-id has a stanza; exit 1 on drift
 *   node tools/agi/cycle-metrics.js --ledger <path>  # override ledger path
 *
 * Pure core (parseStanzas / baselineCostsFromProse / computeMetrics) is exported
 * for unit tests; the CLI is a thin wrapper.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_LEDGER = path.resolve(__dirname, '..', '..', 'docs', 'agi', 'IMPROVEMENT_LEDGER.md');

// ---- pure core (unit-tested) ------------------------------------------------

// Require the body to open with `{"` (a real JSON object with a quoted key) so
// that literal `<!-- cycle:{...} -->` shorthand written in ledger PROSE (docs,
// row descriptions) is not mistaken for an actual stanza.
const STANZA_RE = /<!--\s*cycle:(\{\s*"[\s\S]*?\})\s*-->/g;

/** Extract every `<!-- cycle:{...} -->` stanza as a parsed object. Bad JSON is skipped (reported). */
function parseStanzas(text) {
  const cycles = [];
  const errors = [];
  let m;
  STANZA_RE.lastIndex = 0;
  while ((m = STANZA_RE.exec(text)) !== null) {
    try {
      cycles.push(JSON.parse(m[1]));
    } catch (e) {
      errors.push({ snippet: m[1].slice(0, 80), error: e.message });
    }
  }
  return { cycles, errors };
}

/**
 * Best-effort cost series from the prose rows for cycles that have no stanza yet.
 * The ledger's Cost column holds strings like "~1.4 turns (Opus 4.8)" / "~0.9 turn".
 * Returns [{cost_turns, estimated:true}] in document order — used only for a rough
 * baseline trend before stanzas are backfilled.
 */
function baselineCostsFromProse(text) {
  const out = [];
  const re = /~\s*([\d.]+)\s*turns?/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const v = Number(m[1]);
    if (Number.isFinite(v) && v > 0 && v < 100) out.push({ cost_turns: v, estimated: true });
  }
  return out;
}

function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/** Least-squares slope of y over its index (0..n-1). null if <2 points. */
function slope(nums) {
  const ys = nums.filter((n) => Number.isFinite(n));
  const n = ys.length;
  if (n < 2) return null;
  const xs = ys.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den === 0 ? 0 : num / den;
}

function direction(slp) {
  if (slp === null) return 'unknown';
  if (slp < -0.02) return 'falling';
  if (slp > 0.02) return 'rising';
  return 'flat';
}

/**
 * Compute the compounding metrics from parsed stanzas (preferred) or, if none,
 * from the prose-baseline cost series. `window` is the rolling comparison size.
 */
function computeMetrics(cycles, baselineCosts, opts = {}) {
  const window = opts.window || 6;
  const haveStanzas = cycles.length > 0;

  // Cost-per-improvement (the primary signal). Prefer stanzas; else prose baseline.
  const costSeries = haveStanzas
    ? cycles.map((c) => (Number.isFinite(c.cost_turns) ? c.cost_turns : null)).filter((v) => v !== null)
    : baselineCosts.map((b) => b.cost_turns);
  const last = costSeries.slice(-window);
  const prior = costSeries.slice(-2 * window, -window);
  const costTrend = {
    source: haveStanzas ? 'stanza' : 'prose-baseline',
    n: costSeries.length,
    medianNow: median(last),
    medianPrior: median(prior),
    slope: slope(costSeries),
    dir: direction(slope(costSeries)),
  };

  // Improvements per turn (throughput of verified work per unit cost).
  let improvementsPerTurn = null;
  if (haveStanzas) {
    const totImp = cycles.reduce((s, c) => s + (Number(c.verified_improvements) || 0), 0);
    const totCost = cycles.reduce((s, c) => s + (Number(c.cost_turns) || 0), 0);
    improvementsPerTurn = totCost > 0 ? +(totImp / totCost).toFixed(3) : null;
  }

  // Second-order tool rate (the recursion signal).
  let secondOrder = { rate: null, cumulative: 0, reuseCycles: 0 };
  if (haveStanzas) {
    const withSO = cycles.filter((c) => Array.isArray(c.second_order) && c.second_order.length > 0).length;
    secondOrder = {
      rate: +(withSO / cycles.length).toFixed(3),
      cumulative: cycles.reduce((s, c) => s + ((c.second_order || []).length), 0),
      reuseCycles: cycles.filter((c) => Array.isArray(c.reused) && c.reused.length > 0).length,
    };
  }

  // Pre-ship defect containment + adversarial-workflow ROI.
  let quality = { preshipContainment: null, byLayer: {}, workflowRuns: 0, workflowCaught: 0 };
  if (haveStanzas) {
    const defects = cycles.flatMap((c) => Array.isArray(c.defects) ? c.defects : []);
    const preship = defects.filter((d) => d && d.preship).length;
    const byLayer = {};
    for (const d of defects) { const k = (d && d.caught_by) || 'unknown'; byLayer[k] = (byLayer[k] || 0) + 1; }
    const wfRuns = cycles.filter((c) => c.adversarial_workflow).length;
    const wfCaught = cycles.filter((c) => c.adversarial_workflow && (c.defects || []).some((d) => d && d.preship)).length;
    quality = {
      preshipContainment: defects.length ? +(preship / defects.length).toFixed(3) : null,
      byLayer,
      workflowRuns: wfRuns,
      workflowCaught: wfCaught,
    };
  }

  // ncdb coordination-debt trajectory.
  let ncdbDebt = { series: [], head: null, tail: null, delta: null };
  if (haveStanzas) {
    const s = cycles.map((c) => c.ncdb_debt).filter((v) => Number.isFinite(v));
    if (s.length) ncdbDebt = { series: s, head: s[0], tail: s[s.length - 1], delta: s[s.length - 1] - s[0] };
  }

  // Scaffold net capital (added - retired).
  let scaffold = { added: 0, retired: 0, net: 0, trackMix: {} };
  if (haveStanzas) {
    const added = cycles.reduce((s, c) => s + ((c.scaffold_added || []).length), 0);
    const retired = cycles.reduce((s, c) => s + ((c.scaffold_retired || []).length), 0);
    const trackMix = {};
    for (const c of cycles) for (const t of (c.tracks || [])) trackMix[t] = (trackMix[t] || 0) + 1;
    scaffold = { added, retired, net: added - retired, trackMix };
  }

  // Composite verdict — plateau-honesty made computable.
  const verdict = deriveVerdict({ costTrend, secondOrder, ncdbDebt, scaffold, haveStanzas });

  return { window, cyclesParsed: cycles.length, costTrend, improvementsPerTurn, secondOrder, quality, ncdbDebt, scaffold, verdict };
}

function deriveVerdict({ costTrend, secondOrder, ncdbDebt, scaffold, haveStanzas }) {
  if (!haveStanzas) {
    return { label: 'INSUFFICIENT-DATA', rationale: 'No machine stanzas yet; showing a prose-baseline cost trend only. Emit `<!-- cycle:{...} -->` stanzas to compute the full verdict.' };
  }
  // A trend verdict needs a few points — a single scaffold-heavy cycle legitimately
  // costs more and adds scaffold, which would read as false BLOATING at n<3.
  if (Number.isFinite(costTrend.n) && costTrend.n < 3) {
    return { label: 'WARMING-UP', rationale: `only ${costTrend.n} cycle stanza(s) with cost data — need >=3 for a trend verdict; metrics below are provisional.` };
  }
  const costFalling = costTrend.dir === 'falling';
  const costFlat = costTrend.dir === 'flat';
  const soRate = secondOrder.rate || 0;
  const debtNonIncreasing = ncdbDebt.delta === null || ncdbDebt.delta <= 0;
  const scaffoldGrowing = scaffold.net > 0;

  if (costFalling || (costFlat && soRate > 0 && debtNonIncreasing)) {
    return { label: 'COMPOUNDING', rationale: `cost-per-improvement ${costTrend.dir}; second-order rate ${soRate}; ncdb-debt delta ${ncdbDebt.delta}.` };
  }
  if ((costFlat || costTrend.dir === 'rising') && soRate < 0.15) {
    return { label: 'PLATEAU', rationale: `cost ${costTrend.dir} and second-order rate ${soRate} (~0) over the window → shift the next cycle to portable-capital work (tests/harnesses/memory for the next model).` };
  }
  if (costTrend.dir === 'rising' && scaffoldGrowing) {
    return { label: 'BLOATING', rationale: `cost rising while scaffold net +${scaffold.net} → spend a cycle pruning/retiring stale scaffold.` };
  }
  return { label: 'MIXED', rationale: `cost ${costTrend.dir}, second-order rate ${soRate}, scaffold net ${scaffold.net} — no single clear signal.` };
}

// ---- CLI --------------------------------------------------------------------

function getArg(argv, name, dflt) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
}

function main() {
  const argv = process.argv.slice(2);
  const ledgerPath = path.resolve(getArg(argv, '--ledger', DEFAULT_LEDGER));
  const window = Number(getArg(argv, '--window', 6));
  const asJson = argv.includes('--json');
  const check = argv.includes('--check');
  const sinceId = Number(getArg(argv, '--since-id', 47)); // instrumentation begins at cycle 47

  let text;
  try {
    text = fs.readFileSync(ledgerPath, 'utf8');
  } catch (e) {
    console.error(`cycle-metrics: cannot read ledger at ${ledgerPath}: ${e.message}`);
    process.exit(2);
  }

  const { cycles, errors } = parseStanzas(text);
  const baseline = baselineCostsFromProse(text);
  const metrics = computeMetrics(cycles, baseline, { window });

  if (check) {
    // Lint: every stanza that parses must carry the required fields; malformed
    // stanzas fail. (Prose-row coverage is not enforced retroactively — only
    // cycles at/after --since-id are expected to carry a stanza, and those are
    // added going forward, so this guards drift without demanding a full backfill.)
    const REQUIRED = ['id', 'date', 'model', 'cost_turns', 'ncdb_debt'];
    const problems = [];
    for (const e of errors) problems.push(`malformed stanza JSON: ${e.snippet} (${e.error})`);
    for (const c of cycles) {
      if (Number(c.id) < sinceId) continue;
      for (const f of REQUIRED) if (c[f] === undefined) problems.push(`cycle ${c.id}: missing required field "${f}"`);
    }
    if (problems.length) {
      console.error('cycle-metrics --check FAILED:');
      for (const p of problems) console.error('  - ' + p);
      process.exit(1);
    }
    console.log(`cycle-metrics --check OK: ${cycles.length} stanza(s), all >= cycle ${sinceId} well-formed.`);
    process.exit(0);
  }

  if (asJson) {
    process.stdout.write(JSON.stringify({ ledgerPath, parseErrors: errors, ...metrics }, null, 2) + '\n');
    return;
  }

  const arrow = { falling: '↓', rising: '↑', flat: '→', unknown: '?' }[metrics.costTrend.dir] || '?';
  const L = [];
  L.push('── improvement-loop metrics ──────────────────────────────');
  L.push(`stanzas parsed: ${metrics.cyclesParsed}   prose-baseline cost points: ${baseline.length}   window: ${window}`);
  L.push(`cost/improvement (${metrics.costTrend.source}): median now ${fmt(metrics.costTrend.medianNow)} vs prior ${fmt(metrics.costTrend.medianPrior)}  slope ${fmt(metrics.costTrend.slope)} ${arrow} ${metrics.costTrend.dir}`);
  if (metrics.improvementsPerTurn !== null) L.push(`improvements/turn: ${metrics.improvementsPerTurn}`);
  if (metrics.secondOrder.rate !== null) L.push(`second-order rate: ${metrics.secondOrder.rate}  cumulative: ${metrics.secondOrder.cumulative}  reuse cycles: ${metrics.secondOrder.reuseCycles}`);
  if (metrics.quality.preshipContainment !== null) L.push(`pre-ship defect containment: ${metrics.quality.preshipContainment}  by layer: ${JSON.stringify(metrics.quality.byLayer)}  workflow ROI: ${metrics.quality.workflowCaught}/${metrics.quality.workflowRuns}`);
  if (metrics.ncdbDebt.head !== null) L.push(`ncdb-debt: ${metrics.ncdbDebt.head} → ${metrics.ncdbDebt.tail} (Δ ${metrics.ncdbDebt.delta})`);
  L.push(`scaffold net: +${metrics.scaffold.added} −${metrics.scaffold.retired} = ${metrics.scaffold.net}  tracks: ${JSON.stringify(metrics.scaffold.trackMix)}`);
  if (errors.length) L.push(`⚠ ${errors.length} malformed stanza(s) skipped`);
  L.push('──');
  L.push(`VERDICT: ${metrics.verdict.label} — ${metrics.verdict.rationale}`);
  console.log(L.join('\n'));
}

function fmt(v) { return v === null || v === undefined ? 'n/a' : (typeof v === 'number' ? +v.toFixed(3) : v); }

if (require.main === module) main();

module.exports = { parseStanzas, baselineCostsFromProse, computeMetrics, deriveVerdict, median, slope, direction };
