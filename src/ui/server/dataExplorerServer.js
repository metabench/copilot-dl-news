"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const express = require("express");
const compression = require("compression");
const jsgui = require("jsgui3-html");
const { spawn } = require("child_process");

// PID file for detached mode management
const PID_FILE = path.join(process.cwd(), "tmp", ".data-explorer.pid");

const { openNewsDb } = require("../../db/dbAccess");
const { findProjectRoot } = require("../../utils/project-root");
const {
  selectUrlPage,
  countUrls,
  selectFetchedUrlPage,
  countFetchedUrls
} = require("../../db/sqlite/v1/queries/ui/urlListingNormalized");
const {
  getArticleCount,
  getFetchCountDirect,
  getFetchCountViaJoin
} = require("../../db/sqlite/v1/queries/ui/domainSummary");
const { listRecentCrawls } = require("../../db/sqlite/v1/queries/ui/crawls");
const { listRecentErrors } = require("../../db/sqlite/v1/queries/ui/errors");
const { selectUrlById, selectFetchHistory } = require("../../db/sqlite/v1/queries/ui/urlDetails");
const { selectHostSummary, selectHostDownloads } = require("../../db/sqlite/v1/queries/ui/domainDetails");
const { listConfiguration } = require("../../db/sqlite/v1/queries/ui/configuration");
const { getCachedMetric } = require("./services/metricsService");
const { renderHtml, resolveDbPath } = require("../render-url-table");
const { buildDomainSnapshot, createHomeCardLoaders } = require("../homeCardData");
const { buildHomeCards: buildSharedHomeCards } = require("../homeCards");
const {
  buildColumns,
  buildDisplayRows,
  formatDateTime,
  buildIndexCell,
  formatCount
} = require("../controls/UrlListingTable");
const {
  buildDomainSummaryColumns,
  buildDomainSummaryRows
} = require("../controls/DomainSummaryTable");
const {
  buildDomainDownloadColumns,
  buildDomainDownloadRows
} = require("../controls/DomainDownloadsTable");
const {
  buildCrawlJobColumns,
  buildCrawlJobRows
} = require("../controls/CrawlJobsTable");
const {
  buildErrorLogColumns,
  buildErrorLogRows
} = require("../controls/ErrorLogTable");
const { ConfigMatrixControl } = require("../controls/ConfigMatrixControl");
const {
  buildNavLinks,
  buildBackLinkTarget,
  deriveBackLink,
  appendBackParams,
  buildBreadcrumbs
} = require("./navigation");
const { ensureClientBundle } = require("./utils/ensureClientBundle");

const StringControl = jsgui.String_Control;

function attachBackLink(rows, key, backLink) {
  if (!Array.isArray(rows) || !backLink || !backLink.href) return rows;
  rows.forEach((row) => {
    if (!row) return;
    const cell = row[key];
    if (cell && typeof cell === "object" && cell.href) {
      cell.href = appendBackParams(cell.href, backLink);
    }
  });
  return rows;
}

const DEFAULT_PORT = 4600;
const DEFAULT_PAGE_SIZE = 1000;
const MAX_PAGE_SIZE = 2000;
const DOMAIN_WINDOW_SIZE = 4000;
const DOMAIN_LIMIT = 40;
const CRAWL_LIMIT = 80;
const ERROR_LIMIT = 200;
const HOME_CARD_CRAWL_LIMIT = 12;
const HOME_CARD_ERROR_LIMIT = 50;
const DEFAULT_TITLE = "Crawler Data Explorer";
const DOMAIN_DOWNLOAD_LIMIT = 200;
const API_HEADER_NAME = "dataExplorer";

function sanitizePage(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return 1;
  return Math.trunc(numeric);
}

function sanitizePageSize(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(10, Math.trunc(numeric)));
}

const TRUTHY_QUERY_VALUES = new Set(["1", "true", "t", "yes", "on", "only"]);
const FALSY_QUERY_VALUES = new Set(["0", "false", "f", "no", "off"]);

function toBooleanQueryFlag(value) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const resolved = toBooleanQueryFlag(value[i]);
      if (resolved !== undefined) return resolved;
    }
    return false;
  }
  if (value == null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return false;
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (TRUTHY_QUERY_VALUES.has(normalized)) return true;
    if (FALSY_QUERY_VALUES.has(normalized)) return false;
    return true;
  }
  return Boolean(value);
}

function resolveUrlFilterState(query = {}) {
  return {
    hasFetches: toBooleanQueryFlag(query.hasFetches)
  };
}

function snapshotQueryParams(query = {}) {
  const result = {};
  Object.entries(query || {}).forEach(([key, rawValue]) => {
    if (rawValue == null) return;
    if (Array.isArray(rawValue)) {
      const values = rawValue
        .map((value) => (value == null ? null : String(value)))
        .filter((value) => value != null);
      if (values.length) {
        result[key] = values;
      }
      return;
    }
    result[key] = String(rawValue);
  });
  return result;
}

function buildUrlFilterOptions({ req, basePath, filters, querySnapshot }) {
  if (!req || !basePath) return null;
  const apiPath = `${req.baseUrl || ""}/api/urls`;
  return {
    apiPath,
    basePath,
    query: querySnapshot || {},
    hasFetches: !!(filters && filters.hasFetches),
    label: "Show fetched URLs only",
    defaultPage: 1
  };
}

