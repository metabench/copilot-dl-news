#!/usr/bin/env node
'use strict';

/*
 * workflow-scorecard.js — "did this workflow earn its cost?"
 *
 * Computes, per (workflow shape, task_type), the five workflow-effectiveness metrics
 * from docs/agi/WORKFLOW_LEDGER.jsonl (one JSON object per line, one per workflow run).
 * The mission requires "validate the workflow verdict yourself with DB-evidence" precisely
 * because verdicts have been wrong at material cost (crawl-rate false "4 MB/s" burned two
 * cycles; the stale May "whole-process silence"; task-44's red-herring) — and right
 * (delegation #3's destructive-collision catch). This turns effectiveness into a tracked
 * number so a workflow that has quietly stopped earning its cost surfaces at orient instead
 * of on the next expensive surprise. Same convention as ncdb-debt-scan / run-probes:
 * a pure unit-testable core + a thin CLI + an optional --min-runs-guarded ratchet.
 *
 *   node tools/dev/workflow-scorecard.js                          # table + ranked lists
 *   node tools/dev/workflow-scorecard.js --group-by task_type     # segment differently
 *   node tools/dev/workflow-scorecard.js --json                   # machine output
 *   node tools/dev/workflow-scorecard.js --since 2026-07-01       # window
 *   node tools/dev/workflow-scorecard.js --min-verdict-accuracy 0.6 --min-runs 5   # ratchet (exit 1 on violation)
 *
 * Metrics (per group):
 *   verdict-accuracy  = CONFIRMED / (CONFIRMED + REFUTED + 0.5*PARTIAL)   [over runs with a verdict outcome]
 *   catch-rate        = runs with >=1 validated-real issue / all runs
 *   false-alarm-rate  = flagged issues NOT real / all flagged
 *   cost-to-catch     = sum(cost_turns) / sum(real catches)              [Infinity if 0 real catches]
 *   escape-rate       = sum(escaped[]) / all runs
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_LEDGER = path.resolve(__dirname, '..', '..', 'docs', 'agi', 'WORKFLOW_LEDGER.jsonl');

// ---- pure core (unit-tested) ------------------------------------------------

/** Parse JSONL text into records; blank lines and `//`/`#` comment lines are ignored; bad lines collected. */
function parseJsonl(text) {
  const records = [];
  const errors = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith('//') || raw.startsWith('#')) continue;
    try {
      records.push(JSON.parse(raw));
    } catch (e) {
      errors.push({ line: i + 1, snippet: raw.slice(0, 80), error: e.message });
    }
  }
  return { records, errors };
}

function ratio(num, den) { return den === 0 ? null : +(num / den).toFixed(3); }

/** Metrics for one bucket of records. */
function metricsFor(records) {
  const runs = records.length;
  let confirmed = 0, refuted = 0, partial = 0, verdictRuns = 0;
  // refuted_kind breakout (all OPTIONAL; absent on every legacy record -> counted as unlabeled)
  let refutedWrongVerdict = 0, refutedCorrectRefutation = 0, refutedUnlabeled = 0;
  let realCatchRuns = 0, totalCost = 0, realCatches = 0;
  let flaggedTotal = 0, flaggedNotReal = 0, escapes = 0;

  for (const r of records) {
    const outcome = String(r.validation_outcome || 'NA').toUpperCase();
    if (outcome === 'CONFIRMED') { confirmed++; verdictRuns++; }
    else if (outcome === 'REFUTED') {
      refuted++; verdictRuns++;
      // "wrong-verdict" = bad (a false verdict, e.g. crawl-rate's fake 4.83 MB/s);
      // "correct-refutation" = good (disproving a bad premise, e.g. task-44 saving a compliance violation).
      const kind = String(r.refuted_kind || '').toLowerCase();
      if (kind === 'wrong-verdict') refutedWrongVerdict++;
      else if (kind === 'correct-refutation') refutedCorrectRefutation++;
      else refutedUnlabeled++;
    }
    else if (outcome === 'PARTIAL') { partial++; verdictRuns++; }

    totalCost += Number(r.cost_turns) || 0;
    const flagged = Array.isArray(r.issues_flagged) ? r.issues_flagged : [];
    const realsHere = flagged.filter((f) => f && f.validated === 'real').length;
    if (realsHere > 0) realCatchRuns++;
    realCatches += realsHere;
    flaggedTotal += flagged.length;
    flaggedNotReal += flagged.filter((f) => f && f.validated === 'false-alarm').length;
    escapes += (Array.isArray(r.escaped) ? r.escaped.length : 0);
  }

  const verdictAccuracy = verdictRuns === 0 ? null
    : +((confirmed + 0.5 * partial) / verdictRuns).toFixed(3);
  // Additive companion — credits a correct-refutation as a hit so diagnosis shapes aren't punished
  // for their most valuable output. verdict_accuracy above is deliberately left as-is (REFUTED = miss).
  const verdictAccuracyAdjusted = verdictRuns === 0 ? null
    : +((confirmed + refutedCorrectRefutation + 0.5 * partial) / verdictRuns).toFixed(3);

  return {
    runs,
    verdict_accuracy: verdictAccuracy,
    verdict_accuracy_adjusted: verdictAccuracyAdjusted,
    catch_rate: ratio(realCatchRuns, runs),
    false_alarm_rate: ratio(flaggedNotReal, flaggedTotal),
    // cost-to-catch: turns spent per validated-real catch. Infinity when nothing real was caught.
    cost_to_catch: realCatches === 0 ? (totalCost > 0 ? Infinity : null) : +(totalCost / realCatches).toFixed(2),
    escape_rate: ratio(escapes, runs),
    // REFUTED split (flows to overall + every group via the metricsFor spread, and into --json)
    refuted_breakdown: { wrong_verdict: refutedWrongVerdict, correct_refutation: refutedCorrectRefutation, unlabeled: refutedUnlabeled },
    _counts: { confirmed, refuted, partial, realCatches, totalCost: +totalCost.toFixed(2), escapes },
  };
}

