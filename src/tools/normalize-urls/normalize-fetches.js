const { ensureDb } = require('../../db/sqlite/ensureDb');
const { UrlResolver } = require('../../utils/UrlResolver');

async function normalizeFetches() {
  const db = ensureDb();
  const urlResolver = new UrlResolver(db);

  console.log('Starting fetches URL normalization...');

  // Phase 1: Add new column (if not exists)
  console.log('Phase 1: Adding url_id column...');
  const columns = db.prepare("PRAGMA table_info(fetches)").all();
  const hasUrlId = columns.some(col => col.name === 'url_id');

  if (!hasUrlId) {
    db.exec(`ALTER TABLE fetches ADD COLUMN url_id INTEGER REFERENCES urls(id)`);
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
      SELECT id, url FROM fetches
      WHERE url_id IS NULL
      LIMIT ?
    `).all(batchSize);

    if (rows.length === 0) break;

    console.log(`Processing batch of ${rows.length} rows...`);
    const urlToIdMap = await urlResolver.batchResolve(rows.map(r => r.url));

    for (const row of rows) {
      const urlId = urlToIdMap.get(row.url);
      if (!urlId) {
        console.error(`Failed to resolve URL ID for: ${row.url}`);
        continue;
      }
      db.prepare('UPDATE fetches SET url_id = ? WHERE id = ?')
         .run(urlId, row.id);
    }

    totalProcessed += rows.length;
    console.log(`Processed ${totalProcessed} rows so far...`);
  }

  // Phase 3: Create index (if not exists)
  console.log('Phase 3: Creating index...');
  const indexes = db.prepare("PRAGMA index_list(fetches)").all();
  const hasIndex = indexes.some(idx => idx.name === 'idx_fetches_url');

  if (!hasIndex) {
    db.exec(`CREATE INDEX idx_fetches_url ON fetches(url_id)`);
  } else {
    console.log('Index idx_fetches_url already exists, skipping...');
  }

  // Phase 4: Validate migration
  console.log('Phase 4: Validating migration...');
  const nullCount = db.prepare('SELECT COUNT(*) as count FROM fetches WHERE url_id IS NULL').get().count;
  if (nullCount > 0) {
    throw new Error(`${nullCount} rows still have NULL url_id`);
  }

  const totalRows = db.prepare('SELECT COUNT(*) as count FROM fetches').get().count;
  console.log(`fetches URL normalization complete! Migrated ${totalRows} rows.`);
}

if (require.main === module) {
  normalizeFetches().then(() => process.exit(0)).catch(console.error);
}

module.exports = { normalizeFetches };