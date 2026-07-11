'use strict';
/**
 * Guards for the DB-only persistence policy (hub-identification plan §1/§2,
 * 2026-07-11): crawler/tool code must not require better-sqlite3 directly
 * (the news-crawler-db module is the only DB access path) and must not grow
 * new data-file writers. Static, fast, runs in the normal suite.
 *
 * If you trip one of these legitimately, either route through news-crawler-db
 * accessors (preferred) or — for genuinely operational, non-data files —
 * add a narrowly scoped entry to the allowlist WITH a comment justifying it.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SCAN_TREES = ['src/core/crawler', 'tools/crawl'];

// Files allowed to write files (operational plumbing, fixtures, deploy
// artifacts — not crawl/analysis data). Everything else in the scanned trees
// is banned. Entries marked "migration planned" shrink as plan §1 executes.
const WRITE_ALLOWLIST = new Set([
  'tools/crawl/local-fixture-server.js',
  'tools/crawl/lib/local-fixture-server.js',
  'tools/crawl/campaign-runner.js',              // operational status/stop plumbing (migration planned)
  'tools/crawl/crawl-packet.js',                 // migration planned (plan §1)
  'tools/crawl/lib/crawl-packet.js',             // migration planned (plan §1)
  'tools/crawl/crawl-progress-monitor.js',       // migration planned (plan §1)
  'tools/crawl/lib/crawl-progress-monitor.js',   // migration planned (plan §1)
  'tools/crawl/crawl-remote.js',                 // migration planned (plan §1)
  'tools/crawl/deploy-remote-server.js',         // deploy tarballs (not data)
  'tools/crawl/guardian-place-hubs.js',          // migration planned (plan §1)
  'tools/crawl/intelligent-crawl.js',            // migration planned (plan §1)
  'tools/crawl/monitored-small-crawl.js',        // migration planned (plan §1)
  'tools/crawl/lib/monitored-small-crawl.js',    // migration planned (plan §1)
  'tools/crawl/sync-ledger.js',                  // migration planned (plan §1)
  'tools/crawl/throughput-analyzer.js',          // migration planned (plan §1)
  'tools/crawl/lib/throughput-analyzer.js',      // migration planned (plan §1)
  'tools/crawl/lib/sequential-fixture-proof.js', // fixture proof artifacts
  'tools/crawl/lib/graph-feedback-live-seeds.js',// migration planned (plan §1)
  'tools/crawl/cloud-crawl-e2e.js',              // migration planned (plan §1)
  // Found by this guard on first run (2026-07-11) — inventoried, frozen,
  // added to the plan §1 migration table. No NEW writers may join.
  'src/core/crawler/checkpoint/CheckpointManager.js',            // crawl checkpoints → DB (migration planned)
  'src/core/crawler/gazetteer/ingestors/WikidataCitiesIngestor.js',   // wikidata cache files (migration planned)
  'src/core/crawler/gazetteer/ingestors/WikidataCountryIngestor.js',  // wikidata cache files (migration planned)
  'src/core/crawler/gazetteer/services/WikidataService.js',           // wikidata cache files (migration planned)
  'src/core/crawler/observatory/checks/DecisionConfigSet.check.js',   // observatory artifacts (migration planned)
  'src/core/crawler/observatory/DecisionConfigPromotionService.js',   // observatory artifacts (migration planned)
  'src/core/crawler/observatory/DecisionConfigSetRepository.js',      // config sets on disk → DB (migration planned)
  'src/core/crawler/PuppeteerDomainManager.js',                       // domain state file (migration planned)
  'tools/crawl/lib/sync-ledger.js',                                   // migration planned (plan §1)
  'tools/crawl/run.js',                                               // UI log plumbing (operational)
]);

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.js') && !full.includes('__tests__')) acc.push(full);
  }
  return acc;
}

const files = SCAN_TREES.flatMap((t) => walk(path.join(ROOT, t)));
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');

describe('DB-only persistence guards (hub plan §1/§2)', () => {
  test('scanned a plausible number of files', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  test('no direct better-sqlite3 requires outside news-crawler-db', () => {
    const offenders = files
      .filter((f) => /require\((['"])better-sqlite3\1\)/.test(fs.readFileSync(f, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  test('no file-writers outside the (shrinking) allowlist', () => {
    const offenders = files
      .filter((f) => /writeFileSync|createWriteStream|appendFileSync/.test(fs.readFileSync(f, 'utf8')))
      .map(rel)
      .filter((f) => !WRITE_ALLOWLIST.has(f));
    expect(offenders).toEqual([]);
  });
});
