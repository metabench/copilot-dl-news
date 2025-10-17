'use strict';

const cheerio = require('cheerio');
const { extractSchemaSignals } = require('../schemaSignals');

describe('extractSchemaSignals', () => {
  test('detects JSON-LD NewsArticle with strong score', () => {
    const html = `<!doctype html>
      <html>
        <head>
          <title>Example Story</title>
          <meta property="og:type" content="article">
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "NewsArticle",
              "headline": "Example Story",
              "datePublished": "2025-10-15T12:00:00Z",
              "author": { "@type": "Person", "name": "Reporter" },
              "publisher": { "@type": "Organization", "name": "Example Media" },
              "articleBody": "Lorem ipsum dolor sit amet.",
              "wordCount": 540
            }
          </script>
        </head>
        <body>
          <article>
            <h1>Example Story</h1>
          </article>
        </body>
      </html>`;
    const $ = cheerio.load(html);
    const result = extractSchemaSignals({ $, html });

    expect(result.hasArticleType).toBe(true);
    expect(result.articleTypes).toEqual(expect.arrayContaining(['newsarticle']));
    expect(result.ogTypeArticle).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(6);
    expect(result.sources).toEqual(expect.arrayContaining(['json-ld', 'opengraph']));
    expect(result.strength).toBe('strong');
  });

  test('detects microdata article structure', () => {
    const html = `<!doctype html>
      <html>
        <head>
          <title>Microdata Example</title>
        </head>
        <body>
          <div itemscope itemtype="https://schema.org/Article">
            <span itemprop="headline">Microdata Headline</span>
            <span itemprop="author">Writer</span>
            <time itemprop="datePublished" datetime="2025-10-16">October 16 2025</time>
            <div itemprop="articleBody">
              <p>Paragraph one.</p>
              <p>Paragraph two.</p>
            </div>
          </div>
        </body>
      </html>`;
    const $ = cheerio.load(html);
    const result = extractSchemaSignals({ $, html });

    expect(result.hasArticleType).toBe(true);
    expect(result.articleTypes).toEqual(expect.arrayContaining(['article']));
    expect(result.sources).toEqual(expect.arrayContaining(['microdata']));
    expect(result.hasArticleBody).toBe(true);
    expect(result.score).toBeGreaterThan(3);
  });
});
