#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CliFormatter } = require('../../src/utils/CliFormatter');
const { CliArgumentParser } = require('../../src/utils/CliArgumentParser');
const {
  parseModule,
  collectFunctions,
  collectVariables,
  extractCode,
  replaceSpan,
  createDigest,
  HASH_PRIMARY_ENCODING,
  HASH_FALLBACK_ENCODING,
  HASH_LENGTH_BY_ENCODING
} = require('./lib/swcAst');

const fmt = new CliFormatter();
const DEFAULT_CONTEXT_PADDING = 512;
const CONTEXT_ENCLOSING_MODES = new Set(['exact', 'class', 'function']);
const FUNCTION_CONTEXT_KINDS = new Set(['function-declaration', 'function-expression', 'arrow-function', 'class-method']);
const VARIABLE_TARGET_MODES = new Set(['binding', 'declarator', 'declaration']);
function isFunctionContextKind(kind) {
  if (!kind) return false;
  if (FUNCTION_CONTEXT_KINDS.has(kind)) return true;
  if (typeof kind === 'string') {
    return kind.includes('function') || kind.includes('method');
  }
  return false;
}

function getEnclosingContexts(record) {
  return Array.isArray(record?.enclosingContexts) ? record.enclosingContexts : [];
}

function findEnclosingContext(record, predicate) {
  const contexts = getEnclosingContexts(record);
  return contexts.find(predicate) || null;
}

function cloneEnclosingContexts(record) {
  return getEnclosingContexts(record).map((ctx) => ({
    kind: ctx.kind || null,
    name: ctx.name || null,
    span: ctx.span
  }));
}

const HASH_CHARSETS = Object.freeze({
  base64: /^[A-Za-z0-9+/]+$/,
  hex: /^[0-9a-f]+$/i
});

function computeNewlineStats(content) {
  if (typeof content !== 'string' || content.length === 0) {
    return {
      style: 'none',
      total: 0,
      counts: { lf: 0, crlf: 0, cr: 0 },
      mixed: false,
      uniqueStyles: 0
    };
  }

  let lf = 0;
  let crlf = 0;
  let cr = 0;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    if (code === 13) {
      if (content.charCodeAt(index + 1) === 10) {
        crlf += 1;
        index += 1;
      } else {
        cr += 1;
      }
    } else if (code === 10) {
      lf += 1;
    }
  }

  const counts = { lf, crlf, cr };
  const total = lf + crlf + cr;
  if (total === 0) {
    return {
      style: 'none',
      total: 0,
      counts,
      mixed: false,
      uniqueStyles: 0
    };
  }

  const uniqueStyles = Number(lf > 0) + Number(crlf > 0) + Number(cr > 0);
  let style = 'lf';
  if (crlf >= lf && crlf >= cr && crlf > 0) {
    style = 'crlf';
  } else if (cr > lf && cr > crlf) {
    style = 'cr';
  }

  return {
    style,
    total,
    counts,
    mixed: uniqueStyles > 1,
    uniqueStyles
  };
}

function resolveTargetNewlineStyle(style) {
  if (style === 'crlf' || style === 'lf' || style === 'cr') {
    return style;
  }
  return 'lf';
}

function newlineTokenForStyle(style) {
  switch (style) {
    case 'crlf':
      return "\r\n";
    case 'cr':
      return '\r';
    default:
      return '\n';
  }
}

function prepareNormalizedSnippet(snippet, targetStyle, options = {}) {
  const ensureTrailingNewline = options.ensureTrailingNewline === true;
  const resolvedTarget = resolveTargetNewlineStyle(targetStyle);
  const originalStats = computeNewlineStats(snippet);
  const originalBytes = Buffer.byteLength(snippet, 'utf8');

  let normalized = snippet;
  let converted = false;

  if (originalStats.total > 0) {
    const collapsed = snippet.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (collapsed !== snippet) {
      converted = true;
    }

    if (resolvedTarget === 'crlf') {
      normalized = collapsed.replace(/\n/g, '\r\n');
    } else if (resolvedTarget === 'cr') {
      normalized = collapsed.replace(/\n/g, '\r');
    } else {
      normalized = collapsed;
    }

    if (normalized !== snippet) {
      converted = true;
    }
  }

  const newlineToken = newlineTokenForStyle(resolvedTarget);
  let trailingAdded = false;

  if (ensureTrailingNewline) {
    if (!normalized.endsWith('\n') && !normalized.endsWith('\r')) {
      normalized += newlineToken;
      trailingAdded = true;
    } else if (!normalized.endsWith(newlineToken)) {
      const trimmed = normalized.replace(/(?:\r\n|\r|\n)$/, '');
      normalized = `${trimmed}${newlineToken}`;
      converted = true;
    }
  }

  const resultStats = computeNewlineStats(normalized);
  const normalizedBytes = Buffer.byteLength(normalized, 'utf8');

  return {
    text: normalized,
    original: originalStats,
    result: resultStats,
    targetStyle: resolvedTarget,
    converted: converted || trailingAdded,
    trailingAdded,
    originalBytes,
    normalizedBytes,
    byteDelta: normalizedBytes - originalBytes
  };
}

function summarizeNewlineStats(stats, bytes) {
  if (!stats) {
    return null;
  }

  return {
    style: stats.style,
    mixed: Boolean(stats.mixed),
    total: stats.total,
    counts: stats.counts || { lf: 0, crlf: 0, cr: 0 },
    uniqueStyles: stats.uniqueStyles || 0,
    bytes
  };
}

function createNewlineGuard(fileStats, snippetBefore, snippetAfter, replacementMeta) {
  const resolvedFileStats = fileStats || computeNewlineStats(snippetBefore);
  const beforeStats = computeNewlineStats(snippetBefore);
  const afterStats = computeNewlineStats(snippetAfter);
  const beforeBytes = Buffer.byteLength(snippetBefore, 'utf8');
  const afterBytes = Buffer.byteLength(snippetAfter, 'utf8');
  const byteDelta = afterBytes - beforeBytes;

  const conversionApplied = Boolean(
    replacementMeta && (replacementMeta.converted || replacementMeta.trailingAdded)
  );

  const status = resolvedFileStats.total === 0 && beforeStats.total === 0 && afterStats.total === 0
    ? 'none'
    : conversionApplied
      ? 'converted'
      : 'ok';

  return {
    status,
    file: summarizeNewlineStats(resolvedFileStats, null),
    original: summarizeNewlineStats(beforeStats, beforeBytes),
    result: summarizeNewlineStats(afterStats, afterBytes),
    byteDelta,
    replacement: replacementMeta
      ? {
          style: replacementMeta.original.style,
          mixed: replacementMeta.original.mixed,
          total: replacementMeta.original.total,
          counts: replacementMeta.original.counts,
          bytes: replacementMeta.originalBytes,
          normalizedStyle: replacementMeta.result.style,
          normalizedMixed: replacementMeta.result.mixed,
          normalizedTotal: replacementMeta.result.total,
          normalizedCounts: replacementMeta.result.counts,
          normalizedBytes: replacementMeta.normalizedBytes,
          converted: replacementMeta.converted,
          trailingNewlineAdded: replacementMeta.trailingAdded,
          byteDelta: replacementMeta.byteDelta,
          targetStyle: replacementMeta.targetStyle
        }
      : null
  };
}

function formatNewlineSummary(newlineGuard) {
  if (!newlineGuard) {
    return 'No newline analysis available';
  }

  const segments = [];
  if (newlineGuard.file?.style) {
    const suffix = newlineGuard.file.mixed ? ' (mixed)' : '';
    segments.push(`file ${newlineGuard.file.style.toUpperCase()}${suffix}`);
  }

  if (newlineGuard.replacement) {
    const suffix = newlineGuard.replacement.mixed ? ' (mixed)' : '';
    const target = newlineGuard.replacement.normalizedStyle
      ? ` -> ${newlineGuard.replacement.normalizedStyle.toUpperCase()}`
      : '';
    segments.push(`snippet ${newlineGuard.replacement.style.toUpperCase()}${suffix}${target}`);
    if (newlineGuard.replacement.trailingNewlineAdded) {
      segments.push('trailing newline added');
    }
  } else if (newlineGuard.original?.style) {
    const suffix = newlineGuard.original.mixed ? ' (mixed)' : '';
    segments.push(`snippet ${newlineGuard.original.style.toUpperCase()}${suffix}`);
  }

  if (newlineGuard.result?.style) {
    const suffix = newlineGuard.result.mixed ? ' (mixed)' : '';
    segments.push(`result ${newlineGuard.result.style.toUpperCase()}${suffix}`);
  }

  const delta = newlineGuard.byteDelta || 0;
  segments.push(`byte delta ${delta >= 0 ? '+' : ''}${delta}`);

  return segments.join(' | ');
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


function computeAggregateSpan(spans) {
  if (!Array.isArray(spans)) {
    return null;
  }

  let start = null;
  let end = null;
  let totalLength = 0;
  let byteStart = null;
  let byteEnd = null;
  let totalByteLength = 0;

  spans.forEach((span) => {
    if (!span || typeof span.start !== 'number' || typeof span.end !== 'number' || span.end <= span.start) {
      return;
    }

    if (start === null || span.start < start) {
      start = span.start;
    }
    if (end === null || span.end > end) {
      end = span.end;
    }

    totalLength += Math.max(0, span.end - span.start);

    const hasByteRange = typeof span.byteStart === 'number' && typeof span.byteEnd === 'number' && span.byteEnd > span.byteStart;
    if (hasByteRange) {
      if (byteStart === null || span.byteStart < byteStart) {
        byteStart = span.byteStart;
      }
      if (byteEnd === null || span.byteEnd > byteEnd) {
        byteEnd = span.byteEnd;
      }
      totalByteLength += Math.max(0, span.byteEnd - span.byteStart);
    }
  });

  if (start === null || end === null) {
    return null;
  }

  return {
    start,
    end,
    totalLength,
    byteStart,
    byteEnd,
    totalByteLength: byteStart !== null && byteEnd !== null ? totalByteLength : null
  };
}


function formatAggregateSpan(aggregate) {
  if (!aggregate) {
    return null;
  }

  const segments = [];
  const charSegment = formatSpanRange('chars', aggregate.start, aggregate.end, aggregate.totalLength);
  if (charSegment) {
    segments.push(charSegment);
  }

  const byteSegment = formatSpanRange(
    'bytes',
    aggregate.byteStart,
    aggregate.byteEnd,
    aggregate.totalByteLength
  );
  if (byteSegment) {
    segments.push(byteSegment);
  }

  if (segments.length === 0) {
    return null;
  }

  return segments.join('\n');
}


function formatSpanRange(label, start, end, length, expectedStart = null, expectedEnd = null) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }

  const normalizedLength = Number.isFinite(length) ? length : Math.max(0, end - start);
  const parts = [`${label} ${start}-${end}`, `len ${normalizedLength}`];
  if (Number.isFinite(expectedStart) && Number.isFinite(expectedEnd)) {
    parts.push(`expected ${expectedStart}-${expectedEnd}`);
  }
  return parts.join(' | ');
}

