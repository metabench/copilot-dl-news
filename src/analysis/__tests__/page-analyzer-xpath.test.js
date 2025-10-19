const { analyzePage, buildAnalysis } = require('../page-analyzer');
const { ArticleXPathService } = require('../../services/ArticleXPathService');

describe('Page Analyzer XPath Integration', () => {
  let mockDb;
  let mockGazetteer;
  let xpathService;

  beforeEach(() => {
    mockDb = {
      prepare: jest.fn(() => ({
        get: jest.fn(() => null),
        all: jest.fn(() => [])
      }))
    };

    mockGazetteer = {
      placeNames: new Map(),
      countries: new Map(),
      regions: new Map(),
      cities: new Map()
    };

    xpathService = new ArticleXPathService({
      db: mockDb,
      dxplDir: '/tmp/test-dxpls',
      logger: { log: jest.fn(), error: jest.fn() },
      analyzerOptions: { minTextLength: 10, minParagraphs: 1 }
    });
  });

  describe('XPath extraction in buildAnalysis', () => {
    const sampleHtml = `
      <html>
        <body>
          <nav>Navigation content</nav>
          <main>
            <article>
              <h1>Test Article</h1>
              <p>This is the main article content about London and Paris.</p>
            </article>
          </main>
        </body>
      </html>
    `;

    test('uses XPath extraction when pattern exists', async () => {
      // Mock XPath service to have a pattern for the domain
      xpathService.hasXPathForDomain = jest.fn(() => true);
      xpathService.getXPathForDomain = jest.fn(() => ({
        xpath: '/html/body/main/article',
        confidence: 0.85
      }));
      xpathService.extractTextWithXPath = jest.fn(() => 'Test Article This is the main article content about London and Paris.');

      const result = await buildAnalysis({
        url: 'https://www.theguardian.com/test',
        html: sampleHtml,
        title: 'Test Article',
        articleRow: { text: 'Original text' },
        gazetteer: mockGazetteer,
        xpathService
      });

      expect(result.meta.articleXPath).toBe('/html/body/main/article');
      expect(result.meta.method).toBe('xpath+heuristics@v1');
      expect(xpathService.extractTextWithXPath).toHaveBeenCalledWith('https://www.theguardian.com/test', sampleHtml);
    });

    test('learns new XPath pattern when none exists', async () => {
      // Mock XPath service to have no existing pattern and learn a new one
      xpathService.hasXPathForDomain = jest.fn(() => false);
      xpathService.extractTextWithXPath = jest.fn()
        .mockReturnValueOnce(null) // First call (no pattern) returns null
        .mockReturnValueOnce('Test Article This is the main article content about London and Paris.'); // Second call (after learning) returns text
      xpathService.learnXPathFromHtml = jest.fn(() => Promise.resolve({
        xpath: '/html/body/main/article',
        confidence: 0.85
      }));

      const result = await buildAnalysis({
        url: 'https://www.bbc.co.uk/test',
        html: sampleHtml,
        title: 'Test Article',
        articleRow: { text: 'Original text' },
        gazetteer: mockGazetteer,
        xpathService
      });

      expect(result.meta.articleXPath).toBe('/html/body/main/article');
      expect(result.meta.method).toBe('xpath-learned+heuristics@v1');
      expect(xpathService.learnXPathFromHtml).toHaveBeenCalledWith('https://www.bbc.co.uk/test', sampleHtml);
    });

    test('falls back to Readability when XPath fails', async () => {
      // Mock XPath service to fail
      xpathService.hasXPathForDomain = jest.fn(() => true);
      xpathService.extractTextWithXPath = jest.fn(() => null);

      const result = await buildAnalysis({
        url: 'https://www.example.com/test',
        html: sampleHtml,
        title: 'Test Article',
        articleRow: { text: 'Original text' },
        gazetteer: mockGazetteer,
        xpathService
      });

      expect(result.meta.method).toBe('readability+heuristics@v1');
      expect(result.meta.articleXPath).toBeNull();
    });

    test('works without XPath service (backward compatibility)', async () => {
      const result = await buildAnalysis({
        url: 'https://www.example.com/test',
        html: sampleHtml,
        title: 'Test Article',
        articleRow: { text: 'Original text' },
        gazetteer: mockGazetteer,
        xpathService: null
      });

      expect(result.meta.method).toBe('readability+heuristics@v1');
      expect(result.meta.articleXPath).toBeNull();
    });
  });

  describe('XPath integration in analyzePage', () => {
    test('passes XPath service to buildAnalysis', async () => {
      const mockArticleRow = {
        text: 'Article content about London',
        word_count: 5
      };

      const result = await analyzePage({
        url: 'https://www.theguardian.com/test',
        html: '<html><body><article>Test content</article></body></html>',
        title: 'Test Title',
        articleRow: mockArticleRow,
        gazetteer: mockGazetteer,
        db: mockDb,
        xpathService
      });

      expect(result).toHaveProperty('analysis');
      expect(result).toHaveProperty('places');
      expect(result).toHaveProperty('hubCandidate');
      expect(result).toHaveProperty('deepAnalysis');
    });

    test('handles XPath service errors gracefully', async () => {
      // Mock XPath service to throw errors
      xpathService.extractTextWithXPath = jest.fn(() => { throw new Error('XPath error'); });
      xpathService.learnXPathFromHtml = jest.fn(() => Promise.reject(new Error('Learning error')));

      const mockArticleRow = {
        text: 'Article content about London',
        word_count: 5
      };

      const result = await analyzePage({
        url: 'https://www.example.com/test',
        html: '<html><body><article>Test content</article></body></html>',
        title: 'Test Title',
        articleRow: mockArticleRow,
        gazetteer: mockGazetteer,
        db: mockDb,
        xpathService
      });

      // Should still complete analysis despite XPath errors
      expect(result.analysis.meta.method).toBe('readability+heuristics@v1');
    });
  });

  describe('XPath pattern metadata', () => {
    test('includes XPath in analysis metadata when learned', async () => {
      xpathService.hasXPathForDomain = jest.fn(() => false);
      xpathService.extractTextWithXPath = jest.fn()
        .mockReturnValueOnce(null) // First call returns null
        .mockReturnValueOnce('Extracted article text'); // Second call returns text
      xpathService.learnXPathFromHtml = jest.fn(() => Promise.resolve({
        xpath: '/html/body/div[1]/article',
        confidence: 0.92
      }));

      const result = await buildAnalysis({
        url: 'https://www.nytimes.com/test',
        html: '<html><body><div><article>Content</article></div></body></html>',
        title: 'Test Article',
        articleRow: { text: 'Original text' },
        gazetteer: mockGazetteer,
        xpathService
      });

      expect(result.meta.articleXPath).toBe('/html/body/div[1]/article');
      expect(result.meta.method).toBe('xpath-learned+heuristics@v1');
    });

    test('preserves existing article_xpath from database', async () => {
      const existingXPath = '/html/body/main/article';

      const result = await buildAnalysis({
        url: 'https://www.example.com/test',
        html: '<html><body><article>Content</article></body></html>',
        title: 'Test Article',
        articleRow: {
          text: 'Original text',
          article_xpath: existingXPath
        },
        gazetteer: mockGazetteer,
        xpathService: null
      });

      expect(result.meta.articleXPath).toBe(existingXPath);
    });
  });
});