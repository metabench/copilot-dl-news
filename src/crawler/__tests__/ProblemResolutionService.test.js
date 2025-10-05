const { ProblemResolutionService } = require('../ProblemResolutionService');

function createUrlPlaceAnalysis() {
  return {
    bestChain: {
      places: [
        {
          place: {
            name: 'United States',
            canonicalSlug: 'united-states',
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
            canonicalSlug: 'california',
            kind: 'region',
            place_id: 2,
            country_code: 'US'
          },
          segmentIndex: 1,
          score: 0.92
        }
      ]
    },
    topics: {
      recognized: ['politica'],
      trailing: ['economia']
    }
  };
}

describe('ProblemResolutionService', () => {
  test('buildResolutionCandidates returns hybrid topology URLs', () => {
    const service = new ProblemResolutionService();
    const analysis = createUrlPlaceAnalysis();
    const hubCandidate = {
      navLinksCount: 18,
      articleLinksCount: 5,
      topic: {
        slug: 'world',
        label: 'World News',
        source: 'section'
      }
    };

    const candidates = service.buildResolutionCandidates({
      host: 'example.com',
      sourceUrl: 'https://example.com/us/california/news',
      urlPlaceAnalysis: analysis,
      hubCandidate
    });

    expect(Array.isArray(candidates)).toBe(true);
    expect(candidates.length).toBeGreaterThanOrEqual(3);
    const urls = candidates.map((entry) => entry.url);
    expect(urls).toContain('https://example.com/united-states/california/');
    expect(urls.some((url) => url.includes('/world/california/'))).toBe(true);
    expect(candidates[0].confidence).toBeGreaterThan(0.4);
  });

  test('resolveMissingHub records seeds and creates tasks', () => {
    const tasks = [];
    const recordSeed = jest.fn();
    const createTask = jest.fn((task) => {
      tasks.push(task);
      return { id: tasks.length, ...task };
    });

    const service = new ProblemResolutionService({
      db: { createTask },
      recordSeed
    });

    const analysis = createUrlPlaceAnalysis();
    const result = service.resolveMissingHub({
      jobId: 'job-1',
      host: 'example.com',
      sourceUrl: 'https://example.com/us/california/news',
      urlPlaceAnalysis: analysis,
      hubCandidate: {
        navLinksCount: 14,
        articleLinksCount: 3,
        topic: { slug: 'world', label: 'World', source: 'section' }
      }
    });

    expect(result.attempted).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
    expect(result.created.length).toBeGreaterThan(0);
    expect(recordSeed).toHaveBeenCalled();
    expect(createTask).toHaveBeenCalled();
    expect(tasks[0]).toMatchObject({
      jobId: 'job-1',
      kind: 'hub-resolution'
    });
  });
});
