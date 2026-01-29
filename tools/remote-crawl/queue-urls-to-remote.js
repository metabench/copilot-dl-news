#!/usr/bin/env node

/**
 * queue-urls-to-remote.js
 * -----------------------
 * Sends URLs from local news_websites to the remote Oracle Cloud crawler.
 * 
 * Usage:
 *   node tools/remote-crawl/queue-urls-to-remote.js [options]
 * 
 * Options:
 *   --domain <domain>   Specific domain to queue (optional, queues all under-threshold if omitted)
 *   --threshold <n>     Document threshold (default: 500)
 *   --batch <n>         How many URLs to queue per domain (default: 100)
 *   --dry-run           Show what would be queued without sending
 */

const fs = require('fs');
const path = require('path');
const { findProjectRoot } = require('../../src/shared/utils/project-root');
const { ensureDb } = require('../../src/data/db/sqlite');

const REMOTE_HOST = 'http://144.21.35.104:3120';
const DEFAULT_THRESHOLD = 500;
const DEFAULT_BATCH = 100;

function parseArgs(argv = process.argv) {
    const args = { threshold: DEFAULT_THRESHOLD, batch: DEFAULT_BATCH };
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--domain') args.domain = argv[++i];
        if (arg === '--threshold') args.threshold = parseInt(argv[++i], 10) || DEFAULT_THRESHOLD;
        if (arg === '--batch') args.batch = parseInt(argv[++i], 10) || DEFAULT_BATCH;
        if (arg === '--dry-run') args.dryRun = true;
        if (arg === '--help') args.help = true;
    }
    return args;
}

async function getDomainsNeedingCrawl(db, threshold) {
    const websites = db.prepare(`
    SELECT id, label, parent_domain, url
    FROM news_websites
    WHERE enabled = 1
  `).all();

    const results = [];
    for (const site of websites) {
        let siteHost;
        try {
            siteHost = new URL(site.url).hostname;
        } catch {
            siteHost = site.parent_domain;
        }

        const countRow = db.prepare(`
      SELECT COUNT(*) as doc_count
      FROM urls
      WHERE host = ?
    `).get(siteHost);

        const count = countRow?.doc_count || 0;
        if (count < threshold) {
            results.push({
                ...site,
                host: siteHost,
                currentCount: count,
                needed: threshold - count
            });
        }
    }

    return results.sort((a, b) => b.needed - a.needed);
}

async function generateUrlsForDomain(domain, batchSize) {
    // Generate potential URLs based on common news site patterns
    const sections = [
        'world', 'politics', 'business', 'technology', 'science',
        'health', 'sports', 'entertainment', 'opinion', 'culture',
        'uk', 'us', 'europe', 'asia', 'africa', 'americas',
        'economy', 'environment', 'education', 'travel', 'lifestyle'
    ];

    const urls = [];
    const base = domain.startsWith('http') ? domain : `https://${domain}`;

    // Add main sections
    for (const section of sections.slice(0, Math.min(sections.length, batchSize))) {
        urls.push(`${base}/${section}`);
        urls.push(`${base}/news/${section}`);
    }

    // Could add RSS feed discovery, sitemap parsing, etc.
    // For now, keep it simple

    return urls.slice(0, batchSize);
}

async function queueToRemote(urls, dryRun = false) {
    if (dryRun) {
        console.log(`[DRY-RUN] Would queue ${urls.length} URLs`);
        urls.slice(0, 5).forEach(u => console.log(`  - ${u}`));
        if (urls.length > 5) console.log(`  ... and ${urls.length - 5} more`);
        return { success: true, queued: 0, dryRun: true };
    }

    try {
        const response = await fetch(`${REMOTE_HOST}/api/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls })
        });

        const result = await response.json();
        return { success: true, ...result };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function main() {
    const args = parseArgs();

    if (args.help) {
        console.log(`
Usage: node tools/remote-crawl/queue-urls-to-remote.js [options]

Options:
  --domain <domain>   Specific domain to queue
  --threshold <n>     Document threshold (default: ${DEFAULT_THRESHOLD})
  --batch <n>         URLs to queue per domain (default: ${DEFAULT_BATCH})
  --dry-run           Show what would be queued
`);
        return;
    }

    const projectRoot = findProjectRoot(__dirname);
    const dbPath = path.join(projectRoot, 'data', 'news.db');

    if (!fs.existsSync(dbPath)) {
        console.error('Database not found at', dbPath);
        process.exit(1);
    }

    const db = ensureDb(dbPath);

    console.log('=== Queue URLs to Remote Crawler ===\n');
    console.log(`Remote host: ${REMOTE_HOST}`);
    console.log(`Threshold: ${args.threshold} docs`);
    console.log(`Batch size: ${args.batch} URLs per domain\n`);

    const domainsNeedingCrawl = await getDomainsNeedingCrawl(db, args.threshold);

    if (args.domain) {
        const filtered = domainsNeedingCrawl.filter(d =>
            d.label.toLowerCase().includes(args.domain.toLowerCase()) ||
            d.host.includes(args.domain)
        );
        if (filtered.length === 0) {
            console.log(`No matching domains found for "${args.domain}"`);
            db.close();
            return;
        }
        domainsNeedingCrawl.length = 0;
        domainsNeedingCrawl.push(...filtered);
    }

    console.log(`Found ${domainsNeedingCrawl.length} domains needing more documents:\n`);

    for (const domain of domainsNeedingCrawl) {
        console.log(`${domain.label} (${domain.host}): ${domain.currentCount}/${args.threshold} docs (need ${domain.needed} more)`);
    }

    if (domainsNeedingCrawl.length === 0) {
        console.log('All domains meet the threshold!');
        db.close();
        return;
    }

    console.log('\n--- Queuing URLs ---\n');

    let totalQueued = 0;
    for (const domain of domainsNeedingCrawl.slice(0, 5)) { // Limit to first 5 for safety
        const urls = await generateUrlsForDomain(domain.url, args.batch);
        console.log(`\n${domain.label}: Queuing ${urls.length} URLs...`);

        const result = await queueToRemote(urls, args.dryRun);
        if (result.success) {
            totalQueued += result.inserted || urls.length;
            console.log(`  ✅ Success: ${result.inserted || urls.length} new URLs queued`);
        } else {
            console.log(`  ❌ Error: ${result.error}`);
        }
    }

    console.log(`\n=== Total: ${totalQueued} URLs queued to remote ===`);

    db.close();
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
