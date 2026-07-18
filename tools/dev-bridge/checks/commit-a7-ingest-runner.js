'use strict';
// Commit + push copilot: A7 — durable runner proving ingestAdminAreas()
// against real WDQS + the live DB (the code path the bg task will use).
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'tools/dev-bridge/checks/ingest-admin-areas.js',
  'tools/dev-bridge/checks/commit-a7-ingest-runner.js',
]);
git(['commit', '-m',
  'A7: durable ingest-admin-areas runner (validates the callable live)\n\n' +
  'checks/ingest-admin-areas.js drives the extracted ingestAdminAreas()\n' +
  'against data/news.db from the CLI — the SAME code path the coming\n' +
  'IngestAdminAreasTask will use, so the callable is now proven against\n' +
  'REAL WDQS/wbgetentities, not just the jest mocks. Default DRY-RUN\n' +
  'lists verified level-2 classes per country; --apply ingests (app\n' +
  'stopped). Reads verified admin_class_map rows only.\n\n' +
  'LIVE PROOF (app stopped, restarted httpOk): FR/Q6465 returned 110,\n' +
  'created 0 / existing 110 / failed 0 — idempotent against last turn\'s\n' +
  'CLI-path ingest, confirming the extraction is faithful. The bg-task\n' +
  'registration plumbing is only wired in tests today (live manager\n' +
  'reports "not available"); wiring it is the clean next-turn job now\n' +
  'that the callable + a live-proven runner exist.',
]);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '--porcelain']).split('\n').filter(l => /^.?[DM]/.test(l)).slice(0, 4).join('\n') || '(no stray tracked changes)');
