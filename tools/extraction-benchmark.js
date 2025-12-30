#!/usr/bin/env node
'use strict';

/**
 * Extraction Benchmark — Compare extractors on golden fixtures
 * 
 * Benchmarks different extraction methods against the golden fixture set
 * to identify the best extractor for each site type.
 * 
 * Usage:
 *   node tools/extraction-benchmark.js
 *   node tools/extraction-benchmark.js --fixture foreign/arabic-energy-news
 *   node tools/extraction-benchmark.js --json --output results.json
 *   node tools/extraction-benchmark.js --extractor readability
 * 
 * Options:
 *   --fixture <path>    Run only on specific fixture
 *   --category <cat>    Run only on fixtures in category
 *   --extractor <name>  Run only specific extractor
 *   --json              Output results as JSON
 *   --output <file>     Write results to file
 *   --verbose           Show detailed extraction output
 *   --help              Show this help
 */

const fs = require('fs');
const path = require('path');

// Lazy load dependencies
let JSDOM, Readability, TemplateExtractor;

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

if (args.includes('--help')) {
  console.log(`
Extraction Benchmark — Compare extractors on golden fixtures

Usage:
  node tools/extraction-benchmark.js [options]

Options:
  --fixture <path>    Run only on specific fixture (e.g., "wire/breaking-news")
  --category <cat>    Run only on fixtures in category
  --extractor <name>  Run only specific extractor (readability, template, cheerio)
  --json              Output results as JSON
  --output <file>     Write results to file
  --verbose           Show detailed extraction output
  --help              Show this help

Examples:
  node tools/extraction-benchmark.js
  node tools/extraction-benchmark.js --category wire --verbose
  node tools/extraction-benchmark.js --json --output tmp/benchmark-results.json
`);
  process.exit(0);
}

const fixtureFilter = getArg('--fixture');
const categoryFilter = getArg('--category');
const extractorFilter = getArg('--extractor');
const jsonOutput = args.includes('--json');
const outputFile = getArg('--output');
const verbose = args.includes('--verbose');

const FIXTURES_DIR = path.join(__dirname, '../tests/golden/fixtures');

/**
 * Load extractors dynamically
 */
function loadExtractors() {
  const extractors = {};
  
  // Readability extractor
  try {
    JSDOM = require('jsdom').JSDOM;
    Readability = require('@mozilla/readability').Readability;
    
    extractors.readability = {
      name: 'Readability',
      version: require('@mozilla/readability/package.json').version,
      extract: (html, url) => {
        const dom = new JSDOM(html, { url });
        const reader = new Readability(dom.window.document);
        const result = reader.parse();
        
        if (!result) return null;
        
        return {
          title: result.title,
          body: result.textContent,
          author: result.byline,
          excerpt: result.excerpt,
          siteName: result.siteName,
          success: true
        };
      }
    };
  } catch (err) {
    console.warn('⚠️  Readability not available:', err.message);
  }
  
  // Template extractor (custom)
  try {
    TemplateExtractor = require('../src/extraction/TemplateExtractor').TemplateExtractor;
    
    extractors.template = {
      name: 'TemplateExtractor',
      version: 'local',
      extract: (html, url) => {
        const extractor = new TemplateExtractor({
          logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
        });
        return extractor.extract(html, {}, { url });
      }
    };
  } catch (err) {
    console.warn('⚠️  TemplateExtractor not available:', err.message);
  }
  
  // Cheerio-based simple extractor
  try {
    const cheerio = require('cheerio');
    
    extractors.cheerio = {
      name: 'Cheerio (simple)',
      version: require('cheerio/package.json').version,
      extract: (html, url) => {
        const $ = cheerio.load(html);
        
        // Remove unwanted elements
        $('script, style, nav, footer, aside, .ad, .advertisement').remove();
        
        // Extract title
        const title = $('h1').first().text().trim() || 
                      $('article h1').text().trim() ||
                      $('title').text().trim();
        
        // Extract body
        const body = $('article').text().trim() ||
                     $('main').text().trim() ||
                     $('body').text().trim();
        
        // Extract author
        const author = $('[rel="author"]').text().trim() ||
                       $('.author').text().trim() ||
                       $('[class*="byline"]').text().trim() ||
                       $('meta[name="author"]').attr('content');
        
        // Extract date
        const date = $('time').attr('datetime') ||
                     $('meta[property="article:published_time"]').attr('content');
        
        return {
          title,
          body,
          author,
          date,
          success: !!title && body.length > 100
        };
      }
    };
  } catch (err) {
    console.warn('⚠️  Cheerio not available:', err.message);
  }
  
  return extractors;
}

