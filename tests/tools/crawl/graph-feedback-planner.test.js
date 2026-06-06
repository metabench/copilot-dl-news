'use strict';

const {
  MAX_PER_HOST_LIMIT,
  MAX_SAMPLE_LIMIT,
  buildGraphFeedbackPlan,
  buildSeedRecommendations,
  classifyGraphPosture,
  normalizeDomains,
} = require('../../../tools/crawl/lib/graph-feedback-planner');

function createMockGraphService(overrides = {}) {
  return {
    summarizeSiteGraph: jest.fn(async host => ({
      host,
      pageCount: 100,
      fetchedPageCount: 60,
      edgeCount: 450,
      internalEdgeCount: 400,
      externalEdgeCount: 50,
      orphanPageCount: 5,
      deadEndPageCount: 12,
      candidateHubCount: 2,
      fetchedCoverageRatio: 0.6,
      orphanPageRatio: 0.05,
      deadEndPageRatio: 0.12,
      averageEdgesPerPage: 4.5,
    })),
    findHubCandidates: jest.fn(async host => ({
      host,
      candidateCount: 2,
      candidates: [
        {
          urlId: 2,
          url: `https://${host}/world/`,
          classification: 'hub',
          inboundCount: 8,
          outboundCount: 30,
          inboundInternalCount: 8,
          inboundExternalCount: 0,
          outboundInternalCount: 26,
          outboundExternalCount: 4,
          hubScore: 64,
          hubSignals: ['many-internal-outlinks'],
        },
        {
          urlId: 3,
          url: `https://${host}/sports/`,
          classification: 'hub',
          inboundCount: 2,
          outboundCount: 14,
          inboundInternalCount: 2,
          inboundExternalCount: 0,
          outboundInternalCount: 14,
          outboundExternalCount: 0,
          hubScore: 30,
          hubSignals: ['section-like'],
        },
      ],
    })),
    findOrphanPages: jest.fn(async host => ({
      host,
      reason: 'orphan',
      pageCount: 2,
      pages: [
        { reason: 'orphan', connectivityScore: 0 },
        {
          urlId: 7,
          url: `https://${host}/orphan`,
          reason: 'orphan',
          connectivityScore: 3,
          inboundCount: 0,
          outboundCount: 3,
          classification: 'unknown',
        },
      ],
    })),
    findDeadEndPages: jest.fn(async host => ({
      host,
      reason: 'dead_end',
      pageCount: 1,
      pages: [
        {
          urlId: 8,
          url: `https://${host}/dead-end`,
          reason: 'dead_end',
          connectivityScore: 4,
          inboundCount: 4,
          outboundCount: 0,
          classification: 'article',
        },
      ],
    })),
    buildCrawlPriorityDataset: jest.fn(async host => ({
      manifest: {
        schemaVersion: 1,
        datasetName: 'crawl-priority-features',
        datasetType: 'crawl_priority_features',
        host,
        generatedAt: '2026-05-26T00:00:00.000Z',
        rowCount: 3,
        streamable: true,
        source: 'GraphAccess.iterateCrawlPriorityFeatures',
        options: { limit: 3 },
      },
      rows: [
        {
          urlId: 1,
          url: `https://${host}/missing-content`,
          classification: 'article',
          httpStatus: 200,
          fetchedAt: '2026-05-01T00:00:00.000Z',
          inboundInternalCount: 9,
          inboundExternalCount: 0,
          outboundInternalCount: 1,
          outboundExternalCount: 0,
          hasContent: false,
          missingContent: true,
          stale: false,
          priorityScore: 90,
          prioritySignals: ['missing-content', 'high-inbound'],
        },
        {
          urlId: 2,
          url: `https://${host}/world/`,
          classification: 'hub',
          httpStatus: 200,
          fetchedAt: '2026-05-01T00:00:00.000Z',
          inboundInternalCount: 8,
          inboundExternalCount: 0,
          outboundInternalCount: 26,
          outboundExternalCount: 4,
          hasContent: true,
          missingContent: false,
          stale: true,
          priorityScore: 40,
          prioritySignals: ['stale', 'hub-like'],
        },
        {
          urlId: 4,
          url: `https://${host}/low`,
          classification: 'unknown',
          httpStatus: null,
          fetchedAt: null,
          inboundInternalCount: 1,
          inboundExternalCount: 0,
          outboundInternalCount: 0,
          outboundExternalCount: 0,
          hasContent: null,
          missingContent: true,
          stale: false,
          priorityScore: 5,
          prioritySignals: ['unfetched'],
        },
      ],
    })),
    ...overrides,
  };
}

