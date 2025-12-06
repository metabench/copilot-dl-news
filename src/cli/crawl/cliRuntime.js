const { CliFormatter } = require('../../utils/CliFormatter');
const { normalizeVerbosity, applyContextOverrideFlags } = require('../../config/overrideHelpers');
const { DEFAULT_BASIC_OUTPUT_VERBOSITY } = require('../../config/ConfigurationService');

// Import shared utilities (DRY)
const { isPlainObject, mergeOverrideObjects } = require('./shared');

function formatLogArgs(parts = []) {
  return parts
    .filter((part) => part !== undefined && part !== null)
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part instanceof Error) return part.message;
      if (typeof part === 'number' || typeof part === 'boolean') return String(part);
      try {
        return JSON.stringify(part);
      } catch (error) {
        return String(part);
      }
    })
    .join(' ');
}

function getLoggerWriter(logger, level = 'info') {
  if (logger && typeof logger[level] === 'function') {
    return logger[level].bind(logger);
  }
  if (level === 'info' && logger && typeof logger.log === 'function') {
    return logger.log.bind(logger);
  }
  if (level === 'warn' && logger && typeof logger.error === 'function') {
    return logger.error.bind(logger);
  }
  if (level === 'error' && logger && typeof logger.warn === 'function') {
    return logger.warn.bind(logger);
  }
  return level === 'error' ? console.error : console.log;
}

function createStructuredLogger({ outputVerbosity, jsonOutput = false, formatter } = {}) {
  const fmt = formatter || new CliFormatter();
  const normalized = normalizeVerbosity(outputVerbosity || DEFAULT_BASIC_OUTPUT_VERBOSITY, DEFAULT_BASIC_OUTPUT_VERBOSITY);

  const suppressInfo = jsonOutput || normalized === 'extra-terse';
  const infoWriter = suppressInfo ? () => {} : getLoggerWriter(fmt, 'info');
  const logWriter = suppressInfo ? () => {} : infoWriter;
  const warnWriter = jsonOutput ? getLoggerWriter(console, 'error') : getLoggerWriter(fmt, 'warn');
  const errorWriter = jsonOutput ? getLoggerWriter(console, 'error') : getLoggerWriter(fmt, 'error');

  return {
    info: (message, ...rest) => infoWriter(formatLogArgs([message, ...rest])),
    log: (message, ...rest) => logWriter(formatLogArgs([message, ...rest])),
    warn: (message, ...rest) => warnWriter(formatLogArgs([message, ...rest])),
    error: (message, ...rest) => errorWriter(formatLogArgs([message, ...rest]))
  };
}

function resolveLoggerVerbosity(context, sharedOverrides) {
  const defaultRunConfig = typeof context.getDefaultRunConfig === 'function' ? context.getDefaultRunConfig() : null;
  const candidate =
    context.getFlag('--output-verbosity') ||
    sharedOverrides?.outputVerbosity ||
    defaultRunConfig?.sharedOverrides?.outputVerbosity ||
    DEFAULT_BASIC_OUTPUT_VERBOSITY;

  return normalizeVerbosity(candidate, DEFAULT_BASIC_OUTPUT_VERBOSITY);
}

function resolveOverrides(context, sharedOverrides, ...additionalOverrides) {
  const normalizedShared = applyContextOverrideFlags(sharedOverrides, context);
  return mergeOverrideObjects(normalizedShared, ...additionalOverrides);
}

module.exports = {
  // Re-export from shared for backward compatibility
  mergeOverrideObjects,
  formatLogArgs,
  getLoggerWriter,
  createStructuredLogger,
  resolveLoggerVerbosity,
  resolveOverrides
};
