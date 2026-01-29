#!/usr/bin/env node

/**
 * check-country-hub-guesses.js
 * ----------------------------
 * Verification tool: Checks if country hub guesses (candidate cells) exist.
 *
 * Exit Codes:
 *   0 = Guesses exist
 *   1 = No guesses found
 */

const fs = require('fs');
const path = require('path');
const { findProjectRoot } = require('../../src/shared/utils/project-root');
const { ensureDb } = require('../../src/data/db/sqlite');

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
        console.log('=== Country Hub Guesses Check ===\n');

        // Check for 'candidate' status in place_page_mappings for country-hubs
        const guesses = db.prepare(`
            SELECT host, count(*) as guess_count
            FROM place_page_mappings
            WHERE page_kind = 'country-hub' 
              AND status = 'candidate'
            GROUP BY host
            ORDER BY guess_count DESC
        `).all();

        const totalGuesses = guesses.reduce((sum, g) => sum + g.guess_count, 0);

        if (totalGuesses === 0) {
            console.log('❌ No country hub guesses (candidates) found.');
            return 1;
        }

        console.log(`✅ Found ${totalGuesses} country hub guesses across ${guesses.length} hosts.\n`);

        console.log('Top Hosts by Guess Count:');
        for (const g of guesses.slice(0, 10)) {
            console.log(`  - ${g.host}: ${g.guess_count} guesses`);
        }
        if (guesses.length > 10) console.log(`  ... and ${guesses.length - 10} more`);

        return 0;

    } finally {
        try { db.close(); } catch (_) { }
    }
}

if (require.main === module) {
    process.exitCode = main(process.argv);
}
