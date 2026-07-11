'use strict';

const jsgui = require('jsgui3-html');

const { Control, Standard_Web_Page, String_Control } = jsgui;
const Server_Page_Context = jsgui.Server_Page_Context || jsgui.Page_Context;

// Extracted from this file's monolith — see companion modules
const { buildCrawlStatusClientScript } = require('./crawl-status-client');
const { CrawlBatchLauncherControl } = require('./controls/CrawlBatchLauncherControl');
const CRAWL_STATUS_CSS = require('./crawl-status-styles');

// ─────────────────────────────────────────────────────────────────
// CrawlStatusPage — SSR composition (jsgui3, Visual Studio 2005 theme)
//
// Layout is classic mid-2000s IDE chrome, driven by the jsgui3-html
// Admin_Theme 'vs-2005' preset (--admin-* CSS variables):
//   ┌ caption bar ─────────────────────────────────────────────┐
//   ├ toolbar (the start-crawl form: profile · URL · Start …) ─┤
//   ├ advanced strip (collapsed <details>)                     │
//   ├ [tool window] Batch launch                               │
//   ├ [tool window] Crawl activity                             │
//   │    throughput strip · remote-fetch strip · jobs grid     │
//   └ status bar (live status text · quick links) ─────────────┘
//
// All element ids and data-* attributes are load-bearing: the client
// script (crawl-status-client.js), checks, and screenshot tooling key
// off them. Restyle freely; rename nothing.
// ─────────────────────────────────────────────────────────────────

