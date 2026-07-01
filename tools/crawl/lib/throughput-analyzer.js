'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function readJsonArtifact(filePath) {
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, 'utf8').trim();
  if (!raw) return null;
  if (raw[0] === '[' || raw[0] === '{') return JSON.parse(raw);
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function loadJsonArtifacts(paths = []) {
  return asArray(paths)
    .filter(Boolean)
    .flatMap((filePath) => {
      const loaded = readJsonArtifact(filePath);
      return Array.isArray(loaded) ? loaded : [loaded];
    })
    .filter(Boolean);
}

function normalizeFreshness(value) {
  const proof = value?.freshness || value?.fetchMeta?.freshness || value?.meta?.freshness || value;
  if (!proof || typeof proof !== 'object') return null;
  const status = typeof proof.status === 'string' ? proof.status : null;
  if (!status) return null;
  return {
    status,
    conditional: proof.conditional === true || proof.validators?.requested === true,
    avoidedDownload: proof.avoidedDownload === true,
    fullGetRequired: proof.fullGetRequired !== false
  };
}

function summarizeFetchSamples(samples = []) {
  const summary = {
    count: 0,
    http: { success: 0, notModified: 0, failed: 0 },
    timing: {
      avgTtfbMs: null,
      avgDownloadMs: null,
      avgTotalMs: null,
      avgBytes: null
    },
    freshness: {
      new: 0,
      updated: 0,
      unchanged: 0,
      stale: 0,
      unknown: 0,
      conditional: 0,
      avoidedDownloads: 0
    }
  };
  const totals = { ttfb: 0, download: 0, total: 0, bytes: 0 };
  const counts = { ttfb: 0, download: 0, total: 0, bytes: 0 };

  for (const item of samples || []) {
    const meta = item?.fetchMeta || item?.meta?.fetchMeta || item;
    if (!meta || typeof meta !== 'object') continue;
    summary.count += 1;
    const status = toNumber(meta.httpStatus ?? item?.httpStatus, null);
    if (status === 304) summary.http.notModified += 1;
    else if (status >= 200 && status < 300) summary.http.success += 1;
    else if (status != null) summary.http.failed += 1;

    for (const [key, source] of [['ttfb', 'ttfbMs'], ['download', 'downloadMs'], ['total', 'totalMs'], ['bytes', 'bytesDownloaded']]) {
      const value = toNumber(meta[source] ?? item?.[source], null);
      if (value != null) {
        totals[key] += value;
        counts[key] += 1;
      }
    }

    const freshness = normalizeFreshness(item) || normalizeFreshness(meta);
    if (freshness) {
      if (Object.prototype.hasOwnProperty.call(summary.freshness, freshness.status)) {
        summary.freshness[freshness.status] += 1;
      } else {
        summary.freshness.unknown += 1;
      }
      if (freshness.conditional) summary.freshness.conditional += 1;
      if (freshness.avoidedDownload) summary.freshness.avoidedDownloads += 1;
    }
  }

  summary.timing.avgTtfbMs = counts.ttfb ? round(totals.ttfb / counts.ttfb, 1) : null;
  summary.timing.avgDownloadMs = counts.download ? round(totals.download / counts.download, 1) : null;
  summary.timing.avgTotalMs = counts.total ? round(totals.total / counts.total, 1) : null;
  summary.timing.avgBytes = counts.bytes ? round(totals.bytes / counts.bytes, 1) : null;
  return summary;
}

