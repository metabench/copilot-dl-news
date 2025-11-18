"use strict";

const EVENT_NAME = "copilot:urlFilterToggle";
const DEFAULT_MAX_ENTRIES = 50;

function nowIso() {
  return new Date().toISOString();
}

function resolveEventCtor() {
  if (typeof window !== "undefined" && typeof window.CustomEvent === "function") {
    return window.CustomEvent;
  }
  if (typeof CustomEvent === "function") {
    return CustomEvent;
  }
  return null;
}

function resolveWindow() {
  if (typeof window === "undefined") {
    return null;
  }
  return window;
}

function ensureDebugStore(w, maxEntries = DEFAULT_MAX_ENTRIES) {
  if (!w) {
    return null;
  }
  const root = w.__COPILOT_UI_DEBUG__ || (w.__COPILOT_UI_DEBUG__ = {});
  if (!Array.isArray(root.urlFilterToggle)) {
    root.urlFilterToggle = [];
  }
  root.__maxEntries = maxEntries;
  return root.urlFilterToggle;
}

function pushDebugEntry(entry, maxEntries = DEFAULT_MAX_ENTRIES) {
  const w = resolveWindow();
  const bucket = ensureDebugStore(w, maxEntries);
  if (!bucket) {
    return;
  }
  bucket.push(entry);
  while (bucket.length > maxEntries) {
    bucket.shift();
  }
}

function dispatchDebugEvent(entry) {
  const w = resolveWindow();
  if (!w || typeof w.dispatchEvent !== "function") {
    return;
  }
  const EventCtor = resolveEventCtor();
  if (!EventCtor) {
    try {
      w.dispatchEvent({ type: EVENT_NAME, detail: entry });
    } catch (_) {
      // ignore dispatch failure when CustomEvent is unavailable
    }
    return;
  }
  try {
    w.dispatchEvent(new EventCtor(EVENT_NAME, { detail: entry }));
  } catch (error) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[copilot] failed to dispatch url filter debug event", error);
    }
  }
}

function emitUrlFilterDebug(detail, options = {}) {
  const entry = {
    timestamp: nowIso(),
    ...detail
  };
  const maxEntries = Number.isFinite(options.maxEntries) && options.maxEntries > 0
    ? Math.trunc(options.maxEntries)
    : DEFAULT_MAX_ENTRIES;
  pushDebugEntry(entry, maxEntries);
  dispatchDebugEvent(entry);
  return entry;
}

module.exports = {
  EVENT_NAME,
  emitUrlFilterDebug,
  pushDebugEntry,
  dispatchDebugEvent
};
