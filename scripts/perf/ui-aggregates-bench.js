#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { program } = require("commander");
const Database = require("better-sqlite3");

const repoRoot = path.resolve(__dirname, "..", "..");
const defaultDbPath = path.join(repoRoot, "data", "news.db");

function repoRequire(relativePath) {
  return require(path.join(repoRoot, relativePath));
}

const urlListing = repoRequire("src/db/sqlite/v1/queries/ui/urlListingNormalized");
const domainSummary = repoRequire("src/db/sqlite/v1/queries/ui/domainSummary");
const recentDomains = repoRequire("src/db/sqlite/v1/queries/ui/recentDomains");
const queueQueries = repoRequire("src/db/sqlite/v1/queries/ui/queues");
const errorQueries = repoRequire("src/db/sqlite/v1/queries/ui/errors");
const crawlQueries = repoRequire("src/db/sqlite/v1/queries/ui/crawls");
const gazetteerCountry = repoRequire("src/db/sqlite/v1/queries/ui/gazetteerCountry");

const STAT_DEFINITIONS = [
  {
    key: "urls.total_count",
    label: "countUrls()",
    thresholdMs: 5,
    run: (db) => urlListing.countUrls(db),
    describe: (value) => ({ type: "number", value })
  },
  {
    key: "urls.page_sample",
    label: "selectUrlPage(limit=1000, offset=0)",
    thresholdMs: 5,
    run: (db) => urlListing.selectUrlPage(db, { limit: 1000, offset: 0 }),
    describe: (value) => ({ type: "array", size: Array.isArray(value) ? value.length : 0 })
  },
  {
    key: "domains.recent_window",
    label: "selectRecentDomains(window=2000, limit=40)",
    thresholdMs: 5,
    run: (db) => recentDomains.selectRecentDomains(db, { windowSize: 2000, limit: 40 }),
    describe: (value) => ({ type: "array", size: Array.isArray(value) ? value.length : 0 })
  },
  {
    key: "domains.article_count",
    label: "getArticleCount(host)",
    thresholdMs: 5,
    run: (db, ctx) => domainSummary.getArticleCount(db, ctx.sampleHost),
    describe: (value, ctx) => ({ type: "number", value, host: ctx.sampleHost })
  },
  {
    key: "domains.fetch_count_join",
    label: "getFetchCountViaJoin(host)",
    thresholdMs: 5,
    run: (db, ctx) => domainSummary.getFetchCountViaJoin(db, ctx.sampleHost),
    describe: (value, ctx) => ({ type: "number", value, host: ctx.sampleHost })
  },
  {
    key: "queues.listQueues",
    label: "listQueues(limit=50)",
    thresholdMs: 3,
    run: (db) => queueQueries.listQueues(db, { limit: 50 }),
    describe: (value) => ({ type: "array", size: Array.isArray(value) ? value.length : 0 })
  },
  {
    key: "errors.listRecent",
    label: "listRecentErrors(limit=200)",
    thresholdMs: 5,
    run: (db) => errorQueries.listRecentErrors(db, { limit: 200 }),
    describe: (value) => ({ type: "array", size: Array.isArray(value) ? value.length : 0 })
  },
  {
    key: "crawls.listRecent",
    label: "listRecentCrawls(limit=50)",
    thresholdMs: 5,
    run: (db) => crawlQueries.listRecentCrawls(db, { limit: 50 }),
    describe: (value) => ({ type: "array", size: Array.isArray(value) ? value.length : 0 })
  },
  {
    key: "gazetteer.country_counts",
    label: "getRegionAndCityCounts(country)",
    thresholdMs: 5,
    run: (db, ctx) => gazetteerCountry.getRegionAndCityCounts(db, ctx.sampleCountry),
    describe: (value, ctx) => ({ type: "object", keys: Object.keys(value || {}).length, country: ctx.sampleCountry })
  }
];

function parseStatFilters(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  return String(input)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function filterStats(filters) {
  if (!filters.length) return STAT_DEFINITIONS;
  return STAT_DEFINITIONS.filter((stat) =>
    filters.some((pattern) => {
      if (pattern === "*") return true;
      if (pattern.endsWith("*")) {
        const prefix = pattern.slice(0, -1);
        return stat.key.startsWith(prefix);
      }
      return stat.key === pattern;
    })
  );
}

function resolveDbPath(options) {
  if (options.db) {
    return path.resolve(options.db);
  }
  if (options.snapshot) {
    const snapshotDir = path.join(repoRoot, "data", "perf-snapshots", options.snapshot);
    const candidates = [
      path.join(snapshotDir, "news.db"),
      path.join(snapshotDir, "ui.db"),
      path.join(snapshotDir, `${options.snapshot}.db`)
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return defaultDbPath;
}

function computeStats(samples) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p) => {
    if (!sorted.length) return null;
    const rank = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    if (lower === upper) return sorted[lower];
    const weight = rank - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  };
  const sum = samples.reduce((acc, val) => acc + val, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / samples.length,
    median: percentile(50),
    p95: percentile(95)
  };
}

function describeValue(value) {
  if (Array.isArray(value)) {
    return { type: "array", size: value.length };
  }
  if (value && typeof value === "object") {
    return { type: "object", keys: Object.keys(value).length };
  }
  return { type: typeof value };
}

function runSingleStat(stat, db, { warmup, iterations, baseContext }) {
  const result = {
    key: stat.key,
    label: stat.label,
    iterations,
    warmup,
    samples: [],
    metrics: null,
    error: null,
    outputMeta: null
  };
  const context = { ...baseContext };
  try {
    for (let i = 0; i < warmup; i += 1) {
      stat.run(db, context);
    }
    let lastValue;
    for (let i = 0; i < iterations; i += 1) {
      const start = process.hrtime.bigint();
      lastValue = stat.run(db, context);
      const durationNs = process.hrtime.bigint() - start;
      result.samples.push(Number(durationNs) / 1e6);
    }
    result.metrics = computeStats(result.samples);
    if (lastValue !== undefined) {
      const meta = typeof stat.describe === "function" ? stat.describe(lastValue, context) : describeValue(lastValue);
      result.outputMeta = meta;
    }
  } catch (error) {
    result.error = {
      name: error?.name || "Error",
      message: error?.message || String(error)
    };
  }
  return result;
}

function classifyStatByThreshold(result, stat) {
  if (result.error || !result.metrics) return { status: "error", recommendation: "manual-check" };
  const median = result.metrics.median ?? Infinity;
  const p95 = result.metrics.p95 ?? Infinity;
  const threshold = Number.isFinite(Number(stat.thresholdMs)) ? Number(stat.thresholdMs) : null;
  if (!threshold) return { status: "unconfigured", recommendation: "no-threshold" };
  if (median <= threshold) return { status: "pass", recommendation: "direct" };
  if (median <= threshold * 1.1) return { status: "warn", recommendation: "needs_cache" };
  if (median >= threshold * 2 || p95 >= threshold * 3) return { status: "fail", recommendation: "cache_required" };
  return { status: "needs_cache", recommendation: "needs_cache" };
}

function ensureParentDir(filePath) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
}

