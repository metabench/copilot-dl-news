const NewsCrawler = require('../crawl');

describe('NewsCrawler intelligent completion milestone', () => {
  test('emits structured milestone with planner summary and problems', () => {
    const crawler = new NewsCrawler('https://example.com', { crawlType: 'intelligent' });
    const milestoneSpy = jest.spyOn(crawler.telemetry, 'milestone');

    crawler.seededHubUrls = new Set([
      'https://example.com/world/',
      'https://example.com/sport/'
    ]);
    crawler._intelligentPlanSummary = {
      sectionHubCount: 3,
      countryCandidateCount: 1,
      requestedCount: 5,
      sampleSeeded: [
        'https://example.com/world/',
        'https://example.com/sport/'
      ]
    };
    crawler.problemCounters = new Map([
      ['missing-hub', { count: 2 }],
      ['unknown-pattern', { count: 1 }]
    ]);
    crawler.problemSamples = new Map([
      ['missing-hub', { scope: 'example.com', target: '/world/mars' }]
    ]);
    crawler.stats = {
      pagesVisited: 12,
      pagesDownloaded: 7,
      articlesFound: 4,
      articlesSaved: 3,
      errors: 1
    };

  crawler.milestoneTracker.emitCompletionMilestone({ outcomeErr: null });

  expect(milestoneSpy).toHaveBeenCalledTimes(1);
  const milestone = milestoneSpy.mock.calls[0][0];
    expect(milestone.kind).toBe('intelligent-completion');
    expect(milestone.message).toMatch(/completed/);
    expect(milestone.details).toMatchObject({
      outcome: 'completed',
      stats: {
        visited: 12,
        downloaded: 7,
        articlesFound: 4,
        articlesSaved: 3,
        errors: 1
      }
    });
    expect(milestone.details.seededHubs).toMatchObject({
      unique: 2,
      requested: 5,
      sectionsFromPatterns: 3,
      countryCandidates: 1,
      visited: 0
    });
    expect(milestone.details.coverage).toMatchObject({
      expected: 5,
      seeded: 2,
      visited: 0,
      coveragePct: 2 / 5,
      visitedCoveragePct: 0
    });
    expect(milestone.details.problems).toEqual([
      {
        kind: 'missing-hub',
        count: 2,
        sample: { scope: 'example.com', target: '/world/mars' }
      },
      {
        kind: 'unknown-pattern',
        count: 1
      }
    ]);

    milestoneSpy.mockRestore();
  });
});
