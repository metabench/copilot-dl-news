"use strict";

/**
 * @server Data Explorer
 * @description Provides a web interface for exploring crawled URLs, domains, and errors.
 * @ui true
 * @port 3001
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const express = require("express");
const compression = require("compression");
const jsgui = require("jsgui3-html");
const { spawn } = require("child_process");

const { TelemetryIntegration } = require('../../core/crawler/telemetry/TelemetryIntegration");
const { createMcpLogger } = require('./utils/serverStartupCheckmcpLogger");

const log = createMcpLogger.uiServer('data-explorer');

// PID file for detached mode management
const PID_FILE = path.join(process.cwd(), "tmp", ".data-explorer.pid");

const { openNewsDb } = require('../../data/db/dbAccess");
const { findProjectRoot } = require('./utils/serverStartupCheckproject-root");
const {
  selectUrlPage,
  selectUrlPageByHost,
  countUrls,
  countUrlsByHost,
  selectFetchedUrlPage,
  selectFetchedUrlPageByHost,
  countFetchedUrls,
  countFetchedUrlsByHost,
  // Extended filtering
  selectUrlPageFiltered,
  countUrlsFiltered,
  selectFetchedUrlPageFiltered,
  countFetchedUrlsFiltered,
  normalizeHostMode,
  parseHosts
} = require('../../data/db/sqlite/v1/queries/ui/urlListingNormalized");
const {
  getArticleCount,
  getFetchCountDirect,
  getFetchCountViaJoin
} = require('../../data/db/sqlite/v1/queries/ui/domainSummary");
const { selectDomainCountsByHosts } = require('../../data/db/sqlite/v1/queries/ui/domainCounts");
const {
  selectDomainPage,
  countDomains,
  normalizeSortColumn,
  normalizeSortDirection
} = require('../../data/db/sqlite/v1/queries/ui/domainListing");
const { listRecentCrawls } = require('../../data/db/sqlite/v1/queries/ui/crawls");
const { listRecentErrors } = require('../../data/db/sqlite/v1/queries/ui/errors");
const {
  listPlaceHubs,
  countPlaceHubs,
  getPlaceHubHosts,
  getPlaceHubsByHost,
  getPlaceHubsByKind
} = require('../../data/db/sqlite/v1/queries/ui/placeHubs");
const { selectUrlById, selectFetchHistory, selectFetchById } = require('../../data/db/sqlite/v1/queries/ui/urlDetails");
const { selectHostSummary, selectHostDownloads } = require('../../data/db/sqlite/v1/queries/ui/domainDetails");
const { listConfiguration } = require('../../data/db/sqlite/v1/queries/ui/configuration");
const { 
  listClassificationsWithCounts,
  getClassificationByName,
  getDocumentsForClassification,
  countDocumentsForClassification,
  getRandomDocumentsForClassification
} = require('../../data/db/sqlite/v1/queries/ui/classificationTypes");
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
const {
  buildPlaceHubColumns,
  buildPlaceHubRows
} = require("../controls/PlaceHubsTable");
const { ConfigMatrixControl } = require("../controls/ConfigMatrixControl");
const {
  buildNavLinks,
  buildBackLinkTarget,
  deriveBackLink,
  appendBackParams,
  buildBreadcrumbs
} = require("./navigation");
const { ensureClientBundle } = require('./utils/serverStartupCheckensureClientBundle");
const { runStartupCheck } = require('./utils/serverStartupCheck");
const { getClassificationDisplay } = require('./utils/serverStartupCheckclassificationEmoji");
const {
  createTelemetry,
  attachTelemetryEndpoints,
  attachTelemetryMiddleware
} = require('./utils/serverStartupChecktelemetry");
const {
  listThemes,
  getDefaultTheme,
  getTheme,
  createTheme,
  updateTheme,
  setDefaultTheme,
  deleteTheme
} = require("./services/themeService");
const { ThemeEditorControl } = require("../controls/ThemeEditorControl");
const { ArticleViewerControl } = require("../controls/ArticleViewerControl");
const { ArticleListControl } = require("../controls/ArticleListControl");
const {
  listArticlesWithContent,
  countArticlesWithContent,
  getExtractedArticle
} = require('../../data/db/sqlite/v1/queries/ui/articleViewer");

const { ACTIVE_SET_KEY } = require('../../core/crawler/observatory/DecisionConfigSetState");

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

function resolveThemeConfig(req, dbHandle) {
  const requested = req && req.query && typeof req.query.theme === "string" ? req.query.theme.trim() : "";
  if (requested) {
    const theme = getTheme(dbHandle, requested);
    if (theme && theme.config) {
      return theme.config;
    }
  }
  const fallback = getDefaultTheme(dbHandle);
  return fallback && fallback.config ? fallback.config : null;
}

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

function takeFirstQueryValue(value) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const next = takeFirstQueryValue(value[i]);
      if (next != null) return next;
    }
    return null;
  }
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function sanitizeHostFilter(value) {
  const host = takeFirstQueryValue(value);
  if (!host) return null;
  if (host.length > 255) return host.slice(0, 255);
  return host;
}

function resolveUrlFilterState(query = {}) {
  // Parse multi-host from `hosts` param (comma-separated) or single `host`
  const rawHosts = query.hosts || query.host;
  const hosts = parseHosts(rawHosts);
  const hostMode = normalizeHostMode(query.hostMode);
  return {
    hasFetches: toBooleanQueryFlag(query.hasFetches),
    host: hosts.length === 1 ? hosts[0] : null, // backward compat
    hosts,
    hostMode
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
  const hosts = options.hosts || [];
  const hostMode = options.hostMode || "exact";
  const hasFilter = hosts.length > 0;

  if (options.hasFetches) {
    return {
      source: "live",
      totalRows: hasFilter
        ? countFetchedUrlsFiltered(db, { hosts, hostMode })
        : countFetchedUrls(db),
      cache: null
    };
  }
  if (hasFilter) {
    return {
      source: "live",
      totalRows: countUrlsFiltered(db, { hosts, hostMode }),
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

function buildUrlHostFilterControls({ context, basePath, filters }) {
  if (!context) return null;
  const form = new jsgui.form({ context });
  form.dom.attributes.method = "get";
  form.dom.attributes.action = basePath;
  form.add_class("filter-controls");

  const group = new jsgui.div({ context, class: "filter-controls__group" });
  const label = new jsgui.label({ context, class: "filter-controls__label" });
  label.dom.attributes["for"] = "host-filter";
  label.add(new jsgui.String_Control({ context, text: "Host" }));
  group.add(label);

  const input = new jsgui.input({ context });
  input.dom.attributes.type = "search";
  input.dom.attributes.name = "host";
  input.dom.attributes.id = "host-filter";
  input.dom.attributes.placeholder = "example.com";
  input.dom.attributes.value = (filters && filters.host) ? String(filters.host) : "";
  input.add_class("filter-controls__input");
  group.add(input);

  if (filters && filters.hasFetches) {
    const hidden = new jsgui.input({ context });
    hidden.dom.attributes.type = "hidden";
    hidden.dom.attributes.name = "hasFetches";
    hidden.dom.attributes.value = "1";
    group.add(hidden);
  }

  const button = new jsgui.button({ context });
  button.dom.attributes.type = "submit";
  button.add_class("filter-controls__button");
  button.add(new jsgui.String_Control({ context, text: "Apply" }));
  group.add(button);

  form.add(group);
  return form;
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

/**
 * Build jsgui controls for classification filter (limit dropdown + random checkbox)
 * These are native form elements that work without JavaScript (server-side form submission)
 * and can be progressively enhanced on the client.
 * 
 * @param {Object} options
 * @param {Object} options.context - jsgui Page_Context
 * @param {string} options.basePath - Form action URL
 * @param {number} options.currentLimit - Currently selected limit
 * @param {boolean} options.isRandom - Whether random sampling is enabled
 * @param {number[]} options.validLimits - Array of valid limit values
 * @returns {jsgui.Control} - A form control with filter inputs
 */
