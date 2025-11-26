const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { buildOptions } = require('../utils/optionsBuilder');
const { crawlerOptionsSchema } = require('./defaults');
const { normalizeOutputVerbosity, OUTPUT_VERBOSITY_LEVELS } = require('../utils/outputVerbosity');

const DEFAULT_SEQUENCE_PRESET = 'basicArticleDiscovery';
const DEFAULT_START_URL = 'https://www.theguardian.com';
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_MAX_DOWNLOADS = 2000;
const DEFAULT_BASIC_OUTPUT_VERBOSITY = 'extra-terse';

class ConfigurationService {
  constructor({ cwd = process.cwd(), fsImpl = fs } = {}) {
    this.cwd = cwd;
    this.fs = fsImpl;
    this.defaultConfigPath = path.resolve(this.cwd, 'config.json');
    this.defaultRunnerConfigPaths = [
      path.resolve(this.cwd, 'config', 'crawl-runner.json'),
      path.resolve(this.cwd, 'config', 'crawl-runner.yaml'),
      path.resolve(this.cwd, 'config', 'crawl-runner.yml')
    ];
  }

  /**
   * Creates a parsed CLI context that encapsulates command, positional args, flags, and
   * resolved configuration layers (config.json, runner configs, CLI overrides).
   * @param {string[]} argv
   * @param {NodeJS.ProcessEnv} env
   * @returns {CliContext}
   */
  createContext(argv = [], env = process.env) {
    const tokens = this._tokenizeArgv(Array.isArray(argv) ? [...argv] : []);
    const layers = this._loadConfigLayers(tokens.flags, env || {});
    const defaultRunConfig = this._buildDefaultRunConfig(tokens, layers);
    const crawlerOptions = this._buildCrawlerOptions(tokens.flags, defaultRunConfig);

    return new CliContext({
      command: tokens.command,
      positionals: tokens.positionals,
      flags: tokens.flags,
      rawFlags: tokens.rawFlags,
      configLayers: layers,
      defaultRunConfig,
      crawlerOptions
    });
  }

  _buildCrawlerOptions(flagValues, defaultRunConfig) {
    const mergedRaw = {
      startUrl: defaultRunConfig.startUrl,
      ...defaultRunConfig.sharedOverrides,
      loggingQueue: flagValues.loggingQueue,
      loggingNetwork: flagValues.loggingNetwork,
      loggingFetching: flagValues.loggingFetching
    };

    if (mergedRaw.logging == null && typeof flagValues.logging === 'object') {
      mergedRaw.logging = flagValues.logging;
    }

    return buildOptions(mergedRaw, crawlerOptionsSchema);
  }

  _tokenizeArgv(args) {
    if (!Array.isArray(args)) {
      return { command: null, positionals: [], flags: {}, rawFlags: {} };
    }

    let command = null;
    const positionals = [];
    const flags = {};
    const rawFlags = {};

    const input = [...args];
    for (let index = 0; index < input.length; index += 1) {
      const token = input[index];
      if (!token.startsWith('--')) {
        if (!command) {
          command = token;
        } else {
          positionals.push(token);
        }
        continue;
      }

      const key = this._normalizeFlagName(token);
      const next = input[index + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = this._coerceValue(next);
        rawFlags[key] = next;
        index += 1;
      } else {
        flags[key] = true;
        rawFlags[key] = 'true';
      }
    }

    if (flags.limit !== undefined && flags.maxDownloads === undefined) {
      flags.maxDownloads = flags.limit;
      rawFlags.maxDownloads = rawFlags.limit;
    }

    if (flags.outputVerbosity) {
      const normalized = normalizeOutputVerbosity(flags.outputVerbosity, null);
      if (!normalized) {
        throw new Error(
          `Invalid output verbosity: ${flags.outputVerbosity}. Expected one of: ${OUTPUT_VERBOSITY_LEVELS.join(', ')}`
        );
      }
      flags.outputVerbosity = normalized;
      rawFlags.outputVerbosity = normalized;
    }

    return { command, positionals, flags, rawFlags };
  }

