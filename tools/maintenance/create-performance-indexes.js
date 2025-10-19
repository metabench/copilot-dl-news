#!/usr/bin/env node

const { ensureDatabase } = require('../../src/db/sqlite/v1/index');

const db = ensureDatabase('./data/news.db');

console.log('🔧 Adding missing database indexes for performance...');

const indexes = [
    // Content storage indexes
    'CREATE INDEX IF NOT EXISTS idx_content_storage_http_response ON content_storage(http_response_id)',

    // Content analysis indexes (add more if needed)
    'CREATE INDEX IF NOT EXISTS idx_content_analysis_content_id ON content_analysis(content_id)', // Already exists but ensure

    // HTTP responses indexes (add composite if needed)
    'CREATE INDEX IF NOT EXISTS idx_http_responses_url_fetched ON http_responses(url_id, fetched_at)', // Already exists but ensure

    // URLs indexes (ensure url index exists)
    'CREATE INDEX IF NOT EXISTS idx_urls_url ON urls(url)', // Already exists but ensure
    'CREATE INDEX IF NOT EXISTS idx_urls_canonical ON urls(canonical_url)',

    // Discovery events indexes
    'CREATE INDEX IF NOT EXISTS idx_discovery_events_url ON discovery_events(url_id)',
];

try {
    for (const sql of indexes) {
        console.log(`📊 Creating index: ${sql.split(' ON ')[1].split('(')[0]}`);
        db.exec(sql);
    }

    console.log('✅ All indexes created successfully');

    // Verify indexes were created
    console.log('\n🔍 Verifying indexes:');
    const tables = ['content_storage', 'content_analysis', 'http_responses', 'urls', 'discovery_events'];

    for (const table of tables) {
        console.log(`\n📋 ${table} indexes:`);
        const indexes = db.prepare(`
            SELECT name, sql
            FROM sqlite_master
            WHERE type = 'index' AND tbl_name = ?
            ORDER BY name
        `).all(table);

        if (indexes.length === 0) {
            console.log('  (no indexes)');
        } else {
            indexes.forEach(idx => {
                console.log(`  ✓ ${idx.name}`);
            });
        }
    }

} catch (error) {
    console.error('❌ Error creating indexes:', error.message);
} finally {
    db.close();
}