'use strict';

function makeGraphFeedbackArtifact(host = 'bbc.com', overrides = {}) {
  const domainOverrides = overrides.domainOverrides || {};
  const rest = { ...overrides };
  delete rest.domainOverrides;

  return {
    schemaVersion: 1,
    source: 'WebsiteGraphAnalysisService',
    mode: 'full',
    generatedAt: '2026-05-26T00:00:00.000Z',
    limits: {
      perHostLimit: 2,
      sampleLimit: 1,
      maxPerHostLimit: 200,
      maxSampleLimit: 50,
    },
    domainCount: 1,
    recommendationCount: 1,
    errorCount: 0,
    domains: [{
      host,
      status: 'ok',
      mode: 'full',
      posture: ['balanced'],
      recommendations: [{
        url: `https://${host}/news`,
        urlId: 101,
        priorityScore: 7,
        reason: 'missing content',
        sources: ['crawl-priority-features'],
        signals: ['missing-content'],
        metadata: { missingContent: true },
      }],
      diagnostics: {
        orphanSamples: [],
        deadEndSamples: [],
      },
      ...domainOverrides,
    }],
    ...rest,
  };
}

module.exports = {
  makeGraphFeedbackArtifact,
};
