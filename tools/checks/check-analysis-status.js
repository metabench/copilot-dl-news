#!/usr/bin/env node

/**
 * check-analysis-status.js
 * ------------------------
 * Verification tool: Checks if eligible domains (>500 docs) have been analyzed.
 *
 * Exit Codes:
 *   0 = All eligible domains have been analyzed
 *   1 = One or more eligible domains missing analysis
 */

const fs = require('fs');
const path = require('path');
const { findProjectRoot } = require('../../src/shared/utils/project-root');
const { ensureDb } = require('../../src/data/db/sqlite');

const THRESHOLD = 500;

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
        console.log('=== Analysis Status Check ===\n');

        // 1. Get eligible domains (>= 500 docs)
        // We use a simplified query for the check tool
        const eligibleHosts = db.prepare(`
            SELECT host, COUNT(*) as doc_count 
            FROM urls 
            WHERE host IS NOT NULL AND host != ''
            GROUP BY host 
            HAVING COUNT(*) >= ?
        `).all(THRESHOLD);

        if (eligibleHosts.length === 0) {
            console.log(`ℹ️  No domains meet the ${THRESHOLD} document threshold yet.`);
            return 0;
        }

        console.log(`Found ${eligibleHosts.length} eligible domains (>= ${THRESHOLD} docs).Checking analysis status...\n`);

        // 2. Check analysis status (domain_classification_profiles)
        const missingAnalysis = [];
        const analyzed = [];

        for (const site of eligibleHosts) {
            const profile = db.prepare(`
                SELECT last_updated_at 
                FROM domain_classification_profiles 
                WHERE domain = ?
            `).get(site.host);

            if (profile) {
                analyzed.push({ ...site, last_updated_at: profile.last_updated_at });
            } else {
                missingAnalysis.push(site);
            }
        }

        // Report
        if (analyzed.length > 0) {
            console.log(`✅ Analyzed Domains (${analyzed.length}):`);
            for (const site of analyzed.slice(0, 10)) {
                console.log(`  - ${site.host} (${site.doc_count} docs, analyzed: ${site.last_updated_at})`);
            }
            if (analyzed.length > 10) console.log(`  ... and ${analyzed.length - 10} more`);
            console.log('');
        }

        if (missingAnalysis.length > 0) {
            console.log(`❌ Missing Analysis (${missingAnalysis.length}):`);
            for (const site of missingAnalysis.slice(0, 10)) {
                console.log(`  - ${site.host} (${site.doc_count} docs)`);
            }
            if (missingAnalysis.length > 10) console.log(`  ... and ${missingAnalysis.length - 10} more`);
            console.log('\nRun pattern analysis to fix this.');
            return 1;
        }

        console.log('✅ All eligible domains have been analyzed!');
        return 0;

    } finally {
        try { db.close(); } catch (_) { }
    }
}

if (require.main === module) {
    process.exitCode = main(process.argv);
}