function buildHref(basePath, query, targetPage) {
  const params = new URLSearchParams();
  const entries = query && typeof query === "object" ? Object.entries(query) : [];
  entries.forEach(([key, rawValue]) => {
    if (key === "page" || rawValue == null) return;
    const value = Array.isArray(rawValue) ? rawValue : [rawValue];
    value.filter((v) => v != null && v !== "").forEach((v) => params.append(key, String(v)));
  });
  if (targetPage > 1) {
    params.set("page", String(targetPage));
  }
  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

function tryGetCachedUrlTotals(db) {
  if (!db) return null;
  try {
    const cached = getCachedMetric(db, "urls.total_count");
    if (cached && cached.payload && Number.isFinite(Number(cached.payload.value))) {
      return {
        source: "cache",
        totalRows: Number(cached.payload.value) || 0,
        cache: {
          statKey: cached.statKey,
          generatedAt: cached.generatedAt,
          stale: cached.stale,
          maxAgeMs: cached.maxAgeMs
        }
      };
    }
  } catch (_) {
    // cache read failures fall back to live count
  }
  return null;
}

function buildUrlTotals(db, options = {}) {
  if (options.hasFetches) {
    return {
      source: "live",
      totalRows: countFetchedUrls(db),
      cache: null
    };
  }
  const cached = tryGetCachedUrlTotals(db);
  if (cached) {
    return cached;
  }
  return {
    source: "live",
    totalRows: countUrls(db),
    cache: null
  };
}

function buildPagination(basePath, query, { totalRows, pageSize, currentPage }) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const offset = (safePage - 1) * pageSize;
  const startRow = totalRows === 0 ? 0 : offset + 1;
  const remaining = Math.max(0, totalRows - offset);
  const endRow = remaining === 0 ? 0 : offset + Math.min(pageSize, remaining);
  const makeHref = (page) => buildHref(basePath, query, page);
  return {
    currentPage: safePage,
    totalPages,
    totalRows,
    pageSize,
    startRow,
    endRow,
    offset,
    prevHref: safePage > 1 ? makeHref(safePage - 1) : null,
    nextHref: safePage < totalPages ? makeHref(safePage + 1) : null,
    firstHref: safePage > 1 ? makeHref(1) : null,
    lastHref: safePage < totalPages ? makeHref(totalPages) : null
  };
}

function formatStatValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return "—";
  return formatCount(numeric);
}

function formatOptionalDate(value) {
  if (!value) return null;
  const formatted = formatDateTime(value, true);
  return formatted && formatted !== "—" ? formatted : null;
}

function buildHourlySparkline(fetches, { bucketCount = 24, bucketMs = 60 * 60 * 1000, nowMs } = {}) {
  const count = Number.isFinite(bucketCount) && bucketCount > 0 ? Math.trunc(bucketCount) : 24;
  const interval = Number.isFinite(bucketMs) && bucketMs > 0 ? bucketMs : 60 * 60 * 1000;
  const reference = Number.isFinite(nowMs) ? nowMs : Date.now();
  const series = new Array(count).fill(0);
  if (!Array.isArray(fetches) || fetches.length === 0) {
    return series;
  }
  fetches.forEach((entry) => {
    const rawTs = entry && (entry.fetchedAt || entry.requestedAt || entry.fetched_at || entry.request_started_at);
    const ts = rawTs ? Date.parse(rawTs) : Number(entry && entry.timestamp);
    if (!Number.isFinite(ts)) return;
    const age = reference - ts;
    const bucketIndex = Math.floor(age / interval);
    if (bucketIndex >= 0 && bucketIndex < count) {
      const mappedIndex = count - 1 - bucketIndex;
      if (mappedIndex >= 0 && mappedIndex < count) {
        series[mappedIndex] += 1;
      }
    }
  });
  return series;
}

function generateRequestId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(8).toString("hex");
}

function markRequestStart() {
  if (typeof process.hrtime === "function" && typeof process.hrtime.bigint === "function") {
    return process.hrtime.bigint();
  }
  return Date.now();
}

function computeDurationMs(startMark) {
  if (typeof startMark === "bigint" && typeof process.hrtime === "function" && typeof process.hrtime.bigint === "function") {
    const diff = process.hrtime.bigint() - startMark;
    return Number(diff) / 1e6;
  }
  if (typeof startMark === "number") {
    return Date.now() - startMark;
  }
  return null;
}

function buildRequestDiagnostics(req, extra = {}) {
  const durationMs = computeDurationMs(req && req.__copilotRequestStart);
  return {
    requestId: (req && req.__copilotRequestId) || null,
    durationMs: durationMs != null ? Number(durationMs) : null,
    timestamp: new Date().toISOString(),
    route: req && req.path ? req.path : null,
    ...extra
  };
}

function applyDiagnosticsHeaders(res, diagnostics = {}) {
  if (!res) return;
  if (diagnostics.requestId) {
    res.setHeader("x-copilot-request-id", diagnostics.requestId);
  }
  if (Number.isFinite(diagnostics.durationMs)) {
    res.setHeader("x-copilot-duration-ms", diagnostics.durationMs.toFixed(2));
  }
  if (diagnostics.error) {
    res.setHeader("x-copilot-error", "1");
  }
  res.setHeader("x-copilot-api", API_HEADER_NAME);
}

function acceptsJson(req) {
  if (!req || !req.headers) return false;
  const accept = req.headers.accept;
  if (!accept || typeof accept !== "string") return false;
  return accept.toLowerCase().includes("application/json");
}

