#!/usr/bin/env node
'use strict';

/**
 * tech-state.js — derive a curated tech's state from evidence, instead of
 * trusting a hand-typed field.
 *
 *   node tools/agi/tech-state.js            # every node, evidence and verdict
 *   node tools/agi/tech-state.js --json
 *
 * WHY. config/tech-tree.json holds two kinds of node. The RB-backed ones read
 * their state live from RESEARCH_BACKLOG.md and, as statusData.js puts it,
 * "cannot disagree". The 23 curated TECH-* nodes carry a typed `state`, and
 * those rotted: TECH-ENGINESPLIT still reads `available` beside its own note
 * saying five of seven clusters are already home, and `asOf` went stale. The
 * design rule in BOOT.md — derived by default — exists because of exactly this.
 *
 * `doneWhen` IS OPTIONAL, AND THAT IS DELIBERATE. Not every completion has
 * file-shaped evidence. TECH-HEADLINE2 ("push real-headline yield further via
 * shape preference + host density") completed as a measured crawl outcome; no
 * file proves it. Requiring a predicate everywhere would mean inventing
 * tautologies so an acceptance test could pass — which is worse than no
 * predicate, because a fabricated check reads exactly like a real one.
 *
 * So: a node WITH a predicate gets a derived verdict, and a CONTRADICTION
 * between that verdict and the typed state is reported loudly. A node WITHOUT
 * one is counted as UNVERIFIED — the honest state of "typed, and nothing can
 * contradict it". Driving that count down is the work; hiding it would be the
 * failure.
 *
 * Predicate kinds:
 *   { "probe": "crawl-console-live" }        a probe by that id is REGISTERED
 *   { "exists": "path/from/repo/root" }      the file or directory is present
 *   { "contains": "path", "text": "needle" } the file contains that text
 *   { "ratchet": "ncdb-debt", "atMost": 140 }a probe's --max ceiling is at/below
 *
 * `probe` means REGISTERED, not PASSING. Running every probe here would make
 * this expensive and would conflate "the capability shipped" with "the system
 * is green right now" — a red bridge-health should not un-complete a tech. You
 * do not register a guard for something you did not build.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');

// --- pure core ---------------------------------------------------------------

/**
 * Evaluate one predicate. Returns { met, evidence } — never throws for a
 * missing file, because "absent" is a legitimate answer, but DOES throw for a
 * malformed predicate, which is an authoring error.
 */
function evaluatePredicate(pred, ctx) {
  if (!pred || typeof pred !== 'object') throw new Error('doneWhen must be an object');
  const { probeIds = new Set(), readFile = () => null, exists = () => false, ratchetCeiling = () => null } = ctx || {};

  if (pred.probe) {
    const met = probeIds.has(pred.probe);
    return { met, evidence: `probe ${pred.probe} ${met ? 'registered' : 'NOT registered'}` };
  }
  if (pred.ratchet) {
    if (typeof pred.atMost !== 'number') throw new Error(`ratchet predicate needs a numeric atMost`);
    const ceiling = ratchetCeiling(pred.ratchet);
    if (ceiling === null) return { met: false, evidence: `ratchet ${pred.ratchet} not found` };
    const met = ceiling <= pred.atMost;
    return { met, evidence: `ratchet ${pred.ratchet} ceiling ${ceiling} (needs <= ${pred.atMost})` };
  }
  if (pred.reviewOf) {
    // A REVIEW node. Reviews recur; `done` does not — a review of the crawler
    // architecture is worth repeating as the architecture changes, and
    // done+researchedOn cannot say "done, but stale".
    //
    // Resolved by DERIVING staleness rather than declaring it (the BOOT.md
    // rule): the record is current when it is newer than the last change to
    // the thing it reviews. Staleness is INFORMATION, not a failure — only a
    // contradiction between evidence and typed state fails the probe. A repo
    // under active development would otherwise be permanently red.
    const { record, reviewOf: subject } = pred;
    if (!record) throw new Error('reviewOf predicate needs a record path');
    if (!ctx.exists(record)) {
      return { met: false, evidence: `${record} — never recorded` };
    }
    const recordedAt = (ctx.lastCommit || (() => null))(record);
    const changedAt = (ctx.lastCommit || (() => null))(subject);
    if (!recordedAt || !changedAt) {
      return { met: true, evidence: `${record} exists (dates unavailable)` };
    }
    const stale = changedAt > recordedAt;
    return {
      met: true,
      stale,
      evidence: stale
        ? `${record} recorded ${recordedAt.slice(0, 10)}, but ${subject} changed ${changedAt.slice(0, 10)} — STALE`
        : `${record} current as of ${recordedAt.slice(0, 10)}`
    };
  }
  if (pred.nodeField) {
    // "do any tech nodes carry this field yet?" — for techs whose completion IS
    // a new field on the tree (flavor text, typed edges).
    //
    // This kind exists because the obvious alternative is a self-referential
    // trap: a `contains` predicate looking for "flavor" inside tech-tree.json
    // is ITSELF stored in tech-tree.json, so the file contains the needle the
    // moment you write the check. It happens to read false today only because
    // JSON escapes the quotes — correct by accident, which is not correct.
    const n = (ctx.nodesWithField || (() => 0))(pred.nodeField);
    const met = n > 0;
    return { met, evidence: `${n} tech node(s) carry a ${pred.nodeField} field` };
  }
  if (pred.contains) {
    if (!pred.text) throw new Error('contains predicate needs a text');
    const body = readFile(pred.contains);
    const met = body !== null && body.includes(pred.text);
    return { met, evidence: `${pred.contains} ${met ? 'contains' : 'does NOT contain'} ${JSON.stringify(pred.text)}` };
  }
  if (pred.exists) {
    const met = exists(pred.exists);
    return { met, evidence: `${pred.exists} ${met ? 'exists' : 'MISSING'}` };
  }
  throw new Error(`unrecognised doneWhen: ${JSON.stringify(pred)}`);
}

