"use strict";

/**
 * Art Playground Check Script
 * 
 * Rapid verification that Art Playground renders correctly and
 * all controls compose properly without running the full server.
 * 
 * Usage: node src/ui/server/artPlayground/checks/art-playground.check.js
 */

const jsgui = require("jsgui3-html");
const { ArtPlaygroundAppControl } = require("../isomorphic/controls");

// ============================================
// Test Infrastructure
// ============================================

let passed = 0;
let failed = 0;

function check(condition, name) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    failed++;
  }
  return condition;
}

function section(name) {
  console.log(`\n📋 ${name}`);
  console.log("─".repeat(50));
}

// ============================================
// Tests
// ============================================

section("1. Basic Rendering");
{
  const context = new jsgui.Page_Context();
  const app = new ArtPlaygroundAppControl({ context });
  const html = app.all_html_render();
  
  check(html.length > 1000, "HTML output is substantial (>1KB)");
  check(html.includes("art-app"), "Has art-app class");
  check(html.includes("ap-cover"), "Has ap-cover layout class");
  check(html.includes("art-toolbar"), "Has toolbar");
  check(html.includes("art-canvas"), "Has canvas");
  check(html.includes("art-selection"), "Has selection handles");
}

section("2. New 5-Region Layout");
{
  const context = new jsgui.Page_Context();
  const app = new ArtPlaygroundAppControl({ context });
  const html = app.all_html_render();
  
  check(html.includes("ap-tool-panel"), "Has left tool panel (60px)");
  check(html.includes("ap-properties-panel"), "Has right properties panel (160px)");
  check(html.includes("ap-status-bar"), "Has bottom status bar (24px)");
  check(html.includes("ap-workspace"), "Has workspace container");
  check(html.includes("ap-canvas-wrapper"), "Has canvas wrapper");
  check(html.includes("ap-panel-narrow"), "Tool panel has narrow width class");
  check(html.includes("ap-panel-medium"), "Properties panel has medium width class");
}

section("3. Tool Panel Structure");
{
  const context = new jsgui.Page_Context();
  const app = new ArtPlaygroundAppControl({ context });
  const html = app.all_html_render();
  
  check(html.includes('data-tool="select"'), "Has select tool button");
  check(html.includes('data-tool="rect"'), "Has rect tool button");
  check(html.includes('data-tool="ellipse"'), "Has ellipse tool button");
  check(html.includes('data-tool="text"'), "Has text tool button");
  check(html.includes('data-tool="pan"'), "Has pan tool button");
  check(html.includes("ap-tool-panel__btn"), "Has tool panel button class");
  check(html.includes("↖"), "Has select icon");
  check(html.includes("▢"), "Has rect icon");
}

section("4. Toolbar Structure (Simplified)");
{
  const context = new jsgui.Page_Context();
  const app = new ArtPlaygroundAppControl({ context });
  const html = app.all_html_render();
  
  check(html.includes("🎨 Art Playground"), "Has app title");
  check(html.includes('data-action="add-rect"'), "Has quick-add rectangle");
  check(html.includes('data-action="add-ellipse"'), "Has quick-add ellipse");
  check(html.includes('data-action="add-text"'), "Has quick-add text");
  check(html.includes('data-action="delete"'), "Has delete button");
  check(html.includes('data-action="undo"'), "Has undo button");
  check(html.includes('data-action="redo"'), "Has redo button");
  check(html.includes('data-action="export"'), "Has export button");
}

section("5. Properties Panel Structure");
{
  const context = new jsgui.Page_Context();
  const app = new ArtPlaygroundAppControl({ context });
  const html = app.all_html_render();
  
  check(html.includes("ap-properties-panel__header"), "Has properties header");
  check(html.includes("ap-properties-panel__section"), "Has property sections");
  check(html.includes("ap-properties-panel__input"), "Has input fields");
  check(html.includes("ap-properties-panel__color-swatch"), "Has color swatches");
  check(html.includes('data-role="ap-fill-palette"'), "Has fill palette UI");
  check(html.includes('data-role="ap-stroke-palette"'), "Has stroke palette UI");
  check(html.includes('data-role="ap-color-swatch"'), "Has palette swatch buttons");
  check(/<div[^>]*data-role="ap-fill-palette"[^>]*role="radiogroup"/i.test(html), "Fill palette has role=radiogroup");
  check(/<div[^>]*data-role="ap-stroke-palette"[^>]*role="radiogroup"/i.test(html), "Stroke palette has role=radiogroup");
  check(/<button[^>]*data-role="ap-color-swatch"[^>]*role="radio"/i.test(html), "Swatches have role=radio");
  check(/<button[^>]*data-role="ap-color-swatch"[^>]*aria-label="(fill|stroke):\s*[^\"]+"/i.test(html), "Swatches have aria-label");
  check(html.includes("ap-layers"), "Has layers container");
}

