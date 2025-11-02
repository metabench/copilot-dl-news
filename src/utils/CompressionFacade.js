"use strict";

const coreCompression = require('./compression');
const compressionConfigModule = require('../config/compression');

const {
  compressionConfig,
  COMPRESSION_PRESETS,
  getCompressionType: getConfiguredCompressionType
} = compressionConfigModule;

const PRESETS = Object.freeze({ ...COMPRESSION_PRESETS });

const PRESET_DEFINITIONS = Object.freeze(
  Object.entries(compressionConfig.types).reduce((acc, [name, definition]) => {
    acc[name] = Object.freeze({
      algorithm: definition.algorithm,
      level: definition.level,
      windowBits: definition.windowBits ?? null,
      blockBits: definition.blockBits ?? null,
      description: definition.description ?? null
    });
    return acc;
  }, {})
);

const ALGORITHM_RANGES = Object.freeze({
  none: Object.freeze({ min: 0, max: 0, default: 0 }),
  gzip: Object.freeze({ min: 1, max: 9, default: 6 }),
  brotli: Object.freeze({ min: 0, max: 11, default: 6 }),
  zstd: Object.freeze({ min: 1, max: 22, default: 3 })
});

const DEFAULT_LEVELS = Object.freeze({
  none: ALGORITHM_RANGES.none.default,
  gzip: ALGORITHM_RANGES.gzip.default,
  brotli: ALGORITHM_RANGES.brotli.default,
  zstd: ALGORITHM_RANGES.zstd.default
});

const BROTLI_WINDOW_RANGE = Object.freeze([10, 24]);
const BROTLI_BLOCK_RANGE = Object.freeze([16, 24]);

function clamp(value, [min, max]) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  if (numeric < min) {
    return min;
  }
  if (numeric > max) {
    return max;
  }
  return numeric;
}

function resolvePresetName(preset) {
  if (!preset || typeof preset !== 'string') {
    return null;
  }

  if (PRESETS[preset]) {
    return PRESETS[preset];
  }

  const normalized = preset.toLowerCase();
  if (PRESET_DEFINITIONS[normalized]) {
    return normalized;
  }

  return null;
}

function getPreset(preset) {
  const name = resolvePresetName(preset);
  if (!name) {
    return null;
  }
  return PRESET_DEFINITIONS[name] || null;
}

function normalizeCompressionOptions(options = {}) {
  if (!options || typeof options !== 'object') {
    return normalizeCompressionOptions({});
  }

  const presetName = resolvePresetName(options.preset);
  const presetDefinition = presetName ? PRESET_DEFINITIONS[presetName] : null;

  const algorithm = presetDefinition?.algorithm || options.algorithm || 'gzip';
  const range = ALGORITHM_RANGES[algorithm];
  if (!range) {
    throw new Error(`Invalid compression algorithm: ${algorithm}. Use one of: ${Object.keys(ALGORITHM_RANGES).join(', ')}`);
  }

  const levelFallback = options.level ?? presetDefinition?.level ?? DEFAULT_LEVELS[algorithm];
  const level = clamp(levelFallback, [range.min, range.max]);

  const normalized = {
    algorithm,
    level
  };

  if (presetName) {
    normalized.preset = presetName;
  }

  const windowBits = options.windowBits ?? presetDefinition?.windowBits ?? null;
  if (windowBits != null && algorithm === 'brotli') {
    normalized.windowBits = clamp(windowBits, BROTLI_WINDOW_RANGE);
  }

  const blockBits = options.blockBits ?? presetDefinition?.blockBits ?? null;
  if (blockBits != null && algorithm === 'brotli') {
    normalized.blockBits = clamp(blockBits, BROTLI_BLOCK_RANGE);
  }

  if (options.sizeHint != null) {
    normalized.sizeHint = options.sizeHint;
  }

  return normalized;
}

