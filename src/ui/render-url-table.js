"use strict";

const fs = require("fs");
const path = require("path");
const jsgui = require("jsgui3-html");

const { openNewsDb } = require("../db/dbAccess");
const { findProjectRoot } = require("../utils/project-root");
const { selectInitialUrls } = require("../db/sqlite/v1/queries/ui/urlListingNormalized");
const { TableControl } = require("./controls/Table");

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

function formatDateTime(value, includeSeconds = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  const base = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const time = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}${includeSeconds ? `:${pad(date.getUTCSeconds())}` : ""}`;
  return `${base} ${time} UTC`;
}

function formatStatus(code) {
  if (code == null) return { text: "—", classNames: "badge badge--muted" };
  let variant = "info";
  if (code >= 200 && code < 300) variant = "success";
  else if (code >= 300 && code < 400) variant = "accent";
  else if (code >= 400 && code < 500) variant = "warn";
  else if (code >= 500) variant = "danger";
  return { text: String(code), classNames: `badge badge--${variant}` };
}

function buildDisplayRows(rows) {
  return rows.map((row, index) => ({
    index: { text: String(index + 1), classNames: "is-index" },
    url: { text: row.url, title: row.url, classNames: "is-url" },
    host: row.host || "—",
    createdAt: formatDateTime(row.createdAt),
    lastSeenAt: formatDateTime(row.lastSeenAt),
    lastFetchAt: formatDateTime(row.lastFetchAt),
    status: formatStatus(row.httpStatus)
  }));
}

function buildColumns() {
  return [
    { key: "index", label: "#", align: "right", cellClass: "is-index" },
    { key: "url", label: "URL", cellClass: "is-url" },
    { key: "host", label: "Host", cellClass: "is-host" },
    { key: "createdAt", label: "Created", cellClass: "is-timestamp" },
    { key: "lastSeenAt", label: "Last Seen", cellClass: "is-timestamp" },
    { key: "lastFetchAt", label: "Last Fetch", cellClass: "is-timestamp" },
    { key: "status", label: "HTTP", align: "center" }
  ];
}

function buildCss() {
  return `:root {
  color-scheme: light dark;
  font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
  background-color: #eef2ff;
}
body {
  margin: 0;
  background: radial-gradient(circle at top, #f5f7ff 0%, #e6ebff 45%, #fdfdff 100%);
  color: #1f2430;
}
.page-shell {
  width: min(calc(100vw - 32px), 2200px);
  margin: 0;
  padding: 20px 20px 32px;
  box-sizing: border-box;
}
@media (min-width: 1280px) {
  .page-shell.page-shell--offset {
    margin-left: 32px;
    margin-right: auto;
    width: min(calc(100vw - 96px), 2200px);
    padding-right: 72px;
    padding-left: 12px;
  }
}
.page-shell__header {
  margin-bottom: 24px;
}
.page-shell__header h1 {
  margin: 0 0 0.25rem;
  font-size: 2rem;
  letter-spacing: -0.02em;
}
.page-shell__subtitle {
  margin: 0;
  color: #5c637a;
}
.panel {
  background: rgba(255, 255, 255, 0.92);
  border-radius: 20px;
  padding: 20px 28px 24px;
  box-shadow: 0 25px 50px rgba(15, 23, 42, 0.15);
  backdrop-filter: blur(16px);
}
.panel__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.meta-card {
  border: 1px solid rgba(99, 102, 241, 0.15);
  border-radius: 14px;
  padding: 12px 16px;
  background: rgba(99, 102, 241, 0.05);
}
.meta-card__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6b7280;
  margin: 0 0 4px;
}
.meta-card__value {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 600;
}
.ui-table {
  width: 100%;
  border-collapse: collapse;
  border-radius: 16px;
  overflow: hidden;
}
.ui-table thead {
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.2), rgba(79, 70, 229, 0.2));
}
.ui-table__cell {
  padding: 0.65rem 0.85rem;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  font-size: 0.92rem;
}
.ui-table__cell--header {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #273043;
  font-weight: 600;
}
.ui-table__row--striped .ui-table__cell {
  background-color: rgba(99, 102, 241, 0.03);
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
  min-width: 420px;
  width: 60%;
  word-break: break-all;
}
.is-host {
  color: #475467;
}
.is-index {
  font-weight: 600;
  color: #6366f1;
}
.is-metric {
  font-variant-numeric: tabular-nums;
}
.is-timestamp {
  min-width: 150px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.badge--muted { background: #e5e7eb; color: #4b5563; }
.badge--info { background: rgba(59, 130, 246, 0.15); color: #1d4ed8; }
.badge--success { background: rgba(16, 185, 129, 0.18); color: #065f46; }
.badge--accent { background: rgba(99, 102, 241, 0.18); color: #3730a3; }
.badge--warn { background: rgba(251, 191, 36, 0.2); color: #92400e; }
.badge--danger { background: rgba(248, 113, 113, 0.2); color: #991b1b; }
`;
}

function createMetaCard(context, label, value) {
  const card = new jsgui.div({ context, class: "meta-card" });
  const labelCtrl = new jsgui.p({ context, class: "meta-card__label" });
  labelCtrl.add(new StringControl({ context, text: label }));
  const valueCtrl = new jsgui.p({ context, class: "meta-card__value" });
  valueCtrl.add(new StringControl({ context, text: value }));
  card.add(labelCtrl);
  card.add(valueCtrl);
  return card;
}

function createStyleTag(context, cssText) {
  const styleCtrl = new jsgui.Control({ context, tagName: "style" });
  styleCtrl.add(new StringControl({ context, text: cssText }));
  return styleCtrl;
}

function renderHtml({ columns, rows, meta, title }) {
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
  header.add(new jsgui.h1({ context, text: title }));
  header.add(new jsgui.p({ context, class: "page-shell__subtitle", text: meta.subtitle }));

  const panel = new jsgui.Control({ context, tagName: "section" });
  panel.add_class("panel");
  const metaGrid = new jsgui.div({ context, class: "panel__meta" });
  metaGrid.add(createMetaCard(context, "Rows Rendered", meta.rowCount.toLocaleString("en-US")));
  metaGrid.add(createMetaCard(context, "Requested Limit", meta.limit.toLocaleString("en-US")));
  metaGrid.add(createMetaCard(context, "Database", meta.dbLabel));
  metaGrid.add(createMetaCard(context, "Generated", meta.generatedAt));

  const table = new TableControl({ context, columns, rows });

  panel.add(metaGrid);
  panel.add(table);
  shell.add(header);
  shell.add(panel);
  body.add(shell);

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
  renderHtml
};
