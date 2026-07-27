const { ensureDb } = require('../../data/db/sqlite/ensureDb');
const { UrlResolver } = require('../../shared/utils/UrlResolver');
// Schema introspection is DB-shaped logic — delegated to ncdb (thin-coordination).
// The migration DDL/batch-UPDATE below is procedural migration logic and stays here.
const { getTableInfo, getTableIndexes, getColumnFillStats, getTableRowCount } = require('news-crawler-db');

async function normalizePlaceHubs() {
  const db = ensureDb();
  const urlResolver = new UrlResolver(db);

  console.log('Starting place_hubs URL normalization...');

  // Phase 1: Add new column (if not exists)
  console.log('Phase 1: Adding url_id column...');
  const hasUrlId = getTableInfo(db, 'place_hubs').some(col => col.name === 'url_id');

  if (!hasUrlId) {
    db.exec(`ALTER TABLE place_hubs ADD COLUMN url_id INTEGER REFERENCES urls(id)`);
  } else {
    console.log('url_id column already exists, skipping...');
  }

  // Phase 2: Migrate data in batches
  console.log('Phase 2: Migrating URL data...');
  const batchSize = 50;
  let totalProcessed = 0;

  while (true) {
    // Get all remaining rows with NULL url_id
    const rows = db.prepare(`
      SELECT id, url FROM place_hubs
      WHERE url_id IS NULL
      LIMIT ?
    `).all(batchSize);

    if (rows.length === 0) break;

    console.log(`Processing batch of ${rows.length} rows...`);
    const urlToIdMap = await urlResolver.batchResolve(rows.map(r => r.url));

    let updatedThisBatch = 0;
    for (const row of rows) {
      const urlId = urlToIdMap.get(row.url);
      if (!urlId) {
        console.error(`Failed to resolve URL ID for: ${row.url}`);
        continue;
      }
      db.prepare('UPDATE place_hubs SET url_id = ? WHERE id = ?')
         .run(urlId, row.id);
      updatedThisBatch += 1;
    }

    totalProcessed += updatedThisBatch;
    console.log(`Processed ${totalProcessed} rows so far...`);

    // No-progress guard (FIX 1): if not one row in this batch resolved to a url_id,
    // the next iteration re-selects the same NULL-url_id rows and the loop spins
    // forever. Break; Phase 4's NULL-count check then surfaces the unresolved rows.
    if (updatedThisBatch === 0) {
      console.warn(`No rows updated in this batch of ${rows.length}; stopping to avoid an infinite loop. Remaining NULL url_id rows will be reported by Phase 4.`);
      break;
    }
  }

  // Phase 3: Create index (if not exists)
  console.log('Phase 3: Creating index...');
  const hasIndex = getTableIndexes(db, 'place_hubs').some(idx => idx.name === 'idx_place_hubs_url');

  if (!hasIndex) {
    db.exec(`CREATE INDEX idx_place_hubs_url ON place_hubs(url_id)`);
  } else {
    console.log('Index idx_place_hubs_url already exists, skipping...');
  }

  // Phase 4: Validate migration
  console.log('Phase 4: Validating migration...');
  const nullCount = getColumnFillStats(db, 'place_hubs', 'url_id').without_value;
  if (nullCount > 0) {
    throw new Error(`${nullCount} rows still have NULL url_id`);
  }

  const totalRows = getTableRowCount(db, 'place_hubs');
  console.log(`place_hubs URL normalization complete! Migrated ${totalRows} rows.`);
}

if (require.main === module) {
  normalizePlaceHubs().then(() => process.exit(0)).catch(console.error);
}

module.exports = { normalizePlaceHubs };