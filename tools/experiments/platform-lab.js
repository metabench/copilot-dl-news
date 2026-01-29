#!/usr/bin/env node
/**
 * Platform Lab - Test news-crawler-db functionality
 * 
 * This lab exercises all the core access modules from news-crawler-db
 * to verify they work correctly as a platform for this crawler.
 * 
 * Usage:
 *   node tools/experiments/platform-lab.js
 *   node tools/experiments/platform-lab.js --postgres  # Use Postgres adapter
 */

const path = require('path');
const fs = require('fs');

// Path to news-crawler-db (sibling repo)
const NEWS_CRAWLER_DB_PATH = path.resolve(__dirname, '../../../news-crawler-db');

// Check if news-crawler-db exists
if (!fs.existsSync(NEWS_CRAWLER_DB_PATH)) {
    console.error('❌ news-crawler-db not found at:', NEWS_CRAWLER_DB_PATH);
    console.error('   Please ensure it is cloned as a sibling directory.');
    process.exit(1);
}

// Try to load the compiled module
let createDbAdapter;
try {
    // Try dist first (compiled)
    const distPath = path.join(NEWS_CRAWLER_DB_PATH, 'dist', 'db', 'index.js');
    if (fs.existsSync(distPath)) {
        const db = require(distPath);
        createDbAdapter = db.createDbAdapter;
    } else {
        // Try loading via tsx or ts-node
        console.log('⚠️  Compiled dist not found, attempting dynamic TS load...');
        require('tsx/cjs'); // Enable TypeScript loading
        const db = require(path.join(NEWS_CRAWLER_DB_PATH, 'src', 'db', 'index.ts'));
        createDbAdapter = db.createDbAdapter;
    }
} catch (err) {
    console.error('❌ Failed to load news-crawler-db:', err.message);
    console.error('   Try running `npm run build` in news-crawler-db first.');
    process.exit(1);
}

// Test configuration
const USE_POSTGRES = process.argv.includes('--postgres');
const USE_EXISTING = process.argv.includes('--existing');
const TEST_DB_PATH = USE_EXISTING
    ? path.join(NEWS_CRAWLER_DB_PATH, 'data', 'news.db')
    : path.join(__dirname, 'test-platform-lab.db');

// For new test db, we need to push schema first
if (!USE_POSTGRES && !USE_EXISTING) {
    if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
    }

    // Push schema using drizzle-kit
    console.log('📦 Creating test database with schema...');
    const { execSync } = require('child_process');
    try {
        // Create empty db file first
        const Database = require('better-sqlite3');
        const tempDb = new Database(TEST_DB_PATH);
        tempDb.close();

        // Push schema using drizzle
        execSync(`npx drizzle-kit push --config=drizzle.config.ts`, {
            cwd: NEWS_CRAWLER_DB_PATH,
            env: { ...process.env, DATABASE_URL: TEST_DB_PATH },
            stdio: 'pipe'
        });
        console.log('   Schema pushed ✅');
    } catch (err) {
        console.log('   ⚠️  Could not auto-push schema. Using --existing flag to use news-crawler-db/data/news.db');
        console.log('   Or run: cd news-crawler-db && npm run db:push');
        // Fall back to existing db
        if (fs.existsSync(path.join(NEWS_CRAWLER_DB_PATH, 'data', 'news.db'))) {
            console.log('   Falling back to existing news.db...');
            // Continue with existing
        }
    }
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║           PLATFORM LAB - news-crawler-db Test Suite          ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log();

// Results tracking
const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: []
};

async function test(name, fn) {
    process.stdout.write(`  ${name}...`);
    try {
        await fn();
        console.log(' ✅');
        results.passed++;
        results.tests.push({ name, status: 'passed' });
    } catch (err) {
        console.log(' ❌');
        console.log(`     Error: ${err.message}`);
        results.failed++;
        results.tests.push({ name, status: 'failed', error: err.message });
    }
}

async function skip(name, reason) {
    console.log(`  ${name}... ⏭️  (${reason})`);
    results.skipped++;
    results.tests.push({ name, status: 'skipped', reason });
}

