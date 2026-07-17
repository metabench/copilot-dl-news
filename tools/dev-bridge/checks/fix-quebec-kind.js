'use strict';
// A-quirks: correct guardian's quebec hub place_kind country→region via
// ncdb fixPlaceHubKinds (auditable maintenance; writes place_hub_audit).
// Run with the Electron app STOPPED. Default dry-run; --apply writes.
// Deliberately a single explicit correction — slug→gazetteer joins are
// homonym-unsafe (see ncdb docs/PLACE_HUB_SCHEMA.md).
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));
const { fixPlaceHubKinds } = require('news-crawler-db');
const APPLY = process.argv.includes('--apply');
const db = new Database(path.join(REPO_ROOT, 'data', 'news.db'), { readonly: !APPLY });
if (APPLY) db.pragma('busy_timeout = 15000');

const report = fixPlaceHubKinds(db, [{
  host: 'theguardian.com', placeSlug: 'quebec', fromKind: 'country', toKind: 'region',
  reason: 'Quebec is a Canadian province (gazetteer region), not a country; screenshot-caught mislabel, docs/review/2026-07-17-place-hub-assessment.md'
}], { dryRun: !APPLY });
console.log(JSON.stringify(report, null, 1));
db.close();
console.log(APPLY ? 'APPLY DONE' : 'DRY-RUN DONE');
