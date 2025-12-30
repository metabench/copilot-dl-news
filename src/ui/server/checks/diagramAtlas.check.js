"use strict";

const fs = require("fs");
const path = require("path");

const { collectDiagramData } = require(path.join(__dirname, "../../../..", "tools", "dev", "diagram-data"));
const { renderDiagramAtlasHtml } = require("../diagramAtlasServer");

function run() {
  // Keep `npm run diagram:check` fast and deterministic: we only need enough data
  // to render the atlas shell and confirm the renderer + DB schema summary work.
  // The full interactive server can still collect richer code/feature metrics.
  const payload = collectDiagramData({
    sections: new Set(["db"])
  });
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
