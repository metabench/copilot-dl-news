"use strict";

// jsgui3-client's legacy browser bootstrap expects a global `page_context` binding.
// Ensure it exists before requiring the library so activation doesn't crash.
if (typeof globalThis !== "undefined" && !globalThis.page_context) {
  globalThis.page_context = {};
}

// jsgui3-client from npm (v0.0.121+ has browser compatibility fixes)
const jsguiClient = require("jsgui3-client");
const { installBindingPlugin } = require("../jsgui/bindingPlugin");
const { ensureControlsRegistered, listControlTypes } = require("../controls/controlManifest");
const { ensureGlobalListingStateStore } = require("./listingStateStore");
const { attachListingDomBindings } = require("./listingDomBindings");
const { createDiagramAtlasBootstrap } = require("./diagramAtlas");
const { createJobsManager } = require("./jobsManager");
const { createSseHandlers } = require("./sseHandlers");

const REGISTERED_CONTROLS = ensureControlsRegistered(jsguiClient);
const REGISTERED_CONTROL_TYPES = REGISTERED_CONTROLS.map((entry) => entry.type);
const DEFAULT_EXPECTED_CONTROL_TYPES = listControlTypes();
const { bootstrapDiagramAtlas } = createDiagramAtlasBootstrap({
  jsguiClient,
  registerControls: injectControlsIntoContext
});

function seedContextControlMap(context) {
  if (!context) {
    return null;
  }
  const map = context.map_Controls || (context.map_Controls = {});
  if (!context.__copilotControlsSeeded) {
    const sources = [jsguiClient.map_Controls, jsguiClient.controls];
    sources.forEach((source) => {
      if (!source) return;
      Object.keys(source).forEach((key) => {
        if (!key) return;
        const normalized = key.toLowerCase();
        if (!map[normalized]) {
          map[normalized] = source[key];
        }
      });
    });
    context.__copilotControlsSeeded = true;
  }
  REGISTERED_CONTROLS.forEach(({ type, control }) => {
    if (!control) return;
    const proto = control.prototype || {};
    const key = (type || proto.__type_name || "").toLowerCase();
    if (!key || map[key]) {
      return;
    }
    map[key] = control;
  });
  return map;
}

function ensureClientControlsRegistered() {
  return REGISTERED_CONTROLS;
}

ensureClientControlsRegistered();

function injectControlsIntoContext(context) {
  if (!context) {
    return;
  }
  const map = seedContextControlMap(context);
  if (!map) {
    return;
  }
  if (typeof window !== "undefined" && !window.__COPILOT_LOGGED_CONTROLS__) {
    window.__COPILOT_LOGGED_CONTROLS__ = true;
    try {
      console.log("[copilot] context.map_Controls keys", Object.keys(map));
    } catch (_) {
      // ignore
    }
  }
  REGISTERED_CONTROLS.forEach(({ control, type }) => {
    if (!control) return;
    const proto = control.prototype || {};
    const key = (type || proto.__type_name || "").toLowerCase();
    if (!key || map[key]) {
      return;
    }
    map[key] = control;
    if (typeof context.update_Controls === "function") {
      context.update_Controls(key, control);
    }
  });
}

function verifyExpectedControls() {
  if (typeof window === "undefined") {
    return;
  }
  const expected = Array.isArray(window.__COPILOT_EXPECTED_CONTROLS__)
    ? window.__COPILOT_EXPECTED_CONTROLS__
    : DEFAULT_EXPECTED_CONTROL_TYPES;
  const missing = (expected || [])
    .map((type) => (type || "").toLowerCase())
    .filter((type) => type && !REGISTERED_CONTROL_TYPES.includes(type));
  if (missing.length && typeof console !== "undefined" && console.warn) {
    console.warn("[copilot] missing registered jsgui controls", missing);
  }
  window.__COPILOT_EXPECTED_CONTROLS__ = expected;
  window.__COPILOT_REGISTERED_CONTROLS__ = REGISTERED_CONTROL_TYPES;
}

