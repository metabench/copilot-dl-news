const path = require('path');
const {
  DEFAULT_SEQUENCE_PRESET,
  DEFAULT_START_URL
} = require('../../config/ConfigurationService');
const { applyContextOverrideFlags } = require('../../config/overrideHelpers');
const { getLoggerWriter } = require('./cliRuntime');
const { printDownloadSummary, printStatus } = require('./reporting');
const { CrawlOperations } = require('../../crawler/CrawlOperations');
const { createMultiModalCrawl, MultiModalCrawlManager } = require('../../crawler/multimodal');
const { openNewsDb } = require('../../db/dbAccess');

// Import shared utilities (DRY)
const { mergeOverrideObjects, extractStatsFromSteps, pickString } = require('./shared');

function resolveRunnerPath(targetPath, baseDir) {
  if (typeof targetPath !== 'string' || !targetPath.trim()) {
    return null;
  }
  const trimmed = targetPath.trim();
  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }
  return path.resolve(baseDir || process.cwd(), trimmed);
}

function determineRunnerMode(config) {
  const declared = [config.mode, config.command, config.type]
    .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
    .find((value) => value);

  if (declared) {
    if (declared.includes('multi-modal') || declared.includes('multimodal')) {
      return 'multi-modal';
    }
    if (declared.includes('sequence-config')) {
      return 'sequence-config';
    }
    if (declared.includes('operation')) {
      return 'operation';
    }
    if (declared.includes('sequence')) {
      return 'sequence';
    }
  }

  if (pickString(config.sequenceConfig, config.sequenceConfigName)) {
    return 'sequence-config';
  }
  if (pickString(config.operation, config.operationName)) {
    return 'operation';
  }
  if (config.multiModal || config.multiModalConfig) {
    return 'multi-modal';
  }
  return 'sequence';
}

async function runRunnerSequence(service, context, config, metadata, additionalSharedOverrides, logger) {
  const sequenceName = pickString(
    context.getFlag('--sequence'),
    context.getFlag('--sequence-name'),
    config.sequence,
    config.sequenceName
  );
  if (!sequenceName) {
    throw new Error('Runner config must specify "sequence" or pass --sequence <name>.');
  }

  const startUrl = pickString(context.getFlag('--start-url'), config.startUrl);
  if (!startUrl) {
    throw new Error('Runner config must specify a startUrl or pass --start-url <url>.');
  }

  const sharedOverridesMerged = mergeOverrideObjects(
    config.sharedOverrides,
    additionalSharedOverrides,
    context.getJsonFlag('--shared-overrides')
  );
  const sharedOverrides = applyContextOverrideFlags(sharedOverridesMerged, context);
  const stepOverrides = mergeOverrideObjects(config.stepOverrides, context.getJsonFlag('--step-overrides'));
  const continueOnError = Boolean(context.hasFlag('--continue-on-error') || config.continueOnError);

  const info = logger && logger.info ? logger.info.bind(logger) : console.log;
  info(`Using crawl runner config from ${metadata.sourcePath} (sequence=${sequenceName}, startUrl=${startUrl})`);

  const result = await service.runSequencePreset({
    logger: logger || console,
    sequenceName,
    startUrl,
    sharedOverrides,
    stepOverrides,
    continueOnError
  });

  printStatus(`Sequence ${sequenceName}`, result?.status, { steps: result?.steps }, logger);
  if (Array.isArray(result?.steps)) {
    const stats = extractStatsFromSteps(result.steps);
    if (stats) {
      printDownloadSummary(sequenceName, stats, sharedOverrides, logger);
    }
  }
}

async function runRunnerSequenceConfig(service, context, config, metadata, additionalSharedOverrides, logger) {
  const sequenceConfigName = pickString(
    context.getFlag('--sequence-config'),
    context.getFlag('--sequence-config-name'),
    config.sequenceConfig,
    config.sequenceConfigName
  );
  if (!sequenceConfigName) {
    throw new Error('Runner config must specify "sequenceConfig" or pass --sequence-config <name>.');
  }

  const configDir = resolveRunnerPath(context.getFlag('--config-dir') || config.configDir, metadata.baseDir);
  const configHost = pickString(context.getFlag('--config-host'), config.configHost);
  const startUrl = pickString(context.getFlag('--start-url'), config.startUrl);
  const sharedOverridesMerged = mergeOverrideObjects(
    config.sharedOverrides,
    additionalSharedOverrides,
    context.getJsonFlag('--shared-overrides')
  );
  const sharedOverrides = applyContextOverrideFlags(sharedOverridesMerged, context);
  const stepOverrides = mergeOverrideObjects(config.stepOverrides, context.getJsonFlag('--step-overrides'));
  const configCliOverrides = mergeOverrideObjects(
    config.configCliOverrides,
    context.getJsonFlag('--config-cli-overrides')
  );
  const continueOnError = Boolean(context.hasFlag('--continue-on-error') || config.continueOnError);

  const info = logger && logger.info ? logger.info.bind(logger) : console.log;
  info(
    `Using crawl runner config from ${metadata.sourcePath} (sequenceConfig=${sequenceConfigName}${startUrl ? `, startUrl=${startUrl}` : ''})`
  );

  const result = await service.runSequenceConfig({
    logger: logger || console,
    sequenceConfigName,
    configDir,
    configHost,
    startUrl,
    sharedOverrides,
    stepOverrides,
    configCliOverrides,
    continueOnError
  });

  const status = result?.result?.status || result?.status || 'unknown';
  printStatus(
    `Sequence config ${sequenceConfigName}`,
    status,
    { configPath: result?.metadata?.source?.path, steps: result?.result?.steps },
    logger
  );
}

