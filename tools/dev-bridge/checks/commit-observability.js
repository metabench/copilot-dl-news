'use strict';
// Commit + push: worker-error observability + host-lockout queue deferral.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

git(['add', '--',
  'src/server/crawl-api/v1/core/InProcessCrawlJobRegistry.js',
  'src/server/crawl-api/v1/core/__tests__/InProcessCrawlJobRegistry.errorSummary.test.js',
  'src/core/crawler/HostRetryBudgetManager.js',
  'src/core/crawler/DomainThrottleManager.js',
  'src/core/crawler/FetchPipeline.js',
  'src/core/crawler/CrawlerServiceWiring.js',
  'src/core/crawler/__tests__/hostLockoutQueueDeferral.test.js',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md',
  'tools/dev-bridge/checks/probe-lemonde-errors.js',
  'tools/dev-bridge/checks/probe-lemonde-errors2.js',
  'tools/dev-bridge/checks/commit-observability.js'
]);
git(['commit', '-m',
  'Worker-job observability + host-lockout queue deferral (LeMonde error storm)\n\n' +
  'Observability (made the diagnosis possible):\n' +
  '- Worker stdio now captured to data/logs/jobs/<jobId>.log instead of\n' +
  '  inherit (which lost every error detail with the server console).\n' +
  '- Bounded url:error summaries (per-kind counts + first-25 samples) kept\n' +
  '  on job records and exposed as errorSummary/logPath in the jobs API.\n\n' +
  'Fix: lemonde.fr answers HTTP 402 to every fetch; six failures exhaust\n' +
  'the host retry budget and lock the host -- but the lock lived only\n' +
  'inside FetchPipeline, so QueueManager kept dequeuing the host\'s queued\n' +
  'URLs and each dequeue became a synthetic HOST_RETRY_EXHAUSTED error:\n' +
  '5,140 spin errors in ~8 min (jobs 143fc616, ce78bfd3). New\n' +
  'HostRetryBudgetManager.onLockout callback is wired to\n' +
  'DomainThrottleManager.applyHostBackoff, so getHostResumeTime gates the\n' +
  'queue and its existing deferral machinery parks the host until the\n' +
  'lock expires.\n\n' +
  'Live verification (job 82cbcaf9): 6 real 402 errors, ZERO spin errors\n' +
  '(grep HOST_RETRY_EXHAUSTED in the per-job log: 0, was 5,140); queue\n' +
  'waits out each 2-min lockout. Tests: 4 new registry cases, 4 new\n' +
  'lockout-deferral cases; FetchPipeline (16), HostRetryBudgetManager,\n' +
  'jobProgress suites all green on the target machine.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log(git(['push']).trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n')[0]);