async function runLab() {
    // Initialize adapter
    console.log('🔧 Initializing adapter...');
    let db;

    if (USE_POSTGRES) {
        const connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/news_crawler_test';
        console.log(`   Using Postgres: ${connectionString.split('@')[1] || connectionString}`);
        db = createDbAdapter({ type: 'postgres', connectionString });
    } else {
        console.log(`   Using SQLite: ${TEST_DB_PATH}`);
        db = createDbAdapter({ type: 'sqlite', path: TEST_DB_PATH });
    }

    console.log('   Adapter initialized ✅');
    console.log();

    // ═══════════════════════════════════════════════════════════════
    // URL Access Tests
    // ═══════════════════════════════════════════════════════════════
    console.log('📍 URL Access');

    await test('urls.upsert() - insert new URL', async () => {
        await db.urls.upsert('https://example.com/article/1', null, { source: 'test' });
    });

    await test('urls.hasUrl() - check exists', async () => {
        const exists = await db.urls.hasUrl('https://example.com/article/1');
        if (!exists) throw new Error('URL should exist');
    });

    await test('urls.findByUrl() - retrieve URL', async () => {
        const url = await db.urls.findByUrl('https://example.com/article/1');
        if (!url) throw new Error('URL not found');
        if (url.url !== 'https://example.com/article/1') throw new Error('URL mismatch');
    });

    await test('urls.count() - count URLs', async () => {
        const count = await db.urls.count();
        if (count < 1) throw new Error('Expected at least 1 URL');
    });

    if (db.urls.recordUrlAlias) {
        await test('urls.recordUrlAlias() - record redirect', async () => {
            await db.urls.recordUrlAlias({
                url: 'https://example.com/old-path',
                aliasUrl: 'https://example.com/new-path',
                classification: 'redirect',
                reason: '301'
            });
        });
    } else {
        await skip('urls.recordUrlAlias()', 'Not implemented in SQLite');
    }

    console.log();

    // ═══════════════════════════════════════════════════════════════
    // Articles Access Tests
    // ═══════════════════════════════════════════════════════════════
    console.log('📰 Articles Access');

    await test('articles.upsert() - insert article', async () => {
        // First ensure URL exists
        await db.urls.upsert('https://example.com/news/test-article');
        const id = await db.articles.upsert({
            url: 'https://example.com/news/test-article',
            httpStatus: 200,
            contentType: 'text/html',
            fetchedAt: new Date().toISOString()
        });
        if (!id || id < 1) throw new Error('Expected valid article ID');
    });

    await test('articles.findByUrl() - find article', async () => {
        const article = await db.articles.findByUrl('https://example.com/news/test-article');
        if (!article) throw new Error('Article not found');
    });

    await test('articles.count() - count articles', async () => {
        const count = await db.articles.count();
        if (count < 1) throw new Error('Expected at least 1 article');
    });

    await test('articles.getNeedingAnalysis() - query pending', async () => {
        const articles = await db.articles.getNeedingAnalysis({ limit: 10 });
        if (!Array.isArray(articles)) throw new Error('Expected array');
    });

    console.log();

    // ═══════════════════════════════════════════════════════════════
    // Domains Access Tests
    // ═══════════════════════════════════════════════════════════════
    console.log('🌐 Domains Access');

    await test('domains.upsert() - insert domain', async () => {
        await db.domains.upsert('example.com', { category: 'news' });
    });

    await test('domains.list() - list domains', async () => {
        const domains = await db.domains.list({ limit: 10 });
        if (!Array.isArray(domains)) throw new Error('Expected array');
        if (domains.length < 1) throw new Error('Expected at least 1 domain');
    });

    await test('domains.getMetrics() - get metrics', async () => {
        const metrics = await db.domains.getMetrics('example.com');
        if (!metrics) throw new Error('Expected metrics object');
        if (!('host' in metrics)) throw new Error('Expected host in metrics');
    });

    console.log();

    // ═══════════════════════════════════════════════════════════════
    // Queue Access Tests
    // ═══════════════════════════════════════════════════════════════
    console.log('📋 Queue Access');

    await test('queue.add() - add tasks', async () => {
        await db.queue.add([
            { url: 'https://example.com/page1', domain: 'example.com', priority: 5 },
            { url: 'https://example.com/page2', domain: 'example.com', priority: 3 }
        ]);
    });

    await test('queue.size() - get queue size', async () => {
        const size = await db.queue.size();
        if (size < 1) throw new Error('Expected queue size >= 1');
    });

    await test('queue.claim() - claim tasks', async () => {
        const tasks = await db.queue.claim('worker-1', 1);
        if (!Array.isArray(tasks)) throw new Error('Expected array');
        if (tasks.length < 1) throw new Error('Expected at least 1 task');
    });

    await test('queue.complete() - complete task', async () => {
        const tasks = await db.queue.claim('worker-2', 1);
        if (tasks.length > 0) {
            await db.queue.complete(tasks[0].id);
        }
    });

    console.log();

    // ═══════════════════════════════════════════════════════════════
    // Logging Access Tests
    // ═══════════════════════════════════════════════════════════════
    console.log('📝 Logging Access');

    await test('logging.logMilestone() - log milestone', async () => {
        await db.logging.logMilestone({
            jobId: 'test-job-1',
            kind: 'started',
            scope: 'test',
            message: 'Lab test started'
        });
    });

    await test('logging.logProblem() - log problem', async () => {
        await db.logging.logProblem({
            jobId: 'test-job-1',
            kind: 'warning',
            scope: 'test',
            message: 'Test warning'
        });
    });

    await test('logging.logError() - log error', async () => {
        await db.logging.logError({
            host: 'example.com',
            kind: 'timeout',
            code: 408,
            message: 'Request timeout'
        });
    });

    await test('logging.getMilestones() - query milestones', async () => {
        const milestones = await db.logging.getMilestones({ limit: 10 });
        if (!Array.isArray(milestones)) throw new Error('Expected array');
    });

    await test('logging.getProblems() - query problems', async () => {
        const problems = await db.logging.getProblems({ limit: 10 });
        if (!Array.isArray(problems)) throw new Error('Expected array');
    });

    await test('logging.getErrors() - query errors', async () => {
        const errors = await db.logging.getErrors({ limit: 10 });
        if (!Array.isArray(errors)) throw new Error('Expected array');
    });

    console.log();

    // ═══════════════════════════════════════════════════════════════
    // Settings Access Tests
    // ═══════════════════════════════════════════════════════════════
    console.log('⚙️  Settings Access');

    await test('settings.set() - store setting', async () => {
        await db.settings.set('lab.test.key', 'test-value-123');
    });

    await test('settings.get() - retrieve setting', async () => {
        const value = await db.settings.get('lab.test.key');
        if (value !== 'test-value-123') throw new Error(`Expected 'test-value-123', got '${value}'`);
    });

    await test('settings.getAll() - get all settings', async () => {
        const all = await db.settings.getAll();
        if (typeof all !== 'object') throw new Error('Expected object');
    });

    console.log();

    // ═══════════════════════════════════════════════════════════════
    // Dashboard Access Tests
    // ═══════════════════════════════════════════════════════════════
    console.log('📊 Dashboard Access');

    await test('dashboard.getRecentJobs() - list jobs', async () => {
        const jobs = await db.dashboard.getRecentJobs(5);
        if (!Array.isArray(jobs)) throw new Error('Expected array');
    });

    await test('dashboard.getThroughputHistory() - get throughput', async () => {
        const history = await db.dashboard.getThroughputHistory(60);
        if (!Array.isArray(history)) throw new Error('Expected array');
    });

    console.log();

    // ═══════════════════════════════════════════════════════════════
    // Links Access Tests (if available)
    // ═══════════════════════════════════════════════════════════════
    if (db.links) {
        console.log('🔗 Links Access');

        await test('links.insertLink() - insert link', async () => {
            // Ensure both URLs exist
            await db.urls.upsert('https://example.com/source-page');
            await db.urls.upsert('https://example.com/target-page');

            const srcUrl = await db.urls.findByUrl('https://example.com/source-page');
            const dstUrl = await db.urls.findByUrl('https://example.com/target-page');

            await db.links.insertLink({
                srcUrlId: srcUrl.id,
                dstUrlId: dstUrl.id,
                anchor: 'Click here',
                rel: null,
                type: 'internal'
            });
        });

        await test('links.getLinkCount() - count links', async () => {
            const count = await db.links.getLinkCount();
            if (count < 1) throw new Error('Expected at least 1 link');
        });

        console.log();
    } else {
        console.log('🔗 Links Access - ⏭️ Not available on this adapter');
        console.log();
    }

    // ═══════════════════════════════════════════════════════════════
    // Fetches Access Tests (if available)
    // ═══════════════════════════════════════════════════════════════
    if (db.fetches) {
        console.log('📥 Fetches Access');

        await test('fetches.insertFetch() - record fetch', async () => {
            const url = await db.urls.findByUrl('https://example.com/article/1');
            await db.fetches.insertFetch({
                urlId: url.id,
                requestStartedAt: new Date(),
                fetchedAt: new Date(),
                httpStatus: 200,
                contentType: 'text/html',
                totalMs: 150
            });
        });

        await test('fetches.getFetchesByUrl() - get fetch history', async () => {
            const url = await db.urls.findByUrl('https://example.com/article/1');
            const fetches = await db.fetches.getFetchesByUrl(url.id, 10);
            if (!Array.isArray(fetches)) throw new Error('Expected array');
        });

        console.log();
    } else {
        console.log('📥 Fetches Access - ⏭️ Not available on this adapter');
        console.log();
    }

    // ═══════════════════════════════════════════════════════════════
    // Places Access Tests (if available)
    // ═══════════════════════════════════════════════════════════════
    if (db.places) {
        console.log('🗺️  Places Access');

        await test('places.recordPlaceHubSeed() - record hub seed', async () => {
            await db.places.recordPlaceHubSeed({
                host: 'example.com',
                placeName: 'United Kingdom',
                placeType: 'country',
                url: 'https://example.com/uk/'
            });
        });

        await test('places.getKnownHubSeeds() - get hub seeds', async () => {
            const seeds = await db.places.getKnownHubSeeds('example.com');
            if (!Array.isArray(seeds)) throw new Error('Expected array');
        });

        console.log();
    } else {
        console.log('🗺️  Places Access - ⏭️ Not available on this adapter');
        console.log();
    }

    // ═══════════════════════════════════════════════════════════════
    // Raw SQL Tests
    // ═══════════════════════════════════════════════════════════════
    console.log('🔧 Raw SQL Access');

    await test('query() - execute raw SELECT', async () => {
        const result = await db.query('SELECT 1 as test');
        if (!Array.isArray(result)) throw new Error('Expected array');
    });

    await test('execute() - execute raw command', async () => {
        await db.execute('SELECT 1'); // Simple no-op
    });

    console.log();

    // ═══════════════════════════════════════════════════════════════
    // Cleanup
    // ═══════════════════════════════════════════════════════════════
    console.log('🧹 Cleanup');
    await db.close();
    console.log('   Connection closed ✅');

    if (!USE_POSTGRES && !USE_EXISTING && fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
        console.log('   Test database removed ✅');
    } else if (USE_EXISTING) {
        console.log('   (Kept existing database intact)');
    }

    console.log();

    // ═══════════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════════
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                         RESULTS                              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log();
    console.log(`  ✅ Passed:  ${results.passed}`);
    console.log(`  ❌ Failed:  ${results.failed}`);
    console.log(`  ⏭️  Skipped: ${results.skipped}`);
    console.log();

    if (results.failed === 0) {
        console.log('🎉 All tests passed! The platform is ready for use.');
    } else {
        console.log('⚠️  Some tests failed. Review the errors above.');
        process.exit(1);
    }
}

// Run the lab
runLab().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
