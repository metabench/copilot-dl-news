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
const { findProjectRoot } = require('../../src/shared/utils/project-root');
const { resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

// Config
const SOURCE_DB_NAME = 'news.db';
const runId = Math.floor(Date.now() / 1000);
const EXPERIMENT_DB_NAME = `news-experiment-${runId}.db`;
const START_URL_LIMIT = 5;

function getDbExport(name) {
    const dbModule = resolveNewsCrawlerDbModule();
    const value = dbModule[name];
    if (value === undefined) {
        throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
    }
    return value;
}

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

    // --- Step 1: Clean Slate ---
    console.log(`🌱 Seeding new database...`);
    const createExperimentDb = getDbExport('createIntelligentCrawlExperimentDb');
    const listExperimentSites = getDbExport('listIntelligentCrawlExperimentSites');
    const { db, summary } = createExperimentDb(targetPath, {
        sourcePath,
        startUrlLimit: START_URL_LIMIT,
        logger: console
    });
    console.log(`   Copied ${summary.copied.filter(row => row.status === 'ok').length} seed tables.`);
    if (summary.startUrlFilter?.kept !== null) {
        console.log(`   Kept ${summary.startUrlFilter.kept} start sites.`);
    }

    // --- Step 3: Initial 3-Page Crawl ---
    console.log(`\n🕷️  Phase 1: Initial Crawl (3 pages/site)...`);

    // Import NewsCrawler dynamically
    const NewsCrawler = require('../../src/core/crawler/NewsCrawler');
    const { analyzeAllEligibleHosts } = require('../../src/services/sitePatternAnalysis');

    // Get start URLs
    const sites = listExperimentSites(db);
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