function getFetchCountForHost(db, host) {
  if (!host) return 0;
  try {
    const direct = getFetchCountDirect(db, host);
    if (direct > 0) return direct;
  } catch (_) {
    // ignore and fall back to join
  }
  try {
    return getFetchCountViaJoin(db, host);
  } catch (_) {
    return 0;
  }
}

function toLowerHost(host) {
  if (!host) return null;
  return String(host).toLowerCase();
}

const URL_COLUMNS = buildColumns();

function renderConfigView({ db, relativeDb, now }) {
  const settings = listConfiguration(db);
  const properties = settings.map((row) => ({
    key: row.key,
    value: row.value,
    source: "crawler_settings",
    description: `Last updated: ${formatDateTime(row.updatedAt, true)}`
  }));

  const control = new ConfigMatrixControl({
    sections: [
      {
        title: "Crawler Settings",
        description: "Configuration values stored in the database.",
        properties
      }
    ]
  });

  return {
    title: "Configuration",
    columns: [],
    rows: [],
    meta: {
      rowCount: settings.length,
      limit: settings.length,
      dbLabel: relativeDb,
      generatedAt: formatDateTime(now, true),
      subtitle: `${settings.length} settings loaded from ${relativeDb}`
    },
    renderOptions: {
      layoutMode: "single-control",
      mainControl: control
    }
  };
}

const DATA_VIEWS = [
  {
    key: "home",
    path: "/",
    navLabel: "Home",
    title: "Crawler Operations Dashboard",
    render: renderDashboardView
  },
  {
    key: "urls",
    path: "/urls",
    navLabel: "URLs",
    title: "Crawler URL Snapshot",
    render: renderUrlListingView
  },
  {
    key: "domains",
    path: "/domains",
    navLabel: "Domains",
    title: "Recent Domain Activity",
    render: renderDomainSummaryView
  },
  {
    key: "crawls",
    path: "/crawls",
    navLabel: "Crawls",
    title: "Recent Crawl Jobs",
    render: renderCrawlJobsView
  },
  {
    key: "errors",
    path: "/errors",
    navLabel: "Errors",
    title: "Recent Crawl Errors",
    render: renderErrorLogView
  },
  {
    key: "config",
    path: "/config",
    navLabel: "Config",
    title: "Configuration",
    render: renderConfigView
  }
];

function buildUrlListingPayload({ req, db, relativeDb, pageSize, now, basePathOverride }) {
  if (!req || !db) {
    throw new Error("buildUrlListingPayload requires an express request and database handle");
  }
  const query = req.query || {};
  const filters = resolveUrlFilterState(query);
  const totals = buildUrlTotals(db, { hasFetches: filters.hasFetches });
  const requestedPage = sanitizePage(query.page);
  const basePath = basePathOverride || (((req.baseUrl || "") + (req.path || "")) || "/urls");
  const querySnapshot = snapshotQueryParams(query);
  const pagination = buildPagination(basePath, query, {
    totalRows: totals.totalRows,
    pageSize,
    currentPage: requestedPage
  });
  const selector = filters.hasFetches ? selectFetchedUrlPage : selectUrlPage;
  const records = selector(db, { limit: pageSize, offset: pagination.offset });
  const rows = buildDisplayRows(records, { startIndex: pagination.startRow > 0 ? pagination.startRow : 1 });
  const subtitle = totals.totalRows === 0
    ? filters.hasFetches
      ? `No fetched URLs available in ${relativeDb}`
      : `No URLs available in ${relativeDb}`
    : buildUrlSummarySubtitle({
      startRow: pagination.startRow,
      endRow: pagination.endRow,
      totalRows: totals.totalRows,
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
      totals,
      filters
    });
  const meta = {
    rowCount: rows.length,
    limit: pageSize,
    dbLabel: relativeDb,
    generatedAt: formatDateTime(now, true),
    subtitle,
    pagination,
    filters: { ...filters }
  };
  return {
    rows,
    records,
    filters,
    totals,
    meta,
    pagination,
    basePath,
    query: querySnapshot
  };
}

function buildHomeCards({ totals, db }) {
  if (!db) {
    return buildSharedHomeCards({ totals });
  }
  const loaders = createHomeCardLoaders({
    db,
    domainWindowSize: DOMAIN_WINDOW_SIZE,
    domainLimit: DOMAIN_LIMIT,
    crawlLimit: HOME_CARD_CRAWL_LIMIT,
    errorLimit: HOME_CARD_ERROR_LIMIT
  });
  return buildSharedHomeCards({ totals, loaders });
}

function renderDashboardView({ db, relativeDb, now }) {
  const totals = buildUrlTotals(db);
  const totalCount = totals && Number.isFinite(Number(totals.totalRows)) ? Number(totals.totalRows) : null;
  const subtitle = totalCount != null
    ? `Monitoring ${formatCount(totalCount)} URLs tracked in ${relativeDb}`
    : `Monitoring crawler activity for ${relativeDb}`;
  const homeCards = buildHomeCards({ totals, db });
  return {
    title: "Crawler Operations Dashboard",
    columns: [],
    rows: [],
    meta: {
      rowCount: 0,
      limit: 0,
      dbLabel: relativeDb,
      generatedAt: formatDateTime(now, true),
      subtitle
    },
    renderOptions: {
      homeCards,
      layoutMode: "dashboard",
      hideListingPanel: true,
      includeDashboardScaffold: true,
      dashboardSections: buildDashboardSections()
    }
  };
}

