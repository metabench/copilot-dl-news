"use strict";

const { createDiagramAtlasControls: defaultDiagramAtlasFactory } = require("../controls/diagramAtlasControlsFactory");

function formatNumber(value, fallback = "—") {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return value.toLocaleString("en-US");
}

function formatBytes(bytes, fallback = "—") {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return fallback;
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / (1024 ** exponent);
  const fixed = value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
  return `${fixed} ${units[exponent]}`;
}

function formatTimestamp(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function setNodeText(node, text) {
  if (!node) return;
  node.textContent = text == null ? "" : String(text);
}

function createElement(doc, tag, className, text) {
  const el = doc.createElement(tag);
  if (className) {
    el.className = className;
  }
  if (text != null) {
    el.textContent = text;
  }
  return el;
}

function collectDiagnosticsMap(shell) {
  const diagnostics = {};
  shell.querySelectorAll("[data-metric]").forEach((node) => {
    const metric = node.getAttribute("data-metric");
    if (!metric) return;
    diagnostics[metric] = {
      container: node,
      value: node.querySelector(".diagram-diagnostics__value") || node
    };
  });
  const toolbar = {};
  shell.querySelectorAll("[data-toolbar-metric]").forEach((node) => {
    const metric = node.getAttribute("data-toolbar-metric");
    if (!metric) return;
    toolbar[metric] = node;
  });
  return { diagnostics, toolbar };
}

function createDiagramAtlasBootstrap(options = {}) {
  const {
    jsguiClient,
    createDiagramAtlasControls = defaultDiagramAtlasFactory,
    registerControls
  } = options;
  if (!jsguiClient) {
    throw new Error("createDiagramAtlasBootstrap requires a jsguiClient instance");
  }
  const atlasControlsFactory = typeof createDiagramAtlasControls === "function"
    ? createDiagramAtlasControls
    : defaultDiagramAtlasFactory;
  const diagramAtlasSharedControls = atlasControlsFactory(jsguiClient);
  const {
    DiagramProgressControl,
    buildCodeSection,
    buildDbSection,
    buildFeatureSection
  } = diagramAtlasSharedControls;

  let diagramAtlasContext = null;
  const DIAGRAM_STATUS_POLL_MS = 1500;

  function getDiagramAtlasContext() {
    if (typeof document === "undefined") {
      return null;
    }
    if (diagramAtlasContext && diagramAtlasContext.document === document) {
      return diagramAtlasContext;
    }
    if (typeof jsguiClient.Client_Page_Context === "function") {
      diagramAtlasContext = new jsguiClient.Client_Page_Context({ document });
      if (typeof registerControls === "function") {
        registerControls(diagramAtlasContext);
      }
    } else {
      diagramAtlasContext = null;
    }
    return diagramAtlasContext;
  }

  function renderControlToFragment(control) {
    if (!control || typeof document === "undefined") {
      return null;
    }
    const html = typeof control.all_html_render === "function" ? control.all_html_render() : "";
    if (!html) {
      return null;
    }
    const template = document.createElement("template");
    template.innerHTML = html;
    return template.content;
  }

  function renderAtlasSections(target, payload) {
    if (!target) return;
    while (target.firstChild) {
      target.removeChild(target.firstChild);
    }
    const context = getDiagramAtlasContext();
    if (!context) {
      target.appendChild(createElement(document, "div", "diagram-shell__placeholder", "Diagram context unavailable."));
      return;
    }
    const sections = [];
    if (payload && payload.code) {
      sections.push(buildCodeSection(context, payload.code));
    }
    if (payload && payload.db) {
      sections.push(buildDbSection(context, payload.db));
    }
    if (payload && payload.features) {
      sections.push(buildFeatureSection(context, payload.features));
    }
    const fragment = document.createDocumentFragment();
    sections.forEach((sectionControl) => {
      const rendered = renderControlToFragment(sectionControl);
      if (rendered) {
        fragment.appendChild(rendered);
      }
    });
    if (fragment.childNodes.length) {
      target.appendChild(fragment);
    } else {
      target.appendChild(createElement(document, "div", "diagram-shell__placeholder", "Diagram Atlas will populate once data loads."));
    }
  }

  function updateDiagnostics(nodes, payload) {
    if (!nodes) return;
    const diagnosticEntries = nodes.diagnostics;
    const codeSummary = payload && payload.code && payload.code.summary ? payload.code.summary : {};
    const topFiles = payload && payload.code && Array.isArray(payload.code.topFiles) ? payload.code.topFiles : [];
    const largestFile = topFiles.length ? topFiles[0] : null;
    const stats = {
      generatedAt: {
        text: formatTimestamp(payload && payload.generatedAt)
      },
      codeFiles: {
        text: formatNumber(codeSummary.fileCount)
      },
      codeBytes: {
        text: formatBytes(codeSummary.totalBytes),
        tooltip: Number.isFinite(codeSummary.totalBytes) ? `${formatNumber(codeSummary.totalBytes)} bytes` : null
      },
      largestFile: largestFile
        ? { text: formatBytes(largestFile.bytes), tooltip: largestFile.file }
        : { text: "—" },
      dbTables: {
        text: formatNumber(payload && payload.db && payload.db.totalTables)
      },
      features: {
        text: formatNumber(payload && payload.features && payload.features.featureCount)
      }
    };
    if (diagnosticEntries) {
      Object.keys(stats).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(diagnosticEntries, key)) return;
        const entry = diagnosticEntries[key];
        if (!entry) return;
        const valueNode = entry.value || entry;
        const details = stats[key] || {};
        setNodeText(valueNode, details.text == null ? "—" : String(details.text));
        if (details.tooltip) {
          entry.container.setAttribute("title", details.tooltip);
        } else {
          entry.container.removeAttribute("title");
        }
      });
    }
    if (nodes.toolbar) {
      Object.keys(nodes.toolbar).forEach((metric) => {
        if (!Object.prototype.hasOwnProperty.call(stats, metric)) return;
        const target = nodes.toolbar[metric];
        if (!target) return;
        const details = stats[metric] || {};
        setNodeText(target, details.text == null ? "—" : String(details.text));
      });
    }
  }

  function resolveProgressControl(progressEl) {
    if (!progressEl || typeof DiagramProgressControl !== "function") {
      return null;
    }
    if (progressEl.__diagramProgressControl) {
      return progressEl.__diagramProgressControl;
    }
    const context = getDiagramAtlasContext();
    if (!context) {
      return null;
    }
    try {
      const control = new DiagramProgressControl({ context, el: progressEl });
      control.activate(progressEl);
      progressEl.__diagramProgressControl = control;
      return control;
    } catch (error) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[copilot] unable to bind diagram progress control", error);
      }
      return null;
    }
  }

  function setProgressState(progressEl, status, label, detail) {
    if (!progressEl) return;
    const progressControl = resolveProgressControl(progressEl);
    if (progressControl && typeof progressControl.setStatus === "function") {
      const currentState = progressControl._state || {};
      progressControl.setStatus(status || currentState.status, detail || currentState.detail);
    }
    if (status) {
      progressEl.setAttribute("data-state", status);
    }
    if (label) {
      const titleNode = progressEl.querySelector(".diagram-loading__title");
      setNodeText(titleNode, label);
    }
    if (detail) {
      const detailNode = progressEl.querySelector(".diagram-loading__detail");
      setNodeText(detailNode, detail);
    }
  }

  function renderAtlasError(target, message) {
    if (!target) return;
    const errorNode = createElement(document, "div", "diagram-shell__placeholder", message || "Failed to load diagram atlas data.");
    target.innerHTML = "";
    target.appendChild(errorNode);
  }

  function setRefreshButtonState(button, loading) {
    if (!button) return;
    if (loading) {
      button.dataset.loading = "1";
      button.setAttribute("disabled", "disabled");
    } else {
      delete button.dataset.loading;
      button.removeAttribute("disabled");
    }
  }

  function stopDiagramStatusWatcher(nodes) {
    if (!nodes || typeof nodes.statusWatcherStop !== "function") {
      return;
    }
    try {
      nodes.statusWatcherStop();
    } finally {
      nodes.statusWatcherStop = null;
    }
  }

  function handleDiagramStatus(status, nodes) {
    if (!status || !nodes) {
      return;
    }
    if (status.state === "refreshing") {
      const detail = status.detail || (status.startedAt ? `Running since ${formatTimestamp(status.startedAt)}` : "diagram-data CLI running...");
      setProgressState(nodes.progress, "loading", "Refreshing diagram data", detail);
      return;
    }
    if (status.state === "error") {
      const errorDetail = status.lastError && status.lastError.message ? status.lastError.message : "Check server logs for details";
      setProgressState(nodes.progress, "error", "Diagram refresh failed", errorDetail);
    }
  }

  function startDiagramStatusWatcher(config, nodes) {
    if (!nodes || !nodes.progress || typeof fetch !== "function") {
      return null;
    }
    const statusUrl = (config && config.statusUrl) || "/api/diagram-data/status";
    let stopped = false;
    const poll = async () => {
      if (stopped) {
        return;
      }
      try {
        const response = await fetch(statusUrl, { headers: { Accept: "application/json" } });
        if (!response.ok) {
          stopped = true;
          return;
        }
        const status = await response.json();
        handleDiagramStatus(status, nodes);
        if (!stopped && status && status.state === "refreshing") {
          setTimeout(poll, DIAGRAM_STATUS_POLL_MS);
          return;
        }
        if (!status || status.state !== "pending") {
          stopped = true;
        }
      } catch (error) {
        stopped = true;
        if (typeof console !== "undefined" && console.debug) {
          console.debug("[copilot] diagram status poll stopped", error);
        }
      }
    };
    poll();
    return () => {
      stopped = true;
    };
  }

  function attachRefreshHandler(config, nodes) {
    if (!nodes || !nodes.refresh) {
      return;
    }
    const button = nodes.refresh;
    button.addEventListener("click", () => {
      if (button.dataset.loading === "1") {
        return;
      }
      setRefreshButtonState(button, true);
      stopDiagramStatusWatcher(nodes);
      hydrateDiagramAtlas(config, nodes, { forceRefresh: true })
        .catch(() => {})
        .finally(() => setRefreshButtonState(button, false));
    });
  }

  async function hydrateDiagramAtlas(config, nodes, options = {}) {
    const dataUrl = (config && config.dataUrl) || "/api/diagram-data";
    const forceRefresh = Boolean(options.forceRefresh);
    const shouldRefresh = forceRefresh && config && config.refreshUrl;
    const endpoint = shouldRefresh ? config.refreshUrl : dataUrl;
    const method = shouldRefresh ? "POST" : "GET";
    const label = shouldRefresh ? "Refreshing diagram data" : "Fetching diagram data";
    const detail = shouldRefresh ? "Triggering CLI + cache refresh..." : "Collecting sources and metrics...";
    setProgressState(nodes.progress, "loading", label, detail);
    if (shouldRefresh) {
      const stopWatcher = startDiagramStatusWatcher(config, nodes);
      if (stopWatcher) {
        nodes.statusWatcherStop = stopWatcher;
      }
    }
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { Accept: "application/json", "Content-Type": "application/json" }
      });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const payload = await response.json();
      updateDiagnostics(nodes, payload);
      renderAtlasSections(nodes.sections, payload);
      setProgressState(nodes.progress, "complete", "Diagram Atlas ready", payload.generatedAt || "Loaded from cache");
      if (typeof window !== "undefined") {
        window.__DIAGRAM_ATLAS_STATE__ = payload;
      }
    } catch (error) {
      setProgressState(nodes.progress, "error", "Failed to load diagram data", error.message);
      renderAtlasError(nodes.sections, error.message);
      if (typeof console !== "undefined" && console.error) {
        console.error("[copilot] diagram atlas hydration failed", error);
      }
    } finally {
      stopDiagramStatusWatcher(nodes);
    }
  }

  function applyInitialDiagramPayload(config, nodes) {
    if (!config || !config.initialData) return false;
    updateDiagnostics(nodes, config.initialData);
    renderAtlasSections(nodes.sections, config.initialData);
    setProgressState(nodes.progress, "complete", "Diagram Atlas ready", config.initialData.generatedAt || "Loaded from snapshot");
    return true;
  }

  function bootstrapDiagramAtlas() {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }
    const config = window.__DIAGRAM_ATLAS__ || null;
    if (!config) {
      return;
    }
    const shell = document.querySelector('[data-role="diagram-shell"]');
    if (!shell || shell.dataset.diagramHydrated === "1") {
      return;
    }
    shell.dataset.diagramHydrated = "1";
    const sections = shell.querySelector('[data-role="diagram-atlas-sections"]');
    const progress = shell.querySelector('[data-role="diagram-progress"]');
    const refresh = shell.querySelector('[data-role="diagram-refresh"]');
    const metricNodes = collectDiagnosticsMap(shell);
    const nodes = {
      shell,
      sections,
      progress,
      refresh,
      diagnostics: metricNodes.diagnostics,
      toolbar: metricNodes.toolbar,
      statusWatcherStop: null
    };
    attachRefreshHandler(config, nodes);
    if (applyInitialDiagramPayload(config, nodes)) {
      return;
    }
    hydrateDiagramAtlas(config, nodes);
  }

  return {
    bootstrapDiagramAtlas
  };
}

module.exports = {
  createDiagramAtlasBootstrap
};
