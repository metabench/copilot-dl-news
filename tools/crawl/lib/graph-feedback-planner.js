'use strict';

const DEFAULT_PER_HOST_LIMIT = 50;
const MAX_PER_HOST_LIMIT = 200;
const DEFAULT_SAMPLE_LIMIT = 10;
const MAX_SAMPLE_LIMIT = 50;
const DEFAULT_ANALYSIS_MODE = 'full';
const FAST_SKIPPED_ANALYSES = [
  'site-summary',
  'hub-candidates',
  'orphan-pages',
  'dead-end-pages',
];

/**
 * Build a bounded crawler feedback plan from WebsiteGraphAnalysisService output.
 *
 * This module is deliberately persistence-free. Callers supply a service-shaped
 * object so live code can use news-db-analysis while tests can use small mocks.
 *
 * @param {object} graphService WebsiteGraphAnalysisService-compatible object.
 * @param {string[]|string} domains Hostnames to analyse.
 * @param {object} [options]
 * @param {number} [options.perHostLimit=50] Maximum recommendations per host.
 * @param {number} [options.sampleLimit=10] Maximum diagnostic samples per host.
 * @param {string} [options.generatedAt] Stable timestamp for deterministic tests/artifacts.
 * @param {boolean} [options.fetchedOnly] Restrict graph discovery methods to fetched pages.
 * @param {boolean} [options.includeFetched=true] Include already-fetched rows in priority features.
 * @param {string} [options.staleBefore] Feature dataset stale threshold.
 * @param {string} [options.staleFetchedBefore] Crawler-facing stale threshold alias.
 * @param {'full'|'fast'} [options.mode='full'] Fast mode reads only crawl-priority features.
 * @returns {Promise<object>} Bounded feedback plan.
 */
async function buildGraphFeedbackPlan(graphService, domains, options = {}) {
  assertGraphService(graphService);

  const hosts = normalizeDomains(domains);
  const perHostLimit = clampPositiveInt(options.perHostLimit ?? options.limit, DEFAULT_PER_HOST_LIMIT, MAX_PER_HOST_LIMIT);
  const sampleLimit = clampPositiveInt(options.sampleLimit, DEFAULT_SAMPLE_LIMIT, MAX_SAMPLE_LIMIT);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const mode = normalizeMode(options.mode);
  const domainPlans = [];

  for (const host of hosts) {
    domainPlans.push(await buildDomainFeedbackPlan(graphService, host, {
      ...options,
      perHostLimit,
      sampleLimit,
      mode,
    }));
  }

  const recommendationCount = domainPlans.reduce((total, item) => total + (item.recommendations?.length || 0), 0);
  const errorCount = domainPlans.filter(item => item.status === 'error').length;

  return {
    schemaVersion: 1,
    source: 'WebsiteGraphAnalysisService',
    mode,
    generatedAt,
    limits: {
      perHostLimit,
      sampleLimit,
      maxPerHostLimit: MAX_PER_HOST_LIMIT,
      maxSampleLimit: MAX_SAMPLE_LIMIT,
    },
    domainCount: hosts.length,
    recommendationCount,
    errorCount,
    domains: domainPlans,
  };
}

async function buildDomainFeedbackPlan(graphService, host, options) {
  if (options.mode === 'fast') {
    return buildFastDomainFeedbackPlan(graphService, host, options);
  }

  const perHostLimit = options.perHostLimit;
  const sampleLimit = options.sampleLimit;
  const fetchedOnly = options.fetchedOnly;

  try {
    const [summary, hubResult, orphanResult, deadEndResult, priorityDataset] = await Promise.all([
      graphService.summarizeSiteGraph(host, options.summaryOptions || {}),
      graphService.findHubCandidates(host, {
        fetchedOnly,
        limit: perHostLimit,
        ...(options.hubOptions || {}),
      }),
      graphService.findOrphanPages(host, {
        fetchedOnly,
        excludeRootPath: true,
        limit: sampleLimit,
        ...(options.orphanOptions || {}),
      }),
      graphService.findDeadEndPages(host, {
        fetchedOnly,
        excludeRootPath: true,
        limit: sampleLimit,
        ...(options.deadEndOptions || {}),
      }),
      graphService.buildCrawlPriorityDataset(host, {
        includeFetched: options.includeFetched ?? true,
        staleBefore: options.staleBefore,
        staleFetchedBefore: options.staleFetchedBefore,
        limit: perHostLimit,
        ...(options.priorityOptions || {}),
      }),
    ]);

    const recommendations = buildSeedRecommendations({
      host,
      priorityRows: priorityDataset?.rows || [],
      hubCandidates: hubResult?.candidates || [],
      limit: perHostLimit,
    });

    return {
      host,
      status: 'ok',
      mode: 'full',
      summary,
      posture: classifyGraphPosture(summary),
      recommendations,
      diagnostics: {
        crawlPriorityManifest: priorityDataset?.manifest || null,
        hubCandidateCount: Number(hubResult?.candidateCount || hubResult?.candidates?.length || 0),
        orphanPageCount: Number(orphanResult?.pageCount || orphanResult?.pages?.length || 0),
        deadEndPageCount: Number(deadEndResult?.pageCount || deadEndResult?.pages?.length || 0),
        orphanSamples: samplePages(orphanResult?.pages, sampleLimit),
        deadEndSamples: samplePages(deadEndResult?.pages, sampleLimit),
        skippedAnalyses: [],
      },
    };
  } catch (err) {
    return buildErrorDomainFeedbackPlan(host, 'full', err);
  }
}