function createCrawlerStatusSection(context) {
  const container = new jsgui.div({ context });
  const badges = new jsgui.div({ context, class: "status-badges" });

  const stageBadge = new jsgui.span({ context, class: "status-pill" });
  stageBadge.dom.attributes["data-crawl-stage"] = "";
  stageBadge.add(new StringControl({ context, text: "Stage: idle" }));
  badges.add(stageBadge);

  const pausedBadge = new jsgui.span({ context, class: "status-pill status-pill--paused" });
  pausedBadge.dom.attributes["data-crawl-paused"] = "";
  pausedBadge.dom.attributes.hidden = "hidden";
  pausedBadge.add(new StringControl({ context, text: "Paused" }));
  badges.add(pausedBadge);

  const typeBadge = new jsgui.span({ context, class: "status-pill status-pill--meta" });
  typeBadge.dom.attributes["data-crawl-type-label"] = "";
  typeBadge.add(new StringControl({ context, text: "standard" }));
  badges.add(typeBadge);

  container.add(badges);

  const startupStatus = new jsgui.div({ context, class: "startup-status" });
  startupStatus.dom.attributes["data-crawl-startup-status"] = "";
  startupStatus.dom.attributes.hidden = "hidden";

  const statusText = new jsgui.p({ context, class: "startup-status__text" });
  statusText.dom.attributes["data-crawl-startup-text"] = "";
  statusText.add(new StringControl({ context, text: "Awaiting startup events" }));
  startupStatus.add(statusText);

  const progress = new jsgui.div({ context, class: "startup-progress" });
  const progressFill = new jsgui.div({ context, class: "startup-progress__fill" });
  progressFill.dom.attributes["data-crawl-startup-progress"] = "";
  progress.add(progressFill);
  startupStatus.add(progress);

  const stagesList = new jsgui.ul({ context, class: "startup-stage-list" });
  stagesList.dom.attributes["data-crawl-startup-stages"] = "";
  const placeholder = new jsgui.li({ context });
  placeholder.add(new StringControl({ context, text: "No startup activity yet." }));
  stagesList.add(placeholder);
  startupStatus.add(stagesList);

  container.add(startupStatus);
  return container;
}

function createJobsPanelSection(context) {
  const wrapper = new jsgui.div({ context });
  const list = new jsgui.div({ context, class: "jobs-list" });
  list.dom.attributes["data-crawl-jobs-list"] = "";
  list.dom.attributes["aria-live"] = "polite";
  list.dom.attributes["aria-busy"] = "true";
  const empty = new jsgui.div({ context, class: "jobs-empty-state" });
  const icon = new jsgui.span({ context, class: "jobs-empty-state__icon" });
  icon.add(new StringControl({ context, text: "..." }));
  const text = new jsgui.p({ context, class: "jobs-empty-state__text" });
  text.add(new StringControl({ context, text: "Waiting for crawl jobs to start." }));
  empty.add(icon);
  empty.add(text);
  list.add(empty);
  wrapper.add(list);
  return wrapper;
}

function buildDashboardSections() {
  return [
    {
      key: "crawler-status",
      title: "Crawler Status",
      className: "status-panel",
      meta: "Live stage + startup feed",
      render: ({ context }) => createCrawlerStatusSection(context)
    },
    {
      key: "crawler-jobs",
      title: "Active Jobs",
      className: "jobs-panel",
      meta: "Latest crawl jobs from SSE stream",
      render: ({ context }) => createJobsPanelSection(context)
    }
  ];
}


function renderUrlListingView({ req, db, relativeDb, pageSize, now }) {
  const { rows, totals, meta, filters, basePath, query, records } = buildUrlListingPayload({ req, db, relativeDb, pageSize, now });
  const backTarget = buildBackLinkTarget(req, { defaultLabel: "URLs" });
  attachBackLink(rows, "url", backTarget);
  attachBackLink(rows, "host", backTarget);
  const decoratedMeta = buildUrlMeta({
    meta,
    totals,
    now
  });
  const filterOptions = buildUrlFilterOptions({
    req,
    basePath,
    filters,
    querySnapshot: query
  });
  const listingState = {
    ok: true,
    columns: URL_COLUMNS,
    rows,
    meta: decoratedMeta,
    filters,
    totals,
    records,
    query,
    basePath
  };
  return {
    title: "Crawler URL Snapshot",
    columns: URL_COLUMNS,
    rows,
    meta: decoratedMeta,
    renderOptions: {
      filterOptions,
      listingState
    }
  };
}

function buildUrlMeta({ meta, totals, now }) {
  const payload = { ...meta };
  if (totals && totals.cache) {
    payload.metrics = {
      ...(payload.metrics || {}),
      urlsTotalCount: {
        statKey: totals.cache.statKey,
        generatedAt: totals.cache.generatedAt,
        stale: totals.cache.stale,
        maxAgeMs: totals.cache.maxAgeMs,
        source: totals.source
      }
    };
  }
  if (!payload.generatedAt && now) {
    payload.generatedAt = formatDateTime(now, true);
  }
  return payload;
}

