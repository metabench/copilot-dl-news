'use strict';
// Drive ncdb's place_hubs maintenance against the live news.db (chunk A2).
// Default is DRY-RUN; pass --apply to write. Stop the Electron app before
// applying (single-writer discipline on the 28GB WAL DB).
// All logic lives in news-crawler-db (legacy-placeHubMaintenance.ts +
// vitest); this script is composition only.
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));
const {
  dedupePlaceHubs,
  reconcilePlacePageMappingPageKinds
} = require('news-crawler-db');

const apply = process.argv.includes('--apply');
const db = new Database(path.join(REPO_ROOT, 'data', 'news.db'), { readonly: !apply });
if (apply) db.pragma('busy_timeout = 15000');

const dedupe = dedupePlaceHubs(db, { dryRun: !apply });
console.log(`dedupe (${apply ? 'APPLIED' : 'dry-run'}): groups=${dedupe.groups} deleted=${dedupe.deleted.length} mappingsRepointed=${dedupe.mappingsRepointed}`);
for (const d of dedupe.details.slice(0, 30)) {
  console.log(`  ${d.host} ${d.placeSlug}/${d.placeKind}: keep ${d.keeperId}, drop [${d.deletedIds.join(',')}]${d.mappingsRepointed ? `, repoint ${d.mappingsRepointed} mapping(s)` : ''}`);
}
if (dedupe.details.length > 30) console.log(`  … +${dedupe.details.length - 30} more groups`);

const kinds = reconcilePlacePageMappingPageKinds(db, { dryRun: !apply });
console.log(`pageKind reconcile (${apply ? 'APPLIED' : 'dry-run'}): renamed=${kinds.renamed} mergedDeleted=${kinds.mergedDeleted} twinsUpgraded=${kinds.twinsUpgraded}`);
console.log(`  perKind: ${JSON.stringify(kinds.perKind)}`);

const remaining = db.prepare(`
  SELECT COUNT(*) n FROM (SELECT 1 FROM place_hubs WHERE place_slug IS NOT NULL
  GROUP BY host, place_slug, place_kind HAVING COUNT(*) > 1)`).get().n;
const total = db.prepare('SELECT COUNT(*) n FROM place_hubs').get().n;
console.log(`post-state: place_hubs=${total}, remaining dup groups=${remaining}`);
db.close();
console.log(apply ? 'APPLY DONE' : 'DRY-RUN DONE (no writes)');
