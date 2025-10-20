import {
  require_lang
} from "./chunk-BOXXWBMA.js";
import {
  __toESM
} from "./chunk-QU4DACYI.js";

// src/ui/public/index/sseHandlers.js
var import_lang_tools = __toESM(require_lang());
function createSseHandlers({
  elements = {},
  state = {},
  actions = {},
  formatters = {},
  markSseLive = () => {
  },
  scheduleFlush = () => {
  }
} = {}) {
  const {
    logs,
    progress,
    pauseBtn,
    resumeBtn,
    inflightDiv,
    inflightList,
    metricVisited,
    metricDownloaded,
    metricSaved,
    metricFound,
    metricErrors,
    metricQueue,
    analysisStatus
  } = elements;
  const {
    formatNumber = (n) => String(n),
    formatRelativeTime = (ts) => new Date(ts).toLocaleString()
  } = formatters;
  let lastProgressAt = 0;
  function handleLog(e) {
    markSseLive();
    try {
      const payload = JSON.parse(e.data);
      const line = String(payload.line || "");
      state.logEntries.push({ text: line, isErr: false });
      scheduleFlush();
    } catch (_) {
    }
  }
  function handleError(e) {
    markSseLive();
    try {
      const payload = JSON.parse(e.data);
      const message = payload.message || (payload.code ? `HTTP ${payload.code}` : "Error");
      const url = payload.url || "";
      state.logEntries.push({ text: `[ERROR] ${message} ${url}
`, isErr: true });
      scheduleFlush();
    } catch (_) {
    }
  }
  function handleJobs(e) {
    markSseLive();
    try {
      const payload = JSON.parse(e.data);
      if (actions.renderJobs) {
        actions.renderJobs(payload);
      }
    } catch (_) {
    }
  }
  function handleProblem(e) {
    markSseLive();
    try {
      const payload = JSON.parse(e.data);
      const list = document.getElementById("problemsList");
      if (!list) return;
      const ts = (/* @__PURE__ */ new Date()).toLocaleTimeString();
      const kind = payload.kind || "problem";
      const scope = payload.scope ? ` [${payload.scope}]` : "";
      const target = payload.target ? ` \u2014 ${payload.target}` : "";
      const message = payload.message || "";
      let details = "";
      if ((0, import_lang_tools.is_defined)(payload.details)) {
        const detailsStr = (0, import_lang_tools.tof)(payload.details) === "string" ? payload.details : JSON.stringify(payload.details);
        details = ` \xB7 details: ${detailsStr.slice(0, 200)}`;
      }
      const line = `<div><span class="muted">${ts}</span> <strong>${kind}</strong>${scope}${target} \u2014 ${message}${details}</div>`;
      if (list.classList.contains("muted")) {
        list.classList.remove("muted");
      }
      if (list.textContent === "None") {
        list.textContent = "";
      }
      try {
        const div = document.createElement("div");
        div.innerHTML = line;
        if (list.firstChild) {
          list.insertBefore(div.firstChild, list.firstChild);
        } else {
          list.appendChild(div.firstChild);
        }
        let count = 0;
        const max = 200;
        (0, import_lang_tools.each)(Array.from(list.children), (child) => {
          count += 1;
          if (count > max) child.remove();
        });
      } catch (_) {
        list.innerHTML = line + (list.innerHTML || "");
      }
    } catch (_) {
    }
  }
  function handleProgress(e) {
    markSseLive();
    const now = Date.now();
    if (now - lastProgressAt < 200) return;
    lastProgressAt = now;
    try {
      const payload = JSON.parse(e.data);
      if (actions.updateStartupStatus) {
        actions.updateStartupStatus(payload.startup, payload.statusText);
      }
      const incomingType = payload.crawlType || state.currentCrawlType;
      if (payload.structure && incomingType === "discover-structure") {
        if (actions.renderStructureSummary) {
          actions.renderStructureSummary(payload.structure);
        }
      } else if (!payload.structure && state.structurePanel && state.structurePanel.dataset.active === "1" && state.structurePanel.dataset.hasData !== "1") {
        if (actions.renderStructureSummary) {
          actions.renderStructureSummary(null);
        }
      }
      try {
        const lastLog = window.__lastProgressLogAt || 0;
        if (now - lastLog > 2e3) {
          const line = `[PROGRESS] visited=${payload.visited || 0} downloaded=${payload.downloaded || 0} found=${payload.found || 0} saved=${payload.saved || 0} queue=${payload.queueSize || 0}
`;
          state.logEntries.push({ text: line, isErr: false });
          scheduleFlush();
          window.__lastProgressLogAt = now;
        }
      } catch (_) {
      }
      const baseStage = payload.stage || null;
      let stageDisplay = baseStage;
      if (payload.slowMode) {
        const reason = payload.slowModeReason ? ` (${payload.slowModeReason})` : "";
        stageDisplay = stageDisplay ? `${stageDisplay} [slow mode${reason}]` : `slow mode${reason}`;
      }
      if ((0, import_lang_tools.is_defined)(stageDisplay) && actions.setStage) {
        actions.setStage(stageDisplay);
      } else if ((0, import_lang_tools.is_defined)(baseStage) && actions.setStage) {
        actions.setStage(baseStage);
      }
      if (Object.prototype.hasOwnProperty.call(payload, "paused") && actions.setPausedBadge) {
        actions.setPausedBadge(!!payload.paused);
      }
      if (payload.crawlType && (!state.currentCrawlType || state.currentCrawlType !== payload.crawlType)) {
        if (actions.setCrawlType) {
          actions.setCrawlType(payload.crawlType);
        }
      }
      if (!state.currentCrawlType && payload.plannerActive) {
        const fallbackType = payload.crawlType || "intelligent";
        const plannerType = fallbackType === "discover-structure" ? "discover-structure" : "intelligent";
        if (actions.setCrawlType) {
          actions.setCrawlType(plannerType);
        }
      }
      const metricUpdates = [
        { el: metricVisited, value: payload.visited },
        { el: metricDownloaded, value: payload.downloaded },
        { el: metricSaved, value: payload.saved },
        { el: metricFound, value: payload.found },
        { el: metricErrors, value: payload.errors }
      ];
      (0, import_lang_tools.each)(metricUpdates, (update) => {
        if (update.el && (0, import_lang_tools.is_defined)(update.value)) {
          update.el.textContent = formatNumber(update.value || 0);
        }
      });
      const metricsResult = actions.handleMetricsProgress ? actions.handleMetricsProgress(payload, now) : {};
      const queueValue = (0, import_lang_tools.is_defined)(metricsResult.queueDisplay) ? metricsResult.queueDisplay : actions.getQueueDisplayValue ? actions.getQueueDisplayValue(payload.queueSize || 0) : payload.queueSize;
      if (metricQueue && (0, import_lang_tools.is_defined)(queueValue)) {
        metricQueue.textContent = formatNumber(queueValue);
      }
      const stageLabel = payload.stage ? String(payload.stage).replace(/[_-]+/g, " ") : "";
      const statusLabel = payload.statusText || stageLabel;
      const prefix = statusLabel ? `${statusLabel} \xB7 ` : "";
      if (progress) {
        progress.textContent = `${prefix}visited: ${payload.visited || 0}, downloaded: ${payload.downloaded || 0}, found: ${payload.found || 0}, saved: ${payload.saved || 0}`;
      }
      if ((0, import_lang_tools.tof)(payload.paused) === "boolean") {
        if (pauseBtn) pauseBtn.disabled = !!payload.paused;
        if (resumeBtn) resumeBtn.disabled = !payload.paused;
      }
      const count = payload.currentDownloadsCount || (Array.isArray(payload.currentDownloads) ? payload.currentDownloads.length : 0) || 0;
      if (inflightDiv && inflightDiv.firstChild) {
        inflightDiv.firstChild.nodeValue = `current downloads: ${count}`;
      }
      if (Array.isArray(payload.currentDownloads) && inflightList) {
        const groups = /* @__PURE__ */ new Map();
        (0, import_lang_tools.each)(payload.currentDownloads, (download) => {
          let host = "";
          try {
            host = new URL(download.url).hostname.toLowerCase();
          } catch (_) {
            host = "";
          }
          if (!groups.has(host)) groups.set(host, []);
          groups.get(host).push(download);
        });
        const limiterInfo = payload && payload.perHostLimits ? payload.perHostLimits : {};
        const lines = [];
        for (const [host, arr] of groups.entries()) {
          const items = arr.slice(0, 3).map((download) => {
            const age = (0, import_lang_tools.tof)(download.ageMs) === "number" ? ` ${(Math.round(download.ageMs / 100) / 10).toFixed(1)}s` : "";
            const displayUrl = String(download.url || "").replace(/^https?:\/\//, "");
            return `<a href="/url?url=${encodeURIComponent(download.url)}">${displayUrl}</a><span style="color:#666;">${age}</span>`;
          }).join(" \xB7 ");
          let badge = "";
          try {
            const info = limiterInfo[host];
            if (info && info.rateLimited) {
              const tipParts = [
                `limit: ${info.limit ?? "n/a"}/min`,
                info.intervalMs != null ? `interval: ~${info.intervalMs}ms` : null,
                info.backoffMs != null ? `backoff: ~${Math.ceil(info.backoffMs / 1e3)}s` : null
              ];
              const tip = tipParts.filter(Boolean).join(" \n");
              badge = ` <span class="bad" title="${tip}">RATE LIMITED</span>`;
            }
          } catch (_) {
          }
          lines.push(`<li><strong>${host || "(unknown)"}</strong>${badge} \u2014 ${arr.length} ${items ? "\xB7 " + items : ""}</li>`);
        }
        inflightList.innerHTML = lines.join("");
      }
      const executionPatch = {
        jobs: count,
        status: payload.paused ? "pending" : "running",
        statusLabel: payload.paused ? "Paused" : "Running"
      };
      if ((0, import_lang_tools.tof)(payload.queueSize) === "number") {
        executionPatch.queue = (0, import_lang_tools.is_defined)(queueValue) ? queueValue : payload.queueSize;
      }
      const progressTs = payload.ts ? Date.parse(payload.ts) : now;
      if (actions.patchPipeline) {
        actions.patchPipeline({ execution: executionPatch });
      }
      const insightDetails = {};
      const insightExtras = {
        source: "progress",
        timestamp: Number.isFinite(progressTs) ? progressTs : now
      };
      let shouldUpdateInsights = false;
      const insightSources = [
        { key: "coverage", value: payload.coverage },
        { key: "goalStates", value: payload.goalStates, isArray: true },
        { key: "goalSummary", value: payload.goalSummary },
        { key: "seededHubs", value: payload.seededHubs },
        { key: "problems", value: payload.problems, isArray: true }
      ];
      (0, import_lang_tools.each)(insightSources, (source) => {
        if (source.isArray && Array.isArray(source.value)) {
          insightDetails[source.key] = source.value;
          shouldUpdateInsights = true;
        } else if (!source.isArray && (0, import_lang_tools.is_defined)(source.value)) {
          insightDetails[source.key] = source.value;
          shouldUpdateInsights = true;
        }
      });
      if (payload.queueHeatmap) {
        insightExtras.queueHeatmap = payload.queueHeatmap;
        shouldUpdateInsights = true;
      }
      if (shouldUpdateInsights && actions.updateIntelligentInsights) {
        actions.updateIntelligentInsights(insightDetails, insightExtras);
      }
    } catch (_) {
    }
  }
  function handleMilestone(e) {
    markSseLive();
    try {
      const payload = JSON.parse(e.data);
      if (actions.handleMilestone) {
        actions.handleMilestone(payload);
      }
    } catch (_) {
    }
  }
  function handlePlannerStage(e) {
    markSseLive();
    try {
      const payload = JSON.parse(e.data);
      if (actions.handlePlannerStage) {
        actions.handlePlannerStage(payload);
      }
    } catch (_) {
    }
  }
  function handleAnalysisProgress(e) {
    markSseLive();
    try {
      const payload = JSON.parse(e.data);
      if (actions.handleAnalysisProgress) {
        actions.handleAnalysisProgress(payload);
      }
    } catch (_) {
    }
  }
  function handleDone(e) {
    markSseLive();
    try {
      const key = `done:${e.data}`;
      if (!window.__seenDone) window.__seenDone = /* @__PURE__ */ new Set();
      if (window.__seenDone.has(key)) return;
      window.__seenDone.add(key);
    } catch (_) {
    }
    if (logs) {
      logs.textContent += `
DONE: ${e.data}
`;
    }
  }
  function handleCache(e) {
    markSseLive();
    try {
      const payload = JSON.parse(e.data);
      if (actions.handleCacheEvent) {
        actions.handleCacheEvent(payload);
      }
      try {
        const src = payload.source || "cache";
        const age = (0, import_lang_tools.tof)(payload.ageSeconds) === "number" ? `${payload.ageSeconds}s` : "unknown";
        const url = payload.url || "";
        const line = `CACHE hit (${src}, age ${age}) ${url}
`;
        state.logEntries.push({ text: line, isErr: false });
        scheduleFlush();
      } catch (_) {
      }
    } catch (_) {
    }
  }
  return {
    log: handleLog,
    error: handleError,
    jobs: handleJobs,
    problem: handleProblem,
    progress: handleProgress,
    milestone: handleMilestone,
    "planner-stage": handlePlannerStage,
    "analysis-progress": handleAnalysisProgress,
    done: handleDone,
    cache: handleCache
  };
}
export {
  createSseHandlers
};
