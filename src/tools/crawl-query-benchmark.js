#!/usr/bin/env node

/*
  crawl-query-benchmark.js
  ---------------------------------
  Measures execution time for high-impact crawler SQL queries so we can
  identify bottlenecks before they slow startup or steady-state crawling.
*/

const fs = require('fs');
const path = require('path');
const os = require('os');
const { findProjectRoot } = require('../utils/project-root');
const { ensureDb } = require('../db/sqlite');

const DEFAULT_WARMUP = 1;
const DEFAULT_ITERATIONS = 5;

const DEFAULT_QUERIES = [
  {
    id: 'latest_fetch_count',
    label: 'Latest fetch rows',
    sql: 'SELECT COUNT(*) AS count FROM latest_fetch',
    mode: 'get',
    requiresTables: ['latest_fetch']
  },
  {
    id: 'latest_fetch_recent_articles',
    label: 'Articles in latest_fetch (7d)',
    sql: "SELECT COUNT(*) AS count FROM latest_fetch WHERE classification='article' AND ts >= datetime('now','-7 day')",
    mode: 'get',
    requiresTables: ['latest_fetch']
  },
  {
    id: 'urls_by_host_top50',
    label: 'Top hosts by URL count',
    sql: 'SELECT host, COUNT(*) AS count FROM urls WHERE host IS NOT NULL GROUP BY host ORDER BY count DESC LIMIT 50',
    mode: 'all',
    requiresTables: ['urls']
  },
  {
    id: 'fetches_recent',
    label: 'Fetches in last 7 days',
    sql: "SELECT COUNT(*) AS count FROM fetches WHERE fetched_at >= datetime('now','-7 day')",
    mode: 'get',
    requiresTables: ['fetches']
  },
  {
    id: 'queue_events_recent',
    label: 'Queue events by action (3d)',
    sql: "SELECT action, COUNT(*) AS count FROM queue_events WHERE ts >= datetime('now','-3 day') GROUP BY action ORDER BY count DESC",
    mode: 'all',
    requiresTables: ['queue_events']
  },
  {
    id: 'errors_recent',
    label: 'Errors by kind (7d)',
    sql: "SELECT kind, COUNT(*) AS count FROM errors WHERE at >= datetime('now','-7 day') GROUP BY kind ORDER BY count DESC",
    mode: 'all',
    requiresTables: ['errors']
  },
  {
    id: 'queue_events_enhanced_recent',
    label: 'Enhanced queue events (priority) (3d)',
    sql: "SELECT COUNT(*) AS count FROM queue_events_enhanced WHERE ts >= datetime('now','-3 day')",
    mode: 'get',
    requiresTables: ['queue_events_enhanced']
  },
  {
    id: 'problem_clusters_active',
    label: 'Active problem clusters',
    sql: "SELECT COUNT(*) AS count FROM problem_clusters WHERE status='active'",
    mode: 'get',
    requiresTables: ['problem_clusters']
  }
];

function parseArgs(argv = process.argv) {
  const args = {};
  for (const raw of Array.isArray(argv) ? argv.slice(2) : []) {
    if (typeof raw !== 'string' || !raw.startsWith('--')) continue;
    if (raw === '--help') {
      args.help = true;
      continue;
    }
    const eq = raw.indexOf('=');
    if (eq === -1) {
      const key = raw.slice(2);
      if (!key) continue;
      args[toCamelCase(key)] = true;
      continue;
    }
    const key = raw.slice(2, eq);
    const value = raw.slice(eq + 1);
    if (!key) continue;
    args[toCamelCase(key)] = coerceValue(value);
  }
  return args;
}

function toCamelCase(text) {
  if (!text) return text;
  return text.replace(/-([a-zA-Z0-9])/g, (_, ch) => ch.toUpperCase());
}

function coerceValue(value) {
  if (value === undefined) return undefined;
  if (value === '') return '';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (value === 'undefined') return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric)) return numeric;
  return value;
}

function tableExists(db, tableName) {
  if (!tableName) return false;
  try {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(tableName);
    return !!row;
  } catch (_) {
    return false;
  }
}

function hasRequiredTables(db, required = []) {
  if (!Array.isArray(required) || required.length === 0) return { ok: true, missing: [] };
  const missing = [];
  for (const name of required) {
    if (!tableExists(db, name)) missing.push(name);
  }
  return { ok: missing.length === 0, missing };
}

