#!/usr/bin/env node
'use strict';

const path = require('path');
const {
  createCrawlService,
  buildAvailabilityPayload
} = require('./src/server/crawl-api');
const {
  normalizeOutputVerbosity,
  OUTPUT_VERBOSITY_LEVELS
} = require('./src/utils/outputVerbosity');
const {
  ConfigurationService,
  CliContext,
  DEFAULT_SEQUENCE_PRESET,
  DEFAULT_START_URL
} = require('./src/config/ConfigurationService');


function printHelp() {
  console.log(`crawl.js — minimal crawl playground\n\n` +
`Usage:\n` +
`  node crawl.js [--config <path>] [--start-url <url>] [--concurrency <n>] [--max-downloads <n>|--limit <n>] [--output-verbosity <level>]\n` +
`      Run the config-driven crawl using config/crawl-runner.(json|yaml) or config.json defaults.\n` +
`  node crawl.js availability [--all|--operations|--sequences]\n` +
`  node crawl.js run-operation <operationName> <startUrl> [--overrides <json>] [--output-verbosity <level>]\n` +
`  node crawl.js run-sequence <sequenceName> <startUrl> [--shared-overrides <json>] [--step-overrides <json>] [--continue-on-error] [--output-verbosity <level>]\n` +
`  node crawl.js run-sequence-config <configName> [--config-dir <path>] [--config-host <host>] [--start-url <url>] [--shared-overrides <json>] [--step-overrides <json>] [--config-cli-overrides <json>] [--continue-on-error] [--output-verbosity <level>]\n\n` +
`  node crawl.js place guess <domain|url> [--kinds <list>] [--limit <n>] [--apply] [--json]\n` +
`  node crawl.js place explore <domain|url> [--overrides <json>] [--output-verbosity <level>] [--json]\n\n` +
`Flags accept compact JSON objects (for example: --overrides "{\"plannerVerbosity\":2}").\n` +
`Verbosity levels: ${OUTPUT_VERBOSITY_LEVELS.join(', ')}.\n`);
}


function isCliContext(value) {
  return value instanceof CliContext;
}

