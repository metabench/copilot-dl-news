#!/usr/bin/env node
"use strict";

/**
 * Check script for TableControl
 * 
 * Verifies:
 * - Table structure (table, thead, tbody, tr, th, td)
 * - Column headers with alignment
 * - Row rendering with various cell types
 * - Link cells, styled cells, raw HTML cells
 * - Striped row pattern
 */

const jsgui = require("jsgui3-html");
const { TableControl, TableRowControl, TableCellControl } = require("../Table");

const FIXTURES = {
  basic: {
    columns: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value", align: "right" }
    ],
    rows: [
      { name: "Item 1", value: "100" },
      { name: "Item 2", value: "200" }
    ]
  },
  withLinks: {
    columns: [
      { key: "url", label: "URL" },
      { key: "status", label: "Status", align: "center" }
    ],
    rows: [
      { 
        url: { text: "example.com", href: "/url/1", title: "View details" },
        status: "200"
      }
    ]
  },
  withStyledCells: {
    columns: [
      { key: "metric", label: "Metric", cellClass: "metric-col" }
    ],
    rows: [
      { metric: { text: "Critical", classNames: ["alert", "alert-critical"], align: "center" } }
    ]
  },
  withAlignment: {
    columns: [
      { key: "left", label: "Left", align: "left" },
      { key: "center", label: "Center", align: "center" },
      { key: "right", label: "Right", align: "right" }
    ],
    rows: [
      { left: "A", center: "B", right: "C" }
    ]
  },
  empty: {
    columns: [{ key: "col", label: "Column" }],
    rows: []
  },
  manyRows: {
    columns: [{ key: "id", label: "#" }],
    rows: Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1) }))
  }
};

function testCase(name, spec, assertions) {
  const context = new jsgui.Page_Context();
  const control = new TableControl({ context, ...spec });
  const html = control.all_html_render();
  
  const failures = [];
  
  for (const [check, expected] of Object.entries(assertions)) {
    if (typeof expected === "function") {
      const result = expected(html);
      if (!result.pass) {
        failures.push(`${check}: ${result.message}`);
      }
    } else if (typeof expected === "boolean") {
      const found = html.includes(check);
      if (found !== expected) {
        failures.push(`Expected "${check}" to be ${expected ? "present" : "absent"}`);
      }
    } else if (!html.includes(expected)) {
      failures.push(`Expected ${check} to include "${expected}"`);
    }
  }
  
  if (failures.length > 0) {
    console.error(`✗ ${name}:`);
    failures.forEach((f) => console.error(`  - ${f}`));
    console.error(`  HTML: ${html.slice(0, 400)}...`);
    throw new Error(`${name} failed with ${failures.length} assertion(s)`);
  }
  
  console.log(`✓ ${name}`);
  return html;
}

function countOccurrences(needle) {
  return (html) => {
    const matches = html.match(new RegExp(needle, "g"));
    return { 
      pass: matches !== null, 
      message: `Found ${matches ? matches.length : 0} occurrences of "${needle}"`,
      count: matches ? matches.length : 0
    };
  };
}

function hasExactCount(needle, expected) {
  return (html) => {
    const matches = html.match(new RegExp(needle, "g"));
    const count = matches ? matches.length : 0;
    return { 
      pass: count === expected, 
      message: `Expected ${expected} "${needle}", found ${count}`
    };
  };
}

function main() {
  console.log("TableControl Check\n");
  
  // Basic structure
  testCase("basic", FIXTURES.basic, {
    "table-tag": "<table",
    "thead": "<thead",
    "tbody": "<tbody",
    "th-tags": countOccurrences("<th"),  // at least some headers
    "has-rows": countOccurrences("ui-table__row")  // at least some rows
  });
  
  // Column headers
  testCase("basic-headers", FIXTURES.basic, {
    "name-header": ">Name<",
    "value-header": ">Value<"
  });
  
  // Row data
  testCase("basic-data", FIXTURES.basic, {
    "item1": ">Item 1<",
    "value100": ">100<"
  });
  
  // Link cells
  testCase("withLinks", FIXTURES.withLinks, {
    "anchor": "<a",
    "href": 'href="/url/1"',
    "link-text": ">example.com<",
    "title": 'title="View details"'
  });
  
  // Styled cells
  testCase("withStyledCells", FIXTURES.withStyledCells, {
    "metric-col": "metric-col",
    "alert-class": "alert-critical",
    "critical-text": ">Critical<"
  });
  
  // Alignment classes
  testCase("withAlignment", FIXTURES.withAlignment, {
    "left-align": "ui-table__cell--left",
    "center-align": "ui-table__cell--center",
    "right-align": "ui-table__cell--right"
  });
  
  // Empty table
  testCase("empty", FIXTURES.empty, {
    "table-tag": "<table",
    "thead": "<thead",
    "tbody": "<tbody",
    "header-row": "ui-table__row--header"
  });
  
  // Striped rows
  testCase("manyRows-striped", FIXTURES.manyRows, {
    "striped-class": "ui-table__row--striped"
  });
  
  // TableCellControl direct usage
  console.log("\n--- TableCellControl Direct Tests ---");
  
  const context = new jsgui.Page_Context();
  
  const headerCell = new TableCellControl({ context, header: true, text: "Header" });
  const headerHtml = headerCell.all_html_render();
  if (!headerHtml.includes("<th") || !headerHtml.includes("ui-table__cell--header")) {
    throw new Error("Header cell missing <th> or header class");
  }
  console.log("✓ HeaderCell renders as <th>");
  
  const dataCell = new TableCellControl({ context, text: "Data" });
  const dataHtml = dataCell.all_html_render();
  if (!dataHtml.includes("<td")) {
    throw new Error("Data cell missing <td>");
  }
  console.log("✓ DataCell renders as <td>");
  
  const alignedCell = new TableCellControl({ context, text: "Right", align: "right" });
  const alignedHtml = alignedCell.all_html_render();
  if (!alignedHtml.includes("ui-table__cell--right")) {
    throw new Error("Aligned cell missing alignment class");
  }
  console.log("✓ Aligned cell has alignment class");
  
  // TableRowControl direct usage
  const row = new TableRowControl({ context, rowIndex: 5, classNames: "custom-row" });
  const rowHtml = row.all_html_render();
  if (!rowHtml.includes("<tr") || !rowHtml.includes("ui-table__row") || !rowHtml.includes("custom-row")) {
    throw new Error("Row missing expected structure");
  }
  if (!rowHtml.includes('data-row-index="5"')) {
    throw new Error("Row missing row-index data attribute");
  }
  console.log("✓ TableRowControl has expected structure");
  
  // Output sample HTML
  console.log("\n--- Sample Rendered HTML ---");
  const sample = testCase("sample", FIXTURES.basic, {});
  console.log(sample);
  
  console.log("\n✓ All TableControl checks passed");
}

if (require.main === module) {
  main();
}

module.exports = { main };
