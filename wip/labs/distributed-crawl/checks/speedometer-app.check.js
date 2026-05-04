#!/usr/bin/env node
/**
 * Smoke-check the speedometer dashboard HTML without launching Electron.
 * Ensures required sections are present and the stylesheet is linked.
 */

const assert = require('assert');
const path = require('path');

// Allow running from any working directory
const { getDashboardHtml } = require(path.join(__dirname, '..', 'speedometer-app'));

function expectContains(haystack, needle, label) {
  assert(haystack.includes(needle), `Missing ${label || needle}`);
}

(function run() {
  const html = getDashboardHtml();
  assert(typeof html === 'string', 'HTML is not a string');
  assert(html.length > 500, 'HTML appears too short');

  const mustHave = [
    { needle: '/speedometer.css', label: 'stylesheet link' },
    { needle: 'id="sseStatus"', label: 'SSE status badge' },
    { needle: 'id="lastEvent"', label: 'last event badge' },
    { needle: 'id="historyChart"', label: 'history chart canvas' },
    { needle: 'id="queueList"', label: 'queue list container' },
    { needle: 'id="queueSummary"', label: 'queue summary' },
    { needle: 'id="logContainer"', label: 'log container' },
    { needle: 'id="errorList"', label: 'error list' },
    { needle: 'Start (20 URLs)', label: 'start buttons' },
    { needle: 'speedometer', label: 'speedometer panel' }
  ];

  mustHave.forEach((item) => expectContains(html, item.needle, item.label));

  console.log('✅ speedometer-app.check: HTML structure and assets look present');
})();
