"use strict";

const SCAN_PROGRESS_TYPES = new Set([
  "count-start",
  "count-progress",
  "count",
  "progress",
  "complete"
]);

function clampNonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

/**
 * Normalize and validate scan progress messages.
 *
 * Contract:
 * - All messages must have a string `type`.
 * - `count` requires `total`.
 * - `progress` prefers `current` + `total`.
 * - `file` is optional and normalized to string or null.
 */
function normalizeScanProgressMessage(msg) {
  if (!msg || typeof msg !== "object") return null;
  const type = typeof msg.type === "string" ? msg.type : null;
  if (!type || !SCAN_PROGRESS_TYPES.has(type)) return null;

  if (type === "count-start") {
    return { type };
  }

  if (type === "count-progress") {
    return {
      type,
      current: clampNonNegativeInt(msg.current),
      file: msg.file == null ? null : String(msg.file)
    };
  }

  if (type === "count") {
    return {
      type,
      total: clampNonNegativeInt(msg.total)
    };
  }

  if (type === "progress") {
    const total = clampNonNegativeInt(msg.total);
    const current = clampNonNegativeInt(msg.current);

    return {
      type,
      current: total > 0 ? Math.min(current, total) : current,
      total,
      file: msg.file == null ? null : String(msg.file)
    };
  }

  if (type === "complete") {
    return { type };
  }

  return null;
}

module.exports = {
  SCAN_PROGRESS_TYPES,
  normalizeScanProgressMessage
};
