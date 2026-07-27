#!/usr/bin/env node
'use strict';

/**
 * ui-check-inventory.js — classify the UI self-test corpus by WHAT IT CAN SEE (RB-009).
 *
 * RB-009 asked whether agents can autonomously "observe data shape → generate jsgui3
 * components → self-test in a headless browser". Measuring the tree first (cycle 133)
 * answered a different and more useful question than the one posed:
 *
 *   · the self-test half is the most-invested part of the UI codebase, not a gap
 *   · the GENERATE half does not exist — every page was hand-built, zero generators
 *   · "in a headless browser" is the rare case, and that is where the risk lives
 *
 * The classification matters because of a defect that actually shipped. In cycle 128.5
 * the project-status page served SSR HTML frozen at server start while its own API
 * returned current data; the client silently repaired the DOM, so the page LOOKED
 * right. An in-process check — render the page object, assert substrings — cannot see
 * that class of defect by construction: it never runs the client, so it cannot observe
 * activation, fetch-on-activate, or SSR-vs-live divergence. Only opening the real page
 * caught it.
 *
 * So this tool counts what the corpus can actually observe:
 *
 *   live-browser      drives puppeteer/playwright — can see activation and runtime state
 *   activation-aware  reasons about client activation in-process (better than nothing,
 *                     still not a running client)
 *   in-process        render + string assertions: blind to everything the client does
 *
 * `--min-live N` is a no-regression floor, not an aspiration: it exists so the handful
 * of browser-driving checks cannot quietly drop to zero. Raising it is a decision to
 * make deliberately, the same way ncdb-debt-ratchet is lowered deliberately.
 *
 *   node tools/dev/ui-check-inventory.js
 *   node tools/dev/ui-check-inventory.js --json
 *   node tools/dev/ui-check-inventory.js --min-live 4
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const UI_DIR = path.join(ROOT, 'src', 'ui');

const BROWSER_SIGNALS = ['puppeteer', 'playwright'];
const ACTIVATION_SIGNALS = ['activate(', '__active', 'data-jsgui-type'];

/** Classify one check's source. Comments are stripped: a check that only TALKS about
 *  puppeteer in a header comment cannot drive a browser (the c126 docs-as-data trap). */
function classify(source) {
  const code = String(source)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  if (BROWSER_SIGNALS.some((s) => code.includes(s))) return 'live-browser';
  if (ACTIVATION_SIGNALS.some((s) => code.includes(s))) return 'activation-aware';
  return 'in-process';
}

/** Recursively collect *.check.js under a directory (node_modules excluded). */
function findChecks(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) findChecks(full, out);
    else if (e.isFile() && e.name.endsWith('.check.js')) out.push(full);
  }
  return out;
}

function inventory(rootDir = UI_DIR) {
  const files = findChecks(rootDir).sort();
  const rows = files.map((f) => {
    const src = fs.readFileSync(f, 'utf8');
    return {
      file: path.relative(ROOT, f).replace(/\\/g, '/'),
      kind: classify(src),
      lines: src.split('\n').length
    };
  });
  const by = (k) => rows.filter((r) => r.kind === k);
  return {
    total: rows.length,
    totalLines: rows.reduce((a, r) => a + r.lines, 0),
    liveBrowser: by('live-browser'),
    activationAware: by('activation-aware'),
    inProcess: by('in-process'),
    rows
  };
}

function main() {
  const inv = inventory();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(inv, null, 2));
  } else {
    const pct = (n) => (inv.total ? Math.round((n / inv.total) * 100) : 0);
    console.log(`UI self-test corpus: ${inv.total} checks, ${inv.totalLines.toLocaleString()} lines\n`);
    console.log(`  live-browser      ${String(inv.liveBrowser.length).padStart(3)}  (${pct(inv.liveBrowser.length)}%)  can observe activation + runtime state`);
    console.log(`  activation-aware  ${String(inv.activationAware.length).padStart(3)}  (${pct(inv.activationAware.length)}%)  reasons about the client in-process`);
    console.log(`  in-process        ${String(inv.inProcess.length).padStart(3)}  (${pct(inv.inProcess.length)}%)  render + string assertions only`);
    const blind = inv.total - inv.liveBrowser.length;
    console.log(`\n  ${blind}/${inv.total} (${pct(blind)}%) cannot observe what the client does — the cycle-128.5 defect class`);
    console.log('  (SSR frozen at publish while the client silently repairs the DOM: the page looks right to any string assertion)\n');
    for (const r of inv.liveBrowser) console.log(`  browser: ${r.file}`);
  }

  const i = process.argv.indexOf('--min-live');
  if (i >= 0 && process.argv[i + 1]) {
    const floor = Number(process.argv[i + 1]);
    if (inv.liveBrowser.length < floor) {
      console.log(`\n❌ live-browser checks ${inv.liveBrowser.length} < floor ${floor} — browser coverage regressed.`);
      process.exit(1);
    }
    console.log(`✅ live-browser checks ${inv.liveBrowser.length} >= floor ${floor}.`);
  }
}

module.exports = { classify, findChecks, inventory };
if (require.main === module) main();