/**
 * Classify every curated tech.
 *   verified-done      predicate met, typed state agrees
 *   verified-pending   predicate not met, typed state agrees
 *   CONTRADICTION      predicate and typed state disagree — read it
 *   unverified         no predicate; the typed state stands unchallenged
 */
function classify(techs, ctx) {
  const out = [];
  for (const t of techs || []) {
    const id = t.id || t.ref;
    if (!t.state) continue; // RB-backed node: state is already derived elsewhere
    if (!t.doneWhen) {
      out.push({ id, typed: t.state, verdict: 'unverified', evidence: null });
      continue;
    }
    const { met, evidence, stale } = evaluatePredicate(t.doneWhen, ctx);

    // A RECURRING node is `available` forever BY DESIGN — TECH-ARCHREVIEW-CRAWLER's
    // own prelim says it "never grows and never disappears", because it is always
    // possible in principle to review an architecture again. So a met predicate
    // here does NOT mean completion and must not be compared against the typed
    // state: writing the first review would otherwise instantly contradict a node
    // that is behaving exactly as specified.
    //
    // Caught by the real tree the moment the first review landed. The fixtures
    // for `reviewOf` all typed the node `done`, so this path was never exercised
    // — a reminder that a predicate suite passing on invented nodes proves less
    // than one run against the actual spec.
    //
    // What the evidence reports for these is the record's FRESHNESS, in the
    // three-state vocabulary of docs/agi/reviews/README.md.
    if (t.recurring) {
      const verdict = !met ? 'never-recorded' : stale ? 'recorded-STALE' : 'recorded-current';
      const row = { id, typed: t.state, derived: null, verdict, evidence, recurring: true };
      if (stale) row.stale = true;
      out.push(row);
      continue;
    }

    const typedDone = t.state === 'done';
    const verdict = met === typedDone ? (met ? 'verified-done' : 'verified-pending') : 'CONTRADICTION';
    const row = { id, typed: t.state, derived: met ? 'done' : 'available', verdict, evidence };
    if (stale) row.stale = true;
    out.push(row);
  }
  return out;
}

// --- I/O ---------------------------------------------------------------------

