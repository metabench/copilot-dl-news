#!/usr/bin/env node
"use strict";

const { OptionPickerControl } = require("../OptionPickerControl");
const { runRenderCases, assertIncludes } = require("./renderCheckHarness");

function main() {
  const samples = runRenderCases("OptionPickerControl Check", [
    {
      name: "selected option with hidden input",
      ControlClass: OptionPickerControl,
      spec: {
        name: "crawlType",
        label: "Crawl type",
        selectedValue: "simple",
        options: [
          { value: "simple", label: "Simple distributed", description: "Small bounded crawl" },
          { value: "deep", label: "Deep crawl", disabled: true }
        ]
      },
      includes: [
        "option-picker",
        "data-option-picker=\"crawlType\"",
        "name=\"crawlType\"",
        "value=\"simple\"",
        "aria-selected=\"true\"",
        "Small bounded crawl",
        "disabled=\"disabled\""
      ]
    },
    {
      name: "placeholder when nothing selected",
      ControlClass: OptionPickerControl,
      spec: {
        placeholder: "Choose domain",
        options: [{ value: "bbc", label: "bbc.com" }]
      },
      includes: ["Choose domain", "data-value=\"bbc\"", "bbc.com"]
    }
  ]);

  assertIncludes(samples[0].html, "Simple distributed", "selected label");
  console.log("\nSample HTML:\n" + samples[0].html);
  console.log("\nOptionPickerControl checks passed");
}

if (require.main === module) main();

module.exports = { main };
