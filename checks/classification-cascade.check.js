'use strict';

/**
 * Classification Cascade Integration Check
 * 
 * Tests that Stage1 (URL), Stage2 (Content), and StageAggregator work together.
 * 
 * Usage: node checks/classification-cascade.check.js
 */

const path = require('path');

// Load from the classifiers module
const { Stage1UrlClassifier, Stage2ContentClassifier, StageAggregator } = require('../src/classifiers');

console.log('=== Classification Cascade Integration Check ===\n');

// Test fixtures
const testUrls = [
  'https://www.theguardian.com/uk-news/2024/jan/15/breaking-news-story',
  'https://www.example.com/category/technology',
  'https://news.bbc.co.uk/world/asia/story-12345678',
  'https://www.example.com/sitemap',
  'https://www.example.com/about'
];

const articleHtml = `
<!DOCTYPE html>
<html>
<head>
  <script type="application/ld+json">
  {
    "@type": "NewsArticle",
    "headline": "Test Article Headline",
    "datePublished": "2024-01-15"
  }
  </script>
</head>
<body>
  <article>
    <h1>Test Article Headline</h1>
    <p>This is a comprehensive news article about something important. It contains multiple sentences
    to simulate real article content. The quick brown fox jumps over the lazy dog. This paragraph
    continues with more text to increase the word count significantly.</p>
    <p>Another paragraph with substantial content that helps demonstrate this is an article. News
    articles typically have multiple paragraphs of text discussing various aspects of a story.</p>
    <p>The third paragraph adds even more content. Lorem ipsum dolor sit amet, consectetur adipiscing
    elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
    <h2>Related Context</h2>
    <p>More detailed analysis of the situation with additional information and expert quotes.</p>
  </article>
</body>
</html>
`;

const hubHtml = `
<!DOCTYPE html>
<html>
<body>
  <nav>
    <a href="/section1">Section 1</a>
    <a href="/section2">Section 2</a>
  </nav>
  <main>
    <h1>Latest News</h1>
    <a href="/story1">Story 1</a>
    <a href="/story2">Story 2</a>
    <a href="/story3">Story 3</a>
    <a href="/story4">Story 4</a>
    <a href="/story5">Story 5</a>
    <a href="/story6">Story 6</a>
    <a href="/story7">Story 7</a>
    <a href="/story8">Story 8</a>
    <a href="/story9">Story 9</a>
    <a href="/story10">Story 10</a>
    <a href="/story11">Story 11</a>
    <a href="/story12">Story 12</a>
  </main>
</body>
</html>
`;

let passed = 0;
let failed = 0;

function check(description, condition, extra = null) {
  if (condition) {
    console.log(`✅ ${description}`);
    passed++;
  } else {
    console.log(`❌ ${description}`);
    if (extra) console.log(`   ${JSON.stringify(extra)}`);
    failed++;
  }
}

// Stage 1: URL Classification
console.log('--- Stage 1: URL Classification ---');
const urlClassifier = new Stage1UrlClassifier();

for (const url of testUrls) {
  const result = urlClassifier.classify(url);
  console.log(`  ${url}`);
  console.log(`    → ${result.classification} (${(result.confidence * 100).toFixed(0)}%) - ${result.reason}`);
}
console.log();

const guardianResult = urlClassifier.classify('https://www.theguardian.com/uk-news/2024/jan/15/breaking-news-story');
check('Guardian URL detected as article', guardianResult.classification === 'article');

const categoryResult = urlClassifier.classify('https://www.example.com/category/technology');
check('Category URL detected as hub', categoryResult.classification === 'hub');

// Stage 2: Content Classification
console.log('\n--- Stage 2: Content Classification ---');
const contentClassifier = new Stage2ContentClassifier();

const articleResult = contentClassifier.classify(articleHtml);
console.log(`  Article HTML:`);
console.log(`    → ${articleResult.classification} (${(articleResult.confidence * 100).toFixed(0)}%) - ${articleResult.reason}`);
console.log(`    Signals: wordCount=${articleResult.signals.wordCount}, paragraphs=${articleResult.signals.paragraphCount}, schema=${articleResult.signals.schema?.hasArticleType}`);

check('Article HTML detected as article', articleResult.classification === 'article');
check('Article has schema.org signals', articleResult.signals.schema?.hasArticleType === true);

const hubResult = contentClassifier.classify(hubHtml);
console.log(`  Hub HTML:`);
console.log(`    → ${hubResult.classification} (${(hubResult.confidence * 100).toFixed(0)}%) - ${hubResult.reason}`);
console.log(`    Signals: wordCount=${hubResult.signals.wordCount}, linkDensity=${hubResult.signals.linkDensity.toFixed(2)}`);

check('Hub HTML detected as hub or nav', ['hub', 'nav'].includes(hubResult.classification));
check('Hub has high link density', hubResult.signals.linkDensity > 0.3);

// Stage Aggregator
console.log('\n--- Stage Aggregator ---');
const aggregator = new StageAggregator();

// Test 1: URL only (pre-download)
const urlOnly = aggregator.aggregate(guardianResult, null, null);
console.log(`  URL-only aggregation:`);
console.log(`    → ${urlOnly.classification} (${(urlOnly.confidence * 100).toFixed(0)}%)`);
console.log(`    Decision: ${urlOnly.provenance.aggregator.decision}`);

check('URL-only uses url stage', urlOnly.provenance.aggregator.decision === 'url-only');

// Test 2: URL + Content agreement
const contentForUrl = contentClassifier.classify(articleHtml);
const combined = aggregator.aggregate(guardianResult, contentForUrl, null);
console.log(`  URL + Content (agreement):`);
console.log(`    → ${combined.classification} (${(combined.confidence * 100).toFixed(0)}%)`);
console.log(`    Decision: ${combined.provenance.aggregator.decision}`);

check('Agreement boosts confidence', combined.provenance.aggregator.decision === 'unanimous' || combined.confidence >= guardianResult.confidence);

// Test 3: URL + Content disagreement
const disagreementUrl = urlClassifier.classify('https://www.example.com/category/news');
const disagreementContent = contentClassifier.classify(articleHtml);
const disagreed = aggregator.aggregate(disagreementUrl, disagreementContent, null);
console.log(`  URL + Content (disagreement):`);
console.log(`    URL says: ${disagreementUrl.classification} (${(disagreementUrl.confidence * 100).toFixed(0)}%)`);
console.log(`    Content says: ${disagreementContent.classification} (${(disagreementContent.confidence * 100).toFixed(0)}%)`);
console.log(`    → Final: ${disagreed.classification} (${(disagreed.confidence * 100).toFixed(0)}%)`);
console.log(`    Decision: ${disagreed.provenance.aggregator.decision}`);

check('Provenance tracks all stages', disagreed.provenance.url !== null && disagreed.provenance.content !== null);

// Test 4: No valid stages
const unknownUrl = { classification: 'unknown', confidence: 0.5, reason: 'no-match' };
const unknownContent = { classification: 'unknown', confidence: 0.5, reason: 'no-signals' };
const noValidStages = aggregator.aggregate(unknownUrl, unknownContent, null);
console.log(`  Both stages unknown:`);
console.log(`    → ${noValidStages.classification} (${(noValidStages.confidence * 100).toFixed(0)}%)`);
console.log(`    Decision: ${noValidStages.provenance.aggregator.decision}`);

check('Unknown stages handled gracefully', noValidStages.provenance.aggregator.decision === 'no-valid-stages');

// Summary
console.log('\n=== Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
