const { loadDxplLibrary, getDxplForDomain, extractDomain } = require('../dxpl');
const fs = require('fs');
const path = require('path');

describe('DXPL (Domain-Specific XPath Library)', () => {
  const testDxplDir = path.join(__dirname, 'test-dxpls');

  beforeAll(() => {
    // Create test DXPL directory
    if (!fs.existsSync(testDxplDir)) {
      fs.mkdirSync(testDxplDir);
    }

    // Create test DXPL files
    const guardianDxpl = {
      'theguardian.com': {
        domain: 'theguardian.com',
        generated: '2025-10-18T10:00:00.000Z',
        articleXPathPatterns: [
          {
            xpath: '/html/body/main/article',
            confidence: 0.85,
            alternatives: ['article.article-content', 'article'],
            learnedFrom: 'https://www.theguardian.com/test',
            learnedAt: '2025-10-18T10:00:00.000Z'
          }
        ],
        stats: {
          totalPatterns: 1,
          lastUpdated: '2025-10-18T10:00:00.000Z'
        }
      }
    };

    fs.writeFileSync(
      path.join(testDxplDir, 'theguardian.com.json'),
      JSON.stringify(guardianDxpl, null, 2)
    );
  });

  afterAll(() => {
    // Clean up test files
    if (fs.existsSync(testDxplDir)) {
      fs.readdirSync(testDxplDir).forEach(file => {
        fs.unlinkSync(path.join(testDxplDir, file));
      });
      fs.rmdirSync(testDxplDir);
    }
  });

  describe('loadDxplLibrary', () => {
    test('loads DXPL files from directory', () => {
      const dxpls = loadDxplLibrary({ dxplDir: testDxplDir });

      expect(dxpls).toBeDefined();
      expect(dxpls instanceof Map).toBe(true);
      expect(dxpls.has('theguardian.com')).toBe(true);
      expect(dxpls.has('www.theguardian.com')).toBe(true);
    });

    test('returns empty map for non-existent directory', () => {
      const dxpls = loadDxplLibrary({ dxplDir: '/non/existent' });
      expect(dxpls.size).toBe(0);
    });

    test('handles malformed JSON gracefully', () => {
      const badFile = path.join(testDxplDir, 'bad.json');
      fs.writeFileSync(badFile, 'invalid json {');

      const logger = { error: jest.fn() };
      const dxpls = loadDxplLibrary({ dxplDir: testDxplDir, logger });

      expect(logger.error).toHaveBeenCalled();
      expect(dxpls.size).toBeGreaterThan(0); // Other files still loaded

      fs.unlinkSync(badFile);
    });
  });

  describe('getDxplForDomain', () => {
    let dxpls;

    beforeAll(() => {
      dxpls = loadDxplLibrary({ dxplDir: testDxplDir });
    });

    test('returns DXPL for exact domain match', () => {
      const dxpl = getDxplForDomain(dxpls, 'theguardian.com');
      expect(dxpl).toBeDefined();
      expect(dxpl.domain).toBe('theguardian.com');
      expect(dxpl.articleXPathPatterns).toBeDefined();
    });

    test('returns DXPL for www. prefixed domain', () => {
      const dxpl = getDxplForDomain(dxpls, 'www.theguardian.com');
      expect(dxpl).toBeDefined();
      expect(dxpl.domain).toBe('theguardian.com');
    });

    test('returns null for unknown domain', () => {
      const dxpl = getDxplForDomain(dxpls, 'unknown.com');
      expect(dxpl).toBeNull();
    });

    test('returns null for empty inputs', () => {
      expect(getDxplForDomain(null, 'domain.com')).toBeNull();
      expect(getDxplForDomain(dxpls, null)).toBeNull();
      expect(getDxplForDomain(dxpls, '')).toBeNull();
    });
  });

  describe('extractDomain', () => {
    test('extracts domain from valid URLs', () => {
      expect(extractDomain('https://www.theguardian.com/article')).toBe('www.theguardian.com');
      expect(extractDomain('http://bbc.co.uk/news')).toBe('bbc.co.uk');
      expect(extractDomain('https://example.com/path?query=1')).toBe('example.com');
    });

    test('returns null for invalid URLs', () => {
      expect(extractDomain('not-a-url')).toBeNull();
      expect(extractDomain('')).toBeNull();
      expect(extractDomain(null)).toBeNull();
    });
  });

  describe('DXPL data structure', () => {
    let dxpl;

    beforeAll(() => {
      const dxpls = loadDxplLibrary({ dxplDir: testDxplDir });
      dxpl = getDxplForDomain(dxpls, 'theguardian.com');
    });

    test('has required DXPL structure', () => {
      expect(dxpl).toHaveProperty('domain');
      expect(dxpl).toHaveProperty('generated');
      expect(dxpl).toHaveProperty('articleXPathPatterns');
      expect(dxpl).toHaveProperty('stats');

      expect(Array.isArray(dxpl.articleXPathPatterns)).toBe(true);
      expect(dxpl.articleXPathPatterns.length).toBeGreaterThan(0);
    });

    test('has valid XPath pattern structure', () => {
      const pattern = dxpl.articleXPathPatterns[0];

      expect(pattern).toHaveProperty('xpath');
      expect(pattern).toHaveProperty('confidence');
      expect(pattern).toHaveProperty('alternatives');
      expect(pattern).toHaveProperty('learnedFrom');
      expect(pattern).toHaveProperty('learnedAt');

      expect(typeof pattern.confidence).toBe('number');
      expect(pattern.confidence).toBeGreaterThan(0);
      expect(pattern.confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(pattern.alternatives)).toBe(true);
    });

    test('has valid stats structure', () => {
      expect(dxpl.stats).toHaveProperty('totalPatterns');
      expect(dxpl.stats).toHaveProperty('lastUpdated');
      expect(typeof dxpl.stats.totalPatterns).toBe('number');
    });
  });
});