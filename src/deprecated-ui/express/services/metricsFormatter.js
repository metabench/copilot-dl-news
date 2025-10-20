"use strict";

function numberOr(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function boolToInt(value) {
  return value ? 1 : 0;
}

const EMPTY_BUFFER = Buffer.alloc(0);

function touchMetrics(metrics, { stage, paused, dirty = false, force = false } = {}) {
  if (!metrics || typeof metrics !== "object") return 0;
  const now = Date.now();
  let changed = !!dirty;

  if (stage !== undefined) {
    if (metrics.stage !== stage) {
      changed = true;
      try {
        metrics.stage = stage;
      } catch (_) {}
    }
  }

  if (paused !== undefined) {
    const nextPaused = !!paused;
    if (metrics.paused !== nextPaused) {
      changed = true;
      try {
        metrics.paused = nextPaused;
      } catch (_) {}
    }
  }

  if (!force && !changed) {
    return Number(metrics._version) || 0;
  }

  const nextVersion = (Number(metrics._version) || 0) + 1;
  metrics._version = nextVersion;
  metrics._updatedAt = now;
  delete metrics._metricsSnapshot;
  delete metrics._metricsSnapshotVersion;
  delete metrics._metricsSnapshotPaused;

  const listeners = metrics._metricsListeners;
  if (listeners) {
    const toNotify = listeners instanceof Set ? Array.from(listeners) : Array.isArray(listeners) ? listeners.slice() : [];
    for (const listener of toNotify) {
      try {
        listener({
          version: nextVersion,
          updatedAt: now,
          stage: metrics.stage,
          paused: metrics.paused === undefined ? false : !!metrics.paused
        });
      } catch (_) {}
    }
  }

  return nextVersion;
}

function renderPrometheusText(metrics = {}, paused = false) {
  const running = boolToInt(numberOr(metrics.running, 0) > 0);
  const lines = [];
  const push = (name, value, type = "gauge") => {
    if (value == null) return;
    lines.push(`# TYPE ${name} ${type}`);
    lines.push(`${name} ${value}`);
  };

  push("crawler_running", running);
  push("crawler_paused", boolToInt(paused || metrics.paused));
  push("crawler_visited_total", numberOr(metrics.visited, 0), "counter");
  push("crawler_downloaded_total", numberOr(metrics.downloaded, 0), "counter");
  push("crawler_found_total", numberOr(metrics.found, 0), "counter");
  push("crawler_saved_total", numberOr(metrics.saved, 0), "counter");
  push("crawler_errors_total", numberOr(metrics.errors, 0), "counter");
  push("crawler_queue_size", numberOr(metrics.queueSize, 0));
  push("crawler_requests_per_sec", numberOr(metrics.requestsPerSec, 0).toFixed(2));
  push("crawler_downloads_per_sec", numberOr(metrics.downloadsPerSec, 0).toFixed(2));
  push("crawler_bytes_per_sec", Math.round(numberOr(metrics.bytesPerSec, 0)));

  if (metrics.cacheHitRatio1m != null) {
    push("crawler_cache_hit_ratio_1m", numberOr(metrics.cacheHitRatio1m, 0).toFixed(3));
  }
  return lines.join("\n");
}

function createMetricsFormatter({ getMetrics, getLegacy }) {
  if (typeof getMetrics !== "function") {
    throw new Error("createMetricsFormatter requires getMetrics");
  }
  const getLegacySafe = typeof getLegacy === "function" ? getLegacy : (() => ({}));
  let cachedVersion = -1;
  let cachedPaused = null;
  let cachedText = "";
  let cachedUpdatedAt = 0;
  let cachedEtag = '"metrics-0"';
  let cachedBuffer = EMPTY_BUFFER;
  let attachedMetrics = null;

  const ensureSnapshot = (metrics, paused, updatedAt, version) => {
    const pausedFlag = paused ? 1 : 0;
    if (metrics && typeof metrics === "object") {
      const storedVersion = Number(metrics._metricsSnapshotVersion);
      const storedPaused = Number(metrics._metricsSnapshotPaused);
      if (metrics._metricsSnapshot && storedVersion === version && storedPaused === pausedFlag) {
        return metrics._metricsSnapshot;
      }
    }

    const text = renderPrometheusText(metrics, paused);
    const buffer = text ? Buffer.from(text, "utf8") : EMPTY_BUFFER;
    const snapshot = {
      text,
      buffer,
      etag: `"metrics-${version}-${pausedFlag}"`,
      lastModified: new Date(updatedAt || Date.now()).toUTCString(),
      version,
      paused: pausedFlag
    };
    if (metrics && typeof metrics === "object") {
      metrics._metricsSnapshot = snapshot;
      metrics._metricsSnapshotVersion = version;
      metrics._metricsSnapshotPaused = pausedFlag;
    }
    return snapshot;
  };

  const attachListener = (metrics) => {
    if (!metrics || typeof metrics !== "object") return;
    if (attachedMetrics === metrics && metrics._metricsFormatterListener) {
      return;
    }
    attachedMetrics = metrics;
    const listeners = metrics._metricsListeners instanceof Set ? metrics._metricsListeners : (() => {
      const set = new Set();
      metrics._metricsListeners = set;
      return set;
    })();
    const listener = () => {
      const legacy = getLegacySafe() || {};
      const paused = !!(legacy.paused ?? metrics.paused);
      const version = Number(metrics._version) || 0;
      const updatedAt = Number(metrics._updatedAt) || Date.now();
      const snapshot = ensureSnapshot(metrics, paused, updatedAt, version);
      cachedText = snapshot.text;
      cachedBuffer = snapshot.buffer;
      cachedEtag = snapshot.etag;
      cachedVersion = version;
      cachedPaused = paused;
      cachedUpdatedAt = updatedAt;
    };
    listeners.add(listener);
    metrics._metricsFormatterListener = listener;
    listener();
  };

  function getSnapshot() {
    const metrics = getMetrics() || {};
    attachListener(metrics);
    const legacy = getLegacySafe() || {};
    const version = Number(metrics._version) || 0;
    const paused = !!(legacy.paused ?? metrics.paused);
    const updatedAt = Number(metrics._updatedAt) || Date.now();

    if (version !== cachedVersion || paused !== cachedPaused) {
      const snapshot = ensureSnapshot(metrics, paused, updatedAt, version);
      cachedText = snapshot.text;
      cachedBuffer = snapshot.buffer;
      cachedVersion = version;
      cachedPaused = paused;
      cachedUpdatedAt = updatedAt;
      cachedEtag = snapshot.etag;
    }

    return {
      text: cachedText,
      buffer: cachedBuffer,
      etag: cachedEtag,
      lastModified: new Date(cachedUpdatedAt || Date.now()).toUTCString()
    };
  }

  return { getSnapshot };
}

module.exports = {
  createMetricsFormatter,
  renderPrometheusText,
  touchMetrics
};
