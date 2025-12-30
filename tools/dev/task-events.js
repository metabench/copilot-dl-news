#!/usr/bin/env node
'use strict';

/**
 * task-events.js — CLI for querying task events (crawls, background tasks)
 * 
 * Usage:
 *   node tools/dev/task-events.js --list                          # List all tasks
 *   node tools/dev/task-events.js --list --type crawl             # List only crawls
 *   node tools/dev/task-events.js --get <taskId>                  # Get events for task
 *   node tools/dev/task-events.js --summary <taskId>              # Get summary stats
 *   node tools/dev/task-events.js --problems <taskId>             # Get errors/warnings
 *   node tools/dev/task-events.js --timeline <taskId>             # Get lifecycle events
 *   node tools/dev/task-events.js --search <pattern>              # Search across all tasks
 *   node tools/dev/task-events.js --stats                         # Storage statistics
 *   node tools/dev/task-events.js --prune <days>                  # Prune old events (dry-run)
 *   node tools/dev/task-events.js --prune <days> --fix            # Actually prune
 * 
 * Common options:
 *   --json          Output as JSON
 *   --limit <n>     Max results (default: 50)
 *   --db <path>     Database path (default: data/news.db)
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// ─────────────────────────────────────────────────────────────
// Argument parsing
// ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {
    help: false,
    json: false,
    list: false,
    get: null,
    summary: null,
    problems: null,
    timeline: null,
    search: null,
    stats: false,
    prune: null,
    fix: false,
    type: null,
    category: null,
    severity: null,
    scope: null,
    limit: 50,
    sinceSeq: null,
    db: path.join(process.cwd(), 'data', 'news.db'),
    // Chinese aliases
    列: false,    // list
    取: null,     // get
    简: null,     // summary
    错: null,     // problems
    线: null,     // timeline
    搜: null,     // search
    统: false,    // stats
    清: null      // prune
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '-h':
      case '--help':
      case '--助':
        flags.help = true;
        break;
      case '--json':
        flags.json = true;
        break;
      case '--list':
      case '--列':
      case '-l':
        flags.list = true;
        break;
      case '--get':
      case '--取':
      case '-g':
        flags.get = next;
        i++;
        break;
      case '--summary':
      case '--简':
      case '-s':
        flags.summary = next;
        i++;
        break;
      case '--problems':
      case '--错':
      case '-p':
        flags.problems = next;
        i++;
        break;
      case '--timeline':
      case '--线':
      case '-t':
        flags.timeline = next;
        i++;
        break;
      case '--search':
      case '--搜':
        flags.search = next;
        i++;
        break;
      case '--stats':
      case '--统':
        flags.stats = true;
        break;
      case '--prune':
      case '--清':
        flags.prune = parseInt(next, 10);
        i++;
        break;
      case '--fix':
        flags.fix = true;
        break;
      case '--type':
        flags.type = next;
        i++;
        break;
      case '--category':
        flags.category = next;
        i++;
        break;
      case '--severity':
        flags.severity = next;
        i++;
        break;
      case '--scope':
        flags.scope = next;
        i++;
        break;
      case '--limit':
        flags.limit = parseInt(next, 10);
        i++;
        break;
      case '--since-seq':
        flags.sinceSeq = parseInt(next, 10);
        i++;
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
// Formatting helpers
// ─────────────────────────────────────────────────────────────

function formatTimestamp(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

function formatDuration(ms) {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function truncate(str, len = 60) {
  if (!str) return '';
  if (str.length <= len) return str;
  return str.slice(0, len - 3) + '...';
}

function severityIcon(sev) {
  switch (sev) {
    case 'error': return '❌';
    case 'warn': return '⚠️';
    default: return '•';
  }
}

function printTable(rows, columns) {
  if (rows.length === 0) {
    console.log('  (no results)');
    return;
  }

  // Calculate column widths
  const widths = {};
  for (const col of columns) {
    widths[col.key] = col.header.length;
    for (const row of rows) {
      const val = String(row[col.key] ?? '');
      widths[col.key] = Math.max(widths[col.key], val.length);
    }
    widths[col.key] = Math.min(widths[col.key], col.maxWidth || 60);
  }

  // Header
  const headerLine = columns.map(c => c.header.padEnd(widths[c.key])).join('  ');
  const separator = columns.map(c => '─'.repeat(widths[c.key])).join('──');
  console.log('  ' + headerLine);
  console.log('  ' + separator);

  // Rows
  for (const row of rows) {
    const line = columns.map(c => {
      let val = String(row[c.key] ?? '');
      if (val.length > widths[c.key]) {
        val = val.slice(0, widths[c.key] - 3) + '...';
      }
      return val.padEnd(widths[c.key]);
    }).join('  ');
    console.log('  ' + line);
  }
}

function printHeader(title) {
  console.log(`\n┌ ${title} ${'═'.repeat(Math.max(0, 50 - title.length))}┐\n`);
}

// ─────────────────────────────────────────────────────────────
// Database operations
// ─────────────────────────────────────────────────────────────

function openDb(dbPath) {
  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found: ${dbPath}`);
    process.exit(1);
  }
  return new Database(dbPath, { readonly: true });
}

function tableExists(db) {
  const result = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='task_events'"
  ).get();
  return !!result;
}

function listTasks(db, { type, limit }) {
  let sql = `
    SELECT 
      task_type,
      task_id,
      COUNT(*) as event_count,
      MIN(ts) as first_ts,
      MAX(ts) as last_ts,
      SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as error_count,
      SUM(CASE WHEN severity = 'warn' THEN 1 ELSE 0 END) as warn_count
    FROM task_events
  `;
  const params = [];
  if (type) {
    sql += ' WHERE task_type = ?';
    params.push(type);
  }
  sql += ' GROUP BY task_id ORDER BY MAX(ts) DESC LIMIT ?';
  params.push(limit);

  return db.prepare(sql).all(...params);
}

function getEvents(db, taskId, { category, severity, scope, sinceSeq, limit }) {
  let sql = 'SELECT * FROM task_events WHERE task_id = ?';
  const params = [taskId];

  if (category) {
    sql += ' AND event_category = ?';
    params.push(category);
  }
  if (severity) {
    sql += ' AND severity = ?';
    params.push(severity);
  }
  if (scope) {
    sql += ' AND scope LIKE ?';
    params.push(`%${scope}%`);
  }
  if (sinceSeq) {
    sql += ' AND seq > ?';
    params.push(sinceSeq);
  }
  sql += ' ORDER BY seq LIMIT ?';
  params.push(limit);

  return db.prepare(sql).all(...params);
}

function getSummary(db, taskId) {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_events,
      MAX(seq) as max_seq,
      MIN(ts) as first_ts,
      MAX(ts) as last_ts,
      task_type,
      SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as error_count,
      SUM(CASE WHEN severity = 'warn' THEN 1 ELSE 0 END) as warn_count,
      SUM(duration_ms) as total_duration_ms,
      AVG(duration_ms) as avg_duration_ms,
      COUNT(DISTINCT scope) as unique_scopes
    FROM task_events WHERE task_id = ?
  `).get(taskId);

  const eventTypes = db.prepare(`
    SELECT event_type, COUNT(*) as count
    FROM task_events WHERE task_id = ?
    GROUP BY event_type ORDER BY count DESC LIMIT 20
  `).all(taskId);

  const scopeBreakdown = db.prepare(`
    SELECT scope, COUNT(*) as count, AVG(duration_ms) as avg_ms
    FROM task_events WHERE task_id = ? AND scope IS NOT NULL
    GROUP BY scope ORDER BY count DESC LIMIT 10
  `).all(taskId);

  return { ...stats, eventTypes, scopeBreakdown };
}

function getProblems(db, taskId, limit) {
  return db.prepare(`
    SELECT seq, ts, event_type, severity, scope, target, payload
    FROM task_events 
    WHERE task_id = ? AND severity IN ('error', 'warn')
    ORDER BY seq LIMIT ?
  `).all(taskId, limit);
}

function getTimeline(db, taskId) {
  return db.prepare(`
    SELECT seq, ts, event_type, scope, duration_ms
    FROM task_events 
    WHERE task_id = ? AND event_category = 'lifecycle'
    ORDER BY seq
  `).all(taskId);
}

function searchEvents(db, pattern, { type, limit }) {
  let sql = `
    SELECT task_id, seq, ts, event_type, severity, scope, target
    FROM task_events
    WHERE (
      event_type LIKE ? OR 
      scope LIKE ? OR 
      target LIKE ? OR
      payload LIKE ?
    )
  `;
  const params = [`%${pattern}%`, `%${pattern}%`, `%${pattern}%`, `%${pattern}%`];

  if (type) {
    sql += ' AND task_type = ?';
    params.push(type);
  }
  sql += ' ORDER BY ts DESC LIMIT ?';
  params.push(limit);

  return db.prepare(sql).all(...params);
}

function getStorageStats(db) {
  const counts = db.prepare(`
    SELECT 
      COUNT(*) as total_events,
      COUNT(DISTINCT task_id) as total_tasks,
      COUNT(DISTINCT task_type) as task_types,
      MIN(ts) as oldest,
      MAX(ts) as newest
    FROM task_events
  `).get();

  const byType = db.prepare(`
    SELECT task_type, COUNT(*) as count, COUNT(DISTINCT task_id) as tasks
    FROM task_events GROUP BY task_type ORDER BY count DESC
  `).all();

  const byCategory = db.prepare(`
    SELECT event_category, COUNT(*) as count
    FROM task_events GROUP BY event_category ORDER BY count DESC
  `).all();

  const payloadSize = db.prepare(`
    SELECT SUM(LENGTH(payload)) as bytes FROM task_events
  `).get();

  return { ...counts, payloadBytes: payloadSize?.bytes || 0, byType, byCategory };
}

function pruneOlderThan(db, days, fix) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();

  const preview = db.prepare(`
    SELECT COUNT(*) as count, COUNT(DISTINCT task_id) as tasks
    FROM task_events WHERE ts < ?
  `).get(cutoffStr);

  if (!fix) {
    return { ...preview, dryRun: true, cutoff: cutoffStr };
  }

  // Need write access for actual delete
  const writeDb = new Database(db.name); // Re-open with write
  const result = writeDb.prepare('DELETE FROM task_events WHERE ts < ?').run(cutoffStr);
  writeDb.close();

  return { deleted: result.changes, tasks: preview.tasks, cutoff: cutoffStr };
}

// ─────────────────────────────────────────────────────────────
// Command handlers
// ─────────────────────────────────────────────────────────────

function handleList(db, flags) {
  const tasks = listTasks(db, { type: flags.type, limit: flags.limit });

  if (flags.json) {
    console.log(JSON.stringify({ tasks, count: tasks.length }, null, 2));
    return;
  }

  printHeader('Task Events');
  console.log(`  Found ${tasks.length} task(s)\n`);

  printTable(tasks.map(t => ({
    type: t.task_type,
    id: truncate(t.task_id, 30),
    events: t.event_count,
    errors: t.error_count > 0 ? `❌${t.error_count}` : '-',
    warns: t.warn_count > 0 ? `⚠️${t.warn_count}` : '-',
    started: formatTimestamp(t.first_ts),
    ended: formatTimestamp(t.last_ts)
  })), [
    { key: 'type', header: 'Type', maxWidth: 15 },
    { key: 'id', header: 'Task ID', maxWidth: 30 },
    { key: 'events', header: 'Events', maxWidth: 8 },
    { key: 'errors', header: 'Err', maxWidth: 6 },
    { key: 'warns', header: 'Warn', maxWidth: 6 },
    { key: 'started', header: 'Started', maxWidth: 20 },
    { key: 'ended', header: 'Ended', maxWidth: 20 }
  ]);
}

function handleGet(db, taskId, flags) {
  const events = getEvents(db, taskId, {
    category: flags.category,
    severity: flags.severity,
    scope: flags.scope,
    sinceSeq: flags.sinceSeq,
    limit: flags.limit
  });

  if (flags.json) {
    console.log(JSON.stringify({ taskId, events, count: events.length }, null, 2));
    return;
  }

  printHeader(`Events for ${taskId}`);
  console.log(`  Showing ${events.length} event(s)\n`);

  printTable(events.map(e => ({
    seq: e.seq,
    time: formatTimestamp(e.ts),
    type: e.event_type,
    sev: severityIcon(e.severity),
    scope: truncate(e.scope, 25),
    target: truncate(e.target, 30),
    dur: formatDuration(e.duration_ms)
  })), [
    { key: 'seq', header: 'Seq', maxWidth: 6 },
    { key: 'time', header: 'Time', maxWidth: 20 },
    { key: 'type', header: 'Event Type', maxWidth: 25 },
    { key: 'sev', header: '', maxWidth: 3 },
    { key: 'scope', header: 'Scope', maxWidth: 25 },
    { key: 'target', header: 'Target', maxWidth: 30 },
    { key: 'dur', header: 'Dur', maxWidth: 8 }
  ]);

  if (events.length === flags.limit) {
    const lastSeq = events[events.length - 1].seq;
    console.log(`\n  (limited to ${flags.limit}, use --since-seq ${lastSeq} for next page)`);
  }
}

function handleSummary(db, taskId, flags) {
  const summary = getSummary(db, taskId);

  if (!summary.total_events) {
    console.log(flags.json 
      ? JSON.stringify({ error: 'Task not found', taskId })
      : `Task not found: ${taskId}`);
    process.exit(1);
  }

  if (flags.json) {
    console.log(JSON.stringify({ taskId, summary }, null, 2));
    return;
  }

  printHeader(`Summary: ${taskId}`);
  console.log(`  Task Type        ${summary.task_type}`);
  console.log(`  Total Events     ${summary.total_events}`);
  console.log(`  Max Sequence     ${summary.max_seq}`);
  console.log(`  Duration         ${formatTimestamp(summary.first_ts)} → ${formatTimestamp(summary.last_ts)}`);
  console.log(`  Errors           ${summary.error_count > 0 ? '❌ ' + summary.error_count : '✓ 0'}`);
  console.log(`  Warnings         ${summary.warn_count > 0 ? '⚠️ ' + summary.warn_count : '✓ 0'}`);
  console.log(`  Unique Scopes    ${summary.unique_scopes}`);
  if (summary.avg_duration_ms) {
    console.log(`  Avg Duration     ${formatDuration(summary.avg_duration_ms)}`);
  }

  if (summary.eventTypes.length > 0) {
    console.log('\n  Event Types:');
    for (const et of summary.eventTypes.slice(0, 10)) {
      console.log(`    ${et.event_type.padEnd(30)} ${et.count}`);
    }
  }

  if (summary.scopeBreakdown.length > 0) {
    console.log('\n  Top Scopes:');
    for (const s of summary.scopeBreakdown) {
      console.log(`    ${(s.scope || '(none)').padEnd(30)} ${s.count} events, avg ${formatDuration(s.avg_ms)}`);
    }
  }
}

function handleProblems(db, taskId, flags) {
  const problems = getProblems(db, taskId, flags.limit);

  if (flags.json) {
    console.log(JSON.stringify({ taskId, problems, count: problems.length }, null, 2));
    return;
  }

  printHeader(`Problems: ${taskId}`);
  if (problems.length === 0) {
    console.log('  ✓ No errors or warnings found');
    return;
  }

  console.log(`  Found ${problems.length} problem(s)\n`);

  for (const p of problems) {
    const icon = p.severity === 'error' ? '❌' : '⚠️';
    console.log(`  ${icon} [${p.seq}] ${p.event_type}`);
    console.log(`     Time:   ${formatTimestamp(p.ts)}`);
    if (p.scope) console.log(`     Scope:  ${p.scope}`);
    if (p.target) console.log(`     Target: ${truncate(p.target, 60)}`);
    if (p.payload) {
      try {
        const data = JSON.parse(p.payload);
        if (data.error) console.log(`     Error:  ${truncate(data.error, 60)}`);
        if (data.message) console.log(`     Msg:    ${truncate(data.message, 60)}`);
      } catch { /* ignore */ }
    }
    console.log('');
  }
}