function buildUrlSummarySubtitle({ startRow, endRow, totalRows, currentPage, totalPages, totals, filters }) {
  const normalize = (value, fallback = 1) => {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(fallback, Math.trunc(value));
  };
  const safeStart = normalize(startRow, 1);
  const safeEnd = normalize(endRow, safeStart);
  const safeTotal = normalize(totalRows, safeEnd);
  const safePage = normalize(currentPage, 1);
  const safeTotalPages = normalize(totalPages, safePage);
  const parts = [
    `Rows ${formatCount(safeStart)}-${formatCount(safeEnd)} of ${formatCount(safeTotal)}`,
    `Page ${safePage} of ${safeTotalPages}`
  ];
  if (totals && totals.source) {
    const freshness = totals.cache && totals.cache.generatedAt
      ? formatDateTime(totals.cache.generatedAt, true)
      : null;
    const sourceLabel = totals.source === "cache" ? "cached" : totals.source;
    parts.push(freshness ? `${sourceLabel} metric as of ${freshness}` : `${sourceLabel} metric`);
  }
  if (filters && filters.hasFetches) {
    parts.push("Fetched URLs only");
  }
  return parts.join(" • ");
}


function renderDomainSummaryView({ req, db, relativeDb, now }) {
  const snapshot = buildDomainSnapshot(db, { windowSize: DOMAIN_WINDOW_SIZE, limit: DOMAIN_LIMIT });
  // Skip slow per-host queries (getArticleCount, getFetchCountForHost) on initial render.
  // These would cause N+1 queries that take several seconds. Instead, render placeholders
  // and let the client load these counts asynchronously in the future.
  const entries = snapshot.hosts.map((domain) => {
    return {
      host: domain.host || null,
      windowArticles: domain.articleCount || 0,
      allArticles: null,  // Deferred: would be getArticleCount(db, host)
      fetches: null,      // Deferred: would be getFetchCountForHost(db, host)
      lastSavedAt: domain.lastSavedAt
    };
  });
  const rows = buildDomainSummaryRows(entries);
  const backTarget = buildBackLinkTarget(req, { defaultLabel: "Domains" });
  attachBackLink(rows, "host", backTarget);
  const subtitle = rows.length === 0
    ? `No recent domain saves found in ${relativeDb}`
    : buildDomainSubtitle(rows.length, snapshot);
  return {
    title: "Recent Domain Activity",
    columns: buildDomainSummaryColumns(),
    rows,
    meta: {
      rowCount: rows.length,
      limit: DOMAIN_LIMIT,
      dbLabel: relativeDb,
      generatedAt: formatDateTime(now, true),
      subtitle,
      metrics: snapshot.cache
        ? {
            statKey: snapshot.cache.statKey,
            generatedAt: snapshot.cache.generatedAt,
            stale: snapshot.cache.stale,
            maxAgeMs: snapshot.cache.maxAgeMs,
            source: snapshot.source
          }
        : undefined
    }
  };
}

function buildDomainSubtitle(rowCount, snapshot) {
  const base = `Top ${rowCount} hosts derived from the last ${formatCount(DOMAIN_WINDOW_SIZE)} saved articles`;
  if (!snapshot.cache) return base;
  const updatedText = snapshot.cache.generatedAt
    ? `cache ${snapshot.cache.stale ? "stale" : "updated"} ${formatDateTime(snapshot.cache.generatedAt, true)}`
    : "cache data";
  return `${base} · ${updatedText}`;
}

function renderCrawlJobsView({ db, relativeDb, now }) {
  const crawls = listRecentCrawls(db, { limit: CRAWL_LIMIT });
  const rows = buildCrawlJobRows(crawls);
  const subtitle = rows.length === 0
    ? `No crawl jobs recorded in ${relativeDb}`
    : `Most recent ${rows.length} crawl jobs recorded in ${relativeDb}`;
  return {
    title: "Recent Crawl Jobs",
    columns: buildCrawlJobColumns(),
    rows,
    meta: {
      rowCount: rows.length,
      limit: CRAWL_LIMIT,
      dbLabel: relativeDb,
      generatedAt: formatDateTime(now, true),
      subtitle
    }
  };
}

function renderErrorLogView({ req, db, relativeDb, now }) {
  const errors = listRecentErrors(db, { limit: ERROR_LIMIT });
  const rows = buildErrorLogRows(errors);
  const backTarget = buildBackLinkTarget(req, { defaultLabel: "Errors" });
  attachBackLink(rows, "host", backTarget);
  attachBackLink(rows, "url", backTarget);
  const subtitle = rows.length === 0
    ? `No recent errors recorded in ${relativeDb}`
    : `Latest ${rows.length} error rows captured from ${relativeDb}`;
  return {
    title: "Recent Crawl Errors",
    columns: buildErrorLogColumns(),
    rows,
    meta: {
      rowCount: rows.length,
      limit: ERROR_LIMIT,
      dbLabel: relativeDb,
      generatedAt: formatDateTime(now, true),
      subtitle
    }
  };
}

