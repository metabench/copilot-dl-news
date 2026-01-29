/**
 * worker-cli.js
 * -------------
 * Single-domain crawler worker for distributed execution.
 * Connects to the main DB and crawls a specific domain up to a limit.
 * 
 * Usage: node tools/crawl/worker-cli.js --domain=example.com --max=500 --db=data/news.db
 */

const Database = require('better-sqlite3');
const path = require('path');
const { CrawlWorker } = require('../../deploy/remote-crawler/lib/crawl-worker');

// Parse args
const args = {};
process.argv.slice(2).forEach(arg => {
    const [key, val] = arg.replace('--', '').split('=');
    args[key] = val;
});

const domain = args.domain;
const maxPages = parseInt(args.max, 10) || 500;
const dbPath = args.db || 'data/news.db';

if (!domain) {
    console.error('❌ Missing --domain argument');
    process.exit(1);
}

const db = new Database(dbPath, { timeout: 10000 }); // 10s timeout for busy locks
// WAL mode recommended for concurrency
db.pragma('journal_mode = WAL');

const worker = new CrawlWorker(db, {
    targetDomain: domain,
    maxPages: maxPages,
    rateLimitMs: 1000 // Polite rate limit
});

// Override log to prefix domain
const originalLog = worker.log.bind(worker);
worker.log = (level, msg, data) => {
    // 1. Call original to save to DB
    try { originalLog(level, msg, data); } catch (e) {
        // console.error(`[${domain}] DB Log Error:`, e.message); 
    }

    // 2. Console output
    if (level === 'error') console.error(`[${domain}] ERROR: ${msg} ${JSON.stringify(data || '')}`);
    else if (msg.includes('Crawl finished')) console.log(`[${domain}] DONE: ${JSON.stringify(data)}`);
    else if (level === 'warn') console.warn(`[${domain}] WARN: ${msg}`);
};

async function run() {
    try {
        const result = worker.start(maxPages);
        if (result.error) {
            console.error(`[${domain}] Failed to start: ${result.error}`);
            process.exit(1);
        }

        // Wait for completion (CrawlWorker running in background promise)
        // We need to wait for isRunning to be false
        while (worker.isRunning) {
            await new Promise(r => setTimeout(r, 1000));
        }
    } catch (err) {
        console.error(`[${domain}] Crash: ${err.message}`);
        process.exit(1);
    }
}

run();
