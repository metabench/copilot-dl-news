#!/usr/bin/env node
'use strict';

/**
 * delegation-bindings.check.js — an UNWRAPPED binding against a bag export.
 *
 *     const CheckpointManager = require('news-crawler-itself/crawl-control');
 *                                        ^ exports { CheckpointManager, ... }
 *
 * `CheckpointManager` is now the whole object. Nothing throws at require time.
 * It fails later, at `new CheckpointManager(...)`.
 *
 * WHY THIS EXISTS, and why the test suite is not enough. The shape bit twice on
 * 2026-08-11, during the extraction of the crawler engine into
 * news-crawler-itself. Both times a submodule that exported its class DIRECTLY
 * (module.exports = X) was re-pointed at a package entry that exports a NAMED
 * BAG, and the binding form was carried over unchanged.
 *
 * The second time it landed in production code, at
 * src/core/crawler/CrawlerServiceWiring.js:387, one line above a catch that only
 * warns:
 *
 *     const adapter = NewAbstractionsAdapter.create(crawler, {...});
 *     ...
 *     catch (err) { console.warn('...failed to initialize:', err.message); }
 *
 * So the adapter would have silently never initialised. This was not a guess:
 * the binding was deliberately re-broken and
 * tests/unit/crawler/CrawlerServiceWiring.test.js STILL PASSED, 1/1. entry-loads
 * passes too — the require resolves fine; only the USE is wrong. Nothing else in
 * the tree can see this.
 *
 * WHAT IT CHECKS. Every `const X = require('<sibling pkg>[/sub]')` in tracked
 * .js, where the binding is a single identifier rather than a destructure. It
 * loads the module and asks: is the module itself the thing X is meant to be, or
 * is X merely one of its keys? The latter is the defect.
 *
 * Deliberately NOT flagged: destructured bindings (correct by construction), and
 * a module whose export IS a function or class (the unwrapped form is right).
 *
 * Exit 0 = clean. Exit 1 = at least one unwrapped binding onto a bag.
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SIBLING = /^(news-crawler-db|news-crawler-itself)(\/|$)/;

// --- pure core ---------------------------------------------------------------

/**
 * Unwrapped single-identifier requires of a sibling package.
 * Returns [{ name, spec, line }]. A destructure never matches, by design.
 */
function unwrappedBindings(body) {
  const out = [];
  const re = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*(['"])([^'"]+)\2\s*\)/g;
  let m;
  while ((m = re.exec(body))) {
    if (!SIBLING.test(m[3])) continue;
    out.push({ name: m[1], spec: m[3], line: body.slice(0, m.index).split('\n').length });
  }
  return out;
}

/**
 * Is `binding` wrong for this module?
 * Wrong when the module is a plain object that HAS a key of that name — the
 * author meant the key and bound the bag.
 */
function isMisbound(mod, name) {
  if (typeof mod === 'function') return false;          // module IS the thing
  if (!mod || typeof mod !== 'object') return false;
  return Object.prototype.hasOwnProperty.call(mod, name);
}

// --- I/O ---------------------------------------------------------------------

function main() {
  const files = execFileSync('git', ['ls-files', '*.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\n').map((s) => s.trim()).filter(Boolean);

  const findings = [];
  let scanned = 0;
  for (const f of files) {
    let body;
    try { body = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (_) {
      // Reviewed swallow: a tracked path we cannot read contributes no bindings.
      continue;
    }
    const bindings = unwrappedBindings(body);
    if (!bindings.length) continue;
    const req = Module.createRequire(path.join(ROOT, f));
    for (const b of bindings) {
      scanned++;
      let mod;
      try { mod = req(b.spec); } catch (_) {
        // Reviewed swallow: an unresolvable specifier is phantom-test-edges' and
        // entry-loads' job. Reporting it here too would double-count.
        continue;
      }
      if (isMisbound(mod, b.name)) findings.push({ file: f, ...b });
    }
  }

  console.log(`delegation-bindings: ${scanned} unwrapped sibling-package binding(s) checked`);
  if (!findings.length) {
    console.log('             none binds a named bag as if it were the export itself');
    return;
  }
  console.error(`FAIL: ${findings.length} binding(s) take the whole module where a key was meant:`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  const ${f.name} = require('${f.spec}')`);
    console.error(`      that module EXPORTS ${f.name} — write: const { ${f.name} } = require('${f.spec}')`);
  }
  console.error('This does not throw at require time. It throws at first use, and where the');
  console.error('call site is wrapped in a catch that only warns, it throws nowhere at all.');
  process.exit(1);
}

if (require.main === module) main();

module.exports = { unwrappedBindings, isMisbound };
