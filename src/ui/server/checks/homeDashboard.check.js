"use strict";

const fs = require("fs");
const path = require("path");

const { renderHtml, resolveDbPath } = require("../../render-url-table");
const { DATA_VIEWS } = require("../dataExplorerServer");
const { openNewsDb } = require('../../../data/db/dbAccess");
const { findProjectRoot } = require('../../../shared/utils/project-root');
const { buildNavLinks } = require("../navigation");

function createHomePayload() {
  const dbPath = resolveDbPath();
  const projectRoot = findProjectRoot(__dirname);
  const relativeDb = path.relative(projectRoot, dbPath) || path.basename(dbPath);
  const dbAccess = openNewsDb(dbPath);
  try {
    const homeView = DATA_VIEWS.find((view) => view && view.key === "home");
    if (!homeView || typeof homeView.render !== "function") {
      throw new Error("Home view definition not found in DATA_VIEWS");
    }
    const now = new Date();
    return {
      payload: homeView.render({ db: dbAccess.db, relativeDb, now, req: { baseUrl: "", path: "/" } }),
      relativeDb
    };
  } finally {
    try {
      dbAccess.close();
    } catch (_) { }
  }
}

function run() {
  const { payload } = createHomePayload();
  const html = renderHtml(
    {
      columns: payload.columns,
      rows: payload.rows,
      meta: payload.meta,
      title: payload.title
    },
    {
      ...payload.renderOptions,
      navLinks: buildNavLinks("home", DATA_VIEWS)
    }
  );
  const target = path.join(process.cwd(), "tmp", "home.html");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html, "utf8");
  console.log(`Saved Home dashboard preview to ${target}`);
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error("Failed to build Home dashboard preview:", error.message);
    process.exitCode = 1;
  }
}

module.exports = { run };
