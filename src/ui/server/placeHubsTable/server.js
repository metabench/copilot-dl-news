"use strict";

/**
 * Place Hubs table — browsable listing of discovered place-hub URLs.
 *
 * Composition-only module (coordination-point style): ALL query logic lives
 * in news-crawler-db (listPlaceHubs / countPlaceHubs / getPlaceHubsByKind /
 * getPlaceHubsByHost / getPlaceHubHosts); this file just wires those into an
 * Express router + HTML table for the unified shell. The same ncdb functions
 * also back dataExplorer's standalone /place-hubs view.
 *
 * Filters: host (dropdown), place kind (dropdown w/ counts — countries,
 * cities, regions, …), free-text search (slug/title/URL), pagination.
 * Surfaced gap (docs/review/2026-07-17-place-hub-assessment.md): the
 * gazetteer currently has no village/town kind, so those cannot appear in
 * the kind filter until ingestion adds them.
 */

const express = require("express");
const {
  listPlaceHubs,
  countPlaceHubs,
  getPlaceHubsByKind,
  getPlaceHubsByHost,
  getPlaceHubHosts
} = require("news-crawler-db");

const PAGE_SIZE = 50;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toRawDb(getDbRW) {
  const wrapper = typeof getDbRW === "function" ? getDbRW() : null;
  if (!wrapper) return null;
  const raw = wrapper.db || wrapper;
  return raw && typeof raw.prepare === "function" ? raw : null;
}

