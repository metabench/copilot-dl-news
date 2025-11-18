"use strict";

const fs = require("fs");
const path = require("path");
const jsgui = require("jsgui3-html");

const { openNewsDb } = require("../db/dbAccess");
const { findProjectRoot } = require("../utils/project-root");
const { selectInitialUrls, countUrls } = require("../db/sqlite/v1/queries/ui/urlListingNormalized");
const {
  UrlListingTableControl,
  buildColumns,
  buildDisplayRows,
  buildIndexCell,
  formatDateTime
} = require("./controls/UrlListingTable");
const { PagerButtonControl } = require("./controls/PagerButton");
const { SparklineControl } = require("./controls");
const { UrlFilterToggleControl } = require("./controls/UrlFilterToggle");
const { buildHomeCards } = require("./homeCards");
const { createHomeCardLoaders } = require("./homeCardData");
const { listControlTypes } = require("./controls/controlManifest");

const StringControl = jsgui.String_Control;

const DOMAIN_WINDOW_SIZE = 4000;
const DOMAIN_LIMIT = 40;
const HOME_CARD_CRAWL_LIMIT = 12;
const HOME_CARD_ERROR_LIMIT = 50;

function parseArgs(argv) {
  const args = {};
  const normalized = Array.isArray(argv) ? argv.slice() : [];
  for (let i = 0; i < normalized.length; i += 1) {
    const token = normalized[i];
    if (!token) continue;
    switch (token) {
      case "--db":
      case "-d":
        args.db = normalized[++i];
        break;
      case "--limit":
      case "-l":
        args.limit = Number(normalized[++i]);
        break;
      case "--output":
      case "-o":
        args.output = normalized[++i];
        break;
      case "--title":
        args.title = normalized[++i];
        break;
      default:
        if (token.startsWith("--")) {
          const [key, value] = token.split("=");
          if (key === "--db" && value) args.db = value;
          if (key === "--limit" && value) args.limit = Number(value);
          if (key === "--output" && value) args.output = value;
          if (key === "--title" && value) args.title = value;
        }
        break;
    }
  }
  return args;
}

function resolveDbPath(cliPath) {
  const projectRoot = findProjectRoot(__dirname);
  if (cliPath) {
    return path.isAbsolute(cliPath) ? cliPath : path.resolve(process.cwd(), cliPath);
  }
  return path.join(projectRoot, "data", "news.db");
}

function buildUrlTotals(dbHandle) {
  if (!dbHandle) return null;
  try {
    const totalRows = countUrls(dbHandle);
    return {
      source: "live",
      totalRows,
      cache: null
    };
  } catch (_) {
    return null;
  }
}

function buildCliHomeCards(dbHandle, totals) {
  if (!dbHandle) {
    return buildHomeCards({ totals });
  }
  try {
    const loaders = createHomeCardLoaders({
      db: dbHandle,
      domainWindowSize: DOMAIN_WINDOW_SIZE,
      domainLimit: DOMAIN_LIMIT,
      crawlLimit: HOME_CARD_CRAWL_LIMIT,
      errorLimit: HOME_CARD_ERROR_LIMIT
    });
    return buildHomeCards({ totals, loaders });
  } catch (_) {
    return buildHomeCards({ totals });
  }
}

function injectControlManifestScript(context, body, controlTypes) {
  if (!context || !body) {
    return;
  }
  const expectedTypes = Array.isArray(controlTypes) && controlTypes.length
    ? controlTypes
    : listControlTypes();
  const normalized = expectedTypes
    .map((type) => (typeof type === "string" ? type.trim().toLowerCase() : ""))
    .filter(Boolean);
  if (!normalized.length) {
    return;
  }
  const script = new jsgui.script({ context });
  const serialized = JSON.stringify(normalized).replace(/</g, "\\u003c");
  script.add(new StringControl({ context, text: `window.__COPILOT_EXPECTED_CONTROLS__ = ${serialized};` }));
  body.add(script);
}