describe('graph-feedback-planner', () => {
  test('normalizes and dedupes domains', () => {
    expect(normalizeDomains(['Example.com', 'example.com', ' bbc.com ', ''])).toEqual([
      'example.com',
      'bbc.com',
    ]);
    expect(normalizeDomains('A.com,b.com,A.com')).toEqual(['a.com', 'b.com']);
  });

  test('classifies compact site graph posture from summary ratios', () => {
    expect(classifyGraphPosture({
      pageCount: 100,
      fetchedCoverageRatio: 0.1,
      orphanPageRatio: 0.4,
      deadEndPageRatio: 0.5,
      candidateHubCount: 3,
      averageEdgesPerPage: 11,
    })).toEqual([
      'low-fetched-coverage',
      'orphan-heavy',
      'dead-end-heavy',
      'hub-candidates-present',
      'dense-link-graph',
    ]);

    expect(classifyGraphPosture({ pageCount: 10, fetchedPageCount: 10, edgeCount: 20 })).toEqual(['balanced']);
    expect(classifyGraphPosture({ pageCount: 0 })).toEqual(['empty-graph']);
  });

  test('builds bounded recommendations from crawl-priority rows and hub candidates', () => {
    const rows = [
      { url: 'https://example.com/a', urlId: 1, priorityScore: 10, prioritySignals: ['missing-content'] },
      { url: 'https://example.com/b', urlId: 2, priorityScore: 40, prioritySignals: ['stale'] },
    ];
    const hubs = [
      {
        url: 'https://example.com/a',
        urlId: 1,
        hubScore: 80,
        hubSignals: ['many-internal-outlinks'],
        outboundInternalCount: 20,
      },
      {
        url: 'https://example.com/c',
        urlId: 3,
        hubScore: 20,
        hubSignals: ['section-like'],
        outboundInternalCount: 8,
      },
    ];

    const out = buildSeedRecommendations({
      host: 'example.com',
      priorityRows: rows,
      hubCandidates: hubs,
      limit: 2,
    });

    expect(out).toHaveLength(2);
    expect(out[0].url).toBe('https://example.com/a');
    expect(out[0].priorityScore).toBe(80);
    expect(out[0].sources).toEqual(['crawl-priority-features', 'hub-candidates']);
    expect(out[0].signals).toEqual(['missing-content', 'many-internal-outlinks']);
    expect(out[1].url).toBe('https://example.com/b');
  });

  test('builds a bounded per-domain feedback plan without DB or network access', async () => {
    const service = createMockGraphService();

    const plan = await buildGraphFeedbackPlan(service, ['Example.com', 'example.com'], {
      perHostLimit: 2,
      sampleLimit: 1,
      generatedAt: '2026-05-26T12:00:00.000Z',
      staleFetchedBefore: '2026-05-01T00:00:00.000Z',
    });

    expect(plan.source).toBe('WebsiteGraphAnalysisService');
    expect(plan.mode).toBe('full');
    expect(plan.generatedAt).toBe('2026-05-26T12:00:00.000Z');
    expect(plan.domainCount).toBe(1);
    expect(plan.recommendationCount).toBe(2);
    expect(plan.errorCount).toBe(0);
    expect(plan.domains[0].host).toBe('example.com');
    expect(plan.domains[0].status).toBe('ok');
    expect(plan.domains[0].posture).toContain('hub-candidates-present');
    expect(plan.domains[0].recommendations).toHaveLength(2);
    expect(plan.domains[0].diagnostics.orphanSamples).toHaveLength(1);
    expect(plan.domains[0].diagnostics.deadEndSamples).toHaveLength(1);

    expect(service.findHubCandidates).toHaveBeenCalledWith('example.com', expect.objectContaining({ limit: 2 }));
    expect(service.findOrphanPages).toHaveBeenCalledWith('example.com', expect.objectContaining({ limit: 1, excludeRootPath: true }));
    expect(service.findDeadEndPages).toHaveBeenCalledWith('example.com', expect.objectContaining({ limit: 1, excludeRootPath: true }));
    expect(service.buildCrawlPriorityDataset).toHaveBeenCalledWith('example.com', expect.objectContaining({
      limit: 2,
      includeFetched: true,
      staleFetchedBefore: '2026-05-01T00:00:00.000Z',
    }));
  });

  test('fast mode uses only crawl-priority features for populated-host dry runs', async () => {
    const service = createMockGraphService();

    const plan = await buildGraphFeedbackPlan(service, 'example.com', {
      mode: 'fast',
      perHostLimit: 2,
      generatedAt: '2026-05-26T12:00:00.000Z',
    });

    expect(plan.mode).toBe('fast');
    expect(plan.domainCount).toBe(1);
    expect(plan.recommendationCount).toBe(2);
    expect(plan.domains[0]).toMatchObject({
      host: 'example.com',
      status: 'ok',
      mode: 'fast',
      summary: null,
      posture: ['priority-dataset-only'],
    });
    expect(plan.domains[0].diagnostics.skippedAnalyses).toEqual([
      'site-summary',
      'hub-candidates',
      'orphan-pages',
      'dead-end-pages',
    ]);
    expect(plan.domains[0].diagnostics.hubCandidateCount).toBeNull();
    expect(plan.domains[0].recommendations.map(item => item.sources)).toEqual([
      ['crawl-priority-features'],
      ['crawl-priority-features'],
    ]);

    expect(service.summarizeSiteGraph).not.toHaveBeenCalled();
    expect(service.findHubCandidates).not.toHaveBeenCalled();
    expect(service.findOrphanPages).not.toHaveBeenCalled();
    expect(service.findDeadEndPages).not.toHaveBeenCalled();
    expect(service.buildCrawlPriorityDataset).toHaveBeenCalledWith('example.com', expect.objectContaining({
      limit: 2,
      includeFetched: true,
    }));
  });

  test('clamps limits and records per-domain graph analysis errors', async () => {
    const service = createMockGraphService({
      summarizeSiteGraph: jest.fn(async host => {
        if (host === 'bad.com') throw new Error('missing graph capability');
        return {
          host,
          pageCount: 1,
          fetchedPageCount: 1,
          edgeCount: 0,
          orphanPageCount: 0,
          deadEndPageCount: 0,
          candidateHubCount: 0,
        };
      }),
    });

    const plan = await buildGraphFeedbackPlan(service, ['good.com', 'bad.com'], {
      perHostLimit: 999,
      sampleLimit: 999,
    });

    expect(plan.limits.perHostLimit).toBe(MAX_PER_HOST_LIMIT);
    expect(plan.limits.sampleLimit).toBe(MAX_SAMPLE_LIMIT);
    expect(plan.errorCount).toBe(1);
    expect(plan.domains.find(item => item.host === 'bad.com')).toEqual(expect.objectContaining({
      status: 'error',
      error: 'missing graph capability',
      recommendations: [],
    }));
  });

  test('rejects service objects that do not match WebsiteGraphAnalysisService shape', async () => {
    await expect(buildGraphFeedbackPlan({}, ['example.com']))
      .rejects.toThrow('graphService must provide summarizeSiteGraph()');
  });

  test('rejects unsupported graph feedback modes', async () => {
    await expect(buildGraphFeedbackPlan(createMockGraphService(), 'example.com', {
      mode: 'slow',
    })).rejects.toThrow('Unsupported graph feedback mode');
  });
});