function formatSpanDetails(span) {
  if (!span) {
    return null;
  }

  const segments = [];
  const charSegment = formatSpanRange('chars', span.start, span.end, span.length, span.expectedStart, span.expectedEnd);
  if (charSegment) {
    segments.push(charSegment);
  }

  const byteStart = typeof span.byteStart === 'number' ? span.byteStart : null;
  const byteEnd = typeof span.byteEnd === 'number' ? span.byteEnd : null;
  const byteSegment = formatSpanRange('bytes', byteStart, byteEnd, span.byteLength, span.expectedByteStart, span.expectedByteEnd);
  if (byteSegment) {
    segments.push(byteSegment);
  }

  if (segments.length === 0) {
    return null;
  }

  return segments.join('\n');
}


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

function applyRenameToSnippet(snippet, record, newName) {
  if (!record.identifierSpan) {
    throw new Error('Renaming requires the target function to have a named identifier.');
  }

  const relativeStart = record.identifierSpan.start - record.span.start;
  const relativeEnd = record.identifierSpan.end - record.span.start;

  if (relativeStart < 0 || relativeEnd > snippet.length) {
    throw new Error('Unable to map identifier span while renaming. The function structure may have changed.');
  }

  const slice = snippet.slice(relativeStart, relativeEnd);
  const identifierMatch = /[A-Za-z_$][A-Za-z0-9_$]*/.exec(slice);

  if (!identifierMatch) {
    throw new Error('Unable to locate identifier token while renaming.');
  }

  const tokenStart = relativeStart + identifierMatch.index;
  const tokenEnd = tokenStart + identifierMatch[0].length;

  return `${snippet.slice(0, tokenStart)}${newName}${snippet.slice(tokenEnd)}`;
}


function toReadableScope(scopeChain) {
  if (!Array.isArray(scopeChain) || scopeChain.length === 0) return '-';
  return scopeChain.join(' > ');
}

function buildSelectorSet(fn) {
  const selectors = new Set();
  const add = (value) => {
    if (value && typeof value === 'string') {
      selectors.add(value);
    }
  };

  add(fn.name);
  add(fn.canonicalName);
  add(fn.pathSignature);
  add(`path:${fn.pathSignature}`);
  add(fn.hash);
  add(`hash:${fn.hash}`);

  if (Array.isArray(fn.scopeChain) && fn.scopeChain.length > 0) {
    add(fn.scopeChain.join(' > '));
    const withoutExports = fn.scopeChain.filter((part) => part !== 'exports');
    if (withoutExports.length > 0) {
      add(withoutExports.join(' > '));
      const owner = withoutExports[0];
      const descriptor = withoutExports[1];
      const remainder = withoutExports.slice(2);
      if (descriptor) {
        if (descriptor.startsWith('#')) {
          const method = descriptor.slice(1);
          add(`${owner}#${method}`);
          add(`${owner}::${method}`);
        } else if (descriptor === 'static') {
          const method = remainder[0];
          if (method) {
            add(`${owner}.${method}`);
            add(`${owner}::${method}`);
          }
        } else if (descriptor === 'get' || descriptor === 'set') {
          const property = remainder[0];
          if (property) {
            add(`${owner}::${property}`);
          }
        } else {
          add(`${owner}.${descriptor}`);
          add(`${owner}#${descriptor}`);
        }
      }

      if (withoutExports.length >= 3) {
        const nested = withoutExports.slice(1).join(' > ');
        add(`${owner} > ${nested}`);
      }
    }
  }

  return selectors;
}

function buildFunctionRecords(functions) {
  return functions.map((fn, index) => ({
    ...fn,
    index,
    selectors: buildSelectorSet(fn)
  }));
}

function buildVariableSelectorSet(variable) {
  const selectors = new Set();
  const add = (value) => {
    if (value && typeof value === 'string') {
      selectors.add(value);
    }
  };

  add(variable.name);
  if (variable.hash) {
    add(variable.hash);
    add(`hash:${variable.hash}`);
  }
  if (variable.pathSignature) {
    add(variable.pathSignature);
    add(`path:${variable.pathSignature}`);
  }
  if (variable.declaratorPathSignature && variable.declaratorPathSignature !== variable.pathSignature) {
    add(variable.declaratorPathSignature);
    add(`path:${variable.declaratorPathSignature}`);
  }
  if (variable.declarationPathSignature && variable.declarationPathSignature !== variable.pathSignature) {
    add(variable.declarationPathSignature);
    add(`path:${variable.declarationPathSignature}`);
  }
  if (variable.declaratorHash && variable.declaratorHash !== variable.hash) {
    add(variable.declaratorHash);
    add(`hash:${variable.declaratorHash}`);
    add(`declarator-hash:${variable.declaratorHash}`);
  }
  if (variable.declarationHash && variable.declarationHash !== variable.hash && variable.declarationHash !== variable.declaratorHash) {
    add(variable.declarationHash);
    add(`hash:${variable.declarationHash}`);
    add(`declaration-hash:${variable.declarationHash}`);
  }

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
      canonicalName,
      selectors: buildVariableSelectorSet(variable)
    };
  });
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


function findMatchesForSelector(functionRecords, rawSelector) {
  const selector = rawSelector.trim();
  const candidates = [selector];
  if (selector.startsWith('path:')) {
    candidates.push(selector.slice(5));
  } else if (selector.startsWith('hash:')) {
    candidates.push(selector.slice(5));
  }

  return functionRecords.filter((record) => {
    for (const candidate of candidates) {
      if (record.selectors.has(candidate)) {
        return true;
      }
    }
    return false;
  });
}

function resolveMatches(functionRecords, selector, options, { operation }) {
  if (!selector || !selector.trim()) {
    throw new Error('Provide a non-empty selector.');
  }

  const matches = findMatchesForSelector(functionRecords, selector);
  if (matches.length === 0) {
    throw new Error(`No functions matched selector "${selector}".`);
  }

  let resolved = matches;

  if (options.selectPath) {
    resolved = resolved.filter((record) => record.pathSignature === options.selectPath);
    if (resolved.length === 0) {
      throw new Error(`No functions matched selector "${selector}" with path "${options.selectPath}".`);
    }
  }

  resolved = resolved.slice().sort((a, b) => a.index - b.index);

  if (typeof options.selectIndex === 'number') {
    const idx = options.selectIndex - 1;
    if (idx < 0 || idx >= resolved.length) {
      throw new Error(`Selection index ${options.selectIndex} is out of range (matched ${resolved.length}).`);
    }
    resolved = [resolved[idx]];
  }

  const requireUnique = (operation === 'locate' || operation === 'context') ? !options.allowMultiple : true;

  if (requireUnique && resolved.length !== 1) {
    const details = resolved
      .map((record) => `${record.canonicalName} (${record.kind}) @ ${record.line}:${record.column}`)
      .join('\n  - ');
    throw new Error(`Selector "${selector}" matched ${resolved.length} functions. Use --select or --select-path to disambiguate.\n  - ${details}`);
  }

  return requireUnique ? resolved.slice(0, 1) : resolved;
}

function resolveVariableMatches(variableRecords, selector, options, { operation }) {
  if (!selector || !selector.trim()) {
    throw new Error('Provide a non-empty selector.');
  }

  const matches = findMatchesForSelector(variableRecords, selector.trim());
  if (matches.length === 0) {
    throw new Error(`No variables matched selector "${selector}".`);
  }

  let resolved = matches;

  if (options.selectPath) {
    resolved = resolved.filter((record) => record.pathSignature === options.selectPath);
    if (resolved.length === 0) {
      throw new Error(`No variables matched selector "${selector}" with path "${options.selectPath}".`);
    }
  }

  resolved = resolved.slice().sort((a, b) => a.index - b.index);

  if (typeof options.selectIndex === 'number') {
    const idx = options.selectIndex - 1;
    if (idx < 0 || idx >= resolved.length) {
      throw new Error(`Selection index ${options.selectIndex} is out of range (matched ${resolved.length}).`);
    }
    resolved = [resolved[idx]];
  }

  const requireUnique = operation === 'context-variable' ? !options.allowMultiple : true;

  if (requireUnique && resolved.length !== 1) {
    const details = resolved
      .map((record) => `${record.canonicalName} (${record.kind}) @ ${record.line}:${record.column}`)
      .join('\n  - ');
    throw new Error(`Selector "${selector}" matched ${resolved.length} variables. Use --select or --select-path to disambiguate, or pass --allow-multiple.\n  - ${details}`);
  }

  return requireUnique ? resolved.slice(0, 1) : resolved;
}

