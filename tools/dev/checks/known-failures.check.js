#!/usr/bin/env node
'use strict';

/**
 * known-failures.check.js — the named-set ratchet for the crawler suite
 * (DEBT_REDUCTION_PLAN item 2; built cycle 184).
 *
 * WHY: "the known 51" lived in agent memory, so a batch-caused regression
 * could hide only as long as someone remembered to name-check a list that
 * was written down nowhere. This pins the exact failing SUITES in
 * known-failures.json, set-shrink-only:
 *   - a failing suite NOT in the registry  → NEW REGRESSION, exit 1
 *   - a registered suite that now passes   → bank it (remove the entry in
 *     the same commit; the registry only shrinks)
 *
 * Two modes:
 *   --quick  (default; what the probe runs): validates the registry parses,
 *            every registered path still exists (a deleted suite must leave
 *            the registry), and prints the count. Does NOT run jest.
 *   --verify (cycle-close cadence): runs the scoped jest suite (~3-4 min),
 *            diffs actual failing suites against the registry, and fails on
 *            any unregistered failure. Run this whenever a cycle touches
 *            src/core/crawler.
 *
 * The registry doubles as the triage ledger: each entry's value is its
 * class ("phantom: <spec>", "env: <what>", "untriaged", ...).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const REGISTRY = path.join(__dirname, 'known-failures.json');

function loadRegistry() {
  const reg = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  if (!reg.suites || typeof reg.suites !== 'object') throw new Error('registry has no suites map');
  return reg;
}

function quick() {
  const reg = loadRegistry();
  const names = Object.keys(reg.suites);
  const gone = names.filter((n) => !fs.existsSync(path.join(ROOT, n)));
  console.log(`known-failures: ${names.length} suites pinned (scope ${reg.scope}); set-shrink-only`);
  if (gone.length) {
    console.error('FAIL: registered suites no longer exist on disk — remove them from the registry:');
    for (const g of gone) console.error('  ' + g);
    return 1;
  }
  return 0;
}

function verify() {
  const reg = loadRegistry();
  console.log(`known-failures --verify: running jest ${reg.scope} (minutes)...`);
  const r = spawnSync('npx', ['jest', reg.scope, '--no-coverage', '--silent'], {
    cwd: ROOT, encoding: 'utf8', shell: true, timeout: 900000, maxBuffer: 64 * 1024 * 1024
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const failing = new Set();
  for (const m of out.matchAll(/^FAIL\s+(\S+)/gm)) failing.add(m[1].replace(/\\/g, '/'));
  const registered = new Set(Object.keys(reg.suites));
  const newRegressions = [...failing].filter((f) => !registered.has(f));
  const banked = [...registered].filter((s) => !failing.has(s));
  console.log(`actual failing: ${failing.size}; registered: ${registered.size}`);
  if (banked.length) {
    console.log('NOTE: these registered suites now PASS — bank by removing from the registry:');
    for (const b of banked) console.log('  ' + b);
  }
  if (newRegressions.length) {
    console.error('FAIL: failing suites NOT in the registry — new regressions:');
    for (const n of newRegressions) console.error('  ' + n);
    return 1;
  }
  return 0;
}

process.exit(process.argv.includes('--verify') ? verify() : quick());
