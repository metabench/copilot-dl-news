'use strict';
// Commit + push the 2026-07-14 loop-day-1 work in copilot-dl-news.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

git(['add', '--',
  'src/ui/electron/unifiedApp/main.js',
  'tools/dev-bridge/dev-bridge.js',
  'tools/dev-bridge/checks/',
  'docs/sessions/2026-07-14-recursive-crawl-loop/'
]);
git(['commit', '-m',
  'Recursive crawl loop: day-1 fixes, first bounded crawls, loop scaffolding\n\n' +
  '- start-electron defaults UI_CRAWL_WORKER=1: in-process crawl jobs\n' +
  '  starved the UI server event loop (jobs GET timed out during a crawl);\n' +
  '  worker mode keeps APIs live. Verified: BBC bounded crawl completed\n' +
  '  (54 visited / 50 downloaded / 32 saved / 0 errors) with responsive\n' +
  '  jobs API and live per-job progress in the VS2005 dashboard.\n' +
  '- main.js: server boot wait 20s -> 60s (--server-wait-ms) after a\n' +
  '  cold-boot startup miss following the overnight reboot.\n' +
  '- checks/clean-junk-rows.js: removed 14 place_hub_candidates rows with\n' +
  '  domain=\'city\' and 3 test-host place_hubs rows from the live DB.\n' +
  '- checks/run-jsgui-tests.js + commit helpers for cross-repo work.\n' +
  '- docs/sessions/2026-07-14-recursive-crawl-loop/: LOOP_STATE.md (the\n' +
  '  loop\'s persistent memory: protocol anchors, backlog, findings log),\n' +
  '  SEED_PROMPT.md, CONTINUATION_PROMPT.md.\n' +
  'Known finding queued: Guardian direct fetch ECONNRESET (anti-bot);\n' +
  'investigate Puppeteer fallback / remote-fetch routing next.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log(git(['push']).trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n')[0]);
