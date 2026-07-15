'use strict';
// Commit + push the Guardian puppeteer-fallback fix (scoped file list only).
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

git(['add', '--',
  'src/core/crawler/FetchPipeline.js',
  'src/core/crawler/__tests__/FetchPipeline.puppeteerFallbackDomains.test.js',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md',
  'tools/dev-bridge/checks/commit-guardian-fallback.js'
]);
git(['commit', '-m',
  'FetchPipeline: static puppeteer-fallback domains are a baseline, not a legacy path\n\n' +
  '_shouldUsePuppeteerFallback returned the auto-learning\n' +
  'PuppeteerDomainManager\'s answer outright whenever a manager was present,\n' +
  'so the static TLS-fingerprinting list (theguardian.com, bloomberg.com,\n' +
  'wsj.com) was bypassed until the manager had accrued enough failures to\n' +
  'learn the domain. First-contact ECONNRESET on those sites therefore\n' +
  'killed the crawl with CRAWL_NO_PROGRESS (seen live 2026-07-14, job\n' +
  '0ff6f86d, https://www.theguardian.com/uk).\n\n' +
  'Now: manager approval OR static-list membership triggers the fallback;\n' +
  'the enabled=false kill-switch still overrides everything and custom\n' +
  'domain lists still replace the defaults.\n\n' +
  'Verified: new regression suite (5 cases) passes on this machine, and a\n' +
  'live re-crawl of theguardian.com/uk (maxPages=5, job cae10aee) completed\n' +
  '5 visited / 5 downloaded / 5 saved / 0 errors where the pre-fix job\n' +
  'failed instantly.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log(git(['push']).trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n')[0]);
