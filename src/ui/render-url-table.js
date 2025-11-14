"use strict";

const fs = require("fs");
const path = require("path");
const jsgui = require("jsgui3-html");

const { openNewsDb } = require("../db/dbAccess");
const { findProjectRoot } = require("../utils/project-root");
const { selectInitialUrls } = require("../db/sqlite/v1/queries/ui/urlListingNormalized");
const {
  UrlListingTableControl,
  buildColumns,
  buildDisplayRows,
  buildIndexCell,
  formatDateTime
} = require("./controls/UrlListingTable");
const { PagerButtonControl } = require("./controls/PagerButton");
const { SparklineControl } = require("./controls");

const StringControl = jsgui.String_Control;

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


function buildCss() {
  return `:root {
  font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
  background-color: #f5f5f5;
  color: #1f2933;
}
body {
  margin: 0;
  background-color: #f5f5f5;
  color: #1f2933;
}
.page-shell {
  box-sizing: border-box;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 16px;
}
.page-shell.page-shell--offset {
  width: 100%;
  max-width: 1280px;
}
.page-shell__header {
  margin-bottom: 16px;
}
.page-shell__header h1 {
  margin: 0 0 4px;
  font-size: 1.75rem;
}
.page-shell__subtitle {
  margin: 0;
  color: #4a5568;
}
.primary-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 16px;
  padding: 0;
}
.primary-nav__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem 0.85rem;
  border-radius: 20px;
  border: 1px solid transparent;
  font-size: 0.85rem;
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
.panel {
  background: #ffffff;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  padding: 20px;
}
.panel__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.meta-card {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 10px 12px;
  background: #fafafa;
}
.meta-card__label {
  margin: 0 0 4px;
  font-size: 0.8rem;
  text-transform: uppercase;
  color: #5f6c7b;
}
.meta-card__value {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.sparkline { width: 160px; height: 32px; display: block; }
.sparkline polyline { stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.ui-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: auto;
  border: 1px solid #d0d7de;
}
.ui-table thead {
  background: #f0f4f8;
}
.ui-table__cell {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.9rem;
}
.ui-table__cell--header {
  text-transform: uppercase;
  font-size: 0.78rem;
  letter-spacing: 0.05em;
  color: #4a5568;
  font-weight: 600;
}
.ui-table__row--striped .ui-table__cell {
  background-color: #fafafa;
}
.ui-table__cell--right {
  text-align: right;
}
.ui-table__cell--center {
  text-align: center;
}
.is-url {
  font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
  font-size: 0.82rem;
  max-width: 100%;
  word-break: break-word;
}
.is-id {
  font-variant-numeric: tabular-nums;
  color: #475569;
  min-width: 60px;
}
.is-host {
  color: #374151;
}
.is-index {
  font-weight: 600;
  color: #1f2933;
}
.is-metric,
.is-timestamp {
  font-variant-numeric: tabular-nums;
}
.is-timestamp {
  min-width: 150px;
  white-space: nowrap;
}
.pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 16px 0;
}
.pager__info {
  margin: 0;
  font-size: 0.9rem;
  color: #4a5568;
}
.pager__buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.pager-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 120px;
  padding: 0.45rem 0.9rem;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  font-size: 0.85rem;
  font-weight: 600;
  color: #1f2933;
  background: #f8fafc;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.pager-button:hover:not(.pager-button--disabled) {
  background: #e2e8f0;
}
.pager-button--kind-first,
.pager-button--kind-last {
  background: #edf2ff;
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

function createMetaCard(context, label, value) {
  const card = new jsgui.div({ context, class: "meta-card" });
  const labelCtrl = new jsgui.p({ context, class: "meta-card__label" });
  labelCtrl.add(new StringControl({ context, text: label }));
  const valueCtrl = new jsgui.p({ context, class: "meta-card__value" });
  if (value instanceof jsgui.Control) {
    valueCtrl.add(value);
  } else {
    valueCtrl.add(new StringControl({ context, text: value }));
  }
  card.add(labelCtrl);
  card.add(valueCtrl);
  return card;
}

function createStyleTag(context, cssText) {
  const styleCtrl = new jsgui.Control({ context, tagName: "style" });
  styleCtrl.add(new StringControl({ context, text: cssText }));
  return styleCtrl;
}

function createPagerButton(context, { label, href, disabled, kind }) {
  const button = new PagerButtonControl({
    context,
    text: label,
    kind,
    disabled: disabled || !href,
    title: label,
    href
  });
  button.setHref(href);
  return button;
}

function createPaginationNav(context, pagination) {
  if (!pagination) return null;
  const nav = new jsgui.Control({ context, tagName: "nav" });
  nav.add_class("pager");
  const info = new jsgui.p({ context, class: "pager__info" });
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
  buttonConfigs.forEach((config) => buttons.add(createPagerButton(context, config)));
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

function renderHtml({ columns, rows, meta, title }, options = {}) {
  const clientScriptPath = options.clientScriptPath;
  const bindingPluginEnabled = options.bindingPlugin !== false;
  const navLinks = Array.isArray(options.navLinks) ? options.navLinks : null;
  const breadcrumbs = Array.isArray(options.breadcrumbs) ? options.breadcrumbs : null;
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
  const heading = new jsgui.h1({ context });
  if (title) {
    heading.add(new StringControl({ context, text: title }));
  }
  header.add(heading);
  const subtitle = new jsgui.p({ context, class: "page-shell__subtitle" });
  if (meta && meta.subtitle) {
    subtitle.add(new StringControl({ context, text: meta.subtitle }));
  }
  header.add(subtitle);

  const panel = new jsgui.Control({ context, tagName: "section" });
  panel.add_class("panel");
  const metaGrid = new jsgui.div({ context, class: "panel__meta" });
  metaGrid.add(createMetaCard(context, "Rows Rendered", meta.rowCount.toLocaleString("en-US")));
  metaGrid.add(createMetaCard(context, "Requested Limit", meta.limit.toLocaleString("en-US")));
  metaGrid.add(createMetaCard(context, "Database", meta.dbLabel));
  metaGrid.add(createMetaCard(context, "Generated", meta.generatedAt));
  // Allow additional custom cards provided by routes (e.g., sparkline control)
  if (Array.isArray(meta.extraCards)) {
    meta.extraCards.forEach((card) => {
      if (card && card.label) {
        const content = card.control || card.value || (Array.isArray(card.series) ? new SparklineControl({ context, series: card.series, width: card.width || 240, height: card.height || 36 }) : "—");
        metaGrid.add(createMetaCard(context, card.label, content));
      }
    });
  }

  const table = new UrlListingTableControl({ context, columns, rows });
  const paginationNavTop = meta.pagination ? createPaginationNav(context, meta.pagination) : null;
  const paginationNavBottom = meta.pagination ? createPaginationNav(context, meta.pagination) : null;

  panel.add(metaGrid);
  if (paginationNavTop) panel.add(paginationNavTop);
  panel.add(table);
  if (paginationNavBottom) panel.add(paginationNavBottom);
  shell.add(header);
  const primaryNav = navLinks ? createPrimaryNav(context, navLinks) : null;
  if (primaryNav) shell.add(primaryNav);
  shell.add(panel);
  body.add(shell);

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = resolveDbPath(args.db);
  const limit = Number.isFinite(args.limit) && args.limit > 0 ? Math.min(args.limit, 5000) : 1000;
  const title = args.title || "Crawler URL Snapshot";
  const db = openNewsDb(dbPath);
  let rawRows = [];
  try {
    rawRows = selectInitialUrls(db.db, { limit });
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

  const html = renderHtml({ columns, rows, meta, title });

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