function groupKey(rec, groupBy) {
  if (groupBy === 'shape') return String(rec.shape || 'unknown');
  if (groupBy === 'task_type') return String(rec.task_type || 'unknown');
  return `${rec.shape || 'unknown'} · ${rec.task_type || 'unknown'}`; // shape+task_type
}

/**
 * Compute the full scorecard. opts: { groupBy, since, minRuns, floors:{minVerdictAccuracy, maxCostToCatch} }.
 * Returns { overall, groups:[{key, ...metrics}], earned:[], pruneCandidates:[], violations:[] }.
 */
function computeScorecard(records, opts = {}) {
  const groupBy = opts.groupBy || 'shape+task_type';
  const minRuns = opts.minRuns || 5;
  const floors = opts.floors || {};

  let recs = records.slice();
  if (opts.since) recs = recs.filter((r) => !r.date || r.date >= opts.since);

  const overall = metricsFor(recs);

  const buckets = new Map();
  for (const r of recs) {
    const k = groupKey(r, groupBy);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(r);
  }
  const groups = [...buckets.entries()]
    .map(([key, rs]) => ({ key, ...metricsFor(rs) }))
    .sort((a, b) => b.runs - a.runs);

  // "Earned its cost": low cost-to-catch, low false-alarm, low escape, enough runs.
  const earned = groups
    .filter((g) => g.runs >= minRuns && g.cost_to_catch !== null && g.cost_to_catch !== Infinity)
    .filter((g) => (g.false_alarm_rate === null || g.false_alarm_rate <= 0.34) && (g.escape_rate === null || g.escape_rate <= 0.34))
    .sort((a, b) => a.cost_to_catch - b.cost_to_catch);

  // Prune/repair candidates: low verdict-accuracy, or nothing-real-caught, or high false-alarm.
  const pruneCandidates = groups
    .filter((g) => g.runs >= minRuns)
    .filter((g) => (g.verdict_accuracy !== null && g.verdict_accuracy < 0.5)
      || g.cost_to_catch === Infinity
      || (g.false_alarm_rate !== null && g.false_alarm_rate > 0.5));

  // Ratchet violations (only for groups with enough runs — anecdotes cannot trip it).
  const violations = [];
  for (const g of groups) {
    if (g.runs < minRuns) continue;
    if (floors.minVerdictAccuracy != null && g.verdict_accuracy !== null && g.verdict_accuracy < floors.minVerdictAccuracy) {
      violations.push({ group: g.key, metric: 'verdict_accuracy', value: g.verdict_accuracy, floor: floors.minVerdictAccuracy });
    }
    if (floors.maxCostToCatch != null && g.cost_to_catch !== null && g.cost_to_catch > floors.maxCostToCatch) {
      violations.push({ group: g.key, metric: 'cost_to_catch', value: g.cost_to_catch, ceiling: floors.maxCostToCatch });
    }
  }

  return { groupBy, minRuns, overall, groups, earned, pruneCandidates, violations };
}

