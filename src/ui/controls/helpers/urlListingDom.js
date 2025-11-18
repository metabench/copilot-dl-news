"use strict";

const { formatCount } = require("../UrlListingTable");

function resolveDocument(root) {
  if (!root) {
    if (typeof document !== "undefined") {
      return document;
    }
    return null;
  }
  if (root.ownerDocument) {
    return root.ownerDocument;
  }
  if (root.documentElement) {
    return root;
  }
  if (typeof document !== "undefined") {
    return document;
  }
  return null;
}

function setNodeText(node, text) {
  if (!node) return;
  node.textContent = text == null ? "" : String(text);
}

function applyCellClassList(cell, classNames) {
  if (!cell || !classNames) {
    return;
  }
  const classes = Array.isArray(classNames)
    ? classNames
    : String(classNames)
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
  classes.forEach((cls) => {
    if (cls) {
      cell.classList.add(cls);
    }
  });
}

function createTableCell(doc, column, value) {
  const cell = doc.createElement("td");
  cell.className = "ui-table__cell";
  if (column && column.align) {
    cell.classList.add(`ui-table__cell--${column.align}`);
  }
  if (column && column.cellClass) {
    applyCellClassList(cell, column.cellClass);
  }
  if (value && typeof value === "object") {
    if (value.classNames) {
      applyCellClassList(cell, value.classNames);
    }
  }

  if (value && typeof value === "object" && value.href) {
    const link = doc.createElement("a");
    link.className = "table-link";
    link.textContent = value.text != null ? String(value.text) : value.href;
    link.href = value.href;
    if (value.title) {
      link.title = value.title;
    }
    if (value.target) {
      link.target = value.target;
      link.rel = value.target === "_blank" ? "noopener noreferrer" : link.rel || "";
    }
    cell.appendChild(link);
    return cell;
  }

  if (value && typeof value === "object" && value.text != null) {
    cell.appendChild(doc.createTextNode(String(value.text)));
    return cell;
  }

  cell.appendChild(doc.createTextNode(value == null ? "" : String(value)));
  return cell;
}

function updateListingTable(root, payload = {}) {
  const doc = resolveDocument(root);
  if (!doc) return;
  const table = doc.querySelector("table.ui-table");
  if (!table) return;
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  const incomingColumns = Array.isArray(payload.columns) && payload.columns.length ? payload.columns : null;
  const columns = incomingColumns || table.__copilotListingColumns || null;
  if (!columns || !columns.length) {
    return;
  }
  table.__copilotListingColumns = columns;
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const fragment = doc.createDocumentFragment();
  rows.forEach((row, index) => {
    const tr = doc.createElement("tr");
    tr.className = "ui-table__row";
    if (index % 2 === 1) {
      tr.classList.add("ui-table__row--striped");
    }
    tr.setAttribute("data-row-index", String(index));
    columns.forEach((column) => {
      const cell = createTableCell(doc, column, row ? row[column.key] : null);
      tr.appendChild(cell);
    });
    fragment.appendChild(tr);
  });
  while (tbody.firstChild) {
    tbody.removeChild(tbody.firstChild);
  }
  tbody.appendChild(fragment);
}

function updateListingMeta(root, meta = {}) {
  const doc = resolveDocument(root);
  if (!doc) return;
  const setField = (field, value) => {
    const target = doc.querySelector(`[data-meta-field="${field}"]`);
    if (target) {
      setNodeText(target, value);
    }
  };
  setField("rowCount", formatCount(meta.rowCount ?? 0));
  setField("limit", formatCount(meta.limit ?? 0));
  if (meta.dbLabel) {
    setField("dbLabel", meta.dbLabel);
  }
  if (meta.generatedAt) {
    setField("generatedAt", meta.generatedAt);
  }
}

function updateListingSubtitle(root, subtitle) {
  const doc = resolveDocument(root);
  if (!doc) return;
  const el = doc.querySelector('[data-meta-field="subtitle"]');
  if (el) {
    setNodeText(el, subtitle || "");
  }
}

function safeCount(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(fallback, Math.trunc(numeric));
}

function buildPagerSummary(pagination = {}) {
  if (!pagination || typeof pagination !== "object") {
    return "";
  }
  const page = safeCount(pagination.currentPage, 1) || 1;
  const totalPages = safeCount(pagination.totalPages, 1) || 1;
  const startDisplay = pagination.totalRows === 0 ? 0 : safeCount(pagination.startRow, 0);
  const endDisplay = pagination.totalRows === 0 ? 0 : safeCount(pagination.endRow, 0);
  const totalRows = safeCount(pagination.totalRows, 0) || 0;
  return `Page ${page} of ${totalPages} • Rows ${startDisplay}-${endDisplay} of ${totalRows}`;
}

function applyPagerLink(nav, kind, href, shouldDisable) {
  if (!nav) return;
  const link = nav.querySelector(`[data-pager-link="${kind}"]`);
  if (!link) return;
  if (!href || shouldDisable) {
    link.setAttribute("aria-disabled", "true");
    link.classList.add("pager-button--disabled");
    link.removeAttribute("href");
  } else {
    link.removeAttribute("aria-disabled");
    link.classList.remove("pager-button--disabled");
    link.setAttribute("href", href);
  }
}

function updateListingPagination(root, pagination = {}) {
  const doc = resolveDocument(root);
  if (!doc || !pagination) return;
  const summary = buildPagerSummary(pagination);
  const navs = doc.querySelectorAll("nav.pager");
  navs.forEach((nav) => {
    const info = nav.querySelector("[data-pager-info]");
    if (info) {
      setNodeText(info, summary);
    }
    applyPagerLink(nav, "first", pagination.firstHref, pagination.currentPage === 1);
    applyPagerLink(nav, "prev", pagination.prevHref, pagination.currentPage === 1);
    applyPagerLink(nav, "next", pagination.nextHref, pagination.currentPage === pagination.totalPages);
    applyPagerLink(nav, "last", pagination.lastHref, pagination.currentPage === pagination.totalPages);
  });
}

function applyListingStateToDocument(root, state = {}) {
  if (!state || typeof state !== "object") {
    return;
  }
  updateListingTable(root, state);
  updateListingMeta(root, state.meta || {});
  const subtitle = state.meta && state.meta.subtitle ? state.meta.subtitle : state.subtitle;
  updateListingSubtitle(root, subtitle);
  const pagination = (state.meta && state.meta.pagination) || state.pagination;
  if (pagination) {
    updateListingPagination(root, pagination);
  }
}

module.exports = {
  applyListingStateToDocument,
  updateListingTable,
  updateListingMeta,
  updateListingSubtitle,
  updateListingPagination,
  buildPagerSummary
};
