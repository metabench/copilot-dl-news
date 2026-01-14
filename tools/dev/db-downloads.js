#!/usr/bin/env node
/**
 * db-downloads - CLI tool for querying recent downloads from the database
 * 
 * Usage:
 *   node tools/dev/db-downloads.js --recent 25
 *   node tools/dev/db-downloads.js --stats
 *   node tools/dev/db-downloads.js --today
 *   node tools/dev/db-downloads.js --since "2026-01-03T00:00:00"
 *   node tools/dev/db-downloads.js --hosts
 *   node tools/dev/db-downloads.js --timeline --since "2026-01-03T03:00:00"
 *   node tools/dev/db-downloads.js --url "https://example.com/page"
 * 
 * @module tools/dev/db-downloads
 */
'use strict';

const path = require('path');
const Database = require('better-sqlite3');

// Import DB query module
const downloadEvidence = require('../../src/data/db/queries/downloadEvidence');

// CLI argument parsing
const args = process.argv.slice(2);
const flags = {};
let positional = [];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  } else if (arg.startsWith('-')) {
    const key = arg.slice(1);
    flags[key] = true;
  } else {
    positional.push(arg);
  }
}

const JSON_OUTPUT = flags.json || flags.j;
const LIMIT = parseInt(flags.limit || flags.l || '25', 10);

function getDb() {
  const dbPath = path.resolve(__dirname, '..', '..', 'data', 'news.db');
  return new Database(dbPath, { readonly: true });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString();
}

function printTable(rows, columns) {
  if (rows.length === 0) {
    console.log('  (no results)');
    return;
  }
  
  // Calculate column widths
  const widths = columns.map(col => {
    const headerLen = col.header.length;
    const maxDataLen = Math.max(...rows.map(r => String(col.value(r)).length));
    return Math.max(headerLen, maxDataLen, 4);
  });
  
  // Print header
  const header = columns.map((col, i) => col.header.padEnd(widths[i])).join('  ');
  console.log('  ' + header);
  console.log('  ' + widths.map(w => '─'.repeat(w)).join('──'));
  
  // Print rows
  for (const row of rows) {
    const line = columns.map((col, i) => String(col.value(row)).padEnd(widths[i])).join('  ');
    console.log('  ' + line);
  }
}

// ============================================================
// Commands
// ============================================================

function cmdHelp() {
  console.log(`
db-downloads - Query recent downloads from the database

COMMANDS:
  --recent [n]       Show n most recent downloads (default: 25)
  --today            Show today's download statistics
  --stats            Show global download statistics
  --since <time>     Show downloads since ISO timestamp
  --until <time>     Combined with --since for time range
  --hosts            Show download counts by host
                     Can combine with --since for time-filtered host stats
  --host <pattern>   Filter to hosts matching pattern (substring match)
  --timeline         Show download timeline (group by minute)
  --url <url>        Get evidence for a specific URL
  --verify <n>       Verify claimed download count against DB

OPTIONS:
  --limit, -l <n>    Limit results (default: 25)
  --json, -j         Output as JSON
  --help, -h         Show this help

EXAMPLES:
  node tools/dev/db-downloads.js --recent 50
  node tools/dev/db-downloads.js --today --json
  node tools/dev/db-downloads.js --since "2026-01-03T00:00:00" --until "2026-01-03T04:00:00"
  node tools/dev/db-downloads.js --hosts --limit 10
  node tools/dev/db-downloads.js --url "https://www.theguardian.com/sport/article"
`);
}

function cmdRecent() {
  const db = getDb();
  const limit = parseInt(flags.recent === true ? LIMIT : flags.recent, 10);
  
  const stmt = db.prepare(`
    SELECT 
      r.id,
      u.url,
      u.host,
      r.http_status,
      r.bytes_downloaded,
      r.fetched_at,
      r.content_type
    FROM http_responses r
    JOIN urls u ON r.url_id = u.id
    ORDER BY r.fetched_at DESC
    LIMIT ?
  `);
  
  const rows = stmt.all(limit);
  db.close();
  
  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ command: 'recent', limit, count: rows.length, downloads: rows }, null, 2));
    return;
  }
  
  console.log(`\n📥 Recent Downloads (last ${limit})\n`);
  printTable(rows, [
    { header: 'ID', value: r => r.id },
    { header: 'Status', value: r => r.http_status },
    { header: 'Size', value: r => formatBytes(r.bytes_downloaded || 0) },
    { header: 'Time', value: r => formatDate(r.fetched_at) },
    { header: 'URL', value: r => r.url.length > 60 ? r.url.slice(0, 57) + '...' : r.url }
  ]);
  console.log();
}