function parseFilters(query) {
  const host = (query.host || "").trim() || null;
  const kind = (query.kind || "").trim() || null;
  const search = (query.search || "").trim() || null;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const options = { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
  if (host) options.host = host;
  if (kind) options.placeKind = kind;
  if (search) options.search = search;
  return { host, kind, search, page, options };
}

function buildQueryString(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

function renderPage({ hubs, totalCount, kindStats, hostStats, availableHosts, filters }) {
  const { host, kind, search, page } = filters;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const kindOptions = kindStats.map((k) => {
    const value = k.place_kind || "";
    const label = `${k.place_kind || "(unset)"} (${k.count})`;
    const sel = value === (kind || "") && value !== "" ? " selected" : "";
    return `<option value="${escapeHtml(value)}"${sel}>${escapeHtml(label)}</option>`;
  }).join("");

  const hostOptions = availableHosts.map((h) => {
    const sel = h === host ? " selected" : "";
    return `<option value="${escapeHtml(h)}"${sel}>${escapeHtml(h)}</option>`;
  }).join("");

  const rows = hubs.length ? hubs.map((hub, i) => {
    const url = hub.url || "";
    const classifyHref = url
      ? `/api/v1/place-hubs/classify?url=${encodeURIComponent(url)}`
      : null;
    return `
      <tr>
        <td class="num">${(page - 1) * PAGE_SIZE + i + 1}</td>
        <td>${escapeHtml(hub.place_slug || hub.topic_slug || "-")}</td>
        <td>${escapeHtml(hub.place_kind || hub.topic_kind || "-")}</td>
        <td>${escapeHtml(hub.host || "-")}</td>
        <td class="url">${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>` : "-"}</td>
        <td class="num">${hub.nav_links_count ?? "-"}</td>
        <td class="num">${hub.article_links_count ?? "-"}</td>
        <td>${escapeHtml((hub.last_seen_at || hub.first_seen_at || "-").slice(0, 10))}</td>
        <td>${classifyHref ? `<a href="${escapeHtml(classifyHref)}" target="_blank" rel="noopener">classify</a>` : "-"}</td>
      </tr>`;
  }).join("") : `<tr><td colspan="9" class="empty">No place hubs match the current filters.</td></tr>`;

  const filterSummary = [
    host ? `host: ${host}` : null,
    kind ? `kind: ${kind}` : null,
    search ? `search: "${search}"` : null
  ].filter(Boolean).join(", ");

  const prevHref = page > 1 ? buildQueryString({ host, kind, search, page: page - 1 }) : null;
  const nextHref = page < totalPages ? buildQueryString({ host, kind, search, page: page + 1 }) : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Place Hubs</title>
  <style>
    body { margin: 0; padding: 20px 24px; background: #111213; color: #f3efe6; font-family: Inter, system-ui, sans-serif; }
    h1 { margin: 0 0 4px; font-size: 20px; }
    .sub { color: #b8aa93; margin: 0 0 14px; font-size: 13px; }
    .sub a { color: #d4a574; }
    form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 0 0 14px; }
    select, input[type=text] { background: #1b1c1f; color: #f3efe6; border: 1px solid rgba(212,165,116,.35); padding: 6px 8px; font-size: 13px; }
    button { background: #2a2c31; color: #f3efe6; border: 1px solid rgba(212,165,116,.5); padding: 6px 12px; cursor: pointer; }
    .stats { display: flex; gap: 14px; margin: 0 0 14px; font-size: 13px; color: #b8aa93; }
    .stats b { color: #f3efe6; }
    table { width: 100%; border-collapse: collapse; background: #1b1c1f; border: 1px solid rgba(212,165,116,.35); font-size: 13px; }
    th, td { padding: 7px 10px; border-bottom: 1px solid rgba(212,165,116,.18); text-align: left; vertical-align: top; }
    th { color: #b8aa93; position: sticky; top: 0; background: #1b1c1f; }
    td.num { text-align: right; color: #b8aa93; }
    td.url { max-width: 420px; overflow-wrap: anywhere; }
    td.url a, td a { color: #d4a574; }
    .empty { text-align: center; color: #b8aa93; padding: 18px; }
    .pager { margin: 14px 0 0; display: flex; gap: 12px; font-size: 13px; }
    .pager a { color: #d4a574; }
    .pager .muted { color: #6f6553; }
  </style>
</head>
<body>
  <h1>Place Hubs</h1>
  <p class="sub">
    ${escapeHtml(filterSummary ? `Filtered — ${filterSummary}` : "All discovered place-hub URLs")}
    &nbsp;·&nbsp; <a href="/place-hubs">guessing matrix</a>
    &nbsp;·&nbsp; <a href="/api/v1/place-hubs/review-queue?limit=50" target="_blank" rel="noopener">review queue</a>
  </p>
  <form method="GET" action="">
    <select name="host"><option value="">All hosts (${hostStats.length})</option>${hostOptions}</select>
    <select name="kind"><option value="">All kinds</option>${kindOptions}</select>
    <input type="text" name="search" placeholder="Search slug / title / URL" value="${escapeHtml(search || "")}">
    <button type="submit">Apply</button>
    ${filterSummary ? '<a href="?" style="color:#d4a574;font-size:13px;">clear</a>' : ""}
  </form>
  <div class="stats">
    <span>Total: <b>${totalCount}</b></span>
    <span>Page <b>${page}</b> / ${totalPages}</span>
    <span>Hosts: <b>${hostStats.length}</b></span>
    <span>Kinds: <b>${kindStats.length}</b></span>
  </div>
  <table>
    <thead><tr>
      <th>#</th><th>Place</th><th>Kind</th><th>Host</th><th>URL</th>
      <th>Nav</th><th>Articles</th><th>Seen</th><th>Probe</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="pager">
    ${prevHref ? `<a href="${prevHref}">&larr; Previous</a>` : '<span class="muted">&larr; Previous</span>'}
    ${nextHref ? `<a href="${nextHref}">Next &rarr;</a>` : '<span class="muted">Next &rarr;</span>'}
  </div>
</body>
</html>`;
}

function createPlaceHubsTableRouter({ getDbRW } = {}) {
  const router = express.Router();

  function withDb(res, fn) {
    const db = toRawDb(getDbRW);
    if (!db) {
      res.status(503).json({ status: "error", error: "Database not available" });
      return null;
    }
    return fn(db);
  }

  router.get("/api/list", (req, res) => {
    withDb(res, (db) => {
      const { options } = parseFilters(req.query || {});
      res.json({
        status: "ok",
        total: countPlaceHubs(db, options),
        hubs: listPlaceHubs(db, options),
        kinds: getPlaceHubsByKind(db)
      });
    });
  });

  router.get("/", (req, res) => {
    const db = toRawDb(getDbRW);
    if (!db) {
      res.status(503).type("html").send("<h1>Place Hubs</h1><p>Database not available.</p>");
      return;
    }
    const filters = parseFilters(req.query || {});
    res.type("html").send(renderPage({
      hubs: listPlaceHubs(db, filters.options),
      totalCount: countPlaceHubs(db, filters.options),
      kindStats: getPlaceHubsByKind(db),
      hostStats: getPlaceHubsByHost(db),
      availableHosts: getPlaceHubHosts(db),
      filters
    }));
  });

  return { router };
}

module.exports = { createPlaceHubsTableRouter };
