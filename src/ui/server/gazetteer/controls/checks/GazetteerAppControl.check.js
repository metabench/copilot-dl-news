"use strict";

/**
 * GazetteerAppControl Check Script
 * 
 * Verifies that GazetteerAppControl renders correctly for all view types.
 * Run with: node src/ui/server/gazetteer/controls/checks/GazetteerAppControl.check.js
 */

const jsgui = require("jsgui3-html");
const { GazetteerAppControl, VIEW_TYPES } = require("../");

const SAMPLE_RESULTS = [
  { id: 1, canonical_name: "London", kind: "city", country_code: "GB", population: 9000000 },
  { id: 2, canonical_name: "Londonderry", kind: "city", country_code: "GB", population: 100000 }
];

const SAMPLE_PLACE = {
  info: {
    id: 1,
    name: "London",
    kind: "city",
    countryCode: "GB",
    population: 9000000,
    latitude: 51.5074,
    longitude: -0.1278,
    timezone: "Europe/London",
    wikidataQid: "Q84"
  },
  hierarchy: {
    parents: [
      { parent_id: 100, name: "England" },
      { parent_id: 200, name: "United Kingdom" }
    ],
    children: [
      { child_id: 10, name: "Westminster", kind: "borough" },
      { child_id: 11, name: "Camden", kind: "borough" }
    ]
  },
  alternateNames: [
    { name: "Londres", language: "fr" },
    { name: "Londra", language: "it" }
  ]
};

function createContext() {
  return new jsgui.Page_Context();
}

function checkWelcome() {
  console.log("📋 Testing Welcome/Home View...");
  const ctx = createContext();
  
  const app = new GazetteerAppControl({
    context: ctx,
    viewType: VIEW_TYPES.SEARCH,
    query: "",
    results: []
  });
  
  const html = app.all_html_render();
  
  const checks = [
    { name: "has gazetteer class", pass: html.includes("gazetteer") },
    { name: "has search form", pass: html.includes("gazetteer__search-form") },
    { name: "has welcome section", pass: html.includes("gazetteer__welcome") },
    { name: "contains suggestions", pass: html.includes("London") || html.includes("Tokyo") },
    { name: "has kind select", pass: html.includes("gazetteer__kind-select") }
  ];
  
  let passed = 0;
  for (const check of checks) {
    const status = check.pass ? "✅" : "❌";
    console.log(`  ${status} ${check.name}`);
    if (check.pass) passed++;
  }
  
  console.log(`  Result: ${passed}/${checks.length} passed\n`);
  return passed === checks.length;
}

function checkSearchResults() {
  console.log("📋 Testing Search Results View...");
  const ctx = createContext();
  
  const app = new GazetteerAppControl({
    context: ctx,
    viewType: VIEW_TYPES.SEARCH,
    query: "London",
    results: SAMPLE_RESULTS
  });
  
  const html = app.all_html_render();
  
  const checks = [
    { name: "has gazetteer class", pass: html.includes("gazetteer") },
    { name: "has results list", pass: html.includes("gazetteer__results-list") },
    { name: "has result item", pass: html.includes("gazetteer__result-item") },
    { name: "contains query", pass: html.includes("London") },
    { name: "shows result count", pass: html.includes("Found 2") },
    { name: "has badges", pass: html.includes("gazetteer__badge") },
    { name: "shows population", pass: html.includes("9,000,000") }
  ];
  
  let passed = 0;
  for (const check of checks) {
    const status = check.pass ? "✅" : "❌";
    console.log(`  ${status} ${check.name}`);
    if (check.pass) passed++;
  }
  
  console.log(`  Result: ${passed}/${checks.length} passed\n`);
  return passed === checks.length;
}

function checkPlaceDetail() {
  console.log("📋 Testing Place Detail View...");
  const ctx = createContext();
  
  const app = new GazetteerAppControl({
    context: ctx,
    viewType: VIEW_TYPES.PLACE,
    place: SAMPLE_PLACE
  });
  
  const html = app.all_html_render();
  
  const checks = [
    { name: "has gazetteer class", pass: html.includes("gazetteer") },
    { name: "has breadcrumb", pass: html.includes("gazetteer__breadcrumb") },
    { name: "shows place name", pass: html.includes("London") },
    { name: "has details section", pass: html.includes("gazetteer__section") },
    { name: "shows coordinates", pass: html.includes("51.5074") },
    { name: "has wikidata link", pass: html.includes("wikidata.org") },
    { name: "shows children", pass: html.includes("Westminster") },
    { name: "shows alt names", pass: html.includes("Londres") },
    { name: "has parent hierarchy", pass: html.includes("England") }
  ];
  
  let passed = 0;
  for (const check of checks) {
    const status = check.pass ? "✅" : "❌";
    console.log(`  ${status} ${check.name}`);
    if (check.pass) passed++;
  }
  
  console.log(`  Result: ${passed}/${checks.length} passed\n`);
  return passed === checks.length;
}

function main() {
  console.log("GazetteerAppControl Verification\n" + "=".repeat(40) + "\n");
  
  const results = [
    checkWelcome(),
    checkSearchResults(),
    checkPlaceDetail()
  ];
  
  const allPassed = results.every(r => r);
  console.log("=".repeat(40));
  console.log(allPassed 
    ? "✅ All checks passed!" 
    : "❌ Some checks failed");
  
  process.exit(allPassed ? 0 : 1);
}

main();
