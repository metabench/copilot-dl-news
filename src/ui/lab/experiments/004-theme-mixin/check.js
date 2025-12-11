"use strict";

/**
 * Lab Check: Theme Mixin (server-path)
 * Run: node src/ui/lab/experiments/004-theme-mixin/check.js
 */

const jsgui = require("jsgui3-html");
const { theme_mixin } = require("../../mixins/theme.mixin");

const context = new jsgui.Page_Context();
const ctrl = new jsgui.Control({ context, tagName: "section", __type_name: "theme_host" });
ctrl.view = ctrl.view || {};
ctrl.view.data = ctrl.view.data || {};
ctrl.view.data.model = ctrl.view.data.model || {};

const results = [];
const log = (label, pass, detail) => {
  const status = pass ? "✅" : "❌";
  results.push({ label, pass, detail });
  console.log(`${status} ${label}${detail ? " — " + detail : ""}`);
};

try {
  theme_mixin(ctrl, { theme: "night" });
  log("theme_mixin applied without throw", true);
} catch (err) {
  log("theme_mixin applied without throw", false, err.message);
}

const hasClass = (ctrl.dom?.attributes?.class || "").includes("theme-night");
const hasData = ctrl.dom?.attributes?.["data-theme"] === "night";
log("theme markers attached", hasClass && hasData, `attrs=${JSON.stringify(ctrl.dom?.attributes)}`);

const mixins = ctrl.view?.data?.model?.mixins || [];
const mixinArr = Array.isArray(mixins) ? mixins : mixins._store || [];
const mixinNames = mixinArr.map(m => m.name || m);
log("mixin recorded", mixinNames.includes("theme"), `mixins=${JSON.stringify(mixinNames)}`);

try {
  const html = ctrl.all_html_render();
  const ok = typeof html === "string" && html.includes("data-jsgui-id");
  log("control renders after mixin", ok, html.slice(0, 80) + "...");
} catch (err) {
  log("control renders after mixin", false, err.message);
}

const failed = results.filter(r => !r.pass);
console.log("\nSummary:", `${results.length - failed.length}/${results.length} passed`);
failed.forEach(f => console.log(" - FAIL", f.label, f.detail ? `(${f.detail})` : ""));
if (failed.length) process.exitCode = 1;
