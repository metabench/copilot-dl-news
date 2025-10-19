/**
 * Tests for HtmlArticleExtractor ArticlePlus functionality
 *
 * Tests the extended metadata extraction including titles, bylines,
 * publication dates, and other rendered metadata.
 */

const { HtmlArticleExtractor } = require('../HtmlArticleExtractor');

describe('HtmlArticleExtractor - ArticlePlus Mode', () => {
  let extractor;

  beforeEach(() => {
    extractor = new HtmlArticleExtractor({
      minWordCount: 10
    });
  });

  describe('extractPlus method', () => {
    test('should extract basic metadata from Readability', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Article Title</title>
          <meta name="author" content="John Doe">
          <meta property="article:published_time" content="2024-01-15T10:00:00Z">
        </head>
        <body>
          <article>
            <h1>Test Article Title</h1>
            <div class="byline">By John Doe</div>
            <div class="content">
              <p>This is a test article with enough content to meet the minimum word count requirement for extraction.</p>
              <p>It contains multiple paragraphs and should be properly extracted by the Readability library.</p>
            </div>
          </article>
        </body>
        </html>
      `;

      const result = extractor.extractPlus(html);

      expect(result.success).toBe(true);
      expect(result.text).toContain('test article');
      expect(result.wordCount).toBeGreaterThan(10);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.title).toBe('Test Article Title');
      expect(result.metadata.byline).toBe('John Doe');
    });

    test('should extract publication date from meta tags', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Article</title>
          <meta property="article:published_time" content="2024-01-15T10:00:00Z">
        </head>
        <body>
          <main>
            <article>
              <h1>Test Article Title</h1>
              <p>This is a test article with enough content to meet the minimum word count requirement for extraction and processing by Readability.</p>
              <p>The article contains multiple paragraphs with substantial text content that should be properly identified as the main article body.</p>
              <p>This ensures that the extraction process works correctly and returns meaningful results for testing purposes.</p>
            </article>
          </main>
        </body>
        </html>
      `;

      const result = extractor.extractPlus(html);

      expect(result.success).toBe(true);
      expect(result.metadata.publicationDate).toBe('2024-01-15T10:00:00.000Z');
    });

    test('should extract publication date from JSON-LD', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "NewsArticle",
            "headline": "Test Article",
            "datePublished": "2024-01-15T10:00:00Z",
            "author": {
              "@type": "Person",
              "name": "Jane Smith"
            }
          }
          </script>
        </head>
        <body>
          <main>
            <article>
              <h1>Test Article Title</h1>
              <p>This is a test article with enough content to meet the minimum word count requirement for extraction and processing by Readability.</p>
              <p>The article contains multiple paragraphs with substantial text content that should be properly identified as the main article body.</p>
            </article>
          </main>
        </body>
        </html>
      `;

      const result = extractor.extractPlus(html);

      expect(result.success).toBe(true);
      expect(result.metadata.publicationDate).toBe('2024-01-15T10:00:00.000Z');
      expect(result.metadata.authors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Jane Smith', source: 'json-ld' })
        ])
      );
    });

    test('should extract multiple authors', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="author" content="John Doe">
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "NewsArticle",
            "author": [
              { "@type": "Person", "name": "Jane Smith" },
              { "@type": "Person", "name": "Bob Johnson" }
            ]
          }
          </script>
        </head>
        <body>
          <main>
            <article>
              <h1>Test Article Title</h1>
              <div class="byline">By John Doe, Jane Smith</div>
              <p>This is a test article with enough content to meet the minimum word count requirement for extraction and processing by Readability.</p>
              <p>The article contains multiple paragraphs with substantial text content that should be properly identified as the main article body.</p>
            </article>
          </main>
        </body>
        </html>
      `;

      const result = extractor.extractPlus(html);

      expect(result.success).toBe(true);
      expect(result.metadata.authors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'John Doe' }),
          expect.objectContaining({ name: 'Jane Smith' }),
          expect.objectContaining({ name: 'Bob Johnson' })
        ])
      );
    });

    test('should extract article metadata (category and tags)', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="article:section" content="Politics">
          <meta name="keywords" content="election, politics, government">
        </head>
        <body>
          <main>
            <article>
              <h1>Test Article Title</h1>
              <p>This is a test article with enough content to meet the minimum word count requirement for extraction and processing by Readability.</p>
              <p>The article contains multiple paragraphs with substantial text content that should be properly identified as the main article body.</p>
            </article>
          </main>
        </body>
        </html>
      `;

      const result = extractor.extractPlus(html);

      expect(result.success).toBe(true);
      expect(result.metadata.articleMeta.category).toBe('Politics');
      expect(result.metadata.articleMeta.tags).toEqual(['election', 'politics', 'government']);
    });

    test('should extract social media links', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <body>
          <main>
            <article>
              <h1>Test Article Title</h1>
              <p>This is a test article with enough content to meet the minimum word count requirement for extraction and processing by Readability.</p>
              <p>The article contains multiple paragraphs with substantial text content that should be properly identified as the main article body.</p>
            </article>
          </main>
          <footer>
            <a href="https://twitter.com/author">Follow on Twitter</a>
            <a href="https://facebook.com/pages/article">Share on Facebook</a>
            <a href="https://linkedin.com/company/news">Connect on LinkedIn</a>
          </footer>
        </body>
        </html>
      `;

      const result = extractor.extractPlus(html);

      expect(result.success).toBe(true);
      expect(result.metadata.socialLinks.twitter).toEqual(['https://twitter.com/author']);
      expect(result.metadata.socialLinks.facebook).toEqual(['https://facebook.com/pages/article']);
      expect(result.metadata.socialLinks.linkedin).toEqual(['https://linkedin.com/company/news']);
    });

    test('should handle invalid HTML gracefully', () => {
      const result = extractor.extractPlus('');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid HTML input');
      expect(result.text).toBe('');
      expect(result.metadata).toEqual({});
    });

    test('should handle HTML with insufficient content', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <body>
          <article>
            <p>Short text.</p>
          </article>
        </body>
        </html>
      `;

      const result = extractor.extractPlus(html);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Content too short');
      expect(result.wordCount).toBe(0); // Readability doesn't extract very short content
    });

    test('should filter navigation content in ArticlePlus mode', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <body>
          <nav>
            <a href="/news">News</a>
            <a href="/sports">Sports</a>
            <a href="/politics">Politics</a>
          </nav>
          <article>
            <h1>Article Title</h1>
            <div class="content">
              <p>This is the main article content that should be extracted. It contains enough words to meet the minimum requirement.</p>
              <p>The navigation menu above should be filtered out and not included in the extracted text.</p>
            </div>
          </article>
        </body>
        </html>
      `;

      const result = extractor.extractPlus(html);

      expect(result.success).toBe(true);
      expect(result.text).toContain('main article content');
      expect(result.text).toContain('navigation menu above should be filtered');
      expect(result.text).not.toContain('News');
      expect(result.text).not.toContain('Sports');
      expect(result.text).not.toContain('Politics');
    });
  });
});