'use strict';

const assert = require('assert');
const { renderCrawlStatusPageHtml } = require('../CrawlStatusPage');

function run() {
  const html = renderCrawlStatusPageHtml({
    jobsApiPath: '/api/crawls',
    extraJobsApiPath: '/api/v1/crawl/jobs',
    eventsPath: '/api/crawl-telemetry/events',
    telemetryHistoryPath: '/api/crawl-telemetry/history'
  });

  assert(html && typeof html === 'string', 'expected HTML string');

  assert(
    html.includes('/shared-remote-obs/RemoteObservableClientAdapters.js'),
    'expected RemoteObservable scripts to be included'
  );

  assert(
    html.includes('remoteObsBasePath') && (html.includes('crawl-telemetry') && html.includes('remote-obs')),
    'expected remote observable base path wiring to be present (may be HTML-escaped)'
  );

  console.log('✅ crawl status page includes remote observable client wiring');
}

if (require.main === module) {
  run();
}

module.exports = { run };