function createDataExplorerServer(options = {}) {
  ensureClientBundle({ silent: options.quietClientBuild });
  const app = express();
  const resolvedDbPath = resolveDbPath(options.dbPath);
  const dbAccess = openNewsDb(resolvedDbPath);
  const projectRoot = findProjectRoot(__dirname);
  const publicDir = path.join(projectRoot, "public");
  const requestedScriptPath = options.clientScriptPath || "/assets/ui-client.js";
  const normalizedScriptPath = requestedScriptPath.startsWith("/") ? requestedScriptPath : `/${requestedScriptPath}`;
  const bundleFsPath = path.join(publicDir, normalizedScriptPath.replace(/^\//, ""));
  const hasClientBundle = fs.existsSync(bundleFsPath);
  const relativeDb = path.relative(projectRoot, resolvedDbPath) || path.basename(resolvedDbPath);
  const pageSize = sanitizePageSize(options.pageSize ?? DEFAULT_PAGE_SIZE);
  const bindingPluginEnabled = options.bindingPlugin !== false;
  const serverTitle = options.title || DEFAULT_TITLE;

  app.use((req, res, next) => {
    req.__copilotRequestId = generateRequestId();
    req.__copilotRequestStart = markRequestStart();
    res.setHeader("x-copilot-request-id", req.__copilotRequestId);
    res.setHeader("x-copilot-api", API_HEADER_NAME);
    next();
  });

  app.use(
    compression({
      threshold: 512,
      brotli: {
        enabled: true,
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 3
        }
      }
    })
  );

  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  DATA_VIEWS.forEach((view) => {
    app.get(view.path, (req, res, next) => {
      try {
        const now = new Date();
        const payload = view.render({
          req,
          db: dbAccess.db,
          relativeDb,
          pageSize,
          now
        });
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        const columns = Array.isArray(payload.columns) ? payload.columns : [];
        const meta = { ...(payload.meta || {}) };
        if (!meta.dbLabel) meta.dbLabel = relativeDb;
        if (!meta.generatedAt) meta.generatedAt = formatDateTime(now, true);
        if (meta.rowCount == null) meta.rowCount = rows.length;
        if (meta.limit == null) meta.limit = rows.length;
        if (!meta.subtitle) meta.subtitle = `${rows.length} rows rendered`;
        const baseRenderOptions = {
          clientScriptPath: hasClientBundle ? normalizedScriptPath : undefined,
          bindingPlugin: bindingPluginEnabled,
          navLinks: buildNavLinks(view.key, DATA_VIEWS)
        };
        const mergedRenderOptions = {
          ...baseRenderOptions,
          ...(payload.renderOptions || {})
        };
        const html = renderHtml(
          {
            columns,
            rows,
            meta,
            title: payload.title || view.title || serverTitle
          },
          mergedRenderOptions
        );
        res.type("html").send(html);
      } catch (error) {
        next(error);
      }
    });
  });

  app.get("/api/urls", (req, res, next) => {
    try {
      const now = new Date();
      const viewBasePath = `${req.baseUrl || ""}/urls`;
      const payload = buildUrlListingPayload({
        req,
        db: dbAccess.db,
        relativeDb,
        pageSize,
        now,
        basePathOverride: viewBasePath
      });
      const backTarget = buildBackLinkTarget({
        baseUrl: "",
        path: viewBasePath,
        query: req.query
      }, { defaultLabel: "URLs" });
      attachBackLink(payload.rows, "url", backTarget);
      attachBackLink(payload.rows, "host", backTarget);
      const meta = buildUrlMeta({ meta: payload.meta, totals: payload.totals, now });
      const diagnostics = buildRequestDiagnostics(req, { route: "/api/urls" });
      applyDiagnosticsHeaders(res, diagnostics);
      res.json({
        ok: true,
        columns: URL_COLUMNS,
        rows: payload.rows,
        meta,
        filters: payload.filters,
        totals: payload.totals,
        records: payload.records,
        query: payload.query,
        basePath: payload.basePath,
        diagnostics
      });
    } catch (error) {
      next(error);
    }
  });

  // SSE events endpoint - stub for client compatibility
  // The client-side sseHandlers.js connects to this endpoint for real-time updates.
  // Currently this is a stub that keeps the connection alive without sending events.
  app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
    res.flushHeaders();

    // Send initial comment to establish connection
    res.write(": connected\n\n");

    // Send periodic heartbeat to keep connection alive
    const heartbeatInterval = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 30000);

    // Clean up on client disconnect
    req.on("close", () => {
      clearInterval(heartbeatInterval);
    });
  });

  // Stub /api/crawls endpoint - data explorer doesn't manage crawls
  // The client-side jobsManager.js polls this endpoint for active crawl jobs.
  // Return empty jobs list since this server doesn't have crawl management.
  app.get("/api/crawls", (req, res) => {
    res.json({ items: [] });
  });

  // API endpoint for deferred domain counts (allArticles, fetches)
  // Called by client-side code after initial page render to populate [loading] cells.
  app.get("/api/domains/counts", (req, res, next) => {
    try {
      const hostsParam = req.query.hosts;
      if (!hostsParam) {
        return res.json({ counts: {} });
      }
      const hosts = hostsParam.split(",").map((h) => h.trim()).filter(Boolean);
      if (hosts.length === 0) {
        return res.json({ counts: {} });
      }
      // Limit to prevent abuse
      const limitedHosts = hosts.slice(0, 50);
      const counts = {};
      for (const host of limitedHosts) {
        const normalizedHost = toLowerHost(host);
        if (!normalizedHost) continue;
        counts[host] = {
          allArticles: getArticleCount(dbAccess.db, normalizedHost),
          fetches: getFetchCountForHost(dbAccess.db, normalizedHost)
        };
      }
      res.json({ counts });
    } catch (error) {
      next(error);
    }
  });

  // URL detail + downloads view
  app.get("/urls/:id", (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).send("Invalid id");
      const now = new Date();
      const urlRow = selectUrlById(dbAccess.db, id);
      if (!urlRow) return res.status(404).send("URL not found");

      const fetches = selectFetchHistory(dbAccess.db, id, { limit: 200 });
      const spark = buildHourlySparkline(fetches, { nowMs: now.getTime() });

      const DOWNLOAD_COLUMNS = [
        { key: "index", label: "#", align: "right", cellClass: "is-index" },
        { key: "fetchedAt", label: "Fetched At", cellClass: "is-timestamp" },
        { key: "httpStatus", label: "HTTP", align: "center" },
        { key: "classification", label: "Classification" },
        { key: "contentLength", label: "Bytes", align: "right", cellClass: "is-metric" },
        { key: "wordCount", label: "Words", align: "right", cellClass: "is-metric" }
      ];

      const rows = fetches.map((f, i) => ({
        index: { text: String(i + 1), classNames: "is-index" },
        fetchedAt: { text: formatDateTime(f.fetchedAt, true) },
        httpStatus: { text: f.httpStatus != null ? String(f.httpStatus) : "—" },
        classification: f.classification || "—",
        contentLength: f.contentLength != null ? String(f.contentLength) : "—",
        wordCount: f.wordCount != null ? String(f.wordCount) : "—"
      }));

      const meta = {
        rowCount: rows.length,
        limit: rows.length,
        dbLabel: relativeDb,
        generatedAt: formatDateTime(now, true),
        subtitle: `Last ${rows.length} fetches for ${urlRow.url}`,
        extraCards: [{ label: "Fetches (24h)", series: spark }]
      };

      const breadcrumbTrail = [{ label: "URLs", href: "/urls" }];
      const backLink = deriveBackLink(req, breadcrumbTrail[0]);
      const breadcrumbs = buildBreadcrumbs({ trail: breadcrumbTrail, backLink, current: { label: urlRow.url } });

      const html = renderHtml(
        { columns: DOWNLOAD_COLUMNS, rows, meta, title: `URL: ${urlRow.url}` },
        {
          clientScriptPath: hasClientBundle ? normalizedScriptPath : undefined,
          bindingPlugin: bindingPluginEnabled,
          navLinks: buildNavLinks("urls", DATA_VIEWS),
          breadcrumbs
        }
      );
      res.type("html").send(html);
    } catch (error) {
      next(error);
    }
  });

  app.get("/domains/:host", (req, res, next) => {
    try {
      const rawHostParam = (req.params.host || "").trim();
      if (!rawHostParam) return res.status(400).send("Host is required");
      const normalizedHost = rawHostParam.toLowerCase();
      const summary = selectHostSummary(dbAccess.db, normalizedHost);
      if (!summary) return res.status(404).send("Host not found");
      const now = new Date();
      const downloads = selectHostDownloads(dbAccess.db, normalizedHost, { limit: DOMAIN_DOWNLOAD_LIMIT });
      const spark = buildHourlySparkline(downloads, { nowMs: now.getTime() });
      const articleCount = getArticleCount(dbAccess.db, normalizedHost);
      const fetchCount = getFetchCountForHost(dbAccess.db, normalizedHost);
      const rows = buildDomainDownloadRows(downloads);
      const subtitle = rows.length === 0
        ? `No downloads recorded for ${rawHostParam}`
        : `Latest ${rows.length} downloads fetched from ${rawHostParam}`;
      const breadcrumbTrail = [{ label: "Domains", href: "/domains" }];
      const backLink = deriveBackLink(req, breadcrumbTrail[0]);
      const backTarget = buildBackLinkTarget(req, { defaultLabel: `Domain: ${rawHostParam}` });
      attachBackLink(rows, "url", backTarget);
      const meta = {
        rowCount: rows.length,
        limit: DOMAIN_DOWNLOAD_LIMIT,
        dbLabel: relativeDb,
        generatedAt: formatDateTime(now, true),
        subtitle,
        extraCards: [
          { label: "Unique URLs", value: formatCount(summary.urlCount) },
          { label: "Article Fetches", value: formatCount(articleCount) },
          { label: "All Fetches", value: formatCount(fetchCount) },
          { label: "First Seen", value: formatDateTime(summary.firstSeenAt, true) },
          { label: "Last Seen", value: formatDateTime(summary.lastSeenAt, true) },
          { label: "Downloads (24h)", series: spark }
        ]
      };
      const html = renderHtml(
        {
          columns: buildDomainDownloadColumns(),
          rows,
          meta,
          title: `Domain: ${rawHostParam}`
        },
        {
          clientScriptPath: hasClientBundle ? normalizedScriptPath : undefined,
          bindingPlugin: bindingPluginEnabled,
          navLinks: buildNavLinks("domains", DATA_VIEWS),
          breadcrumbs: buildBreadcrumbs({ trail: breadcrumbTrail, backLink, current: { label: rawHostParam } })
        }
      );
      res.type("html").send(html);
    } catch (error) {
      next(error);
    }
  });

  app.get("/urls/:id/downloads", (req, res) => {
    res.redirect(`/urls/${req.params.id}`);
  });

  app.use((err, req, res, _next) => {
    console.error("Data explorer server error:", err);
    const statusCode = Number.isFinite(err && err.statusCode) ? err.statusCode : 500;
    const diagnostics = buildRequestDiagnostics(req, {
      status: statusCode,
      error: err && err.message ? err.message : "Internal server error"
    });
    const wantsJson = (req && req.path && req.path.startsWith("/api/")) || acceptsJson(req);
    if (wantsJson) {
      applyDiagnosticsHeaders(res, { ...diagnostics, error: true });
      res
        .status(statusCode)
        .type("application/json")
        .json({
          ok: false,
          error: {
            message: err && err.message ? err.message : "Internal server error",
            code: err && err.code ? err.code : "ERR_UI_SERVER"
          },
          diagnostics
        });
      return;
    }
    applyDiagnosticsHeaders(res, { ...diagnostics, error: true });
    res.status(statusCode).type("text/plain").send("Internal server error");
  });

  const close = () => {
    try {
      dbAccess.close();
    } catch (_) {}
  };

  return { app, close };
}

