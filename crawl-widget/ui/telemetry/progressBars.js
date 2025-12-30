"use strict";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function toNumberOrNull(v) {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function inferPercent(current, total) {
  const c = toNumberOrNull(current);
  const t = toNumberOrNull(total);
  if (c == null || t == null || t <= 0) return null;
  return clamp01(c / t);
}

function formatCount(current, total, unit) {
  const c = toNumberOrNull(current);
  const t = toNumberOrNull(total);
  const u = unit ? ` ${unit}` : "";
  if (c == null && t == null) return "";
  if (t == null || t <= 0) return `${c ?? "?"}${u}`;
  return `${c ?? 0}/${t}${u}`;
}

function renderProgressBarHtml(spec = {}) {
  const label = spec.label ? String(spec.label) : "";
  const current = spec.current;
  const total = spec.total;
  const unit = spec.unit ? String(spec.unit) : "";
  const status = spec.status ? String(spec.status) : "running";
  const isActive = Boolean(spec.isActive);

  const pct = inferPercent(current, total);
  const determinate = pct != null;
  const pctLabel = determinate ? `${Math.round(pct * 100)}%` : "";
  const countLabel = formatCount(current, total, unit);

  const fillStyle = determinate ? `style=\"width:${(pct * 100).toFixed(1)}%\"` : "";
  const indeterminateClass = determinate ? "" : " cw-pbar--indeterminate";
  const activeClass = isActive ? " cw-pbar--active" : "";

  return (
    `<div class=\"cw-pbar cw-pbar--${escapeHtml(status)}${indeterminateClass}${activeClass}\">` +
      `<div class=\"cw-pbar__row\">` +
        `<span class=\"cw-pbar__label\">${escapeHtml(label)}</span>` +
        `<span class=\"cw-pbar__meta\">${escapeHtml(countLabel)}${countLabel && pctLabel ? " · " : ""}${escapeHtml(pctLabel)}</span>` +
      `</div>` +
      `<div class=\"cw-pbar__track\">` +
        `<div class=\"cw-pbar__fill\" ${fillStyle}></div>` +
      `</div>` +
    `</div>`
  );
}

function normalizeProgressNode(node) {
  if (!node || typeof node !== "object") return null;
  const children = Array.isArray(node.children) ? node.children.map(normalizeProgressNode).filter(Boolean) : [];

  return {
    id: node.id != null ? String(node.id) : null,
    label: node.label != null ? String(node.label) : "(unnamed)",
    current: node.current != null ? node.current : null,
    total: node.total != null ? node.total : null,
    unit: node.unit != null ? String(node.unit) : "",
    status: node.status != null ? String(node.status) : "running",
    children
  };
}

function renderProgressTreeHtml(tree, opts = {}) {
  const { maxDepth = 3, maxChildrenPerNode = 40 } = opts;
  const root = normalizeProgressNode(tree?.root || tree);
  if (!root) {
    return "<div class=\"cw-ptree__empty\">(no progress tree)</div>";
  }

  const activePath = Array.isArray(tree?.activePath) ? tree.activePath.map(String) : [];
  const activeSet = new Set(activePath);

  const lines = [];

  function walk(node, depth) {
    const indent = Math.min(depth, 6);
    const idAttr = node.id ? ` data-node-id=\"${escapeHtml(node.id)}\"` : "";
    const activeClass = node.id && activeSet.has(String(node.id)) ? " cw-ptree__node--active" : "";
    const childCount = Array.isArray(node.children) ? node.children.length : 0;
    lines.push(
      `<div class=\"cw-ptree__node${activeClass}\" style=\"--cw-ptree-indent:${indent}\"${idAttr} data-child-count=\"${childCount}\">`
    );
    lines.push(renderProgressBarHtml({ ...node, isActive: Boolean(activeClass) }));
    lines.push(`</div>`);

    if (depth >= maxDepth) return;

    const children = Array.isArray(node.children) ? node.children : [];
    const cap = Number.isFinite(maxChildrenPerNode) ? Math.max(0, maxChildrenPerNode) : 40;
    const visibleChildren = cap > 0 ? children.slice(0, cap) : [];
    const hiddenCount = children.length - visibleChildren.length;

    for (const child of visibleChildren) {
      walk(child, depth + 1);
    }

    if (hiddenCount > 0) {
      const moreNode = {
        id: node.id ? `${node.id}:more` : "more",
        label: `… (${hiddenCount} more)` ,
        current: null,
        total: null,
        unit: "",
        status: "running",
        children: []
      };
      walk(moreNode, depth + 1);
    }
  }

  lines.push('<div class="cw-ptree">');
  walk(root, 0);
  lines.push("</div>");

  return lines.join("");
}

module.exports = {
  renderProgressBarHtml,
  renderProgressTreeHtml,
  normalizeProgressNode
};
