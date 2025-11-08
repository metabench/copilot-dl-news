'use strict';

const fs = require('fs/promises');
const path = require('path');
const { validateInteger } = require('./validators');

const DEFAULT_CONFIG_FILENAME = 'crawl.js.config.json';

function validateStartUrl(urlValue) {
  let parsed;
  try {
    parsed = new URL(urlValue);
  } catch (_) {
    throw new ConfigLoadError(`${DEFAULT_CONFIG_FILENAME} startUrl must be an absolute http(s) URL.`);
  }

  if (!parsed.protocol || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    throw new ConfigLoadError(`${DEFAULT_CONFIG_FILENAME} startUrl must use http or https.`);
  }

  if (!parsed.host) {
    throw new ConfigLoadError(`${DEFAULT_CONFIG_FILENAME} startUrl must include a hostname.`);
  }
}

class ConfigLoadError extends Error {
  constructor(message, {
    showStack = false,
    configPath,
    cause
  } = {}) {
    super(message);
    this.name = 'ConfigLoadError';
    this.showStack = Boolean(showStack);
    if (configPath) {
      this.configPath = configPath;
    }
    if (cause) {
      this.cause = cause;
    }
  }
}

function resolveDefaultConfigPath({
  cwd,
  configPath
} = {}) {
  if (configPath) {
    return path.resolve(configPath);
  }
  if (cwd) {
    return path.resolve(cwd, DEFAULT_CONFIG_FILENAME);
  }
  return path.resolve(__dirname, '..', '..', '..', DEFAULT_CONFIG_FILENAME);
}

async function readConfigFile({
  fsModule = fs,
  configPath
} = {}) {
  const resolvedPath = resolveDefaultConfigPath({ configPath });
  try {
    const raw = await fsModule.readFile(resolvedPath, 'utf8');
    return { raw, resolvedPath };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new ConfigLoadError(`Missing ${DEFAULT_CONFIG_FILENAME} at ${resolvedPath}.`, {
        configPath: resolvedPath
      });
    }
    throw new ConfigLoadError(`Unable to read ${DEFAULT_CONFIG_FILENAME} at ${resolvedPath}: ${error.message}`, {
      configPath: resolvedPath,
      cause: error
    });
  }
}

function parseConfig(raw, { configPath } = {}) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new ConfigLoadError(`Invalid JSON in ${DEFAULT_CONFIG_FILENAME}: ${error.message}`, {
      configPath,
      cause: error
    });
  }
}

function normalizeConfigShape(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigLoadError(`${DEFAULT_CONFIG_FILENAME} must contain an object at the top level.`);
  }
  const startUrl = typeof parsed.startUrl === 'string' ? parsed.startUrl.trim() : '';
  if (!startUrl) {
    throw new ConfigLoadError(`${DEFAULT_CONFIG_FILENAME} must include a non-empty "startUrl" string.`);
  }
  validateStartUrl(startUrl);

  const config = {
    startUrl,
    additionalArgs: []
  };

  if (parsed.depth !== undefined) {
    config.depth = validateInteger(parsed.depth, {
      fieldName: 'depth',
      contextLabel: DEFAULT_CONFIG_FILENAME,
      min: 0
    });
  }

  if (parsed.concurrency !== undefined) {
    config.concurrency = validateInteger(parsed.concurrency, {
      fieldName: 'concurrency',
      contextLabel: DEFAULT_CONFIG_FILENAME,
      min: 1
    });
  }

  if (parsed.maxPages !== undefined) {
    config.maxPages = validateInteger(parsed.maxPages, {
      fieldName: 'maxPages',
      contextLabel: DEFAULT_CONFIG_FILENAME,
      min: 1
    });
  }

  if (Array.isArray(parsed.additionalArgs)) {
    config.additionalArgs = parsed.additionalArgs
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  return config;
}

function createArgvFromConfig(config) {
  const argv = [config.startUrl];

  if (typeof config.depth === 'number') {
    argv.push(`--depth=${config.depth}`);
  }

  if (typeof config.concurrency === 'number') {
    argv.push(`--concurrency=${config.concurrency}`);
  }

  if (typeof config.maxPages === 'number') {
    argv.push(`--max-pages=${config.maxPages}`);
  }

  if (Array.isArray(config.additionalArgs) && config.additionalArgs.length > 0) {
    argv.push(...config.additionalArgs);
  }

  return argv;
}

async function loadCliConfig({
  fsModule = fs,
  configPath,
  cwd
} = {}) {
  const { raw, resolvedPath } = await readConfigFile({ fsModule, configPath: resolveDefaultConfigPath({ configPath, cwd }) });
  const parsed = parseConfig(raw, { configPath: resolvedPath });
  const config = normalizeConfigShape(parsed);
  return {
    config,
    configPath: resolvedPath
  };
}

async function resolveCliArguments({
  directArgv = [],
  fsModule = fs,
  configPath,
  cwd
} = {}) {
  if (Array.isArray(directArgv) && directArgv.length > 0) {
    return {
      argv: directArgv,
      origin: 'direct'
    };
  }

  const { config, configPath: resolvedConfigPath } = await loadCliConfig({
    fsModule,
    configPath,
    cwd
  });

  return {
    argv: createArgvFromConfig(config),
    config,
    configPath: resolvedConfigPath,
    origin: 'config'
  };
}

module.exports = {
  ConfigLoadError,
  DEFAULT_CONFIG_FILENAME,
  loadCliConfig,
  resolveCliArguments,
  createArgvFromConfig
};