function wrapPreActivate(fn) {
  if (typeof fn !== "function") {
    return fn;
  }
  if (fn.__copilotWrapped) {
    return fn;
  }
  const wrapped = function copilotPreActivate(context, ...args) {
    injectControlsIntoContext(context);
    return fn.call(this, context, ...args);
  };
  wrapped.__copilotWrapped = true;
  return wrapped;
}

function ensurePreActivateHook() {
  if (typeof jsguiClient.pre_activate !== "function") {
    return;
  }
  jsguiClient.pre_activate = wrapPreActivate(jsguiClient.pre_activate);
}

ensurePreActivateHook();

const originalUpdateStandardControls = typeof jsguiClient.update_standard_Controls === "function"
  ? jsguiClient.update_standard_Controls
  : null;
if (originalUpdateStandardControls) {
  jsguiClient.update_standard_Controls = function patchedUpdateStandardControls(context, ...args) {
    ensureClientControlsRegistered();
    injectControlsIntoContext(context);
    return originalUpdateStandardControls.call(this, context, ...args);
  };
}

const originalActivate = typeof jsguiClient.activate === "function"
  ? jsguiClient.activate
  : null;
if (originalActivate) {
  jsguiClient.activate = function patchedActivate(context, ...args) {
    injectControlsIntoContext(context);
    return originalActivate.call(this, context, ...args);
  };
}

const ClientPageContext = jsguiClient.Client_Page_Context;
if (typeof ClientPageContext === "function") {
  class CopilotClientPageContext extends ClientPageContext {
    constructor(...args) {
      super(...args);
      injectControlsIntoContext(this);
    }
  }
  jsguiClient.Client_Page_Context = CopilotClientPageContext;
}

function readScriptDatasetConfig() {
  if (typeof document === "undefined") return {};
  const script = document.currentScript || (document.getElementsByTagName("script") || [])[document.getElementsByTagName("script").length - 1];
  if (!script || !script.dataset) return {};
  const datasetValue = script.dataset.bindingPlugin;
  if (!datasetValue) return {};
  const normalized = datasetValue.trim().toLowerCase();
  if (!normalized) return {};
  return { enabled: normalized !== "off" && normalized !== "false" && normalized !== "0" };
}

function resolveBindingPluginConfig() {
  const datasetConfig = readScriptDatasetConfig();
  const globalConfig = (typeof window !== "undefined" && window.CopilotBindingPlugin) || {};
  const envDefault = typeof process !== "undefined" ? process.env.BINDING_PLUGIN_ENABLED : undefined;
  const defaultEnabled = envDefault === undefined ? true : envDefault !== "false";
  const enabled = (datasetConfig.enabled ?? globalConfig.enabled ?? defaultEnabled) !== false;
  return { enabled };
}

function bootstrapUrlListingStore() {
  if (typeof window === "undefined") {
    return;
  }
  const initialState = window.__COPILOT_URL_LISTING_STATE__;
  const store = ensureGlobalListingStateStore(initialState);
  if (!store) {
    return;
  }
  attachListingDomBindings(store);
}

function selectDomElement(selectors) {
  if (typeof document === "undefined" || !Array.isArray(selectors)) {
    return null;
  }
  for (let i = 0; i < selectors.length; i += 1) {
    const selector = selectors[i];
    if (!selector) continue;
    const node = document.querySelector(selector);
    if (node) {
      return node;
    }
  }
  return null;
}

function showNode(node) {
  if (!node) return;
  node.removeAttribute("hidden");
}

function hideNode(node) {
  if (!node) return;
  node.setAttribute("hidden", "hidden");
}

