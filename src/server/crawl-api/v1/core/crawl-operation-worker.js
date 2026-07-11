'use strict';

/**
 * Child-process runner for operation crawls (worker mode).
 *
 * Why: in-process crawl jobs starve the UI server's event loop — API calls
 * stall 15-20s+ under concurrent crawls (measured 2026-07-07, crawl-ops c3).
 * Worker mode moves the crawl into this forked process; crawler telemetry
 * events are forwarded to the parent over IPC, where they are replayed into
 * the real CrawlTelemetryBridge so the UI sees identical live progress.
 *
 * Protocol (IPC):
 *   parent -> child: { type: 'run', operationName, startUrl, overrides }
 *                    { type: 'stop' }
 *   child -> parent: { type: 'crawler-event', event, data }   (bridge event names)
 *                    { type: 'result', status, error? }
 *                    { type: 'fatal', error }
 */

const { createCrawlService } = require('../../core/crawlService');

// Keep in sync with CrawlTelemetryBridge.connectCrawler's event mappings.
const FORWARDED_EVENTS = [
  'started', 'stopped', 'paused', 'resumed', 'phase:changed', 'goal:satisfied',
  'budget:exhausted', 'url:visited', 'url:error', 'checkpoint:saved',
  'checkpoint:restored', 'finished', 'checkpoint', 'stalled', 'progress'
];

function send(msg) {
  try { if (process.send) process.send(msg); } catch (_) { /* parent gone */ }
}

function safeData(data) {
  try { return JSON.parse(JSON.stringify(data ?? null)); } catch (_) { return null; }
}

let crawlerRef = null;
let started = false;

process.on('message', (msg) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'stop') {
    if (crawlerRef && typeof crawlerRef.stopAsync === 'function') {
      crawlerRef.stopAsync({ timeoutMs: 8000, reason: 'stop' }).catch(() => {});
    } else if (crawlerRef && typeof crawlerRef.stop === 'function') {
      try { crawlerRef.stop(); } catch (_) {}
    }
    return;
  }

  if (msg.type !== 'run' || started) return;
  started = true;

  const telemetryShim = {
    connectCrawler(crawler) {
      crawlerRef = crawler;
      for (const event of FORWARDED_EVENTS) {
        try {
          crawler.on(event, (data) => send({ type: 'crawler-event', event, data: safeData(data) }));
        } catch (_) { /* non-emitter surface */ }
      }
      return () => {};
    }
  };

  Promise.resolve()
    .then(() => {
      const service = createCrawlService({ telemetryIntegration: telemetryShim });
      return service.runOperation({
        logger: console,
        operationName: msg.operationName,
        startUrl: msg.startUrl,
        overrides: msg.overrides || {}
      });
    })
    .then((result) => {
      const status = result && result.status === 'ok' ? 'ok' : 'failed';
      const reason = status === 'failed'
        ? (result && (typeof result.error === 'string' ? result.error : result.error?.message)) || 'operation returned non-ok status'
        : null;
      send({ type: 'result', status, error: reason });
    })
    .catch((err) => {
      send({ type: 'fatal', error: (err && err.message) || String(err) });
    })
    .finally(() => {
      setTimeout(() => process.exit(0), 250);
    });
});

// Never outlive an orphaning parent crash.
process.on('disconnect', () => process.exit(0));
