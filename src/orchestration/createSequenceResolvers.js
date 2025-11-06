'use strict';

const path = require('path');
const { ConfigManager } = require('../config/ConfigManager');
const { CrawlPlaybookService } = require('../crawler/CrawlPlaybookService');
const { ensureDb } = require('../db/sqlite/ensureDb');

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'news.db');

const normalizePathExpression = (expression) => String(expression || '').replace(/\[(\d+)\]/g, '.$1');

const getValueByPath = (source, expression) => {
  if (!expression) {
    return source;
  }

  const segments = normalizePathExpression(expression)
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.reduce((current, segment) => {
    if (current == null) {
      return undefined;
    }
    return current[segment];
  }, source);
};

const selectDbPath = (configCliOverrides = {}, defaults = {}) => {
  const candidates = [
    typeof configCliOverrides.dbPath === 'string' ? configCliOverrides.dbPath : null,
    typeof defaults.dbPath === 'string' ? defaults.dbPath : null
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.trim().length > 0) {
      return path.resolve(candidate);
    }
  }

  return DEFAULT_DB_PATH;
};

const notifyCleanupFailure = (logger, error) => {
  if (!error) {
    return;
  }
  const message = error?.message || String(error);
  if (logger && typeof logger.warn === 'function') {
    logger.warn('[SequenceResolvers] Cleanup encountered an error', message);
  }
};

const createConfigResolver = ({ logger, registerCleanup }) => {
  let configManager = null;
  let configSnapshot = null;
  let featureFlagsSnapshot = null;

  const ensureSnapshot = () => {
    if (configManager) {
      return;
    }

    configManager = new ConfigManager(null, { watch: false });
    registerCleanup(() => {
      if (configManager && typeof configManager.close === 'function') {
        try {
          configManager.close();
        } catch (error) {
          notifyCleanupFailure(logger, error);
        }
      }
      configManager = null;
    });

    configSnapshot = configManager.getConfig();
    try {
      featureFlagsSnapshot = configManager.getFeatureFlags();
    } catch (error) {
      featureFlagsSnapshot = {};
      if (logger && typeof logger.warn === 'function') {
        logger.warn('[SequenceResolvers] Failed to read feature flags', error?.message || error);
      }
    }
  };

  return (keyPath) => {
    ensureSnapshot();
    if (!configSnapshot) {
      return undefined;
    }

    if (!keyPath) {
      return configSnapshot;
    }

    if (keyPath === 'featureFlags') {
      return featureFlagsSnapshot;
    }

    if (keyPath.startsWith('featureFlags.')) {
      const nested = keyPath.slice('featureFlags.'.length);
      return getValueByPath(featureFlagsSnapshot, nested);
    }

    return getValueByPath(configSnapshot, keyPath);
  };
};

const createPlaybookResolver = ({
  logger,
  registerCleanup,
  explicitHost,
  configCliOverrides,
  defaults
}) => {
  const playbookContextCache = new Map();
  const dbPath = selectDbPath(configCliOverrides, defaults);

  const selectHost = (resolverContext = {}) => {
    if (explicitHost && explicitHost.trim().length > 0) {
      return explicitHost.trim();
    }

    const cliHost = resolverContext
      && resolverContext.cliOverrides
      && typeof resolverContext.cliOverrides.__sequenceHost === 'string'
      ? resolverContext.cliOverrides.__sequenceHost.trim()
      : null;
    if (cliHost) {
      return cliHost;
    }

    if (typeof resolverContext.requestedHost === 'string' && resolverContext.requestedHost.trim().length > 0) {
      return resolverContext.requestedHost.trim();
    }
    if (typeof resolverContext.host === 'string' && resolverContext.host.trim().length > 0) {
      return resolverContext.host.trim();
    }
    return null;
  };

  const buildContext = async (host) => {
    const normalizedHost = String(host || '').trim().toLowerCase();
    if (!normalizedHost) {
      throw new Error('Sequence host is required before resolving playbook tokens');
    }

    if (playbookContextCache.has(normalizedHost)) {
      return playbookContextCache.get(normalizedHost);
    }

    const contextPromise = (async () => {
      let db;
      try {
        db = ensureDb(dbPath, { readonly: true, fileMustExist: true });
      } catch (error) {
        const failure = new Error(`Failed to open database for playbook resolver: ${dbPath}`);
        failure.cause = error;
        throw failure;
      }

      let service;
      try {
        service = new CrawlPlaybookService({ db, logger });
        const playbook = await service.loadPlaybook(normalizedHost);
        const candidateSeeds = typeof service.generateCandidateActions === 'function'
          ? await service.generateCandidateActions(normalizedHost, { maxActions: 5 })
          : [];

        const primaryAction = candidateSeeds.find((action) => action && typeof action.url === 'string' && action.url.trim().length > 0) || null;
        const seedPattern = Array.isArray(playbook?.seedPatterns)
          ? playbook.seedPatterns.find((pattern) => pattern && typeof pattern.example === 'string' && pattern.example.trim().length > 0)
          : null;
        const primarySeed = primaryAction?.url || seedPattern?.example || null;

        return {
          host: normalizedHost,
          originalHost: host,
          playbook,
          candidateSeeds,
          primarySeed,
          primarySeedAction: primaryAction,
          seedPatterns: playbook?.seedPatterns || [],
          avoidanceRules: playbook?.avoidanceRules || [],
          retryCadence: playbook?.retryCadence || {}
        };
      } finally {
        if (service && typeof service.close === 'function') {
          try {
            service.close();
          } catch (error) {
            notifyCleanupFailure(logger, error);
          }
        }
        if (db && typeof db.close === 'function') {
          try {
            db.close();
          } catch (error) {
            notifyCleanupFailure(logger, error);
          }
        }
      }
    })();

    playbookContextCache.set(normalizedHost, contextPromise);
    return contextPromise;
  };

  return async (keyPath, resolverContext) => {
    const host = selectHost(resolverContext);
    const context = await buildContext(host);

    if (!keyPath) {
      return context;
    }

    if (keyPath === 'primarySeed') {
      return context.primarySeed;
    }

    if (keyPath === 'primarySeedAction') {
      return context.primarySeedAction;
    }

    return getValueByPath(context, keyPath);
  };
};


const createSequenceResolverMap = ({
  logger = console,
  configHost = null,
  defaults = {},
  configCliOverrides = {}
} = {}) => {
  const cleanupCallbacks = [];
  const registerCleanup = (callback) => {
    if (typeof callback === 'function') {
      cleanupCallbacks.push(callback);
    }
  };

  const config = createConfigResolver({ logger, registerCleanup });
  const playbook = createPlaybookResolver({
    logger,
    registerCleanup,
    explicitHost: configHost,
    configCliOverrides,
    defaults
  });

  const cleanup = () => {
    while (cleanupCallbacks.length > 0) {
      const callback = cleanupCallbacks.pop();
      try {
        callback();
      } catch (error) {
        notifyCleanupFailure(logger, error);
      }
    }
  };

  return {
    resolvers: {
      config,
      playbook
    },
    cleanup
  };
};

module.exports = {
  createSequenceResolverMap
};
