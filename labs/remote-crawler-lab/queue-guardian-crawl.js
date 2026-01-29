#!/usr/bin/env node
/**
 * Queue 500 Guardian URLs for distributed crawling
 * 
 * This script generates a mix of Guardian article URLs from various sections
 * and queues them on the remote crawler worker via POST /api/jobs.
 */

const http = require('http');

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:3120';
const URL_COUNT = parseInt(process.env.URL_COUNT, 10) || 500;

// Guardian section paths
const SECTIONS = [
    'world', 'uk-news', 'us-news', 'politics', 'business',
    'technology', 'science', 'sport', 'football', 'culture',
    'film', 'music', 'books', 'tv-and-radio', 'lifeandstyle',
    'travel', 'environment', 'money', 'education', 'media'
];

// Generate Guardian URLs - mix of sections and dated paths
function generateGuardianUrls(count) {
    const urls = new Set();

    // Add main section pages
    SECTIONS.forEach(section => {
        urls.add(`https://www.theguardian.com/${section}`);
        urls.add(`https://www.theguardian.com/${section}/all`);
    });

    // Add dated archive paths (recent dates)
    const now = new Date();
    for (let daysBack = 0; daysBack < 30 && urls.size < count; daysBack++) {
        const date = new Date(now);
        date.setDate(date.getDate() - daysBack);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        SECTIONS.forEach(section => {
            if (urls.size < count) {
                urls.add(`https://www.theguardian.com/${section}/${year}/${month}/${day}/all`);
            }
        });
    }

    // Add specific topic combinations
    const topics = ['climate-crisis', 'coronavirus', 'ukraine', 'israel', 'ai'];
    topics.forEach(topic => {
        urls.add(`https://www.theguardian.com/${topic}`);
    });

    // Add some common paths
    urls.add('https://www.theguardian.com/');
    urls.add('https://www.theguardian.com/international');
    urls.add('https://www.theguardian.com/commentisfree');
    urls.add('https://www.theguardian.com/opinion');
    urls.add('https://www.theguardian.com/guardian-weekly');

    // Fill remaining with randomized query strings to ensure uniqueness
    let counter = 0;
    while (urls.size < count) {
        const section = SECTIONS[counter % SECTIONS.length];
        urls.add(`https://www.theguardian.com/${section}?page=${Math.floor(counter / SECTIONS.length) + 1}`);
        counter++;
    }

    return Array.from(urls).slice(0, count);
}

async function queueUrls(workerUrl, urls) {
    return new Promise((resolve, reject) => {
        const url = new URL('/api/jobs', workerUrl);
        const postData = JSON.stringify({ urls });

        const req = http.request({
            hostname: url.hostname,
            port: url.port || 80,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            },
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve({ raw: data });
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function getSpeed(workerUrl) {
    return new Promise((resolve, reject) => {
        const url = new URL('/api/speed', workerUrl);

        http.get({
            hostname: url.hostname,
            port: url.port || 80,
            path: url.pathname,
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve({ error: data });
                }
            });
        }).on('error', reject);
    });
}

async function main() {
    console.log(`\n=== Guardian Distributed Crawl ===`);
    console.log(`Worker: ${WORKER_URL}`);
    console.log(`URLs to queue: ${URL_COUNT}\n`);

    // Generate URLs
    console.log('Generating Guardian URLs...');
    const urls = generateGuardianUrls(URL_COUNT);
    console.log(`Generated ${urls.length} unique URLs\n`);
    console.log('Sample URLs:');
    urls.slice(0, 5).forEach(u => console.log(`  ${u}`));
    console.log('  ...\n');

    // Queue URLs
    console.log('Queuing URLs on remote worker...');
    try {
        const result = await queueUrls(WORKER_URL, urls);
        console.log(`Result: ${JSON.stringify(result)}\n`);
    } catch (e) {
        console.error(`Failed to queue: ${e.message}`);
        process.exit(1);
    }

    // Monitor progress
    console.log('Monitoring progress (Ctrl+C to stop)...\n');
    let lastTotal = 0;

    const monitor = setInterval(async () => {
        try {
            const stats = await getSpeed(WORKER_URL);
            const progress = stats.totalProcessed || 0;
            const speed = stats.currentItemsPerSec || 0;
            const bytes = stats.currentBytesPerSec || 0;
            const errors = stats.totalErrors || 0;

            const progressBar = '█'.repeat(Math.floor((progress / URL_COUNT) * 40)).padEnd(40, '░');

            process.stdout.write(`\r[${progressBar}] ${progress}/${URL_COUNT} (${speed.toFixed(1)} p/s, ${(bytes / 1024).toFixed(1)} KB/s, ${errors} errors)`);

            if (progress >= URL_COUNT && progress === lastTotal) {
                clearInterval(monitor);
                console.log('\n\n✓ Crawl complete!');
                process.exit(0);
            }

            lastTotal = progress;
        } catch (e) {
            console.error(`\nMonitor error: ${e.message}`);
        }
    }, 1000);
}

main().catch(console.error);
