import {
  require_lang
} from "./chunk-BOXXWBMA.js";

// src/ui/public/index/renderingHelpers.js
var { tof, is_defined, is_array } = require_lang();
function compactDetails(details) {
  if (!is_defined(details)) return "";
  if (tof(details) === "string") return details;
  try {
    const json = JSON.stringify(details, null, 2) || "";
    return json.length > 400 ? json.slice(0, 400) + "\u2026" : json;
  } catch (_) {
    return "";
  }
}
function formatFeatureName(key) {
  if (!is_defined(key)) return "Unknown feature";
  const str = String(key);
  const spaced = str.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim();
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}
function numericValue(entry) {
  if (entry == null) return 0;
  if (tof(entry) === "number" && Number.isFinite(entry)) return entry;
  if (tof(entry) === "object" && is_defined(entry.value)) {
    const n2 = Number(entry.value);
    return Number.isFinite(n2) ? n2 : 0;
  }
  const n = Number(entry);
  return Number.isFinite(n) ? n : 0;
}
function describeEntry(entry) {
  if (!is_defined(entry) || tof(entry) !== "object") return "";
  if (is_defined(entry.description)) return String(entry.description);
  if (is_defined(entry.category)) return String(entry.category);
  return "";
}
function renderFeatureFlags(features, containerEl) {
  if (!is_defined(containerEl)) return;
  containerEl.innerHTML = "";
  containerEl.setAttribute("role", "list");
  const t = tof(features);
  const entries = t === "object" && !is_array(features) ? Object.entries(features) : [];
  if (!entries.length) {
    const span = document.createElement("span");
    span.className = "muted";
    span.textContent = "No advanced feature flags configured.";
    containerEl.appendChild(span);
    return;
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of entries) {
    const row = document.createElement("div");
    row.className = "feature-flags__row";
    row.setAttribute("role", "listitem");
    const badge = document.createElement("span");
    badge.className = value ? "badge badge-ok" : "badge badge-neutral";
    badge.textContent = value ? "On" : "Off";
    row.appendChild(badge);
    const label = document.createElement("span");
    label.textContent = formatFeatureName(key);
    row.appendChild(label);
    containerEl.appendChild(row);
  }
}
function renderAnalysisStatus(summary, options, elements) {
  if (!is_defined(elements) || !is_defined(elements.statusEl)) return;
  const {
    metrics = [],
    muted = false
  } = options || {};
  const summaryText = summary || "No analysis runs yet.";
  if (is_defined(elements.summaryEl)) {
    elements.summaryEl.textContent = summaryText;
  } else {
    const metricsText = metrics.length ? " \xB7 " + metrics.map((entry) => `${entry.label}: ${entry.value}`).join(" \xB7 ") : "";
    elements.statusEl.textContent = summaryText + metricsText;
  }
  if (is_defined(elements.metricsEl)) {
    elements.metricsEl.textContent = "";
    if (metrics.length) {
      for (const entry of metrics) {
        if (!is_defined(entry) || !is_defined(entry.label) || entry.value == null) continue;
        const li = document.createElement("li");
        li.className = "analysis-status__metric";
        const label = document.createElement("span");
        label.className = "analysis-status__metric-label";
        label.textContent = entry.label;
        const value = document.createElement("span");
        value.className = "analysis-status__metric-value";
        value.textContent = entry.value;
        if (is_defined(entry.title)) value.title = entry.title;
        li.appendChild(label);
        li.appendChild(value);
        elements.metricsEl.appendChild(li);
      }
    }
  }
  elements.statusEl.classList.toggle("muted", muted || !summary && !metrics.length);
}
function renderPriorityBonuses(queueConfig, containerEl) {
  if (!is_defined(containerEl)) return;
  containerEl.innerHTML = "";
  containerEl.setAttribute("role", "list");
  const bonuses = is_defined(queueConfig) && tof(queueConfig) === "object" ? queueConfig.bonuses : null;
  const entries = is_defined(bonuses) && tof(bonuses) === "object" ? Object.entries(bonuses) : [];
  if (!entries.length) {
    const span = document.createElement("span");
    span.className = "muted";
    span.textContent = "No priority bonuses configured.";
    containerEl.appendChild(span);
    return;
  }
  entries.sort((a, b) => numericValue(b[1]) - numericValue(a[1]));
  const subset = entries.slice(0, 4);
  for (const [key, raw] of subset) {
    const val = numericValue(raw);
    const row = document.createElement("div");
    row.className = "priority-list__row";
    row.setAttribute("role", "listitem");
    const head = document.createElement("div");
    head.className = "priority-list__head";
    const badge = document.createElement("span");
    badge.className = "badge badge-neutral";
    badge.textContent = `+${val}`;
    head.appendChild(badge);
    const label = document.createElement("strong");
    label.textContent = formatFeatureName(key);
    head.appendChild(label);
    row.appendChild(head);
    const desc = describeEntry(raw);
    if (desc) {
      const detail = document.createElement("span");
      detail.className = "priority-list__detail muted";
      detail.textContent = desc;
      row.appendChild(detail);
    }
    containerEl.appendChild(row);
  }
}
function renderPriorityWeights(queueConfig, containerEl) {
  if (!is_defined(containerEl)) return;
  containerEl.innerHTML = "";
  containerEl.setAttribute("role", "list");
  const weights = is_defined(queueConfig) && tof(queueConfig) === "object" ? queueConfig.weights : null;
  const entries = is_defined(weights) && tof(weights) === "object" ? Object.entries(weights) : [];
  if (!entries.length) {
    const span = document.createElement("span");
    span.className = "muted";
    span.textContent = "No queue weights configured.";
    containerEl.appendChild(span);
    return;
  }
  entries.sort((a, b) => numericValue(a[1]) - numericValue(b[1]));
  const subset = entries.slice(0, 4);
  for (const [key, raw] of subset) {
    const val = numericValue(raw);
    const row = document.createElement("div");
    row.className = "priority-list__row";
    row.setAttribute("role", "listitem");
    const head = document.createElement("div");
    head.className = "priority-list__head";
    const badge = document.createElement("span");
    badge.className = "badge badge-neutral";
    badge.textContent = `${val}`;
    head.appendChild(badge);
    const label = document.createElement("strong");
    label.textContent = formatFeatureName(key);
    head.appendChild(label);
    row.appendChild(head);
    const desc = describeEntry(raw);
    if (desc) {
      const detail = document.createElement("span");
      detail.className = "priority-list__detail muted";
      detail.textContent = desc;
      row.appendChild(detail);
    }
    containerEl.appendChild(row);
  }
}
function renderStructureSummary(structure, elements, formatNumber, formatRelativeTime) {
  if (!is_defined(elements) || !is_defined(elements.panel)) return null;
  const lastStructureSummary = is_defined(structure) && tof(structure) === "object" ? { ...structure } : null;
  if (!is_defined(structure) || tof(structure) !== "object") {
    elements.panel.dataset.hasData = "0";
    if (is_defined(elements.navPages)) elements.navPages.textContent = "0";
    if (is_defined(elements.articlesSkipped)) elements.articlesSkipped.textContent = "0";
    if (is_defined(elements.topSections)) {
      elements.topSections.textContent = "";
      const emptyItem = document.createElement("li");
      emptyItem.className = "structure-list__empty";
      emptyItem.textContent = "No sections discovered yet.";
      elements.topSections.appendChild(emptyItem);
    }
    if (is_defined(elements.updated)) {
      elements.updated.textContent = "Awaiting crawl activity\u2026";
    }
    if (elements.panel.dataset.active === "1") {
      elements.panel.style.display = "";
    }
    return lastStructureSummary;
  }
  elements.panel.dataset.hasData = "1";
  elements.panel.style.display = "";
  if (is_defined(elements.navPages)) {
    elements.navPages.textContent = formatNumber(structure.navPagesVisited || 0);
  }
  if (is_defined(elements.articlesSkipped)) {
    elements.articlesSkipped.textContent = formatNumber(structure.articleCandidatesSkipped || 0);
  }
  if (is_defined(elements.topSections)) {
    elements.topSections.textContent = "";
    const frag = document.createDocumentFragment();
    const entries = tof(structure.topSections) === "array" ? structure.topSections : [];
    if (entries.length) {
      for (const entry of entries) {
        if (!is_defined(entry)) continue;
        const li = document.createElement("li");
        const name = document.createElement("span");
        name.textContent = entry.section || "/";
        const count = document.createElement("span");
        count.className = "structure-list__count";
        count.textContent = formatNumber(entry.count || 0);
        li.appendChild(name);
        li.appendChild(count);
        frag.appendChild(li);
      }
    } else {
      const emptyItem = document.createElement("li");
      emptyItem.className = "structure-list__empty";
      emptyItem.textContent = "No sections discovered yet.";
      frag.appendChild(emptyItem);
    }
    elements.topSections.appendChild(frag);
  }
  if (is_defined(elements.updated)) {
    const updatedLabel = is_defined(structure.updatedAt) ? `Updated ${formatRelativeTime(structure.updatedAt)}` : "Updated just now";
    elements.updated.textContent = updatedLabel;
  }
  return lastStructureSummary;
}

export {
  compactDetails,
  formatFeatureName,
  numericValue,
  describeEntry,
  renderFeatureFlags,
  renderAnalysisStatus,
  renderPriorityBonuses,
  renderPriorityWeights,
  renderStructureSummary
};