function selectContextSpan(record, enclosingMode) {
  if (enclosingMode === 'class') {
    const match = findEnclosingContext(record, (ctx) => ctx.kind === 'class');
    if (match && match.span) {
      return { span: match.span, context: match };
    }
    if (record.enclosingKind === 'class' && record.enclosingSpan) {
      return {
        span: record.enclosingSpan,
        context: {
          kind: 'class',
          name: record.enclosingName || null,
          span: record.enclosingSpan
        }
      };
    }
  } else if (enclosingMode === 'function') {
    const match = findEnclosingContext(record, (ctx) => isFunctionContextKind(ctx.kind));
    if (match && match.span) {
      return { span: match.span, context: match };
    }
    if (record.enclosingKind && isFunctionContextKind(record.enclosingKind) && record.enclosingSpan) {
      return {
        span: record.enclosingSpan,
        context: {
          kind: record.enclosingKind,
          name: record.enclosingName || null,
          span: record.enclosingSpan
        }
      };
    }
  }

  return {
    span: record.span,
    context: null
  };
}

function computeContextRange(span, before, after, sourceLength) {
  const safeBefore = Math.max(0, before);
  const safeAfter = Math.max(0, after);
  const start = Math.max(0, span.start - safeBefore);
  const end = Math.min(sourceLength, span.end + safeAfter);
  return {
    start,
    end,
    appliedBefore: span.start - start,
    appliedAfter: end - span.end
  };
}

function createContextEntry(record, source, before, after, enclosingMode) {
  const { span: effectiveSpan, context: selectedContext } = selectContextSpan(record, enclosingMode);
  const contextSpan = effectiveSpan || record.span;
  const contextRange = computeContextRange(contextSpan, before, after, source.length);
  const contextSnippet = source.slice(contextRange.start, contextRange.end);
  const baseSnippet = extractCode(source, record.span);
  const relativeBaseStart = Math.max(0, record.span.start - contextRange.start);
  const relativeBaseEnd = Math.max(relativeBaseStart, relativeBaseStart + Math.max(0, record.span.end - record.span.start));
  return {
    record,
    contextRange,
    contextSnippet,
    baseSnippet,
    appliedBefore: contextRange.appliedBefore,
    appliedAfter: contextRange.appliedAfter,
    relativeBaseStart,
    relativeBaseEnd,
    contextHash: createDigest(contextSnippet),
    effectiveSpan: contextSpan,
    selectedEnclosingContext: selectedContext
      ? {
          kind: selectedContext.kind || null,
          name: selectedContext.name || null,
          span: selectedContext.span
        }
      : null
  };
}

function buildContextEntries(records, source, options) {
  const before = Number.isFinite(options.contextBefore) && options.contextBefore >= 0
    ? Math.floor(options.contextBefore)
    : DEFAULT_CONTEXT_PADDING;
  const after = Number.isFinite(options.contextAfter) && options.contextAfter >= 0
    ? Math.floor(options.contextAfter)
    : DEFAULT_CONTEXT_PADDING;
  const enclosingMode = options.contextEnclosing;

  const entries = records.map((record) => createContextEntry(record, source, before, after, enclosingMode));

  return {
    before,
    after,
    entries
  };
}

function buildContextPayload(type, selector, options, contextResult) {
  const requestedBefore = Number.isFinite(options.contextBefore) && options.contextBefore >= 0
    ? Math.floor(options.contextBefore)
    : DEFAULT_CONTEXT_PADDING;
  const requestedAfter = Number.isFinite(options.contextAfter) && options.contextAfter >= 0
    ? Math.floor(options.contextAfter)
    : DEFAULT_CONTEXT_PADDING;

  const contexts = contextResult.entries.map((entry) => {
    const { record } = entry;
    return {
      name: record.canonicalName || record.name,
      displayName: record.canonicalName || record.name,
      kind: record.kind,
      exportKind: record.exportKind || null,
      initializerType: record.initializerType || null,
      line: record.line,
      column: record.column,
      span: record.span,
      enclosing: record.enclosingKind
        ? {
            kind: record.enclosingKind,
            name: record.enclosingName || null,
            span: record.enclosingSpan
          }
        : null,
      pathSignature: record.pathSignature,
      scopeChain: record.scopeChain,
      hash: record.hash,
      contextRange: entry.contextRange,
      appliedPadding: {
        before: entry.appliedBefore,
        after: entry.appliedAfter
      },
      offsets: {
        baseStart: entry.relativeBaseStart,
        baseEnd: entry.relativeBaseEnd,
        length: entry.relativeBaseEnd - entry.relativeBaseStart
      },
      effectiveSpan: entry.effectiveSpan,
      selectedEnclosingContext: entry.selectedEnclosingContext,
      enclosingContexts: cloneEnclosingContexts(record),
      snippets: {
        context: entry.contextSnippet,
        base: entry.baseSnippet
      },
      hashes: {
        context: entry.contextHash,
        base: record.hash
      }
    };
  });

  return {
    file: options.filePath,
    selector,
    entity: type,
    padding: {
      requestedBefore,
      requestedAfter,
      appliedBefore: contextResult.before,
      appliedAfter: contextResult.after
    },
    enclosingMode: options.contextEnclosing,
    contexts
  };
}


function renderContextResults(type, selector, options, contextResult) {
  const payload = buildContextPayload(type, selector, options, contextResult);
  const spanRange = computeAggregateSpan(contextResult.entries.map((entry) => {
    if (!entry) {
      return null;
    }
    const candidate = entry.effectiveSpan || entry.record?.span;
    return candidate || null;
  }));
  const contextSpanRange = computeAggregateSpan(contextResult.entries.map((entry) => {
    if (!entry || !entry.contextRange) {
      return null;
    }
    return {
      start: entry.contextRange.start,
      end: entry.contextRange.end
    };
  }));

  payload.summary = {
    matchCount: contextResult.entries.length,
    spanRange,
    contextRange: contextSpanRange
  };

  if (options.json) {
    outputJson(payload);
    return;
  }

  if (options.quiet) {
    return;
  }

  const headerLabel = type === 'function' ? 'Function Context' : 'Variable Context';
  fmt.header(headerLabel);
  fmt.section(`Selector: ${selector}`);
  fmt.stat('Requested padding', `${payload.padding.requestedBefore} before / ${payload.padding.requestedAfter} after`);
  fmt.stat('Applied padding', `${contextResult.before} before / ${contextResult.after} after`);
  fmt.stat('Enclosing mode', options.contextEnclosing);
  const formattedSpanRange = formatAggregateSpan(spanRange);
  if (formattedSpanRange) {
    fmt.stat('Span range', formattedSpanRange);
  }
  const formattedContextRange = formatAggregateSpan(contextSpanRange);
  if (formattedContextRange) {
    fmt.stat('Context range', formattedContextRange);
  }

  contextResult.entries.forEach((entry, index) => {
    const { record } = entry;
    const title = `${type === 'function' ? 'Function' : 'Variable'} ${index + 1}: ${record.canonicalName || record.name}`;
    fmt.section(title);
    fmt.stat('Kind', record.kind);
    fmt.stat('Location', `${record.line}:${record.column}`);
    if (record.exportKind) fmt.stat('Export', record.exportKind);
    if (type === 'variable' && record.initializerType) {
      fmt.stat('Initializer', record.initializerType);
    }
    fmt.stat('Path', record.pathSignature);
    if (record.scopeChain && record.scopeChain.length > 0) {
      fmt.stat('Scope', record.scopeChain.join(' > '));
    }
    const baseSpanDetails = formatSpanDetails(record.span);
    if (baseSpanDetails) {
      fmt.stat('Span', baseSpanDetails);
    }
    const effectiveSpanDetails = formatSpanDetails(entry.effectiveSpan);
    if (effectiveSpanDetails) {
      const baseSpan = record.span || null;
      const effective = entry.effectiveSpan || null;
      const spansMatch = baseSpan && effective
        ? baseSpan.start === effective.start
          && baseSpan.end === effective.end
          && (typeof baseSpan.byteStart === 'number' ? baseSpan.byteStart : null) === (typeof effective.byteStart === 'number' ? effective.byteStart : null)
          && (typeof baseSpan.byteEnd === 'number' ? baseSpan.byteEnd : null) === (typeof effective.byteEnd === 'number' ? effective.byteEnd : null)
        : false;
      if (!spansMatch) {
        fmt.stat('Effective span', effectiveSpanDetails);
      }
    }
    const contextRange = entry.contextRange;
    if (contextRange) {
      const contextRangeSummary = formatSpanRange('chars', contextRange.start, contextRange.end, contextRange.end - contextRange.start);
      if (contextRangeSummary) {
        fmt.stat('Context window', contextRangeSummary);
      }
    }
    const availableContexts = getEnclosingContexts(record);
    if (availableContexts.length > 0) {
      const contextSummary = availableContexts
        .map((ctx) => {
          const contextName = ctx.name ? ` ${ctx.name}` : '';
          return `${ctx.kind || 'unknown'}${contextName}`;
        })
        .join(' | ');
      fmt.stat('Enclosing contexts', contextSummary);
    } else if (record.enclosingKind === 'class') {
      fmt.stat('Enclosing class', record.enclosingName || '(anonymous class)');
    }
    if (entry.selectedEnclosingContext) {
      const selected = entry.selectedEnclosingContext;
      const selectedName = selected.name ? ` ${selected.name}` : '';
      fmt.stat('Expanded to', `${selected.kind || 'unknown'}${selectedName}`);
    }
    fmt.section('Context Snippet');
    fmt.codeBlock(entry.contextSnippet);
    fmt.section('Base Snippet');
    fmt.codeBlock(entry.baseSnippet);
  });

  if (options.emitPlanPath) {
    fmt.info(`Plan written to ${options.emitPlanPath}`);
  }
  fmt.footer();
}



