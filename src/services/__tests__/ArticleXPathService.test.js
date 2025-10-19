const { ArticleXPathService } = require('../ArticleXPathService');

describe('ArticleXPathService', () => {
  let mockDb;
  let service;

  beforeEach(() => {
    // Mock database
    mockDb = {
      prepare: jest.fn(() => ({
        get: jest.fn(),
        all: jest.fn(() => []),
        run: jest.fn()
      }))
    };

    service = new ArticleXPathService({
      db: mockDb,
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      analyzerOptions: { minTextLength: 10, minParagraphs: 1 }
    });
  });

  describe('getXPathForDomain', () => {
    test('returns null when no DXPL exists for domain', () => {
      const result = service.getXPathForDomain('example.com');
      expect(result).toBeNull();
    });

    test('returns XPath pattern when DXPL exists', () => {
      // Mock DXPL data
      service.dxpls.set('example.com', {
        domain: 'example.com',
        articleXPathPatterns: [
          {
            xpath: '/html/body/main/article',
            confidence: 0.85,
            alternatives: ['article.content']
          }
        ]
      });

      const result = service.getXPathForDomain('example.com');
      expect(result).toBeDefined();
      expect(result.xpath).toBe('/html/body/main/article');
      expect(result.confidence).toBe(0.85);
    });

    test('handles www. prefix', () => {
      service.dxpls.set('example.com', {
        domain: 'example.com',
        articleXPathPatterns: [
          { xpath: '/html/body/main/article', confidence: 0.85 }
        ]
      });

      const result = service.getXPathForDomain('www.example.com');
      expect(result).toBeDefined();
      expect(result.xpath).toBe('/html/body/main/article');
    });
  });

  describe('hasXPathForDomain', () => {
    test('returns false when no patterns exist', () => {
      expect(service.hasXPathForDomain('example.com')).toBe(false);
    });

    test('returns true when patterns exist', () => {
      service.dxpls.set('example.com', {
        domain: 'example.com',
        articleXPathPatterns: [
          { xpath: '/html/body/main/article', confidence: 0.85 }
        ]
      });

      expect(service.hasXPathForDomain('example.com')).toBe(true);
    });
  });

  describe('extractTextWithXPath', () => {
    test('returns null when no XPath pattern exists', () => {
      const html = '<html><body><article>Content</article></body></html>';
      const result = service.extractTextWithXPath('https://example.com/article', html);
      expect(result).toBeNull();
    });

    test('extracts text using stored XPath pattern', () => {
      service.dxpls.set('example.com', {
        domain: 'example.com',
        articleXPathPatterns: [
          { xpath: '/html/body/main/article', confidence: 0.85 }
        ]
      });

      const html = `
        <html>
        <body>
          <main>
            <article>Article content here with much more substantial text to exceed the minimum length requirement for extraction validation.</article>
          </main>
        </body>
        </html>
      `;

      const result = service.extractTextWithXPath('https://example.com/article', html);
      expect(result).toBe('Article content here with much more substantial text to exceed the minimum length requirement for extraction validation.');
    });

    test('returns null when XPath extraction fails', () => {
      service.dxpls.set('example.com', {
        domain: 'example.com',
        articleXPathPatterns: [
          { xpath: '/nonexistent/path', confidence: 0.85 }
        ]
      });

      const html = '<html><body><article>Content</article></body></html>';
      const result = service.extractTextWithXPath('https://example.com/article', html);
      expect(result).toBeNull();
    });
  });

  describe('learnXPathFromHtml', () => {
    test('learns XPath pattern from HTML', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <body>
          <main>
            <article class="content">
              <h1>Title</h1>
              <p>Article content here with substantial text.</p>
              <p>More content to make it article-like.</p>
            </article>
          </main>
        </body>
        </html>
      `;

      const result = await service.learnXPathFromHtml('https://example.com/article', html);

      expect(result).toBeDefined();
      expect(result.xpath).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.alternatives).toBeDefined();
      expect(result.learnedFrom).toBe('https://example.com/article');
    });

    test('returns null for invalid URL', async () => {
      const html = '<html><body><p>Content</p></body></html>';
      const result = await service.learnXPathFromHtml('invalid-url', html);
      expect(result).toBeNull();
    });

    test('returns null when no patterns found', async () => {
      const html = '<html><body><p>Short</p></body></html>';
      const result = await service.learnXPathFromHtml('https://example.com/page', html);
      expect(result).toBeNull();
    });
  });

  describe('integration with page analyzer', () => {
    test('works with analyzePage flow', async () => {
      // Test the integration by simulating the page analyzer flow
      const html = `
        <html>
        <body>
          <main>
            <article>
              <p>This is article content for testing XPath extraction.</p>
              <p>More content here to ensure it's substantial.</p>
            </article>
          </main>
        </body>
        </html>
      `;

      // First, learn the pattern
      const learned = await service.learnXPathFromHtml('https://example.com/test', html);
      expect(learned).toBeDefined();

      // Then, use it for extraction
      const extracted = service.extractTextWithXPath('https://example.com/test', html);
      expect(extracted).toBeDefined();
      expect(extracted.length).toBeGreaterThan(10);
    });
  });
});