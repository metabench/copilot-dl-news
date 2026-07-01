'use strict';

const fs = require('fs');
const path = require('path');

const { buildThroughputAnalysis } = require('./throughput-analyzer');

const GUARDIAN_HOST = 'www.theguardian.com';

const MONTHS_RE = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)';

const GUARDIAN_HUB_PATTERNS = [
  {
    id: 'world-region-news',
    kind: 'region-hub',
    template: '/world/{slug}-news',
    regex: /^\/world\/([a-z][a-z0-9-]+)-news\/?$/i,
    examples: ['/world/europe-news', '/world/middle-east-news']
  },
  {
    id: 'world-country',
    kind: 'country-hub',
    template: '/world/{slug}',
    regex: /^\/world\/([a-z][a-z0-9-]+)\/?$/i,
    examples: ['/world/france', '/world/germany', '/world/japan']
  },
  {
    id: 'section-country-news',
    kind: 'country-hub',
    template: '/{slug}-news',
    regex: /^\/([a-z][a-z0-9-]+)-news\/?$/i,
    aliases: {
      uk: 'United Kingdom',
      us: 'United States',
      australia: 'Australia'
    },
    examples: ['/uk-news', '/us-news', '/australia-news']
  },
  {
    id: 'international-world-country',
    kind: 'country-hub',
    template: '/international/world/{slug}',
    regex: /^\/international\/world\/([a-z][a-z0-9-]+)\/?$/i,
    examples: ['/international/world/france', '/international/world/japan']
  }
];

function normalizeGuardianUrl(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const url = value.includes('://')
      ? new URL(value)
      : new URL(value.startsWith('/') ? `https://${GUARDIAN_HOST}${value}` : `https://${GUARDIAN_HOST}/${value}`);
    if (url.hostname === 'theguardian.com') url.hostname = GUARDIAN_HOST;
    url.hash = '';
    return url;
  } catch (_) {
    return null;
  }
}

function isGuardianArticlePath(pathname) {
  const re = new RegExp(`/(\\d{4})/${MONTHS_RE}/(\\d{1,2})/[^/]+/?$`, 'i');
  return re.test(pathname || '');
}

function classifyGuardianHubUrl(value) {
  const url = normalizeGuardianUrl(value);
  if (!url) return { isGuardian: false, isHub: false, reason: 'invalid-url' };
  const host = url.hostname.toLowerCase();
  if (host !== GUARDIAN_HOST) {
    return { isGuardian: false, isHub: false, url: url.href, reason: 'not-guardian-host' };
  }
  if (isGuardianArticlePath(url.pathname)) {
    return { isGuardian: true, isHub: false, url: url.href, reason: 'article-date-path' };
  }
  for (const pattern of GUARDIAN_HUB_PATTERNS) {
    const match = pattern.regex.exec(url.pathname);
    if (!match) continue;
    const slug = match[1].toLowerCase();
    const placeName = pattern.aliases?.[slug] || slug.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    return {
      isGuardian: true,
      isHub: true,
      url: url.href,
      patternId: pattern.id,
      kind: pattern.kind,
      slug,
      placeName,
      reason: `matched ${pattern.id}`
    };
  }
  return { isGuardian: true, isHub: false, url: url.href, reason: 'no-hub-pattern-match' };
}

function extractHrefLinks(html, baseUrl) {
  if (!html || typeof html !== 'string') return [];
  const links = [];
  const re = /<a\b[^>]*\bhref=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html))) {
    const rawHref = match[2];
    const text = String(match[3] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    try {
      const url = new URL(rawHref, baseUrl);
      url.hash = '';
      links.push({ url: url.href, path: url.pathname, text });
    } catch (_) {
      // ignore invalid links
    }
  }
  return links;
}

function extractGuardianHubStories(html, baseUrl, options = {}) {
  const limit = Math.max(1, Number(options.limit) || 25);
  const hub = classifyGuardianHubUrl(baseUrl);
  const seen = new Set();
  const stories = [];
  const rejected = [];

  for (const link of extractHrefLinks(html, baseUrl)) {
    const url = normalizeGuardianUrl(link.url);
    if (!url || url.hostname !== GUARDIAN_HOST) {
      rejected.push({ url: link.url, reason: 'external-or-invalid' });
      continue;
    }
    if (!isGuardianArticlePath(url.pathname)) {
      rejected.push({ url: url.href, reason: 'not-article-date-path' });
      continue;
    }
    if (seen.has(url.href)) {
      rejected.push({ url: url.href, reason: 'duplicate' });
      continue;
    }
    seen.add(url.href);
    stories.push({
      url: url.href,
      path: url.pathname,
      title: link.text,
      sourceHub: hub.url || normalizeGuardianUrl(baseUrl)?.href || baseUrl,
      sourcePatternId: hub.patternId || null,
      freshness: {
        status: 'unknown',
        proof: 'hub-link-extraction-only'
      }
    });
    if (stories.length >= limit) break;
  }

  return {
    schemaVersion: 1,
    mode: 'guardian-hub-story-extraction',
    generatedAt: options.generatedAt || new Date().toISOString(),
    hub,
    stories,
    rejectedCount: rejected.length,
    rejectedSample: rejected.slice(0, 10),
    proof: {
      extractor: 'guardian-date-path-links',
      dedupeKey: 'absolute-url',
      storyCount: stories.length
    }
  };
}

