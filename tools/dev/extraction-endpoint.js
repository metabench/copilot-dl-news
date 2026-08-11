#!/usr/bin/env node
'use strict';

/**
 * extraction-endpoint.js — how far CAN the crawler-engine extraction actually
 * go? A MEASUREMENT, not a guard.
 *
 *   node tools/dev/extraction-endpoint.js            # the endpoint, by cluster
 *   node tools/dev/extraction-endpoint.js --files    # every anchored file
 *   node tools/dev/extraction-endpoint.js --accept   # the acceptance test
 *   node tools/dev/extraction-endpoint.js --json
 *
 * WHY. engine-debt.check.js ratchets the file count DOWN, and TECH-ENGINESPLIT
 * gates on that count reaching `atMost: 0`. Nobody ever measured whether zero is
 * reachable — the 2026-08-09 crawler architecture review flagged it as an
 * assumption about the endpoint rather than a measured one, and named settling
 * it the most useful next step. This file settles the measurable half. The other
 * half is a boundary decision, which is the owner's (see DEC-ENGINE-BOUNDARY).
 *
 * DELIBERATELY NOT A PROBE. That review's own finding F3 was that six of the
 * eight highest-churn files in the repo are the loop's own instruments while
 * zero are crawler files. Another ratchet is the last thing this repo needs. It
 * is re-runnable because the number moves as work lands, and a one-off figure
 * pasted into a document would rot exactly the way docs/plans/INDEX.md did.
 *
 * THE CLASSIFICATION. A file is:
 *   portable  no require() outside src/core/crawler at all
 *   soft      out-of-scope requires, but ONLY on targets that a file which has
 *             ALREADY successfully left also depended on
 *   HARD      reaches a surface no completed extraction has yet resolved
 *
 * The `soft` set is derived from evidence rather than judgement: every file that
 * has left since BEFORE_EXTRACTION required something, and whatever that was got
 * resolved somehow — the target moved too, the require was re-pointed at
 * news-crawler-itself, or the dependency was inverted and injected (the c180
 * QueueManager pattern). The tool PRINTS how many files that evidence rests on
 * rather than hardcoding it here, because the set grows with each extraction:
 * 108 on 2026-08-04, 122 after the operation-schemas slice on 2026-08-11.
 *
 * The honest caveat, because it changes what the number means: this proves the
 * DEPENDENCY CLASS was resolvable, not that any particular target relocated. It
 * is evidence about difficulty, not a guarantee about a file.
 *
 * Built acceptance-test-first per docs/agi/BOOT.md: `--accept` re-classifies the
 * 108 files ALREADY KNOWN to have left, as they were the moment before they
 * left. A first cut called 15 of them anchored — a 13.9% false-anchor rate — and
 * reading those 15 is what produced the `soft` category. An instrument that
 * cannot reproduce answers you already have is not evidence about the ones you
 * do not.
 */

const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SCOPE = 'src/core/crawler';
// The first slice of the 2026-08-04 extraction run; its parent is the last tree
// in which all 108 later-extracted files were still present.
const BEFORE_EXTRACTION = '5eae412e~1';

// Resolve identically from either repo, so they never anchor anything.
const SIBLING = /^(news-crawler-db|news-crawler-itself)(\/|$)/;

// --- pure core ---------------------------------------------------------------