function createStatusIndicators() {
  if (typeof document === "undefined") {
    const noop = () => {};
    return {
      elements: {},
      actions: {
        setStage: noop,
        setPausedBadge: noop,
        hidePausedBadge: noop,
        setCrawlType: noop,
        updateStartupStatus: noop
      }
    };
  }
  const elements = {
    stageBadge: selectDomElement(["[data-crawl-stage]", "#stageBadge"]),
    pausedBadge: selectDomElement(["[data-crawl-paused]", "#pausedBadge"]),
    startupStatusEl: selectDomElement(["[data-crawl-startup-status]", "#startupStatus"]),
    startupStatusText: selectDomElement(["[data-crawl-startup-text]", "#startupStatusText"]),
    startupProgressFill: selectDomElement(["[data-crawl-startup-progress]", "#startupProgressFill", "#startupProgress"]),
    startupStagesList: selectDomElement(["[data-crawl-startup-stages]", "#startupStages"]),
    crawlTypeLabel: selectDomElement(["[data-crawl-type-label]", "#crawlTypeLabel"]),
    jobsList: selectDomElement(["[data-crawl-jobs-list]", "#jobsList"])
  };

  function setStage(stage) {
    const normalized = stage ? String(stage).replace(/[_-]+/g, " ") : "idle";
    if (elements.stageBadge) {
      elements.stageBadge.textContent = normalized;
      elements.stageBadge.setAttribute("data-stage", stage || "idle");
    }
    if (typeof document !== "undefined" && document.body) {
      document.body.setAttribute("data-crawl-stage", stage || "");
    }
  }

  function setPausedBadge(paused) {
    const target = elements.pausedBadge;
    if (!target) {
      return;
    }
    if (paused == null) {
      target.textContent = "";
      target.dataset.state = "hidden";
      hideNode(target);
      return;
    }
    const label = paused ? "Paused" : "Running";
    target.textContent = label;
    target.dataset.state = paused ? "paused" : "running";
    showNode(target);
  }

  function hidePausedBadge() {
    setPausedBadge(null);
  }

  function setCrawlType(type) {
    const normalized = type ? String(type) : "";
    if (elements.crawlTypeLabel) {
      elements.crawlTypeLabel.textContent = normalized || "standard";
    }
    if (typeof document !== "undefined" && document.body) {
      document.body.setAttribute("data-crawl-type", normalized);
    }
  }

  function updateStartupStatus(startup, statusText) {
    const container = elements.startupStatusEl;
    if (!container) {
      return;
    }
    const summary = startup && typeof startup.summary === "object" ? startup.summary : null;
    const stages = Array.isArray(startup && startup.stages) ? startup.stages : [];
    const done = summary && summary.done;
    const runningStage = stages.find((stage) => stage && stage.status === "running");
    const label = statusText || (runningStage && runningStage.label) || (stages.length ? stages[stages.length - 1].label : null) || (done ? "Startup complete" : null);

    if (!startup && !statusText) {
      container.dataset.state = "idle";
      if (elements.startupStagesList) {
        elements.startupStagesList.innerHTML = "";
      }
      if (elements.startupProgressFill) {
        elements.startupProgressFill.style.width = "0%";
      }
      hideNode(container);
      return;
    }

    showNode(container);
    container.dataset.state = done ? "complete" : "running";
    if (elements.startupStatusText) {
      elements.startupStatusText.textContent = label || "Preparing…";
    }
    if (elements.startupProgressFill) {
      let pct = summary && Number.isFinite(summary.progress) ? summary.progress : null;
      if (!Number.isFinite(pct)) {
        pct = done ? 1 : 0;
      }
      const normalizedPct = Math.max(0, Math.min(1, pct || 0));
      elements.startupProgressFill.style.width = `${Math.round(normalizedPct * 100)}%`;
    }
    if (elements.startupStagesList) {
      const list = elements.startupStagesList;
      list.innerHTML = "";
      const recentStages = stages.slice(-6);
      if (recentStages.length) {
        recentStages.forEach((stage) => {
          if (!stage) return;
          const li = document.createElement("li");
          li.className = stage.status ? `stage-${String(stage.status).toLowerCase()}` : "stage-pending";
          const parts = [stage.label || stage.id || "stage"];
          if (stage.status) {
            parts.push(stage.status.replace(/[_-]+/g, " "));
          }
          if (Number.isFinite(stage.durationMs) && stage.status && stage.status !== "running") {
            parts.push(`${Math.round(stage.durationMs)}ms`);
          }
          li.textContent = parts.join(" · ");
          if (stage.message) {
            const meta = document.createElement("span");
            meta.className = "startup-stage-meta";
            meta.textContent = stage.message;
            li.appendChild(meta);
          }
          list.appendChild(li);
        });
      } else if (label) {
        const li = document.createElement("li");
        li.className = "stage-running";
        li.textContent = label;
        list.appendChild(li);
      }
    }
  }

  return {
    elements,
    actions: {
      setStage,
      setPausedBadge,
      hidePausedBadge,
      setCrawlType,
      updateStartupStatus
    }
  };
}