function buildGuardianHubInventory(options = {}) {
  const sampleCountries = options.sampleCountries || [
    { name: 'France', slug: 'france' },
    { name: 'Germany', slug: 'germany' },
    { name: 'Japan', slug: 'japan' },
    { name: 'India', slug: 'india' },
    { name: 'Brazil', slug: 'brazil' },
    { name: 'United Kingdom', slug: 'uk' },
    { name: 'United States', slug: 'us' },
    { name: 'Australia', slug: 'australia' }
  ];
  const candidates = [];
  for (const country of sampleCountries) {
    for (const pattern of GUARDIAN_HUB_PATTERNS) {
      if (pattern.id === 'world-region-news') continue;
      const pathValue = pattern.template.replace('{slug}', country.slug);
      const url = `https://${GUARDIAN_HOST}${pathValue}`;
      const classification = classifyGuardianHubUrl(url);
      candidates.push({
        placeName: country.name,
        slug: country.slug,
        url,
        patternId: pattern.id,
        kind: pattern.kind,
        classification
      });
    }
  }
  return {
    schemaVersion: 1,
    mode: 'guardian-place-hub-pattern-inventory',
    generatedAt: options.generatedAt || new Date().toISOString(),
    host: GUARDIAN_HOST,
    actionPolicy: {
      startsCrawler: false,
      contactsRemoteCrawler: false,
      contactsInternetTargets: false,
      writesLocalDb: false,
      writesProductionDb: false,
      mutatesRemoteQueue: false
    },
    patterns: GUARDIAN_HUB_PATTERNS.map((p) => ({
      id: p.id,
      kind: p.kind,
      template: p.template,
      examples: p.examples,
      aliases: p.aliases || null
    })),
    candidates,
    proof: {
      supportsMultiplePatternsPerSite: true,
      countryAliases: ['uk', 'us', 'australia'],
      latestStoryExtractor: 'guardian-date-path-links'
    }
  };
}

function patternToDbRecord(pattern) {
  const pathSource = pattern.regex.source.replace(/^\^/, '').replace(/\$$/, '');
  const runtimeRegex = `^https?:\\/\\/(www\\.)?theguardian\\.com${pathSource}$`;
  return {
    domain: GUARDIAN_HOST,
    patternType: pattern.id,
    patternRegex: runtimeRegex,
    patternDescription: `Guardian ${pattern.kind} URL pattern ${pattern.template}`,
    placeKind: pattern.kind,
    sampleCount: Array.isArray(pattern.examples) ? pattern.examples.length : 0,
    exampleUrls: (pattern.examples || []).map((example) => `https://${GUARDIAN_HOST}${example}`),
    accuracy: 0.75
  };
}

function buildGuardianRuntimePatternProof(learningService, options = {}) {
  if (!learningService || typeof learningService.predictPlaceHub !== 'function') {
    throw new Error('PlaceHubPatternLearningService-compatible predictor is required');
  }
  const inventory = options.inventory || buildGuardianHubInventory(options);
  const candidateUrls = options.candidateUrls || [
    'https://www.theguardian.com/world/france',
    'https://www.theguardian.com/world/germany',
    'https://www.theguardian.com/uk-news',
    'https://www.theguardian.com/international/world/japan',
    'https://www.theguardian.com/world/2026/jun/14/not-a-hub-story'
  ];
  const predictions = candidateUrls.map((url) => {
    const expected = classifyGuardianHubUrl(url);
    const runtimePrediction = learningService.predictPlaceHub(url, GUARDIAN_HOST) || {};
    const pattern = runtimePrediction.pattern || null;
    return {
      url,
      expected: {
        isHub: expected.isHub,
        patternId: expected.patternId || null,
        kind: expected.kind || null,
        reason: expected.reason
      },
      runtime: {
        isPlaceHub: Boolean(runtimePrediction.isPlaceHub),
        confidence: runtimePrediction.confidence || 0,
        placeKind: runtimePrediction.placeKind || null,
        reason: runtimePrediction.reason || null,
        matchedStoredPattern: Boolean(pattern),
        patternType: pattern?.pattern_type || runtimePrediction.patternType || null,
        patternRegex: pattern?.pattern_regex || null
      }
    };
  });
  const hubPredictions = predictions.filter((item) => item.expected.isHub);
  const nonHubPredictions = predictions.filter((item) => !item.expected.isHub);
  const storedPatternMatches = predictions.filter((item) => item.runtime.matchedStoredPattern).length;
  const missedExpectedHubs = hubPredictions.filter((item) => {
    return !item.runtime.isPlaceHub || item.runtime.patternType !== item.expected.patternId;
  });
  const falseHubPredictions = nonHubPredictions.filter((item) => item.runtime.isPlaceHub);
  return {
    schemaVersion: 1,
    mode: 'guardian-place-hub-runtime-pattern-proof',
    generatedAt: options.generatedAt || new Date().toISOString(),
    host: GUARDIAN_HOST,
    actionPolicy: {
      startsCrawler: false,
      contactsRemoteCrawler: false,
      contactsInternetTargets: false,
      writesLocalDb: Boolean(options.writesLocalDb),
      writesProductionDb: false,
      mutatesRemoteQueue: false
    },
    runtimePath: {
      persistence: 'src/data/db/placeHubUrlPatternsStore.js -> news-crawler-db',
      predictor: 'src/services/PlaceHubPatternLearningService.predictPlaceHub',
      pageUse: 'src/core/crawler/PageExecutionService enqueues predicted place hubs with metadata'
    },
    inventoryProof: {
      patternCount: inventory.patterns.length,
      candidateCount: inventory.candidates.length,
      supportsMultiplePatternsPerSite: inventory.proof.supportsMultiplePatternsPerSite
    },
    predictions,
    proof: {
      candidateCount: predictions.length,
      expectedHubCount: hubPredictions.length,
      storedPatternMatches,
      allExpectedHubsMatchedByStoredPattern: missedExpectedHubs.length === 0,
      falseHubPredictionCount: falseHubPredictions.length,
      missedExpectedHubs
    }
  };
}

