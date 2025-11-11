const { parseSync } = require('@swc/core');
const crypto = require('crypto');

const {
  HASH_PRIMARY_ENCODING,
  HASH_FALLBACK_ENCODING,
  HASH_LENGTH_BY_ENCODING,
  HASH_BYTE_LENGTH,
  normalizeHashEncoding,
  encodeHash
} = require('../shared/hashConfig');

function parseModule(source, fileName = 'anonymous.js') {
  return parseSync(source, {
    syntax: 'ecmascript',
    jsx: true,
    dynamicImport: true,
    privateMethod: true,
    functionBind: true,
    decorators: false,
    importAssertions: true,
    target: 'es2022',
    comments: true,
    script: false,
    isModule: true,
    preserveAllComments: true,
    topLevelAwait: true,
    fileName
  });
}

function buildLineIndex(source) {
  const index = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') {
      index.push(i + 1);
    }
  }
  return index;
}

function buildByteIndex(source) {
  const length = source.length;
  const index = new Array(length + 1);
  index[0] = 0;

  let byteOffset = 0;
  let i = 0;

  while (i < length) {
    const code = source.charCodeAt(i);
    let size;
    let step = 1;

    if (code <= 0x7f) {
      size = 1;
    } else if (code <= 0x7ff) {
      size = 2;
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < length) {
      const next = source.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        size = 4;
        step = 2;
      } else {
        size = 3;
      }
    } else {
      size = 3;
    }

    byteOffset += size;
    index[i + 1] = byteOffset;

    if (step === 2) {
      index[i + 2] = byteOffset;
      i += 2;
    } else {
      i += 1;
    }
  }

  return index;
}

