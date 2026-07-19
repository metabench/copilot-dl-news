'use strict';

/**
 * Crawl status page styles — Visual Studio 2005 light theme.
 *
 * Palette/typography come from the jsgui3-html Admin_Theme 'vs-2005'
 * preset (--admin-* variables; Admin_Theme.css is injected ahead of this
 * sheet by CrawlStatusPage). Every var() carries a hard fallback so the
 * page still renders true-to-theme if served standalone.
 *
 * The look: warm tan chrome (#ECE9D8), Tahoma 11px, Luna-blue accents
 * (#316AC5), gradient tool-window headers, square corners, an XP-style
 * caption bar and a proper sunken status bar.
 */

module.exports = `
* { box-sizing: border-box; }

html, body { height: 100%; }

body.vs-shell {
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  background: var(--admin-bg, #ECE9D8);
  color: var(--admin-text, #000);
  font-family: var(--admin-font, Tahoma, 'MS Shell Dlg 2', 'Segoe UI', sans-serif);
  font-size: var(--admin-font-size, 11px);
}

.mono { font-family: var(--admin-font-mono, 'Courier New', monospace); font-size: 11px; }

/* ── Caption bar (XP active-title gradient) ─────────────────────── */
.vs-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 8px;
  background: linear-gradient(to bottom, #3B77D3 0%, #1E5299 55%, #16418B 100%);
  border-bottom: 1px solid #0A246A;
  color: #fff;
}
.vs-caption-left { display: flex; align-items: center; gap: 7px; min-width: 0; }
.vs-caption-glyph {
  display: inline-block;
  width: 14px; height: 14px; line-height: 14px;
  text-align: center;
  font-size: 10px;
  background: #fff;
  color: #1E5299;
  border: 1px solid #0A246A;
  border-radius: 2px;
}
.vs-caption h1 {
  margin: 0;
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 0.2px;
  text-shadow: 1px 1px 0 rgba(10, 36, 106, 0.6);
  white-space: nowrap;
}
.vs-caption .meta { color: #D5E1F5; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vs-caption .meta .mono { color: #fff; font-size: 10px; }

/* ── Toolbar (start-crawl form) ─────────────────────────────────── */
.vs-toolbar {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 5px 8px 6px;
  background: linear-gradient(to bottom, #FEFEFB 0%, #F1EEE1 55%, #DDD9C7 100%);
  border-bottom: 1px solid var(--admin-border, #ACA899);
  box-shadow: inset 0 1px 0 #fff;
}
.vs-tool-field { display: flex; flex-direction: column; gap: 2px; }
.vs-tool-field-grow { flex: 1 1 260px; }
.vs-tool-field label,
.start-field label {
  font-size: 10px;
  color: var(--admin-text-secondary, #444437);
}
.vs-tool-actions { display: flex; align-items: center; gap: 6px; padding-bottom: 1px; }
.vs-tool-sep {
  width: 1px;
  align-self: stretch;
  margin: 1px 2px;
  background: linear-gradient(to bottom, transparent, #ACA899, transparent);
}
.vs-tool-link, .vs-statusbar .links a {
  color: var(--admin-accent, #316AC5);
  text-decoration: none;
}
.vs-tool-link:hover, .vs-statusbar .links a:hover { text-decoration: underline; }

/* ── Inputs (classic XP field chrome) ───────────────────────────── */
input, select, textarea {
  font-family: inherit;
  font-size: var(--admin-font-size, 11px);
  color: var(--admin-text, #000);
  background: #fff;
  border: 1px solid #7F9DB9;
  border-radius: 0;
  padding: 3px 5px;
}
input:focus, select:focus, textarea:focus {
  outline: 1px solid var(--admin-border-accent, #316AC5);
  outline-offset: -1px;
}
select { padding: 2px 3px; }
textarea { min-height: 72px; width: 100%; font-family: var(--admin-font-mono, 'Courier New', monospace); }

/* ── Buttons (Luna) ─────────────────────────────────────────────── */
button, .vs-btn {
  font-family: inherit;
  font-size: var(--admin-font-size, 11px);
  color: var(--admin-text, #000);
  padding: 3px 14px;
  background: linear-gradient(to bottom, #FFFFFF 0%, #F1EFE4 60%, #E3E0D0 100%);
  border: 1px solid #8CA0B8;
  border-radius: 3px;
  box-shadow: inset 0 1px 0 #fff;
  cursor: pointer;
}
button:hover, .vs-btn:hover {
  border-color: var(--admin-border-accent, #316AC5);
  background: linear-gradient(to bottom, #FFFFFF 0%, #EAF1FB 60%, #DFE7F5 100%);
}
button:active, .vs-btn:active {
  background: linear-gradient(to bottom, #DFE7F5 0%, #EAF1FB 100%);
  box-shadow: inset 0 1px 2px rgba(49, 106, 197, 0.3);
}
button:disabled { color: var(--admin-text-muted, #7F7D6F); border-color: #ACA899; background: #ECE9D8; cursor: default; }
.vs-btn-primary { font-weight: bold; border-color: var(--admin-border-accent, #316AC5); }

/* ── Info strip + advanced ──────────────────────────────────────── */
.vs-infostrip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 3px 8px;
  background: var(--admin-stripe-bg, #F7F6EF);
  border-bottom: 1px solid #D8D4C3;
  color: var(--admin-text-secondary, #444437);
}
.start-meta { white-space: nowrap; }
.start-status { text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.start-advanced {
  margin: 0;
  border-bottom: 1px solid #D8D4C3;
  background: var(--admin-stripe-bg, #F7F6EF);
}
.start-advanced summary {
  padding: 3px 8px;
  cursor: pointer;
  color: var(--admin-accent, #316AC5);
  user-select: none;
}
.start-advanced summary:hover { background: var(--admin-hover-bg, #DFE7F5); }
.start-advanced-body {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 8px;
  padding: 8px;
  border-top: 1px dotted #C6C2B0;
}
.start-advanced-body .start-field { display: flex; flex-direction: column; gap: 2px; }

/* ── Tool windows ───────────────────────────────────────────────── */
.tool-window {
  margin: 8px;
  border: 1px solid var(--admin-border, #ACA899);
  background: var(--admin-card-bg, #F5F4EA);
  box-shadow: var(--admin-shadow, 0 1px 2px rgba(90, 86, 68, 0.18));
}
.tool-window-header, .crawl-batch h2 {
  margin: 0;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: bold;
  color: var(--admin-header-text, #33322A);
  background: var(--admin-header-bg, linear-gradient(to bottom, #FDFCF9 0%, #EBE8DA 55%, #DCD8C6 100%));
  border-bottom: 1px solid var(--admin-border, #ACA899);
}
.tool-window-body { padding: 8px; }
.tool-window-activity { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; }
.tool-window-activity .tool-window-body { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; }

/* Batch launcher (CrawlBatchLauncherControl) inside its tool window */
.tool-window-batch { padding: 0; }
.crawl-batch { margin: 0; border: 0; background: transparent; padding: 0; }
.crawl-batch-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--admin-header-bg, linear-gradient(to bottom, #FDFCF9 0%, #EBE8DA 55%, #DCD8C6 100%));
  border-bottom: 1px solid var(--admin-border, #ACA899);
  padding-right: 8px;
}
.crawl-batch-header h2 { border-bottom: 0; background: transparent; }
.crawl-batch-metrics { display: flex; gap: 6px; padding: 3px 0; }
.crawl-batch-metric {
  min-width: 58px;
  padding: 2px 8px;
  text-align: center;
  background: #fff;
  border: 1px solid #C6C2B0;
  border-radius: 2px;
}
.crawl-batch-metric span { display: block; font-weight: bold; color: var(--admin-accent, #316AC5); font-size: 13px; }
.crawl-batch-metric small { color: var(--admin-text-muted, #7F7D6F); font-size: 9px; text-transform: lowercase; }
.crawl-batch-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr auto;
  gap: 8px;
  align-items: end;
  padding: 8px;
}
.crawl-batch-actions { display: flex; align-items: end; }
.crawl-batch-status { padding: 0 8px 6px; color: var(--admin-text-secondary, #444437); }

/* ── Throughput / remote-fetch strips ───────────────────────────── */
.throughput-strip {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  margin: 0 0 8px;
}
.remote-fetch-strip { grid-template-columns: minmax(0, 1.6fr) repeat(5, minmax(0, 1fr)); }
.throughput-item {
  background: #fff;
  border: 1px solid #C6C2B0;
  border-radius: 2px;
  padding: 5px 8px;
  box-shadow: inset 0 1px 0 #fff;
}
.throughput-item span {
  display: block;
  font-size: 17px;
  font-weight: bold;
  color: #003399;
  line-height: 1.2;
}
.throughput-item small { color: var(--admin-text-muted, #7F7D6F); font-size: 10px; }
.remote-fetch-strip .throughput-item span { font-size: 15px; }
.remote-fetch-title span { color: var(--admin-success, #2C7D2C); }
[data-crawl-remote-fetch-health="unhealthy"] .remote-fetch-title span { color: var(--admin-danger, #C43C35); }
[data-crawl-remote-fetch-health="unknown"] .remote-fetch-title span { color: var(--admin-text-muted, #7F7D6F); }
.remote-fetch-title small { word-break: break-all; }

/* ── Jobs grid (VS2005 list view) ───────────────────────────────── */
.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--admin-border, #ACA899);
  background: #fff;
  flex: 1 1 auto;
}
table {
  border-collapse: collapse;
  width: 100%;
  background: #fff;
  font-family: inherit;
  font-size: var(--admin-font-size, 11px);
}
th, td { font-size: var(--admin-font-size, 11px); }
th {
  text-align: left;
  font-weight: normal;
  color: var(--admin-text, #000);
  padding: var(--admin-cell-padding, 3px 7px);
  background: linear-gradient(to bottom, #FEFEFB 0%, #F0EDDF 60%, #DDD9C7 100%);
  border-right: 1px solid #D8D4C3;
  border-bottom: 1px solid var(--admin-border, #ACA899);
  white-space: nowrap;
}
th:last-child { border-right: 0; }
td {
  padding: var(--admin-cell-padding, 3px 7px);
  border-bottom: 1px solid #EFECE2;
  vertical-align: middle;
}
tbody tr:nth-child(even) { background: var(--admin-stripe-bg, #F7F6EF); }
tbody tr:hover { background: var(--admin-hover-bg, #DFE7F5); }
td button { padding: 1px 9px; }
.empty { color: var(--admin-text-muted, #7F7D6F); text-align: center; padding: 14px; }

.bar {
  width: 120px;
  height: 12px;
  border: 1px solid #7F9DB9;
  background: #fff;
  border-radius: 0;
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: linear-gradient(to bottom, #6C9CE0 0%, #316AC5 50%, #2A5CA9 100%);
}

/* ── Status bar (sunken panes) ──────────────────────────────────── */
.vs-statusbar {
  display: flex;
  align-items: stretch;
  gap: 3px;
  padding: 3px 4px;
  margin-top: auto;
  background: var(--admin-bg, #ECE9D8);
  border-top: 1px solid #fff;
  box-shadow: 0 -1px 0 var(--admin-border, #ACA899);
}
.vs-statusbar-pane {
  padding: 2px 8px;
  border: 1px solid;
  border-color: #9D9A88 #FFFFFF #FFFFFF #9D9A88;
  background: var(--admin-bg, #ECE9D8);
  white-space: nowrap;
}
.vs-statusbar-main { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; }
.vs-statusbar .links { display: flex; gap: 10px; overflow: hidden; }

.screenshot-ready-marker { position: absolute; left: -9999px; top: -9999px; }

/* ── Small screens ──────────────────────────────────────────────── */
@media (max-width: 720px) {
  .vs-caption { flex-direction: column; align-items: flex-start; gap: 2px; }
  .vs-toolbar { flex-wrap: wrap; align-items: stretch; }
  .vs-tool-field-grow { flex-basis: 100%; }
  .vs-infostrip { flex-direction: column; align-items: flex-start; gap: 2px; }
  .start-status { text-align: left; }
  .start-advanced-body { grid-template-columns: 1fr; }
  .crawl-batch-grid { grid-template-columns: 1fr 1fr; }
  .throughput-strip, .remote-fetch-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .vs-statusbar { flex-wrap: wrap; }
  .table-wrap { overflow-x: auto; }
  .detail-grid { grid-template-columns: 1fr; }
}

/* ── Phase badge + expandable job detail ────────────────────────── */
/* Coarse lifecycle phase shown next to a running job's status so the crawl is
   legible before the first page download (esp. the sitemap-fetch phase). */
.phase-badge {
  display: inline-block; margin-left: 6px; padding: 0 6px;
  font-size: 9px; line-height: 15px; text-transform: uppercase; letter-spacing: .3px;
  color: #fff; background: var(--admin-accent, #316AC5);
  border: 1px solid #2A5CA9; border-radius: 2px; vertical-align: middle;
}
.phase-badge[data-phase="sitemaps"] { background: #7A5CC5; border-color: #5E43A8; }
.phase-badge[data-phase="robots"] { background: #B8860B; border-color: #8A6508; }
.phase-badge[data-phase="crawling"] { background: var(--admin-success, #2C7D2C); border-color: #1F5E1F; }
.phase-badge[data-phase="preparing"] { background: #6B7A8F; border-color: #51606F; }
/* Disclosure caret; lives inside the Job cell so the column count stays 9. */
.detail-toggle {
  padding: 0 4px; margin-right: 4px; font-size: 10px; line-height: 1;
  color: var(--admin-accent, #316AC5); background: transparent;
  border: 1px solid transparent; border-radius: 2px; box-shadow: none; cursor: pointer;
}
.detail-toggle:hover { background: var(--admin-hover-bg, #DFE7F5); border-color: var(--admin-border, #ACA899); }
.detail-toggle[aria-expanded="true"] { color: #16418B; }
/* Second <tr> per job, hidden until its caret is clicked. */
tr.detail-row[hidden] { display: none; }
tr.detail-row > .detail-cell { padding: 0; background: var(--admin-stripe-bg, #F7F6EF); border-bottom: 1px solid var(--admin-border, #ACA899); }
tbody tr.detail-row:hover { background: var(--admin-stripe-bg, #F7F6EF); }
.detail-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 10px; padding: 8px 10px 10px 26px;
}
.detail-block h4 {
  margin: 0 0 4px; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: .3px;
  color: var(--admin-text-secondary, #444437); border-bottom: 1px solid #D8D4C3; padding-bottom: 2px;
}
.detail-list { margin: 0; padding-left: 16px; list-style: square; }
.detail-list li { padding: 1px 0; word-break: break-all; }
.detail-list.mono, .detail-limits .mono { font-family: var(--admin-font-mono, 'Courier New', monospace); }
.detail-empty { margin: 0; color: var(--admin-text-muted, #7F7D6F); font-style: italic; }
.detail-meta { margin: 0 0 4px; color: var(--admin-text-secondary, #444437); }
.detail-limits { width: 100%; border-collapse: collapse; }
.detail-limits th, .detail-limits td { padding: 1px 6px; border-bottom: 1px solid #EFECE2; font-size: 10px; text-align: left; white-space: nowrap; }
.badge-limited { display: inline-block; padding: 0 5px; font-size: 9px; color: #fff; background: var(--admin-danger, #C43C35); border-radius: 2px; }
/* Per-sitemap fetch status glyph */
.detail-sitemaps li { list-style: none; margin-left: -16px; }
.sm-status { display: inline-block; width: 12px; text-align: center; font-weight: bold; }
.sm-fetched { color: var(--admin-success, #2C7D2C); }
.sm-failed { color: var(--admin-danger, #C43C35); }
.sm-pending { color: var(--admin-text-muted, #7F7D6F); }
`;
