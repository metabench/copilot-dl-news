'use strict';
// Commit + push the 2026-07-16 DB-consolidation chunk.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

git(['add', '--',
  'src/shared/utils/gazetteer-db-path.js',
  'src/shared/utils/__tests__/gazetteer-db-path.test.js',
  'src/shared/utils/CliArgumentParser.js',
  'src/intelligence/knowledge/PlaceLookup.js',
  'src/intelligence/facts/url-informed/ContainsPlaceName.js',
  'src/core/crawler/CountryHubBehavioralProfile.js',
  'src/tools/validate-gazetteer.js',
  'src/tools/export-gazetteer.js',
  'src/tools/import-gazetteer.js',
  'src/tools/gazetteer-cleanup.js',
  'src/tools/largeArtifactsPruner.js',
  'src/tools/sync-site-geo.js',
  'src/ui/server/gazetteerInfoServer.js',
  'src/ui/server/geoImportServer.js',
  'src/ui/server/placeHubGuessing/server.js',
  'src/ui/server/placeHubGuessing/checks/placeHubGuessing.cell.check.js',
  'src/ui/controls/GeoImportDashboard.js',
  'tools/cleanup/prune-large-artifacts.js',
  'tools/gazetteer/ingest-historical-names.js',
  'tools/dev-bridge/checks/retire-stale-dbs.js',
  'tools/dev-bridge/checks/smoke-gazetteer-newsdb.js',
  'tools/dev-bridge/checks/db-probe-schema.js',
  'tools/dev-bridge/checks/probe-locales.js',
  'tools/dev-bridge/checks/commit-db-consolidation.js',
  'docs/plans/2026-07-16-news-sites-100-and-db-only-audit.md',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md'
]);
git(['commit', '-m',
  'DB consolidation: retire stale sibling DBs, geo data resolves to news.db\n\n' +
  '- data/gazetteer.db was a stale copy (508 places vs news.db 13,688) yet\n' +
  '  ~12 modules defaulted to it; PlaceLookup silently served 27x less\n' +
  '  data. New shared resolver src/shared/utils/gazetteer-db-path.js\n' +
  '  (explicit arg > GAZETTEER_DB_PATH > data/news.db) now backs every\n' +
  '  gazetteer path; PlaceLookup SQL made schema-tolerant (place_type\n' +
  '  column existed only in the retired file).\n' +
  '- Archived (moved, not deleted) gazetteer.db, gazetteer-standalone.db,\n' +
  '  crawl-multi.db, crawl-data.sqlite (+wal/shm) to\n' +
  '  data/backups/stale-dbs-2026-07-16/ after a containment probe\n' +
  '  (3/10,596 names unique, historical variants only; latter two DBs had\n' +
  '  zero code references).\n' +
  '- sync-site-geo.js: idempotent migration of country/language/tier from\n' +
  '  config/news-sources.json into news_websites.metadata (8 rows) and\n' +
  '  domain_locales (3 -> 15 rows, bare-host canonical form; legacy www.\n' +
  '  rows normalized). Bootstrap JSONs remain install media only.\n' +
  '- Verified live: resolver test 3/3, PlaceLookup smoke on news.db\n' +
  '  (13,688 places / 249 countries), sync run twice = identical state.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log(git(['push']).trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n')[0]);
