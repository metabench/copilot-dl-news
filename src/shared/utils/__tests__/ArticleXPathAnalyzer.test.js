const { ArticleXPathAnalyzer } = require('../ArticleXPathAnalyzer');

describe('ArticleXPathAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new ArticleXPathAnalyzer({ 
      limit: 3, 
      verbose: false,
      minTextLength: 10,  // Lower threshold for tests
      minParagraphs: 1    // Lower threshold for tests
    });
  });

  describe('analyzeHtml', () => {
    test('analyzes Guardian article HTML successfully', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Test Article - The Guardian</title></head>
        <body>
          <header>Navigation content here</header>
          <main>
            <article class="article-content">
              <h1>Trump administration opens inquiry into universities</h1>
              <p>The Trump administration has opened an inquiry into several universities over their handling of scholarships for international students.</p>
              <p>This is another paragraph with more content about the story.</p>
              <p>Yet another paragraph continuing the article text.</p>
            </article>
          </main>
          <footer>Footer content</footer>
        </body>
        </html>
      `;

      const result = await analyzer.analyzeHtml(html);

      expect(result).toBeDefined();
      expect(result.documentInfo.elements).toBeGreaterThan(10);
      expect(result.documentInfo.textLength).toBeGreaterThan(100);
      expect(result.candidatesFound).toBeGreaterThan(0);
      expect(result.topPatterns).toBeDefined();
      expect(result.topPatterns.length).toBeGreaterThan(0);

      // Check that the top pattern has expected properties
      const topPattern = result.topPatterns[0];
      expect(topPattern).toHaveProperty('xpath');
      expect(topPattern).toHaveProperty('confidence');
      expect(topPattern.confidence).toBeGreaterThan(0);
      expect(topPattern.confidence).toBeLessThanOrEqual(1);
      expect(topPattern).toHaveProperty('reasons');
      expect(Array.isArray(topPattern.reasons)).toBe(true);
    });

    test('returns empty result for HTML without article content', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <body>
          <nav>Menu item 1 | Menu item 2 | Menu item 3</nav>
          <div>Short content</div>
        </body>
        </html>
      `;

      const result = await analyzer.analyzeHtml(html);

      expect(result).toBeDefined();
      expect(result.candidatesFound).toBe(0);
      expect(result.topPatterns).toEqual([]);
    });

    test('handles malformed HTML gracefully', async () => {
      const malformedHtml = '<html><body><p>Unclosed paragraph';

      const result = await analyzer.analyzeHtml(malformedHtml);
      
      // JSDOM handles malformed HTML gracefully
      expect(result).toBeDefined();
      expect(result.documentInfo.elements).toBeGreaterThan(0);
      expect(result.candidatesFound).toBe(0); // No valid candidates
    });
  });

  describe('findArticleCandidates', () => {
    test('finds semantic article elements', () => {
      const html = `
        <html>
        <body>
          <article class="content"><p>Article content here with paragraph</p></article>
          <div class="sidebar">Sidebar content</div>
        </body>
        </html>
      `;

      // Create a mock document
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html);
      const document = dom.window.document;

      const candidates = analyzer.findArticleCandidates(document);

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.some(el => el.tagName?.toLowerCase() === 'article')).toBe(true);
    });

    test('filters out navigation-like content', () => {
      const html = `
        <html>
        <body>
          <nav class="menu">Navigation menu content</nav>
          <article><p>Real article content with paragraph</p></article>
        </body>
        </html>
      `;

      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html);
      const document = dom.window.document;

      const candidates = analyzer.findArticleCandidates(document);

      // Should find the article but not the nav
      expect(candidates.length).toBe(1);
      expect(candidates[0].tagName?.toLowerCase()).toBe('article');
    });
  });

  describe('scoreCandidates', () => {
    test('scores article elements higher than generic elements', () => {
      const html = `
        <html>
        <body>
          <article class="content">
            <h1>Title</h1>
            <p>This is a long paragraph with substantial content for testing.</p>
            <p>Another paragraph with more content to ensure it's article-like.</p>
          </article>
          <div>
            <p>Short content</p>
          </div>
        </body>
        </html>
      `;

      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html);
      const document = dom.window.document;

      const candidates = analyzer.findArticleCandidates(document);
      const scored = analyzer.scoreCandidates(candidates, document);

      expect(scored.length).toBeGreaterThan(0);

      // Article element should have higher score
      const articleCandidate = scored.find(c => c.element.tagName?.toLowerCase() === 'article');
      expect(articleCandidate).toBeDefined();
      expect(articleCandidate.score).toBeGreaterThan(0);
      expect(articleCandidate.reasons).toContain('semantic-article');
    });

    test('penalizes navigation content', () => {
      const html = `
        <article>
          <p>This article mentions navigation and menu items in the content.</p>
        </article>
      `;

      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html);
      const document = dom.window.document;

      const candidates = analyzer.findArticleCandidates(document);
      const scored = analyzer.scoreCandidates(candidates, document);

      expect(scored.length).toBeGreaterThan(0);
      expect(scored[0].reasons).toContain('nav-content');
    });
  });

  describe('getXPath', () => {
    test('generates correct XPath for elements', () => {
      const html = `
        <html>
        <body>
          <main>
            <article>
              <div>Content</div>
            </article>
          </main>
        </body>
        </html>
      `;

      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html);
      const document = dom.window.document;

      const article = document.querySelector('article');
      const xpath = analyzer.getXPath(article);

      expect(xpath).toBe('/html/body/main/article');
    });

    test('uses ID when available', () => {
      const html = `<div id="main-content">Content</div>`;

      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html);
      const document = dom.window.document;

      const div = document.querySelector('#main-content');
      const xpath = analyzer.getXPath(div);

      expect(xpath).toBe('//*[@id="main-content"]');
    });
  });

  describe('generateAlternativeSelectors', () => {
    test('generates CSS alternatives', () => {
      const html = `<article class="content article-body">Content</article>`;

      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html);
      const document = dom.window.document;

      const article = document.querySelector('article');
      const alternatives = analyzer.generateAlternativeSelectors(article);

      expect(alternatives).toContain('article');
      expect(alternatives).toContain('.content');
      expect(alternatives).toContain('.article-body');
    });
  });
});