class CrawlStatusPage extends Standard_Web_Page {
  constructor(spec = {}) {
    super(spec);
    this.__type_name = 'crawl_status_page';
    this.title = 'Crawl Status';

    this.jobsApiPath = spec.jobsApiPath || '/api/v1/crawl/jobs';
    this.apiBasePath = spec.apiBasePath || '/api/v1/crawl';
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
    const el = (tagName, attrs = {}, text = null) => {
      const c = new Control({ context: ctx, tagName });
      for (const [k, v] of Object.entries(attrs)) c.dom.attributes[k] = v;
      if (text !== null) c.add(text);
      return c;
    };

    // Shared RemoteObservable browser modules (plain scripts; no bundler required).
    // These enable an Evented/Rx/async-iterator interface over the crawl telemetry stream.
    if (this.head) {
      this.head.add(el('script', { src: '/shared-remote-obs/RemoteObservableShared.js' }));
      this.head.add(el('script', { src: '/shared-remote-obs/RemoteObservableClient.js' }));
      this.head.add(el('script', { src: '/shared-remote-obs/RemoteObservableClientAdapters.js' }));
    }

    // Theme variables (Admin_Theme presets, incl. 'vs-2005') + page styles.
    // NOTE: CSS must be added via String_Control (raw text). Plain .add()
    // HTML-escapes text nodes in current jsgui3-html — apostrophes become
    // &#x27; and /* comments */ become &#x2F;* … *&#x2F;, which corrupts the
    // stylesheet (each garbled comment swallows the following rule).
    const style = new Control({ context: ctx, tagName: 'style' });
    const adminThemeCss = jsgui.Admin_Theme && jsgui.Admin_Theme.css ? jsgui.Admin_Theme.css : '';
    style.add(new String_Control({ context: ctx, text: adminThemeCss + '\n' + CRAWL_STATUS_CSS }));
    this.head.add(style);

    const body = this.body || this;
    body.dom.attributes['data-screenshot-subject'] = 'crawl-status';
    body.dom.attributes['data-screenshot-route'] = '/crawl-status';
    body.dom.attributes['data-admin-theme'] = 'vs-2005';
    body.dom.attributes.class = 'vs-shell';

    // ── Caption bar ─────────────────────────────────────────────────
    const header = el('header', { class: 'vs-caption' });
    body.add(header);

    const captionLeft = el('div', { class: 'vs-caption-left' });
    header.add(captionLeft);
    captionLeft.add(el('span', { class: 'vs-caption-glyph', 'aria-hidden': 'true' }, '◉'));
    captionLeft.add(el('h1', {}, 'Ongoing Crawl Status'));

    const meta = el('div', { class: 'meta' });
    meta.add('live ');
    meta.add(el('span', { class: 'mono' }, this.eventsPath));
    meta.add(' · snapshots ');
    meta.add(el('span', { class: 'mono' }, this.jobsApiPath));
    header.add(meta);

    // ── Toolbar (the start-crawl form) ──────────────────────────────
    const form = el('form', { id: 'crawl-start-form', class: 'vs-toolbar' });
    body.add(form);

    const profileField = el('div', { class: 'start-field vs-tool-field' });
    form.add(profileField);
    profileField.add(el('label', { for: 'crawl-profile-select' }, 'Profile'));
    const profileSelect = el('select', { id: 'crawl-profile-select' });
    profileSelect.add(el('option', { value: '' }, 'Loading…'));
    profileField.add(profileSelect);

    const urlField = el('div', { class: 'start-field vs-tool-field vs-tool-field-grow' });
    form.add(urlField);
    urlField.add(el('label', { for: 'crawl-start-url' }, 'Start URL'));
    urlField.add(el('input', {
      id: 'crawl-start-url',
      type: 'url',
      placeholder: 'https://example.com'
    }));

    const actions = el('div', { class: 'start-actions vs-tool-actions' });
    form.add(actions);
    actions.add(el('button', { type: 'submit', class: 'vs-btn vs-btn-primary' }, 'Start'));
    actions.add(el('span', { class: 'vs-tool-sep', 'aria-hidden': 'true' }));
    actions.add(el('button', { type: 'button', id: 'crawl-profile-bootstrap', class: 'vs-btn' }, 'Install Guardian presets'));
    actions.add(el('a', {
      href: '/crawler-profiles',
      target: '_blank',
      rel: 'noopener noreferrer',
      class: 'vs-tool-link'
    }, 'Profiles'));

    // ── Info strip: operation, live form status, advanced options ───
    const infoStrip = el('div', { class: 'vs-infostrip' });
    body.add(infoStrip);

    const metaRow = el('div', { class: 'start-meta' });
    metaRow.add('Operation: ');
    metaRow.add(el('span', { class: 'mono', id: 'crawl-start-operation-label' }, 'Loading…'));
    infoStrip.add(metaRow);

    const startStatus = el('div', { id: 'crawl-start-status', class: 'start-status' }, 'Loading operations…');
    infoStrip.add(startStatus);

    const advanced = el('details', { class: 'start-advanced', id: 'crawl-start-advanced' });
    body.add(advanced);
    advanced.add(el('summary', {}, 'Advanced (operation + overrides)'));

    const advancedBody = el('div', { class: 'start-advanced-body' });
    advanced.add(advancedBody);

    const opField = el('div', { class: 'start-field' });
    advancedBody.add(opField);
    opField.add(el('label', { for: 'crawl-start-operation' }, 'Operation'));
    const opSelect = el('select', { id: 'crawl-start-operation' });
    opSelect.add(el('option', { value: '' }, 'Loading…'));
    opField.add(opSelect);

    const ovField = el('div', { class: 'start-field' });
    advancedBody.add(ovField);
    ovField.add(el('label', { for: 'crawl-start-overrides' }, 'Overrides (JSON)'));
    ovField.add(el('textarea', { id: 'crawl-start-overrides', placeholder: '{ }' }));

    // ── Tool window: batch launch ───────────────────────────────────
    const batchWindow = el('section', { class: 'tool-window tool-window-batch' });
    body.add(batchWindow);
    const batchLauncher = new CrawlBatchLauncherControl({ context: ctx });
    batchLauncher.compose();
    batchWindow.add(batchLauncher);

    // ── Tool window: crawl activity ─────────────────────────────────
    const activityWindow = el('section', { class: 'tool-window tool-window-activity' });
    body.add(activityWindow);
    activityWindow.add(el('div', { class: 'tool-window-header' }, 'Crawl activity'));

    const activityBody = el('div', { class: 'tool-window-body' });
    activityWindow.add(activityBody);

    const throughputStrip = el('section', {
      id: 'throughput-strip',
      class: 'throughput-strip',
      'data-screenshot-subject': 'crawl-status-throughput-strip',
      'data-crawl-throughput-strip': 'true'
    });
    activityBody.add(throughputStrip);

    const throughputItems = [
      ['network', 'Network MB/s'],
      ['downloaded', 'Downloaded docs/s'],
      ['saved', 'Saved docs/s'],
      ['stored', 'Saved MB/s'],
      ['queue', 'Queue']
    ];
    for (const [key, label] of throughputItems) {
      const item = el('div', { class: 'throughput-item' });
      throughputStrip.add(item);
      const value = el('span', { 'data-crawl-throughput-stat': key }, key === 'queue' ? '0' : '0.00');
      item.add(value);
      item.add(el('small', {}, label));
    }

    // Remote fetch strip — live status of the "local coordination, remote
    // page downloads" mode (Oracle fetch worker). Populated from the
    // remoteFetch section of crawl:progress telemetry events; hidden while
    // crawls fetch locally. See src/core/crawler/adapters/remoteFetch.js.
    const remoteFetchStrip = el('section', {
      id: 'remote-fetch-strip',
      class: 'throughput-strip remote-fetch-strip',
      'data-screenshot-subject': 'crawl-status-remote-fetch-strip',
      'data-crawl-remote-fetch-strip': 'true',
      style: 'display:none'
    });
    activityBody.add(remoteFetchStrip);

    const remoteFetchTitle = el('div', { class: 'throughput-item remote-fetch-title' });
    remoteFetchStrip.add(remoteFetchTitle);
    remoteFetchTitle.add(el('span', { 'data-crawl-remote-fetch-stat': 'health' }, '○'));
    remoteFetchTitle.add(el('small', { 'data-crawl-remote-fetch-stat': 'worker' }, 'Remote fetch'));

    const remoteFetchItems = [
      ['ok', 'Remote OK'],
      ['errors', 'Remote errors'],
      ['mb', 'Remote MB'],
      ['fallbacks', 'Local fallbacks'],
      ['lastMs', 'Last fetch ms']
    ];
    for (const [key, label] of remoteFetchItems) {
      const item = el('div', { class: 'throughput-item' });
      remoteFetchStrip.add(item);
      item.add(el('span', { 'data-crawl-remote-fetch-stat': key }, '0'));
      item.add(el('small', {}, label));
    }

    // Jobs grid (VS2005 list-view styling via CSS)
    const tableWrap = el('div', { class: 'table-wrap' });
    activityBody.add(tableWrap);

    const table = el('table', {});
    tableWrap.add(table);

    const thead = el('thead', {});
    table.add(thead);
    const headRow = el('tr', {});
    thead.add(headRow);
    const columns = ['Job', 'Status', 'Progress', 'Visited', 'Downloaded', 'Errors', 'Queue', 'Last Activity', 'Controls'];
    for (const col of columns) {
      headRow.add(el('th', {}, col));
    }
    const tbody = el('tbody', { id: 'rows' });
    table.add(tbody);

    // ── Status bar ──────────────────────────────────────────────────
    const statusBar = el('footer', { class: 'vs-statusbar' });
    body.add(statusBar);

    const status = el('div', { id: 'status', class: 'footer vs-statusbar-pane vs-statusbar-main' }, 'Loading…');
    statusBar.add(status);

    const links = el('div', { class: 'links vs-statusbar-pane' });
    statusBar.add(links);
    links.add(el('a', { href: '/api-docs' }, 'API docs'));
    links.add(el('a', { href: this.jobsApiPath }, 'jobs JSON'));
    if (this.extraJobsApiPath) {
      links.add(el('a', { href: this.extraJobsApiPath }, 'in-process jobs JSON'));
    }
    links.add(el('a', { href: this.eventsPath }, 'events stream'));
    links.add(el('a', { href: this.telemetryHistoryPath }, 'telemetry history'));
    links.add(el('a', { href: '/crawl-observer' }, 'crawl observer'));

    const readyMarker = el('div', {
      class: 'screenshot-ready-marker',
      'data-crawl-status-ready': 'false',
      'data-screenshot-ready': 'crawl-status'
    });
    body.add(readyMarker);

    const script = new Control({ context: ctx, tagName: 'script' });
    script.add(new String_Control({
      context: ctx,
      text: buildCrawlStatusClientScript({
        jobsApiPath: this.jobsApiPath,
        apiBasePath: this.apiBasePath,
        extraJobsApiPath: this.extraJobsApiPath,
        eventsPath: this.eventsPath,
        telemetryHistoryPath: this.telemetryHistoryPath
      })
    }));
    body.add(script);
  }
}

function renderCrawlStatusPageHtml({
  jobsApiPath = '/api/v1/crawl/jobs',
  apiBasePath = '/api/v1/crawl',
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
    apiBasePath,
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
