'use strict';

/**
 * jobProgress — normalize live crawler progress events into the per-job
 * `progress` snapshot consumed by the crawl status page (jobs table +
 * throughput strip), including inside the Electron unified app.
 *
 * The crawl-status client reads: progress.visited / downloaded / errors /
 * queue|queueSize / saved, rate keys (docsDownloadedPerSec, docsSavedPerSec,
 * networkMbPerSec, savedMbPerSec) and remoteFetch (remote download telemetry).
 * See src/ui/server/crawlStatus/crawl-status-client.js (metricValue,
 * renderJobs, renderThroughput).
 *
 * Input payloads are core/Crawler 'progress' events:
 *   { stats: { pagesVisited, pagesDownloaded, articlesFound, articlesSaved,
 *              errors, bytesDownloaded, bytesSaved, ... },
 *     paused, abortRequested, remoteFetch?, ...metadata (may carry queueSize) }
 * Schema-shaped payloads ({ visited, downloaded, ... }) are accepted too.
 *
 * Rates are computed from deltas between consecutive events (minimum window
 * MIN_RATE_WINDOW_MS to avoid noisy spikes); the last computed rates are
 * retained between windows so the UI doesn't flicker to zero.
 */

const MIN_RATE_WINDOW_MS = 250;

function toCount(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function createJobProgressTracker({ now = () => Date.now() } = {}) {
  let last = null; // { at, downloaded, saved, bytes, bytesSaved }
  let rates = {
    docsDownloadedPerSec: null,
    docsSavedPerSec: null,
    networkMbPerSec: null,
    savedMbPerSec: null
  };
  let snapshot = null;

  function record(payload) {
    if (!payload || typeof payload !== 'object') return snapshot;
    const stats = payload.stats && typeof payload.stats === 'object' ? payload.stats : payload;

    const visited = toCount(stats.pagesVisited ?? stats.visited);
    const downloaded = toCount(stats.pagesDownloaded ?? stats.downloaded);
    const saved = toCount(stats.articlesSaved ?? stats.saved);
    const articles = toCount(stats.articlesFound ?? stats.articles);
    const errors = toCount(stats.errors);
    const bytes = toCount(stats.bytesDownloaded ?? stats.bytes);
    const bytesSaved = toCount(stats.bytesSaved);
    const queued = payload.queued ?? payload.queueSize ?? stats.queued ?? stats.queueSize ?? null;

    const at = now();
    if (last) {
      const dtMs = at - last.at;
      if (dtMs >= MIN_RATE_WINDOW_MS) {
        const dtSec = dtMs / 1000;
        rates = {
          docsDownloadedPerSec: Math.max(0, (downloaded - last.downloaded) / dtSec),
          docsSavedPerSec: Math.max(0, (saved - last.saved) / dtSec),
          networkMbPerSec: Math.max(0, (bytes - last.bytes) / dtSec / (1024 * 1024)),
          savedMbPerSec: Math.max(0, (bytesSaved - last.bytesSaved) / dtSec / (1024 * 1024))
        };
        last = { at, downloaded, saved, bytes, bytesSaved };
      }
    } else {
      last = { at, downloaded, saved, bytes, bytesSaved };
    }

    snapshot = {
      visited,
      downloaded,
      saved,
      articles,
      errors,
      bytes,
      bytesSaved,
      ...(queued != null ? { queued: toCount(queued) } : {}),
      ...rates,
      paused: Boolean(payload.paused),
      remoteFetch: payload.remoteFetch && typeof payload.remoteFetch === 'object'
        ? payload.remoteFetch
        : null,
      updatedAt: new Date(at).toISOString()
    };
    return snapshot;
  }

  function getSnapshot() {
    return snapshot;
  }

  return { record, getSnapshot };
}

module.exports = { createJobProgressTracker, MIN_RATE_WINDOW_MS };
