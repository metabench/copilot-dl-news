#!/usr/bin/env node
/**
 * Queue real Guardian URLs from their RSS feeds
 */
const http = require('http');
const https = require('https');

// Real Guardian RSS feeds that contain actual article URLs
const RSS_FEEDS = [
    'https://www.theguardian.com/world/rss',
    'https://www.theguardian.com/uk-news/rss',
    'https://www.theguardian.com/us-news/rss',
    'https://www.theguardian.com/politics/rss',
    'https://www.theguardian.com/technology/rss',
    'https://www.theguardian.com/science/rss',
    'https://www.theguardian.com/business/rss',
    'https://www.theguardian.com/sport/rss',
    'https://www.theguardian.com/culture/rss',
    'https://www.theguardian.com/environment/rss',
];

// Real Guardian section pages that definitely exist
const SECTION_PAGES = [
    'https://www.theguardian.com/',
    'https://www.theguardian.com/world',
    'https://www.theguardian.com/uk-news',
    'https://www.theguardian.com/us-news',
    'https://www.theguardian.com/world/europe-news',
    'https://www.theguardian.com/world/americas',
    'https://www.theguardian.com/world/asia',
    'https://www.theguardian.com/world/africa',
    'https://www.theguardian.com/world/middleeast',
    'https://www.theguardian.com/politics',
    'https://www.theguardian.com/business',
    'https://www.theguardian.com/technology',
    'https://www.theguardian.com/science',
    'https://www.theguardian.com/environment',
    'https://www.theguardian.com/sport',
    'https://www.theguardian.com/football',
    'https://www.theguardian.com/culture',
    'https://www.theguardian.com/film',
    'https://www.theguardian.com/music',
    'https://www.theguardian.com/books',
    'https://www.theguardian.com/tv-and-radio',
    'https://www.theguardian.com/lifeandstyle',
    'https://www.theguardian.com/travel',
    'https://www.theguardian.com/money',
    'https://www.theguardian.com/commentisfree',
];

async function fetchRSS(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { timeout: 10000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                // Extract article URLs from RSS
                const urls = [];
                const regex = /<link>([^<]+theguardian\.com\/[^<]+)<\/link>/g;
                let match;
                while ((match = regex.exec(data)) !== null) {
                    const u = match[1].trim();
                    if (u.includes('/20') && !urls.includes(u)) { // Articles have dates like /2026/
                        urls.push(u);
                    }
                }
                resolve(urls);
            });
        }).on('error', () => resolve([]));
    });
}

async function main() {
    console.log('Fetching real Guardian URLs from RSS feeds...\n');

    const allUrls = new Set(SECTION_PAGES);

    // Fetch each RSS feed
    for (const feed of RSS_FEEDS) {
        console.log(`Fetching: ${feed}`);
        const urls = await fetchRSS(feed);
        urls.forEach(u => allUrls.add(u));
        console.log(`  Found ${urls.length} article URLs`);
    }

    const urlArray = Array.from(allUrls).slice(0, 500);
    console.log(`\nTotal unique URLs: ${urlArray.length}`);
    console.log('\nSample URLs:');
    urlArray.slice(0, 10).forEach(u => console.log(`  ${u}`));

    // Queue to worker
    console.log('\nQueuing to worker...');
    const data = JSON.stringify({ urls: urlArray });

    const req = http.request({
        hostname: 'localhost',
        port: 3120,
        path: '/api/jobs',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => console.log('Response:', body));
    });

    req.on('error', e => console.error('Error:', e.message));
    req.write(data);
    req.end();
}

main();
