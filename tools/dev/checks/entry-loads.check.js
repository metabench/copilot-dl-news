#!/usr/bin/env node
'use strict';

/**
 * entry-loads.check.js — raw-Node load proof for key entry modules
 * (built cycle 191, after the c181 extraction's ONE missed repoint left
 * NewsCrawler + IntelligentPlanRunner + the legacy CLI path unloadable for
 * FIVE CYCLES without anything noticing: the v1 API builds crawls from
 * engine parts so production kept working, and the phantom sweep scans only
 * test files. A module that cannot even require() is broken at the cheapest
 * possible layer to detect — so detect it at orient, every time.)
 *
 * Each entry is required in a CHILD process (a load failure must not take
 * the probe runner down, and child isolation keeps side effects out).
 * Add entries as new load-bearing modules earn protection.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');

const ENTRIES = [
  'src/core/crawler/NewsCrawler.js',
  'src/core/crawler/IntelligentPlanRunner.js',
  'src/core/crawler/CrawlOperations.js',
  'src/server/crawl-api/core/crawlService.js',
  'src/core/crawler/CrawlerServiceWiring.js'
];

function main() {
  const failures = [];
  for (const entry of ENTRIES) {
    const r = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(path.join(ROOT, entry))})`], {
      cwd: ROOT, encoding: 'utf8', timeout: 30000
    });
    if (r.status !== 0) {
      const firstLine = (r.stderr || '').split(/\r?\n/).find((l) => /Error/.test(l)) || 'nonzero exit';
      failures.push(`${entry}: ${firstLine.trim().slice(0, 120)}`);
    }
  }
  console.log(`entry-loads: ${ENTRIES.length - failures.length}/${ENTRIES.length} entry modules load under raw Node`);
  if (failures.length) {
    console.error('FAIL: these modules cannot even require() — a dangling edge is live:');
    for (const f of failures) console.error('  ' + f);
    return 1;
  }
  return 0;
}

process.exit(main());
