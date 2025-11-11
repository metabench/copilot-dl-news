const {
  HASH_PRIMARY_ENCODING,
  HASH_FALLBACK_ENCODING,
  HASH_LENGTH_BY_ENCODING
} = require('../../shared/hashConfig');

const SELECTOR_TYPE_PREFIXES = new Map([
  ['function', 'function'],
  ['variable', 'variable']
]);

const BOOLEAN_TRUE_VALUES = new Set(['true', '1', 'yes', 'y']);
const BOOLEAN_FALSE_VALUES = new Set(['false', '0', 'no', 'n']);
const VARIABLE_TARGET_MODES = new Set(['binding', 'declarator', 'declaration']);

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
  const seen = new Set();
  const add = (value) => {
    if (typeof value === 'string' && value.length > 0) {
      seen.add(value);
    }
  };

  const register = (signature) => {
    if (typeof signature !== 'string' || signature.length === 0) {
      return;
    }
    add(signature);

    const withoutFunction = signature.replace(/\.(ArrowFunctionExpression|FunctionExpression)$/u, '');
    if (withoutFunction !== signature) {
      add(withoutFunction);

      if (withoutFunction.endsWith('.init')) {
        add(withoutFunction.slice(0, -'.init'.length));
      }

      if (withoutFunction.endsWith('.right')) {
        add(withoutFunction.slice(0, -'.right'.length));
      }
    }
  };

  register(record.pathSignature);
  register(record.declaratorPathSignature);
  register(record.declarationPathSignature);

  return Array.from(seen);
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

module.exports = {
  SELECTOR_TYPE_PREFIXES,
  BOOLEAN_TRUE_VALUES,
  BOOLEAN_FALSE_VALUES,
  VARIABLE_TARGET_MODES,
  parseSelectorExpression,
  parseSelectorFilter,
  parseNumericRange,
  parseListValue,
  parseBooleanFilterValue,
  buildSelectorCandidates,
  matchRecordsByCandidates,
  findMatchesForSelector,
  filterMatchesByHash,
  filterMatchesByPath,
  ensureSingleMatch,
  resolveMatches,
  resolveVariableMatches,
  recordMatchesFilter,
  recordMatchesFilters,
  recordMatchesRange,
  resolvePrimarySpan,
  isSpanLike,
  normalizeString,
  collectHashCandidates,
  collectPathCandidates,
  variableRecordMatchesPath,
  getConfiguredHashEncodings,
  resolveVariableTargetInfo,
  buildSearchSuggestionsForMatch
};