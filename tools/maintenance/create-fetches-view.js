#!/usr/bin/env node

const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');

async function main() {
    const db = openNewsCrawlerDb('./data/news.db');
    try {
        if (!db.maintenance?.createFetchesCompatibilityView) {
            throw new Error('news-crawler-db maintenance access is missing createFetchesCompatibilityView');
        }

        const summary = await db.maintenance.createFetchesCompatibilityView();

        console.log('✅ fetches_view created successfully');
        console.log(`📊 fetches_view contains ${summary.viewCount} rows`);

        if (summary.sourceTableExists) {
            console.log(`📊 Original fetches table contains ${summary.sourceTableCount} rows`);

            if (summary.countsMatch) {
                console.log('✅ Row counts match - view reconstruction successful');
            } else {
                console.log('⚠️  Row counts differ - may indicate data integrity issues');
                console.log(`   Difference: ${Math.abs(summary.viewCount - summary.sourceTableCount)} rows`);
            }
        } else {
            console.log('ℹ️  Legacy fetches table was not found; only fetches_view was verified');
        }
    } catch (error) {
        console.error('❌ Error creating view:', error.message);
        process.exitCode = 1;
    } finally {
        await db.close();
    }
}

main();
