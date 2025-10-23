'use strict';

const fs = require('fs');
const path = require('path');
const { findProjectRoot } = require('./project-root');

let cachedConfig = null;
let cachedMtimeMs = null;
let cachedPath = null;

function getConfigPath() {
  if (cachedPath) {
    return cachedPath;
  }
  const projectRoot = findProjectRoot(process.cwd());
  const configPath = path.join(projectRoot, 'config', 'priority-config.json');
  cachedPath = configPath;
  return cachedPath;
}

function readPriorityConfig() {
  const configPath = getConfigPath();
  try {
    const stats = fs.statSync(configPath);
    if (!cachedConfig || cachedMtimeMs !== stats.mtimeMs) {
      const raw = fs.readFileSync(configPath, 'utf8');
      cachedConfig = JSON.parse(raw);
      cachedMtimeMs = stats.mtimeMs;
    }
    return cachedConfig;
  } catch (error) {
    // If the file can't be read, fall back to null and clear the cache
    cachedConfig = null;
    cachedMtimeMs = null;
    return null;
  }
}

function getPriorityConfig() {
  const config = readPriorityConfig();
  return config ? { ...config } : null;
}

function isTotalPrioritisationEnabled() {
  const config = readPriorityConfig();
  return !!config?.features?.totalPrioritisation;
}

module.exports = {
  getPriorityConfig,
  isTotalPrioritisationEnabled
};
