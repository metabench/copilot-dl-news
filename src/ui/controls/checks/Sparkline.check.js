#!/usr/bin/env node
"use strict";

/**
 * Check script for SparklineControl
 * 
 * Verifies:
 * - SVG structure rendering
 * - Polyline path generation
 * - Customizable dimensions, stroke, and colors
 * - Edge cases (empty series, single point, large values)
 */

const jsgui = require("jsgui3-html");
const SparklineControl = require("../Sparkline");

const FIXTURES = {
  basic: { series: [10, 25, 15, 30, 20, 35] },
  customDimensions: { series: [5, 10, 15], width: 200, height: 50 },
  customColors: { series: [1, 2, 3, 4, 5], stroke: "#ff0000", strokeWidth: 3 },
  withFill: { series: [10, 20, 30], fill: "rgba(67, 56, 202, 0.2)" },
  empty: { series: [] },
  singlePoint: { series: [42] },
  negativeValues: { series: [-10, 5, -20, 15, 0] },
  largeValues: { series: [1000000, 2000000, 1500000, 2500000] },
  flatLine: { series: [50, 50, 50, 50] },
  steep: { series: [0, 100, 0, 100] }
};

function testCase(name, spec, assertions) {
  const context = new jsgui.Page_Context();
  const control = new SparklineControl({ context, ...spec });
  const html = control.all_html_render();
  
  const failures = [];
  
  for (const [check, expected] of Object.entries(assertions)) {
    if (typeof expected === "function") {
      const result = expected(html);
      if (!result.pass) {
        failures.push(`${check}: ${result.message}`);
      }
    } else if (!html.includes(expected)) {
      failures.push(`Expected ${check} to include "${expected}"`);
    }
  }
  
  if (failures.length > 0) {
    console.error(`✗ ${name}:`);
    failures.forEach((f) => console.error(`  - ${f}`));
    console.error(`  HTML: ${html.slice(0, 300)}...`);
    throw new Error(`${name} failed with ${failures.length} assertion(s)`);
  }
  
  console.log(`✓ ${name}`);
  return html;
}

function hasViewBox(expected) {
  return (html) => {
    const match = html.match(/viewBox="([^"]+)"/);
    if (!match) return { pass: false, message: "No viewBox found" };
    return { pass: match[1] === expected, message: `viewBox is ${match[1]}, expected ${expected}` };
  };
}

function hasPoints() {
  return (html) => {
    const match = html.match(/points="([^"]+)"/);
    if (!match) return { pass: false, message: "No points attribute found" };
    const points = match[1].trim();
    return { pass: points.length > 0, message: "Points attribute is empty" };
  };
}

function hasStroke(expected) {
  return (html) => {
    const match = html.match(/stroke="([^"]+)"/);
    if (!match) return { pass: false, message: "No stroke found" };
    return { pass: match[1] === expected, message: `stroke is ${match[1]}, expected ${expected}` };
  };
}

function main() {
  console.log("SparklineControl Check\n");
  
  // Basic structure
  testCase("basic", FIXTURES.basic, {
    "svg-tag": "<svg",
    "class": "sparkline",
    "polyline": "<polyline",
    "viewBox": hasViewBox("0 0 160 32"),
    "points": hasPoints()
  });
  
  // Custom dimensions
  testCase("customDimensions", FIXTURES.customDimensions, {
    "viewBox": hasViewBox("0 0 200 50")
  });
  
  // Custom colors
  testCase("customColors", FIXTURES.customColors, {
    "stroke": hasStroke("#ff0000"),
    "strokeWidth": 'stroke-width="3"'
  });
  
  // With fill
  testCase("withFill", FIXTURES.withFill, {
    "fill": 'fill="rgba(67, 56, 202, 0.2)"'
  });
  
  // Edge cases
  testCase("empty", FIXTURES.empty, {
    "svg-tag": "<svg",
    "class": "sparkline"
  });
  
  testCase("singlePoint", FIXTURES.singlePoint, {
    "svg-tag": "<svg",
    "polyline": "<polyline"
  });
  
  testCase("negativeValues", FIXTURES.negativeValues, {
    "svg-tag": "<svg",
    "points": hasPoints()
  });
  
  testCase("largeValues", FIXTURES.largeValues, {
    "svg-tag": "<svg",
    "points": hasPoints()
  });
  
  testCase("flatLine", FIXTURES.flatLine, {
    "svg-tag": "<svg"
  });
  
  testCase("steep", FIXTURES.steep, {
    "svg-tag": "<svg",
    "points": hasPoints()
  });
  
  // Output sample HTML
  console.log("\n--- Sample Rendered HTML ---");
  const sample = testCase("sample", { series: [10, 25, 15, 30, 20, 35], stroke: "#4338ca" }, {});
  console.log(sample);
  
  console.log("\n✓ All SparklineControl checks passed");
}

if (require.main === module) {
  main();
}

module.exports = { main };
