'use strict';
// Commit + push copilot: A7 — bbc county hubs live (second publisher).
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'src/core/orchestration/DomainProcessor.js',
  'src/core/orchestration/ActiveProbeProcessor.js',
  'src/services/CityHubGapAnalyzer.js',
  'tools/dev-bridge/checks/commit-a7-bbc-county-hubs.js'
]);
git(['commit', '-m',
  'A7: bbc county hubs — 19 validated, second publisher live\n\n' +
  "county: 'county-hub' added to PLACE_KIND_TO_PAGE_KIND BEFORE any\n" +
  'county hub write (the country-hub fallback would have mislabeled).\n' +
  'ActiveProbe gains a county branch: counties are not settlements, so\n' +
  'selection is country-scoped via CityHubGapAnalyzer.getCountiesByCountry\n' +
  '(ncdb getPlacesByCountryAndKind is already kind-generic) and REQUIRES\n' +
  '--parent <country> by design.\n\n' +
  'LIVE (app stopped, restarted httpOk): dry probe exposed BBC slug\n' +
  'reality — county-NAME slugs exist for many English counties\n' +
  '(norfolk, suffolk, cornwall...) while others use city stems\n' +
  '(leicester -> "Leicestershire") or combined regions\n' +
  '(beds_bucks_and_herts); Scottish counties 404 under /news/england/\n' +
  'honestly. Full 111-target apply -> 19 validated county hubs on\n' +
  'bbc.co.uk with real titles ("Cornwall | Latest News & Updates |\n' +
  'BBC News"); /place-hubs-table?kind=county serves all 19. bbc DSPL\n' +
  'countyHubPatterns written as a data op (gitignored runtime), noting\n' +
  'the England scope and slug exceptions.\n\n' +
  'Gazetteer-to-UI arc now proven for a THIRD place granularity and a\n' +
  'SECOND publisher.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 6).join('\n'));
