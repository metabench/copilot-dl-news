'use strict';

/**
 * Golden Set Regression Tests
 * 
 * Tests extraction quality against a curated set of HTML fixtures
 * with known expected outputs. Prevents extraction quality degradation.
 * 
 * Fixture structures supported:
 * 1. Flat files (legacy): tests/golden/fixtures/<name>.html + <name>.expected.json
 * 2. Hierarchical (new): tests/golden/fixtures/<category>/<name>/page.html + metadata.json
 * 
 * Run with: npm run test:golden
 */

const fs = require('fs');
const path = require('path');
const { TemplateExtractor } = require('../../src/extraction/TemplateExtractor');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

/**
 * Load all golden fixtures from the fixtures directory
 * Supports both flat file structure (legacy) and hierarchical structure (new)
 * @returns {Array<{name: string, html: string, expected: Object}>}
 */
function loadFixtures() {
  const fixtures = [];
  
  if (!fs.existsSync(FIXTURES_DIR)) {
    console.warn(`Golden fixtures directory not found: ${FIXTURES_DIR}`);
    return fixtures;
  }
  
  const entries = fs.readdirSync(FIXTURES_DIR, { withFileTypes: true });
  
  // 1. Load flat file fixtures (legacy format: <name>.html + <name>.expected.json)
  const flatFiles = entries.filter(e => !e.isDirectory() && e.name.endsWith('.html'));
  for (const htmlEntry of flatFiles) {
    const baseName = htmlEntry.name.replace('.html', '');
    const expectedFile = `${baseName}.expected.json`;
    const expectedPath = path.join(FIXTURES_DIR, expectedFile);
    
    if (!fs.existsSync(expectedPath)) {
      console.warn(`Missing expected file for ${htmlEntry.name}, skipping`);
      continue;
    }
    
    try {
      const html = fs.readFileSync(path.join(FIXTURES_DIR, htmlEntry.name), 'utf8');
      const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
      
      fixtures.push({
        name: expected.name || baseName,
        description: expected.description || '',
        html,
        expected,
        category: expected.category || 'legacy',
        domain: expected.domain || 'unknown',
        fixtureType: 'flat'
      });
    } catch (err) {
      console.error(`Error loading flat fixture ${baseName}: ${err.message}`);
    }
  }
  
  // 2. Load hierarchical fixtures (new format: <category>/<name>/page.html + metadata.json)
  const categoryDirs = entries.filter(e => e.isDirectory());
  for (const categoryEntry of categoryDirs) {
    const categoryPath = path.join(FIXTURES_DIR, categoryEntry.name);
    const fixtureDirs = fs.readdirSync(categoryPath, { withFileTypes: true })
      .filter(e => e.isDirectory());
    
    for (const fixtureEntry of fixtureDirs) {
      const fixturePath = path.join(categoryPath, fixtureEntry.name);
      const htmlPath = path.join(fixturePath, 'page.html');
      const metadataPath = path.join(fixturePath, 'metadata.json');
      
      if (!fs.existsSync(htmlPath)) {
        console.warn(`Missing page.html in ${fixturePath}, skipping`);
        continue;
      }
      
      if (!fs.existsSync(metadataPath)) {
        console.warn(`Missing metadata.json in ${fixturePath}, skipping`);
        continue;
      }
      
      try {
        const html = fs.readFileSync(htmlPath, 'utf8');
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        
        // Convert new metadata format to expected format for compatibility
        const expected = convertMetadataToExpected(metadata);
        
        fixtures.push({
          name: fixtureEntry.name,
          description: metadata.notes || '',
          html,
          expected,
          metadata, // Keep original metadata for new-style assertions
          category: categoryEntry.name,
          domain: extractDomain(metadata.url),
          fixtureType: 'hierarchical',
          edgeCaseType: metadata.edgeCaseType || 'unknown'
        });
      } catch (err) {
        console.error(`Error loading hierarchical fixture ${categoryEntry.name}/${fixtureEntry.name}: ${err.message}`);
      }
    }
  }
  
  return fixtures;
}

/**
 * Convert new metadata.json format to legacy expected format for test compatibility
 */
function convertMetadataToExpected(metadata) {
  const exp = metadata.expected || {};
  return {
    name: exp.title || 'Unknown',
    category: metadata.category || 'unknown',
    domain: extractDomain(metadata.url),
    extractionConfig: {},
    expected: {
      title: exp.title ? { exact: exp.title } : undefined,
      author: exp.author ? { contains: exp.author } : undefined,
      date: exp.publishDate ? { iso: exp.publishDate } : undefined,
      body: {
        minWordCount: exp.bodyWordCountMin || 50,
        containsSnippets: exp.bodyContains || [],
        excludes: exp.bodyNotContains || []
      },
      extraction: {
        success: true,
        minConfidence: 0.5
      }
    }
  };
}

