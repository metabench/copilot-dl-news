const DEFAULT_QUEUE_STATE = {
  lastStable: null,
  lastRaw: null,
  lastUpdatedAt: 0,
  lastRenderedAt: 0,
  lastRenderedValue: undefined
};

function cloneQueueState() {
  return { ...DEFAULT_QUEUE_STATE };
}

function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function updateBadge(el, text) {
  if (!el) return;
  el.textContent = text;
}

function updateBadgeVisibility(el, show) {
  if (!el) return;
  el.style.display = show ? '' : 'none';
}

export function createMetricsView({ elements = {}, formatNumber }) {
  const {
    reqpsLabel,
    dlpsLabel,
    errpm,
    qsize,
    errs,
    qPoly,
    qTitle,
    cacheGauge,
    cacheInfo,
    reqpsPoly,
    reqpsTitle,
    dlpsPoly,
    dlpsTitle,
    badgeRobots,
    badgeSitemap,
    domRpm,
    domLim,
    domBk,
    domRl,
    eta
  } = elements;

  const queueState = cloneQueueState();
  const queueSeries = [];
  const reqpsSeries = [];
  const dlpsSeries = [];
  let trafficSamples = [];
  let lastProgress = null;
  let cacheHits = 0;

  function normalizeQueueSize(value) {
    if (value == null) return null;
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return null;
    return Math.round(num);
  }

  function scheduleQueueUpdate(rawValue) {
    const now = Date.now();
    const normalized = normalizeQueueSize(rawValue);
    if (normalized != null) {
      queueState.lastRaw = normalized;
      queueState.lastUpdatedAt = now;
      if (queueState.lastStable == null || Math.abs(queueState.lastStable - normalized) >= 2) {
        queueState.lastStable = normalized;
      } else if (queueState.lastStable !== normalized) {
        queueState.lastStable = normalized;
      }
    }
    const effective = queueState.lastStable != null
      ? queueState.lastStable
      : (queueState.lastRaw != null ? queueState.lastRaw : null);
    if (effective == null) return null;
    const shouldRender = queueState.lastRenderedAt === 0
      || (now - queueState.lastRenderedAt) >= 400
      || queueState.lastRenderedValue !== effective;
    if (shouldRender) {
      queueState.lastRenderedAt = now;
      queueState.lastRenderedValue = effective;
      return effective;
    }
    return queueState.lastRenderedValue;
  }

  function getQueueDisplayValue(fallback) {
    if (queueState.lastRenderedValue != null) return queueState.lastRenderedValue;
    if (queueState.lastStable != null) return queueState.lastStable;
    if (queueState.lastRaw != null) return queueState.lastRaw;
    return fallback;
  }

  function updateQueueSparkline(series) {
    if (!qPoly || !qTitle || series.length === 0) return;
    const svgW = 200;
    const svgH = 36;
    const min = 0;
    const max = Math.max(1, Math.max(...series));
    const n = series.length;
    const stepX = n > 1 ? (svgW - 2) / (n - 1) : 0;
    const points = series.map((v, idx) => {
      const x = 1 + idx * stepX;
      const y = svgH - 1 - ((v - min) / (max - min)) * (svgH - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    qPoly.setAttribute('points', points);
    const last = series[series.length - 1] ?? 0;
    qTitle.textContent = `queue latest=${last} samples=${series.length}`;
    qPoly.classList.toggle('spark-bad', last > 2000);
    qPoly.classList.toggle('spark-warn', last > 500 && last <= 2000);
    qPoly.classList.toggle('spark-ok', last <= 500);
  }

  function updateReqpsSparkline() {
    if (!reqpsPoly || !reqpsTitle || reqpsSeries.length === 0) return;
    const svgW = 200;
    const svgH = 36;
    const min = 0;
    const max = Math.max(1, Math.max(...reqpsSeries));
    const n = reqpsSeries.length;
    const stepX = n > 1 ? (svgW - 2) / (n - 1) : 0;
    const points = reqpsSeries.map((v, idx) => {
      const x = 1 + idx * stepX;
      const y = svgH - 1 - ((v - min) / (max - min)) * (svgH - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    reqpsPoly.setAttribute('points', points);
    const last = reqpsSeries[reqpsSeries.length - 1] ?? 0;
    reqpsTitle.textContent = `req/s latest=${last.toFixed(2)} samples=${reqpsSeries.length}`;
    reqpsPoly.classList.toggle('spark-bad', last < 0.1);
    reqpsPoly.classList.toggle('spark-warn', last >= 0.1 && last < 0.5);
    reqpsPoly.classList.toggle('spark-ok', last >= 0.5);
  }

  function updateDlpsSparkline() {
    if (!dlpsPoly || !dlpsTitle || dlpsSeries.length === 0) return;
    const svgW = 200;
    const svgH = 36;
    const min = 0;
    const max = Math.max(1, Math.max(...dlpsSeries));
    const n = dlpsSeries.length;
    const stepX = n > 1 ? (svgW - 2) / (n - 1) : 0;
    const points = dlpsSeries.map((v, idx) => {
      const x = 1 + idx * stepX;
      const y = svgH - 1 - ((v - min) / (max - min)) * (svgH - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    dlpsPoly.setAttribute('points', points);
    const last = dlpsSeries[dlpsSeries.length - 1] ?? 0;
    dlpsTitle.textContent = `dl/s (≤15s avg) latest=${last.toFixed(2)} samples=${dlpsSeries.length}`;
    dlpsPoly.classList.toggle('spark-bad', last < 0.1);
    dlpsPoly.classList.toggle('spark-warn', last >= 0.1 && last < 0.5);
    dlpsPoly.classList.toggle('spark-ok', last >= 0.5);
  }

  function summarizeCacheRatio(msWindow, now) {
    const cut = now - msWindow;
    let net = 0;
    let cache = 0;
    for (const sample of trafficSamples) {
      if (sample.t >= cut) {
        net += sample.net;
        cache += sample.cache;
      }
    }
    const total = net + cache;
    return total > 0 ? cache / total : 0;
  }

  function updateDownloadMetrics(now, queueSize) {
    const firstSampleTime = trafficSamples.length ? trafficSamples[0].t : now;
    const windowSeconds = Math.max(0.001, Math.min(15, (now - firstSampleTime) / 1000));
    const windowMs = windowSeconds * 1000;

    let netSum = 0;
    let bytesSum = 0;
    for (const sample of trafficSamples) {
      if (sample.t >= now - windowMs) {
        netSum += sample.net;
        bytesSum += sample.bytes || 0;
      }
    }

    const dlps = netSum / windowSeconds;
    const mbs = (bytesSum / windowSeconds) / (1024 * 1024);

    if (dlpsLabel) {
      dlpsLabel.textContent = `dl/s (≤15s avg): ${dlps.toFixed(2)} · MB/s (≤15s avg): ${mbs.toFixed(2)}`;
    }

    const q = Math.max(0, queueSize || (lastProgress ? (lastProgress.queueSize || 0) : 0));
    if (eta) {
      if (dlps > 0 && q > 0) {
        const seconds = Math.round(q / dlps);
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        eta.textContent = `ETA ~ ${minutes}m ${secs}s`;
      } else {
        eta.textContent = '';
      }
    }

    dlpsSeries.push(Math.max(0, dlps));
    if (dlpsSeries.length > 70) dlpsSeries.shift();
    updateDlpsSparkline();

    try {
      window.__dlps_series = dlpsSeries.slice();
    } catch (_) {}
  }

  function handleProgress(progress, now = Date.now()) {
    const safeNow = Number.isFinite(now) ? now : Date.now();
    if (!lastProgress) {
      lastProgress = {
        t: safeNow,
        visited: 0,
        downloaded: 0,
        errors: 0,
        bytes: 0,
        queueSize: 0
      };
    }

    const dt = Math.max(0.001, (safeNow - lastProgress.t) / 1000);
    const visitedDelta = (progress.visited || 0) - (lastProgress.visited || 0);
    const errorDelta = (progress.errors || 0) - (lastProgress.errors || 0);

    if (reqpsLabel) {
      reqpsLabel.textContent = `req/s: ${(visitedDelta / dt).toFixed(2)}`;
    }

    const errPerMin = ((errorDelta * (60 / dt)) || 0).toFixed(2);
    if (errpm) {
      errpm.textContent = `err/min: ${errPerMin}`;
    }

    const queueDisplay = scheduleQueueUpdate(progress.queueSize);
    const queueMetricVal = getQueueDisplayValue(progress.queueSize || 0);
    if (qsize && qsize.firstChild) {
      qsize.firstChild.nodeValue = `queue: ${queueMetricVal}`;
    }

    if (queueDisplay != null) {
      queueSeries.push(queueDisplay);
      if (queueSeries.length > 70) queueSeries.shift();
      updateQueueSparkline(queueSeries);
    }

    if (errs) {
      errs.textContent = `errors: ${progress.errors || 0}`;
    }

    if (badgeRobots && typeof progress.robotsLoaded === 'boolean') {
      badgeRobots.textContent = `robots: ${progress.robotsLoaded ? 'ok' : 'none'}`;
    }

    if (badgeSitemap && (progress.sitemapCount != null || progress.sitemapEnqueued != null)) {
      const count = progress.sitemapCount || 0;
      const enqueued = progress.sitemapEnqueued || 0;
      badgeSitemap.textContent = `sitemap: ${enqueued} / ${count}`;
    }

    if (progress.domainRpm != null && domRpm) {
      updateBadgeVisibility(domRpm, true);
      updateBadge(domRpm, `domain rpm: ${progress.domainRpm}`);
    }

    if (progress.domainLimit != null && domLim) {
      updateBadgeVisibility(domLim, true);
      const intervalHint = progress.domainIntervalMs != null ? ` (~${progress.domainIntervalMs}ms)` : '';
      domLim.textContent = `limit: ${progress.domainLimit}/min${intervalHint}`;
      domLim.title = intervalHint ? `limit per minute: ${progress.domainLimit}\ninterval: ~${progress.domainIntervalMs}ms` : `limit per minute: ${progress.domainLimit}`;
    }

    if (progress.domainBackoffMs != null && domBk) {
      updateBadgeVisibility(domBk, true);
      const secondsLeft = Math.ceil((progress.domainBackoffMs || 0) / 1000);
      if (secondsLeft > 0) {
        domBk.textContent = `backoff: ${secondsLeft}s`;
        domBk.title = `backoff remaining: ~${secondsLeft}s`;
      } else {
        domBk.textContent = 'backoff: -';
        domBk.title = '';
      }
    }

    if (domRl && progress.domainRateLimited != null) {
      const on = !!progress.domainRateLimited;
      updateBadgeVisibility(domRl, on);
      if (on) {
        domRl.title = 'Domain pacing/backoff active';
      } else {
        domRl.title = '';
      }
    }

    const prev = lastProgress;
    const dvTotal = (progress.visited || 0) - (prev.visited || 0);
    const downloadedDelta = Math.max(0, (progress.downloaded || 0) - (prev.downloaded || 0));
    const cacheDelta = Math.max(0, dvTotal - downloadedDelta);
    const bytesDelta = Math.max(0, (progress.bytes || 0) - (prev.bytes || 0));

    trafficSamples.push({ t: safeNow, net: downloadedDelta, cache: cacheDelta, bytes: bytesDelta });
    const cutoff = safeNow - (5 * 60 * 1000);
    trafficSamples = trafficSamples.filter((sample) => sample.t >= cutoff);

    if (cacheGauge) {
      const ratio1m = summarizeCacheRatio(60 * 1000, safeNow);
      const ratio5m = summarizeCacheRatio(5 * 60 * 1000, safeNow);
      cacheGauge.textContent = `cache: 1m ${(ratio1m * 100).toFixed(0)}% · 5m ${(ratio5m * 100).toFixed(0)}%`;
    }

    updateDownloadMetrics(safeNow, progress.queueSize || 0);

    reqpsSeries.push(Math.max(0, visitedDelta / dt));
    if (reqpsSeries.length > 70) reqpsSeries.shift();
    updateReqpsSparkline();

    lastProgress = {
      t: safeNow,
      visited: progress.visited || 0,
      downloaded: progress.downloaded || 0,
      errors: progress.errors || 0,
      bytes: progress.bytes || 0,
      queueSize: progress.queueSize || 0
    };

    try {
      window.__lastProgress = { ...lastProgress };
      window.__q_series = queueSeries.slice();
      window.__reqps_series = reqpsSeries.slice();
    } catch (_) {}

    return { queueDisplay };
  }

  async function refreshServerMetrics(fetchFn = fetch) {
    try {
      const response = await fetchFn('/metrics');
      if (!response.ok) return;
      const body = await response.text();
      const metrics = {};
      for (const line of body.split(/\n+/)) {
        const match = line.match(/^(crawler_[a-z_]+)\s+([0-9.]+)/);
        if (match) {
          metrics[match[1]] = parseFloat(match[2]);
        }
      }

      const reqPerSecond = metrics.crawler_requests_per_second ?? null;
      const downloadsPerSecond = metrics.crawler_downloads_per_second ?? null;
      const errPerMinute = metrics.crawler_error_rate_per_min ?? null;
      const queueSizeMetric = metrics.crawler_queue_size ?? null;
      const errorCount = metrics.crawler_errors_total ?? null;

      if (reqPerSecond != null) {
        reqpsLabel.textContent = `req/s: ${reqPerSecond.toFixed(2)}`;
        reqpsSeries.push(Math.max(0, reqPerSecond));
        if (reqpsSeries.length > 70) reqpsSeries.shift();
        updateReqpsSparkline();
      }

      if (downloadsPerSecond != null) {
        dlpsSeries.push(Math.max(0, downloadsPerSecond));
        if (dlpsSeries.length > 70) dlpsSeries.shift();
        updateDlpsSparkline();
      }

      if (errPerMinute != null && errpm) {
        errpm.textContent = `err/min: ${errPerMinute.toFixed(2)}`;
        errpm.classList.toggle('warn', errPerMinute > 1 && errPerMinute <= 5);
        errpm.classList.toggle('bad', errPerMinute > 5);
      }

      if (queueSizeMetric != null) {
        const displayVal = getQueueDisplayValue(queueSizeMetric);
        if (qsize && qsize.firstChild) {
          qsize.firstChild.nodeValue = `queue: ${displayVal}`;
        }
        qsize?.classList.toggle('warn', queueSizeMetric > 500 && queueSizeMetric <= 2000);
        qsize?.classList.toggle('bad', queueSizeMetric > 2000);
      }

      if (errorCount != null && errs) {
        errs.textContent = `errors: ${errorCount}`;
      }
    } catch (_) {
      // ignore network errors
    }
  }

  function handleCacheEvent(cacheEvent) {
    cacheHits += 1;
    if (!cacheInfo) return;
    const source = cacheEvent && cacheEvent.source ? cacheEvent.source : 'cache';
    const age = typeof cacheEvent?.ageSeconds === 'number' ? `${cacheEvent.ageSeconds}s` : 'unknown';
    const url = cacheEvent && cacheEvent.url ? cacheEvent.url : '';
    const suffix = url ? ` ${url}` : '';
    cacheInfo.textContent = `cached hits: ${cacheHits} (last from ${source}, age ${age})${suffix}`;
  }

  function startServerMetricsPolling(intervalMs = 2000, fetchFn) {
    return setInterval(() => {
      refreshServerMetrics(fetchFn);
    }, intervalMs);
  }

  function startDlpsTicker(intervalMs = 1000) {
    return setInterval(() => {
      updateDownloadMetrics(Date.now());
    }, intervalMs);
  }

  return {
    scheduleQueueUpdate,
    getQueueDisplayValue,
    handleProgress,
    refreshServerMetrics,
    startServerMetricsPolling,
    startDlpsTicker,
    handleCacheEvent,
    updateDownloadMetrics
  };
}
