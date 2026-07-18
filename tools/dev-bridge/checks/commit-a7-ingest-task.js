'use strict';
// Commit + push copilot: A7 — IngestAdminAreasTask + taskDefinition, proven
// end-to-end through a real BackgroundTaskManager.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'src/background/tasks/IngestAdminAreasTask.js',
  'src/background/tasks/taskDefinitions.js',
  'src/background/tasks/__tests__/IngestAdminAreasTask.test.js',
  'tools/dev-bridge/checks/commit-a7-ingest-task.js',
]);
git(['commit', '-m',
  'A7: IngestAdminAreasTask — in-app admin ingestion, proven via manager\n\n' +
  'The background task that retires the app-stop dance for admin-area\n' +
  'writes: constructor({db,taskId,config,signal,onProgress,onError,\n' +
  '...registrationOptions}) + execute() calling the extracted\n' +
  'ingestAdminAreas() against the app\'s own db handle. Config.countries\n' +
  'accepts CSV (the taskDefinition field) or an array; reads VERIFIED\n' +
  'admin_class_map rows only. Network (fetchSparql/fetchEntities) flows\n' +
  'via registrationOptions so tests inject fakes and prod gets real WDQS.\n' +
  'Added its taskDefinition (countries + limit fields).\n\n' +
  'Jest 3/3 drives the FULL in-app path end to end through a real\n' +
  'BackgroundTaskManager (registerTaskType -> createTask -> startTask ->\n' +
  'execute -> ingestAdminAreas -> db): FR departments land with FR-30/33\n' +
  'codes in-process, array-form config works, idempotent on re-run,\n' +
  'catalog registration confirmed. No app-stop, deterministic (injected\n' +
  'net). Manager suite still green; the sole place-hubs.test failure is\n' +
  'pre-existing (identical at HEAD, unrelated to src/background).\n\n' +
  'REMAINING (architectural, own turn): the live app never instantiates\n' +
  'a BackgroundTaskManager nor mounts createBackgroundTasksRouter — the\n' +
  'whole bg-task subsystem is dormant/unmounted (like the\n' +
  'tested-but-unmounted src/api/routes). Mounting it is a mount-or-retire\n' +
  'decision; the task + callable + runner are all ready for whichever\n' +
  'trigger surface lands.',
]);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '--porcelain']).split('\n').filter(l => /^.?[DM]/.test(l)).slice(0, 4).join('\n') || '(no stray tracked changes)');
