'use strict';
// Commit + push copilot: jest coverage for the admin-class-map review
// endpoints shipped in 9e763783 (they had only a live curl test).
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'src/server/place-hub-review/__tests__/placeHubReviewApi.test.js',
  'tools/dev-bridge/checks/commit-a7-api-coverage.js',
]);
git(['commit', '-m',
  'A7: jest coverage for the admin-class-map review endpoints\n\n' +
  'The GET/POST /api/v1/place-hubs/admin-class-map[/verify] routes\n' +
  'shipped in 9e763783 with only a live curl test — no automated\n' +
  'regression guard. Adds a describe block to the existing review-API\n' +
  'suite: list + verifiedOnly filter, the verify flip (kind correction\n' +
  '+ review provenance + audit row), and the refusals (400 anonymous,\n' +
  '404 unknown key). Uses the in-memory :memory: db the suite already\n' +
  'builds; ncdb seed/list/setAdminClassReview ensure the table on first\n' +
  'touch. Suite 15/15 (was 12).',
]);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '--porcelain']).split('\n').filter(l => /^.?[DM]/.test(l)).slice(0, 4).join('\n') || '(no stray tracked changes)');
