// src/ui/shared/telemetry/telemetryRenderer.js
function formatTelemetryEntry(entry) {
  if (!entry || typeof entry !== "object") {
    const fallbackTimestamp = Date.now();
    return {
      type: "info",
      stage: "unknown",
      message: "Invalid telemetry entry",
      timestamp: fallbackTimestamp,
      context: {},
      severity: "low",
      icon: getIcon("info", "low"),
      relativeTime: formatRelativeTime(fallbackTimestamp),
      formattedTimestamp: new Date(fallbackTimestamp).toISOString()
    };
  }
  const rawType = entry.type || entry.event || "info";
  const normalizedTimestamp = normalizeTelemetryTimestamp(entry);
  const severity = getSeverity(rawType);
  const icon = getIcon(rawType, severity);
  const relativeTime = formatRelativeTime(normalizedTimestamp);
  return {
    type: rawType,
    stage: entry.stage || entry.context?.stage || entry.details?.stage || "unknown",
    message: entry.message || entry.details || "",
    timestamp: normalizedTimestamp,
    context: entry.context || entry.details || {},
    severity,
    icon,
    relativeTime,
    formattedTimestamp: new Date(normalizedTimestamp).toISOString()
  };
}
function getSeverity(type) {
  const severityMap = {
    error: "critical",
    failed: "critical",
    warning: "high",
    stage_transition: "medium",
    started: "medium",
    completed: "low",
    skipped: "low",
    info: "low"
  };
  return severityMap[type] || "low";
}
function getIcon(type, severity) {
  const iconMap = {
    error: "\u274C",
    failed: "\u274C",
    warning: "\u26A0\uFE0F",
    started: "\u{1F680}",
    completed: "\u2705",
    skipped: "\u23ED\uFE0F",
    stage_transition: "\u27A1\uFE0F",
    info: "\u2139\uFE0F"
  };
  return iconMap[type] || "\u2022";
}
function normalizeTelemetryTimestamp(entry) {
  const candidates = [
    entry.timestamp,
    entry.ts,
    entry.time,
    entry.date,
    entry.createdAt,
    entry.updatedAt
  ];
  for (const candidate of candidates) {
    if (candidate === void 0 || candidate === null) continue;
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    if (candidate instanceof Date) {
      const value = candidate.getTime();
      if (Number.isFinite(value)) return value;
      continue;
    }
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      const parsed = Date.parse(candidate);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }
  return Date.now();
}
function formatRelativeTime(timestamp) {
  if (!timestamp) return "unknown time";
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 1e3) return "just now";
  if (diff < 6e4) return `${Math.floor(diff / 1e3)}s ago`;
  if (diff < 36e5) return `${Math.floor(diff / 6e4)}m ago`;
  if (diff < 864e5) return `${Math.floor(diff / 36e5)}h ago`;
  return `${Math.floor(diff / 864e5)}d ago`;
}
function renderTelemetryEntry(entry, options = {}) {
  const {
    showTimestamp = true,
    showIcon = true,
    showStage = true,
    compact = false
  } = options;
  const formatted = formatTelemetryEntry(entry);
  const classes = [
    "telemetry-entry",
    `telemetry-entry--${formatted.type}`,
    `telemetry-entry--${formatted.severity}`,
    compact ? "telemetry-entry--compact" : ""
  ].filter(Boolean).join(" ");
  const parts = [];
  if (showIcon) {
    parts.push(`<span class="telemetry-entry__icon" aria-hidden="true">${formatted.icon}</span>`);
  }
  if (showStage) {
    parts.push(`<span class="telemetry-entry__stage">${escapeHtml(formatted.stage)}</span>`);
  }
  parts.push(`<span class="telemetry-entry__message">${escapeHtml(formatted.message)}</span>`);
  if (showTimestamp) {
    parts.push(`<span class="telemetry-entry__time" title="${formatted.formattedTimestamp}">${formatted.relativeTime}</span>`);
  }
  return `<div class="${classes}">${parts.join("")}</div>`;
}
function renderTelemetryList(entries, options = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return '<div class="telemetry-list telemetry-list--empty">No telemetry events yet.</div>';
  }
  const items = entries.map((entry) => renderTelemetryEntry(entry, options)).join("\n");
  return `<div class="telemetry-list">${items}</div>`;
}
function getTelemetryStats(entries) {
  if (!Array.isArray(entries)) {
    return { total: 0, errors: 0, warnings: 0, stages: 0 };
  }
  return entries.reduce((stats, entry) => {
    stats.total++;
    if (entry.type === "error" || entry.type === "failed") stats.errors++;
    if (entry.type === "warning") stats.warnings++;
    if (entry.type === "stage_transition" || entry.type === "started") stats.stages++;
    return stats;
  }, { total: 0, errors: 0, warnings: 0, stages: 0 });
}
function filterTelemetryByType(entries, types) {
  if (!Array.isArray(entries)) return [];
  const typeArray = Array.isArray(types) ? types : [types];
  return entries.filter((entry) => typeArray.includes(entry.type));
}
function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function parseTelemetryFromConsole(line) {
  if (typeof line !== "string") return null;
  const match = line.match(/^\[TELEMETRY\]\s*(.+)$/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (err) {
    return null;
  }
}

// src/ui/express/public/components/TelemetryDisplay.js
function createTelemetryDisplay(options = {}) {
  const {
    container,
    maxEntries = 100,
    autoScroll = true,
    showStats = true,
    filterTypes = null
  } = options;
  if (!container || !(container instanceof HTMLElement)) {
    throw new Error("TelemetryDisplay requires a valid container element");
  }
  const state = {
    entries: [],
    isVisible: true,
    isPaused: false
  };
  const wrapper = document.createElement("div");
  wrapper.className = "telemetry-display";
  let statsContainer = null;
  if (showStats) {
    statsContainer = document.createElement("div");
    statsContainer.className = "telemetry-stats";
    wrapper.appendChild(statsContainer);
  }
  const listContainer = document.createElement("div");
  listContainer.className = "telemetry-list-container";
  wrapper.appendChild(listContainer);
  container.appendChild(wrapper);
  function addEntry(entry) {
    if (state.isPaused) return;
    if (filterTypes && !filterTypes.includes(entry.type)) {
      return;
    }
    state.entries.push(entry);
    if (state.entries.length > maxEntries) {
      state.entries = state.entries.slice(-maxEntries);
    }
    render();
  }
  function addEntries(entries) {
    if (state.isPaused || !Array.isArray(entries)) return;
    entries.forEach((entry) => {
      if (!filterTypes || filterTypes.includes(entry.type)) {
        state.entries.push(entry);
      }
    });
    if (state.entries.length > maxEntries) {
      state.entries = state.entries.slice(-maxEntries);
    }
    render();
  }
  function addFromConsole(line) {
    const parsed = parseTelemetryFromConsole(line);
    if (parsed) {
      addEntry(parsed);
    }
  }
  function clear() {
    state.entries = [];
    render();
  }
  function setPaused(paused) {
    state.isPaused = !!paused;
  }
  function setVisible(visible) {
    state.isVisible = !!visible;
    wrapper.style.display = visible ? "" : "none";
  }
  function getEntries() {
    return [...state.entries];
  }
  function getFilteredEntries(types) {
    return filterTelemetryByType(state.entries, types);
  }
  function getStats() {
    return getTelemetryStats(state.entries);
  }
  function render() {
    if (!state.isVisible) return;
    if (showStats && statsContainer) {
      const stats = getStats();
      statsContainer.innerHTML = `
        <div class="telemetry-stats__item">
          <span class="telemetry-stats__item-label">Total:</span>
          <span class="telemetry-stats__item-value">${stats.total}</span>
        </div>
        <div class="telemetry-stats__item">
          <span class="telemetry-stats__item-label">Stages:</span>
          <span class="telemetry-stats__item-value">${stats.stages}</span>
        </div>
        <div class="telemetry-stats__item">
          <span class="telemetry-stats__item-label">Warnings:</span>
          <span class="telemetry-stats__item-value">${stats.warnings}</span>
        </div>
        <div class="telemetry-stats__item">
          <span class="telemetry-stats__item-label">Errors:</span>
          <span class="telemetry-stats__item-value">${stats.errors}</span>
        </div>
      `;
    }
    const html = renderTelemetryList(state.entries, {
      showTimestamp: true,
      showIcon: true,
      showStage: true,
      compact: false
    });
    listContainer.innerHTML = html;
    if (autoScroll) {
      const listEl = listContainer.querySelector(".telemetry-list");
      if (listEl) {
        listEl.scrollTop = listEl.scrollHeight;
      }
    }
  }
  function destroy() {
    wrapper.remove();
    state.entries = [];
  }
  render();
  return {
    addEntry,
    addEntries,
    addFromConsole,
    clear,
    setPaused,
    setVisible,
    getEntries,
    getFilteredEntries,
    getStats,
    render,
    destroy
  };
}
export {
  createTelemetryDisplay
};
//# sourceMappingURL=TelemetryDisplay.js.map