/**
 * Score an extraction against expected values
 */
function scoreExtraction(extraction, expected) {
  if (!extraction) {
    return { score: 0, factors: { noExtraction: 1 }, details: {} };
  }
  
  const factors = {};
  const details = {};
  
  // Title scoring
  if (expected.title) {
    const hasTitle = !!extraction.title;
    const expectedTitle = typeof expected.title === 'string'
      ? expected.title
      : expected.title.exact || expected.title.contains;
    
    if (expectedTitle) {
      const titleMatches = hasTitle && extraction.title.includes(expectedTitle);
      factors.title = titleMatches ? 1 : (hasTitle ? 0.5 : 0);
      details.title = {
        expected: expectedTitle,
        got: extraction.title,
        match: titleMatches
      };
    } else {
      factors.hasTitle = hasTitle ? 1 : 0;
    }
  } else {
    factors.hasTitle = extraction.title ? 1 : 0;
  }
  
  // Body scoring
  const bodyText = extraction.body || extraction.textContent || '';
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
  
  if (expected.bodyWordCountMin) {
    factors.wordCount = wordCount >= expected.bodyWordCountMin ? 1 : wordCount / expected.bodyWordCountMin;
    details.wordCount = { expected: expected.bodyWordCountMin, got: wordCount };
  } else {
    factors.hasBody = wordCount > 100 ? 1 : wordCount / 100;
  }
  
  // Check for expected phrases
  if (expected.bodyContains && expected.bodyContains.length > 0) {
    const bodyLower = bodyText.toLowerCase();
    let foundCount = 0;
    
    for (const phrase of expected.bodyContains) {
      if (bodyLower.includes(phrase.toLowerCase())) {
        foundCount++;
      }
    }
    
    factors.phrases = foundCount / expected.bodyContains.length;
    details.phrases = { expected: expected.bodyContains.length, found: foundCount };
  }
  
  // Author scoring
  if (expected.author) {
    const hasAuthor = !!extraction.author;
    const expectedAuthor = typeof expected.author === 'string' 
      ? expected.author 
      : expected.author.contains || expected.author.exact;
    
    if (expectedAuthor) {
      const authorMatches = hasAuthor && extraction.author.toLowerCase().includes(expectedAuthor.toLowerCase());
      factors.author = authorMatches ? 1 : (hasAuthor ? 0.3 : 0);
      details.author = { expected: expectedAuthor, got: extraction.author };
    } else {
      factors.author = hasAuthor ? 1 : 0;
      details.author = { got: extraction.author };
    }
  }
  
  // Date scoring
  if (expected.publishDate) {
    const hasDate = !!(extraction.date || extraction.publishDate);
    factors.date = hasDate ? 1 : 0;
    details.date = { expected: expected.publishDate, got: extraction.date };
  }
  
  // Calculate overall score
  const weights = {
    title: 0.25,
    hasTitle: 0.15,
    wordCount: 0.25,
    hasBody: 0.2,
    phrases: 0.15,
    author: 0.1,
    date: 0.1
  };
  
  let totalWeight = 0;
  let weightedScore = 0;
  
  for (const [key, value] of Object.entries(factors)) {
    const weight = weights[key] || 0.1;
    totalWeight += weight;
    weightedScore += value * weight;
  }
  
  const score = totalWeight > 0 ? weightedScore / totalWeight : 0;
  
  return { score, factors, details };
}

/**
 * Discover fixtures in the fixtures directory
 */
