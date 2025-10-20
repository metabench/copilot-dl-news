import {
  require_lang
} from "./chunk-BOXXWBMA.js";
import {
  hideElement,
  showElement
} from "./chunk-R3BBB6IF.js";
import {
  __toESM
} from "./chunk-QU4DACYI.js";

// src/ui/public/index/statusIndicators.js
var import_lang_tools = __toESM(require_lang());
function createStatusIndicators({
  stageBadge,
  pausedBadge,
  startupStatusEl,
  startupStatusText,
  startupProgressFill,
  startupStagesList
}) {
  function setStage(stage) {
    if (!stageBadge) return;
    const label = stage ? stage.replace(/[_-]+/g, " ") : "idle";
    stageBadge.textContent = `Stage: ${label}`;
  }
  function setPausedBadge(paused) {
    if (!pausedBadge) return;
    if (paused == null) {
      hideElement(pausedBadge);
      return;
    }
    showElement(pausedBadge);
    if (paused) {
      pausedBadge.textContent = "Paused";
      pausedBadge.classList.remove("badge-ok");
      pausedBadge.classList.add("badge-warn");
    } else {
      pausedBadge.textContent = "Running";
      pausedBadge.classList.remove("badge-warn");
      pausedBadge.classList.add("badge-ok");
    }
  }
  function hidePausedBadge() {
    if (pausedBadge) hideElement(pausedBadge);
  }
  function updateStartupStatus(startup, statusText) {
    if (!startupStatusEl) return;
    const summary = startup && (0, import_lang_tools.tof)(startup) === "object" ? startup.summary : null;
    const stages = startup && (0, import_lang_tools.is_array)(startup.stages) ? startup.stages : [];
    const done = !!(summary && summary.done);
    const hasStages = stages.length > 0;
    const text = statusText || (hasStages ? stages.find((s) => s && s.status === "running")?.label || stages[stages.length - 1]?.label || "Preparing\u2026" : null);
    const hidePending = startupStatusEl.dataset.hideAt && Number(startupStatusEl.dataset.hideAt) > Date.now();
    if (!startup && !statusText) {
      if (hidePending) {
        return;
      }
      if (startupStatusEl.dataset.active === "1") {
        hideElement(startupStatusEl);
        startupStatusEl.setAttribute("aria-hidden", "true");
        startupStatusEl.dataset.active = "0";
        startupStatusEl.classList.remove("is-complete");
        if (startupStagesList) startupStagesList.innerHTML = "";
        if (startupProgressFill) startupProgressFill.style.width = "0%";
      }
      return;
    }
    startupStatusEl.dataset.active = "1";
    showElement(startupStatusEl);
    startupStatusEl.setAttribute("aria-hidden", "false");
    if (startupStatusText) {
      startupStatusText.textContent = text || (done ? "Startup complete" : "Preparing\u2026");
    }
    if (startupProgressFill) {
      let pct = summary && typeof summary.progress === "number" ? summary.progress : null;
      if (!Number.isFinite(pct)) pct = done ? 1 : 0;
      pct = Math.max(0, Math.min(1, pct || 0));
      startupProgressFill.style.width = `${Math.round(pct * 100)}%`;
    }
    if (startupStagesList) {
      startupStagesList.innerHTML = "";
      const displayStages = hasStages ? stages.slice(-6) : [];
      if (displayStages.length) {
        for (const stage of displayStages) {
          if (!stage) continue;
          const li = document.createElement("li");
          const statusKey = stage.status ? String(stage.status).toLowerCase() : "pending";
          li.className = `stage-${statusKey}`;
          const label = stage.label || stage.id || "stage";
          const parts = [label];
          if (stage.status) parts.push(stage.status.replace(/[_-]+/g, " "));
          if (stage.durationMs != null && stage.status && stage.status !== "running") parts.push(`${Math.round(stage.durationMs)}ms`);
          li.textContent = parts.join(" \xB7 ");
          if (stage.message) {
            const meta = document.createElement("span");
            meta.className = "startup-stage-meta";
            meta.textContent = stage.message;
            li.appendChild(meta);
          }
          startupStagesList.appendChild(li);
        }
      } else if (text) {
        const li = document.createElement("li");
        li.className = "stage-running";
        li.textContent = text;
        startupStagesList.appendChild(li);
      }
    }
    if (done) {
      startupStatusEl.classList.add("is-complete");
      const hideAt = Date.now() + 5e3;
      startupStatusEl.dataset.hideAt = String(hideAt);
      setTimeout(() => {
        const stored = Number(startupStatusEl?.dataset?.hideAt || 0);
        if (!startupStatusEl || stored === 0) return;
        if (Date.now() >= stored) {
          hideElement(startupStatusEl);
          startupStatusEl.setAttribute("aria-hidden", "true");
          startupStatusEl.classList.remove("is-complete");
          startupStatusEl.dataset.active = "0";
          startupStatusEl.dataset.hideAt = "";
        }
      }, 5200);
    } else {
      startupStatusEl.classList.remove("is-complete");
      if (startupStatusEl.dataset.hideAt) startupStatusEl.dataset.hideAt = "";
    }
  }
  return {
    setStage,
    setPausedBadge,
    hidePausedBadge,
    updateStartupStatus
  };
}
export {
  createStatusIndicators
};
