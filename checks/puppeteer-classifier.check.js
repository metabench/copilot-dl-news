'use strict';

/**
 * Stage 3 Puppeteer Classifier Check
 * 
 * Tests the Puppeteer-based classification on sample URLs.
 * Requires Puppeteer (browser will be launched).
 * 
 * Usage: node checks/puppeteer-classifier.check.js [url]
 */

const { Stage3PuppeteerClassifier } = require('../src/classifiers');

const DEFAULT_URLS = [
  // Known article
  'https://www.bbc.com/news/world',
  // Known hub/nav
  'https://news.ycombinator.com'
];

async function main() {
  const urls = process.argv.slice(2);
  const testUrls = urls.length > 0 ? urls : DEFAULT_URLS;

  console.log('=== Stage 3: Puppeteer Classifier Check ===\n');
  console.log('Note: This test launches a headless browser.\n');

  const classifier = new Stage3PuppeteerClassifier({
    headless: true,
    navigationTimeout: 30000,
    extraWaitMs: 2000
  });

  try {
    console.log('Initializing classifier (launching browser)...');
    await classifier.init();
    console.log('Browser launched.\n');

    for (const url of testUrls) {
      console.log(`--- Classifying: ${url} ---`);
      const startTime = Date.now();
      
      try {
        const result = await classifier.classify(url);
        const elapsed = Date.now() - startTime;
        
        console.log(`  Classification: ${result.classification}`);
        console.log(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`);
        console.log(`  Reason: ${result.reason}`);
        console.log(`  Time: ${elapsed}ms`);
        
        // Show key signals
        const s = result.signals;
        console.log(`  Signals:`);
        console.log(`    - Title: ${s.title?.substring(0, 50) || 'N/A'}${s.title?.length > 50 ? '...' : ''}`);
        console.log(`    - Page word count: ${s.pageWordCount}`);
        console.log(`    - Total links: ${s.totalLinkCount}`);
        console.log(`    - Nav links: ${s.navLinkCount}`);
        console.log(`    - Semantic: article=${s.semantic.hasArticle}, main=${s.semantic.hasMain}, nav=${s.semantic.hasNav}`);
        console.log(`    - Schema: ${s.schema.hasArticleSchema ? s.schema.articleType : 'none'}`);
        
        if (s.largestBlock) {
          const b = s.largestBlock;
          console.log(`    - Largest block: ${b.wordCount} words, ${b.linkDensity.toFixed(2)} link density`);
        }
        
        console.log();
      } catch (err) {
        console.log(`  ERROR: ${err.message}\n`);
      }
    }

  } finally {
    console.log('Shutting down browser...');
    await classifier.destroy();
    console.log('Done.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
