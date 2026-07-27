'use strict';

/**
 * PARITY / EQUIVALENCE GUARD (D4 scaffold, cycle 71).
 *
 * crawlDashboardCore.normalizeThroughput/formatThroughput are an extraction of the
 * live crawl-status client's renderThroughput (src/ui/server/crawlStatus/
 * crawl-status-client.js:106-164). Until the client is migrated onto the shared
 * core (slice 2), the two must produce BYTE-IDENTICAL output — otherwise the
 * dashboard the plan unifies would silently disagree with the page it replaces.
 *
 * Below is a faithful, DOM-free copy of the client's math (metricValue + the
 * renderThroughput reduce + the `values` formatting). This test asserts the core
 * equals it across a battery of job fixtures — active, terminal, phantom-frozen,
 * legacy-keyed, missing-field. If someone edits the core's summing/formatting and
 * drifts from the client, this fails. When the client IS migrated, this test's
 * reference block becomes the record of what the client used to do.
 */

const core = require('../crawlDashboardCore');

// ---- Faithful reference copy of the client (crawl-status-client.js:106-164) ----
function refFiniteNumber(value, fallback) {
  const numeric = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(numeric) ? numeric : fallback;
}
function refMetricValue(job, keys, fallback) {
  const metrics = job.metrics || {};
  const throughput = metrics.throughput || {};
  const progress = job.progress || metrics || {};
  const sources = [progress, throughput, metrics, job];
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      if (source[key] != null) return refFiniteNumber(source[key], fallback);
    }
  }
  return fallback;
}
function refFormatRate(value) { return refFiniteNumber(value, 0).toFixed(2); }
function refRenderThroughputValues(jobs) {
  const activeJobs = jobs.filter(function (job) {
    if (!job) return false;
    if (job.finishedAt) return false;
    return job.status === 'running' || job.status === 'pending' || job.status === 'created';
  });
  const totals = activeJobs.reduce(function (acc, job) {
    acc.network += refMetricValue(job, ['networkMbPerSec', 'networkMbPerSecond', 'mbPerSecond'], 0);
    acc.downloaded += refMetricValue(job, ['docsDownloadedPerSec', 'docsDownloadedPerSecond', 'downloadedDocsPerSecond', 'pagesPerSecond', 'requestsPerSec'], 0);
    acc.saved += refMetricValue(job, ['docsSavedPerSec', 'docsSavedPerSecond', 'savedDocsPerSecond'], 0);
    acc.stored += refMetricValue(job, ['savedMbPerSec', 'savedMbPerSecond'], 0);
    acc.queue += refMetricValue(job, ['queued', 'queueSize', 'queue', 'pending'], 0);
    return acc;
  }, { network: 0, downloaded: 0, saved: 0, stored: 0, queue: 0 });
  return {
    network: refFormatRate(totals.network),
    downloaded: refFormatRate(totals.downloaded),
    saved: refFormatRate(totals.saved),
    stored: refFormatRate(totals.stored),
    queue: String(Math.round(totals.queue)),
  };
}
// ---------------------------------------------------------------------------

const FIXTURES = {
  'two active jobs': [
    { status: 'running', progress: { docsDownloadedPerSec: 1.5, docsSavedPerSec: 0.5, networkMbPerSec: 0.2, savedMbPerSec: 0.1, queued: 10 } },
    { status: 'pending', progress: { docsDownloadedPerSec: 0.5, docsSavedPerSec: 0.25, networkMbPerSec: 0.1, savedMbPerSec: 0.05, queued: 4 } },
  ],
  'mixed active + terminal (phantom-frozen rates on the terminal)': [
    { status: 'running', progress: { docsSavedPerSec: 1.0, queued: 3 } },
    { status: 'completed', finishedAt: '2026-07-22T00:00:00Z', progress: { docsSavedPerSec: 2.46, docsDownloadedPerSec: 1.47, queued: 99 } },
  ],
  'all terminal (idle strip)': [
    { status: 'completed', finishedAt: '2026-07-22T00:00:00Z', progress: { docsSavedPerSec: 0.08, queued: 50 } },
    { status: 'failed', finishedAt: '2026-07-22T00:00:00Z', progress: { docsDownloadedPerSec: 0.9, queued: 7 } },
  ],
  'legacy fallback keys': [
    { status: 'running', progress: { pagesPerSecond: 3, savedDocsPerSecond: 1, mbPerSecond: 0.4, queueSize: 6 } },
  ],
  'metrics.throughput source path': [
    { status: 'running', metrics: { throughput: { docsDownloadedPerSec: 4, docsSavedPerSec: 2 } } },
  ],
  'missing progress entirely': [
    { status: 'running' },
    { status: 'created', progress: { queued: 12 } },
  ],
  'string-valued rates': [
    { status: 'running', progress: { docsDownloadedPerSec: '2.5', docsSavedPerSec: '0.1', queued: '8' } },
  ],
  'empty list': [],
  'rounding boundary on queue (13.5 -> 14)': [
    { status: 'running', progress: { queued: 13.5 } },
  ],
};

describe('crawlDashboardCore throughput PARITY with crawl-status-client renderThroughput (producer-reachable inputs)', () => {
  for (const [name, jobs] of Object.entries(FIXTURES)) {
    it(`matches the client for: ${name}`, () => {
      const coreValues = core.formatThroughput(core.normalizeThroughput(jobs));
      const refValues = refRenderThroughputValues(jobs);
      // The client only renders the five formatted strings — compare exactly those.
      expect({
        network: coreValues.network, downloaded: coreValues.downloaded,
        saved: coreValues.saved, stored: coreValues.stored, queue: coreValues.queue,
      }).toEqual(refValues);
    });
  }
});

/**
 * The ONE deliberate divergence (found by the cycle-71 adversarial verify pass):
 * the client formats the queue as String(Math.round(totals.queue)) with NO
 * finiteNumber guard, so a queue total that overflows to Infinity displays the
 * literal "Infinity". The core wraps the queue in finiteNumber (like the rate
 * fields) and clamps to 0. This is unreachable from the real producer (queue
 * counts are small integers), so it does not appear in the parity fixtures above —
 * but it IS a real, intentional hardening, locked here so it stays documented and
 * a future edit can't silently "restore parity" by re-introducing the client bug.
 */
describe('crawlDashboardCore deliberate hardening BEYOND the client', () => {
  it('clamps a non-finite (overflowed) queue total to 0 where the client would render "Infinity"', () => {
    const jobs = [
      { status: 'running', progress: { queued: Number.MAX_VALUE } },
      { status: 'running', progress: { queued: Number.MAX_VALUE } },
    ];
    expect(refRenderThroughputValues(jobs).queue).toBe('Infinity'); // the latent client behavior
    expect(core.formatThroughput(core.normalizeThroughput(jobs)).queue).toBe('0'); // the core's hardening
  });
});
