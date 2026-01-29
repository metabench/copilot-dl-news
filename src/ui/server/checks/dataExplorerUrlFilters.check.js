"use strict";

const fs = require("fs");
const path = require("path");

const { openNewsDb } = require('../../../data/db/dbAccess");
const { findProjectRoot } = require('../../../shared/utils/project-root');
const { renderHtml, resolveDbPath } = require("../../render-url-table");
const { DEFAULT_PAGE_SIZE, renderUrlListingView, DATA_VIEWS } = require("../dataExplorerServer");
const { buildNavLinks } = require("../navigation");

function createRequest({ path = "/urls", query = {} } = {}) {
  return { baseUrl: "", path, query };
}

function renderVariant(dbAccess, { relativeDb, query, label }) {
  const start = process.hrtime.bigint();
  const payload = renderUrlListingView({
    req: createRequest({ path: "/urls", query }),
    db: dbAccess.db,
    relativeDb,
    pageSize: DEFAULT_PAGE_SIZE,
    now: new Date()
  });
  const html = renderHtml(
    {
      columns: payload.columns,
      rows: payload.rows,
      meta: payload.meta,
      title: payload.title
    },
    {
      navLinks: buildNavLinks("urls", DATA_VIEWS),
      filterOptions: payload.renderOptions.filterOptions,
      listingState: payload.renderOptions.listingState,
      clientScriptPath: "/assets/ui-client.js"
    }
  );
  const elapsedMs = Number((process.hrtime.bigint() - start) / 1000000n);
  return { label, query, elapsedMs, html, rowCount: payload.rows.length, totalRows: payload.meta?.pagination?.totalRows ?? null };
}

function run() {
  const dbPath = resolveDbPath();
  const projectRoot = findProjectRoot(__dirname);
  const relativeDb = path.relative(projectRoot, dbPath) || path.basename(dbPath);
  const dbAccess = openNewsDb(dbPath);

  try {
    const variants = [
      { label: "default", query: {} },
      { label: "hasFetches", query: { hasFetches: "1" } },
      { label: "host_example.com", query: { host: "example.com" } },
      { label: "host_example.com_hasFetches", query: { host: "example.com", hasFetches: "1" } }
    ].map((spec) => renderVariant(dbAccess, { relativeDb, ...spec }));

    const outDir = process.cwd();
    const summary = variants.map(({ html, ...rest }) => rest);

    variants.forEach((variant) => {
      const target = path.join(outDir, `data-explorer.urls.${variant.label}.check.html`);
      fs.writeFileSync(target, variant.html, "utf8");
      console.log(`Saved Data Explorer URL variant to ${target}`);
    });

    const summaryTarget = path.join(outDir, "data-explorer.urls.filters.check.json");
    fs.writeFileSync(summaryTarget, JSON.stringify({ relativeDb, variants: summary }, null, 2), "utf8");
    console.log(`Saved Data Explorer URL filter summary to ${summaryTarget}`);
  } finally {
    dbAccess.close();
  }
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error("Failed to build Data Explorer URL filter previews:", error.message);
    process.exitCode = 1;
  }
}

module.exports = { run };