function compactPlaceHubPrediction(prediction) {
  if (!prediction || typeof prediction !== 'object') {
    return {
      isPlaceHub: false,
      confidence: 0,
      placeKind: null,
      reason: 'prediction-unavailable',
      matchedStoredPattern: false,
      patternType: null,
      patternRegex: null
    };
  }
  const pattern = prediction.pattern || null;
  return {
    isPlaceHub: Boolean(prediction.isPlaceHub),
    confidence: prediction.confidence || 0,
    placeKind: prediction.placeKind || null,
    reason: prediction.reason || null,
    matchedStoredPattern: Boolean(pattern),
    patternType: pattern?.pattern_type || pattern?.patternType || null,
    patternRegex: pattern?.pattern_regex || pattern?.patternRegex || null
  };
}

function buildGuardianRuntimeLatestStoryProof(learningService, options = {}) {
  if (!learningService || typeof learningService.predictPlaceHub !== 'function') {
    throw new Error('PlaceHubPatternLearningService-compatible predictor is required');
  }
  const hubUrl = options.hubUrl || 'https://www.theguardian.com/world/france';
  const html = options.html || '';
  const extraction = options.extraction || extractGuardianHubStories(html, hubUrl, options);
  const sourcePrediction = compactPlaceHubPrediction(learningService.predictPlaceHub(hubUrl, GUARDIAN_HOST));
  const stories = (extraction.stories || []).map((story) => {
    const articlePrediction = compactPlaceHubPrediction(learningService.predictPlaceHub(story.url, GUARDIAN_HOST));
    return {
      url: story.url,
      path: story.path,
      title: story.title || null,
      sourceHub: story.sourceHub || hubUrl,
      sourcePatternId: story.sourcePatternId || sourcePrediction.patternType || null,
      freshness: story.freshness || { status: 'unknown' },
      runtimeArticlePrediction: articlePrediction,
      runtimeEnqueueMetadata: sourcePrediction.isPlaceHub && !articlePrediction.isPlaceHub
        ? {
          runtimeLatestStoryCandidate: true,
          latestStoryEvidenceSource: 'runtime-place-hub-link',
          sourcePlaceHub: hubUrl,
          sourcePlaceHubPredicted: true,
          sourcePlaceHubConfidence: sourcePrediction.confidence,
          sourcePlaceHubKind: sourcePrediction.placeKind,
          sourcePlaceHubReason: sourcePrediction.reason,
          sourcePlaceHubPatternType: sourcePrediction.patternType,
          sourcePlaceHubPatternRegex: sourcePrediction.patternRegex
        }
        : null
    };
  });
  const articleFalsePositiveCount = stories.filter((story) => story.runtimeArticlePrediction.isPlaceHub).length;
  return {
    schemaVersion: 1,
    mode: 'guardian-runtime-latest-story-proof',
    generatedAt: options.generatedAt || new Date().toISOString(),
    host: GUARDIAN_HOST,
    actionPolicy: {
      startsCrawler: false,
      contactsRemoteCrawler: false,
      contactsInternetTargets: false,
      writesLocalDb: Boolean(options.writesLocalDb),
      writesProductionDb: false,
      mutatesRemoteQueue: false
    },
    sourceHub: {
      url: hubUrl,
      extractedHub: extraction.hub || classifyGuardianHubUrl(hubUrl),
      runtimePrediction: sourcePrediction
    },
    extraction: {
      source: options.evidenceSource || 'saved-fixture',
      extractor: extraction.proof?.extractor || 'guardian-date-path-links',
      dedupeKey: extraction.proof?.dedupeKey || 'absolute-url',
      storyCount: stories.length,
      rejectedCount: extraction.rejectedCount || 0,
      freshnessStatuses: [...new Set(stories.map((story) => story.freshness?.status || 'unknown'))]
    },
    stories,
    proof: {
      sourceHubMatchedStoredPattern: sourcePrediction.matchedStoredPattern,
      sourcePatternType: sourcePrediction.patternType,
      storyCount: stories.length,
      runtimeLatestStoryCandidates: stories.filter((story) => story.runtimeEnqueueMetadata?.runtimeLatestStoryCandidate).length,
      articleFalsePositiveCount,
      allStoriesRemainArticles: articleFalsePositiveCount === 0,
      evidenceSource: options.evidenceSource || 'saved-fixture'
    },
    classification: {
      label: sourcePrediction.matchedStoredPattern && stories.length > 0 && articleFalsePositiveCount === 0
        ? 'runtime-latest-story-proof-ready'
        : 'runtime-latest-story-proof-partial',
      partial: {
        savedFixtureEvidence: (options.evidenceSource || 'saved-fixture') !== 'runtime-live-sample',
        freshnessUnknown: stories.some((story) => (story.freshness?.status || 'unknown') === 'unknown')
      },
      nextSafestAction: 'capture the same latest-story metadata from a bounded Guardian small sample when runtime logging is available'
    }
  };
}

