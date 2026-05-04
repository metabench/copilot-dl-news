"use strict";

const express = require("express");
const { DomainRegistryStore } = require("../../../core/crawler/domains/DomainRegistryStore");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPage(items) {
  const rows = items.length
    ? items.map((item) => `
      <tr>
        <td>${escapeHtml(item.host)}</td>
        <td>${item.enabled ? "Enabled" : "Disabled"}</td>
        <td>${escapeHtml(item.crawlProfile || "-")}</td>
        <td>${escapeHtml(item.preflight && item.preflight.status ? item.preflight.status : "-")}</td>
      </tr>
    `).join("")
    : '<tr><td colspan="4" class="empty">No domains available.</td></tr>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Domain Registry</title>
  <style>
    body { margin: 0; padding: 24px; background: #111213; color: #f3efe6; font-family: Inter, system-ui, sans-serif; }
    h1 { margin: 0 0 16px; }
    table { width: 100%; border-collapse: collapse; background: #1b1c1f; border: 1px solid rgba(212,165,116,.35); }
    th, td { padding: 10px 12px; border-bottom: 1px solid rgba(212,165,116,.18); text-align: left; }
    th { color: #b8aa93; }
    .empty { text-align: center; color: #b8aa93; }
  </style>
</head>
<body>
  <h1>Domain Registry</h1>
  <table>
    <thead><tr><th>Host</th><th>State</th><th>Profile</th><th>Preflight</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

function createDomainRegistryRouter({ getDbRW, includeRootRoute = true, includeApiRoutes = true } = {}) {
  const router = express.Router();

  function getStore() {
    const wrapper = typeof getDbRW === "function" ? getDbRW() : null;
    return new DomainRegistryStore({ db: wrapper });
  }

  if (includeApiRoutes) {
    router.get("/api/domain-registry", (req, res) => {
      const result = getStore().list();
      res.json({ status: "ok", ...result });
    });

    router.get("/api/domain-registry/domains", (req, res) => {
      const result = getStore().list();
      res.json({ status: "ok", ...result });
    });
  }

  if (includeRootRoute) {
    router.get("/", (req, res) => {
      const { items } = getStore().list();
      res.type("html").send(renderPage(items));
    });
  }

  return { router };
}

module.exports = { createDomainRegistryRouter };