#!/usr/bin/env node
'use strict';

// Fix PowerShell encoding for Unicode box-drawing characters
const { setupPowerShellEncoding } = require('./shared/powershellEncoding');
setupPowerShellEncoding();

const path = require('path');
const { CliFormatter } = require('../../src/utils/CliFormatter');
const { CliArgumentParser } = require('../../src/utils/CliArgumentParser');
const {
  parseModule,
  collectFunctions,
  collectVariables,
  extractCode,
  replaceSpan,
  createSpanKey,
  createDigest,
  HASH_PRIMARY_ENCODING,
  HASH_FALLBACK_ENCODING,
  HASH_LENGTH_BY_ENCODING
} = require('./lib/swcAst');
const contextOperations = require('./js-edit/operations/context');
const mutationOperations = require('./js-edit/operations/mutation');
const discoveryOperations = require('./js-edit/operations/discovery');
const {
  computeNewlineStats,
  createNewlineGuard,
  prepareNormalizedSnippet
} = require('./js-edit/shared/newline');
const {
  readSource,
  loadReplacementSource,
  writeOutputFile,
  outputJson
} = require('./js-edit/shared/io');
const { getReplacementSource } = require('./js-edit/shared/replacement');
const { applyRenameToSnippet } = require('./js-edit/shared/rename');
const {
  LIST_OUTPUT_ENV_VAR,
  LIST_OUTPUT_STYLES,
  DEFAULT_LIST_OUTPUT_STYLE
} = require('./js-edit/shared/constants');

const fmt = new CliFormatter();
const DEFAULT_CONTEXT_PADDING = 512;
const DEFAULT_PREVIEW_CHARS = 240;
const DEFAULT_SEARCH_LIMIT = 20;
const DEFAULT_SEARCH_CONTEXT = 60;

const CONTEXT_ENCLOSING_MODES = new Set(['exact', 'class', 'function']);
const VARIABLE_TARGET_MODES = new Set(['binding', 'declarator', 'declaration']);

const HASH_CHARSETS = Object.freeze({
  base64: /^[A-Za-z0-9+/]+$/,
  hex: /^[0-9a-f]+$/i
});

function formatHashDescriptor(encodings) {
  return encodings
    .map((encoding) => {
      const length = HASH_LENGTH_BY_ENCODING[encoding];
      if (!length) return null;
      const label = encoding === 'hex' ? 'base16' : encoding;
      return `${label} (${length} chars)`;
    })
    .filter(Boolean)
    .join(' or ');
}

function isValidExpectedHash(value, encodings) {
  if (typeof value !== 'string' || value.length === 0) return false;
  return encodings.some((encoding) => {
    const length = HASH_LENGTH_BY_ENCODING[encoding];
    const pattern = HASH_CHARSETS[encoding];
    return typeof length === 'number' && length > 0 && pattern?.test(value) && value.length === length;
  });
}

function extractFunctionsByHashes(options, source, functionRecords) {
  const hashes = Array.isArray(options.extractHashes) ? options.extractHashes : [];
  if (hashes.length === 0) {
    throw new Error('--extract-hashes requires at least one hash value.');
  }

  if (options.outputPath) {
    throw new Error('--output is not supported with --extract-hashes. Run --extract <selector> for single-target output.');
  }

  const hashIndex = new Map();
  functionRecords.forEach((record) => {
    if (!record.hash) {
      return;
    }
    if (!hashIndex.has(record.hash)) {
      hashIndex.set(record.hash, []);
    }
    hashIndex.get(record.hash).push(record);
  });

  const results = hashes.map((hash) => {
    const candidates = hashIndex.get(hash) || [];
    if (candidates.length === 0) {
      throw new Error(`No functions found for hash "${hash}". Run --list-functions --json to inspect available hashes.`);
    }
    if (candidates.length > 1) {
      const names = candidates.map((candidate) => candidate.canonicalName || candidate.name || '(anonymous)');
      throw new Error(`Hash "${hash}" matched multiple functions: ${names.join(', ')}. Use --locate with --select-path to disambiguate.`);
    }

    const record = candidates[0];
    const code = extractCode(source, record.span, options.sourceMapper);
    return { hash, record, code };
  });

  const selectorLabel = hashes.join(',');
  const plan = contextOperations.maybeEmitPlan(
    'extract-hashes',
    options,
    selectorLabel,
    results.map((entry) => entry.record),
    results.map((entry) => entry.hash),
    results.map((entry) => entry.record.span)
  );

  const payload = {
    file: options.filePath,
    hashes,
    matchCount: results.length,
    results: results.map((entry) => ({
      hash: entry.hash,
      function: {
        name: entry.record.name,
        canonicalName: entry.record.canonicalName,
        kind: entry.record.kind,
        line: entry.record.line,
        column: entry.record.column,
        exportKind: entry.record.exportKind,
        replaceable: entry.record.replaceable,
        pathSignature: entry.record.pathSignature,
        hash: entry.record.hash
      },
      code: entry.code
    }))
  };

  if (plan) {
    payload.plan = plan;
  }

  if (options.json) {
    outputJson(payload);
    return;
  }

  if (options.quiet) {
    return;
  }

  fmt.header('Hash Extraction');
  fmt.stat('Requested hashes', hashes.length, 'number');
  fmt.stat('Matches', results.length, 'number');

  results.forEach((entry, index) => {
    const fn = entry.record;
    const title = `Match ${index + 1}: ${fn.canonicalName || fn.name} [${entry.hash}]`;
    fmt.section(title);
    fmt.stat('Kind', fn.kind);
    if (fn.exportKind) fmt.stat('Export', fn.exportKind);
    fmt.stat('Location', `${fn.line}:${fn.column}`);
    if (fn.pathSignature) fmt.stat('Path', fn.pathSignature);
    fmt.stat('Replaceable', fn.replaceable ? 'yes' : 'no');
    fmt.section('Source');
    process.stdout.write(`${entry.code}\n`);
  });

  if (options.emitPlanPath) {
    fmt.info(`Plan written to ${options.emitPlanPath}`);
  }

  fmt.footer();
}


function toReadableScope(scopeChain) {
  if (!Array.isArray(scopeChain) || scopeChain.length === 0) return '-';
  return scopeChain.join(' > ');
}

function createPreviewSnippet(snippet, requestedLimit) {
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.floor(requestedLimit)
    : DEFAULT_PREVIEW_CHARS;

  if (typeof snippet !== 'string' || snippet.length === 0) {
    return {
      text: '',
      truncated: false,
      totalChars: 0,
      limit
    };
  }

  if (snippet.length <= limit) {
    return {
      text: snippet,
      truncated: false,
      totalChars: snippet.length,
      limit
    };
  }

  let preview = snippet.slice(0, limit);
  if (!preview.endsWith('\n')) {
    preview = `${preview}\n`;
  }
  preview = `${preview}...`;

  return {
    text: preview,
    truncated: true,
    totalChars: snippet.length,
    limit
  };
}

function buildLineIndex(source) {
  const offsets = [0];
  if (typeof source !== 'string' || source.length === 0) {
    return offsets;
  }

  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if (code === 10) {
      offsets.push(index + 1);
    } else if (code === 13) {
      if (source.charCodeAt(index + 1) === 10) {
        offsets.push(index + 2);
        index += 1;
      } else {
        offsets.push(index + 1);
      }
    }
  }

  return offsets;
}

function positionFromIndex(index, lineOffsets) {
  if (!Array.isArray(lineOffsets) || lineOffsets.length === 0) {
    return { line: 1, column: index + 1 };
  }

  let low = 0;
  let high = lineOffsets.length - 1;
  let result = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const offset = lineOffsets[mid];
    if (offset <= index) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const lineStart = lineOffsets[result] || 0;
  return {
    line: result + 1,
    column: index - lineStart + 1
  };
}

function spanContains(span, index) {
  return span
    && typeof span.start === 'number'
    && typeof span.end === 'number'
    && index >= span.start
    && index < span.end;
}

function buildSearchSnippet(source, start, end, contextChars) {
  const limit = Number.isFinite(contextChars) && contextChars >= 0
    ? Math.floor(contextChars)
    : DEFAULT_SEARCH_CONTEXT;

  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(safeStart, end);
  const beforeStart = Math.max(0, safeStart - limit);
  const afterEnd = Math.min(source.length, safeEnd + limit);

  const before = source.slice(beforeStart, safeStart);
  const match = source.slice(safeStart, safeEnd);
  const after = source.slice(safeEnd, afterEnd);

  const truncatedBefore = beforeStart > 0;
  const truncatedAfter = afterEnd < source.length;
  const highlightPrefix = '<<<';
  const highlightSuffix = '>>>';
  const highlighted = `${truncatedBefore ? '...' : ''}${before}${highlightPrefix}${match}${highlightSuffix}${after}${truncatedAfter ? '...' : ''}`;

  return {
    before,
    match,
    after,
    truncatedBefore,
    truncatedAfter,
    highlighted,
    range: {
      start: beforeStart,
      end: afterEnd
    }
  };
}

