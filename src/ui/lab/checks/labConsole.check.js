"use strict";

/**
 * Check: Lab Console UI
 * Verifies that the lab console renders experiment cards from manifest.
 * Run: node src/ui/lab/checks/labConsole.check.js
 */

const jsgui = require("jsgui3-html");
const { LabConsoleControl } = require("../LabConsoleControl");
const manifest = require("../manifest.json");

const context = new jsgui.Page_Context();
const consoleCtrl = new LabConsoleControl({ context, manifest });

const html = consoleCtrl.all_html_render();

const hasCards = html.includes("lab-card");
const hasCount = (html.match(/lab-card/g) || []).length >= manifest.length;
const hasActions = html.includes("🔍") && html.includes("🧪") && html.includes("🛠️");

if (hasCards && hasCount && hasActions) {
  console.log("✅ Lab console rendered", manifest.length, "experiments");
  process.exit(0);
}

console.error("❌ Lab console missing expected output", { hasCards, hasCount, hasActions });
process.exit(1);
