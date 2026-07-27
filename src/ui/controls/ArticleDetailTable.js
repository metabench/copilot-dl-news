"use strict";

// ArticleDetailTable — the per-crawl article-detail grid for the crawl-detail
// side-by-side view (crawl-detail grid Phase 3, cycle 63). One row per recently
// downloaded article: Title (link) · Places (chips) · Author · Published · Words.
//
// WHY TableControl, not jsgui3-html's Data_Table (evidence-based, per the plan):
// Data_Table SSR-renders fine, but it descends from jsgui3-html's
// Data_Model_View_Model_Control builtin hierarchy that this repo has NEVER run
// through its own client-activation pipeline (controlManifest + registerControlType +
// ensureControlsRegistered are wired for repo controls). Every table in this repo
// (CrawlJobsTable/UrlListingTable/DomainSummaryTable) extends the repo's TableControl,
// and UrlListingTable is proven to reattach live. So the MVVM record→view need
// (setRecords → mapped rows → re-render) is met by the proven base at far lower
// reattach risk. Verdict recorded in the ledger + the ssr_reattach test.
//
// CONTRAST TRAP (cycle 62): place chips hardcode a background, so they set their own
// explicit text color — never rely on inherited theme color, which flips light/dark.

const { TableControl } = require("./Table");
const { registerControlType } = require("./controlRegistry");

const CONTROL_TYPE = "article_detail_table";

const ARTICLE_DETAIL_COLUMNS = Object.freeze([
  { key: "title", label: "Title", cellClass: "adt-title" },
  { key: "places", label: "Places", cellClass: "adt-places" },
  { key: "author", label: "Author", cellClass: "adt-author" },
  { key: "published", label: "Published", cellClass: "adt-published" },
  { key: "words", label: "Words", align: "right", cellClass: "adt-words" }
]);

function buildColumns() {
  return ARTICLE_DETAIL_COLUMNS.map((c) => ({ ...c }));
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(text, max) {
  const s = String(text == null ? "" : text);
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

// A publication date arrives in mixed formats (ISO "2024-03-19T23:16:06",
// "July 9, 2026", or null). Normalise to YYYY-MM-DD, else the raw trimmed string,
// else the honest em-dash (~half of rows have no date). For an ISO-shaped string we
// take the date portion DIRECTLY (no Date parse) — parsing a TZ-less string then
// reading getUTC* shifts the day across timezones (the crawl-rate string-compare
// bug's cousin). Only non-ISO strings get a Date parse, read via LOCAL components.
function formatPublished(value) {
  if (!value) return "—";
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return truncate(s, 16) || "—";
}

// Places → chips. Chips hardcode a bg so they set an explicit text color
// (contrast trap). Names are DB strings → escaped. No places → empty cell (sparse,
// rendered honestly). `text` is the accessible/plain fallback.
function buildPlacesCell(places) {
  const list = Array.isArray(places) ? places.filter((p) => p && String(p).trim()) : [];
  if (!list.length) return { text: "", classNames: "adt-places" };
  const chips = list
    .map((p) =>
      '<span class="adt-chip" style="display:inline-block;padding:1px 6px;margin:0 3px 2px 0;' +
      'border-radius:9px;background:#2b3a52;color:#cfe0f5;font-size:11px;line-height:1.5;">' +
      escapeHtml(p) +
      "</span>"
    )
    .join("");
  return { html: chips, text: list.join(", "), classNames: "adt-places" };
}

function buildDisplayRows(records) {
  return (Array.isArray(records) ? records : []).map((r) => {
    const title = r.title || "(untitled)";
    return {
      title: r.url
        ? { href: r.url, text: truncate(title, 90), title, target: "_blank", classNames: "adt-title" }
        : { text: truncate(title, 90), title, classNames: "adt-title" },
      places: buildPlacesCell(r.places),
      // Author: byline or authors when present, else honest em-dash (0% until the
      // extraction pipeline lands — plan Phase 5). Never fabricate.
      author: { text: (r.byline || r.authors || "—"), classNames: "adt-author" },
      published: { text: formatPublished(r.publishedDate), classNames: "adt-published" },
      words: { text: r.wordCount != null ? String(r.wordCount) : "—", align: "right", classNames: "adt-words" }
    };
  });
}

class ArticleDetailTableControl extends TableControl {
  constructor(spec = {}) {
    const { columns, records, rows, ...rest } = spec || {};
    const resolvedColumns = Array.isArray(columns) && columns.length ? columns : buildColumns();
    super({ ...rest, columns: resolvedColumns, __type_name: CONTROL_TYPE });
    // Reattach guard: on the client the DOM already exists — don't rebuild.
    if (spec && spec.el) return;
    this.add_class("article-detail-table");
    if (Array.isArray(rows) && rows.length) {
      this.setRows(rows);
    } else if (Array.isArray(records)) {
      this.setRecords(records);
    }
  }

  // MVVM update: set the record model → map to display rows → re-render tbody.
  // Called on the client each poll with the crawl's fresh articles.
  setRecords(records = []) {
    this.setRows(buildDisplayRows(records));
  }

  static buildColumns() {
    return buildColumns();
  }

  static buildDisplayRows(records = []) {
    return buildDisplayRows(records);
  }
}

registerControlType(CONTROL_TYPE, ArticleDetailTableControl);

module.exports = {
  ArticleDetailTableControl,
  CONTROL_TYPE,
  buildColumns,
  buildDisplayRows,
  buildPlacesCell,
  formatPublished,
  escapeHtml,
  truncate
};
