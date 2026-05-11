#!/usr/bin/env node

const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');

async function main() {
    const db = openNewsCrawlerDb('./data/news.db');

    try {
        if (!db.maintenance?.ensurePerformanceIndexes) {
            throw new Error('news-crawler-db maintenance access is missing ensurePerformanceIndexes');
        }

        console.log('🔧 Adding missing database indexes for performance...');
        const report = await db.maintenance.ensurePerformanceIndexes();

        for (const name of report.createdIndexes) {
            console.log(`📊 Ensured index: ${name}`);
        }

        console.log('✅ All indexes created successfully');

        console.log('\n🔍 Verifying indexes:');
        for (const [table, indexes] of Object.entries(report.indexesByTable)) {
            console.log(`\n📋 ${table} indexes:`);
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
        process.exitCode = 1;
    } finally {
        await db.close();
    }
}

main();
