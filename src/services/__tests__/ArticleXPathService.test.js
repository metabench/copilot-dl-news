const { ArticleXPathService } = require('../ArticleXPathService');
const SQLiteNewsDatabase = require('../../data/db/sqlite/v1/SQLiteNewsDatabase');
const Database = require('better-sqlite3');
const { initializeSchema } = require('../../data/db/sqlite/v1/schema');

describe('ArticleXPathService', () => {
  let db;
  let service;
  let logger;

  beforeEach(() => {
    const dbHandle = new Database(':memory:');
    initializeSchema(dbHandle);
    db = new SQLiteNewsDatabase(dbHandle);
    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    service = new ArticleXPathService({
      db,
      logger,
      analyzerOptions: { minTextLength: 30, minParagraphs: 1 }
    });
  });

  afterEach(() => {
    db.close();
  });

  describe('getXPathForDomain', () => {
    test('returns null when no pattern exists for domain', async () => {
      expect(await service.getXPathForDomain('example.com')).toBeNull();
    });

    test('returns persisted pattern with highest confidence', async () => {
      const queries = db.createArticleXPathPatternQueries();
      queries.upsertArticleXPathPattern({
        domain: 'example.com',
        xpath: '/html/body/main/article',
        confidence: 0.8,
        learnedFrom: 'https://example.com/first'
      });

      const pattern = await service.getXPathForDomain('example.com');
      expect(pattern).toBeDefined();
      expect(pattern.xpath).toBe('/html/body/main/article');
      expect(pattern.confidence).toBeCloseTo(0.8);
    });
  });

  describe('hasXPathForDomain', () => {
    test('returns false when no patterns exist', async () => {
      expect(await service.hasXPathForDomain('example.com')).toBe(false);
    });

    test('returns true when patterns are persisted', async () => {
      const queries = db.createArticleXPathPatternQueries();
      queries.upsertArticleXPathPattern({
        domain: 'example.com',
        xpath: '/html/body/main/article'
      });

      expect(await service.hasXPathForDomain('example.com')).toBe(true);
    });
  });

  describe('extractTextWithXPath', () => {
    test('returns null when no pattern is known', async () => {
      const html = '<html><body><article>Content</article></body></html>';
      expect(await service.extractTextWithXPath('https://example.com/a', html)).toBeNull();
    });

    test('extracts text and records usage when pattern exists', async () => {
      const queries = db.createArticleXPathPatternQueries();
      queries.upsertArticleXPathPattern({
        domain: 'example.com',
        xpath: '/html/body/main/article',
        confidence: 0.9,
        usageCount: 0
      });

      const html = `
        <html>
          <body>
            <main>
              <article>
                ${'Meaningful content '.repeat(6)}
              </article>
            </main>
          </body>
        </html>
      `;

      const extracted = await service.extractTextWithXPath('https://example.com/a', html);
      expect(extracted).toMatch(/Meaningful content/);

      const stored = queries.getArticleXPathPatternsForDomain('example.com');
      expect(stored[0].usageCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('learnXPathFromHtml', () => {
    test('persists discovered pattern to the database', async () => {
      const html = `
        <!doctype html>
        <html>
          <body>
            <main>
              <article>
                <p>${'Article text '.repeat(10)}</p>
              </article>
            </main>
          </body>
        </html>
      `;

      const learned = await service.learnXPathFromHtml('https://example.com/article', html);
      expect(learned).toBeDefined();
      expect(learned.xpath).toBeDefined();
      expect(await service.hasXPathForDomain('example.com')).toBe(true);

      const queries = db.createArticleXPathPatternQueries();
      const stored = queries.getArticleXPathPatternsForDomain('example.com');
      expect(stored.length).toBeGreaterThan(0);
      expect(stored[0].xpath).toBe(learned.xpath);
    });

    test('returns null for invalid URL input', async () => {
      const html = '<html><body><p>Content</p></body></html>';
      await expect(service.learnXPathFromHtml('invalid-url', html)).resolves.toBeNull();
    });
  });
});