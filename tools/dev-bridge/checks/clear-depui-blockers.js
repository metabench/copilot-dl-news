'use strict';
// Step-3 blocker clearing (deprecated-ui removal): relocate the one piece of
// tested, self-contained logic (IntelligentCrawlerManager -> src/core/crawler,
// beside its only testers) and git rm the dead consumers of the doomed tree.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 5 * 60 * 1000
});

try {
  git(['mv', '--', 'src/deprecated-ui/express/services/IntelligentCrawlerManager.js',
    'src/core/crawler/IntelligentCrawlerManager.js']);
  console.log('moved: IntelligentCrawlerManager -> src/core/crawler/');
} catch (e) { console.log('mv skip:', (e.stderr || e.message || '').split('\n')[0]); }

for (const f of [
  'tools/benchmarks/run.js',
  'tools/manual-tests/test-gazetteer-aware-planning.js',
  'tools/manual-tests/test-geography-crawl.js',
  'tools/manual-tests/verify-queues-impl.js',
  'tests/server-connection.test.js'
]) {
  try { git(['rm', '-f', '--', f]); console.log('removed:', f); }
  catch (e) { console.log('rm skip', f, (e.stderr || e.message || '').split('\n')[0]); }
}
console.log(git(['status', '--porcelain']).trim());
