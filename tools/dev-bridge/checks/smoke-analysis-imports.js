'use strict';
// Require-smoke for the analysisRuns/propertyEditor relocation: every touched
// module must load and expose the expected surface (no DB writes here).
const assert = require('assert');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');

const ncdb = require('news-crawler-db');
for (const fn of ['ensureAnalysisRunSchema', 'createAnalysisRun', 'updateAnalysisRun',
  'addAnalysisRunEvent', 'listAnalysisRuns', 'getAnalysisRun']) {
  assert.strictEqual(typeof ncdb[fn], 'function', `ncdb.${fn} missing`);
}
console.log('ncdb surface: ok (6 fns)');

// (The deprecated-ui/express/services/analysisRuns.js re-export shim was
// retired together with the whole src/deprecated-ui tree in step 3 — the ncdb
// surface check above is now the canonical guard for the analysisRuns move.)

const pe = require(path.join(ROOT, 'src/shared/propertyEditor.js'));
assert.strictEqual(typeof pe.validateValues, 'function');
assert.strictEqual(pe.FieldType.NUMBER, 'number');
console.log('shared/propertyEditor: ok');

const defs = require(path.join(ROOT, 'src/background/tasks/taskDefinitions.js'));
assert.ok(defs && typeof defs === 'object');
console.log('taskDefinitions: ok');

require(path.join(ROOT, 'src/api/routes/analysis.js'));
console.log('routes/analysis: ok');
require(path.join(ROOT, 'src/tools/analysis-run.js')); // main-guarded CLI
console.log('analysis-run (require only): ok');
console.log('SMOKE PASS');
