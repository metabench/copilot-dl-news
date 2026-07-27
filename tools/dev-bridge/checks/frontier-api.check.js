#!/usr/bin/env node
'use strict';

/**
 * frontier-api.check.js — one-command READ-ONLY health probe of the entire
 * DB-driven-crawling API surface (P1-P6, docs/plans/2026-07-db-driven-crawling.md).
 *
 * Replaces the N ad-hoc curls every orient was costing: each turn that
 * touches the frontier stack starts by asking "is the app up, what's cached,
 * what's pending, is auto-hydrate on?" — this answers all of it in one run,
 * with pass/fail per endpoint and the load-bearing figures inline. GET-only:
 * probing never mutates state (no hydrate, no tick, no run).
 *
 *   node tools/dev-bridge/checks/frontier-api.check.js [--port 3170]
 *
 * Exit: 0 = every endpoint responded, 1 = any failed/unreachable.
 */

const http = require('http');

const argv = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const PORT = Number(getArg('--port', 3170));

function get(pathname) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: pathname, timeout: 8000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(body) }); }
        catch (_) { resolve({ status: res.statusCode, json: null }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, json: null, error: 'timeout' }); });
    req.on('error', (err) => resolve({ status: 0, json: null, error: err.message }));
  });
}

const CHECKS = [
  {
    path: '/api/v1/crawl/frontier/summary',
    label: 'P1/P2 frontier summary',
    describe: (j) => `crawlable=${j.crawlable?.toLocaleString?.('en-US') ?? j.crawlable} hubStale=${j.hubStale} hubDead=${j.hubDead ?? 'n/a'} (snapshot ${j.generatedAt || 'warming'})`
  },
  {
    path: '/api/v1/crawl/hub-recency',
    label: 'P2 hub recency',
    describe: (j) => `days=${j.days ?? j.hubRefreshRecencyDays ?? JSON.stringify(j)}`
  },
  {
    path: '/api/v1/crawl/frontier/queue-stats',
    label: 'P3 queue stats',
    describe: (j) => `pending=${j.pending} inProgress=${j.inProgress} completed=${j.completed} failed=${j.failed}`
  },
  {
    path: '/api/v1/crawl/auto-hydrate',
    label: 'P6 auto-hydrate',
    describe: (j) => `enabled=${j.enabled} newsHostsOnly=${j.newsHostsOnly} every=${j.intervalMinutes}m x${j.hostsPerTick}hosts lastTick=${j.lastTickAt || 'never'}`
  },
  {
    path: '/api/v1/crawl/bandwidth-cap',
    label: 'bandwidth cap',
    describe: (j) => j.unlimited ? 'unlimited' : `${j.rateMBps ?? j.mbps ?? j.bandwidthCapMBps} MB/s`
  },
  {
    path: '/api/v1/crawl/jobs',
    label: 'job registry',
    describe: (j) => {
      const items = j.items || [];
      const running = items.filter((x) => x.status === 'running').length;
      return `running=${running} total=${items.length}`;
    }
  }
];

(async () => {
  console.log(`\n== DB-frontier API check (port ${PORT}) ==`);
  let failures = 0;
  for (const check of CHECKS) {
    const r = await get(check.path);
    if (r.status === 200 && r.json) {
      let detail;
      try { detail = check.describe(r.json); } catch (_) { detail = '(shape changed — update this check)'; }
      console.log(`  ✅ ${check.label.padEnd(24)} ${detail}`);
    } else {
      failures += 1;
      console.log(`  ❌ ${check.label.padEnd(24)} HTTP ${r.status}${r.error ? ' (' + r.error + ')' : ''}`);
    }
  }
  console.log(failures ? `\n${failures} endpoint(s) failing.` : '\nAll frontier endpoints healthy.');
  process.exit(failures ? 1 : 0);
})();
