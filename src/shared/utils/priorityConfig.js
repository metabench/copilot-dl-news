'use strict';

const fs = require('fs');
const path = require('path');
const { findProjectRoot } = require('./project-root');

const PROFILE_FILE_MAP = Object.freeze({
  default: 'priority-config.json',
  basic: 'priority-config.basic.json',
  intelligent: 'priority-config.intelligent.json',
  geography: 'priority-config.geography.json',
  wikidata: 'priority-config.wikidata.json'
});

const configCache = new Map();

function normalizeProfileName(value) {
  if (typeof value !== 'string') {
    return 'default';
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return 'default';
  }
  return PROFILE_FILE_MAP[normalized] ? normalized : 'default';
}

let activeProfile = normalizeProfileName(process.env.PRIORITY_CONFIG_PROFILE || 'default');

function getConfigFilename(profile = activeProfile) {
  const normalized = normalizeProfileName(profile);
  return PROFILE_FILE_MAP[normalized] || PROFILE_FILE_MAP.default;
}

function getPriorityConfigPath(profile = activeProfile) {
  const projectRoot = findProjectRoot(process.cwd());
  return path.join(projectRoot, 'config', getConfigFilename(profile));
}

function setPriorityConfigProfile(profile) {
  const normalized = normalizeProfileName(profile);
  if (normalized !== activeProfile) {
    activeProfile = normalized;
    process.env.PRIORITY_CONFIG_PROFILE = normalized;
  }
  return activeProfile;
}

function getActivePriorityConfigProfile() {
  return activeProfile;
}

function readPriorityConfig(profile = activeProfile) {
  const normalized = normalizeProfileName(profile);
  const configPath = getPriorityConfigPath(normalized);

  try {
    const stats = fs.statSync(configPath);
    const cached = configCache.get(normalized);
    if (cached && cached.mtimeMs === stats.mtimeMs && cached.path === configPath) {
      return cached.config;
    }

    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    configCache.set(normalized, {
      config: parsed,
      mtimeMs: stats.mtimeMs,
      path: configPath
    });
    return parsed;
  } catch (error) {
    configCache.delete(normalized);
    if (normalized !== 'default') {
      console.warn(`Priority config '${normalized}' unavailable (${error.message}); falling back to default profile.`);
      return readPriorityConfig('default');
    }
    console.warn(`Priority config not found at ${configPath}: ${error.message}`);
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
  getPriorityConfigPath,
  getActivePriorityConfigProfile,
  isTotalPrioritisationEnabled,
  setPriorityConfigProfile
};