function createResumeInventoryScheduler() {
  if (typeof window === "undefined") {
    return () => {};
  }
  let timer = null;
  return function scheduleResumeInventoryRefresh(delayMs = 1500) {
    const normalizedDelay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 1500;
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      const resumeManager = window.CopilotResumeQueueManager;
      if (resumeManager && typeof resumeManager.refresh === "function") {
        resumeManager.refresh({ silent: true });
      }
    }, normalizedDelay);
  };
}

function bootstrapJobsAndSse() {
  if (typeof window === "undefined") {
    return;
  }
  const { elements, actions } = createStatusIndicators();
  const scheduleResumeInventoryRefresh = createResumeInventoryScheduler();
  const jobsManager = createJobsManager({
    elements: { jobsList: elements.jobsList },
    actions,
    scheduleResumeInventoryRefresh
  });
  if (jobsManager && typeof jobsManager.initialJobsPoll === "function") {
    jobsManager.initialJobsPoll();
  }
  const sseHandlers = createSseHandlers({
    jobsManager,
    scheduleResumeInventoryRefresh,
    updateStartupStatus: actions.updateStartupStatus,
    jobsList: elements.jobsList
  });
  if (sseHandlers && typeof sseHandlers.initSse === "function") {
    sseHandlers.initSse();
  }
  window.CopilotStatusIndicators = actions;
  window.CopilotJobsManager = jobsManager;
  window.CopilotSseHandlers = sseHandlers;
}

/**
 * Bootstrap deferred-loading controls by finding marked DOM elements
 * and activating the corresponding control's deferred data loading.
 */
function bootstrapDeferredControls() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  // Find domain summary tables and load their deferred counts
  const domainTables = document.querySelectorAll('[data-control="domain-summary-table"]');
  domainTables.forEach((tableEl) => {
    // Load the control class and call its static method for deferred loading
    const { DomainSummaryTableControl } = require("../controls/DomainSummaryTable");
    
    // Create a lightweight instance for activation (with existing DOM element)
    const control = new DomainSummaryTableControl({
      context: new jsguiClient.Client_Page_Context(),
      el: tableEl
    });
    
    // Manually set the dom.el reference for activation
    if (control.dom) {
      control.dom.el = tableEl;
    }
    
    // Activate to load deferred data
    if (typeof control.activate === "function") {
      control.activate();
    }
  });
}

(function bootstrap() {
  ensureClientControlsRegistered();
  const { enabled } = resolveBindingPluginConfig();
  if (enabled) {
    installBindingPlugin(jsguiClient);
  } else if (typeof console !== "undefined" && console.info) {
    console.info("Copilot binding plugin disabled for this bundle");
  }

  if (typeof window !== "undefined") {
    window.CopilotBindingPlugin = window.CopilotBindingPlugin || {};
    window.CopilotBindingPlugin.enabled = enabled;
    window.CopilotBindingPlugin.installBindingPlugin = installBindingPlugin;
    window.CopilotBindingPlugin.jsgui = jsguiClient;
    verifyExpectedControls();
  }
  bootstrapDiagramAtlas();
  bootstrapUrlListingStore();
  bootstrapJobsAndSse();
  bootstrapDeferredControls();
})();