function findFunctionOwner(functionRecords, index) {
  if (!Array.isArray(functionRecords)) {
    return null;
  }

  for (const record of functionRecords) {
    if (spanContains(record.span, index)) {
      return record;
    }
  }

  return null;
}

function findVariableOwner(variableRecords, index) {
  if (!Array.isArray(variableRecords)) {
    return null;
  }

  for (const record of variableRecords) {
    const targetSpan = record?.resolvedTargets && record.resolvedTargets.length > 0
      ? record.resolvedTargets[0]?.span
      : record.span;
    if (spanContains(targetSpan, index)) {
      return record;
    }
  }

  return null;
}

function buildFunctionSelectorSet(fn) {
  const selectors = new Set();
  const add = (value, { lower = true } = {}) => {
    if (typeof value !== 'string') {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    selectors.add(trimmed);
    if (lower) {
      selectors.add(trimmed.toLowerCase());
    }
  };

  add(fn.name);
  add(fn.canonicalName);
  if (fn.canonicalName && fn.canonicalName !== fn.name) {
    add(`name:${fn.canonicalName}`);
  }

  if (fn.pathSignature) {
    add(fn.pathSignature);
    add(`path:${fn.pathSignature}`);
  }

  if (fn.hash) {
    add(fn.hash);
    add(`hash:${fn.hash}`);
  }

  if (Array.isArray(fn.scopeChain) && fn.scopeChain.length > 0) {
    const scopeLabel = fn.scopeChain.join(' > ');
    add(scopeLabel);

    const withoutExports = fn.scopeChain.filter((segment) => segment !== 'exports');
    if (withoutExports.length > 0) {
      add(withoutExports.join(' > '));

      const [owner, descriptor, ...rest] = withoutExports;
      if (owner) {
        if (descriptor && descriptor.startsWith('#')) {
          const method = descriptor.slice(1);
          if (method) {
            add(`${owner}#${method}`);
            add(`${owner}::${method}`);
          }
        } else if (descriptor === 'static') {
          const staticTarget = rest[0];
          if (staticTarget) {
            add(`${owner}.${staticTarget}`);
            add(`${owner}::${staticTarget}`);
          }
        } else if (descriptor === 'get' || descriptor === 'set') {
          const property = rest[0];
          if (property) {
            add(`${owner}::${property}`);
          }
        } else if (descriptor) {
          add(`${owner}.${descriptor}`);
          add(`${owner}#${descriptor}`);
        }

        if (withoutExports.length >= 3) {
          add(`${owner} > ${withoutExports.slice(1).join(' > ')}`);
        }
      }
    }
  }

  return selectors;
}

function buildFunctionRecords(functions) {
  return functions.map((fn, index) => ({
    ...fn,
    index,
    selectorType: 'function',
    selectors: buildFunctionSelectorSet(fn)
  }));
}

function buildVariableSelectorSet(variable) {
  const selectors = new Set();
  const add = (value, { lower = true } = {}) => {
    if (typeof value !== 'string') {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    selectors.add(trimmed);
    if (lower) {
      selectors.add(trimmed.toLowerCase());
    }
  };

  add(variable.name);

  if (variable.hash) {
    add(variable.hash);
    add(`hash:${variable.hash}`);
  }

  if (variable.declaratorHash && variable.declaratorHash !== variable.hash) {
    add(variable.declaratorHash);
    add(`hash:${variable.declaratorHash}`);
    add(`declarator-hash:${variable.declaratorHash}`);
  }

  if (variable.declarationHash
    && variable.declarationHash !== variable.hash
    && variable.declarationHash !== variable.declaratorHash) {
    add(variable.declarationHash);
    add(`hash:${variable.declarationHash}`);
    add(`declaration-hash:${variable.declarationHash}`);
  }

  const pathCandidates = [
    variable.pathSignature,
    variable.declaratorPathSignature,
    variable.declarationPathSignature
  ].filter((candidate, index, array) => typeof candidate === 'string' && candidate.length > 0 && array.indexOf(candidate) === index);

  pathCandidates.forEach((candidate) => {
    add(candidate, { lower: false });
    add(`path:${candidate}`, { lower: false });
  });

  if (Array.isArray(variable.scopeChain) && variable.scopeChain.length > 0) {
    const scopeLabel = variable.scopeChain.join(' > ');
    add(scopeLabel);
    add(`${scopeLabel} > ${variable.name}`);
    const owner = variable.scopeChain[0];
    if (owner) {
      add(`${owner}.${variable.name}`);
      add(`${owner}#${variable.name}`);
      add(`${owner} > ${variable.name}`);
    }
  }

  return selectors;
}

function buildVariableRecords(variables) {
  return variables.map((variable, index) => {
    const scopeLabel = Array.isArray(variable.scopeChain) && variable.scopeChain.length > 0
      ? variable.scopeChain.join(' > ')
      : null;
    const canonicalName = scopeLabel ? `${scopeLabel} > ${variable.name}` : variable.name;
    return {
      ...variable,
      index,
      selectorType: 'variable',
      canonicalName,
      selectors: buildVariableSelectorSet(variable)
    };
  });
}

const SELECTOR_TYPE_PREFIXES = new Map([
  ['function', 'function'],
  ['variable', 'variable']
]);

const BOOLEAN_TRUE_VALUES = new Set(['true', '1', 'yes', 'y']);
const BOOLEAN_FALSE_VALUES = new Set(['false', '0', 'no', 'n']);

function parseSelectorExpression(rawSelector) {
  const original = typeof rawSelector === 'string' ? rawSelector : '';
  const trimmed = original.trim();
  if (!trimmed) {
    return {
      raw: original,
      base: '',
      type: null,
      filters: []
    };
  }

  let remainder = trimmed;
  let type = null;

  const prefixMatch = remainder.match(/^(function|variable)\s*:/i);
  if (prefixMatch) {
    const normalized = prefixMatch[1].toLowerCase();
    type = SELECTOR_TYPE_PREFIXES.get(normalized) || null;
    remainder = remainder.slice(prefixMatch[0].length);
  }

  const parts = remainder.split('@');
  const base = parts.shift().trim();
  const filters = parts
    .map((token) => parseSelectorFilter(token))
    .filter(Boolean);

  return {
    raw: original,
    base,
    type,
    filters
  };
}

function parseSelectorFilter(token) {
  const trimmed = typeof token === 'string' ? token.trim() : '';
  if (!trimmed) {
    return null;
  }

  const simpleRange = trimmed.match(/^(\d+)(?:-(\d+))?$/);
  if (simpleRange) {
    const range = parseNumericRange('range', simpleRange[1], simpleRange[2]);
    return {
      kind: 'charRange',
      start: range.start,
      end: range.end
    };
  }

  const eqIndex = trimmed.indexOf('=');
  let key;
  let value;
  if (eqIndex === -1) {
    key = trimmed.toLowerCase();
    value = null;
  } else {
    key = trimmed.slice(0, eqIndex).trim().toLowerCase();
    value = trimmed.slice(eqIndex + 1).trim();
  }

  switch (key) {
    case 'range': {
      if (!value) {
        throw new Error('Selector filter "@range" requires a value (e.g., @range=120-150).');
      }
      const range = parseNumericRange('range', value);
      return {
        kind: 'charRange',
        start: range.start,
        end: range.end
      };
    }
    case 'bytes': {
      if (!value) {
        throw new Error('Selector filter "@bytes" requires a value (e.g., @bytes=400-440).');
      }
      const range = parseNumericRange('bytes', value);
      return {
        kind: 'byteRange',
        start: range.start,
        end: range.end
      };
    }
    case 'kind': {
      if (!value) {
        throw new Error('Selector filter "@kind" requires a value.');
      }
      return {
        kind: 'kind',
        values: parseListValue(value)
      };
    }
    case 'export': {
      if (!value) {
        throw new Error('Selector filter "@export" requires a value.');
      }
      return {
        kind: 'export',
        values: parseListValue(value)
      };
    }
    case 'hash': {
      if (!value) {
        throw new Error('Selector filter "@hash" requires a value.');
      }
      return {
        kind: 'hash',
        values: parseListValue(value)
      };
    }
    case 'path': {
      if (!value) {
        throw new Error('Selector filter "@path" requires a value.');
      }
      return {
        kind: 'path',
        values: parseListValue(value, false)
      };
    }
    case 'replaceable': {
      const boolValue = value === null ? true : parseBooleanFilterValue(value, 'replaceable');
      return {
        kind: 'replaceable',
        value: boolValue
      };
    }
    default: {
      throw new Error(`Unknown selector filter "@${trimmed}".`);
    }
  }
}

function parseNumericRange(label, firstValue, secondValue = null) {
  let startRaw = firstValue;
  let endRaw = secondValue;

  if (secondValue === null && typeof firstValue === 'string' && firstValue.includes('-')) {
    const parts = firstValue.split('-');
    if (parts.length > 2) {
      throw new Error(`Invalid ${label} range "${firstValue}". Use start-end or single offset.`);
    }
    [startRaw, endRaw] = parts;
  }

  const start = Number.parseInt(startRaw, 10);
  const end = endRaw !== undefined && endRaw !== null && endRaw !== ''
    ? Number.parseInt(endRaw, 10)
    : null;

  if (!Number.isFinite(start) || start < 0) {
    throw new Error(`Invalid ${label} range. Start must be a non-negative integer.`);
  }

  if (end !== null) {
    if (!Number.isFinite(end) || end < start) {
      throw new Error(`Invalid ${label} range. End must be a non-negative integer greater than or equal to start.`);
    }
  }

  return { start, end };
}

function parseListValue(raw, normalize = true) {
  return raw
    .split(/[|,]/)
    .map((value) => (normalize ? value.trim().toLowerCase() : value.trim()))
    .filter((value) => value.length > 0);
}

function parseBooleanFilterValue(raw, label) {
  const normalized = raw.trim().toLowerCase();
  if (BOOLEAN_TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (BOOLEAN_FALSE_VALUES.has(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean value "${raw}" for selector filter "@${label}".`);
}

function buildSelectorCandidates(base) {
  if (typeof base !== 'string') {
    return [];
  }

  const trimmed = base.trim();
  if (!trimmed) {
    return [];
  }

  const candidates = new Set();
  const add = (value, { lower = true } = {}) => {
    if (typeof value !== 'string') {
      return;
    }
    const candidate = value.trim();
    if (!candidate) {
      return;
    }
    candidates.add(candidate);
    if (lower) {
      candidates.add(candidate.toLowerCase());
    }
  };

  add(trimmed);

  if (trimmed.startsWith('hash:')) {
    add(trimmed.slice(5));
  } else if (trimmed.startsWith('path:')) {
    add(trimmed.slice(5), { lower: false });
  }

  if (trimmed.includes('::')) {
    add(trimmed.replace(/::/g, '.'), { lower: false });
    add(trimmed.replace(/::/g, '#'), { lower: false });
  }

  if (trimmed.includes('#')) {
    add(trimmed.replace(/#/g, '.'), { lower: false });
    add(trimmed.replace(/#/g, '::'), { lower: false });
  }

  if (trimmed.includes('.')) {
    add(trimmed.replace(/\./g, ' > '), { lower: false });
  }

  if (trimmed.includes(' > ')) {
    const collapsed = trimmed.replace(/\s*>\s*/g, '.');
    add(collapsed, { lower: false });
    add(trimmed.replace(/\s*>\s*/g, '#'), { lower: false });
  }
  return Array.from(candidates);
}

function matchRecordsByCandidates(records, candidates) {
  if (!Array.isArray(records) || !Array.isArray(candidates)) {
    return [];
  }

  const normalizedCandidates = candidates
    .map((candidate) => (typeof candidate === 'string' ? candidate.trim() : ''))
    .filter((candidate) => candidate.length > 0);

  if (normalizedCandidates.length === 0) {
    return [];
  }

  const canonicalMatches = new Set();
  const allMatches = new Set();

  const candidateTargets = (candidate) => {
    const trimmed = candidate.trim();
    if (!trimmed) {
      return [];
    }
    if (trimmed.startsWith('function:')) {
      return [trimmed.slice('function:'.length).trim()];
    }
    return [trimmed];
  };

  for (const record of records) {
    if (!record || typeof record !== 'object') {
      continue;
    }
    const selectors = record.selectors;
    if (!selectors || typeof selectors.has !== 'function') {
      continue;
    }

    for (const candidate of normalizedCandidates) {
      if (!selectors.has(candidate) && !selectors.has(candidate.toLowerCase())) {
        continue;
      }
      allMatches.add(record);

      if (!record.canonicalName) {
        continue;
      }
      const targets = candidateTargets(candidate);
      if (targets.some((target) => target && target === record.canonicalName)) {
        canonicalMatches.add(record);
      }
    }
  }

  const preferred = canonicalMatches.size > 0 ? canonicalMatches : allMatches;
  return Array.from(preferred);
}

function findMatchesForSelector(records, selector, options = {}, context = {}) {
  if (!Array.isArray(records)) {
    return [];
  }

  const expression = parseSelectorExpression(selector || '');
  const targetType = expression.type;
  const pool = targetType
    ? records.filter((record) => record.selectorType === targetType)
    : records;

  const candidates = buildSelectorCandidates(expression.base);
  let matches;

  if (candidates.length > 0) {
    matches = matchRecordsByCandidates(pool, candidates);
  } else if (expression.filters.length > 0 || context.allowEmptyBase === true) {
    matches = pool.slice();
  } else {
    matches = [];
  }

  if (expression.filters.length > 0 && matches.length > 0) {
    matches = matches.filter((record) => recordMatchesFilters(record, expression.filters));
  }

  return matches;
}

function filterMatchesByHash(matches, hashValue) {
  const normalized = typeof hashValue === 'string' ? hashValue.trim().toLowerCase() : '';
  if (!normalized) {
    return matches;
  }
  return matches.filter((record) => collectHashCandidates(record).includes(normalized));
}

function filterMatchesByPath(matches, pathValue) {
  const normalized = typeof pathValue === 'string' ? pathValue.trim() : '';
  if (!normalized) {
    return matches;
  }
  return matches.filter((record) => {
    if (record.selectorType === 'variable') {
      return variableRecordMatchesPath(record, normalized);
    }
    return typeof record.pathSignature === 'string' && record.pathSignature === normalized;
  });
}

function ensureSingleMatch(matches, selector, options, context) {
  const allowMultiple = Boolean(options.allowMultiple) || Boolean(context?.allowMultiple);
  if (allowMultiple || matches.length <= 1) {
    return matches;
  }

  const names = matches.slice(0, 5).map((record) => record.canonicalName || record.name || '(anonymous)');
  throw new Error(
    `Selector "${selector}" matched ${matches.length} targets (${names.join(', ')}). `
    + 'Refine the selector or pass --allow-multiple to operate on all matches.'
  );
}

function resolveMatches(records, selector, options, context = {}) {
  const matches = findMatchesForSelector(records, selector, options, context);
  if (!matches || matches.length === 0) {
    const label = context.operation ? `${context.operation} selector` : 'selector';
    throw new Error(`No matches found for ${label} "${selector}".`);
  }

  let filtered = matches;
  filtered = filterMatchesByHash(filtered, options.selectHash);
  filtered = filterMatchesByPath(filtered, options.selectPath);

  if (filtered.length === 0) {
    throw new Error('Selection guards did not match any targets. Refine the selector or adjust --select arguments.');
  }

  if (options.selectIndex) {
    const index = Number(options.selectIndex);
    if (!Number.isInteger(index) || index <= 0) {
      throw new Error('--select requires a positive integer index.');
    }
    if (index > filtered.length) {
      throw new Error(`--select ${index} exceeds match count (${filtered.length}).`);
    }
    filtered = [filtered[index - 1]];
  }

  return ensureSingleMatch(filtered, selector, options, context);
}

function resolveVariableMatches(variableRecords, selector, options, context = {}) {
  const matches = findMatchesForSelector(variableRecords, selector, options, context);
  if (!matches || matches.length === 0) {
    const label = context.operation ? `${context.operation} selector` : 'selector';
    throw new Error(`No variable matches found for ${label} "${selector}".`);
  }

  let filtered = matches;
  filtered = filterMatchesByHash(filtered, options.selectHash);
  filtered = filterMatchesByPath(filtered, options.selectPath);

  if (filtered.length === 0) {
    throw new Error('Selection guards did not match any variable targets. Refine the selector or adjust --select arguments.');
  }

  if (options.selectIndex) {
    const index = Number(options.selectIndex);
    if (!Number.isInteger(index) || index <= 0) {
      throw new Error('--select requires a positive integer index.');
    }
    if (index > filtered.length) {
      throw new Error(`--select ${index} exceeds match count (${filtered.length}).`);
    }
    filtered = [filtered[index - 1]];
  }

  return ensureSingleMatch(filtered, selector, options, context);
}
function recordMatchesFilter(record, filter) {
  switch (filter.kind) {
    case 'charRange':
      return recordMatchesRange(record, filter.start, filter.end, 'chars');
    case 'byteRange':
      return recordMatchesRange(record, filter.start, filter.end, 'bytes');
    case 'kind':
      return filter.values.length === 0 || filter.values.includes(normalizeString(record.kind));
    case 'export': {
      const exportValue = record.exportKind ? record.exportKind.toLowerCase() : 'none';
      return filter.values.includes(exportValue);
    }
    case 'hash': {
      const candidates = collectHashCandidates(record);
      return filter.values.some((value) => candidates.includes(value.toLowerCase()));
    }
    case 'path': {
      const candidates = collectPathCandidates(record);
      return filter.values.some((value) => candidates.includes(value));
    }
    case 'replaceable':
      return Boolean(record.replaceable) === filter.value;
    default:
      return false;
  }
}

function recordMatchesFilters(record, filters) {
  if (!Array.isArray(filters) || filters.length === 0) {
    return true;
  }
  return filters.every((filter) => recordMatchesFilter(record, filter));
}

function recordMatchesRange(record, start, end, units) {
  const span = resolvePrimarySpan(record);
  if (!span) {
    return false;
  }

  const startKey = units === 'bytes' ? 'byteStart' : 'start';
  const endKey = units === 'bytes' ? 'byteEnd' : 'end';

  const spanStart = typeof span[startKey] === 'number' ? span[startKey] : null;
  const spanEnd = typeof span[endKey] === 'number' ? span[endKey] : null;
  if (spanStart === null || spanEnd === null) {
    return false;
  }

  const effectiveEnd = end !== null ? end : start;
  return spanStart <= start && spanEnd >= effectiveEnd;
}

function resolvePrimarySpan(record) {
  if (isSpanLike(record.declarationSpan)) {
    return record.declarationSpan;
  }
  if (isSpanLike(record.declaratorSpan)) {
    return record.declaratorSpan;
  }
  if (isSpanLike(record.span)) {
    return record.span;
  }
  return null;
}

function isSpanLike(span) {
  return span && typeof span.start === 'number' && typeof span.end === 'number';
}

function normalizeString(value) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function collectHashCandidates(record) {
  const values = [record.hash, record.declaratorHash, record.declarationHash];
  return values
    .filter((value) => typeof value === 'string' && value.length > 0)
    .map((value) => value.toLowerCase());
}

function collectPathCandidates(record) {
  const values = [record.pathSignature, record.declaratorPathSignature, record.declarationPathSignature];
  return values.filter((value) => typeof value === 'string' && value.length > 0);
}

function variableRecordMatchesPath(record, pathSignature) {
  if (!pathSignature) {
    return false;
  }

  return [
    record.declaratorPathSignature,
    record.pathSignature,
    record.declarationPathSignature
  ].some((candidate) => typeof candidate === 'string' && candidate === pathSignature);
}

function getConfiguredHashEncodings() {
  const encodings = new Set([HASH_PRIMARY_ENCODING, HASH_FALLBACK_ENCODING]);
  return Array.from(encodings).filter((encoding) => HASH_LENGTH_BY_ENCODING[encoding]);
}

function resolveVariableTargetInfo(record, requestedMode = 'declarator') {
  const modeValue = typeof requestedMode === 'string' ? requestedMode.trim().toLowerCase() : 'declarator';
  const normalizedMode = VARIABLE_TARGET_MODES.has(modeValue) ? modeValue : 'declarator';

  const cloneSpan = (span) => {
    if (!span || typeof span.start !== 'number' || typeof span.end !== 'number' || span.end <= span.start) {
      return null;
    }
    const clone = {
      start: span.start,
      end: span.end
    };
    if (typeof span.byteStart === 'number') {
      clone.byteStart = span.byteStart;
    }
    if (typeof span.byteEnd === 'number') {
      clone.byteEnd = span.byteEnd;
    }
    if (span.__normalized === true) {
      clone.__normalized = true;
    }
    return clone;
  };

  const candidateOrder = normalizedMode === 'binding'
    ? ['binding', 'declarator', 'declaration']
    : normalizedMode === 'declaration'
      ? ['declaration', 'declarator', 'binding']
      : ['declarator', 'binding', 'declaration'];

  const resolveCandidate = (candidate) => {
    let sourceSpan = null;
    let hash = null;
    let pathSignature = null;
    let byteLength = null;

    switch (candidate) {
      case 'binding':
        sourceSpan = record.span || null;
        hash = record.hash || null;
        pathSignature = record.pathSignature || null;
        byteLength = typeof record.byteLength === 'number'
          ? record.byteLength
          : null;
        break;
      case 'declarator':
        sourceSpan = record.declaratorSpan || record.span || null;
        hash = record.declaratorHash || record.hash || null;
        pathSignature = record.declaratorPathSignature || record.pathSignature || null;
        byteLength = typeof record.declaratorByteLength === 'number'
          ? record.declaratorByteLength
          : null;
        break;
      case 'declaration':
        sourceSpan = record.declarationSpan || record.declaratorSpan || record.span || null;
        hash = record.declarationHash || record.declaratorHash || record.hash || null;
        pathSignature = record.declarationPathSignature || record.declaratorPathSignature || record.pathSignature || null;
        byteLength = typeof record.declarationByteLength === 'number'
          ? record.declarationByteLength
          : null;
        break;
      default:
        return {
          span: null,
          hash: null,
          pathSignature: null,
          byteLength: null
        };
    }

    return {
      span: cloneSpan(sourceSpan),
      hash,
      pathSignature,
      byteLength
    };
  };

  for (const candidate of candidateOrder) {
    const { span, hash, pathSignature, byteLength } = resolveCandidate(candidate);
    if (!span || typeof span.start !== 'number' || typeof span.end !== 'number' || span.end <= span.start) {
      continue;
    }

    const normalizedSpan = span;
    const resolvedHash = hash || record.hash || null;
    if (!resolvedHash) {
      continue;
    }

    const resolvedPath = pathSignature || record.pathSignature || null;
    const resolvedByteLength = typeof byteLength === 'number'
      ? byteLength
      : typeof normalizedSpan.byteStart === 'number' && typeof normalizedSpan.byteEnd === 'number'
        ? Math.max(0, normalizedSpan.byteEnd - normalizedSpan.byteStart)
        : Math.max(0, normalizedSpan.end - normalizedSpan.start);

    return {
      requestedMode: normalizedMode,
      mode: candidate,
      span: normalizedSpan,
      hash: resolvedHash,
      pathSignature: resolvedPath,
      byteLength: resolvedByteLength
    };
  }

  const label = record.canonicalName || record.name || '(anonymous variable)';
  throw new Error(`Unable to resolve a ${normalizedMode} span for variable "${label}".`);
}

function buildSearchSuggestionsForMatch({ matchIndex, query, functionOwner, variableOwner, options }) {
  const limit = Math.max(1, Math.min(20, options.searchLimit || 20));
  const contextChars = Math.max(0, options.searchContext || 60);

  const escapeRegex = (text) => {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  const queryParts = query
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => escapeRegex(part));

  const functionName = functionOwner ? functionOwner.name || '' : '';
  const variableName = variableOwner ? variableOwner.name || '' : '';

  const functionNameMatch = functionName
    ? queryParts.some((part) => functionName.toLowerCase().includes(part.toLowerCase()))
    : false;
  const variableNameMatch = variableName
    ? queryParts.some((part) => variableName.toLowerCase().includes(part.toLowerCase()))
    : false;

  const isExactMatch = functionOwner?.canonicalName === query || variableOwner?.canonicalName === query;
  const isHashMatch = /^hash:[A-Fa-f0-9]+$/.test(query);

  const suggestions = [];

  if (functionOwner && !isExactMatch && !isHashMatch) {
    suggestions.push({
      type: 'function',
      label: functionOwner.canonicalName || functionOwner.name,
      kind: functionOwner.kind,
      line: functionOwner.line,
      column: functionOwner.column,
      exportKind: functionOwner.exportKind,
      replaceable: functionOwner.replaceable,
      pathSignature: functionOwner.pathSignature,
      hash: functionOwner.hash,
      matchIndex: matchIndex + 1
    });
  }

  if (variableOwner && !isExactMatch && !isHashMatch) {
    suggestions.push({
      type: 'variable',
      label: variableOwner.canonicalName || variableOwner.name,
      kind: variableOwner.kind,
      line: variableOwner.line,
      column: variableOwner.column,
      exportKind: variableOwner.exportKind,
      replaceable: variableOwner.replaceable,
      pathSignature: variableOwner.pathSignature,
      hash: variableOwner.hash,
      matchIndex: matchIndex + 1
    });
  }

  if (functionNameMatch || variableNameMatch) {
    const baseType = functionOwner ? 'function' : 'variable';
    const baseName = functionOwner ? functionOwner.name : variableOwner.name;
    const baseHash = functionOwner ? functionOwner.hash : variableOwner.hash;
    const basePath = functionOwner ? functionOwner.pathSignature : variableOwner.pathSignature;

    suggestions.unshift({
      type: baseType,
      label: baseName,
      kind: baseType === 'function' ? functionOwner.kind : variableOwner.kind,
      line: baseType === 'function' ? functionOwner.line : variableOwner.line,
      column: baseType === 'function' ? functionOwner.column : variableOwner.column,
      exportKind: baseType === 'function' ? functionOwner.exportKind : variableOwner.exportKind,
      replaceable: baseType === 'function' ? functionOwner.replaceable : variableOwner.replaceable,
      pathSignature: basePath,
      hash: baseHash,
      matchIndex: 0
    });
  }

  return suggestions;
}

function normalizeOptions(raw) {
  const resolved = { ...raw };

  const fileInput = resolved.file ? String(resolved.file).trim() : '';
  if (!fileInput) {
    throw new Error('Missing required option: --file <path>');
  }

  const filePath = path.isAbsolute(fileInput)
    ? fileInput
    : path.resolve(process.cwd(), fileInput);

  const includePaths = Boolean(resolved.includePaths);
  const functionSummary = Boolean(resolved.functionSummary);
  const rawListOutput = resolved.listOutput !== undefined && resolved.listOutput !== null
    ? String(resolved.listOutput).trim()
    : '';
  const envListOutput = process.env[LIST_OUTPUT_ENV_VAR]
    ? String(process.env[LIST_OUTPUT_ENV_VAR]).trim()
    : '';
  let listOutputStyle = DEFAULT_LIST_OUTPUT_STYLE;
  let listOutputProvided = false;

  if (rawListOutput) {
    listOutputProvided = true;
    const normalized = rawListOutput.toLowerCase();
    if (!LIST_OUTPUT_STYLES.has(normalized)) {
      const allowed = Array.from(LIST_OUTPUT_STYLES).join(', ');
      throw new Error(`--list-output must be one of: ${allowed}.`);
    }
    listOutputStyle = normalized;
  } else if (envListOutput) {
    const normalizedEnv = envListOutput.toLowerCase();
    if (LIST_OUTPUT_STYLES.has(normalizedEnv)) {
      listOutputStyle = normalizedEnv;
    }
  }

  const filterText = resolved.filterText !== undefined && resolved.filterText !== null
    ? String(resolved.filterText).trim()
    : null;
  if (filterText !== null && filterText.length === 0) {
    throw new Error('--filter-text requires a non-empty value.');
  }

  const matchPattern = resolved.match !== undefined && resolved.match !== null
    ? String(resolved.match).trim()
    : null;
  if (matchPattern !== null && matchPattern.length === 0) {
    throw new Error('--match requires a non-empty value.');
  }

  const excludePattern = resolved.exclude !== undefined && resolved.exclude !== null
    ? String(resolved.exclude).trim()
    : null;
  if (excludePattern !== null && excludePattern.length === 0) {
    throw new Error('--exclude requires a non-empty value.');
  }

  const searchText = resolved.searchText !== undefined && resolved.searchText !== null
    ? String(resolved.searchText).trim()
    : null;
  if (searchText !== null && searchText.length === 0) {
    throw new Error('--search-text requires a non-empty value.');
  }

  let extractHashes = [];
  if (resolved.extractHashes !== undefined && resolved.extractHashes !== null) {
    const rawValues = Array.isArray(resolved.extractHashes)
      ? resolved.extractHashes
      : [resolved.extractHashes];

    const tokens = rawValues
      .flatMap((value) => String(value).split(','))
      .map((token) => token.trim())
      .filter(Boolean);

    const unique = [];
    const seen = new Set();
    for (const token of tokens) {
      const normalizedToken = token.replace(/^hash:/i, '');
      if (!normalizedToken) {
        continue;
      }
      if (!seen.has(normalizedToken)) {
        seen.add(normalizedToken);
        unique.push(normalizedToken);
      }
    }

    if (unique.length === 0) {
      throw new Error('--extract-hashes requires at least one hash value. Provide comma or space separated hashes.');
    }

    extractHashes = unique;
  }

  const operationMatrix = [
    ['--list-functions', Boolean(resolved.listFunctions)],
    ['--list-constructors', Boolean(resolved.listConstructors)],
    ['--function-summary', functionSummary],
    ['--extract-hashes', extractHashes.length > 0],
    ['--list-variables', Boolean(resolved.listVariables)],
    ['--outline', Boolean(resolved.outline)],
    ['--context-function', resolved.contextFunction !== undefined && resolved.contextFunction !== null],
    ['--context-variable', resolved.contextVariable !== undefined && resolved.contextVariable !== null],
    ['--preview', resolved.preview !== undefined && resolved.preview !== null],
    ['--preview-variable', resolved.previewVariable !== undefined && resolved.previewVariable !== null],
    ['--snipe', resolved.snipe !== undefined && resolved.snipe !== null],
    ['--search-text', Boolean(searchText)],
    ['--scan-targets', resolved.scanTargets !== undefined && resolved.scanTargets !== null],
    ['--extract', resolved.extract !== undefined && resolved.extract !== null],
    ['--replace', resolved.replace !== undefined && resolved.replace !== null],
    ['--locate', resolved.locate !== undefined && resolved.locate !== null],
    ['--locate-variable', resolved.locateVariable !== undefined && resolved.locateVariable !== null],
    ['--extract-variable', resolved.extractVariable !== undefined && resolved.extractVariable !== null],
    ['--replace-variable', resolved.replaceVariable !== undefined && resolved.replaceVariable !== null]
  ];

  const enabledOperations = operationMatrix.filter(([, flag]) => Boolean(flag));
  if (enabledOperations.length === 0) {
    throw new Error('Provide one of --list-functions, --list-constructors, --function-summary, --extract-hashes <hashes>, --list-variables, --outline, --context-function <selector>, --context-variable <selector>, --preview <selector>, --preview-variable <selector>, --snipe <position>, --search-text <substring>, --scan-targets <selector>, --extract <selector>, --replace <selector>, --locate <selector>, --locate-variable <selector>, --extract-variable <selector>, or --replace-variable <selector>.');
  }
  if (enabledOperations.length > 1) {
    const flags = enabledOperations.map(([flag]) => flag).join(', ');
    throw new Error(`Only one operation may be specified at a time. Found: ${flags}.`);
  }

  if (filterText !== null && !resolved.listFunctions && !resolved.listVariables && !resolved.listConstructors) {
    throw new Error('--filter-text can only be used with --list-functions, --list-constructors, or --list-variables.');
  }

  if (matchPattern !== null && !resolved.listFunctions && !resolved.listVariables && !resolved.listConstructors) {
    throw new Error('--match can only be used with --list-functions, --list-constructors, or --list-variables.');
  }

  if (excludePattern !== null && !resolved.listFunctions && !resolved.listVariables && !resolved.listConstructors) {
    throw new Error('--exclude can only be used with --list-functions, --list-constructors, or --list-variables.');
  }

  if (listOutputProvided && !resolved.listFunctions && !resolved.listConstructors && !resolved.listVariables) {
    throw new Error('--list-output can only be used with --list-functions, --list-constructors, or --list-variables.');
  }

  const includeInternals = Boolean(resolved.includeInternals);
  if (includeInternals && !resolved.listConstructors) {
    throw new Error('--include-internals can only be used with --list-constructors.');
  }

  const emitDiff = Boolean(resolved.emitDiff);
  const fix = Boolean(resolved.fix);
  const previewEdit = Boolean(resolved.previewEdit);
  const outline = Boolean(resolved.outline);
  const force = Boolean(resolved.force);
  const benchmark = Boolean(resolved.benchmark);
  const quiet = Boolean(resolved.quiet);
  const json = quiet || Boolean(resolved.json);
  const allowMultiple = Boolean(resolved.allowMultiple);

  let expectHash = null;
  if (resolved.expectHash !== undefined && resolved.expectHash !== null) {
    const hashValue = String(resolved.expectHash).trim();
    if (!hashValue) {
      throw new Error('--expect-hash requires a non-empty hash value.');
    }
    expectHash = hashValue;
  }

  let expectSpan = null;
  if (resolved.expectSpan !== undefined && resolved.expectSpan !== null) {
    const spanValue = String(resolved.expectSpan).trim();
    if (!spanValue) {
      throw new Error('--expect-span requires a non-empty value in the form start:end.');
    }
    const parts = spanValue.split(':');
    if (parts.length !== 2) {
      throw new Error('--expect-span must be supplied as start:end (for example, 120:264).');
    }
    const start = Number(parts[0]);
    const end = Number(parts[1]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
      throw new Error('--expect-span values must be non-negative integers where start < end.');
    }
    expectSpan = { start, end };
  }

  let selectIndex = null;
  let selectHash = null;
  if (resolved.select !== undefined && resolved.select !== null) {
    const rawSelect = String(resolved.select).trim();
    if (!rawSelect) {
      throw new Error('--select requires a value (positive integer or hash:<value>).');
    }
    const lower = rawSelect.toLowerCase();
    if (lower.startsWith('hash:')) {
      const hashValue = rawSelect.slice(rawSelect.indexOf(':') + 1).trim();
      if (!hashValue) {
        throw new Error('--select hash:<value> requires a guard hash value.');
      }
      selectHash = hashValue;
    } else {
      const parsed = Number(rawSelect);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('--select must be a positive integer (1-based) or hash:<value>.');
      }
      selectIndex = parsed;
    }
  }

  let selectPath = null;
  if (resolved.selectPath !== undefined && resolved.selectPath !== null) {
    const trimmedPath = String(resolved.selectPath).trim();
    if (trimmedPath) {
      selectPath = trimmedPath;
    }
  }

  const parseSelector = (value, flag) => {
    if (value === undefined || value === null) {
      return null;
    }
    const trimmed = String(value).trim();
    if (!trimmed) {
      throw new Error(`Provide a non-empty selector for ${flag}.`);
    }
    return trimmed;
  };

  const contextFunctionSelector = parseSelector(resolved.contextFunction, '--context-function');
  const contextVariableSelector = parseSelector(resolved.contextVariable, '--context-variable');
  const extractSelector = parseSelector(resolved.extract, '--extract');
  const replaceSelector = parseSelector(resolved.replace, '--replace');
  const locateSelector = parseSelector(resolved.locate, '--locate');
  const locateVariableSelector = parseSelector(resolved.locateVariable, '--locate-variable');
  const extractVariableSelector = parseSelector(resolved.extractVariable, '--extract-variable');
  const replaceVariableSelector = parseSelector(resolved.replaceVariable, '--replace-variable');
  const previewSelector = parseSelector(resolved.preview, '--preview');
  const previewVariableSelector = parseSelector(resolved.previewVariable, '--preview-variable');
  const scanTargetsSelector = parseSelector(resolved.scanTargets, '--scan-targets');
  const snipePosition = parseSelector(resolved.snipe, '--snipe');

  let contextBefore = null;
  if (resolved.contextBefore !== undefined && resolved.contextBefore !== null) {
    const parsed = Number(resolved.contextBefore);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error('--context-before must be a non-negative integer.');
    }
    contextBefore = parsed;
  }

  let contextAfter = null;
  if (resolved.contextAfter !== undefined && resolved.contextAfter !== null) {
    const parsed = Number(resolved.contextAfter);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error('--context-after must be a non-negative integer.');
    }
    contextAfter = parsed;
  }

  let previewChars = null;
  if (resolved.previewChars !== undefined && resolved.previewChars !== null) {
    const parsed = Number(resolved.previewChars);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error('--preview-chars must be a positive integer.');
    }
    previewChars = Math.floor(parsed);
  }
  if (previewChars !== null && !previewSelector && !previewVariableSelector) {
    throw new Error('--preview-chars can only be used with --preview or --preview-variable.');
  }

  let searchLimit = null;
  if (resolved.searchLimit !== undefined && resolved.searchLimit !== null) {
    const parsed = Number(resolved.searchLimit);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error('--search-limit must be a positive integer.');
    }
    searchLimit = parsed;
  }
  if (searchLimit !== null && !searchText) {
    throw new Error('--search-limit can only be used with --search-text.');
  }

  let searchContext = null;
  if (resolved.searchContext !== undefined && resolved.searchContext !== null) {
    const parsed = Number(resolved.searchContext);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error('--search-context must be a non-negative integer.');
    }
    searchContext = Math.floor(parsed);
  }
  if (searchContext !== null && !searchText) {
    throw new Error('--search-context can only be used with --search-text.');
  }

  let scanTargetKind = 'function';
  let scanTargetKindProvided = false;
  if (resolved.scanTargetKind !== undefined && resolved.scanTargetKind !== null) {
    const rawKind = String(resolved.scanTargetKind).trim().toLowerCase();
    if (!rawKind) {
      throw new Error('--scan-target-kind requires a non-empty value (function or variable).');
    }
    if (rawKind !== 'function' && rawKind !== 'variable') {
      throw new Error('--scan-target-kind must be either function or variable.');
    }
    scanTargetKind = rawKind;
    scanTargetKindProvided = true;
  }
  if (scanTargetKindProvided && !scanTargetsSelector) {
    throw new Error('--scan-target-kind can only be used together with --scan-targets.');
  }

  const contextEnclosingRaw = resolved.contextEnclosing
    ? String(resolved.contextEnclosing).trim().toLowerCase()
    : 'exact';
  if (!CONTEXT_ENCLOSING_MODES.has(contextEnclosingRaw)) {
    throw new Error('--context-enclosing must be one of: exact, class, function.');
  }

  let variableTarget = 'declarator';
  if (resolved.variableTarget !== undefined && resolved.variableTarget !== null) {
    const rawMode = String(resolved.variableTarget).trim().toLowerCase();
    if (!rawMode) {
      throw new Error('--variable-target requires a non-empty value.');
    }
    if (!VARIABLE_TARGET_MODES.has(rawMode)) {
      throw new Error('--variable-target must be one of: binding, declarator, declaration.');
    }
    variableTarget = rawMode;
  }

  let replaceRange = null;
  if (resolved.replaceRange !== undefined && resolved.replaceRange !== null) {
    const rangeValue = String(resolved.replaceRange).trim();
    if (!rangeValue) {
      throw new Error('--replace-range requires a non-empty value in the form start:end.');
    }
    const parts = rangeValue.split(':');
    if (parts.length !== 2) {
      throw new Error('--replace-range must be supplied as start:end (for example, 12:48).');
    }
    const start = Number(parts[0]);
    const end = Number(parts[1]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
      throw new Error('--replace-range values must be non-negative integers where start < end.');
    }
    replaceRange = { start, end };
  }

  let renameTo = null;
  if (resolved.rename !== undefined && resolved.rename !== null) {
    const renameValue = String(resolved.rename).trim();
    if (!renameValue) {
      throw new Error('--rename requires a non-empty identifier.');
    }
    if (!/^[$A-Za-z_][0-9$A-Za-z_]*$/.test(renameValue)) {
      throw new Error('--rename expects a valid JavaScript identifier (letters, digits, $, _).');
    }
    renameTo = renameValue;
  }

  let replacementPath = null;
  let replacementCode = null;

  if (resolved.with !== undefined && resolved.with !== null) {
    const snippetPath = String(resolved.with).trim();
    if (!snippetPath) {
      throw new Error('--with requires a file path.');
    }
    replacementPath = path.isAbsolute(snippetPath)
      ? snippetPath
      : path.resolve(process.cwd(), snippetPath);
  }

  if (resolved.withFile !== undefined && resolved.withFile !== null) {
    if (replacementPath) {
      throw new Error('Cannot supply both --with and --with-file; choose one.');
    }
    const relativeSnippet = String(resolved.withFile).trim();
    if (!relativeSnippet) {
      throw new Error('--with-file requires a file path.');
    }
    const baseDir = path.dirname(filePath);
    replacementPath = path.resolve(baseDir, relativeSnippet);
  }

  if (resolved.withCode !== undefined && resolved.withCode !== null) {
    if (replacementPath) {
      throw new Error('Cannot supply both --with/--with-file and --with-code; choose one.');
    }
    const rawCode = String(resolved.withCode).trim();
    if (!rawCode) {
      throw new Error('--with-code requires non-empty code.');
    }
    replacementCode = rawCode;
  }

  const hasFunctionReplace = Boolean(replaceSelector);
  const hasVariableReplace = Boolean(replaceVariableSelector);

  if ((replacementPath || replacementCode) && !hasFunctionReplace && !hasVariableReplace) {
    throw new Error('--with/--with-file and --with-code can only be used with --replace or --replace-variable.');
  }

  if (hasFunctionReplace) {
    if (!replacementPath && !replacementCode && !renameTo && !replaceRange) {
      throw new Error('Replacing a function requires either --with <path>, --with-file <path>, --with-code <code>, --replace-range, or --rename <identifier>.');
    }
    if (replaceRange && !replacementPath && !replacementCode) {
      throw new Error('--replace-range requires either --with <path>, --with-file <path>, or --with-code <code> containing the replacement snippet.');
    }
    if (renameTo && (replacementPath || replacementCode)) {
      throw new Error('Provide either --rename or --with/--with-file/--with-code/--replace-range in a single command, not both.');
    }
  }

  if (hasVariableReplace && !replacementPath && !replacementCode) {
    throw new Error('--replace-variable requires either --with <path>, --with-file <path>, or --with-code <code> containing the replacement snippet.');
  }
  if (hasVariableReplace && renameTo) {
    throw new Error('--rename is not supported with --replace-variable.');
  }
  if (hasVariableReplace && replaceRange) {
    throw new Error('--replace-range is not supported with --replace-variable.');
  }

  const rawEmitDigests = Boolean(resolved.emitDigests);
  const rawNoDigests = Boolean(resolved.noDigests);
  let emitDigests = rawEmitDigests;
  let digestDir = null;

  if (resolved.emitDigestDir !== undefined && resolved.emitDigestDir !== null) {
    const digestPath = String(resolved.emitDigestDir).trim();
    if (!digestPath) {
      throw new Error('--emit-digest-dir requires a directory path.');
    }
    digestDir = path.isAbsolute(digestPath)
      ? digestPath
      : path.resolve(process.cwd(), digestPath);
    emitDigests = true;
  }

  if (rawNoDigests) {
    emitDigests = false;
    digestDir = null;
  }

  const digestIncludeSnippets = Boolean(resolved.digestIncludeSnippets);

  if (digestIncludeSnippets && !emitDigests) {
    throw new Error('--digest-include-snippets requires --emit-digests or --emit-digest-dir.');
  }

  if (emitDigests && !hasFunctionReplace && !hasVariableReplace) {
    throw new Error('--emit-digests/--emit-digest-dir can only be used with --replace or --replace-variable.');
  }

  if (emitDigests && !digestDir) {
    digestDir = path.resolve(process.cwd(), 'tmp/js-edit-digests');
  }

  if (expectSpan && !hasFunctionReplace) {
    throw new Error('--expect-span can only be used alongside --replace.');
  }

  let outputPath = null;
  if (resolved.output !== undefined && resolved.output !== null) {
    const outputValue = String(resolved.output).trim();
    if (!outputValue) {
      throw new Error('--output requires a file path.');
    }
    outputPath = path.isAbsolute(outputValue)
      ? outputValue
      : path.resolve(process.cwd(), outputValue);
  }

  let emitPlanPath = null;
  if (resolved.emitPlan !== undefined && resolved.emitPlan !== null) {
    const planPath = String(resolved.emitPlan).trim();
    if (!planPath) {
      throw new Error('--emit-plan requires a file path.');
    }
    emitPlanPath = path.isAbsolute(planPath)
      ? planPath
      : path.resolve(process.cwd(), planPath);
  }

  return {
    filePath,
    listFunctions: Boolean(resolved.listFunctions),
    list: Boolean(resolved.listFunctions),
    listConstructors: Boolean(resolved.listConstructors),
    listVariables: Boolean(resolved.listVariables),
    outline,
    filterText,
    matchPattern,
    excludePattern,
    contextFunctionSelector,
    contextVariableSelector,
    previewSelector,
    previewVariableSelector,
    scanTargetsSelector,
    snipePosition,
    extractSelector,
    replaceSelector,
    locateSelector,
    locateVariableSelector,
    searchText,
    searchLimit,
    searchContext,
    replacementPath,
    replacementCode,
    outputPath,
    emitPlanPath,
    emitDiff,
    previewEdit,
    json,
    quiet,
    benchmark,
    fix,
    force,
    expectHash,
    expectSpan,
    selectIndex,
    selectHash,
    selectPath,
    allowMultiple,
    replaceRange,
    renameTo,
    extractVariableSelector,
    replaceVariableSelector,
    previewChars,
    scanTargetKind,
    variableTarget,
    contextBefore,
    contextAfter,
    contextEnclosing: contextEnclosingRaw,
    includePaths,
    extractHashes,
    functionSummary,
    emitDigests,
    digestDir,
    digestIncludeSnippets,
    includeInternals,
    listOutputStyle
  };
}

function parseCliArgs(argv) {
  const parser = new CliArgumentParser(
    'js-edit',
    'Inspect and perform guarded edits on JavaScript files via AST analysis.'
  );

  parser
    .add('--help', 'Show this help message', false, 'boolean')
    .add('--file <path>', 'Path to the JavaScript file to process (required)')
    .add('--list-functions', 'List all functions, methods, and arrow functions', false, 'boolean')
    .add('--list-constructors', 'List all class constructors', false, 'boolean')
    .add('--list-variables', 'List all variable declarations (const, let, var)', false, 'boolean')
    .add('--outline', 'Quick symbol outline: top-level declarations with positions', false, 'boolean')
    .add('--function-summary', 'Display a summary table of function types and counts', false, 'boolean')
    .add('--filter-text <substring>', 'Filter list results by text (case-insensitive)')
    .add('--match <pattern>', 'Include only symbols matching pattern (glob-style: *, ?, **)')
    .add('--exclude <pattern>', 'Exclude symbols matching pattern (glob-style: *, ?, **)')
    .add('--include-paths', 'Include file paths in list output', false, 'boolean')
    .add('--include-internals', 'Include internal/unnamed constructors in list', false, 'boolean')
    .add('--list-output <style>', `List output style: dense, verbose (default: ${DEFAULT_LIST_OUTPUT_STYLE})`)
    .add('--context-function <selector>', 'Show context for a function')
    .add('--context-variable <selector>', 'Show context for a variable')
    .add('--context-before <chars>', `Characters of context to show before the match (default: ${DEFAULT_CONTEXT_PADDING})`)
    .add('--context-after <chars>', `Characters of context to show after the match (default: ${DEFAULT_CONTEXT_PADDING})`)
    .add('--context-enclosing <mode>', 'Context extraction mode: exact, class, function (default: exact)')
    .add('--preview <selector>', 'Preview a function without its body')
    .add('--preview-variable <selector>', 'Preview a variable declaration')
    .add('--preview-chars <limit>', `Character limit for preview snippets (default: ${DEFAULT_PREVIEW_CHARS})`)
    .add('--snipe <position>', 'Quick lookup: find symbol at position (line:col or byte offset)')
    .add('--search-text <substring>', 'Search for a substring in the file content')
    .add('--search-limit <count>', `Maximum number of search results (default: ${DEFAULT_SEARCH_LIMIT})`)
    .add('--search-context <chars>', `Characters of context around search matches (default: ${DEFAULT_SEARCH_CONTEXT})`)
    .add('--scan-targets <selector>', 'Scan for viable edit targets within a function or class')
    .add('--scan-target-kind <kind>', 'Kind of target to scan for: function, variable (default: function)')
    .add('--locate <selector>', 'Find and report metadata for a function match')
    .add('--locate-variable <selector>', 'Find and report metadata for a variable match')
    .add('--extract <selector>', 'Extract a function and print its source')
    .add('--extract-variable <selector>', 'Extract a variable declaration and print its source')
    .add('--extract-hashes <hashes...>', 'Extract functions by one or more hashes (comma or space-separated)')
    .add('--replace <selector>', 'Replace a function with a new implementation')
    .add('--replace-variable <selector>', 'Replace a variable declarator with a new snippet')
    .add('--with <path>', 'Path to the file containing the replacement code snippet (absolute)')
    .add('--with-file <path>', 'Path to the replacement code snippet (relative to the target file)')
    .add('--with-code <code>', 'Inline code snippet for replacement')
    .add('--replace-range <start:end>', 'Replace a specific character range within a function')
    .add('--rename <identifier>', 'Rename a function declaration')
    .add('--variable-target <mode>', 'For variable operations, target the binding, declarator, or declaration (default: declarator)')
    .add('--output <path>', 'Path to write the output file (for --extract)')
    .add('--fix', 'Apply replacements directly to the file', false, 'boolean')
    .add('--preview-edit', 'Preview replacement as diff without writing (dry-run enhancement)', false, 'boolean')
    .add('--json', 'Output results in JSON format', false, 'boolean')
    .add('--quiet', 'Suppress summary and progress messages (implies --json)', false, 'boolean')
    .add('--emit-diff', 'Emit a diff of the proposed change (dry-run only)', false, 'boolean')
    .add('--emit-plan <path>', 'Emit a plan file for guarded edits or context')
    .add('--emit-digests', 'Emit cryptographic digests of changes for verification', false, 'boolean')
    .add('--emit-digest-dir <path>', 'Directory to store digest files (implies --emit-digests)')
    .add('--digest-include-snippets', 'Include code snippets in digest files', false, 'boolean')
    .add('--no-digests', 'Disable digest emission, even if configured elsewhere', false, 'boolean')
    .add('--force', 'Force replacement even if guard checks fail', false, 'boolean')
    .add('--allow-multiple', 'Allow selectors to match and modify multiple targets', false, 'boolean')
    .add('--expect-hash <hash>', 'Guard replacement by ensuring the target hash matches')
    .add('--expect-span <start:end>', 'Guard replacement by ensuring the target span matches')
    .add('--select <index|hash:...>', 'Select a specific match by 1-based index or hash')
    .add('--select-path <signature>', 'Select a match by its AST path signature')
    .add('--benchmark', 'Show benchmark timing for parsing', false, 'boolean');

  const helpSections = [
    '',
    'Examples:',
    '  js-edit --file src/example.js --list-functions',
    '  js-edit --file src/example.js --locate exports.alpha --json',
    '  js-edit --file src/example.js --replace exports.alpha --with replacements/alpha.js --fix',
    '',
    'Discovery commands:',
    '  --list-functions           Inspect functions with metadata',
    '  --list-variables           Enumerate variable declarations',
    '  --context-function         Show padded context around a match',
    '  --scan-targets             Inspect replaceable spans inside a function',
    '',
    'Guardrails and plans:',
    '  --emit-plan <file>         Write a guarded plan for review',
    '  --expect-hash <hash>       Enforce content integrity before replace',
    '  --expect-span <start:end>  Enforce span alignment during replace',
    '  --allow-multiple           Opt into multi-target operations',
    '',
    'Selector hints:',
    '  name:/canonical            Match by canonical name (case-insensitive)',
    '  path:<signature>           Match by AST path signature',
    '  hash:<digest>              Match by digest captured in list output',
    '  index via --select <n>     Disambiguate when multiple matches exist',
    '',
    'Output controls:',
    '  --json / --quiet           Machine-readable payloads',
    '  --list-output verbose      Expand list tables with full metadata',
    '  JS_EDIT_LIST_OUTPUT=verbose Environment toggle for list layout',
    '  --with-code                Inline replacement snippet (newline guarded)'
  ].join('\n');

  parser.getProgram().addHelpText('after', helpSections);

  const parsedOptions = parser.parse(argv);

  if (parsedOptions.help) {
    parser.getProgram().help({ error: false });
  }

  return parsedOptions;
}

async function main() {
  const rawOptions = parseCliArgs(process.argv.slice(2));
  const options = normalizeOptions(rawOptions);

  const { source, sourceMapper } = await readSource(options.filePath);
  const { newline, newlineGuard } = computeNewlineStats(source);
  options.sourceMapper = sourceMapper;
  options.sourceNewline = newline;

  const start = Date.now();
  const ast = await parseModule(source, options.filePath);
  const end = Date.now();

  if (options.benchmark) {
    const elapsed = end - start;
    console.log(`Parsed ${options.filePath} in ${elapsed}ms`);
  }

  const { functions, classMetadata, mapper: functionMapper } = collectFunctions(ast, source, options.sourceMapper);
  options.sourceMapper = functionMapper || options.sourceMapper;
  const functionRecords = buildFunctionRecords(functions);

  const { variables, mapper: variableMapper } = collectVariables(ast, source, options.sourceMapper);
  options.sourceMapper = variableMapper || options.sourceMapper;
  const variableRecords = buildVariableRecords(variables);

  const deps = {
    source,
    ast,
    functions,
    classMetadata,
    functionRecords,
    buildFunctionRecords,
    variables,
    variableRecords,
    buildVariableRecords,
    fmt,
    options,
    newlineGuard,
    parseModule,
    collectFunctions,
    collectVariables,
    computeNewlineStats,
    createNewlineGuard,
    prepareNormalizedSnippet,
    createDigest,
    writeOutputFile,
    outputJson,
    extractCode,
    replaceSpan,
    loadReplacementSource,
    getReplacementSource,
    applyRenameToSnippet,
    spanKey: createSpanKey,
    findMatchesForSelector,
    resolveMatches,
    resolveVariableMatches,
    resolveVariableTargetInfo,
    variableRecordMatchesPath,
    buildSearchSuggestionsForMatch,
    maybeEmitPlan: contextOperations.maybeEmitPlan,
    buildPlanPayload: contextOperations.buildPlanPayload,
    computeAggregateSpan: contextOperations.computeAggregateSpan,
    formatAggregateSpan: contextOperations.formatAggregateSpan,
    formatSpanRange: contextOperations.formatSpanRange,
    formatSpanDetails: contextOperations.formatSpanDetails,
    renderGuardrailSummary: contextOperations.renderGuardrailSummary,
    toReadableScope,
    HASH_PRIMARY_ENCODING,
    HASH_FALLBACK_ENCODING,
    HASH_LENGTH_BY_ENCODING,
    DEFAULT_SEARCH_CONTEXT
  };

  contextOperations.init(deps);
  mutationOperations.init(deps);
  discoveryOperations.init(deps);

  if (options.listFunctions) {
    return discoveryOperations.listFunctions(options, source, functionRecords);
  }

  if (options.listConstructors) {
    return discoveryOperations.listConstructors(options, functionRecords, classMetadata);
  }

  if (options.functionSummary) {
    return discoveryOperations.summarizeFunctions(options, functionRecords);
  }

  if (options.listVariables) {
    return discoveryOperations.listVariables(options, source, variableRecords);
  }

  if (options.contextFunctionSelector) {
    return contextOperations.showFunctionContext(options, source, functionRecords, options.contextFunctionSelector);
  }

  if (options.contextVariableSelector) {
    return contextOperations.showVariableContext(options, source, variableRecords, options.contextVariableSelector);
  }

  if (options.previewSelector) {
    return discoveryOperations.previewFunction(options, source, functionRecords, options.previewSelector);
  }

  if (options.previewVariableSelector) {
    return discoveryOperations.previewVariable(options, source, variableRecords, options.previewVariableSelector);
  }

  if (options.snipePosition) {
    return discoveryOperations.snipeSymbol(options, source, functionRecords, variableRecords, options.snipePosition);
  }

  if (options.outline) {
    return discoveryOperations.outlineSymbols(options, source, functionRecords, variableRecords);
  }

  if (options.searchText) {
    return discoveryOperations.searchTextMatches(options, source, functionRecords, variableRecords);
  }

  if (options.scanTargetsSelector) {
    if (options.scanTargetKind === 'variable') {
      return mutationOperations.scanVariableTargets(options, variableRecords, options.scanTargetsSelector);
    }
    return discoveryOperations.scanFunctionTargets(options, functionRecords, options.scanTargetsSelector);
  }

  if (options.extractSelector) {
    const [record] = resolveMatches(functionRecords, options.extractSelector, options, { operation: 'extract' });
    return mutationOperations.extractFunction(options, source, record, options.extractSelector);
  }

  if (options.extractHashes.length > 0) {
    return extractFunctionsByHashes(options, source, functionRecords);
  }

  if (options.replaceSelector) {
    const [record] = resolveMatches(functionRecords, options.replaceSelector, options, { operation: 'replace' });
    return mutationOperations.replaceFunction(options, source, record, options.replacementPath, options.replaceSelector);
  }

  if (options.locateSelector) {
    return mutationOperations.locateFunctions(options, functionRecords, options.locateSelector);
  }

  if (options.locateVariableSelector) {
    return mutationOperations.locateVariables(options, variableRecords, options.locateVariableSelector);
  }

  if (options.extractVariableSelector) {
    const [record] = resolveVariableMatches(variableRecords, options.extractVariableSelector, options, { operation: 'extract-variable' });
    return mutationOperations.extractVariable(options, source, record, options.extractVariableSelector);
  }

  if (options.replaceVariableSelector) {
    const [record] = resolveVariableMatches(variableRecords, options.replaceVariableSelector, options, { operation: 'replace-variable' });
    return mutationOperations.replaceVariable(options, source, record, options.replacementPath, options.replaceVariableSelector);
  }
}

main().catch((error) => {
  fmt.error(error.message);
  if (process.env.DEBUG) {
    console.error(error);
  }
  process.exit(1);
});
