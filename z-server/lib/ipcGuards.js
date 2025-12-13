"use strict";

const path = require("path");

function normalizeAbsolutePath(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return path.resolve(trimmed);
}

function isPathInsideBase(candidatePath, basePath) {
  const baseResolved = path.resolve(basePath);
  const candidateResolved = path.resolve(candidatePath);
  if (candidateResolved === baseResolved) return true;
  return candidateResolved.startsWith(baseResolved + path.sep);
}

/**
 * Validate that a renderer-provided server file path is within the repo base and
 * is present in the latest scan allowlist.
 *
 * @param {string} filePath
 * @param {object} options
 * @param {string} options.basePath
 * @param {Set<string>} options.allowedServerFiles absolute, resolved paths
 * @returns {{ok: true, filePath: string} | {ok: false, message: string}}
 */
function validateServerFilePath(filePath, { basePath, allowedServerFiles }) {
  const normalized = normalizeAbsolutePath(filePath);
  if (!normalized) {
    return { ok: false, message: "Invalid filePath" };
  }

  if (!isPathInsideBase(normalized, basePath)) {
    return { ok: false, message: "Server path must be inside workspace" };
  }

  if (!(allowedServerFiles instanceof Set) || allowedServerFiles.size === 0) {
    return { ok: false, message: "No allowlist available (scan not completed)" };
  }

  if (!allowedServerFiles.has(normalized)) {
    return { ok: false, message: "Server path is not in allowlist" };
  }

  return { ok: true, filePath: normalized };
}

/**
 * Validate a URL before passing it to shell.openExternal / browser spawn.
 * Default policy: allow only http(s) and localhost-ish hosts.
 *
 * @param {string} url
 * @param {object} [options]
 * @param {string[]} [options.allowedProtocols]
 * @param {string[]} [options.allowedHosts]
 * @returns {{ok: true, url: string} | {ok: false, message: string}}
 */
function validateExternalUrl(url, options = {}) {
  const { allowedProtocols = ["http:", "https:"], allowedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1"] } = options;

  if (typeof url !== "string" || !url.trim()) {
    return { ok: false, message: "Invalid url" };
  }

  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { ok: false, message: "Invalid url" };
  }

  if (!allowedProtocols.includes(parsed.protocol)) {
    return { ok: false, message: `Disallowed URL protocol: ${parsed.protocol}` };
  }

  const hostname = (parsed.hostname || "").toLowerCase();
  if (!allowedHosts.includes(hostname)) {
    return { ok: false, message: `Disallowed URL host: ${hostname}` };
  }

  return { ok: true, url: parsed.toString() };
}

/**
 * Best-effort validation that an externally detected PID is actually a node
 * process running the given server file.
 *
 * This is intentionally conservative: if we cannot confirm, we return false.
 *
 * @param {number} pid
 * @param {string} serverFilePath absolute resolved
 * @param {object} deps
 * @param {(pid:number)=>Promise<{name:string,pid:number}|null>} deps.getProcessInfo
 * @param {(pid:number)=>Promise<string|null>} deps.getProcessCommandLine
 */
async function isPidLikelyRunningServer(pid, serverFilePath, deps) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (typeof serverFilePath !== "string" || !serverFilePath) return false;
  if (!deps || typeof deps.getProcessInfo !== "function" || typeof deps.getProcessCommandLine !== "function") {
    return false;
  }

  const info = await deps.getProcessInfo(pid);
  if (!info || !info.name) return false;
  if (!String(info.name).toLowerCase().includes("node")) return false;

  const cmd = await deps.getProcessCommandLine(pid);
  if (!cmd) return false;

  const cmdLower = cmd.toLowerCase();
  const serverLower = serverFilePath.toLowerCase();

  // Strong match: full path appears.
  if (cmdLower.includes(serverLower)) return true;

  // Weaker fallback: basename appears.
  const baseName = path.basename(serverFilePath).toLowerCase();
  if (!baseName) return false;
  return cmdLower.includes(baseName);
}

module.exports = {
  normalizeAbsolutePath,
  isPathInsideBase,
  validateServerFilePath,
  validateExternalUrl,
  isPidLikelyRunningServer
};
