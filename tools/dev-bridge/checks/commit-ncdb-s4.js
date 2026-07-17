'use strict';
// Commit + push news-crawler-db: normalizeTopicHubLang export (latent-bug
// fix) + fixPlaceHubKinds maintenance fn + index exports (multi-chunk turn).
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'news-crawler-db'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'src/db/index.ts',
  'src/db/sqlite/access/legacy-placeHubMaintenance.ts',
  'src/db/__tests__/unit/sqlite/legacyPlaceHubMaintenance.test.ts'
]);
git(['commit', '-m',
  'Export normalizeTopicHubLang (latent-bug fix) + fixPlaceHubKinds maintenance\n\n' +
  '- index.ts never re-exported the topic-hub module\'s normalizeLang, so\n' +
  '  copilot\'s topicHubGuessingUiQueries shim destructured undefined and\n' +
  '  three topic-hub route handlers would throw when hit. Caught by the\n' +
  '  slice-4 surface smoke during shim retirement. Exported under the\n' +
  '  distinct name normalizeTopicHubLang (other modules export their own\n' +
  '  normalizers).\n' +
  '- fixPlaceHubKinds(db, corrections, {dryRun}): explicit-list place_kind\n' +
  '  corrections with a place_hub_audit trail (decision\n' +
  '  maintenance-kind-fix). Deliberately refuses to derive corrections\n' +
  '  from slug joins — homonyms (guatemala/panama/mexico city vs country)\n' +
  '  make that unsafe; doc-noted. First live use: guardian quebec hub\n' +
  '  country -> region. vitest 7/7.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 4).join('\n'));
