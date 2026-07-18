'use strict';
// Commit + push copilot: A7 — mount the background-task subsystem into the
// live app; in-app admin ingestion now runs with NO app-stop.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'src/server/background-tasks/mountBackgroundTasks.js',
  'src/server/background-tasks/__tests__/mountBackgroundTasks.test.js',
  'src/ui/server/unifiedApp/server.js',
  'tools/dev-bridge/checks/commit-a7-mount-bgtasks.js',
]);
git(['commit', '-m',
  'A7: mount the background-task subsystem — in-app ingest, no app-stop\n\n' +
  'DECISION (mount, not retire): the subsystem was fully built (manager,\n' +
  'router, 5 task classes, a UI monitor) but never wired — the router had\n' +
  'no caller and no manager was instantiated, so /api/v1/background-tasks\n' +
  'always answered "manager not available". It is invested, not\n' +
  'abandoned, and is the right tool for the owner-directed in-app\n' +
  'ingestion. So: mount it.\n\n' +
  'src/server/background-tasks/mountBackgroundTasks.js isolates all the\n' +
  'new logic: a BackgroundTaskManager over getDbRW().db (the app\'s own\n' +
  'handle -> in-process writes, no app-stop), the tested\n' +
  'IngestAdminAreasTask registered, createBackgroundTasksRouter mounted.\n' +
  'server.js gets ONE non-fatal line beside the place-hub-review mount\n' +
  '(same never-fatal-to-the-crawler pattern). Only the verified task is\n' +
  'registered for now; others join once each is independently checked.\n\n' +
  'Jest 2/2 (supertest through the real router: POST create+autostart ->\n' +
  'manager -> task -> ingestAdminAreas -> db, injected fake net). LIVE\n' +
  '(app restarted, NOT stopped for the write): /types now serves the\n' +
  'catalog incl ingest-admin-areas; POST FR ingest ran task #67 through\n' +
  'real WDQS to completed in ~68s WHILE THE APP STAYED UP; FR counties\n' +
  '96 idempotent, total 219 unchanged, app httpOk. The app-stop dance for\n' +
  'admin ingestion is retired.',
]);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '--porcelain']).split('\n').filter(l => /^.?[DM]/.test(l)).slice(0, 4).join('\n') || '(no stray tracked changes)');
