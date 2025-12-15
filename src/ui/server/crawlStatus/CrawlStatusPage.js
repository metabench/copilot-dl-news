'use strict';

const jsgui = require('jsgui3-html');

const { Control, Standard_Web_Page } = jsgui;
const Server_Page_Context = jsgui.Server_Page_Context || jsgui.Page_Context;

function buildCrawlStatusClientScript({ jobsApiPath, extraJobsApiPath, eventsPath, telemetryHistoryPath }) {
  const jobsApiPathJson = JSON.stringify(jobsApiPath);
  const extraJobsApiPathJson = JSON.stringify(extraJobsApiPath || null);
  const eventsPathJson = JSON.stringify(eventsPath);
  const telemetryHistoryPathJson = JSON.stringify(telemetryHistoryPath || null);

  // NOTE: Avoid nested template literals here because this file is loaded in Jest,
  // and nested backticks can be easy to break when embedding HTML fragments.
  return `
(function () {
  const jobsApiPath = ${jobsApiPathJson};
  const extraJobsApiPath = ${extraJobsApiPathJson};
  const eventsPath = ${eventsPathJson};
  const telemetryHistoryPath = ${telemetryHistoryPathJson};

  const elStatus = document.getElementById('status');
  const elRows = document.getElementById('rows');

  const jobs = new Map();

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function badgeClass(status) {
    const s = String(status || '').toLowerCase();
    if (s.includes('pause')) return 'paused';
    if (s.includes('run')) return 'running';
    if (s.includes('error') || s.includes('fail')) return 'error';
    if (s.includes('done') || s.includes('complete') || s.includes('stopped')) return 'done';
    return '';
  }

  function render() {
    const items = Array.from(jobs.values()).sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
    elRows.innerHTML = items
      .map((job) => {
        const id = escapeHtml(job.id);
        const url = escapeHtml(job.url || job.startUrl || '');
        const status = escapeHtml(job.status || job.stage || 'unknown');
        const badge = badgeClass(job.status || job.stage);
        const visited = Number(job.visited ?? job.metrics?.visited ?? 0);
        const downloaded = Number(job.downloaded ?? job.metrics?.downloaded ?? 0);
        const errors = Number(job.errors ?? job.metrics?.errors ?? 0);
        const queueSize = Number(job.queueSize ?? job.metrics?.queueSize ?? 0);
        const last = escapeHtml(job.lastActivityAt || job.metrics?._lastProgressWall || '');

        const detailHref = jobsApiPath + '/' + encodeURIComponent(job.id || '');
        return (
          '\n<tr>' +
          '\n  <td>' +
          '\n    <div class="mono">' + id + '</div>' +
          '\n    <div class="muted">' + (url ? url : '') + '</div>' +
          '\n    <div><a href="' + detailHref + '" class="muted">detail</a></div>' +
          '\n  </td>' +
          '\n  <td><span class="badge ' + badge + '">' + status + '</span></td>' +
          '\n  <td class="mono">' + visited + '</td>' +
          '\n  <td class="mono">' + downloaded + '</td>' +
          '\n  <td class="mono">' + errors + '</td>' +
          '\n  <td class="mono">' + queueSize + '</td>' +
          '\n  <td class="mono">' + last + '</td>' +
          '\n  <td class="row-actions">' +
          '\n    <button data-action="pause" data-id="' + id + '">Pause</button>' +
          '\n    <button data-action="resume" data-id="' + id + '">Resume</button>' +
          '\n    <button data-action="stop" data-id="' + id + '">Stop</button>' +
          '\n  </td>' +
          '\n</tr>\n'
        );
      })
      .join('');
  }

  function normalizeJobId(value) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text ? text : null;
  }

  function mergeJob(jobId, patch) {
    const prev = jobs.get(jobId) || { id: jobId };
    jobs.set(jobId, { ...prev, ...patch, id: jobId });
  }

  function applyTelemetryEvent(evt) {
    if (!evt || typeof evt !== 'object') return;
    const type = evt.type || '';
    const jobId = normalizeJobId(evt.jobId) || normalizeJobId(evt.data && evt.data.jobId);
    if (!jobId) return;

    const data = evt.data && typeof evt.data === 'object' ? evt.data : {};
    const ts = evt.timestamp || evt.timestampMs || null;

    if (type === 'crawl:progress') {
      mergeJob(jobId, {
        status: 'running',
        stage: 'running',
        visited: Number(data.visited ?? 0),
        downloaded: Number(data.downloaded ?? 0),
        errors: Number(data.errors ?? 0),
        queueSize: Number(data.queued ?? 0),
        lastActivityAt: ts
      });
      return;
    }

    if (type === 'crawl:started') {
      mergeJob(jobId, {
        status: 'running',
        stage: 'running',
        url: data.startUrl || null,
        crawlType: evt.crawlType || data.crawlType || null,
        lastActivityAt: ts
      });
      return;
    }

    if (type === 'crawl:paused') {
      mergeJob(jobId, { status: 'paused', stage: 'paused', lastActivityAt: ts });
      return;
    }

    if (type === 'crawl:resumed') {
      mergeJob(jobId, { status: 'running', stage: 'running', lastActivityAt: ts });
      return;
    }

    if (type === 'crawl:completed') {
      mergeJob(jobId, { status: 'done', stage: 'done', lastActivityAt: ts, lastExit: data });
      return;
    }

    if (type === 'crawl:failed') {
      mergeJob(jobId, { status: 'error', stage: 'error', lastActivityAt: ts, lastExit: data });
      return;
    }

    if (type === 'crawl:stopped') {
      mergeJob(jobId, { status: 'stopped', stage: 'stopped', lastActivityAt: ts, lastExit: data });
      return;
    }
  }

  async function refreshSnapshot() {
    try {
      const res = await fetch(jobsApiPath, { headers: { Accept: 'application/json' } });
      const payload = await res.json();
      if (!payload || !Array.isArray(payload.items)) {
        throw new Error('Invalid jobs payload');
      }

      for (const job of payload.items) {
        if (job && job.id) {
          jobs.set(job.id, job);
        }
      }

      let extraCount = 0;
      if (extraJobsApiPath) {
        try {
          const res2 = await fetch(extraJobsApiPath, { headers: { Accept: 'application/json' } });
          const payload2 = await res2.json();
          if (payload2 && Array.isArray(payload2.items)) {
            extraCount = payload2.items.length;
            for (const item of payload2.items) {
              if (item && item.id) {
                jobs.set(item.id, { ...item, inProcess: true });
              }
            }
          }
        } catch (_) {}
      }

      elStatus.textContent = 'Loaded ' + payload.items.length + ' job(s)' + (extraJobsApiPath ? (' + ' + extraCount + ' in-process job(s)') : '') + '. Waiting for live updates…';
      render();
    } catch (err) {
      elStatus.textContent = 'Failed to load jobs snapshot: ' + (err && err.message ? err.message : String(err));
    }
  }

  async function sendAction(id, action) {
    const job = jobs.get(id);
    const base = job && job.inProcess && extraJobsApiPath ? extraJobsApiPath : jobsApiPath;
    const endpoint = base + '/' + encodeURIComponent(id) + '/' + action;
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || String(res.status));
      }
      await refreshSnapshot();
    } catch (err) {
      elStatus.textContent = 'Action failed (' + action + ' ' + id + '): ' + (err && err.message ? err.message : String(err));
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('button[data-action]') : null;
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    if (!action || !id) return;
    sendAction(id, action);
  });

  refreshSnapshot();

  async function replayTelemetryHistory() {
    if (!telemetryHistoryPath) return;
    try {
      const res = await fetch(telemetryHistoryPath, { headers: { Accept: 'application/json' } });
      const payload = await res.json();
      if (payload && Array.isArray(payload.items)) {
        for (const item of payload.items) {
          applyTelemetryEvent(item);
        }
        render();
      }
    } catch (_) {}
  }

  replayTelemetryHistory();

  if (typeof EventSource === 'function') {
    const es = new EventSource(eventsPath);

    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload && payload.type === 'crawl:telemetry' && payload.data) {
          applyTelemetryEvent(payload.data);
          elStatus.textContent = 'Live update: ' + (payload.data.type || 'telemetry');
          render();
        }
      } catch (_) {}
    };

    es.onerror = () => {
      elStatus.textContent = 'Live updates disconnected (SSE error). Refresh to retry.';
    };
  } else {
    elStatus.textContent = 'This browser does not support EventSource; showing snapshots only.';
  }
})();
`;
}