function parseServerArgs(argv) {
  const args = {};
  const tokens = Array.isArray(argv) ? argv.slice() : [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) continue;
    switch (token) {
      case "--port":
      case "-p":
        args.port = Number(tokens[++i]);
        break;
      case "--host":
      case "-H":
        args.host = tokens[++i];
        break;
      case "--db":
      case "-d":
        args.db = tokens[++i];
        break;
      case "--page-size":
      case "-s":
        args.pageSize = Number(tokens[++i]);
        break;
      case "--title":
        args.title = tokens[++i];
        break;
      case "--detached":
        args.detached = true;
        break;
      case "--stop":
        args.stop = true;
        break;
      case "--status":
        args.status = true;
        break;
      default:
        if (token.startsWith("--")) {
          const [key, value] = token.split("=");
          if (key === "--port" && value) args.port = Number(value);
          if (key === "--host" && value) args.host = value;
          if (key === "--db" && value) args.db = value;
          if (key === "--page-size" && value) args.pageSize = Number(value);
          if (key === "--title" && value) args.title = value;
        }
        break;
    }
  }
  return args;
}

/**
 * Spawn server as detached background process
 */
function spawnDetached(args) {
  const scriptPath = __filename;
  const childArgs = [scriptPath, "--port", String(args.port || DEFAULT_PORT)];
  if (args.host) childArgs.push("--host", args.host);
  if (args.db) childArgs.push("--db", args.db);
  if (args.pageSize) childArgs.push("--page-size", String(args.pageSize));
  if (args.title) childArgs.push("--title", args.title);

  // Ensure tmp directory exists
  const tmpDir = path.dirname(PID_FILE);
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const child = spawn(process.execPath, childArgs, {
    detached: true,
    stdio: "ignore",
    cwd: process.cwd(),
    env: { ...process.env, DATA_EXPLORER_DETACHED: "1" }
  });

  fs.writeFileSync(PID_FILE, String(child.pid), "utf-8");
  child.unref();

  const port = args.port || DEFAULT_PORT;
  const host = args.host || "127.0.0.1";
  console.log(`🔍 Data Explorer started in background (PID: ${child.pid})`);
  console.log(`   URL: http://${host}:${port}/domains`);
  console.log(`   Stop with: node ${path.relative(process.cwd(), scriptPath)} --stop`);
}

