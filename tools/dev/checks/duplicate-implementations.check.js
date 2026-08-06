#!/usr/bin/env node
'use strict';

/**
 * duplicate-implementations.check.js — find one job implemented in N places,
 * and say how many of the N anything can actually reach.
 *
 *   node tools/dev/checks/duplicate-implementations.check.js
 *   node tools/dev/checks/duplicate-implementations.check.js --json
 *   node tools/dev/checks/duplicate-implementations.check.js --max 30
 *
 * WHY. Two clusters of this were found BY ACCIDENT, one cycle apart:
 *
 *   cycle 214  three implementations of gazetteer deduplication, surfaced only
 *              because tsc complained about a duplicate `mergeDuplicatePlaces`
 *              identifier. They carry three DIFFERENT scoring policies and pick
 *              different survivors — measured in c228 at 38.7% divergence.
 *   cycle 226  three implementations of page categorisation, NONE of them
 *              wired, surfaced only by reading files during an unrelated audit.
 *
 * Accident is not a strategy. This looks for the same signal that caught the
 * first one — a symbol name exported by more than one module — and adds the
 * question that made both findings matter: how many of them are LIVE?
 *
 * ============================================================================
 * THIS APPROACH FAILED ITS OWN ACCEPTANCE TEST (cycle 231). READ BEFORE
 * REBUILDING IT.
 * ============================================================================
 *
 * The test is simple: does it find the two clusters we already know about?
 * It finds NEITHER.
 *
 *   mergeDuplicatePlaces  reported as "2 implementations" — but both are ncdb,
 *                         the access module and the barrel that re-exports it.
 *                         The actual three-way dedup cluster is invisible,
 *                         because its siblings are named `findDuplicates` and
 *                         `mergeDuplicates` and each is exported once.
 *   detectPageCategories  not reported at all, as predicted: the three page
 *                         categorisation implementations use three different
 *                         names.
 *
 * And what it DOES report is 1,841 clusters of noise, in three flavours, all
 * confirmed by reading:
 *
 *   barrels        a module and its index re-export the same name, so one
 *                  implementation counts as two (or four, across two repos)
 *   shims          src/data/db/sqlite/urlHelpers.js "implements" ensureUrlId
 *                  by re-exporting ncdb's — the delegation working as designed
 *   coincidence    29 CLI scripts each export `parseArgs`
 *
 * The first run also reported six "zero reachable" clusters that were entirely
 * false: per-script `migrate`/`createTable` entry points invoked BY PATH
 * (c209/c227), and jsgui3 TYPE DECLARATIONS in two .d.ts files. Those
 * exclusions are in walk() now, and removing them still leaves the tool
 * unable to do its job.
 *
 * WHY IT CANNOT WORK AS BUILT. Name overlap is the wrong signal. The two real
 * clusters shared a JOB, not a name — and the one time a name did collide
 * (c214's mergeDuplicatePlaces), tsc had already reported it for free. This
 * needs semantic clustering — same tables, same verbs, similar shape — which
 * is a much larger tool than a name index.
 *
 * DELIBERATELY NOT REGISTERED AS A PROBE. A ratchet over 1,841 meaningless
 * clusters would be precisely the broken instrument cycle 227 warned about:
 * a number nobody can move for a reason nobody can act on. It is kept as a
 * diagnostic, and as a record that this approach was tried and why it fell
 * short, so a later cycle does not rebuild it expecting different results.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

const SEARCH_ROOTS = [
  path.join(ROOT, 'src'),
  path.join(ROOT, 'tools'),
  path.resolve(ROOT, '..', 'news-crawler-db', 'src')
];

// Names so generic that sharing one says nothing about sharing a job.
const GENERIC = new Set([
  'main', 'run', 'init', 'start', 'stop', 'create', 'build', 'get', 'set',
  'load', 'save', 'parse', 'format', 'render', 'handler', 'default', 'index',
  'setup', 'teardown', 'register', 'connect', 'close', 'open', 'read', 'write',
  'update', 'remove', 'add', 'list', 'find', 'query', 'execute', 'process',
  'validate', 'normalize', 'sanitize', 'toJSON', 'toString', 'clone', 'equals'
]);

// --- pure core ---------------------------------------------------------------

/**
 * Exported symbol names in one module's source.
 * Covers `module.exports = { a, b }`, `exports.a =`, `export { a, b }`,
 * `export function a`, `export class A`, `export const a`.
 */
function extractExportedNames(text) {
  const src = String(text || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  const names = new Set();

  // module.exports = { a, b, c: d }
  const cjsBlock = /module\.exports\s*=\s*\{([\s\S]*?)\}/g;
  let m;
  while ((m = cjsBlock.exec(src))) {
    for (const part of m[1].split(',')) {
      const key = /^\s*([A-Za-z_$][\w$]*)\s*(?::|$)/.exec(part);
      if (key) names.add(key[1]);
    }
  }
  // exports.foo = / module.exports.foo =
  const cjsProp = /(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = cjsProp.exec(src))) names.add(m[1]);

  // export { a, b as c }
  const esmBlock = /export\s*\{([^}]*)\}/g;
  while ((m = esmBlock.exec(src))) {
    for (const part of m[1].split(',')) {
      const as = /\bas\s+([A-Za-z_$][\w$]*)\s*$/.exec(part);
      if (as) { names.add(as[1]); continue; }
      const plain = /^\s*([A-Za-z_$][\w$]*)\s*$/.exec(part);
      if (plain) names.add(plain[1]);
    }
  }
  // export function / class / const / let / var
  const esmDecl = /export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = esmDecl.exec(src))) names.add(m[1]);

  return [...names].filter((n) => !GENERIC.has(n));
}

