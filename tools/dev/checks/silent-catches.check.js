#!/usr/bin/env node
'use strict';

/**
 * silent-catches.check.js — the ratchet for BARE silent catches
 * (DEBT plan item; built cycle 197 after the class produced or hid FOUR
 * production defects: deepUrlAnalysis swallowed the broken recordUrlAlias
 * for months; the classifier's ENOENT fallback served 4% of its keyword
 * base; the Readability failure fell silently to a lesser extractor; and
 * swallowed hierarchy WRITES in the Cities ingestor were one db-drift away
 * from the same fate).
 *
 * THE LINE THIS DRAWS: a silent catch WITH a comment is a reviewed decision
 * ("/* best-effort *​/", "// worker gone") and is legal. A BARE `catch (_) {}`
 * is an unreviewed swallow — nobody decided anything. This counts the bare
 * ones, both repos, and ratchets DOWN: convert each to either a loud warn
 * (if failure matters) or a commented decision (if it truly does not).
 *
 * Scope: src/ + tools/ (copilot), src/ (engine); tests excluded (test
 * teardown swallows are their own idiom).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const REPOS = [
  { name: 'copilot', root: ROOT, dirs: ['src', 'tools'] },
  { name: 'engine', root: path.join(ROOT, '..', 'news-crawler-itself'), dirs: ['src'] }
];

function* walk(dir) {
  let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of es) {
    // c203: 'archive' excluded — archived files never execute, so their
    // swallows can't hide live failures; counting them is permanent noise.
    // (Surfaced when c202's UTF-16→UTF-8 conversion of an archived manual
    // test made 38 previously-scanner-invisible bare catches countable.)
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '__tests__' || e.name === 'archive') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && e.name.endsWith('.js') && !e.name.endsWith('.test.js')) {
      // c206: a .js.map sibling marks a BUILT bundle (esbuild output) —
      // annotating generated code is wiped by the next build, and its
      // catches replicate source-level ones counted at their real homes.
      try { if (fs.existsSync(p + '.map')) continue; } catch { /* count it */ }
      yield p;
    }
  }
}

const CATCH_RE = /catch\s*(\([^)]*\))?\s*\{/g;

function silentBody(src, braceOpenIdx) {
  let depth = 1;
  let i = braceOpenIdx + 1;
  const start = i;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
    if (i - start > 400) return null;
  }
  return src.slice(start, i - 1);
}

function main() {
  const bare = [];
  for (const repo of REPOS) {
    for (const dir of repo.dirs) {
      for (const file of walk(path.join(repo.root, dir))) {
        const src = fs.readFileSync(file, 'utf8');
        let m; CATCH_RE.lastIndex = 0;
        while ((m = CATCH_RE.exec(src)) !== null) {
          const body = silentBody(src, m.index + m[0].length - 1);
          if (body === null) continue;
          const stripped = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').trim();
          if (stripped !== '') continue; // has code — not silent
          const hasComment = /\/\/|\/\*/.test(body);
          if (!hasComment) {
            const line = src.slice(0, m.index).split(/\r?\n/).length;
            bare.push(`${repo.name}/${path.relative(repo.root, file).replace(/\\/g, '/')}:${line}`);
          }
        }
      }
    }
  }
  return bare;
}

// Baseline measured cycle 197 after loud-ening the Cities ingestor's three.
// Lower by converting bare swallows to loud warns or commented decisions;
// never by deleting the catch without reading what it guards.
//
// 103 -> 97 (cycle 232): the drop was incidental, from files retired in
// earlier cycles rather than from any conversion. Banked because it is real.
//
// AND THE TAIL WAS READ, cycle 232 — read this before spending a cycle on it.
// The remaining bare catches in LIVE code (tests excluded) are dominated by
// two shapes where swallowing is correct or near-correct:
//
//   teardown   db.close(), controller.abort(), res.end(), unwatchFile(),
//              pool.shutdown(), fs.closeSync() — a failure while closing must
//              not mask the error that caused the close
//   logging    PlanArbitrator/DecisionLogger wrap logger.warn/error/log; a
//              logger that throws would take down the thing it reports on
//
// That is NOT the class that produced the known defects. Cycle 230's case was
// a catch around a PRIMARY OPERATION with a silent fallback: three separate
// errors in one gazetteer query all landed in one catch, and the plugin served
// a hardcoded list for months looking healthy. The distinguishing question is
// "does this catch wrap the work, or the cleanup?" — only the first hides
// defects.
//
// So this number is now a no-regression guard, not a backlog. A NEW bare catch
// is still worth flagging; grinding the existing 97 down is not where defects
// are.
const CEILING = Number(process.argv.includes('--ceiling') ? process.argv[process.argv.indexOf('--ceiling') + 1] : 97);

const bare = main();
console.log(`silent-catches: ${bare.length} BARE (uncommented) silent catches, both repos (ceiling ${CEILING}); commented swallows are reviewed decisions and not counted`);
if (bare.length < CEILING) {
  console.log(`NOTE: ${CEILING - bare.length} under ceiling — lower CEILING to ${bare.length} to bank.`);
}
if (bare.length > CEILING) {
  console.error('FAIL: new bare silent swallows appeared:');
  for (const b of bare.slice(0, 20)) console.error('  ' + b);
  process.exit(1);
}
process.exit(0);
