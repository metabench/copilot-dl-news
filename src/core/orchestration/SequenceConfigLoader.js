'use strict';

const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const yaml = require('js-yaml');

const { validateSequenceConfig } = require('./schema/validateSequenceConfig');
const { RESOLVER_NAMESPACE_CATALOG, getResolverNamespaceInfo } = require('./sequenceResolverCatalog');

const DEFAULT_EXTENSIONS = ['json', 'yaml', 'yml'];

class SequenceConfigError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SequenceConfigError';
    this.code = code;
    this.details = details;
  }
}

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const sanitizeHostSegment = (host) => {
  if (!host || typeof host !== 'string') {
    return null;
  }
  const normalized = host.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-');
  const trimmed = normalized.replace(/^-+|-+$/g, '');
  return trimmed || null;
};

const buildCandidates = (sequenceName, hostSegment) => {
  const stems = [];
  if (hostSegment) {
    stems.push(`${sequenceName}.${hostSegment}`);
  }
  stems.push(sequenceName);
  stems.push('default');

  const seen = new Set();
  const candidates = [];
  stems.forEach((stem) => {
    DEFAULT_EXTENSIONS.forEach((ext) => {
      const key = `${stem}.${ext}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      candidates.push({ fileName: key, format: ext });
    });
  });

  return candidates;
};

const parseToken = (token) => {
  const raw = token.slice(1);
  const separator = raw.indexOf('.');
  if (separator === -1) {
    throw new SequenceConfigError('TOKEN_FORMAT', `Token "${token}" is missing a namespace delimiter ("@namespace.key")`, { token });
  }
  const namespace = raw.slice(0, separator).trim();
  const key = raw.slice(separator + 1).trim();
  if (!namespace || !key) {
    throw new SequenceConfigError('TOKEN_FORMAT', `Token "${token}" must include both namespace and key`, { token });
  }
  return { namespace, key };
};

const summariseResolvedValue = (value) => {
  if (value === null || value === undefined) {
    return { type: value === null ? 'null' : 'undefined' };
  }
  if (Array.isArray(value)) {
    return { type: 'array', length: value.length };
  }
  if (typeof value === 'object') {
    return { type: 'object', keys: Object.keys(value).slice(0, 5) };
  }
  if (typeof value === 'string' && value.length > 200) {
    return { type: 'string', preview: value.slice(0, 200) };
  }
  return { type: typeof value, value };
};

const defaultCliResolver = (cliOverrides = {}) => (key) => cliOverrides[key];

const createSequenceConfigLoader = ({
  configDir,
  fsImpl = fs,
  pathImpl = path,
  yamlImpl = yaml,
  cryptoImpl = crypto,
  validateConfig = validateSequenceConfig,
  defaultResolvers = {}
} = {}) => {
  const directory = configDir ? pathImpl.resolve(configDir) : pathImpl.resolve(process.cwd(), 'config', 'crawl-sequences');

  const load = async ({
    sequenceName,
    host,
    cliOverrides = {},
    resolvers = {}
  } = {}) => {
    if (!sequenceName || typeof sequenceName !== 'string') {
      throw new SequenceConfigError('INVALID_SEQUENCE_NAME', 'sequenceName must be a non-empty string', { sequenceName });
    }

    let directoryStats;
    try {
      directoryStats = await fsImpl.stat(directory);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        throw new SequenceConfigError('DIRECTORY_NOT_FOUND', `Sequence configuration directory does not exist: ${directory}`, { configDir: directory });
      }
      throw new SequenceConfigError('DIRECTORY_ACCESS', `Unable to access sequence configuration directory: ${error.message}`, { configDir: directory, cause: error });
    }

    if (!directoryStats.isDirectory()) {
      throw new SequenceConfigError('DIRECTORY_INVALID', `Sequence configuration path is not a directory: ${directory}`, { configDir: directory });
    }

    const hostSegment = sanitizeHostSegment(host);
    const candidates = buildCandidates(sequenceName, hostSegment);

    let chosen;
    let fileStats;
    for (const candidate of candidates) {
      const fullPath = pathImpl.join(directory, candidate.fileName);
      try {
        const stats = await fsImpl.stat(fullPath);
        if (stats.isFile()) {
          chosen = { ...candidate, fullPath };
          fileStats = stats;
          break;
        }
      } catch (error) {
        if (error && error.code !== 'ENOENT') {
          throw new SequenceConfigError('FILE_ACCESS', `Unable to inspect candidate config "${candidate.fileName}": ${error.message}`, {
            candidate: candidate.fileName,
            path: fullPath,
            cause: error
          });
        }
      }
    }

    if (!chosen) {
      throw new SequenceConfigError('CONFIG_NOT_FOUND', `No configuration found for sequence "${sequenceName}"`, {
        sequenceName,
        host,
        searched: candidates.map((cand) => pathImpl.join(directory, cand.fileName))
      });
    }

    let raw;
    try {
      raw = await fsImpl.readFile(chosen.fullPath, 'utf8');
    } catch (error) {
      throw new SequenceConfigError('READ_ERROR', `Failed to read sequence config "${chosen.fullPath}": ${error.message}`, {
        path: chosen.fullPath,
        cause: error
      });
    }

    let parsed;
    try {
      if (chosen.format === 'json') {
        parsed = JSON.parse(raw);
      } else {
        parsed = yamlImpl.load(raw);
      }
    } catch (error) {
      throw new SequenceConfigError('PARSE_ERROR', `Failed to parse sequence config "${chosen.fullPath}": ${error.message}`, {
        path: chosen.fullPath,
        format: chosen.format,
        cause: error
      });
    }

    const { valid, errors } = validateConfig(parsed);
    if (!valid) {
      throw new SequenceConfigError('VALIDATION_ERROR', `Sequence config "${chosen.fullPath}" failed validation`, {
        path: chosen.fullPath,
        errors
      });
    }

    const checksum = cryptoImpl.createHash('sha256').update(raw, 'utf8').digest('hex');

    const resolverContext = {
      sequenceName,
      host: hostSegment || undefined,
      config: parsed,
      cliOverrides
    };

    const resolverMap = {
      cli: defaultCliResolver(cliOverrides),
      ...defaultResolvers,
      ...resolvers
    };

    const resolvedTokens = [];

    const resolveTokenString = async (value, location) => {
      if (typeof value !== 'string' || !value.startsWith('@')) {
        return value;
      }

      const { namespace, key } = parseToken(value);
      const resolver = resolverMap[namespace];
      if (typeof resolver !== 'function') {
        throw new SequenceConfigError('TOKEN_NAMESPACE', `No resolver registered for namespace "${namespace}"`, {
          token: value,
          namespace,
          location
        });
      }

      let resolved;
      try {
        resolved = await resolver(key, resolverContext, location);
      } catch (error) {
        throw new SequenceConfigError('TOKEN_RESOLUTION', `Resolver for namespace "${namespace}" failed: ${error?.message || error}`, {
          token: value,
          namespace,
          key,
          location,
          cause: error
        });
      }

      if (resolved === undefined || resolved === null || (typeof resolved === 'string' && resolved.trim().length === 0)) {
        throw new SequenceConfigError('TOKEN_UNRESOLVED', `Resolver "${namespace}" did not supply a value for token "${value}"`, {
          token: value,
          namespace,
          key,
          location
        });
      }

      resolvedTokens.push({
        token: value,
        namespace,
        key,
        location,
        summary: summariseResolvedValue(resolved)
      });

      return resolved;
    };

    const resolveTokensDeep = async (value, location) => {
      if (typeof value === 'string') {
        return resolveTokenString(value, location);
      }
      if (Array.isArray(value)) {
        const resolvedArray = [];
        for (let index = 0; index < value.length; index += 1) {
          resolvedArray.push(await resolveTokensDeep(value[index], `${location}[${index}]`));
        }
        return resolvedArray;
      }
      if (isPlainObject(value)) {
        const entries = await Promise.all(
          Object.entries(value).map(async ([key, entryValue]) => [key, await resolveTokensDeep(entryValue, `${location}.${key}`)])
        );
        return Object.fromEntries(entries);
      }
      return value;
    };

    let startUrl = cliOverrides.startUrl;
    let startUrlSource = startUrl ? 'cli' : null;

    if (!startUrl && parsed.startUrl !== undefined) {
      const resolved = await resolveTokensDeep(parsed.startUrl, 'startUrl');
      if (typeof resolved !== 'string' || resolved.trim().length === 0) {
        throw new SequenceConfigError('START_URL_INVALID', 'startUrl resolved to an invalid value', {
          location: 'startUrl'
        });
      }
      startUrl = resolved;
      startUrlSource = typeof parsed.startUrl === 'string' && parsed.startUrl.startsWith('@') ? 'resolver' : 'config';
    }

    const sharedOverrides = parsed.sharedOverrides
      ? await resolveTokensDeep(parsed.sharedOverrides, 'sharedOverrides')
      : {};

    const steps = [];
    for (let index = 0; index < parsed.steps.length; index += 1) {
      const rawStep = parsed.steps[index];
      if (typeof rawStep === 'string') {
        const operation = rawStep.trim();
        steps.push({
          id: `${operation}#${index}`,
          operation,
          label: operation,
          overrides: {}
        });
        continue;
      }

      const operation = (rawStep.operation || rawStep.name || '').trim();
      const label = rawStep.label ? rawStep.label : operation;
      const overrides = rawStep.overrides
        ? await resolveTokensDeep(rawStep.overrides, `steps[${index}].overrides`)
        : {};
      const normalized = {
        id: rawStep.id && rawStep.id.trim().length > 0 ? rawStep.id : `${operation}#${index}`,
        operation,
        label,
        overrides,
        continueOnError: Boolean(rawStep.continueOnError)
      };

      if (rawStep.startUrl !== undefined) {
        const resolvedStart = await resolveTokensDeep(rawStep.startUrl, `steps[${index}].startUrl`);
        if (typeof resolvedStart !== 'string' || resolvedStart.trim().length === 0) {
          throw new SequenceConfigError('STEP_START_URL_INVALID', `Step ${index} startUrl resolved to an invalid value`, {
            stepIndex: index
          });
        }
        normalized.startUrl = resolvedStart;
      }

      steps.push(normalized);
    }

    const metadata = {
      source: {
        path: chosen.fullPath,
        relativePath: pathImpl.relative(process.cwd(), chosen.fullPath),
        format: chosen.format,
        bytes: fileStats?.size,
        checksum,
        hostSpecific: Boolean(hostSegment)
      },
      sequenceName,
      host: hostSegment || undefined,
      declaredHost: parsed.host,
      version: parsed.version,
      startUrl: {
        value: startUrl,
        source: startUrlSource || 'unset'
      },
      resolvedTokens,
      warnings: []
    };

    if (parsed.host && hostSegment && parsed.host !== hostSegment) {
      metadata.warnings.push({
        code: 'HOST_MISMATCH',
        message: `Declared host "${parsed.host}" does not match requested host "${hostSegment}"`
      });
    }

    return {
      startUrl,
      sharedOverrides,
      steps,
      metadata
    };
  };

  const loadDryRun = async (options) => {
    try {
      const result = await load(options);
      return { ok: true, result };
    } catch (error) {
      if (error instanceof SequenceConfigError) {
        return { ok: false, error };
      }
      throw error;
    }
  };

  return {
    load,
    loadDryRun,
    getResolverNamespaceInfo
  };
};

module.exports = {
  createSequenceConfigLoader,
  SequenceConfigError,
  RESOLVER_NAMESPACE_CATALOG,
  getResolverNamespaceInfo
};