function buildClassificationFilterControls({ context, basePath, currentLimit, isRandom, validLimits }) {
  const jsgui = require("jsgui3-html");
  
  // Create the form
  const form = new jsgui.form({ context });
  form.dom.attributes.method = "get";
  form.dom.attributes.action = basePath;
  form.add_class("filter-controls");
  form.dom.attributes["data-jsgui-control"] = "classification_filter";
  
  // Limit selector group
  const limitGroup = new jsgui.Control({ context, tagName: "div" });
  limitGroup.add_class("filter-controls__group");
  
  const limitLabel = new jsgui.label({ context });
  limitLabel.add_class("filter-controls__label");
  limitLabel.dom.attributes["for"] = "limit-select";
  limitLabel.add(new jsgui.String_Control({ context, text: "Show" }));
  limitGroup.add(limitLabel);
  
  const limitSelect = new jsgui.select({ context });
  limitSelect.dom.attributes.name = "limit";
  limitSelect.dom.attributes.id = "limit-select";
  limitSelect.add_class("filter-controls__select");
  
  validLimits.forEach(limit => {
    const opt = new jsgui.option({ context });
    opt.dom.attributes.value = String(limit);
    if (limit === currentLimit) {
      opt.dom.attributes.selected = "selected";
    }
    opt.add(new jsgui.String_Control({ context, text: String(limit) }));
    limitSelect.add(opt);
  });
  limitGroup.add(limitSelect);
  
  const docsLabel = new jsgui.span({ context });
  docsLabel.add_class("filter-controls__label");
  docsLabel.add(new jsgui.String_Control({ context, text: "documents" }));
  limitGroup.add(docsLabel);
  
  form.add(limitGroup);
  
  // Random checkbox group
  const randomGroup = new jsgui.Control({ context, tagName: "div" });
  randomGroup.add_class("filter-controls__group");
  
  const checkboxLabel = new jsgui.label({ context });
  checkboxLabel.add_class("filter-controls__checkbox-label");
  
  const checkbox = new jsgui.input({ context });
  checkbox.dom.attributes.type = "checkbox";
  checkbox.dom.attributes.name = "random";
  checkbox.dom.attributes.value = "1";
  checkbox.add_class("filter-controls__checkbox");
  if (isRandom) {
    checkbox.dom.attributes.checked = "checked";
  }
  checkboxLabel.add(checkbox);
  
  const checkboxText = new jsgui.span({ context });
  checkboxText.add_class("filter-controls__checkbox-text");
  checkboxText.add(new jsgui.String_Control({ context, text: "Random sample" }));
  checkboxLabel.add(checkboxText);
  
  randomGroup.add(checkboxLabel);
  form.add(randomGroup);
  
  // Submit button
  const submitBtn = new jsgui.button({ context });
  submitBtn.dom.attributes.type = "submit";
  submitBtn.add_class("filter-controls__submit");
  submitBtn.add(new jsgui.String_Control({ context, text: "Apply" }));
  form.add(submitBtn);
  
  return form;
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
  const editConfig = {
    action: "/api/config",
    method: "post",
    keyField: "key",
    valueField: "value",
    label: "Save"
  };

  const properties = settings.map((row) => {
    const formatted = formatDateTime(row.updatedAt, true);
    const description = formatted && formatted.text ? `Last updated: ${formatted.text}` : "Last updated: —";
    return {
      key: row.key,
      value: row.value,
      source: "crawler_settings",
      description,
      edit: { ...editConfig, key: row.key }
    };
  });

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

function renderThemeEditorView({ req, db, relativeDb, now }) {
  const themes = listThemes(db);
  const requested = req && req.query && typeof req.query.theme === "string" ? req.query.theme.trim() : "";
  const active = requested ? getTheme(db, requested) : getDefaultTheme(db);
  const activeTheme = active || getDefaultTheme(db);

  const subtitle = themes.length === 0
    ? `No themes found in ${relativeDb}`
    : `${themes.length} themes available (default: ${(themes.find(t => t && t.is_default) || {}).name || activeTheme.name || "—"})`;

  return {
    title: "Theme Editor",
    columns: [],
    rows: [],
    meta: {
      rowCount: themes.length,
      limit: themes.length,
      dbLabel: relativeDb,
      generatedAt: formatDateTime(now, true),
      subtitle
    },
    renderOptions: {
      layoutMode: "single-control",
      mainControlFactory: (context) => new ThemeEditorControl({
        context,
        themes,
        activeTheme,
        apiBase: `${(req && req.baseUrl) || ""}/api/themes`
      })
    }
  };
}

/**
 * Build table columns for decisions/milestones listing
 */
function buildDecisionColumns() {
  return [
    { key: "kind", label: "Kind", width: "160px" },
    { key: "message", label: "Decision", sortable: false },
    { key: "target", label: "Target", width: "240px" },
    { key: "scope", label: "Scope", width: "100px" },
    { key: "ts", label: "When", width: "180px", cellClass: "is-timestamp" }
  ];
}

/**
 * Build display rows for decisions/milestones
 */
function buildDecisionRows(milestones) {
  return milestones.map((m) => {
    const targetText = m.target || "";
    const targetCell = targetText
      ? (targetText.startsWith("http://") || targetText.startsWith("https://")
        ? { text: targetText, href: targetText }
        : targetText)
      : "—";
    return {
      kind: m.kind || "—",
      message: m.message || "—",
      target: targetCell,
      scope: m.scope || "—",
      ts: formatDateTime(m.ts, true)
    };
  });
}

function buildDecisionFilterControls({ context, basePath, currentKind, currentScope, currentTargetLike, currentLimit }) {
  const form = new jsgui.form({ context });
  form.dom.attributes.method = "get";
  form.dom.attributes.action = basePath;
  form.add_class("filter-controls");
  form.dom.attributes["data-jsgui-control"] = "decisions_filter";

  const row = new jsgui.div({ context });
  row.add_class("filter-controls__group");

  const kindInput = new jsgui.input({ context });
  kindInput.dom.attributes.type = "text";
  kindInput.dom.attributes.name = "kind";
  kindInput.dom.attributes.placeholder = "kind (e.g. decision-kind)";
  if (currentKind) kindInput.dom.attributes.value = String(currentKind);
  kindInput.add_class("filter-controls__input");
  row.add(kindInput);

  const scopeInput = new jsgui.input({ context });
  scopeInput.dom.attributes.type = "text";
  scopeInput.dom.attributes.name = "scope";
  scopeInput.dom.attributes.placeholder = "scope";
  if (currentScope) scopeInput.dom.attributes.value = String(currentScope);
  scopeInput.add_class("filter-controls__input");
  row.add(scopeInput);

  const targetInput = new jsgui.input({ context });
  targetInput.dom.attributes.type = "text";
  targetInput.dom.attributes.name = "targetLike";
  targetInput.dom.attributes.placeholder = "target contains…";
  if (currentTargetLike) targetInput.dom.attributes.value = String(currentTargetLike);
  targetInput.add_class("filter-controls__input");
  row.add(targetInput);

  const limitInput = new jsgui.input({ context });
  limitInput.dom.attributes.type = "number";
  limitInput.dom.attributes.name = "limit";
  limitInput.dom.attributes.min = "1";
  limitInput.dom.attributes.max = "200";
  limitInput.dom.attributes.value = String(currentLimit);
  limitInput.add_class("filter-controls__input");
  row.add(limitInput);

  form.add(row);

  const submitBtn = new jsgui.button({ context });
  submitBtn.dom.attributes.type = "submit";
  submitBtn.add_class("filter-controls__submit");
  submitBtn.add(new StringControl({ context, text: "Apply" }));
  form.add(submitBtn);

  return form;
}

/**
 * Render the decisions/milestones listing view
 */
function renderDecisionsView({ db, newsDb, req, relativeDb, now }) {
  const query = (req && req.query) || {};
  const kindFilter = query.kind || null;
  const scopeFilter = query.scope || null;
  const targetLike = query.targetLike || null;
  const includeReflexes = query.includeReflexes === "true" || query.includeReflexes === "1";
  const limit = Math.min(200, Math.max(1, parseInt(query.limit, 10) || 100));

  const filterOpts = { limit };
  if (kindFilter) filterOpts.kind = kindFilter;
  if (scopeFilter) filterOpts.scope = scopeFilter;
  if (targetLike) filterOpts.targetLike = targetLike;

  let milestones = [];
  try {
    const accessor = (newsDb && typeof newsDb.listMilestones === "function")
      ? newsDb
      : (db && typeof db.listMilestones === "function" ? db : null);
    const result = accessor ? accessor.listMilestones(filterOpts) : { items: [] };
    milestones = (result && result.items) || [];
  } catch (_) {
    milestones = [];
  }

  if (!includeReflexes) {
    milestones = milestones.filter((m) => (m && m.kind) !== "cache-priority-hit");
  }

  const subtitle = milestones.length === 0
    ? `No decision traces found in ${relativeDb}`
    : `${milestones.length} decision traces` +
      (kindFilter ? ` (kind: ${kindFilter})` : "") +
      (scopeFilter ? ` (scope: ${scopeFilter})` : "") +
      (targetLike ? ` (target contains: ${targetLike})` : "");

  return {
    title: "Crawler Decisions",
    columns: buildDecisionColumns(),
    rows: buildDecisionRows(milestones),
    meta: {
      rowCount: milestones.length,
      limit,
      dbLabel: relativeDb,
      generatedAt: formatDateTime(now, true),
      subtitle,
      filterControlsFactory: (context) => buildDecisionFilterControls({
        context,
        basePath: "/decisions",
        currentKind: kindFilter,
        currentScope: scopeFilter,
        currentTargetLike: targetLike,
        currentLimit: limit
      })
    }
  };
}

function createDecisionTraceList(context, decisionTraces) {
  const wrap = new jsgui.div({ context });
  wrap.add_class("decision-trace-list");
  const list = new jsgui.ul({ context });
  list.add_class("decision-trace-list__items");
  decisionTraces.forEach((m) => {
    const li = new jsgui.li({ context });
    li.add_class("decision-trace-list__item");
    const kind = m.kind || "—";
    const message = m.message || "—";
    const formatted = formatDateTime(m.ts, true);
    const when = (formatted && formatted.text) || "";
    li.add(new StringControl({ context, text: `${kind}: ${message}${when ? ` (${when})` : ""}` }));
    list.add(li);
  });
  wrap.add(list);
  return wrap;
}

/**
 * Build table columns for classification types listing
 */
function buildClassificationColumns() {
  return [
    { key: "emoji", label: "Type", width: "80px", align: "center" },
    { key: "display_name", label: "Classification", sortable: true },
    { key: "category", label: "Category", width: "120px" },
    { key: "document_count", label: "Documents", width: "120px", align: "right", sortable: true },
    { key: "description", label: "Description" }
  ];
}

/**
 * Build display rows for classification types
 */
function buildClassificationRows(classifications) {
  return classifications.map((c) => ({
    emoji: c.emoji || "❓",
    display_name: {
      text: c.display_name || c.name,
      href: `/classifications/${encodeURIComponent(c.name)}`
    },
    category: c.category || "—",
    document_count: formatCount(c.document_count || 0),
    description: c.description || "—"
  }));
}

/**
 * Render the classification types listing view
 */
function renderClassificationsView({ db, relativeDb, now }) {
  const classifications = listClassificationsWithCounts(db);
  const totalDocs = classifications.reduce((sum, c) => sum + (c.document_count || 0), 0);
  const usedCount = classifications.filter(c => c.document_count > 0).length;
  
  const subtitle = classifications.length === 0
    ? `No classification types defined in ${relativeDb}`
    : `${classifications.length} classification types (${usedCount} in use) covering ${formatCount(totalDocs)} documents`;
  
  return {
    title: "Document Classifications",
    columns: buildClassificationColumns(),
    rows: buildClassificationRows(classifications),
    meta: {
      rowCount: classifications.length,
      limit: classifications.length,
      dbLabel: relativeDb,
      generatedAt: formatDateTime(now, true),
      subtitle
    }
  };
}

function renderDecisionTreesView({ req, newsDb, relativeDb, now }) {
  const activeSlug = (newsDb && typeof newsDb.getSetting === "function")
    ? (newsDb.getSetting(ACTIVE_SET_KEY, null) || null)
    : null;

  const viewerBase = "/decision-tree-viewer";
  const viewerTarget = activeSlug
    ? `${viewerBase}/set/${encodeURIComponent(activeSlug)}?persist=1`
    : `${viewerBase}/`;

  const subtitle = activeSlug
    ? `Active decision config set: ${activeSlug}`
    : `No active decision config set found in ${relativeDb}`;

  return {
    title: "Decision Trees",
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
      layoutMode: "single-control",
      mainControlFactory: (context) => {
        const wrap = new jsgui.div({ context });
        wrap.add_class("decision-trees-view");

        const hint = new jsgui.div({ context });
        hint.add_class("panel");
        hint.add(new StringControl({
          context,
          text: activeSlug
            ? `Showing decision trees for active config set: ${activeSlug}`
            : "Showing decision trees from config/decision-trees (no active config set selected)."
        }));

        const linkRow = new jsgui.div({ context });
        linkRow.add_class("panel");
        const link = new jsgui.a({ context });
        link.dom.attributes.href = viewerTarget;
        link.dom.attributes.target = "_blank";
        link.dom.attributes.rel = "noopener noreferrer";
        link.add(new StringControl({ context, text: "Open Decision Tree Viewer in new tab" }));
        linkRow.add(link);

        const iframe = new jsgui.Control({ context, tagName: "iframe" });
        iframe.dom.attributes.src = viewerTarget;
        iframe.dom.attributes.style = "width: 100%; height: 78vh; border: 0; background: #0b0f14;";

        wrap.add(hint);
        wrap.add(linkRow);
        wrap.add(iframe);
        return wrap;
      }
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
    key: "placeHubs",
    path: "/place-hubs",
    navLabel: "Place Hubs",
    title: "Geographic Place Hubs",
    render: renderPlaceHubsView
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
    key: "classifications",
    path: "/classifications",
    navLabel: "Classifications",
    title: "Document Classifications",
    render: renderClassificationsView
  },
  {
    key: "decisions",
    path: "/decisions",
    navLabel: "Decisions",
    title: "Crawler Decisions",
    render: renderDecisionsView
  },
  {
    key: "decisionTrees",
    path: "/decision-trees",
    navLabel: "Decision Trees",
    title: "Decision Trees",
    render: renderDecisionTreesView
  },
  {
    key: "theme",
    path: "/theme",
    navLabel: "Theme",
    title: "Theme Editor",
    render: renderThemeEditorView
  },
  {
    key: "config",
    path: "/config",
    navLabel: "Config",
    title: "Configuration",
    render: renderConfigView
  },
  {
    key: "articles",
    path: "/articles",
    navLabel: "Articles",
    title: "Extracted Articles",
    render: renderArticlesListView
  }
];

function buildUrlListingPayload({ req, db, relativeDb, pageSize, now, basePathOverride }) {
  if (!req || !db) {
    throw new Error("buildUrlListingPayload requires an express request and database handle");
  }
  const query = req.query || {};
  const filters = resolveUrlFilterState(query);
  const totals = buildUrlTotals(db, { hasFetches: filters.hasFetches, hosts: filters.hosts, hostMode: filters.hostMode });
  const requestedPage = sanitizePage(query.page);
  const basePath = basePathOverride || (((req.baseUrl || "") + (req.path || "")) || "/urls");
  const querySnapshot = snapshotQueryParams(query);
  const pagination = buildPagination(basePath, query, {
    totalRows: totals.totalRows,
    pageSize,
    currentPage: requestedPage
  });

  // Decide which selector to use based on filter shape
  const hasHostFilter = filters.hosts && filters.hosts.length > 0;
  const needsExtendedFilter = hasHostFilter && (filters.hostMode !== "exact" || filters.hosts.length > 1);

  const selectorOptions = {
    limit: pageSize,
    offset: pagination.offset
  };

  let records;
  if (needsExtendedFilter) {
    selectorOptions.hosts = filters.hosts;
    selectorOptions.hostMode = filters.hostMode;
    if (filters.hasFetches) {
      records = selectFetchedUrlPageFiltered(db, selectorOptions);
    } else {
      records = selectUrlPageFiltered(db, selectorOptions);
    }
  } else if (hasHostFilter) {
    // Single host exact match - use legacy optimized path
    selectorOptions.host = filters.hosts[0];
    if (filters.hasFetches) {
      records = selectFetchedUrlPageByHost(db, selectorOptions);
    } else {
      records = selectUrlPageByHost(db, selectorOptions);
    }
  } else {
    // No host filter
    if (filters.hasFetches) {
      records = selectFetchedUrlPage(db, selectorOptions);
    } else {
      records = selectUrlPage(db, selectorOptions);
    }
  }

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
  decoratedMeta.filterControlsFactory = (context) => buildUrlHostFilterControls({
    context,
    basePath,
    filters
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
  if (filters && filters.host) {
    parts.push(`Host ${filters.host}`);
  }
  return parts.join(" • ");
}


function renderDomainSummaryView({ req, db, relativeDb, now }) {
  const query = req.query || {};
  const searchTerm = typeof query.search === "string" ? query.search.trim() : "";
  const isSearchMode = searchTerm.length > 0;

  // Parse pagination and sort params for search mode
  const pageSize = 25;
  const requestedPage = sanitizePage(query.page);
  const sortBy = normalizeSortColumn(query.sortBy || query.sort);
  const sortDir = normalizeSortDirection(query.sortDir || query.dir);

  let rows, subtitle, pagination, totalRows;

  if (isSearchMode) {
    // Search mode: use new domain listing API with pagination
    totalRows = countDomains(db, { search: searchTerm });
    const offset = (requestedPage - 1) * pageSize;
    const records = selectDomainPage(db, {
      search: searchTerm,
      sortBy,
      sortDir,
      limit: pageSize,
      offset
    });

    // Transform records to match buildDomainSummaryRows format
    const entries = records.map((r) => ({
      host: r.host,
      windowArticles: null,
      allArticles: r.url_count,
      fetches: null,
      lastSavedAt: r.last_seen
    }));
    rows = buildDomainSummaryRows(entries);

    // Build pagination
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const safePage = Math.min(requestedPage, totalPages);
    const startRow = totalRows === 0 ? 0 : offset + 1;
    const endRow = totalRows === 0 ? 0 : offset + Math.min(pageSize, totalRows - offset);

    const makeHref = (page) => {
      const params = new URLSearchParams();
      if (searchTerm) params.set("search", searchTerm);
      if (sortBy !== "url_count") params.set("sortBy", sortBy);
      if (sortDir !== "DESC") params.set("sortDir", sortDir);
      if (page > 1) params.set("page", String(page));
      const qs = params.toString();
      return qs ? `/domains?${qs}` : "/domains";
    };

    pagination = {
      currentPage: safePage,
      totalPages,
      totalRows,
      pageSize,
      startRow,
      endRow,
      prevHref: safePage > 1 ? makeHref(safePage - 1) : null,
      nextHref: safePage < totalPages ? makeHref(safePage + 1) : null,
      firstHref: safePage > 1 ? makeHref(1) : null,
      lastHref: safePage < totalPages ? makeHref(totalPages) : null
    };

    subtitle = totalRows === 0
      ? `No domains match "${searchTerm}"`
      : `Showing ${startRow}-${endRow} of ${formatCount(totalRows)} domains matching "${searchTerm}"`;
  } else {
    // Default mode: show recent domain activity (original behavior)
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
    rows = buildDomainSummaryRows(entries);
    subtitle = rows.length === 0
      ? `No recent domain saves found in ${relativeDb}`
      : buildDomainSubtitle(rows.length, snapshot);
    totalRows = rows.length;
    pagination = null;
  }

  const backTarget = buildBackLinkTarget(req, { defaultLabel: "Domains" });
  attachBackLink(rows, "host", backTarget);

  return {
    title: isSearchMode ? `Domain Search: "${searchTerm}"` : "Recent Domain Activity",
    columns: buildDomainSummaryColumns(),
    rows,
    meta: {
      rowCount: rows.length,
      limit: isSearchMode ? pageSize : DOMAIN_LIMIT,
      dbLabel: relativeDb,
      generatedAt: formatDateTime(now, true),
      subtitle,
      pagination,
      filters: {
        search: searchTerm || null,
        sortBy: isSearchMode ? sortBy : null,
        sortDir: isSearchMode ? sortDir : null
      }
    },
    renderOptions: {
      searchForm: {
        action: "/domains",
        currentSearch: searchTerm,
        placeholder: "Search domains..."
      }
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

const PLACE_HUB_PAGE_SIZE = 50;

/**
 * Render the place hubs listing view
 * Shows geographic place hubs discovered across news websites
 */
function renderPlaceHubsView({ req, db, relativeDb, now }) {
  const query = req.query || {};
  
  // Parse filter parameters
  const hostFilter = (query.host || "").trim() || null;
  const kindFilter = (query.kind || "").trim() || null;
  const searchFilter = (query.search || "").trim() || null;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const offset = (page - 1) * PLACE_HUB_PAGE_SIZE;
  
  // Build filter options
  const filterOptions = { 
    limit: PLACE_HUB_PAGE_SIZE, 
    offset 
  };
  if (hostFilter) filterOptions.host = hostFilter;
  if (kindFilter) filterOptions.placeKind = kindFilter;
  if (searchFilter) filterOptions.search = searchFilter;
  
  // Fetch data
  const hubs = listPlaceHubs(db, filterOptions);
  const totalCount = countPlaceHubs(db, filterOptions);
  const hostStats = getPlaceHubsByHost(db);
  const kindStats = getPlaceHubsByKind(db);
  const availableHosts = getPlaceHubHosts(db);
  
  // Build rows
  const rows = buildPlaceHubRows(hubs, { startIndex: offset + 1 });
  
  // Build subtitle
  let subtitle;
  if (rows.length === 0) {
    subtitle = "No place hubs found matching filters";
  } else {
    const filterDesc = [];
    if (hostFilter) filterDesc.push(`host: ${hostFilter}`);
    if (kindFilter) filterDesc.push(`kind: ${kindFilter}`);
    if (searchFilter) filterDesc.push(`search: "${searchFilter}"`);
    const filterText = filterDesc.length > 0 ? ` (${filterDesc.join(", ")})` : "";
    subtitle = `Showing ${offset + 1}-${offset + rows.length} of ${totalCount} place hubs${filterText}`;
  }
  
  // Build extra cards for statistics
  const extraCards = [
    { label: "Total Hubs", value: formatCount(totalCount) },
    { label: "Hosts", value: formatCount(hostStats.length) },
    { label: "Place Kinds", value: formatCount(kindStats.length) }
  ];
  
  // Add top host card if we have data
  if (hostStats.length > 0) {
    const topHost = hostStats[0];
    extraCards.push({ 
      label: "Top Host", 
      value: String(topHost.count),
      subtitle: topHost.host.replace(/^www\./, "")
    });
  }
  
  // Add top kind card
  if (kindStats.length > 0) {
    const topKind = kindStats[0];
    extraCards.push({ 
      label: "Top Kind", 
      value: String(topKind.count),
      subtitle: topKind.place_kind || "unknown"
    });
  }
  
  // Build pagination
  const totalPages = Math.ceil(totalCount / PLACE_HUB_PAGE_SIZE);
  const pagination = {
    currentPage: page,
    totalPages,
    totalRows: totalCount,
    pageSize: PLACE_HUB_PAGE_SIZE,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
  
  return {
    title: "Place Hubs",
    columns: buildPlaceHubColumns(),
    rows,
    meta: {
      rowCount: totalCount,
      limit: PLACE_HUB_PAGE_SIZE,
      dbLabel: relativeDb,
      generatedAt: formatDateTime(now, true),
      subtitle,
      extraCards,
      pagination,
      filters: {
        host: hostFilter,
        kind: kindFilter,
        search: searchFilter,
        availableHosts,
        availableKinds: kindStats.map(k => k.place_kind).filter(Boolean)
      }
    }
  };
}

const ARTICLE_PAGE_SIZE = 50;

/**
 * Render the articles list view using ArticleListControl
 */
function renderArticlesListView({ req, db, relativeDb, now }) {
  const query = req.query || {};
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const sortBy = query.sortBy || "fetched_at";
  const sortDir = query.sortDir === "asc" ? "asc" : "desc";
  const hostFilter = (query.host || "").trim() || null;
  const classificationFilter = (query.classification || "").trim() || null;
  
  const filterOptions = {
    limit: ARTICLE_PAGE_SIZE,
    offset: (page - 1) * ARTICLE_PAGE_SIZE,
    sortBy,
    sortDir
  };
  if (hostFilter) filterOptions.host = hostFilter;
  if (classificationFilter) filterOptions.classification = classificationFilter;
  
  const articles = listArticlesWithContent(db, filterOptions);
  const totalCount = countArticlesWithContent(db, filterOptions);
  const totalPages = Math.ceil(totalCount / ARTICLE_PAGE_SIZE);
  
  const subtitle = totalCount === 0
    ? "No articles with extracted content found"
    : `Showing ${(page - 1) * ARTICLE_PAGE_SIZE + 1}-${Math.min(page * ARTICLE_PAGE_SIZE, totalCount)} of ${totalCount} articles`;

  return {
    title: "Articles",
    columns: [],
    rows: [],
    meta: {
      rowCount: totalCount,
      limit: ARTICLE_PAGE_SIZE,
      dbLabel: relativeDb,
      generatedAt: formatDateTime(now, true),
      subtitle
    },
    renderOptions: {
      layoutMode: "single-control",
      mainControlFactory: (context) => new ArticleListControl({
        context,
        articles,
        totalCount,
        currentPage: page,
        pageSize: ARTICLE_PAGE_SIZE,
        totalPages,
        sortBy,
        sortDir,
        hostFilter,
        classificationFilter,
        basePath: "/articles"
      })
    }
  };
}

function createDataExplorerServer(options = {}) {
  ensureClientBundle({ silent: options.quietClientBuild });
  const app = express();
  const telemetry = createTelemetry({
    name: "Data Explorer",
    entry: "src/ui/server/dataExplorerServer.js"
  });
  telemetry.wireProcessHandlers();

  app.use(express.urlencoded({ extended: true, limit: "2mb" }));
  app.use(express.json({ limit: "2mb" }));

  attachTelemetryMiddleware(app, telemetry);
  attachTelemetryEndpoints(app, telemetry);

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

  app.get("/health", (req, res) => {
    res.json({ ok: true, service: "data-explorer", db: relativeDb });
  });

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

  // Host the Decision Tree Viewer under the Data Explorer server (no separate port).
  try {
    const { app: decisionTreeViewerApp } = require("./decisionTreeViewer/server");
    if (decisionTreeViewerApp && typeof decisionTreeViewerApp === "function") {
      app.use("/decision-tree-viewer", decisionTreeViewerApp);
    }
  } catch (error) {
    console.warn("Decision Tree Viewer not mounted:", error?.message || error);
  }

  DATA_VIEWS.forEach((view) => {
    app.get(view.path, (req, res, next) => {
      try {
        const now = new Date();
        const payload = view.render({
          req,
          db: dbAccess.db,
          newsDb: dbAccess,
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
          navLinks: buildNavLinks(view.key, DATA_VIEWS),
          themeConfig: resolveThemeConfig(req, dbAccess.db)
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

  // Config setter for crawler_settings (accepts form or JSON)
  app.post("/api/config", (req, res, next) => {
    try {
      const key = (req.body?.key || "").trim();
      if (!key) {
        return res.status(400).json({ success: false, error: "key is required" });
      }

      const value = req.body?.value ?? "";
      const settingAccessor =
        (dbAccess && typeof dbAccess.setSetting === "function" && dbAccess) ||
        (dbAccess && dbAccess.db && typeof dbAccess.db.setSetting === "function" && dbAccess.db) ||
        null;

      if (!settingAccessor) {
        return res.status(503).json({ success: false, error: "settings API unavailable" });
      }

      const success = settingAccessor.setSetting(key, value);

      const wantsJson = (req.headers.accept || "").includes("json") || req.is("application/json");
      if (wantsJson) {
        return res.json({ success, key, value });
      }

      const referer = req.get("referer") || "";
      const redirectTo = referer.includes("/config") ? referer : "/config";
      res.redirect(303, redirectTo);
    } catch (error) {
      next(error);
    }
  });

  // Theme API (ui_themes)
  app.get("/api/themes", (req, res, next) => {
    try {
      const themes = listThemes(dbAccess.db);
      res.json({ ok: true, themes });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/themes/:identifier", (req, res, next) => {
    try {
      const identifier = req.params.identifier;
      const theme = getTheme(dbAccess.db, identifier);
      if (!theme) {
        return res.status(404).json({ ok: false, error: `Theme not found: ${identifier}` });
      }
      res.json({ ok: true, theme });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/themes", (req, res, next) => {
    try {
      const body = req.body || {};
      const theme = createTheme(dbAccess.db, {
        name: body.name,
        displayName: body.displayName,
        description: body.description,
        config: body.config
      });
      res.status(201).json({ ok: true, theme });
    } catch (error) {
      const message = error && error.message ? error.message : "Unable to create theme";
      res.status(400).json({ ok: false, error: message });
    }
  });

  app.put("/api/themes/:identifier", (req, res, next) => {
    try {
      const identifier = req.params.identifier;
      const body = req.body || {};
      const theme = updateTheme(dbAccess.db, identifier, {
        displayName: body.displayName,
        description: body.description,
        config: body.config
      });
      res.json({ ok: true, theme });
    } catch (error) {
      const message = error && error.message ? error.message : "Unable to update theme";
      const status = /not found/i.test(message) ? 404 : 400;
      res.status(status).json({ ok: false, error: message });
    }
  });

  app.post("/api/themes/:identifier/default", (req, res, next) => {
    try {
      const identifier = req.params.identifier;
      const theme = setDefaultTheme(dbAccess.db, identifier);
      res.json({ ok: true, theme });
    } catch (error) {
      const message = error && error.message ? error.message : "Unable to set default theme";
      const status = /not found/i.test(message) ? 404 : 400;
      res.status(status).json({ ok: false, error: message });
    }
  });

  app.delete("/api/themes/:identifier", (req, res, next) => {
    try {
      const identifier = req.params.identifier;
      const success = deleteTheme(dbAccess.db, identifier);
      res.json({ ok: true, success: !!success });
    } catch (error) {
      const message = error && error.message ? error.message : "Unable to delete theme";
      const status = /not found/i.test(message) ? 404 : 400;
      res.status(status).json({ ok: false, error: message });
    }
  });

  // SSE events endpoint - now backed by canonical crawler telemetry.
  // Client expects message events with JSON payloads: { type, data }.
  // TelemetryIntegration emits { type: 'crawl:telemetry', data: <event> }.
  // Events are persisted to DB for AI queryability and replay.
  const crawlTelemetry = new TelemetryIntegration({
    historyLimit: 200,
    allowOrigin: null,
    db: dbAccess.db
  });
  app.locals.crawlTelemetry = crawlTelemetry;
  crawlTelemetry.mountSSE(app, "/api/events");

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
      const normalizedHosts = limitedHosts
        .map((host) => toLowerHost(host))
        .filter(Boolean);

      const countsByHost = selectDomainCountsByHosts(dbAccess.db, normalizedHosts);
      const counts = {};
      for (const host of limitedHosts) {
        const normalizedHost = toLowerHost(host);
        if (!normalizedHost) continue;
        const record = countsByHost[normalizedHost] || { allArticles: 0, fetches: 0 };
        counts[host] = {
          allArticles: record.allArticles || 0,
          fetches: record.fetches || 0
        };
      }
      res.json({ counts });
    } catch (error) {
      next(error);
    }
  });

  // Domain listing API with search, sort, and pagination
  app.get("/api/domains", (req, res, next) => {
    try {
      const now = new Date();
      const query = req.query || {};

      // Parse pagination params
      const requestedPage = sanitizePage(query.page);
      const limit = 25;
      const offset = (requestedPage - 1) * limit;

      // Parse sort params
      const sortBy = normalizeSortColumn(query.sortBy || query.sort);
      const sortDir = normalizeSortDirection(query.sortDir || query.dir);

      // Parse search param
      const search = typeof query.search === "string" ? query.search.trim() : "";

      // Fetch data
      const totalRows = countDomains(dbAccess.db, { search });
      const records = selectDomainPage(dbAccess.db, {
        search,
        sortBy,
        sortDir,
        limit,
        offset
      });

      // Build pagination
      const totalPages = Math.max(1, Math.ceil(totalRows / limit));
      const safePage = Math.min(requestedPage, totalPages);
      const startRow = totalRows === 0 ? 0 : offset + 1;
      const endRow = totalRows === 0 ? 0 : offset + Math.min(limit, totalRows - offset);

      const makeHref = (page) => {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        if (sortBy !== "url_count") params.set("sortBy", sortBy);
        if (sortDir !== "DESC") params.set("sortDir", sortDir);
        if (page > 1) params.set("page", String(page));
        const qs = params.toString();
        return qs ? `/api/domains?${qs}` : "/api/domains";
      };

      const pagination = {
        currentPage: safePage,
        totalPages,
        totalRows,
        pageSize: limit,
        startRow,
        endRow,
        prevHref: safePage > 1 ? makeHref(safePage - 1) : null,
        nextHref: safePage < totalPages ? makeHref(safePage + 1) : null,
        firstHref: safePage > 1 ? makeHref(1) : null,
        lastHref: safePage < totalPages ? makeHref(totalPages) : null
      };

      // Build response
      const diagnostics = buildRequestDiagnostics(req, { route: "/api/domains" });
      applyDiagnosticsHeaders(res, diagnostics);

      res.json({
        ok: true,
        records,
        meta: {
          rowCount: records.length,
          limit,
          generatedAt: formatDateTime(now, true),
          pagination,
          filters: {
            search: search || null,
            sortBy,
            sortDir
          }
        },
        diagnostics
      });
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

      // Fetch decision traces for this URL (Why panel)
      let decisionTraces = [];
      try {
        if (dbAccess && typeof dbAccess.listMilestones === "function") {
          const result = dbAccess.listMilestones({ target: urlRow.url, limit: 20 });
          decisionTraces = (result && result.items) || [];
        }
      } catch (_) {
        decisionTraces = [];
      }

      const DOWNLOAD_COLUMNS = [
        { key: "index", label: "#", align: "right", cellClass: "is-index" },
        { key: "fetchedAt", label: "Fetched At", cellClass: "is-timestamp" },
        { key: "httpStatus", label: "HTTP", align: "center" },
        { key: "classification", label: "Classification" },
        { key: "contentLength", label: "Bytes", align: "right", cellClass: "is-metric" },
        { key: "wordCount", label: "Words", align: "right", cellClass: "is-metric" },
        { key: "details", label: "Details", align: "center" }
      ];

      const rows = fetches.map((f, i) => ({
        index: { text: String(i + 1), classNames: "is-index" },
        fetchedAt: { text: formatDateTime(f.fetchedAt, true), href: `/fetches/${f.id}` },
        httpStatus: { text: f.httpStatus != null ? String(f.httpStatus) : "—" },
        classification: f.classification || "—",
        contentLength: f.contentLength != null ? String(f.contentLength) : "—",
        wordCount: f.wordCount != null ? String(f.wordCount) : "—",
        details: { text: "View", href: `/fetches/${f.id}` }
      }));

      // Build extra cards including decision count
      const extraCards = [{ label: "Fetches (24h)", series: spark }];
      if (decisionTraces.length > 0) {
        extraCards.push({ label: "Decisions", value: String(decisionTraces.length), subtitle: "Why traces" });
      }

      const meta = {
        rowCount: rows.length,
        limit: rows.length,
        dbLabel: relativeDb,
        generatedAt: formatDateTime(now, true),
        subtitle: `Last ${rows.length} fetches for ${urlRow.url}`,
        extraCards
      };

      // Build decision traces section as dashboardSections if any exist
      let dashboardSections = [];
      if (decisionTraces.length > 0) {
        const target = encodeURIComponent(urlRow.url);
        dashboardSections = [
          {
            key: "url-decisions",
            title: "Why (Decision Traces)",
            meta: `${decisionTraces.length} traces`,
            content: ({ context }) => createDecisionTraceList(context, decisionTraces),
            footer: ({ context }) => {
              const link = new jsgui.a({ context });
              link.dom.attributes.href = `/decisions?targetLike=${target}`;
              link.add(new StringControl({ context, text: "View all matching traces" }));
              return link;
            }
          }
        ];
      }

      const breadcrumbTrail = [{ label: "URLs", href: "/urls" }];
      const backLink = deriveBackLink(req, breadcrumbTrail[0]);
      const breadcrumbs = buildBreadcrumbs({ trail: breadcrumbTrail, backLink, current: { label: urlRow.url } });

      const renderOptions = {
        clientScriptPath: hasClientBundle ? normalizedScriptPath : undefined,
        bindingPlugin: bindingPluginEnabled,
        navLinks: buildNavLinks("urls", DATA_VIEWS),
        breadcrumbs
      };
      if (dashboardSections.length > 0) {
        renderOptions.dashboardSections = dashboardSections;
        renderOptions.includeDashboardScaffold = true;
      }

      const html = renderHtml(
        { columns: DOWNLOAD_COLUMNS, rows, meta, title: `URL: ${urlRow.url}` },
        renderOptions
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

  // Fetch detail view - shows full details for a single HTTP response/fetch
  app.get("/fetches/:id", (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).send("Invalid fetch id");
      const now = new Date();
      const fetch = selectFetchById(dbAccess.db, id);
      if (!fetch) return res.status(404).send("Fetch not found");

      // Build detail cards for the fetch metadata
      // Classification emoji display (first card, large emoji)
      const classificationInfo = getClassificationDisplay(fetch.analysis.classification);
      const extraCards = [
        { 
          label: "Classification", 
          value: classificationInfo.emoji,
          subtitle: classificationInfo.label,
          isEmoji: true
        },
        { label: "HTTP Status", value: fetch.httpStatus != null ? String(fetch.httpStatus) : "—" },
        { label: "Content Type", value: fetch.contentType || "—" },
        { label: "Bytes Downloaded", value: fetch.bytesDownloaded != null ? formatCount(fetch.bytesDownloaded) : "—" }
      ];

      // Add timing info if available
      if (fetch.timing.totalMs != null) {
        extraCards.push({ label: "Total Time", value: `${fetch.timing.totalMs}ms` });
      }
      if (fetch.timing.ttfbMs != null) {
        extraCards.push({ label: "TTFB", value: `${fetch.timing.ttfbMs}ms` });
      }
      if (fetch.transferKbps != null) {
        extraCards.push({ label: "Transfer Rate", value: `${fetch.transferKbps.toFixed(1)} KB/s` });
      }

      // Build property rows for detailed view
      const FETCH_DETAIL_COLUMNS = [
        { key: "property", label: "Property" },
        { key: "value", label: "Value" }
      ];

      const detailRows = [
        { property: "Fetch ID", value: String(fetch.id) },
        { property: "URL", value: { text: fetch.url, href: `/urls/${fetch.urlId}` } },
        { property: "Host", value: { text: fetch.host, href: `/domains/${fetch.host}` } },
        { property: "Request Method", value: fetch.requestMethod || "GET" },
        { property: "Request Started", value: formatDateTime(fetch.requestStartedAt, true) },
        { property: "Fetched At", value: formatDateTime(fetch.fetchedAt, true) },
        { property: "HTTP Status", value: fetch.httpStatus != null ? String(fetch.httpStatus) : "—" },
        { property: "Content Type", value: fetch.contentType || "—" },
        { property: "Content Encoding", value: fetch.contentEncoding || "—" },
        { property: "Bytes Downloaded", value: fetch.bytesDownloaded != null ? formatCount(fetch.bytesDownloaded) : "—" },
        { property: "ETag", value: fetch.etag || "—" },
        { property: "Last-Modified", value: fetch.lastModified || "—" }
      ];

      // Add timing details
      if (fetch.timing.ttfbMs != null || fetch.timing.downloadMs != null || fetch.timing.totalMs != null) {
        detailRows.push({ property: "—", value: "— Timing —" });
        if (fetch.timing.ttfbMs != null) {
          detailRows.push({ property: "Time to First Byte (TTFB)", value: `${fetch.timing.ttfbMs}ms` });
        }
        if (fetch.timing.downloadMs != null) {
          detailRows.push({ property: "Download Time", value: `${fetch.timing.downloadMs}ms` });
        }
        if (fetch.timing.totalMs != null) {
          detailRows.push({ property: "Total Time", value: `${fetch.timing.totalMs}ms` });
        }
        if (fetch.transferKbps != null) {
          detailRows.push({ property: "Transfer Rate", value: `${fetch.transferKbps.toFixed(2)} KB/s` });
        }
      }

      // Add cache info if present
      if (fetch.cache.category || fetch.cache.key || fetch.cache.createdAt) {
        detailRows.push({ property: "—", value: "— Cache —" });
        if (fetch.cache.category) {
          detailRows.push({ property: "Cache Category", value: fetch.cache.category });
        }
        if (fetch.cache.key) {
          detailRows.push({ property: "Cache Key", value: fetch.cache.key });
        }
        if (fetch.cache.createdAt) {
          detailRows.push({ property: "Cache Created", value: formatDateTime(fetch.cache.createdAt, true) });
        }
        if (fetch.cache.expiresAt) {
          detailRows.push({ property: "Cache Expires", value: formatDateTime(fetch.cache.expiresAt, true) });
        }
      }

      // Add storage info if present
      if (fetch.storage.id || fetch.storage.fileSize != null) {
        detailRows.push({ property: "—", value: "— Storage —" });
        if (fetch.storage.id) {
          detailRows.push({ property: "Storage ID", value: String(fetch.storage.id) });
        }
        if (fetch.storage.fileSize != null) {
          detailRows.push({ property: "Stored Size", value: formatCount(fetch.storage.fileSize) + " bytes" });
        }
        if (fetch.storage.compressionTypeId) {
          detailRows.push({ property: "Compression Type ID", value: String(fetch.storage.compressionTypeId) });
        }
      }

      // Add analysis info if present
      if (fetch.analysis.classification || fetch.analysis.wordCount != null) {
        detailRows.push({ property: "—", value: "— Analysis —" });
        if (fetch.analysis.classification) {
          detailRows.push({ property: "Classification", value: fetch.analysis.classification });
        }
        if (fetch.analysis.contentCategory) {
          detailRows.push({ property: "Content Category", value: fetch.analysis.contentCategory });
        }
        if (fetch.analysis.contentSubtype) {
          detailRows.push({ property: "Content Subtype", value: fetch.analysis.contentSubtype });
        }
        if (fetch.analysis.wordCount != null) {
          detailRows.push({ property: "Word Count", value: formatCount(fetch.analysis.wordCount) });
        }
      }

      // Add redirect chain if present
      if (fetch.redirectChain && (Array.isArray(fetch.redirectChain) ? fetch.redirectChain.length > 0 : true)) {
        detailRows.push({ property: "—", value: "— Redirects —" });
        const chainDisplay = Array.isArray(fetch.redirectChain)
          ? fetch.redirectChain.join(" → ")
          : String(fetch.redirectChain);
        detailRows.push({ property: "Redirect Chain", value: chainDisplay });
      }

      const meta = {
        rowCount: detailRows.length,
        limit: detailRows.length,
        dbLabel: relativeDb,
        generatedAt: formatDateTime(now, true),
        subtitle: `Fetch #${fetch.id} from ${fetch.host} at ${formatDateTime(fetch.fetchedAt, true)}`,
        extraCards
      };

      const breadcrumbTrail = [
        { label: "URLs", href: "/urls" },
        { label: fetch.url, href: `/urls/${fetch.urlId}` }
      ];
      const backLink = deriveBackLink(req, breadcrumbTrail[1]);
      const breadcrumbs = buildBreadcrumbs({ trail: breadcrumbTrail, backLink, current: { label: `Fetch #${fetch.id}` } });

      const html = renderHtml(
        { columns: FETCH_DETAIL_COLUMNS, rows: detailRows, meta, title: `Fetch #${fetch.id}` },
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

  // Article detail view - shows extracted article content
  app.get("/articles/:fetchId", async (req, res, next) => {
    try {
      const fetchId = Number(req.params.fetchId);
      if (!Number.isFinite(fetchId)) return res.status(400).send("Invalid fetch id");
      
      const now = new Date();
      const articleData = await getExtractedArticle(dbAccess.db, fetchId);
      
      if (!articleData) {
        return res.status(404).send("Article not found or no content available");
      }

      const breadcrumbTrail = [
        { label: "Articles", href: "/articles" },
        { label: articleData.host, href: `/domains/${articleData.host}` }
      ];
      const backLink = deriveBackLink(req, { label: "Articles", href: "/articles" });
      const breadcrumbs = buildBreadcrumbs({ 
        trail: breadcrumbTrail, 
        backLink, 
        current: { label: articleData.extractedData?.title || `Article #${fetchId}` } 
      });

      const html = renderHtml(
        { 
          columns: [], 
          rows: [], 
          meta: {
            rowCount: 0,
            limit: 0,
            dbLabel: relativeDb,
            generatedAt: formatDateTime(now, true),
            subtitle: `Article from ${articleData.host}`
          },
          title: articleData.extraction?.title || `Article #${fetchId}`
        },
        {
          clientScriptPath: hasClientBundle ? normalizedScriptPath : undefined,
          bindingPlugin: bindingPluginEnabled,
          navLinks: buildNavLinks("articles", DATA_VIEWS),
          breadcrumbs,
          layoutMode: "single-control",
          mainControlFactory: (context) => new ArticleViewerControl({
            context,
            article: articleData,
            fetchId,
            backHref: req.query.back || "/articles"
          })
        }
      );
      res.type("html").send(html);
    } catch (error) {
      next(error);
    }
  });

  // Classification detail view - shows documents for a specific classification type
  // Supports query params: ?limit=10|100|1000|10000 &random=1 &page=N
  app.get("/classifications/:name", (req, res, next) => {
    try {
      const name = (req.params.name || "").trim();
      if (!name) return res.status(400).send("Classification name is required");
      
      const classification = getClassificationByName(dbAccess.db, name);
      if (!classification) return res.status(404).send("Classification not found");
      
      // Parse query parameters
      const query = req.query || {};
      const VALID_LIMITS = [10, 100, 1000, 10000];
      const DEFAULT_LIMIT = 10;
      const requestedLimit = Number(query.limit) || DEFAULT_LIMIT;
      const effectiveLimit = VALID_LIMITS.includes(requestedLimit) ? requestedLimit : DEFAULT_LIMIT;
      // Random sampling is the DEFAULT on initial load.
      // Form submission detected by presence of 'limit' param; if random checkbox unchecked, random param is absent
      const randomParam = query.random;
      const formWasSubmitted = query.limit !== undefined;
      // If form submitted: random only if checkbox was checked (random=1)
      // If no form submission (initial load): default to random
      const isRandom = formWasSubmitted 
        ? (randomParam === "1" || randomParam === "true")
        : true;
      const requestedPage = Math.max(1, Math.trunc(Number(query.page) || 1));
      
      const now = new Date();
      const totalDocs = countDocumentsForClassification(dbAccess.db, name);
      
      // Fetch documents based on mode
      let documents;
      let pagination = null;
      
      if (isRandom) {
        // Random sampling - no pagination
        documents = getRandomDocumentsForClassification(dbAccess.db, name, { limit: effectiveLimit });
      } else {
        // Sequential with pagination
        const totalPages = Math.max(1, Math.ceil(totalDocs / effectiveLimit));
        const safePage = Math.min(requestedPage, totalPages);
        const offset = (safePage - 1) * effectiveLimit;
        documents = getDocumentsForClassification(dbAccess.db, name, { limit: effectiveLimit, offset });
        
        // Build pagination info
        const buildPageHref = (page) => {
          const params = new URLSearchParams();
          params.set("limit", String(effectiveLimit));
          if (page > 1) params.set("page", String(page));
          return `/classifications/${encodeURIComponent(name)}?${params.toString()}`;
        };
        
        pagination = {
          currentPage: safePage,
          totalPages,
          totalRows: totalDocs,
          pageSize: effectiveLimit,
          startRow: totalDocs === 0 ? 0 : offset + 1,
          endRow: totalDocs === 0 ? 0 : Math.min(offset + effectiveLimit, totalDocs),
          prevHref: safePage > 1 ? buildPageHref(safePage - 1) : null,
          nextHref: safePage < totalPages ? buildPageHref(safePage + 1) : null,
          firstHref: safePage > 1 ? buildPageHref(1) : null,
          lastHref: safePage < totalPages ? buildPageHref(totalPages) : null
        };
      }
      
      // Build columns for documents table
      const DOC_COLUMNS = [
        { key: "url", label: "URL" },
        { key: "host", label: "Host", width: "150px" },
        { key: "word_count", label: "Words", width: "100px", align: "right" },
        { key: "analyzed_at", label: "Analyzed", width: "180px" }
      ];
      
      // Build rows
      const rows = documents.map(doc => ({
        url: { text: doc.url, href: `/urls/${doc.url_id}` },
        host: { text: doc.host, href: `/domains/${doc.host}` },
        word_count: doc.word_count != null ? formatCount(doc.word_count) : "—",
        analyzed_at: formatDateTime(doc.analyzed_at, true)
      }));
      
      // Build subtitle based on mode
      let subtitle;
      if (totalDocs === 0) {
        subtitle = `No documents with classification "${name}"`;
      } else if (isRandom) {
        subtitle = `Random sample of ${rows.length} from ${formatCount(totalDocs)} ${classification.display_name} documents`;
      } else if (pagination) {
        subtitle = `Showing ${pagination.startRow}–${pagination.endRow} of ${formatCount(totalDocs)} ${classification.display_name} documents`;
      } else {
        subtitle = `${formatCount(totalDocs)} documents classified as ${classification.display_name}`;
      }
      
      // Build filter controls factory (will be called with context inside renderHtml)
      const filterControlsFactory = (context) => buildClassificationFilterControls({
        context,
        basePath: `/classifications/${encodeURIComponent(name)}`,
        currentLimit: effectiveLimit,
        isRandom,
        validLimits: VALID_LIMITS
      });
      
      const meta = {
        rowCount: rows.length,
        limit: effectiveLimit,
        dbLabel: relativeDb,
        generatedAt: formatDateTime(now, true),
        subtitle,
        pagination,
        extraCards: [
          { label: "Type", value: classification.emoji || "❓", subtitle: classification.display_name, isEmoji: true },
          { label: "Category", value: classification.category || "—" },
          { label: "Total Documents", value: formatCount(totalDocs) }
        ],
        filterControlsFactory
      };
      
      const breadcrumbTrail = [{ label: "Classifications", href: "/classifications" }];
      const backLink = deriveBackLink(req, breadcrumbTrail[0]);
      const breadcrumbs = buildBreadcrumbs({ 
        trail: breadcrumbTrail, 
        backLink, 
        current: { label: `${classification.emoji || ""} ${classification.display_name}` } 
      });
      
      const html = renderHtml(
        { columns: DOC_COLUMNS, rows, meta, title: `Classification: ${classification.display_name}` },
        {
          clientScriptPath: hasClientBundle ? normalizedScriptPath : undefined,
          bindingPlugin: bindingPluginEnabled,
          navLinks: buildNavLinks("classifications", DATA_VIEWS),
          breadcrumbs
        }
      );
      res.type("html").send(html);
    } catch (error) {
      next(error);
    }
  });

  app.use((err, req, res, _next) => {
    console.error("Data explorer server error:", err);
    telemetry.error("server.error", err && err.message ? err.message : "Data explorer server error", {
      code: err && err.code ? err.code : undefined,
      statusCode: Number.isFinite(err && err.statusCode) ? err.statusCode : 500,
      path: req && req.path ? req.path : undefined
    });
    const statusCode = Number.isFinite(err && err.statusCode) ? err.statusCode : 500;
    const diagnostics = buildRequestDiagnostics(req, {
      status: statusCode,
      error: err && err.message ? err.message : "Internal server error"
    });
    const wantsJson = (req && req.path && req.path.startsWith("/api/")) || acceptsJson(req);
    applyDiagnosticsHeaders(res, { ...diagnostics, error: true });
    if (wantsJson) {
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

    res.status(statusCode).type("text/plain").send("Internal server error");
  });

  const close = () => {
    try {
      dbAccess.close();
    } catch (_) {}
  };

  return { app, telemetry, close };

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
      case "--check":
        args.check = true;
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
          if (key === "--check") args.check = value == null || value !== "0";
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

  if (args.check) {
    const port = Number.isFinite(args.port) ? args.port : DEFAULT_PORT;
    const forwardedArgs = ["--host", "127.0.0.1"];
    if (args.db) forwardedArgs.push("--db", args.db);
    if (args.pageSize) forwardedArgs.push("--page-size", String(args.pageSize));
    if (args.title) forwardedArgs.push("--title", args.title);
    runStartupCheck(__filename, port, {
      serverName: "Data Explorer",
      healthEndpoint: "/health",
      args: forwardedArgs
    });
  } else {
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
    const { app, close, telemetry } = createDataExplorerServer({
      dbPath: args.db,
      pageSize,
      title: args.title
    });
    const port = Number.isFinite(args.port) ? args.port : DEFAULT_PORT;
    const host = args.host || "127.0.0.1";

    log.info("Starting data explorer", { host, port, pageSize, db: args.db });
    telemetry.info("server.starting", undefined, {
      host,
      port,
      pageSize
    });

    const server = app.listen(port, host, () => {
      telemetry.setPort(port);
      telemetry.info("server.listening", `Crawler data explorer listening on http://${host}:${port}/urls`, {
        url: `http://${host}:${port}/urls`,
        pageSize
      });
      log.info("Data explorer ready", { url: `http://${host}:${port}/urls`, pageSize });
      console.log(`Crawler data explorer listening on http://${host}:${port}/urls (page size ${pageSize})`);
    });

    let shuttingDown = false;
    const handleShutdown = () => {
      if (shuttingDown) return;
      shuttingDown = true;
      log.info("Shutting down data explorer");
      telemetry.info("server.shutdown", "Shutting down crawler data explorer...");
      console.log("Shutting down crawler data explorer...");
      server.close(() => {
        close();
        process.exit(0);
      });
    };

    process.on("SIGINT", handleShutdown);
    process.on("SIGTERM", handleShutdown);
  }
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