function renderHtml({ columns = [], rows = [], meta = {}, title }, options = {}) {
  const normalizedColumns = Array.isArray(columns) ? columns : [];
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const controlTypes = Array.isArray(options.controlTypes) && options.controlTypes.length
    ? options.controlTypes
    : listControlTypes();
  const clientScriptPath = options.clientScriptPath;
  const bindingPluginEnabled = options.bindingPlugin !== false;
  const navLinks = Array.isArray(options.navLinks) ? options.navLinks : null;
  const breadcrumbs = Array.isArray(options.breadcrumbs) ? options.breadcrumbs : null;
  const filterOptions = options.filterOptions;
  const homeCards = Array.isArray(options.homeCards) ? options.homeCards : null;
  const listingState = options.listingState || null;
  const layoutMode = typeof options.layoutMode === "string" && options.layoutMode.trim() ? options.layoutMode : "listing";
  const hideListingPanel = options.hideListingPanel === true || layoutMode === "dashboard";
  const dashboardSections = Array.isArray(options.dashboardSections) ? options.dashboardSections.slice() : [];
  const includeDashboardScaffold = options.includeDashboardScaffold === true || dashboardSections.length > 0;
  const safeMeta = {
    rowCount: 0,
    limit: 0,
    dbLabel: "—",
    generatedAt: "",
    subtitle: "",
    extraCards: [],
    ...meta
  };
  const rowCountDisplay = Number.isFinite(Number(safeMeta.rowCount)) ? Number(safeMeta.rowCount) : 0;
  const limitDisplay = Number.isFinite(Number(safeMeta.limit)) ? Number(safeMeta.limit) : 0;
  const dbLabelDisplay = safeMeta.dbLabel || "—";
  const generatedAtDisplay = safeMeta.generatedAt || "";
  const subtitleDisplay = safeMeta.subtitle || "";
  const shouldRenderListing = !hideListingPanel && normalizedColumns.length > 0;

  const context = new jsgui.Page_Context();
  const document = new jsgui.Blank_HTML_Document({ context });

  document.title.add(new StringControl({ context, text: title }));
  const head = document.head;
  head.add(new jsgui.meta({ context, attrs: { charset: "utf-8" } }));
  head.add(new jsgui.meta({ context, attrs: { name: "viewport", content: "width=device-width, initial-scale=1" } }));
  head.add(createStyleTag(context, buildCss()));

  const body = document.body;
  const shell = new jsgui.div({ context, class: "page-shell" });
  shell.add_class("page-shell--offset");
  const header = new jsgui.Control({ context, tagName: "header" });
  header.add_class("page-shell__header");
  const breadcrumbNav = breadcrumbs ? createBreadcrumbsNav(context, breadcrumbs) : null;
  if (breadcrumbNav) header.add(breadcrumbNav);
  const hero = new jsgui.div({ context, class: "page-shell__hero" });
  const headingGroup = new jsgui.div({ context, class: "page-shell__heading" });
  const heading = new jsgui.h1({ context });
  if (title) {
    heading.add(new StringControl({ context, text: title }));
  }
  const subtitle = new jsgui.p({ context, class: "page-shell__subtitle" });
  subtitle.dom.attributes["data-meta-field"] = "subtitle";
  if (subtitleDisplay) {
    subtitle.add(new StringControl({ context, text: subtitleDisplay }));
  }
  headingGroup.add(heading);
  headingGroup.add(subtitle);
  let filterControl = null;
  if (filterOptions && typeof filterOptions === "object") {
    filterControl = new UrlFilterToggleControl({ context, ...filterOptions });
  }
  hero.add(headingGroup);
  if (filterControl) {
    const actions = new jsgui.div({ context, class: "page-shell__actions" });
    actions.add(filterControl);
    hero.add(actions);
  }
  header.add(hero);

  let panel = null;
  if (shouldRenderListing) {
    panel = new jsgui.Control({ context, tagName: "section" });
    panel.add_class("panel");
    const metaGrid = new jsgui.div({ context, class: "panel__meta" });
    metaGrid.add(createMetaCard(context, "Rows Rendered", rowCountDisplay.toLocaleString("en-US"), { field: "rowCount" }));
    metaGrid.add(createMetaCard(context, "Requested Limit", limitDisplay.toLocaleString("en-US"), { field: "limit" }));
    metaGrid.add(createMetaCard(context, "Database", dbLabelDisplay, { field: "dbLabel" }));
    metaGrid.add(createMetaCard(context, "Generated", generatedAtDisplay, { field: "generatedAt" }));
    if (Array.isArray(safeMeta.extraCards)) {
      safeMeta.extraCards.forEach((card) => {
        if (card && card.label) {
          const content = card.control || card.value || (Array.isArray(card.series)
            ? new SparklineControl({ context, series: card.series, width: card.width || 240, height: card.height || 36 })
            : "—");
          metaGrid.add(createMetaCard(context, card.label, content));
        }
      });
    }
    const table = new UrlListingTableControl({ context, columns: normalizedColumns, rows: normalizedRows });
    const tableWrapper = new jsgui.div({ context, class: "table-wrapper" });
    tableWrapper.add(table);
    const paginationNavTop = safeMeta.pagination ? createPaginationNav(context, safeMeta.pagination, "top") : null;
    const paginationNavBottom = safeMeta.pagination ? createPaginationNav(context, safeMeta.pagination, "bottom") : null;
    panel.add(metaGrid);
    if (paginationNavTop) panel.add(paginationNavTop);
    panel.add(tableWrapper);
    if (paginationNavBottom) panel.add(paginationNavBottom);
  }

  shell.add(header);
  const primaryNav = navLinks ? createPrimaryNav(context, navLinks) : null;
  if (primaryNav) shell.add(primaryNav);
  const homeGrid = homeCards ? createHomeGrid(context, homeCards) : null;
  if (homeGrid) shell.add(homeGrid);
  const dashboardGrid = includeDashboardScaffold ? createDashboardSections(context, dashboardSections) : null;
  if (dashboardGrid) shell.add(dashboardGrid);
  if (panel) {
    shell.add(panel);
  }
  body.add(shell);

  injectControlManifestScript(context, body, controlTypes);

  if (shouldRenderListing && listingState) {
    const stateScript = new jsgui.script({ context });
    const serialized = JSON.stringify(listingState).replace(/</g, "\\u003c");
    stateScript.add(new StringControl({ context, text: `window.__COPILOT_URL_LISTING_STATE__ = ${serialized};` }));
    body.add(stateScript);
  }

  if (clientScriptPath) {
    const attrs = { src: clientScriptPath, defer: "defer" };
    if (!bindingPluginEnabled) {
      attrs["data-binding-plugin"] = "off";
    }
    const clientScript = new jsgui.script({ context, attrs });
    body.add(clientScript);
  }

  return `<!DOCTYPE html>${document.all_html_render()}`;
}

