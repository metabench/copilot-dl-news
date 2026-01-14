"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { openNewsDb } = require('../../../../data/db/dbAccess");
const { findProjectRoot } = require('../../utils/serverStartupCheckproject-root");
const { renderHtml, resolveDbPath } = require("../../../render-url-table");
const { buildNavLinks } = require("../../navigation");
const { DATA_VIEWS } = require("../../dataExplorerServer");
const { listThemes, getDefaultTheme } = require("../../services/themeService");
const { ThemeEditorControl } = require("../../../controls/ThemeEditorControl");

function run() {
  const dbPath = resolveDbPath();
  const projectRoot = findProjectRoot(__dirname);
  const relativeDb = path.relative(projectRoot, dbPath) || path.basename(dbPath);
  const dbAccess = openNewsDb(dbPath);

  try {
    const themes = listThemes(dbAccess.db);
    const defaultTheme = getDefaultTheme(dbAccess.db);

    const html = renderHtml(
      {
        columns: [],
        rows: [],
        meta: {
          rowCount: themes.length,
          limit: themes.length,
          dbLabel: relativeDb,
          generatedAt: new Date().toISOString(),
          subtitle: "Theme editor SSR check"
        },
        title: "Theme Editor"
      },
      {
        navLinks: buildNavLinks("theme", DATA_VIEWS),
        themeConfig: defaultTheme.config,
        layoutMode: "single-control",
        mainControlFactory: (context) => new ThemeEditorControl({ context, themes, activeTheme: defaultTheme }),
        clientScriptPath: "/assets/ui-client.js"
      }
    );

    assert(html.includes("data-theme-editor"), "should render theme editor root");
    assert(html.includes("Theme Editor"), "should render title");
    assert(html.includes("data-theme-json"), "should render config textarea");

    const target = path.join(process.cwd(), "data-explorer.theme-editor.check.html");
    fs.writeFileSync(target, html, "utf8");
    console.log(`Saved Theme Editor preview to ${target}`);
    console.log("✓ Theme Editor check passed");
  } finally {
    dbAccess.close();
  }
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error("Theme Editor check failed:", error.message);
    process.exitCode = 1;
  }
}

module.exports = { run };
