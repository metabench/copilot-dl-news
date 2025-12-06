#!/usr/bin/env node
'use strict';

const {
  createCrawlService,
  buildAvailabilityPayload
} = require('./src/server/crawl-api');
const { ConfigurationService } = require('./src/config/ConfigurationService');

const {
  parseSharedOverrides
} = require('./src/cli/crawl/cliArgs');
const {
  createStructuredLogger,
  getLoggerWriter,
  resolveLoggerVerbosity,
  resolveOverrides
} = require('./src/cli/crawl/cliRuntime');
const {
  printAvailabilitySummary,
  printDownloadSummary,
  printStatus,
  printCrawlHelp
} = require('./src/cli/crawl/reporting');
const { runDefaultGuardianCrawl, resolveRunnerPath } = require('./src/cli/crawl/runner');
const { createCommandTable } = require('./src/cli/crawl/commands');
const { runPlaceCommand } = require('./src/cli/crawl/place');

// Import shared utilities (DRY)
const { extractStatsFromSteps } = require('./src/cli/crawl/shared');

async function executeOperation(service, { operationName, startUrl, overrides, logger }) {
  const activeLogger = logger || console;
  const result = await service.runOperation({
    logger: activeLogger,
    operationName,
    startUrl,
    overrides: overrides || {}
  });
  printStatus(`Operation ${operationName}`, result?.status, { elapsedMs: result?.elapsedMs }, activeLogger);
  if (result?.error) {
    getLoggerWriter(activeLogger, 'error')('Error:', result.error);
  }
  if (result?.stats) {
    printDownloadSummary(operationName, result.stats, overrides, activeLogger);
  }
  return result;
}

async function executeSequencePreset(service, { sequenceName, startUrl, sharedOverrides, stepOverrides, continueOnError, logger }) {
  const activeLogger = logger || console;
  const result = await service.runSequencePreset({
    logger: activeLogger,
    sequenceName,
    startUrl,
    sharedOverrides: sharedOverrides || {},
    stepOverrides: stepOverrides || {},
    continueOnError
  });
  printStatus(`Sequence ${sequenceName}`, result?.status, { steps: result?.steps }, activeLogger);
  if (Array.isArray(result?.steps)) {
    const stats = extractStatsFromSteps(result.steps);
    if (stats) {
      printDownloadSummary(sequenceName, stats, sharedOverrides, activeLogger);
    }
  }
  return result;
}

async function executeSequenceConfig(service, { sequenceConfigName, configDir, configHost, startUrl, sharedOverrides, stepOverrides, configCliOverrides, continueOnError, logger }) {
  const activeLogger = logger || console;
  const result = await service.runSequenceConfig({
    logger: activeLogger,
    sequenceConfigName,
    configDir,
    configHost,
    startUrl,
    sharedOverrides: sharedOverrides || {},
    stepOverrides: stepOverrides || {},
    continueOnError,
    configCliOverrides: configCliOverrides || {}
  });

  const status = result?.result?.status || result?.status || 'unknown';
  printStatus(
    `Sequence config ${sequenceConfigName}`,
    status,
    { configPath: result?.metadata?.source?.path, steps: result?.result?.steps },
    activeLogger
  );
  return result;
}

async function runOperation(service, context, sharedOverrides, logger) {
  const operationName = context.getPositional(0);
  const startUrl = context.getPositional(1);
  if (!operationName || !startUrl) {
    throw new Error('run-operation requires <operationName> and <startUrl>.');
  }
  const overrides = resolveOverrides(context, sharedOverrides, context.getJsonFlag('--overrides'));

  await executeOperation(service, { operationName, startUrl, overrides, logger });
}

async function runSequencePreset(service, context, sharedOverrides, logger) {
  const sequenceName = context.getPositional(0);
  const startUrl = context.getPositional(1);
  if (!sequenceName || !startUrl) {
    throw new Error('run-sequence requires <sequenceName> and <startUrl>.');
  }
  const sharedOverridesArg = context.getJsonFlag('--shared-overrides') || {};
  const stepOverrides = context.getJsonFlag('--step-overrides') || {};
  const continueOnError = context.hasFlag('--continue-on-error');
  const combinedShared = resolveOverrides(context, sharedOverrides, sharedOverridesArg);

  await executeSequencePreset(service, {
    sequenceName,
    startUrl,
    sharedOverrides: combinedShared,
    stepOverrides,
    continueOnError,
    logger
  });
}

async function runSequenceConfig(service, context, sharedOverrides, logger) {
  const sequenceConfigName = context.getPositional(0);
  if (!sequenceConfigName) {
    throw new Error('run-sequence-config requires <configName>.');
  }
  const configDir = resolveRunnerPath(context.getFlag('--config-dir'), process.cwd());
  const configHost = context.getFlag('--config-host');
  const startUrl = context.getFlag('--start-url');
  const sharedOverridesArg = context.getJsonFlag('--shared-overrides') || {};
  const stepOverrides = context.getJsonFlag('--step-overrides') || {};
  const configCliOverrides = context.getJsonFlag('--config-cli-overrides') || {};
  const continueOnError = context.hasFlag('--continue-on-error');
  const combinedShared = resolveOverrides(context, sharedOverrides, sharedOverridesArg);

  await executeSequenceConfig(service, {
    sequenceConfigName,
    configDir,
    configHost,
    startUrl,
    sharedOverrides: combinedShared,
    stepOverrides,
    configCliOverrides,
    continueOnError,
    logger
  });
}


async function main(argv) {
  const sharedOverrides = parseSharedOverrides(argv);
  const [firstArg] = argv;
  if (firstArg === '--help' || firstArg === '-h') {
    printHelp();
    return;
  }

  const configService = new ConfigurationService();
  const context = configService.createContext(argv);
  const command = context.getCommand();
  const service = createCrawlService();
  const jsonOutput = context.hasFlag('--json');
  const outputVerbosity = resolveLoggerVerbosity(context, sharedOverrides);
  const logger = createStructuredLogger({ outputVerbosity, jsonOutput });
  const { commandHandlers } = createCommandTable({
    service,
    context,
    sharedOverrides,
    logger,
    runOperation,
    runSequencePreset,
    runSequenceConfig,
    runPlaceCommand,
    buildAvailabilityPayload
  });

  if (!command) {
    await runDefaultGuardianCrawl(service, context, sharedOverrides, logger);
    return;
  }

  const handler = commandHandlers[command];
  if (!handler) {
    throw new Error(`Unknown command: ${command}`);
  }
  await handler();
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message || error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

module.exports = {
  createStructuredLogger,
  getLoggerWriter,
  resolveLoggerVerbosity,
  resolveOverrides,
  printStatus
};