// ---- CLI --------------------------------------------------------------------

function getArg(argv, name, dflt) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
}

function fmt(v) {
  if (v === null || v === undefined) return 'n/a';
  if (v === Infinity) return '∞';
  return typeof v === 'number' ? String(+v.toFixed(3)) : String(v);
}

function main() {
  const argv = process.argv.slice(2);
  const ledgerPath = path.resolve(getArg(argv, '--ledger', DEFAULT_LEDGER));
  const groupBy = getArg(argv, '--group-by', 'shape+task_type');
  const since = getArg(argv, '--since', null);
  const minRuns = Number(getArg(argv, '--min-runs', 5));
  const asJson = argv.includes('--json');
  const floors = {};
  if (argv.includes('--min-verdict-accuracy')) floors.minVerdictAccuracy = Number(getArg(argv, '--min-verdict-accuracy'));
  if (argv.includes('--max-cost-to-catch')) floors.maxCostToCatch = Number(getArg(argv, '--max-cost-to-catch'));

  let text;
  try {
    text = fs.readFileSync(ledgerPath, 'utf8');
  } catch (e) {
    console.error(`workflow-scorecard: cannot read ${ledgerPath}: ${e.message}`);
    console.error('Seed docs/agi/WORKFLOW_LEDGER.jsonl (one JSON record per workflow run) — see docs/agi/WORKFLOW_MEASUREMENT.md §2.');
    process.exit(2);
  }

  const { records, errors } = parseJsonl(text);
  const sc = computeScorecard(records, { groupBy, since, minRuns, floors });

  if (asJson) {
    process.stdout.write(JSON.stringify({ ledgerPath, parseErrors: errors, ...sc }, null, 2) + '\n');
    if (sc.violations.length) process.exit(1);
    return;
  }

  const L = [];
  L.push('── workflow scorecard ────────────────────────────────────');
  L.push(`records: ${records.length}   group-by: ${groupBy}   min-runs: ${minRuns}${since ? `   since: ${since}` : ''}`);
  const o = sc.overall;
  L.push(`OVERALL: runs ${o.runs}  verdict-accuracy ${fmt(o.verdict_accuracy)}  catch-rate ${fmt(o.catch_rate)}  false-alarm ${fmt(o.false_alarm_rate)}  cost-to-catch ${fmt(o.cost_to_catch)}  escape-rate ${fmt(o.escape_rate)}`);
  const rb = o.refuted_breakdown || {};
  if ((rb.correct_refutation || 0) + (rb.wrong_verdict || 0) > 0) {
    L.push(`         refuted: ${rb.correct_refutation || 0} correct-refutation (good) / ${rb.wrong_verdict || 0} wrong-verdict (bad) / ${rb.unlabeled || 0} unlabeled   adj-verdict-accuracy ${fmt(o.verdict_accuracy_adjusted)}`);
  }
  L.push('');
  L.push('  runs  vacc  catch  falarm  c2catch  escape   group');
  for (const g of sc.groups) {
    L.push(`  ${String(g.runs).padStart(4)}  ${fmt(g.verdict_accuracy).padStart(4)}  ${fmt(g.catch_rate).padStart(5)}  ${fmt(g.false_alarm_rate).padStart(6)}  ${fmt(g.cost_to_catch).padStart(7)}  ${fmt(g.escape_rate).padStart(6)}   ${g.key}`);
  }
  if (sc.earned.length) {
    L.push('');
    L.push('  earned its cost (low cost-to-catch, ≥min-runs): ' + sc.earned.map((g) => `${g.key} (${fmt(g.cost_to_catch)})`).join('; '));
  }
  if (sc.pruneCandidates.length) {
    L.push('  prune/repair candidates: ' + sc.pruneCandidates.map((g) => `${g.key} (vacc ${fmt(g.verdict_accuracy)}, c2c ${fmt(g.cost_to_catch)})`).join('; '));
  }
  if (errors.length) L.push(`  ⚠ ${errors.length} unparseable line(s) skipped`);
  if (sc.violations.length) {
    L.push('');
    L.push('  ✗ RATCHET VIOLATIONS:');
    for (const v of sc.violations) L.push(`    - ${v.group}: ${v.metric} ${fmt(v.value)} ${v.floor != null ? `< floor ${v.floor}` : `> ceiling ${v.ceiling}`}`);
  }
  console.log(L.join('\n'));
  if (sc.violations.length) process.exit(1);
}

if (require.main === module) main();

module.exports = { parseJsonl, metricsFor, computeScorecard, groupKey, ratio };