function handleTimeline(db, taskId, flags) {
  const timeline = getTimeline(db, taskId);

  if (flags.json) {
    console.log(JSON.stringify({ taskId, timeline, count: timeline.length }, null, 2));
    return;
  }

  printHeader(`Timeline: ${taskId}`);
  if (timeline.length === 0) {
    console.log('  No lifecycle events found');
    return;
  }

  for (const e of timeline) {
    const durStr = e.duration_ms ? ` (${formatDuration(e.duration_ms)})` : '';
    console.log(`  [${e.seq.toString().padStart(4)}] ${formatTimestamp(e.ts)}  ${e.event_type}${durStr}`);
    if (e.scope) console.log(`         └─ ${e.scope}`);
  }
}

function handleSearch(db, pattern, flags) {
  const results = searchEvents(db, pattern, { type: flags.type, limit: flags.limit });

  if (flags.json) {
    console.log(JSON.stringify({ pattern, results, count: results.length }, null, 2));
    return;
  }

  printHeader(`Search: "${pattern}"`);
  console.log(`  Found ${results.length} match(es)\n`);

  printTable(results.map(r => ({
    task: truncate(r.task_id, 25),
    seq: r.seq,
    time: formatTimestamp(r.ts),
    type: r.event_type,
    sev: severityIcon(r.severity),
    scope: truncate(r.scope, 20),
    target: truncate(r.target, 25)
  })), [
    { key: 'task', header: 'Task ID', maxWidth: 25 },
    { key: 'seq', header: 'Seq', maxWidth: 6 },
    { key: 'time', header: 'Time', maxWidth: 18 },
    { key: 'type', header: 'Event', maxWidth: 20 },
    { key: 'sev', header: '', maxWidth: 3 },
    { key: 'scope', header: 'Scope', maxWidth: 20 },
    { key: 'target', header: 'Target', maxWidth: 25 }
  ]);
}

