"use strict";

/**
 * Request Diagnostics Utilities
 * 
 * Functions for request timing, diagnostics, and response headers.
 * 
 * @module src/ui/server/dataExplorer/utils/diagnostics
 */

const crypto = require("crypto");

const API_HEADER_NAME = "dataExplorer";

/**
 * Generate a unique request ID
 * @returns {string} - UUID or hex string
 */
function generateRequestId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(8).toString("hex");
}

/**
 * Mark request start time for duration measurement
 * @returns {bigint|number} - Start mark (hrtime bigint or Date.now())
 */
function markRequestStart() {
  if (typeof process.hrtime === "function" && typeof process.hrtime.bigint === "function") {
    return process.hrtime.bigint();
  }
  return Date.now();
}

/**
 * Compute duration in milliseconds from start mark
 * @param {bigint|number} startMark - Start mark from markRequestStart
 * @returns {number|null} - Duration in milliseconds or null
 */
function computeDurationMs(startMark) {
  if (typeof startMark === "bigint" && typeof process.hrtime === "function" && typeof process.hrtime.bigint === "function") {
    const diff = process.hrtime.bigint() - startMark;
    return Number(diff) / 1e6;
  }
  if (typeof startMark === "number") {
    return Date.now() - startMark;
  }
  return null;
}

/**
 * Build request diagnostics object
 * @param {Object} req - Express request
 * @param {Object} extra - Additional diagnostics data
 * @returns {Object} - Diagnostics object
 */
function buildRequestDiagnostics(req, extra = {}) {
  const durationMs = computeDurationMs(req && req.__copilotRequestStart);
  return {
    requestId: (req && req.__copilotRequestId) || null,
    durationMs: durationMs != null ? Number(durationMs) : null,
    timestamp: new Date().toISOString(),
    route: req && req.path ? req.path : null,
    ...extra
  };
}

/**
 * Apply diagnostics headers to response
 * @param {Object} res - Express response
 * @param {Object} diagnostics - Diagnostics object
 */
function applyDiagnosticsHeaders(res, diagnostics = {}) {
  if (!res) return;
  if (diagnostics.requestId) {
    res.setHeader("x-copilot-request-id", diagnostics.requestId);
  }
  if (Number.isFinite(diagnostics.durationMs)) {
    res.setHeader("x-copilot-duration-ms", diagnostics.durationMs.toFixed(2));
  }
  if (diagnostics.error) {
    res.setHeader("x-copilot-error", "1");
  }
  res.setHeader("x-copilot-api", API_HEADER_NAME);
}

/**
 * Check if request accepts JSON response
 * @param {Object} req - Express request
 * @returns {boolean}
 */
function acceptsJson(req) {
  if (!req || !req.headers) return false;
  const accept = req.headers.accept;
  if (!accept || typeof accept !== "string") return false;
  return accept.toLowerCase().includes("application/json");
}

/**
 * Create request tracking middleware
 * @returns {Function} - Express middleware
 */
function createRequestTrackingMiddleware() {
  return (req, res, next) => {
    req.__copilotRequestId = generateRequestId();
    req.__copilotRequestStart = markRequestStart();
    res.setHeader("x-copilot-request-id", req.__copilotRequestId);
    res.setHeader("x-copilot-api", API_HEADER_NAME);
    next();
  };
}

module.exports = {
  API_HEADER_NAME,
  generateRequestId,
  markRequestStart,
  computeDurationMs,
  buildRequestDiagnostics,
  applyDiagnosticsHeaders,
  acceptsJson,
  createRequestTrackingMiddleware
};
