'use strict';
// Commit + push the copilot side of chunk A5 (probe + memory; the reference
// doc itself lives in news-crawler-db a5acaf0). Explicit pathspecs — owner
// editing .claude/settings*, wysiwyg bundle.js*, docs/INDEX.md,
// SESSIONS_HUB.md.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'copilot-dl-news'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});

git(['add', '--',
  'tools/dev-bridge/checks/probe-placehub-ddl.js',
  'tools/dev-bridge/checks/commit-ncdb-schemadoc.js',
  'tools/dev-bridge/checks/commit-copilot-schemadoc.js',
  'docs/review/2026-07-17-place-hub-assessment.md',
  'docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md'
]);
git(['commit', '-m',
  'Place-hub schema reference landed in ncdb (chunk A5): probe + memory\n\n' +
  'The reference itself is news-crawler-db docs/PLACE_HUB_SCHEMA.md\n' +
  '(a5acaf0) — schema truth belongs to the DB repo. This commit carries\n' +
  'the live-DDL probe (checks/probe-placehub-ddl.js) and memory updates.\n\n' +
  'Corrections the DDL probe surfaced (now pinned in the reference):\n' +
  '- uq_place_hubs_entity is an expression unique including\n' +
  '  COALESCE(topic_slug,\'\') — the A2 duplicates were topic-annotated\n' +
  '  vs bare rows coexisting, not just www/non-www url_id variants.\n' +
  '- hub_validations.hub_url is globally unique; the ledger grew 11->135\n' +
  '  through the A4 rejection writes — A3 backfill planning should start\n' +
  '  from 135 and split rejected vs valid.\n' +
  '- unknown_terms: 4,157 open rows, no resolution column (resolution =\n' +
  '  row clearing). place_hub_guess_runs: never written (wire or drop).\n' +
  '- Narrative-drift examples recorded (scope not scope_domain;\n' +
  '  status+validation_status not verdict) — the reason the doc exists.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 10).join('\n'));
