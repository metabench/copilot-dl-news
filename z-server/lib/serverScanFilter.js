"use strict";

const path = require("path");

const DEFAULT_SCAN_VISIBILITY = Object.freeze({
  ui: true,
  labs: false,
  api: false,
  tools: false,
  tests: false,
  checks: false,
  other: false
});

function normalizeScanVisibility(input) {
  const next = {
    ...DEFAULT_SCAN_VISIBILITY,
    ...(input && typeof input === "object" ? input : null)
  };

  for (const key of Object.keys(DEFAULT_SCAN_VISIBILITY)) {
    next[key] = next[key] === true;
  }

  return next;
}

function classifyScannedServerPath(filePath, basePath) {
  const resolvedBasePath = basePath ? path.resolve(basePath) : process.cwd();
  const resolvedFilePath = filePath ? path.resolve(filePath) : "";
  const relRaw = path.relative(resolvedBasePath, resolvedFilePath);
  const relPath = relRaw.replace(/\\/g, "/");

  if (!relPath || relPath === "." || relPath.startsWith("../") || relPath === "..") {
    return { bucket: "other", relPath };
  }

  if (relPath.startsWith("src/ui/server/")) return { bucket: "ui", relPath };
  if (relPath.startsWith("src/ui/lab/")) return { bucket: "labs", relPath };
  if (relPath.startsWith("tests/")) return { bucket: "tests", relPath };
  if (relPath.startsWith("checks/")) return { bucket: "checks", relPath };
  if (relPath.startsWith("tools/")) return { bucket: "tools", relPath };
  if (relPath.startsWith("src/api/") || relPath.startsWith("src/server/")) return { bucket: "api", relPath };

  return { bucket: "other", relPath };
}

function shouldAlwaysExclude(relPath) {
  if (!relPath) return false;
  if (relPath.endsWith("tools/dev/js-server-scan.js")) return true;
  // Keep this conservative: anything containing the tool name is noise.
  if (relPath.includes("js-server-scan.js")) return true;
  return false;
}

function filterScannedServers(servers, { basePath, visibility } = {}) {
  const resolvedBasePath = basePath ? path.resolve(basePath) : process.cwd();
  const vis = normalizeScanVisibility(visibility);

  const result = [];
  for (const server of Array.isArray(servers) ? servers : []) {
    if (!server || typeof server !== "object") continue;
    if (typeof server.file !== "string" || server.file.length === 0) continue;

    const resolvedFilePath = path.isAbsolute(server.file)
      ? server.file
      : path.resolve(resolvedBasePath, server.file);

    const { bucket, relPath } = classifyScannedServerPath(resolvedFilePath, resolvedBasePath);
    if (shouldAlwaysExclude(relPath)) continue;

    if (bucket === "ui" && !vis.ui) continue;
    if (bucket === "labs" && !vis.labs) continue;
    if (bucket === "api" && !vis.api) continue;
    if (bucket === "tools" && !vis.tools) continue;
    if (bucket === "tests" && !vis.tests) continue;
    if (bucket === "checks" && !vis.checks) continue;
    if (bucket === "other" && !vis.other) continue;

    result.push({
      ...server,
      file: resolvedFilePath,
      scanCategory: bucket,
      scanRelPath: relPath
    });
  }

  return result;
}

module.exports = {
  DEFAULT_SCAN_VISIBILITY,
  normalizeScanVisibility,
  classifyScannedServerPath,
  filterScannedServers
};