function readFlag(argsOrContext, flag) {
  if (isCliContext(argsOrContext)) {
    return argsOrContext.getFlag(flag);
  }
  const index = argsOrContext.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const value = argsOrContext[index + 1];
  if (value === undefined) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function readJsonFlag(argsOrContext, flag) {
  if (isCliContext(argsOrContext)) {
    return argsOrContext.getJsonFlag(flag);
  }
  const value = readFlag(argsOrContext, flag);
  if (value === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON for ${flag}: ${error.message}`);
  }
}

function hasFlag(argsOrContext, flag) {
  if (isCliContext(argsOrContext)) {
    return argsOrContext.hasFlag(flag);
  }
  return argsOrContext.includes(flag);
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


function readIntegerFlag(argsOrContext, flag) {
  if (isCliContext(argsOrContext)) {
    return argsOrContext.getIntegerFlag(flag);
  }
  const value = readFlag(argsOrContext, flag);
  if (value === undefined) {
    return undefined;
  }
  const parsed = parsePositiveInteger(value);
  if (parsed === undefined) {
    throw new Error(`Invalid numeric value for ${flag}: ${value}`);
  }
  return parsed;
}

function readOutputVerbosityFlag(argsOrContext, flag) {
  if (isCliContext(argsOrContext)) {
    return argsOrContext.getFlag(flag);
  }
  const rawValue = readFlag(argsOrContext, flag);
  if (rawValue === undefined) {
    return undefined;
  }
  const normalized = normalizeOutputVerbosity(rawValue, null);
  if (!normalized) {
    throw new Error(`Invalid output verbosity for ${flag}: ${rawValue}. Expected one of: ${OUTPUT_VERBOSITY_LEVELS.join(', ')}`);
  }
  return normalized;
}

function readBooleanFlag(argsOrContext, flag) {
  if (isCliContext(argsOrContext)) {
    return argsOrContext.getBooleanFlag(flag);
  }
  const value = readFlag(argsOrContext, flag);
  if (value === undefined) {
    return undefined;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function readPositional(argsOrContext, index) {
  if (isCliContext(argsOrContext)) {
    return argsOrContext.getPositional(index);
  }
  return argsOrContext[index];
}

function parseCommaSeparated(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return String(value)
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function ensureAbsoluteUrl(target, fallbackScheme = 'https') {
  if (!target) {
    return null;
  }
  const trimmed = String(target).trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.includes('://')) {
    return trimmed;
  }
  const scheme = typeof fallbackScheme === 'string' && fallbackScheme ? fallbackScheme : 'https';
  return `${scheme}://${trimmed}`;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return value ?? 'n/a';
  }
  return value.toLocaleString('en-US');
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) {
    return 'n/a';
  }
  if (ms < 1000) {
    return `${ms} ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(2)} s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function printPlaceHelp() {
  console.log('Place workflows via crawl.js\n\n'
    + 'Usage:\n'
    + '  node crawl.js place guess <domain|url> [--kinds <list>] [--limit <n>] [--apply] [--json]\n'
    + '  node crawl.js place explore <domain|url> [--overrides <json>] [--json]\n\n'
    + 'Examples:\n'
    + '  node crawl.js place guess theguardian.com --kinds country,city --limit 5\n'
    + '  node crawl.js place explore https://www.theguardian.com --max-downloads 150 --planner-verbosity 2\n');
}

function printGuessPlaceSummary(response) {
  const status = response?.status || 'unknown';
  console.log(`guessPlaceHubs → ${status}`);
  if (response?.elapsedMs != null) {
    console.log(`  Duration: ${formatDuration(response.elapsedMs)}`);
  }
  if (response?.domain) {
    console.log(`  Domain: ${response.domain}`);
  } else if (response?.startUrl) {
    console.log(`  Start URL: ${response.startUrl}`);
  }

  if (status !== 'ok') {
    const message = response?.error?.message || 'Unknown error';
    console.error(`  Error: ${message}`);
    return;
  }

  const summary = response?.result;
  if (!summary || typeof summary !== 'object') {
    console.log('  No summary returned.');
    return;
  }

  console.log(`  Places evaluated: ${formatNumber(summary.totalPlaces ?? 0)}`);
  if (summary.totalTopics != null) {
    console.log(`  Topics evaluated: ${formatNumber(summary.totalTopics ?? 0)}`);
  }
  console.log(`  URL candidates: ${formatNumber(summary.totalUrls ?? 0)}`);
  console.log(`  Fetched (HTTP OK): ${formatNumber(summary.fetched ?? 0)}`);
  console.log(`  Cached successes: ${formatNumber(summary.cached ?? 0)}`);
  console.log(`  Inserted hubs: ${formatNumber(summary.insertedHubs ?? 0)}`);
  console.log(`  Updated hubs: ${formatNumber(summary.updatedHubs ?? 0)}`);
  console.log(`  Errors: ${formatNumber(summary.errors ?? 0)}`);

  const recommendations = Array.isArray(summary.recommendations) ? summary.recommendations : [];
  if (recommendations.length > 0) {
    console.log('  Recommendations:');
    recommendations.slice(0, 3).forEach((item) => {
      console.log(`    - ${item}`);
    });
  }
}

function printExploreSummary(response) {
  const status = response?.status || 'unknown';
  console.log(`findPlaceAndTopicHubs → ${status}`);
  if (response?.elapsedMs != null) {
    console.log(`  Duration: ${formatDuration(response.elapsedMs)}`);
  }
  if (response?.options?.crawlType) {
    console.log(`  Crawl type: ${response.options.crawlType}`);
  }

  if (status !== 'ok') {
    const message = response?.error?.message || 'Unknown error';
    console.error(`  Error: ${message}`);
    return;
  }

  const stats = response?.stats || {};
  console.log(`  Pages visited: ${formatNumber(stats.pagesVisited ?? 0)}`);
  console.log(`  Pages downloaded: ${formatNumber(stats.pagesDownloaded ?? 0)}`);
  console.log(`  Articles found: ${formatNumber(stats.articlesFound ?? 0)}`);
  console.log(`  Articles saved: ${formatNumber(stats.articlesSaved ?? 0)}`);
  if (stats.errors != null) {
    console.log(`  Errors: ${formatNumber(stats.errors ?? 0)}`);
  }
}
  function extractStatsFromSteps(steps) {
    if (!Array.isArray(steps)) {
      return null;
    }
    for (let index = steps.length - 1; index >= 0; index -= 1) {
      const candidate = steps[index];
      if (candidate && candidate.stats && typeof candidate.stats === 'object') {
        const keys = Object.keys(candidate.stats);
        if (keys.length > 0) {
          return candidate.stats;
        }
      }
    }
    return null;
  }

  function printDownloadSummary(label, stats, overrides = {}) {
    if (!stats || typeof stats !== 'object') {
      return;
    }
    const visited = Number.isFinite(stats.pagesVisited) ? stats.pagesVisited : null;
    const downloaded = Number.isFinite(stats.pagesDownloaded) ? stats.pagesDownloaded : null;
    const saved = Number.isFinite(stats.articlesSaved) ? stats.articlesSaved : null;
    const found = Number.isFinite(stats.articlesFound) ? stats.articlesFound : null;
    const limit = parsePositiveInteger(overrides?.maxDownloads);
    if (downloaded == null && visited == null && saved == null && found == null) {
      return;
    }
    const parts = [];
    if (downloaded != null) {
      const downloadPart = typeof limit === 'number'
        ? `${formatNumber(downloaded)}/${formatNumber(limit)}`
        : formatNumber(downloaded);
      parts.push(`downloaded ${downloadPart} pages`);
    }
    if (visited != null) {
      parts.push(`visited ${formatNumber(visited)} pages`);
    }
    if (saved != null) {
      parts.push(`saved ${formatNumber(saved)} articles`);
    } else if (found != null) {
      parts.push(`found ${formatNumber(found)} articles`);
    }
    const prefix = label ? `[${label}] ` : '';
    console.log(`${prefix}Final stats: ${parts.join(' • ')}`);
  }



function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function mergeOverrideObjects(baseValue, overrideValue) {
  const result = {};
  if (isPlainObject(baseValue)) {
    Object.assign(result, baseValue);
  }
  if (isPlainObject(overrideValue)) {
    Object.assign(result, overrideValue);
  }
  return result;
}

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
  return 'sequence';
}

async function runRunnerSequence(service, argsOrContext, config, metadata) {
  const sequenceName = pickString(
    readFlag(argsOrContext, '--sequence'),
    readFlag(argsOrContext, '--sequence-name'),
    config.sequence,
    config.sequenceName
  );
  if (!sequenceName) {
    throw new Error('Runner config must specify "sequence" or pass --sequence <name>.');
  }

  const startUrl = pickString(readFlag(argsOrContext, '--start-url'), config.startUrl);
  if (!startUrl) {
    throw new Error('Runner config must specify a startUrl or pass --start-url <url>.');
  }

  const sharedOverrides = mergeOverrideObjects(
    config.sharedOverrides,
    readJsonFlag(argsOrContext, '--shared-overrides')
  );
  const stepOverrides = mergeOverrideObjects(
    config.stepOverrides,
    readJsonFlag(argsOrContext, '--step-overrides')
  );
  const overrideMaxDownloads = readIntegerFlag(argsOrContext, '--max-downloads') ?? readIntegerFlag(argsOrContext, '--limit');
  if (overrideMaxDownloads !== undefined) {
    sharedOverrides.maxDownloads = overrideMaxDownloads;
  }
  const overrideLoggingQueue = readBooleanFlag(argsOrContext, '--logging-queue');
  if (overrideLoggingQueue !== undefined) {
    sharedOverrides.loggingQueue = overrideLoggingQueue;
  }
  const overrideOutputVerbosity = readOutputVerbosityFlag(argsOrContext, '--output-verbosity');
  if (overrideOutputVerbosity) {
    sharedOverrides.outputVerbosity = overrideOutputVerbosity;
  }
  const continueOnError = hasFlag(argsOrContext, '--continue-on-error') || Boolean(config.continueOnError);

  console.log(`Using crawl runner config from ${metadata.sourcePath} (sequence=${sequenceName}, startUrl=${startUrl})`);

  const sequenceArgs = ['run-sequence', sequenceName, startUrl];
  if (Object.keys(sharedOverrides).length > 0) {
    sequenceArgs.push('--shared-overrides', JSON.stringify(sharedOverrides));
  }
  if (Object.keys(stepOverrides).length > 0) {
    sequenceArgs.push('--step-overrides', JSON.stringify(stepOverrides));
  }
  if (continueOnError) {
    sequenceArgs.push('--continue-on-error');
  }

  await runSequencePreset(service, sequenceArgs);
}

async function runRunnerSequenceConfig(service, argsOrContext, config, metadata) {
  const sequenceConfigName = pickString(
    readFlag(argsOrContext, '--sequence-config'),
    readFlag(argsOrContext, '--sequence-config-name'),
    config.sequenceConfig,
    config.sequenceConfigName
  );
  if (!sequenceConfigName) {
    throw new Error('Runner config must specify "sequenceConfig" or pass --sequence-config <name>.');
  }

  const configDirFlag = readFlag(argsOrContext, '--config-dir');
  const configDir = resolveRunnerPath(configDirFlag || config.configDir, metadata.baseDir);
  const configHost = pickString(readFlag(argsOrContext, '--config-host'), config.configHost);
  const startUrl = pickString(readFlag(argsOrContext, '--start-url'), config.startUrl);
  const sharedOverrides = mergeOverrideObjects(
    config.sharedOverrides,
    readJsonFlag(argsOrContext, '--shared-overrides')
  );
  const stepOverrides = mergeOverrideObjects(
    config.stepOverrides,
    readJsonFlag(argsOrContext, '--step-overrides')
  );
  const configCliOverrides = mergeOverrideObjects(
    config.configCliOverrides,
    readJsonFlag(argsOrContext, '--config-cli-overrides')
  );
  const overrideMaxDownloads = readIntegerFlag(argsOrContext, '--max-downloads') ?? readIntegerFlag(argsOrContext, '--limit');
  if (overrideMaxDownloads !== undefined) {
    sharedOverrides.maxDownloads = overrideMaxDownloads;
  }
  const overrideLoggingQueue = readBooleanFlag(argsOrContext, '--logging-queue');
  if (overrideLoggingQueue !== undefined) {
    sharedOverrides.loggingQueue = overrideLoggingQueue;
  }
  const overrideOutputVerbosity = readOutputVerbosityFlag(argsOrContext, '--output-verbosity');
  if (overrideOutputVerbosity) {
    sharedOverrides.outputVerbosity = overrideOutputVerbosity;
  }
  const continueOnError = hasFlag(argsOrContext, '--continue-on-error') || Boolean(config.continueOnError);

  console.log(
    `Using crawl runner config from ${metadata.sourcePath} (sequence-config=${sequenceConfigName}` +
      `${configDir ? `, dir=${configDir}` : ''})`
  );

  const runArgs = ['run-sequence-config', sequenceConfigName];
  if (configDir) {
    runArgs.push('--config-dir', configDir);
  }
  if (configHost) {
    runArgs.push('--config-host', configHost);
  }
  if (startUrl) {
    runArgs.push('--start-url', startUrl);
  }
  if (Object.keys(sharedOverrides).length > 0) {
    runArgs.push('--shared-overrides', JSON.stringify(sharedOverrides));
  }
  if (Object.keys(stepOverrides).length > 0) {
    runArgs.push('--step-overrides', JSON.stringify(stepOverrides));
  }
  if (Object.keys(configCliOverrides).length > 0) {
    runArgs.push('--config-cli-overrides', JSON.stringify(configCliOverrides));
  }
  if (continueOnError) {
    runArgs.push('--continue-on-error');
  }

  await runSequenceConfig(service, runArgs);
}

async function runRunnerOperation(service, argsOrContext, config, metadata) {
  const operationName = pickString(
    readFlag(argsOrContext, '--operation'),
    readFlag(argsOrContext, '--operation-name'),
    config.operation,
    config.operationName
  );
  if (!operationName) {
    throw new Error('Runner config must specify "operation" or pass --operation <name>.');
  }

  const startUrl = pickString(readFlag(argsOrContext, '--start-url'), config.startUrl);
  if (!startUrl) {
    throw new Error('Runner config must specify a startUrl or pass --start-url <url>.');
  }

  const overrides = mergeOverrideObjects(config.overrides, readJsonFlag(argsOrContext, '--overrides'));
  const overrideMaxDownloads = readIntegerFlag(argsOrContext, '--max-downloads') ?? readIntegerFlag(argsOrContext, '--limit');
  if (overrideMaxDownloads !== undefined) {
    overrides.maxDownloads = overrideMaxDownloads;
  }
  const overrideLoggingQueue = readBooleanFlag(argsOrContext, '--logging-queue');
  if (overrideLoggingQueue !== undefined) {
    overrides.loggingQueue = overrideLoggingQueue;
  }
  const overrideOutputVerbosity = readOutputVerbosityFlag(argsOrContext, '--output-verbosity');
  if (overrideOutputVerbosity) {
    overrides.outputVerbosity = overrideOutputVerbosity;
  }

  console.log(`Using crawl runner config from ${metadata.sourcePath} (operation=${operationName}, startUrl=${startUrl})`);

  const opArgs = ['run-operation', operationName, startUrl];
  if (Object.keys(overrides).length > 0) {
    opArgs.push('--overrides', JSON.stringify(overrides));
  }

  await runOperation(service, opArgs);
}

async function runConfiguredCrawl(service, argsOrContext, runnerConfig) {
  const mode = determineRunnerMode(runnerConfig.config);
  if (mode === 'sequence-config') {
    await runRunnerSequenceConfig(service, argsOrContext, runnerConfig.config, runnerConfig);
    return true;
  }
  if (mode === 'operation') {
    await runRunnerOperation(service, argsOrContext, runnerConfig.config, runnerConfig);
    return true;
  }
  await runRunnerSequence(service, argsOrContext, runnerConfig.config, runnerConfig);
  return true;
}

async function runDefaultGuardianCrawl(service, context) {
  const runnerConfig = context.getRunnerConfig();
  if (runnerConfig) {
    await runConfiguredCrawl(service, context, runnerConfig);
    return;
  }

  const defaultRunConfig = context.getDefaultRunConfig();
  if (!defaultRunConfig) {
    throw new Error('Configuration service did not provide default crawl settings.');
  }

  const sequenceName = defaultRunConfig.sequenceName || DEFAULT_SEQUENCE_PRESET;
  const startUrl = defaultRunConfig.startUrl || DEFAULT_START_URL;
  if (!startUrl) {
    throw new Error('Unable to determine start URL for default crawl. Set crawlDefaults.startUrl in config.json or pass --start-url <url>.');
  }

  const sharedOverrides = defaultRunConfig.sharedOverrides || {};
  const stepOverrides = defaultRunConfig.stepOverrides || {};
  const continueOnError = Boolean(defaultRunConfig.continueOnError);

  const sourcePath = defaultRunConfig.metadata?.defaultConfigPath;
  const originLabel = sourcePath ? `config.json at ${sourcePath}` : 'built-in defaults';

  console.log(
    `Using crawl defaults from ${originLabel} (sequence=${sequenceName}, startUrl=${startUrl}, concurrency=${sharedOverrides.concurrency ?? 'default'}, maxDownloads=${sharedOverrides.maxDownloads ?? 'default'}, outputVerbosity=${sharedOverrides.outputVerbosity ?? 'default'})`
  );

  const sequenceArgs = ['run-sequence', sequenceName, startUrl];

  if (Object.keys(sharedOverrides).length > 0) {
    sequenceArgs.push('--shared-overrides', JSON.stringify(sharedOverrides));
  }
  if (Object.keys(stepOverrides).length > 0) {
    sequenceArgs.push('--step-overrides', JSON.stringify(stepOverrides));
  }
  if (continueOnError) {
    sequenceArgs.push('--continue-on-error');
  }

  await runSequencePreset(service, sequenceArgs);
}


function printAvailabilitySummary(availability, includeOperations, includeSequences) {
  console.log('Crawl Availability');
  if (includeOperations && Array.isArray(availability.operations)) {
    console.log('\nOperations:');
    availability.operations.forEach((op) => {
      console.log(`  • ${op.name}${op.summary ? ` — ${op.summary}` : ''}`);
    });
  }
  const sequences = availability.sequences || availability.sequencePresets;
  if (includeSequences && Array.isArray(sequences)) {
    console.log('\nSequence Presets:');
    sequences.forEach((seq) => {
      const description = seq.description ? ` — ${seq.description}` : '';
      const steps = Array.isArray(seq.steps) && seq.steps.length
        ? ` (${seq.steps.map((step) => step.operation).join(' → ')})`
        : '';
      console.log(`  • ${seq.name}${description}${steps}`);
    });
  }
}

async function runOperation(service, argsOrContext) {
  const operationName = readPositional(argsOrContext, 0);
  const startUrl = readPositional(argsOrContext, 1);
  if (!operationName || !startUrl) {
    throw new Error('run-operation requires <operationName> and <startUrl>.');
  }
  const overrides = readJsonFlag(argsOrContext, '--overrides') || {};
  const overrideMaxDownloads = readIntegerFlag(argsOrContext, '--max-downloads') ?? readIntegerFlag(argsOrContext, '--limit');
  if (overrideMaxDownloads !== undefined) {
    overrides.maxDownloads = overrideMaxDownloads;
  }
  const overrideLoggingQueue = readBooleanFlag(argsOrContext, '--logging-queue');
  if (overrideLoggingQueue !== undefined) {
    overrides.loggingQueue = overrideLoggingQueue;
  }
  const operationVerbosity = readOutputVerbosityFlag(argsOrContext, '--output-verbosity');
  if (operationVerbosity) {
    overrides.outputVerbosity = operationVerbosity;
  }
  const result = await service.runOperation({
    logger: console,
    operationName,
    startUrl,
    overrides
  });
  console.log(`Operation ${operationName} finished with status: ${result?.status || 'unknown'}`);
  if (result?.elapsedMs != null) {
    console.log(`Elapsed: ${result.elapsedMs} ms`);
  }
  if (result?.error) {
    console.error('Error:', result.error);
  }
  if (result?.stats) {
    printDownloadSummary(operationName, result.stats, overrides);
  }
}

async function runSequencePreset(service, argsOrContext) {
  const sequenceName = readPositional(argsOrContext, 0);
  const startUrl = readPositional(argsOrContext, 1);
  if (!sequenceName || !startUrl) {
    throw new Error('run-sequence requires <sequenceName> and <startUrl>.');
  }
  const sharedOverrides = readJsonFlag(argsOrContext, '--shared-overrides') || {};
  const stepOverrides = readJsonFlag(argsOrContext, '--step-overrides') || {};
  const continueOnError = hasFlag(argsOrContext, '--continue-on-error');
  const overrideMaxDownloads = readIntegerFlag(argsOrContext, '--max-downloads') ?? readIntegerFlag(argsOrContext, '--limit');
  if (overrideMaxDownloads !== undefined) {
    sharedOverrides.maxDownloads = overrideMaxDownloads;
  }
  const overrideLoggingQueue = readBooleanFlag(argsOrContext, '--logging-queue');
  if (overrideLoggingQueue !== undefined) {
    sharedOverrides.loggingQueue = overrideLoggingQueue;
  }
  const sequenceVerbosity = readOutputVerbosityFlag(argsOrContext, '--output-verbosity');
  if (sequenceVerbosity) {
    sharedOverrides.outputVerbosity = sequenceVerbosity;
  }
  const result = await service.runSequencePreset({
    logger: console,
    sequenceName,
    startUrl,
    sharedOverrides,
    stepOverrides,
    continueOnError
  });
  console.log(`Sequence ${sequenceName} finished with status: ${result?.status || 'unknown'}`);
  if (Array.isArray(result?.steps)) {
    result.steps.forEach((step) => {
      console.log(`  - ${step.name || step.operation || 'step'}: ${step.status || 'unknown'}`);
    });
    const stats = extractStatsFromSteps(result.steps);
    if (stats) {
      printDownloadSummary(sequenceName, stats, sharedOverrides);
    }
  }
  return result;
}

async function runSequenceConfig(service, argsOrContext) {
  const sequenceConfigName = readPositional(argsOrContext, 0);
  if (!sequenceConfigName) {
    throw new Error('run-sequence-config requires <configName>.');
  }
  const configDir = readFlag(argsOrContext, '--config-dir');
  const configHost = readFlag(argsOrContext, '--config-host');
  const startUrl = readFlag(argsOrContext, '--start-url');
  const sharedOverrides = readJsonFlag(argsOrContext, '--shared-overrides') || {};
  const stepOverrides = readJsonFlag(argsOrContext, '--step-overrides') || {};
  const configCliOverrides = readJsonFlag(argsOrContext, '--config-cli-overrides') || {};
  const continueOnError = hasFlag(argsOrContext, '--continue-on-error');
  const overrideMaxDownloads = readIntegerFlag(argsOrContext, '--max-downloads') ?? readIntegerFlag(argsOrContext, '--limit');
  if (overrideMaxDownloads !== undefined) {
    sharedOverrides.maxDownloads = overrideMaxDownloads;
  }
  const overrideLoggingQueue = readBooleanFlag(argsOrContext, '--logging-queue');
  if (overrideLoggingQueue !== undefined) {
    sharedOverrides.loggingQueue = overrideLoggingQueue;
  }
  const sequenceVerbosity = readOutputVerbosityFlag(argsOrContext, '--output-verbosity');
  if (sequenceVerbosity) {
    sharedOverrides.outputVerbosity = sequenceVerbosity;
  }

  const result = await service.runSequenceConfig({
    logger: console,
    sequenceConfigName,
    configDir,
    configHost,
    startUrl,
    sharedOverrides,
    stepOverrides,
    continueOnError,
    configCliOverrides
  });

  const status = result?.result?.status || result?.status || 'unknown';
  console.log(`Sequence config ${sequenceConfigName} finished with status: ${status}`);
  if (result?.metadata?.source?.path) {
    console.log(`Config file: ${result.metadata.source.path}`);
  }
}

async function runPlaceCommand(service, argsOrContext) {
  const subcommand = readPositional(argsOrContext, 0);
  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    printPlaceHelp();
    return;
  }
  if (subcommand === 'guess') {
    await runPlaceGuess(service, argsOrContext);
    return;
  }

  if (subcommand === 'explore') {
    await runPlaceExplore(service, argsOrContext);
    return;
  }

  throw new Error(`Unknown place subcommand: ${subcommand}`);
}

async function runPlaceGuess(service, argsOrContext) {
  const target = readPositional(argsOrContext, 1);
  if (!target || target.startsWith('--')) {
    throw new Error('place guess requires <domain|url>.');
  }

  const schemeFlag = readFlag(argsOrContext, '--scheme');
  const startUrl = ensureAbsoluteUrl(target, schemeFlag || 'https');
  if (!startUrl) {
    throw new Error('Unable to determine start URL for place guess command.');
  }

  const overrides = {};
  if (schemeFlag) {
    overrides.scheme = schemeFlag;
  }

  const kindsFlag = readFlag(argsOrContext, '--kinds');
  if (kindsFlag) {
    overrides.kinds = parseCommaSeparated(kindsFlag);
  }

  const limitValue = readIntegerFlag(argsOrContext, '--limit');
  if (limitValue !== undefined) {
    overrides.limit = limitValue;
  }

  const patternsValue = readIntegerFlag(argsOrContext, '--patterns-per-place');
  if (patternsValue !== undefined) {
    overrides.patternsPerPlace = patternsValue;
  }

  const topicsFlag = readFlag(argsOrContext, '--topics');
  if (topicsFlag) {
    overrides.topics = parseCommaSeparated(topicsFlag);
  }

  const domainOverride = readFlag(argsOrContext, '--domain');
  if (domainOverride) {
    overrides.domain = domainOverride;
  }

  if (hasFlag(argsOrContext, '--apply')) {
    overrides.apply = true;
  }

  if (hasFlag(argsOrContext, '--enable-topic-discovery')) {
    overrides.enableTopicDiscovery = true;
  }

  if (hasFlag(argsOrContext, '--enable-combination-discovery')) {
    overrides.enableCombinationDiscovery = true;
  }

  if (hasFlag(argsOrContext, '--enable-hierarchical-discovery')) {
    overrides.enableHierarchicalDiscovery = true;
  }

  const maxAge = readIntegerFlag(argsOrContext, '--max-age-days');
  if (maxAge !== undefined) {
    overrides.maxAgeDays = maxAge;
  }

  const refresh404 = readIntegerFlag(argsOrContext, '--refresh-404-days');
  if (refresh404 !== undefined) {
    overrides.refresh404Days = refresh404;
  }

  const retry4xx = readIntegerFlag(argsOrContext, '--retry-4xx-days');
  if (retry4xx !== undefined) {
    overrides.retry4xxDays = retry4xx;
  }

  const dataDir = readFlag(argsOrContext, '--data-dir');
  if (dataDir) {
    overrides.dataDir = dataDir;
  }

  const dbPath = readFlag(argsOrContext, '--db-path');
  if (dbPath) {
    overrides.dbPath = dbPath;
  }

  const runId = readFlag(argsOrContext, '--run-id');
  if (runId) {
    overrides.runId = runId;
  }

  if (hasFlag(argsOrContext, '--verbose')) {
    overrides.verbose = true;
  }

  const jsonOutput = hasFlag(argsOrContext, '--json');

  const response = await service.runOperation({
    logger: console,
    operationName: 'guessPlaceHubs',
    startUrl,
    overrides
  });

  if (jsonOutput) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    printGuessPlaceSummary(response);
  }
}

async function runPlaceExplore(service, argsOrContext) {
  const target = readPositional(argsOrContext, 1);
  if (!target || target.startsWith('--')) {
    throw new Error('place explore requires <domain|url>.');
  }

  const schemeFlag = readFlag(argsOrContext, '--scheme');
  const startUrl = ensureAbsoluteUrl(target, schemeFlag || 'https');
  if (!startUrl) {
    throw new Error('Unable to determine start URL for place explore command.');
  }

  const overrides = readJsonFlag(argsOrContext, '--overrides') || {};

  if (schemeFlag) {
    overrides.scheme = schemeFlag;
  }

  const concurrency = readIntegerFlag(argsOrContext, '--concurrency');
  if (concurrency !== undefined) {
    overrides.concurrency = concurrency;
  }

  const maxDownloads = readIntegerFlag(argsOrContext, '--max-downloads') ?? readIntegerFlag(argsOrContext, '--limit');
  if (maxDownloads !== undefined) {
    overrides.maxDownloads = maxDownloads;
  }

  const plannerVerbosity = readIntegerFlag(argsOrContext, '--planner-verbosity');
  if (plannerVerbosity !== undefined) {
    overrides.plannerVerbosity = plannerVerbosity;
  }

  const outputVerbosity = readOutputVerbosityFlag(argsOrContext, '--output-verbosity');
  if (outputVerbosity) {
    overrides.outputVerbosity = outputVerbosity;
  }

  if (hasFlag(argsOrContext, '--structure-only')) {
    overrides.structureOnly = true;
  }

  if (hasFlag(argsOrContext, '--no-structure-only')) {
    overrides.structureOnly = false;
  }

  const intTargets = readFlag(argsOrContext, '--int-target-hosts');
  if (intTargets) {
    overrides.intTargetHosts = parseCommaSeparated(intTargets);
  }

  const jsonOutput = hasFlag(argsOrContext, '--json');

  const response = await service.runOperation({
    logger: console,
    operationName: 'findPlaceAndTopicHubs',
    startUrl,
    overrides
  });

  if (jsonOutput) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    printExploreSummary(response);
  }
}

async function main(argv) {
  const [firstArg] = argv;
  if (firstArg === '--help' || firstArg === '-h') {
    printHelp();
    return;
  }

  const configService = new ConfigurationService();
  const context = configService.createContext(argv);
  const command = context.getCommand();
  const service = createCrawlService();

  if (!command) {
    await runDefaultGuardianCrawl(service, context);
    return;
  }

  if (command === 'availability') {
    const includeAll = hasFlag(context, '--all');
    const includeOperations = includeAll || hasFlag(context, '--operations') || (!hasFlag(context, '--operations') && !hasFlag(context, '--sequences'));
    const includeSequences = includeAll || hasFlag(context, '--sequences') || (!hasFlag(context, '--operations') && !hasFlag(context, '--sequences'));
    const availability = service.getAvailability({ logger: console });
    const payload =
      buildAvailabilityPayload(
        availability,
        {
          showOperationsList: includeOperations,
          showSequencesList: includeSequences
        },
        includeAll
      ) || {};

    printAvailabilitySummary(payload, includeOperations, includeSequences);
    return;
  }

  if (command === 'run-operation') {
    await runOperation(service, context);
    return;
  }

  if (command === 'run-sequence') {
    await runSequencePreset(service, context);
    return;
  }

  if (command === 'run-sequence-config') {
    await runSequenceConfig(service, context);
    return;
  }

  if (command === 'place') {
    await runPlaceCommand(service, context);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
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
