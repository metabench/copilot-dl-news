const { resolveUrlPlaces } = require('../place-extraction');

function createMatcher() {
  const us = {
    id: 1,
    place_id: 1,
    name: 'United States',
    kind: 'country',
    country_code: 'US',
    countryCode: 'US',
    population: 331000000,
    canonicalSlug: 'united-states',
    slugs: new Set(['united-states', 'us', 'usa']),
    synonyms: ['united-states', 'us', 'usa']
  };

  const california = {
    id: 2,
    place_id: 2,
    name: 'California',
    kind: 'region',
    country_code: 'US',
    countryCode: 'US',
    population: 39510000,
    canonicalSlug: 'california',
    slugs: new Set(['california']),
    synonyms: ['california']
  };

  const slugMap = new Map([
    ['united-states', [us]],
    ['us', [us]],
    ['usa', [us]],
    ['california', [california]]
  ]);

  const matchers = {
    nameMap: new Map(),
    slugMap,
    placeIndex: new Map([
      [us.id, us],
      [california.id, california]
    ]),
    topicTokens: new Set(['news', 'business']),
    hierarchy: {
      isAncestor: (ancestorId, descendantId) => ancestorId === us.id && descendantId === california.id
    }
  };

  return matchers;
}

describe('resolveUrlPlaces', () => {
  test('builds hierarchical chain for ancestor and descendant segments', () => {
    const matchers = createMatcher();
    const result = resolveUrlPlaces('https://example.com/us/california/news', matchers);

    expect(result.bestChain).toBeTruthy();
    expect(result.bestChain.places.map((entry) => entry.place.name)).toEqual(['United States', 'California']);
    expect(result.topics.trailing).toContain('news');
  });

  test('matches synonym segments like usa for country detection', () => {
    const matchers = createMatcher();
    const result = resolveUrlPlaces('https://example.com/usa/business', matchers);

    expect(result.matches.some((match) => match.place.name === 'United States')).toBe(true);
    expect(result.topics.trailing).toContain('business');
  });
});
