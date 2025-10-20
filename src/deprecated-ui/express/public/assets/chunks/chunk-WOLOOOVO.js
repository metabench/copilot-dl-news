import {
  __commonJS,
  __toESM
} from "./chunk-QU4DACYI.js";

// src/ui/express/public/components/CrawlProgressIndicator.js
var require_CrawlProgressIndicator = __commonJS({
  "src/ui/express/public/components/CrawlProgressIndicator.js"(exports, module) {
    function createCrawlProgressIndicator2(options = {}) {
      const {
        container,
        jobId = null,
        onStateChange = null
      } = options;
      if (!container) {
        throw new Error("CrawlProgressIndicator requires a container element");
      }
      const state = {
        jobId,
        mainTask: {
          current: 0,
          total: null,
          percentage: 0,
          stage: "initializing",
          stageLabel: "Initializing",
          status: "running"
        },
        subTask: {
          current: 0,
          total: null,
          percentage: 0,
          label: null,
          visible: false
        },
        telemetry: [],
        lastUpdate: Date.now()
      };
      const root = document.createElement("div");
      root.className = "crawl-progress-indicator";
      root.dataset.jobId = jobId || "";
      const header = document.createElement("div");
      header.className = "crawl-progress-indicator__header";
      const stageLabel = document.createElement("div");
      stageLabel.className = "crawl-progress-indicator__stage-label";
      stageLabel.textContent = state.mainTask.stageLabel;
      const statusBadge = document.createElement("span");
      statusBadge.className = "crawl-progress-indicator__status-badge";
      statusBadge.dataset.status = state.mainTask.status;
      statusBadge.textContent = state.mainTask.status;
      header.appendChild(stageLabel);
      header.appendChild(statusBadge);
      const mainProgressContainer = document.createElement("div");
      mainProgressContainer.className = "crawl-progress-indicator__main-progress";
      const mainBar = document.createElement("div");
      mainBar.className = "progress-bar-container";
      const mainBarFill = document.createElement("div");
      mainBarFill.className = "progress-bar-fill";
      mainBarFill.style.width = "0%";
      const mainBarLabel = document.createElement("div");
      mainBarLabel.className = "progress-bar-label";
      mainBarLabel.textContent = "0%";
      mainBar.appendChild(mainBarFill);
      mainBar.appendChild(mainBarLabel);
      mainProgressContainer.appendChild(mainBar);
      const subProgressContainer = document.createElement("div");
      subProgressContainer.className = "crawl-progress-indicator__sub-progress";
      subProgressContainer.style.display = "none";
      const subTaskLabel = document.createElement("div");
      subTaskLabel.className = "crawl-progress-indicator__sub-label";
      const subBar = document.createElement("div");
      subBar.className = "progress-bar-container progress-bar-container--small";
      const subBarFill = document.createElement("div");
      subBarFill.className = "progress-bar-fill progress-bar-fill--sub";
      subBarFill.style.width = "0%";
      const subBarLabel = document.createElement("div");
      subBarLabel.className = "progress-bar-label progress-bar-label--small";
      subBarLabel.textContent = "0%";
      subBar.appendChild(subBarFill);
      subBar.appendChild(subBarLabel);
      subProgressContainer.appendChild(subTaskLabel);
      subProgressContainer.appendChild(subBar);
      root.appendChild(header);
      root.appendChild(mainProgressContainer);
      root.appendChild(subProgressContainer);
      container.appendChild(root);
      function updateProgress(progress = {}) {
        if (progress.stage && progress.stage !== state.mainTask.stage) {
          state.mainTask.stage = progress.stage;
          state.mainTask.stageLabel = progress.stageLabel || capitalizeStage(progress.stage);
          stageLabel.textContent = state.mainTask.stageLabel;
        }
        if (progress.stageLabel) {
          state.mainTask.stageLabel = progress.stageLabel;
          stageLabel.textContent = progress.stageLabel;
        }
        if (progress.status && progress.status !== state.mainTask.status) {
          state.mainTask.status = progress.status;
          statusBadge.textContent = progress.status;
          statusBadge.dataset.status = progress.status;
        }
        if (typeof progress.current === "number") {
          state.mainTask.current = progress.current;
        }
        if (typeof progress.total === "number" || progress.total === null) {
          state.mainTask.total = progress.total;
        }
        if (state.mainTask.total && state.mainTask.total > 0) {
          state.mainTask.percentage = Math.round(state.mainTask.current / state.mainTask.total * 100);
          mainBarFill.style.width = `${state.mainTask.percentage}%`;
          mainBarLabel.textContent = `${state.mainTask.current} / ${state.mainTask.total} (${state.mainTask.percentage}%)`;
          mainBarFill.classList.remove("progress-bar-fill--indeterminate");
        } else {
          mainBarFill.classList.add("progress-bar-fill--indeterminate");
          mainBarLabel.textContent = state.mainTask.current > 0 ? `${state.mainTask.current} processed` : "Processing...";
        }
        state.lastUpdate = Date.now();
        notifyStateChange();
      }
      function updateSubTask(subTask = {}) {
        if (typeof subTask.visible === "boolean") {
          state.subTask.visible = subTask.visible;
          subProgressContainer.style.display = subTask.visible ? "block" : "none";
        }
        if (subTask.label !== void 0) {
          state.subTask.label = subTask.label;
          subTaskLabel.textContent = subTask.label || "";
        }
        if (typeof subTask.current === "number") {
          state.subTask.current = subTask.current;
        }
        if (typeof subTask.total === "number" || subTask.total === null) {
          state.subTask.total = subTask.total;
        }
        if (state.subTask.total && state.subTask.total > 0) {
          state.subTask.percentage = Math.round(state.subTask.current / state.subTask.total * 100);
          subBarFill.style.width = `${state.subTask.percentage}%`;
          subBarLabel.textContent = `${state.subTask.current} / ${state.subTask.total} (${state.subTask.percentage}%)`;
          subBarFill.classList.remove("progress-bar-fill--indeterminate");
        } else if (state.subTask.visible) {
          subBarFill.classList.add("progress-bar-fill--indeterminate");
          subBarLabel.textContent = state.subTask.current > 0 ? `${state.subTask.current} processed` : "Processing...";
        }
        if (state.subTask.label && typeof subTask.visible !== "boolean") {
          state.subTask.visible = true;
          subProgressContainer.style.display = "block";
        }
        state.lastUpdate = Date.now();
        notifyStateChange();
      }
      function setStage(stage, label = null) {
        updateProgress({ stage, stageLabel: label });
      }
      function setStatus(status) {
        updateProgress({ status });
      }
      function hideSubTask() {
        updateSubTask({ visible: false });
      }
      function showSubTask() {
        updateSubTask({ visible: true });
      }
      function getState() {
        return JSON.parse(JSON.stringify(state));
      }
      function destroy() {
        if (root && root.parentNode) {
          root.parentNode.removeChild(root);
        }
      }
      function capitalizeStage(stage) {
        if (!stage) return "Processing";
        return stage.split(/[-_]/).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
      }
      function notifyStateChange() {
        if (typeof onStateChange === "function") {
          try {
            onStateChange(getState());
          } catch (_) {
          }
        }
      }
      return {
        updateProgress,
        updateSubTask,
        setStage,
        setStatus,
        hideSubTask,
        showSubTask,
        getState,
        destroy,
        // Direct element access for custom styling
        elements: {
          root,
          header,
          stageLabel,
          statusBadge,
          mainBar,
          mainBarFill,
          mainBarLabel,
          subProgressContainer,
          subTaskLabel,
          subBar,
          subBarFill,
          subBarLabel
        }
      };
    }
    if (typeof module !== "undefined" && module.exports) {
      module.exports = { createCrawlProgressIndicator: createCrawlProgressIndicator2 };
    }
    if (typeof window !== "undefined") {
      window.createCrawlProgressIndicator = createCrawlProgressIndicator2;
    }
  }
});