function summarizeMeterSamples(samples = []) {
  const valid = (samples || []).filter((s) => s && typeof s === 'object');
  const latest = valid.length ? valid[valid.length - 1] : null;
  const peaks = valid.reduce((acc, sample) => ({
    docsPerSec: Math.max(acc.docsPerSec, toNumber(sample.docsPerSec, 0)),
    bytesPerSec: Math.max(acc.bytesPerSec, toNumber(sample.bytesPerSec, 0))
  }), { docsPerSec: 0, bytesPerSec: 0 });
  return {
    samples: valid.length,
    latest: latest ? {
      docs: toNumber(latest.docs, 0),
      bytes: toNumber(latest.bytes, 0),
      docsPerSec: toNumber(latest.docsPerSec, 0),
      bytesPerSec: toNumber(latest.bytesPerSec, 0)
    } : null,
    peakDocsPerSec: round(peaks.docsPerSec, 3),
    peakBytesPerSec: round(peaks.bytesPerSec, 1)
  };
}

function summarizeLimiterSnapshots(snapshots = []) {
  const valid = (snapshots || []).filter((s) => s && typeof s === 'object');
  const politenessFloorMs = Math.max(0, ...valid.map((s) => toNumber(s.politenessFloorMs, 0)));
  const crawlDelaySeconds = Math.max(0, ...valid.map((s) => toNumber(s.crawlDelaySeconds, 0)));
  const backoffCount = valid.filter((s) => s.isLimited || toNumber(s.lastHttpStatus, 0) === 429 || toNumber(s.lastHttpStatus, 0) === 403 || toNumber(s.backoffUntil, 0) > Date.now()).length;
  const statuses = {};
  for (const item of valid) {
    const status = item.lastHttpStatus;
    if (status != null) statuses[String(status)] = (statuses[String(status)] || 0) + 1;
  }
  return {
    samples: valid.length,
    politenessFloorMs,
    crawlDelaySeconds,
    backoffCount,
    statuses
  };
}

function extractProgress(progressArtifacts = []) {
  const packets = asArray(progressArtifacts).filter((p) => p && typeof p === 'object');
  const latest = packets.length ? packets[packets.length - 1] : null;
  if (!latest) {
    return {
      packets: 0,
      docsPerSec: 0,
      bytesPerSec: 0,
      downloads: 0,
      dbGrowth: null,
      verdict: 'unknown',
      stalled: false,
      elapsedSec: null,
      monitorVisibility: 'unknown'
    };
  }
  return {
    packets: packets.length,
    docsPerSec: toNumber(latest.throughput?.docsPerSec, 0),
    bytesPerSec: toNumber(latest.throughput?.bytesPerSec, 0),
    downloads: toNumber(latest.downloads ?? latest.successResponses, 0),
    dbGrowth: latest.dbGrowth || null,
    verdict: latest.verdict || 'unknown',
    stalled: latest.stalled === true,
    elapsedSec: latest.elapsedSec ?? null,
    monitorVisibility: latest.elapsedSource === 'db-latest-fetched-delta' ? 'writer-db-self-clocked' : (latest.elapsedSource || 'unknown')
  };
}

