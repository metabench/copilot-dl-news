#!/usr/bin/env node
"use strict";

/**
 * Check script for ProgressBarControl
 * 
 * Verifies:
 * - Base rendering with various configurations
 * - Variant classes (standard, compact, striped)
 * - Color themes (emerald, gold, ruby, sapphire, amethyst)
 * - Value display and percentage formatting
 */

const jsgui = require("jsgui3-html");
const { createProgressBarControl, PROGRESS_BAR_STYLES } = require("../ProgressBar");

const ProgressBarControl = createProgressBarControl(jsgui);

const FIXTURES = {
  basic: { value: 0.5 },
  withLabel: { value: 0.75, label: "75% complete" },
  percentage: { value: 0.33, showPercentage: true },
  compact: { value: 0.6, variant: "compact" },
  striped: { value: 0.8, variant: "striped" },
  emerald: { value: 0.5, color: "emerald" },
  gold: { value: 0.5, color: "gold" },
  ruby: { value: 0.5, color: "ruby" },
  sapphire: { value: 0.5, color: "sapphire" },
  amethyst: { value: 0.5, color: "amethyst" },
  animated: { value: 0.7, animated: true },
  notAnimated: { value: 0.7, animated: false },
  edgeZero: { value: 0 },
  edgeFull: { value: 1 },
  edgeOver: { value: 1.5 },  // should clamp to 1
  edgeNegative: { value: -0.3 }  // should clamp to 0
};

function testCase(name, spec, assertions) {
  const context = new jsgui.Page_Context();
  const control = new ProgressBarControl({ context, ...spec });
  const html = control.all_html_render();
  
  const failures = [];
  
  for (const [check, expected] of Object.entries(assertions)) {
    if (typeof expected === "boolean") {
      const found = html.includes(check);
      if (found !== expected) {
        failures.push(`Expected ${check} to be ${expected ? "present" : "absent"}`);
      }
    } else if (!html.includes(expected)) {
      failures.push(`Expected ${check} to include "${expected}"`);
    }
  }
  
  if (failures.length > 0) {
    console.error(`✗ ${name}:`);
    failures.forEach((f) => console.error(`  - ${f}`));
    console.error(`  HTML: ${html.slice(0, 200)}...`);
    throw new Error(`${name} failed with ${failures.length} assertion(s)`);
  }
  
  console.log(`✓ ${name}`);
  return html;
}

function main() {
  console.log("ProgressBarControl Check\n");
  
  // Basic structure
  testCase("basic", FIXTURES.basic, {
    "base-class": "progress-bar",
    "track": "progress-bar__track",
    "fill": "progress-bar__fill"
  });
  
  // With label
  testCase("withLabel", FIXTURES.withLabel, {
    "label-class": "progress-bar__label",
    "label-text": "75% complete"
  });
  
  // Auto percentage
  testCase("percentage", FIXTURES.percentage, {
    "label-class": "progress-bar__label",
    "percentage": "33%"
  });
  
  // Variants
  testCase("compact", FIXTURES.compact, {
    "variant": "progress-bar--compact"
  });
  
  testCase("striped", FIXTURES.striped, {
    "variant": "progress-bar--striped"
  });
  
  // Colors
  testCase("emerald", FIXTURES.emerald, { "color": "progress-bar--emerald" });
  testCase("gold", FIXTURES.gold, { "color": "progress-bar--gold" });
  testCase("ruby", FIXTURES.ruby, { "color": "progress-bar--ruby" });
  testCase("sapphire", FIXTURES.sapphire, { "color": "progress-bar--sapphire" });
  testCase("amethyst", FIXTURES.amethyst, { "color": "progress-bar--amethyst" });
  
  // Animation
  testCase("animated", FIXTURES.animated, { "animated": "progress-bar--animated" });
  
  // Edge cases (should render without errors)
  testCase("edgeZero", FIXTURES.edgeZero, { "base": "progress-bar" });
  testCase("edgeFull", FIXTURES.edgeFull, { "base": "progress-bar" });
  testCase("edgeOver", FIXTURES.edgeOver, { "base": "progress-bar" });
  testCase("edgeNegative", FIXTURES.edgeNegative, { "base": "progress-bar" });
  
  // Verify CSS styles export
  if (!PROGRESS_BAR_STYLES.includes(".progress-bar")) {
    throw new Error("PROGRESS_BAR_STYLES export is missing expected CSS");
  }
  console.log("\n✓ PROGRESS_BAR_STYLES export contains expected CSS");
  
  // Output sample HTML
  console.log("\n--- Sample Rendered HTML ---");
  const sample = testCase("sample", { value: 0.65, label: "65%", color: "sapphire", variant: "standard" }, {});
  console.log(sample);
  
  console.log("\n✓ All ProgressBarControl checks passed");
}

if (require.main === module) {
  main();
}

module.exports = { main };
