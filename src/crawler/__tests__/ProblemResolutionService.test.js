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

  test('resolveMissingHub notifies observer and exposes known hub seeds', () => {
    const inserted = [];
    const stmt = {
      all: jest.fn((hostArg) => {
        const normalized = (hostArg || '').toLowerCase();
        return inserted
          .filter((row) => row.host === normalized)
          .map((row) => ({
            host: row.host,
            url: row.url,
            evidence: row.evidence,
            last_seen_at: row.lastSeenAt
          }));
      })
    };
    const db = {
      createTask: jest.fn(),
      prepare: jest.fn(() => stmt)
    };
    const recordSeed = jest.fn((_, payload) => {
      inserted.push({
        host: payload.host,
        url: payload.url,
        evidence: JSON.stringify(payload.evidence),
        lastSeenAt: '2025-10-12T00:00:00Z'
      });
      return true;
    });

    const observer = jest.fn();
    const service = new ProblemResolutionService({ db, recordSeed });
    service.setResolutionObserver(observer);

    const analysis = createUrlPlaceAnalysis();
    service.resolveMissingHub({
      jobId: 'job-42',
      host: 'Example.com',
      sourceUrl: 'https://example.com/us/california/news',
      urlPlaceAnalysis: analysis
    });

    expect(observer).toHaveBeenCalled();
    const payload = observer.mock.calls[0][0];
    expect(payload.normalizedHost).toBe('example.com');
    expect(payload.url).toBeTruthy();

    const seeds = service.getKnownHubSeeds({ host: 'example.com' });
    expect(Array.isArray(seeds)).toBe(true);
    expect(seeds.length).toBeGreaterThan(0);
    expect(seeds[0].url).toEqual(inserted[0].url);
    expect(seeds[0].confidence).toBeGreaterThan(0);
    expect(db.prepare).toHaveBeenCalled();
  });
});
