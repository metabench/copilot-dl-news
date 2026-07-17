'use strict';
// Commit + push copilot: slice 5 (adapter codemod) + A3 driver + memory.
// Shim deletions staged by retire-slice5-shims.js; codemod rewrote 26
// consumer files in the working tree. Explicit excludes for the owner's
// dirty files via pathspec magic: add everything under src/ + tests/ that
// the codemod touched is too broad to list — instead add the codemod's
// exact file list (26) + this turn's checks + docs.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

// The 26 codemodded files (from codemod-apply1 output) + checks + docs.
git(['add', '--',
  'src/api/v1/gateway.js',
  'src/billing/FeatureGate.js',
  'src/billing/SubscriptionService.js',
  'src/billing/UsageTracker.js',
  'src/core/crawler/planner/StructureMiner.js',
  'src/core/crawler/scheduler/ScheduleStore.js',
  'src/intelligence/analysis/recommendations/RecommendationEngine.js',
  'src/intelligence/analysis/recommendations/TagRecommender.js',
  'src/intelligence/analysis/recommendations/TrendingCalculator.js',
  'src/intelligence/analysis/similarity/DuplicateDetector.js',
  'src/intelligence/analysis/tagging/TaggingService.js',
  'src/ui/server/adminDashboard/checks/admin-dashboard.check.js',
  'src/ui/server/adminDashboard/server.js',
  'src/ui/server/schedulerDashboard/server.js',
  'src/ui/server/webhookDashboard/server.js',
  'tests/admin/adminAdapter.test.js',
  'tests/admin/AdminService.test.js',
  'tests/admin/AuditLogger.test.js',
  'tests/billing/billingAdapter.test.js',
  'tests/billing/FeatureGate.test.js',
  'tests/billing/SubscriptionService.test.js',
  'tests/billing/UsageTracker.test.js',
  'tests/crawler/scheduler/CrawlScheduler.test.js',
  'tests/db/pushAdapter.test.js',
  'tests/integrations/integrationAdapter.test.js',
  'tests/trust/trustAdapter.test.js',
  'tools/dev-bridge/checks/codemod-adapter-repoint.js',
  'tools/dev-bridge/checks/retire-slice5-shims.js',
  'tools/dev-bridge/checks/backfill-hub-validations.js',
  'tools/dev-bridge/checks/smoke-uapp-db-repoint.js',
  'tools/dev-bridge/checks/commit-ncdb-a3.js',
  'tools/dev-bridge/checks/commit-copilot-s5.js',
  'docs/plans/2026-07-17-coordination-point-migration.md',
  'docs/review/2026-07-17-place-hub-assessment.md',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md'
]);
git(['commit', '-m',
  'Slice 5: codemod 19 pure adapter shims away + A3 validations backfill driver\n\n' +
  'B — DB-consolidation slice 5: delete the 19 pure adapter shims (admin,\n' +
  'alert, apiKey, articles, billing, coverage, healing, integration,\n' +
  'layout, push, recommendation, schedule, sentiment, similarity,\n' +
  'summary, tag, templateReview, topic, trust); consumers repointed by\n' +
  'codemod (checks/codemod-adapter-repoint.js) — 26 files in one pass\n' +
  '(15 src + 11 tests). search/user/workspace adapters carry renames and\n' +
  'are deferred. Verified: surface smoke 142 functions (the smoke itself\n' +
  'caught a wrong guessed name — healingAdapter exports functions, not a\n' +
  'factory; names now shim-verified via git show), tests/billing 92/92.\n' +
  'src/data/db: 167 -> 148 files.\n\n' +
  'A3 — hub_validations backfill driver (logic in ncdb 3a56ff3): applied\n' +
  'with the app stopped — 368 candidates, 365 inserted (3 duplicate-URL\n' +
  'ignores under the global hub_url unique), ledger 169 -> 534; methods\n' +
  'now backfill-mapping-evidence 365 / ai-review 160 / crawl-content 7 /\n' +
  'crawl-fetch-404 2. Pre-expired entries would queue as\n' +
  'expired-validation honestly; none were.\n\n' +
  'Process: codemod is now the default for >10-consumer repoints.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 10).join('\n'));