function handleStats(db, flags) {
  const stats = getStorageStats(db);

  if (flags.json) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  printHeader('Storage Statistics');
  console.log(`  Total Events     ${stats.total_events.toLocaleString()}`);
  console.log(`  Total Tasks      ${stats.total_tasks.toLocaleString()}`);
  console.log(`  Task Types       ${stats.task_types}`);
  console.log(`  Payload Size     ${(stats.payloadBytes / 1024).toFixed(1)} KB`);
  console.log(`  Oldest Event     ${formatTimestamp(stats.oldest)}`);
  console.log(`  Newest Event     ${formatTimestamp(stats.newest)}`);

  if (stats.byType.length > 0) {
    console.log('\n  By Task Type:');
    for (const t of stats.byType) {
      console.log(`    ${t.task_type.padEnd(20)} ${t.count} events across ${t.tasks} tasks`);
    }
  }

  if (stats.byCategory.length > 0) {
    console.log('\n  By Category:');
    for (const c of stats.byCategory) {
      console.log(`    ${(c.event_category || '(none)').padEnd(20)} ${c.count}`);
    }
  }
}

function handlePrune(db, days, flags) {
  const result = pruneOlderThan(db, days, flags.fix);

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printHeader(`Prune Events > ${days} Days`);
  console.log(`  Cutoff Date      ${formatTimestamp(result.cutoff)}`);

  if (result.dryRun) {
    console.log(`  Would Delete     ${result.count} events across ${result.tasks} tasks`);
    console.log('\n  Run with --fix to actually delete');
  } else {
    console.log(`  Deleted          ${result.deleted} events`);
  }
}

