"use strict";

const DEFAULT_PATTERNS = Object.freeze([
  "jsgui html-core pre_activate",
  "jsgui html-core activate",
  "jsgui.def_server_resources",
  "Missing context.map_Controls for type",
  "Data_Model_View_Model_Control pre_activate complete"
]);

function isBrowserRuntime() {
  return typeof window !== "undefined" && typeof console !== "undefined";
}

function readDisableFlag() {
  if (typeof globalThis === "undefined") return false;
  return globalThis.__COPILOT_DISABLE_CONSOLE_FILTER__ === true;
}

function readDebugFlag() {
  if (typeof globalThis === "undefined") return false;
  return (
    globalThis.JSGUI_DEBUG === true ||
    globalThis.__JSGUI_DEBUG__ === true ||
    globalThis.__COPILOT_UI_DEBUG__ === true
  );
}

function shouldSuppress(patterns, args) {
  if (!args || !args.length) return false;
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i];
    if (typeof value !== "string") continue;
    for (let p = 0; p < patterns.length; p += 1) {
      const pattern = patterns[p];
      if (pattern && value.includes(pattern)) {
        return true;
      }
    }
  }
  return false;
}

function installConsoleNoiseFilter(options = {}) {
  if (!isBrowserRuntime()) {
    return { installed: false, reason: "not-browser" };
  }

  if (typeof globalThis !== "undefined" && globalThis.__COPILOT_CONSOLE_NOISE_FILTER_INSTALLED__) {
    return { installed: true, alreadyInstalled: true };
  }

  if (readDisableFlag()) {
    return { installed: false, reason: "disabled" };
  }

  if (readDebugFlag()) {
    return { installed: false, reason: "debug" };
  }

  const patterns = Array.isArray(options.patterns) && options.patterns.length
    ? options.patterns
    : DEFAULT_PATTERNS;
  const methods = Array.isArray(options.methods) && options.methods.length
    ? options.methods
    : ["log", "warn"];

  const originals = {};
  methods.forEach((method) => {
    const fn = console[method];
    if (typeof fn !== "function") return;
    originals[method] = fn.bind(console);
    console[method] = (...args) => {
      if (shouldSuppress(patterns, args)) {
        return;
      }
      return originals[method](...args);
    };
  });

  if (typeof globalThis !== "undefined") {
    globalThis.__COPILOT_CONSOLE_NOISE_FILTER_INSTALLED__ = true;
    globalThis.__COPILOT_CONSOLE_NOISE_FILTER_STATE__ = {
      patterns: patterns.slice(),
      methods: methods.slice()
    };
  }

  return { installed: true, patternsCount: patterns.length, methods };
}

module.exports = {
  DEFAULT_PATTERNS,
  installConsoleNoiseFilter
};