async function buildFastDomainFeedbackPlan(graphService, host, options) {
  const perHostLimit = options.perHostLimit;

  try {
    const priorityDataset = await graphService.buildCrawlPriorityDataset(host, {
      includeFetched: options.includeFetched ?? true,
      staleBefore: options.staleBefore,
      staleFetchedBefore: options.staleFetchedBefore,
      limit: perHostLimit,
      ...(options.priorityOptions || {}),
    });

    const recommendations = buildSeedRecommendations({
      host,
      priorityRows: priorityDataset?.rows || [],
      hubCandidates: [],
      limit: perHostLimit,
    });

    return {
      host,
      status: 'ok',
      mode: 'fast',
      summary: null,
      posture: ['priority-dataset-only'],
      recommendations,
      diagnostics: {
        crawlPriorityManifest: priorityDataset?.manifest || null,
        hubCandidateCount: null,
        orphanPageCount: null,
        deadEndPageCount: null,
        orphanSamples: [],
        deadEndSamples: [],
        skippedAnalyses: FAST_SKIPPED_ANALYSES.slice(),
      },
    };
  } catch (err) {
    return buildErrorDomainFeedbackPlan(host, 'fast', err, FAST_SKIPPED_ANALYSES);
  }
}

function buildErrorDomainFeedbackPlan(host, mode, err, skippedAnalyses = []) {
  return {
    host,
    status: 'error',
    mode,
    error: err && err.message ? err.message : String(err),
    summary: null,
    posture: ['graph-analysis-error'],
    recommendations: [],
    diagnostics: {
      crawlPriorityManifest: null,
      hubCandidateCount: mode === 'fast' ? null : 0,
      orphanPageCount: mode === 'fast' ? null : 0,
      deadEndPageCount: mode === 'fast' ? null : 0,
      orphanSamples: [],
      deadEndSamples: [],
      skippedAnalyses: skippedAnalyses.slice(),
    },
  };
}

function buildSeedRecommendations({ host, priorityRows, hubCandidates, limit }) {
  const byUrl = new Map();

  for (const row of priorityRows || []) {
    if (!row || !row.url) continue;
    mergeRecommendation(byUrl, {
      host,
      url: row.url,
      urlId: row.urlId ?? null,
      priorityScore: normalizeScore(row.priorityScore, 0),
      reason: formatReason(row.prioritySignals, 'crawl priority feature'),
      sources: ['crawl-priority-features'],
      signals: row.prioritySignals || [],
      metadata: {
        classification: row.classification || null,
        httpStatus: row.httpStatus ?? null,
        fetchedAt: row.fetchedAt || null,
        missingContent: row.missingContent === true,
        stale: row.stale === true,
        hasContent: row.hasContent ?? null,
        inboundInternalCount: Number(row.inboundInternalCount || 0),
        inboundExternalCount: Number(row.inboundExternalCount || 0),
        outboundInternalCount: Number(row.outboundInternalCount || 0),
        outboundExternalCount: Number(row.outboundExternalCount || 0),
      },
    });
  }

  for (const row of hubCandidates || []) {
    if (!row || !row.url) continue;
    const score = normalizeScore(row.hubScore, estimateHubScore(row));
    mergeRecommendation(byUrl, {
      host,
      url: row.url,
      urlId: row.urlId ?? null,
      priorityScore: score,
      reason: formatReason(row.hubSignals, 'hub candidate'),
      sources: ['hub-candidates'],
      signals: row.hubSignals || [],
      metadata: {
        classification: row.classification || null,
        hubScore: score,
        inboundCount: Number(row.inboundCount || 0),
        outboundCount: Number(row.outboundCount || 0),
        inboundInternalCount: Number(row.inboundInternalCount || 0),
        inboundExternalCount: Number(row.inboundExternalCount || 0),
        outboundInternalCount: Number(row.outboundInternalCount || 0),
        outboundExternalCount: Number(row.outboundExternalCount || 0),
      },
    });
  }

  return Array.from(byUrl.values())
    .sort((a, b) => b.priorityScore - a.priorityScore || a.url.localeCompare(b.url))
    .slice(0, limit);
}