function cmdToday() {
  const db = getDb();
  
  const today = new Date().toISOString().split('T')[0];
  const startTime = today + 'T00:00:00';
  const endTime = today + 'T23:59:59';
  
  const stats = downloadEvidence.getDownloadStats(db, startTime, endTime);
  
  // Also get hourly breakdown
  const hourlyStmt = db.prepare(`
    SELECT 
      strftime('%H', fetched_at) as hour,
      COUNT(*) as count,
      SUM(bytes_downloaded) as bytes
    FROM http_responses
    WHERE date(fetched_at) = date('now')
      AND http_status = 200
    GROUP BY strftime('%H', fetched_at)
    ORDER BY hour
  `);
  const hourly = hourlyStmt.all();
  
  db.close();
  
  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ 
      command: 'today', 
      date: today, 
      stats, 
      hourly 
    }, null, 2));
    return;
  }
  
  console.log(`\n📊 Today's Downloads (${today})\n`);
  console.log(`  Verified:  ${stats.verified}`);
  console.log(`  Failed:    ${stats.failed}`);
  console.log(`  Total:     ${stats.total}`);
  console.log(`  Bytes:     ${formatBytes(stats.bytes)}`);
  
  if (hourly.length > 0) {
    console.log(`\n  Hourly Breakdown:`);
    const maxCount = Math.max(...hourly.map(h => h.count));
    const barWidth = 40;
    for (const h of hourly) {
      const filled = Math.round((h.count / maxCount) * barWidth);
      const empty = barWidth - filled;
      const bar = '█'.repeat(filled) + '░'.repeat(empty);
      const countStr = String(h.count).padStart(4);
      console.log(`    ${h.hour}:00  ${bar} ${countStr}`);
    }
  }
  console.log();
}