function renderGuardrailSummary(guard, options) {
  if (options.json || options.quiet) {
    return;
  }

  fmt.section('Guardrails');
  const formattedSpanDetails = formatSpanDetails(guard.span);
  const fallbackSegments = [];
  const fallbackChar = formatSpanRange(
    'chars',
    guard.span.start,
    guard.span.end,
    guard.span.length,
    guard.span.expectedStart,
    guard.span.expectedEnd
  );
  if (fallbackChar) {
    fallbackSegments.push(fallbackChar);
  }
  const fallbackByte = formatSpanRange(
    'bytes',
    guard.span.byteStart,
    guard.span.byteEnd,
    guard.span.byteLength,
    guard.span.expectedByteStart,
    guard.span.expectedByteEnd
  );
  if (fallbackByte) {
    fallbackSegments.push(fallbackByte);
  }
  const fallbackSpanDetails = fallbackSegments.length > 0 ? fallbackSegments.join('\n') : null;
  const spanDetails = formattedSpanDetails || fallbackSpanDetails;
  const rows = [
    {
      check: 'Span',
      status: guard.span.status.toUpperCase(),
      details: spanDetails
    },
    {
      check: 'Hash',
      status: guard.hash.status.toUpperCase(),
      details: guard.hash.status === 'ok'
        ? guard.hash.expected
        : `expected ${guard.hash.expected} received ${guard.hash.actual}`
    },
    {
      check: 'Path',
      status: guard.path.status.toUpperCase(),
      details: guard.path.signature
    },
    {
      check: 'Syntax',
      status: guard.syntax.status.toUpperCase(),
      details: guard.syntax.status === 'ok' ? 'Re-parse successful' : guard.syntax.message
    },
    {
      check: 'Result Hash',
      status: guard.result.status.toUpperCase(),
      details: guard.result.status === 'changed'
        ? guard.result.after
        : `${guard.result.after} (unchanged)`
    }
  ];

  if (guard.newline) {
    const newlineStatus = String(guard.newline.status || 'unknown').toUpperCase();
    rows.push({
      check: 'Newlines',
      status: newlineStatus,
      details: formatNewlineSummary(guard.newline)
    });
  }

  fmt.table(rows, {
    columns: ['check', 'status', 'details']
  });
}




function buildPlanPayload(operation, options, selector, records, expectedHashes = [], expectedSpans = [], extras = {}) {
  const toSpanPayload = (primarySpan, fallbackSpan) => {
    const hasPrimary = primarySpan && typeof primarySpan === 'object';
    const hasFallback = fallbackSpan && typeof fallbackSpan === 'object';

    const start = hasPrimary && typeof primarySpan.start === 'number'
      ? primarySpan.start
      : hasFallback && typeof fallbackSpan.start === 'number'
        ? fallbackSpan.start
        : null;

    const end = hasPrimary && typeof primarySpan.end === 'number'
      ? primarySpan.end
      : hasFallback && typeof fallbackSpan.end === 'number'
        ? fallbackSpan.end
        : null;

    let length = null;
    if (typeof start === 'number' && typeof end === 'number') {
      length = Math.max(0, end - start);
    } else if (hasFallback && typeof fallbackSpan.start === 'number' && typeof fallbackSpan.end === 'number') {
      length = Math.max(0, fallbackSpan.end - fallbackSpan.start);
    }

    const byteSource = hasPrimary && typeof primarySpan.byteStart === 'number' && typeof primarySpan.byteEnd === 'number'
      ? primarySpan
      : hasFallback && typeof fallbackSpan.byteStart === 'number' && typeof fallbackSpan.byteEnd === 'number'
        ? fallbackSpan
        : null;

    const byteStart = byteSource ? byteSource.byteStart : null;
    const byteEnd = byteSource ? byteSource.byteEnd : null;
    const byteLength = byteSource ? Math.max(0, byteEnd - byteStart) : null;

    return {
      start,
      end,
      length,
      byteStart,
      byteEnd,
      byteLength
    };
  };

  const matches = records.map((record, index) => {
    const defaultSpan = record.span || null;
    const spanPayload = toSpanPayload(defaultSpan, defaultSpan);
    const identifierSpanPayload = record.identifierSpan
      ? toSpanPayload(record.identifierSpan, defaultSpan)
      : null;
    const expectedSpanRaw = expectedSpans[index] || null;
    const expectedSpanPayload = expectedSpanRaw
      ? toSpanPayload(expectedSpanRaw, defaultSpan)
      : null;

    return {
      canonicalName: record.canonicalName,
      kind: record.kind,
      exportKind: record.exportKind,
      replaceable: record.replaceable,
      scopeChain: record.scopeChain,
      pathSignature: record.pathSignature,
      span: spanPayload,
      identifierSpan: identifierSpanPayload,
      line: record.line,
      column: record.column,
      hash: record.hash,
      expectedHash: expectedHashes[index] || record.hash,
      expectedSpan: expectedSpanPayload
    };
  });

  const aggregateSpans = matches.map((match) => {
    const expected = match.expectedSpan;
    if (expected && typeof expected.start === 'number' && typeof expected.end === 'number') {
      return expected;
    }
    if (match.span && typeof match.span.start === 'number' && typeof match.span.end === 'number') {
      return match.span;
    }
    return null;
  });

  const spanRange = computeAggregateSpan(aggregateSpans);
  const expectedHashList = expectedHashes.filter((value) => typeof value === 'string' && value.length > 0);

  const summary = {
    matchCount: matches.length,
    allowMultiple: Boolean(options.allowMultiple),
    spanRange
  };

  if (expectedHashList.length > 0) {
    summary.expectedHashes = expectedHashList;
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    operation,
    file: options.filePath,
    selector: selector || null,
    summary,
    matches,
    ...extras
  };
}



function maybeEmitPlan(operation, options, selector, records, expectedHashes = [], expectedSpans = [], extras = {}) {
  if (!options.emitPlanPath || !records || records.length === 0) {
    return null;
  }

  const plan = buildPlanPayload(operation, options, selector, records, expectedHashes, expectedSpans, extras);
  writeOutputFile(options.emitPlanPath, `${JSON.stringify(plan, null, 2)}\n`);
  return plan;
}