// src/ui/public/index/crawlProgressIntegration.js
var import_CrawlProgressIndicator = __toESM(require_CrawlProgressIndicator());

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

// src/ui/public/index/crawlProgressIntegration.js
var COMPLETION_TYPES = /* @__PURE__ */ new Set(["completed", "complete", "finished", "done", "success", "succeeded"]);
var COMPLETION_MESSAGE_TERMS = ["completed", "complete", "finished", "done", "success", "succeeded"];
function isTelemetryCompletion(entry) {
  if (!entry || typeof entry !== "object") {
    return false;
  }
  const rawType = String(entry.type || entry.event || "").toLowerCase();
  if (rawType && COMPLETION_TYPES.has(rawType)) {
    return true;
  }
  const statusLike = String(entry.status || entry.state || entry.context?.status || "").toLowerCase();
  if (statusLike && COMPLETION_TYPES.has(statusLike)) {
    return true;
  }
  const message = typeof entry.message === "string" ? entry.message.toLowerCase() : "";
  if (message) {
    if (message.includes("not completed") || message.includes("not finished")) {
      return false;
    }
    if (COMPLETION_MESSAGE_TERMS.some((term) => message.includes(term))) {
      return true;
    }
  }
  return false;
}
function createCrawlProgressIntegration(options = {}) {
  const {
    progressContainer,
    telemetryContainer,
    onProgressUpdate = null
  } = options;
  let progressIndicator = null;
  let telemetryDisplay = null;
  let currentJobId = null;
  if (progressContainer) {
    progressIndicator = (0, import_CrawlProgressIndicator.createCrawlProgressIndicator)({
      container: progressContainer,
      showSubTask: true,
      showTelemetry: false
      // Telemetry in separate component
    });
  }
  if (telemetryContainer) {
    telemetryDisplay = createTelemetryDisplay({
      container: telemetryContainer,
      maxEntries: 100,
      autoScroll: true,
      showStats: true
    });
  }
  function handleProgress(data) {
    if (!progressIndicator) return;
    const { jobId, visited, downloaded, found, saved, queue } = data;
    if (currentJobId && jobId !== currentJobId) return;
    if (data.maxPages && data.maxPages > 0) {
      progressIndicator.updateProgress(visited, data.maxPages);
    } else {
      progressIndicator.updateProgress(0, 0);
    }
    if (queue > 0) {
      progressIndicator.updateSubTask(0, queue, `Queue: ${queue} URLs`);
      progressIndicator.showSubTask();
    } else {
      progressIndicator.hideSubTask();
    }
    if (onProgressUpdate) {
      onProgressUpdate({ type: "progress", data });
    }
  }
  function handleTelemetry(data) {
    if (telemetryDisplay) {
      telemetryDisplay.addEntry(data);
    }
    if (progressIndicator) {
      const jobId = data.jobId || data.context?.jobId || null;
      if (jobId && (!currentJobId || currentJobId === jobId)) {
        currentJobId = jobId;
      }
      const completionDetected = isTelemetryCompletion(data);
      const jobMatches = !currentJobId || !jobId || currentJobId === jobId;
      if (data.type === "stage_transition" || data.type === "started") {
        progressIndicator.setStage(data.stage || data.message);
      }
      if (completionDetected && jobMatches) {
        progressIndicator.setStatus("success");
        progressIndicator.setStage(data.message || data.stage || "Crawl completed");
        progressIndicator.hideSubTask();
        currentJobId = null;
      } else if (data.type === "completed") {
        progressIndicator.setStatus("success");
        progressIndicator.setStage(data.message || "Completed");
      }
      if (data.type === "error" || data.type === "failed") {
        progressIndicator.setStatus("error");
        progressIndicator.setStage(data.message || "Error");
      }
      if (data.context && typeof data.context === "object") {
        const { current, total, processed, totalItems } = data.context;
        if (total || totalItems) {
          const curr = current || processed || 0;
          const tot = total || totalItems || 0;
          progressIndicator.updateProgress(curr, tot);
        }
      }
    }
    if (onProgressUpdate) {
      const completionDetected = isTelemetryCompletion(data) && (!currentJobId || !data.jobId || data.jobId === currentJobId);
      const payload = { type: "telemetry", data };
      if (completionDetected) {
        payload.meta = { completionDetected: true };
      }
      onProgressUpdate(payload);
    }
  }
  function handleMilestone(data) {
    if (progressIndicator) {
      progressIndicator.setStage(data.message || "Milestone reached");
    }
    if (telemetryDisplay) {
      telemetryDisplay.addEntry({
        type: "info",
        stage: data.stage || "milestone",
        message: data.message || "Milestone reached",
        timestamp: data.timestamp || Date.now(),
        context: data
      });
    }
    if (onProgressUpdate) {
      onProgressUpdate({ type: "milestone", data });
    }
  }
  function handleQueue(data) {
    if (!progressIndicator) return;
    const { size, added, removed } = data;
    if (size > 0) {
      let subTaskLabel = `Queue: ${size} URLs`;
      if (added > 0) subTaskLabel += ` (+${added})`;
      if (removed > 0) subTaskLabel += ` (-${removed})`;
      progressIndicator.updateSubTask(0, size, subTaskLabel);
      progressIndicator.showSubTask();
    } else {
      progressIndicator.hideSubTask();
    }
    if (onProgressUpdate) {
      onProgressUpdate({ type: "queue", data });
    }
  }
  function handleCrawlStart(data) {
    currentJobId = data.jobId || null;
    if (progressIndicator) {
      progressIndicator.setStatus("active");
      progressIndicator.setStage("Starting crawl...");
      progressIndicator.updateProgress(0, data.maxPages || 0);
      progressIndicator.showSubTask();
      progressIndicator.updateSubTask(0, 0, "Initializing...");
    }
    if (telemetryDisplay) {
      telemetryDisplay.clear();
      telemetryDisplay.addEntry({
        type: "started",
        stage: "crawl",
        message: `Crawl started (Job ${data.jobId || "unknown"})`,
        timestamp: Date.now(),
        context: data
      });
    }
  }
  function handleCrawlComplete(data) {
    if (progressIndicator) {
      progressIndicator.setStatus("success");
      progressIndicator.setStage("Crawl completed");
      progressIndicator.hideSubTask();
    }
    if (telemetryDisplay) {
      telemetryDisplay.addEntry({
        type: "completed",
        stage: "crawl",
        message: "Crawl completed successfully",
        timestamp: Date.now(),
        context: data
      });
    }
    currentJobId = null;
  }
  function handleCrawlError(data) {
    if (progressIndicator) {
      progressIndicator.setStatus("error");
      progressIndicator.setStage(data.message || "Error occurred");
    }
    if (telemetryDisplay) {
      telemetryDisplay.addEntry({
        type: "error",
        stage: "crawl",
        message: data.message || "Crawl error",
        timestamp: Date.now(),
        context: data
      });
    }
  }
  function reset() {
    if (progressIndicator) {
      progressIndicator.setStatus("idle");
      progressIndicator.setStage("Ready");
      progressIndicator.updateProgress(0, 0);
      progressIndicator.hideSubTask();
    }
    if (telemetryDisplay) {
      telemetryDisplay.clear();
    }
    currentJobId = null;
  }
  function setVisible(visible) {
    if (progressIndicator) {
      const container = progressIndicator.getState().container;
      if (container) {
        container.style.display = visible ? "" : "none";
      }
    }
    if (telemetryDisplay) {
      telemetryDisplay.setVisible(visible);
    }
  }
  function destroy() {
    if (progressIndicator) {
      progressIndicator.destroy();
    }
    if (telemetryDisplay) {
      telemetryDisplay.destroy();
    }
  }
  return {
    // Event handlers
    handleProgress,
    handleTelemetry,
    handleMilestone,
    handleQueue,
    handleCrawlStart,
    handleCrawlComplete,
    handleCrawlError,
    // Control methods
    reset,
    setVisible,
    destroy,
    // Component access
    progressIndicator,
    telemetryDisplay
  };
}

export {
  createCrawlProgressIntegration
};
