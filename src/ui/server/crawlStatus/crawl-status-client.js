'use strict';

function buildCrawlStatusClientScript({
  jobsApiPath = '/api/crawls',
  extraJobsApiPath = null,
  eventsPath = '/api/crawl-telemetry/events',
  telemetryHistoryPath = '/api/crawl-telemetry/history',
} = {}) {
  const config = JSON.stringify({
    jobsApiPath,
    extraJobsApiPath,
    eventsPath,
    telemetryHistoryPath,
    remoteObsBasePath: '/remote-obs/crawl-telemetry',
  });

  return `
(function() {
  'use strict';

  const config = ${config};
  window.crawlStatusConfig = config;

  const statusEl = document.getElementById('status');
  const rowsEl = document.getElementById('rows');
  const form = document.getElementById('crawl-start-form');
  const urlInput = document.getElementById('crawl-start-url');
  const profileSelect = document.getElementById('crawl-profile-select');
  const operationSelect = document.getElementById('crawl-start-operation');
  const operationLabel = document.getElementById('crawl-start-operation-label');
  const overridesText = document.getElementById('crawl-start-overrides');
  const startStatus = document.getElementById('crawl-start-status');
  const bootstrapButton = document.getElementById('crawl-profile-bootstrap');

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

  function renderJobs(jobs) {
    if (!rowsEl) return;
    if (!jobs.length) {
      rowsEl.innerHTML = '<tr><td colspan="9" class="empty">No active crawls.</td></tr>';
      return;
    }

    rowsEl.innerHTML = jobs.map(function(job) {
      const id = job.id || job.taskId || job.task_id || 'crawl';
      const status = job.status || job.state || 'unknown';
      const progress = job.progress || {};
      const visited = progress.visited || job.visited || 0;
      const downloaded = progress.downloaded || job.downloaded || 0;
      const errors = progress.errors || job.errors || 0;
      const queue = progress.queue || job.queue || job.pending || 0;
      const pct = Math.max(0, Math.min(100, progress.percentComplete || job.percentComplete || 0));
      const last = job.lastActivityAt || job.last_activity_at || job.updatedAt || job.updated_at || '';
      return '<tr>'
        + '<td class="mono">' + escapeHtml(id) + '</td>'
        + '<td>' + escapeHtml(status) + '</td>'
        + '<td><div class="bar"><span style="width:' + pct + '%"></span></div></td>'
        + '<td>' + escapeHtml(visited) + '</td>'
        + '<td>' + escapeHtml(downloaded) + '</td>'
        + '<td>' + escapeHtml(errors) + '</td>'
        + '<td>' + escapeHtml(queue) + '</td>'
        + '<td>' + escapeHtml(last) + '</td>'
        + '<td><button type="button" data-refresh-crawls>Refresh</button></td>'
        + '</tr>';
    }).join('');
  }

  async function refreshJobs() {
    try {
      const payload = await fetchJson(config.jobsApiPath);
      const jobs = normalizeJobs(payload);
      renderJobs(jobs);
      setText(statusEl, 'Jobs: ' + jobs.length + ' · telemetry: ' + config.eventsPath);
    } catch (err) {
      setText(statusEl, 'Unable to load jobs: ' + (err.message || err));
      renderJobs([]);
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
      { value: 'intelligent', label: 'intelligent' },
      { value: 'news', label: 'news' }
    ], 'intelligent');
    setText(operationLabel, operationSelect ? operationSelect.value : 'intelligent');
    setText(startStatus, 'Ready to start a crawl.');
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
      const body = {
        startUrl: urlInput ? urlInput.value.trim() : '',
        profile: profileSelect ? profileSelect.value : '',
        operation: operationSelect ? operationSelect.value : 'intelligent',
        overrides: {}
      };
      if (overridesText && overridesText.value.trim()) {
        try { body.overrides = JSON.parse(overridesText.value); }
        catch (err) { setText(startStatus, 'Invalid overrides JSON'); return; }
      }
      setText(startStatus, 'Starting...');
      try {
        await fetchJson('/api/crawls/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        });
        setText(startStatus, 'Started');
        refreshJobs();
      } catch (err) {
        setText(startStatus, err.message || 'Start failed');
      }
    });
  }

  document.addEventListener('click', function(event) {
    if (event.target && event.target.matches('[data-refresh-crawls]')) refreshJobs();
  });

  seedStartControls();
  refreshJobs();
})();`;
}

module.exports = { buildCrawlStatusClientScript };