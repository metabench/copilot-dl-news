"use strict";

const { countUrls } = require('../../../data/db/sqlite/v1/queries/ui/urlListingNormalized");
const { selectRecentDomains } = require('../../../data/db/sqlite/v1/queries/ui/recentDomains");
const {
  resolveDbHandle,
  ensureUiCachedMetricsTable,
  selectMetricRow,
  upsertCachedMetricRow
} = require('../../../data/db/sqlite/v1/queries/ui/uiCachedMetrics");

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

const STAT_DEFINITIONS = [
  {
    key: "urls.total_count",
    description: "Total rows present in the urls table.",
    category: "urls",
    maxAgeMs: 5 * 60 * 1000,
    intervalMs: 5 * 60 * 1000,
    compute: ({ db }) => ({
      value: countUrls(db),
      units: "rows"
    })
  },
  {
    key: "domains.top_hosts_window",
    description: "Windowed recent domain snapshot used by the /domains view.",
    category: "domains",
    maxAgeMs: 5 * 60 * 1000,
    intervalMs: 5 * 60 * 1000,
    params: { windowSize: 4000, limit: 40 },
    sourceWindow: "last_4000_fetches",
    compute: ({ db, definition }) => {
      const windowSize = definition?.params?.windowSize || 4000;
      const limit = definition?.params?.limit || 40;
      const rows = selectRecentDomains(db, { windowSize, limit }).map((row) => ({
        host: row.host,
        articleCount: row.article_count,
        lastSavedAt: row.last_saved_at
      }));
      return {
        windowSize,
        limit,
        hosts: rows
      };
    }
  },
  {
    key: "storage.total_bytes",
    description: "Aggregate storage footprint (compressed + uncompressed).",
    category: "storage",
    maxAgeMs: 10 * 60 * 1000,
    intervalMs: 10 * 60 * 1000,
    compute: ({ db }) => {
      const { getStorageTotals } = require('../../../data/db/sqlite/v1/queries/ui/storage");
      const row = getStorageTotals(db);
      return {
        objectCount: row?.objectCount ?? 0,
        uncompressedBytes: row?.uncompressedBytes ?? 0,
        compressedBytes: row?.compressedBytes ?? 0,
        compressionRatio: row?.uncompressedBytes
          ? Number((row.uncompressedBytes / Math.max(1, row.compressedBytes || row.uncompressedBytes)).toFixed(4))
          : null
      };
    }
  },
  {
    key: "errors.daily_host_histogram",
    description: "Error counts grouped by host + day for the last week.",
    category: "errors",
    maxAgeMs: 10 * 60 * 1000,
    intervalMs: 10 * 60 * 1000,
    params: { days: 7, limit: 200 },
    sourceWindow: "last_7_days",
    compute: ({ db, definition }) => {
      const days = definition?.params?.days || 7;
      const limit = definition?.params?.limit || 200;
      const { dailyHostHistogram } = require('../../../data/db/sqlite/v1/queries/ui/errors");
      const rows = dailyHostHistogram(db).all(`-${days} days`, limit);
      return {
        days,
        limit,
        rows
      };
    }
  }
];

function getStatDefinitions() {
  return STAT_DEFINITIONS.slice();
}

function getStatDefinition(statKey) {
  if (!statKey) return null;
  return STAT_DEFINITIONS.find((definition) => definition.key === statKey) || null;
}

function serializeJson(payload) {
  if (payload == null) {
    return "null";
  }
  try {
    return JSON.stringify(payload);
  } catch (error) {
    return JSON.stringify({ value: payload, warning: "payload_not_serializable" });
  }
}

function safeJsonParse(value) {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return value;
  }
}

function upsertCachedMetric(dbOrWrapper, entry) {
  ensureUiCachedMetricsTable(dbOrWrapper);
  return upsertCachedMetricRow(dbOrWrapper, {
    statKey: entry.statKey,
    payload: serializeJson(entry.payload),
    generatedAt: entry.generatedAt,
    sourceWindow: entry.sourceWindow || null,
    durationMs: Number.isFinite(entry.durationMs) ? Math.round(entry.durationMs) : null,
    maxAgeMs: Number.isFinite(entry.maxAgeMs) ? Math.round(entry.maxAgeMs) : entry.maxAgeMs ?? null,
    error: entry.error || null,
    metadata: entry.metadata ? serializeJson(entry.metadata) : null
  });
}

function buildStaleness(row, definition, now = new Date(), fallbackMaxAgeMs) {
  const maxAgeMs = row?.maxAgeMs ?? definition?.maxAgeMs ?? fallbackMaxAgeMs ?? DEFAULT_MAX_AGE_MS;
  if (!row?.generatedAt || !Number.isFinite(maxAgeMs)) {
    return { stale: false, maxAgeMs: maxAgeMs ?? null };
  }
  const generatedAtMs = Date.parse(row.generatedAt);
  if (!Number.isFinite(generatedAtMs)) {
    return { stale: false, maxAgeMs };
  }
  const age = now.getTime() - generatedAtMs;
  return { stale: age > maxAgeMs, maxAgeMs };
}

function getCachedMetric(db, statKey, options = {}) {
  const dbHandle = resolveDbHandle(db);
  if (!dbHandle) {
    throw new TypeError("getCachedMetric requires a sqlite db handle");
  }
  ensureUiCachedMetricsTable(dbHandle);
  const row = selectMetricRow(dbHandle, statKey);
  if (!row) {
    return null;
  }
  const definition = getStatDefinition(statKey);
  const staleness = buildStaleness(row, definition, options.now || new Date(), options.defaultMaxAgeMs);
  return {
    statKey,
    payload: safeJsonParse(row.payload),
    generatedAt: row.generatedAt,
    durationMs: row.durationMs ?? null,
    maxAgeMs: staleness.maxAgeMs,
    stale: staleness.stale,
    sourceWindow: row.sourceWindow || definition?.sourceWindow || null,
    error: row.error || null,
    metadata: safeJsonParse(row.metadata)
  };
}

async function computeStat(db, definition, ctx = {}) {
  if (!definition || typeof definition.compute !== "function") {
    throw new Error(`Missing compute implementation for stat ${definition?.key}`);
  }
  const started = Date.now();
  const payload = await Promise.resolve(definition.compute({ db, definition, context: ctx.context || {} }));
  const durationMs = Date.now() - started;
  return { payload, durationMs };
}

async function refreshStat(db, statKeyOrDefinition, options = {}) {
  ensureUiCachedMetricsTable(db);
  const definition = typeof statKeyOrDefinition === "string"
    ? getStatDefinition(statKeyOrDefinition)
    : statKeyOrDefinition;
  if (!definition) {
    throw new Error(`Unknown stat key: ${statKeyOrDefinition}`);
  }
  const timestamp = options.now ? new Date(options.now) : new Date();
  const isoNow = Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : new Date().toISOString();
  try {
    const { payload, durationMs } = await computeStat(db, definition, options);
    upsertCachedMetric(db, {
      statKey: definition.key,
      payload,
      generatedAt: isoNow,
      sourceWindow: definition.sourceWindow || options.sourceWindow || null,
      durationMs,
      maxAgeMs: options.maxAgeMs ?? definition.maxAgeMs ?? DEFAULT_MAX_AGE_MS,
      metadata: options.metadata || { category: definition.category }
    });
    return {
      statKey: definition.key,
      generatedAt: isoNow,
      durationMs,
      payload,
      error: null
    };
  } catch (error) {
    const message = error?.message || "stat_compute_failed";
    upsertCachedMetric(db, {
      statKey: definition.key,
      payload: {},
      generatedAt: isoNow,
      sourceWindow: definition.sourceWindow || null,
      durationMs: null,
      maxAgeMs: options.maxAgeMs ?? definition.maxAgeMs ?? DEFAULT_MAX_AGE_MS,
      error: message,
      metadata: { category: definition.category, failure: true }
    });
    return {
      statKey: definition.key,
      generatedAt: isoNow,
      durationMs: null,
      payload: null,
      error: message
    };
  }
}

module.exports = {
  DEFAULT_MAX_AGE_MS,
  STAT_DEFINITIONS,
  getStatDefinitions,
  getStatDefinition,
  getCachedMetric,
  upsertCachedMetric,
  computeStat,
  refreshStat
};
