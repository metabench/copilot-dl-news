"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { findProjectRoot } = require('../../../shared/utils/project-root');

function statMtime(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats && stats.mtimeMs ? stats.mtimeMs : 0;
  } catch (_) {
    return 0;
  }
}

function getClientBundleStatus(options = {}) {
  const projectRoot = options.projectRoot || findProjectRoot(__dirname);
  const bundlePath = options.bundlePath || path.join(projectRoot, "public", "assets", "ui-client.js");
  const entryPath = options.entryPath || path.join(projectRoot, "src", "ui", "client", "index.js");
  const buildScript = options.buildScript || path.join(projectRoot, "scripts", "build-ui-client.js");

  const exists = fs.existsSync(bundlePath);
  const bundleMtime = exists ? statMtime(bundlePath) : 0;
  const entryMtime = statMtime(entryPath);
  const scriptMtime = statMtime(buildScript);
  const referenceMtime = Math.max(entryMtime, scriptMtime);

  const needsBuild = !exists || referenceMtime === 0 || referenceMtime > bundleMtime;

  return {
    projectRoot,
    bundlePath,
    entryPath,
    buildScript,
    exists,
    bundleMtime,
    entryMtime,
    scriptMtime,
    referenceMtime,
    needsBuild
  };
}

function ensureClientBundle(options = {}) {
  const projectRoot = options.projectRoot || findProjectRoot(__dirname);
  const bundlePath = options.bundlePath || path.join(projectRoot, "public", "assets", "ui-client.js");
  const entryPath = options.entryPath || path.join(projectRoot, "src", "ui", "client", "index.js");
  const buildScript = options.buildScript || path.join(projectRoot, "scripts", "build-ui-client.js");
  const force = options.force === true;
  const silent = options.silent === true;

  const status = getClientBundleStatus({ projectRoot, bundlePath, entryPath, buildScript });
  const needsBuild = force || status.needsBuild;

  if (!needsBuild) {
    return false;
  }

  if (!fs.existsSync(buildScript)) {
    throw new Error(`Cannot build ui-client bundle; missing build script at ${buildScript}`);
  }

  if (!silent) {
    console.log("[ui-client] Building client bundle before server start...");
  }

  const result = spawnSync(process.execPath, [buildScript], {
    cwd: projectRoot,
    stdio: silent ? "ignore" : "inherit"
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`ui-client build failed with exit code ${result.status}`);
  }

  return true;
}

module.exports = {
  getClientBundleStatus,
  ensureClientBundle
};
