"use strict";

const jsguiClient = require("../../../vendor/jsgui3-client/client.js");
const { installBindingPlugin } = require("../jsgui/bindingPlugin");

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

(function bootstrap() {
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
  }
})();
