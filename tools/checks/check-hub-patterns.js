#!/usr/bin/env node

/**
 * check-hub-patterns.js
 * ---------------------
 * Verification tool: Checks if hub patterns have been discovered.
 *
 * Exit Codes:
 *   0 = Hub patterns exist for at least one domain
 *   1 = No hub patterns found
 */

const fs = require('fs');
const path = require('path');
const { findProjectRoot } = require('../../src/shared/utils/project-root');
const { resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');
const { ensureDb } = require('../../src/data/db/sqlite');

const {
    listHubPatternCountsByDomainAndClassification
} = resolveNewsCrawlerDbModule();

function main(argv = process.argv) {
    const projectRoot = findProjectRoot(__dirname);
    const dbPath = path.join(projectRoot, 'data', 'news.db');

    if (!fs.existsSync(dbPath)) {
        console.error(`❌ Database not found at ${dbPath}`);
        return 1;
    }

    let db;
    try {
        db = ensureDb(dbPath);
    } catch (err) {
        console.error(`❌ Failed to open database: ${err.message}`);
        return 1;
    }

    try {
        console.log('=== Hub Pattern Check ===\n');

        const patterns = listHubPatternCountsByDomainAndClassification(db);

        if (patterns.length === 0) {
            console.log('❌ No hub patterns found in url_classification_patterns table.');
            return 1;
        }

        const domainCount = new Set(patterns.map(p => p.domain)).size;
        console.log(`✅ Found hub patterns for ${domainCount} domains.\n`);

        console.log('Top Domains by Hub Pattern Count:');
        const byDomain = {};
        for (const p of patterns) {
            if (!byDomain[p.domain]) byDomain[p.domain] = 0;
            byDomain[p.domain] += p.pattern_count;
        }

        const sortedDomains = Object.entries(byDomain).sort((a, b) => b[1] - a[1]);

        for (const [domain, count] of sortedDomains.slice(0, 10)) {
            console.log(`  - ${domain}: ${count} patterns`);
        }
        if (sortedDomains.length > 10) console.log(`  ... and ${sortedDomains.length - 10} more`);

        return 0;

    } finally {
        try { db.close(); } catch (_) { }
    }
}

if (require.main === module) {
    process.exitCode = main(process.argv);
}