function buildGuardianDbPersistencePlan(options = {}) {
  const inventory = options.inventory || buildGuardianHubInventory(options);
  const records = GUARDIAN_HUB_PATTERNS.map(patternToDbRecord);
  return {
    schemaVersion: 1,
    mode: 'guardian-place-hub-db-persistence-plan',
    generatedAt: options.generatedAt || new Date().toISOString(),
    host: GUARDIAN_HOST,
    actionPolicy: {
      startsCrawler: false,
      contactsRemoteCrawler: false,
      contactsInternetTargets: false,
      writesLocalDb: false,
      writesLocalDbWhenApplied: true,
      writesProductionDb: false,
      mutatesRemoteQueue: false
    },
    dbModule: {
      wrapper: 'src/data/db/placeHubUrlPatternsStore.js',
      owner: 'news-crawler-db',
      method: 'createPlaceHubUrlPatternsStore(db).savePattern(pattern)'
    },
    inventoryProof: {
      patternCount: inventory.patterns.length,
      candidateCount: inventory.candidates.length,
      supportsMultiplePatternsPerSite: inventory.proof.supportsMultiplePatternsPerSite
    },
    records,
    proofPlan: [
      'open isolated sample DB with src/db/openNewsCrawlerDb.js',
      'create store with src/data/db/placeHubUrlPatternsStore.js',
      'save each Guardian pattern through store.savePattern',
      'read back getPatternsForDomain(www.theguardian.com) and require all pattern IDs',
      'do not write production data/news.db unless explicitly requested'
    ]
  };
}

function persistGuardianHubPatternsToStore(store, options = {}) {
  if (!store || typeof store.savePattern !== 'function') {
    throw new Error('place-hub URL pattern store with savePattern(pattern) is required');
  }
  const plan = options.plan || buildGuardianDbPersistencePlan(options);
  const saved = [];
  for (const record of plan.records) {
    saved.push(store.savePattern(record));
  }
  const readbackDomain = options.readbackDomain || GUARDIAN_HOST;
  const readback = typeof store.getPatternsForDomain === 'function'
    ? store.getPatternsForDomain(readbackDomain, { minAccuracy: 0, limit: 50 })
    : null;
  const expectedTypes = new Set(plan.records.map((record) => record.patternType));
  const readbackTypes = new Set((readback || []).map((record) => record.pattern_type || record.patternType));
  const missingPatternTypes = [...expectedTypes].filter((type) => !readbackTypes.has(type));
  return {
    schemaVersion: 1,
    mode: 'guardian-place-hub-db-persistence-result',
    generatedAt: options.generatedAt || new Date().toISOString(),
    host: GUARDIAN_HOST,
    actionPolicy: {
      startsCrawler: false,
      contactsRemoteCrawler: false,
      contactsInternetTargets: false,
      writesLocalDb: true,
      writesProductionDb: false,
      mutatesRemoteQueue: false
    },
    attempted: plan.records.length,
    savedCount: saved.filter(Boolean).length,
    readback: readback
      ? {
        domain: readbackDomain,
        count: readback.length,
        patternTypes: [...readbackTypes],
        missingPatternTypes,
        allExpectedPatternsPresent: missingPatternTypes.length === 0
      }
      : {
        domain: readbackDomain,
        available: false,
        reason: 'store-getPatternsForDomain-unavailable'
      },
    saved
  };
}

