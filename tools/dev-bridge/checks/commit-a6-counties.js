'use strict';
// Commit + push copilot: A6 counties slice — copilot half (ncdb is 11b825a).
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'src/tools/populate-gazetteer.js',
  'tools/dev-bridge/checks/apply-places-kind-vocab.js',
  'tools/dev-bridge/checks/commit-a6-counties.js',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md'
]);
git(['commit', '-m',
  'A6 counties: 52 GB ceremonial counties live as kind county\n\n' +
  'Clears the entry-28 blockage with ncdb 11b825a (county in the kind\n' +
  'trigger vocabulary — county is not region, so no adm1 requirement\n' +
  'and no UNIQUE(country,adm1) collision; insertPlace INSERT gains the\n' +
  'adm code columns it silently dropped).\n\n' +
  'Copilot half: insPlaceWithNames forwards opts.adm1Code/adm2Code\n' +
  '(accepted-but-vanished before); --adm2-kind flag (region default |\n' +
  'county) so the ADM2 block can write county rows;\n' +
  'apply-places-kind-vocab post-check now asserts county too.\n\n' +
  'LIVE (app stopped, restarted httpOk): triggers upgraded on news.db;\n' +
  'GB ingest --adm2-class=Q180673 --adm2-kind=county -> 52 counties\n' +
  'inserted (59 discovered, 7 dedupe); Leicestershire kind=county\n' +
  'confirmed. Gazetteer settlement kinds now county:52 town:18\n' +
  'village:20. Next: ActiveProbe county branch + bbc\n' +
  '/news/england/{slug} probe (county titles now resolvable).']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 8).join('\n'));