/**
 * Given [{ file, names, reachable }], return the name clusters exported by
 * more than one module, each annotated with how many are reachable.
 */
function clusterByName(modules) {
  const byName = new Map();
  for (const mod of modules) {
    for (const name of mod.names) {
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(mod);
    }
  }
  const clusters = [];
  for (const [name, mods] of byName) {
    if (mods.length < 2) continue;
    const live = mods.filter((m) => m.reachable).length;
    clusters.push({ name, count: mods.length, live, files: mods.map((m) => m.file) });
  }
  // Most alarming first: many implementations, few live.
  return clusters.sort((a, b) => (b.count - a.count) || (a.live - b.live) || (a.name < b.name ? -1 : 1));
}

// --- I/O ---------------------------------------------------------------------

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir); } catch (_) { return out; }
  for (const name of entries) {
    if (['node_modules', '.git', 'dist', 'tmp'].includes(name)) continue;
    const full = path.join(dir, name);
    let st;
    try { st = fs.statSync(full); } catch (_) { continue; }
    // This check's own tests embed export blocks as fixtures — c230's check
    // reported its own fixtures on first run, so exclude tests up front.
    // Excluded, each for a measured reason from the first run:
    //   __tests__      — c230's check reported its own fixtures
    //   *.d.ts         — type DECLARATIONS are not implementations. The first
    //                    run's "zero reachable" list was mostly jsgui3 types
    //                    (Page_Context, Text_Node, Blank_HTML_Document)
    //                    declared in two .d.ts files.
    //   tools/migrations — every migration script exports its own `migrate`
    //                    and `createTable` and is invoked BY PATH. They are
    //                    entry points, not competing implementations (c209/
    //                    c227: never call an entry point dead on name evidence).
    if (st.isDirectory()) {
      if (name === '__tests__' || name === 'migrations') continue;
      walk(full, out);
    } else if (/\.(js|ts)$/.test(name)
      && !/\.(test|check)\.(js|ts)$/.test(name)
      && !/\.d\.ts$/.test(name)) out.push(full);
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const maxIdx = argv.indexOf('--max');
  const max = maxIdx >= 0 ? Number(argv[maxIdx + 1]) : null;

  const files = SEARCH_ROOTS.flatMap((r) => walk(r));
  const texts = new Map();
  for (const f of files) {
    try { texts.set(f, fs.readFileSync(f, 'utf8')); } catch (_) {}
  }
  const corpus = [...texts.values()].join('\n');

  const modules = [];
  for (const [file, text] of texts) {
    const names = extractExportedNames(text);
    if (!names.length) continue;
    const base = path.basename(file).replace(/\.[^.]+$/, '');
    // Reachable = some OTHER file mentions this module's basename. Coarse, but
    // it is the same test the c227 ui audit used, and its weakness (a module
    // reached only by a dynamic path) errs toward calling things live.
    const others = [...texts.entries()].filter(([g]) => g !== file);
    const reachable = others.some(([, t]) => t.includes(base));
    modules.push({ file: path.relative(ROOT, file).replace(/\\/g, '/'), names, reachable });
  }

  const clusters = clusterByName(modules);
  const noneLive = clusters.filter((c) => c.live === 0);

  if (asJson) {
    console.log(JSON.stringify({ total: clusters.length, noneLive: noneLive.length, max, clusters }, null, 2));
  } else {
    console.log('\n== duplicate-implementations census ==');
    console.log(`${modules.length} exporting modules scanned; ${clusters.length} symbol name(s) exported by more than one module.`);
    console.log(`${noneLive.length} of those clusters have NO reachable implementation at all.\n`);
    for (const c of clusters.slice(0, 25)) {
      console.log(`  ${c.name}  — ${c.count} implementations, ${c.live} reachable`);
      for (const f of c.files) console.log(`      ${f}`);
    }
    if (clusters.length > 25) console.log(`  … and ${clusters.length - 25} more`);
    console.log('\nA name exported twice is not automatically a defect — but every');
    console.log('duplicate-implementation cluster found so far (gazetteer dedup, page');
    console.log('categorisation) carried DIFFERENT behaviour behind the same intent.');
    console.log('Clusters where few or none are reachable are the ones to read first.');
    console.log('\nThis sees NAME collisions only. Three implementations under three');
    console.log('different names — the c226 page-categorisation cluster — are invisible here.');
  }

  if (max != null && clusters.length > max) {
    console.error(`\nCHECK FAILED: ${clusters.length} duplicate-name clusters > ceiling ${max}.`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { extractExportedNames, clusterByName, GENERIC };
