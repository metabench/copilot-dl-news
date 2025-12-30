'use strict';

const assert = require('assert');
const { createTelemetryEvent } = require('../src/crawler/telemetry/CrawlTelemetrySchema');

function parseJsonLines(text) {
  const out = [];
  const lines = String(text).split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue;
    out.push(JSON.parse(trimmed));
  }
  return out;
}

// Simulate the crawl process stdout we expect:
const progress = { type: 'progress', visited: 10, queued: 5, errors: 1, downloaded: 8, articles: 2 };
const fetchSuccessEvent = createTelemetryEvent('crawl:fetch:success', { url: 'https://example.com/a', status: 200 }, {
  jobId: 'job-1',
  crawlType: 'basic',
  source: 'crawl-cli',
  message: 'Fetched 200 example.com/a'
});
const telemetry = { type: 'telemetry', event: fetchSuccessEvent };

const stdout = [JSON.stringify(progress), JSON.stringify(telemetry)].join('\n') + '\n';
const parsed = parseJsonLines(stdout);

assert.strictEqual(parsed.length, 2);
assert.strictEqual(parsed[0].type, 'progress');
assert.strictEqual(parsed[1].type, 'telemetry');
assert.strictEqual(parsed[1].event.type, 'crawl:fetch:success');
assert.ok(parsed[1].event.timestamp || parsed[1].event.timestampMs);

console.log('OK: crawl telemetry stdout JSON line format');
