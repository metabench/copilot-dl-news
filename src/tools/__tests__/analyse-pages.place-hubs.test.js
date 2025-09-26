const { detectPlaceHub } = require('../placeHubDetector');

describe('detectPlaceHub helper', () => {
  test('records topic metadata for place-specific hubs', () => {
    const result = detectPlaceHub({
      url: 'https://www.theguardian.com/sport/iceland',
      section: 'Sport',
      fetchClassification: 'nav',
      navLinksCount: 24,
      articleLinksCount: 6,
      wordCount: 150,
      urlPlaces: [
        {
          name: 'Iceland',
          kind: 'country',
          place_id: 42,
          country_code: 'IS'
        }
      ]
    });

    expect(result).toBeTruthy();
    expect(result).toMatchObject({
      host: 'www.theguardian.com',
      placeSlug: 'iceland',
      placeKind: 'country',
      topic: { slug: 'sport', label: 'Sport', kind: 'section', source: 'section' }
    });

    expect(result.evidence).toMatchObject({
      slug: 'iceland',
      placeKind: 'country',
      topic: { slug: 'sport', label: 'Sport', kind: 'section', source: 'section' },
      nav_links_count: 24,
      article_links_count: 6
    });
  });

  test('falls back to analysis detections when URL lacks place hint', () => {
    const result = detectPlaceHub({
      url: 'https://www.example.com/news/sport/world',
      section: 'World news',
      fetchClassification: 'nav',
      navLinksCount: 12,
      articleLinksCount: 5,
      wordCount: 120,
      urlPlaces: [],
      analysisPlaces: [
        {
          place: 'Iceland',
          place_kind: 'country',
          place_id: 42,
          country_code: 'IS'
        }
      ]
    });

    expect(result).toBeTruthy();
    expect(result.placeSlug).toBe('iceland');
    expect(result.placeKind).toBe('country');
    expect(result.topic).toEqual(
      expect.objectContaining({ slug: 'world-news', label: 'World news', kind: 'section', source: 'section' })
    );
    expect(result.evidence).toMatchObject({
      slug: 'iceland',
      placeKind: 'country',
      topic: expect.objectContaining({ slug: 'world-news' })
    });
  });

  test('returns null when page is not nav-like or lightweight', () => {
    const result = detectPlaceHub({
      url: 'https://www.theguardian.com/world/iceland',
      fetchClassification: 'article',
      navLinksCount: 2,
      articleLinksCount: 1,
      wordCount: 800,
      urlPlaces: [
        {
          name: 'Iceland',
          kind: 'country',
          place_id: 42,
          country_code: 'IS'
        }
      ]
    });

    expect(result).toBeNull();
  });
});
