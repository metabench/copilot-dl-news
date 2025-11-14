'use strict';

const OUTPUT_VERBOSITY_LEVELS = Object.freeze(['verbose', 'terse', 'extra-terse']);
const DEFAULT_OUTPUT_VERBOSITY = OUTPUT_VERBOSITY_LEVELS[0];

const ALIAS_MAP = new Map([
  ['verbose', 'verbose'],
  ['full', 'verbose'],
  ['default', 'verbose'],
  ['standard', 'verbose'],
  ['normal', 'terse'],
  ['terse', 'terse'],
  ['compact', 'terse'],
  ['quiet', 'terse'],
  ['minimal', 'extra-terse'],
  ['silent', 'extra-terse'],
  ['extra-terse', 'extra-terse'],
  ['extra_terse', 'extra-terse'],
  ['extraterse', 'extra-terse'],
  ['extra', 'extra-terse']
]);

function normalizeOutputVerbosity(value, fallback = DEFAULT_OUTPUT_VERBOSITY) {
  if (value == null) {
    return fallback;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return fallback;
  }
  const normalized = trimmed.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
  const mapped = ALIAS_MAP.get(normalized);
  if (mapped) {
    return mapped;
  }
  return fallback;
}

function isExtraTerse(level) {
  return normalizeOutputVerbosity(level) === 'extra-terse';
}

module.exports = {
  OUTPUT_VERBOSITY_LEVELS,
  DEFAULT_OUTPUT_VERBOSITY,
  normalizeOutputVerbosity,
  isExtraTerse
};
