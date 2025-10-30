const { JSDOM } = require('jsdom');
const { summarizeLinks } = require('../linkClassification');

describe('linkClassification.summarizeLinks', () => {
  function createDocument(html) {
    const dom = new JSDOM(html, { url: 'https://example.com/' });
    return { document: dom.window.document, close: () => dom.window.close() };
  }

  test('classifies navigation and article links using existing heuristics', () => {
    const html = `
      <html>
        <body>
          <nav>
            <a href="/about">About</a>
            <a href="/world">World</a>
          </nav>
          <main>
            <a href="/2024/jan/03/example-story">Story by date</a>
            <a href="/news/politics/elections/us/2024/11/05/result">Election</a>
            <a href="#fragment">Fragment</a>
          </main>
        </body>
      </html>
    `;

    const { document, close } = createDocument(html);
    const summary = summarizeLinks({ url: 'https://example.com/world/', document });
    close();

    expect(summary.total).toBe(4); // fragment ignored
    expect(summary.navigation).toBe(2);
    expect(summary.article).toBe(2);
    expect(summary.external).toBe(0);
    expect(summary.skipped).toBe(0);
    expect(summary.articleSamples.length).toBeGreaterThan(0);
    expect(summary.navigationSamples.length).toBeGreaterThan(0);
  });

  test('ignores external links and invalid href values', () => {
    const html = `
      <html>
        <body>
          <a href="https://external.com/story">Offsite</a>
          <a>No href</a>
          <a href="mailto:test@example.com">Email</a>
          <a href="/2024/feb/10/deep/story/slug">Deep story</a>
        </body>
      </html>
    `;

    const { document, close } = createDocument(html);
    const summary = summarizeLinks({ url: 'https://example.com/news/', document });
    close();

    expect(summary.total).toBe(1);
    expect(summary.article).toBe(1);
    expect(summary.navigation).toBe(0);
    expect(summary.external).toBe(2);
    expect(summary.skipped).toBe(0);
  });

  test('returns zero counts when no document is provided', () => {
    const summary = summarizeLinks({ url: 'https://example.com/path' });
    expect(summary.total).toBe(0);
    expect(summary.navigation).toBe(0);
    expect(summary.article).toBe(0);
    expect(summary.external).toBe(0);
    expect(summary.skipped).toBe(0);
  });
});
