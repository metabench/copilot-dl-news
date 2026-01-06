#!/usr/bin/env node
'use strict';

/**
 * crawl-live.js — Enhanced live crawl status from task_events DB
 * 
 * Polls the task_events table and displays:
 *   - Last N downloaded URLs with timestamps
 *   - Queue/progress stats with throughput metrics
 *   - ETA estimation based on current rate
 *   - Error count and bottleneck detection
 * 
 * Usage:
 *   node tools/dev/crawl-live.js                    # Auto-detect latest crawl
 *   node tools/dev/crawl-live.js --task <id>        # Watch specific task
 *   node tools/dev/crawl-live.js --last 10          # Show last 10 downloads
 *   node tools/dev/crawl-live.js --no-follow        # One-shot (no polling)
 *   node tools/dev/crawl-live.js --metrics          # Show detailed throughput metrics
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// ─────────────────────────────────────────────────────────────
// Arguments
// ─────────────────────────────────────────────────────────────

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
    db: path.join(process.cwd(), 'data', 'news.db')
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
      case '-t':
        flags.taskId = next;
        i++;
        break;
      case '--last':
      case '-n':
        flags.last = parseInt(next, 10);
        i++;
        break;
      case '--no-follow':
        flags.follow = false;
        break;
      case '--interval':
        flags.interval = parseInt(next, 10);
        i++;
        break;
      case '--json':
        flags.json = true;
        break;
      case '--metrics':
      case '-m':
        flags.metrics = true;
        break;
      case '--db':
        flags.db = next;
        i++;
        break;
    }
  }

  return flags;
}

// ─────────────────────────────────────────────────────────────
// Database queries
// ─────────────────────────────────────────────────────────────

function getLatestTask(db) {
  const row = db.prepare(`
    SELECT DISTINCT task_id, task_type, MIN(ts) as started, MAX(ts) as latest
    FROM task_events
    WHERE task_id LIKE 'mini-crawl-%' OR task_id LIKE 'crawl-%'
    GROUP BY task_id
    ORDER BY started DESC
    LIMIT 1
  `).get();
  return row;
}

function getProgress(db, taskId) {
  const row = db.prepare(`
    SELECT payload, ts
    FROM task_events
    WHERE task_id = ? AND event_type = 'crawl:progress'
    ORDER BY seq DESC
    LIMIT 1
  `).get(taskId);
  
  if (!row) return null;
  try {
    const data = JSON.parse(row.payload);
    return { ...data, ts: row.ts };
  } catch {
    return null;
  }
}

function getRecentDownloads(db, taskId, limit) {
  const rows = db.prepare(`
    SELECT payload, ts
    FROM task_events
    WHERE task_id = ? AND event_type = 'crawl:url:batch'
    ORDER BY seq DESC
    LIMIT ?
  `).all(taskId, limit * 2); // Get more to extract individual URLs
  
  const downloads = [];
  
  for (const row of rows) {
    try {
      const batch = JSON.parse(row.payload);
      if (batch.events) {
        for (const evt of batch.events) {
          if (evt.data && evt.data.url) {
            downloads.push({
              url: evt.data.url,
              status: evt.data.httpStatus,
              bytes: evt.data.contentLength,
              durationMs: evt.data.durationMs,
              cached: evt.data.cached,
              ts: evt.timestamp
            });
          }
        }
      }
    } catch {
      // Skip malformed
    }
  }
  
  return downloads.slice(0, limit);
}

function getCompletionStatus(db, taskId) {
  const row = db.prepare(`
    SELECT payload, ts
    FROM task_events
    WHERE task_id = ? AND event_type = 'crawl:complete'
    ORDER BY seq DESC
    LIMIT 1
  `).get(taskId);
  
  if (!row) return null;
  try {
    return { ...JSON.parse(row.payload), ts: row.ts };
  } catch {
    return null;
  }
}

function getErrorCount(db, taskId) {
  const row = db.prepare(`
    SELECT COUNT(*) as cnt
    FROM task_events
    WHERE task_id = ? AND severity = 'error'
  `).get(taskId);
  return row?.cnt || 0;
}

/**
 * Calculate throughput metrics from recent downloads
 */