function assertCompressionOptions(options = {}, label = 'compression options') {
  try {
    normalizeCompressionOptions(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} invalid: ${message}`);
  }
}

function createStatsObject(arg0, arg1, arg2, arg3) {
  if (arg0 && typeof arg0 === 'object' && !Buffer.isBuffer(arg0)) {
    const source = arg0;
    const compressed = source.compressed ?? null;
    const uncompressedSize = source.uncompressedSize ?? arg1 ?? 0;
    const compressedSize = source.compressedSize ?? (Buffer.isBuffer(compressed) ? compressed.length : 0);
    const ratio = source.ratio ?? (uncompressedSize > 0 ? compressedSize / uncompressedSize : 0);

    return {
      uncompressedSize,
      compressedSize,
      ratio,
      algorithm: source.algorithm ?? arg2 ?? null,
      sha256: source.sha256 ?? arg3 ?? null,
      preset: source.preset ?? null,
      timestamp: source.timestamp ?? new Date().toISOString()
    };
  }

  const compressed = arg0;
  const uncompressedSize = arg1 ?? 0;
  const compressedSize = Buffer.isBuffer(compressed) ? compressed.length : 0;
  const ratio = uncompressedSize > 0 ? compressedSize / uncompressedSize : 0;

  return {
    uncompressedSize,
    compressedSize,
    ratio,
    algorithm: arg2 ?? null,
    sha256: arg3 ?? null,
    preset: null,
    timestamp: new Date().toISOString()
  };
}

function compress(content, options = {}) {
  const normalized = normalizeCompressionOptions(options);
  const { preset, ...coreOptions } = normalized;
  const result = coreCompression.compress(content, coreOptions);

  return {
    ...result,
    preset: preset ?? null,
    timestamp: new Date().toISOString()
  };
}

function compressWithPreset(content, preset, options = {}) {
  return compress(content, { ...options, preset });
}

function decompress(compressedBuffer, algorithmOrOptions = 'gzip') {
  if (typeof algorithmOrOptions === 'object' && algorithmOrOptions !== null) {
    const normalized = normalizeCompressionOptions(algorithmOrOptions);
    return coreCompression.decompress(compressedBuffer, normalized.algorithm);
  }

  return coreCompression.decompress(compressedBuffer, algorithmOrOptions);
}

function getCompressionType(db, typeName) {
  if (!db) {
    throw new Error('CompressionFacade.getCompressionType requires a database connection');
  }
  if (!typeName) {
    throw new Error('CompressionFacade.getCompressionType requires a compression type name');
  }

  const lookupName = resolvePresetName(typeName) || typeName;
  return coreCompression.getCompressionType(db, lookupName);
}

function getCompressionConfigPreset(typeName) {
  const lookupName = resolvePresetName(typeName) || typeName;
  return getConfiguredCompressionType(lookupName);
}

function areCompressionOptionsEqual(options1 = {}, options2 = {}) {
  try {
    const norm1 = normalizeCompressionOptions(options1);
    const norm2 = normalizeCompressionOptions(options2);

    const sameAlgorithm = norm1.algorithm === norm2.algorithm;
    const sameLevel = norm1.level === norm2.level;
    const sameWindow = (norm1.windowBits ?? null) === (norm2.windowBits ?? null);
    const sameBlock = (norm1.blockBits ?? null) === (norm2.blockBits ?? null);

    return sameAlgorithm && sameLevel && sameWindow && sameBlock;
  } catch (_error) {
    return false;
  }
}

function describePreset(preset) {
  const resolvedName = resolvePresetName(preset);
  if (!resolvedName) {
    return `Unknown preset: ${preset}`;
  }

  const definition = PRESET_DEFINITIONS[resolvedName];
  if (definition?.description) {
    return definition.description;
  }

  const algorithm = definition.algorithm.charAt(0).toUpperCase() + definition.algorithm.slice(1);
  return `${algorithm} level ${definition.level}`;
}

function compressAndStore(db, content, options = {}) {
  return coreCompression.compressAndStore(db, content, options);
}

function retrieveAndDecompress(db, contentId) {
  return coreCompression.retrieveAndDecompress(db, contentId);
}

function selectCompressionType(db, contentSize, useCase = 'balanced') {
  return coreCompression.selectCompressionType(db, contentSize, useCase);
}

module.exports = {
  PRESETS,
  PRESET_DEFINITIONS,
  ALGORITHM_RANGES,
  COMPRESSION_PRESETS: PRESETS,
  DEFAULT_LEVELS,
  normalizeCompressionOptions,
  assertCompressionOptions,
  compress,
  compressWithPreset,
  decompress,
  getCompressionType,
  getCompressionConfigPreset,
  createStatsObject,
  areCompressionOptionsEqual,
  describePreset,
  selectCompressionType,
  compressAndStore,
  retrieveAndDecompress,
  resolvePresetName,
  getPreset
};
