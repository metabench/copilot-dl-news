"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const express = require("express");
const compression = require("compression");

const { openNewsDb } = require("../../db/dbAccess");
const { findProjectRoot } = require("../../utils/project-root");
const { selectUrlPage, countUrls } = require("../../db/sqlite/v1/queries/ui/urlListingNormalized");
const { selectRecentDomains } = require("../../db/sqlite/v1/queries/ui/recentDomains");
const {
  getArticleCount,
  getFetchCountDirect,
  getFetchCountViaJoin
} = require("../../db/sqlite/v1/queries/ui/domainSummary");
const { listRecentCrawls } = require("../../db/sqlite/v1/queries/ui/crawls");
const { listRecentErrors } = require("../../db/sqlite/v1/queries/ui/errors");
const { selectUrlById, selectFetchHistory } = require("../../db/sqlite/v1/queries/ui/urlDetails");
const { selectHostSummary, selectHostDownloads } = require("../../db/sqlite/v1/queries/ui/domainDetails");
const { getCachedMetric } = require("./services/metricsService");
const { renderHtml, resolveDbPath } = require("../render-url-table");
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
  buildNavLinks,
  buildBackLinkTarget,
  deriveBackLink,
  appendBackParams,
  buildBreadcrumbs
} = require("./navigation");

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
const DEFAULT_TITLE = "Crawler Data Explorer";
const DOMAIN_DOWNLOAD_LIMIT = 200;

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

function buildUrlTotals(db) {
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

const DATA_VIEWS = [
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
  }
];

function renderUrlListingView({ req, db, relativeDb, pageSize, now }) {
  const requestedPage = sanitizePage(req.query.page);
  const totals = buildUrlTotals(db);
  const totalRows = totals.totalRows;
  const basePath = ((req.baseUrl || "") + (req.path || "")) || "/urls";
  const backTarget = buildBackLinkTarget(req, { defaultLabel: "URLs" });
  const pagination = buildPagination(basePath, req.query, {
    totalRows,
    pageSize,
    currentPage: requestedPage
  });
  const { offset, currentPage, totalPages, startRow, endRow } = pagination;
  const records = selectUrlPage(db, { limit: pageSize, offset });
  const rows = buildDisplayRows(records, { startIndex: startRow > 0 ? startRow : 1 });
  attachBackLink(rows, "url", backTarget);
  attachBackLink(rows, "host", backTarget);
  const subtitle = totalRows === 0
    ? `No URLs available in ${relativeDb}`
    : buildUrlSummarySubtitle({ startRow, endRow, totalRows, currentPage, totalPages, totals });
  const meta = {
    rowCount: rows.length,
    limit: pageSize,
    dbLabel: relativeDb,
    generatedAt: formatDateTime(now, true),
    subtitle,
    pagination
  };
  return {
    title: "Crawler URL Snapshot",
    columns: URL_COLUMNS,
    rows,
    meta: buildUrlMeta({
      meta,
      totals,
      now
    })
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

function buildUrlSummarySubtitle({ startRow, endRow, totalRows, currentPage, totalPages, totals }) {
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
  return parts.join(" • ");
}

function tryGetCachedDomainSnapshot(db) {
  if (!db) return null;
  try {
    const cached = getCachedMetric(db, "domains.top_hosts_window");
    if (cached && cached.payload && Array.isArray(cached.payload.hosts)) {
      return {
        source: "cache",
        hosts: cached.payload.hosts.map(normalizeDomainEntry),
        cache: {
          statKey: cached.statKey,
          generatedAt: cached.generatedAt,
          stale: cached.stale,
          maxAgeMs: cached.maxAgeMs
        }
      };
    }
  } catch (_) {
    // Ignore cache read failures and fall back to live queries.
  }
  return null;
}

function normalizeDomainEntry(entry) {
  if (!entry) {
    return { host: null, articleCount: 0, lastSavedAt: null };
  }
  return {
    host: entry.host || null,
    articleCount: Number(entry.articleCount ?? entry.article_count ?? 0) || 0,
    lastSavedAt: entry.lastSavedAt ?? entry.last_saved_at ?? null
  };
}

function buildDomainSnapshot(db) {
  const cached = tryGetCachedDomainSnapshot(db);
  if (cached) {
    return cached;
  }
  const liveRows = selectRecentDomains(db, { windowSize: DOMAIN_WINDOW_SIZE, limit: DOMAIN_LIMIT }).map(normalizeDomainEntry);
  return {
    source: "live",
    hosts: liveRows,
    cache: null
  };
}

function renderDomainSummaryView({ req, db, relativeDb, now }) {
  const snapshot = buildDomainSnapshot(db);
  const entries = snapshot.hosts.map((domain) => {
    const normalizedHost = domain.host ? toLowerHost(domain.host) : null;
    return {
      host: domain.host || null,
      windowArticles: domain.articleCount || 0,
      allArticles: normalizedHost ? getArticleCount(db, normalizedHost) : 0,
      fetches: normalizedHost ? getFetchCountForHost(db, normalizedHost) : 0,
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

  app.get("/", (req, res) => {
    res.redirect("/urls");
  });

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
        const html = renderHtml(
          {
            columns,
            rows,
            meta,
            title: payload.title || view.title || serverTitle
          },
          {
            clientScriptPath: hasClientBundle ? normalizedScriptPath : undefined,
            bindingPlugin: bindingPluginEnabled,
            navLinks: buildNavLinks(view.key, DATA_VIEWS)
          }
        );
        res.type("html").send(html);
      } catch (error) {
        next(error);
      }
    });
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
    res.status(500).type("text/plain").send("Internal server error");
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

if (require.main === module) {
  const args = parseServerArgs(process.argv.slice(2));
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
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE
};
