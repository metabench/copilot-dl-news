"use strict";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(text, maxLen) {
  const s = String(text);
  if (!Number.isFinite(maxLen) || maxLen <= 0) return "";
  if (s.length <= maxLen) return s;
  return s.slice(0, Math.max(0, maxLen - 1)) + "…";
}

function stableStringify(value, maxLen = 900) {
  try {
    const json = JSON.stringify(value, (key, v) => {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const out = {};
        for (const k of Object.keys(v).sort()) out[k] = v[k];
        return out;
      }
      return v;
    }, 2);
    return truncate(json, maxLen);
  } catch (_) {
    return truncate(String(value), maxLen);
  }
}

function inferTopic(event) {
  if (event?.topic) return String(event.topic);
  const type = typeof event?.type === "string" ? event.type : "";
  if (!type.startsWith("crawl:")) return "unknown";
  return type.split(":")[1] || "unknown";
}

function shortType(type) {
  if (typeof type !== "string") return "";
  const parts = type.split(":");
  return parts.slice(1).join(":") || type;
}

function formatTimestamp(event) {
  const ts = event?.timestamp ? String(event.timestamp) : "";
  return ts ? ts.slice(11, 19) : "";
}

function getSeverity(event) {
  const s = event?.severity ? String(event.severity) : "info";
  return ["debug", "info", "warn", "error", "critical"].includes(s) ? s : "info";
}

function formatBaseLine(event) {
  const t = formatTimestamp(event);
  const sev = getSeverity(event);
  const topic = inferTopic(event);
  const type = event?.type || "";
  const msg = event?.message ? String(event.message) : "";
  const tags = Array.isArray(event?.tags) ? event.tags : [];

  const tagsStr = tags.length ? ` <span class=\"cw-tel__tags\">${escapeHtml(tags.slice(0, 6).join(", "))}</span>` : "";
  const msgStr = msg ? `<span class=\"cw-tel__msg\">${escapeHtml(truncate(msg, 220))}</span>` : "";
  const restStr = msgStr || tagsStr ? `<span class=\"cw-tel__rest\">${msgStr}${tagsStr}</span>` : "";

  return (
    `<div class=\"cw-tel__line cw-tel__line--${sev}\">` +
    `<span class=\"cw-tel__time\">${escapeHtml(t)}</span>` +
    `<span class=\"cw-tel__topic-label\">[${escapeHtml(topic)}]</span>` +
    `<span class=\"cw-tel__type\">${escapeHtml(shortType(type))}</span>` +
    `${restStr}` +
    `</div>`
  );
}

function formatDataBlock(event, opts = {}) {
  const { maxLen = 900 } = opts;
  const data = event?.data;
  if (!data || (typeof data === "object" && Object.keys(data).length === 0)) return "";
  const json = stableStringify(data, maxLen);
  return `<pre class=\"cw-tel__data\">${escapeHtml(json)}</pre>`;
}

// --- Topic/type specific renderers (add here over time) ---

function renderPlaceHubs(event) {
  const base = formatBaseLine(event);
  const type = String(event?.type || "");

  // Show details for key hub events by default.
  const isKey =
    type.endsWith(":candidate") ||
    type.endsWith(":determination") ||
    type.endsWith(":guess:failed") ||
    type.endsWith(":guess:completed");

  if (!isKey) return { lineHtml: base, detailHtml: "" };

  const details = formatDataBlock(event, { maxLen: 1400 });
  return { lineHtml: base, detailHtml: details };
}

function renderErrors(event) {
  const base = formatBaseLine(event);
  const sev = getSeverity(event);
  if (sev !== "warn" && sev !== "error" && sev !== "critical") {
    return { lineHtml: base, detailHtml: "" };
  }
  const details = formatDataBlock(event, { maxLen: 1400 });
  return { lineHtml: base, detailHtml: details };
}

function renderDefault(event) {
  const base = formatBaseLine(event);
  const sev = getSeverity(event);

  // Default heuristic: show data for non-info events or tagged events.
  const tagged = Array.isArray(event?.tags) && event.tags.length > 0;
  const show = tagged || sev === "warn" || sev === "error" || sev === "critical";
  const details = show ? formatDataBlock(event, { maxLen: 1200 }) : "";
  return { lineHtml: base, detailHtml: details };
}

function safeUrlLabel(url) {
  if (!url) return "";
  try {
    const u = new URL(String(url));
    const host = u.hostname || "";
    const path = (u.pathname || "/").replace(/\/$/, "");
    const shortPath = path.length > 48 ? path.slice(0, 47) + "…" : path;
    return host + shortPath;
  } catch (_) {
    const s = String(url);
    return s.length > 70 ? s.slice(0, 69) + "…" : s;
  }
}

function renderFetchAndCache(event) {
  const data = event?.data && typeof event.data === "object" ? event.data : {};
  const type = String(event?.type || "");
  const topic = inferTopic(event);
  const url = safeUrlLabel(data.url || data.finalUrl || data.requestUrl || "");
  const status =
    Number.isFinite(data.status) ? data.status :
    Number.isFinite(data.httpStatus) ? data.httpStatus :
    Number.isFinite(data.statusCode) ? data.statusCode :
    null;
  const ms =
    Number.isFinite(data.durationMs) ? data.durationMs :
    Number.isFinite(data.elapsedMs) ? data.elapsedMs :
    Number.isFinite(data.latencyMs) ? data.latencyMs :
    null;
  const attempt = Number.isFinite(data.attempt) ? data.attempt : null;

  let headline = "";
  if (topic === "cache") headline = "CACHE";
  if (type.endsWith(":success")) headline = "OK";
  if (type.endsWith(":retry")) headline = "RETRY";
  if (type.endsWith(":soft-failure")) headline = "SOFT";
  if (type.endsWith(":error")) headline = "ERROR";

  const parts = [];
  if (headline) parts.push(headline);
  if (status != null) parts.push(String(status));
  if (ms != null) parts.push(`${ms}ms`);
  if (attempt != null && (headline === "RETRY" || headline === "SOFT")) parts.push(`attempt=${attempt}`);
  if (url) parts.push(url);

  const base = formatBaseLine({
    ...event,
    message: parts.join(" ")
  });

  const sev = getSeverity(event);
  const show = sev === "warn" || sev === "error" || sev === "critical" || type.endsWith(":retry") || type.endsWith(":soft-failure");
  const details = show ? formatDataBlock(event, { maxLen: 1400 }) : "";
  return { lineHtml: base, detailHtml: details };
}

function getTelemetryRenderer(event) {
  const topic = inferTopic(event);
  if (topic === "place-hubs") return renderPlaceHubs;
  if (topic === "fetch" || topic === "cache") return renderFetchAndCache;
  return renderErrors;
}

module.exports = {
  inferTopic,
  getSeverity,
  getTelemetryRenderer,
  renderDefault,
  escapeHtml
};