function byteOffsetToCodeUnit(byteIndex, byteOffset) {
  if (!Array.isArray(byteIndex) || byteIndex.length === 0) {
    return Math.max(0, byteOffset);
  }

  if (byteOffset <= 0) {
    return 0;
  }

  let low = 0;
  let high = byteIndex.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = byteIndex[mid];
    if (value <= byteOffset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (high < 0) {
    return 0;
  }

  if (high >= byteIndex.length) {
    return byteIndex.length - 1;
  }

  return high;
}




function resolveByteContext(byteIndexCandidate) {
  if (!byteIndexCandidate) {
    return null;
  }

  if (Array.isArray(byteIndexCandidate)) {
    return {
      byteIndex: byteIndexCandidate,
      toCodeUnit(offset) {
        return byteOffsetToCodeUnit(byteIndexCandidate, offset);
      }
    };
  }

  if (typeof byteIndexCandidate === 'object') {
    if (Array.isArray(byteIndexCandidate.byteIndex)) {
      const array = byteIndexCandidate.byteIndex;
      const toCodeUnitFn = typeof byteIndexCandidate.toCodeUnit === 'function'
        ? (offset) => byteIndexCandidate.toCodeUnit(offset)
        : (offset) => byteOffsetToCodeUnit(array, offset);
      return {
        byteIndex: array,
        toCodeUnit: toCodeUnitFn
      };
    }

    if (typeof byteIndexCandidate.getByteIndex === 'function') {
      const array = byteIndexCandidate.getByteIndex();
      if (Array.isArray(array)) {
        const toCodeUnitFn = typeof byteIndexCandidate.toCodeUnit === 'function'
          ? (offset) => byteIndexCandidate.toCodeUnit(offset)
          : (offset) => byteOffsetToCodeUnit(array, offset);
        return {
          byteIndex: array,
          toCodeUnit: toCodeUnitFn
        };
      }
    }
  }

  return null;
}

function normalizeSpan(span, byteIndex = null) {
  if (!span) {
    return { start: 0, end: 0, byteStart: 0, byteEnd: 0, __normalized: true };
  }

  const hasNumbers = typeof span.start === 'number' && typeof span.end === 'number';
  const hasLegacy = typeof span.lo === 'number' && typeof span.hi === 'number';
  const isAlreadyNormalized = span.__normalized === true && hasNumbers;
  const context = resolveByteContext(byteIndex);
  const toCodeUnit = context ? context.toCodeUnit : null;

  const resolveByteOffsets = (rawStartValue, rawEndValue) => {
    let rawStart = rawStartValue;
    let rawEnd = rawEndValue;

    if (!Number.isFinite(rawStart) || rawStart < 0) {
      rawStart = 0;
    }
    if (!Number.isFinite(rawEnd) || rawEnd < rawStart) {
      rawEnd = rawStart;
    }

    const byteStart = rawStart > 0 ? rawStart - 1 : 0;
    let byteEnd = rawEnd > 0 ? rawEnd : rawEnd;
    if (byteEnd < byteStart) {
      byteEnd = byteStart;
    }

    return { byteStart, byteEnd };
  };

  if (isAlreadyNormalized) {
    const byteStart = typeof span.byteStart === 'number'
      ? Math.max(0, span.byteStart)
      : Math.max(0, span.start);
    const byteEnd = typeof span.byteEnd === 'number'
      ? Math.max(byteStart, span.byteEnd)
      : Math.max(byteStart, span.end);

    if (toCodeUnit) {
      return {
        start: toCodeUnit(byteStart),
        end: toCodeUnit(byteEnd),
        byteStart,
        byteEnd,
        __normalized: true
      };
    }

    return {
      start: Math.max(0, span.start),
      end: Math.max(0, span.end),
      byteStart,
      byteEnd,
      __normalized: true
    };
  }

  if (hasNumbers || hasLegacy) {
    const rawStart = hasNumbers ? span.start : span.lo;
    const rawEnd = hasNumbers ? span.end : span.hi;
    const { byteStart, byteEnd } = resolveByteOffsets(rawStart, rawEnd);

    if (toCodeUnit) {
      return {
        start: toCodeUnit(byteStart),
        end: toCodeUnit(byteEnd),
        byteStart,
        byteEnd,
        __normalized: true
      };
    }

    return {
      start: byteStart,
      end: byteEnd,
      byteStart,
      byteEnd,
      __normalized: true
    };
  }

  return { start: 0, end: 0, byteStart: 0, byteEnd: 0, __normalized: true };
}

function createSpanKey(span) {
  if (!span || typeof span !== 'object') {
    return null;
  }

  const normalizedStart = Number.isFinite(span.start) ? span.start : 0;
  const normalizedEnd = Number.isFinite(span.end) ? span.end : normalizedStart;
  const normalizedByteStart = Number.isFinite(span.byteStart) ? span.byteStart : normalizedStart;
  const normalizedByteEnd = Number.isFinite(span.byteEnd) ? span.byteEnd : normalizedEnd;

  return `${normalizedStart}:${normalizedEnd}:${normalizedByteStart}:${normalizedByteEnd}`;
}

function createByteMapper(source) {
  if (typeof source !== 'string') {
    return null;
  }

  const state = {
    byteIndex: null,
    buffer: null
  };

  const ensureByteIndex = () => {
    if (!state.byteIndex) {
      state.byteIndex = buildByteIndex(source);
    }
    return state.byteIndex;
  };

  const ensureBuffer = () => {
    if (!state.buffer) {
      state.buffer = Buffer.from(source, 'utf8');
    }
    return state.buffer;
  };

  const mapper = {
    source,
    getByteIndex: ensureByteIndex,
    toCodeUnit(byteOffset) {
      return byteOffsetToCodeUnit(ensureByteIndex(), byteOffset);
    },
    getBuffer: ensureBuffer,
    sliceString(span) {
      const normalized = normalizeSpan(span, mapper);
      return source.slice(normalized.start, normalized.end);
    },
    sliceBuffer(span) {
      const normalized = normalizeSpan(span, mapper);
      if (normalized.byteEnd <= normalized.byteStart) {
        return Buffer.alloc(0);
      }
      return ensureBuffer().subarray(normalized.byteStart, normalized.byteEnd);
    },
    normalize(span) {
      return normalizeSpan(span, mapper);
    }
  };

  return mapper;
}

function resolveByteMapper(source, candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  if (candidate.source === source && typeof candidate.getByteIndex === 'function' && typeof candidate.toCodeUnit === 'function') {
    return candidate;
  }

  return null;
}



function offsetToPosition(lineIndex, offset) {
  if (offset < 0) {
    return { line: 1, column: 1 };
  }

  let low = 0;
  let high = lineIndex.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = lineIndex[mid];
    if (value <= offset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const line = high + 1;
  const columnBase = lineIndex[high] ?? 0;
  return {
    line,
    column: offset - columnBase + 1
  };
}

function buildCanonicalName(name, scopeChain, exportKind) {
  const chain = Array.isArray(scopeChain) ? scopeChain : [];
  if (chain.length > 0) {
    if (chain[0] === 'exports') {
      if (chain.length >= 2) {
        const base = `exports.${chain[1]}`;
        const rest = chain.slice(2);
        if (rest.length > 0) {
          return `${base} > ${rest.join(' > ')}`;
        }
        return base;
      }
      return `exports.${name || 'default'}`;
    }

    if (chain[0] === 'module.exports') {
      if (chain.length >= 2) {
        return `module.exports.${chain.slice(1).join('.')}`;
      }
      return 'module.exports';
    }

    if (chain.length >= 2) {
      const owner = chain[0];
      const marker = chain[1];
      const tail = chain.slice(2);
      if (typeof marker === 'string' && marker.startsWith('#')) {
        const suffix = tail.length > 0 ? ` > ${tail.join(' > ')}` : '';
        return `${owner}${marker}${suffix}`;
      }
      if (marker === 'static' || marker === 'get' || marker === 'set') {
        const primary = (tail[0] || name || '').trim();
        const remaining = tail.length > 1 ? ` > ${tail.slice(1).join(' > ')}` : '';
        const label = primary ? `${owner}.${marker} ${primary}` : `${owner}.${marker}`;
        return `${label}${remaining}`;
      }
    }

    return chain.join(' > ');
  }

  if (exportKind === 'default') {
    return 'exports.default';
  }
  if (exportKind === 'named') {
    return `exports.${name}`;
  }
  if (exportKind === 'commonjs-default') {
    return 'module.exports';
  }
  if (exportKind === 'commonjs-named') {
    if (Array.isArray(scopeChain) && scopeChain[0] === 'module.exports' && scopeChain.length > 1) {
      return `module.exports.${scopeChain.slice(1).join('.')}`;
    }
    if (Array.isArray(scopeChain) && scopeChain[0] === 'exports' && scopeChain.length > 1) {
      return `exports.${scopeChain.slice(1).join('.')}`;
    }
  }
  return name;
}

function buildPathSignature(pathSegments, nodeType) {
  const segments = Array.isArray(pathSegments) ? pathSegments.slice() : [];
  if (nodeType) {
    segments.push(nodeType);
  }
  return segments.join('.');
}

function createDigest(text, encoding = HASH_PRIMARY_ENCODING) {
  const normalizedEncoding = normalizeHashEncoding(encoding);
  const digestBuffer = crypto.createHash('sha256').update(text, 'utf8').digest();
  return encodeHash(digestBuffer, normalizedEncoding);
}

function computeHash(source, span, encoding = HASH_PRIMARY_ENCODING) {
  if (typeof source !== 'string') {
    return createDigest('', encoding);
  }

  const byteIndex = buildByteIndex(source);
  const normalizedSpan = normalizeSpan(span, byteIndex);
  const sourceBuffer = Buffer.from(source, 'utf8');
  const snippet = normalizedSpan.byteEnd > normalizedSpan.byteStart
    ? sourceBuffer.slice(normalizedSpan.byteStart, normalizedSpan.byteEnd).toString('utf8')
    : '';

  return createDigest(snippet, encoding);
}

function getStaticPropertyName(node) {
  if (!node) return null;
  if (node.type === 'Identifier' && node.value) {
    return node.value;
  }
  if (node.type === 'StringLiteral') {
    return node.value;
  }
  if (node.type === 'NumericLiteral') {
    return String(node.value);
  }
  if (node.type === 'PrivateName' && node.id && node.id.name) {
    return `#${node.id.name}`;
  }
  return null;
}

function extractMemberChain(node, accumulator = []) {
  if (!node) return null;
  if (node.type === 'Identifier' && node.value) {
    const result = accumulator.slice();
    result.unshift(node.value);
    return result;
  }
  if (node.type === 'MemberExpression') {
    const propertyName = getStaticPropertyName(node.property);
    if (!propertyName) return null;
    const next = accumulator.slice();
    next.unshift(propertyName);
    return extractMemberChain(node.object, next);
  }
  if (node.type === 'MetaProperty' && node.meta && node.meta.value && node.property && node.property.value) {
    const result = accumulator.slice();
    result.unshift(node.property.value);
    result.unshift(node.meta.value);
    return result;
  }
  return null;
}

function resolveExportsAssignmentTarget(node) {
  const chain = extractMemberChain(node);
  if (!chain || chain.length === 0) {
    return null;
  }

  if (chain[0] === 'module' && chain[1] === 'exports') {
    const propertyChain = chain.slice(2);
    const base = 'module.exports';
    const scopeChain = propertyChain.length > 0 ? [base].concat(propertyChain) : [base];
    const displayName = propertyChain.length > 0 ? `module.exports.${propertyChain.join('.')}` : base;
    const name = propertyChain.length > 0 ? propertyChain[propertyChain.length - 1] : base;
    return {
      base,
      propertyChain,
      scopeChain,
      displayName,
      name
    };
  }

  if (chain[0] === 'exports') {
    const propertyChain = chain.slice(1);
    const scopeChain = ['exports'].concat(propertyChain);
    const displayName = propertyChain.length > 0 ? `exports.${propertyChain.join('.')}` : 'exports';
    const name = propertyChain.length > 0 ? propertyChain[propertyChain.length - 1] : 'exports';
    return {
      base: 'exports',
      propertyChain,
      scopeChain,
      displayName,
      name
    };
  }

  return null;
}

function normalizeContextStack(stack) {
  return Array.isArray(stack) ? stack : [];
}

function prependContext(stack, entry) {
  if (!entry) {
    return normalizeContextStack(stack);
  }
  return [entry, ...normalizeContextStack(stack)];
}

function formatEnclosingContexts(contexts, byteIndex) {
  return normalizeContextStack(contexts)
    .map((ctx) => {
      if (!ctx || typeof ctx !== 'object' || !ctx.span) return null;
      return {
        kind: ctx.kind || null,
        name: ctx.name || null,
        span: normalizeSpan(ctx.span, byteIndex)
      };
    })
    .filter(Boolean);
}

function recordFunction(results, source, meta) {
  const mappingContext = meta.mapper || meta.byteIndex || null;
  const normalizedSpan = normalizeSpan(meta.span, mappingContext);
  const position = offsetToPosition(meta.lineIndex, normalizedSpan.start);

  const sourceBuffer = meta.sourceBuffer
    || (meta.mapper && typeof meta.mapper.getBuffer === 'function' ? meta.mapper.getBuffer()
      : Buffer.from(source, 'utf8'));
  const byteStart = normalizedSpan.byteStart;
  const byteEnd = normalizedSpan.byteEnd;
  const snippetBuffer = byteEnd > byteStart
    ? sourceBuffer.slice(byteStart, byteEnd)
    : Buffer.alloc(0);
  const snippet = snippetBuffer.toString('utf8');
  const hash = createDigest(snippet);

  const scopeChain = Array.isArray(meta.scopeChain) ? meta.scopeChain.slice() : [];
  const canonicalName = buildCanonicalName(meta.name, scopeChain, meta.exportKind);
  const pathSignature = buildPathSignature(meta.pathSegments, meta.nodeType);
  const identifierSpan = meta.identifierSpan ? normalizeSpan(meta.identifierSpan, mappingContext) : null;
  const byteLength = Math.max(0, byteEnd - byteStart);
  const enclosingContexts = formatEnclosingContexts(meta.enclosingContexts, mappingContext);
  const primaryEnclosing = enclosingContexts[0] || null;

  results.push({
    name: meta.name,
    canonicalName,
    scopeChain,
    kind: meta.kind,
    exportKind: meta.exportKind,
    replaceable: meta.replaceable === true,
    span: normalizedSpan,
    line: position.line,
    column: position.column,
    hash,
    pathSignature,
    pathSegments: Array.isArray(meta.pathSegments) ? meta.pathSegments.slice() : [],
    identifierSpan,
    byteLength,
    enclosingSpan: primaryEnclosing ? primaryEnclosing.span : null,
    enclosingKind: primaryEnclosing ? primaryEnclosing.kind : null,
    enclosingName: primaryEnclosing ? primaryEnclosing.name : null,
    enclosingContexts
  });
}

function recordVariable(results, source, meta) {
  const mappingContext = meta.mapper || meta.byteIndex || null;
  const normalizedSpan = normalizeSpan(meta.span, mappingContext);
  const position = offsetToPosition(meta.lineIndex, normalizedSpan.start);
  const scopeChain = Array.isArray(meta.scopeChain) ? meta.scopeChain.slice() : [];
  const pathSignature = buildPathSignature(meta.pathSegments, meta.nodeType);

  const sourceBuffer = meta.sourceBuffer
    || (meta.mapper && typeof meta.mapper.getBuffer === 'function' ? meta.mapper.getBuffer()
      : Buffer.from(source, 'utf8'));
  const byteStart = normalizedSpan.byteStart;
  const byteEnd = normalizedSpan.byteEnd;
  const snippetBuffer = byteEnd > byteStart
    ? sourceBuffer.slice(byteStart, byteEnd)
    : Buffer.alloc(0);
  const hash = createDigest(snippetBuffer.toString('utf8'));
  const byteLength = Math.max(0, byteEnd - byteStart);

  const declaratorSpan = meta.declaratorSpan ? normalizeSpan(meta.declaratorSpan, mappingContext) : normalizedSpan;
  const declarationSpan = meta.declarationSpan ? normalizeSpan(meta.declarationSpan, mappingContext) : declaratorSpan;

  const declaratorSnippet = declaratorSpan.byteEnd > declaratorSpan.byteStart
    ? sourceBuffer.slice(declaratorSpan.byteStart, declaratorSpan.byteEnd)
    : Buffer.alloc(0);
  const declaratorHash = (declaratorSpan.byteStart === byteStart && declaratorSpan.byteEnd === byteEnd)
    ? hash
    : createDigest(declaratorSnippet.toString('utf8'));

  const declarationSnippet = declarationSpan.byteEnd > declarationSpan.byteStart
    ? sourceBuffer.slice(declarationSpan.byteStart, declarationSpan.byteEnd)
    : Buffer.alloc(0);
  const declarationHash = (declarationSpan.byteStart === declaratorSpan.byteStart && declarationSpan.byteEnd === declaratorSpan.byteEnd)
    ? declaratorHash
    : createDigest(declarationSnippet.toString('utf8'));

  const declaratorByteLength = Math.max(0, declaratorSpan.byteEnd - declaratorSpan.byteStart);
  const declarationByteLength = Math.max(0, declarationSpan.byteEnd - declarationSpan.byteStart);

  const declaratorPathSignature = Array.isArray(meta.declaratorPathSegments)
    ? buildPathSignature(meta.declaratorPathSegments, null)
    : null;
  const declarationPathSignature = Array.isArray(meta.declarationPathSegments)
    ? buildPathSignature(meta.declarationPathSegments, null)
    : null;
  const enclosingContexts = formatEnclosingContexts(meta.enclosingContexts, mappingContext);
  const primaryEnclosing = enclosingContexts[0] || null;

  results.push({
    name: meta.name,
    kind: meta.bindingKind || 'var',
    exportKind: meta.exportKind || null,
    scopeChain,
    span: normalizedSpan,
    line: position.line,
    column: position.column,
    pathSignature,
    pathSegments: Array.isArray(meta.pathSegments) ? meta.pathSegments.slice() : [],
    initializerType: meta.initializerType || null,
    hash,
    byteLength,
    declaratorSpan,
    declaratorHash,
    declaratorByteLength,
    declaratorPathSignature,
    declarationSpan,
    declarationHash,
    declarationByteLength,
    declarationPathSignature,
    enclosingSpan: primaryEnclosing ? primaryEnclosing.span : null,
    enclosingKind: primaryEnclosing ? primaryEnclosing.kind : null,
    enclosingName: primaryEnclosing ? primaryEnclosing.name : null,
    enclosingContexts
  });
}

function extendScopeChain(scopeChain, additions = []) {
  const base = Array.isArray(scopeChain) ? scopeChain : [];
  return base.concat(additions);
}

function extractBindingNames(pattern, results = []) {
  if (!pattern || typeof pattern !== 'object') {
    return results;
  }

  switch (pattern.type) {
    case 'Identifier':
      if (pattern.value) {
        results.push({ name: pattern.value, span: pattern.span });
      }
      break;
    case 'ArrayPattern': {
      const elements = Array.isArray(pattern.elements) ? pattern.elements : [];
      elements.forEach((element) => {
        if (!element) return;
        if (element.type === 'Identifier') {
          if (element.value) {
            results.push({ name: element.value, span: element.span });
          }
        } else if (element.type === 'AssignmentPattern' && element.left) {
          extractBindingNames(element.left, results);
        } else if (element.type === 'RestElement' && element.argument) {
          extractBindingNames(element.argument, results);
        } else if (element.type === 'ArrayPattern' || element.type === 'ObjectPattern') {
          extractBindingNames(element, results);
        }
      });
      break;
    }
    case 'ObjectPattern': {
      const properties = Array.isArray(pattern.properties) ? pattern.properties : [];
      properties.forEach((prop) => {
        if (!prop) return;
        if (prop.type === 'KeyValuePattern' || prop.type === 'KeyValuePatternProperty') {
          extractBindingNames(prop.value, results);
        } else if (prop.type === 'AssignPattern' || prop.type === 'AssignmentPatternProperty') {
          const key = prop.key;
          if (key && key.type === 'Identifier' && key.value) {
            results.push({ name: key.value, span: key.span });
          } else if (key) {
            extractBindingNames(key, results);
          }
        } else if (prop.type === 'RestElement' && prop.argument) {
          extractBindingNames(prop.argument, results);
        }
      });
      break;
    }
    case 'AssignmentPattern':
      if (pattern.left) {
        extractBindingNames(pattern.left, results);
      }
      break;
    case 'RestElement':
      if (pattern.argument) {
        extractBindingNames(pattern.argument, results);
      }
      break;
    default:
      if (pattern.argument) {
        extractBindingNames(pattern.argument, results);
      }
      break;
  }

  return results;
}

function ensureIdentifierName(key) {
  if (!key) return '[anonymous]';
  if (key.type === 'Identifier' && key.value) return key.value;
  if (key.type === 'PrivateName') {
    if (key.id && key.id.name) return `#${key.id.name}`;
    if (typeof key.value === 'string' && key.value) return `#${key.value}`;
  }
  if (key.type === 'StringLiteral' && key.value) return key.value;
  return '[computed]';
}


function collectFunctions(ast, source, mapper = null) {
  const sourceMapper = resolveByteMapper(source, mapper) || createByteMapper(source);
  const lineIndex = buildLineIndex(source);
  const byteIndex = sourceMapper.getByteIndex();
  const sourceBuffer = sourceMapper.getBuffer();
  const functions = [];
  const classMetadataMap = new Map();

  function formatHeritageExpression(expression) {
    if (!expression || typeof expression !== 'object') {
      return null;
    }
    if (expression.type === 'Identifier' && expression.value) {
      return expression.value;
    }
    const chain = extractMemberChain(expression);
    if (chain && chain.length > 0) {
      return chain.join('.');
    }
    if (expression.span) {
      try {
        const snippet = sourceMapper.sliceString(expression.span);
        const trimmed = snippet.trim();
        return trimmed.length > 0 ? trimmed : null;
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  function collectImplementsList(nodes) {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return [];
    }
    const results = [];
    nodes.forEach((item) => {
      if (!item || typeof item !== 'object') {
        return;
      }
      const target = item.expression || item.id || item;
      const value = formatHeritageExpression(target);
      if (value) {
        results.push(value);
      }
    });
    return results;
  }

  function splitParameterList(raw) {
    const results = [];
    if (typeof raw !== 'string') {
      return results;
    }
    let current = '';
    let depth = 0;
    let stringQuote = null;
    let escapeNext = false;
    for (let index = 0; index < raw.length; index += 1) {
      const ch = raw[index];
      if (escapeNext) {
        current += ch;
        escapeNext = false;
        continue;
      }
      if (ch === '\\') {
        current += ch;
        escapeNext = true;
        continue;
      }
      if (stringQuote) {
        current += ch;
        if (ch === stringQuote) {
          stringQuote = null;
        }
        continue;
      }
      if (ch === '"' || ch === '\'' || ch === '`') {
        current += ch;
        stringQuote = ch;
        continue;
      }
      if (ch === '(' || ch === '{' || ch === '[') {
        depth += 1;
        current += ch;
        continue;
      }
      if (ch === ')' || ch === '}' || ch === ']') {
        if (depth > 0) {
          depth -= 1;
        }
        current += ch;
        continue;
      }
      if (ch === ',' && depth === 0) {
        if (current.trim().length > 0) {
          results.push(current.trim().replace(/\s+/g, ' '));
        }
        current = '';
        continue;
      }
      current += ch;
    }
    if (current.trim().length > 0) {
      results.push(current.trim().replace(/\s+/g, ' '));
    }
    return results;
  }

  function extractConstructorParamsFromSnippet(snippet, methodNode) {
    if (typeof snippet !== 'string' || snippet.length === 0) {
      return [];
    }
    if (methodNode && Array.isArray(methodNode.params) && methodNode.params.length > 0) {
      const params = methodNode.params.map((param) => {
        if (!param || typeof param !== 'object') {
          return '';
        }
        try {
          return sourceMapper.sliceString(param.span).trim().replace(/\s+/g, ' ');
        } catch (error) {
          return '';
        }
      }).filter((value) => value.length > 0);
      if (params.length > 0) {
        return params;
      }
    }
    const match = snippet.match(/constructor\s*\(([\s\S]*?)\)/);
    if (!match) {
      return [];
    }
    const paramsRaw = match[1].trim();
    if (!paramsRaw) {
      return [];
    }
    return splitParameterList(paramsRaw);
  }

  function normalizeConstructorParam(value) {
    if (typeof value !== 'string') {
      return '';
    }
    let normalized = value.trim().replace(/\s+/g, ' ');
    while (normalized.endsWith(',') || normalized.endsWith(')')) {
      normalized = normalized.slice(0, -1).trimEnd();
    }
    return normalized;
  }

  function registerConstructorMetadata(classKey, methodNode) {
    if (!classKey || !classMetadataMap.has(classKey) || !methodNode) {
      return;
    }
    const entry = classMetadataMap.get(classKey);
    if (!entry) {
      return;
    }
    const normalizedSpan = sourceMapper.normalize(methodNode.span);
    const constructorKey = createSpanKey(normalizedSpan);
    if (!constructorKey) {
      return;
    }
    let snippet = '';
    try {
      snippet = sourceMapper.sliceString(methodNode.span);
    } catch (error) {
      snippet = '';
    }
    const params = extractConstructorParamsFromSnippet(snippet, methodNode)
      .map((value) => normalizeConstructorParam(value))
      .filter((value) => value.length > 0);
    entry.constructors.set(constructorKey, {
      span: normalizedSpan,
      params
    });
  }

  const REPLACEABLE_CALL_BASE_NAMES = new Set([
    'describe',
    'context',
    'suite',
    'it',
    'test',
    'specify',
    'beforeeach',
    'aftereach',
    'beforeall',
    'afterall',
    'before',
    'after'
  ]);

  function normalizeCallToken(value) {
    if (typeof value !== 'string' || value.length === 0) {
      return '';
    }
    return value.toLowerCase();
  }

  function isRecognizedCallBase(calleeInfo) {
    if (!calleeInfo) {
      return false;
    }
    const base = normalizeCallToken(calleeInfo.baseName);
    if (base && REPLACEABLE_CALL_BASE_NAMES.has(base)) {
      return true;
    }
    const chain = Array.isArray(calleeInfo.chain) ? calleeInfo.chain : [];
    if (chain.length > 0) {
      const root = normalizeCallToken(chain[0]);
      if (root && REPLACEABLE_CALL_BASE_NAMES.has(root)) {
        return true;
      }
    }
    const full = normalizeCallToken(calleeInfo.fullName);
    if (full) {
      const head = full.split('.')[0];
      if (head && REPLACEABLE_CALL_BASE_NAMES.has(head)) {
        return true;
      }
    }
    return false;
  }

  function isReplaceableCallCallback(callContext) {
    if (!callContext) {
      return false;
    }
    if (callContext.argumentLabel !== 'callback') {
      return false;
    }
    if (isRecognizedCallBase(callContext.calleeInfo)) {
      return true;
    }
    return false;
  }

  function sanitizeCallDescription(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const collapsed = value.replace(/\s+/g, ' ').trim();
    if (!collapsed) {
      return null;
    }
    if (collapsed.length > 40) {
      return `${collapsed.slice(0, 37)}…`;
    }
    return collapsed;
  }

  function resolveCallCalleeInfo(callee) {
    const chain = extractMemberChain(callee);
    if (chain && chain.length > 0) {
      return {
        fullName: chain.join('.'),
        baseName: chain[0],
        chain
      };
    }
    if (callee && callee.type === 'Identifier' && callee.value) {
      return {
        fullName: callee.value,
        baseName: callee.value,
        chain: [callee.value]
      };
    }
    return {
      fullName: null,
      baseName: null,
      chain: []
    };
  }

  function getCallbackLabel(baseName, index, total) {
    if (!baseName) {
      return `arg${index + 1}`;
    }
    const normalized = baseName.toLowerCase();
    if ((normalized === 'describe' || normalized === 'context') && index === 1) {
      return 'callback';
    }
    if ((normalized === 'test' || normalized === 'it') && index === 1) {
      return 'callback';
    }
    if (
      normalized === 'beforeeach' ||
      normalized === 'aftereach' ||
      normalized === 'beforeall' ||
      normalized === 'afterall'
    ) {
      if (index === 0) {
        return 'callback';
      }
    }
    if (normalized.endsWith('.each') && index === total - 1) {
      return 'callback';
    }
    return `arg${index + 1}`;
  }

  function buildCallScopeLabel(info, description) {
    const base = info.fullName || info.baseName || 'anonymous-call';
    if (!description) {
      return `call:${base}`;
    }
    const safe = description.replace(/[^a-zA-Z0-9._-]+/g, '_');
    return `call:${base}:${safe}`;
  }

  function buildCallDisplayName(info, description) {
    const base = info.fullName || info.baseName || 'callback';
    if (description) {
      return `${base} callback "${description}"`;
    }
    return `${base} callback`;
  }

  function unwrapArgumentExpression(argument) {
    if (!argument) {
      return null;
    }
    if (typeof argument === 'object' && argument.expression) {
      return argument.expression;
    }
    return argument;
  }

  function visit(node, context = { scopeChain: [], exportKind: null, enclosingContexts: [], callContext: null }, pathSegments = ['module']) {
    if (!node || typeof node !== 'object') {
      return;
    }

    const { type } = node;
    if (!type) return;

    const includeType = !(type === 'Module' && pathSegments.length === 1 && pathSegments[0] === 'module');
    const currentPath = includeType ? pathSegments.concat(type) : pathSegments;
    const currentScope = Array.isArray(context.scopeChain) ? context.scopeChain : [];
    const baseEnclosing = normalizeContextStack(context.enclosingContexts);

    switch (type) {
      case 'Module': {
        if (Array.isArray(node.body)) {
          node.body.forEach((item, index) => {
            visit(item, context, currentPath.concat(`body[${index}]`));
          });
        }
        return;
      }
      case 'FunctionDeclaration': {
        const name = node.identifier ? node.identifier.value : context.exportKind === 'default' ? 'default' : '(anonymous)';
        const shouldAppendName = currentScope.length > 0 && currentScope[currentScope.length - 1] !== name;
        const scopeChain = extendScopeChain(currentScope, shouldAppendName ? [name] : []);
        recordFunction(functions, source, {
          name,
          kind: 'function-declaration',
          exportKind: context.exportKind || null,
          replaceable: true,
          span: node.span,
          lineIndex,
          byteIndex,
          sourceBuffer,
          mapper: sourceMapper,
          scopeChain,
          pathSegments: currentPath,
          nodeType: type,
          identifierSpan: node.identifier ? node.identifier.span : null,
          enclosingContexts: baseEnclosing
        });
        if (node.body) {
          const childScope = extendScopeChain(scopeChain, shouldAppendName ? [] : [name]);
          const functionEntry = { kind: 'function-declaration', name, span: node.span };
          visit(
            node.body,
            { ...context, scopeChain: childScope, callContext: null, enclosingContexts: prependContext(baseEnclosing, functionEntry) },
            currentPath.concat('body')
          );
        }
        break;
      }
      case 'ExportDeclaration': {
        const decl = node.declaration || node.decl;
        if (decl) {
          const exportScope = extendScopeChain(currentScope, ['exports']);
          const exportEntry = { kind: 'export', name: 'named', span: node.span };
          visit(
            decl,
            {
              ...context,
              exportKind: 'named',
              scopeChain: exportScope,
              exportSpan: node.span,
              callContext: null,
              enclosingContexts: prependContext(baseEnclosing, exportEntry)
            },
            currentPath.concat('declaration')
          );
        }
        break;
      }
      case 'ExportDefaultDeclaration': {
        const decl = node.declaration || node.decl;
        if (decl) {
          const exportScope = extendScopeChain(currentScope, ['exports', 'default']);
          const exportEntry = { kind: 'export', name: 'default', span: node.span };
          visit(
            decl,
            {
              ...context,
              exportKind: 'default',
              scopeChain: exportScope,
              exportSpan: node.span,
              callContext: null,
              enclosingContexts: prependContext(baseEnclosing, exportEntry)
            },
            currentPath.concat('declaration')
          );
        }
        break;
      }
      case 'ExportDefaultExpression': {
        const exportScope = extendScopeChain(currentScope, ['exports', 'default']);
        const exportEntry = { kind: 'export', name: 'default', span: node.span };
        if (node.expression && (node.expression.type === 'FunctionExpression' || node.expression.type === 'ArrowFunctionExpression')) {
          recordFunction(functions, source, {
            name: 'default',
            kind: node.expression.type === 'FunctionExpression' ? 'function-expression' : 'arrow-function',
            exportKind: 'default',
            replaceable: true,
            span: node.expression.span,
            lineIndex,
            byteIndex,
            sourceBuffer,
            mapper: sourceMapper,
            scopeChain: exportScope,
            pathSegments: currentPath,
            nodeType: node.expression.type,
            identifierSpan: node.expression.identifier ? node.expression.identifier.span : null,
            enclosingContexts: prependContext(baseEnclosing, exportEntry)
          });
        }
        if (node.expression) {
          visit(
            node.expression,
            {
              ...context,
              exportKind: 'default',
              scopeChain: exportScope,
              exportSpan: node.span,
              callContext: null,
              enclosingContexts: prependContext(baseEnclosing, exportEntry)
            },
            currentPath.concat('expression')
          );
        }
        break;
      }
      case 'VariableDeclaration': {
        if (Array.isArray(node.declarations)) {
          node.declarations.forEach((decl, index) => {
            visit(decl, context, currentPath.concat(`declarations[${index}]`));
          });
        }
        break;
      }
      case 'VariableDeclarator': {
        const id = node.id;
        const init = node.init;
        if (id && id.type === 'Identifier' && init && (init.type === 'FunctionExpression' || init.type === 'ArrowFunctionExpression')) {
          const shouldAppendName = currentScope.length > 0 && currentScope[currentScope.length - 1] !== id.value;
          const scopeChain = extendScopeChain(currentScope, shouldAppendName ? [id.value] : []);
          recordFunction(functions, source, {
            name: id.value,
            kind: init.type === 'FunctionExpression' ? 'function-expression' : 'arrow-function',
            exportKind: context.exportKind || null,
            replaceable: true,
            span: init.span || node.span,
            lineIndex,
            byteIndex,
            sourceBuffer,
            mapper: sourceMapper,
            scopeChain,
            pathSegments: currentPath,
            nodeType: init.type,
            identifierSpan: id.span || null,
            enclosingContexts: baseEnclosing
          });
        }
        if (init) {
          const name = id && id.type === 'Identifier' ? id.value : '(anonymous)';
          const funcEntry = {
            kind: init ? (init.type === 'ArrowFunctionExpression' ? 'arrow-function' : 'function-expression') : 'function',
            name,
            span: init.span || node.span
          };
          visit(init, { ...context, enclosingContexts: prependContext(baseEnclosing, funcEntry) }, currentPath.concat('init'));
        }
        break;
      }
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        const identifier = node.identifier ? node.identifier.value : null;
        const typeLabel = type === 'ArrowFunctionExpression' ? 'arrow-function' : 'function-expression';
        let recorded = false;

        if (context.exportKind && node.identifier) {
          recordFunction(functions, source, {
            name: node.identifier.value,
            kind: 'function-expression',
            exportKind: context.exportKind,
            replaceable: true,
            span: node.span,
            lineIndex,
            byteIndex,
            sourceBuffer,
            mapper: sourceMapper,
            scopeChain: extendScopeChain(currentScope, []),
            pathSegments: currentPath,
            nodeType: type,
            identifierSpan: node.identifier ? node.identifier.span : null,
            enclosingContexts: baseEnclosing
          });
          recorded = true;
        }

        const callContext = context.callContext || null;
        if (!recorded && callContext) {
          const allowCallReplacement = isReplaceableCallCallback(callContext);
          const callBaseScope = extendScopeChain(currentScope, [callContext.scopeLabel, callContext.argumentLabel]);
          const scopeChain = identifier ? extendScopeChain(callBaseScope, [identifier]) : callBaseScope;
          recordFunction(functions, source, {
            name: callContext.displayName,
            kind: typeLabel,
            exportKind: context.exportKind || null,
            replaceable: allowCallReplacement,
            span: node.span,
            lineIndex,
            byteIndex,
            sourceBuffer,
            mapper: sourceMapper,
            scopeChain,
            pathSegments: currentPath,
            nodeType: type,
            identifierSpan: node.identifier ? node.identifier.span : null,
            enclosingContexts: baseEnclosing
          });
          recorded = true;
        }

        if (node.body) {
          const baseScope = callContext ? extendScopeChain(currentScope, [callContext.scopeLabel, callContext.argumentLabel]) : currentScope;
          const funcScope = identifier ? extendScopeChain(baseScope, [identifier]) : baseScope;
          const entry = {
            kind: typeLabel,
            name: identifier || callContext?.displayName || '(anonymous)',
            span: node.span
          };
          visit(
            node.body,
            { ...context, scopeChain: funcScope, callContext: null, enclosingContexts: prependContext(baseEnclosing, entry) },
            currentPath.concat('body')
          );
        }
        break;
      }
      case 'ExpressionStatement': {
        if (node.expression) {
          visit(node.expression, context, currentPath.concat('expression'));
        }
        break;
      }
      case 'CallExpression': {
        if (node.callee) {
          visit(node.callee, context, currentPath.concat('callee'));
        }

        const args = Array.isArray(node.arguments) ? node.arguments : [];
        if (args.length > 0) {
          const calleeInfo = resolveCallCalleeInfo(node.callee);
          const firstStringArg = args.find((arg) => {
            const expr = unwrapArgumentExpression(arg);
            return expr && expr.type === 'StringLiteral' && typeof expr.value === 'string';
          });
          const description = firstStringArg ? sanitizeCallDescription(unwrapArgumentExpression(firstStringArg).value) : null;
          const scopeLabel = buildCallScopeLabel(calleeInfo, description);
          const baseDisplayName = buildCallDisplayName(calleeInfo, description);

          args.forEach((arg, index) => {
            const expressionNode = unwrapArgumentExpression(arg);
            if (!expressionNode) {
              return;
            }
            const argumentLabel = getCallbackLabel(calleeInfo.baseName, index, args.length);
            const displayName = argumentLabel === 'callback' ? baseDisplayName : `${baseDisplayName} (${argumentLabel})`;
            const callContext = {
              scopeLabel,
              argumentLabel,
              displayName,
              calleeInfo,
              argumentIndex: index
            };
            visit(
              expressionNode,
              { ...context, callContext, enclosingContexts: baseEnclosing },
              currentPath.concat(`arguments[${index}]`)
            );
          });
        }

        if (node.typeArguments) {
          visit(node.typeArguments, context, currentPath.concat('typeArguments'));
        }
        break;
      }
      case 'AssignmentExpression': {
        const target = resolveExportsAssignmentTarget(node.left);
        const right = node.right;
        const exportEntry = target
          ? {
              kind: target.base,
              name: target.displayName,
              span: node.span
            }
          : null;

        if (target && right) {
          const exportKind = target.base === 'module.exports'
            ? target.propertyChain.length > 0
              ? 'commonjs-named'
              : 'commonjs-default'
            : 'commonjs-named';
          const scopeChain = target.scopeChain;

          if (right.type === 'FunctionExpression' || right.type === 'ArrowFunctionExpression') {
            const funcName = right.type === 'FunctionExpression' && right.identifier
              ? right.identifier.value
              : target.name;
            recordFunction(functions, source, {
              name: funcName,
              kind: right.type === 'FunctionExpression' ? 'function-expression' : 'arrow-function',
              exportKind,
              replaceable: true,
              span: right.span,
              lineIndex,
              byteIndex,
              sourceBuffer,
              mapper: sourceMapper,
              scopeChain,
              pathSegments: currentPath.concat('right'),
              nodeType: right.type,
              identifierSpan: right.identifier ? right.identifier.span : null,
              enclosingContexts: baseEnclosing
            });
          } else if (right.type === 'ClassExpression') {
            const className = right.identifier ? right.identifier.value : target.name || '(anonymous class)';
            recordFunction(functions, source, {
              name: className,
              kind: 'class',
              exportKind,
              replaceable: false,
              span: right.span,
              lineIndex,
              byteIndex,
              sourceBuffer,
              mapper: sourceMapper,
              scopeChain,
              pathSegments: currentPath.concat('right'),
              nodeType: right.type,
              enclosingContexts: baseEnclosing
            });
          }
        }

        if (node.left) {
          visit(node.left, context, currentPath.concat('left'));
        }
        if (right) {
          const nextContext = target
            ? {
                ...context,
                scopeChain: extendScopeChain(currentScope, target.scopeChain),
                enclosingContexts: exportEntry ? prependContext(baseEnclosing, exportEntry) : baseEnclosing
              }
            : context;
          visit(right, nextContext, currentPath.concat('right'));
        }
        break;
      }
      case 'ClassDeclaration': {
        if (node.identifier) {
          recordFunction(functions, source, {
            name: node.identifier.value,
            kind: 'class',
            exportKind: context.exportKind || null,
            replaceable: false,
            span: node.span,
            lineIndex,
            byteIndex,
            sourceBuffer,
            mapper: sourceMapper,
            scopeChain: extendScopeChain(currentScope, []),
            pathSegments: currentPath,
            nodeType: type,
            enclosingContexts: baseEnclosing
          });
        }
        const className = node.identifier ? node.identifier.value : '(anonymous class)';
        const classScope = node.identifier ? extendScopeChain(currentScope, [className]) : currentScope;
        const classSpan = context.exportSpan || node.span;
        const normalizedClassSpan = sourceMapper.normalize(node.span);
        const classEntry = { kind: 'class', name: className, span: normalizedClassSpan };
        const classKey = createSpanKey(normalizedClassSpan);
        if (classKey) {
          const existing = classMetadataMap.get(classKey) || {
            constructors: new Map()
          };
          existing.span = normalizedClassSpan;
          existing.name = node.identifier ? node.identifier.value : context.className || '(anonymous class)';
          existing.superClass = formatHeritageExpression(node.superClass);
          existing.implements = collectImplementsList(node.implements);
          classMetadataMap.set(classKey, existing);
        }
        const members = Array.isArray(node.body)
          ? node.body
          : Array.isArray(node.body?.body)
            ? node.body.body
            : [];
        members.forEach((member, index) => {
          visit(
            member,
            {
              ...context,
              className,
              classSpan,
              classMetadataKey: classKey,
              scopeChain: classScope,
              callContext: null,
              enclosingContexts: prependContext(baseEnclosing, classEntry)
            },
            currentPath.concat(`body[${index}]`)
          );
        });
        break;
      }
      case 'Constructor': {
        const methodName = 'constructor';
        const cleanName = 'constructor';
        const isConstructor = true;
        if (isConstructor && context.classMetadataKey) {
          registerConstructorMetadata(context.classMetadataKey, node);
        }
        const methodSegments = [`#${cleanName}`];
        const scopeChain = extendScopeChain(currentScope, methodSegments);
        recordFunction(functions, source, {
          name: context.className ? `${context.className}.${cleanName}` : cleanName,
          kind: 'class-method',
          exportKind: context.exportKind || null,
          replaceable: true,
          span: node.span,
          lineIndex,
          byteIndex,
          sourceBuffer,
          mapper: sourceMapper,
          scopeChain,
          pathSegments: currentPath,
          nodeType: type,
          enclosingContexts: baseEnclosing
        });
        if (node.body) {
          const methodEntry = {
            kind: 'constructor',
            name: context.className ? `${context.className}.${cleanName}` : cleanName,
            span: node.span
          };
          visit(
            node.body,
            { ...context, scopeChain, callContext: null, enclosingContexts: prependContext(baseEnclosing, methodEntry) },
            currentPath.concat('body')
          );
        }
        break;
      }
      case 'ClassMethod':
      case 'ClassPrivateMethod':
      case 'PrivateMethod': {
        const methodName = ensureIdentifierName(node.key);
        const cleanName = methodName.replace(/^#/, '');
        const isConstructor = cleanName === 'constructor' && methodName === 'constructor' && !node.isStatic && node.kind !== 'getter' && node.kind !== 'setter';
        if (isConstructor && context.classMetadataKey) {
          registerConstructorMetadata(context.classMetadataKey, node);
        }
        const methodSegments = [];
        if (node.kind === 'getter') {
          methodSegments.push('get', cleanName);
        } else if (node.kind === 'setter') {
          methodSegments.push('set', cleanName);
        } else if (node.isStatic) {
          methodSegments.push('static', cleanName);
        } else {
          methodSegments.push(`#${cleanName}`);
        }
        const scopeChain = extendScopeChain(currentScope, methodSegments);
        recordFunction(functions, source, {
          name: context.className ? `${context.className}.${cleanName}` : cleanName,
          kind: 'class-method',
          exportKind: context.exportKind || null,
          replaceable: true,
          span: node.span,
          lineIndex,
          byteIndex,
          sourceBuffer,
          mapper: sourceMapper,
          scopeChain,
          pathSegments: currentPath,
          nodeType: type,
          enclosingContexts: baseEnclosing
        });
        if (node.function && node.function.body) {
          const methodEntry = {
            kind: 'class-method',
            name: context.className ? `${context.className}.${cleanName}` : cleanName,
            span: node.span
          };
          visit(
            node.function.body,
            { ...context, scopeChain, callContext: null, enclosingContexts: prependContext(baseEnclosing, methodEntry) },
            currentPath.concat('function.body')
          );
        }
        break;
      }
      default: {
        for (const key of Object.keys(node)) {
          if (key === 'span') continue;
          const value = node[key];
          if (Array.isArray(value)) {
            value.forEach((child, index) => {
              visit(child, { ...context, enclosingContexts: baseEnclosing }, currentPath.concat(`${key}[${index}]`));
            });
          } else if (value && typeof value === 'object') {
            visit(value, { ...context, enclosingContexts: baseEnclosing }, currentPath.concat(key));
          }
        }
      }
    }
  }


  visit(ast, { scopeChain: [], exportKind: null, enclosingContexts: [], callContext: null }, ['module']);

  functions.sort((a, b) => a.span.start - b.span.start);
  return { functions, classMetadata: classMetadataMap, lineIndex, mapper: sourceMapper };
}




function collectVariables(ast, source, mapper = null) {
  const sourceMapper = resolveByteMapper(source, mapper) || createByteMapper(source);
  const lineIndex = buildLineIndex(source);
  const byteIndex = sourceMapper.getByteIndex();
  const sourceBuffer = sourceMapper.getBuffer();
  const variables = [];

  function visit(
    node,
    context = { scopeChain: [], exportKind: null, bindingKind: null, className: null, enclosingContexts: [] },
    pathSegments = ['module']
  ) {
    if (!node || typeof node !== 'object') {
      return;
    }

    const { type } = node;
    if (!type) return;

    const includeType = !(type === 'Module' && pathSegments.length === 1 && pathSegments[0] === 'module');
    const currentPath = includeType ? pathSegments.concat(type) : pathSegments;
    const currentScope = Array.isArray(context.scopeChain) ? context.scopeChain : [];
    const baseEnclosing = normalizeContextStack(context.enclosingContexts);

    switch (type) {
      case 'Module': {
        if (Array.isArray(node.body)) {
          node.body.forEach((item, index) => {
            visit(item, context, currentPath.concat(`body[${index}]`));
          });
        }
        return;
      }
      case 'FunctionDeclaration': {
        const name = node.identifier ? node.identifier.value : context.exportKind === 'default' ? 'default' : '(anonymous)';
        const shouldAppendName = currentScope.length > 0 && currentScope[currentScope.length - 1] !== name;
        const scopeChain = extendScopeChain(currentScope, shouldAppendName ? [name] : []);
        if (node.body) {
          const childScope = extendScopeChain(scopeChain, shouldAppendName ? [] : [name]);
          const functionEntry = { kind: 'function-declaration', name, span: node.span };
          visit(
            node.body,
            { ...context, scopeChain: childScope, className: null, enclosingContexts: prependContext(baseEnclosing, functionEntry) },
            currentPath.concat('body')
          );
        }
        break;
      }
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        const identifier = node.identifier ? node.identifier.value : null;
        const funcScope = identifier ? extendScopeChain(currentScope, [identifier]) : currentScope;
        if (node.body) {
          const functionEntry = {
            kind: type === 'ArrowFunctionExpression' ? 'arrow-function' : 'function-expression',
            name: identifier || '(anonymous)',
            span: node.span
          };
          visit(
            node.body,
            { ...context, scopeChain: funcScope, className: null, enclosingContexts: prependContext(baseEnclosing, functionEntry) },
            currentPath.concat('body')
          );
        }
        break;
      }
      case 'ClassDeclaration': {
        const className = node.identifier ? node.identifier.value : '(anonymous class)';
        const classScope = node.identifier ? extendScopeChain(currentScope, [className]) : currentScope;
        const classSpan = context.exportSpan || node.span;
        const classEntry = { kind: 'class', name: className, span: classSpan };
        const members = Array.isArray(node.body)
          ? node.body
          : Array.isArray(node.body?.body)
            ? node.body.body
            : [];
        members.forEach((member, index) => {
          visit(
            member,
            {
              ...context,
              className,
              classSpan,
              scopeChain: classScope,
              enclosingContexts: prependContext(baseEnclosing, classEntry)
            },
            currentPath.concat(`body[${index}]`)
          );
        });
        break;
      }
      case 'ClassMethod':
      case 'ClassPrivateMethod': {
        const methodName = ensureIdentifierName(node.key).replace(/^#/, '');
        const segments = [];
        if (node.kind === 'getter') {
          segments.push('get', methodName);
        } else if (node.kind === 'setter') {
          segments.push('set', methodName);
        } else if (node.isStatic) {
          segments.push('static', methodName);
        } else {
          segments.push(`#${methodName}`);
        }
        const methodScope = extendScopeChain(currentScope, segments);
        if (node.function && node.function.body) {
          const methodEntry = {
            kind: 'class-method',
            name: context.className ? `${context.className}.${methodName}` : methodName,
            span: node.span
          };
          visit(
            node.function.body,
            { ...context, scopeChain: methodScope, enclosingContexts: prependContext(baseEnclosing, methodEntry) },
            currentPath.concat('function.body')
          );
        }
        break;
      }
      case 'ClassProperty':
      case 'ClassPrivateProperty': {
        const key = node.key;
        let name = null;
        if (key && key.type === 'Identifier') {
          name = key.value;
        } else if (key && key.type === 'PrivateName' && key.id) {
          name = `#${key.id.name}`;
        }
        if (name) {
          recordVariable(variables, source, {
            name,
            span: key.span || node.span,
            lineIndex,
            byteIndex,
            sourceBuffer,
            mapper: sourceMapper,
            scopeChain: currentScope,
            exportKind: context.exportKind || null,
            bindingKind: 'class-field',
            pathSegments: currentPath,
            nodeType: type,
            initializerType: node.value ? node.value.type : null,
            enclosingContexts: baseEnclosing
          });
        }
        if (node.value) {
          visit(node.value, { ...context, enclosingContexts: baseEnclosing }, currentPath.concat('value'));
        }
        break;
      }
      case 'ExportDeclaration': {
        const decl = node.declaration || node.decl;
        if (decl) {
          const exportScope = extendScopeChain(currentScope, ['exports']);
          const exportEntry = { kind: 'export', name: 'named', span: node.span };
          visit(
            decl,
            {
              ...context,
              exportKind: 'named',
              scopeChain: exportScope,
              exportSpan: node.span,
              enclosingContexts: prependContext(baseEnclosing, exportEntry)
            },
            currentPath.concat('declaration')
          );
        }
        break;
      }
      case 'ExportDefaultDeclaration': {
        const decl = node.declaration || node.decl;
        if (decl) {
          const exportScope = extendScopeChain(currentScope, ['exports', 'default']);
          const exportEntry = { kind: 'export', name: 'default', span: node.span };
          visit(
            decl,
            {
              ...context,
              exportKind: 'default',
              scopeChain: exportScope,
              exportSpan: node.span,
              enclosingContexts: prependContext(baseEnclosing, exportEntry)
            },
            currentPath.concat('declaration')
          );
        }
        break;
      }
      case 'ExportDefaultExpression': {
        const exportScope = extendScopeChain(currentScope, ['exports', 'default']);
        if (node.expression) {
          const exportEntry = { kind: 'export', name: 'default', span: node.span };
          visit(
            node.expression,
            {
              ...context,
              exportKind: 'default',
              scopeChain: exportScope,
              exportSpan: node.span,
              enclosingContexts: prependContext(baseEnclosing, exportEntry)
            },
            currentPath.concat('expression')
          );
        }
        break;
      }
      case 'VariableDeclaration': {
        const bindingKind = node.kind || 'var';
        const declarationPathSegments = currentPath.slice();
        const declContext = {
          ...context,
          bindingKind,
          declarationSpan: node.span,
          declarationPathSegments
        };
        if (Array.isArray(node.declarations)) {
          node.declarations.forEach((decl, index) => {
            visit(decl, declContext, currentPath.concat(`declarations[${index}]`));
          });
        }
        break;
      }
      case 'VariableDeclarator': {
        const bindingKind = context.bindingKind || 'var';
        const initializerType = node.init ? node.init.type : null;
        const names = extractBindingNames(node.id, []);
        if (names.length === 0 && node.id && node.id.type === 'Identifier') {
          names.push({ name: node.id.value, span: node.id.span });
        }
        names.forEach((binding, index) => {
          if (!binding || !binding.name) return;
          const span = binding.span || node.id?.span || node.span;
          recordVariable(variables, source, {
            name: binding.name,
            span,
            lineIndex,
            byteIndex,
            sourceBuffer,
            mapper: sourceMapper,
            scopeChain: currentScope,
            exportKind: context.exportKind || null,
            bindingKind,
            pathSegments: currentPath.concat(`binding[${index}]`),
            nodeType: type,
            initializerType,
            enclosingContexts: baseEnclosing,
            declaratorSpan: node.span,
            declaratorPathSegments: currentPath,
            declarationSpan: context.declarationSpan || null,
            declarationPathSegments: context.declarationPathSegments || null
          });
        });
        if (node.init) {
          visit(node.init, { ...context, enclosingContexts: baseEnclosing }, currentPath.concat('init'));
        }
        break;
      }
      case 'AssignmentExpression': {
        const target = resolveExportsAssignmentTarget(node.left);
        const right = node.right;
        const exportEntry = target
          ? {
              kind: target.base,
              name: target.displayName,
              span: node.span
            }
          : null;

        if (target) {
          const exportKind = target.base === 'module.exports'
            ? target.propertyChain.length > 0
              ? 'commonjs-named'
              : 'commonjs-default'
            : 'commonjs-named';
          const scopePrefix = Array.isArray(target.scopeChain) ? target.scopeChain.slice() : [];
          const variableName = scopePrefix.length > 0 ? scopePrefix.pop() : target.name;
          const scopeChain = extendScopeChain(currentScope, scopePrefix);
          const recordSpan = node.left && node.left.span ? node.left.span : node.span;

          recordVariable(variables, source, {
            name: variableName,
            span: recordSpan,
            lineIndex,
            byteIndex,
            sourceBuffer,
            mapper: sourceMapper,
            scopeChain,
            exportKind,
            bindingKind: 'assignment',
            pathSegments: currentPath,
            nodeType: type,
            initializerType: right ? right.type || null : null,
            enclosingContexts: exportEntry ? prependContext(baseEnclosing, exportEntry) : baseEnclosing,
            declaratorSpan: node.left && node.left.span ? node.left.span : recordSpan,
            declaratorPathSegments: currentPath.concat('left'),
            declarationSpan: node.span,
            declarationPathSegments: currentPath
          });
        }

        if (node.left) {
          visit(node.left, context, currentPath.concat('left'));
        }
        if (right) {
          const nextContext = target
            ? {
                ...context,
                scopeChain: extendScopeChain(currentScope, target.scopeChain),
                enclosingContexts: exportEntry ? prependContext(baseEnclosing, exportEntry) : baseEnclosing
              }
            : context;
          visit(right, nextContext, currentPath.concat('right'));
        }
        break;
      }
      default: {
        for (const key of Object.keys(node)) {
          if (key === 'span') continue;
          const value = node[key];
          if (Array.isArray(value)) {
            value.forEach((child, index) => {
              visit(child, { ...context, enclosingContexts: baseEnclosing }, currentPath.concat(`${key}[${index}]`));
            });
          } else if (value && typeof value === 'object') {
            visit(value, { ...context, enclosingContexts: baseEnclosing }, currentPath.concat(key));
          }
        }
      }
    }
  }

  visit(ast, { scopeChain: [], exportKind: null, bindingKind: null, className: null, enclosingContexts: [] }, ['module']);

  variables.sort((a, b) => a.span.start - b.span.start);
  return { variables, lineIndex, mapper: sourceMapper };
}

function extractCode(source, span, mappingContext = null) {
  if (typeof source !== 'string') {
    return '';
  }
  const context = mappingContext || buildByteIndex(source);
  const { start, end } = normalizeSpan(span, context);
  return source.slice(start, end);
}

function replaceSpan(source, span, replacement, mappingContext = null) {
  if (typeof source !== 'string') {
    return replacement;
  }
  const context = mappingContext || buildByteIndex(source);
  const { start, end } = normalizeSpan(span, context);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

module.exports = {
  parseModule,
  collectFunctions,
  collectVariables,
  extractCode,
  replaceSpan,
  normalizeSpan,
  createSpanKey,
  computeHash,
  createDigest,
  createByteMapper,
  resolveByteMapper,
  HASH_PRIMARY_ENCODING,
  HASH_FALLBACK_ENCODING,
  HASH_LENGTH_BY_ENCODING,
  HASH_BYTE_LENGTH,
  normalizeHashEncoding,
  encodeHash
};
