#!/usr/bin/env node

/**
 * check-doc-counts.js
 * -------------------
 * Verification tool: Shows document counts per domain.
 * 
 * Run: node tools/checks/check-doc-counts.js [options]
 * 
 * Options:
 *   --threshold=N   Minimum documents required (default: 500)
 *   --json          Output as JSON for programmatic use
 *   --verbose       Show all domains, not just those under threshold
 *   --db=PATH       Path to database (default: data/news.db)
 * 
 * Exit Codes:
 *   0 = All domains meet threshold
 *   1 = One or more domains under threshold
 */

const fs = require('fs');
const path = require('path');
const { findProjectRoot } = require('../../src/shared/utils/project-root');
const { ensureDb } = require('../../src/data/db/sqlite');

const DEFAULT_THRESHOLD = 500;

function parseArgs(argv = process.argv) {
    const args = { threshold: DEFAULT_THRESHOLD };
    for (const raw of argv.slice(2)) {
        if (!raw.startsWith('--')) continue;
        if (raw === '--help') { args.help = true; continue; }
        if (raw === '--json') { args.json = true; continue; }
        if (raw === '--verbose') { args.verbose = true; continue; }

        const eq = raw.indexOf('=');
        if (eq === -1) continue;

        const key = raw.slice(2, eq);
        const value = raw.slice(eq + 1);

        if (key === 'threshold') args.threshold = parseInt(value, 10) || DEFAULT_THRESHOLD;
        if (key === 'db') args.db = value;
    }
    return args;
}

function getDocCountsByDomain(db) {
    // Query news_websites and get document counts per website
    // Use a simpler, more accurate approach: extract host from URL and match against urls table

    try {
        const websites = db.prepare(`
      SELECT id, label, parent_domain, url, enabled
      FROM news_websites
      WHERE enabled = 1
    `).all();

        const results = [];

        for (const site of websites) {
            // Extract the host from the URL
            let siteHost;
            try {
                const urlObj = new URL(site.url);
                siteHost = urlObj.hostname;
            } catch {
                siteHost = site.parent_domain;
            }

            // Count documents for this host
            let count = 0;
            try {
                const countRow = db.prepare(`
          SELECT COUNT(*) as doc_count
          FROM urls
          WHERE host = ?
        `).get(siteHost);
                count = countRow?.doc_count || 0;
            } catch {
                // Try with parent_domain as fallback
                try {
                    const countRow = db.prepare(`
            SELECT COUNT(*) as doc_count
            FROM urls
            WHERE host LIKE ?
          `).get(`%${site.parent_domain}`);
                    count = countRow?.doc_count || 0;
                } catch {
                    count = 0;
                }
            }

            results.push({
                id: site.id,
                label: site.label,
                domain: site.parent_domain,
                url: site.url,
                host: siteHost,
                count
            });
        }

        // Sort by count descending
        results.sort((a, b) => b.count - a.count);

        return { rows: results, source: 'news_websites + urls (per-site)' };
    } catch (err) {
        console.error('Query failed:', err.message);
        return { rows: [], source: 'error' };
    }
}

function getTotalDomainCount(db) {
    try {
        const row = db.prepare(`SELECT COUNT(*) as count FROM news_websites WHERE enabled = 1`).get();
        return row?.count || 0;
    } catch {
        return 0;
    }
}

function printUsage() {
    console.log(`
Usage: check-doc-counts [options]

Verification tool: Shows document counts per domain.

Options:
  --threshold=N   Minimum documents required (default: ${DEFAULT_THRESHOLD})
  --json          Output as JSON for programmatic use
  --verbose       Show all domains, not just those under threshold
  --db=PATH       Path to database (default: data/news.db)
  --help          Show this help text

Exit Codes:
  0 = All domains meet threshold
  1 = One or more domains under threshold
`);
}

function main(argv = process.argv) {
    const args = parseArgs(argv);

    if (args.help) {
        printUsage();
        return 0;
    }

    const projectRoot = findProjectRoot(__dirname);
    const dbPath = args.db
        ? path.resolve(projectRoot, args.db)
        : path.join(projectRoot, 'data', 'news.db');

    if (!fs.existsSync(dbPath)) {
        if (args.json) {
            console.log(JSON.stringify({ error: 'Database not found', dbPath }, null, 2));
        } else {
            console.error(`❌ Database not found at ${dbPath}`);
        }
        return 1;
    }

    let db;
    try {
        db = ensureDb(dbPath);
    } catch (err) {
        if (args.json) {
            console.log(JSON.stringify({ error: 'Failed to open database', message: err.message }, null, 2));
        } else {
            console.error(`❌ Failed to open database: ${err.message}`);
        }
        return 1;
    }

    try {
        const { rows, source } = getDocCountsByDomain(db);
        const totalDomains = getTotalDomainCount(db);

        const underThreshold = rows.filter(r => r.count < args.threshold);
        const meetThreshold = rows.filter(r => r.count >= args.threshold);

        const result = {
            dbPath,
            source,
            threshold: args.threshold,
            totalDomains,
            domainsChecked: rows.length,
            meetingThreshold: meetThreshold.length,
            underThreshold: underThreshold.length,
            allMeetThreshold: underThreshold.length === 0,
            domains: args.verbose ? rows : underThreshold,
            topDomains: meetThreshold.slice(0, 10),
            generatedAt: new Date().toISOString()
        };

        if (args.json) {
            console.log(JSON.stringify(result, null, 2));
        } else {
            console.log('=== Document Count Check ===\n');
            console.log(`Database: ${dbPath}`);
            console.log(`Source table: ${source}`);
            console.log(`Threshold: ${args.threshold} documents\n`);

            console.log(`Total domains: ${totalDomains}`);
            console.log(`Meeting threshold: ${meetThreshold.length}`);
            console.log(`Under threshold: ${underThreshold.length}\n`);

            if (meetThreshold.length > 0) {
                console.log('Top domains by document count:');
                for (const row of meetThreshold.slice(0, 10)) {
                    console.log(`  ✅ ${row.label || row.domain}: ${row.count} docs`);
                }
                console.log('');
            }

            if (underThreshold.length > 0) {
                console.log('Domains under threshold:');
                for (const row of underThreshold.slice(0, 20)) {
                    console.log(`  ⚠️  ${row.label || row.domain}: ${row.count} docs (need ${args.threshold - row.count} more)`);
                }
                if (underThreshold.length > 20) {
                    console.log(`  ... and ${underThreshold.length - 20} more`);
                }
                console.log('');
            }

            if (underThreshold.length === 0) {
                console.log('✅ All domains meet the threshold!');
            } else {
                console.log(`❌ ${underThreshold.length} domain(s) need more documents`);
            }
        }

        return underThreshold.length === 0 ? 0 : 1;

    } finally {
        try { db.close(); } catch (_) { }
    }
}

if (require.main === module) {
    const code = main(process.argv);
    process.exitCode = code;
}

module.exports = { main, parseArgs, getDocCountsByDomain };