async function runRunnerOperation(service, context, config, metadata, additionalSharedOverrides, logger) {
  const operationName = pickString(context.getFlag('--operation'), context.getFlag('--operation-name'), config.operation, config.operationName);
  if (!operationName) {
    throw new Error('Runner config must specify "operation" or pass --operation <name>.');
  }

  const startUrl = pickString(context.getFlag('--start-url'), config.startUrl);
  if (!startUrl) {
    throw new Error('Runner config must specify a startUrl or pass --start-url <url>.');
  }

  const mergedOverrides = mergeOverrideObjects(
    config.overrides,
    additionalSharedOverrides,
    context.getJsonFlag('--overrides')
  );
  const overrides = applyContextOverrideFlags(mergedOverrides, context);

  const info = logger && logger.info ? logger.info.bind(logger) : console.log;
  info(`Using crawl runner config from ${metadata.sourcePath} (operation=${operationName}, startUrl=${startUrl})`);

  const result = await service.runOperation({
    logger: logger || console,
    operationName,
    startUrl,
    overrides
  });

  printStatus(`Operation ${operationName}`, result?.status, { elapsedMs: result?.elapsedMs }, logger);
  if (result?.stats) {
    printDownloadSummary(operationName, result.stats, overrides, logger);
  }
}

function resolveMultiModalDomains({ startUrl, domains }) {
  let domainList = [];
  if (Array.isArray(domains)) {
    domainList = domains.slice();
  } else if (typeof domains === 'string') {
    domainList = domains.split(',').map((entry) => entry.trim());
  }

  if (!domainList.length && startUrl) {
    try {
      domainList = [new URL(startUrl).host];
    } catch (_) {
      throw new Error(`Invalid startUrl for multi-modal crawl: ${startUrl}`);
    }
  }

  const unique = [];
  for (const entry of domainList) {
    const trimmed = typeof entry === 'string' ? entry.trim() : '';
    if (!trimmed) continue;
    if (!unique.includes(trimmed)) {
      unique.push(trimmed);
    }
  }

  return unique;
}

function resolveMultiModalDbPath(config = {}, sharedOverrides = {}) {
  if (typeof config.dbPath === 'string' && config.dbPath.trim()) {
    return config.dbPath.trim();
  }
  if (typeof sharedOverrides.dbPath === 'string' && sharedOverrides.dbPath.trim()) {
    return sharedOverrides.dbPath.trim();
  }
  const dataDir = config.dataDir || sharedOverrides.dataDir;
  if (typeof dataDir === 'string' && dataDir.trim()) {
    return path.join(dataDir.trim(), 'news.db');
  }
  return null;
}

