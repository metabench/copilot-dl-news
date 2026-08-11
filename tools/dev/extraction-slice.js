#!/usr/bin/env node
'use strict';

/**
 * extraction-slice.js — the two steps of the extraction protocol that were only
 * ever scratch scripts.
 *
 *   node tools/dev/extraction-slice.js --plan budget checkpoint concurrency
 *   node tools/dev/extraction-slice.js --fingerprint <path-or-specifier>
 *
 * WHY THIS EXISTS. The protocol is written into the engine-debt ceiling comment
 * and six commit messages: scan for a clean cut, see what the set drags along,
 * check for `soft` members, fingerprint before and diff after. Every slice on
 * 2026-08-11 followed it — using throwaway scripts in a session scratchpad. The
 * instructions outlived the tools, which is the same rot as a plan index that
 * describes work it no longer tracks.
 *
 * It is DELIBERATELY NOT A PROBE. There is nothing here to guard; it is a
 * planning aid. The 2026-08-09 review's F3 is about instruments accreting faster
 * than they earn their keep, and one more ratchet would be exactly that.
 *
 * WHAT --plan ANSWERS, in the order the protocol asks:
 *   1. what leaves — the named dirs plus everything their closure DRAGS along
 *   2. is any member HARD (cannot leave at all)
 *   3. is any member `soft` — out-of-scope require that must be resolved as part
 *      of the move. `soft` is evidence the dependency CLASS is resolvable, never
 *      that the require survives relocation. That distinction cost a file:
 *      operations/sequenceContext.js came back out of a slice because its src/db
 *      require wants getDb from the monorepo's own db layer.
 *   4. every crossing edge that will need re-pointing, from anywhere in the repo
 *
 * WHAT --fingerprint ANSWERS. A module's public surface: export names and kinds,
 * function arity, class prototype methods with arity, statics. Take it before
 * the move and after, and diff. It catches a lost export, a dropped method, a
 * changed signature, a class that became a plain object. It does NOT catch a
 * changed method body — that is what the re-pointed suites are for, and both
 * halves were used on every slice.
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const SCOPE = 'src/core/crawler';
const BEFORE_EXTRACTION = '5eae412e~1';

const {
  requiresOf, classifyRequire, outboundTargets, classifyFile, resolveInternal, needsRepoint
} = require('./extraction-endpoint');

const git = (a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });

// --- fingerprint --------------------------------------------------------------

/**
 * Structural description of one value. Depth-limited so a module holding a large
 * config object does not produce an unreadable diff.
 */
function describe(v, depth = 0) {
  const t = typeof v;
  if (v === null) return 'null';
  if (t !== 'function' && t !== 'object') return t;
  if (t === 'function') {
    const proto = v.prototype;
    const methods = proto
      ? Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor').sort().map((n) => {
        const d = Object.getOwnPropertyDescriptor(proto, n);
        if (d && typeof d.value === 'function') return `${n}/${d.value.length}`;
        if (d && (d.get || d.set)) return `${n}:accessor`;
        return n;
      })
      : [];
    const statics = Object.getOwnPropertyNames(v)
      .filter((n) => !['length', 'name', 'prototype'].includes(n)).sort();
    return methods.length || statics.length
      ? `class(${v.length}){proto:[${methods.join(',')}],static:[${statics.join(',')}]}`
      : `function/${v.length}`;
  }
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (depth > 1) return 'object';
  return `{${Object.keys(v).sort().map((k) => `${k}:${describe(v[k], depth + 1)}`).join(',')}}`;
}

function fingerprint(mod) {
  const out = {};
  for (const k of Object.keys(mod).sort()) out[k] = describe(mod[k]);
  return out;
}

// --- plan ---------------------------------------------------------------------

function buildGraph() {
  const files = git(['ls-tree', '-r', '--name-only', 'HEAD', '--', SCOPE])
    .split('\n').map((s) => s.trim()).filter((s) => s.endsWith('.js'));
  const set = new Set(files);

  const proven = new Set();
  const goneSince = git(['ls-tree', '-r', '--name-only', BEFORE_EXTRACTION, '--', SCOPE])
    .split('\n').map((s) => s.trim()).filter((s) => s.endsWith('.js') && !set.has(s));
  for (const f of goneSince) {
    let b;
    try { b = git(['show', `${BEFORE_EXTRACTION}:${f}`]); } catch (_) {
      // Reviewed swallow: a path absent from that tree contributes no evidence.
      continue;
    }
    for (const o of outboundTargets(b, f)) proven.add(o);
  }

  const graph = new Map();
  for (const f of files) {
    const body = git(['show', `HEAD:${f}`]);
    const deps = [];
    for (const t of requiresOf(body)) {
      if (classifyRequire(t, f) !== 'internal') continue;
      const hit = resolveInternal(f, t, set);
      if (hit) deps.push(hit);
    }
    const outs = outboundTargets(body, f);
    graph.set(f, { deps, outs, kind: classifyFile(outs, proven).kind });
  }
  return { files, set, graph };
}