function discoverFixtures() {
  const fixtures = [];
  
  if (!fs.existsSync(FIXTURES_DIR)) {
    console.error(`❌ Fixtures directory not found: ${FIXTURES_DIR}`);
    return fixtures;
  }
  
  function walkCategory(categoryPath, categoryName) {
    if (!fs.existsSync(categoryPath)) return;
    
    const items = fs.readdirSync(categoryPath, { withFileTypes: true });
    for (const item of items) {
      if (!item.isDirectory()) continue;
      
      const fixtureDir = path.join(categoryPath, item.name);
      const htmlPath = path.join(fixtureDir, 'page.html');
      const metaPath = path.join(fixtureDir, 'metadata.json');
      
      if (!fs.existsSync(htmlPath)) continue;
      
      const fixturePath = `${categoryName}/${item.name}`;
      
      // Apply filters
      if (fixtureFilter && fixturePath !== fixtureFilter) continue;
      if (categoryFilter && categoryName !== categoryFilter) continue;
      
      let metadata = {};
      if (fs.existsSync(metaPath)) {
        try {
          metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        } catch {}
      }
      
      fixtures.push({
        path: fixturePath,
        category: categoryName,
        name: item.name,
        htmlPath,
        metaPath: fs.existsSync(metaPath) ? metaPath : null,
        metadata,
        expected: metadata.expected || {},
        url: metadata.url || `https://${item.name}.example.com`
      });
    }
  }
  
  // Also handle flat files (legacy)
  const entries = fs.readdirSync(FIXTURES_DIR, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (categoryFilter && entry.name !== categoryFilter) continue;
      walkCategory(path.join(FIXTURES_DIR, entry.name), entry.name);
    } else if (entry.name.endsWith('.html') && !categoryFilter) {
      // Legacy flat file format
      const baseName = entry.name.replace('.html', '');
      const expectedPath = path.join(FIXTURES_DIR, `${baseName}.expected.json`);
      
      if (fixtureFilter && baseName !== fixtureFilter) continue;
      
      let expected = {};
      if (fs.existsSync(expectedPath)) {
        try {
          expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
        } catch {}
      }
      
      fixtures.push({
        path: baseName,
        category: 'legacy',
        name: baseName,
        htmlPath: path.join(FIXTURES_DIR, entry.name),
        metaPath: fs.existsSync(expectedPath) ? expectedPath : null,
        metadata: expected,
        expected: expected.expected || expected,
        url: expected.url || `https://${baseName}.example.com`
      });
    }
  }
  
  return fixtures;
}

/**
 * Run benchmark on a single fixture
 */
function benchmarkFixture(fixture, extractors) {
  const html = fs.readFileSync(fixture.htmlPath, 'utf8');
  const results = {};
  
  for (const [key, extractor] of Object.entries(extractors)) {
    if (extractorFilter && key !== extractorFilter) continue;
    
    const startTime = Date.now();
    let extraction = null;
    let error = null;
    
    try {
      extraction = extractor.extract(html, fixture.url);
    } catch (err) {
      error = err.message;
    }
    
    const durationMs = Date.now() - startTime;
    const { score, factors, details } = scoreExtraction(extraction, fixture.expected);
    
    results[key] = {
      extractor: extractor.name,
      score,
      factors,
      details,
      durationMs,
      error,
      extraction: verbose ? extraction : null
    };
  }
  
  // Determine winner
  const scores = Object.entries(results)
    .map(([key, r]) => ({ key, score: r.score }))
    .sort((a, b) => b.score - a.score);
  
  const winner = scores[0]?.key || 'none';
  const winnerScore = scores[0]?.score || 0;
  
  return {
    fixture: fixture.path,
    category: fixture.category,
    expected: fixture.expected,
    results,
    winner,
    winnerScore,
    scores
  };
}