/**
 * Extract domain from URL
 */
function extractDomain(url) {
  if (!url) return 'unknown';
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

describe('Golden Set Regression Tests', () => {
  let extractor;
  const fixtures = loadFixtures();
  
  beforeAll(() => {
    extractor = new TemplateExtractor({
      logger: {
        info: () => {},
        warn: () => {},
        error: console.error,
        debug: () => {}
      },
      minWordCount: 30 // Lower threshold for testing
    });
  });

  if (fixtures.length === 0) {
    it('should have fixtures to test', () => {
      console.warn('No golden fixtures found. Add .html and .expected.json pairs to tests/golden/fixtures/');
      expect(fixtures.length).toBeGreaterThan(0);
    });
    return;
  }

  describe.each(fixtures)('$name ($category)', (fixture) => {
    let result;
    
    beforeAll(() => {
      const config = fixture.expected.extractionConfig;
      result = extractor.extract(fixture.html, config, {
        url: `https://${fixture.domain}/test`
      });
    });

    // Title validation
    if (fixture.expected.expected.title) {
      const titleExpect = fixture.expected.expected.title;
      
      if (titleExpect.exact) {
        it('extracts exact title', () => {
          expect(result.title?.trim()).toBe(titleExpect.exact);
        });
      }
      
      if (titleExpect.contains) {
        it('extracts title containing expected text', () => {
          expect(result.title).toContain(titleExpect.contains);
        });
      }
    }

    // Body validation
    if (fixture.expected.expected.body) {
      const bodyExpect = fixture.expected.expected.body;
      
      if (bodyExpect.minWordCount) {
        it(`extracts body with at least ${bodyExpect.minWordCount} words`, () => {
          const wordCount = (result.body || '').split(/\s+/).filter(Boolean).length;
          expect(wordCount).toBeGreaterThanOrEqual(bodyExpect.minWordCount);
        });
      }
      
      if (bodyExpect.containsSnippets && bodyExpect.containsSnippets.length > 0) {
        it.each(bodyExpect.containsSnippets)('body contains snippet: "%s"', (snippet) => {
          expect(result.body?.toLowerCase()).toContain(snippet.toLowerCase());
        });
      }
      
      if (bodyExpect.excludes && bodyExpect.excludes.length > 0) {
        it.each(bodyExpect.excludes)('body excludes: "%s"', (excluded) => {
          expect(result.body?.toLowerCase()).not.toContain(excluded.toLowerCase());
        });
      }
    }

    // Date validation
    if (fixture.expected.expected.date) {
      const dateExpect = fixture.expected.expected.date;
      
      if (dateExpect.iso) {
        it('extracts correct date', () => {
          expect(result.date).toBe(dateExpect.iso);
        });
      }
    }

    // Author validation
    if (fixture.expected.expected.author) {
      const authorExpect = fixture.expected.expected.author;
      
      if (authorExpect.contains) {
        it('extracts author name', () => {
          expect(result.author).toContain(authorExpect.contains);
        });
      }
    }

    // Extraction success validation
    if (fixture.expected.expected.extraction) {
      const extractionExpect = fixture.expected.expected.extraction;
      
      if (extractionExpect.success !== undefined) {
        it(`extraction success is ${extractionExpect.success}`, () => {
          expect(result.success).toBe(extractionExpect.success);
        });
      }
      
      if (extractionExpect.minConfidence) {
        it(`confidence is at least ${extractionExpect.minConfidence}`, () => {
          expect(result.confidence).toBeGreaterThanOrEqual(extractionExpect.minConfidence);
        });
      }
    }
  });

  // Summary test
  it('all fixtures should have basic extraction', () => {
    let successCount = 0;
    for (const fixture of fixtures) {
      const config = fixture.expected.extractionConfig;
      const result = extractor.extract(fixture.html, config);
      if (result.success && result.title && result.body) {
        successCount++;
      }
    }
    
    const successRate = successCount / fixtures.length;
    expect(successRate).toBeGreaterThanOrEqual(0.8); // At least 80% success rate
    
    console.log(`Golden set summary: ${successCount}/${fixtures.length} (${(successRate * 100).toFixed(1)}%) successful`);
  });
});

// Export for programmatic use
module.exports = { loadFixtures };