function buildCss() {
  return `
.page-shell {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 20px 16px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.page-shell.page-shell--offset {
  padding-top: 28px;
}
@media (min-width: 1200px) {
  .page-shell {
    max-width: 1480px;
    padding: 32px 32px 40px;
    gap: 28px;
  }
}
@media (min-width: 1600px) {
  .page-shell {
    max-width: 1680px;
    padding-left: 48px;
    padding-right: 48px;
  }
}
@media (max-width: 1100px) {
  .page-shell {
    padding: 18px 14px 28px;
    gap: 16px;
  }
}
.page-shell__header {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 4px;
}
.page-shell__hero {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
@media (min-width: 960px) {
  .page-shell__hero {
    flex-direction: row;
    align-items: flex-end;
    gap: 32px;
  }
}
.page-shell__heading {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 960px;
}
.page-shell__header h1 {
  margin: 0;
  font-size: clamp(1.9rem, 3vw, 2.75rem);
  letter-spacing: -0.01em;
  color: #0f172a;
}
.page-shell__subtitle {
  margin: 0;
  color: #4b5563;
  font-size: 1rem;
  line-height: 1.6;
  text-wrap: balance;
  font-feature-settings: "tnum" 1;
  overflow-wrap: anywhere;
}
@media (min-width: 1400px) {
  .page-shell__subtitle {
    font-size: 1.05rem;
  }
}
.page-shell__actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}
.primary-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0;
  margin-bottom: 8px;
  padding: 0;
}
@media (min-width: 1400px) {
  .primary-nav {
    gap: 12px 16px;
  }
}
.primary-nav__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.45rem 1rem;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 0.9rem;
  font-weight: 600;
  color: #334155;
  background: #e2e8f0;
  text-decoration: none;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.primary-nav__link:hover {
  background: #cbd5f5;
}
.primary-nav__link--active {
  background: #4338ca;
  color: #fff;
  border-color: #312e81;
}
.primary-nav__link[aria-disabled="true"] {
  opacity: 0.6;
  cursor: default;
}
.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0 8px;
  font-size: 0.85rem;
  color: #475569;
}
.breadcrumbs__link {
  color: #4338ca;
  text-decoration: none;
  font-weight: 600;
}
.breadcrumbs__link:hover {
  text-decoration: underline;
}
.breadcrumbs__sep {
  color: #94a3b8;
}
.breadcrumbs__current {
  font-weight: 600;
  color: #0f172a;
}
.home-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 18px;
  margin: 8px 0 12px;
}
@media (min-width: 1500px) {
  .home-grid {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }
}
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 20px;
  margin: 4px 0 28px;
}
@media (max-width: 1100px) {
  .dashboard-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
.dashboard-panel {
  background: #ffffff;
  border: 1px solid #d2d7e3;
  border-radius: 14px;
  padding: 20px 22px;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 220px;
}
.dashboard-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.dashboard-panel__head h2 {
  margin: 0;
  font-size: 1.15rem;
  color: #0f172a;
}
.dashboard-panel__meta {
  font-size: 0.85rem;
  color: #64748b;
}
.dashboard-panel__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dashboard-panel__footer {
  margin-top: auto;
  font-size: 0.85rem;
  color: #475569;
}
.status-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  background: #eef2ff;
  color: #312e81;
}
.status-pill--paused {
  background: #fee2e2;
  color: #b91c1c;
}
.status-pill--meta {
  background: #ecfeff;
  color: #0f766e;
}
.startup-status {
  border-top: 1px solid #e2e8f0;
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.startup-status__text {
  margin: 0;
  font-size: 0.9rem;
  color: #1e293b;
}
.startup-progress {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}
.startup-progress__fill {
  width: 0;
  height: 100%;
  background: linear-gradient(90deg, #4338ca, #6366f1);
  transition: width 0.25s ease;
}
.startup-stage-list {
  margin: 0;
  padding-left: 18px;
  color: #475569;
  font-size: 0.85rem;
}
.jobs-panel .dashboard-panel__head {
  align-items: flex-start;
}
.jobs-panel .dashboard-panel__meta {
  text-align: right;
}
.jobs-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.jobs-empty-state {
  border: 1px dashed #cbd5f5;
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  color: #475569;
  background: #f8fafc;
}
.jobs-empty-state__icon {
  font-size: 1.75rem;
  display: block;
  margin-bottom: 6px;
}
.jobs-empty-state__text {
  margin: 0;
  font-size: 0.9rem;
}
.job-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px 18px;
  background: #ffffff;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
}
.job-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.job-card-status {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 0.85rem;
  color: #475569;
}
.job-card-stage {
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  background: #e0f2fe;
  color: #0369a1;
  font-weight: 600;
}
.job-card-paused-indicator {
  padding: 0.15rem 0.65rem;
  border-radius: 999px;
  background: #fee2e2;
  color: #b91c1c;
  font-weight: 600;
}
.job-card-pid {
  font-size: 0.8rem;
  color: #94a3b8;
}
.job-card-url {
  margin: 10px 0;
  font-size: 0.95rem;
  word-break: break-all;
}
.job-card-link {
  color: #1d4ed8;
  text-decoration: none;
  font-weight: 600;
}
.job-card-link:hover {
  text-decoration: underline;
}
.job-card-status-text {
  font-size: 0.9rem;
  color: #0f172a;
  margin-top: 4px;
}
.job-card-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 10px;
}
.job-card-metric {
  display: flex;
  flex-direction: column;
  font-size: 0.78rem;
  color: #475569;
}
.job-card-metric-value {
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
}
.home-card {
  background: #ffffff;
  border: 1px solid #d0d7de;
  border-radius: 12px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
}
.home-card__headline {
  display: flex;
  align-items: center;
  gap: 10px;
}
.home-card__title {
  margin: 0;
  font-size: 1.05rem;
  color: #0f172a;
}
.home-card__badge {
  margin-left: auto;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.home-card__description {
  margin: 0;
  color: #475569;
  line-height: 1.4;
}
.home-card__stat {
  display: flex;
  flex-direction: column;
  font-size: 0.78rem;
  text-transform: uppercase;
  color: #64748b;
  letter-spacing: 0.08em;
}
.home-card__stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
  letter-spacing: normal;
}
.home-card__action {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  border: 1px solid transparent;
  background: #111827;
  color: #ffffff;
  font-weight: 600;
  text-decoration: none;
  font-size: 0.85rem;
}
.home-card__action:hover {
  background: #1f2937;
}
.home-card__stat-link {
  color: inherit;
  text-decoration: none;
}
.home-card__stat-link:hover {
  text-decoration: underline;
}
.home-card__hints {
  margin: 0;
  margin-top: 4px;
  padding-left: 18px;
  font-size: 0.78rem;
  color: #475569;
}
.home-card__hint {
  margin: 2px 0;
}
.home-card__hint-link {
  color: #4338ca;
  text-decoration: none;
  font-weight: 600;
}
.home-card__hint-link:hover {
  text-decoration: underline;
}
.filter-toggle {
  margin-top: 0;
  display: inline-flex;
  align-items: center;
}
.filter-toggle__label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #0f172a;
}
.filter-toggle__switch {
  position: relative;
  width: 44px;
  height: 22px;
}
.filter-toggle__checkbox {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}
.filter-toggle__slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #d1d5db;
  border-radius: 22px;
  transition: background 0.2s ease;
}
.filter-toggle__slider::before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 2px;
  bottom: 2px;
  background-color: #fff;
  border-radius: 50%;
  transition: transform 0.2s ease;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.filter-toggle__checkbox:checked + .filter-toggle__slider {
  background-color: #22c55e;
}
.filter-toggle__checkbox:checked + .filter-toggle__slider::before {
  transform: translateX(22px);
}
.filter-toggle.is-loading .filter-toggle__slider::before {
  animation: filter-toggle-pulse 1s infinite ease-in-out;
}
@keyframes filter-toggle-pulse {
  0% { opacity: 1; }
  50% { opacity: 0.4; }
  100% { opacity: 1; }
}
.panel {
  background: #ffffff;
  border: 1px solid #d2d7e3;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
}
@media (min-width: 1500px) {
  .panel {
    padding: 32px;
  }
}
@media (max-width: 1100px) {
  .panel {
    padding: 20px;
  }
}
.panel__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
@media (min-width: 1600px) {
  .panel__meta {
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }
}
.meta-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px 16px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 100px;
  box-shadow: 0 8px 30px rgba(15, 23, 42, 0.08);
}
.meta-card__label {
  margin: 0;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #5f6c7b;
}
.meta-card__value {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #0f172a;
  font-feature-settings: "tnum" 1;
  word-break: break-word;
}
.sparkline { width: 160px; height: 32px; display: block; }
.sparkline polyline { stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.ui-table {
  width: 100%;
  border-collapse: collapse;
  border-radius: 12px;
  overflow: hidden;
  font-size: 0.95rem;
}
.table-wrapper {
  width: 100%;
  overflow-x: auto;
}
.table-wrapper::-webkit-scrollbar {
  height: 10px;
}
.table-wrapper::-webkit-scrollbar-thumb {
  background: #cbd5f5;
  border-radius: 999px;
}
.table-wrapper table {
  min-width: 960px;
}
.ui-table thead th {
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.75rem;
  text-align: left;
  padding: 0.75rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  color: #475569;
}
.ui-table tbody td {
  padding: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
  color: #0f172a;
  vertical-align: top;
}
.ui-table tbody tr:nth-child(even) {
  background: #fbfdff;
}
.ui-table tbody tr:last-child td {
  border-bottom: none;
}
@media (max-width: 1100px) {
  .ui-table thead th,
  .ui-table tbody td {
    padding: 0.6rem;
    font-size: 0.85rem;
  }
  .table-wrapper table {
    min-width: 760px;
  }
}
.pager {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 16px 0;
}
@media (min-width: 768px) {
  .pager {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}
.pager__info {
  margin: 0;
  font-size: 0.9rem;
  color: #475569;
  font-feature-settings: "tnum" 1;
}
.pager__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pager-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  border: 1px solid #cbd5f5;
  font-size: 0.85rem;
  font-weight: 600;
  background: #f8fafc;
  color: #312e81;
  text-decoration: none;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.pager-button:hover {
  background: #e0e7ff;
}
.pager-button--kind-first,
.pager-button--kind-last {
  background: #eef2ff;
  border-color: #c7d2fe;
  color: #3730a3;
}
.pager-button--kind-prev,
.pager-button--kind-next {
  background: #f0fdf4;
  border-color: #bbf7d0;
  color: #166534;
}
.pager-button--disabled,
.pager-button[aria-disabled="true"] {
  color: #94a3b8;
  background: #f1f5f9;
  border-color: #e2e8f0;
  cursor: not-allowed;
}
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  padding: 0.15rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}
.badge--muted { background: #e5e7eb; color: #4b5563; }
.badge--info { background: #dbeafe; color: #1d4ed8; }
.badge--success { background: #d1fae5; color: #065f46; }
.badge--accent { background: #ede9fe; color: #5b21b6; }
.badge--warn { background: #fef3c7; color: #92400e; }
.badge--danger { background: #fee2e2; color: #991b1b; }
.table-link {
  color: #2563eb;
  text-decoration: none;
}
.table-link:hover {
  text-decoration: underline;
}
`;
}


