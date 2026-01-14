#!/usr/bin/env node

const { ensureDatabase } = require('../../src/data/db/sqlite/v1/index');

const db = ensureDatabase('./data/news.db');

// Create the fetches_view for backward compatibility
const createViewSQL = `
CREATE VIEW fetches_view AS
SELECT
    -- Primary key and identity (use http_response id as fetches id)
    hr.id AS id,
    u.url AS url,

    -- Timing from http_responses
    hr.request_started_at AS request_started_at,
    hr.fetched_at AS fetched_at,

    -- HTTP metadata from http_responses
    hr.http_status AS http_status,
    hr.content_type AS content_type,
    NULL AS content_length,  -- Not stored in normalized schema
    hr.content_encoding AS content_encoding,
    hr.bytes_downloaded AS bytes_downloaded,
    hr.transfer_kbps AS transfer_kbps,
    hr.ttfb_ms AS ttfb_ms,
    hr.download_ms AS download_ms,
    hr.total_ms AS total_ms,

    -- Legacy fields (not in normalized schema)
    NULL AS saved_to_db,      -- Not applicable in normalized schema
    NULL AS saved_to_file,    -- Not applicable in normalized schema
    NULL AS file_path,        -- Not applicable in normalized schema
    NULL AS file_size,        -- Not applicable in normalized schema

    -- Analysis from content_analysis (if available)
    ca.classification AS classification,
    ca.nav_links_count AS nav_links_count,
    ca.article_links_count AS article_links_count,
    ca.word_count AS word_count,
    ca.analysis_json AS analysis,

    -- Host from urls
    u.host AS host

FROM urls u
INNER JOIN http_responses hr ON hr.url_id = u.id
LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
LEFT JOIN content_analysis ca ON ca.content_id = cs.id;
`;

try {
    // Drop existing view if it exists
    try {
        db.exec('DROP VIEW IF EXISTS fetches_view');
        console.log('🗑️  Dropped existing fetches_view');
    } catch (dropError) {
        console.log('ℹ️  No existing view to drop');
    }

    db.exec(createViewSQL);
    console.log('✅ fetches_view created successfully');

    // Test the view
    const count = db.prepare('SELECT COUNT(*) as count FROM fetches_view').get();
    console.log(`📊 fetches_view contains ${count.count} rows`);

    // Compare with original fetches table
    const originalCount = db.prepare('SELECT COUNT(*) as count FROM fetches').get();
    console.log(`📊 Original fetches table contains ${originalCount.count} rows`);

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
