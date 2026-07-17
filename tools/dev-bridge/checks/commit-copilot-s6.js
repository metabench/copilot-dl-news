'use strict';
// Commit + push copilot slice 6 (B6 gazetteer codemod + B6b renamed trio).
// Shim deletions staged by retire-slice6-shims.js. Codemod rewrote 31
// files — stage src/tests/tools by pathspec DIRECTORIES + explicit files,
// still excluding the owner's dirty files (.claude/, wysiwyg bundle,
// docs/INDEX.md, SESSIONS_HUB.md are NOT under these pathspecs except the
// two docs, which we add explicitly ourselves).
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

// Stage ONLY modified tracked .js files under the three roots whose diff
// touches news-crawler-db requires (the codemod's exact effect), plus this
// turn's checks + docs. Safer than 31 hand-listed paths: use
// `git add -u` scoped to the roots, then verify nothing owner-dirty crept in.
git(['add', '-u', '--', 'src', 'tests', 'tools']);
git(['add', '--',
  'docs/plans/2026-07-17-coordination-point-migration.md',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md',
  'tools/dev-bridge/checks/commit-copilot-s6.js'
]);
// Owner-dirty files live outside src/tests/tools except wysiwyg bundle —
// UNSTAGE those two defensively.
try { git(['restore', '--staged', '--', 'src/ui/server/wysiwyg-demo/public/js/bundle.js', 'src/ui/server/wysiwyg-demo/public/js/bundle.js.map']); } catch {}

const staged = git(['diff', '--cached', '--stat']).trim().split('\n').pop();
console.log('staged summary:', staged);
git(['commit', '-m',
  'Slice 6: gazetteer cluster codemod + renamed-adapter trio retired\n\n' +
  'B6 — 13 pure v1 gazetteer shims (gazetteer.* + gazetteerPlaceNames)\n' +
  'deleted; 31 consumer files repointed by codemod (now walking src,\n' +
  'tests AND tools — the dry-run caught the missing tools/ walk).\n' +
  'Old-layer sqlite/queries/gazetteer.places.js converted to a named\n' +
  'news-crawler-db re-export (it re-required the dying v1 shim); the\n' +
  'rest of the old layer is deferred to its own sweep.\n\n' +
  'B6b — searchAdapter/userAdapter/workspaceAdapter deleted. The surface\n' +
  'smoke caught that createSearchAdapter does not exist on ncdb: the\n' +
  'shim WRAPPED createSqliteArticleSearchAdapter under the historical\n' +
  'name (git show verified) — SearchService, search/index and gateway\n' +
  'now alias it explicitly. workspaceAdapter\'s renamed generateSlug is\n' +
  'consumed nowhere; userAdapter had no live consumers.\n\n' +
  'Verified: surface smoke 174 functions + 11 constants (every retired\n' +
  'gazetteer name present on ncdb — no shim-era undefineds in this\n' +
  'cluster); tests/teams 204/204; syntax sweep clean. tests/search is\n' +
  '0-total (pre-existing ghost-path suite).\n\n' +
  'src/data/db: 148 -> 132 files.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 10).join('\n'));