function mergeRecommendation(byUrl, next) {
  const existing = byUrl.get(next.url);
  if (!existing) {
    byUrl.set(next.url, {
      ...next,
      sources: uniqueStrings(next.sources),
      signals: uniqueStrings(next.signals),
    });
    return;
  }

  existing.priorityScore = Math.max(existing.priorityScore, next.priorityScore);
  existing.sources = uniqueStrings([...existing.sources, ...next.sources]);
  existing.signals = uniqueStrings([...existing.signals, ...next.signals]);
  existing.reason = formatReason(existing.signals, existing.sources.join('+'));
  existing.metadata = {
    ...existing.metadata,
    ...next.metadata,
  };
}

function classifyGraphPosture(summary) {
  if (!summary || Number(summary.pageCount || 0) === 0) return ['empty-graph'];

  const labels = [];
  const fetchedCoverageRatio = ratio(summary, 'fetchedCoverageRatio', summary.fetchedPageCount, summary.pageCount);
  const orphanPageRatio = ratio(summary, 'orphanPageRatio', summary.orphanPageCount, summary.pageCount);
  const deadEndPageRatio = ratio(summary, 'deadEndPageRatio', summary.deadEndPageCount, summary.pageCount);
  const averageEdgesPerPage = ratio(summary, 'averageEdgesPerPage', summary.edgeCount, summary.pageCount);

  if (fetchedCoverageRatio < 0.25) labels.push('low-fetched-coverage');
  if (orphanPageRatio >= 0.35) labels.push('orphan-heavy');
  if (deadEndPageRatio >= 0.35) labels.push('dead-end-heavy');
  if (Number(summary.candidateHubCount || 0) > 0) labels.push('hub-candidates-present');
  if (averageEdgesPerPage >= 10) labels.push('dense-link-graph');

  return labels.length ? labels : ['balanced'];
}

function samplePages(pages, limit) {
  return (pages || []).filter(page => page && page.url).slice(0, limit).map(page => ({
    url: page.url,
    urlId: page.urlId ?? null,
    reason: page.reason || null,
    connectivityScore: Number(page.connectivityScore || 0),
    inboundCount: Number(page.inboundCount || 0),
    outboundCount: Number(page.outboundCount || 0),
    classification: page.classification || null,
  }));
}

function assertGraphService(graphService) {
  const required = [
    'summarizeSiteGraph',
    'findHubCandidates',
    'findOrphanPages',
    'findDeadEndPages',
    'buildCrawlPriorityDataset',
  ];

  for (const name of required) {
    if (!graphService || typeof graphService[name] !== 'function') {
      throw new Error(`graphService must provide ${name}()`);
    }
  }
}

function normalizeDomains(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  const out = [];
  const seen = new Set();

  for (const item of raw) {
    const host = String(item || '').trim().toLowerCase();
    if (!host || seen.has(host)) continue;
    seen.add(host);
    out.push(host);
  }

  return out;
}

function clampPositiveInt(value, fallback, max) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function normalizeMode(value) {
  const mode = String(value || DEFAULT_ANALYSIS_MODE).trim().toLowerCase();
  if (mode === 'full' || mode === 'fast') return mode;
  throw new Error(`Unsupported graph feedback mode: ${value}`);
}

function ratio(summary, field, numerator, denominator) {
  if (Number.isFinite(summary[field])) return Number(summary[field]);
  const den = Number(denominator || 0);
  if (!den) return 0;
  return Number(numerator || 0) / den;
}

function normalizeScore(value, fallback) {
  const score = Number(value);
  if (Number.isFinite(score)) return score;
  return Number(fallback || 0);
}

function estimateHubScore(row) {
  return (Number(row.outboundInternalCount || 0) * 2)
    + Number(row.outboundExternalCount || 0)
    + Number(row.inboundCount || 0);
}

function formatReason(signals, fallback) {
  const clean = uniqueStrings(signals || []);
  return clean.length ? clean.join(', ') : fallback;
}

function uniqueStrings(values) {
  return [...new Set((values || []).map(item => String(item || '').trim()).filter(Boolean))];
}

module.exports = {
  DEFAULT_PER_HOST_LIMIT,
  MAX_PER_HOST_LIMIT,
  DEFAULT_SAMPLE_LIMIT,
  MAX_SAMPLE_LIMIT,
  DEFAULT_ANALYSIS_MODE,
  buildGraphFeedbackPlan,
  buildSeedRecommendations,
  classifyGraphPosture,
  normalizeDomains,
  normalizeMode,
};
