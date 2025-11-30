"use strict";

/**
 * Color Palette Lab Experiment - Check Script
 * 
 * Verifies that the copied and modified color palette controls work correctly.
 * Run with: node src/ui/lab/experiments/001-color-palette/check.js
 */

const jsgui = require("jsgui3-html");
const { ColorPaletteControl } = require("./ColorPaletteControl");
const { ColorGridControl } = require("./ColorGridControl");
const { GridControl, CellControl } = require("./GridControl");
const { PALETTES, PAL_LUXURY_OBSIDIAN, PAL_CRAYOLA } = require("./palettes");

console.log("═══════════════════════════════════════════════════════════════════");
console.log("  Color Palette Lab Experiment - Check Script");
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
// TEST 1: Palettes
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
// TEST 2: CellControl
// ═══════════════════════════════════════════════════════════════════════════════

section("CellControl");

const context = new jsgui.Page_Context();

const cell = new CellControl({
  context,
  x: 0,
  y: 0,
  data: "Test"
});

check(cell instanceof jsgui.Control, "CellControl extends jsgui.Control");
check(cell.x === 0, "CellControl has x position");
check(cell.y === 0, "CellControl has y position");

const cellHtml = cell.all_html_render();
check(cellHtml.includes("cell"), "CellControl renders with cell class");
check(cellHtml.includes("data-jsgui-id"), "CellControl has jsgui ID");

// Test color setter
cell.color = "#FF0000";
check(cell._color === "#FF0000", "CellControl color setter works");

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: GridControl
// ═══════════════════════════════════════════════════════════════════════════════

section("GridControl");

const grid = new GridControl({
  context,
  grid_size: [4, 4],
  size: [200, 200]
});

check(grid instanceof jsgui.Control, "GridControl extends jsgui.Control");
check(grid.grid_size[0] === 4, "GridControl has correct column count");
check(grid.grid_size[1] === 4, "GridControl has correct row count");

const gridHtml = grid.all_html_render();
check(gridHtml.includes("grid"), "GridControl renders with grid class");
check(gridHtml.includes("row"), "GridControl renders rows");

let cellCount = 0;
grid.each_cell((c, pos) => cellCount++);
check(cellCount === 16, "GridControl has 16 cells (4x4)");

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: ColorGridControl
// ═══════════════════════════════════════════════════════════════════════════════

section("ColorGridControl");

const colorGrid = new ColorGridControl({
  context,
  grid_size: [3, 2],
  size: [150, 100],
  palette: ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF"]
});

check(colorGrid instanceof GridControl, "ColorGridControl extends GridControl");

const colorGridHtml = colorGrid.all_html_render();
check(colorGridHtml.includes("color-grid"), "ColorGridControl has color-grid class");

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: ColorPaletteControl
// ═══════════════════════════════════════════════════════════════════════════════

section("ColorPaletteControl");

const palette1 = new ColorPaletteControl({
  context,
  palette: "crayola",
  grid_size: [8, 6],
  size: [200, 200]
});

check(palette1 instanceof jsgui.Control, "ColorPaletteControl extends jsgui.Control");
check(Array.isArray(palette1.palette), "ColorPaletteControl resolved 'crayola' to array");

const palette2 = new ColorPaletteControl({
  context,
  palette: "luxuryObsidian",
  grid_size: [6, 6]
});

check(palette2.palette === PAL_LUXURY_OBSIDIAN, "ColorPaletteControl resolved 'luxuryObsidian'");

const paletteHtml = palette1.all_html_render();
check(paletteHtml.includes("color-palette"), "ColorPaletteControl renders with class");
check(paletteHtml.length > 500, "ColorPaletteControl renders substantial HTML");

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: HTML Output Sample
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
  process.exit(1);
}
