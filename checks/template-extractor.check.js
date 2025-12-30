'use strict';

/**
 * Template Extractor Check Script
 * 
 * Validates the TemplateExtractor and TemplateExtractionService components.
 * 
 * Run: node checks/template-extractor.check.js
 */

const path = require('path');
const Database = require('better-sqlite3');
const { TemplateExtractor, TemplateExtractionService, SCHEMA_VERSION } = require('../src/extraction');

// Test HTML samples
const SAMPLE_ARTICLE = `<!DOCTYPE html>
<html>
<head>
  <title>Test Article - Example News</title>
  <meta property="article:published_time" content="2025-12-26T10:00:00Z">
</head>
<body>
  <header class="site-header">
    <nav>Menu items here</nav>
  </header>
  
  <article class="article-content">
    <h1 class="headline">Breaking News: Important Discovery Made</h1>
    <div class="byline">
      <span class="author">By Jane Smith</span>
      <time datetime="2025-12-26T10:00:00Z">December 26, 2025</time>
    </div>
    <div class="article-body">
      <p>Scientists have made a groundbreaking discovery that could change our understanding of the universe. The research team spent years analyzing data from various sources before reaching their conclusions.</p>
      <p>Dr. John Doe, lead researcher, said the findings were unexpected. "We didn't anticipate such a significant result," he explained during a press conference.</p>
      <p>The implications of this discovery are far-reaching. Experts from around the world have weighed in on the findings, with many expressing enthusiasm about the potential applications.</p>
      <p>Further research is planned to validate and expand upon these initial results. The team expects to publish their full findings in a peer-reviewed journal next month.</p>
      <p>This breakthrough represents a major milestone in the field and has already attracted significant attention from the scientific community and the general public alike.</p>
    </div>
  </article>
  
  <aside class="related-articles">
    <h3>Related Stories</h3>
    <ul><li>Other article 1</li><li>Other article 2</li></ul>
  </aside>
  
  <footer>Copyright 2025</footer>
</body>
</html>`;

const MINIMAL_HTML = `<html><body><h1>Title</h1><p>Short text.</p></body></html>`;

