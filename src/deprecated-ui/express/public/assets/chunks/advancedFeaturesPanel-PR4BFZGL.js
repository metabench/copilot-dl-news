import {
  renderFeatureFlags,
  renderPriorityBonuses,
  renderPriorityWeights
} from "./chunk-ONW5F3S5.js";
import {
  showElement
} from "./chunk-R3BBB6IF.js";
import {
  formatTimestamp
} from "./chunk-HLEII6OW.js";
import {
  require_lang
} from "./chunk-BOXXWBMA.js";
import {
  __toESM
} from "./chunk-QU4DACYI.js";

// src/ui/public/index/advancedFeaturesPanel.js
var import_lang_tools = __toESM(require_lang());
function createAdvancedFeaturesPanel(deps) {
  const {
    panelEl,
    statusEl,
    featureFlagsList,
    priorityBonusesList,
    priorityWeightsList
  } = deps;
  const toPlainObject = (value) => (0, import_lang_tools.tof)(value) === "object" ? value : {};
  const sectionRenderers = [
    {
      render: renderFeatureFlags,
      select: (config) => config.features,
      target: featureFlagsList
    },
    {
      render: renderPriorityBonuses,
      select: (config) => config.queue,
      target: priorityBonusesList
    },
    {
      render: renderPriorityWeights,
      select: (config) => config.queue,
      target: priorityWeightsList
    }
  ];
  const renderSections = (config) => {
    const resolvedConfig = toPlainObject(config);
    (0, import_lang_tools.each)(sectionRenderers, ({ render, select, target }) => {
      if (!(0, import_lang_tools.is_defined)(target)) return;
      render(toPlainObject(select(resolvedConfig)), target);
    });
  };
  function setState({ state, message, busy } = {}) {
    if (!(0, import_lang_tools.is_defined)(panelEl)) return;
    if ((0, import_lang_tools.tof)(state) === "string") {
      panelEl.dataset.state = state;
    }
    if ((0, import_lang_tools.tof)(busy) === "boolean") {
      panelEl.setAttribute("aria-busy", busy ? "true" : "false");
    }
    if ((0, import_lang_tools.is_defined)(statusEl) && (0, import_lang_tools.tof)(message) === "string") {
      statusEl.textContent = message;
    }
  }
  function renderFeatureFlags2(features) {
    renderFeatureFlags(toPlainObject(features), featureFlagsList);
  }
  function renderPriorityBonuses2(queueConfig) {
    renderPriorityBonuses(toPlainObject(queueConfig), priorityBonusesList);
  }
  function renderPriorityWeights2(queueConfig) {
    renderPriorityWeights(toPlainObject(queueConfig), priorityWeightsList);
  }
  async function load({ quiet = false } = {}) {
    if (!(0, import_lang_tools.is_defined)(panelEl) || !(0, import_lang_tools.is_defined)(statusEl)) return;
    try {
      setState({ busy: true });
      if (!quiet) {
        showElement(panelEl);
        setState({
          state: "loading",
          message: "Loading configuration\u2026",
          busy: true
        });
      }
      const res = await fetch("/api/config");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const payload = await res.json();
      const config = toPlainObject(payload?.config);
      renderSections(config);
      try {
        window.__advancedConfig = config;
      } catch (_) {
      }
      showElement(panelEl);
      setState({
        state: "ready",
        message: `Updated ${formatTimestamp()}`,
        busy: false
      });
    } catch (error) {
      showElement(panelEl);
      const message = (0, import_lang_tools.is_defined)(error?.message) ? error.message : String(error || "unknown error");
      setState({
        state: "error",
        message: `Failed to load advanced config (${message})`,
        busy: false
      });
      if (!quiet) {
        renderSections({});
      }
    }
  }
  return {
    setState,
    load,
    renderFeatureFlags: renderFeatureFlags2,
    renderPriorityBonuses: renderPriorityBonuses2,
    renderPriorityWeights: renderPriorityWeights2
  };
}
export {
  createAdvancedFeaturesPanel
};
