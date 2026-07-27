'use strict';

/**
 * crawlDashboardCore — the shared, DOM-free, dependency-free normalization core
 * for the crawl dashboard (distributed-crawl plan v2, Phase D4).
 *
 * WHY THIS EXISTS: the crawl-status page's throughput/host-health/headline logic
 * lives inside one emitted template-literal client script (crawl-status-client.js),
 * and the plan calls for a dashboard served from BOTH the local unifiedApp and the
 * remote Oracle node. Without a shared core, each surface re-implements the same
 * math — and the cycle-69 phantom-rate rule (owner-reported "Saved docs/s is
 * wrong") is exactly the kind of load-bearing semantic that rots when copied.
 * This module is the SINGLE source of truth for that math. It is pure (no DOM, no
 * fetch, no jsgui) so it is safe to `require` in Node (the remote server) and to
 * bundle for the browser (jsgui3 controls, slice 2).
 *
 * The throughput functions are a faithful extraction of renderThroughput +
 * metricValue in src/ui/server/crawlStatus/crawl-status-client.js (lines 106-164);
 * crawlDashboardCore.parity.test.js asserts byte-identical output so the two
 * cannot silently diverge before the client is migrated onto this core.
 *
 * THE CYCLE-69 CONTRACT (two-layer, must be preserved):
 *   producer — InProcessCrawlJobRegistry._publicProgress zeroes the 4 rate keys on
 *     terminal jobs (cumulative counters stay true);
 *   consumer — the throughput strip sums ONLY active jobs.
 *   `queued` is the field the producer does NOT zero, so it depends ENTIRELY on the
 *   active filter here — any consumer that bypasses isActiveJob resurrects the
 *   phantom-queue bug. Keep the filter as the summing gate.
 */

// Rate/queue source keys, in preference order. Canonical producer names first;
// legacy fallbacks preserved so a shared core tolerates an older server build.
const THROUGHPUT_KEYS = {
  network:    ['networkMbPerSec', 'networkMbPerSecond', 'mbPerSecond'],
  downloaded: ['docsDownloadedPerSec', 'docsDownloadedPerSecond', 'downloadedDocsPerSecond', 'pagesPerSecond', 'requestsPerSec'],
  saved:      ['docsSavedPerSec', 'docsSavedPerSecond', 'savedDocsPerSecond'],
  stored:     ['savedMbPerSec', 'savedMbPerSecond'],
  queue:      ['queued', 'queueSize', 'queue', 'pending'],
};

// Per-host politeness health classes (cycle 58 host-health meter) and their
// chip colours. The dark chip pairing #241f18/#ece8e0 is a DELIBERATE contrast
// choice — a hardcoded dark background with NO explicit text colour inherits the
// page theme's text colour and goes invisible on light theme (the contrast trap,
// cycle 62). Bake the pairing here so every dashboard surface renders it the same.
const HOST_HEALTH_COLORS = { 'FAST': '#3a9d6a', 'POLITE-THROTTLE': '#c99a33', 'SLOW-IRREGULAR': '#c0563a' };
const HOST_HEALTH_CHIP_BG = '#241f18';
const HOST_HEALTH_CHIP_FG = '#ece8e0';

// Remote domain operational states (from the Oracle /api/status domains[]) — a
// DIFFERENT axis from politeness health, so they get their own class names and
// colours; a consumer must not conflate "domain is running" with "host is FAST".
const REMOTE_STATE_COLORS = { running: '#3a9d6a', idle: '#8a8172', stopped: '#6a6a6a', errored: '#c0563a', error: '#c0563a' };

function finiteNumber(value, fallback) {
  const numeric = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(numeric) ? numeric : fallback;
}

/**
 * The cycle-69 active predicate: a job contributes to "right now" throughput ONLY
 * while active — finishedAt falsy AND status in running/pending/created. This is
 * the consumer half of the phantom-rate fix; even a stale server build that failed
 * to zero a terminal job's rates cannot leak them through this gate.
 */
function isActiveJob(job) {
  if (!job) return false;
  if (job.finishedAt) return false;
  return job.status === 'running' || job.status === 'pending' || job.status === 'created';
}