/**
 * Stop a running detached server
 */
function stopDetached() {
  if (!fs.existsSync(PID_FILE)) {
    console.log("No detached server found (no PID file)");
    return false;
  }

  const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);

  try {
    process.kill(pid, 0); // Check if process exists
    process.kill(pid, "SIGTERM");
    fs.unlinkSync(PID_FILE);
    console.log(`🔍 Data Explorer stopped (PID: ${pid})`);
    return true;
  } catch (err) {
    if (err.code === "ESRCH") {
      fs.unlinkSync(PID_FILE);
      console.log("Server was not running (stale PID file removed)");
      return false;
    }
    throw err;
  }
}

/**
 * Check status of detached server
 */
function checkStatus() {
  if (!fs.existsSync(PID_FILE)) {
    console.log("🔍 Data Explorer: not running (no PID file)");
    return false;
  }

  const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);

  try {
    process.kill(pid, 0);
    console.log(`🔍 Data Explorer: running (PID: ${pid})`);
    return true;
  } catch (err) {
    if (err.code === "ESRCH") {
      console.log("🔍 Data Explorer: not running (stale PID file)");
      return false;
    }
    throw err;
  }
}

if (require.main === module) {
  const args = parseServerArgs(process.argv.slice(2));
  
  // Handle --stop flag
  if (args.stop) {
    stopDetached();
    process.exit(0);
  }
  
  // Handle --status flag
  if (args.status) {
    checkStatus();
    process.exit(0);
  }
  
  // Handle --detached flag
  if (args.detached) {
    spawnDetached(args);
    process.exit(0);
  }
  
  console.log("Server args:", args);
  const pageSize = sanitizePageSize(args.pageSize);
  const { app, close } = createDataExplorerServer({
    dbPath: args.db,
    pageSize,
    title: args.title
  });
  const port = Number.isFinite(args.port) ? args.port : DEFAULT_PORT;
  const host = args.host || "127.0.0.1";
  const server = app.listen(port, host, () => {
    console.log(`Crawler data explorer listening on http://${host}:${port}/urls (page size ${pageSize})`);
  });

  let shuttingDown = false;
  const handleShutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("Shutting down crawler data explorer...");
    server.close(() => {
      close();
      process.exit(0);
    });
  };

  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);
}

module.exports = {
  createDataExplorerServer,
  parseServerArgs,
  spawnDetached,
  stopDetached,
  checkStatus,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  DATA_VIEWS,
  renderUrlListingView
};
