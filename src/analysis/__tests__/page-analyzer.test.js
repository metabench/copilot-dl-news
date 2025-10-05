const { analyzePage } = require('../page-analyzer');

function createGazetteer() {
  const record = {
    id: 1,
    place_id: 1,
    name: 'Iceland',
    kind: 'country',
    country_code: 'IS',
    countryCode: 'IS',
    canonicalSlug: 'iceland',
    population: 366000,
    slugs: new Set(['iceland']),
    synonyms: ['iceland']
  };
  return {
    nameMap: new Map([['iceland', [record]]]),
    slugMap: new Map([['iceland', [record]]]),
    placeIndex: new Map([[1, record]]),
    topicTokens: new Set(),
    hierarchy: {
      isAncestor: () => false
    }
  };
}

describe('analyzePage', () => {
  test('extracts places, deep analysis, and hub candidate', () => {
    const gazetteer = createGazetteer();
    const url = 'https://www.theguardian.com/sport/iceland';

    const { analysis, places, hubCandidate, deepAnalysis } = analyzePage({
      url,
      title: 'Iceland sport hub',
      section: 'Sport',
      articleRow: {
        text: 'Iceland clinches another win in the world of sport.',
        word_count: 150,
        article_xpath: null
      },
      fetchRow: {
        classification: 'nav',
        nav_links_count: 20,
        article_links_count: 6,
        word_count: 150
      },
      gazetteer,
      db: { prepare: () => ({ get: () => null }) },
      targetVersion: 7
    });

    expect(analysis.analysis_version).toBe(7);
    expect(analysis.kind).toBe('article');
    expect(analysis.meta).toHaveProperty('wordCount', 150);

    expect(Array.isArray(places)).toBe(true);
    expect(places.some(place => place.place === 'Iceland')).toBe(true);

    expect(hubCandidate).toMatchObject({
      placeSlug: 'iceland',
      placeKind: 'country',
      topic: { slug: 'sport', label: 'Sport', kind: 'section', source: 'section' }
    });

    expect(deepAnalysis).toBeTruthy();
    expect(deepAnalysis.findings.keyPhrases.some(item => item.phrase === 'iceland')).toBe(true);
  });
});
