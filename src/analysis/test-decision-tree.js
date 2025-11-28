/**
 * Test script for Decision Tree Engine
 * Tests boolean classification with full audit trail
 */

const { DecisionTreeEngine, DecisionJustification } = require('./decisionTreeEngine');
const path = require('path');

// Load the page-categories configuration
const configPath = path.join(__dirname, '../../config/decision-trees/page-categories.json');
const engine = DecisionTreeEngine.fromFile(configPath);

console.log('='.repeat(70));
console.log('Decision Tree Engine Test');
console.log('='.repeat(70));
console.log(`Loaded: ${engine.name} v${engine.version}`);
console.log(`Categories: ${engine.getCategoryIds().join(', ')}`);
console.log('');

// Test cases
const testCases = [
  {
    name: 'Guardian Long Read Hub',
    context: {
      url: 'https://www.theguardian.com/news/series/the-long-read',
      title: 'The Long Read | News | The Guardian',
      classification: 'nav',
      article_links_count: 82,
      max_linked_word_count: 8500
    },
    expectedCategory: 'in-depth'
  },
  {
    name: 'Guardian Opinion Section',
    context: {
      url: 'https://www.theguardian.com/uk/commentisfree',
      title: 'Opinion | The Guardian',
      classification: 'nav',
      article_links_count: 45
    },
    expectedCategory: 'opinion'
  },
  {
    name: 'BBC Live Coverage',
    context: {
      url: 'https://www.bbc.com/news/live/world-123456',
      title: 'Breaking News - Live Updates',
      classification: 'article'
    },
    expectedCategory: 'live'
  },
  {
    name: 'NYT Explainer Section',
    context: {
      url: 'https://www.nytimes.com/explain/2024/what-is-ai',
      title: 'What Is AI? A Guide',
      classification: 'article'
    },
    expectedCategory: 'explainer'
  },
  {
    name: 'News Video Hub',
    context: {
      url: 'https://www.example.com/video/news-videos',
      title: 'Video News',
      classification: 'nav',
      article_links_count: 20
    },
    expectedCategory: 'multimedia'
  },
  {
    name: 'Generic News Article (no match)',
    context: {
      url: 'https://www.example.com/politics/election-2024',
      title: 'Election Results 2024',
      classification: 'article',
      article_links_count: 0
    },
    expectedCategory: null
  },
  {
    name: 'Series with High Word Count',
    context: {
      url: 'https://www.nytimes.com/series/climate-investigation',
      title: 'Climate Investigation Series',
      classification: 'nav',
      article_links_count: 12,
      section_avg_word_count: 2800,
      domain_avg_word_count: 1200
    },
    expectedCategory: 'in-depth'
  }
];

// Run tests
let passed = 0;
let failed = 0;

for (const test of testCases) {
  console.log('-'.repeat(70));
  console.log(`TEST: ${test.name}`);
  console.log(`URL: ${test.context.url}`);
  console.log('');
  
  const matches = engine.getMatches(test.context);
  
  if (matches.length === 0) {
    if (test.expectedCategory === null) {
      console.log('✓ PASS: No matches (expected)');
      passed++;
    } else {
      console.log(`✗ FAIL: Expected ${test.expectedCategory}, got no matches`);
      failed++;
    }
  } else {
    const primaryMatch = matches[0];
    
    console.log(`Match: ${primaryMatch.categoryName}`);
    console.log(`Confidence: ${(primaryMatch.confidence * 100).toFixed(0)}%`);
    console.log(`Reason: ${primaryMatch.reason}`);
    console.log('');
    console.log('Decision Path:');
    for (const step of primaryMatch.path) {
      console.log(`  ${step.nodeId}: ${step.condition} → ${step.branch.toUpperCase()}`);
    }
    console.log('');
    console.log(`Encoded Path: ${primaryMatch.encodedPath}`);
    
    // Compact storage format
    const compact = DecisionJustification.toCompact(primaryMatch);
    console.log(`Compact Storage: ${JSON.stringify(compact)}`);
    
    if (primaryMatch.categoryId === test.expectedCategory) {
      console.log('');
      console.log('✓ PASS');
      passed++;
    } else {
      console.log('');
      console.log(`✗ FAIL: Expected ${test.expectedCategory}, got ${primaryMatch.categoryId}`);
      failed++;
    }
  }
}

console.log('');
console.log('='.repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(70));

// Show storage efficiency
console.log('');
console.log('Storage Efficiency Demo:');
const sampleResult = engine.evaluate('in-depth', testCases[0].context);
const fullJson = JSON.stringify(sampleResult, null, 2);
const compactJson = JSON.stringify(DecisionJustification.toCompact(sampleResult));
console.log(`Full result: ${fullJson.length} bytes`);
console.log(`Compact storage: ${compactJson.length} bytes`);
console.log(`Savings: ${((1 - compactJson.length / fullJson.length) * 100).toFixed(0)}%`);

process.exit(failed > 0 ? 1 : 0);