/**
 * Read a metric off a job, searching [progress, throughput, metrics, job] in that
 * order for the first present key. Faithful copy of the client's metricValue so the
 * shared core and the legacy client agree on where a number comes from.
 */
function metricValue(job, keys, fallback) {
  const metrics = job.metrics || {};
  const throughput = metrics.throughput || {};
  const progress = job.progress || metrics || {};
  const sources = [progress, throughput, metrics, job];
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      if (source[key] != null) return finiteNumber(source[key], fallback);
    }
  }
  return fallback;
}

function formatRate(value) {
  return finiteNumber(value, 0).toFixed(2);
}

/**
 * Sum the throughput rates + queue over ACTIVE jobs only. Returns raw numeric
 * totals under the SAME keys the client's renderThroughput uses (network,
 * downloaded, saved, stored, queue) plus activeCount, so parity is exact.
 */
function normalizeThroughput(jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  const activeJobs = list.filter(isActiveJob);
  const totals = activeJobs.reduce(function (acc, job) {
    acc.network    += metricValue(job, THROUGHPUT_KEYS.network, 0);
    acc.downloaded += metricValue(job, THROUGHPUT_KEYS.downloaded, 0);
    acc.saved      += metricValue(job, THROUGHPUT_KEYS.saved, 0);
    acc.stored     += metricValue(job, THROUGHPUT_KEYS.stored, 0);
    acc.queue      += metricValue(job, THROUGHPUT_KEYS.queue, 0);
    return acc;
  }, { network: 0, downloaded: 0, saved: 0, stored: 0, queue: 0 });
  totals.activeCount = activeJobs.length;
  return totals;
}

/**
 * Format summed totals for display — identical to the client's `values` object:
 * the four rates as fixed-2-decimal strings, the queue as a rounded integer string.
 */
function formatThroughput(totals) {
  const t = totals || {};
  return {
    network:    formatRate(t.network),
    downloaded: formatRate(t.downloaded),
    saved:      formatRate(t.saved),
    stored:     formatRate(t.stored),
    // DELIBERATE HARDENING vs the client: the client renders the queue as
    // String(Math.round(totals.queue)) with NO finiteNumber guard, so a summed
    // queue that overflows to +/-Infinity would display the literal string
    // "Infinity" (the four rate fields are already guarded via formatRate). Wrap
    // the queue total too so a non-finite sum clamps to 0 like the rates. This is
    // the ONE intentional divergence from the client — unreachable from the real
    // producer (small integer queue counts) but locked by parity.test.js so the
    // difference stays documented, not accidental.
    queue:      String(Math.round(finiteNumber(t.queue, 0))),
  };
}

/**
 * Escape a string for safe insertion into an HTML TEXT node. jsgui's
 * String_Control renders its text RAW in all_html_render() (verified cycle 72:
 * `A<script>` comes out `A<script>`), so any untrusted value (a host name, a
 * crawled headline title) placed in a String_Control must be escaped by the
 * caller first — jsgui only escapes ATTRIBUTE values, not text. Pure string op.
 */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&#39;');
}

// Strip a leading www. (backslash-free string op — the template-trap safe form).
function shortHost(host) {
  const s = String(host || '');
  return s.indexOf('www.') === 0 ? s.slice(4) : s;
}

// Analysed-at formatter mirroring the client's fmtAnalyzedAt: ISO -> "YYYY-MM-DD
// HH:MM:SS". Space-form ("YYYY-MM-DD HH:MM:SS") passes through the same slice.
function formatAnalyzedAt(value) {
  const s = String(value || '');
  if (!s) return '';
  return s.split('T').join(' ').slice(0, 19);
}

/**
 * Normalize the /host-health payload into a stable badge model. Keeps the
 * contrast-safe chip style (explicit bg AND fg) in the core so no dashboard surface
 * re-picks the colours and regresses the SLOW-IRREGULAR red-on-dark readability.
 */
