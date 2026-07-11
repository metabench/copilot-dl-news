'use strict';

const {
  DEFAULT_TARGETS,
  buildQualityScorecard,
  renderScorecardText,
} = require('../../../tools/crawl/lib/quality-scorecard');

describe('quality-scorecard buildQualityScorecard', () => {
  test('a clean single-host crawl passes every hard check', () => {
    const card = buildQualityScorecard({
      signals: {
        downloads: 54,
        responses: 56,
        failedResponses: 2,
        statusTaxonomy: { '200': 54, '500': 2 },
        rateLimitedCount: 0,
        serverErrorCount: 2,
        distinctHostsFetched: 1,
        requestedHosts: ['www.theguardian.com'],
        stalled: false,
        freshness: { etag: 36, lastModified: 0, notModified: 0 },
        dedup: { totalResponses: 56, distinctUrls: 56, duplicateResponses: 0 },
      },
      context: { rung: 'small', url: 'theguardian.com' },
    });
    // 54/56 = 0.964 >= 0.95, 0x429, not stalled, 1/1 host fetched.
    expect(card.verdict).toBe('PASS');
    expect(card.exitCode).toBe(0);
    expect(card.failures).toHaveLength(0);
    expect(card.summary.successRate).toBeCloseTo(0.9643, 3);
  });

  test('below-target success rate fails with an actionable reason', () => {
    const card = buildQualityScorecard({
      signals: { downloads: 4, responses: 10, statusTaxonomy: { '200': 4, '404': 6 } },
    });
    expect(card.verdict).toBe('FAIL');
    expect(card.exitCode).toBe(2);
    const fail = card.failures.find((f) => f.id === 'success-rate');
    expect(fail).toBeTruthy();
    expect(fail.detail).toMatch(/failed/i);
  });

  test('a rate-limit storm (429s) fails the politeness check', () => {
    const card = buildQualityScorecard({
      signals: {
        downloads: 20, responses: 30,
        statusTaxonomy: { '200': 20, '429': 10 },
        rateLimitedCount: 10,
      },
    });
    const politeness = card.checks.find((c) => c.id === 'politeness');
    expect(politeness.status).toBe('fail');
    expect(card.verdict).toBe('FAIL');
    expect(card.failures.find((f) => f.id === 'politeness').detail).toMatch(/429|throttl/i);
  });

  test('zero downloads fails the fundamental evidence check', () => {
    const card = buildQualityScorecard({ signals: { downloads: 0, responses: 0 } });
    const evidence = card.checks.find((c) => c.id === 'crawl-produced-evidence');
    expect(evidence.status).toBe('fail');
    expect(card.verdict).toBe('FAIL');
    // success-rate is skipped (no responses), not counted as a failure.
    expect(card.checks.find((c) => c.id === 'success-rate').status).toBe('skip');
  });

  test('an all-304 re-crawl passes: not-modified counts as evidence and success', () => {
    const card = buildQualityScorecard({
      signals: {
        downloads: 0,
        responses: 12,
        notModifiedCount: 12,
        successRate: 1, // deriveSignals computes (0 + 12×304)/12
        statusTaxonomy: { '304': 12 },
        freshness: { etag: 12, lastModified: 0, notModified: 12 },
      },
    });
    const evidence = card.checks.find((c) => c.id === 'crawl-produced-evidence');
    expect(evidence.status).toBe('pass');
    expect(evidence.actual).toMatch(/304/);
    const rate = card.checks.find((c) => c.id === 'success-rate');
    expect(rate.status).toBe('pass');
    expect(rate.actual).toMatch(/304/);
    expect(card.verdict).toBe('PASS');
  });

  test('seed-fetched is a hard check: missing seed fails, fetched-with-404 passes', () => {
    const failing = buildQualityScorecard({
      signals: {
        downloads: 5, responses: 5, statusTaxonomy: { '200': 5 },
        seedFetch: { requested: 1, fetched: 0, missing: ['https://example.com/world'] },
      },
    });
    expect(failing.verdict).toBe('FAIL');
    const check = failing.checks.find((c) => c.id === 'seed-fetched');
    expect(check.status).toBe('fail');
    expect(check.detail).toMatch(/example\.com\/world/);

    const passing = buildQualityScorecard({
      signals: {
        downloads: 5, responses: 5, statusTaxonomy: { '200': 5 },
        seedFetch: { requested: 1, fetched: 1, missing: [] },
      },
    });
    expect(passing.checks.find((c) => c.id === 'seed-fetched').status).toBe('pass');
    expect(passing.verdict).toBe('PASS');
  });

  test('probe 404s and infra fetches are itemized without failing the card', () => {
    const card = buildQualityScorecard({
      signals: {
        downloads: 1,
        responses: 2,
        successRate: 1, // 1 / (2 - 1 discovery miss)
        notFoundCount: 1,
        infra: { responses: 2, robots: 1, sitemapProbes: 1, ok: 1, notFound: 1 },
        statusTaxonomy: { '200': 1, '404': 1 },
        requestedHosts: ['127.0.0.1'],
        distinctHostsFetched: 1,
      },
    });
    expect(card.verdict).toBe('PASS');
    const rate = card.checks.find((c) => c.id === 'success-rate');
    expect(rate.status).toBe('pass');
    expect(rate.actual).toMatch(/discovery miss/);
    const infra = card.checks.find((c) => c.id === 'infra-fetches');
    expect(infra.status).toBe('info');
    expect(infra.actual).toMatch(/robots=1/);
    const misses = card.checks.find((c) => c.id === 'discovery-misses');
    expect(misses.status).toBe('info');
  });

  test('a stall fails the no-stall check', () => {
    const card = buildQualityScorecard({
      signals: { downloads: 5, responses: 5, stalled: true, statusTaxonomy: { '200': 5 } },
    });
    expect(card.checks.find((c) => c.id === 'no-stall').status).toBe('fail');
    expect(card.verdict).toBe('FAIL');
  });

  test('missing seed host produces a host-coverage failure', () => {
    const card = buildQualityScorecard({
      signals: {
        downloads: 5, responses: 5, statusTaxonomy: { '200': 5 },
        distinctHostsFetched: 1, requestedHosts: ['a.com', 'b.com'],
      },
    });
    expect(card.checks.find((c) => c.id === 'host-coverage').status).toBe('fail');
  });

  test('targets can be overridden', () => {
    const strict = buildQualityScorecard({
      signals: { downloads: 96, responses: 100, statusTaxonomy: { '200': 96, '500': 4 } },
      targets: { success_rate: 0.99 },
    });
    expect(strict.verdict).toBe('FAIL');
    const lenient = buildQualityScorecard({
      signals: { downloads: 96, responses: 100, statusTaxonomy: { '200': 96, '500': 4 } },
      targets: { success_rate: 0.9 },
    });
    expect(lenient.verdict).toBe('PASS');
  });

  test('DEFAULT_TARGETS reflects the mission quality bar', () => {
    expect(DEFAULT_TARGETS.success_rate).toBe(0.95);
    expect(DEFAULT_TARGETS.politeness_breaches).toBe(0);
    expect(DEFAULT_TARGETS.stall).toBe(false);
  });
});

describe('quality-scorecard renderScorecardText', () => {
  test('renders a verdict line and per-check glyphs', () => {
    const card = buildQualityScorecard({
      signals: { downloads: 54, responses: 56, statusTaxonomy: { '200': 54, '500': 2 } },
      context: { url: 'theguardian.com', rung: 'small' },
    });
    const text = renderScorecardText(card);
    expect(text).toMatch(/Crawl Quality Scorecard/);
    expect(text).toMatch(/VERDICT: PASS/);
    expect(text).toMatch(/status taxonomy: 200×54\s+500×2/);
  });

  test('lists failure remedies when the crawl fails', () => {
    const card = buildQualityScorecard({ signals: { downloads: 0, responses: 0 } });
    const text = renderScorecardText(card);
    expect(text).toMatch(/VERDICT: FAIL/);
    expect(text).toMatch(/Why it failed/);
  });
});
