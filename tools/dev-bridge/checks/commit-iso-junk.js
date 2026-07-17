'use strict';
// Commit + push chunk A4: ISO-code junk mappings retired via the review API.
// Data changes live in news.db (audited place_hub_audit rows); this commit is
// the session script + probe + memory. Explicit pathspecs — owner editing
// .claude/settings*, wysiwyg bundle.js*, docs/INDEX.md, SESSIONS_HUB.md.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

git(['add', '--',
  'tools/dev-bridge/checks/retire-iso-junk-mappings.js',
  'tools/dev-bridge/checks/probe-iso-junk-mappings.js',
  'tools/dev-bridge/checks/commit-iso-junk.js',
  'docs/review/2026-07-17-place-hub-assessment.md',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md'
]);
git(['commit', '-m',
  'Retire 124 ISO-code junk place mappings via the review API (chunk A4)\n\n' +
  'docs/review/2026-07-17-place-hub-assessment.md gap: URLs whose tail is\n' +
  'a bare ISO-3166 code were mapped (and partly "verified") as country\n' +
  'hubs. Scoping showed 3 hosts, not the 2 the assessment named:\n' +
  '- semana.com and eltiempo.com (same publisher family) each enumerate\n' +
  '  /news/<cc> for ~50 ISO codes — all "verified", including Tokelau\n' +
  '  and Wallis-and-Futuna: a catch-all-200 bulk mis-verification.\n' +
  '- independent.co.uk /topic/<cc>: ~24 pending pattern guesses.\n\n' +
  'checks/retire-iso-junk-mappings.js is a host-side API-client session\n' +
  '(dry-run default, --apply): every rejection went THROUGH\n' +
  'POST /api/v1/place-hubs/overrides with agent claude-loop-a4 and a\n' +
  'per-row reason — 124 posted, 0 failed, place_hub_audit 2 -> 126.\n' +
  'The one verified-but-plausible row (independent /topic/us) was\n' +
  'classify-probed (candidate 0.75 = cold-start prior, not content\n' +
  'proof) and deliberately left for a content check.\n\n' +
  'Verified: search?place=andorra now returns only the legitimate\n' +
  'Guardian rows. Noted for later: the search joins hubs by URL form\n' +
  '(www-variant mapping shows placeHubId null after the A2 dedupe kept\n' +
  'the non-www hub); one malformed subcontinent mapping\n' +
  '(world/asia-pacific+world/south-and-central-asia) on Andorra.\n\n' +
  'Loop lesson recorded: batch data operations through the audited API\n' +
  'in ONE run-node session script rather than N bridge http calls.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 10).join('\n'));