class CrawlStatusPage extends Standard_Web_Page {
  constructor(spec = {}) {
    super(spec);
    this.__type_name = 'crawl_status_page';
    this.title = 'Crawl Status';

    this.jobsApiPath = spec.jobsApiPath || '/api/crawls';
    this.extraJobsApiPath = spec.extraJobsApiPath || null;
    this.eventsPath = spec.eventsPath || '/api/crawl-telemetry/events';
    this.telemetryHistoryPath = spec.telemetryHistoryPath || '/api/crawl-telemetry/history';
  }

  compose() {
    super.compose();

    if (this.head && this.head.title) {
      this.head.title.add('Crawl Status');
    }

    const ctx = this.context;

    const style = new Control({ context: ctx, tagName: 'style' });
    style.add(`
body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 16px; color: #111; }
header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
h1 { font-size: 18px; margin: 0; }
.meta { font-size: 12px; color: #555; }
.links a { margin-right: 12px; font-size: 12px; }
table { border-collapse: collapse; width: 100%; margin-top: 12px; }
th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; vertical-align: top; }
th { text-align: left; background: #fafafa; }
.badge { display: inline-block; padding: 2px 6px; border-radius: 10px; border: 1px solid #ddd; background: #fff; }
.badge.running { border-color: #7aa7ff; background: #eef4ff; }
.badge.paused { border-color: #ffb347; background: #fff3e6; }
.badge.done { border-color: #6cc070; background: #eefaf0; }
.badge.error { border-color: #ff7a7a; background: #ffecec; }
.muted { color: #666; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
.row-actions button { font-size: 12px; padding: 4px 8px; margin-right: 6px; }
.footer { margin-top: 12px; font-size: 12px; color: #666; }
`);
    this.head.add(style);

    const body = this.body || this;

    const header = new Control({ context: ctx, tagName: 'header' });
    body.add(header);

    const left = new Control({ context: ctx, tagName: 'div' });
    header.add(left);

    const h1 = new Control({ context: ctx, tagName: 'h1' });
    h1.add('Ongoing Crawl Status');
    left.add(h1);

    const meta = new Control({ context: ctx, tagName: 'div' });
    meta.dom.attributes.class = 'meta';
    meta.add('Live updates via ');
    const metaEvents = new Control({ context: ctx, tagName: 'span' });
    metaEvents.dom.attributes.class = 'mono';
    metaEvents.add(this.eventsPath);
    meta.add(metaEvents);
    meta.add(', snapshots via ');
    const metaJobs = new Control({ context: ctx, tagName: 'span' });
    metaJobs.dom.attributes.class = 'mono';
    metaJobs.add(this.jobsApiPath);
    meta.add(metaJobs);
    left.add(meta);

    const links = new Control({ context: ctx, tagName: 'div' });
    links.dom.attributes.class = 'links';
    header.add(links);

    const linkApiDocs = new Control({ context: ctx, tagName: 'a' });
    linkApiDocs.dom.attributes.href = '/api-docs';
    linkApiDocs.add('API docs');
    links.add(linkApiDocs);

    const linkJobs = new Control({ context: ctx, tagName: 'a' });
    linkJobs.dom.attributes.href = this.jobsApiPath;
    linkJobs.add('jobs JSON');
    links.add(linkJobs);

    if (this.extraJobsApiPath) {
      const linkJobs2 = new Control({ context: ctx, tagName: 'a' });
      linkJobs2.dom.attributes.href = this.extraJobsApiPath;
      linkJobs2.add('in-process jobs JSON');
      links.add(linkJobs2);
    }

    const linkEvents = new Control({ context: ctx, tagName: 'a' });
    linkEvents.dom.attributes.href = this.eventsPath;
    linkEvents.add('events stream');
    links.add(linkEvents);

    const linkHistory = new Control({ context: ctx, tagName: 'a' });
    linkHistory.dom.attributes.href = this.telemetryHistoryPath;
    linkHistory.add('telemetry history');
    links.add(linkHistory);

    const status = new Control({ context: ctx, tagName: 'div' });
    status.dom.attributes.id = 'status';
    status.dom.attributes.class = 'footer';
    status.add('Loading…');
    body.add(status);

    const table = new Control({ context: ctx, tagName: 'table' });
    body.add(table);

    const thead = new Control({ context: ctx, tagName: 'thead' });
    table.add(thead);

    const headRow = new Control({ context: ctx, tagName: 'tr' });
    thead.add(headRow);

    const columns = ['Job', 'Status', 'Visited', 'Downloaded', 'Errors', 'Queue', 'Last Activity', 'Controls'];
    for (const col of columns) {
      const th = new Control({ context: ctx, tagName: 'th' });
      th.add(col);
      headRow.add(th);
    }

    const tbody = new Control({ context: ctx, tagName: 'tbody' });
    tbody.dom.attributes.id = 'rows';
    table.add(tbody);

    const script = new Control({ context: ctx, tagName: 'script' });
    script.add(buildCrawlStatusClientScript({
      jobsApiPath: this.jobsApiPath,
      extraJobsApiPath: this.extraJobsApiPath,
      eventsPath: this.eventsPath,
      telemetryHistoryPath: this.telemetryHistoryPath
    }));
    body.add(script);
  }
}

function renderCrawlStatusPageHtml({
  jobsApiPath = '/api/crawls',
  extraJobsApiPath = null,
  eventsPath = '/api/crawl-telemetry/events',
  telemetryHistoryPath = '/api/crawl-telemetry/history',
  req,
  res
} = {}) {
  const context = new Server_Page_Context({
    req,
    res,
    pool: {}
  });

  const page = new CrawlStatusPage({
    context,
    jobsApiPath,
    extraJobsApiPath,
    eventsPath,
    telemetryHistoryPath
  });

  if (!page._composed) {
    page.compose();
  }

  return page.all_html_render();
}

module.exports = {
  CrawlStatusPage,
  renderCrawlStatusPageHtml
};