function parseCliArgs(argv) {
  const parser = new CliArgumentParser(
    'js-edit',
    'Inspect and edit JavaScript functions using SWC AST tooling.'
  );

  const hashDescriptor = formatHashDescriptor(getConfiguredHashEncodings()) || 'base64 (8 chars)';

  parser
    .add('--file <path>', 'JavaScript file to inspect or modify')
    .add('--list-functions', 'List detected functions with scope, hash, and byte-length metadata', false, 'boolean')
    .add('--include-paths', 'Include path signatures when listing functions', false, 'boolean')
    .add('--function-summary', 'Print aggregate metrics for detected functions', false, 'boolean')
    .add('--list-variables', 'List variable bindings with scope, initializer, and hash metadata', false, 'boolean')
    .add('--context-function <selector>', 'Show surrounding source for the function matching the selector (±512 chars by default)')
    .add('--context-variable <selector>', 'Show surrounding source for the variable binding matching the selector (±512 chars by default)')
    .add('--context-before <chars>', 'Override leading context character count (default 512)', undefined, 'number')
    .add('--context-after <chars>', 'Override trailing context character count (default 512)', undefined, 'number')
    .add('--context-enclosing <mode>', 'Expand context to enclosing structures (modes: exact, class, function). Default: exact.', 'exact')
    .add('--extract <selector>', 'Extract the function matching the selector (safe, read-only)')
    .add('--extract-hashes <hashes>', 'Extract functions matching the provided guard hashes (comma or space separated)')
    .add('--replace <selector>', 'Replace the function matching the selector (requires --with or --rename)')
    .add('--locate <selector>', 'Show guardrail metadata for functions matching the selector')
    .add('--locate-variable <selector>', 'Show guardrail metadata for the variable matching the selector')
    .add('--extract-variable <selector>', 'Extract the variable binding or declarator matching the selector')
    .add('--replace-variable <selector>', 'Replace the variable binding or declarator matching the selector (requires --with)')
    .add('--with <path>', 'Replacement source snippet used by --replace')
    .add('--replace-range <start:end>', 'Replace only the relative character range within the located function (0-based, end-exclusive)')
    .add('--rename <identifier>', 'Rename the targeted function identifier when the declaration exposes a name')
    .add('--output <path>', 'Write extracted function to this file instead of stdout')
    .add('--emit-plan <path>', 'Write resolved guard metadata (span, hash, path) to a JSON plan file')
    .add('--emit-diff', 'Show before/after snippets for replacements (dry-run friendly)', false, 'boolean')
    .add('--fix', 'Apply changes to the target file (default is dry-run)', false, 'boolean')
    .add('--expect-hash <hash>', `Require the target to match the configured guard hash before replacing (${hashDescriptor}).`)
    .add('--expect-span <start:end>', 'Require the located span offsets to match before replacing (0-based, end-exclusive)')
    .add('--force', 'Bypass guardrail validation (hash/path checks). Use sparingly.', false, 'boolean')
    .add('--json', 'Emit structured JSON output instead of formatted text', false, 'boolean')
    .add('--quiet', 'Suppress formatted output (implies --json)', false, 'boolean')
    .add('--benchmark', 'Measure parse time for the input file (diagnostic)', false, 'boolean')
    .add('--select <index>', 'Select the nth match when a selector resolves to multiple results (1-based)')
    .add('--select-path <signature>', 'Force selection to the node with the given path signature')
    .add('--allow-multiple', 'Allow selectors to resolve to multiple matches (locate/context/extract)', false, 'boolean')
    .add('--variable-target <mode>', 'Variable target span: binding, declarator, or declaration (default: declarator)', 'declarator');

  return parser.parse(argv);
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

  let extractHashes = [];
  if (resolved.extractHashes !== undefined && resolved.extractHashes !== null) {
    const rawValues = Array.isArray(resolved.extractHashes)
      ? resolved.extractHashes
      : [resolved.extractHashes];

    const tokens = rawValues
      .map((value) => String(value))
      .join(' ')
      .split(/[\s,]+/)
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
    ['--function-summary', functionSummary],
    ['--extract-hashes', extractHashes.length > 0],
    ['--list-variables', Boolean(resolved.listVariables)],
    ['--context-function', resolved.contextFunction !== undefined && resolved.contextFunction !== null],
    ['--context-variable', resolved.contextVariable !== undefined && resolved.contextVariable !== null],
    ['--extract', resolved.extract !== undefined && resolved.extract !== null],
    ['--replace', resolved.replace !== undefined && resolved.replace !== null],
    ['--locate', resolved.locate !== undefined && resolved.locate !== null],
    ['--locate-variable', resolved.locateVariable !== undefined && resolved.locateVariable !== null],
    ['--extract-variable', resolved.extractVariable !== undefined && resolved.extractVariable !== null],
    ['--replace-variable', resolved.replaceVariable !== undefined && resolved.replaceVariable !== null]
  ];

  const enabledOperations = operationMatrix.filter(([, flag]) => Boolean(flag));
  if (enabledOperations.length === 0) {
    throw new Error('Provide one of --list-functions, --function-summary, --extract-hashes <hashes>, --list-variables, --context-function <selector>, --context-variable <selector>, --extract <selector>, --replace <selector>, --locate <selector>, --locate-variable <selector>, --extract-variable <selector>, or --replace-variable <selector>.');
  }
  if (enabledOperations.length > 1) {
    const flags = enabledOperations.map(([flag]) => flag).join(', ');
    throw new Error(`Only one operation may be specified at a time. Found: ${flags}.`);
  }

  const emitDiff = Boolean(resolved.emitDiff);
  const fix = Boolean(resolved.fix);
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
  if (resolved.select !== undefined && resolved.select !== null) {
    const parsed = Number(resolved.select);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error('--select must be a positive integer (1-based index).');
    }
    selectIndex = parsed;
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
  if (resolved.with !== undefined && resolved.with !== null) {
    const snippetPath = String(resolved.with).trim();
    if (!snippetPath) {
      throw new Error('--with requires a file path.');
    }
    replacementPath = path.isAbsolute(snippetPath)
      ? snippetPath
      : path.resolve(process.cwd(), snippetPath);
  }

  const hasFunctionReplace = Boolean(replaceSelector);
  const hasVariableReplace = Boolean(replaceVariableSelector);

  if (replacementPath && !hasFunctionReplace && !hasVariableReplace) {
    throw new Error('--with can only be used with --replace or --replace-variable.');
  }

  if (hasFunctionReplace) {
    if (!replacementPath && !renameTo && !replaceRange) {
      throw new Error('Replacing a function requires either --with <path>, --replace-range, or --rename <identifier>.');
    }
    if (replaceRange && !replacementPath) {
      throw new Error('--replace-range requires --with <path> containing the replacement snippet.');
    }
    if (renameTo && replacementPath) {
      throw new Error('Provide either --rename or --with/--replace-range in a single command, not both.');
    }
  }

  if (hasVariableReplace && !replacementPath) {
    throw new Error('--replace-variable requires --with <path> containing the replacement snippet.');
  }
  if (hasVariableReplace && renameTo) {
    throw new Error('--rename is not supported with --replace-variable.');
  }
  if (hasVariableReplace && replaceRange) {
    throw new Error('--replace-range is not supported with --replace-variable.');
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
    list: Boolean(resolved.listFunctions),
    listVariables: Boolean(resolved.listVariables),
    contextFunctionSelector,
    contextVariableSelector,
    extractSelector,
    replaceSelector,
    locateSelector,
    locateVariableSelector,
    replacementPath,
    outputPath,
    emitPlanPath,
    emitDiff,
    json,
    quiet,
    benchmark,
    fix,
    force,
    expectHash,
    expectSpan,
    selectIndex,
    selectPath,
    allowMultiple,
    replaceRange,
    renameTo,
    extractVariableSelector,
    replaceVariableSelector,
    variableTarget,
    contextBefore,
    contextAfter,
    contextEnclosing: contextEnclosingRaw,
    includePaths,
    extractHashes,
    functionSummary
  };
}




function readSource(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
    throw new Error(`Failed to read file: ${filePath}\n${error.message}`);
  }
}

function loadReplacementSource(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
    throw new Error(`Failed to read replacement snippet: ${filePath}\n${error.message}`);
  }
}

function writeOutputFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function outputJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function listFunctions({ filePath, json, quiet }, source, functions) {
  const payload = {
    file: filePath,
    totalFunctions: functions.length,
    functions: functions.map((fn) => {
      const byteLength = Math.max(0, (fn.span?.end ?? 0) - (fn.span?.start ?? 0));
      return {
        name: fn.name,
        canonicalName: fn.canonicalName,
        kind: fn.kind,
        exportKind: fn.exportKind,
        replaceable: fn.replaceable,
        line: fn.line,
        column: fn.column,
        scopeChain: fn.scopeChain,
        pathSignature: fn.pathSignature,
        hash: fn.hash,
        byteLength
      };
    })
  };

  if (json) {
    outputJson(payload);
    return;
  }

  if (!quiet) {
    fmt.header('Function Inventory');
    if (functions.length === 0) {
      fmt.warn('No functions detected in the supplied file.');
      return;
    }

    fmt.section('Detected Functions');
    fmt.table(functions.map((fn) => ({
      name: fn.name,
      kind: fn.kind,
      export: fn.exportKind || '-',
      line: fn.line,
      column: fn.column,
      bytes: Math.max(0, (fn.span?.end ?? 0) - (fn.span?.start ?? 0)),
      replaceable: fn.replaceable ? 'yes' : 'no'
    })), {
      columns: ['name', 'kind', 'export', 'line', 'column', 'bytes', 'replaceable']
    });
    fmt.stat('Total functions', functions.length, 'number');
    fmt.footer();
  }
}

function listVariables({ filePath, json, quiet }, source, variables) {
  const payload = {
    file: filePath,
    totalVariables: variables.length,
    variables: variables.map((variable) => ({
      name: variable.name,
      kind: variable.kind,
      exportKind: variable.exportKind,
      line: variable.line,
      column: variable.column,
      scopeChain: variable.scopeChain,
      pathSignature: variable.pathSignature,
      initializerType: variable.initializerType,
      hash: variable.hash,
      byteLength: variable.byteLength,
      declaratorSpan: variable.declaratorSpan,
      declaratorHash: variable.declaratorHash,
      declaratorByteLength: variable.declaratorByteLength,
      declaratorPathSignature: variable.declaratorPathSignature,
      declarationSpan: variable.declarationSpan,
      declarationHash: variable.declarationHash,
      declarationByteLength: variable.declarationByteLength,
      declarationPathSignature: variable.declarationPathSignature
    }))
  };

  if (json) {
    outputJson(payload);
    return;
  }

  if (!quiet) {
    fmt.header('Variable Inventory');
    if (variables.length === 0) {
      fmt.warn('No variables detected in the supplied file.');
      return;
    }

    fmt.section('Detected Variables');
    fmt.table(variables.map((variable) => ({
      name: variable.name,
      kind: variable.kind,
      export: variable.exportKind || '-',
      line: variable.line,
      column: variable.column,
      scope: toReadableScope(variable.scopeChain),
      init: variable.initializerType || '-',
      bytes: typeof variable.byteLength === 'number'
        ? variable.byteLength
        : Math.max(0, (variable.span?.end ?? 0) - (variable.span?.start ?? 0))
    })), {
      columns: ['name', 'kind', 'export', 'line', 'column', 'scope', 'init', 'bytes']
    });
    fmt.stat('Total variables', variables.length, 'number');
    fmt.footer();
  }
}

