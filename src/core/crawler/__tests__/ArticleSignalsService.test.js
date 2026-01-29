const cheerio = require('cheerio');
const ArticleSignalsService = require('../ArticleSignalsService');

describe('ArticleSignalsService', () => {
  let service;

  beforeEach(() => {
    service = new ArticleSignalsService({
      baseUrl: 'https://example.com',
      logger: {
        warn: jest.fn()
      }
    });
  });

  it('detects article-like URLs and skips known non-article paths', () => {
    expect(service.looksLikeArticle('https://example.com/world/2024/05/10/news-story')).toBe(true);
    expect(service.looksLikeArticle('https://example.com/login')).toBe(false);
    expect(service.looksLikeArticle('https://example.com/feed.xml')).toBe(false);
  });

  it('computes URL signals with base URL context', () => {
    const signals = service.computeUrlSignals('/world/2024/05/10/news-story');
    expect(signals).toMatchObject({
      host: 'example.com',
      section: 'world',
      pathDepth: 5,
      hasDatePath: true,
      hasArticleWords: true
    });
  });

  it('extracts content signals from HTML', () => {
    const html = `
      <html>
        <body>
          <h2>Heading</h2>
          <p>Paragraph one.</p>
          <p>Paragraph two.</p>
          <a href="#">Link text</a>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const signals = service.computeContentSignals($, html);
    expect(signals).toMatchObject({
      h2: 1,
      h3: 0,
      a: 1,
      p: 2
    });
    expect(signals.linkDensity).toBeGreaterThanOrEqual(0);
    expect(signals.linkDensity).toBeLessThanOrEqual(1);
  });

  it('combines signals with heuristic voting', () => {
    const urlSignals = {
      hasDatePath: true,
      hasArticleWords: true,
      pathDepth: 4
    };
    const contentSignals = {
      linkDensity: 0.05,
      a: 5,
      p: 8
    };
    const result = service.combineSignals(urlSignals, contentSignals, {
      wordCount: 400
    });
    expect(result).toEqual(expect.objectContaining({
      hint: 'article'
    }));
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('gracefully handles invalid URLs by returning null when parsing fails', () => {
    expect(service.computeUrlSignals('http://[invalid-url')).toBeNull();
  });
});
