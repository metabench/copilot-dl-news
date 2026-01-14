const { ensureDb } = require('../../data/db/sqlite/ensureDb');
const { UrlResolver } = require('../../shared/utils/UrlResolver');

async function normalizePlaceHubCandidates() {
  const db = ensureDb();
  const urlResolver = new UrlResolver(db);

  console.log('Starting place_hub_candidates URL normalization...');

  // Phase 1: Add new columns (if not exists)
  console.log('Phase 1: Adding url_id columns...');
  const columns = db.prepare("PRAGMA table_info(place_hub_candidates)").all();
  const hasCandidateUrlId = columns.some(col => col.name === 'candidate_url_id');
  const hasNormalizedUrlId = columns.some(col => col.name === 'normalized_url_id');

  if (!hasCandidateUrlId) {
    db.exec(`ALTER TABLE place_hub_candidates ADD COLUMN candidate_url_id INTEGER REFERENCES urls(id)`);
  } else {
    console.log('candidate_url_id column already exists, skipping...');
  }

  if (!hasNormalizedUrlId) {
    db.exec(`ALTER TABLE place_hub_candidates ADD COLUMN normalized_url_id INTEGER REFERENCES urls(id)`);
  } else {
    console.log('normalized_url_id column already exists, skipping...');
  }

  // Phase 2: Migrate data in batches
  console.log('Phase 2: Migrating URL data...');
  const batchSize = 50;
  let totalProcessed = 0;

  while (true) {
    // Get all remaining rows with NULL url_ids
    const rows = db.prepare(`
      SELECT id, candidate_url, normalized_url FROM place_hub_candidates
      WHERE candidate_url_id IS NULL OR normalized_url_id IS NULL
      LIMIT ?
    `).all(batchSize);

    if (rows.length === 0) break;

    console.log(`Processing batch of ${rows.length} rows...`);
    // Collect all URLs for batch resolution
    const allUrls = [];
    for (const row of rows) {
      allUrls.push(row.candidate_url, row.normalized_url);
    }
    const uniqueUrls = [...new Set(allUrls)];

    const urlToIdMap = await urlResolver.batchResolve(uniqueUrls);

    for (const row of rows) {
      const candidateUrlId = urlToIdMap.get(row.candidate_url);
      const normalizedUrlId = urlToIdMap.get(row.normalized_url);

      if (!candidateUrlId || !normalizedUrlId) {
        console.error(`Failed to resolve URL IDs for row ${row.id}: candidate=${row.candidate_url}, normalized=${row.normalized_url}`);
        continue;
      }

      db.prepare(`
        UPDATE place_hub_candidates
        SET candidate_url_id = ?, normalized_url_id = ?
        WHERE id = ?
      `).run(candidateUrlId, normalizedUrlId, row.id);
    }

    totalProcessed += rows.length;
    console.log(`Processed ${totalProcessed} rows so far...`);
  }

  // Phase 3: Create indexes (if not exists)
  console.log('Phase 3: Creating indexes...');
  const indexes = db.prepare("PRAGMA index_list(place_hub_candidates)").all();
  const hasCandidateIndex = indexes.some(idx => idx.name === 'idx_place_hub_candidates_candidate_url');
  const hasNormalizedIndex = indexes.some(idx => idx.name === 'idx_place_hub_candidates_normalized_url');

  if (!hasCandidateIndex) {
    db.exec(`CREATE INDEX idx_place_hub_candidates_candidate_url ON place_hub_candidates(candidate_url_id)`);
  } else {
    console.log('Index idx_place_hub_candidates_candidate_url already exists, skipping...');
  }

  if (!hasNormalizedIndex) {
    db.exec(`CREATE INDEX idx_place_hub_candidates_normalized_url ON place_hub_candidates(normalized_url_id)`);
  } else {
    console.log('Index idx_place_hub_candidates_normalized_url already exists, skipping...');
  }

  // Phase 4: Validate migration
  console.log('Phase 4: Validating migration...');
  const nullCandidateCount = db.prepare('SELECT COUNT(*) as count FROM place_hub_candidates WHERE candidate_url_id IS NULL').get().count;
  const nullNormalizedCount = db.prepare('SELECT COUNT(*) as count FROM place_hub_candidates WHERE normalized_url_id IS NULL').get().count;

  if (nullCandidateCount > 0) {
    throw new Error(`${nullCandidateCount} rows still have NULL candidate_url_id`);
  }
  if (nullNormalizedCount > 0) {
    throw new Error(`${nullNormalizedCount} rows still have NULL normalized_url_id`);
  }

  const totalRows = db.prepare('SELECT COUNT(*) as count FROM place_hub_candidates').get().count;
  console.log(`place_hub_candidates URL normalization complete! Migrated ${totalRows} rows.`);
}

if (require.main === module) {
  normalizePlaceHubCandidates().then(() => process.exit(0)).catch(console.error);
}

module.exports = { normalizePlaceHubCandidates };