function calculateThroughputMetrics(downloads, progress) {
  if (!downloads || downloads.length < 2) {
    return {
      pagesPerMinute: 0,
      bytesPerSecond: 0,
      avgPageSizeKb: 0,
      avgDurationMs: 0,
      eta: null,
      stallDetected: false
    };
  }
  
  // Get time range from downloads
  const timestamps = downloads
    .map(d => d.ts ? new Date(d.ts).getTime() : null)
    .filter(t => t && !isNaN(t))
    .sort((a, b) => a - b);
  
  if (timestamps.length < 2) {
    return {
      pagesPerMinute: 0,
      bytesPerSecond: 0,
      avgPageSizeKb: 0,
      avgDurationMs: 0,
      eta: null,
      stallDetected: false
    };
  }
  
  const oldest = timestamps[0];
  const newest = timestamps[timestamps.length - 1];
  const timeSpanMs = newest - oldest;
  const timeSpanSeconds = timeSpanMs / 1000;
  const timeSpanMinutes = timeSpanMs / 60000;
  
  // Calculate rates
  const pagesPerMinute = timeSpanMinutes > 0 ? downloads.length / timeSpanMinutes : 0;
  
  const totalBytes = downloads.reduce((sum, d) => sum + (d.bytes || 0), 0);
  const bytesPerSecond = timeSpanSeconds > 0 ? totalBytes / timeSpanSeconds : 0;
  
  const avgPageSizeKb = downloads.length > 0 
    ? (totalBytes / downloads.length) / 1024 
    : 0;
  
  const durations = downloads.filter(d => d.durationMs).map(d => d.durationMs);
  const avgDurationMs = durations.length > 0 
    ? durations.reduce((a, b) => a + b, 0) / durations.length 
    : 0;
  
  // Stall detection (no downloads in last 30 seconds)
  const now = Date.now();
  const lastDownloadMs = newest;
  const stallDetected = (now - lastDownloadMs) > 30000;
  
  // ETA calculation if we have progress info
  let eta = null;
  if (progress && progress.queued > 0 && pagesPerMinute > 0) {
    const minutesRemaining = progress.queued / pagesPerMinute;
    const etaDate = new Date(now + minutesRemaining * 60000);
    eta = {
      minutesRemaining: Math.round(minutesRemaining),
      estimatedCompletion: etaDate.toLocaleTimeString('en-GB', { hour12: false })
    };
  }
  
  return {
    pagesPerMinute: Math.round(pagesPerMinute * 10) / 10,
    bytesPerSecond: Math.round(bytesPerSecond),
    avgPageSizeKb: Math.round(avgPageSizeKb * 10) / 10,
    avgDurationMs: Math.round(avgDurationMs),
    eta,
    stallDetected
  };
}

// ─────────────────────────────────────────────────────────────
// Display
// ─────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes == null) return '-';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function formatTime(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-GB', { hour12: false });
  } catch {
    return '-';
  }
}

