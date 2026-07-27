#!/usr/bin/env node
'use strict';

/**
 * run-probes.js — execute every registered knowledge-verification probe
 * (RB-011: durable claims carry a re-verification command; this RUNS them).
 *
 *   node tools/dev/run-probes.js            # run all applicable, table + exit code
 *   node tools/dev/run-probes.js --json     # machine-readable results
 *   node tools/dev/run-probes.js --id X     # run one probe by id
 *
 * Probes live in tools/dev/probes.json. A probe with needsServer:true is
 * SKIPPED (not failed) when nothing serves :3170 — so a bridge-down / no-app
 * orient still verifies everything server-independent (SSR, tools, guards)
 * rather than reporting false failures. Exit 1 iff a probe that actually RAN
 * failed; skips never fail the run.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST = path.join(__dirname, 'probes.json');

// --- pure core (unit-tested) -------------------------------------------------

// Decide a probe's outcome from its run facts. Kept pure so the skip/fail
// policy is testable without spawning anything.
function classifyResult({ needsServer, serverUp, ran, exitCode, expectExit, timedOut }) {
  if (needsServer && !serverUp) return { status: 'skipped', reason: 'no server on :3170' };
  if (!ran) return { status: 'skipped', reason: 'not selected' };
  if (timedOut) return { status: 'fail', reason: 'timed out' };
  const want = expectExit == null ? 0 : expectExit;
  return exitCode === want
    ? { status: 'pass', reason: `exit ${exitCode}` }
    : { status: 'fail', reason: `exit ${exitCode}, expected ${want}` };
}

function summarize(results) {
  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  return { pass, fail, skipped, total: results.length, ok: fail === 0 };
}

// --- I/O ---------------------------------------------------------------------

function serverUp(port, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/v1/crawl/jobs', timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const idIdx = argv.indexOf('--id');
  const onlyId = idIdx >= 0 ? argv[idIdx + 1] : null;

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch (err) {
    console.error('cannot read probes.json:', err.message);
    process.exit(2);
  }
  const probes = (manifest.probes || []).filter((p) => !onlyId || p.id === onlyId);
  const up = await serverUp(3170, 4000);

  const results = [];
  for (const p of probes) {
    let ran = false, exitCode = null, timedOut = false;
    if (!(p.needsServer && !up)) {
      ran = true;
      const r = spawnSync(p.cmd, p.args, { cwd: ROOT, timeout: p.timeoutMs || 30000, encoding: 'utf8', windowsHide: true });
      timedOut = r.error && r.error.code === 'ETIMEDOUT';
      exitCode = timedOut ? null : (r.status == null ? 1 : r.status);
    }
    const outcome = classifyResult({ needsServer: p.needsServer, serverUp: up, ran, exitCode, expectExit: p.expectExit, timedOut });
    results.push({ id: p.id, description: p.description, ...outcome });
  }

  const summary = summarize(results);
  if (asJson) {
    console.log(JSON.stringify({ serverUp: up, summary, results }, null, 2));
  } else {
    console.log(`\n== RB-011 knowledge probes (server on :3170 = ${up ? 'up' : 'DOWN'}) ==\n`);
    for (const r of results) {
      const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚪';
      console.log(`  ${icon} ${r.id.padEnd(20)} ${r.status.padEnd(8)} ${r.description}`);
      if (r.status !== 'pass') console.log(`     ${' '.repeat(20)} (${r.reason})`);
    }
    console.log(`\n${summary.pass} passed, ${summary.fail} failed, ${summary.skipped} skipped.`);
  }
  process.exit(summary.ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = { classifyResult, summarize };
