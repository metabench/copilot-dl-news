const HubValidator = require('../../src/geo/hub-validation/HubValidator');
const { resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');
const { ensureDb } = require('../../src/data/db/sqlite');

const {
  deletePlaceHubById,
  listPlaceHubCleanupRows
} = resolveNewsCrawlerDbModule();

async function cleanupInvalidHubs() {
  const db = ensureDb('./data/news.db');
  const validator = new HubValidator(db);

  const hubs = listPlaceHubCleanupRows(db);

  console.log(`Found ${hubs.length} place hubs to validate`);

  let removed = 0;
  let kept = 0;

  for (const hub of hubs) {
    // Extract place name from slug
    const placeName = hub.place_slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    console.log(`Validating: ${hub.url} (${hub.place_kind}: ${placeName})`);

    try {
      const result = await validator.validateHubContent(hub.url, placeName);

      if (!result.isValid) {
        console.log(`❌ INVALID: ${result.reason}`);
        // Remove invalid hub
        deletePlaceHubById(db, hub.id);
        removed++;
      } else {
        console.log(`✅ VALID: ${result.reason}`);
        kept++;
      }
    } catch (err) {
      console.error(`Error validating ${hub.url}: ${err.message}`);
      // On error, keep the hub (better safe than sorry)
      kept++;
    }

    // Small delay to be respectful
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\nSummary:`);
  console.log(`- Kept: ${kept} valid hubs`);
  console.log(`- Removed: ${removed} invalid hubs`);

  db.close();
}

cleanupInvalidHubs().catch(console.error);
