"use strict";

const fs = require("fs");
const path = require("path");
const net = require("net");
const { spawnSync } = require("child_process");

const { openNewsDb } = require('../../../data/db/dbAccess");
const { findProjectRoot } = require('../utils/serverStartupCheckproject-root");
const { renderHtml, resolveDbPath } = require("../../render-url-table");
const { DEFAULT_PAGE_SIZE, renderUrlListingView, DATA_VIEWS } = require("../dataExplorerServer");
const { buildNavLinks } = require("../navigation");
const { getDefaultTheme } = require("../services/themeService");

function createRequest(path = "/urls") {
  return { baseUrl: "", path, query: {} };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : null;
      server.close(() => {
        if (!port) {
          reject(new Error("Unable to allocate free port"));
          return;
        }
        resolve(port);
      });
    });
  });
}

function assertServerStarts({ port, dbPath }) {
  const serverPath = path.join(__dirname, "..", "dataExplorerServer.js");
  const args = [
    serverPath,
    "--check",
    "--port",
    String(port),
    "--host",
    "127.0.0.1",
    "--db",
    dbPath
  ];

  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    const stdout = (result.stdout || "").trim();
    throw new Error(
      `Data Explorer --check failed (exit ${result.status})\n${stderr || stdout || "(no output)"}`
    );
  }
}

async function run() {
  const dbPath = resolveDbPath();
  const projectRoot = findProjectRoot(__dirname);
  const relativeDb = path.relative(projectRoot, dbPath) || path.basename(dbPath);
  const dbAccess = openNewsDb(dbPath);
  try {
    // Render URL Listing
    const listingPayload = renderUrlListingView({
      req: createRequest("/urls"),
      db: dbAccess.db,
      relativeDb,
      pageSize: DEFAULT_PAGE_SIZE,
      now: new Date()
    });
    const listingHtml = renderHtml(
      {
        columns: listingPayload.columns,
        rows: listingPayload.rows,
        meta: listingPayload.meta,
        title: listingPayload.title
      },
      {
        navLinks: buildNavLinks("urls", DATA_VIEWS),
        themeConfig: getDefaultTheme(dbAccess.db).config,
        filterOptions: listingPayload.renderOptions.filterOptions,
        listingState: listingPayload.renderOptions.listingState,
        clientScriptPath: "/assets/ui-client.js"
      }
    );
    const listingTarget = path.join(process.cwd(), "data-explorer.urls.check.html");
    fs.writeFileSync(listingTarget, listingHtml, "utf8");
    console.log(`Saved Data Explorer Listing preview to ${listingTarget}`);

    // Render Dashboard
    const dashboardView = DATA_VIEWS.find(v => v.key === "home");
    if (dashboardView) {
      const dashboardPayload = dashboardView.render({
        req: createRequest("/"),
        db: dbAccess.db,
        relativeDb,
        pageSize: DEFAULT_PAGE_SIZE,
        now: new Date()
      });
      const dashboardHtml = renderHtml(
        {
          columns: dashboardPayload.columns,
          rows: dashboardPayload.rows,
          meta: dashboardPayload.meta,
          title: dashboardPayload.title
        },
        {
          navLinks: buildNavLinks("home", DATA_VIEWS),
          themeConfig: getDefaultTheme(dbAccess.db).config,
          homeCards: dashboardPayload.renderOptions.homeCards,
          layoutMode: dashboardPayload.renderOptions.layoutMode,
          hideListingPanel: dashboardPayload.renderOptions.hideListingPanel,
          includeDashboardScaffold: dashboardPayload.renderOptions.includeDashboardScaffold,
          dashboardSections: dashboardPayload.renderOptions.dashboardSections,
          clientScriptPath: "/assets/ui-client.js"
        }
      );
      const dashboardTarget = path.join(process.cwd(), "data-explorer.dashboard.check.html");
      fs.writeFileSync(dashboardTarget, dashboardHtml, "utf8");
      console.log(`Saved Data Explorer Dashboard preview to ${dashboardTarget}`);
    }

    // Render Decisions view
    const decisionsView = DATA_VIEWS.find(v => v.key === "decisions");
    if (decisionsView) {
      const decisionsPayload = decisionsView.render({
        req: createRequest("/decisions"),
        db: dbAccess.db,
        newsDb: dbAccess,
        relativeDb,
        pageSize: DEFAULT_PAGE_SIZE,
        now: new Date()
      });
      const decisionsHtml = renderHtml(
        {
          columns: decisionsPayload.columns,
          rows: decisionsPayload.rows,
          meta: decisionsPayload.meta,
          title: decisionsPayload.title
        },
        {
          navLinks: buildNavLinks("decisions", DATA_VIEWS),
          themeConfig: getDefaultTheme(dbAccess.db).config,
          clientScriptPath: "/assets/ui-client.js"
        }
      );
      const decisionsTarget = path.join(process.cwd(), "data-explorer.decisions.check.html");
      fs.writeFileSync(decisionsTarget, decisionsHtml, "utf8");
      console.log(`Saved Data Explorer Decisions preview to ${decisionsTarget}`);
    }

  } finally {
    dbAccess.close();
  }

  const port = await getFreePort();
  assertServerStarts({ port, dbPath });
  console.log(`Verified Data Explorer server --check on port ${port}`);
}

if (require.main === module) {
  run().catch((error) => {
    console.error("Failed to build Data Explorer preview:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { run };
