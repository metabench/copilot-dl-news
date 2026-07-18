'use strict';
// B5 codemod: repoint consumers of the 19 PURE adapter shims (no renames)
// from src/data/db/sqlite/v1/queries/<name> to 'news-crawler-db'.
// searchAdapter/userAdapter/workspaceAdapter carry renames — DEFERRED, not
// touched. Ghost paths (src/db/...) are left alone (already dead).
// Default DRY-RUN (lists rewrites); --apply writes files.
const path = require('path');
const fs = require('fs');
const APPLY = process.argv.includes('--apply');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const PURE = ['adminAdapter', 'alertAdapter', 'apiKeyAdapter', 'articlesAdapter',
  'billingAdapter', 'coverageAdapter', 'healingAdapter', 'integrationAdapter',
  'layoutAdapter', 'pushAdapter', 'recommendationAdapter', 'scheduleAdapter',
  'sentimentAdapter', 'similarityAdapter', 'summaryAdapter', 'tagAdapter',
  'templateReviewAdapter', 'topicAdapter', 'trustAdapter',
  // B6 (2026-07-17): v1 gazetteer cluster — all pure, no renames.
  'gazetteer\\.attributes', 'gazetteer\\.deduplication', 'gazetteer\\.duplicates',
  'gazetteer\\.export', 'gazetteer\\.ingest', 'gazetteer\\.names',
  'gazetteer\\.osm', 'gazetteer\\.places', 'gazetteer\\.populateTool',
  'gazetteer\\.progress', 'gazetteer\\.search', 'gazetteer\\.utils',
  'gazetteerPlaceNames',
  // B6b: workspace/user adapters — renamed exports exist but are consumed
  // nowhere (generateSlug) / no live consumers at all (userAdapter).
  'workspaceAdapter', 'userAdapter',
  // B8 (2026-07-18): queries/* sweep — consumers verified to use only
  // identical-named exports (renamed exports like normalizeTerm /
  // MULTI_LANGUAGE_PLACE_* consts are consumed nowhere). placeHubs (bare)
  // and queries/schema are NOT here: their consumers use renamed exports
  // (normalizeHost, tableExists) and get manual alias edits instead.
  'analysis\\.showAnalysis', 'articles\\.backfillDates', 'backgroundTasks',
  'layoutMasks', 'layoutSignatures', 'layoutTemplates', 'maintenance',
  'multiModalCrawl', 'patternLearning', 'placeHubs\\.crawlTool',
  'placePageMappings', 'topicKeywords', 'crawlSkipTerms',
  'multiLanguagePlaces',
  // B9: urlListingNormalized facade absorbed into ncdb (ncdb cb4038e) —
  // all 15 historical names now on the ncdb surface, no renames.
  'ui/urlListingNormalized'];
const RX = new RegExp(
  `require\\((['"])(?:\\.\\./)*(?:src/)?data/db/sqlite/v1/queries/(${PURE.join('|')})\\1\\)`, 'g');

const changed = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) {
      const src = fs.readFileSync(p, 'utf8');
      if (!RX.test(src)) { RX.lastIndex = 0; continue; }
      RX.lastIndex = 0;
      const out = src.replace(RX, (m, q) => `require(${q}news-crawler-db${q})`);
      const n = (src.match(RX) || []).length; RX.lastIndex = 0;
      changed.push({ file: path.relative(ROOT, p), n });
      if (APPLY) fs.writeFileSync(p, out);
    }
  }
}
for (const d of ['src', 'tests', 'tools']) walk(path.join(ROOT, d));
for (const c of changed) console.log(`${APPLY ? 'rewrote' : 'would rewrite'} ${c.file} (${c.n})`);
console.log(`files: ${changed.length}; ${APPLY ? 'APPLIED' : 'dry-run'}`);