function locateFunctions(options, functionRecords, selector) {
  const resolved = resolveMatches(functionRecords, selector, options, { operation: 'locate' });
  const plan = maybeEmitPlan('locate', options, selector, resolved);
  const spanRange = computeAggregateSpan(resolved.map((record) => {
    if (!record || !record.span) {
      return null;
    }
    return record.span;
  }));
  const payload = {
    file: options.filePath,
    selector,
    summary: {
      matchCount: resolved.length,
      spanRange
    },
    matches: resolved.map((record) => {
      const span = record.span || {};
      const spanPayload = {
        start: typeof span.start === 'number' ? span.start : null,
        end: typeof span.end === 'number' ? span.end : null,
        length: typeof span.start === 'number' && typeof span.end === 'number' ? Math.max(0, span.end - span.start) : null,
        byteStart: typeof span.byteStart === 'number' ? span.byteStart : null,
        byteEnd: typeof span.byteEnd === 'number' ? span.byteEnd : null,
        byteLength: typeof span.byteStart === 'number' && typeof span.byteEnd === 'number'
          ? Math.max(0, span.byteEnd - span.byteStart)
          : null
      };

      return {
        name: record.name,
        canonicalName: record.canonicalName,
        kind: record.kind,
        exportKind: record.exportKind,
        line: record.line,
        column: record.column,
        pathSignature: record.pathSignature,
        hash: record.hash,
        scopeChain: record.scopeChain,
        span: spanPayload
      };
    })
  };

  if (plan) {
    payload.plan = plan;
  }

  if (options.json) {
    outputJson(payload);
    return;
  }

  if (!options.quiet) {
    fmt.header('Function Locate');
    fmt.section(`Selector: ${selector}`);
    fmt.table(payload.matches.map((match, index) => {
      const charSummary = formatSpanRange('chars', match.span.start, match.span.end, match.span.length);
      const byteSummary = formatSpanRange('bytes', match.span.byteStart, match.span.byteEnd, match.span.byteLength);

      return {
        index: index + 1,
        name: match.canonicalName || match.name,
        kind: match.kind,
        line: match.line,
        column: match.column,
        chars: charSummary || '-',
        bytes: byteSummary || '-',
        path: match.pathSignature,
        hash: match.hash.slice(0, 12)
      };
    }), {
      columns: ['index', 'name', 'kind', 'line', 'column', 'chars', 'bytes', 'path', 'hash']
    });
    fmt.stat('Matches', payload.summary.matchCount, 'number');
    const formattedSpanRange = formatAggregateSpan(payload.summary.spanRange);
    if (formattedSpanRange) {
      fmt.stat('Span range', formattedSpanRange);
    }
    if (options.emitPlanPath) {
      fmt.info(`Plan written to ${options.emitPlanPath}`);
    }
    fmt.footer();
  }
}




function locateVariables(options, variableRecords, selector) {
  const resolved = resolveVariableMatches(variableRecords, selector, options, { operation: 'locate-variable' });
  const targets = resolved.map((record) => resolveVariableTargetInfo(record, options.variableTarget));
  const expectedHashes = targets.map((target) => target.hash);
  const expectedSpans = targets.map((target) => target.span);
  const plan = maybeEmitPlan('locate-variable', options, selector, resolved, expectedHashes, expectedSpans, {
    entity: 'variable',
    targetMode: options.variableTarget
  });

  const spanRange = computeAggregateSpan(targets.map((target) => {
    if (!target || !target.span) {
      return null;
    }
    return target.span;
  }));

  const matches = resolved.map((record, index) => {
    const target = targets[index];
    const span = target.span || {};
    const spanPayload = {
      start: typeof span.start === 'number' ? span.start : null,
      end: typeof span.end === 'number' ? span.end : null,
      length: typeof span.start === 'number' && typeof span.end === 'number' ? Math.max(0, span.end - span.start) : null,
      byteStart: typeof span.byteStart === 'number' ? span.byteStart : null,
      byteEnd: typeof span.byteEnd === 'number' ? span.byteEnd : null,
      byteLength: typeof span.byteStart === 'number' && typeof span.byteEnd === 'number'
        ? Math.max(0, span.byteEnd - span.byteStart)
        : null
    };

    return {
      name: record.canonicalName || record.name,
      canonicalName: record.canonicalName || record.name,
      kind: record.kind,
      initializerType: record.initializerType || null,
      line: record.line,
      column: record.column,
      scopeChain: record.scopeChain,
      pathSignature: target.pathSignature,
      hash: target.hash,
      span: spanPayload,
      targetMode: target.mode,
      requestedMode: target.requestedMode
    };
  });

  const payload = {
    file: options.filePath,
    selector,
    targetMode: options.variableTarget,
    summary: {
      matchCount: matches.length,
      spanRange
    },
    matches
  };

  if (plan) {
    payload.plan = plan;
  }

  if (options.json) {
    outputJson(payload);
    return;
  }

  if (!options.quiet) {
    fmt.header('Variable Locate');
    fmt.section(`Selector: ${selector}`);
    fmt.stat('Target Mode', `${options.variableTarget}`);
    fmt.table(matches.map((match, index) => {
      const charSummary = formatSpanRange('chars', match.span.start, match.span.end, match.span.length);
      const byteSummary = formatSpanRange('bytes', match.span.byteStart, match.span.byteEnd, match.span.byteLength);

      return {
        index: index + 1,
        name: match.name,
        kind: match.kind,
        line: match.line,
        column: match.column,
        mode: match.targetMode,
        chars: charSummary || '-',
        bytes: byteSummary || '-',
        path: match.pathSignature,
        hash: match.hash ? match.hash.slice(0, 12) : '-'
      };
    }), {
      columns: ['index', 'name', 'kind', 'line', 'column', 'mode', 'chars', 'bytes', 'path', 'hash']
    });
    fmt.stat('Matches', payload.summary.matchCount, 'number');
    const formattedSpanRange = formatAggregateSpan(payload.summary.spanRange);
    if (formattedSpanRange) {
      fmt.stat('Span range', formattedSpanRange);
    }
    if (options.emitPlanPath) {
      fmt.info(`Plan written to ${options.emitPlanPath}`);
    }
    fmt.footer();
  }
}




function extractFunction(options, source, record, selector) {
  const { filePath, outputPath, json, quiet } = options;
  const snippet = extractCode(source, record.span);

  const payload = {
    file: filePath,
    function: {
      name: record.name,
      canonicalName: record.canonicalName,
      kind: record.kind,
      line: record.line,
      column: record.column,
      exportKind: record.exportKind,
      replaceable: record.replaceable,
      pathSignature: record.pathSignature,
      hash: record.hash
    },
    code: snippet
  };

  const plan = maybeEmitPlan('extract', options, selector, [record]);
  if (plan) {
    payload.plan = plan;
  }

  if (outputPath) {
    writeOutputFile(outputPath, snippet);
  }

  if (json) {
    outputJson(payload);
    return;
  }

  if (!quiet) {
    fmt.header('Function Extract');
    fmt.section(`Function: ${record.canonicalName || record.name}`);
    fmt.stat('Kind', record.kind);
    fmt.stat('Location', `${record.line}:${record.column}`);
    if (record.exportKind) fmt.stat('Exported As', record.exportKind);
    fmt.stat('Path', record.pathSignature);
    fmt.stat('Hash', record.hash);
    if (outputPath) {
      fmt.stat('Written to', outputPath);
    }
    if (options.emitPlanPath) {
      fmt.info(`Plan written to ${options.emitPlanPath}`);
    }
    fmt.section('Source');
    process.stdout.write(`${snippet}\n`);
    fmt.footer();
  }
}

function extractVariable(options, source, record, selector) {
  const { filePath, outputPath, json, quiet } = options;
  const target = resolveVariableTargetInfo(record, options.variableTarget);
  const snippet = extractCode(source, target.span);

  const payload = {
    file: filePath,
    variable: {
      name: record.name,
      canonicalName: record.canonicalName,
      kind: record.kind,
      line: record.line,
      column: record.column,
      initializerType: record.initializerType || null,
      scopeChain: record.scopeChain,
      targetMode: target.mode,
      requestedMode: target.requestedMode,
      pathSignature: target.pathSignature,
      hash: target.hash,
      span: target.span
    },
    code: snippet
  };

  const plan = maybeEmitPlan('extract-variable', options, selector, [record], [target.hash], [target.span], {
    entity: 'variable',
    targetMode: target.mode
  });
  if (plan) {
    payload.plan = plan;
  }

  if (outputPath) {
    writeOutputFile(outputPath, snippet);
  }

  if (json) {
    outputJson(payload);
    return;
  }

  if (!quiet) {
    fmt.header('Variable Extract');
    fmt.section(`Variable: ${record.canonicalName || record.name}`);
    fmt.stat('Kind', record.kind);
    fmt.stat('Location', `${record.line}:${record.column}`);
    if (record.initializerType) fmt.stat('Initializer', record.initializerType);
    fmt.stat('Target Mode', `${target.mode} (requested ${target.requestedMode})`);
    fmt.stat('Path', target.pathSignature);
    fmt.stat('Hash', target.hash);
    fmt.stat('Span', `${target.span.start}:${target.span.end}`);
    if (outputPath) {
      fmt.stat('Written to', outputPath);
    }
    if (options.emitPlanPath) {
      fmt.info(`Plan written to ${options.emitPlanPath}`);
    }
    fmt.section('Source');
    process.stdout.write(`${snippet}\n`);
    fmt.footer();
  }
}

function showFunctionContext(options, source, functionRecords, selector) {
  const resolved = resolveMatches(functionRecords, selector, options, { operation: 'context' });
  const contextResult = buildContextEntries(resolved, source, options);
  const plan = maybeEmitPlan('context-function', options, selector, resolved, [], [], {
    entity: 'function',
    padding: {
      requestedBefore: Number.isFinite(options.contextBefore) && options.contextBefore >= 0
        ? Math.floor(options.contextBefore)
        : DEFAULT_CONTEXT_PADDING,
      requestedAfter: Number.isFinite(options.contextAfter) && options.contextAfter >= 0
        ? Math.floor(options.contextAfter)
        : DEFAULT_CONTEXT_PADDING,
      appliedBefore: contextResult.before,
      appliedAfter: contextResult.after
    },
    enclosingMode: options.contextEnclosing
  });
  renderContextResults('function', selector, options, contextResult);
}