function classifyLimiters({ progress, meter, fetches, limiter, cadence }) {
  const factors = [];
  const diagnostics = [];

  if (progress.stalled) {
    factors.push({ id: 'stall', status: 'blocked', detail: 'progress packet reports stalled' });
  }
  if (progress.monitorVisibility === 'unknown' || progress.downloads === 0) {
    factors.push({ id: 'monitor-visibility', status: progress.downloads > 0 ? 'partial' : 'blocked', detail: 'writer DB progress evidence is missing or idle' });
  } else {
    factors.push({ id: 'monitor-visibility', status: 'proven', detail: progress.monitorVisibility });
  }

  if (limiter.politenessFloorMs > 0) {
    const floorSec = limiter.politenessFloorMs / 1000;
    const maxDocsPerSec = floorSec > 0 ? 1 / floorSec : null;
    const floorLikely = maxDocsPerSec != null && progress.docsPerSec > 0 && progress.docsPerSec <= (maxDocsPerSec * 1.2);
    factors.push({
      id: 'robots-politeness-floor',
      status: floorLikely ? 'likely-limiting' : 'active',
      detail: `${limiter.politenessFloorMs}ms floor${maxDocsPerSec != null ? `, single-host ceiling ${round(maxDocsPerSec, 3)} docs/s` : ''}`
    });
  } else {
    factors.push({ id: 'robots-politeness-floor', status: 'unknown', detail: 'no limiter snapshots supplied' });
  }

  if (limiter.backoffCount > 0) {
    factors.push({ id: 'adaptive-backoff', status: 'likely-limiting', detail: `${limiter.backoffCount} limiter sample(s) show active/adaptive backoff` });
  } else {
    factors.push({ id: 'adaptive-backoff', status: limiter.samples ? 'not-observed' : 'unknown', detail: limiter.samples ? 'no 429/403/backoff state in supplied snapshots' : 'no limiter snapshots supplied' });
  }

  if (fetches.timing.avgTotalMs != null) {
    const total = fetches.timing.avgTotalMs;
    factors.push({
      id: 'network-latency',
      status: total >= 2000 ? 'likely-limiting' : (total >= 500 ? 'active' : 'not-observed'),
      detail: `avg total ${total}ms, avg ttfb ${fetches.timing.avgTtfbMs ?? 'n/a'}ms`
    });
  } else {
    factors.push({ id: 'network-latency', status: 'unknown', detail: 'no fetch timing samples supplied' });
  }

  const freshnessTotal = fetches.freshness.new + fetches.freshness.updated + fetches.freshness.unchanged + fetches.freshness.stale + fetches.freshness.unknown;
  if (freshnessTotal > 0) {
    factors.push({
      id: 'freshness-cache',
      status: fetches.freshness.avoidedDownloads > 0 ? 'active' : 'not-observed',
      detail: `${fetches.freshness.avoidedDownloads}/${freshnessTotal} avoided body downloads, ${fetches.freshness.conditional} conditional`
    });
  } else {
    factors.push({ id: 'freshness-cache', status: 'unknown', detail: 'no freshness samples supplied' });
  }

  if (progress.dbGrowth) {
    const responses = toNumber(progress.dbGrowth.responses, 0);
    const content = toNumber(progress.dbGrowth.content, 0);
    factors.push({
      id: 'db-write-growth',
      status: responses > 0 ? 'proven' : 'blocked',
      detail: `responses +${responses}, content +${content}`
    });
  } else {
    factors.push({ id: 'db-write-growth', status: 'unknown', detail: 'no baseline/current DB growth supplied' });
  }

  if (cadence?.cadenceConsistent === false) {
    diagnostics.push(...(cadence.diagnostics || ['packet cadence divergent']));
  }
  if (meter.latest && progress.docsPerSec === 0 && meter.latest.docsPerSec > 0) {
    diagnostics.push('meter sees throughput while progress packet is idle; compare meter DB vs writer DB');
  }
  if (progress.bytesPerSec === 0 && fetches.timing.avgBytes != null && fetches.timing.avgBytes > 0) {
    diagnostics.push('fetch samples have bytes but progress bytes/sec is zero; byte accounting may be missing from monitor inputs');
  }

  return { factors, diagnostics };
}

