'use strict';
// Commit + push the AI-operable place-hub review API.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

git(['add', '--',
  'src/server/place-hub-review/registerPlaceHubReviewRoutes.js',
  'src/server/place-hub-review/__tests__/placeHubReviewApi.test.js',
  'src/ui/server/unifiedApp/server.js',
  'docs/agents/PLACE_HUB_REVIEW_API.md',
  'docs/plans/2026-07-16-place-hub-intelligence.md',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md',
  'tools/dev-bridge/checks/commit-review-api.js'
]);
git(['commit', '-m',
  'AI-operable place-hub review API: uncertain decisions out, corrections in\n\n' +
  'New surface /api/v1/place-hubs/* on the unified server, built so an AI\n' +
  'agent can maintain classification unattended (operator guide in\n' +
  'docs/agents/PLACE_HUB_REVIEW_API.md):\n' +
  '- GET review-queue: unknown terms, unverified candidates, expired\n' +
  '  validations (2y TTL), structure-change events, uncertain patterns --\n' +
  '  each with evidence and suggested actions.\n' +
  '- GET classify / GET search: probe the classifier and place-keyed hub\n' +
  '  retrieval before deciding.\n' +
  '- POST overrides: mark-non-geo, resolve-unknown-term, confirm/\n' +
  '  reject-place-hub -- writes hub_validations, candidate verdicts,\n' +
  '  place_page_mappings.\n' +
  '- POST heuristics/patterns: upsert/demote rows in the DB rule base\n' +
  '  (domain \'*\' = cross-site prior) -- heuristics are data, not code.\n' +
  '- POST actions/learn + actions/assess-structure.\n' +
  'All mutations require agent+reason and append place_hub_audit rows.\n\n' +
  'First live session (this commit): 8 API calls settled 129 unknown-term\n' +
  'rows (politics/science/global-development/world/all -> non-geo;\n' +
  'andorra -> confirmed country hub with validation + mapping) and\n' +
  'retired a junk reuters.com/world -> Andorra mapping surfaced by the\n' +
  'search endpoint. Live-found bug fixed with regression test:\n' +
  'unknown_terms stores www-prefixed hosts, resolve-unknown-term now\n' +
  'matches both forms. Jest 9/9 on the target machine.\n\n' +
  'Legacy GOFAI verdict (docs/plans/...place-hub-intelligence.md Part 5):\n' +
  'PlannerHost plugins stay; microprolog SLD engine remains unintegrated\n' +
  '-- the flat DB pattern table is the rule formalism, editable via this\n' +
  'API; revisit only if containment reasoning demands recursion.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log(git(['push']).trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n')[0]);
