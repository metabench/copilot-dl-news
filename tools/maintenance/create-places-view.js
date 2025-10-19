#!/usr/bin/env node

const { ensureDatabase } = require('../../src/db/sqlite/v1/index');

const db = ensureDatabase('./data/news.db');

// Create the places_view for backward compatibility
// Note: Currently the places table is still denormalized, so this view
// simply selects from places. When place_provenance and place_attributes
// are populated, this view can be updated to aggregate from those tables.
const createViewSQL = `
CREATE VIEW places_view AS
SELECT
    id,
    kind,
    country_code,
    adm1_code,
    adm2_code,
    population,
    timezone,
    lat,
    lng,
    bbox,
    canonical_name_id,
    source,
    extra,
    status,
    valid_from,
    valid_to,
    wikidata_qid,
    osm_type,
    osm_id,
    area,
    gdp_usd,
    wikidata_admin_level,
    wikidata_props,
    osm_tags,
    crawl_depth,
    priority_score,
    last_crawled_at
FROM places;
`;

try {
    // Drop existing view if it exists
    try {
        db.exec('DROP VIEW IF EXISTS places_view');
        console.log('🗑️  Dropped existing places_view');
    } catch (dropError) {
        console.log('ℹ️  No existing view to drop');
    }

    db.exec(createViewSQL);
    console.log('✅ places_view created successfully');

    // Test the view
    const count = db.prepare('SELECT COUNT(*) as count FROM places_view').get();
    console.log(`📊 places_view contains ${count.count} rows`);

    // Compare with original places table
    const originalCount = db.prepare('SELECT COUNT(*) as count FROM places').get();
    console.log(`📊 Original places table contains ${originalCount.count} rows`);

    if (count.count === originalCount.count) {
        console.log('✅ Row counts match - view reconstruction successful');
    } else {
        console.log('⚠️  Row counts differ - may indicate data integrity issues');
        console.log(`   Difference: ${Math.abs(count.count - originalCount.count)} rows`);
    }

} catch (error) {
    console.error('❌ Error creating view:', error.message);
} finally {
    db.close();
}