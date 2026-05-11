#!/usr/bin/env node

const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');

async function main() {
    const db = openNewsCrawlerDb('./data/news.db');
    try {
        if (!db.maintenance?.createPlacesCompatibilityView) {
            throw new Error('news-crawler-db maintenance access is missing createPlacesCompatibilityView');
        }

        const summary = await db.maintenance.createPlacesCompatibilityView();

        console.log('✅ places_view created successfully');
        console.log(`📊 places_view contains ${summary.viewCount} rows`);

        if (summary.sourceTableExists) {
            console.log(`📊 Original places table contains ${summary.sourceTableCount} rows`);

            if (summary.countsMatch) {
                console.log('✅ Row counts match - view reconstruction successful');
            } else {
                console.log('⚠️  Row counts differ - may indicate data integrity issues');
                console.log(`   Difference: ${Math.abs(summary.viewCount - summary.sourceTableCount)} rows`);
            }
        } else {
            console.log('⚠️  Original places table was not found');
        }
    } catch (error) {
        console.error('❌ Error creating view:', error.message);
        process.exitCode = 1;
    } finally {
        await db.close();
    }
}

main();
