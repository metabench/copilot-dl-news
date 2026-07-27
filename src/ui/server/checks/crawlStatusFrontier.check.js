#!/usr/bin/env node
'use strict';

/**
 * crawlStatusFrontier.check.js — cheap SSR check for the crawl-status page's
 * DB-frontier strip + P6 controls, plus a parse/marker check of the EMITTED
 * client script.
 *
 *   node src/ui/server/checks/crawlStatusFrontier.check.js
 *
 * Exists because this page has two documented traps that a browser loop is
 * too slow to catch every edit (BOOT.md sharp edges + memory):
 *   1. crawl-status-client.js emits its whole client script from ONE backtick
 *      template literal — a regex backslash or stray backtick corrupts the
 *      EMITTED text while the source file still parses fine. So this check
 *      parses the emitted string with new Function(), not the source.
 *   2. The page SSRs through jsgui3 (compose() conventions); a markup slip
 *      shows up as a missing marker in the rendered HTML long before a
 *      screenshot would show it.
 * Exit 0 = all markers present + emitted script parses; 1 otherwise.
 */

const assert = (cond, label) => {
  if (cond) { console.log('  ✅', label); return 0; }
  console.log('  ❌', label);
  return 1;
};

let failures = 0;

console.log('== crawl-status SSR: frontier strip + P6 controls ==');
const { renderCrawlStatusPageHtml } = require('../crawlStatus/CrawlStatusPage');
const html = renderCrawlStatusPageHtml({});
for (const marker of [
  'data-crawl-frontier-stat="crawlable"',
  'data-crawl-frontier-stat="hubStale"',
  'data-crawl-frontier-stat="suppressed"',   // dead + low-value visibility (2026-07-20)
  'data-crawl-frontier-stat="queue"',
  'crawl-hub-recency-days',
  'crawl-frontier-hydrate-btn',
  'crawl-frontier-runmulti-btn',             // P6 run-multi control
  'crawl-auto-hydrate-enabled',              // P6 autoHydrate toggle
  'data-crawl-auto-hydrate-status',
  'data-crawl-frontier-hosts'
]) {
  failures += assert(html.includes(marker), 'SSR marker: ' + marker);
}

console.log('== emitted client script: parses + wires the new controls ==');
const { buildCrawlStatusClientScript } = require('../crawlStatus/crawl-status-client');
const script = buildCrawlStatusClientScript();
try {
  // eslint-disable-next-line no-new-func
  new Function(script);
  failures += assert(true, 'emitted script parses (new Function)');
} catch (err) {
  failures += assert(false, 'emitted script parses — ' + err.message);
}
for (const marker of [
  'initRunMultiButton();',
  'initAutoHydrateToggle();',
  'fetchAutoHydrate();',
  'data-crawl-frontier-stat="suppressed"',
  '/api/v1/crawl/frontier/run-multi',
  '/api/v1/crawl/auto-hydrate'
]) {
  failures += assert(script.includes(marker), 'client marker: ' + marker);
}
// The emitted-template trap itself: a literal backslash in the emitted text
// is almost always an escaped regex that the template literal ate half of.
failures += assert(!script.includes('\\d') && !script.includes('\\.'), 'no half-escaped regex remnants in emitted script');
// Contrast trap (cycle 62): the per-host health badge hardcodes a DARK background
// (#241f18) but its label text color inherits the page theme — black in light theme,
// so the host names were invisible. Any element with a hardcoded dark bg MUST set its
// own light text color. Guard the badge specifically.
failures += assert(script.includes('background:#241f18;color:'), 'host-health badge sets an explicit text color on its dark background (invisible-in-light-theme guard)');

console.log(failures ? `\n${failures} check(s) failing.` : '\nAll crawl-status frontier checks pass.');
process.exit(failures ? 1 : 0);