// ─────────────────────────────────────────────────────────────
// Help
// ─────────────────────────────────────────────────────────────

function showHelp() {
  console.log(`
task-events — Query crawl and background task events

Usage:
  node tools/dev/task-events.js <command> [options]

Commands:
  --list, -l, --列              List all tasks with event counts
  --get <id>, -g, --取          Get events for a specific task
  --summary <id>, -s, --简      Get summary statistics for a task
  --problems <id>, -p, --错     Get errors and warnings for a task
  --timeline <id>, -t, --线     Get lifecycle events for a task
  --search <pattern>, --搜      Search across all events
  --stats, --统                 Show storage statistics
  --prune <days>, --清          Prune events older than N days

Filters:
  --type <type>        Filter by task type (crawl, analysis, etc.)
  --category <cat>     Filter by event category (lifecycle, work, error)
  --severity <sev>     Filter by severity (info, warn, error)
  --scope <scope>      Filter by scope (partial match)
  --since-seq <n>      Pagination: get events after sequence N
  --limit <n>          Max results (default: 50)

Options:
  --json               Output as JSON
  --fix                Apply changes (for prune)
  --db <path>          Database path (default: data/news.db)
  -h, --help           Show this help

Examples:
  # List recent crawls
  node tools/dev/task-events.js --list --type crawl

  # Get summary of a specific crawl
  node tools/dev/task-events.js --summary crawl-2025-01-01-001

  # Find all errors
  node tools/dev/task-events.js --problems crawl-2025-01-01-001

  # Search for a domain
  node tools/dev/task-events.js --search example.com

  # Prune old events (dry-run first)
  node tools/dev/task-events.js --prune 30
  node tools/dev/task-events.js --prune 30 --fix
`);
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

function main() {
  const flags = parseArgs(process.argv);

  if (flags.help) {
    showHelp();
    process.exit(0);
  }

  const db = openDb(flags.db);

  if (!tableExists(db)) {
    console.error('task_events table not found. Run the migration first.');
    process.exit(1);
  }

  try {
    // Determine command (check both English and Chinese aliases)
    if (flags.list || flags.列) {
      handleList(db, flags);
    } else if (flags.get || flags.取) {
      handleGet(db, flags.get || flags.取, flags);
    } else if (flags.summary || flags.简) {
      handleSummary(db, flags.summary || flags.简, flags);
    } else if (flags.problems || flags.错) {
      handleProblems(db, flags.problems || flags.错, flags);
    } else if (flags.timeline || flags.线) {
      handleTimeline(db, flags.timeline || flags.线, flags);
    } else if (flags.search || flags.搜) {
      handleSearch(db, flags.search || flags.搜, flags);
    } else if (flags.stats || flags.统) {
      handleStats(db, flags);
    } else if (flags.prune !== null || flags.清 !== null) {
      handlePrune(db, flags.prune ?? flags.清, flags);
    } else {
      // Default to list
      handleList(db, flags);
    }
  } finally {
    db.close();
  }
}

main();
