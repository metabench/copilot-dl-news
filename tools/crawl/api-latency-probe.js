#!/usr/bin/env node
'use strict';
// READ-ONLY: measure UI API responsiveness. Fetches the given endpoint N times
// at a fixed interval and prints latency stats — used to prove worker-mode
// crawls no longer starve the server's event loop (2026-07-07).
// Usage: node tools/crawl/api-latency-probe.js [--url http://127.0.0.1:3000/api/apps] [--n 12] [--interval-ms 2500]
const args = process.argv.slice(2);
function argOf(flag, dflt) { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; }
const url = argOf('--url', 'http://127.0.0.1:3000/api/apps');
const n = Number(argOf('--n', 12));
const intervalMs = Number(argOf('--interval-ms', 2500));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const latencies = [];
  let failures = 0;
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      await res.arrayBuffer();
      latencies.push(Date.now() - t0);
    } catch (_e) {
      failures++;
      latencies.push(-1);
    }
    if (i < n - 1) await sleep(intervalMs);
  }
  const ok = latencies.filter((l) => l >= 0);
  const max = ok.length ? Math.max(...ok) : null;
  const avg = ok.length ? Math.round(ok.reduce((a, b) => a + b, 0) / ok.length) : null;
  console.log(JSON.stringify({ url, samples: n, failures, avgMs: avg, maxMs: max, latenciesMs: latencies }));
})();