function measureExecution(fn, iterations, warmup) {
  const samples = [];
  try {
    for (let i = 0; i < warmup; i += 1) {
      fn();
    }
    for (let i = 0; i < iterations; i += 1) {
      const start = process.hrtime.bigint();
      fn();
      const delta = process.hrtime.bigint() - start;
      samples.push(Number(delta) / 1e6);
    }
  } catch (error) {
    return { samples, error };
  }
  return { samples, error: null };
}

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  const clamped = Math.min(Math.max(fraction, 0), 1);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * clamped) - 1);
  return sorted[index];
}

function computeStats(samples) {
  if (!Array.isArray(samples) || samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((acc, value) => acc + value, 0);
  return {
    count: samples.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / samples.length,
    median: sorted[Math.floor(sorted.length / 2)],
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99)
  };
}

function extractRowCount(result) {
  if (result == null) return null;
  if (Array.isArray(result)) return result.length;
  if (typeof result === 'object') {
    const priorityKeys = ['count', 'total', 'rows', 'c'];
    for (const key of priorityKeys) {
      if (Object.prototype.hasOwnProperty.call(result, key)) {
        const value = Number(result[key]);
        if (Number.isFinite(value)) return value;
      }
    }
    for (const value of Object.values(result)) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
    }
    return 1;
  }
  if (typeof result === 'number') return 1;
  return null;
}

function buildResultPreview(result, limit = 3) {
  if (result == null) return null;
  if (Array.isArray(result)) {
    return result.slice(0, limit);
  }
  if (typeof result === 'object') {
    return { ...result };
  }
  return result;
}

function formatMs(value) {
  if (!Number.isFinite(value)) return 'n/a';
  if (value >= 100) return value.toFixed(1);
  if (value >= 10) return value.toFixed(2);
  if (value >= 1) return value.toFixed(3);
  return value.toFixed(4);
}

function renderTable(results) {
  if (!Array.isArray(results) || results.length === 0) {
    console.log('No benchmark results to display.');
    return;
  }
  const headers = ['Query', 'min ms', 'median ms', 'p95 ms', 'max ms', 'rows', 'notes'];
  const rows = results.map((entry) => {
    if (entry.skipped) {
      return [entry.label, '—', '—', '—', '—', entry.rowCount ?? '—', `skipped: ${entry.skipReason || 'missing prerequisites'}`];
    }
    if (entry.error) {
      return [entry.label, '—', '—', '—', '—', entry.rowCount ?? '—', `error: ${entry.error}`];
    }
    return [
      entry.label,
      entry.stats ? formatMs(entry.stats.min) : '—',
      entry.stats ? formatMs(entry.stats.median) : '—',
      entry.stats ? formatMs(entry.stats.p95) : '—',
      entry.stats ? formatMs(entry.stats.max) : '—',
      entry.rowCount ?? '—',
      entry.iterations > 0 ? `${entry.iterations} runs` : ''
    ];
  });

  const colWidths = headers.map((header, index) => {
    let width = header.length;
    for (const row of rows) {
      const cell = row[index] == null ? '' : String(row[index]);
      if (cell.length > width) width = cell.length;
    }
    return width;
  });

  const divider = colWidths.map((w) => '-'.repeat(w)).join('  ');

  const renderRow = (cells) => cells.map((cell, idx) => {
    const text = cell == null ? '' : String(cell);
    return text.padEnd(colWidths[idx], ' ');
  }).join('  ');

  console.log(renderRow(headers));
  console.log(divider);
  for (const row of rows) {
    console.log(renderRow(row));
  }
}

function selectQueries(definitions, options = {}) {
  if (!Array.isArray(definitions)) return [];
  const { only } = options;
  if (!only) return definitions;
  const wanted = new Set(String(only).split(',').map((value) => value.trim()).filter(Boolean));
  return definitions.filter((def) => wanted.has(def.id) || wanted.has(def.label));
}

