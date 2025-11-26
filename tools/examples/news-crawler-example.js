#!/usr/bin/env node

/**
 * Example script demonstrating the NewsCrawler functionality
 * This script shows how the crawler would work with a real news website
 */

const { CrawlerFactory } = require('../../src/crawler/CrawlerFactory');


async function runExample() {
    console.log('News Crawler Example');
    console.log('===================\n');
    
    // Create a crawler instance
    const crawler = CrawlerFactory.create({
        startUrl: 'https://www.theguardian.com',
        rateLimitMs: 2000,  // 2 second delay between requests
        maxDepth: 1,        // Limit to 1 level deep for demo
        dataDir: './data'   // Base directory (includes SQLite DB)
    });

    console.log('Configuration:');
    console.log(`- Start URL: ${crawler.startUrl}`);
    console.log(`- Domain: ${crawler.domain}`);
    console.log(`- Rate limit: ${crawler.rateLimitMs}ms`);
    console.log(`- Max depth: ${crawler.maxDepth}`);
    console.log(`- Base directory: ${crawler.dataDir}\n`);
    
    console.log('Features demonstrated:');
    console.log('✓ Navigation detection (header, nav, footer, menus, breadcrumbs, pagination)');
    console.log('✓ Article link extraction with smart heuristics');
    console.log('✓ robots.txt compliance checking');
    console.log('✓ Rate limiting to be respectful');
    console.log('✓ Domain restriction (stays on theguardian.com)');
    console.log('✓ Visited set to avoid duplicates');
    console.log('✓ Metadata extraction (title, date, section, URL)');
    console.log('\n');
    
    console.log('Article detection patterns:');
    console.log('- /world/, /politics/, /business/, /sport/, /culture/, /opinion/');
    console.log('- /article, /story, /news patterns');
    console.log('- Date-based URLs (YYYY/MM/DD)');
    console.log('- Headlines linking to content\n');
    
    console.log('To run the actual crawler:');
    console.log('  node src/crawl.js https://www.theguardian.com');
    console.log('  npm start  # Uses default Guardian URL');
    console.log('\nNote: External network access may be limited in some environments.');
}

if (require.main === module) {
    runExample().catch(console.error);
}

module.exports = runExample;