function normalizeHostHealth(payload) {
  const hosts = (payload && payload.hosts) || [];
  const refreshing = Boolean(payload && payload.refreshing);
  if (!hosts.length) {
    return { refreshing, empty: true, emptyText: refreshing ? 'computing…' : 'no host met the threshold recently', badges: [] };
  }
  const badges = hosts.map(function (h) {
    const color = HOST_HEALTH_COLORS[h.cls] || '#666';
    const gapS = Math.round(finiteNumber(h.gMed, 0));
    return {
      host: shortHost(h.host),
      cls: h.cls,
      color: color,
      gapS: gapS,
      label: shortHost(h.host) + '  ' + gapS + 's',
      title: h.host + ' — ' + h.verdict + ' (' + h.n + ' fetches, gap~' + gapS
        + 's, CV ' + finiteNumber(h.cv, 0).toFixed(2) + ', ' + finiteNumber(h.mbps, 0).toFixed(3)
        + ' MB/s, ' + Math.round(finiteNumber(h.kbMed, 0)) + 'KB/pg)',
      // Contrast-safe: explicit bg AND fg, coloured border encodes the class.
      chipStyle: 'background:' + HOST_HEALTH_CHIP_BG + ';color:' + HOST_HEALTH_CHIP_FG + ';border:1px solid ' + color,
      dotColor: color,
    };
  });
  return { refreshing, empty: false, emptyText: '', badges };
}

/**
 * Normalize the remote /api/status domains[] into badges. This is OPERATIONAL
 * state (running/idle/stopped/errored), NOT politeness health — a distinct axis,
 * flagged kind:'domain-state' so a consumer never conflates it with host-health.
 */
function normalizeRemoteDomains(domains) {
  const list = Array.isArray(domains) ? domains : [];
  const badges = list.map(function (d) {
    const state = String(d.state || (d.isRunning ? 'running' : 'idle'));
    const color = REMOTE_STATE_COLORS[state] || '#666';
    return {
      host: shortHost(d.domain),
      cls: state.toUpperCase(),
      color: color,
      kind: 'domain-state',
      label: shortHost(d.domain) + '  ' + state,
      title: d.domain + ' — ' + state,
      chipStyle: 'background:' + HOST_HEALTH_CHIP_BG + ';color:' + HOST_HEALTH_CHIP_FG + ';border:1px solid ' + color,
      dotColor: color,
    };
  });
  return { refreshing: false, empty: badges.length === 0, emptyText: badges.length ? '' : 'no domains', badges, kind: 'domain-state' };
}

/**
 * Normalize a single analysed-headline record into a display model. Pure field
 * normalization only — rendering stays in each host.
 *
 * XSS CONTRACT (adversarial-flagged, cycle 72): `title` is the ONE genuinely
 * untrusted string in the whole dashboard model — a crawled page sets its own
 * `<title>`, so a malicious source can author `<img src=x onerror=...>`. It is left
 * RAW here on purpose (this model also feeds JSON responses + the console tool,
 * where escaping would corrupt it). Any HTML renderer of a headline MUST escape the
 * title with `escapeHtml` before it reaches a jsgui String_Control (which renders
 * text RAW) — mirror HostHealthBadgesControl's escaped label. A DOM renderer using
 * `textContent` is already safe. The slice-2 headline control MUST do one of those.
 */
function normalizeHeadline(h) {
  h = h || {};
  const host = h.host ? shortHost(h.host) : null;
  const analyzedAt = (h.analyzedAt || h.analyzed_at || h.fetched_at) || null;
  const bits = [];
  if (host) bits.push(host);
  if (h.section) bits.push(h.section);
  if (analyzedAt) bits.push(formatAnalyzedAt(analyzedAt) + ' UTC');
  return {
    title: h.title || '(untitled)',
    url: h.url || null,
    host: host,
    section: h.section || null,
    analyzedAt: analyzedAt ? formatAnalyzedAt(analyzedAt) : null,
    metaText: bits.join('  ·  '),
  };
}

function normalizeHeadlines(list) {
  return (Array.isArray(list) ? list : []).map(normalizeHeadline);
}

module.exports = {
  THROUGHPUT_KEYS,
  HOST_HEALTH_COLORS,
  HOST_HEALTH_CHIP_BG,
  HOST_HEALTH_CHIP_FG,
  REMOTE_STATE_COLORS,
  finiteNumber,
  escapeHtml,
  isActiveJob,
  metricValue,
  formatRate,
  normalizeThroughput,
  formatThroughput,
  shortHost,
  formatAnalyzedAt,
  normalizeHostHealth,
  normalizeRemoteDomains,
  normalizeHeadline,
  normalizeHeadlines,
};
