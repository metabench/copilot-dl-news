#!/usr/bin/env node
'use strict';

/**
 * concurrency-bench.js — measure the effect of crawl concurrency against a local fixture.
 *
 *   node tools/perf/concurrency-bench.js [--reps 3] [--pages 60] [--latency 120] [--conc 1,4]
 *
 * WHY OFFLINE (owner decision #3, 2026-07-26): live publishers gave 1.6x run-to-run
 * variance at IDENTICAL settings, swamping the ~1.3-2x effect. Four cycles of arm
 * rearrangement could not fix that. Here latency and page size are fixed inputs.
 *
 * INSTRUMENT: pages are counted by the FIXTURE ITSELF (its own request counter), not the
 * news DB. That number never touches a timestamp column, so the whole class of bugs that
 * invalidated cycles 8-17 cannot express itself here. The fixture also reports
 * maxInFlight, which DIRECTLY shows whether a concurrency setting took effect at all —
 * a check no earlier cycle had.
 *
 * DEADLOCK TRAP: the crawler is launched with async spawn(), NEVER spawnSync. spawnSync
 * blocks this process's event loop, and since the fixture server lives HERE, it could
 * never answer the child's requests — the run would hang forever.
 *
 * PROTOCOL: reports the instrument's own NOISE FLOOR first (same condition, repeated).
 * A comparison is only reported if the noise is well below the effect.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const { startFixture } = require('./fixture-server');

const ROOT = path.resolve(__dirname, '..', '..');

function arg(name, dflt) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`) || a === `--${name}`);
  if (!hit) return dflt;
  if (hit.includes('=')) return hit.split('=')[1];
  const i = process.argv.indexOf(hit);
  return process.argv[i + 1] ?? dflt;
}

const REPS = Number(arg('reps', 3));
const PAGES = Number(arg('pages', 60));
const LATENCY = Number(arg('latency', 120));
const PAGE_BYTES = Number(arg('page-bytes', 15000));
const CONCS = String(arg('conc', '1,4')).split(',').map(Number);

// Run the crawler once against the fixture; resolve with fixture-measured results.
function runOnce({ fx, concurrency, tmpDir, idx }) {
  return new Promise((resolve) => {
    fx.reset();
    const dbPath = path.join(tmpDir, `bench-${concurrency}-${idx}-${process.pid}.db`);
    // NOT src/crawl.js — that CLI hard-codes the repo-root config and its startUrl wins
    // over any positional URL, so a fixture benchmark silently crawls theguardian.com.
    // See fixture-crawl-runner.js.
    const args = [
      path.join(ROOT, 'tools', 'perf', 'fixture-crawl-runner.js'),
      fx.url, String(concurrency), String(PAGES), dbPath
    ];
    const t0 = Date.now();
    // async spawn — see DEADLOCK TRAP above.
    const child = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env } });
    let stderr = '';
    child.stdout.on('data', () => {});
    child.stderr.on('data', (d) => { stderr += String(d).slice(0, 2000); });
    const kill = setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, 180000);
    child.on('close', (code) => {
      clearTimeout(kill);
      const wallMs = Date.now() - t0;
      const s = fx.stats();
      try { fs.rmSync(dbPath, { force: true }); fs.rmSync(dbPath + '-wal', { force: true }); fs.rmSync(dbPath + '-shm', { force: true }); } catch (_) {}
      resolve({
        concurrency, idx, code, wallMs,
        requests: s.requests, maxInFlight: s.maxInFlight,
        spanMs: s.spanMs,
        // Rate over the fixture's OWN observed span — independent of the crawler's clock.
        rate: s.spanMs > 0 ? (s.requests / (s.spanMs / 1000)) : null,
        stderrHead: stderr.split('\n').filter(Boolean).slice(0, 2).join(' | ')
      });
    });
    child.on('error', () => { clearTimeout(kill); resolve({ concurrency, idx, code: -1, wallMs: 0, requests: 0, maxInFlight: 0, spanMs: 0, rate: null }); });
  });
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const spreadPct = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return m > 0 ? ((Math.max(...xs) - Math.min(...xs)) / m) * 100 : null;
};

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawlbench-'));
  const fx = await startFixture({ latencyMs: LATENCY, pageBytes: PAGE_BYTES, pages: Math.max(PAGES * 4, 200) });
  console.log(`fixture at ${fx.url}  latency=${LATENCY}ms  pageBytes=${PAGE_BYTES}  maxPages=${PAGES}  reps=${REPS}`);
  console.log(`conditions: concurrency ${CONCS.join(' vs ')}\n`);

  const byConc = new Map();
  for (const c of CONCS) byConc.set(c, []);

  // Interleave conditions (c1,c4,c1,c4,...) so any drift affects both equally.
  for (let r = 0; r < REPS; r++) {
    for (const c of CONCS) {
      const res = await runOnce({ fx, concurrency: c, tmpDir, idx: r });
      byConc.get(c).push(res);
      console.log(`  rep${r} conc=${c}: ${String(res.requests).padStart(4)} reqs  ` +
        `maxInFlight=${String(res.maxInFlight).padStart(2)}  span=${(res.spanMs / 1000).toFixed(1)}s  ` +
        `rate=${res.rate ? res.rate.toFixed(2) + '/s' : '?'}  exit=${res.code}` +
        (res.requests === 0 && res.stderrHead ? `  ERR: ${res.stderrHead}` : ''));
    }
  }

  console.log('\n=== RESULTS ===');
  const summary = {};
  for (const c of CONCS) {
    const runs = byConc.get(c).filter((x) => x.rate != null && x.requests > 0);
    if (!runs.length) { console.log(`conc=${c}: NO USABLE RUNS`); summary[c] = null; continue; }
    const rates = runs.map((x) => x.rate);
    const sp = spreadPct(rates);
    summary[c] = { n: runs.length, meanRate: mean(rates), spreadPct: sp, maxInFlight: Math.max(...runs.map(x => x.maxInFlight)), meanReqs: mean(runs.map(x => x.requests)) };
    console.log(`conc=${c}: n=${runs.length}  mean ${mean(rates).toFixed(2)} req/s  ` +
      `spread ${sp != null ? sp.toFixed(1) + '%' : 'n/a'}  maxInFlight ${summary[c].maxInFlight}  ` +
      `mean reqs ${summary[c].meanReqs.toFixed(0)}`);
  }

  // THE INSTRUMENT'S OWN NOISE FLOOR — reported before any comparison is trusted.
  const noise = Math.max(...CONCS.map((c) => (summary[c] && summary[c].spreadPct != null) ? summary[c].spreadPct : 0));
  console.log(`\nINSTRUMENT NOISE FLOOR (worst same-condition spread): ${noise.toFixed(1)}%`);
  console.log(`  live-crawl comparison: 1.6x = 60% variance at identical settings (cycle 17)`);

  const a = summary[CONCS[0]], b = summary[CONCS[CONCS.length - 1]];
  if (a && b) {
    const ratio = b.meanRate / a.meanRate;
    const effectPct = Math.abs(ratio - 1) * 100;
    console.log(`\nEFFECT: conc=${CONCS[CONCS.length - 1]} / conc=${CONCS[0]} = ${ratio.toFixed(2)}x`);
    if (b.maxInFlight <= 1 && CONCS[CONCS.length - 1] > 1) {
      console.log('  !! maxInFlight<=1 for the high-concurrency arm — the setting DID NOT TAKE EFFECT.');
      console.log('     Report this as a wiring problem, not as "concurrency does not help".');
    } else if (noise >= effectPct) {
      console.log(`  !! noise (${noise.toFixed(1)}%) >= effect (${effectPct.toFixed(1)}%) — UNDERPOWERED, do not conclude.`);
    } else {
      console.log(`  effect ${effectPct.toFixed(0)}% vs noise ${noise.toFixed(1)}% => resolvable.`);
    }
  }
  console.log(`\nMACHINE ${JSON.stringify({ latency: LATENCY, pages: PAGES, reps: REPS, noisePct: Number(noise.toFixed(1)), summary })}`);

  await fx.close();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
})();
