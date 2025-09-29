'use strict';

const { LinkExtractor } = require('../LinkExtractor');

describe('LinkExtractor', () => {
  const normalizeUrl = (url) => {
    if (!url) return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('/')) return `https://example.com${trimmed}`;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return null;
  };
  const isOnDomain = (url) => url && url.startsWith('https://example.com');
  const looksLikeArticle = (url) => /\/news\//.test(url || '');

  const html = `
    <html>
      <body>
        <header>
          <a href="/home">Home</a>
        </header>
        <article>
          <h2><a href="/news/politics/story-1">Story</a></h2>
          <p>Some text</p>
        </article>
        <nav>
          <a href="/world">World</a>
          <a href="https://other.com/about">About</a>
        </nav>
        <div class="content">
          <a href="/news/tech/story-2">Tech Story</a>
        </div>
      </body>
    </html>
  `;

  it('extracts navigation and article links with types', () => {
    const extractor = new LinkExtractor({ normalizeUrl, isOnDomain, looksLikeArticle });
    const result = extractor.extract(html);

    expect(result.navigation).toEqual([
      { url: 'https://example.com/home', anchor: 'Home', rel: null, onDomain: 1 },
      { url: 'https://example.com/world', anchor: 'World', rel: null, onDomain: 1 }
    ]);

    expect(result.articles).toEqual([
      { url: 'https://example.com/news/politics/story-1', anchor: 'Story', rel: null, onDomain: 1 },
      { url: 'https://example.com/news/tech/story-2', anchor: 'Tech Story', rel: null, onDomain: 1 }
    ]);

    expect(result.all).toEqual([
      { url: 'https://example.com/home', anchor: 'Home', rel: null, onDomain: 1, type: 'nav' },
      { url: 'https://example.com/world', anchor: 'World', rel: null, onDomain: 1, type: 'nav' },
      { url: 'https://example.com/news/politics/story-1', anchor: 'Story', rel: null, onDomain: 1, type: 'article' },
      { url: 'https://example.com/news/tech/story-2', anchor: 'Tech Story', rel: null, onDomain: 1, type: 'article' }
    ]);
  });

  it('throws when dependencies missing', () => {
    expect(() => new LinkExtractor({})).toThrow('LinkExtractor requires a normalizeUrl function');
  });
});
