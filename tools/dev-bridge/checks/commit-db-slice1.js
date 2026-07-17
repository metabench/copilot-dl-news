'use strict';
// Commit + push DB-consolidation slice 1: delete the cloudCrawl +
// downloadEvidence re-export shims; repoint the latter's 10 consumers to
// news-crawler-db directly. Shim deletions already staged by
// retire-de-shims.js. Explicit pathspecs — the owner is concurrently editing
// .claude/settings*, wysiwyg bundle.js*, docs/INDEX.md and
// docs/sessions/SESSIONS_HUB.md; none of those may be swept in.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

git(['add', '--',
  'src/ui/server/unifiedApp/checks/download-verification.check.js',
  'tools/dev/verified-crawl.js',
  'tools/dev/db-downloads.js',
  'tools/dev/downloads-bar-chart-server.js',
  'tools/crawl/cloud-crawl-e2e.js',
  'tools/crawl/lib/sample-db-signals.js',
  'tools/crawl/lib/monitored-small-crawl.js',
  'tools/crawl/lib/crawl-progress-monitor.js',
  'tools/crawl/lib/crawl-packet.js',
  'tools/crawl/lib/crawl-backend.js',
  'tools/dev-bridge/checks/smoke-uapp-db-repoint.js',
  'tools/dev-bridge/checks/retire-de-shims.js',
  'tools/dev-bridge/checks/syntax-check-slice1.js',
  'tools/dev-bridge/checks/commit-db-slice1.js',
  'docs/plans/2026-07-17-coordination-point-migration.md',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md'
]);
git(['commit', '-m',
  'DB-consolidation slice 1: delete cloudCrawl + downloadEvidence shims, repoint 10 consumers\n\n' +
  'Coordination-point migration, DB-consolidation phase\n' +
  '(docs/plans/2026-07-17-…md). Mechanic: repoint-then-delete-shim.\n\n' +
  '- Delete src/data/db/sqlite/v1/queries/ui/cloudCrawl.js (zero importers\n' +
  '  since slice 0 repointed unifiedApp/server.js).\n' +
  '- Delete src/data/db/queries/downloadEvidence.js after repointing its 10\n' +
  '  importers to news-crawler-db directly: unifiedApp/checks/\n' +
  '  download-verification.check.js, tools/dev/{verified-crawl,\n' +
  '  db-downloads, downloads-bar-chart-server}.js, tools/crawl/\n' +
  '  cloud-crawl-e2e.js, tools/crawl/lib/{sample-db-signals,\n' +
  '  monitored-small-crawl, crawl-progress-monitor, crawl-packet,\n' +
  '  crawl-backend}.js. Only verified-crawl.js used the shim\'s\n' +
  '  getGlobalStats rename (small alias object preserves its call sites);\n' +
  '  all other names are plain ncdb exports, so files doing property\n' +
  '  access now take the ncdb module object directly.\n\n' +
  'Verification: checks/smoke-uapp-db-repoint.js reworked into a\n' +
  'slices-0+1 surface smoke (20 functions + 4 constants asserted on\n' +
  'ncdb\'s runtime surface — the identity form is impossible once the\n' +
  'shims are gone); unifiedApp/checks/download-verification.check.js runs\n' +
  'GREEN standalone (9/9 assertions on a :memory: fixture through the\n' +
  'repointed require); node --check green on all 10 edited files\n' +
  '(checks/syntax-check-slice1.js).\n\n' +
  'Found in passing (pre-existing, recorded in the plan): root checks/\n' +
  '{download-evidence,downloads-api,downloads-stats-api}.check.js require\n' +
  'a nonexistent src/db/queries/downloadEvidence path — dead scripts for\n' +
  'a later checks sweep.\n\n' +
  'src/data/db: 199 -> 197 files.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 12).join('\n'));
