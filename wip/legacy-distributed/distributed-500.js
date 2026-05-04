#!/usr/bin/env node

/**
 * distributed-500.js
 * ------------------
 * Orchestrates a distributed crawl to ensure all sites have >= 500 pages.
 * Spawns concurrent worker processes (worker-cli.js) to avoid single-node bottlenecks.
 * 
 * Usage: node tools/crawl/distributed-500.js
 */

const Database = require('better-sqlite3');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const DB_PATH = 'data/news.db';
const TARGET_DOCS = 500;
const CONCURRENCY = 8; // Adjust based on CPU/Disk I/O
const WORKER_SCRIPT = path.join(__dirname, 'worker-cli.js');

function main() {
    console.log(`🚀 Starting Distributed Crawl (Target: ${TARGET_DOCS} docs/site)`);
    console.log(`   DB: ${DB_PATH}`);
    console.log(`   Concurrency: ${CONCURRENCY} workers\n`);

    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // 1. Identify Eligible Sites
    // Find enabled sites with < TARGET_DOCS
    // We count existing pages first
    const sites = db.prepare('SELECT id, url FROM news_websites WHERE enabled = 1').all();

    // Enrich with host
    const enrichedSites = sites.map(s => {
        try {
            return { ...s, host: new URL(s.url).hostname };
        } catch { return null; }
    }).filter(s => s && s.host);

    // Check current counts (approximation)
    // Note: This query assumes 'host' in urls matches news_websites.host exactly or normalized.
    // It's better to check http_responses or urls table.
    // Let's use a robust check.

    const candidates = [];
    console.log('📊 Analyzing verification status...');

    for (const site of enrichedSites) {
        const count = db.prepare(`
            SELECT COUNT(*) as c FROM urls 
            WHERE host = ? OR host = ? OR host = ?
        `).get(site.host, `www.${site.host}`, site.host.replace('www.', '')).c;

        if (count < TARGET_DOCS) {
            const needed = TARGET_DOCS - count;
            candidates.push({ ...site, current: count, needed });
        }
    }

    if (candidates.length === 0) {
        console.log('✅ All sites meet the 500-page threshold!');
        return;
    }

    console.log(`found ${candidates.length} sites needing crawling.`);
    // Sort by needed pages (ascending? descending?) 
    // Maybe random to distribute load if cached? Random is good.
    candidates.sort(() => Math.random() - 0.5);

    // 2. Worker Pool
    let activeWorkers = 0;
    let index = 0;

    const next = () => {
        if (activeWorkers >= CONCURRENCY || index >= candidates.length) {
            if (activeWorkers === 0 && index >= candidates.length) {
                console.log('\n✅ Distributed Crawl Complete.');
                process.exit(0);
            }
            return;
        }

        const site = candidates[index++];
        activeWorkers++;

        console.log(`[Queue] Starting ${site.host} (Has ${site.current}, Need ${site.needed})...`); // Worker handles max limit

        const maxToCrawl = Math.max(50, site.needed + 20); // Safety buffer

        const child = spawn('node', [
            WORKER_SCRIPT,
            `--domain=${site.host}`,
            `--max=${maxToCrawl}`,
            `--db=${DB_PATH}`
        ], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        // child.stdout.pipe(process.stdout); // Too noisy? 
        child.stdout.on('data', (d) => {
            const s = d.toString().trim();
            if (s.includes('DONE')) console.log(s);
            // if (s.includes('ERROR')) console.error(s);
        });
        child.stderr.on('data', (d) => process.stderr.write(d));

        child.on('close', (code) => {
            activeWorkers--;
            if (code !== 0) {
                console.warn(`   ⚠️ Worker for ${site.host} exited with code ${code}`);
            } else {
                // console.log(`   ✅ Finished ${site.host}`);
            }
            next();
        });

        next(); // Try to spawn more if concurrency allows
    };

    // Kickoff
    console.log(`\nStarting pool...`);
    for (let i = 0; i < CONCURRENCY; i++) next();
}

main();