function plan(dirNames) {
  const dirs = dirNames.map((d) => (d.startsWith(SCOPE) ? d : `${SCOPE}/${d}`));
  const { graph } = buildGraph();

  const seeds = [...graph.keys()].filter((f) => dirs.some((d) => f === d || f.startsWith(d + '/')));
  if (!seeds.length) {
    console.error(`no tracked .js under: ${dirs.join(', ')}`);
    process.exit(2);
  }
  const reached = new Set();
  const walk = (f) => { if (reached.has(f)) return; reached.add(f); for (const d of graph.get(f)?.deps || []) walk(d); };
  seeds.forEach(walk);

  const seedSet = new Set(seeds);
  const dragged = [...reached].filter((f) => !seedSet.has(f)).sort();
  const leaving = new Set([...seeds, ...dragged]);
  const hard = [...leaving].filter((f) => graph.get(f)?.kind === 'HARD');
  const soft = needsRepoint([...leaving], graph);

  const rel = (f) => path.posix.relative(SCOPE, f);
  console.log(`\n${dirs.length} dir(s) -> ${seeds.length} seed + ${dragged.length} dragged = ${leaving.size} leaving\n`);

  if (dragged.length) {
    console.log('DRAGGED ALONG (their closure needs them):');
    for (const d of dragged) console.log(`  ${rel(d)}`);
    console.log('');
  }
  if (hard.length) {
    console.log('*** HARD IN SET — THIS CUT IS NOT POSSIBLE AS SPECIFIED:');
    for (const h of hard) console.log(`  ${rel(h)}`);
    console.log('');
  }
  if (soft.length) {
    console.log('SOFT — out-of-scope require MUST be resolved as part of the move:');
    for (const s of soft) console.log(`  ${rel(s.file)}  ->  ${s.targets.join(', ')}`);
    console.log('');
  } else {
    console.log('SOFT: none — no member carries an out-of-scope require.\n');
  }

  // Crossings, repo-wide: anything not leaving that requires something that is.
  const all = git(['ls-files', '*.js']).split('\n').map((s) => s.trim()).filter(Boolean);
  const tracked = new Set(all);
  const byFrom = {};
  for (const f of all) {
    if (leaving.has(f)) continue;
    let body;
    try { body = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (_) {
      // Reviewed swallow: an unreadable tracked path issues no requires.
      continue;
    }
    const re = /require\(\s*(['"])([^'"]+)\1\s*\)/g;
    let m;
    while ((m = re.exec(body))) {
      if (!m[2].startsWith('.')) continue;
      const abs = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[2]));
      const hit = [abs, abs + '.js', abs + '/index.js'].find((c) => tracked.has(c));
      if (hit && leaving.has(hit)) {
        (byFrom[f] = byFrom[f] || []).push({ spec: m[2], to: hit, line: body.slice(0, m.index).split('\n').length });
      }
    }
  }
  const n = Object.values(byFrom).reduce((a, v) => a + v.length, 0);
  console.log(`CROSSINGS TO RE-POINT: ${n} in ${Object.keys(byFrom).length} file(s)`);
  for (const [f, cs] of Object.entries(byFrom).sort()) {
    console.log(`  ${f}`);
    for (const c of cs) console.log(`      :${c.line}  '${c.spec}'  -> ${rel(c.to)}`);
  }
  console.log('\nAfter re-pointing, run tools/dev/checks/delegation-bindings.check.js —');
  console.log('an unwrapped binding onto a bag export resolves fine and fails only at use.');
}

// --- I/O ----------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--fingerprint');
  if (i >= 0) {
    const target = argv[i + 1];
    if (!target) { console.error('--fingerprint needs a module path or specifier'); process.exit(2); }
    const resolved = target.startsWith('.') || path.isAbsolute(target) ? path.resolve(target) : target;
    console.log(JSON.stringify(fingerprint(require(resolved)), null, 1));
    return;
  }
  const j = argv.indexOf('--plan');
  if (j >= 0) {
    const dirs = argv.slice(j + 1).filter((a) => !a.startsWith('--'));
    if (!dirs.length) { console.error('--plan needs at least one directory'); process.exit(2); }
    plan(dirs);
    return;
  }
  console.error('usage: extraction-slice.js --plan <dir>... | --fingerprint <module>');
  process.exit(2);
}

if (require.main === module) main();

module.exports = { describe, fingerprint };