function buildContext() {
  let probes = { probes: [] };
  try {
    probes = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'dev', 'probes.json'), 'utf8'));
  } catch (_) {
    // Reviewed swallow: an unreadable probes.json means no probe is registered,
    // which every `probe` predicate then reports as NOT registered — a visible
    // wrong answer, not a hidden one. Throwing here would blank the whole tree
    // over an optional input.
  }
  const probeIds = new Set((probes.probes || []).map((p) => p.id));
  // Both flags, because the repo uses both: ncdb-debt-scan takes --max while
  // engine-debt and ui-debt take --ceiling. Reading only one would silently
  // report "ratchet not found" for half the guards.
  const ratchetCeiling = (id) => {
    const p = (probes.probes || []).find((x) => x.id === id);
    if (!p) return null;
    for (const flag of ['--max', '--ceiling']) {
      const i = (p.args || []).indexOf(flag);
      if (i >= 0) return Number(p.args[i + 1]);
    }
    return null;
  };
  const readFile = (rel) => {
    // Reviewed swallow: "the file is absent" is a legitimate verdict for a
    // `contains` predicate (it reports NOT met), not an error condition.
    try { return fs.readFileSync(path.resolve(ROOT, rel), 'utf8'); } catch (_) { return null; }
  };
  const exists = (rel) => fs.existsSync(path.resolve(ROOT, rel));
  let spec = { techs: [] };
  try {
    spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'tech-tree.json'), 'utf8'));
  } catch (_) {
    // Reviewed swallow: an unreadable spec means zero nodes carry any field,
    // which every nodeField predicate reports as NOT met — a visible answer.
  }
  const nodesWithField = (field) => (spec.techs || []).filter((t) => t[field] !== undefined).length;

  // Last commit touching a path, ISO-8601, cached — a review's staleness is
  // "did the thing I reviewed change after I reviewed it?".
  const dateCache = new Map();
  const lastCommit = (rel) => {
    if (dateCache.has(rel)) return dateCache.get(rel);
    let out = null;
    try {
      const raw = execFileSync('git', ['log', '-1', '--format=%cI', '--', rel],
        { cwd: ROOT, encoding: 'utf8' }).trim();
      out = raw || null;
    } catch (_) {
      // Reviewed swallow: no git, or a path git has never seen. Both mean "no
      // date", which evaluatePredicate reports as dates-unavailable rather
      // than silently calling the review current.
    }
    dateCache.set(rel, out);
    return out;
  };

  return { probeIds, ratchetCeiling, readFile, exists, nodesWithField, lastCommit };
}

function main() {
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'tech-tree.json'), 'utf8'));
  const rows = classify(spec.techs, buildContext());

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ total: rows.length, rows }, null, 2));
    return;
  }

  const bucket = (v) => rows.filter((r) => r.verdict === v);
  const contradictions = bucket('CONTRADICTION');
  const unverified = bucket('unverified');

  const recurring = rows.filter((r) => r.recurring);

  console.log('\n== curated tech state, derived from evidence ==');
  console.log(`${rows.length} curated nodes · ${bucket('verified-done').length} verified done · `
    + `${bucket('verified-pending').length} verified pending · ${unverified.length} UNVERIFIED · `
    + `${contradictions.length} contradictions`);
  if (recurring.length) {
    console.log(`${recurring.length} recurring (reviews) · `
      + `${bucket('recorded-current').length} current · ${bucket('recorded-STALE').length} stale · `
      + `${bucket('never-recorded').length} never recorded`);
  }
  console.log('');

  for (const r of rows.filter((x) => x.evidence)) {
    const mark = r.verdict === 'CONTRADICTION' ? '!!'
      : r.verdict === 'verified-done' || r.verdict === 'recorded-current' ? 'ok'
        : r.verdict === 'recorded-STALE' ? '~~' : '  ';
    console.log(`  ${mark} ${r.id.padEnd(22)} typed=${String(r.typed).padEnd(10)} ${r.evidence}`);
  }

  const stale = rows.filter((r) => r.stale);
  if (stale.length) {
    console.log(`\n  STALE — recorded, but the thing reviewed has changed since:`);
    for (const r of stale) console.log(`    ${r.id}: ${r.evidence}`);
    console.log('  Not a failure. Reviews recur; re-run one when its subject moves.');
  }

  if (unverified.length) {
    console.log(`\n  UNVERIFIED — typed state stands, nothing can contradict it:`);
    console.log(`  ${unverified.map((r) => r.id).join(', ')}`);
    console.log('  Not every completion has file-shaped evidence; driving this count');
    console.log('  down is the work, and inventing a predicate to hide it is not.');
  }

  if (contradictions.length) {
    console.error(`\nCONTRADICTION: ${contradictions.length} node(s) — the evidence and the typed state disagree.`);
    for (const r of contradictions) console.error(`  ${r.id}: typed ${r.typed}, evidence says ${r.derived} — ${r.evidence}`);
    console.error('Either the predicate is wrong or the node is mislabelled. This tool cannot tell you which.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { evaluatePredicate, classify, buildContext };
