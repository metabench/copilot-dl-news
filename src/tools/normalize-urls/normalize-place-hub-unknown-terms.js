const { ensureDb } = require('../../db/sqlite/ensureDb');
const { UrlResolver } = require('../../utils/UrlResolver');

async function normalizePlaceHubUnknownTerms() {
  const db = ensureDb();
  const urlResolver = new UrlResolver(db);

  console.log('Starting place_hub_unknown_terms URL normalization...');

  // Phase 1: Add new columns (if not exists)
  console.log('Phase 1: Adding url_id columns...');
  const columns = db.prepare("PRAGMA table_info(place_hub_unknown_terms)").all();
  const hasUrlId = columns.some(col => col.name === 'url_id');
  const hasCanonicalUrlId = columns.some(col => col.name === 'canonical_url_id');

  if (!hasUrlId) {
    db.exec(`ALTER TABLE place_hub_unknown_terms ADD COLUMN url_id INTEGER REFERENCES urls(id)`);
  } else {
    console.log('url_id column already exists, skipping...');
  }

  if (!hasCanonicalUrlId) {
    db.exec(`ALTER TABLE place_hub_unknown_terms ADD COLUMN canonical_url_id INTEGER REFERENCES urls(id)`);
  } else {
    console.log('canonical_url_id column already exists, skipping...');
  }

  // Phase 2: Migrate data in batches
  console.log('Phase 2: Migrating URL data...');
  const batchSize = 100;
  let totalProcessed = 0;

  while (true) {
    // Get all remaining rows with NULL url_ids
    const rows = db.prepare(`
      SELECT id, url, canonical_url FROM place_hub_unknown_terms
      WHERE url_id IS NULL OR canonical_url_id IS NULL
      LIMIT ?
    `).all(batchSize);

    if (rows.length === 0) break;

    console.log(`Processing batch of ${rows.length} rows...`);
    // Collect all URLs for batch resolution (canonical_url can be NULL)
    const allUrls = [];
    for (const row of rows) {
      allUrls.push(row.url);
      if (row.canonical_url) {
        allUrls.push(row.canonical_url);
      }
    }
    const uniqueUrls = [...new Set(allUrls)];

    const urlToIdMap = await urlResolver.batchResolve(uniqueUrls);

    for (const row of rows) {
      const urlId = urlToIdMap.get(row.url);
      const canonicalUrlId = row.canonical_url ? urlToIdMap.get(row.canonical_url) : null;

      if (!urlId) {
        console.error(`Failed to resolve URL ID for url: ${row.url}`);
        continue;
      }

      db.prepare(`
        UPDATE place_hub_unknown_terms
        SET url_id = ?, canonical_url_id = ?
        WHERE id = ?
      `).run(urlId, canonicalUrlId, row.id);
    }

    totalProcessed += rows.length;
    console.log(`Processed ${totalProcessed} rows so far...`);
  }

  // Phase 3: Create indexes (if not exists)
  console.log('Phase 3: Creating indexes...');
  const indexes = db.prepare("PRAGMA index_list(place_hub_unknown_terms)").all();
  const hasUrlIndex = indexes.some(idx => idx.name === 'idx_place_hub_unknown_terms_url');
  const hasCanonicalIndex = indexes.some(idx => idx.name === 'idx_place_hub_unknown_terms_canonical_url');

  if (!hasUrlIndex) {
    db.exec(`CREATE INDEX idx_place_hub_unknown_terms_url ON place_hub_unknown_terms(url_id)`);
  } else {
    console.log('Index idx_place_hub_unknown_terms_url already exists, skipping...');
  }

  if (!hasCanonicalIndex) {
    db.exec(`CREATE INDEX idx_place_hub_unknown_terms_canonical_url ON place_hub_unknown_terms(canonical_url_id)`);
  } else {
    console.log('Index idx_place_hub_unknown_terms_canonical_url already exists, skipping...');
  }

  // Phase 4: Validate migration
  console.log('Phase 4: Validating migration...');
  const nullUrlCount = db.prepare('SELECT COUNT(*) as count FROM place_hub_unknown_terms WHERE url_id IS NULL').get().count;
  const nullCanonicalCount = db.prepare('SELECT COUNT(*) as count FROM place_hub_unknown_terms WHERE canonical_url IS NOT NULL AND canonical_url_id IS NULL').get().count;

  if (nullUrlCount > 0) {
    throw new Error(`${nullUrlCount} rows still have NULL url_id`);
  }
  if (nullCanonicalCount > 0) {
    throw new Error(`${nullCanonicalCount} rows have canonical_url but NULL canonical_url_id`);
  }

  const totalRows = db.prepare('SELECT COUNT(*) as count FROM place_hub_unknown_terms').get().count;
  console.log(`place_hub_unknown_terms URL normalization complete! Migrated ${totalRows} rows.`);
}

if (require.main === module) {
  normalizePlaceHubUnknownTerms().then(() => process.exit(0)).catch(console.error);
}

module.exports = { normalizePlaceHubUnknownTerms };