'use strict';

const fs = require('fs');
const path = require('path');

function parseServerArgv(argv = []) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;

    const eqIdx = arg.indexOf('=');
    if (eqIdx !== -1) {
      args[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function integerAtLeast(value, fallback, min) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed)) return Math.max(min, parsed);
  return fallback;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function loadConfigFile(configPath, { cwd = process.cwd(), fsImpl = fs } = {}) {
  if (!configPath) {
    return { config: {}, loadedConfigPath: null };
  }

  const resolved = path.resolve(cwd, configPath);
  if (!fsImpl.existsSync(resolved)) {
    throw new Error(`Config file not found: ${resolved}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(fsImpl.readFileSync(resolved, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to parse config file ${resolved}: ${error.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Config file must contain an object: ${resolved}`);
  }

  return { config: parsed, loadedConfigPath: resolved };
}

function normalizeDomainEntry(entry, maxPagesDefault) {
  if (typeof entry === 'string') {
    const domain = entry.trim();
    return domain ? { domain, maxPages: maxPagesDefault } : null;
  }

  if (!entry || typeof entry !== 'object') return null;
  const domain = String(entry.domain || entry.host || '').trim();
  if (!domain) return null;

  const seedUrls = Array.isArray(entry.seedUrls)
    ? entry.seedUrls.filter(url => typeof url === 'string' && url.trim()).map(url => url.trim())
    : typeof entry.seedUrls === 'string'
      ? entry.seedUrls.split(',').map(url => url.trim()).filter(Boolean)
      : undefined;

  return {
    domain,
    maxPages: integerAtLeast(firstDefined(entry.maxPages, entry['max-pages']), maxPagesDefault, 1),
    maxDepth: integerAtLeast(firstDefined(entry.maxDepth, entry['max-depth']), 2, 0),
    seedUrls,
  };
}

function normalizeDomainConfigs(domains, maxPagesDefault) {
  const entries = Array.isArray(domains)
    ? domains
    : typeof domains === 'string'
      ? domains.split(',').map(domain => domain.trim()).filter(Boolean)
      : [];

  const seen = new Set();
  const normalized = [];
  for (const entry of entries) {
    const domainConfig = normalizeDomainEntry(entry, maxPagesDefault);
    if (!domainConfig || seen.has(domainConfig.domain)) continue;
    seen.add(domainConfig.domain);
    normalized.push(domainConfig);
  }
  return normalized;
}

function buildServerConfig(args = {}, options = {}) {
  const { config: fileConfig, loadedConfigPath } = loadConfigFile(args.config, options);

  const maxPagesDefault = integerAtLeast(
    firstDefined(args['max-pages'], args.maxPages, fileConfig.maxPages, fileConfig.maxPagesDefault),
    50,
    1
  );

  const domainSource = firstDefined(args.domains, fileConfig.domains);
  const domainConfigs = normalizeDomainConfigs(domainSource, maxPagesDefault);

  return {
    loadedConfigPath,
    fileConfig,
    port: integerAtLeast(firstDefined(args.port, fileConfig.port), 3200, 1),
    dbFile: firstDefined(args.db, fileConfig.db, fileConfig.dbFile, 'data/news.db'),
    maxPagesDefault,
    maxConcurrent: integerAtLeast(firstDefined(args['max-concurrent'], args.maxConcurrent, fileConfig.maxConcurrent), 20, 1),
    idleTimeoutMin: integerAtLeast(firstDefined(args['idle-timeout'], args.idleTimeoutMin, fileConfig.idleTimeoutMin, fileConfig.idleTimeout), 30, 0),
    coordinatorMode: parseBoolean(firstDefined(args['coordinator-mode'], args.coordinatorMode, fileConfig.coordinatorMode), false),
    autoStart: args['no-auto-start']
      ? false
      : parseBoolean(firstDefined(args['auto-start'], args.autoStart, fileConfig.autoStart), true),
    domainConfigs,
  };
}

module.exports = {
  buildServerConfig,
  loadConfigFile,
  normalizeDomainConfigs,
  parseServerArgv,
};