section("6. Canvas SVG Structure");
{
  const context = new jsgui.Page_Context();
  const app = new ArtPlaygroundAppControl({ context });
  const html = app.all_html_render();
  
  check(html.includes("<svg"), "Contains SVG element");
  check(html.includes("art-canvas__svg"), "SVG has class");
  check(html.includes('id="grid"'), "Has grid pattern");
  check(html.includes("art-canvas__components"), "Has components group");
}

section("7. Selection Handles");
{
  const context = new jsgui.Page_Context();
  const app = new ArtPlaygroundAppControl({ context });
  const html = app.all_html_render();
  
  check(html.includes("art-selection__outline"), "Has selection outline");
  check(html.includes('data-handle="nw"'), "Has NW handle");
  check(html.includes('data-handle="ne"'), "Has NE handle");
  check(html.includes('data-handle="se"'), "Has SE handle");
  check(html.includes('data-handle="sw"'), "Has SW handle");
  check(html.includes('data-handle="n"'), "Has N handle");
  check(html.includes('data-handle="e"'), "Has E handle");
  check(html.includes('data-handle="s"'), "Has S handle");
  check(html.includes('data-handle="w"'), "Has W handle");
}

section("8. Control References");
{
  const context = new jsgui.Page_Context();
  const app = new ArtPlaygroundAppControl({ context });
  
  check(app._toolbar !== undefined, "App has toolbar reference");
  check(app._canvas !== undefined, "App has canvas reference");
  check(app._toolPanel !== undefined, "App has tool panel reference");
  check(app._propertiesPanel !== undefined, "App has properties panel reference");
  check(app._statusBar !== undefined, "App has status bar reference");
  check(app._toolbar?._buttons !== undefined, "Toolbar has buttons map");
  check(app._canvas?._selectionHandles !== undefined, "Canvas has selection handles reference");
}

section("9. Data Attributes");
{
  const context = new jsgui.Page_Context();
  const app = new ArtPlaygroundAppControl({ context });
  const html = app.all_html_render();
  
  check(html.includes('data-jsgui-control="art_app"'), "App has data-jsgui-control");
  check(html.includes('data-jsgui-control="art_toolbar"'), "Toolbar has data-jsgui-control");
  check(html.includes('data-jsgui-control="art_canvas"'), "Canvas has data-jsgui-control");
  check(html.includes('data-jsgui-control="art_selection"'), "Selection has data-jsgui-control");
  check(html.includes('data-jsgui-control="ap_tool_panel"'), "Tool panel has data-jsgui-control");
  check(html.includes('data-jsgui-control="ap_properties_panel"'), "Properties panel has data-jsgui-control");
  check(html.includes('data-jsgui-control="ap_status_bar"'), "Status bar has data-jsgui-control");
}

section("10. HTML Size Analysis");
{
  const context = new jsgui.Page_Context();
  const app = new ArtPlaygroundAppControl({ context });
  const html = app.all_html_render();
  
  const sizeKB = (html.length / 1024).toFixed(1);
  const divCount = (html.match(/<div/g) || []).length;
  const buttonCount = (html.match(/<button/g) || []).length;
  const svgElements = (html.match(/<svg|<rect|<ellipse|<path|<g /g) || []).length;
  
  console.log(`  📊 HTML Size: ${sizeKB}KB`);
  console.log(`  📊 DIV elements: ${divCount}`);
  console.log(`  📊 Button elements: ${buttonCount}`);
  console.log(`  📊 SVG elements: ${svgElements}`);
  
  check(parseInt(sizeKB) < 50, `HTML under 50KB (actual: ${sizeKB}KB)`);
  check(buttonCount >= 15, `At least 15 buttons (actual: ${buttonCount})`);
}

// ============================================
// Summary
// ============================================

console.log("\n" + "═".repeat(50));
if (failed === 0) {
  console.log(`✅ All ${passed} checks passed!`);
  process.exit(0);
} else {
  console.log(`❌ ${failed} checks failed, ${passed} passed`);
  process.exit(1);
}
