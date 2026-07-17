'use strict';
// Commit + push news-crawler-db: A3 validations backfill.
const path = require('path');
const { execFileSync } = require('child_process');
const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const git = (args) => execFileSync('git', args, {
  cwd: path.join(WORKSPACE, 'news-crawler-db'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000
});
git(['add', '--',
  'src/db/sqlite/access/legacy-placeHubMaintenance.ts',
  'src/db/__tests__/unit/sqlite/legacyPlaceHubMaintenance.test.ts',
  'src/db/index.ts'
]);
git(['commit', '-m',
  'backfillHubValidationsFromMappings: complete the hub_validations ledger (A3)\n\n' +
  'Verified place_page_mappings lacking a hub_validations row get one\n' +
  'derived from their own evidence: validation_method\n' +
  'backfill-mapping-evidence, validated_at = COALESCE(verified_at,\n' +
  'last_seen_at), expires_at = validated_at + ttlDays (default 730).\n' +
  'Entries already past TTL arrive expired ON PURPOSE — they surface in\n' +
  'the review queue as expired-validation and drive honest revalidation\n' +
  'instead of fabricating freshness. INSERT OR IGNORE respects the\n' +
  'global UNIQUE(hub_url) (docs/PLACE_HUB_SCHEMA.md). dryRun mode.\n\n' +
  'vitest 8/8. First live apply (copilot checks/backfill-hub-\n' +
  'validations.js, app stopped): 368 candidates -> 365 inserted (3\n' +
  'duplicate-URL ignores), ledger 169 -> 534.']);
console.log('committed:', git(['rev-parse', '--short', 'HEAD']).trim());
console.log('push:', (git(['push']) || 'pushed').trim() || 'pushed');
console.log(git(['status', '-sb']).split('\n').slice(0, 4).join('\n'));