async function runMultiModalCrawl({
  startUrl,
  multiModalConfig = {},
  sharedOverrides = {},
  logger,
  sourceLabel
} = {}) {
  const config = multiModalConfig && typeof multiModalConfig === 'object'
    ? { ...multiModalConfig }
    : {};

  const domains = resolveMultiModalDomains({
    startUrl,
    domains: config.domains || config.domain
  });
  if (domains.length === 0) {
    throw new Error('Multi-modal crawl requires a startUrl or domains list.');
  }

  const maxParallel = Number.isFinite(config.maxParallel)
    ? Math.max(1, Math.floor(config.maxParallel))
    : 2;

  delete config.domains;
  delete config.domain;
  delete config.maxParallel;

  const dbPath = resolveMultiModalDbPath(config, sharedOverrides);
  if (dbPath) {
    config.dbPath = dbPath;
  }

  const info = logger && logger.info ? logger.info.bind(logger) : console.log;
  info(`Using multi-modal ${sourceLabel || 'defaults'} (domains=${domains.join(', ')}, maxParallel=${maxParallel})`);

  const db = openNewsDb(dbPath);
  const crawlOperations = new CrawlOperations({ logger: logger || console });

  try {
    if (domains.length > 1) {
      const manager = new MultiModalCrawlManager({
        maxParallel,
        logger: logger || console,
        createOrchestrator: (overrides = {}) => createMultiModalCrawl({
          db,
          crawlOperations,
          config: { ...config, ...overrides },
          logger: logger || console
        })
      });

      await manager.start(domains, config, { maxParallel });
    } else {
      const { orchestrator } = createMultiModalCrawl({
        db,
        crawlOperations,
        config,
        logger: logger || console
      });

      await orchestrator.start(domains[0], config);
    }
  } finally {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
}

async function runRunnerMultiModal(service, context, config, metadata, additionalSharedOverrides, logger) {
  const startUrl = pickString(context.getFlag('--start-url'), config.startUrl, config.multiModal?.startUrl);
  const sharedOverridesMerged = mergeOverrideObjects(
    config.sharedOverrides,
    additionalSharedOverrides,
    context.getJsonFlag('--shared-overrides')
  );
  const sharedOverrides = applyContextOverrideFlags(sharedOverridesMerged, context);
  const multiModalConfig = config.multiModal || config.multiModalConfig || config;

  await runMultiModalCrawl({
    startUrl,
    multiModalConfig,
    sharedOverrides,
    logger,
    sourceLabel: `runner config from ${metadata.sourcePath}`
  });
}

async function runDefaultMultiModalCrawl(defaultRunConfig, sharedOverrides, logger) {
  const startUrl = defaultRunConfig.startUrl;
  const sourcePath = defaultRunConfig.metadata?.defaultConfigPath;
  const originLabel = sourcePath ? `config.json at ${sourcePath}` : 'built-in defaults';

  await runMultiModalCrawl({
    startUrl,
    multiModalConfig: defaultRunConfig.multiModalConfig || {},
    sharedOverrides,
    logger,
    sourceLabel: originLabel
  });
}

async function runConfiguredCrawl(service, argsOrContext, runnerConfig, sharedOverrides, logger) {
  const mode = determineRunnerMode(runnerConfig.config);
  const runnerHandlers = {
    'sequence-config': runRunnerSequenceConfig,
    operation: runRunnerOperation,
    sequence: runRunnerSequence,
    'multi-modal': runRunnerMultiModal
  };
  const handler = runnerHandlers[mode] || runnerHandlers.sequence;
  await handler(service, argsOrContext, runnerConfig.config, runnerConfig, sharedOverrides, logger);
  return true;
}

async function runDefaultGuardianCrawl(service, context, sharedOverrides, logger) {
  const runnerConfig = context.getRunnerConfig();
  if (runnerConfig) {
    await runConfiguredCrawl(service, context, runnerConfig, sharedOverrides, logger);
    return;
  }

  const defaultRunConfig = context.getDefaultRunConfig();
  if (!defaultRunConfig) {
    throw new Error('Configuration service did not provide default crawl settings.');
  }

  const mode = defaultRunConfig.mode ? String(defaultRunConfig.mode).toLowerCase() : '';
  if (mode && (mode.includes('multi-modal') || mode.includes('multimodal'))) {
    await runDefaultMultiModalCrawl(defaultRunConfig, sharedOverrides, logger);
    return;
  }

  const sequenceName = defaultRunConfig.sequenceName || DEFAULT_SEQUENCE_PRESET;
  const startUrl = defaultRunConfig.startUrl || DEFAULT_START_URL;
  if (!startUrl) {
    throw new Error('Unable to determine start URL for default crawl. Set crawlDefaults.startUrl in config.json or pass --start-url <url>.');
  }

  const sharedOverridesCombined = mergeOverrideObjects(defaultRunConfig.sharedOverrides || {}, sharedOverrides);
  const stepOverrides = defaultRunConfig.stepOverrides || {};
  const continueOnError = Boolean(defaultRunConfig.continueOnError);

  const sourcePath = defaultRunConfig.metadata?.defaultConfigPath;
  const originLabel = sourcePath ? `config.json at ${sourcePath}` : 'built-in defaults';

  const info = logger && logger.info ? logger.info.bind(logger) : console.log;
  info(
    `Using crawl defaults from ${originLabel} (sequence=${sequenceName}, startUrl=${startUrl}, concurrency=${sharedOverridesCombined.concurrency ?? 'default'}, maxDownloads=${sharedOverridesCombined.maxDownloads ?? 'default'}, outputVerbosity=${sharedOverridesCombined.outputVerbosity ?? 'default'})`
  );

  const result = await service.runSequencePreset({
    logger: logger || console,
    sequenceName,
    startUrl,
    sharedOverrides: sharedOverridesCombined,
    stepOverrides,
    continueOnError
  });

  printStatus(`Sequence ${sequenceName}`, result?.status, { steps: result?.steps }, logger);
  if (Array.isArray(result?.steps)) {
    const stats = extractStatsFromSteps(result.steps);
    if (stats) {
      printDownloadSummary(sequenceName, stats, sharedOverridesCombined, logger);
    }
  }
}

module.exports = {
  determineRunnerMode,
  runRunnerSequence,
  runRunnerSequenceConfig,
  runRunnerOperation,
  runConfiguredCrawl,
  runDefaultGuardianCrawl,
  resolveRunnerPath
};
