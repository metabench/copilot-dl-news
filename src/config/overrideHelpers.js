const { CliArgumentParser } = require('../utils/CliArgumentParser');
const { normalizeOutputVerbosity, OUTPUT_VERBOSITY_LEVELS } = require('../utils/outputVerbosity');

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

function normalizeVerbosity(level, fallback = null) {
  if (!level) return fallback;
  const normalized = normalizeOutputVerbosity(level, null);
  if (!normalized) {
    throw new Error(
      `Invalid output verbosity: ${level}. Expected one of: ${OUTPUT_VERBOSITY_LEVELS.join(', ')}`
    );
  }
  return normalized;
}

function parseSharedOverrides(argv, { allowUnknown = true } = {}) {
  const parser = new CliArgumentParser('crawl', 'Shared crawl override flags');
  parser.getProgram().allowUnknownOption(allowUnknown);
  parser
    .add('--max-downloads <number>', 'Maximum pages to download', undefined, 'number')
    .add('--limit <number>', 'Alias for max downloads', undefined, 'number')
    .add('--logging-queue', 'Enable queue logging', undefined, 'boolean')
    .add('--output-verbosity <level>', 'Output verbosity level')
    .add('--concurrency <number>', 'Crawler concurrency', undefined, 'number')
    .add('--planner-verbosity <number>', 'Planner verbosity', undefined, 'number')
    .add('--progress-json', 'Output progress stats as JSON to stdout', undefined, 'boolean')
    .add('--telemetry-json', 'Output crawl telemetry events as JSON lines to stdout', undefined, 'boolean');

  const parsed = parser.parse(['node', 'crawl.js', ...argv]);

  return buildSharedOverridesFromFlags(parsed);
}

function buildSharedOverridesFromFlags(flags = {}) {
  const overrides = {};
  const maxDownloads = flags.maxDownloads ?? flags.limit;
  if (maxDownloads !== undefined) {
    const parsed = parsePositiveInteger(maxDownloads);
    if (parsed === undefined) {
      throw new Error(`Invalid numeric value for max-downloads: ${maxDownloads}`);
    }
    overrides.maxDownloads = parsed;
  }
  if (flags.loggingQueue !== undefined) {
    overrides.loggingQueue = Boolean(flags.loggingQueue);
  }
  if (flags.outputVerbosity) {
    overrides.outputVerbosity = normalizeVerbosity(flags.outputVerbosity);
  }
  if (flags.concurrency !== undefined) {
    const parsed = parsePositiveInteger(flags.concurrency);
    if (parsed === undefined) {
      throw new Error(`Invalid numeric value for concurrency: ${flags.concurrency}`);
    }
    overrides.concurrency = parsed;
  }
  if (flags.plannerVerbosity !== undefined) {
    const parsed = parsePositiveInteger(flags.plannerVerbosity);
    if (parsed === undefined) {
      throw new Error(`Invalid numeric value for planner-verbosity: ${flags.plannerVerbosity}`);
    }
    overrides.plannerVerbosity = parsed;
  }
  if (flags.progressJson !== undefined) {
    overrides.progressJson = Boolean(flags.progressJson);
  }
  if (flags.telemetryJson !== undefined) {
    overrides.telemetryJson = Boolean(flags.telemetryJson);
  }
  return overrides;
}

function applyContextOverrideFlags(baseOverrides, context) {
  const overrides = { ...(baseOverrides || {}) };
  const overrideMaxDownloads = context.getIntegerFlag('--max-downloads') ?? context.getIntegerFlag('--limit');
  if (overrideMaxDownloads !== undefined) {
    overrides.maxDownloads = overrideMaxDownloads;
  }
  const overrideLoggingQueue = context.getBooleanFlag('--logging-queue');
  if (overrideLoggingQueue !== undefined) {
    overrides.loggingQueue = overrideLoggingQueue;
  }
  const overrideOutputVerbosity = context.getFlag('--output-verbosity');
  if (overrideOutputVerbosity) {
    overrides.outputVerbosity = normalizeVerbosity(overrideOutputVerbosity, overrides.outputVerbosity || null);
  }
  const overrideConcurrency = context.getIntegerFlag('--concurrency');
  if (overrideConcurrency !== undefined) {
    overrides.concurrency = overrideConcurrency;
  }
  const plannerVerbosity = context.getIntegerFlag('--planner-verbosity');
  if (plannerVerbosity !== undefined) {
    overrides.plannerVerbosity = plannerVerbosity;
  }
  const progressJson = context.getBooleanFlag('--progress-json');
  if (progressJson !== undefined) {
    overrides.progressJson = progressJson;
  }

  const telemetryJson = context.getBooleanFlag('--telemetry-json');
  if (telemetryJson !== undefined) {
    overrides.telemetryJson = telemetryJson;
  }
  return overrides;
}

module.exports = {
  parseSharedOverrides,
  buildSharedOverridesFromFlags,
  applyContextOverrideFlags,
  normalizeVerbosity,
  parsePositiveInteger
};