function buildGuardianSampleCrawlPlan(options = {}) {
  const size = options.size === 'medium' ? 'medium' : 'small';
  const token = options.token || new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 12);
  const sampleDb = options.sampleDb || `data/samples/guardian-${size}-place-hubs-${token}.db`;
  const urls = options.urls || (size === 'medium'
    ? [
      'https://www.theguardian.com/world/france',
      'https://www.theguardian.com/world/germany',
      'https://www.theguardian.com/world/japan',
      'https://www.theguardian.com/uk-news'
    ]
    : [
      'https://www.theguardian.com/world/france',
      'https://www.theguardian.com/uk-news'
    ]);
  const maxPages = Number(options.maxPages) || (size === 'medium' ? 16 : 6);
  const maxDepth = Number(options.maxDepth) || 1;
  const concurrency = Number(options.concurrency) || 1;
  const meterSamples = options.meterSamples || `tmp/guardian-${size}-place-hubs-${token}-meter.jsonl`;
  const display = [
    'CRAWL_RUN_SERVER_READY_TIMEOUT_MS=120000',
    'node tools/crawl/run.js --local',
    `--crawl-db ${sampleDb}`,
    `--db ${sampleDb}`,
    '--profile gentle',
    `--max-pages ${maxPages}`,
    `--max-depth ${maxDepth}`,
    `--concurrency ${concurrency}`,
    '--batch-concurrency 1',
    '--batch-retries 0',
    '--batch-request-timeout-ms 60000',
    '--per-domain-interval-ms 2000',
    '--watch --watch-timeout 900',
    '--watch-min-fetches 1',
    '--launch-timeout 180',
    '--no-output-timeout 180',
    '--auto-stop',
    `--meter --meter-samples-out ${meterSamples} --json`,
    urls.join(',')
  ].join(' ');
  return {
    schemaVersion: 1,
    mode: 'guardian-place-hub-sample-crawl-plan',
    generatedAt: options.generatedAt || new Date().toISOString(),
    size,
    host: GUARDIAN_HOST,
    urls,
    sampleDb,
    productionDb: 'data/news.db',
    artifacts: {
      meterSamples,
      runtimeSamples: `tmp/guardian-${size}-place-hubs-${token}-runtime-samples.json`,
      throughputAnalysis: `tmp/guardian-${size}-place-hubs-${token}-throughput-analysis.json`,
      sampleSummary: `tmp/guardian-${size}-place-hubs-${token}-summary.json`
    },
    caps: { maxPages, maxDepth, concurrency, batchConcurrency: 1 },
    command: { display },
    actionPolicy: {
      startsCrawler: false,
      contactsInternetTargetsWhenExecuted: true,
      writesSampleDbWhenExecuted: true,
      writesProductionDb: false,
      contactsRemoteCrawler: false,
      mutatesRemoteQueue: false
    },
    proofPlan: [
      'persist Guardian hub URL heuristics through the DB module before live proof',
      'use explicit launch/no-output budgets so quiet startup is classified by watch, not killed early',
      'snapshot production data/news.db before/after and require zero delta',
      'snapshot isolated sample DB before/after and require response growth',
      'save launch/watch/progress/throughput artifacts',
      'extract latest Guardian story links from crawled hub pages where available'
    ]
  };
}

function parseJsonLinesFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const records = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch (_) {
      // ignore non-JSON status lines
    }
  }
  return records;
}

function parsePagePayloadsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const payloads = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('PAGE ')) continue;
    const body = trimmed.slice('PAGE '.length).trim();
    if (!body.startsWith('{')) continue;
    try {
      const payload = JSON.parse(body);
      if (payload && typeof payload === 'object') payloads.push(payload);
    } catch (_) {
      // ignore terse PAGE lines and malformed fragments
    }
  }
  return payloads;
}

function compactFetchSample(page) {
  if (!page || typeof page !== 'object') return null;
  return {
    url: page.url || null,
    source: page.source || null,
    status: page.status || null,
    httpStatus: page.httpStatus ?? null,
    ttfbMs: page.ttfbMs ?? null,
    downloadMs: page.downloadMs ?? null,
    totalMs: page.totalMs ?? null,
    bytesDownloaded: page.bytesDownloaded ?? null,
    freshness: page.freshness || null,
    cache: page.cacheReason || page.cacheSource
      ? {
        reason: page.cacheReason || null,
        source: page.cacheSource || null,
        ageSeconds: page.cacheAgeSeconds ?? null
      }
      : null
  };
}

