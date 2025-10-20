const { CrawlerState } = require('../CrawlerState');

describe('CrawlerState country hub tracking', () => {
  test('tracks discovery, validation, and article indexing without duplication', () => {
    const state = new CrawlerState();
    const hubUrl = 'https://example.com/world/france';

    state.addSeededHub(hubUrl, { kind: 'country', countryName: 'France', countryCode: 'FR' });

    let progress = state.getCountryHubProgress();
    expect(progress).toEqual({ discovered: 1, validated: 0, articleUrls: 0 });

    state.markSeededHubVisited(hubUrl, { kind: 'country' });
    progress = state.getCountryHubProgress();
    expect(progress.validated).toBe(1);

    state.recordCountryHubLinks(hubUrl, {
      articleUrls: [
        'https://example.com/article-1',
        'https://example.com/article-2'
      ],
      paginationUrls: ['https://example.com/world/france?page=2']
    });

    progress = state.getCountryHubProgress();
    expect(progress.articleUrls).toBe(2);

    state.recordCountryHubLinks(hubUrl, {
      articleUrls: ['https://example.com/article-1']
    });

    progress = state.getCountryHubProgress();
    expect(progress.articleUrls).toBe(2);
  });
});