function showVariableContext(options, source, variableRecords, selector) {
  const resolved = resolveVariableMatches(variableRecords, selector, options, { operation: 'context-variable' });
  const contextResult = buildContextEntries(resolved, source, options);
  const plan = maybeEmitPlan('context-variable', options, selector, resolved, [], [], {
    entity: 'variable',
    padding: {
      requestedBefore: Number.isFinite(options.contextBefore) && options.contextBefore >= 0
        ? Math.floor(options.contextBefore)
        : DEFAULT_CONTEXT_PADDING,
      requestedAfter: Number.isFinite(options.contextAfter) && options.contextAfter >= 0
        ? Math.floor(options.contextAfter)
        : DEFAULT_CONTEXT_PADDING,
      appliedBefore: contextResult.before,
      appliedAfter: contextResult.after
    },
    enclosingMode: options.contextEnclosing
  });
  renderContextResults('variable', selector, options, contextResult);
}

function replaceVariable(options, source, record, replacementPath, selector) {
  const target = resolveVariableTargetInfo(record, options.variableTarget);
  const snippetBefore = extractCode(source, target.span);
  const beforeHash = createDigest(snippetBefore);
  const expectedHash = options.expectHash || target.hash;
  if (process.env.JS_EDIT_DEBUG === '1') {
    console.log('[debug] target span', target.span);
    console.log('[debug] snippet before', JSON.stringify(snippetBefore));
    console.log('[debug] before hash', beforeHash);
    console.log('[debug] expected hash', expectedHash);
  }
  const hashStatus = beforeHash === expectedHash ? 'ok' : options.force ? 'bypass' : 'mismatch';

  const charLength = Math.max(0, target.span.end - target.span.start);
  const byteStart = typeof target.span.byteStart === 'number' ? target.span.byteStart : null;
  const byteEnd = typeof target.span.byteEnd === 'number' ? target.span.byteEnd : null;
  const byteLength = byteStart !== null && byteEnd !== null ? Math.max(0, byteEnd - byteStart) : null;

  const guard = {
    span: {
      status: 'ok',
      start: target.span.start,
      end: target.span.end,
      length: charLength,
      byteStart,
      byteEnd,
      byteLength,
      expectedStart: null,
      expectedEnd: null,
      expectedLength: null,
      expectedByteStart: null,
      expectedByteEnd: null,
      expectedByteLength: null
    },
    hash: {
      status: hashStatus,
      expected: expectedHash,
      actual: beforeHash
    },
    path: {
      status: target.pathSignature ? 'pending' : 'skipped',
      signature: target.pathSignature || '(unavailable)'
    },
    syntax: {
      status: 'pending'
    },
    result: {
      status: 'pending',
      before: beforeHash,
      after: null
    },
    newline: null
  };

  if (guard.hash.status === 'mismatch') {
    throw new Error(`Hash mismatch for variable "${record.canonicalName || record.name}". Expected ${expectedHash} but file contains ${beforeHash}. Re-run --locate-variable and retry or pass --force to override.`);
  }

  const fileNewlineStats = options.sourceNewline || computeNewlineStats(source);
  const replacementSource = loadReplacementSource(replacementPath);
  const normalizedReplacement = prepareNormalizedSnippet(
    replacementSource,
    fileNewlineStats.style,
    { ensureTrailingNewline: true }
  );
  const workingSnippet = normalizedReplacement.text;
  const replacementBuffer = Buffer.from(workingSnippet, 'utf8');
  const fallbackSpan = {
    start: target.span.start,
    end: target.span.start + workingSnippet.length,
    __normalized: true
  };
  if (typeof target.span.byteStart === 'number') {
    fallbackSpan.byteStart = target.span.byteStart;
    fallbackSpan.byteEnd = target.span.byteStart + replacementBuffer.length;
  }
  const fallbackTarget = {
    requestedMode: target.requestedMode,
    mode: target.mode,
    span: fallbackSpan,
    pathSignature: target.pathSignature || null,
    hash: createDigest(workingSnippet),
    byteLength: replacementBuffer.length
  };

  const newSource = replaceSpan(source, target.span, workingSnippet);

  let parsedAst;
  try {
    parsedAst = parseModule(newSource, options.filePath);
    guard.syntax = { status: 'ok' };
  } catch (error) {
    guard.syntax = { status: 'error', message: error.message };
    throw new Error(`Replacement produced invalid JavaScript: ${error.message}`);
  }

  let postTarget = null;
  let pathMatchFound = false;
  let fallbackUsed = false;

  if (target.pathSignature) {
    const { variables: postVariables } = collectVariables(parsedAst, newSource);
    const postRecords = buildVariableRecords(postVariables);

    for (const candidate of postRecords) {
      if (!variableRecordMatchesPath(candidate, target.pathSignature)) {
        continue;
      }

      pathMatchFound = true;

      try {
        const candidateTarget = resolveVariableTargetInfo(candidate, options.variableTarget);
        postTarget = {
          ...candidateTarget,
          pathSignature: candidateTarget.pathSignature || target.pathSignature
        };
      } catch (error) {
        fallbackUsed = true;
        postTarget = { ...fallbackTarget };
      }

      break;
    }

    if (!postTarget && pathMatchFound) {
      fallbackUsed = true;
      postTarget = { ...fallbackTarget };
    }

    if (postTarget) {
      guard.path = { status: 'ok', signature: target.pathSignature };
    } else {
      guard.path = {
        status: options.force ? 'bypass' : 'mismatch',
        signature: target.pathSignature
      };
      if (guard.path.status === 'mismatch') {
        throw new Error(`Path mismatch for variable "${record.canonicalName || record.name}". The target at ${target.pathSignature} no longer resolves after replacement. Use --force to override if intentional.`);
      }
    }
  }

  let snippetAfter;
  let afterHash;

  if (postTarget) {
    if (fallbackUsed) {
      snippetAfter = workingSnippet;
      afterHash = fallbackTarget.hash;
    } else {
      snippetAfter = extractCode(newSource, postTarget.span);
      afterHash = postTarget.hash || createDigest(snippetAfter);
    }
  } else {
    snippetAfter = workingSnippet;
    afterHash = createDigest(snippetAfter);
  }

  guard.result = {
    status: afterHash === beforeHash ? 'unchanged' : 'changed',
    before: beforeHash,
    after: afterHash
  };
  guard.newline = createNewlineGuard(fileNewlineStats, snippetBefore, snippetAfter, normalizedReplacement);

  const plan = maybeEmitPlan('replace-variable', options, selector, [record], [target.hash], [target.span], {
    entity: 'variable',
    targetMode: options.variableTarget,
    newline: guard.newline
  });

  const payload = {
    file: options.filePath,
    variable: {
      name: record.name,
      canonicalName: record.canonicalName,
      kind: record.kind,
      line: record.line,
      column: record.column,
      initializerType: record.initializerType || null,
      target: {
        requestedMode: target.requestedMode,
        resolvedMode: target.mode,
        span: target.span,
        pathSignature: target.pathSignature,
        hash: target.hash
      }
    },
    applied: Boolean(options.fix),
    guard
  };

  if (plan) {
    payload.plan = plan;
  }

  if (options.emitDiff) {
    payload.diff = {
      before: snippetBefore,
      after: snippetAfter
    };
  }

  if (options.fix) {
    writeOutputFile(options.filePath, newSource);
  }

  if (options.json) {
    outputJson(payload);
    return;
  }

  if (!options.quiet) {
    fmt.header('Variable Replacement');
    fmt.section(`Variable: ${record.canonicalName || record.name}`);
    fmt.stat('Kind', record.kind);
    fmt.stat('Location', `${record.line}:${record.column}`);
    if (record.initializerType) fmt.stat('Initializer', record.initializerType);
    fmt.stat('Target Mode', `${target.mode} (requested ${target.requestedMode})`);
    fmt.stat('Path', target.pathSignature || '(unavailable)');
    fmt.stat('Hash', target.hash);
    fmt.stat('Mode', options.fix ? 'applied' : 'dry-run');
    renderGuardrailSummary(guard, options);
    if (options.emitPlanPath) {
      fmt.info(`Plan written to ${options.emitPlanPath}`);
    }
    if (options.emitDiff) {
      fmt.section('Original');
      process.stdout.write(`${snippetBefore}\n`);
      fmt.section('Replacement');
      process.stdout.write(`${snippetAfter}\n`);
    }
    if (!options.fix) {
      fmt.warn('Dry-run: no changes were written. Re-run with --fix to apply.');
    } else {
      fmt.success(`Updated ${options.filePath}`);
    }
    fmt.footer();
  }
}




