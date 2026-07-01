'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildGuardianHubInventory,
  buildGuardianDbPersistencePlan,
  buildGuardianSampleCrawlPlan,
  buildGuardianSampleObservabilitySummary,
  buildGuardianRuntimePatternProof,
  buildGuardianRuntimeLatestStoryProof,
  buildGuardianRuntimeSamplesFromLog,
  classifyGuardianHubUrl,
  extractGuardianHubStories,
  persistGuardianHubPatternsToStore
} = require('../../../tools/crawl/lib/guardian-place-hubs');
const { parseArgs, runCli } = require('../../../tools/crawl/guardian-place-hubs');

describe('guardian place hub helper', () => {
  test('classifies multiple Guardian place hub URL patterns', () => {
    expect(classifyGuardianHubUrl('https://www.theguardian.com/world/france')).toMatchObject({
      isHub: true,
      patternId: 'world-country',
      kind: 'country-hub',
      slug: 'france'
    });
    expect(classifyGuardianHubUrl('https://www.theguardian.com/uk-news')).toMatchObject({
      isHub: true,
      patternId: 'section-country-news',
      placeName: 'United Kingdom'
    });
    expect(classifyGuardianHubUrl('https://www.theguardian.com/world/europe-news')).toMatchObject({
      isHub: true,
      patternId: 'world-region-news'
    });
    expect(classifyGuardianHubUrl('https://www.theguardian.com/world/2026/jun/14/example-story')).toMatchObject({
      isHub: false,
      reason: 'article-date-path'
    });
  });

  test('builds no-contact inventory with multiple candidates per country', () => {
    const inventory = buildGuardianHubInventory({
      generatedAt: '2026-06-14T00:00:00.000Z',
      sampleCountries: [
        { name: 'France', slug: 'france' },
        { name: 'United Kingdom', slug: 'uk' }
      ]
    });

    expect(inventory.mode).toBe('guardian-place-hub-pattern-inventory');
    expect(inventory.actionPolicy.contactsInternetTargets).toBe(false);
    expect(inventory.proof.supportsMultiplePatternsPerSite).toBe(true);
    expect(inventory.patterns.map((p) => p.id)).toEqual(expect.arrayContaining([
      'world-country',
      'section-country-news',
      'international-world-country'
    ]));
    expect(inventory.candidates.filter((c) => c.slug === 'france').length).toBeGreaterThanOrEqual(2);
  });

  test('extracts latest Guardian article links from hub HTML and dedupes them', () => {
    const html = `
      <a href="/world/2026/jun/14/france-election-latest">France latest</a>
      <a href="https://www.theguardian.com/world/2026/jun/14/france-election-latest">Duplicate</a>
      <a href="/world/france">France hub</a>
      <a href="/uk-news/2026/jun/14/london-story">London story</a>
    `;
    const extracted = extractGuardianHubStories(html, 'https://www.theguardian.com/world/france', {
      generatedAt: '2026-06-14T00:00:00.000Z'
    });

    expect(extracted.mode).toBe('guardian-hub-story-extraction');
    expect(extracted.hub).toMatchObject({ isHub: true, patternId: 'world-country' });
    expect(extracted.stories.map((s) => s.url)).toEqual([
      'https://www.theguardian.com/world/2026/jun/14/france-election-latest',
      'https://www.theguardian.com/uk-news/2026/jun/14/london-story'
    ]);
    expect(extracted.proof.storyCount).toBe(2);
  });

  test('builds local-only small and medium sample crawl plans', () => {
    const small = buildGuardianSampleCrawlPlan({
      generatedAt: '2026-06-14T00:00:00.000Z',
      token: 'testtoken',
      size: 'small'
    });
    const medium = buildGuardianSampleCrawlPlan({
      generatedAt: '2026-06-14T00:00:00.000Z',
      token: 'testtoken',
      size: 'medium'
    });

    expect(small.sampleDb).toContain('guardian-small-place-hubs-testtoken.db');
    expect(small.command.display).toContain('node tools/crawl/run.js --local');
    expect(small.command.display).toContain('--crawl-db data/samples/guardian-small-place-hubs-testtoken.db');
    expect(small.actionPolicy.contactsRemoteCrawler).toBe(false);
    expect(small.actionPolicy.writesProductionDb).toBe(false);
    expect(medium.urls.length).toBeGreaterThan(small.urls.length);
    expect(medium.caps.maxPages).toBeGreaterThan(small.caps.maxPages);
    expect(small.proofPlan.join('\n')).toContain('persist Guardian hub URL heuristics through the DB module');
  });

  test('builds DB-module persistence plan for Guardian place hub heuristics', () => {
    const plan = buildGuardianDbPersistencePlan({
      generatedAt: '2026-06-14T00:00:00.000Z'
    });

    expect(plan.mode).toBe('guardian-place-hub-db-persistence-plan');
    expect(plan.dbModule.wrapper).toBe('src/data/db/placeHubUrlPatternsStore.js');
    expect(plan.dbModule.owner).toBe('news-crawler-db');
    expect(plan.actionPolicy.writesLocalDb).toBe(false);
    expect(plan.actionPolicy.writesLocalDbWhenApplied).toBe(true);
    expect(plan.records.map((r) => r.patternType)).toEqual(expect.arrayContaining([
      'world-country',
      'section-country-news',
      'international-world-country'
    ]));
    expect(plan.records.every((r) => r.domain === 'www.theguardian.com')).toBe(true);
    expect(plan.records.find((r) => r.patternType === 'world-country').patternRegex)
      .toBe('^https?:\\/\\/(www\\.)?theguardian\\.com\\/world\\/([a-z][a-z0-9-]+)\\/?$');
  });

  test('persists Guardian place hub heuristics through a store contract', () => {
    const saved = [];
    const result = persistGuardianHubPatternsToStore({
      savePattern(pattern) {
        const row = {
          ...pattern,
          id: saved.length + 1,
          pattern_type: pattern.patternType
        };
        saved.push(row);
        return row;
      },
      getPatternsForDomain(domain) {
        return saved.filter((row) => row.domain === domain);
      }
    }, {
      generatedAt: '2026-06-14T00:00:00.000Z'
    });

    expect(result.mode).toBe('guardian-place-hub-db-persistence-result');
    expect(result.savedCount).toBeGreaterThanOrEqual(4);
    expect(saved.map((r) => r.patternType)).toContain('world-country');
    expect(saved[0]).toHaveProperty('patternRegex');
    expect(saved[0]).toHaveProperty('placeKind');
    expect(result.readback.allExpectedPatternsPresent).toBe(true);
    expect(result.readback.patternTypes).toContain('section-country-news');
  });

  test('builds runtime proof from stored Guardian pattern predictions', () => {
    const proof = buildGuardianRuntimePatternProof({
      predictPlaceHub(url) {
        if (url.includes('/world/2026/')) {
          return { isPlaceHub: false, confidence: 0, reason: 'No match' };
        }
        const expected = classifyGuardianHubUrl(url);
        return {
          isPlaceHub: expected.isHub,
          confidence: expected.isHub ? 0.75 : 0,
          placeKind: expected.kind,
          reason: expected.isHub ? 'Matched stored pattern' : 'No match',
          pattern: expected.isHub
            ? {
              pattern_type: expected.patternId,
              pattern_regex: 'stored-runtime-regex',
              pattern_description: `Guardian ${expected.patternId}`
            }
            : null
        };
      }
    }, {
      generatedAt: '2026-06-14T00:00:00.000Z'
    });

    expect(proof.mode).toBe('guardian-place-hub-runtime-pattern-proof');
    expect(proof.actionPolicy.contactsInternetTargets).toBe(false);
    expect(proof.proof.allExpectedHubsMatchedByStoredPattern).toBe(true);
    expect(proof.proof.falseHubPredictionCount).toBe(0);
    expect(proof.predictions.find((item) => item.expected.patternId === 'world-country').runtime)
      .toMatchObject({ matchedStoredPattern: true, patternType: 'world-country' });
  });

  test('builds runtime latest-story proof from saved Guardian hub HTML', () => {
    const html = `
      <a href="/world/2026/jun/14/france-election-latest">France latest</a>
      <a href="/world/2026/jun/14/france-election-latest">Duplicate</a>
      <a href="/world/france">France hub</a>
    `;
    const proof = buildGuardianRuntimeLatestStoryProof({
      predictPlaceHub(url) {
        if (url === 'https://www.theguardian.com/world/france') {
          return {
            isPlaceHub: true,
            confidence: 0.75,
            placeKind: 'country-hub',
            reason: 'Matched pattern: Guardian country-hub URL pattern /world/{slug}',
            pattern: {
              pattern_type: 'world-country',
              pattern_regex: '^https?:\\/\\/(www\\.)?theguardian\\.com\\/world\\/([a-z][a-z0-9-]+)\\/?$'
            }
          };
        }
        return {
          isPlaceHub: false,
          confidence: 0,
          placeKind: null,
          reason: 'No matching patterns or indicators found',
          pattern: null
        };
      }
    }, {
      generatedAt: '2026-06-14T00:00:00.000Z',
      html,
      hubUrl: 'https://www.theguardian.com/world/france'
    });

    expect(proof.mode).toBe('guardian-runtime-latest-story-proof');
    expect(proof.proof).toMatchObject({
      sourceHubMatchedStoredPattern: true,
      sourcePatternType: 'world-country',
      storyCount: 1,
      runtimeLatestStoryCandidates: 1,
      articleFalsePositiveCount: 0,
      allStoriesRemainArticles: true
    });
    expect(proof.stories[0]).toMatchObject({
      url: 'https://www.theguardian.com/world/2026/jun/14/france-election-latest',
      sourcePatternId: 'world-country',
      runtimeEnqueueMetadata: {
        runtimeLatestStoryCandidate: true,
        sourcePlaceHubPatternType: 'world-country',
        latestStoryEvidenceSource: 'runtime-place-hub-link'
      }
    });
  });

  test('summarizes saved Guardian sample observability and terminal gaps', () => {
    const summary = buildGuardianSampleObservabilitySummary({
      generatedAt: '2026-06-14T00:00:00.000Z',
      size: 'medium',
      launchReport: {
        counts: { total: 2, ok: 2, failed: 0 },
        results: [
          { ok: true, startUrl: 'https://www.theguardian.com/world/france', jobId: 'job-1', body: { job: { status: 'running', startedAt: '2026-06-14T00:00:00.000Z' } } },
          { ok: true, startUrl: 'https://www.theguardian.com/uk-news', jobId: 'job-2', body: { job: { status: 'running', startedAt: '2026-06-14T00:00:01.000Z' } } }
        ]
      },
      watchLog: [
        JSON.stringify({ watchTick: { ts: '2026-06-14T00:00:05.000Z', jobs: { available: false, error: 'timeout after 1500ms' } } }),
        JSON.stringify({
          watchFinal: {
            stoppedReason: 'min-fetches-met',
            minFetchesMet: true,
            jobs: { available: false, error: 'timeout after 1500ms', counts: { total: 0, terminal: 0 } },
            jobPollErrors: 3
          }
        })
      ].join('\n'),
      sampleBefore: { downloads: 0, successResponses: 0, contentDownloads: 0, failedResponses: 0, latestFetchedAt: null },
      sampleAfter: {
        writerDb: { path: 'data/samples/guardian.db' },
        downloads: 4,
        successResponses: 4,
        contentDownloads: 1,
        failedResponses: 0,
        latestFetchedAt: '2026-06-14T00:00:10.000Z',
        dbGrowth: { urls: 10, responses: 4, successResponses: 4, content: 1 }
      },
      productionBefore: { writerDb: { path: 'data/news.db' }, downloads: 10, successResponses: 10, contentDownloads: 5, failedResponses: 1, latestFetchedAt: 'same' },
      productionAfter: { writerDb: { path: 'data/news.db' }, downloads: 10, successResponses: 10, contentDownloads: 5, failedResponses: 1, latestFetchedAt: 'same' },
      throughput: {
        evidence: { progress: { monitorVisibility: 'none', docsPerSec: 0, bytesPerSec: 0 } },
        classification: {
          label: 'throughput-attributed',
          primary: 'monitor-visibility',
          factors: [{ id: 'network-latency', status: 'unknown' }]
        }
      },
      runtimeProof: { proof: { storedPatternMatches: 4, expectedHubCount: 4, allExpectedHubsMatchedByStoredPattern: true, falseHubPredictionCount: 0 } },
      extraction: { source: 'saved-fixture', hub: { patternId: 'world-country' }, stories: [{ freshness: { status: 'unknown' } }], proof: { storyCount: 1 }, rejectedCount: 2 }
    });

    expect(summary.mode).toBe('guardian-sample-observability-summary');
    expect(summary.launch.accepted).toBe(2);
    expect(summary.watch.terminalEvidence).toMatchObject({
      state: 'endpoint-unavailable',
      status: 'partial'
    });
    expect(summary.dbProof).toMatchObject({
      dbProofMet: true,
      productionZeroDelta: true
    });
    expect(summary.runtimePlaceHubs.allExpectedHubsMatchedByStoredPattern).toBe(true);
    expect(summary.latestStoryExtraction.storyCount).toBe(1);
    expect(summary.classification.partial.terminalJobEvidence).toBe(true);
  });

  test('summarizes Guardian throughput inputs from meter fetch and limiter samples', () => {
    const summary = buildGuardianSampleObservabilitySummary({
      generatedAt: '2026-06-14T00:05:00.000Z',
      size: 'small',
      launchReport: {
        startedAt: '2026-06-14T00:00:00.000Z',
        finishedAt: '2026-06-14T00:00:02.000Z',
        counts: { total: 1, ok: 1, failed: 0 },
        results: [
          { ok: true, startUrl: 'https://www.theguardian.com/world/france', jobId: 'job-1', body: { job: { status: 'running' } } }
        ]
      },
      watchLog: [
        JSON.stringify({ watchTick: { ts: '2026-06-14T00:00:04.000Z' } }),
        JSON.stringify({ watchTick: { ts: '2026-06-14T00:00:34.000Z' } }),
        JSON.stringify({ watchFinal: { stoppedReason: 'min-fetches-met', minFetchesMet: true, jobs: null, jobPollErrors: 0 } })
      ].join('\n'),
      sampleBefore: { generatedAt: '2026-06-14T00:00:00.000Z', downloads: 0, successResponses: 0, contentDownloads: 0, failedResponses: 0, latestFetchedAt: null },
      sampleAfter: {
        generatedAt: '2026-06-14T00:01:00.000Z',
        writerDb: { path: 'data/samples/guardian.db' },
        downloads: 2,
        successResponses: 2,
        contentDownloads: 1,
        failedResponses: 0,
        latestFetchedAt: '2026-06-14T00:00:58.000Z',
        elapsedSec: 60,
        elapsedSource: 'db-latest-fetched-delta',
        throughput: { docsPerSec: 0.033, bytesPerSec: 1200 },
        dbGrowth: { urls: 5, responses: 2, successResponses: 2, content: 1 }
      },
      productionBefore: { generatedAt: '2026-06-14T00:00:00.000Z', downloads: 10, successResponses: 10, contentDownloads: 5, failedResponses: 0, latestFetchedAt: 'same' },
      productionAfter: { generatedAt: '2026-06-14T00:01:00.000Z', downloads: 10, successResponses: 10, contentDownloads: 5, failedResponses: 0, latestFetchedAt: 'same' },
      meterSamples: [
        { docs: 2, bytes: 72000, docsPerSec: 0.033, bytesPerSec: 1200 }
      ],
      fetchSamples: [
        {
          httpStatus: 200,
          ttfbMs: 120,
          downloadMs: 380,
          totalMs: 500,
          bytesDownloaded: 72000,
          freshness: { status: 'new', conditional: true, avoidedDownload: false }
        },
        {
          httpStatus: 304,
          ttfbMs: 80,
          downloadMs: 20,
          totalMs: 100,
          bytesDownloaded: 0,
          freshness: { status: 'unchanged', conditional: true, avoidedDownload: true }
        }
      ],
      limiterSnapshots: [
        { crawlDelaySeconds: 2, politenessFloorMs: 2000, lastHttpStatus: 200 }
      ]
    });

    expect(summary.timing).toMatchObject({
      launchDurationSec: 2,
      watchObservedSec: 30,
      sampleSnapshotDeltaSec: 60,
      monitorElapsedSec: 60,
      monitorElapsedSource: 'db-latest-fetched-delta'
    });
    expect(summary.throughput.source).toBe('built-from-summary-inputs');
    expect(summary.throughput.meter.samples).toBe(1);
    expect(summary.throughput.fetches.count).toBe(2);
    expect(summary.throughput.fetches.freshness).toMatchObject({
      new: 1,
      unchanged: 1,
      conditional: 2,
      avoidedDownloads: 1
    });
    expect(summary.throughput.limiter).toMatchObject({
      samples: 1,
      crawlDelaySeconds: 2,
      politenessFloorMs: 2000
    });
    expect(summary.throughput.unknownFactors).not.toContain('robots-politeness-floor');
    expect(summary.throughput.unknownFactors).not.toContain('network-latency');
    expect(summary.throughput.unknownFactors).not.toContain('freshness-cache');
  });

  test('extracts runtime fetch limiter and latest-story samples from PAGE logs', () => {
    const payload = {
      url: 'https://www.theguardian.com/world/france',
      source: 'network',
      status: 'success',
      httpStatus: 200,
      totalMs: 480,
      downloadMs: 320,
      bytesDownloaded: 8192,
      freshness: { status: 'new', conditional: false },
      limiterSnapshot: {
        host: 'www.theguardian.com',
        politenessFloorMs: 2000,
        crawlDelaySeconds: 2,
        lastHttpStatus: 200
      },
      runtimeLatestStoryExtraction: {
        evidenceSource: 'runtime-page-log',
        sourcePlaceHub: 'https://www.theguardian.com/world/france',
        sourcePlaceHubPatternType: 'world-country',
        candidateCount: 1,
        candidates: [
          {
            url: 'https://www.theguardian.com/world/2026/jun/14/france-story',
            sourcePlaceHubPatternType: 'world-country',
            latestStoryEvidenceSource: 'runtime-place-hub-link'
          }
        ]
      }
    };

    const samples = buildGuardianRuntimeSamplesFromLog(`noise\nPAGE ${JSON.stringify(payload)}\n`, {
      generatedAt: '2026-06-14T00:10:00.000Z',
      source: 'tmp/watch.log'
    });

    expect(samples.mode).toBe('guardian-runtime-samples');
    expect(samples.counts).toMatchObject({
      pageEvents: 1,
      fetchSamples: 1,
      limiterSnapshots: 1,
      runtimeLatestStoryCandidates: 1
    });
    expect(samples.fetchSamples[0]).toMatchObject({
      httpStatus: 200,
      totalMs: 480,
      bytesDownloaded: 8192,
      freshness: { status: 'new' }
    });
    expect(samples.limiterSnapshots[0]).toMatchObject({
      politenessFloorMs: 2000,
      crawlDelaySeconds: 2
    });
    expect(samples.runtimeLatestStoryExtraction.candidates[0]).toMatchObject({
      url: 'https://www.theguardian.com/world/2026/jun/14/france-story',
      evidenceSource: 'runtime-page-log'
    });
  });

  test('CLI writes inventory artifact', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-hubs-'));
    const out = path.join(dir, 'inventory.json');
    try {
      const logs = [];
      const originalLog = console.log;
      console.log = (line) => logs.push(line);
      try {
        expect(parseArgs(['inventory', '--out', out, '--json']).mode).toBe('inventory');
        expect(runCli(['inventory', '--out', out, '--json'])).toBe(0);
      } finally {
        console.log = originalLog;
      }
      expect(JSON.parse(fs.readFileSync(out, 'utf8')).mode).toBe('guardian-place-hub-pattern-inventory');
      expect(JSON.parse(logs.join('\n')).host).toBe('www.theguardian.com');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
