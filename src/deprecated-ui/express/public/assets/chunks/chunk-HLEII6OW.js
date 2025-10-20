import {
  require_lang
} from "./chunk-BOXXWBMA.js";
import {
  __toESM
} from "./chunk-QU4DACYI.js";

// src/ui/public/index/formatters.js
var import_lang_tools = __toESM(require_lang());
function formatNumber(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) {
    return String(val ?? "0");
  }
  try {
    return num.toLocaleString();
  } catch (err) {
    return String(num);
  }
}
function formatTimestamp(ts) {
  if (!ts) {
    return (/* @__PURE__ */ new Date()).toLocaleTimeString();
  }
  const parsed = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(parsed.getTime())) {
    return (/* @__PURE__ */ new Date()).toLocaleTimeString();
  }
  return parsed.toLocaleTimeString();
}
function formatRelativeTime(value) {
  if (!value) {
    return "just now";
  }
  const ts = (0, import_lang_tools.tof)(value) === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ts)) {
    return "\u2014";
  }
  const now = Date.now();
  const diff = now - ts;
  if (diff < -5e3) {
    return new Date(ts).toLocaleString();
  }
  if (Math.abs(diff) < 5e3) {
    return "just now";
  }
  const minutes = Math.floor(Math.abs(diff) / 6e4);
  if (minutes < 1) {
    return `${Math.max(1, Math.round(Math.abs(diff) / 1e3))}s ago`;
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  return new Date(ts).toLocaleString();
}

export {
  formatNumber,
  formatTimestamp,
  formatRelativeTime
};
