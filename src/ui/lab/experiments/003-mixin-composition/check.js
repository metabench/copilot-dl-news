"use strict";

/**
 * Lab Check: Mixin Composition (server-path safety)
 * Run: node src/ui/lab/experiments/003-mixin-composition/check.js
 */

const jsgui = require("jsgui3-html");
const dragable = require("jsgui3-html/control_mixins/dragable");
const resizable = require("jsgui3-html/control_mixins/resizable");

const context = new jsgui.Page_Context();
context.body = () => ({ on() {}, off() {} });
const ctrl = new jsgui.Control({ context, tagName: "div", __type_name: "mixin_host" });
ctrl.size = [120, 90];
ctrl.pos = [0, 0];
ctrl.ta = new Float32Array(9);
ctrl.ctrl_relative = ctrl; // allow resizable handle insertion
ctrl.bcr = () => [[0, 0], [ctrl.size[0], ctrl.size[1]], [ctrl.size[0], ctrl.size[1]]];
ctrl.view = ctrl.view || {};
ctrl.view.data = ctrl.view.data || {};
ctrl.view.data.model = ctrl.view.data.model || {};
const mixinStore = [];
ctrl.view.data.model.mixins = {
  silent: false,
  push(v) { mixinStore.push(v); },
  each(fn) { mixinStore.forEach(fn); }
};

const results = [];
const log = (label, pass, detail) => {
  const status = pass ? "✅" : "❌";
  results.push({ label, pass, detail });
  console.log(`${status} ${label}${detail ? " — " + detail : ""}`);
};

// Apply mixins (server path: dom.el absent by design)
try {
  dragable(ctrl, { mode: "translate" });
  resizable(ctrl, { resize_mode: "br_handle" });
  log("Mixins applied without throw", true);
} catch (err) {
  log("Mixins applied without throw", false, err.message);
}

// Inspect mixin metadata
const mixinsRaw = ctrl.view?.data?.model?.mixins;
const mixinArr = Array.isArray(mixinsRaw) ? mixinsRaw : (mixinsRaw?.each ? mixinStore : []);
const mixinNames = mixinArr.map(m => m.name || m);
log("dragable recorded in mixins", mixinNames.includes("dragable"), `mixins=${JSON.stringify(mixinNames)}`);

// Ensure render still works after mixins
try {
  const html = ctrl.all_html_render();
  log("Control renders after mixins", typeof html === "string" && html.includes("data-jsgui-id"), html.slice(0, 80) + "...");
} catch (err) {
  log("Control renders after mixins", false, err.message);
}

// Summary
const failed = results.filter(r => !r.pass);
console.log("\nSummary:", `${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  failed.forEach(f => console.log(" - FAIL", f.label, f.detail ? `(${f.detail})` : ""));
  process.exitCode = 1;
}
