'use strict';
// Commit + push copilot: B11f — coverage fallback restored via ncdb,
// ensure_db + v1 tools trio + outer shim retired. Deletions staged by
// git rm / git mv.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'src/data/db/EnhancedDatabaseAdapter.js',
  'src/db/ensureNewsDb.js',
  'src/data/db/sqlite/index.js',
  'src/tools/export-gazetteer.js',
  'src/tools/maintain-db.js',
  'src/tools/gazetteer_qa.js',
  'src/tools/validate-gazetteer.js',
  'tests/db/sqlite/gazetteerExport.test.js',
  'tools/dev-bridge/checks/smoke-uapp-db-repoint.js',
  'tools/dev-bridge/checks/commit-b11f-coverage-tools.js'
]);
git(['commit', '-m',
  'B11f: coverage restored via ncdb; ensure_db + v1 tools trio retired\n\n' +
  "EnhancedDatabaseAdapter's coverage chain prefers news-db-analysis\n" +
  '(not installed) then fell back to the local CoverageDatabase deleted\n' +
  'in B11d — coverage was silently OFF. The fallback now resolves\n' +
  "ncdb's CoverageDatabase (one line; the external-package preference\n" +
  'stays for the analysis-repo migration).\n\n' +
  'src/ensure_db.js: zero importers, deleted. v1/tools trio\n' +
  '(gazetteerExport/gazetteerQA/maintainDb) + the outer\n' +
  'sqlite/tools/gazetteerQA shim retired; consumers alias the renamed\n' +
  'ncdb sources; trimPlaceNames keeps its never-throws boolean\n' +
  'contract consumer-side. BONUS latent bug fixed: export-gazetteer\n' +
  'destructured openDbReadOnly from the sqlite barrel which never\n' +
  'exported it (undefined since B10c) — now provided via ensureNewsDb.\n' +
  'gazetteerExport behavioral test moved to tests/db/sqlite with the\n' +
  'safeIterateAll alias (its input-validation expectation fails\n' +
  'IDENTICALLY at HEAD — pre-existing drift, ledgered).\n\n' +
  'PROCESS FINDING: the B11e smoke extension was a SILENT NO-OP — an\n' +
  'unasserted replace() whose LF anchor never matched the CRLF file.\n' +
  'Repaired here via the Edit tool; smoke now verifies 294 fns (the\n' +
  'B11e trio included). Anchors must be asserted or edits made with\n' +
  'CRLF-safe tooling.\n\n' +
  'Verified: smoke 294 fns + 12 consts (read from output); tool\n' +
  'consumers + EnhancedDatabaseAdapter load-proofs; sweeps clean incl.\n' +
  'dot-slash forms. src/data/db: 58 -> 53 js files.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 6).join('\n'));
