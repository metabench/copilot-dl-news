#!/usr/bin/env node
'use strict';

/**
 * progress-surface.check.js — the three CODE CONTRACTS the progress picture and the
 * status page depend on (RB-011: durable claims carry their own re-verification).
 *
 * Each was established by a cycle that paid for it, and each was asserted in prose
 * with nothing stopping the next refactor from quietly undoing it:
 *
 *   P1 progress-svg.js reads only COMMITTED inputs — never live git (cycle 127).
 *      The staleness probe is an exact byte-compare; that is only sound while the
 *      render is a pure function of files in the repo. One execSync('git log') in
 *      the renderer would make the committed SVG un-reproducible and turn the
 *      staleness check into a coin flip.
 *   P2 the status page's client fetches IMMEDIATELY on activate, not only on an
 *      interval (cycle 128.5). The jsgui3 `Server({Ctrl})` recipe publishes its SSR
 *      HTML once at server start, so without an immediate fetch every visitor reads
 *      boot-time numbers for a full interval. This is the one-line fix that cycle
 *      shipped, and it had no guard until now.
 *   P3 /progress.svg is read from disk INSIDE the route handler (cycle 124), so a
 *      regenerated picture appears without redeploying. Hoisting that read to module
 *      scope would silently pin the served bytes to server start — the same class of
 *      staleness as P2, one layer down.
 *
 * WHY ONE PROBE, NOT THREE: probe sprawl has a real cost (a surface that stops
 * earning its cost is what workflow-scorecard-ratchet exists to catch), and these are
 * one theme — how the progress surface gets fresh data. WHY NOT FOLDED INTO
 * progress-svg-staleness: that probe is EXPECTED to be red mid-cycle (data changed,
 * regeneration pending). These contracts should never be red. Mixing the two would
 * make "red is fine right now" ambiguous, and an ambiguous red gets ignored.
 *
 * DELIBERATELY NOT PROBED (named, per the c130 rule): the framework-side claim that
 * HTTP_Webpage_Publisher renders once at startup. That is jsgui3's behaviour, not
 * ours, and asserting it would encode a guess about a consume-only dependency's
 * internals — so this file guards OUR side of the contract (P2/P3) and the memory
 * note carries the framework fact.
 *
 *   node tools/dev/checks/progress-surface.check.js [--json]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * Strip comments before matching source. A tripwire that reads its own explanatory
 * comment is documentation-as-breakage — the c126 stanza-placeholder class, which
 * recurred in c128's first tripwire. Check the code, never the prose about it.
 */
function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** P1: the renderer must not reach for live process state. */
function checkRendererPurity(src) {
  const code = stripComments(src);
  const banned = ['child_process', 'execSync', 'execFileSync', 'spawnSync', 'spawn('];
  const found = banned.filter((b) => code.includes(b));
  return found.length
    ? [`progress-svg.js references ${found.join(', ')} — the render must be a pure function of COMMITTED inputs (snapshot live state via tools/agi/repo-activity.js instead), or the staleness byte-compare is meaningless`]
    : [];
}

/** P2: activate() must fetch now, not only every interval. */
function checkImmediateRefresh(src) {
  const code = stripComments(src);
  const problems = [];
  // A bare `refresh();` on its own line — not `if (...) refresh();` (the click
  // handler) and not the setInterval registration.
  if (!/^\s*refresh\(\);\s*$/m.test(code)) {
    problems.push('status page activate() never calls refresh() immediately — a {Ctrl}-recipe page publishes its SSR once at server start, so every visitor would read boot-time numbers until the interval fires');
  }
  if (!/setInterval\(\s*refresh/.test(code)) {
    problems.push('status page lost its periodic refresh (setInterval(refresh, ...)) — the page would never update while open');
  }
  return problems;
}

/** P3: the SVG route must hit the disk per request. */
function checkDiskServedSvg(src) {
  const code = stripComments(src);
  const m = /set_route\(\s*'\/progress\.svg'[\s\S]{0,600}/.exec(code);
  if (!m) return ["no /progress.svg route found in the status server — the page embeds it, so the picture would 404"];
  if (!/readFile\s*\(/.test(m[0])) {
    return ['/progress.svg does not read from disk inside its handler — hoisting the read pins the served bytes to server start, so a regenerated picture never appears'];
  }
  return [];
}

const CONTRACTS = [
  { id: 'P1-renderer-purity', file: 'tools/agi/progress-svg.js', check: checkRendererPurity },
  // Cycle 163 split the app's one controls.js into one class per file; the
  // page's activate() — and therefore this contract — now lives on the
  // application control. Repointed, not relaxed: the assertion is unchanged.
  { id: 'P2-immediate-refresh', file: 'src/ui/server/projectStatus/controls/app/Status_Widget.js', check: checkImmediateRefresh },
  { id: 'P3-svg-served-from-disk', file: 'src/ui/server/projectStatus/server.js', check: checkDiskServedSvg }
];

function evaluate(readFileFn) {
  return CONTRACTS.map((c) => {
    let src;
    try { src = readFileFn(c.file); } catch (e) {
      // An unreadable file is an unenforced contract, not a pass (c128 rule).
      return { id: c.id, file: c.file, ok: false, problems: [`cannot read ${c.file}: ${e.message}`] };
    }
    const problems = c.check(src);
    return { id: c.id, file: c.file, ok: problems.length === 0, problems };
  });
}

function main() {
  const results = evaluate((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ results, violations: results.filter((r) => !r.ok).length }, null, 2));
  } else {
    for (const r of results) {
      console.log(`  ${r.ok ? '✅' : '❌'} ${r.id.padEnd(24)} ${r.ok ? r.file : r.problems.join(' · ')}`);
    }
  }
  const bad = results.filter((r) => !r.ok);
  if (bad.length) {
    console.log(`\n❌ progress-surface: ${bad.length} broken contract(s) — these should never be red (unlike progress-svg-staleness, which is expected red mid-cycle).`);
    process.exit(1);
  }
  console.log(`\n✅ progress surface contracts intact (${results.length} checked).`);
}

module.exports = { stripComments, checkRendererPurity, checkImmediateRefresh, checkDiskServedSvg, evaluate, CONTRACTS };
if (require.main === module) main();
