/**
 * @jest-environment jsdom
 */
"use strict";

// ArticleDetailTable unit + SSR/reattach test (crawl-detail grid Phase 3, cycle 63).
// Covers the record→display mapping, the SSR HTML structure, the isomorphic reattach
// GUARD (constructing with {el} must NOT rebuild — the V7/V8 double-DOM bug class),
// the setRecords MVVM update, and the CONTRAST TRAP (chips set an explicit text color).

const jsgui = require("jsgui3-html");
const {
  ArticleDetailTableControl,
  buildDisplayRows,
  buildPlacesCell,
  formatPublished
} = require("../ArticleDetailTable");

const SAMPLE = [
  {
    url: "https://apnews.com/article/gullah-geechee-13ef",
    host: "apnews.com",
    title: "Georgia's highest court sides with slave descendants",
    publishedDate: "2025-09-30T16:16:01",
    wordCount: 702,
    byline: null,
    authors: null,
    places: ["Georgia", "Sapelo Island"]
  },
  {
    url: "https://www.theguardian.com/world/2026/jul/09/some-real-report-here",
    host: "www.theguardian.com",
    title: "A very long headline that should get truncated because it exceeds the ninety character display budget by a lot",
    publishedDate: null,
    wordCount: 1890,
    byline: "By A. Reporter",
    authors: null,
    places: []
  }
];

describe("ArticleDetailTable — record → display mapping", () => {
  const rows = buildDisplayRows(SAMPLE);

  test("title cell is a link (new tab) with full title in the tooltip; truncated text", () => {
    expect(rows[0].title.href).toBe(SAMPLE[0].url);
    expect(rows[0].title.target).toBe("_blank");
    expect(rows[0].title.title).toBe(SAMPLE[0].title); // full, untruncated
    expect(rows[1].title.text.length).toBeLessThanOrEqual(90);
    expect(rows[1].title.text.endsWith("…")).toBe(true); // truncated
  });

  test("author is byline when present, honest em-dash when absent (author gap)", () => {
    expect(rows[0].author.text).toBe("—");           // no byline/authors -> em-dash
    expect(rows[1].author.text).toBe("By A. Reporter");
  });

  test("words are the stored count, em-dash when null; right-aligned", () => {
    expect(rows[0].words.text).toBe("702");
    expect(rows[0].words.align).toBe("right");
  });

  test("published normalises mixed formats; em-dash when null (sparse)", () => {
    expect(formatPublished("2025-09-30T16:16:01")).toBe("2025-09-30");
    expect(formatPublished("July 9, 2026")).toBe("2026-07-09");
    expect(formatPublished(null)).toBe("—");
    expect(rows[1].published.text).toBe("—");
  });

  test("places render as chips WITH an explicit text color (contrast trap); empty when none", () => {
    const cell = buildPlacesCell(["Georgia", "Sapelo Island"]);
    expect(cell.html).toContain("Georgia");
    expect(cell.html).toContain("Sapelo Island");
    expect(cell.html).toContain("color:#cfe0f5"); // explicit fg on the hardcoded chip bg
    expect(cell.text).toBe("Georgia, Sapelo Island");
    // no places -> empty cell, rendered honestly
    expect(buildPlacesCell([]).html).toBeUndefined();
    expect(buildPlacesCell([]).text).toBe("");
  });

  test("place names are HTML-escaped (no injection via DB strings)", () => {
    const cell = buildPlacesCell(['<script>x</script>']);
    expect(cell.html).not.toContain("<script>");
    expect(cell.html).toContain("&lt;script&gt;");
  });
});

describe("ArticleDetailTable — SSR render + isomorphic reattach", () => {
  const render = (records) => {
    const ctx = new jsgui.Page_Context();
    const ctrl = new ArticleDetailTableControl({ context: ctx, records });
    return { ctrl, html: ctrl.all_html_render() };
  };

  test("SSR renders a <table> with the 5 column headers and the row data", () => {
    const { html } = render(SAMPLE);
    expect(html).toContain("<table");
    for (const label of ["Title", "Places", "Author", "Published", "Words"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Georgia"); // a place chip
    expect(html).toContain('target="_blank"'); // title link
    expect(html).toContain("702"); // word count
  });

  test("reattach GUARD: constructing with {el} does NOT rebuild (no double-DOM)", () => {
    const ctx = new jsgui.Page_Context();
    const el = document.createElement("table");
    const ctrl = new ArticleDetailTableControl({ context: ctx, el, records: SAMPLE });
    // The guard returned before compose()/setRecords() — no rows were built.
    expect(ctrl._rows.length).toBe(0);
  });

  test("setRecords is the MVVM update: re-rendering reflects the new records", () => {
    const { ctrl } = render(SAMPLE);
    expect(ctrl._rows.length).toBe(2);
    ctrl.setRecords([SAMPLE[0]]);
    expect(ctrl._rows.length).toBe(1);
    const html = ctrl.all_html_render();
    expect(html).toContain("Georgia");
    expect(html).not.toContain("A. Reporter"); // the dropped row is gone
  });

  test("registered under its control type for client activation", () => {
    const { listControlTypes } = require("../controlManifest");
    expect(listControlTypes()).toContain("article_detail_table");
  });
});
