'use strict';

/**
 * Check: the crawl status page renders the remote-fetch strip (live status
 * for "local coordination, remote page downloads" crawls) and ships the
 * client-side renderer + SSE subscription that keep it up to date.
 */

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

  // SSR panel markers
  assert(html.includes('data-crawl-remote-fetch-strip'), 'expected remote fetch strip marker');
  assert(html.includes('remote-fetch-strip'), 'expected remote fetch strip id');
  for (const stat of ['health', 'worker', 'ok', 'errors', 'mb', 'fallbacks', 'lastMs']) {
    assert(
      html.includes(`data-crawl-remote-fetch-stat="${stat}"`) ||
      html.includes(`data-crawl-remote-fetch-stat=&quot;${stat}&quot;`),
      `expected remote fetch stat selector: ${stat}`
    );
  }
  for (const label of ['Remote OK', 'Remote errors', 'Remote MB', 'Local fallbacks', 'Last fetch ms']) {
    assert(html.includes(label), `expected remote fetch label: ${label}`);
  }

  // Client wiring: renderer + SSE subscription + tolerant frame unwrapping
  assert(html.includes('renderRemoteFetch'), 'expected remote fetch client renderer');
  assert(html.includes('initTelemetryStream'), 'expected telemetry SSE subscription');
  assert(html.includes('extractRemoteFetch'), 'expected telemetry frame unwrapping helper');
  assert(html.includes('data-crawl-remote-fetch-active'), 'expected active-state attribute wiring');

  // Strip starts hidden — only crawls that report remoteFetch reveal it.
  assert(/display:none/.test(html), 'expected remote fetch strip to start hidden');

  console.log('✅ crawl status page includes the remote fetch telemetry strip');
}

if (require.main === module) {
  run();
}

module.exports = { run };