function benchmarkDatabase(db, queries, { iterations, warmup }) {
  const results = [];
  for (const def of queries) {
    const { ok, missing } = hasRequiredTables(db, def.requiresTables);
    if (!ok) {
      results.push({
        id: def.id,
        label: def.label,
        skipped: true,
        skipReason: `missing tables: ${missing.join(', ')}`,
        rowCount: null,
        stats: null,
        iterations: 0
      });
      continue;
    }
    let stmt;
    try {
      stmt = db.prepare(def.sql);
    } catch (error) {
      results.push({
        id: def.id,
        label: def.label,
        skipped: true,
        skipReason: error?.message || 'failed to prepare statement',
        rowCount: null,
        stats: null,
        iterations: 0
      });
      continue;
    }

    let lastResult = null;
    const runner = () => {
      if (def.mode === 'all') {
        lastResult = stmt.all();
      } else if (def.mode === 'raw') {
        lastResult = stmt.run();
      } else {
        lastResult = stmt.get();
      }
      return lastResult;
    };

    const { samples, error } = measureExecution(runner, iterations, warmup);
    const stats = computeStats(samples);
    const rowCount = lastResult == null ? null : extractRowCount(lastResult);

    results.push({
      id: def.id,
      label: def.label,
      stats,
      iterations: samples.length,
      warmup,
      rowCount,
      error: error ? error.message || String(error) : null,
      sample: buildResultPreview(lastResult)
    });
  }
  return results;
}

function printUsage() {
  console.log(`Usage: crawl-query-benchmark [options]\n\n` +
    'Options:\n' +
    '  --db=PATH           Path to SQLite database (default: data/news.db)\n' +
    '  --iterations=N      Number of measured executions per query (default: 5)\n' +
    '  --warmup=N          Warm-up executions before measuring (default: 1)\n' +
    '  --only=a,b,c        Only run queries whose id or label matches\n' +
    '  --json=true         Emit JSON instead of table output\n' +
    '  --list=true         List available query ids and exit\n' +
    '  --quiet=true        Suppress extra commentary\n' +
    '  --help              Show this help text');
}

function main(argv = process.argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printUsage();
    return 0;
  }

  const projectRoot = findProjectRoot(__dirname);
  const defaultDbPath = path.join(projectRoot, 'data', 'news.db');
  const dbPath = args.db ? path.resolve(projectRoot, args.db) : defaultDbPath;

  if (args.list) {
    console.log('Available queries:');
    for (const def of DEFAULT_QUERIES) {
      console.log(` - ${def.id}: ${def.label}`);
    }
    return 0;
  }

  if (!fs.existsSync(dbPath)) {
    console.error(`[crawl-query-benchmark] Database not found at ${dbPath}`);
    return 1;
  }

  const iterations = Number.isFinite(Number(args.iterations)) && Number(args.iterations) > 0
    ? Number(args.iterations)
    : DEFAULT_ITERATIONS;
  const warmup = Number.isFinite(Number(args.warmup)) && Number(args.warmup) >= 0
    ? Number(args.warmup)
    : DEFAULT_WARMUP;

  const selectedQueries = selectQueries(DEFAULT_QUERIES, { only: args.only });
  if (!selectedQueries.length) {
    console.error('[crawl-query-benchmark] No queries selected. Use --list to see options.');
    return 1;
  }

  let db;
  try {
    db = ensureDb(dbPath);
  } catch (error) {
    console.error(`[crawl-query-benchmark] Failed to open database: ${error?.message || error}`);
    return 1;
  }

  let results;
  try {
    results = benchmarkDatabase(db, selectedQueries, { iterations, warmup });
  } finally {
    try { db.close(); } catch (_) {}
  }

  const payload = {
    dbPath,
    iterations,
    warmup,
    hostname: os.hostname(),
    generatedAt: new Date().toISOString(),
    results
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }

  renderTable(results);
  if (!args.quiet) {
    const slowest = results
      .filter((entry) => entry?.stats && Number.isFinite(entry.stats.p95))
      .sort((a, b) => b.stats.p95 - a.stats.p95)[0];
    if (slowest) {
      console.log('\nSlowest query by p95 latency:', slowest.label, `(${formatMs(slowest.stats.p95)} ms)`);
    }
  }
  return 0;
}

if (require.main === module) {
  const code = main(process.argv);
  if (code && Number.isFinite(code) && code !== 0) {
    process.exitCode = code;
  }
}

module.exports = {
  DEFAULT_QUERIES,
  parseArgs,
  computeStats,
  selectQueries,
  benchmarkDatabase,
  measureExecution,
  formatMs
};