  _loadConfigLayers(flags, env) {
    const defaultConfig = this._loadJsonConfig(this.defaultConfigPath);
    const explicitRunnerPath = this._firstDefined(flags.config, flags.configPath);
    const runnerFromFlags = this._loadRunnerConfig(explicitRunnerPath, true);
    const runnerFromEnv = runnerFromFlags
      ? null
      : this._loadRunnerConfig(env?.CRAWL_CONFIG_PATH, true);
    const fallbackRunner = runnerFromFlags || runnerFromEnv || this._loadFirstRunnerConfig();

    return {
      defaultConfig,
      runnerConfig: runnerFromFlags || runnerFromEnv || fallbackRunner
    };
  }

  _loadFirstRunnerConfig() {
    for (const filePath of this.defaultRunnerConfigPaths) {
      const candidate = this._loadRunnerConfig(filePath, false);
      if (candidate) {
        return candidate;
      }
    }
    return null;
  }

  _buildDefaultRunConfig(tokens, layers) {
    const defaultConfig = layers.defaultConfig?.config || {};
    const crawlDefaults = defaultConfig.crawlDefaults || {};
    const runnerConfig = layers.runnerConfig?.config || {};

    const sharedOverrides = cleanUndefined(
      mergeOverrideObjects(
        {
          concurrency: DEFAULT_CONCURRENCY,
          maxDownloads: DEFAULT_MAX_DOWNLOADS,
          outputVerbosity: DEFAULT_BASIC_OUTPUT_VERBOSITY
        },
        crawlDefaults.sharedOverrides,
        runnerConfig.sharedOverrides,
        this._parseJsonFlag(tokens.rawFlags, 'sharedOverrides'),
        this._extractCliOverrideFlags(tokens.flags)
      )
    );

    const sequenceName = this._firstDefined(
      tokens.flags.sequence,
      tokens.flags.sequenceName,
      runnerConfig.sequence,
      runnerConfig.sequenceName,
      crawlDefaults.sequence,
      DEFAULT_SEQUENCE_PRESET
    );

    const startUrl = this._firstDefined(
      tokens.flags.startUrl,
      runnerConfig.startUrl,
      crawlDefaults.startUrl,
      defaultConfig.url,
      DEFAULT_START_URL
    );

    const continueOnError = Boolean(
      this._firstDefined(tokens.flags.continueOnError, runnerConfig.continueOnError, crawlDefaults.continueOnError, false)
    );

    const stepOverrides = this._firstDefined(
      this._parseJsonFlag(tokens.rawFlags, 'stepOverrides'),
      runnerConfig.stepOverrides,
      crawlDefaults.stepOverrides
    );

    return {
      sequenceName,
      startUrl,
      sharedOverrides,
      stepOverrides: stepOverrides || undefined,
      continueOnError,
      metadata: {
        defaultConfigPath: layers.defaultConfig?.sourcePath || null,
        runnerConfigPath: layers.runnerConfig?.sourcePath || null
      }
    };
  }

  _extractCliOverrideFlags(flags) {
    const overrides = {};
    if (flags.concurrency != null) {
      overrides.concurrency = this._ensurePositiveInteger(flags.concurrency, 'concurrency');
    }
    const maxDownloads = this._firstDefined(flags.maxDownloads, flags.limit);
    if (maxDownloads != null) {
      overrides.maxDownloads = this._ensurePositiveInteger(maxDownloads, 'max-downloads');
    }
    if (flags.loggingQueue !== undefined) {
      overrides.loggingQueue = Boolean(flags.loggingQueue);
    }
    if (flags.outputVerbosity) {
      overrides.outputVerbosity = flags.outputVerbosity;
    }
    return overrides;
  }

  _ensurePositiveInteger(value, label) {
    const parsed = parsePositiveInteger(value);
    if (parsed === undefined) {
      throw new Error(`Invalid numeric value for ${label}: ${value}`);
    }
    return parsed;
  }

  _loadRunnerConfig(candidatePath, strict) {
    if (!candidatePath) {
      return null;
    }
    const resolved = path.resolve(this.cwd, candidatePath);
    if (!this.fs.existsSync(resolved)) {
      if (strict) {
        throw new Error(`Runner config not found at ${resolved}`);
      }
      return null;
    }
    const config = this._loadConfigFile(resolved);
    return config ? { config, sourcePath: resolved, baseDir: path.dirname(resolved) } : null;
  }