function createMetaCard(context, label, value, options = {}) {
  const card = new jsgui.div({ context, class: "meta-card" });
  const labelCtrl = new jsgui.p({ context, class: "meta-card__label" });
  labelCtrl.add(new StringControl({ context, text: label }));
  const valueCtrl = new jsgui.p({ context, class: "meta-card__value" });
  if (options.field) {
    valueCtrl.dom.attributes["data-meta-field"] = options.field;
  }
  if (value instanceof jsgui.Control) {
    valueCtrl.add(value);
  } else {
    valueCtrl.add(new StringControl({ context, text: value }));
  }
  card.add(labelCtrl);
  card.add(valueCtrl);
  return card;
}

function createHomeCard(context, card = {}) {
  if (!card || !card.title || !card.action || !card.action.href) return null;
  const container = new jsgui.div({ context, class: "home-card" });
  if (card.key) {
    container.dom.attributes["data-home-card"] = card.key;
    container.dom.attributes["data-home-card-key"] = card.key;
  }

  const headline = new jsgui.div({ context, class: "home-card__headline" });
  const title = new jsgui.h3({ context, class: "home-card__title" });
  title.add(new StringControl({ context, text: card.title }));
  headline.add(title);
  if (card.badge && card.badge.label) {
    const badge = new jsgui.span({ context, class: "badge home-card__badge" });
    const tone = typeof card.badge.tone === "string" && card.badge.tone.trim() ? card.badge.tone.trim() : null;
    if (tone) {
      badge.add_class(`badge--${tone}`);
      badge.dom.attributes["data-home-card-badge-tone"] = tone;
    }
    badge.dom.attributes["data-home-card-badge-label"] = card.badge.label;
    if (card.badge.title) {
      badge.dom.attributes.title = card.badge.title;
    }
    badge.add(new StringControl({ context, text: card.badge.label }));
    headline.add(badge);
  }
  container.add(headline);

  if (card.description) {
    const description = new jsgui.p({ context, class: "home-card__description" });
    description.add(new StringControl({ context, text: card.description }));
    container.add(description);
  }

  if (card.statLabel || card.statValue != null) {
    const stat = new jsgui.div({ context, class: "home-card__stat" });
    if (card.statLabel) {
      stat.add(new StringControl({ context, text: card.statLabel }));
    }
    const statValue = new jsgui.span({ context, class: "home-card__stat-value" });
    const appendStatValue = (target) => {
      if (card.statValue instanceof jsgui.Control) {
        target.add(card.statValue);
      } else {
        const valueText = card.statValue != null ? String(card.statValue) : "—";
        target.add(new StringControl({ context, text: valueText }));
      }
    };
    if (card.statHref) {
      const link = new jsgui.Control({ context, tagName: "a" });
      link.add_class("home-card__stat-link");
      link.dom.attributes.href = card.statHref;
      if (card.statTooltip) {
        link.dom.attributes.title = card.statTooltip;
      }
      appendStatValue(link);
      statValue.add(link);
    } else {
      appendStatValue(statValue);
    }
    stat.add(statValue);
    container.add(stat);
  }

  const hints = Array.isArray(card.hints) ? card.hints : null;
  if (hints && hints.length) {
    const hintList = new jsgui.ul({ context, class: "home-card__hints" });
    hints.forEach((hintEntry) => {
      const normalized = typeof hintEntry === "string" ? { text: hintEntry } : hintEntry;
      if (!normalized || !normalized.text) return;
      const hintItem = new jsgui.li({ context, class: "home-card__hint" });
      if (normalized.href) {
        const hintLink = new jsgui.Control({ context, tagName: "a" });
        hintLink.add_class("home-card__hint-link");
        hintLink.dom.attributes.href = normalized.href;
        if (normalized.title) {
          hintLink.dom.attributes.title = normalized.title;
        }
        hintLink.add(new StringControl({ context, text: normalized.text }));
        hintItem.add(hintLink);
      } else {
        hintItem.add(new StringControl({ context, text: normalized.text }));
      }
      hintList.add(hintItem);
    });
    container.add(hintList);
  }

  const action = new jsgui.Control({ context, tagName: "a" });
  action.add_class("home-card__action");
  action.dom.attributes.href = card.action.href;
  if (card.action.title) {
    action.dom.attributes.title = card.action.title;
  }
  action.add(new StringControl({ context, text: card.action.label || "Open" }));
  container.add(action);
  return container;
}


