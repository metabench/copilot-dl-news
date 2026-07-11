'use strict';
// Commit + push the VS2005 theme work across jsgui3-html and copilot-dl-news.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (repo, args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, repo), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

// jsgui3-html: the theme preset
git('jsgui3-html', ['add', '--', 'controls/organised/1-standard/4-data/Admin_Theme.js']);
git('jsgui3-html', ['commit', '-m',
  'Admin_Theme: add vs-2005 preset (Visual Studio 2005 / XP Luna light)\n\n' +
  'Warm tan chrome (#ECE9D8), Tahoma 11px, Luna-blue (#316AC5) accents,\n' +
  'gradient tool-window headers, 2px radii. Selected via\n' +
  'data-admin-theme="vs-2005"; consumed by the copilot-dl-news crawl\n' +
  'status page.']);
console.log('jsgui3-html committed:', git('jsgui3-html', ['rev-parse', '--short', 'HEAD']).trim());
console.log(git('jsgui3-html', ['push']).trim() || 'pushed');
console.log(git('jsgui3-html', ['status', '-sb']).split('\n')[0]);

// copilot-dl-news: the retheme + bridge fixes
git('copilot-dl-news', ['add', '--',
  'src/ui/server/crawlStatus/CrawlStatusPage.js',
  'src/ui/server/crawlStatus/crawl-status-styles.js',
  'src/ui/server/crawlStatus/crawl-status-client.js',
  'tools/dev-bridge/dev-bridge.js',
  'tools/dev-bridge/checks/'
]);
git('copilot-dl-news', ['commit', '-m',
  'Crawl status page: Visual Studio 2005 light theme, simplified layout\n\n' +
  'jsgui3 SSR page rebuilt as classic IDE chrome: XP caption bar, Luna\n' +
  'toolbar (the start form), info strip, collapsed advanced options,\n' +
  'Batch launch + Crawl activity tool windows, VS-style jobs grid, sunken\n' +
  'status bar with the quick links. Palette via Admin_Theme vs-2005\n' +
  '(--admin-* vars with hard fallbacks). All ids/data-attrs preserved —\n' +
  'client script and checks unchanged in behavior; jobs table now also\n' +
  'reads progress.queued/updatedAt.\n\n' +
  'CSS is injected via String_Control: plain Control.add() HTML-escapes\n' +
  'style text in current jsgui3-html (apostrophes and /* */ became\n' +
  'entities, silently eating rules after each comment).\n\n' +
  'dev-bridge: start-electron now spawns electron/cli.js via node so the\n' +
  'tracked pid is the real tree root (the .cmd shell wrapper leaked orphan\n' +
  'app trees on stop/start); new checks: file-grep, clear-shot-profile,\n' +
  'git-ops, syntax-sweep, git-lock-sweep, commit plans.']);
console.log('copilot committed:', git('copilot-dl-news', ['rev-parse', '--short', 'HEAD']).trim());
console.log(git('copilot-dl-news', ['push']).trim() || 'pushed');
console.log(git('copilot-dl-news', ['status', '-sb']).split('\n')[0]);
