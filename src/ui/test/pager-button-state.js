"use strict";

const path = require("path");
const cheerio = require("cheerio");
const { renderHtml } = require("../render-url-table");
const {
  buildColumns,
  buildDisplayRows,
  formatDateTime
} = require("../controls/UrlListingTable");

function buildRows(count, startIndex) {
  const now = new Date().toISOString();
  const sample = Array.from({ length: count }, (_, idx) => ({
    url: `https://example.com/${startIndex + idx}`,
    host: "example.com",
    createdAt: now,
    lastSeenAt: now,
    lastFetchAt: now,
    httpStatus: 200
  }));
  return buildDisplayRows(sample, { startIndex });
}

function renderPaginationSnapshot({ currentPage, totalPages, totalRows, pageSize }) {
  const startRow = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rowsOnPage = Math.min(pageSize, Math.max(totalRows - (currentPage - 1) * pageSize, 0));
  const endRow = rowsOnPage === 0 ? 0 : startRow + rowsOnPage - 1;
  const rows = buildRows(rowsOnPage, startRow || 1);
  const pagination = {
    currentPage,
    totalPages,
    totalRows,
    pageSize,
    startRow,
    endRow,
    offset: (currentPage - 1) * pageSize,
    prevHref: currentPage > 1 ? `/urls?page=${currentPage - 1}` : null,
    nextHref: currentPage < totalPages ? `/urls?page=${currentPage + 1}` : null,
    firstHref: currentPage > 1 ? `/urls?page=1` : null,
    lastHref: currentPage < totalPages ? `/urls?page=${totalPages}` : null
  };
  const meta = {
    rowCount: rows.length,
    limit: pageSize,
    dbLabel: path.join("data", "news.db"),
    generatedAt: formatDateTime(new Date(), true),
    subtitle: `Rows ${startRow}-${endRow} of ${totalRows} — Page ${currentPage}/${totalPages}`,
    pagination
  };
  const columns = buildColumns();
  return renderHtml({ columns, rows, meta, title: "Pager Snapshot" });
}

function extractStates(html) {
  const $ = cheerio.load(html);
  const kinds = ["first", "prev", "next", "last"];
  const states = {};
  kinds.forEach((kind) => {
    const control = $(`[data-kind="${kind}"]`);
    if (!control.length) {
      states[kind] = { present: false };
      return;
    }
    const disabled = control.attr("aria-disabled") === "true" || control.hasClass("pager-button--disabled") || !control.attr("href");
    states[kind] = {
      present: true,
      disabled,
      text: control.text().trim()
    };
  });
  return states;
}

function verifyScenario(label, pagination, expectedDisabled) {
  const html = renderPaginationSnapshot(pagination);
  const states = extractStates(html);
  const pageLabel = `${pagination.currentPage}/${pagination.totalPages}`;
  console.log(`\n[${label}] Page ${pageLabel}`);
  let pass = true;
  Object.entries(states).forEach(([kind, state]) => {
    if (!state.present) {
      pass = false;
      console.log(`  - ${kind}: MISSING BUTTON`);
      return;
    }
    const shouldBeDisabled = expectedDisabled[kind];
    const status = state.disabled ? "disabled" : "enabled";
    const expectedStatus = shouldBeDisabled ? "disabled" : "enabled";
    const matches = state.disabled === shouldBeDisabled;
    if (!matches) pass = false;
    const marker = matches ? "✓" : "✗";
    console.log(`  ${marker} ${kind.padEnd(5)} => ${status} (expected ${expectedStatus})`);
  });
  if (pass) {
    console.log("  Result: PASS – pager button states match expectation.");
  } else {
    console.log("  Result: FAIL – see mismatches above.");
  }
}

function run() {
  verifyScenario(
    "First page",
    { currentPage: 1, totalPages: 4, totalRows: 40, pageSize: 10 },
    { first: true, prev: true, next: false, last: false }
  );
  verifyScenario(
    "Middle page",
    { currentPage: 2, totalPages: 4, totalRows: 40, pageSize: 10 },
    { first: false, prev: false, next: false, last: false }
  );
  verifyScenario(
    "Last page",
    { currentPage: 4, totalPages: 4, totalRows: 40, pageSize: 10 },
    { first: false, prev: false, next: true, last: true }
  );
}

if (require.main === module) {
  run();
}

module.exports = {
  run,
  renderPaginationSnapshot,
  extractStates
};
