"use strict";

/**
 * Color Palette MVVM Lab Experiment - Check Script
 * 
 * EXPERIMENT: 002-color-palette-mvvm
 * Verifies that the MVVM-refactored color palette controls work correctly.
 * Run with: node src/ui/lab/experiments/002-color-palette-mvvm/check.js
 */

const jsgui = require("jsgui3-html");
const { Data_Object } = require("lang-tools");
const { ColorPaletteControl } = require("./ColorPaletteControl");
const { ColorGridControl } = require("./ColorGridControl");
const { GridControl, CellControl } = require("./GridControl");
const { PALETTES, PAL_LUXURY_OBSIDIAN, PAL_CRAYOLA } = require("./palettes");

console.log("═══════════════════════════════════════════════════════════════════");
console.log("  Color Palette MVVM Lab Experiment - Check Script");
console.log("  Testing Data_Model_View_Model_Control integration");
console.log("═══════════════════════════════════════════════════════════════════\n");

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
}

function section(name) {
  console.log(`\n📦 ${name}`);
  console.log("─".repeat(60));
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Palettes (unchanged)
// ═══════════════════════════════════════════════════════════════════════════════

section("Palettes");

check(Array.isArray(PAL_CRAYOLA), "PAL_CRAYOLA is an array");
check(PAL_CRAYOLA.length > 0, "PAL_CRAYOLA has colors");
check(PAL_CRAYOLA[0].hex, "PAL_CRAYOLA has hex values");
check(PAL_CRAYOLA[0].name, "PAL_CRAYOLA has color names");

check(Array.isArray(PAL_LUXURY_OBSIDIAN), "PAL_LUXURY_OBSIDIAN is an array");
check(PAL_LUXURY_OBSIDIAN.length > 0, "PAL_LUXURY_OBSIDIAN has colors");
check(PAL_LUXURY_OBSIDIAN.some(c => c.name.includes("Gold")), "PAL_LUXURY_OBSIDIAN has gold colors");
check(PAL_LUXURY_OBSIDIAN.some(c => c.name.includes("Emerald")), "PAL_LUXURY_OBSIDIAN has emerald colors");

check(Object.keys(PALETTES).length >= 5, "PALETTES has multiple palettes");
check(PALETTES.webSafe.length === 216, "Web-safe palette has 216 colors");
check(PALETTES.grayscale.length === 16, "Grayscale palette has 16 shades");

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: CellControl (MVVM)
// ═══════════════════════════════════════════════════════════════════════════════

section("CellControl (MVVM)");

const context = new jsgui.Page_Context();

const cell = new CellControl({
  context,
  x: 0,
  y: 0,
  data: "Test"
});

// Helper to check if object is Data_Object-like (handles module resolution issues)
function isDataObjectLike(obj) {
  return obj && (
    obj instanceof Data_Object || 
    obj.constructor?.name === 'Data_Object' ||
    obj.__data_object === true
  );
}

check(isDataObjectLike(cell.data?.model), "CellControl has data.model (Data_Object)");
check(isDataObjectLike(cell.view?.data?.model), "CellControl has view.data.model (Data_Object)");
check(cell.x === 0, "CellControl has x position via accessor");
check(cell.y === 0, "CellControl has y position via accessor");
check(cell.data.model.x === 0, "CellControl data.model.x is correct");
check(cell.data.model.y === 0, "CellControl data.model.y is correct");

const cellHtml = cell.all_html_render();
check(cellHtml.includes("cell"), "CellControl renders with cell class");
check(cellHtml.includes("data-jsgui-id"), "CellControl has jsgui ID");

// Test MVVM color binding
cell.color = "#FF0000";
check(cell.data.model.color === "#FF0000", "CellControl color setter updates data.model");
check(cell._color === "#FF0000", "CellControl _color backward compat works");

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: GridControl (MVVM)
// ═══════════════════════════════════════════════════════════════════════════════

section("GridControl (MVVM)");

const grid = new GridControl({
  context,
  grid_size: [4, 4],
  size: [200, 200]
});

check(isDataObjectLike(grid.data?.model), "GridControl has data.model");
check(isDataObjectLike(grid.view?.data?.model), "GridControl has view.data.model");
check(grid.data.model.gridSize[0] === 4, "GridControl data.model.gridSize correct");
check(grid.grid_size[0] === 4, "GridControl grid_size accessor works");

const gridHtml = grid.all_html_render();
check(gridHtml.includes("grid"), "GridControl renders with grid class");
check(gridHtml.includes("row"), "GridControl renders rows");

let cellCount = 0;
grid.each_cell((c, pos) => cellCount++);
check(cellCount === 16, "GridControl has 16 cells (4x4)");

// Test computed property
check(grid.view.data.model.cellCount === 16, "GridControl computed cellCount = 16");

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: ColorGridControl (MVVM)
// ═══════════════════════════════════════════════════════════════════════════════

section("ColorGridControl (MVVM)");

const colorGrid = new ColorGridControl({
  context,
  grid_size: [3, 2],
  size: [150, 100],
  palette: ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF"]
});

check(colorGrid.data?.model?.palette?.length === 6, "ColorGridControl has palette in data.model");
check(colorGrid.view?.data?.model?.colorCount === 6, "ColorGridControl computed colorCount = 6");
check(colorGrid.palette.length === 6, "ColorGridControl palette accessor works");

const colorGridHtml = colorGrid.all_html_render();
check(colorGridHtml.includes("color-grid"), "ColorGridControl has color-grid class");

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: ColorPaletteControl (MVVM)
// ═══════════════════════════════════════════════════════════════════════════════

section("ColorPaletteControl (MVVM)");

const palette1 = new ColorPaletteControl({
  context,
  palette: "crayola",
  grid_size: [8, 6],
  size: [200, 200],
  foreground: "#123456",
  background: "#FEDCBA"
});

check(isDataObjectLike(palette1.data?.model), "ColorPaletteControl has data.model");
check(isDataObjectLike(palette1.view?.data?.model), "ColorPaletteControl has view.data.model");
check(Array.isArray(palette1.palette), "ColorPaletteControl resolved 'crayola' to array");
check(palette1.data.model.foreground === "#123456", "ColorPaletteControl data.model.foreground correct");
check(palette1.data.model.background === "#FEDCBA", "ColorPaletteControl data.model.background correct");

// Test binding transforms (should be uppercase)
check(palette1.view.data.model.displayForeground === "#123456".toUpperCase(), "ColorPaletteControl displayForeground bound");
check(palette1.view.data.model.displayBackground === "#FEDCBA".toUpperCase(), "ColorPaletteControl displayBackground bound");

const palette2 = new ColorPaletteControl({
  context,
  palette: "luxuryObsidian",
  grid_size: [6, 6]
});

check(palette2.data.model.palette === PAL_LUXURY_OBSIDIAN, "ColorPaletteControl resolved 'luxuryObsidian'");
check(palette2.view.data.model.colorCount === PAL_LUXURY_OBSIDIAN.length, "ColorPaletteControl computed colorCount");

const paletteHtml = palette1.all_html_render();
check(paletteHtml.includes("color-palette"), "ColorPaletteControl renders with class");
check(paletteHtml.length > 500, "ColorPaletteControl renders substantial HTML");

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: MVVM State Changes
// ═══════════════════════════════════════════════════════════════════════════════

section("MVVM State Changes");

// Test setForeground updates data model
palette1.setForeground("#ABCDEF");
check(palette1.data.model.foreground === "#ABCDEF", "setForeground updates data.model");
check(palette1.view.data.model.displayForeground === "#ABCDEF", "setForeground triggers binding");

// Test setBackgroundColor
palette1.setBackgroundColor("#FEDCBA");
check(palette1.data.model.background === "#FEDCBA", "setBackgroundColor updates data.model");

// Test selectByIndex
palette1.selectByIndex(5);
check(palette1.data.model.selectedIndex === 5, "selectByIndex updates data.model");

// Test computed selectedColor
const expectedColor = palette1.palette[5];
const expectedHex = expectedColor.hex || expectedColor;
check(palette1.view.data.model.selectedColor === expectedHex, "Computed selectedColor updated");

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Inspect API
// ═══════════════════════════════════════════════════════════════════════════════

section("MVVM Inspect API");

const inspectResult = palette1.inspect();
check(inspectResult.dataModel !== undefined, "inspect() returns dataModel");
check(inspectResult.viewModel !== undefined, "inspect() returns viewModel");
check(inspectResult.dataModel.foreground === "#ABCDEF", "inspect().dataModel.foreground correct");
check(inspectResult.viewModel.selectedColor === expectedHex, "inspect().viewModel.selectedColor correct");

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: HTML Output Sample
// ═══════════════════════════════════════════════════════════════════════════════

section("HTML Output Sample");

console.log("\n  Sample HTML (first 500 chars):");
console.log("  " + "─".repeat(50));
console.log("  " + paletteHtml.substring(0, 500).replace(/\n/g, "\n  ") + "...");
console.log("  " + "─".repeat(50));

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n═══════════════════════════════════════════════════════════════════");
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log("═══════════════════════════════════════════════════════════════════\n");

if (failed > 0) {
  console.log("  ⚠️  Some tests failed. MVVM integration may need fixes.\n");
  process.exit(1);
} else {
  console.log("  🎉 All MVVM tests passed! Experiment validated.\n");
}