  _loadJsonConfig(filePath) {
    const config = this._loadConfigFile(filePath);
    return config ? { config, sourcePath: filePath } : null;
  }

  _loadConfigFile(filePath) {
    try {
      if (!this.fs.existsSync(filePath)) {
        return null;
      }
      const raw = this.fs.readFileSync(filePath, 'utf8');
      const extension = path.extname(filePath).toLowerCase();
      const parsed = extension === '.yaml' || extension === '.yml' ? yaml.load(raw) : JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Config file must export an object');
      }
      return parsed;
    } catch (error) {
      if (filePath) {
        console.warn(`Warning: Failed to load config file ${filePath}: ${error.message}`);
      }
      if (this.defaultConfigPath === filePath) {
        return null;
      }
      throw error;
    }
  }

  _firstDefined(...values) {
    for (const value of values) {
      if (value !== undefined && value !== null) {
        return value;
      }
    }
    return undefined;
  }

  _normalizeFlagName(flag) {
    const trimmed = flag.startsWith('--') ? flag.slice(2) : flag;
    return trimmed.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  _coerceValue(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && value.trim() !== '') {
      return numeric;
    }
    return value;
  }

  _parseJsonFlag(rawFlags, name) {
    const raw = rawFlags[name];
    if (raw === undefined || raw === null) {
      return undefined;
    }
    if (typeof raw !== 'string') {
      return undefined;
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error(`Invalid JSON for --${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${error.message}`);
    }
  }
}

class CliContext {
  constructor({
    command,
    positionals,
    flags,
    rawFlags,
    configLayers,
    defaultRunConfig,
    crawlerOptions
  }) {
    this.command = command;
    this.positionals = positionals;
    this.flags = flags;
    this.rawFlags = rawFlags;
    this.configLayers = configLayers;
    this.defaultRunConfig = defaultRunConfig;
    this.crawlerOptions = crawlerOptions;
  }

  getCommand() {
    return this.command;
  }

  getPositional(index) {
    return this.positionals[index] || null;
  }

  hasFlag(name) {
    return this._getRawFlag(name) !== undefined;
  }

  getFlag(...names) {
    for (const name of names) {
      const key = this._normalize(name);
      if (key in this.flags) {
        return this.flags[key];
      }
    }
    return undefined;
  }

  getBooleanFlag(name) {
    const value = this.getFlag(name);
    if (value === undefined) {
      return undefined;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    const normalized = String(value).trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
  }

  getIntegerFlag(...names) {
    for (const name of names) {
      const value = this.getFlag(name);
      if (value === undefined) continue;
      const parsed = parsePositiveInteger(value);
      if (parsed === undefined) {
        throw new Error(`Invalid numeric value for ${name}: ${value}`);
      }
      return parsed;
    }
    return undefined;
  }

  getJsonFlag(name) {
    const raw = this._getRawFlag(name);
    if (raw == null) {
      return undefined;
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error(`Invalid JSON for ${name}: ${error.message}`);
    }
  }

  getDefaultRunConfig() {
    return this.defaultRunConfig;
  }

  getCrawlerOptions() {
    return this.crawlerOptions;
  }

  getRunnerConfig() {
    return this.configLayers.runnerConfig || null;
  }

  getDefaultConfigMetadata() {
    return this.configLayers.defaultConfig || null;
  }

  _getRawFlag(name) {
    const key = this._normalize(name);
    return this.rawFlags[key];
  }

  _normalize(name) {
    return name.startsWith('--') ? name.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase()) : name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }
}

function mergeOverrideObjects(...sources) {
  const result = {};
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    Object.assign(result, source);
  }
  return result;
}

function cleanUndefined(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  const cleaned = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      cleaned[key] = entry;
    }
  }
  return cleaned;
}

function parsePositiveInteger(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric <= 0) {
    return undefined;
  }
  return numeric;
}

module.exports = {
  ConfigurationService,
  CliContext,
  DEFAULT_SEQUENCE_PRESET,
  DEFAULT_START_URL,
  DEFAULT_BASIC_OUTPUT_VERBOSITY
};