// Track test results
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected "${expected}", got "${actual}"`);
  }
}

function assertContains(haystack, needle, message) {
  if (typeof haystack !== 'string' || !haystack.includes(needle)) {
    throw new Error(`${message}: "${needle}" not found in value`);
  }
}

// ─────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────

console.log('\n📐 Template Extractor Check\n');

// Schema version
console.log('🔢 Schema Version:');
test('exports SCHEMA_VERSION constant', () => {
  assert(typeof SCHEMA_VERSION === 'number', 'SCHEMA_VERSION must be a number');
  assert(SCHEMA_VERSION >= 1, 'SCHEMA_VERSION must be >= 1');
});

// TemplateExtractor
console.log('\n📦 TemplateExtractor Class:');
const extractor = new TemplateExtractor();

test('can instantiate with defaults', () => {
  assert(extractor instanceof TemplateExtractor, 'Should create instance');
});

test('extract with valid config returns success', () => {
  const config = {
    titleSelector: 'h1.headline',
    bodySelector: '.article-body',
    dateSelector: 'time[datetime]',
    authorSelector: '.author',
    excludeSelectors: ['.related-articles']
  };
  
  const result = extractor.extract(SAMPLE_ARTICLE, config);
  assert(result.success, 'Should extract successfully');
  assertContains(result.title, 'Breaking News', 'Should extract title');
  assertContains(result.author, 'Jane Smith', 'Should extract author');
  assert(result.wordCount > 50, `Word count ${result.wordCount} should be > 50`);
  assert(result.publicationDate !== null, 'Should extract date');
});

test('extract uses fallback selectors when primary fails', () => {
  const config = {
    titleSelector: '.non-existent',
    titleFallback: ['h1.headline', 'h1'],
    bodySelector: '.non-existent-body',
    bodyFallback: ['.article-body', 'article']
  };
  
  const result = extractor.extract(SAMPLE_ARTICLE, config);
  assert(result.success, 'Should extract using fallbacks');
  assert(result.fallbacksUsed.title, 'Should note title fallback was used');
  assert(result.fallbacksUsed.body, 'Should note body fallback was used');
});

test('extract fails gracefully on invalid HTML', () => {
  const result = extractor.extract(null, {});
  assert(!result.success, 'Should fail for null HTML');
  assertContains(result.error, 'Invalid HTML', 'Should have error message');
});

test('extract fails gracefully on invalid config', () => {
  const result = extractor.extract(SAMPLE_ARTICLE, 'not-json-{');
  assert(!result.success, 'Should fail for invalid config');
  assertContains(result.error, 'Invalid config', 'Should have config error');
});

test('extract reports extraction time', () => {
  const config = { bodySelector: '.article-body' };
  const result = extractor.extract(SAMPLE_ARTICLE, config);
  assert(typeof result.extractionTimeMs === 'number', 'Should have extraction time');
  assert(result.extractionTimeMs >= 0, 'Extraction time should be >= 0');
});

test('extract returns method=template', () => {
  const config = { bodySelector: '.article-body' };
  const result = extractor.extract(SAMPLE_ARTICLE, config);
  assertEquals(result.method, 'template', 'Method should be template');
});

test('extract returns which selectors were used', () => {
  const config = {
    titleSelector: 'h1.headline',
    bodySelector: '.article-body'
  };
  const result = extractor.extract(SAMPLE_ARTICLE, config);
  assertEquals(result.selectors.title, 'h1.headline', 'Should report title selector');
  assertEquals(result.selectors.body, '.article-body', 'Should report body selector');
});

test('excludeSelectors removes content before extraction', () => {
  const config = {
    bodySelector: 'article',
    excludeSelectors: ['.article-body'] // Exclude the main body
  };
  const result = extractor.extract(SAMPLE_ARTICLE, config);
  // Should have very few words since body was excluded
  assert(result.wordCount < 20, `Word count ${result.wordCount} should be < 20 after exclusion`);
});

// Config validation
console.log('\n🔍 Config Validation:');

test('validateConfig accepts valid config', () => {
  const config = {
    titleSelector: 'h1',
    bodySelector: 'article'
  };
  const validation = extractor.validateConfig(config);
  assert(validation.valid, 'Valid config should pass');
  assert(validation.errors.length === 0, 'Should have no errors');
});

test('validateConfig rejects missing required selectors', () => {
  const config = {}; // No title or body selectors
  const validation = extractor.validateConfig(config);
  assert(!validation.valid, 'Should reject missing selectors');
  assert(validation.errors.length > 0, 'Should have errors');
});

test('validateConfig warns about missing optional selectors', () => {
  const config = {
    titleSelector: 'h1',
    bodySelector: 'article'
    // No date or author
  };
  const validation = extractor.validateConfig(config);
  assert(validation.valid, 'Should still be valid');
  assert(validation.warnings.length > 0, 'Should have warnings');
});

test('validateConfig detects invalid CSS selector syntax', () => {
  const config = {
    titleSelector: 'h1[invalid-syntax=',
    bodySelector: 'article'
  };
  const validation = extractor.validateConfig(config);
  assert(!validation.valid, 'Should reject invalid selector');
});

// Config creation
console.log('\n🏗️ Config Creation:');

test('createConfig generates valid config from selectors', () => {
  const selectors = {
    title: 'h1.headline',
    body: '.article-content',
    date: 'time[datetime]',
    author: '.byline .author'
  };
  
  const config = extractor.createConfig(selectors, { url: 'https://example.com', confidence: 0.85 });
  
  assertEquals(config.version, SCHEMA_VERSION, 'Should have current schema version');
  assertEquals(config.titleSelector, 'h1.headline', 'Should set title selector');
  assertEquals(config.bodySelector, '.article-content', 'Should set body selector');
  assertEquals(config.confidence, 0.85, 'Should set confidence');
  assert(config.trainedAt !== null, 'Should have trainedAt timestamp');
  assert(Array.isArray(config.excludeSelectors), 'Should have default exclude selectors');
});

test('createConfig includes default fallbacks', () => {
  const config = extractor.createConfig({});
  assert(Array.isArray(config.titleFallback), 'Should have title fallbacks');
  assert(Array.isArray(config.bodyFallback), 'Should have body fallbacks');
  assert(config.titleFallback.length > 0, 'Should have non-empty fallbacks');
});

test('mergeConfig updates selectors while preserving structure', () => {
  const existingConfig = {
    version: 1,
    titleSelector: 'h1',
    bodySelector: 'article',
    confidence: 0.7,
    trainedAt: '2025-01-01T00:00:00Z'
  };
  
  const newSelectors = {
    title: 'h1.new-headline',
    confidence: 0.9
  };
  
  const merged = extractor.mergeConfig(existingConfig, newSelectors);
  assertEquals(merged.titleSelector, 'h1.new-headline', 'Should update title');
  assertEquals(merged.bodySelector, 'article', 'Should preserve body');
  assert(merged.confidence > 0.7, 'Should update confidence');
  assert(merged.trainedAt !== existingConfig.trainedAt, 'Should update trainedAt');
});

// Date parsing
console.log('\n📅 Date Extraction:');

test('extracts date from time[datetime] attribute', () => {
  const config = { bodySelector: '.article-body', dateSelector: 'time[datetime]' };
  const result = extractor.extract(SAMPLE_ARTICLE, config);
  assert(result.publicationDate !== null, 'Should extract date');
  assertContains(result.publicationDate, '2025-12-26', 'Should have correct date');
});

test('extracts date from meta tag content attribute', () => {
  const config = { 
    bodySelector: '.article-body', 
    dateSelector: 'meta[property="article:published_time"]' 
  };
  const result = extractor.extract(SAMPLE_ARTICLE, config);
  assert(result.publicationDate !== null, 'Should extract date from meta');
});

// TemplateExtractionService (requires DB)
console.log('\n🗄️ TemplateExtractionService:');

let db, service;
try {
  // Use test database
  const dbPath = path.resolve(__dirname, '../data/news.db');
  db = new Database(dbPath);
  
  // Ensure tables exist
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name IN ('layout_signatures', 'layout_templates')
  `).all();
  
  if (tables.length < 2) {
    console.log('  ⏭️ Skipping DB tests (tables not found)');
  } else {
    service = new TemplateExtractionService({ db });
    
    test('can instantiate with database', () => {
      assert(service instanceof TemplateExtractionService, 'Should create instance');
    });
    
    test('getStats returns statistics object', () => {
      const stats = service.getStats();
      assert(typeof stats.templateHits === 'number', 'Should have templateHits');
      assert(typeof stats.templateMisses === 'number', 'Should have templateMisses');
      assert(typeof stats.cacheSize === 'number', 'Should have cacheSize');
    });
    
    test('extractWithTemplate returns null for unknown signature', () => {
      const result = service.extractWithTemplate('<html></html>', 'unknown-hash-12345');
      assert(result === null, 'Should return null for unknown signature');
    });
    
    test('listConfigsForHost returns array', () => {
      const configs = service.listConfigsForHost('example.com');
      assert(Array.isArray(configs), 'Should return array');
    });
    
    test('createConfigFromTeacher generates config from structure', () => {
      const teacherOutput = {
        structure: {
          largestTextBlock: {
            className: 'article-body',
            tagName: 'div'
          },
          metadataBlock: {
            selector: '.meta-date'
          }
        }
      };
      
      const config = service.createConfigFromTeacher(teacherOutput);
      assertEquals(config.bodySelector, '.article-body', 'Should infer body from className');
      assertEquals(config.dateSelector, '.meta-date', 'Should use metadata selector');
    });
    
    test('clearCache empties the config cache', () => {
      service.clearCache();
      const stats = service.getStats();
      assertEquals(stats.cacheSize, 0, 'Cache should be empty');
    });
  }
} catch (err) {
  console.log(`  ⏭️ Skipping DB tests: ${err.message}`);
}

// Cleanup
if (db) db.close();

// Summary
console.log('\n' + '─'.repeat(50));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
