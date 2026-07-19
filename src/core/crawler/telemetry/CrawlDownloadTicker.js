'use strict';

const { createTelemetryEvent } = require('./CrawlTelemetrySchema');

/**
 * CrawlDownloadTicker — the lean "something just downloaded" broadcaster.
 *
 * The bridge already emits batched `crawl:progress` snapshots (full stats). That
 * is more than a live counter needs. This ticker subscribes to the bridge, keeps
 * the last-seen cumulative counters per job, and — only when new pages/docs/bytes
 * actually arrive — publishes a small, specific `crawl:download` event carrying
 * just the increment: { pages, docs, bytes, stored }.
 *
 * That is the "publish small data only when needed" half of the contract: a
 * subscriber (e.g. the mini dashboard) can listen for `crawl:download` alone and
 * get an instant "+N" without parsing a full stats snapshot or polling the DB.
 *
 * Runs in the main process (alongside the SSE mount), so a new job's first
 * progress event just establishes a baseline (no spurious "+big" when a viewer
 * connects mid-crawl); subsequent events publish real deltas. Never throws —
 * telemetry must not be able to break a crawl.
 */
class CrawlDownloadTicker {
  constructor(bridge) {
    this.bridge = bridge;
    this._last = new Map(); // jobId -> { downloaded, saved, bytes, stored }
    this._unsub = null;
    if (bridge && typeof bridge.subscribe === 'function') {
      // replayHistory:false — we only care about live progress, not backlog.
      this._unsub = bridge.subscribe((e) => this._onEvent(e), { replayHistory: false });
    }
  }

  _num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

  _onEvent(event) {
    // Only react to progress. Ignore our own crawl:download (no re-entry) and all else.
    if (!event || event.type !== 'crawl:progress') return;
    const d = event.data || {};
    const jobId = event.jobId || 'default';
    const cur = {
      downloaded: this._num(d.downloaded),
      saved: this._num(d.saved),
      bytes: this._num(d.bytes),
      stored: this._num(d.bytesSavedCompressed)
    };

    // First sighting of a job → baseline only, so a mid-crawl connect doesn't fire a huge +N.
    if (!this._last.has(jobId)) { this._last.set(jobId, cur); return; }

    const prev = this._last.get(jobId);
    // Counters only grow within a job; clamp deltas to >= 0 to be safe against resets.
    const pages = Math.max(0, cur.downloaded - prev.downloaded);
    const docs = Math.max(0, cur.saved - prev.saved);
    const bytes = Math.max(0, cur.bytes - prev.bytes);
    const stored = Math.max(0, cur.stored - prev.stored);
    this._last.set(jobId, cur);

    if (pages > 0 || docs > 0 || bytes > 0) {
      try {
        // Build a schema-valid event (needs timestamp + a string type) so the
        // bridge's isValidTelemetryEvent gate passes and it broadcasts to SSE.
        this.bridge.emitEvent(createTelemetryEvent(
          'crawl:download',
          { pages, docs, bytes, stored },
          { jobId, source: 'download-ticker', message: `+${pages} pages` }
        ));
      } catch (_) { /* never break the crawl over a telemetry publish */ }
    }
  }

  destroy() {
    try { if (this._unsub) this._unsub(); } catch (_) { /* ignore */ }
    this._unsub = null;
    this._last.clear();
  }
}

module.exports = { CrawlDownloadTicker };
