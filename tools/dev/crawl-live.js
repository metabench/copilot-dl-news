#!/usr/bin/env node
'use strict';

/**
 * crawl-live.js - Live local crawl status from task_events.
 *
 * Shows recent downloads plus rolling throughput windows for:
 * - downloaded documents per second
 * - saved documents per second
 * - network MB/s
 * - saved MB/s
 *
 * Also writes replayable run artifacts to tmp/crawl-runs/<taskId>/ by default:
 * - metrics.ndjson
 * - summary.json
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const MB = 1024 * 1024;
const DEFAULT_WINDOWS = Object.freeze([
  { key: '5s', label: '5s', ms: 5 * 1000 },
  { key: '1m', label: '1m', ms: 60 * 1000 },
  { key: 'lifetime', label: 'lifetime', ms: null }
]);

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    help: false,
    taskId: null,
    last: 5,
    follow: true,
    interval: 2000,
    json: false,
    metrics: false,
    writeArtifacts: true,
    artifactRoot: path.join(process.cwd(), 'tmp', 'crawl-runs'),
    db: path.join(process.cwd(), 'data', 'news.db'),
    windows: DEFAULT_WINDOWS.slice()
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '-h':
      case '--help':
        flags.help = true;
        break;
      case '--task':
      case '--task-id':
      case '-t':
        flags.taskId = next;
        i++;
        break;
      case '--latest':
        flags.taskId = null;
        break;
      case '--last':
      case '-n':
        flags.last = positiveInt(next, flags.last);
        i++;
        break;
      case '--no-follow':
        flags.follow = false;
        break;
      case '--interval':
        flags.interval = Math.max(250, positiveInt(next, flags.interval));
        i++;
        break;
      case '--json':
        flags.json = true;
        break;
      case '--metrics':
      case '-m':
      case '--dashboard':
        flags.metrics = true;
        break;
      case '--no-artifacts':
        flags.writeArtifacts = false;
        break;
      case '--artifacts':
      case '--artifact-root':
        flags.artifactRoot = path.resolve(next);
        i++;
        break;
      case '--window': {
        const parsed = parseWindow(next);
        if (parsed && !flags.windows.some(w => w.key === parsed.key)) {
          flags.windows = flags.windows.filter(w => w.key !== 'lifetime').concat(parsed, DEFAULT_WINDOWS[2]);
        }
        i++;
        break;
      }
      case '--db':
        flags.db = next;
        i++;
        break;
    }
  }

  return flags;
}

function positiveInt(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.trunc(numeric);
}

function parseWindow(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  const multiplier = unit === 'ms' ? 1 : unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 1000;
  const ms = Math.max(250, Math.round(amount * multiplier));
  const key = unit === 'ms' ? `${ms}ms` : `${amount}${unit}`;
  return { key, label: key, ms };
}

function getLatestTask(db) {
  return db.prepare(`
    SELECT DISTINCT task_id, task_type, MIN(ts) as started, MAX(ts) as latest
    FROM task_events
    WHERE task_id LIKE 'mini-crawl-%' OR task_id LIKE 'crawl-%'
    GROUP BY task_id
    ORDER BY started DESC
    LIMIT 1
  `).get();
}

function getTaskInfo(db, taskId) {
  return db.prepare(`
    SELECT task_id, task_type, MIN(ts) as started, MAX(ts) as latest, COUNT(*) as event_count
    FROM task_events
    WHERE task_id = ?
    GROUP BY task_id, task_type
    ORDER BY event_count DESC
    LIMIT 1
  `).get(taskId) || { task_id: taskId, task_type: 'crawl', started: null, latest: null, event_count: 0 };
}

function parsePayload(row) {
  if (!row) return null;
  try {
    const payload = JSON.parse(row.payload);
    return { payload, ts: row.ts };
  } catch {
    return null;
  }
}

function getProgress(db, taskId) {
  const row = db.prepare(`
    SELECT payload, ts
    FROM task_events
    WHERE task_id = ? AND event_type = 'crawl:progress'
    ORDER BY seq DESC
    LIMIT 1
  `).get(taskId);
  const parsed = parsePayload(row);
  return parsed ? { ...parsed.payload, ts: parsed.ts } : null;
}

function getProgressHistory(db, taskId, limit = 1000) {
  const rows = db.prepare(`
    SELECT payload, ts
    FROM task_events
    WHERE task_id = ? AND event_type = 'crawl:progress'
    ORDER BY seq DESC
    LIMIT ?
  `).all(taskId, limit);

  return rows
    .map(parsePayload)
    .filter(Boolean)
    .map(row => normalizeProgressSnapshot(row.payload, row.ts))
    .filter(Boolean)
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

function getDownloadEvents(db, taskId, limit = 1000) {
  const rows = db.prepare(`
    SELECT payload, ts
    FROM task_events
    WHERE task_id = ? AND event_type = 'crawl:url:batch'
    ORDER BY seq DESC
    LIMIT ?
  `).all(taskId, limit);

  const downloads = [];
  for (const row of rows) {
    const parsed = parsePayload(row);
    if (!parsed) continue;
    const batch = parsed.payload;
    const events = Array.isArray(batch.events) ? batch.events : [];
    for (const event of events) {
      const data = event && event.data ? event.data : {};
      if (!data.url) continue;
      const timestamp = event.timestamp || parsed.ts;
      downloads.push({
        url: data.url,
        status: data.httpStatus,
        bytes: finiteNumber(data.contentLength ?? data.bytes, 0),
        durationMs: finiteNumber(data.durationMs, 0),
        cached: !!data.cached,
        ts: timestamp,
        timestampMs: toTimestampMs(timestamp)
      });
    }
  }

  return downloads
    .filter(item => Number.isFinite(item.timestampMs))
    .sort((a, b) => b.timestampMs - a.timestampMs);
}

function getCompletionStatus(db, taskId) {
  const row = db.prepare(`
    SELECT payload, ts
    FROM task_events
    WHERE task_id = ? AND event_type = 'crawl:complete'
    ORDER BY seq DESC
    LIMIT 1
  `).get(taskId);
  const parsed = parsePayload(row);
  return parsed ? { ...parsed.payload, ts: parsed.ts } : null;
}

function getErrorCount(db, taskId) {
  const row = db.prepare(`
    SELECT COUNT(*) as cnt
    FROM task_events
    WHERE task_id = ? AND severity = 'error'
  `).get(taskId);
  return row && Number.isFinite(row.cnt) ? row.cnt : 0;
}

function normalizeProgressSnapshot(progress, ts) {
  if (!progress || typeof progress !== 'object') return null;
  const timestampMs = toTimestampMs(progress.ts || progress.timestamp || ts);
  if (!Number.isFinite(timestampMs)) return null;

  return {
    ts: progress.ts || progress.timestamp || ts,
    timestampMs,
    visited: nonNegativeNumber(progress.visited ?? progress.pagesVisited, 0),
    downloadedDocs: nonNegativeNumber(progress.downloaded ?? progress.pagesDownloaded ?? progress.visited, 0),
    savedDocs: nonNegativeNumber(progress.saved ?? progress.articlesSaved ?? progress.articles, 0),
    downloadedBytes: nonNegativeNumber(progress.bytes ?? progress.bytesDownloaded, 0),
    savedBytes: nonNegativeNumber(progress.bytesSaved, 0),
    errors: nonNegativeNumber(progress.errors, 0),
    queue: nonNegativeNumber(progress.queued ?? progress.queueSize ?? progress.queue, 0),
    current: {
      docsDownloadedPerSec: finiteNumber(progress.docsDownloadedPerSec ?? progress.docsDownloadedPerSecond ?? progress.downloadedDocsPerSecond ?? progress.requestsPerSec, null),
      docsSavedPerSec: finiteNumber(progress.docsSavedPerSec ?? progress.docsSavedPerSecond ?? progress.savedDocsPerSecond, null),
      networkMbPerSec: finiteNumber(progress.networkMbPerSec ?? progress.networkMbPerSecond, null),
      savedMbPerSec: finiteNumber(progress.savedMbPerSec ?? progress.savedMbPerSecond, null)
    }
  };
}

function toTimestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value) return NaN;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function finiteNumber(value, fallback) {
  const numeric = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(numeric) ? numeric : fallback;
}

function nonNegativeNumber(value, fallback) {
  const numeric = finiteNumber(value, fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric >= 0 ? numeric : fallback;
}

function emptyWindow(label) {
  return {
    label,
    seconds: 0,
    downloadedDocs: 0,
    savedDocs: 0,
    downloadedBytes: 0,
    savedBytes: 0,
    docsDownloadedPerSec: 0,
    docsSavedPerSec: 0,
    networkMbPerSec: 0,
    savedMbPerSec: 0
  };
}

function calculateThroughputMetrics({ progress, progressHistory, downloads, completion, taskInfo, windows }) {
  const now = Date.now();
  const snapshots = Array.isArray(progressHistory) ? progressHistory : [];
  const latestSnapshot = snapshots[snapshots.length - 1] || normalizeProgressSnapshot(progress, progress && progress.ts);
  const completionStats = completion && completion.stats ? completion.stats : null;
  const latestTotals = latestSnapshot || normalizeProgressSnapshot(completionStats, completion && completion.ts) || null;

  const totals = {
    downloadedDocs: nonNegativeNumber(
      latestTotals && latestTotals.downloadedDocs,
      nonNegativeNumber(completionStats && (completionStats.pagesDownloaded ?? completionStats.downloaded), downloads.length)
    ),
    savedDocs: nonNegativeNumber(
      latestTotals && latestTotals.savedDocs,
      nonNegativeNumber(completionStats && (completionStats.articlesSaved ?? completionStats.saved), 0)
    ),
    downloadedBytes: nonNegativeNumber(
      latestTotals && latestTotals.downloadedBytes,
      nonNegativeNumber(completionStats && (completionStats.bytesDownloaded ?? completionStats.bytes), sumBytes(downloads))
    ),
    savedBytes: nonNegativeNumber(
      latestTotals && latestTotals.savedBytes,
      nonNegativeNumber(completionStats && completionStats.bytesSaved, 0)
    ),
    queue: nonNegativeNumber(latestTotals && latestTotals.queue, nonNegativeNumber(progress && (progress.queued ?? progress.queueSize ?? progress.queue), 0)),
    errors: nonNegativeNumber(latestTotals && latestTotals.errors, nonNegativeNumber(progress && progress.errors, 0))
  };

  const startedMs = toTimestampMs(taskInfo && taskInfo.started);
  const windowMetrics = {};
  for (const windowSpec of windows) {
    const metric = buildWindowMetric({ windowSpec, snapshots, downloads, now, startedMs, latestTotals });
    windowMetrics[windowSpec.key] = metric;
  }

  const current = chooseCurrentWindow(windowMetrics, latestTotals);
  const avgPageSizeKb = downloads.length ? (sumBytes(downloads) / downloads.length) / 1024 : 0;
  const durations = downloads.map(d => d.durationMs).filter(value => Number.isFinite(value) && value > 0);
  const avgDurationMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const latestActivityMs = latestActivityTimestamp(downloads, latestTotals);
  const stallDetected = Number.isFinite(latestActivityMs) ? (now - latestActivityMs) > 30000 : false;

  return {
    generatedAt: new Date(now).toISOString(),
    totals,
    windows: windowMetrics,
    current,
    avgPageSizeKb: round(avgPageSizeKb, 1),
    avgDurationMs: Math.round(avgDurationMs),
    eta: buildEta(totals.queue, current.docsDownloadedPerSec || current.docsSavedPerSec),
    stallDetected,
    latestActivityAt: Number.isFinite(latestActivityMs) ? new Date(latestActivityMs).toISOString() : null
  };
}

function buildWindowMetric({ windowSpec, snapshots, downloads, now, startedMs, latestTotals }) {
  const metric = emptyWindow(windowSpec.label);
  const latest = latestTotals || snapshots[snapshots.length - 1] || null;
  const isLifetime = windowSpec.ms == null;

  if (latest) {
    if (isLifetime) {
      const start = Number.isFinite(startedMs) ? startedMs : (snapshots[0] ? snapshots[0].timestampMs : latest.timestampMs);
      const seconds = Math.max(0, (latest.timestampMs - start) / 1000);
      applyWindowDeltas(metric, seconds, {
        downloadedDocs: latest.downloadedDocs,
        savedDocs: latest.savedDocs,
        downloadedBytes: latest.downloadedBytes,
        savedBytes: latest.savedBytes
      });
    } else {
      const cutoff = now - windowSpec.ms;
      if (latest.timestampMs >= cutoff) {
        const baseline = findBaselineSnapshot(snapshots, cutoff) || snapshots.find(s => s.timestampMs >= cutoff) || null;
        if (baseline && baseline !== latest) {
          const seconds = Math.max(0, (latest.timestampMs - baseline.timestampMs) / 1000);
          applyWindowDeltas(metric, seconds, {
            downloadedDocs: latest.downloadedDocs - baseline.downloadedDocs,
            savedDocs: latest.savedDocs - baseline.savedDocs,
            downloadedBytes: latest.downloadedBytes - baseline.downloadedBytes,
            savedBytes: latest.savedBytes - baseline.savedBytes
          });
        }
      }
    }
  }

  applyDownloadFallback(metric, downloads, windowSpec, now, startedMs);
  return metric;
}

function findBaselineSnapshot(snapshots, cutoff) {
  let baseline = null;
  for (const snapshot of snapshots) {
    if (snapshot.timestampMs <= cutoff) baseline = snapshot;
    else break;
  }
  return baseline;
}

function applyWindowDeltas(metric, seconds, values) {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  metric.seconds = round(seconds, 1);
  metric.downloadedDocs = Math.max(0, Math.round(values.downloadedDocs || 0));
  metric.savedDocs = Math.max(0, Math.round(values.savedDocs || 0));
  metric.downloadedBytes = Math.max(0, Math.round(values.downloadedBytes || 0));
  metric.savedBytes = Math.max(0, Math.round(values.savedBytes || 0));
  metric.docsDownloadedPerSec = round(metric.downloadedDocs / seconds, 2);
  metric.docsSavedPerSec = round(metric.savedDocs / seconds, 2);
  metric.networkMbPerSec = round((metric.downloadedBytes / MB) / seconds, 2);
  metric.savedMbPerSec = round((metric.savedBytes / MB) / seconds, 2);
}

function applyDownloadFallback(metric, downloads, windowSpec, now, startedMs) {
  if (metric.downloadedDocs > 0 || !downloads.length) return;

  const isLifetime = windowSpec.ms == null;
  const cutoff = isLifetime ? (Number.isFinite(startedMs) ? startedMs : 0) : now - windowSpec.ms;
  const selected = downloads.filter(item => item.timestampMs >= cutoff);
  if (!selected.length) return;

  const newest = Math.max(...selected.map(item => item.timestampMs));
  const oldest = isLifetime && Number.isFinite(startedMs)
    ? startedMs
    : Math.min(...selected.map(item => item.timestampMs));
  const seconds = isLifetime
    ? Math.max(1, (newest - oldest) / 1000)
    : Math.max(1, windowSpec.ms / 1000);
  applyWindowDeltas(metric, seconds, {
    downloadedDocs: selected.length,
    savedDocs: 0,
    downloadedBytes: sumBytes(selected),
    savedBytes: 0
  });
}

function chooseCurrentWindow(windowMetrics, latestTotals) {
  const preferred = windowMetrics['5s'] || Object.values(windowMetrics)[0] || emptyWindow('current');
  const current = { ...preferred };
  if (latestTotals && latestTotals.current) {
    current.docsDownloadedPerSec = nonNegativeNumber(latestTotals.current.docsDownloadedPerSec, current.docsDownloadedPerSec);
    current.docsSavedPerSec = nonNegativeNumber(latestTotals.current.docsSavedPerSec, current.docsSavedPerSec);
    current.networkMbPerSec = nonNegativeNumber(latestTotals.current.networkMbPerSec, current.networkMbPerSec);
    current.savedMbPerSec = nonNegativeNumber(latestTotals.current.savedMbPerSec, current.savedMbPerSec);
  }
  return current;
}

function buildEta(queueSize, docsPerSec) {
  if (!queueSize || !docsPerSec) return null;
  const secondsRemaining = queueSize / docsPerSec;
  if (!Number.isFinite(secondsRemaining) || secondsRemaining <= 0) return null;
  const estimatedCompletion = new Date(Date.now() + secondsRemaining * 1000);
  return {
    secondsRemaining: Math.round(secondsRemaining),
    minutesRemaining: Math.round(secondsRemaining / 60),
    estimatedCompletion: estimatedCompletion.toLocaleTimeString('en-GB', { hour12: false })
  };
}

function latestActivityTimestamp(downloads, latestTotals) {
  const downloadMs = downloads.length ? Math.max(...downloads.map(item => item.timestampMs)) : NaN;
  const progressMs = latestTotals ? latestTotals.timestampMs : NaN;
  return Math.max(Number.isFinite(downloadMs) ? downloadMs : 0, Number.isFinite(progressMs) ? progressMs : 0) || NaN;
}

function sumBytes(items) {
  return items.reduce((sum, item) => sum + (Number.isFinite(item.bytes) ? item.bytes : 0), 0);
}

function round(value, digits) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatBytes(bytes) {
  if (bytes == null || !Number.isFinite(bytes)) return '-';
  if (bytes < 1024) return `${Math.round(bytes)}B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / MB).toFixed(2)}MB`;
}

function formatRate(value, suffix) {
  const numeric = Number.isFinite(value) ? value : 0;
  return `${numeric.toFixed(2)} ${suffix}`;
}

function formatTime(isoStr) {
  if (!isoStr) return '-';
  try {
    return new Date(isoStr).toLocaleTimeString('en-GB', { hour12: false });
  } catch {
    return '-';
  }
}

function truncateUrl(url, maxLen = 72) {
  if (!url) return '-';
  if (url.length <= maxLen) return url;
  return '...' + url.slice(-(maxLen - 3));
}

function clearScreen() {
  process.stdout.write('\x1B[2J\x1B[0f');
}

function display(data, flags) {
  if (flags.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (flags.follow) clearScreen();

  const { taskId, progress, downloads, completion, errors, metrics, artifacts } = data;
  const totals = metrics.totals;
  const status = completion ? 'complete' : metrics.stallDetected ? 'stalled' : progress ? 'running' : 'starting';
  const visited = progress ? nonNegativeNumber(progress.visited ?? progress.pagesVisited, 0) : 0;

  console.log(`\nCrawl Live: ${taskId}`);
  console.log(`Status: ${status} | visited ${visited} | downloaded ${totals.downloadedDocs} | saved ${totals.savedDocs} | errors ${errors} | queue ${totals.queue}`);

  if (flags.metrics) {
    console.log('\nThroughput');
    for (const windowSpec of flags.windows) {
      const windowMetric = metrics.windows[windowSpec.key] || emptyWindow(windowSpec.label);
      console.log(
        `  ${windowMetric.label.padEnd(8)} `
        + `downloaded ${formatRate(windowMetric.docsDownloadedPerSec, 'docs/s').padEnd(15)} `
        + `saved ${formatRate(windowMetric.docsSavedPerSec, 'docs/s').padEnd(15)} `
        + `network ${formatRate(windowMetric.networkMbPerSec, 'MB/s').padEnd(13)} `
        + `stored ${formatRate(windowMetric.savedMbPerSec, 'MB/s')}`
      );
    }
    console.log(`  totals   downloaded ${totals.downloadedDocs} docs / ${formatBytes(totals.downloadedBytes)} | saved ${totals.savedDocs} docs / ${formatBytes(totals.savedBytes)}`);
    console.log(`  average  page ${metrics.avgPageSizeKb.toFixed(1)}KB | fetch ${metrics.avgDurationMs}ms`);
    if (metrics.eta) {
      console.log(`  eta      ~${metrics.eta.minutesRemaining} min (${metrics.eta.estimatedCompletion})`);
    }
    if (metrics.stallDetected) {
      console.log('  warning  no download/progress activity in the last 30s');
    }
  }

  console.log(`\nRecent downloads (${downloads.length})`);
  if (!downloads.length) {
    console.log('  (none yet)');
  } else {
    for (const item of downloads) {
      const statusText = item.cached ? 'cached' : String(item.status || '-');
      console.log(`  ${formatTime(item.ts)} | ${statusText.padStart(6)} | ${formatBytes(item.bytes).padStart(8)} | ${truncateUrl(item.url)}`);
    }
  }

  if (artifacts && artifacts.dir) {
    console.log(`\nArtifacts: ${artifacts.dir}`);
  }

  if (flags.follow && !completion) {
    console.log(`\nPolling every ${(flags.interval / 1000).toFixed(1)}s. Press Ctrl+C to stop.`);
    if (!flags.metrics) console.log('Tip: Use --metrics for docs/sec and MB/s windows.');
  }
  console.log('');
}

function artifactDirFor(flags, taskId) {
  return path.join(flags.artifactRoot, sanitizeSegment(taskId));
}

function sanitizeSegment(value) {
  return String(value || 'crawl').replace(/[^a-z0-9._-]+/gi, '-').slice(0, 160);
}

function writeArtifacts(data, flags) {
  if (!flags.writeArtifacts) return null;
  const dir = artifactDirFor(flags, data.taskId);
  fs.mkdirSync(dir, { recursive: true });

  const metricEntry = {
    ts: data.metrics.generatedAt,
    taskId: data.taskId,
    status: data.completion ? 'complete' : data.metrics.stallDetected ? 'stalled' : 'running',
    metrics: data.metrics
  };
  fs.appendFileSync(path.join(dir, 'metrics.ndjson'), JSON.stringify(metricEntry) + '\n');

  const summary = {
    generatedAt: data.metrics.generatedAt,
    taskId: data.taskId,
    taskInfo: data.taskInfo,
    progress: data.progress,
    completion: data.completion,
    errors: data.errors,
    metrics: data.metrics,
    recentDownloads: data.downloads
  };
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
  return { dir, summaryPath: path.join(dir, 'summary.json'), metricsPath: path.join(dir, 'metrics.ndjson') };
}

function printHelp() {
  console.log(`
crawl-live - live local crawl status from task_events

Usage:
  node tools/dev/crawl-live.js --latest --metrics
  node tools/dev/crawl-live.js --task <id> --metrics
  node tools/dev/crawl-live.js --task <id> --json --no-follow

Options:
  --latest              Watch the latest crawl task (default)
  --task, -t <id>       Task ID to monitor
  --last, -n <num>      Number of recent downloads to show (default: 5)
  --metrics, -m         Show 5s, 1m, and lifetime throughput windows
  --window <duration>   Add a custom rolling window, e.g. 10s, 5m
  --no-follow           One-shot mode
  --interval <ms>       Poll interval (default: 2000)
  --json                Output JSON snapshots
  --artifacts <dir>     Artifact root (default: tmp/crawl-runs)
  --no-artifacts        Disable summary.json and metrics.ndjson writes
  --db <path>           Database path (default: data/news.db)
  -h, --help            Show this help

Metrics include:
  downloaded docs/s, saved docs/s, network MB/s, saved MB/s,
  totals, ETA, average page size, average fetch duration, and stall detection.
`);
}

function main() {
  const flags = parseArgs();
  if (flags.help) {
    printHelp();
    return;
  }

  if (!fs.existsSync(flags.db)) {
    console.error(`Database not found: ${flags.db}`);
    process.exit(1);
  }

  const db = new Database(flags.db, { readonly: true });
  let taskId = flags.taskId;
  if (!taskId) {
    const latest = getLatestTask(db);
    if (!latest) {
      console.log('No crawl tasks found in database.');
      db.close();
      process.exit(1);
    }
    taskId = latest.task_id;
  }

  const poll = () => {
    const taskInfo = getTaskInfo(db, taskId);
    const progress = getProgress(db, taskId);
    const progressHistory = getProgressHistory(db, taskId, 1000);
    const allDownloads = getDownloadEvents(db, taskId, flags.metrics ? 1000 : Math.max(flags.last, 50));
    const downloads = allDownloads.slice(0, flags.last);
    const completion = getCompletionStatus(db, taskId);
    const errors = getErrorCount(db, taskId);
    const metrics = calculateThroughputMetrics({
      progress,
      progressHistory,
      downloads: allDownloads,
      completion,
      taskInfo,
      windows: flags.windows
    });

    const data = { taskId, taskInfo, progress, downloads, completion, errors, metrics };
    data.artifacts = writeArtifacts(data, flags);
    display(data, flags);

    if (completion && flags.follow) {
      console.log('Crawl complete. Stopping.');
      db.close();
      process.exit(0);
    }
  };

  poll();

  if (flags.follow) {
    const intervalId = setInterval(poll, flags.interval);
    process.on('SIGINT', () => {
      clearInterval(intervalId);
      db.close();
      console.log('\nStopped.');
      process.exit(0);
    });
  } else {
    db.close();
  }
}

main();
