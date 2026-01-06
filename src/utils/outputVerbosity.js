'use strict';

// Verbosity levels from most to least verbose
// 'silent' is the most restrictive - suppresses ALL console output
// 'downloads' shows only PAGE events (download activity)
const OUTPUT_VERBOSITY_LEVELS = Object.freeze(['verbose', 'terse', 'downloads', 'extra-terse', 'silent']);
const DEFAULT_OUTPUT_VERBOSITY = OUTPUT_VERBOSITY_LEVELS[0];

const ALIAS_MAP = new Map([
  ['verbose', 'verbose'],
  ['full', 'verbose'],
  ['default', 'verbose'],
  ['standard', 'verbose'],
  ['normal', 'terse'],
  ['terse', 'terse'],
  ['compact', 'terse'],
  ['downloads', 'downloads'],
  ['downloads-only', 'downloads'],
  ['pages', 'downloads'],
  ['quiet', 'extra-terse'],
  ['minimal', 'extra-terse'],
  ['extra-terse', 'extra-terse'],
  ['extra_terse', 'extra-terse'],
  ['extraterse', 'extra-terse'],
  ['extra', 'extra-terse'],
  ['silent', 'silent'],
  ['none', 'silent'],
  ['off', 'silent']
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
  const normalized = normalizeOutputVerbosity(level);
  return normalized === 'extra-terse' || normalized === 'silent';
}

function isSilent(level) {
  return normalizeOutputVerbosity(level) === 'silent';
}

module.exports = {
  OUTPUT_VERBOSITY_LEVELS,
  DEFAULT_OUTPUT_VERBOSITY,
  normalizeOutputVerbosity,
  isExtraTerse,
  isSilent
};
