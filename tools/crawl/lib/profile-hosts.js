'use strict';

const fs = require('fs/promises');
const path = require('path');

const {
  normalizeDomains,
} = require('./graph-feedback-planner');

const DEFAULT_PROFILE_DIR = path.join(__dirname, '..', 'profiles');
const DEFAULT_PROFILE_COMPATIBILITY_NAMES = Object.freeze([
  'simple-distributed-smoke',
  'remote-bounded-smoke',
  'news-10x1000',
  'news-10x1000-15m-e2e',
  'remote-news-10x1000',
  'remote-guardian-bbc-2new',
  'remote-guardian-bbc-10-agent',
  'news-10x1000-fast-visible',
  'remote-drain',
  'remote-status',
  'local-news-10x1000',
]);

/**
 * Load a crawl profile and extract static planned hosts without invoking the
 * crawl launcher or any crawler runtime.
 *
 * @param {string} profileNameOrPath Named profile or explicit JSON path.
 * @param {object} [options]
 * @param {string} [options.profileDir] Directory containing named profiles.
 * @param {object} [options.fs] Promise-based filesystem API for tests.
 * @param {object} [options.path] Path module seam for tests.
 * @returns {Promise<object>} File-only static profile host plan.
 */
async function loadCrawlProfileHostPlan(profileNameOrPath, options = {}) {
  const pathApi = options.path || path;
  const fsApi = options.fs || fs;
  const profilePath = resolveProfilePath(profileNameOrPath, {
    profileDir: options.profileDir,
    path: pathApi,
  });

  let raw;
  try {
    raw = await fsApi.readFile(profilePath, 'utf8');
  } catch (err) {
    throw new Error(`Profile not found: ${profilePath}`);
  }

  let profile;
  try {
    profile = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse profile JSON at ${profilePath}: ${err.message}`);
  }

  return buildProfileHostPlanFromProfile(profile, {
    profileName: inferProfileName(profileNameOrPath, profilePath, pathApi),
    profileIdentifier: String(profileNameOrPath || '').trim(),
    profilePath,
  });
}

function buildProfileHostPlanFromProfile(profile, options = {}) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('Profile JSON must be an object.');
  }
  if (!profile.tool || typeof profile.tool !== 'string') {
    throw new Error('Profile must include a string "tool" field.');
  }

  const positionals = Array.isArray(profile.positionals)
    ? profile.positionals.map(value => String(value))
    : [];
  const hostSources = collectHostSources(profile);
  const hosts = normalizeDomains(hostSources.flatMap(source => source.hosts));
  const caveats = [];

  if (!hosts.length) {
    caveats.push('No static host/domain fields found; this profile may resolve hosts at runtime or perform a hostless operation.');
  }
  if (profile.tool === 'orchestrate') {
    caveats.push('Orchestrator profile has static hosts, but live behavior may choose remote or local execution at runtime.');
  }
  if (profile.tool === 'cloud-e2e') {
    caveats.push('E2E profile has static hosts, but live behavior includes preflight, crawl, drain, and validation phases.');
  }
  if (profile.tool === 'batch') {
    caveats.push('Local batch profile uses local UI crawl dispatch; graph-feedback artifact previews remain read-only.');
  }

  return {
    profileName: String(options.profileName || '').trim() || null,
    profileIdentifier: String(options.profileIdentifier || options.profileName || '').trim() || null,
    profilePath: options.profilePath || null,
    tool: profile.tool,
    positionals,
    hosts,
    hasStaticHosts: hosts.length > 0,
    hostSources: hostSources.map(source => ({
      field: source.field,
      rawValue: source.rawValue,
      hosts: normalizeDomains(source.hosts),
    })),
    caveats,
  };
}

async function buildProfileCompatibilitySummary(profileNames = DEFAULT_PROFILE_COMPATIBILITY_NAMES, options = {}) {
  const names = Array.isArray(profileNames) && profileNames.length
    ? profileNames
    : DEFAULT_PROFILE_COMPATIBILITY_NAMES;
  const profiles = [];

  for (const profileName of names) {
    const profile = await loadCrawlProfileHostPlan(profileName, options);
    profiles.push(profile);
  }

  return {
    source: 'crawl-profile-hosts',
    mode: 'profile-compatibility-summary',
    profileDir: path.resolve(options.profileDir || DEFAULT_PROFILE_DIR),
    profileCount: profiles.length,
    profiles,
    caveat: 'Host matching is exact. Generate graph-feedback artifacts with the exact host spelling a profile plans.',
    actionPolicy: {
      enqueueUrls: false,
      seedRemoteCrawlers: false,
      alterCollectBehavior: false,
    },
  };
}

function resolveProfilePath(profileNameOrPath, options = {}) {
  const pathApi = options.path || path;
  const text = String(profileNameOrPath || '').trim();
  if (!text) {
    throw new Error('Profile name or path is required.');
  }
  if (isLikelyPath(text)) {
    return pathApi.resolve(text);
  }
  return pathApi.resolve(options.profileDir || DEFAULT_PROFILE_DIR, `${text}.json`);
}

function inferProfileName(profileNameOrPath, profilePath, pathApi = path) {
  const text = String(profileNameOrPath || '').trim();
  if (text && !isLikelyPath(text)) return text;
  return pathApi.basename(profilePath, pathApi.extname(profilePath));
}

function isLikelyPath(value) {
  return typeof value === 'string' && (value.includes('/') || value.includes('\\') || value.endsWith('.json'));
}

function collectHostSources(profile) {
  const sources = [];
  const options = profile.options && typeof profile.options === 'object' && !Array.isArray(profile.options)
    ? profile.options
    : {};

  for (const field of ['domains', 'domain', 'hosts', 'host']) {
    pushHostSource(sources, field, profile[field]);
    pushHostSource(sources, `options.${field}`, options[field]);
  }

  if (Array.isArray(profile.args)) {
    collectHostSourcesFromArgs(sources, profile.args.map(value => String(value)));
  }

  return sources;
}

function collectHostSourcesFromArgs(sources, args) {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--domains' || token === '--domain') {
      pushHostSource(sources, `args.${token}`, args[index + 1]);
      index += 1;
      continue;
    }
    if (token.startsWith('--domains=')) {
      pushHostSource(sources, 'args.--domains', token.slice('--domains='.length));
      continue;
    }
    if (token.startsWith('--domain=')) {
      pushHostSource(sources, 'args.--domain', token.slice('--domain='.length));
    }
  }
}

function pushHostSource(sources, field, rawValue) {
  const hosts = parseHostValues(rawValue);
  if (!hosts.length) return;
  sources.push({ field, rawValue, hosts });
}

function parseHostValues(value) {
  if (value === undefined || value === null || value === false) return [];
  if (Array.isArray(value)) {
    return value.flatMap(item => parseHostValues(item));
  }
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

module.exports = {
  DEFAULT_PROFILE_COMPATIBILITY_NAMES,
  DEFAULT_PROFILE_DIR,
  buildProfileCompatibilitySummary,
  buildProfileHostPlanFromProfile,
  loadCrawlProfileHostPlan,
  resolveProfilePath,
};
