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
      kind: 'place',
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
    expect(result.kind).toBe('place');
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

  test('allows nav link signal even when page content is long', () => {
    const result = detectPlaceHub({
      url: 'https://www.example.com/world/iceland',
      fetchClassification: 'article',
      navLinksCount: 48,
      articleLinksCount: 5,
      wordCount: 480,
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
    expect(result.kind).toBe('place');
    expect(result.placeSlug).toBe('iceland');
    expect(result.isLightContent).toBe(false);
  });

  test('allows nav link signal when page content is light', () => {
    const result = detectPlaceHub({
      url: 'https://www.example.com/world/iceland',
      fetchClassification: 'article',
      navLinksCount: 35,
      articleLinksCount: 4,
      wordCount: 140,
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
    expect(result.kind).toBe('place');
    expect(result.placeSlug).toBe('iceland');
  });


  test('screens nav-like pages when article detection is confident', () => {
    const articleAnalysis = JSON.stringify({
      content: {
        wordCount: 820,
        linkDensity: 0.12,
        p: 9,
        schema: {
          hasStructuredData: true,
          hasArticleType: true,
          hasArticleBody: true,
          strength: 'strong',
          score: 7.6,
          articleTypes: ['NewsArticle'],
          sources: ['jsonld']
        }
      }
    });

    const result = detectPlaceHub({
      url: 'https://www.example.com/news/world/iceland/story',
      title: 'Example Story',
      fetchClassification: 'nav',
      latestClassification: 'article',
      navLinksCount: 24,
      articleLinksCount: 6,
      wordCount: 420,
      articleWordCount: 820,
      articleAnalysis,
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
    expect(result.kind).toBe('article-screened');
    expect(result.articleDetection).toMatchObject({
      isArticle: true,
      confidence: expect.any(Number)
    });
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
  expect(result.kind).toBe('place');
    expect(result.placeSlug).toBe('california');
    expect(result.placeKind).toBe('region');
    expect(result.placeId).toBe(2);
    expect(result.placeCountry).toBe('US');
    expect(result.topic).toEqual(
      expect.objectContaining({ slug: 'politica', label: 'Politica', kind: 'topic-place', source: 'url-analysis' })
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

  test('promotes recognized topic segments to topic-place classification', () => {
    const urlPlaceAnalysis = {
      bestChain: {
        places: [
          {
            place: {
              name: 'Fresnillo',
              kind: 'city',
              place_id: 527,
              country_code: 'MX'
            },
            segmentIndex: 1,
            score: 0.92
          }
        ]
      },
      topics: {
        recognized: ['business'],
        leading: [],
        trailing: []
      },
      segments: [
        { segment: 'business', segmentIndex: 0, recognizedTopics: ['business'], topicTokens: ['business'], placeMatches: [] },
        { segment: 'fresnillo', segmentIndex: 1, recognizedTopics: [], topicTokens: [], placeMatches: [] }
      ]
    };

    const result = detectPlaceHub({
      url: 'https://www.example.com/business/fresnillo',
      section: 'Business',
      fetchClassification: 'nav',
      navLinksCount: 36,
      articleLinksCount: 8,
      wordCount: 220,
      urlPlaceAnalysis,
      nonGeoTopicSlugs: new Set(['culture'])
    });

    expect(result).toBeTruthy();
    expect(result.kind).toBe('place');
    expect(result.placeSlug).toBe('fresnillo');
    expect(result.topic).toEqual(
      expect.objectContaining({ slug: 'business', kind: 'topic-place', label: 'Business' })
    );
    expect(result.evidence.topic).toEqual(
      expect.objectContaining({ slug: 'business', kind: 'topic-place', label: 'Business' })
    );
  });

  test('prefers place candidates whose country matches derived section hint', () => {
    const result = detectPlaceHub({
      url: 'https://www.example.com/us-news/phoenix',
      section: 'US news',
      fetchClassification: 'nav',
      navLinksCount: 32,
      articleLinksCount: 7,
      wordCount: 210,
      urlPlaceAnalysis: {
        bestChain: {
          places: [
            {
              place: {
                name: 'Osh',
                kind: 'city',
                place_id: 999,
                country_code: 'KG'
              },
              segmentIndex: 0,
              score: 0.9,
              token: 'us'
            },
            {
              place: {
                name: 'Phoenix',
                kind: 'city',
                place_id: 1234,
                country_code: 'US'
              },
              segmentIndex: 0,
              score: 0.9,
              token: 'phoenix'
            }
          ]
        },
        topics: {
          recognized: ['us-news']
        }
      }
    });

    expect(result).toBeTruthy();
    expect(result.kind).toBe('place');
    expect(result.placeSlug).toBe('phoenix');
    expect(result.placeCountry).toBe('US');
    expect(result.evidence.urlChain).toEqual([
      expect.objectContaining({ slug: 'phoenix', place_id: 1234 })
    ]);
    expect(result.evidence.urlChain.map((entry) => entry.slug)).not.toContain('osh');
  });

  test('skips short alias matches that conflict with section hint', () => {
    const result = detectPlaceHub({
      url: 'https://www.example.com/us-news/nashville',
      section: 'US news',
      fetchClassification: 'nav',
      navLinksCount: 38,
      articleLinksCount: 9,
      wordCount: 260,
      urlPlaceAnalysis: {
        bestChain: {
          places: [
            {
              place: {
                name: 'Osh',
                kind: 'city',
                place_id: 999,
                country_code: 'KG'
              },
              segmentIndex: 0,
              score: 0.95,
              token: 'us',
              normalizedToken: 'us'
            }
          ]
        },
        topics: {
          recognized: ['us-news']
        }
      },
      gazetteerPlaceNames: new Set(['Nashville'])
    });

    expect(result).toBeTruthy();
    expect(result.kind).toBe('place');
    expect(result.placeSlug).toBe('nashville');
    expect(result.evidence.urlChain).toEqual([]);
    expect(result.evidence.fallback).toEqual(
      expect.objectContaining({ slug: 'nashville', matchedGazetteer: true, applied: true })
    );
  });

  test('retains short alias when it matches expected country code', () => {
    const result = detectPlaceHub({
      url: 'https://www.example.com/us-news/us',
      section: 'US news',
      fetchClassification: 'nav',
      navLinksCount: 28,
      articleLinksCount: 6,
      wordCount: 180,
      urlPlaceAnalysis: {
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
              score: 0.88,
              token: 'us',
              normalizedToken: 'us'
            }
          ]
        },
        topics: {
          recognized: ['us-news']
        }
      }
    });

    expect(result).toBeTruthy();
    expect(result.kind).toBe('place');
    expect(result.placeSlug).toBe('united-states');
    expect(result.placeCountry).toBe('US');
    expect(result.evidence.urlChain).toEqual([
      expect.objectContaining({ slug: 'united-states', place_id: 1 })
    ]);
  });

  test('marks front page canonical URL metadata', () => {
    const result = detectPlaceHub({
      url: 'https://www.example.com/world/iceland',
      fetchClassification: 'nav',
      navLinksCount: 30,
      articleLinksCount: 6,
      wordCount: 200,
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
    expect(result.kind).toBe('place');
    expect(result.isFrontPage).toBe(true);
    expect(result.canonicalUrl).toBe('https://www.example.com/world/iceland');
    expect(result.variantKind).toBeNull();
    expect(result.variantValue).toBeNull();
    expect(result.evidence.canonical_url).toBe('https://www.example.com/world/iceland');
    expect(result.evidence.is_front_page).toBe(true);
    expect(result.evidence.variant).toBeNull();
  });

  test('identifies paginated variants as non-front pages', () => {
    const result = detectPlaceHub({
      url: 'https://www.example.com/world/iceland?page=3',
      fetchClassification: 'nav',
      navLinksCount: 30,
      articleLinksCount: 6,
      wordCount: 200,
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
    expect(result.kind).toBe('place');
    expect(result.isFrontPage).toBe(false);
    expect(result.canonicalUrl).toBe('https://www.example.com/world/iceland');
    expect(result.variantKind).toBe('pagination');
    expect(result.variantValue).toBe('3');
    expect(result.evidence.is_front_page).toBe(false);
    expect(result.evidence.variant).toEqual({ kind: 'pagination', value: '3' });
  });

  test('prefers terminal path segment when it matches gazetteer better than chain', () => {
    const gazetteerPlaceNames = new Set(['Osh', 'Nashville']);

    const result = detectPlaceHub({
      url: 'https://www.example.com/us-news/nashville',
      fetchClassification: 'nav',
      navLinksCount: 40,
      articleLinksCount: 10,
      wordCount: 320,
      urlPlaceAnalysis: {
        bestChain: {
          places: [
            {
              place: {
                name: 'Osh',
                kind: 'city',
                place_id: 999,
                country_code: 'KG'
              },
              segmentIndex: 0,
              score: 0.5
            }
          ]
        }
      },
      gazetteerPlaceNames
    });

    expect(result).toBeTruthy();
    expect(result.kind).toBe('place');
    expect(result.placeSlug).toBe('nashville');
    expect(result.placeLabel).toBe('Nashville');
    expect(result.canonicalUrl).toBe('https://www.example.com/us-news/nashville');
    expect(result.evidence.fallback).toEqual(
      expect.objectContaining({ slug: 'nashville', matchedGazetteer: true, applied: true })
    );
  });

  test('returns unknown classification when terminal segment is not in gazetteer', () => {
    const result = detectPlaceHub({
      url: 'https://www.example.com/culture/batman',
      fetchClassification: 'nav',
      navLinksCount: 28,
      articleLinksCount: 4,
      wordCount: 210,
      urlPlaceAnalysis: { matches: [], topics: { recognized: [], trailing: [], leading: [] } },
      gazetteerPlaceNames: new Set(['Gotham'])
    });

    expect(result).toBeTruthy();
    expect(result.kind).toBe('unknown');
    expect(result.unknownTerms).toEqual([
      expect.objectContaining({ slug: 'batman', source: 'url-segment', reason: 'segment-not-in-gazetteer' })
    ]);
    expect(result.placeSlug).toBeUndefined();
  });

  test('returns unknown when matching place appears inside non-geo topic section', () => {
    const result = detectPlaceHub({
      url: 'https://www.example.com/culture/batman',
      section: 'Culture',
      fetchClassification: 'nav',
      navLinksCount: 48,
      articleLinksCount: 12,
      wordCount: 320,
      urlPlaces: [
        {
          name: 'Batman',
          kind: 'city',
          place_id: 10836,
          country_code: 'TR'
        }
      ],
      nonGeoTopicSlugs: new Set(['culture'])
    });

    expect(result).toBeTruthy();
    expect(result.kind).toBe('unknown');
    expect(result.unknownTerms).toEqual([
      expect.objectContaining({ slug: 'batman', source: 'non-geo-topic', reason: 'non-geo-context' })
    ]);
    expect(result.evidence).toMatchObject({ reason: 'non-geo-context', non_geo_blocker: 'culture' });
  });
});
