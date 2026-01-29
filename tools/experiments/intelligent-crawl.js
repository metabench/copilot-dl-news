#!/usr/bin/env node

/**
 * intelligent-crawl.js
 * --------------------
 * Labs Experiment: "Clean Slate Intelligent Crawl"
 * 
 * Workflow:
 * 1. Create a fresh SQLite DB (news-experiment.db).
 * 2. Seed it with Gazetteer (places) and Start URLs (news_websites) from main DB.
 * 3. Crawl 3 pages per site (Home + 2 others).
 * 4. Run Early Analysis to find "Best Candidates" (Hubs).
 * 5. Crawl 25 more pages, prioritized by analysis.
 * 6. Crawl 10 more "intelligently chosen" pages.
 * 
 * Usage: node tools/experiments/intelligent-crawl.js
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { findProjectRoot } = require('../../src/shared/utils/project-root');
const { ensureDb } = require('../../src/data/db/sqlite');

// Config
const SOURCE_DB_NAME = 'news.db';
const runId = Math.floor(Date.now() / 1000);
const EXPERIMENT_DB_NAME = `news-experiment-${runId}.db`;
const START_URL_LIMIT = 5;

async function main() {
    const projectRoot = findProjectRoot(__dirname);
    const dataDir = path.join(projectRoot, 'data');
    const sourcePath = path.join(dataDir, SOURCE_DB_NAME);
    const targetPath = path.join(dataDir, EXPERIMENT_DB_NAME);

    console.log(`🧪 Starting Intelligent Crawl Experiment (Run ${runId})`);
    console.log(`   Source: ${sourcePath}`);
    console.log(`   Target: ${targetPath}\n`);

    if (!fs.existsSync(sourcePath)) {
        console.error(`❌ Source DB not found at ${sourcePath}`);
        process.exit(1);
    }

    // --- Step 1: Clean Slate (Using ensureDb + ATTACH) ---
    console.log(`🌱 Seeding new database (Optimized via ATTACH)...`);

    // 1. Create empty DB with Schema
    const db = ensureDb(targetPath); // Creates tables

    // 2. Attach Source DB
    try {
        db.prepare(`ATTACH DATABASE ? AS source`).run(sourcePath);
    } catch (e) {
        console.error("Failed to attach source DB:", e);
        process.exit(1);
    }

    // 3. Copy specific tables (Gazetteer + Config)
    const tablesToCopy = [
        'news_websites',
        'places',
        'place_names',
        'place_hierarchies',
        'place_types'
    ];

    // Verify tables exist in source before copying
    const sourceTables = db.prepare(`SELECT name FROM source.sqlite_master WHERE type='table'`).all().map(t => t.name);

    db.exec('BEGIN TRANSACTION');
    for (const table of tablesToCopy) {
        if (sourceTables.includes(table)) {
            try {
                process.stdout.write(`   Copying ${table}... `);
                db.prepare(`INSERT INTO main.${table} SELECT * FROM source.${table}`).run();
                console.log('✅');
            } catch (err) {
                console.log(`❌ ${err.message}`);
            }
        } else {
            console.log(`   ⚠️ Table ${table} not found in source.`);
        }
    }

    db.exec('COMMIT');

    // 4. Detach (Cleanup)
    db.prepare('DETACH DATABASE source').run();

    // 5. Filter news_websites 
    if (START_URL_LIMIT > 0) {
        console.log(`   Limiting news_websites to top ${START_URL_LIMIT}...`);
        const allSites = db.prepare('SELECT id FROM news_websites WHERE enabled = 1 ORDER BY id ASC').all();
        const keepIds = allSites.slice(0, START_URL_LIMIT).map(s => s.id);
        if (keepIds.length > 0) {
            const placeholders = keepIds.map(() => '?').join(',');
            db.prepare(`DELETE FROM news_websites WHERE id NOT IN (${placeholders})`).run(...keepIds);
            console.log(`   Kept ${keepIds.length} sites.`);
        }
    }

    // --- Step 3: Initial 3-Page Crawl ---
    console.log(`\n🕷️  Phase 1: Initial Crawl (3 pages/site)...`);

    // Import NewsCrawler dynamically
    const NewsCrawler = require('../../src/core/crawler/NewsCrawler');
    const { analyzeAllEligibleHosts } = require('../../src/services/sitePatternAnalysis');

    // Get start URLs
    const sites = db.prepare('SELECT url, id FROM news_websites WHERE enabled = 1').all();
    console.log(`   Queueing ${sites.length} seeds...`);

    // Helper to run crawl for a specific limit
    async function runCrawlBatch(limit, phaseName) {
        for (const site of sites) {
            console.log(`   [${phaseName}] Crawling ${site.url} (max ${limit})...`);

            const crawler = new NewsCrawler(site.url, {
                dbPath: targetPath,
                maxDownloads: limit,
                maxDepth: 3,
                concurrency: 1,
                loggingQueue: false,
                fastStart: true,
                crawlType: 'intelligent',
                jobId: `exp-${phaseName}-${site.id}`
            });

            try {
                await crawler.init();
                await crawler.crawl();
            } catch (err) {
                console.error(`   ❌ Error crawling ${site.url}:`, err.message);
            } finally {
                crawler.close();
            }
        }
    }

    // Run Phase 1
    await runCrawlBatch(3, 'initial-3');

    // --- Step 4: Early Analysis ---
    console.log(`\n🧠 Phase 2: Early Analysis (Threshold: 1 page)...`);

    const analysisResults = analyzeAllEligibleHosts(db, { threshold: 1, force: true });

    console.log(`   Analyzed ${analysisResults.hostsAnalyzed} hosts.`);
    console.log(`   Found ${analysisResults.totalPatterns} patterns.`);

    if (analysisResults.results.length > 0) {
        console.log('   Top Patterns Found:');
        for (const res of analysisResults.results) {
            if (res.status === 'analyzed') {
                console.log(`     - ${res.host}: ${res.patternCount} patterns (Pages: ${res.pageCount})`);
            }
        }
    }

    // --- Step 5: Follow-up Crawl ---
    console.log(`\n🕷️  Phase 3: Follow-up Crawl (25 pages)...`);
    // Note: To truly prioritize, the crawler needs to reload patterns. 
    // NewsCrawler loads patterns on init if using Intelligent/Adaptive modes.

    await runCrawlBatch(25, 'followup-25');

    // --- Step 6: Targeted Crawl ---
    console.log(`\n🎯 Phase 4: Targeted Crawl (10 more pages)...`);
    await runCrawlBatch(35, 'targeted-10'); // Total 35

    console.log(`\n✅ Experiment Complete. DB: ${EXPERIMENT_DB_NAME}`);
    db.close();
}

main().catch(console.error);
