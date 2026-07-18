'use strict';
// Commit + push copilot: B11b — dbAccess relocated out of src/data/db into
// the surviving src/db/ (project wiring, not DB logic). Deletion side is a
// git mv (staged); 14 consumer references repointed.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'src/db/dbAccess.js',
  'src/cli/crawl/runner.js',
  'src/core/crawler/observatory/DecisionConfigSetState.js',
  'src/tools/rebuild-news-website-cache.js',
  'src/ui/electron/placeHubGuessingApp/main.js',
  'src/ui/render-url-table.js',
  'src/ui/server/checks/dataExplorer.check.js',
  'src/ui/server/checks/dataExplorerUrlFilters.check.js',
  'src/ui/server/checks/homeDashboard.check.js',
  'src/ui/server/dataExplorer/checks/themeEditor.check.js',
  'src/ui/server/dataExplorerServer.js',
  'src/ui/server/factsServer.js',
  'src/ui/server/unifiedApp/server.js',
  'tests/ui/e2e/url-filter-toggle.puppeteer.e2e.test.js',
  'tests/ui/server/dataExplorerServer.test.js',
  'tools/dev-bridge/checks/commit-b11b-dbaccess.js'
]);
git(['commit', '-m',
  'B11b: dbAccess relocated to src/db/ — project wiring, not DB logic\n\n' +
  'openNewsDb (default path + ensureDb + NewsDatabase facade), withNewsDb\n' +
  '(auto-close), and the Express helpers are coordination-point wiring —\n' +
  'they move beside ensureNewsDb rather than into ncdb. Internals rewired\n' +
  'onto the ensureNewsDb seam (one require; an intermediate sed produced\n' +
  'a const-TDZ ordering that node --check accepts but runtime throws —\n' +
  'caught by the load proof, rewritten cleanly).\n\n' +
  '14 references repointed: data/db/dbAccess -> db/dbAccess keeps every\n' +
  'relative depth identical (one segment shorter at the same level), so\n' +
  'the transform is uniform across 12 requires + 2 jest.mock paths.\n\n' +
  'Verified: dbAccess load proof (5 exports); unifiedApp + dataExplorer\n' +
  '+ facts servers require-resolve (server modules hold timer handles —\n' +
  'probe needs process.exit); sweep clean. The two tests/ui suites that\n' +
  'mock dbAccess are path-only changes; they run in the next app-stopped\n' +
  'window. src/data/db: 68 js files remain.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 8).join('\n'));
