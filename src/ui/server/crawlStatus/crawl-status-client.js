'use strict';

function buildCrawlStatusClientScript({
  jobsApiPath = '/api/v1/crawl/jobs',
  apiBasePath = '/api/v1/crawl',
  extraJobsApiPath = null,
  eventsPath = '/api/crawl-telemetry/events',
  telemetryHistoryPath = '/api/crawl-telemetry/history',
} = {}) {
  const config = JSON.stringify({
    jobsApiPath,
    apiBasePath,
    extraJobsApiPath,
    eventsPath,
    telemetryHistoryPath,
    remoteObsBasePath: '/remote-obs/crawl-telemetry',
  });

  return `
(function() {
  'use strict';

  const config = ${config};
  const BATCH_PRESETS = {
    'news-10': [
      'https://www.bbc.com/news',
      'https://www.reuters.com/',
      'https://www.theguardian.com/uk',
      'https://www.nytimes.com/',
      'https://www.washingtonpost.com/',
      'https://edition.cnn.com/',
      'https://apnews.com/',
      'https://www.bloomberg.com/',
      'https://www.ft.com/',
      'https://www.npr.org/'
    ],
    'news-5': [
      'https://www.bbc.com/news',
      'https://www.reuters.com/',
      'https://apnews.com/',
      'https://www.npr.org/',
      'https://www.theguardian.com/uk'
    ],
    'smoke-2': [
      'https://www.bbc.com/news',
      'https://apnews.com/'
    ]
  };
  window.crawlStatusConfig = config;

  const statusEl = document.getElementById('status');
  const rowsEl = document.getElementById('rows');
  const throughputEl = document.getElementById('throughput-strip');
  const remoteFetchEl = document.getElementById('remote-fetch-strip');
  const form = document.getElementById('crawl-start-form');
  const urlInput = document.getElementById('crawl-start-url');
  const profileSelect = document.getElementById('crawl-profile-select');
  const operationSelect = document.getElementById('crawl-start-operation');
  const operationLabel = document.getElementById('crawl-start-operation-label');
  const overridesText = document.getElementById('crawl-start-overrides');
  const startStatus = document.getElementById('crawl-start-status');
  const bootstrapButton = document.getElementById('crawl-profile-bootstrap');
  const readyMarker = document.querySelector('[data-crawl-status-ready]');
  const batchForm = document.getElementById('crawl-batch-form');
  const batchPresetSelect = document.getElementById('crawl-batch-preset');
  const batchMaxPagesInput = document.getElementById('crawl-batch-max-pages');
  const batchMaxDepthInput = document.getElementById('crawl-batch-max-depth');
  const batchConcurrencyInput = document.getElementById('crawl-batch-concurrency');
  const batchStartButton = document.getElementById('crawl-batch-start');
  const batchStatus = document.getElementById('crawl-batch-status');

  // Job ids whose detail panel is expanded. Kept in the IIFE scope (not inside
  // renderJobs) so it survives the full #rows innerHTML rebuild every 3s and is
  // visible to the delegated click handler. applyExpandedState() re-applies it
  // after each rebuild — without that, open panels would snap shut on refresh.
  const expandedJobs = new Set();

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setText(el, value) {
    if (el) el.textContent = value;
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options || { cache: 'no-store' });
    const json = await response.json().catch(function() { return {}; });
    if (!response.ok) throw new Error(json.error || json.message || response.statusText);
    return json;
  }

  function normalizeJobs(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.jobs)) return payload.jobs;
    if (Array.isArray(payload.items)) return payload.items;
    if (payload.job) return [payload.job];
    return [];
  }

  function finiteNumber(value, fallback) {
    const numeric = typeof value === 'string' ? Number(value) : value;
    return Number.isFinite(numeric) ? numeric : fallback;
  }

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

  function renderThroughput(jobs) {
    if (!throughputEl) return;
    const totals = jobs.reduce(function(acc, job) {
      acc.network += metricValue(job, ['networkMbPerSec', 'networkMbPerSecond', 'mbPerSecond'], 0);
      acc.downloaded += metricValue(job, ['docsDownloadedPerSec', 'docsDownloadedPerSecond', 'downloadedDocsPerSecond', 'pagesPerSecond', 'requestsPerSec'], 0);
      acc.saved += metricValue(job, ['docsSavedPerSec', 'docsSavedPerSecond', 'savedDocsPerSecond'], 0);
      acc.stored += metricValue(job, ['savedMbPerSec', 'savedMbPerSecond'], 0);
      acc.queue += metricValue(job, ['queued', 'queueSize', 'queue', 'pending'], 0);
      return acc;
    }, { network: 0, downloaded: 0, saved: 0, stored: 0, queue: 0 });

    const values = {
      network: formatRate(totals.network),
      downloaded: formatRate(totals.downloaded),
      saved: formatRate(totals.saved),
      stored: formatRate(totals.stored),
      queue: String(Math.round(totals.queue))
    };

    Object.keys(values).forEach(function(key) {
      const el = throughputEl.querySelector('[data-crawl-throughput-stat="' + key + '"]');
      if (el) el.textContent = values[key];
    });
  }

  // Friendly label for the coarse crawler phase (raw startup-stage ids collapse
  // to 'preparing'; the sitemap-fetch phase gets its own clear wording).
  function phaseLabel(phase) {
    var map = {
      sitemaps: 'fetching sitemaps',
      robots: 'reading robots.txt',
      crawling: 'crawling',
      preparing: 'preparing'
    };
    return map[phase] || phaseClass(phase);
  }

  function phaseClass(phase) {
    if (phase === 'sitemaps' || phase === 'robots' || phase === 'crawling') return phase;
    return 'preparing';
  }

  // Job ids can be UUIDs/task ids; slug them before use in id/aria/Set keys.
  function slugId(id) {
    return String(id).replace(/[^A-Za-z0-9_-]/g, '-');
  }

  function detailListHtml(items, emptyText) {
    if (!items || !items.length) return '<p class="detail-empty">' + escapeHtml(emptyText) + '</p>';
    var lis = items.map(function(item) {
      var text = typeof item === 'string' ? item : (item && (item.url || item.loc) ? (item.url || item.loc) : JSON.stringify(item));
      return '<li>' + escapeHtml(text) + '</li>';
    }).join('');
    return '<ul class="detail-list mono">' + lis + '</ul>';
  }

  function limitsHtml(perHostLimits) {
    var hosts = perHostLimits ? Object.keys(perHostLimits) : [];
    if (!hosts.length) return '<p class="detail-empty">No per-host limits reported</p>';
    var rows = hosts.map(function(h) {
      var l = perHostLimits[h] || {};
      return '<tr>'
        + '<td class="mono">' + escapeHtml(h) + '</td>'
        + '<td>' + escapeHtml(l.limit != null ? l.limit : '–') + '</td>'
        + '<td>' + escapeHtml(l.intervalMs != null ? l.intervalMs + 'ms' : '–') + '</td>'
        + '<td>' + escapeHtml(l.backoffMs != null ? l.backoffMs + 'ms' : '–') + '</td>'
        + '<td>' + (l.rateLimited ? '<span class="badge-limited">limited</span>' : '') + '</td>'
        + '</tr>';
    }).join('');
    return '<table class="detail-limits"><thead><tr><th>Host</th><th>rpm</th><th>interval</th><th>backoff</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function robotsHtml(robots) {
    if (!robots) return '<p class="detail-empty">robots.txt not loaded yet</p>';
    return '<p class="detail-meta">loaded: ' + (robots.loaded ? 'yes' : 'no')
      + (robots.source ? ' · source: ' + escapeHtml(robots.source) : '')
      + (robots.crawlDelaySeconds != null ? ' · crawl-delay: ' + escapeHtml(robots.crawlDelaySeconds) + 's' : '')
      + '</p>';
  }

  // The normally-hidden per-crawl detail: which sitemaps were harvested, the
  // pages currently downloading, per-host rate limits, and robots policy.
  function renderDetailCell(progress) {
    var sitemaps = progress.sitemaps || progress.sitemapUrls || [];
    var sitemapCount = progress.sitemapCount != null ? progress.sitemapCount : sitemaps.length;
    var sitemapEnqueued = progress.sitemapEnqueued != null ? progress.sitemapEnqueued : 0;
    var inflight = progress.currentDownloads || [];
    var inflightCount = progress.currentDownloadsCount != null ? progress.currentDownloadsCount : inflight.length;
    var sitemapHeader = '<p class="detail-meta">' + escapeHtml(sitemapCount) + ' sitemap(s) · ' + escapeHtml(sitemapEnqueued) + ' URLs enqueued</p>';
    return '<div class="detail-grid" role="region" aria-label="Crawl detail">'
      + '<div class="detail-block"><h4>Sitemaps</h4>' + sitemapHeader + detailListHtml(sitemaps, 'No sitemaps harvested') + '</div>'
      + '<div class="detail-block"><h4>In-flight (' + escapeHtml(inflightCount) + ')</h4>' + detailListHtml(inflight, 'None in flight') + '</div>'
      + '<div class="detail-block"><h4>Per-host limits</h4>' + limitsHtml(progress.perHostLimits) + '</div>'
      + '<div class="detail-block"><h4>Robots</h4>' + robotsHtml(progress.robots) + '</div>'
      + '</div>';
  }

  // Re-apply expansion after every full innerHTML rebuild — this is what keeps
  // an open detail panel open across the 3s refresh.
  function applyExpandedState() {
    if (!rowsEl) return;
    var detailRows = rowsEl.querySelectorAll('[data-detail-for]');
    for (var i = 0; i < detailRows.length; i++) {
      detailRows[i].hidden = !expandedJobs.has(detailRows[i].getAttribute('data-detail-for'));
    }
    var toggles = rowsEl.querySelectorAll('[data-detail-toggle]');
    for (var j = 0; j < toggles.length; j++) {
      var on = expandedJobs.has(toggles[j].getAttribute('data-detail-toggle'));
      toggles[j].setAttribute('aria-expanded', on ? 'true' : 'false');
      toggles[j].textContent = on ? '▾' : '▸';
    }
  }

  function renderJobs(jobs) {
    if (!rowsEl) return;
    if (!jobs.length) {
      rowsEl.innerHTML = '<tr><td colspan="9" class="empty">No active crawls.</td></tr>';
      return;
    }

    const liveIds = Object.create(null); // null-proto: job ids like 'toString' must not inherit truthy prototype members and escape pruning
    rowsEl.innerHTML = jobs.map(function(job) {
      const id = job.id || job.taskId || job.task_id || 'crawl';
      const key = slugId(id);
      liveIds[key] = true;
      const status = job.status || job.state || 'unknown';
      const metrics = job.metrics || {};
      const progress = job.progress || metrics || {};
      const visited = progress.visited || metrics.visited || job.visited || 0;
      const downloaded = progress.downloaded || metrics.downloaded || job.downloaded || 0;
      const errors = progress.errors || metrics.errors || job.errors || 0;
      const queue = progress.queued || progress.queue || progress.queueSize || metrics.queueSize || job.queue || job.pending || 0;
      const pct = Math.max(0, Math.min(100, progress.percentComplete || job.percentComplete || 0));
      const last = job.lastActivityAt || job.last_activity_at || progress.updatedAt || job.updatedAt || job.updated_at || '';
      const isRunning = status === 'running' || status === 'active';
      const phase = progress.phase || job.phase || '';
      const badge = (isRunning && phase)
        ? ' <span class="phase-badge" data-phase="' + escapeHtml(phaseClass(phase)) + '">' + escapeHtml(phaseLabel(phase)) + '</span>'
        : '';
      // Toggle caret lives INSIDE the Job cell so the column count stays 9 and
      // Visited stays the 4th <td> (Electron E2E asserts nth-child(4)).
      const mainRow = '<tr>'
        + '<td class="mono"><button type="button" class="detail-toggle" data-detail-toggle="' + escapeHtml(key) + '" aria-expanded="false" aria-controls="detail-' + escapeHtml(key) + '" aria-label="Toggle crawl detail" title="Show crawl detail">▸</button>' + escapeHtml(id) + '</td>'
        + '<td><span class="status-text">' + escapeHtml(status) + '</span>' + badge + '</td>'
        + '<td><div class="bar"><span style="width:' + pct + '%"></span></div></td>'
        + '<td>' + escapeHtml(visited) + '</td>'
        + '<td>' + escapeHtml(downloaded) + '</td>'
        + '<td>' + escapeHtml(errors) + '</td>'
        + '<td>' + escapeHtml(queue) + '</td>'
        + '<td>' + escapeHtml(last) + '</td>'
        + '<td><button type="button" data-refresh-crawls>Refresh</button></td>'
        + '</tr>';
      // Detail row renders AFTER its main row (never before) — protects the
      // nth-child(4)==Visited assertion; hidden until the caret is clicked.
      const detailRow = '<tr class="detail-row" id="detail-' + escapeHtml(key) + '" data-detail-for="' + escapeHtml(key) + '" hidden>'
        + '<td colspan="9" class="detail-cell">' + renderDetailCell(progress) + '</td>'
        + '</tr>';
      return mainRow + detailRow;
    }).join('');
    // Prune finished jobs so the Set can't grow unbounded, then re-open tracked rows.
    expandedJobs.forEach(function(jobKey) { if (!liveIds[jobKey]) expandedJobs.delete(jobKey); });
    applyExpandedState();
  }

  async function refreshJobs() {
    try {
      const payload = await fetchJson(config.jobsApiPath);
      const jobs = normalizeJobs(payload);
      renderJobs(jobs);
      renderThroughput(jobs);
      setText(statusEl, 'Jobs: ' + jobs.length + ' · telemetry: ' + config.eventsPath);
    } catch (err) {
      setText(statusEl, 'Unable to load jobs: ' + (err.message || err));
      renderJobs([]);
      renderThroughput([]);
    }
  }

  function markReady() {
    if (readyMarker) readyMarker.setAttribute('data-crawl-status-ready', 'true');
  }

  function readPositiveInt(input, fallback) {
    const value = input ? Number(input.value) : fallback;
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return Math.max(1, Math.trunc(value));
  }

  function setBatchMetric(name, value) {
    const metric = document.querySelector('[data-crawl-batch-stat="' + name + '"]');
    if (metric) metric.textContent = String(value);
  }

  function getBatchPlan() {
    const presetName = batchPresetSelect ? batchPresetSelect.value : 'news-10';
    const urls = (BATCH_PRESETS[presetName] || BATCH_PRESETS['news-10']).slice();
    const maxPages = readPositiveInt(batchMaxPagesInput, presetName === 'smoke-2' ? 25 : 1000);
    const maxDepth = readPositiveInt(batchMaxDepthInput, 6);
    const concurrency = Math.min(urls.length, readPositiveInt(batchConcurrencyInput, 5));
    const operation = operationSelect ? (operationSelect.value || 'basicArticleCrawl') : 'basicArticleCrawl';
    return {
      presetName,
      urls,
      operation,
      concurrency,
      overrides: { maxPages, maxDownloads: maxPages, maxDepth }
    };
  }

  function updateBatchSummary() {
    if (!batchForm) return;
    const plan = getBatchPlan();
    setBatchMetric('sites', plan.urls.length);
    if (batchStartButton) {
      batchStartButton.textContent = 'Start ' + plan.urls.length + ' x ' + plan.overrides.maxPages;
    }
  }

  async function runBatchWithConcurrency(items, concurrency, worker) {
    const results = new Array(items.length);
    let cursor = 0;
    async function pump() {
      while (true) {
        const itemIndex = cursor;
        cursor += 1;
        if (itemIndex >= items.length) return;
        results[itemIndex] = await worker(items[itemIndex], itemIndex);
      }
    }
    const workerCount = Math.max(1, Math.min(concurrency, items.length));
    await Promise.all(Array.from({ length: workerCount }, function() { return pump(); }));
    return results;
  }

  async function startBatch(event) {
    event.preventDefault();
    const plan = getBatchPlan();
    let accepted = 0;
    let failed = 0;
    setBatchMetric('accepted', accepted);
    setBatchMetric('failed', failed);
    if (batchStartButton) batchStartButton.disabled = true;
    setText(batchStatus, 'Starting ' + plan.urls.length + ' jobs with concurrency ' + plan.concurrency + '...');
    try {
      const results = await runBatchWithConcurrency(plan.urls, plan.concurrency, async function(startUrl) {
        try {
          const result = await fetchJson(config.apiBasePath + '/operations/' + encodeURIComponent(plan.operation) + '/start', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ startUrl, overrides: plan.overrides })
          });
          accepted += 1;
          setBatchMetric('accepted', accepted);
          refreshJobs();
          return { ok: true, startUrl, jobId: result && (result.jobId || (result.job && result.job.id)) };
        } catch (err) {
          failed += 1;
          setBatchMetric('failed', failed);
          return { ok: false, startUrl, error: err.message || String(err) };
        }
      });
      const failedItems = results.filter(function(result) { return !result || !result.ok; });
      setText(batchStatus, failedItems.length
        ? 'Batch accepted ' + accepted + '/' + plan.urls.length + '; failed ' + failedItems.length + '.'
        : 'Batch accepted ' + accepted + '/' + plan.urls.length + ' jobs.');
      refreshJobs();
    } finally {
      if (batchStartButton) batchStartButton.disabled = false;
    }
  }

  function fillSelect(select, values, selected) {
    if (!select) return;
    select.innerHTML = '';
    values.forEach(function(item) {
      const option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      if (item.value === selected) option.selected = true;
      select.appendChild(option);
    });
  }

  function seedStartControls() {
    fillSelect(profileSelect, [
      { value: '', label: 'Manual URL' },
      { value: 'guardian-news', label: 'Guardian news' },
      { value: 'simple-distributed-smoke', label: 'Simple distributed smoke' }
    ], '');
    fillSelect(operationSelect, [
      { value: 'intelligent', label: 'intelligent (loading…)' }
    ], 'intelligent');
    setText(operationLabel, operationSelect ? operationSelect.value : 'intelligent');
    setText(startStatus, 'Loading operations…');
  }

  async function loadOperations() {
    try {
      const payload = await fetchJson(config.apiBasePath + '/availability?operations=true&sequences=false');
      const ops = (payload && payload.availability && Array.isArray(payload.availability.operations))
        ? payload.availability.operations : [];
      if (!ops.length) { setText(startStatus, 'No operations available.'); return; }
      const items = ops.map(function(op) {
        const name = (typeof op === 'string') ? op : (op.name || op.id || '');
        return { value: name, label: name };
      }).filter(function(item) { return !!item.value; });
      const previous = operationSelect ? operationSelect.value : '';
      const preferenceOrder = ['basicArticleCrawl', 'intelligent', 'siteExplorer'];
      const preferred = preferenceOrder.find(function(name) {
        return items.some(function(i) { return i.value === name; });
      }) || (items[0] && items[0].value);
      fillSelect(operationSelect, items, previous && items.some(function(i) { return i.value === previous; }) ? previous : preferred);
      setText(operationLabel, operationSelect ? operationSelect.value : preferred);
      setText(startStatus, 'Ready to start a crawl. ' + items.length + ' operations available.');
    } catch (err) {
      setText(startStatus, 'Could not load operations: ' + (err.message || err));
    }
  }

  if (operationSelect) {
    operationSelect.addEventListener('change', function() {
      setText(operationLabel, operationSelect.value || 'intelligent');
    });
  }

  if (bootstrapButton) {
    bootstrapButton.addEventListener('click', function() {
      setText(startStatus, 'Guardian presets are already available in this UI profile list.');
    });
  }

  if (form) {
    form.addEventListener('submit', async function(event) {
      event.preventDefault();
      const startUrl = urlInput ? urlInput.value.trim() : '';
      const operation = operationSelect ? (operationSelect.value || 'intelligent') : 'intelligent';
      if (!startUrl) { setText(startStatus, 'Start URL is required.'); return; }
      const body = { startUrl: startUrl, overrides: {} };
      if (overridesText && overridesText.value.trim()) {
        try { body.overrides = JSON.parse(overridesText.value); }
        catch (err) { setText(startStatus, 'Invalid overrides JSON'); return; }
      }
      setText(startStatus, 'Starting ' + operation + '…');
      try {
        const result = await fetchJson(config.apiBasePath + '/operations/' + encodeURIComponent(operation) + '/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        });
        const jobId = result && (result.jobId || (result.job && result.job.id));
        setText(startStatus, 'Started' + (jobId ? ' — job ' + jobId : ''));
        refreshJobs();
      } catch (err) {
        setText(startStatus, err.message || 'Start failed');
      }
    });
  }

  if (batchForm) {
    batchForm.addEventListener('submit', startBatch);
  }

  [batchPresetSelect, batchMaxPagesInput, batchMaxDepthInput, batchConcurrencyInput].forEach(function(input) {
    if (input) input.addEventListener('change', updateBatchSummary);
    if (input) input.addEventListener('input', updateBatchSummary);
  });

  document.addEventListener('click', function(event) {
    if (event.target && event.target.matches('[data-refresh-crawls]')) { refreshJobs(); return; }
    var toggle = event.target && event.target.closest ? event.target.closest('[data-detail-toggle]') : null;
    if (toggle) {
      var key = toggle.getAttribute('data-detail-toggle');
      if (expandedJobs.has(key)) expandedJobs.delete(key); else expandedJobs.add(key);
      applyExpandedState();
    }
  });

  // ── Remote fetch strip (local coordination, remote page downloads) ──
  // Live-updated from crawl:progress telemetry events over SSE. The strip
  // stays hidden until a crawl reports remoteFetch telemetry.
  function setRemoteFetchStat(name, value) {
    if (!remoteFetchEl) return;
    const el = remoteFetchEl.querySelector('[data-crawl-remote-fetch-stat="' + name + '"]');
    if (el) el.textContent = String(value);
  }

  function renderRemoteFetch(rf) {
    if (!remoteFetchEl || !rf) return;
    remoteFetchEl.style.display = '';
    remoteFetchEl.setAttribute('data-crawl-remote-fetch-active', 'true');
    const health = rf.healthy === true ? '●' : (rf.healthy === false ? '●!' : '○');
    setRemoteFetchStat('health', health);
    remoteFetchEl.setAttribute('data-crawl-remote-fetch-health',
      rf.healthy === true ? 'healthy' : (rf.healthy === false ? 'unhealthy' : 'unknown'));
    setRemoteFetchStat('worker', 'Remote fetch: ' + (rf.workerUrl || 'worker'));
    setRemoteFetchStat('ok', rf.requestsOk != null ? rf.requestsOk : 0);
    setRemoteFetchStat('errors', rf.requestsError != null ? rf.requestsError : 0);
    setRemoteFetchStat('mb', ((rf.bytesTransferred || 0) / (1024 * 1024)).toFixed(2));
    setRemoteFetchStat('fallbacks', rf.localFallbacks != null ? rf.localFallbacks : 0);
    setRemoteFetchStat('lastMs', rf.lastFetchMs != null ? rf.lastFetchMs : '–');
  }

  function extractRemoteFetch(parsed) {
    // Frames arrive as {type:'crawl:telemetry', data:<event>} where <event>
    // is {type:'crawl:progress', data:{...fields, remoteFetch}}. Be tolerant
    // of intermediate shapes.
    let node = parsed;
    for (let depth = 0; node && typeof node === 'object' && depth < 4; depth++) {
      if (node.remoteFetch && typeof node.remoteFetch === 'object') return node.remoteFetch;
      node = node.data;
    }
    return null;
  }

  function initTelemetryStream() {
    if (!remoteFetchEl || typeof window.EventSource !== 'function') return;
    try {
      const source = new EventSource(config.eventsPath);
      source.onmessage = function(message) {
        try {
          const rf = extractRemoteFetch(JSON.parse(message.data));
          if (rf) renderRemoteFetch(rf);
        } catch (_) { /* non-JSON frames are fine to skip */ }
      };
      // EventSource auto-reconnects; nothing else needed.
    } catch (_) { /* SSE unavailable — strip stays hidden */ }
  }

  seedStartControls();
  updateBatchSummary();
  loadOperations().finally(markReady);
  refreshJobs();
  setInterval(refreshJobs, 3000);
  initTelemetryStream();
})();`;
}

module.exports = { buildCrawlStatusClientScript };