function buildThroughputAnalysis(input = {}) {
  const progress = extractProgress(input.progressPackets || input.progress || []);
  const meter = summarizeMeterSamples(input.meterSamples || []);
  const fetches = summarizeFetchSamples(input.fetchSamples || []);
  const limiter = summarizeLimiterSnapshots(input.limiterSnapshots || []);
  const cadence = input.cadenceComparison || null;
  const classification = classifyLimiters({ progress, meter, fetches, limiter, cadence });
  const primary = classification.factors.find((f) => f.status === 'blocked')
    || classification.factors.find((f) => f.status === 'likely-limiting')
    || classification.factors.find((f) => f.status === 'active')
    || classification.factors[0]
    || { id: 'unknown', status: 'unknown', detail: 'no evidence' };

  return {
    schemaVersion: SCHEMA_VERSION,
    mode: 'crawl-throughput-analysis',
    generatedAt: input.generatedAt || new Date().toISOString(),
    actionPolicy: {
      readOnlyReport: true,
      startsCrawler: false,
      contactsRemoteCrawler: false,
      contactsInternetTargets: false,
      writesLocalDb: false,
      mutatesRemoteQueue: false
    },
    evidence: {
      progress,
      meter,
      fetches,
      limiter,
      cadence: cadence ? {
        cadenceConsistent: cadence.cadenceConsistent,
        diagnostics: cadence.diagnostics || []
      } : null
    },
    classification: {
      label: primary.status === 'blocked' ? 'throughput-blocked' : 'throughput-attributed',
      primary: primary.id,
      factors: classification.factors,
      diagnostics: classification.diagnostics,
      nextSafestAction: primary.status === 'blocked'
        ? 'fix the blocked throughput evidence path before broadening crawl scope'
        : 'use this attribution to choose the next bounded crawl or pacing experiment'
    }
  };
}

function buildInternetThroughputApprovalPacket(input = {}) {
  const explicitApprovalPresent = input.explicitApprovalPresent === true;
  const sampleDbPath = input.sampleDbPath || 'data/samples/internet-throughput-sample.db';
  const productionDbPath = input.productionDbPath || 'data/news.db';
  const targetUrl = input.targetUrl || 'https://www.bbc.com/news';
  const targetHost = (() => {
    try {
      return new URL(targetUrl).hostname;
    } catch (_) {
      return 'unknown';
    }
  })();
  const maxPages = toNumber(input.maxPages, 25);
  const maxDepth = toNumber(input.maxDepth, 1);
  const concurrency = toNumber(input.concurrency, 1);
  const perDomainIntervalMs = toNumber(input.perDomainIntervalMs, 1000);
  const watchSeconds = toNumber(input.watchSeconds, 600);
  const blocker = explicitApprovalPresent ? null : 'missing-explicit-internet-sample-approval';

  return {
    schemaVersion: SCHEMA_VERSION,
    mode: 'internet-throughput-measurement-approval',
    generatedAt: input.generatedAt || new Date().toISOString(),
    actionPolicy: {
      readOnlyReport: true,
      startsCrawler: false,
      contactsRemoteCrawler: false,
      contactsInternetTargets: false,
      writesLocalDb: false,
      writesSampleDb: false,
      writesProductionDb: false,
      mutatesRemoteQueue: false,
      whenApproved: {
        contactsInternetTargets: true,
        writesSampleDb: true,
        writesProductionDb: false,
        contactsRemoteCrawler: false,
        mutatesRemoteQueue: false
      }
    },
    approval: {
      explicitApprovalPresent,
      requiredApproval: 'internet-target-contact-and-isolated-sample-db-write',
      status: explicitApprovalPresent ? 'ready-for-human-approved-run' : 'blocked-missing-approval',
      acceptedApprovalText: 'Approve a bounded internet-target throughput sample crawl to an isolated sample DB only; production data/news.db writes remain disallowed.'
    },
    proposedRun: {
      targetUrl,
      targetHost,
      sampleDbPath,
      productionDbPath,
      caps: {
        profile: 'gentle',
        maxPages,
        maxDepth,
        concurrency,
        perDomainIntervalMs,
        watchSeconds
      },
      command: [
        'CRAWL_RUN_SERVER_READY_TIMEOUT_MS=120000',
        'node tools/crawl/run.js',
        '--local',
        '--crawl-db', sampleDbPath,
        '--db', sampleDbPath,
        '--profile gentle',
        '--max-pages', String(maxPages),
        '--max-depth', String(maxDepth),
        '--concurrency', String(concurrency),
        '--per-domain-interval-ms', String(perDomainIntervalMs),
        '--watch',
        '--watch-timeout-ms', String(watchSeconds * 1000),
        '--url', targetUrl
      ].join(' ')
    },
    proofPlan: {
      productionIsolation: [
        `record before/after counts for ${productionDbPath}`,
        'assert production DB response/content deltas remain zero',
        `record before/after counts for isolated sample DB ${sampleDbPath}`
      ],
      operatorArtifacts: [
        'launch stdout/stderr',
        'watch progress packets',
        'writer DB baseline/current snapshots',
        'freshness samples',
        'limiter snapshots with Crawl-delay/backoff state',
        'throughput-analyzer report',
        'crawl packet/cadence/card artifacts'
      ],
      requiredPostRunAnalyzer: `node tools/crawl/throughput-analyzer.js analyze --progress <progress.json> --limiter-snapshots <limiter.json> --fetch-samples <fetch.jsonl> --json --out tmp/internet-throughput-analysis.json`
    },
    classification: {
      label: blocker ? 'blocked' : 'approval-ready',
      primary: blocker || 'approval-present',
      blockers: blocker ? [blocker] : [],
      taxonomy: blocker ? ['approval-missing'] : ['approval-present'],
      nextSafestAction: blocker
        ? 'ask for explicit approval before any internet target contact or isolated sample DB write'
        : 'run the proposed bounded sample crawl and preserve production-isolation proof'
    }
  };
}