function createHomeGrid(context, cards) {
  if (!Array.isArray(cards) || cards.length === 0) return null;
  const entries = cards.filter((card) => card && card.title && card.action && card.action.href);
  if (!entries.length) return null;
  const grid = new jsgui.div({ context, class: "home-grid" });
  entries.forEach((card) => {
    const rendered = createHomeCard(context, card);
    if (rendered) {
      grid.add(rendered);
    }
  });
  return grid;
}

function appendContent(context, target, content) {
  if (!target || content == null) return;
  if (Array.isArray(content)) {
    content.forEach((entry) => appendContent(context, target, entry));
    return;
  }
  if (content instanceof jsgui.Control) {
    target.add(content);
    return;
  }
  if (typeof content === "function") {
    const produced = content({ context, target });
    if (produced && produced !== content) {
      appendContent(context, target, produced);
    }
    return;
  }
  const text = typeof content === "string" ? content : String(content);
  target.add(new StringControl({ context, text }));
}

function createDashboardSections(context, sections) {
  if (!Array.isArray(sections) || sections.length === 0) return null;
  const entries = sections.filter((section) => section && section.title);
  if (!entries.length) return null;
  const grid = new jsgui.div({ context, class: "dashboard-grid" });
  entries.forEach((section) => {
    const panel = new jsgui.div({ context, class: "dashboard-panel" });
    if (section.key) {
      panel.dom.attributes["data-dashboard-panel"] = section.key;
    }
    if (section.className) {
      String(section.className)
        .split(/\s+/)
        .filter(Boolean)
        .forEach((cls) => panel.add_class(cls));
    }
    const head = new jsgui.div({ context, class: "dashboard-panel__head" });
    const heading = new jsgui.h2({ context });
    heading.add(new StringControl({ context, text: section.title }));
    head.add(heading);
    if (section.meta || (Array.isArray(section.badges) && section.badges.length)) {
      const metaWrap = new jsgui.div({ context, class: "dashboard-panel__meta" });
      if (section.meta) {
        appendContent(context, metaWrap, section.meta);
      }
      if (Array.isArray(section.badges) && section.badges.length) {
        const badgeRow = new jsgui.div({ context, class: "status-badges" });
        section.badges.forEach((badgeEntry) => {
          const normalized = typeof badgeEntry === "string" ? { label: badgeEntry } : badgeEntry;
          if (!normalized || !normalized.label) return;
          const pill = new jsgui.span({ context, class: "status-pill" });
          if (normalized.tone) {
            pill.add_class(`status-pill--${normalized.tone}`);
          }
          if (normalized.title) {
            pill.dom.attributes.title = normalized.title;
          }
          pill.add(new StringControl({ context, text: normalized.label }));
          badgeRow.add(pill);
        });
        metaWrap.add(badgeRow);
      }
      head.add(metaWrap);
    }
    panel.add(head);
    const body = new jsgui.div({ context, class: "dashboard-panel__body" });
    if (section.bodyClassName) {
      String(section.bodyClassName)
        .split(/\s+/)
        .filter(Boolean)
        .forEach((cls) => body.add_class(cls));
    }
    let hasBodyContent = false;
    const addBodyContent = (content) => {
      if (content == null) return;
      appendContent(context, body, content);
      hasBodyContent = true;
    };
    if (typeof section.render === "function") {
      addBodyContent(section.render({ context, section }));
    }
    if (section.content) {
      addBodyContent(section.content);
    }
    if (Array.isArray(section.children) && section.children.length) {
      addBodyContent(section.children);
    }
    if (section.footer) {
      const footer = new jsgui.div({ context, class: "dashboard-panel__footer" });
      appendContent(context, footer, section.footer);
      body.add(footer);
      hasBodyContent = true;
    }
    if (hasBodyContent) {
      panel.add(body);
    }
    grid.add(panel);
  });
  return grid;
}

