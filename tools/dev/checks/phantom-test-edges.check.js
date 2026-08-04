#!/usr/bin/env node
'use strict';

/**
 * phantom-test-edges.check.js — the zero-ratchet for never-ran tests
 * (DEBT_REDUCTION_PLAN item 1; built cycle 183).
 *
 * WHY: three test suites turned out to have NEVER RUN — each required or
 * jest.mocked a path that did not exist, so the suite failed at module
 * resolution from the day it was written, and nothing noticed until an
 * extraction forced the edge into the light (utils.safeCall c177,
 * milestoneTracker c181, enhanced-features c182 — the last passed 13/13 the
 * moment its paths were fixed). This check finds the whole class at orient
 * time: it resolves EVERY require() and jest.mock() string literal in EVERY
 * test file, in BOTH repos, against the real tree. A phantom edge here is a
 * suite that cannot even load.
 *
 * Zero is the FLOOR this ratchet drives toward. First sweep (cycle 183)
 * measured 18: two were the same cycle's own travelled tests carrying
 * self-name requires — fixed on the spot, the instrument catching its
 * builder — and 16 are pre-existing. Six of those ARE known-51 failing
 * crawler suites (runLegacyCommand, Crawler.test, StagedGazetteerCoordinator
 * .planner, WikidataAdm1Ingestor, OsmBoundaryIngestor, HubSeeder.test):
 * they are not failing tests, they are suites that cannot LOAD — the
 * known-51 triage (DEBT plan item 2) starts with this class. The rest are
 * outside src/core/crawler (schema-path drift ×4, better-sqlite3 ×2,
 * @playwright/test, GraphReasonerPlugin, ConfigManager, ensureDb).
 *
 * Same semantics as engine-debt: over ceiling = fail; under = bank it by
 * lowering CEILING in the same commit. A hit is either a test to resurrect
 * (fix the path, run it, keep what passes honestly) or dead test code to
 * delete deliberately — never something to leave standing.
 *
 * Scope note: only STRING-LITERAL specs are checked. Dynamic requires
 * (template strings, variables) are invisible here and stay the suites' own
 * responsibility.
 */

const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const REPOS = [
  // 'tests' joined cycle 185 (scope widening = deliberate ceiling edit): the
  // ProxyManager/RateLimitTracker phantoms lived there unseen and turned out
  // to be suites that had NEVER RUN (41/41 and 39/39 on first execution once
  // repointed). tmp/ and wip/ stay excluded — scratch trees, not suites.
  { name: 'copilot-dl-news', root: ROOT, dirs: ['src', 'tools', 'tests'] },
  { name: 'news-crawler-itself', root: path.join(ROOT, '..', 'news-crawler-itself'), dirs: ['src'] }
];

const BUILTINS = new Set(builtinModules.concat(builtinModules.map((m) => 'node:' + m)));

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && /\.test\.js$/.test(e.name)) yield p;
  }
}

function specsIn(source) {
  const out = [];
  const re = /(?:require|jest\.mock)\s*\(\s*(['"])([^'"]+)\1/g;
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(lines[i])) !== null) out.push({ spec: m[2], line: i + 1 });
  }
  return out;
}

function resolves(spec, fromDir) {
  if (BUILTINS.has(spec)) return true;
  if (spec.startsWith('.')) {
    const base = path.resolve(fromDir, spec);
    return [base, base + '.js', base + '.json', path.join(base, 'index.js'), path.join(base, 'package.json')]
      .some((c) => fs.existsSync(c));
  }
  try { require.resolve(spec, { paths: [fromDir] }); return true; } catch { return false; }
}

// 16 → 15 (cycle 184): HubSeeder.test's phantom priorityConfig mock
// dissolved by the injection discharge — the predicate is a constructor
// option now, so there is no module path to mistarget. (A new phantom
// appeared and died the same cycle: deleting hubIdentifier.js orphaned its
// test, caught here, travelled to the engine 10/10.)
// 15 → 124 (cycle 185, DELIBERATE SCOPE RAISE): 'tests/' joined the sweep
// after ProxyManager.test and RateLimitTracker.test were found there via
// the src/crawler phantom pattern — both passed (41/41, 39/39) on their
// FIRST EXECUTION EVER once repointed. The wider light shows whole families
// (tests/analysis/** → a src/analysis tree that does not exist) — these are
// a large slice of the repo-wide 460 "failing" tests that in truth cannot
// LOAD. The number rose because the instrument sees more, not because debt
// grew; burn it down by resurrect-or-delete, never by narrowing the light.
// 124 → 123 (cycle 185): Crawler.test's jest.mock retargeted to the package
// subpath — the c179 extraction had repointed the require but not the mock,
// and the suite failed from that day; 26/26 the moment both edges resolved.
// 123 → 49 (cycle 186, the graveyard burn-down): 27 files bulk-repathed to
// the post-reorganization tree (src/analysis→src/intelligence/analysis,
// src/crawler/coordinator→src/core/crawler/coordinator, src/export→
// src/data/export) — 711 of 718 tests pass where ZERO ran before; the
// schema four repointed to ncdb's real export (renamed at the package
// boundary: initSqliteV1GazetteerTables) which ALSO fixed the broken live
// tool import-gazetteer.js; topicAdapter+summaryAdapter resurrected 34/34
// against ncdb root exports; seven orphan suites DELETED deliberately
// (testStudio ×4 — subsystem retired; sdk — never existed; layoutAdapter —
// long-ghosted; schema-sync — tool gone); and the runtime-fixtures pragma
// added after ripple-analysis measured 21/21 — its "phantom" edges were
// fixture files the suite writes before requiring (js-edit same: edit-tool
// input strings are DATA, not edges). The instrument over-counting was
// itself a finding.
const CEILING = 49;

function main() {
  const phantoms = [];
  let files = 0;
  let edges = 0;
  for (const repo of REPOS) {
    for (const dir of repo.dirs) {
      for (const file of walk(path.join(repo.root, dir))) {
        files++;
        const src = fs.readFileSync(file, 'utf8');
        // Suites that WRITE their fixture modules before requiring them (or edit
        // require-strings as DATA) opt out: ripple-analysis 21/21, js-edit measured.
        if (src.includes('phantom-sweep: runtime-fixtures')) continue;
        for (const { spec, line } of specsIn(src)) {
          edges++;
          if (!resolves(spec, path.dirname(file))) {
            phantoms.push(`${repo.name}/${path.relative(repo.root, file).replace(/\\/g, '/')}:${line} → ${spec}`);
          }
        }
      }
    }
  }
  console.log(`phantom-test-edges: ${phantoms.length} unresolvable of ${edges} edges across ${files} test files (both repos; ceiling ${CEILING})`);
  if (phantoms.length < CEILING) {
    console.log(`NOTE: ${CEILING - phantoms.length} under ceiling — lower CEILING to ${phantoms.length} to bank (the ratchet only ratchets if you turn it).`);
  }
  if (phantoms.length > CEILING) {
    console.error('FAIL: these test files cannot even load — resurrect (fix path, run, keep') ;
    console.error('honestly) or delete deliberately. Never leave a phantom standing:');
    for (const p of phantoms) console.error('  ' + p);
    return 1;
  }
  return 0;
}

process.exit(main());