function renderThroughputAnalysisText(report) {
  if (report.mode === 'internet-throughput-measurement-approval') {
    const lines = [];
    lines.push('Internet Throughput Measurement Approval Packet');
    lines.push(`Status: ${report.classification.label}`);
    lines.push(`Primary: ${report.classification.primary}`);
    lines.push(`Target: ${report.proposedRun.targetUrl}`);
    lines.push(`Sample DB: ${report.proposedRun.sampleDbPath}`);
    lines.push(`Production DB: ${report.proposedRun.productionDbPath} (write delta must remain zero)`);
    lines.push(`Next: ${report.classification.nextSafestAction}`);
    lines.push('No-action policy: this packet does not start crawlers, contact internet targets, write DB rows, or mutate queues.');
    return `${lines.join('\n')}\n`;
  }

  const lines = [];
  lines.push('Crawl Throughput Analysis');
  lines.push(`Primary: ${report.classification.primary} (${report.classification.label})`);
  lines.push(`Progress: downloads=${report.evidence.progress.downloads} docs/s=${report.evidence.progress.docsPerSec} bytes/s=${report.evidence.progress.bytesPerSec} verdict=${report.evidence.progress.verdict}`);
  if (report.evidence.fetches.count) {
    lines.push(`Fetch timing: avgTotal=${report.evidence.fetches.timing.avgTotalMs ?? '-'}ms avgBytes=${report.evidence.fetches.timing.avgBytes ?? '-'}`);
    lines.push(`Freshness: new=${report.evidence.fetches.freshness.new} updated=${report.evidence.fetches.freshness.updated} unchanged=${report.evidence.fetches.freshness.unchanged} stale=${report.evidence.fetches.freshness.stale} avoided=${report.evidence.fetches.freshness.avoidedDownloads}`);
  }
  for (const factor of report.classification.factors) {
    lines.push(`- ${factor.id}: ${factor.status} (${factor.detail})`);
  }
  if (report.classification.diagnostics.length) {
    lines.push('Diagnostics:');
    for (const item of report.classification.diagnostics) lines.push(`- ${item}`);
  }
  lines.push(`Next: ${report.classification.nextSafestAction}`);
  lines.push('No-action policy: reads saved artifacts only; does not start crawlers, contact targets, write DB rows, or mutate queues.');
  return `${lines.join('\n')}\n`;
}

module.exports = {
  SCHEMA_VERSION,
  readJsonArtifact,
  loadJsonArtifacts,
  summarizeFetchSamples,
  summarizeMeterSamples,
  summarizeLimiterSnapshots,
  buildThroughputAnalysis,
  buildInternetThroughputApprovalPacket,
  renderThroughputAnalysisText
};