function replaceFunction(options, source, record, replacementPath, selector) {
  if (!record.replaceable) {
    throw new Error(
      `Function "${record.canonicalName || record.name}" is not currently replaceable. js-edit supports replacements for function declarations, default exports, and recognised call-site callbacks (describe/test hooks).`
    );
  }

  const snippetBefore = extractCode(source, record.span);
  const beforeHash = createDigest(snippetBefore);
  const expectedHash = options.expectHash || record.hash;
  const hashStatus = beforeHash === expectedHash ? 'ok' : options.force ? 'bypass' : 'mismatch';
  const fileNewlineStats = options.sourceNewline || computeNewlineStats(source);

  const expectedSpan = options.expectSpan;
  const actualStart = record.span.start;
  const actualEnd = record.span.end;
  const actualByteStart = typeof record.span.byteStart === 'number' ? record.span.byteStart : null;
  const actualByteEnd = typeof record.span.byteEnd === 'number' ? record.span.byteEnd : null;
  const expectedByteStart = expectedSpan && typeof expectedSpan.byteStart === 'number' ? expectedSpan.byteStart : null;
  const expectedByteEnd = expectedSpan && typeof expectedSpan.byteEnd === 'number' ? expectedSpan.byteEnd : null;
  const charLength = Math.max(0, actualEnd - actualStart);
  const byteLength = actualByteStart !== null && actualByteEnd !== null ? Math.max(0, actualByteEnd - actualByteStart) : null;
  const expectedLength = expectedSpan ? Math.max(0, expectedSpan.end - expectedSpan.start) : null;
  const expectedByteLength = expectedByteStart !== null && expectedByteEnd !== null ? Math.max(0, expectedByteEnd - expectedByteStart) : null;
  let spanStatus = 'ok';
  if (expectedSpan) {
    const matches = expectedSpan.start === actualStart && expectedSpan.end === actualEnd;
    if (!matches) {
      if (options.force) {
        spanStatus = 'bypass';
      } else {
        spanStatus = 'mismatch';
        throw new Error(`Span mismatch for "${record.canonicalName || record.name}". Expected ${expectedSpan.start}:${expectedSpan.end} but file contains ${actualStart}:${actualEnd}. Re-run --locate and retry or pass --force to override.`);
      }
    }
  }

  const guard = {
    span: {
      status: spanStatus,
      start: actualStart,
      end: actualEnd,
      length: charLength,
      byteStart: actualByteStart,
      byteEnd: actualByteEnd,
      byteLength,
      expectedStart: expectedSpan ? expectedSpan.start : null,
      expectedEnd: expectedSpan ? expectedSpan.end : null,
      expectedLength,
      expectedByteStart,
      expectedByteEnd,
      expectedByteLength
    },
    hash: {
      status: hashStatus,
      expected: expectedHash,
      actual: beforeHash
    },
    path: {
      status: 'pending',
      signature: record.pathSignature
    },
    syntax: {
      status: 'pending'
    },
    result: {
      status: 'pending',
      before: beforeHash,
      after: null
    },
    newline: null
  };

  if (guard.hash.status === 'mismatch') {
    throw new Error(`Hash mismatch for "${record.canonicalName || record.name}". Expected ${expectedHash} but file contains ${beforeHash}. Re-run --locate and retry or pass --force to override.`);
  }

  let workingSnippet = snippetBefore;
  let replacementMeta = null;

  if (options.replaceRange) {
    const { start, end } = options.replaceRange;
    if (end > workingSnippet.length) {
      throw new Error(`--replace-range end (${end}) exceeds the length of the target snippet (${workingSnippet.length}).`);
    }
    const rangeReplacementSource = loadReplacementSource(replacementPath);
    const normalizedRangeReplacement = prepareNormalizedSnippet(
      rangeReplacementSource,
      fileNewlineStats.style
    );
    workingSnippet = `${workingSnippet.slice(0, start)}${normalizedRangeReplacement.text}${workingSnippet.slice(end)}`;
    replacementMeta = normalizedRangeReplacement;
  } else if (replacementPath) {
    const replacementSource = loadReplacementSource(replacementPath);
    const normalizedReplacement = prepareNormalizedSnippet(
      replacementSource,
      fileNewlineStats.style,
      { ensureTrailingNewline: true }
    );
    workingSnippet = normalizedReplacement.text;
    replacementMeta = normalizedReplacement;
  }

  if (options.renameTo) {
    workingSnippet = applyRenameToSnippet(workingSnippet, record, options.renameTo);
  }

  const newSource = replaceSpan(source, record.span, workingSnippet);

  let parsedAst;
  try {
    parsedAst = parseModule(newSource, options.filePath);
    guard.syntax = { status: 'ok' };
  } catch (error) {
    guard.syntax = { status: 'error', message: error.message };
    throw new Error(`Replacement produced invalid JavaScript: ${error.message}`);
  }

  const { functions: postFunctions } = collectFunctions(parsedAst, newSource);
  const postRecord = postFunctions.find((fn) => fn.pathSignature === record.pathSignature) || null;
  if (postRecord) {
    guard.path = { status: 'ok', signature: record.pathSignature };
  } else {
    guard.path = {
      status: options.force ? 'bypass' : 'mismatch',
      signature: record.pathSignature
    };
    if (guard.path.status === 'mismatch') {
      throw new Error(`Path mismatch for "${record.canonicalName || record.name}". The node at ${record.pathSignature} no longer resolves after replacement. Use --force to override if intentional.`);
    }
  }

  const snippetAfter = postRecord ? extractCode(newSource, postRecord.span) : workingSnippet;
  const afterHash = postRecord ? postRecord.hash : createDigest(snippetAfter);
  guard.result = {
    status: afterHash === beforeHash ? 'unchanged' : 'changed',
    before: beforeHash,
    after: afterHash
  };
  guard.newline = createNewlineGuard(fileNewlineStats, snippetBefore, snippetAfter, replacementMeta);

  const plan = maybeEmitPlan(
    'replace',
    options,
    selector,
    [record],
    [expectedHash],
    [expectedSpan || null],
    {
      entity: 'function',
      newline: guard.newline
    }
  );

  const payload = {
    file: options.filePath,
    function: {
      name: record.name,
      canonicalName: record.canonicalName,
      kind: record.kind,
      line: record.line,
      column: record.column,
      exportKind: record.exportKind,
      pathSignature: record.pathSignature,
      hash: record.hash
    },
    applied: Boolean(options.fix),
    guard
  };

  if (plan) {
    payload.plan = plan;
  }

  if (options.emitDiff) {
    payload.diff = {
      before: snippetBefore,
      after: snippetAfter
    };
  }

  if (options.fix) {
    writeOutputFile(options.filePath, newSource);
  }

  if (options.json) {
    outputJson(payload);
    return;
  }

  if (!options.quiet) {
    fmt.header('Function Replacement');
    fmt.section(`Function: ${record.canonicalName || record.name}`);
    fmt.stat('Kind', record.kind);
    fmt.stat('Location', `${record.line}:${record.column}`);
    fmt.stat('Path', record.pathSignature);
    fmt.stat('Hash', record.hash);
    fmt.stat('Mode', options.fix ? 'applied' : 'dry-run');
    renderGuardrailSummary(guard, options);
    if (options.emitPlanPath) {
      fmt.info(`Plan written to ${options.emitPlanPath}`);
    }
    if (options.emitDiff) {
      fmt.section('Original');
      process.stdout.write(`${snippetBefore}\n`);
      fmt.section('Replacement');
      process.stdout.write(`${snippetAfter}\n`);
    }
    if (!options.fix) {
      fmt.warn('Dry-run: no changes were written. Re-run with --fix to apply.');
    } else {
      fmt.success(`Updated ${options.filePath}`);
    }
    fmt.footer();
  }
}



function measureParse(source, filePath) {
  const start = process.hrtime.bigint();
  const ast = parseModule(source, filePath);
  const durationNs = Number(process.hrtime.bigint() - start);
  return { ast, durationMs: durationNs / 1_000_000 };
}

function main(argv) {
  try {
    const rawOptions = parseCliArgs(argv);
    const options = normalizeOptions(rawOptions);
    const source = readSource(options.filePath);

    const { ast, durationMs } = options.benchmark
      ? measureParse(source, options.filePath)
      : { ast: parseModule(source, options.filePath), durationMs: null };

    const { functions, mapper } = collectFunctions(ast, source);
    const { variables } = collectVariables(ast, source, mapper);
    const functionRecords = buildFunctionRecords(functions);
    const variableRecords = buildVariableRecords(variables);

    if (options.benchmark && !options.json && !options.quiet) {
      fmt.info(`Parse time: ${durationMs.toFixed(2)} ms`);
    }

    if (options.list) {
      listFunctions(options, source, functions);
    } else if (options.listVariables) {
      listVariables(options, source, variables);
    } else if (options.contextFunctionSelector) {
      showFunctionContext(options, source, functionRecords, options.contextFunctionSelector);
    } else if (options.contextVariableSelector) {
      showVariableContext(options, source, variableRecords, options.contextVariableSelector);
    } else if (options.locateSelector) {
      locateFunctions(options, functionRecords, options.locateSelector);
    } else if (options.extractSelector) {
      const [record] = resolveMatches(functionRecords, options.extractSelector, options, { operation: 'extract' });
      extractFunction(options, source, record, options.extractSelector);
    } else if (options.replaceSelector) {
      const [record] = resolveMatches(functionRecords, options.replaceSelector, options, { operation: 'replace' });
      replaceFunction(options, source, record, options.replacementPath, options.replaceSelector);
    } else if (options.locateVariableSelector) {
      locateVariables(options, variableRecords, options.locateVariableSelector);
    } else if (options.extractVariableSelector) {
      const [record] = resolveVariableMatches(variableRecords, options.extractVariableSelector, options, { operation: 'extract-variable' });
      extractVariable(options, source, record, options.extractVariableSelector);
    } else if (options.replaceVariableSelector) {
      const [record] = resolveVariableMatches(variableRecords, options.replaceVariableSelector, options, { operation: 'replace-variable' });
      replaceVariable(options, source, record, options.replacementPath, options.replaceVariableSelector);
    }
  } catch (error) {
    fmt.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main(process.argv);
}
