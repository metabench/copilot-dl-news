'use strict';

/**
 * Remote-fetch telemetry rides the crawl progress pipeline:
 * core/Crawler.emitProgress → CrawlTelemetryBridge._normalizeProgressStats
 * → CrawlTelemetrySchema.createProgressEvent → SSE → crawl status page.
 * These tests pin the two normalization/schema hops.
 */

const { createProgressEvent, CRAWL_EVENT_TYPES } = require('../CrawlTelemetrySchema');
const { CrawlTelemetryBridge } = require('../CrawlTelemetryBridge');

const SAMPLE_REMOTE_FETCH = {
  enabled: true,
  workerUrl: 'http://worker.example:8081',
  healthy: true,
  requestsSent: 42,
  requestsOk: 40,
  requestsError: 2,
  bytesTransferred: 1048576,
  batchesSent: 42,
  localFallbacks: 1,
  lastFetchAt: '2026-07-11T12:00:00.000Z',
  lastFetchMs: 230,
  lastUrl: 'https://example.com/world/france'
};

describe('CrawlTelemetrySchema.createProgressEvent', () => {
  it('carries remoteFetch telemetry when present', () => {
    const event = createProgressEvent({ visited: 5, queued: 2, errors: 0, remoteFetch: SAMPLE_REMOTE_FETCH });
    expect(event.type).toBe(CRAWL_EVENT_TYPES.PROGRESS);
    expect(event.data.remoteFetch).toEqual(SAMPLE_REMOTE_FETCH);
  });

  it('defaults remoteFetch to null for local-fetch crawls', () => {
    const event = createProgressEvent({ visited: 5, queued: 2, errors: 0 });
    expect(event.data.remoteFetch).toBeNull();
  });
});

describe('CrawlTelemetryBridge._normalizeProgressStats', () => {
  const bridge = new CrawlTelemetryBridge({ broadcast: () => {} });

  it('passes remoteFetch through the base-crawler stats branch', () => {
    const normalized = bridge._normalizeProgressStats({
      stats: { pagesVisited: 10, pagesDownloaded: 8, errors: 1 },
      paused: false,
      remoteFetch: SAMPLE_REMOTE_FETCH
    });
    expect(normalized.remoteFetch).toEqual(SAMPLE_REMOTE_FETCH);
    expect(normalized.visited).toBe(10);
  });

  it('passes remoteFetch through the schema-shaped branch', () => {
    const normalized = bridge._normalizeProgressStats({
      visited: 10, queued: 3, errors: 0,
      remoteFetch: SAMPLE_REMOTE_FETCH
    });
    expect(normalized.remoteFetch).toEqual(SAMPLE_REMOTE_FETCH);
  });

  it('end-to-end: normalized stats produce a progress event with remoteFetch', () => {
    const normalized = bridge._normalizeProgressStats({
      stats: { pagesVisited: 1 },
      remoteFetch: SAMPLE_REMOTE_FETCH
    });
    const event = createProgressEvent(normalized);
    expect(event.data.remoteFetch.workerUrl).toBe('http://worker.example:8081');
    expect(event.data.remoteFetch.requestsOk).toBe(40);
  });
});
