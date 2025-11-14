#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { openNewsDb } = require("../../src/db/dbAccess");
const {
  getStatDefinitions,
  refreshStat
} = require("../../src/ui/server/services/metricsService");

const DEFAULT_INTERVAL_MS = 60 * 1000;

function parseArgs(argv) {
  const args = { once: false };
  const tokens = Array.isArray(argv) ? argv.slice() : [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) continue;
    switch (token) {
      case "--config":
      case "-c":
        args.config = tokens[++i];
        break;
      case "--db":
        args.dbPath = tokens[++i];
        break;
      case "--once":
        args.once = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--limit":
        args.limit = Number(tokens[++i]) || null;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        if (token.startsWith("--config=")) {
          args.config = token.split("=")[1];
        } else if (token.startsWith("--db=")) {
          args.dbPath = token.split("=")[1];
        }
        break;
    }
  }
  return args;
}

function loadConfig(projectRoot, configPath) {
  const explicitPath = configPath ? path.resolve(configPath) : null;
  const defaultPath = path.join(projectRoot, "config", "uiMetrics.json");
  const examplePath = path.join(projectRoot, "config", "uiMetrics.example.json");
  const candidates = [explicitPath, defaultPath, examplePath].filter(Boolean);
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const payload = JSON.parse(fs.readFileSync(candidate, "utf8"));
      return { ...payload, _sourcePath: candidate };
    } catch (error) {
      console.warn(`[metrics-worker] Failed to parse ${candidate}: ${error.message}`);
    }
  }
  return {
    dbPath: path.join(projectRoot, "data", "news.db"),
    stats: {},
    defaultIntervalMs: DEFAULT_INTERVAL_MS,
    _sourcePath: null
  };
}

function resolveStatOverrides(configStats = {}) {
  if (Array.isArray(configStats)) {
    const entries = {};
    configStats.forEach((key) => {
      if (typeof key === "string") {
        entries[key] = { enabled: true };
      } else if (key && typeof key === "object" && key.key) {
        entries[key.key] = { ...key };
      }
    });
    return entries;
  }
  if (configStats && typeof configStats === "object") {
    return configStats;
  }
  return {};
}

function buildRuntimeStat(definition, override, defaults) {
  const enabled = override?.enabled !== false;
  if (!enabled) return null;
  const intervalMs = override?.intervalMs
    ?? defaults.defaultIntervalMs
    ?? definition.intervalMs
    ?? DEFAULT_INTERVAL_MS;
  const maxAgeMs = override?.maxAgeMs ?? definition.maxAgeMs;
  return {
    definition,
    intervalMs: Math.max(5000, Number(intervalMs) || DEFAULT_INTERVAL_MS),
    maxAgeMs,
    metadata: override?.metadata || {}
  };
}

function buildRuntimeStats(definitions, config) {
  const overrides = resolveStatOverrides(config.stats);
  return definitions
    .map((definition) => buildRuntimeStat(definition, overrides[definition.key], config))
    .filter(Boolean);
}

async function runStat(db, runtimeStat, logger) {
  const { definition, maxAgeMs, metadata } = runtimeStat;
  const result = await refreshStat(db, definition, {
    maxAgeMs,
    metadata: { ...metadata, intervalMs: runtimeStat.intervalMs }
  });
  if (result.error) {
    logger.warn?.(`[metrics-worker] ${definition.key} recorded error: ${result.error}`);
  } else {
    logger.info?.(
      `[metrics-worker] ${definition.key} refreshed in ${result.durationMs ?? "?"}ms`
    );
  }
  return result;
}

async function runOnce(db, runtimeStats, logger) {
  for (const runtimeStat of runtimeStats) {
    await runStat(db, runtimeStat, logger);
  }
}

class StatRunner {
  constructor(db, runtimeStat, logger) {
    this.db = db;
    this.runtimeStat = runtimeStat;
    this.logger = logger;
    this.timer = null;
    this.running = false;
  }

  start(initialDelay = 0) {
    this.schedule(initialDelay);
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  schedule(delay) {
    this.timer = setTimeout(() => {
      this.tick().catch((error) => {
        this.logger.error?.(
          `[metrics-worker] ${this.runtimeStat.definition.key} tick failed: ${error.message}`
        );
        this.schedule(this.runtimeStat.intervalMs);
      });
    }, Math.max(0, delay));
  }

  async tick() {
    if (this.running) {
      this.logger.warn?.(
        `[metrics-worker] ${this.runtimeStat.definition.key} skipped tick (still running)`
      );
      this.schedule(this.runtimeStat.intervalMs);
      return;
    }
    this.running = true;
    try {
      await runStat(this.db, this.runtimeStat, this.logger);
    } finally {
      this.running = false;
      this.schedule(this.runtimeStat.intervalMs);
    }
  }
}

async function main() {
  const projectRoot = path.join(__dirname, "../..");
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node scripts/ui/run-aggregate-worker.js [--config path] [--db path] [--once]`);
    process.exit(0);
  }
  const config = loadConfig(projectRoot, args.config);
  if (args.dbPath) {
    config.dbPath = args.dbPath;
  }
  if (!config.dbPath) {
    throw new Error("Database path missing (set in config or via --db)");
  }

  console.log(`[metrics-worker] Using database ${config.dbPath}`);
  if (config._sourcePath) {
    console.log(`[metrics-worker] Loaded config from ${config._sourcePath}`);
  } else {
    console.log("[metrics-worker] Using built-in defaults (no config file found)");
  }

  const dbAccess = openNewsDb(config.dbPath);
  const db = dbAccess.db;
  const logger = {
    info: (msg) => console.log(msg),
    warn: (msg) => console.warn(msg),
    error: (msg) => console.error(msg)
  };

  const runtimeStats = buildRuntimeStats(getStatDefinitions(), config);
  if (!runtimeStats.length) {
    console.warn("[metrics-worker] No stats enabled; exiting");
    dbAccess.close();
    return;
  }

  // limit stats if requested
  if (args.limit) {
    runtimeStats.splice(args.limit);
  }

  if (args.dryRun) {
    logger.info?.('[metrics-worker] Dry-run mode: no stats will be refreshed.');
    for (const s of runtimeStats) {
      logger.info?.(JSON.stringify({ stat: s.definition.key, intervalMs: s.intervalMs, maxAgeMs: s.maxAgeMs }));
    }
    dbAccess.close();
    return;
  }

  if (args.once) {
    await runOnce(db, runtimeStats, logger);
    dbAccess.close();
    return;
  }

  const runners = runtimeStats.map((runtimeStat, index) => {
    const runner = new StatRunner(db, runtimeStat, logger);
    runner.start(index * 1000);
    return runner;
  });

  const shutdown = () => {
    console.log("[metrics-worker] Shutting down...");
    runners.forEach((runner) => runner.stop());
    dbAccess.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(`[metrics-worker] Fatal error: ${error.message}`);
  process.exit(1);
});