/** Every string-literal require() target in a source body. */
function requiresOf(body) {
  const out = [];
  const re = /require\(\s*(['"])([^'"]+)\1\s*\)/g;
  let m;
  while ((m = re.exec(body))) out.push(m[2]);
  return out;
}

/**
 * Classify one require target as seen from `file`.
 * A computed require() is NOT guessed at — see hasDynamicRequire.
 */
function classifyRequire(target, file) {
  if (!target.startsWith('.')) return SIBLING.test(target) ? 'sibling' : 'npm';
  const abs = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
  return abs === SCOPE || abs.startsWith(SCOPE + '/') ? 'internal' : 'OUT';
}

/** Out-of-scope targets of one file, normalised to repo-relative paths. */
function outboundTargets(body, file) {
  const outs = requiresOf(body)
    .filter((t) => classifyRequire(t, file) === 'OUT')
    .map((t) => path.posix.normalize(path.posix.join(path.posix.dirname(file), t)));
  return [...new Set(outs)];
}

function hasDynamicRequire(body) {
  return /require\(\s*[^'")\s]/.test(body);
}

/** portable | soft | HARD, given the proven-resolvable target set. */
function classifyFile(outs, proven) {
  if (!outs.length) return { kind: 'portable', hard: [] };
  const hard = outs.filter((o) => !proven.has(o));
  return { kind: hard.length ? 'HARD' : 'soft', hard };
}

/**
 * Resolve one INTERNAL require to a tracked file, trying the three forms Node
 * does. Returns null when nothing matches, rather than inventing a path.
 */
function resolveInternal(from, spec, tracked) {
  const abs = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  return [abs, abs + '.js', abs + '/index.js'].find((c) => tracked.has(c)) || null;
}

/**
 * Which files can ACTUALLY move, following internal edges transitively?
 *
 * `portable` above means no DIRECT out-of-scope require, which is an UPPER
 * BOUND rather than the movable set: a portable file that requires an internal
 * file which is itself HARD-anchored cannot leave on its own. The unit of
 * extraction is a closure, not a file — the ledger's own moves describe whole
 * "pure/db-module closures".
 *
 * Measured on the tree of 2026-08-11 BEFORE that day's extraction: 198 movable
 * / 59 blocked, against a naive 200/57. Close in total, different in membership
 * — and membership is what decides what can move. Those two figures are a
 * historical comparison, deliberately not restated as live numbers; run the tool
 * for today's.
 *
 * `graph` is Map<file, { deps: string[], kind }>.
 */
function movableSet(graph) {
  const closure = (f, seen = new Set()) => {
    if (seen.has(f)) return seen;
    seen.add(f);
    for (const d of graph.get(f)?.deps || []) closure(d, seen);
    return seen;
  };
  const movable = [];
  const blocked = [];
  for (const f of graph.keys()) {
    const reached = [...closure(f)].filter((x) => graph.get(x)?.kind === 'HARD');
    (reached.length ? blocked : movable).push({ file: f, blockedBy: reached });
  }
  return { movable, blocked };
}

/**
 * Group hard anchors into the areas a boundary decision would rule on, so the
 * remaining work reads as a handful of decisions rather than 31 file moves.
 */
const CLUSTERS = [
  ['intelligence', /^src\/intelligence\//],
  ['app services', /^src\/services\//],
  ['orchestration', /^src\/core\/orchestration\//],
  ['db & storage', /^src\/(db|data\/db)\//],
  ['shared utils', /^src\/shared\//],
  ['tools & labs', /^(src\/tools|src\/wip|tools\/)/],
  ['legacy crawl', /^src\/crawl(\/|$)/]
];
function clusterOf(target) {
  for (const [name, re] of CLUSTERS) if (re.test(target)) return name;
  return 'other';
}

// --- I/O ---------------------------------------------------------------------

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });

const trackedAt = (rev) => git(['ls-tree', '-r', '--name-only', rev, '--', SCOPE])
  .split('\n').map((s) => s.trim()).filter((s) => s.endsWith('.js'));

function analyseAt(rev, files) {
  const rows = [];
  for (const f of files) {
    let body;
    try { body = git(['show', `${rev}:${f}`]); } catch (_) {
      // Reviewed swallow: a path git cannot show at this rev simply is not part
      // of that tree. Skipping it is the correct answer, not an error.
      continue;
    }
    rows.push({ file: f, outs: outboundTargets(body, f), dynamic: hasDynamicRequire(body) });
  }
  return rows;
}

/** Targets proven resolvable, from the files that already left successfully. */
function provenTargets() {
  const head = new Set(trackedAt('HEAD'));
  const gone = trackedAt(BEFORE_EXTRACTION).filter((f) => !head.has(f));
  const proven = new Set();
  for (const r of analyseAt(BEFORE_EXTRACTION, gone)) for (const o of r.outs) proven.add(o);
  return { proven, goneCount: gone.length };
}

function main() {
  const argv = process.argv.slice(2);
  const { proven, goneCount } = provenTargets();

  if (argv.includes('--accept')) {
    const head = new Set(trackedAt('HEAD'));
    const gone = trackedAt(BEFORE_EXTRACTION).filter((f) => !head.has(f));
    // Against an EMPTY proven set — the question is how the raw rule scores on
    // files known to have left. Scoring them against a set derived from
    // themselves would be circular and would trivially read 0%.
    const rows = analyseAt(BEFORE_EXTRACTION, gone);
    const wrong = rows.filter((r) => classifyFile(r.outs, new Set()).kind === 'HARD');
    const rate = (100 * wrong.length / (gone.length || 1)).toFixed(1);
    console.log(`ACCEPTANCE: ${gone.length} files known to have left successfully`);
    console.log(`  the raw out-of-scope rule calls ${wrong.length} of them anchored (${rate}% false)`);
    console.log('  Those are what the `soft` category is derived from — a target one of');
    console.log('  them survived is not a blocker. Expect this to be NON-ZERO: a 0% rate');
    console.log('  would mean the proven set was fitted to its own test.');
    return;
  }

  const files = trackedAt('HEAD');
  const rows = analyseAt('HEAD', files).map((r) => ({ ...r, ...classifyFile(r.outs, proven) }));
  const of = (k) => rows.filter((r) => r.kind === k);

  // The transitive picture. Built from the same bodies, so one more pass over
  // git rather than a second scan.
  const trackedSet = new Set(files);
  const graph = new Map();
  for (const r of rows) {
    const body = git(['show', `HEAD:${r.file}`]);
    const deps = [];
    for (const t of requiresOf(body)) {
      if (classifyRequire(t, r.file) !== 'internal') continue;
      const hit = resolveInternal(r.file, t, trackedSet);
      if (hit) deps.push(hit);
    }
    graph.set(r.file, { deps, kind: r.kind });
  }
  const { movable, blocked } = movableSet(graph);

  const byCluster = {};
  for (const r of of('HARD')) {
    for (const t of r.hard) {
      const c = clusterOf(t);
      (byCluster[c] = byCluster[c] || { targets: new Set(), files: new Set() });
      byCluster[c].targets.add(t);
      byCluster[c].files.add(r.file);
    }
  }

  if (argv.includes('--json')) {
    console.log(JSON.stringify({
      scope: SCOPE,
      total: files.length,
      portable: of('portable').length,
      soft: of('soft').length,
      hard: of('HARD').length,
      movable: movable.length,
      blocked: blocked.length,
      provenTargets: proven.size,
      clusters: Object.fromEntries(Object.entries(byCluster).map(
        ([k, v]) => [k, { files: v.files.size, targets: [...v.targets].sort() }])),
      hardFiles: of('HARD').map((r) => ({ file: r.file, anchors: r.hard }))
    }, null, 2));
    return;
  }

  console.log('\n== crawler-engine extraction endpoint, measured ==');
  console.log(`${files.length} tracked .js files under ${SCOPE}\n`);
  console.log('by their OWN imports:');
  console.log(`  ${String(of('portable').length).padStart(3)} portable   no out-of-scope requires`);
  console.log(`  ${String(of('soft').length).padStart(3)} soft       only on targets an already-extracted file survived`);
  console.log(`  ${String(of('HARD').length).padStart(3)} HARD       reach a surface no completed extraction has resolved`);
  console.log('\nfollowing internal requires TRANSITIVELY — what can actually move:');
  console.log(`  ${String(movable.length).padStart(3)} MOVABLE    whole internal closure is anchor-free`);
  console.log(`  ${String(blocked.length).padStart(3)} blocked    closure reaches a HARD-anchored file`);
  console.log(`\n  (${proven.size} distinct targets proven resolvable by the ${goneCount}-file 2026-08-04 run)`);

  console.log('\nHARD anchors, grouped as the decisions they actually represent:');
  for (const [c, v] of Object.entries(byCluster).sort((a, b) => b[1].files.size - a[1].files.size)) {
    console.log(`  ${String(v.files.size).padStart(3)} files  ${c.padEnd(14)} ${[...v.targets].slice(0, 3).join(', ')}${v.targets.size > 3 ? `, +${v.targets.size - 3} more` : ''}`);
  }

  const dyn = rows.filter((r) => r.dynamic).length;
  if (dyn) console.log(`\n  ${dyn} file(s) contain a computed require() this cannot classify — not guessed at.`);

  console.log('\nZero is NOT known to be reachable. TECH-ENGINESPLIT gates on `atMost: 0`;');
  console.log('whether the composition root and the app-side intelligence seam should');
  console.log('leave at all is a boundary decision — see docs/decisions/, DEC-ENGINE-BOUNDARY.');

  if (argv.includes('--files')) {
    console.log('\nHARD-anchored files:');
    for (const r of of('HARD').sort((a, b) => b.hard.length - a.hard.length)) {
      console.log(`  ${r.file}\n        -> ${r.hard.join(', ')}`);
    }
  }
}

if (require.main === module) main();

module.exports = {
  requiresOf, classifyRequire, outboundTargets, hasDynamicRequire,
  classifyFile, clusterOf, resolveInternal, movableSet
};
