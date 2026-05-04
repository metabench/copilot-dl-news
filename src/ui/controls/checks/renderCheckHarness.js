"use strict";

const jsgui = require("jsgui3-html");

function createContext() {
  return new jsgui.Page_Context();
}

function renderControl(ControlClass, spec = {}) {
  const context = spec.context || createContext();
  const control = new ControlClass({ ...spec, context });
  return { context, control, html: control.all_html_render() };
}

function countOccurrences(html, needle) {
  return String(html).split(needle).length - 1;
}

function assertIncludes(html, needle, label = needle) {
  if (!html.includes(needle)) {
    throw new Error(`Expected rendered HTML to include ${label}`);
  }
}

function assertNotIncludes(html, needle, label = needle) {
  if (html.includes(needle)) {
    throw new Error(`Expected rendered HTML not to include ${label}`);
  }
}

function assertCount(html, needle, expected, label = needle) {
  const actual = countOccurrences(html, needle);
  if (actual !== expected) {
    throw new Error(`Expected ${expected} occurrences of ${label}, found ${actual}`);
  }
}

function runRenderCases(title, cases) {
  console.log(`${title}\n`);
  const samples = [];
  for (const testCase of cases) {
    const { html, control } = renderControl(testCase.ControlClass, testCase.spec || {});
    for (const needle of testCase.includes || []) assertIncludes(html, needle);
    for (const needle of testCase.notIncludes || []) assertNotIncludes(html, needle);
    for (const countCheck of testCase.counts || []) {
      assertCount(html, countCheck.needle, countCheck.expected, countCheck.label);
    }
    if (typeof testCase.custom === "function") testCase.custom({ html, control });
    samples.push({ name: testCase.name, html });
    console.log(`OK ${testCase.name}`);
  }
  return samples;
}

module.exports = {
  assertCount,
  assertIncludes,
  assertNotIncludes,
  countOccurrences,
  createContext,
  renderControl,
  runRenderCases
};
