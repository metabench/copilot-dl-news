'use strict';

const { loadSitemaps } = require('../sitemap');

// A sitemap index chaining many children (like SMH's video-sitemap chain) and
// a fetch that counts calls: proves the budget stops XML crowding out
// discovery, and that news-looking children are fetched before media ones.
function makeFetchImpl(log) {
  const urlset = (locs) => `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${
    locs.map((l) => `<url><loc>${l}</loc></url>`).join('')}</urlset>`;
  const index = (locs) => `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${
    locs.map((l) => `<sitemap><loc>${l}</loc></sitemap>`).join('')}</sitemapindex>`;
  return async (u) => {
    log.push(u);
    let body;
    if (u.endsWith('/sitemap.xml')) {
      body = index([
        'https://example.com/sitemaps/videos-1.xml',
        'https://example.com/sitemaps/videos-2.xml',
        'https://example.com/sitemaps/news.xml',
        'https://example.com/sitemaps/videos-3.xml',
        'https://example.com/sitemaps/articles.xml'
      ]);
    } else if (u.includes('news') || u.includes('articles')) {
      body = urlset([`${u.replace('.xml', '')}/story-1`, `${u.replace('.xml', '')}/story-2`]);
    } else {
      body = urlset([`${u.replace('.xml', '')}/video-1`]);
    }
    return {
      ok: true, status: 200,
      headers: { get: () => null },
      text: async () => body
    };
  };
}

describe('loadSitemaps fetch budget + prioritization', () => {
  test('sitemapMaxFetches bounds sitemap documents fetched', async () => {
    const log = [];
    const pushed = [];
    await loadSitemaps('https://example.com', 'example.com', null, {
      sitemapMaxUrls: 5000,
      sitemapMaxFetches: 3,
      fetchImpl: makeFetchImpl(log),
      push: (url) => pushed.push(url)
    });
    // 1 index + at most 2 children (budget 3)
    expect(log.length).toBeLessThanOrEqual(3);
  });

  test('news/article children are fetched before video children', async () => {
    const log = [];
    const pushed = [];
    await loadSitemaps('https://example.com', 'example.com', null, {
      sitemapMaxUrls: 5000,
      sitemapMaxFetches: 3,
      fetchImpl: makeFetchImpl(log),
      push: (url) => pushed.push(url)
    });
    const children = log.slice(1); // after the index
    // With budget for only 2 children, both must be the news-looking ones.
    for (const c of children) {
      expect(c.includes('videos-')).toBe(false);
    }
    expect(pushed.some((u) => u.includes('story-'))).toBe(true);
  });

  test('without a budget the whole chain is fetched (regression guard)', async () => {
    const log = [];
    await loadSitemaps('https://example.com', 'example.com', null, {
      sitemapMaxUrls: 5000,
      sitemapMaxFetches: 50,
      fetchImpl: makeFetchImpl(log),
      push: () => {}
    });
    expect(log.length).toBe(6); // index + 5 children
  });
});