function printTable(results) {
  const header = [
    ["Stat", 30],
    ["Median (ms)", 12],
    ["p95 (ms)", 10],
    ["Min", 8],
    ["Max", 8],
    ["Iter", 6],
    ["Status", 10],
    ["Rec", 8]
  ];
  const rowToString = (row) =>
    row
      .map(([text, width]) => {
        const str = text == null ? "" : String(text);
        if (str.length >= width) return str.slice(0, width);
        return str.padEnd(width, " ");
      })
      .join(" ");
  console.log(rowToString(header));
  for (const stat of results) {
    if (stat.error) {
      console.log(
        rowToString([
          [stat.key, 30],
          ["-", 12],
          ["-", 10],
          ["-", 8],
          ["-", 8],
          [stat.samples.length, 6],
          ["ERROR", 10]
        ])
      );
      console.log(`  ↳ ${stat.error.message}`);
      continue;
    }
    const metrics = stat.metrics || {};
    console.log(
      rowToString([
        [stat.key, 30],
        [metrics.median?.toFixed(3) ?? "-", 12],
        [metrics.p95?.toFixed(3) ?? "-", 10],
        [metrics.min?.toFixed(3) ?? "-", 8],
        [metrics.max?.toFixed(3) ?? "-", 8],
        [stat.samples.length, 6],
        [stat.status?.toUpperCase() || "-", 10],
        [stat.recommendation || "-", 8]
      ])
    );
  }
}

function main() {
  program
    .description("Benchmark low-level aggregate queries used by the UI data explorer")
    .option("--db <path>", "Explicit SQLite database file to benchmark")
    .option("--snapshot <name>", "Snapshot name under data/perf-snapshots")
    .option("--stats <keys>", "Comma-separated stat keys or prefix* filters")
    .option("--iterations <number>", "Timed iterations per stat (default 25)")
    .option("--warmup <number>", "Warm-up runs per stat (default 1)")
    .option("--json", "Print JSON summary to stdout")
    .option("--output <path>", "Write JSON summary to file")
    .option("--list", "List available stat keys")
    .option("--sample-host <host>", "Host used for host-scoped stats", "guardian.co.uk")
    .option("--sample-country <code>", "Country code used for gazetteer stats", "GB")
    .parse(process.argv);

  const opts = program.opts();

  if (opts.list) {
    console.log("Available stat keys:");
    for (const stat of STAT_DEFINITIONS) {
      console.log(` - ${stat.key}\t${stat.label}`);
    }
    return;
  }

  const statFilters = parseStatFilters(opts.stats);
  const statsToRun = filterStats(statFilters);
  if (!statsToRun.length) {
    console.error("No stats matched the provided filters.");
    process.exitCode = 1;
    return;
  }

  const iterations = Number.isFinite(Number(opts.iterations)) && Number(opts.iterations) > 0 ? Number(opts.iterations) : 25;
  const warmup = Number.isFinite(Number(opts.warmup)) && Number(opts.warmup) >= 0 ? Number(opts.warmup) : 1;

  const dbPath = resolveDbPath(opts);
  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found at ${dbPath}`);
    process.exitCode = 1;
    return;
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const baseContext = {
    sampleHost: opts.sampleHost || "guardian.co.uk",
    sampleCountry: opts.sampleCountry || "GB"
  };

  const runMetadata = {
    snapshot: opts.snapshot || null,
    dbPath,
    startedAt: new Date().toISOString(),
    iterations,
    warmup,
    stats: statFilters.length ? statFilters : "(all)"
  };

  let results;
  try {
    results = statsToRun.map((stat) => runSingleStat(stat, db, { warmup, iterations, baseContext }));
    // classify each stat by thresholds
    results.forEach((r, i) => {
      const stat = statsToRun[i];
      const classification = classifyStatByThreshold(r, stat);
      r.status = classification.status;
      r.recommendation = classification.recommendation;
    });
  } finally {
    db.close();
  }

  const payload = {
    metadata: runMetadata,
    results
  };

  if (opts.output) {
    const outputPath = path.resolve(opts.output);
    ensureParentDir(outputPath);
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
    console.log(`Wrote benchmark JSON to ${outputPath}`);
  }

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    printTable(results);
  }
}

main();