async function main() {
  const extractors = loadExtractors();
  const extractorNames = Object.keys(extractors);
  
  if (extractorNames.length === 0) {
    console.error('❌ No extractors available. Install @mozilla/readability or check TemplateExtractor.');
    process.exit(1);
  }
  
  if (!jsonOutput) {
    console.log('🔬 Extraction Benchmark');
    console.log(`   Extractors: ${extractorNames.join(', ')}`);
  }
  
  const fixtures = discoverFixtures();
  
  if (fixtures.length === 0) {
    console.error('❌ No fixtures found.');
    process.exit(1);
  }
  
  if (!jsonOutput) {
    console.log(`   Fixtures: ${fixtures.length}`);
    console.log();
  }
  
  const allResults = [];
  const winCounts = {};
  const categoryWins = {};
  
  for (const name of extractorNames) {
    winCounts[name] = 0;
  }
  
  for (const fixture of fixtures) {
    const result = benchmarkFixture(fixture, extractors);
    allResults.push(result);
    
    if (result.winner && result.winner !== 'none') {
      winCounts[result.winner] = (winCounts[result.winner] || 0) + 1;
      
      if (!categoryWins[fixture.category]) {
        categoryWins[fixture.category] = {};
      }
      categoryWins[fixture.category][result.winner] = 
        (categoryWins[fixture.category][result.winner] || 0) + 1;
    }
    
    if (!jsonOutput && !verbose) {
      const winnerInfo = result.winnerScore > 0 
        ? `${result.winner} (${(result.winnerScore * 100).toFixed(0)}%)`
        : 'no winner';
      console.log(`${fixture.path}: ${winnerInfo}`);
    } else if (verbose && !jsonOutput) {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`📄 ${fixture.path}`);
      console.log(`   Category: ${fixture.category}`);
      
      for (const [key, res] of Object.entries(result.results)) {
        console.log(`\n   ${res.extractor}:`);
        console.log(`     Score: ${(res.score * 100).toFixed(1)}%`);
        console.log(`     Time: ${res.durationMs}ms`);
        if (res.error) {
          console.log(`     Error: ${res.error}`);
        }
        console.log(`     Factors:`, res.factors);
      }
      
      console.log(`\n   🏆 Winner: ${result.winner}`);
    }
  }
  
  // Summary
  const summary = {
    totalFixtures: fixtures.length,
    extractors: extractorNames,
    winners: winCounts,
    categoryBreakdown: categoryWins,
    averageScores: {}
  };
  
  // Calculate average scores per extractor
  for (const name of extractorNames) {
    const scores = allResults
      .filter(r => r.results[name])
      .map(r => r.results[name].score);
    
    summary.averageScores[name] = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;
  }
  
  // Output
  if (jsonOutput) {
    const output = { results: allResults, summary };
    const outputStr = JSON.stringify(output, null, 2);
    
    if (outputFile) {
      fs.mkdirSync(path.dirname(outputFile), { recursive: true });
      fs.writeFileSync(outputFile, outputStr, 'utf8');
      console.error(`Results written to ${outputFile}`);
    } else {
      console.log(outputStr);
    }
  } else {
    console.log('\n' + '═'.repeat(50));
    console.log('📊 Summary');
    console.log(`   Total fixtures: ${fixtures.length}`);
    console.log('\n   Wins per extractor:');
    
    const sortedWins = Object.entries(winCounts)
      .sort((a, b) => b[1] - a[1]);
    
    for (const [name, count] of sortedWins) {
      const pct = ((count / fixtures.length) * 100).toFixed(1);
      console.log(`     ${name}: ${count} (${pct}%)`);
    }
    
    console.log('\n   Average scores:');
    for (const [name, avg] of Object.entries(summary.averageScores)) {
      console.log(`     ${name}: ${(avg * 100).toFixed(1)}%`);
    }
    
    // Category breakdown
    if (Object.keys(categoryWins).length > 1) {
      console.log('\n   By category:');
      for (const [cat, wins] of Object.entries(categoryWins)) {
        const winStr = Object.entries(wins)
          .map(([n, c]) => `${n}:${c}`)
          .join(', ');
        console.log(`     ${cat}: ${winStr}`);
      }
    }
  }
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
