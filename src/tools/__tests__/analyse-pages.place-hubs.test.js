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

    expect(result.placeId).toBe(42);
    expect(result.evidence.urlChain).toEqual([
      expect.objectContaining({ place_id: 42, slug: 'iceland' })
    ]);
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

  test('uses urlPlaceAnalysis chain and derived topics when provided', () => {
    const urlPlaceAnalysis = {
      bestChain: {
        places: [
          {
            place: {
              name: 'United States',
              kind: 'country',
              place_id: 1,
              country_code: 'US'
            },
            segmentIndex: 0,
            score: 0.8
          },
          {
            place: {
              name: 'California',
              kind: 'region',
              place_id: 2,
              country_code: 'US'
            },
            segmentIndex: 1,
            score: 0.9
          }
        ]
      },
      matches: [],
      topics: {
        recognized: ['politica'],
        trailing: ['economia']
      }
    };

    const result = detectPlaceHub({
      url: 'https://www.example.com/us/california/politica',
      fetchClassification: 'nav',
      navLinksCount: 14,
      articleLinksCount: 5,
      wordCount: 120,
      urlPlaceAnalysis
    });

    expect(result).toBeTruthy();
    expect(result.placeSlug).toBe('california');
    expect(result.placeKind).toBe('region');
    expect(result.placeId).toBe(2);
    expect(result.placeCountry).toBe('US');
    expect(result.topic).toEqual(
      expect.objectContaining({ slug: 'politica', label: 'Politica', kind: 'topic', source: 'url-analysis' })
    );
    expect(result.evidence.urlMatches).toEqual(['united-states', 'california']);
    expect(result.evidence.urlChain).toEqual([
      expect.objectContaining({ place_id: 1, slug: 'united-states', segmentIndex: 0 }),
      expect.objectContaining({ place_id: 2, slug: 'california', segmentIndex: 1 })
    ]);
    expect(result.evidence.urlTopics).toEqual({
      leading: [],
      trailing: ['economia'],
      recognized: ['politica']
    });
  });
});
