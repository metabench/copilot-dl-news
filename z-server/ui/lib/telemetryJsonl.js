"use strict";

function splitJsonlChunk(buffer, chunk) {
  const prev = buffer ? String(buffer) : "";
  const next = chunk == null ? "" : String(chunk);
  const combined = prev + next;
  const parts = combined.split(/\r?\n/);
  const trailing = parts.pop() || "";
  const lines = parts.filter((line) => line !== "");
  return { lines, buffer: trailing };
}

function looksLikeJsonObject(line) {
  const trimmed = String(line || "").trim();
  return trimmed.startsWith("{") && trimmed.endsWith("}");
}

function isTelemetryV1(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (obj.v !== 1) return false;
  if (!obj.event || typeof obj.event !== "string") return false;
  if (!obj.level || typeof obj.level !== "string") return false;
  if (!obj.server || typeof obj.server !== "object") return false;
  if (!obj.server.name || typeof obj.server.name !== "string") return false;
  if (!obj.server.runId || typeof obj.server.runId !== "string") return false;
  return true;
}

function formatTelemetryEvent(obj) {
  const ts = obj.ts ? String(obj.ts) : "";
  const level = obj.level ? String(obj.level).toUpperCase() : "INFO";
  const event = obj.event ? String(obj.event) : "event";
  const msg = obj.msg ? String(obj.msg) : "";
  const suffix = msg ? ` - ${msg}` : "";
  return ts ? `${ts} ${level} ${event}${suffix}` : `${level} ${event}${suffix}`;
}

function tryFormatTelemetryLine(line) {
  if (!looksLikeJsonObject(line)) return null;
  try {
    const parsed = JSON.parse(String(line));
    if (!isTelemetryV1(parsed)) return null;
    return formatTelemetryEvent(parsed);
  } catch (_) {
    return null;
  }
}

module.exports = {
  splitJsonlChunk,
  tryFormatTelemetryLine,
  formatTelemetryEvent,
  isTelemetryV1
};