function buildGuardianRuntimeSamplesFromLog(text, options = {}) {
  const pages = parsePagePayloadsFromText(text);
  const fetchSamples = pages.map(compactFetchSample).filter(Boolean);
  const limiterSnapshots = pages.map((page) => page.limiterSnapshot).filter(Boolean);
  const runtimeExtractions = pages
    .map((page) => ({
      pageUrl: page.url || null,
      extraction: page.runtimeLatestStoryExtraction || null
    }))
    .filter((item) => item.extraction && Number(item.extraction.candidateCount || 0) > 0);
  const candidates = [];
  const seen = new Set();
  for (const item of runtimeExtractions) {
    for (const candidate of item.extraction.candidates || []) {
      if (!candidate?.url || seen.has(candidate.url)) continue;
      seen.add(candidate.url);
      candidates.push({
        ...candidate,
        pageUrl: item.pageUrl,
        evidenceSource: item.extraction.evidenceSource || candidate.latestStoryEvidenceSource || 'runtime-page-log'
      });
    }
  }
  return {
    schemaVersion: 1,
    mode: 'guardian-runtime-samples',
    generatedAt: options.generatedAt || new Date().toISOString(),
    source: options.source || null,
    host: GUARDIAN_HOST,
    actionPolicy: {
      readOnlyReport: true,
      startsCrawler: false,
      contactsRemoteCrawler: false,
      contactsInternetTargets: false,
      writesLocalDb: false,
      writesProductionDb: false,
      mutatesRemoteQueue: false
    },
    counts: {
      pageEvents: pages.length,
      fetchSamples: fetchSamples.length,
      limiterSnapshots: limiterSnapshots.length,
      runtimeExtractionPages: runtimeExtractions.length,
      runtimeLatestStoryCandidates: candidates.length
    },
    pageEvents: pages,
    fetchSamples,
    limiterSnapshots,
    runtimeLatestStoryExtraction: {
      source: 'runtime-page-log',
      pages: runtimeExtractions,
      candidates
    },
    classification: {
      label: pages.length && (fetchSamples.length || limiterSnapshots.length || candidates.length)
        ? 'runtime-samples-ready'
        : 'runtime-samples-empty',
      proven: {
        fetchSamples: fetchSamples.length > 0,
        limiterSnapshots: limiterSnapshots.length > 0,
        runtimeLatestStoryMetadata: candidates.length > 0
      },
      partial: {
        meterSamples: true
      },
      nextSafestAction: candidates.length
        ? 'feed runtime samples into Guardian sample-summary and throughput analyzer'
        : 'rerun a bounded Guardian small sample with verbose PAGE JSON output'
    }
  };
}

function summarizeTerminalEvidence(watchFinal) {
  if (!watchFinal) {
    return {
      state: 'unknown',
      status: 'unknown',
      reason: 'watch-final-unavailable'
    };
  }
  if (watchFinal.terminalWait) {
    const outcome = watchFinal.terminalWait.outcome || watchFinal.terminalWait.state || null;
    return {
      state: outcome || 'unknown',
      status: outcome === 'terminal' ? 'proven' : 'partial',
      reason: watchFinal.terminalWait.reason || 'terminal-wait-recorded',
      evidence: watchFinal.terminalWait
    };
  }
  if (watchFinal.jobs === null) {
    return {
      state: 'not-observed',
      status: 'partial',
      reason: 'watch-stopped-at-db-proof-before-job-snapshot'
    };
  }
  if (watchFinal.jobs && watchFinal.jobs.available === false) {
    return {
      state: 'endpoint-unavailable',
      status: 'partial',
      reason: watchFinal.jobs.error || 'job-endpoint-unavailable',
      counts: watchFinal.jobs.counts || null,
      pollErrors: watchFinal.jobPollErrors || 0
    };
  }
  if (watchFinal.jobs && watchFinal.jobs.available) {
    const counts = watchFinal.jobs.counts || {};
    const total = counts.total || 0;
    const terminal = counts.terminal || 0;
    return {
      state: total > 0 && terminal >= total ? 'terminal' : 'non-terminal',
      status: total > 0 && terminal >= total ? 'proven' : 'partial',
      reason: total > 0 && terminal >= total ? 'all-observed-jobs-terminal' : 'some-jobs-not-terminal',
      counts,
      pollErrors: watchFinal.jobPollErrors || 0
    };
  }
  return {
    state: 'not-requested',
    status: 'partial',
    reason: 'terminal-wait-not-requested',
    pollErrors: watchFinal.jobPollErrors || 0
  };
}

function deltaFromSnapshots(before, after) {
  if (!before || !after) return null;
  return {
    downloads: (after.downloads || 0) - (before.downloads || 0),
    successResponses: (after.successResponses || 0) - (before.successResponses || 0),
    failedResponses: (after.failedResponses || 0) - (before.failedResponses || 0),
    contentDownloads: (after.contentDownloads || 0) - (before.contentDownloads || 0),
    latestFetchedAtChanged: before.latestFetchedAt !== after.latestFetchedAt
  };
}