function cmdStats() {
  const db = getDb();
  
  const global = downloadEvidence.getGlobalStats(db);
  
  // Additional stats
  const hostsStmt = db.prepare(`SELECT COUNT(DISTINCT host) as count FROM urls`);
  const uniqueHosts = hostsStmt.get().count;
  
  const contentStmt = db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(uncompressed_size), 0) as bytes 
    FROM content_storage
  `);
  const content = contentStmt.get();
  
  db.close();
  
  if (JSON_OUTPUT) {
    console.log(JSON.stringify({
      command: 'stats',
      global,
      uniqueHosts,
      contentStorage: content
    }, null, 2));
    return;
  }
  
  console.log(`\n📈 Global Download Statistics\n`);
  console.log(`  Total HTTP Responses:  ${global.total_responses.toLocaleString()}`);
  console.log(`  Verified Downloads:    ${global.verified_downloads.toLocaleString()}`);
  console.log(`  Total Bytes:           ${formatBytes(global.total_bytes)}`);
  console.log(`  First Download:        ${formatDate(global.first_download)}`);
  console.log(`  Last Download:         ${formatDate(global.last_download)}`);
  console.log(`  Unique Hosts:          ${uniqueHosts.toLocaleString()}`);
  console.log(`  Content Stored:        ${content.count.toLocaleString()} items (${formatBytes(content.bytes)})`);
  console.log();
}

function cmdSince() {
  const db = getDb();
  
  const startTime = flags.since;
  const endTime = flags.until || new Date().toISOString();
  
  const stats = downloadEvidence.getDownloadStats(db, startTime, endTime);
  const evidence = downloadEvidence.getDownloadEvidence(db, startTime, endTime, LIMIT);
  
  db.close();
  
  if (JSON_OUTPUT) {
    console.log(JSON.stringify({
      command: 'since',
      startTime,
      endTime,
      stats,
      downloads: evidence
    }, null, 2));
    return;
  }
  
  console.log(`\n📥 Downloads from ${startTime} to ${endTime}\n`);
  console.log(`  Verified: ${stats.verified}  |  Failed: ${stats.failed}  |  Bytes: ${formatBytes(stats.bytes)}\n`);
  
  printTable(evidence, [
    { header: 'Status', value: r => r.http_status },
    { header: 'Size', value: r => formatBytes(r.bytes_downloaded || 0) },
    { header: 'TTFB', value: r => r.ttfb_ms ? r.ttfb_ms + 'ms' : '-' },
    { header: 'Time', value: r => formatDate(r.fetched_at) },
    { header: 'URL', value: r => r.url.length > 50 ? r.url.slice(0, 47) + '...' : r.url }
  ]);
  console.log();
}

function cmdHosts() {
  const db = getDb();
  
  // Check if we have a time filter
  const startTime = flags.since;
  const endTime = flags.until || new Date().toISOString();
  const hostFilter = flags.host; // substring filter for hosts
  
  let stmt;
  let rows;
  let params = [];
  
  // Build query dynamically based on filters
  let whereClause = '1=1';
  if (startTime) {
    whereClause += ' AND r.fetched_at BETWEEN ? AND ?';
    params.push(startTime, endTime);
  }
  if (hostFilter) {
    whereClause += ' AND u.host LIKE ?';
    params.push(`%${hostFilter}%`);
  }
  
  stmt = db.prepare(`
    SELECT 
      u.host,
      COUNT(*) as total_requests,
      COUNT(CASE WHEN r.http_status = 200 THEN 1 END) as successful,
      COUNT(CASE WHEN r.http_status = 429 THEN 1 END) as rate_limited,
      SUM(CASE WHEN r.http_status = 200 THEN r.bytes_downloaded ELSE 0 END) as bytes,
      MIN(r.fetched_at) as first_fetch,
      MAX(r.fetched_at) as last_fetch
    FROM http_responses r
    JOIN urls u ON r.url_id = u.id
    WHERE ${whereClause}
    GROUP BY u.host
    ORDER BY total_requests DESC
    LIMIT ?
  `);
  params.push(LIMIT);
  rows = stmt.all(...params);
  
  db.close();
  
  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ 
      command: 'hosts', 
      startTime: startTime || null, 
      endTime: startTime ? endTime : null,
      hostFilter: hostFilter || null,
      hosts: rows 
    }, null, 2));
    return;
  }
  
  // Build title
  let title = '🌐 Downloads by Host';
  const filters = [];
  if (startTime) filters.push(`since ${startTime.slice(0, 16)}`);
  if (hostFilter) filters.push(`matching "${hostFilter}"`);
  if (filters.length > 0) title += ` (${filters.join(', ')})`;
  
  console.log(`\n${title}\n`);
  printTable(rows, [
    { header: 'Host', value: r => r.host.length > 35 ? r.host.slice(0, 32) + '...' : r.host },
    { header: 'Total', value: r => r.total_requests },
    { header: 'OK', value: r => r.successful },
    { header: '429', value: r => r.rate_limited },
    { header: 'Bytes', value: r => formatBytes(r.bytes || 0) },
    { header: 'Last Fetch', value: r => formatDate(r.last_fetch) }
  ]);
  console.log();
}

function cmdTimeline() {
  const db = getDb();
  
  const startTime = flags.since || new Date(Date.now() - 60 * 60 * 1000).toISOString(); // Last hour
  const endTime = flags.until || new Date().toISOString();
  
  // Group by minute for better visualization
  const stmt = db.prepare(`
    SELECT 
      strftime('%Y-%m-%dT%H:%M', fetched_at) as minute,
      COUNT(*) as count,
      SUM(bytes_downloaded) as bytes,
      AVG(download_ms) as avg_time
    FROM http_responses
    WHERE fetched_at BETWEEN ? AND ?
      AND http_status = 200
    GROUP BY strftime('%Y-%m-%dT%H:%M', fetched_at)
    ORDER BY minute
  `);
  
  const rows = stmt.all(startTime, endTime);
  db.close();
  
  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ command: 'timeline', startTime, endTime, timeline: rows }, null, 2));
    return;
  }
  
  console.log(`\n⏱️  Download Timeline (${startTime.slice(11, 16)} - ${endTime.slice(11, 16)})\n`);
  
  if (rows.length === 0) {
    console.log('  (no downloads in this period)');
  } else {
    let cumulative = 0;
    for (const r of rows) {
      cumulative += r.count;
      const bar = '█'.repeat(Math.min(r.count, 40));
      const time = r.minute.slice(11, 16);
      console.log(`  ${time}  ${bar} ${r.count} (${cumulative} total)`);
    }
  }
  console.log();
}

function cmdUrl() {
  const db = getDb();
  const url = flags.url;
  
  const evidence = downloadEvidence.getUrlEvidence(db, url);
  
  // Also get all fetches for this URL
  const historyStmt = db.prepare(`
    SELECT 
      r.id,
      r.http_status,
      r.bytes_downloaded,
      r.fetched_at,
      r.ttfb_ms,
      r.download_ms,
      r.content_type
    FROM urls u
    JOIN http_responses r ON r.url_id = u.id
    WHERE u.url = ?
    ORDER BY r.fetched_at DESC
    LIMIT 10
  `);
  const history = historyStmt.all(url);
  
  db.close();
  
  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ command: 'url', url, evidence, history }, null, 2));
    return;
  }
  
  console.log(`\n🔍 URL Evidence: ${url}\n`);
  
  if (!evidence || !evidence.http_response_id) {
    console.log('  No download evidence found for this URL.');
  } else {
    console.log(`  URL ID:          ${evidence.url_id}`);
    console.log(`  Response ID:     ${evidence.http_response_id}`);
    console.log(`  HTTP Status:     ${evidence.http_status}`);
    console.log(`  Bytes:           ${formatBytes(evidence.bytes_downloaded || 0)}`);
    console.log(`  Content Type:    ${evidence.content_type || '-'}`);
    console.log(`  TTFB:            ${evidence.ttfb_ms ? evidence.ttfb_ms + 'ms' : '-'}`);
    console.log(`  Download Time:   ${evidence.download_ms ? evidence.download_ms + 'ms' : '-'}`);
    console.log(`  Fetched At:      ${formatDate(evidence.fetched_at)}`);
  }
  
  if (history.length > 1) {
    console.log(`\n  Fetch History (${history.length} fetches):`);
    for (const h of history) {
      console.log(`    ${formatDate(h.fetched_at)} - ${h.http_status} - ${formatBytes(h.bytes_downloaded || 0)}`);
    }
  }
  console.log();
}

function cmdVerify() {
  const db = getDb();
  
  const claimed = parseInt(flags.verify, 10);
  const startTime = flags.since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const endTime = flags.until || new Date().toISOString();
  
  const result = downloadEvidence.verifyDownloadClaim(db, startTime, endTime, claimed);
  db.close();
  
  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ command: 'verify', startTime, endTime, result }, null, 2));
    return;
  }
  
  console.log(`\n✓ Verify Download Claim\n`);
  console.log(`  Time Range:    ${startTime} - ${endTime}`);
  console.log(`  Claimed:       ${result.claimed}`);
  console.log(`  Actual:        ${result.actual}`);
  console.log(`  Valid:         ${result.valid ? '✅ YES' : '❌ NO'}`);
  if (result.discrepancy !== 0) {
    console.log(`  Discrepancy:   ${result.discrepancy > 0 ? '+' : ''}${result.discrepancy}`);
  }
  console.log();
}

// ============================================================
// Main
// ============================================================

function main() {
  if (flags.help || flags.h) {
    cmdHelp();
  } else if (flags.recent) {
    cmdRecent();
  } else if (flags.today) {
    cmdToday();
  } else if (flags.stats) {
    cmdStats();
  } else if (flags.hosts || flags.host) {
    // hosts can also use --since and --host for filtering
    cmdHosts();
  } else if (flags.since) {
    cmdSince();
  } else if (flags.timeline) {
    cmdTimeline();
  } else if (flags.url) {
    cmdUrl();
  } else if (flags.verify) {
    cmdVerify();
  } else {
    // Default: show recent
    flags.recent = true;
    cmdRecent();
  }
}

main();