function createStyleTag(context, cssText) {
  const styleCtrl = new jsgui.Control({ context, tagName: "style" });
  styleCtrl.add(new StringControl({ context, text: cssText }));
  return styleCtrl;
}

function createPagerButton(context, { label, href, disabled, kind, position }) {
  const button = new PagerButtonControl({
    context,
    text: label,
    kind,
    disabled: disabled || !href,
    title: label,
    href
  });
  button.setHref(href);
  button.dom.attributes["data-pager-link"] = kind;
  if (position) {
    button.dom.attributes["data-pager-position"] = position;
  }
  return button;
}

function createPaginationNav(context, pagination, position = "primary") {
  if (!pagination) return null;
  const nav = new jsgui.Control({ context, tagName: "nav" });
  nav.add_class("pager");
  nav.dom.attributes["data-pager"] = position;
  const info = new jsgui.p({ context, class: "pager__info" });
  info.dom.attributes["data-pager-info"] = position;
  const { currentPage, totalPages, startRow, endRow, totalRows } = pagination;
  const startDisplay = totalRows === 0 ? 0 : startRow;
  const endDisplay = totalRows === 0 ? 0 : endRow;
  const summary = `Page ${currentPage} of ${totalPages} • Rows ${startDisplay}-${endDisplay} of ${totalRows}`;
  info.add(new StringControl({ context, text: summary }));
  const buttons = new jsgui.div({ context, class: "pager__buttons" });
  const buttonConfigs = [
    { kind: "first", label: "<< First", href: pagination.firstHref, disabled: currentPage === 1 },
    { kind: "prev", label: "< Previous", href: pagination.prevHref, disabled: currentPage === 1 },
    { kind: "next", label: "Next >", href: pagination.nextHref, disabled: currentPage === totalPages },
    { kind: "last", label: "Last >>", href: pagination.lastHref, disabled: currentPage === totalPages }
  ];
  buttonConfigs.forEach((config) => buttons.add(createPagerButton(context, { ...config, position })));
  nav.add(info);
  nav.add(buttons);
  return nav;
}