function parseTimeMs(value) {
  if (!value || typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function elapsedSeconds(start, end) {
  const startMs = parseTimeMs(start);
  const endMs = parseTimeMs(end);
  if (startMs == null || endMs == null || endMs < startMs) return null;
  return Math.round((endMs - startMs) / 100) / 10;
}

function summarizeArtifactTiming({ launch, watchTicks, watchFinal, sampleBefore, sampleAfter, productionBefore, productionAfter }) {
  const launchStartedAt = launch?.startedAt || launch?.generatedAt || null;
  const launchFinishedAt = launch?.finishedAt || null;
  const firstWatchAt = watchTicks.find((tick) => tick?.ts)?.ts || null;
  const lastWatchAt = [...watchTicks].reverse().find((tick) => tick?.ts)?.ts || watchFinal?.ts || null;
  const sampleBeforeAt = sampleBefore?.generatedAt || sampleBefore?.createdAt || null;
  const sampleAfterAt = sampleAfter?.generatedAt || sampleAfter?.createdAt || null;
  const productionBeforeAt = productionBefore?.generatedAt || productionBefore?.createdAt || null;
  const productionAfterAt = productionAfter?.generatedAt || productionAfter?.createdAt || null;
  return {
    launchStartedAt,
    launchFinishedAt,
    launchDurationSec: elapsedSeconds(launchStartedAt, launchFinishedAt),
    firstWatchAt,
    lastWatchAt,
    watchObservedSec: elapsedSeconds(firstWatchAt, lastWatchAt),
    sampleSnapshotDeltaSec: elapsedSeconds(sampleBeforeAt, sampleAfterAt),
    productionSnapshotDeltaSec: elapsedSeconds(productionBeforeAt, productionAfterAt),
    monitorElapsedSec: sampleAfter?.elapsedSec ?? null,
    monitorElapsedSource: sampleAfter?.elapsedSource || null
  };
}

function compactThroughput(throughput, source) {
  if (!throughput) return null;
  const factors = throughput.classification?.factors || [];
  return {
    source,
    label: throughput.classification?.label || null,
    primary: throughput.classification?.primary || null,
    monitorVisibility: throughput.evidence?.progress?.monitorVisibility || null,
    docsPerSec: throughput.evidence?.progress?.docsPerSec || 0,
    bytesPerSec: throughput.evidence?.progress?.bytesPerSec || 0,
    elapsedSec: throughput.evidence?.progress?.elapsedSec ?? null,
    meter: throughput.evidence?.meter || null,
    fetches: throughput.evidence?.fetches || null,
    limiter: throughput.evidence?.limiter || null,
    unknownFactors: factors.filter((factor) => factor.status === 'unknown').map((factor) => factor.id),
    factors: factors.map((factor) => ({
      id: factor.id,
      status: factor.status,
      detail: factor.detail
    })),
    diagnostics: throughput.classification?.diagnostics || []
  };
}

function buildGuardianSampleObservabilitySummary(options = {}) {
  const launch = options.launchReport || null;
  const watchRecords = parseJsonLinesFromText(options.watchLog || '');
  const watchTicks = watchRecords.filter((record) => record.watchTick).map((record) => record.watchTick);
  const watchFinal = watchRecords.map((record) => record.watchFinal).filter(Boolean).pop() || null;
  const sampleBefore = options.sampleBefore || null;
  const sampleAfter = options.sampleAfter || null;
  const productionBefore = options.productionBefore || null;
  const productionAfter = options.productionAfter || null;
  const hasThroughputInputs = Boolean(
    (options.meterSamples || []).length ||
    (options.fetchSamples || []).length ||
    (options.limiterSnapshots || []).length ||
    options.cadenceComparison
  );
  const throughput = hasThroughputInputs
    ? buildThroughputAnalysis({
      generatedAt: options.generatedAt,
      progressPackets: sampleAfter ? [sampleAfter] : [],
      meterSamples: options.meterSamples || [],
      fetchSamples: options.fetchSamples || [],
      limiterSnapshots: options.limiterSnapshots || [],
      cadenceComparison: options.cadenceComparison || null
    })
    : (options.throughput || null);
  const throughputSource = hasThroughputInputs ? 'built-from-summary-inputs' : (options.throughput ? 'provided-analysis' : null);
  const runtimeProof = options.runtimeProof || null;
  const extraction = options.extraction || null;
  const runtimeSamples = options.runtimeSamples || null;
  const sampleDelta = deltaFromSnapshots(sampleBefore, sampleAfter);
  const productionDelta = deltaFromSnapshots(productionBefore, productionAfter);
  const acceptedJobs = (launch?.results || []).filter((item) => item.ok && item.jobId).map((item) => ({
    id: item.jobId,
    startUrl: item.startUrl,
    status: item.body?.job?.status || null,
    startedAt: item.body?.job?.startedAt || null,
    finishedAt: item.body?.job?.finishedAt || null
  }));
  const terminalEvidence = summarizeTerminalEvidence(watchFinal);
  const productionZeroDelta = Boolean(productionDelta &&
    productionDelta.successResponses === 0 &&
    productionDelta.contentDownloads === 0 &&
    productionDelta.latestFetchedAtChanged === false);
  const sampleGrowth = sampleAfter?.dbGrowth || sampleDelta || null;
  const dbProofMet = Boolean(sampleGrowth && (
    (sampleGrowth.responses || sampleGrowth.downloads || 0) > 0 ||
    (sampleGrowth.successResponses || 0) > 0 ||
    (sampleGrowth.content || sampleGrowth.contentDownloads || 0) > 0
  ));
  const throughputFactors = throughput?.classification?.factors || [];
  const unknownThroughputFactors = throughputFactors.filter((factor) => factor.status === 'unknown').map((factor) => factor.id);
  const artifactTiming = summarizeArtifactTiming({
    launch,
    watchTicks,
    watchFinal,
    sampleBefore,
    sampleAfter,
    productionBefore,
    productionAfter
  });
  return {
    schemaVersion: 1,
    mode: 'guardian-sample-observability-summary',
    generatedAt: options.generatedAt || new Date().toISOString(),
    size: options.size || null,
    host: GUARDIAN_HOST,
    actionPolicy: {
      readOnlyReport: true,
      startsCrawler: false,
      contactsRemoteCrawler: false,
      contactsInternetTargets: false,
      writesLocalDb: false,
      writesProductionDb: false,
      mutatesRemoteQueue: false
    },
    launch: {
      available: Boolean(launch),
      accepted: launch?.counts?.ok || acceptedJobs.length,
      failed: launch?.counts?.failed || 0,
      total: launch?.counts?.total || (launch?.results || []).length,
      acceptedJobs
    },
    watch: {
      ticks: watchTicks.length,
      finalAvailable: Boolean(watchFinal),
      stoppedReason: watchFinal?.stoppedReason || null,
      dbProofReached: Boolean(watchFinal?.minFetchesMet),
      jobPollErrors: watchFinal?.jobPollErrors || 0,
      terminalEvidence
    },
    timing: artifactTiming,
    dbProof: {
      sampleDb: sampleAfter?.writerDb?.path || sampleBefore?.writerDb?.path || null,
      sampleGrowth,
      dbProofMet,
      productionDb: productionAfter?.writerDb?.path || productionBefore?.writerDb?.path || 'data/news.db',
      productionDelta,
      productionZeroDelta
    },
    runtimePlaceHubs: runtimeProof
      ? {
        artifactMode: runtimeProof.mode,
        storedPatternMatches: runtimeProof.proof?.storedPatternMatches || 0,
        expectedHubCount: runtimeProof.proof?.expectedHubCount || 0,
        allExpectedHubsMatchedByStoredPattern: Boolean(runtimeProof.proof?.allExpectedHubsMatchedByStoredPattern),
        falseHubPredictionCount: runtimeProof.proof?.falseHubPredictionCount || 0
      }
      : null,
    latestStoryExtraction: extraction
      ? {
        source: 'saved-fixture',
        hub: extraction.hub || null,
        storyCount: extraction.proof?.storyCount || extraction.stories?.length || 0,
        rejectedCount: extraction.rejectedCount || 0,
        freshnessStatuses: [...new Set((extraction.stories || []).map((story) => story.freshness?.status || 'unknown'))]
      }
      : runtimeSamples?.runtimeLatestStoryExtraction
        ? {
          source: 'runtime',
          storyCount: runtimeSamples.runtimeLatestStoryExtraction.candidates?.length || 0,
          pageCount: runtimeSamples.runtimeLatestStoryExtraction.pages?.length || 0,
          evidenceSource: runtimeSamples.runtimeLatestStoryExtraction.source || 'runtime-page-log',
          freshnessStatuses: [...new Set((runtimeSamples.fetchSamples || []).map((sample) => sample.freshness?.status || 'unknown'))]
        }
      : {
        source: 'not-supplied',
        storyCount: 0
      },
    throughput: throughput
      ? compactThroughput(throughput, throughputSource)
      : null,
    classification: {
      label: dbProofMet && productionZeroDelta ? 'sample-db-proof-with-observability-gaps' : 'sample-proof-incomplete',
      proven: {
        launchAccepted: acceptedJobs.length > 0,
        dbGrowth: dbProofMet,
        productionIsolation: productionZeroDelta,
        runtimeStoredPatterns: Boolean(runtimeProof?.proof?.allExpectedHubsMatchedByStoredPattern),
        runtimeLatestStoryMetadata: Boolean(runtimeSamples?.runtimeLatestStoryExtraction?.candidates?.length)
      },
      partial: {
        terminalJobEvidence: terminalEvidence.status !== 'proven',
        throughputInputs: unknownThroughputFactors.length > 0,
        runtimeLatestStoryExtraction: !extraction || extraction.source !== 'runtime'
      },
      nextSafestAction: terminalEvidence.status !== 'proven'
        ? 'rerun a bounded Guardian small sample with terminal wait and saved job-status artifact'
        : 'add fetch/freshness/limiter samples before broadening Guardian medium proofs'
    }
  };
}

function readHtmlFile(filePath) {
  return fs.readFileSync(path.resolve(filePath), 'utf8');
}

module.exports = {
  GUARDIAN_HOST,
  GUARDIAN_HUB_PATTERNS,
  normalizeGuardianUrl,
  classifyGuardianHubUrl,
  extractGuardianHubStories,
  buildGuardianHubInventory,
  buildGuardianRuntimePatternProof,
  buildGuardianRuntimeLatestStoryProof,
  buildGuardianRuntimeSamplesFromLog,
  buildGuardianSampleObservabilitySummary,
  buildGuardianDbPersistencePlan,
  persistGuardianHubPatternsToStore,
  buildGuardianSampleCrawlPlan,
  readHtmlFile
};
