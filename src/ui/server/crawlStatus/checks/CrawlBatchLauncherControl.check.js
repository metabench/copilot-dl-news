'use strict';

const assert = require('assert');
const { renderCrawlStatusPageHtml } = require('../CrawlStatusPage');

const html = renderCrawlStatusPageHtml();

assert.match(html, /data-crawl-batch-launcher="true"/);
assert.match(html, /id="crawl-batch-form"/);
assert.match(html, /id="crawl-batch-start"/);
assert.match(html, /data-crawl-batch-stat="sites"/);
assert.match(html, /data-crawl-status-ready="false"/);
assert.match(html, /data-screenshot-subject="crawl-status"/);
assert.match(html, /data-crawl-throughput-strip="true"/);
assert.match(html, /data-crawl-throughput-stat="downloaded"/);
assert.match(html, /data-crawl-throughput-stat="saved"/);
assert.match(html, /data-crawl-throughput-stat="network"/);
assert.match(html, /\/api\/v1\/crawl/);
assert.match(html, /BATCH_PRESETS/);

console.log(html.slice(0, 1800));
console.log('\nCrawl batch launcher render check passed.');
