'use strict';

const jsgui = require('jsgui3-html');

const { Control, Standard_Web_Page, String_Control } = jsgui;
const Server_Page_Context = jsgui.Server_Page_Context || jsgui.Page_Context;

// Extracted from this file's monolith — see companion modules
const { buildCrawlStatusClientScript } = require('./crawl-status-client');
const { CrawlBatchLauncherControl } = require('./controls/CrawlBatchLauncherControl');
const CRAWL_STATUS_CSS = require('./crawl-status-styles');

// ─────────────────────────────────────────────────────────────────
// CrawlStatusPage — SSR composition
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

    // Shared RemoteObservable browser modules (plain scripts; no bundler required).
    // These enable an Evented/Rx/async-iterator interface over the crawl telemetry stream.
    if (this.head) {
      const s1 = new Control({ context: ctx, tagName: 'script' });
      s1.dom.attributes.src = '/shared-remote-obs/RemoteObservableShared.js';
      this.head.add(s1);

      const s2 = new Control({ context: ctx, tagName: 'script' });
      s2.dom.attributes.src = '/shared-remote-obs/RemoteObservableClient.js';
      this.head.add(s2);

      const s3 = new Control({ context: ctx, tagName: 'script' });
      s3.dom.attributes.src = '/shared-remote-obs/RemoteObservableClientAdapters.js';
      this.head.add(s3);
    }

    const style = new Control({ context: ctx, tagName: 'style' });
    style.add(CRAWL_STATUS_CSS);
    this.head.add(style);

    const body = this.body || this;
    body.dom.attributes['data-screenshot-subject'] = 'crawl-status';
    body.dom.attributes['data-screenshot-route'] = '/crawl-status';

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

    const linkObserver = new Control({ context: ctx, tagName: 'a' });
    linkObserver.dom.attributes.href = '/crawl-observer';
    linkObserver.add('crawl observer');
    links.add(linkObserver);

    const startPanel = new Control({ context: ctx, tagName: 'section' });
    startPanel.dom.attributes.class = 'start';
    body.add(startPanel);

    const startTitle = new Control({ context: ctx, tagName: 'h2' });
    startTitle.add('Start crawl (in-process)');
    startPanel.add(startTitle);

    const form = new Control({ context: ctx, tagName: 'form' });
    form.dom.attributes.id = 'crawl-start-form';
    startPanel.add(form);

    const row = new Control({ context: ctx, tagName: 'div' });
    row.dom.attributes.class = 'start-row';
    form.add(row);

    const profileField = new Control({ context: ctx, tagName: 'div' });
    profileField.dom.attributes.class = 'start-field';
    row.add(profileField);
    const profileLabel = new Control({ context: ctx, tagName: 'label' });
    profileLabel.dom.attributes.for = 'crawl-profile-select';
    profileLabel.add('Profile');
    profileField.add(profileLabel);
    const profileSelect = new Control({ context: ctx, tagName: 'select' });
    profileSelect.dom.attributes.id = 'crawl-profile-select';
    const profileInitial = new Control({ context: ctx, tagName: 'option' });
    profileInitial.dom.attributes.value = '';
    profileInitial.add('Loading…');
    profileSelect.add(profileInitial);
    profileField.add(profileSelect);

    const urlField = new Control({ context: ctx, tagName: 'div' });
    urlField.dom.attributes.class = 'start-field';
    row.add(urlField);
    const urlLabel = new Control({ context: ctx, tagName: 'label' });
    urlLabel.dom.attributes.for = 'crawl-start-url';
    urlLabel.add('Start URL');
    urlField.add(urlLabel);
    const urlInput = new Control({ context: ctx, tagName: 'input' });
    urlInput.dom.attributes.id = 'crawl-start-url';
    urlInput.dom.attributes.type = 'url';
    urlInput.dom.attributes.placeholder = 'https://example.com';
    urlField.add(urlInput);

    const actions = new Control({ context: ctx, tagName: 'div' });
    actions.dom.attributes.class = 'start-actions';
    row.add(actions);
    const startBtn = new Control({ context: ctx, tagName: 'button' });
    startBtn.dom.attributes.type = 'submit';
    startBtn.add('Start');
    actions.add(startBtn);

    const presetsBtn = new Control({ context: ctx, tagName: 'button' });
    presetsBtn.dom.attributes.type = 'button';
    presetsBtn.dom.attributes.id = 'crawl-profile-bootstrap';
    presetsBtn.add('Install Guardian presets');
    actions.add(presetsBtn);

    const profilesLink = new Control({ context: ctx, tagName: 'a' });
    profilesLink.dom.attributes.href = '/crawler-profiles';
    profilesLink.dom.attributes.target = '_blank';
    profilesLink.dom.attributes.rel = 'noopener noreferrer';
    profilesLink.add('Profiles');
    actions.add(profilesLink);

    const metaRow = new Control({ context: ctx, tagName: 'div' });
    metaRow.dom.attributes.class = 'start-meta';
    metaRow.add('Operation: ');
    const opLabel = new Control({ context: ctx, tagName: 'span' });
    opLabel.dom.attributes.class = 'mono';
    opLabel.dom.attributes.id = 'crawl-start-operation-label';
    opLabel.add('Loading…');
    metaRow.add(opLabel);
    startPanel.add(metaRow);

    const advanced = new Control({ context: ctx, tagName: 'details' });
    advanced.dom.attributes.class = 'start-advanced';
    advanced.dom.attributes.id = 'crawl-start-advanced';
    startPanel.add(advanced);
    const advancedSummary = new Control({ context: ctx, tagName: 'summary' });
    advancedSummary.add('Advanced (operation + overrides)');
    advanced.add(advancedSummary);

    const advancedBody = new Control({ context: ctx, tagName: 'div' });
    advancedBody.dom.attributes.class = 'start-advanced-body';
    advanced.add(advancedBody);

    const opField = new Control({ context: ctx, tagName: 'div' });
    opField.dom.attributes.class = 'start-field';
    advancedBody.add(opField);
    const opSelectLabel = new Control({ context: ctx, tagName: 'label' });
    opSelectLabel.dom.attributes.for = 'crawl-start-operation';
    opSelectLabel.add('Operation');
    opField.add(opSelectLabel);
    const opSelect = new Control({ context: ctx, tagName: 'select' });
    opSelect.dom.attributes.id = 'crawl-start-operation';
    const opInitial = new Control({ context: ctx, tagName: 'option' });
    opInitial.dom.attributes.value = '';
    opInitial.add('Loading…');
    opSelect.add(opInitial);
    opField.add(opSelect);

    const ovField = new Control({ context: ctx, tagName: 'div' });
    ovField.dom.attributes.class = 'start-field';
    advancedBody.add(ovField);
    const ovLabel = new Control({ context: ctx, tagName: 'label' });
    ovLabel.dom.attributes.for = 'crawl-start-overrides';
    ovLabel.add('Overrides (JSON)');
    ovField.add(ovLabel);
    const ovText = new Control({ context: ctx, tagName: 'textarea' });
    ovText.dom.attributes.id = 'crawl-start-overrides';
    ovText.dom.attributes.placeholder = '{ }';
    ovField.add(ovText);

    const startStatus = new Control({ context: ctx, tagName: 'div' });
    startStatus.dom.attributes.id = 'crawl-start-status';
    startStatus.dom.attributes.class = 'start-status';
    startStatus.add('Loading operations…');
    startPanel.add(startStatus);

    const batchLauncher = new CrawlBatchLauncherControl({ context: ctx });
    batchLauncher.compose();
    body.add(batchLauncher);

    const status = new Control({ context: ctx, tagName: 'div' });
    status.dom.attributes.id = 'status';
    status.dom.attributes.class = 'footer';
    status.add('Loading…');
    body.add(status);

    const throughputStrip = new Control({ context: ctx, tagName: 'section' });
    throughputStrip.dom.attributes.id = 'throughput-strip';
    throughputStrip.dom.attributes.class = 'throughput-strip';
    throughputStrip.dom.attributes['data-screenshot-subject'] = 'crawl-status-throughput-strip';
    throughputStrip.dom.attributes['data-crawl-throughput-strip'] = 'true';
    body.add(throughputStrip);

    const throughputItems = [
      ['network', 'Network MB/s'],
      ['downloaded', 'Downloaded docs/s'],
      ['saved', 'Saved docs/s'],
      ['stored', 'Saved MB/s'],
      ['queue', 'Queue']
    ];
    for (const [key, label] of throughputItems) {
      const item = new Control({ context: ctx, tagName: 'div' });
      item.dom.attributes.class = 'throughput-item';
      throughputStrip.add(item);
      const value = new Control({ context: ctx, tagName: 'span' });
      value.dom.attributes['data-crawl-throughput-stat'] = key;
      value.add(key === 'queue' ? '0' : '0.00');
      item.add(value);
      const small = new Control({ context: ctx, tagName: 'small' });
      small.add(label);
      item.add(small);
    }

    const table = new Control({ context: ctx, tagName: 'table' });
    body.add(table);

    const thead = new Control({ context: ctx, tagName: 'thead' });
    table.add(thead);

    const headRow = new Control({ context: ctx, tagName: 'tr' });
    thead.add(headRow);

    const columns = ['Job', 'Status', 'Progress', 'Visited', 'Downloaded', 'Errors', 'Queue', 'Last Activity', 'Controls'];
    for (const col of columns) {
      const th = new Control({ context: ctx, tagName: 'th' });
      th.add(col);
      headRow.add(th);
    }

    const tbody = new Control({ context: ctx, tagName: 'tbody' });
    tbody.dom.attributes.id = 'rows';
    table.add(tbody);

    const readyMarker = new Control({ context: ctx, tagName: 'div' });
    readyMarker.dom.attributes.class = 'screenshot-ready-marker';
    readyMarker.dom.attributes['data-crawl-status-ready'] = 'false';
    readyMarker.dom.attributes['data-screenshot-ready'] = 'crawl-status';
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
