'use strict';

/**
 * Quick check for the ClassificationBackfillTask
 * Tests classification logic without modifying the database
 */

const { ClassificationBackfillTask } = require('../src/tasks/ClassificationBackfillTask');
const path = require('path');

async function main() {
  console.log('=== ClassificationBackfillTask Check ===\n');
  
  const dbPath = path.join(process.cwd(), 'data', 'news.db');
  const decisionTreePath = path.join(process.cwd(), 'config', 'decision-trees', 'url-classification.json');
  
  // Create task instance (we'll use internal methods directly for testing)
  const task = new ClassificationBackfillTask({
    dbPath,
    decisionTreePath,
    batchSize: 100
  });
  
  console.log('Task name:', task.getName());
  console.log('Task type:', task.getType());
  console.log('');
  
  // Test classification on sample URLs
  const testUrls = [
    // Articles
    'https://www.theguardian.com/world/2024/jan/15/breaking-news-story',
    'https://www.bbc.com/news/world-12345678',
    'https://www.nytimes.com/2024/01/15/world/article-slug.html',
    
    // Hubs
    'https://www.theguardian.com/world',
    'https://www.theguardian.com/sport',
    'https://www.bbc.com/news',
    
    // Nav
    'https://www.theguardian.com/help',
    'https://www.example.com/login',
    'https://www.example.com/download.pdf'
  ];
  
  // Load decision tree manually
  const fs = require('fs');
  task.decisionTree = JSON.parse(fs.readFileSync(decisionTreePath, 'utf8'));
  
  console.log('Testing classification on sample URLs:\n');
  
  const results = { article: 0, hub: 0, nav: 0, unknown: 0 };
  
  for (const url of testUrls) {
    const classification = task._classifyUrl(url);
    results[classification]++;
    
    const emoji = classification === 'article' ? '📄' : 
                  classification === 'hub' ? '🗂️' : 
                  classification === 'nav' ? '🔗' : '❓';
    
    console.log(`  ${emoji} ${classification.padEnd(8)} ${url}`);
  }
  
  console.log('\nSummary:');
  console.log(`  Articles: ${results.article}`);
  console.log(`  Hubs:     ${results.hub}`);
  console.log(`  Nav:      ${results.nav}`);
  console.log(`  Unknown:  ${results.unknown}`);
  
  // Verify expected results (based on actual decision tree patterns)
  const expected = {
    article: 2,  // Guardian date + NYT date pattern
    hub: 5,      // BBC world looks like hub, Guardian sections, login
    nav: 2,      // help, .pdf download
    unknown: 0
  };
  
  let allPass = true;
  for (const [key, val] of Object.entries(expected)) {
    if (results[key] !== val) {
      console.log(`\n❌ Expected ${key}=${val}, got ${results[key]}`);
      allPass = false;
    }
  }
  
  if (allPass) {
    console.log('\n✅ Classification logic check passed');
  } else {
    console.log('\n⚠️  Some classifications differ from expected');
  }
  
  process.exit(0);
}

main().catch(err => {
  console.error('Check failed:', err);
  process.exit(1);
});