function createPrimaryNav(context, navLinks) {
  if (!Array.isArray(navLinks) || navLinks.length === 0) return null;
  const filtered = navLinks.filter((link) => link && link.label);
  if (!filtered.length) return null;
  const nav = new jsgui.Control({ context, tagName: "nav" });
  nav.add_class("primary-nav");
  filtered.forEach((link) => {
    const anchor = new jsgui.Control({ context, tagName: "a" });
    anchor.add_class("primary-nav__link");
    anchor.add(new StringControl({ context, text: link.label }));
    if (link.href) {
      anchor.dom.attributes.href = link.href;
    } else {
      anchor.dom.attributes["aria-disabled"] = "true";
    }
    if (link.active) {
      anchor.add_class("primary-nav__link--active");
    }
    nav.add(anchor);
  });
  return nav;
}

function createBreadcrumbsNav(context, crumbs) {
  if (!Array.isArray(crumbs) || crumbs.length === 0) return null;
  const items = crumbs.filter((crumb) => crumb && crumb.label);
  if (!items.length) return null;
  const nav = new jsgui.Control({ context, tagName: "nav" });
  nav.add_class("breadcrumbs");
  items.forEach((crumb, index) => {
    if (index > 0) {
      nav.add(new jsgui.span({ context, class: "breadcrumbs__sep", text: "/" }));
    }
    if (crumb.href) {
      const anchor = new jsgui.Control({ context, tagName: "a" });
      anchor.add_class("breadcrumbs__link");
      anchor.dom.attributes.href = crumb.href;
      anchor.add(new StringControl({ context, text: crumb.label }));
      nav.add(anchor);
    } else {
      const span = new jsgui.span({ context, class: "breadcrumbs__current", text: crumb.label });
      nav.add(span);
    }
  });
  return nav;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = resolveDbPath(args.db);
  const limit = Number.isFinite(args.limit) && args.limit > 0 ? Math.min(args.limit, 5000) : 1000;
  const title = args.title || "Crawler URL Snapshot";
  const db = openNewsDb(dbPath);
  let rawRows = [];
  let totals = null;
  let homeCards = [];
  try {
    rawRows = selectInitialUrls(db.db, { limit });
    totals = buildUrlTotals(db.db);
    homeCards = buildCliHomeCards(db.db, totals);
  } finally {
    try {
      db.close();
    } catch (_) {}
  }

  const columns = buildColumns();
  const rows = buildDisplayRows(rawRows);
  const projectRoot = findProjectRoot(__dirname);
  const relativeDb = path.relative(projectRoot, dbPath) || path.basename(dbPath);
  const meta = {
    rowCount: rows.length,
    limit,
    dbLabel: relativeDb,
    generatedAt: formatDateTime(new Date(), true),
    subtitle: `First ${rows.length} URLs from ${relativeDb}`
  };

  const html = renderHtml({ columns, rows, meta, title }, { homeCards });

  if (args.output) {
    const target = path.isAbsolute(args.output) ? args.output : path.resolve(process.cwd(), args.output);
    fs.writeFileSync(target, html, "utf8");
    console.error(`Saved HTML table to ${target}`);
  } else {
    process.stdout.write(html);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Failed to render URL table:", error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  resolveDbPath,
  buildColumns,
  buildDisplayRows,
  renderHtml,
  formatDateTime,
  buildIndexCell
};