function truncateUrl(url, maxLen = 60) {
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
  
  if (flags.follow) {
    clearScreen();
  }
  
  const { taskId, progress, downloads, completion, errors, metrics } = data;
  
  console.log(`\n┌─ 🕷️  Crawl Live: ${taskId} ─────────────────────────────────┐\n`);
  
  // Status line
  if (completion) {
    console.log(`  ✅ COMPLETE │ ${completion.status} │ ${formatTime(completion.ts)}`);
    if (completion.stats) {
      console.log(`     Pages: ${completion.stats.pagesDownloaded || 0} │ Bytes: ${formatBytes(completion.stats.bytesDownloaded)}`);
    }
  } else if (progress) {
    let statusLine = `  🔄 RUNNING │ Downloaded: ${progress.downloaded || 0} │ Queue: ${progress.queued || 0} │ Errors: ${errors}`;
    if (metrics && metrics.stallDetected) {
      statusLine += ` │ ⚠️  STALLED`;
    }
    console.log(statusLine);
  } else {
    console.log(`  ⏳ STARTING...`);
  }
  
  // Metrics section (when --metrics flag is used or we have meaningful data)
  if (flags.metrics && metrics && metrics.pagesPerMinute > 0) {
    console.log();
    console.log(`  📊 THROUGHPUT:`);
    console.log(`     Rate: ${metrics.pagesPerMinute} pages/min │ ${formatBytes(metrics.bytesPerSecond)}/s`);
    console.log(`     Avg page: ${metrics.avgPageSizeKb.toFixed(1)}KB │ Avg duration: ${metrics.avgDurationMs}ms`);
    if (metrics.eta) {
      console.log(`     ETA: ~${metrics.eta.minutesRemaining}min (${metrics.eta.estimatedCompletion})`);
    }
  }
  
  console.log();
  
  // Recent downloads
  console.log(`  📥 Last ${downloads.length} downloads:`);
  if (downloads.length === 0) {
    console.log(`     (none yet)`);
  } else {
    for (const d of downloads) {
      const time = formatTime(d.ts);
      const status = d.cached ? '(cached)' : `${d.status}`;
      console.log(`     ${time} │ ${status.toString().padStart(6)} │ ${formatBytes(d.bytes).padStart(8)} │ ${truncateUrl(d.url)}`);
    }
  }
  
  console.log();
  
  if (flags.follow && !completion) {
    console.log(`  ─────────────────────────────────────────────────────────────────`);
    console.log(`  Polling every ${flags.interval / 1000}s. Press Ctrl+C to stop.`);
    if (!flags.metrics) {
      console.log(`  Tip: Use --metrics for throughput stats and ETA`);
    }
  }
  
  console.log(`\n└──────────────────────────────────────────────────────────────────┘\n`);
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

function main() {
  const flags = parseArgs();
  
  if (flags.help) {
    console.log(`
crawl-live — Enhanced live crawl status from DB

Usage:
  node tools/dev/crawl-live.js                    # Auto-detect latest crawl
  node tools/dev/crawl-live.js --task <id>        # Watch specific task
  node tools/dev/crawl-live.js --last 10          # Show last 10 downloads
  node tools/dev/crawl-live.js --metrics          # Show throughput & ETA

Options:
  --task, -t <id>     Task ID to monitor
  --last, -n <num>    Number of recent downloads to show (default: 5)
  --metrics, -m       Show throughput metrics (pages/min, bytes/s, ETA)
  --no-follow         One-shot mode (don't poll)
  --interval <ms>     Poll interval (default: 2000)
  --json              Output as JSON (includes metrics)
  --db <path>         Database path
  -h, --help          Show this help

Metrics include:
  • Pages per minute and bytes per second rates
  • Average page size and download duration
  • ETA based on current rate and queue size
  • Stall detection (warns if no activity for 30s)
`);
    return;
  }
  
  if (!fs.existsSync(flags.db)) {
    console.error(`Database not found: ${flags.db}`);
    process.exit(1);
  }
  
  const db = new Database(flags.db, { readonly: true });
  
  // Find task
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
    const progress = getProgress(db, taskId);
    // Get more downloads for metrics calculation when --metrics is used
    const downloadLimit = flags.metrics ? Math.max(flags.last, 20) : flags.last;
    const allDownloads = getRecentDownloads(db, taskId, downloadLimit);
    const downloads = allDownloads.slice(0, flags.last);
    const completion = getCompletionStatus(db, taskId);
    const errors = getErrorCount(db, taskId);
    const metrics = calculateThroughputMetrics(allDownloads, progress);
    
    display({ taskId, progress, downloads, completion, errors, metrics }, flags);
    
    // Stop polling if complete
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
