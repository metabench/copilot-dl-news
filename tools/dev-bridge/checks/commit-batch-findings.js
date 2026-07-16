'use strict';
// Commit the 5-site batch findings: LOOP_STATE + diagnostic probe scripts.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

git(['add', '--',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md',
  'tools/dev-bridge/checks/probe-lemonde-errors.js',
  'tools/dev-bridge/checks/probe-lemonde-errors2.js',
  'tools/dev-bridge/checks/commit-batch-findings.js'
]);
git(['commit', '-m',
  'Loop: 5-site x 200-page batch results + worker-error observability gap\n\n' +
  'Batch (worker mode, concurrent): AlJazeera 200/196/0err (40.6MB),\n' +
  'BBC + Guardian clean and running (Guardian via puppeteer fallback --\n' +
  'yesterday\'s fix holding at 0 errors), LeMonde 5146 errors / 1 download,\n' +
  'Reuters silent 0-page completion.\n\n' +
  'Key finding: worker-job error details are never persisted -- LeMonde\'s\n' +
  '5146 errors exist only in in-memory progress counters (errors,\n' +
  'crawl_problems and fetches tables all empty for the window) and worker\n' +
  'stdio is inherit, so diagnosis is impossible after the fact. Queued:\n' +
  'persist per-job error samples + flag 0-download completions as suspect.\n\n' +
  'probe-lemonde-errors*.js: read-only DB probes used for the diagnosis.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log(git(['push']).trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n')[0]);
