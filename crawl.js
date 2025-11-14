#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const {
  createCrawlService,
  buildAvailabilityPayload
} = require('./src/server/crawl-api');
const {
  normalizeOutputVerbosity,
  OUTPUT_VERBOSITY_LEVELS
} = require('./src/utils/outputVerbosity');


function printHelp() {
  console.log(`crawl.js — minimal crawl playground\n\n` +
`Usage:\n` +
`  node crawl.js [--config <path>] [--start-url <url>] [--concurrency <n>] [--max-downloads <n>] [--output-verbosity <level>]\n` +
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


function readFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (value === undefined) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function readJsonFlag(args, flag) {
  const value = readFlag(args, flag);
  if (value === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON for ${flag}: ${error.message}`);
  }
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

const DEFAULT_SEQUENCE_PRESET = 'basicArticleDiscovery';
const DEFAULT_START_URL = 'https://www.theguardian.com';
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_MAX_DOWNLOADS = 2000;
const DEFAULT_BASIC_OUTPUT_VERBOSITY = 'extra-terse';
const DEFAULT_RUNNER_CONFIG_FILES = [
  path.resolve(__dirname, 'config', 'crawl-runner.json'),
  path.resolve(__dirname, 'config', 'crawl-runner.yaml'),
  path.resolve(__dirname, 'config', 'crawl-runner.yml')
];

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


function readIntegerFlag(args, flag) {
  const value = readFlag(args, flag);
  if (value === undefined) {
    return undefined;
  }
  const parsed = parsePositiveInteger(value);
  if (parsed === undefined) {
    throw new Error(`Invalid numeric value for ${flag}: ${value}`);
  }
  return parsed;
}

function readOutputVerbosityFlag(args, flag) {
  const rawValue = readFlag(args, flag);
  if (rawValue === undefined) {
    return undefined;
  }
  const normalized = normalizeOutputVerbosity(rawValue, null);
  if (!normalized) {
    throw new Error(`Invalid output verbosity for ${flag}: ${rawValue}. Expected one of: ${OUTPUT_VERBOSITY_LEVELS.join(', ')}`);
  }
  return normalized;
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



function loadDefaultCrawlConfig() {
  const configPath = path.resolve(__dirname, 'config.json');
  const fallback = {
    sequence: DEFAULT_SEQUENCE_PRESET,
    startUrl: DEFAULT_START_URL,
    sharedOverrides: {
      concurrency: DEFAULT_CONCURRENCY,
      maxDownloads: DEFAULT_MAX_DOWNLOADS,
      outputVerbosity: DEFAULT_BASIC_OUTPUT_VERBOSITY
    }
  };

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { config: fallback, sourcePath: null };
    }

    const crawlDefaults = parsed.crawlDefaults && typeof parsed.crawlDefaults === 'object'
      ? parsed.crawlDefaults
      : null;

    const sequence = typeof crawlDefaults?.sequence === 'string' && crawlDefaults.sequence.trim()
      ? crawlDefaults.sequence.trim()
      : fallback.sequence;

    const candidateStartUrl = typeof crawlDefaults?.startUrl === 'string' && crawlDefaults.startUrl.trim()
      ? crawlDefaults.startUrl.trim()
      : null;

    const fallbackStartUrl = typeof parsed.url === 'string' && parsed.url.trim()
      ? parsed.url.trim()
      : fallback.startUrl;

    const sharedOverridesConfig = crawlDefaults?.sharedOverrides && typeof crawlDefaults.sharedOverrides === 'object'
      ? crawlDefaults.sharedOverrides
      : {};

    const resolvedConcurrency = parsePositiveInteger(sharedOverridesConfig.concurrency)
      ?? fallback.sharedOverrides.concurrency;
    const resolvedMaxDownloads = parsePositiveInteger(sharedOverridesConfig.maxDownloads)
      ?? fallback.sharedOverrides.maxDownloads;
    const sharedOverridesVerbosity = normalizeOutputVerbosity(sharedOverridesConfig.outputVerbosity, null);
    const defaultVerbosity = sharedOverridesVerbosity
      ?? normalizeOutputVerbosity(crawlDefaults?.outputVerbosity, null)
      ?? fallback.sharedOverrides.outputVerbosity;

    const sharedOverrides = {};
    if (resolvedConcurrency !== undefined) {
      sharedOverrides.concurrency = resolvedConcurrency;
    }
    if (resolvedMaxDownloads !== undefined) {
      sharedOverrides.maxDownloads = resolvedMaxDownloads;
    }
    if (defaultVerbosity) {
      sharedOverrides.outputVerbosity = defaultVerbosity;
    }

    return {
      config: {
        sequence,
        startUrl: candidateStartUrl || fallbackStartUrl,
        sharedOverrides
      },
      sourcePath: crawlDefaults ? configPath : null
    };
  } catch (_) {
    return { config: fallback, sourcePath: null };
  }
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

function parseRunnerConfigFile(configPath) {
  const raw = fs.readFileSync(configPath, 'utf8');
  const extension = path.extname(configPath).toLowerCase();
  let parsed;
  if (extension === '.yaml' || extension === '.yml') {
    parsed = yaml.load(raw);
  } else {
    parsed = JSON.parse(raw);
  }
  if (!isPlainObject(parsed)) {
    throw new Error('Runner config must be a JSON or YAML object.');
  }
  return parsed;
}

function tryLoadRunnerConfig(configPath, { required } = {}) {
  if (!configPath) {
    return null;
  }
  try {
    if (!fs.existsSync(configPath)) {
      if (required) {
        throw new Error('File not found');
      }
      return null;
    }
    return {
      config: parseRunnerConfigFile(configPath),
      sourcePath: configPath,
      baseDir: path.dirname(configPath)
    };
  } catch (error) {
    if (required) {
      throw new Error(`Failed to load crawl runner config (${configPath}): ${error.message}`);
    }
    return null;
  }
}

function loadRunnerConfig({ explicitPath, envPath } = {}) {
  const candidates = [];
  if (explicitPath) {
    candidates.push({ path: path.resolve(process.cwd(), explicitPath), required: true });
  }
  if (envPath) {
    const resolvedEnv = path.resolve(process.cwd(), envPath);
    const alreadyQueued = candidates.some((candidate) => candidate.path === resolvedEnv);
    if (!alreadyQueued) {
      candidates.push({ path: resolvedEnv, required: true });
    }
  }
  DEFAULT_RUNNER_CONFIG_FILES.forEach((filePath) => {
    candidates.push({ path: filePath, required: false });
  });

  for (const candidate of candidates) {
    const loaded = tryLoadRunnerConfig(candidate.path, { required: candidate.required });
    if (loaded) {
      return loaded;
    }
  }
  return null;
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

async function runRunnerSequence(service, args, config, metadata) {
  const sequenceName = pickString(
    readFlag(args, '--sequence'),
    readFlag(args, '--sequence-name'),
    config.sequence,
    config.sequenceName
  );
  if (!sequenceName) {
    throw new Error('Runner config must specify "sequence" or pass --sequence <name>.');
  }

  const startUrl = pickString(readFlag(args, '--start-url'), config.startUrl);
  if (!startUrl) {
    throw new Error('Runner config must specify a startUrl or pass --start-url <url>.');
  }

  const sharedOverrides = mergeOverrideObjects(
    config.sharedOverrides,
    readJsonFlag(args, '--shared-overrides')
  );
  const stepOverrides = mergeOverrideObjects(
    config.stepOverrides,
    readJsonFlag(args, '--step-overrides')
  );
  const overrideMaxDownloads = readIntegerFlag(args, '--max-downloads');
  if (overrideMaxDownloads !== undefined) {
    sharedOverrides.maxDownloads = overrideMaxDownloads;
  }
  const overrideOutputVerbosity = readOutputVerbosityFlag(args, '--output-verbosity');
  if (overrideOutputVerbosity) {
    sharedOverrides.outputVerbosity = overrideOutputVerbosity;
  }
  const continueOnError = hasFlag(args, '--continue-on-error') || Boolean(config.continueOnError);

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

async function runRunnerSequenceConfig(service, args, config, metadata) {
  const sequenceConfigName = pickString(
    readFlag(args, '--sequence-config'),
    readFlag(args, '--sequence-config-name'),
    config.sequenceConfig,
    config.sequenceConfigName
  );
  if (!sequenceConfigName) {
    throw new Error('Runner config must specify "sequenceConfig" or pass --sequence-config <name>.');
  }

  const configDirFlag = readFlag(args, '--config-dir');
  const configDir = resolveRunnerPath(configDirFlag || config.configDir, metadata.baseDir);
  const configHost = pickString(readFlag(args, '--config-host'), config.configHost);
  const startUrl = pickString(readFlag(args, '--start-url'), config.startUrl);
  const sharedOverrides = mergeOverrideObjects(
    config.sharedOverrides,
    readJsonFlag(args, '--shared-overrides')
  );
  const stepOverrides = mergeOverrideObjects(
    config.stepOverrides,
    readJsonFlag(args, '--step-overrides')
  );
  const configCliOverrides = mergeOverrideObjects(
    config.configCliOverrides,
    readJsonFlag(args, '--config-cli-overrides')
  );
  const overrideMaxDownloads = readIntegerFlag(args, '--max-downloads');
  if (overrideMaxDownloads !== undefined) {
    sharedOverrides.maxDownloads = overrideMaxDownloads;
  }
  const overrideOutputVerbosity = readOutputVerbosityFlag(args, '--output-verbosity');
  if (overrideOutputVerbosity) {
    sharedOverrides.outputVerbosity = overrideOutputVerbosity;
  }
  const continueOnError = hasFlag(args, '--continue-on-error') || Boolean(config.continueOnError);

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

async function runRunnerOperation(service, args, config, metadata) {
  const operationName = pickString(
    readFlag(args, '--operation'),
    readFlag(args, '--operation-name'),
    config.operation,
    config.operationName
  );
  if (!operationName) {
    throw new Error('Runner config must specify "operation" or pass --operation <name>.');
  }

  const startUrl = pickString(readFlag(args, '--start-url'), config.startUrl);
  if (!startUrl) {
    throw new Error('Runner config must specify a startUrl or pass --start-url <url>.');
  }

  const overrides = mergeOverrideObjects(config.overrides, readJsonFlag(args, '--overrides'));
  const overrideMaxDownloads = readIntegerFlag(args, '--max-downloads');
  if (overrideMaxDownloads !== undefined) {
    overrides.maxDownloads = overrideMaxDownloads;
  }
  const overrideOutputVerbosity = readOutputVerbosityFlag(args, '--output-verbosity');
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

async function runConfiguredCrawl(service, args, runnerConfig) {
  const mode = determineRunnerMode(runnerConfig.config);
  if (mode === 'sequence-config') {
    await runRunnerSequenceConfig(service, args, runnerConfig.config, runnerConfig);
    return true;
  }
  if (mode === 'operation') {
    await runRunnerOperation(service, args, runnerConfig.config, runnerConfig);
    return true;
  }
  await runRunnerSequence(service, args, runnerConfig.config, runnerConfig);
  return true;
}

async function runDefaultGuardianCrawl(service, args) {
  const configFlag = readFlag(args, '--config') || readFlag(args, '--config-path');
  const runnerConfig = loadRunnerConfig({
    explicitPath: configFlag,
    envPath: process.env.CRAWL_CONFIG_PATH
  });
  if (runnerConfig) {
    await runConfiguredCrawl(service, args, runnerConfig);
    return;
  }

  const { config, sourcePath } = loadDefaultCrawlConfig();

  const overrideStartUrl = readFlag(args, '--start-url');
  const overrideConcurrency = readIntegerFlag(args, '--concurrency');
  const overrideMaxDownloads = readIntegerFlag(args, '--max-downloads');
  const overrideOutputVerbosity = readOutputVerbosityFlag(args, '--output-verbosity');

  const startUrl = (overrideStartUrl && overrideStartUrl.trim()) || config.startUrl;
  if (!startUrl) {
    throw new Error('Unable to determine start URL for default crawl. Set crawlDefaults.startUrl in config.json or pass --start-url <url>.');
  }

  const sharedOverrides = {};
  const resolvedConcurrency = overrideConcurrency ?? config.sharedOverrides.concurrency;
  const resolvedMaxDownloads = overrideMaxDownloads ?? config.sharedOverrides.maxDownloads;
  const resolvedOutputVerbosity = overrideOutputVerbosity ?? config.sharedOverrides.outputVerbosity;

  if (resolvedConcurrency !== undefined) {
    sharedOverrides.concurrency = resolvedConcurrency;
  }
  if (resolvedMaxDownloads !== undefined) {
    sharedOverrides.maxDownloads = resolvedMaxDownloads;
  }
  if (resolvedOutputVerbosity) {
    sharedOverrides.outputVerbosity = resolvedOutputVerbosity;
  }

  const sequenceName = config.sequence || DEFAULT_SEQUENCE_PRESET;
  const originLabel = sourcePath ? `config.json at ${sourcePath}` : 'built-in defaults';

  console.log(`Using crawl defaults from ${originLabel} (sequence=${sequenceName}, startUrl=${startUrl}, concurrency=${sharedOverrides.concurrency ?? 'default'}, maxDownloads=${sharedOverrides.maxDownloads ?? 'default'}, outputVerbosity=${sharedOverrides.outputVerbosity ?? 'default'})`);

  const sequenceArgs = ['run-sequence', sequenceName, startUrl];

  if (Object.keys(sharedOverrides).length > 0) {
    sequenceArgs.push('--shared-overrides', JSON.stringify(sharedOverrides));
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

async function runOperation(service, args) {
  const operationName = args[1];
  const startUrl = args[2];
  if (!operationName || !startUrl) {
    throw new Error('run-operation requires <operationName> and <startUrl>.');
  }
  const overrides = readJsonFlag(args, '--overrides') || {};
  const overrideMaxDownloads = readIntegerFlag(args, '--max-downloads');
  if (overrideMaxDownloads !== undefined) {
    overrides.maxDownloads = overrideMaxDownloads;
  }
  const operationVerbosity = readOutputVerbosityFlag(args, '--output-verbosity');
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

async function runSequencePreset(service, args) {
  const sequenceName = args[1];
  const startUrl = args[2];
  if (!sequenceName || !startUrl) {
    throw new Error('run-sequence requires <sequenceName> and <startUrl>.');
  }
  const sharedOverrides = readJsonFlag(args, '--shared-overrides') || {};
  const stepOverrides = readJsonFlag(args, '--step-overrides') || {};
  const continueOnError = hasFlag(args, '--continue-on-error');
  const overrideMaxDownloads = readIntegerFlag(args, '--max-downloads');
  if (overrideMaxDownloads !== undefined) {
    sharedOverrides.maxDownloads = overrideMaxDownloads;
  }
  const sequenceVerbosity = readOutputVerbosityFlag(args, '--output-verbosity');
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

async function runSequenceConfig(service, args) {
  const sequenceConfigName = args[1];
  if (!sequenceConfigName) {
    throw new Error('run-sequence-config requires <configName>.');
  }
  const configDir = readFlag(args, '--config-dir');
  const configHost = readFlag(args, '--config-host');
  const startUrl = readFlag(args, '--start-url');
  const sharedOverrides = readJsonFlag(args, '--shared-overrides') || {};
  const stepOverrides = readJsonFlag(args, '--step-overrides') || {};
  const configCliOverrides = readJsonFlag(args, '--config-cli-overrides') || {};
  const continueOnError = hasFlag(args, '--continue-on-error');
  const overrideMaxDownloads = readIntegerFlag(args, '--max-downloads');
  if (overrideMaxDownloads !== undefined) {
    sharedOverrides.maxDownloads = overrideMaxDownloads;
  }
  const sequenceVerbosity = readOutputVerbosityFlag(args, '--output-verbosity');
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

async function runPlaceCommand(service, args) {
  const subcommand = args[1];
  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    printPlaceHelp();
    return;
  }

  const rest = args.slice(2);

  if (subcommand === 'guess') {
    await runPlaceGuess(service, rest);
    return;
  }

  if (subcommand === 'explore') {
    await runPlaceExplore(service, rest);
    return;
  }

  throw new Error(`Unknown place subcommand: ${subcommand}`);
}

async function runPlaceGuess(service, args) {
  const target = args[0];
  if (!target || target.startsWith('--')) {
    throw new Error('place guess requires <domain|url>.');
  }

  const flagArgs = args.slice(1);
  const schemeFlag = readFlag(flagArgs, '--scheme');
  const startUrl = ensureAbsoluteUrl(target, schemeFlag || 'https');
  if (!startUrl) {
    throw new Error('Unable to determine start URL for place guess command.');
  }

  const overrides = {};
  if (schemeFlag) {
    overrides.scheme = schemeFlag;
  }

  const kindsFlag = readFlag(flagArgs, '--kinds');
  if (kindsFlag) {
    overrides.kinds = parseCommaSeparated(kindsFlag);
  }

  const limitValue = readIntegerFlag(flagArgs, '--limit');
  if (limitValue !== undefined) {
    overrides.limit = limitValue;
  }

  const patternsValue = readIntegerFlag(flagArgs, '--patterns-per-place');
  if (patternsValue !== undefined) {
    overrides.patternsPerPlace = patternsValue;
  }

  const topicsFlag = readFlag(flagArgs, '--topics');
  if (topicsFlag) {
    overrides.topics = parseCommaSeparated(topicsFlag);
  }

  const domainOverride = readFlag(flagArgs, '--domain');
  if (domainOverride) {
    overrides.domain = domainOverride;
  }

  if (hasFlag(flagArgs, '--apply')) {
    overrides.apply = true;
  }

  if (hasFlag(flagArgs, '--enable-topic-discovery')) {
    overrides.enableTopicDiscovery = true;
  }

  if (hasFlag(flagArgs, '--enable-combination-discovery')) {
    overrides.enableCombinationDiscovery = true;
  }

  if (hasFlag(flagArgs, '--enable-hierarchical-discovery')) {
    overrides.enableHierarchicalDiscovery = true;
  }

  const maxAge = readIntegerFlag(flagArgs, '--max-age-days');
  if (maxAge !== undefined) {
    overrides.maxAgeDays = maxAge;
  }

  const refresh404 = readIntegerFlag(flagArgs, '--refresh-404-days');
  if (refresh404 !== undefined) {
    overrides.refresh404Days = refresh404;
  }

  const retry4xx = readIntegerFlag(flagArgs, '--retry-4xx-days');
  if (retry4xx !== undefined) {
    overrides.retry4xxDays = retry4xx;
  }

  const dataDir = readFlag(flagArgs, '--data-dir');
  if (dataDir) {
    overrides.dataDir = dataDir;
  }

  const dbPath = readFlag(flagArgs, '--db-path');
  if (dbPath) {
    overrides.dbPath = dbPath;
  }

  const runId = readFlag(flagArgs, '--run-id');
  if (runId) {
    overrides.runId = runId;
  }

  if (hasFlag(flagArgs, '--verbose')) {
    overrides.verbose = true;
  }

  const jsonOutput = hasFlag(flagArgs, '--json');

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

async function runPlaceExplore(service, args) {
  const target = args[0];
  if (!target || target.startsWith('--')) {
    throw new Error('place explore requires <domain|url>.');
  }

  const flagArgs = args.slice(1);
  const schemeFlag = readFlag(flagArgs, '--scheme');
  const startUrl = ensureAbsoluteUrl(target, schemeFlag || 'https');
  if (!startUrl) {
    throw new Error('Unable to determine start URL for place explore command.');
  }

  const overrides = readJsonFlag(flagArgs, '--overrides') || {};

  if (schemeFlag) {
    overrides.scheme = schemeFlag;
  }

  const concurrency = readIntegerFlag(flagArgs, '--concurrency');
  if (concurrency !== undefined) {
    overrides.concurrency = concurrency;
  }

  const maxDownloads = readIntegerFlag(flagArgs, '--max-downloads');
  if (maxDownloads !== undefined) {
    overrides.maxDownloads = maxDownloads;
  }

  const plannerVerbosity = readIntegerFlag(flagArgs, '--planner-verbosity');
  if (plannerVerbosity !== undefined) {
    overrides.plannerVerbosity = plannerVerbosity;
  }

  const outputVerbosity = readOutputVerbosityFlag(flagArgs, '--output-verbosity');
  if (outputVerbosity) {
    overrides.outputVerbosity = outputVerbosity;
  }

  if (hasFlag(flagArgs, '--structure-only')) {
    overrides.structureOnly = true;
  }

  if (hasFlag(flagArgs, '--no-structure-only')) {
    overrides.structureOnly = false;
  }

  const intTargets = readFlag(flagArgs, '--int-target-hosts');
  if (intTargets) {
    overrides.intTargetHosts = parseCommaSeparated(intTargets);
  }

  const jsonOutput = hasFlag(flagArgs, '--json');

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
  const args = argv.slice();
  const command = args[0];

  if (command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const service = createCrawlService();

  if (!command || command.startsWith('--')) {
    await runDefaultGuardianCrawl(service, args);
    return;
  }

  if (command === 'availability') {
    const includeAll = hasFlag(args, '--all');
    const includeOperations = includeAll || hasFlag(args, '--operations') || (!hasFlag(args, '--operations') && !hasFlag(args, '--sequences'));
    const includeSequences = includeAll || hasFlag(args, '--sequences') || (!hasFlag(args, '--operations') && !hasFlag(args, '--sequences'));
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
    await runOperation(service, args);
    return;
  }

  if (command === 'run-sequence') {
    await runSequencePreset(service, args);
    return;
  }

  if (command === 'run-sequence-config') {
    await runSequenceConfig(service, args);
    return;
  }

  if (command === 'place') {
    await runPlaceCommand(service, args);
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
