"use strict";

const fs = require("fs");
const path = require("path");

const { openNewsDb } = require("../../../db/dbAccess");
const { findProjectRoot } = require("../../../utils/project-root");
const { renderHtml, resolveDbPath } = require("../../render-url-table");
const { DEFAULT_PAGE_SIZE, renderUrlListingView, DATA_VIEWS } = require("../dataExplorerServer");
const { buildNavLinks } = require("../navigation");

function createRequest() {
  return { baseUrl: "", path: "/urls", query: {} };
}

function run() {
  const dbPath = resolveDbPath();
  const projectRoot = findProjectRoot(__dirname);
  const relativeDb = path.relative(projectRoot, dbPath) || path.basename(dbPath);
  const dbAccess = openNewsDb(dbPath);
  try {
    const payload = renderUrlListingView({
      req: createRequest(),
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
        filterOptions: payload.filterOptions,
        homeCards: payload.homeCards
      }
    );
    const target = path.join(process.cwd(), "data-explorer.urls.check.html");
    fs.writeFileSync(target, html, "utf8");
    console.log(`Saved Data Explorer preview to ${target}`);
  } finally {
    dbAccess.close();
  }
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error("Failed to build Data Explorer preview:", error.message);
    process.exitCode = 1;
  }
}

module.exports = { run };
