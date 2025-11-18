"use strict";

const fs = require("fs");
const path = require("path");

const { collectDiagramData } = require(path.join(__dirname, "../../../..", "tools", "dev", "diagram-data"));
const { renderDiagramAtlasHtml } = require("../diagramAtlasServer");

function run() {
  const payload = collectDiagramData();
  const html = renderDiagramAtlasHtml(payload, { title: "Diagram Atlas (check)" });
  const target = path.join(process.cwd(), "diagram-atlas.check.html");
  fs.writeFileSync(target, html, "utf8");
  console.log(`Saved diagram atlas preview to ${target}`);
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error("Failed to build diagram atlas preview:", error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  run
};
