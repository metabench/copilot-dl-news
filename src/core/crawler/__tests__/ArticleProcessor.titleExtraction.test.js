/**
 * Regression tests for title extraction in ArticleProcessor.
 *
 * Bug (observed in content_analysis.title for many theguardian.com pages):
 * titles came out as e.g. "Sport | The Guardiandouble quotation mark…" — the
 * literal words "double quotation mark" repeated. Root cause: `$('title')`
 * matches EVERY <title> element in the parsed DOM, including the accessible
 * <title> labels inside inline SVG icons (the Guardian's pull-quote glyphs are
 * labelled "double quotation mark"), and cheerio's .text() concatenates them
 * onto the real document title. The fix scopes the selector to `head > title`.
 *
 * @see src/core/crawler/ArticleProcessor.js (_extractArticleMetadata / _extractHubMetadata)
 */

const cheerio = require('cheerio');

// ArticleProcessor pulls in jsdom (via jsdomUtils) for readability parsing,
// which is only exercised by _runReadability — not by the title extractors
// under test here. Stub it so this focused unit test doesn't drag in jsdom's
// ESM-only parse5 dependency.
jest.mock('../../../shared/utils/jsdomUtils', () => ({ createJsdom: jest.fn() }));

const { ArticleProcessor } = require('../ArticleProcessor');

function makeProcessor() {
  // The metadata extractors only touch the cheerio instance and the url, but
  // the constructor validates a set of collaborators — provide inert stubs.
  return new ArticleProcessor({
    linkExtractor: { extract: () => ({ navigation: [], articles: [], all: [] }) },
    normalizeUrl: (u) => u,
    looksLikeArticle: () => true,
    computeUrlSignals: () => ({}),
    computeContentSignals: () => ({}),
    combineSignals: () => ({}),
    logger: { log() {}, warn() {}, error() {} }
  });
}

// A page whose <head> title is clean, but whose <body> contains inline SVG
// icons labelled with an accessible <title> — exactly the shape that produced
// the garbage. Two quote icons reproduce the repeated-suffix symptom.
const HUB_HTML_WITH_SVG_QUOTE_ICONS = `<!doctype html>
<html><head><title>Art and design, photography and architecture | The Guardian</title></head>
<body>
  <a href="/artanddesign/photography"><svg viewBox="0 0 20 20" aria-hidden="true"><title>double quotation mark</title><path d="M1 1h1"/></svg>Photography</a>
  <blockquote><svg><title>double quotation mark</title></svg>A pulled quote</blockquote>
</body></html>`;

describe('ArticleProcessor title extraction', () => {
  let processor;

  beforeEach(() => {
    processor = makeProcessor();
  });

  test('_extractArticleMetadata ignores inline SVG <title> labels', () => {
    const $ = cheerio.load(HUB_HTML_WITH_SVG_QUOTE_ICONS);
    const { title } = processor._extractArticleMetadata($, 'https://www.theguardian.com/artanddesign');

    expect(title).toBe('Art and design, photography and architecture | The Guardian');
    expect(title).not.toContain('double quotation mark');
  });

  test('_extractHubMetadata ignores inline SVG <title> labels', () => {
    const $ = cheerio.load(HUB_HTML_WITH_SVG_QUOTE_ICONS);
    const { title } = processor._extractHubMetadata($, 'https://www.theguardian.com/artanddesign', [], []);

    expect(title).toBe('Art and design, photography and architecture | The Guardian');
    expect(title).not.toContain('double quotation mark');
  });

  test('normal pages still extract the head <title> (no regression)', () => {
    const html = '<html><head><title>Namibia | The Guardian</title></head><body></body></html>';
    const $ = cheerio.load(html);

    expect(processor._extractArticleMetadata($, 'https://www.theguardian.com/world/namibia').title)
      .toBe('Namibia | The Guardian');
    expect(processor._extractHubMetadata($, 'https://www.theguardian.com/world/namibia', [], []).title)
      .toBe('Namibia | The Guardian');
  });

  test('an <h1> heading still wins over the document title', () => {
    const html = '<html><head><title>Section front | The Guardian</title></head>'
      + '<body><h1>The real headline</h1><svg><title>double quotation mark</title></svg></body></html>';
    const $ = cheerio.load(html);

    expect(processor._extractArticleMetadata($, 'https://www.theguardian.com/x').title)
      .toBe('The real headline');
  });

  test('falls back to og:title when there is no head <title> or <h1>', () => {
    const html = '<html><head><meta property="og:title" content="OG Title | The Guardian"></head>'
      + '<body><svg><title>double quotation mark</title></svg></body></html>';
    const $ = cheerio.load(html);

    expect(processor._extractArticleMetadata($, 'https://www.theguardian.com/x').title)
      .toBe('OG Title | The Guardian');
  });

  // FIX 3 (2026-07-21): cheerio .text() dropped <br> without a separator, so an
  // <h1> with a <br> line-break ran the words together ("accurate news<br>is"
  // -> "accurate newsis"). Confirmed on apnews.com/purpose/. _titleText turns
  // <br> into a space (on a clone, so the shared $ is never mutated).
  test('an <h1> with a <br> line-break keeps a space (no run-together)', () => {
    const html = '<html><head><title>Purpose</title></head>'
      + '<body><h1 class="heading">We believe accurate news<br>is essential to civil society</h1></body></html>';
    const $ = cheerio.load(html);
    expect(processor._extractArticleMetadata($, 'https://apnews.com/purpose/').title)
      .toBe('We believe accurate news is essential to civil society');
    // shared $ unmutated: the <br> is still present after extraction
    expect($('h1').first().find('br').length).toBe(1);
  });

  test('_titleText decodes entities and is unchanged when there is no <br>', () => {
    const $ = cheerio.load('<h1>Tom &amp; Jerry return</h1>');
    expect(processor._titleText($('h1').first())).toBe('Tom & Jerry return');
    const $2 = cheerio.load('<h1>Norman Lear has died at 101</h1>');
    expect(processor._titleText($2('h1').first())).toBe('Norman Lear has died at 101');
  });
});
