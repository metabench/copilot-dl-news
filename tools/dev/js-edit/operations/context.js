'use strict';

const { resolveLanguageContext, translateLabelWithMode, joinTranslatedLabels } = require('../../i18n/helpers');

const FUNCTION_CONTEXT_KINDS = new Set(['function-declaration', 'function-expression', 'arrow-function', 'class-method']);

let deps = null;

function init(newDeps) {
  deps = {
    ...newDeps,
    defaultContextPadding: Number.isFinite(newDeps?.defaultContextPadding)
      ? Math.floor(newDeps.defaultContextPadding)
      : 512
  };
}

function requireDeps() {
  if (!deps) {
    throw new Error('js-edit context operations not initialized. Call init() before use.');
  }
  return deps;
}

function translateContextKindValue(fmt, language, kind) {
  if (!kind) {
    return translateLabelWithMode(fmt, language, 'status_unknown', 'unknown');
  }

  const normalized = String(kind).toLowerCase();
  switch (normalized) {
    case 'class':
      return translateLabelWithMode(fmt, language, 'class', kind);
    case 'function':
      return translateLabelWithMode(fmt, language, 'function', kind);
    case 'module':
      return translateLabelWithMode(fmt, language, 'module', kind);
    case 'program':
      return translateLabelWithMode(fmt, language, 'module', kind);
    default:
      return kind;
  }
}

const STATUS_LABELS = Object.freeze({
  ok: { fallback: 'OK', lexKey: 'status_ok' },
  mismatch: { fallback: 'MISMATCH', lexKey: 'status_mismatch' },
  bypass: { fallback: 'BYPASS', lexKey: 'status_bypass' },
  pending: { fallback: 'PENDING', lexKey: 'pending' },
  skipped: { fallback: 'SKIPPED', lexKey: 'status_skipped' },
  error: { fallback: 'ERROR', lexKey: 'error' },
  changed: { fallback: 'CHANGED', lexKey: 'status_changed' },
  unchanged: { fallback: 'UNCHANGED', lexKey: 'status_unchanged' },
  converted: { fallback: 'CONVERTED', lexKey: 'status_converted' },
  normalized: { fallback: 'CONVERTED', lexKey: 'status_converted' },
  normalised: { fallback: 'CONVERTED', lexKey: 'status_converted' },
  none: { fallback: 'NONE', lexKey: 'status_none' },
  unknown: { fallback: 'UNKNOWN', lexKey: 'status_unknown' }
});

function formatStatusValue(status, fmt, language) {
  const normalized = typeof status === 'string' ? status.toLowerCase() : '';
  const mapping = STATUS_LABELS[normalized];

  if (language && language.isChinese && fmt && typeof fmt.translateLabel === 'function') {
    if (mapping && mapping.lexKey) {
      return fmt.translateLabel(mapping.lexKey, mapping.fallback, {
        englishFirst: false,
        chineseOnly: true
      });
    }
    return normalized;
  }

  if (mapping) {
    return mapping.fallback;
  }
  return normalized ? normalized.toUpperCase() : '';
}

function formatRangeDetail({
  labelKey,
  fallbackLabel,
  start,
  end,
  length,
  expectedStart,
  expectedEnd,
  fmt,
  language
}) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }

  const resolvedLength = Number.isFinite(length) ? length : Math.max(0, end - start);
  const label = language && language.isChinese && fmt
    ? fmt.translateLabel(labelKey, fallbackLabel, { englishFirst: false, chineseOnly: true })
    : fallbackLabel;
  const lengthLabel = language && language.isChinese && fmt
    ? fmt.translateLabel('byte_length', 'len', { englishFirst: false, chineseOnly: true })
    : 'len';

  let segment = `${label} ${start}-${end} | ${lengthLabel} ${resolvedLength}`;

  if (Number.isFinite(expectedStart) && Number.isFinite(expectedEnd)) {
    const expectLabel = language && language.isChinese && fmt
      ? fmt.translateLabel('expect', 'expected', { englishFirst: false, chineseOnly: true })
      : 'expected';
    segment += ` | ${expectLabel} ${expectedStart}-${expectedEnd}`;
  }

  return segment;
}

function buildLocalizedSpanDetails(span, fmt, language) {
  if (!span) {
    return '';
  }

  const segments = [];

  const charSegment = formatRangeDetail({
    labelKey: 'chars',
    fallbackLabel: 'chars',
    start: span.start,
    end: span.end,
    length: span.length,
    expectedStart: span.expectedStart,
    expectedEnd: span.expectedEnd,
    fmt,
    language
  });

  if (charSegment) {
    segments.push(charSegment);
  }

  const byteSegment = formatRangeDetail({
    labelKey: 'bytes',
    fallbackLabel: 'bytes',
    start: span.byteStart,
    end: span.byteEnd,
    length: span.byteLength,
    expectedStart: span.expectedByteStart,
    expectedEnd: span.expectedByteEnd,
    fmt,
    language
  });

  if (byteSegment) {
    segments.push(byteSegment);
  }

  return segments.join('\n');
}

function formatHashDetails(hashGuard, fmt, language) {
  if (!hashGuard) {
    return '';
  }

  if (hashGuard.status === 'ok') {
    return hashGuard.expected || '';
  }

  if (language && language.isChinese && fmt && typeof fmt.translateLabel === 'function') {
    const expectedLabel = fmt.translateLabel('expect', 'expected', { englishFirst: false, chineseOnly: true });
    const actualLabel = fmt.translateLabel('actual', 'actual', { englishFirst: false, chineseOnly: true });
    return `${expectedLabel} ${hashGuard.expected} ${actualLabel} ${hashGuard.actual}`.trim();
  }

  return `expected ${hashGuard.expected} received ${hashGuard.actual}`;
}

function formatSyntaxDetails(syntaxGuard, fmt, language) {
  if (!syntaxGuard) {
    return '';
  }

  if (syntaxGuard.status === 'ok') {
    if (language && language.isChinese && fmt && typeof fmt.translateLabel === 'function') {
      return fmt.translateLabel('success', 'Success', { englishFirst: false, chineseOnly: true });
    }
    return 'Re-parse successful';
  }

  if (syntaxGuard.message) {
    return syntaxGuard.message;
  }

  if (language && language.isChinese && fmt && typeof fmt.translateLabel === 'function') {
    return fmt.translateLabel('error', 'Error', { englishFirst: false, chineseOnly: true });
  }

  return 'Syntax check failed';
}

function formatResultDetails(resultGuard, fmt, language) {
  if (!resultGuard) {
    return '';
  }

  if (resultGuard.status === 'changed') {
    if (language && language.isChinese && fmt && typeof fmt.translateLabel === 'function') {
      const afterLabel = fmt.translateLabel('after', 'after', { englishFirst: false, chineseOnly: true });
      return `${afterLabel} ${resultGuard.after}`.trim();
    }
    return resultGuard.after || '';
  }

  if (resultGuard.status === 'unchanged') {
    if (language && language.isChinese && fmt && typeof fmt.translateLabel === 'function') {
      const unchangedLabel = fmt.translateLabel('status_unchanged', 'unchanged', { englishFirst: false, chineseOnly: true });
      return `${resultGuard.after} ${unchangedLabel}`.trim();
    }
    return `${resultGuard.after} (unchanged)`;
  }

  if (resultGuard.after) {
    return resultGuard.after;
  }

  return '';
}

function isFunctionContextKind(kind) {
  if (!kind) {
    return false;
  }
  if (FUNCTION_CONTEXT_KINDS.has(kind)) {
    return true;
  }
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

function createContextEntry(record, source, before, after, enclosingMode, mapper) {
  const { extractCode, createDigest } = requireDeps();
  const { span: effectiveSpan, context: selectedContext } = selectContextSpan(record, enclosingMode);
  const contextSpan = effectiveSpan || record.span;
  const contextRange = computeContextRange(contextSpan, before, after, source.length);
  const contextSnippet = source.slice(contextRange.start, contextRange.end);
  const baseSnippet = extractCode(source, record.span, mapper);
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
  const { defaultContextPadding } = requireDeps();
  const before = Number.isFinite(options.contextBefore) && options.contextBefore >= 0
    ? Math.floor(options.contextBefore)
    : defaultContextPadding;
  const after = Number.isFinite(options.contextAfter) && options.contextAfter >= 0
    ? Math.floor(options.contextAfter)
    : defaultContextPadding;
  const enclosingMode = options.contextEnclosing;

  const entries = records.map((record) => createContextEntry(record, source, before, after, enclosingMode, options.sourceMapper));

  return {
    before,
    after,
    entries
  };
}

function buildContextPayload(type, selector, options, contextResult) {
  const { defaultContextPadding } = requireDeps();
  const requestedBefore = Number.isFinite(options.contextBefore) && options.contextBefore >= 0
    ? Math.floor(options.contextBefore)
    : defaultContextPadding;
  const requestedAfter = Number.isFinite(options.contextAfter) && options.contextAfter >= 0
    ? Math.floor(options.contextAfter)
    : defaultContextPadding;

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

function formatNewlineSummary(newlineGuard, fmt = null, language = null) {
  const resolvedLanguage = language || (fmt ? resolveLanguageContext(fmt) : { languageMode: 'en', englishFirst: true, isChinese: false });

  if (resolvedLanguage.isChinese && fmt && typeof fmt.translateLabel === 'function') {
    if (!newlineGuard) {
      return fmt.translateLabel('newlines', 'Newlines', { englishFirst: false, chineseOnly: true });
    }

    const translate = (key, fallback) => fmt.translateLabel(key, fallback, { englishFirst: false, chineseOnly: true });
    const segments = [];

    if (newlineGuard.file?.style) {
      const mixed = newlineGuard.file.mixed ? '混' : '';
      segments.push(`${translate('file', 'File')} ${newlineGuard.file.style.toUpperCase()}${mixed}`);
    }

    if (newlineGuard.replacement) {
      const mixed = newlineGuard.replacement.mixed ? '混' : '';
      const target = newlineGuard.replacement.normalizedStyle
        ? `→${newlineGuard.replacement.normalizedStyle.toUpperCase()}`
        : '';
      let snippetSegment = `${translate('snippet', 'Snippet')} ${newlineGuard.replacement.style.toUpperCase()}${mixed}${target}`;
      if (newlineGuard.replacement.trailingNewlineAdded) {
        snippetSegment = `${snippetSegment} 补尾`;
      }
      segments.push(snippetSegment.trim());
    } else if (newlineGuard.original?.style || newlineGuard.result?.style) {
      if (newlineGuard.original?.style) {
        const mixed = newlineGuard.original.mixed ? '混' : '';
        segments.push(`${translate('original', 'Original')} ${newlineGuard.original.style.toUpperCase()}${mixed}`);
      }
      if (newlineGuard.result?.style) {
        const mixed = newlineGuard.result.mixed ? '混' : '';
        segments.push(`${translate('result', 'Result')} ${newlineGuard.result.style.toUpperCase()}${mixed}`);
      }
    }

    if (typeof newlineGuard.byteDelta === 'number' && newlineGuard.byteDelta !== 0) {
      segments.push(`Δ${newlineGuard.byteDelta}`);
    }

    return segments.join(' | ');
  }

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

  const { writeOutputFile } = requireDeps();
  const plan = buildPlanPayload(operation, options, selector, records, expectedHashes, expectedSpans, extras);
  writeOutputFile(options.emitPlanPath, `${JSON.stringify(plan, null, 2)}\n`);
  return plan;
}

function renderContextResults(type, selector, options, contextResult) {
  const { fmt, outputJson } = requireDeps();
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

  const language = resolveLanguageContext(fmt);
  const isChinese = language.isChinese;
  const hasCodeBlock = typeof fmt.codeBlock === 'function';
  const translate = (key, fallback, options = {}) => translateLabelWithMode(fmt, language, key, fallback, options);
  const combine = (parts) => joinTranslatedLabels(fmt, language, parts);

  const entityKey = type === 'function' ? 'function' : 'variable';
  const entityFallback = type === 'function' ? 'Function' : 'Variable';

  const headerLabel = combine([
    { key: entityKey, fallback: entityFallback },
    { key: 'context', fallback: 'Context' }
  ]);
  fmt.header(headerLabel);

  const selectorLabel = translate('selector', 'Selector');
  fmt.section(`${selectorLabel}: ${selector}`);

  const beforeLabel = translate('before', 'before');
  const afterLabel = translate('after', 'after');
  const requestedPaddingLabel = combine([
    { key: 'requested', fallback: 'Requested' },
    { key: 'padding', fallback: 'padding' }
  ]);
  fmt.stat(requestedPaddingLabel, `${payload.padding.requestedBefore} ${beforeLabel} / ${payload.padding.requestedAfter} ${afterLabel}`);

  const appliedPaddingLabel = combine([
    { key: 'applied', fallback: 'Applied' },
    { key: 'padding', fallback: 'padding' }
  ]);
  fmt.stat(appliedPaddingLabel, `${contextResult.before} ${beforeLabel} / ${contextResult.after} ${afterLabel}`);

  const enclosingModeLabel = combine([
    { key: 'enclosing', fallback: 'Enclosing' },
    { key: 'mode', fallback: 'mode' }
  ]);
  const enclosingModeValue = options.contextEnclosing
    ? translateContextKindValue(fmt, language, options.contextEnclosing)
    : options.contextEnclosing;
  fmt.stat(enclosingModeLabel, enclosingModeValue);

  let formattedSpanRange = null;
  if (spanRange) {
    formattedSpanRange = isChinese
      ? buildLocalizedSpanDetails({
        start: spanRange.start,
        end: spanRange.end,
        length: spanRange.totalLength,
        byteStart: spanRange.byteStart,
        byteEnd: spanRange.byteEnd,
        byteLength: spanRange.totalByteLength
      }, fmt, language)
      : formatAggregateSpan(spanRange);
  }
  if (formattedSpanRange) {
    fmt.stat(combine([
      { key: 'span', fallback: 'Span' },
      { key: 'range', fallback: 'range' }
    ]), formattedSpanRange);
  }

  let formattedContextRange = null;
  if (contextSpanRange) {
    formattedContextRange = isChinese
      ? formatRangeDetail({
        labelKey: 'context',
        fallbackLabel: 'Context',
        start: contextSpanRange.start,
        end: contextSpanRange.end,
        length: contextSpanRange.end - contextSpanRange.start,
        fmt,
        language
      })
      : formatSpanRange('chars', contextSpanRange.start, contextSpanRange.end, contextSpanRange.end - contextSpanRange.start);
  }
  if (formattedContextRange) {
    fmt.stat(combine([
      { key: 'context', fallback: 'Context' },
      { key: 'range', fallback: 'range' }
    ]), formattedContextRange);
  }

  contextResult.entries.forEach((entry, index) => {
    const { record } = entry;
    const entryLabel = translate(entityKey, entityFallback);
    const entryTitle = isChinese
      ? `${entryLabel}${index + 1}: ${record.canonicalName || record.name}`
      : `${entryLabel} ${index + 1}: ${record.canonicalName || record.name}`;
    fmt.section(entryTitle);

    fmt.stat(translate('kind', 'Kind'), translateContextKindValue(fmt, language, record.kind));
    fmt.stat(translate('location', 'Location'), `${record.line}:${record.column}`);
    if (record.exportKind) {
      fmt.stat(translate('exports', 'Export'), record.exportKind);
    }
    if (type === 'variable' && record.initializerType) {
      fmt.stat(translate('initializer', 'Initializer'), record.initializerType);
    }
    fmt.stat(translate('path_signature', 'Path'), record.pathSignature);
    if (record.scopeChain && record.scopeChain.length > 0) {
      fmt.stat(translate('scope', 'Scope'), record.scopeChain.join(' > '));
    }
    const baseSpanDetails = isChinese
      ? buildLocalizedSpanDetails(record.span, fmt, language)
      : formatSpanDetails(record.span);
    if (baseSpanDetails) {
      fmt.stat(translate('span', 'Span'), baseSpanDetails);
    }
    const effectiveSpanDetails = isChinese
      ? buildLocalizedSpanDetails(entry.effectiveSpan, fmt, language)
      : formatSpanDetails(entry.effectiveSpan);
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
        fmt.stat(combine([
          { key: 'effective', fallback: 'Effective' },
          { key: 'span', fallback: 'span' }
        ]), effectiveSpanDetails);
      }
    }
    const contextRange = entry.contextRange;
    if (contextRange) {
      const contextRangeSummary = isChinese
        ? formatRangeDetail({
          labelKey: 'context',
          fallbackLabel: 'Context',
          start: contextRange.start,
          end: contextRange.end,
          length: contextRange.end - contextRange.start,
          fmt,
          language
        })
        : formatSpanRange('chars', contextRange.start, contextRange.end, contextRange.end - contextRange.start);
      if (contextRangeSummary) {
        fmt.stat(combine([
          { key: 'context', fallback: 'Context' },
          { key: 'window', fallback: 'window' }
        ]), contextRangeSummary);
      }
    }
    const availableContexts = getEnclosingContexts(record);
    if (availableContexts.length > 0) {
      const contextSummary = availableContexts
        .map((ctx) => {
          const contextName = ctx.name ? `${isChinese ? '' : ' '}${ctx.name}` : '';
          const renderedKind = translateContextKindValue(fmt, language, ctx.kind || null);
          return `${renderedKind}${contextName}`;
        })
        .join(isChinese ? '｜' : ' | ');
      fmt.stat(combine([
        { key: 'enclosing', fallback: 'Enclosing' },
        { key: 'context', fallback: 'contexts' }
      ]), contextSummary);
    } else if (record.enclosingKind === 'class') {
      const anonymousClass = language.isChinese
        ? `（${translate('anonymous_class', 'anonymous class')}）`
        : '(anonymous class)';
      fmt.stat(combine([
        { key: 'enclosing', fallback: 'Enclosing' },
        { key: 'class', fallback: 'class' }
      ]), record.enclosingName || anonymousClass);
    }
    if (entry.selectedEnclosingContext) {
      const selected = entry.selectedEnclosingContext;
      const selectedName = selected.name ? `${isChinese ? '' : ' '}${selected.name}` : '';
      const renderedKind = translateContextKindValue(fmt, language, selected.kind || null);
      fmt.stat(translate('expanded_to', 'Expanded to'), `${renderedKind}${selectedName}`);
    }
    fmt.section(combine([
      { key: 'context', fallback: 'Context' },
      { key: 'snippet', fallback: 'Snippet' }
    ]));
    if (hasCodeBlock) {
      fmt.codeBlock(entry.contextSnippet);
    } else {
      process.stdout.write(`${entry.contextSnippet}\n`);
      fmt.blank();
    }
    fmt.section(combine([
      { key: 'base', fallback: 'Base' },
      { key: 'snippet', fallback: 'Snippet' }
    ]));
    if (hasCodeBlock) {
      fmt.codeBlock(entry.baseSnippet);
    } else {
      process.stdout.write(`${entry.baseSnippet}\n`);
      fmt.blank();
    }
  });

  if (options.emitPlanPath) {
    if (isChinese) {
      const planLabel = translate('plan', 'Plan', { englishFirst: false, chineseOnly: true });
      const outputLabel = translate('output', 'output', { englishFirst: false, chineseOnly: true });
      fmt.info(`${planLabel} ${outputLabel}: ${options.emitPlanPath}`);
    } else {
      fmt.info(`Plan written to ${options.emitPlanPath}`);
    }
  }
  fmt.footer();
}

function renderGuardrailSummary(guard, options) {
  if (options.json || options.quiet) {
    return;
  }

  const { fmt } = requireDeps();
  const language = resolveLanguageContext(fmt);
  const isChinese = language.isChinese;
  const translate = (key, fallback, options = {}) => translateLabelWithMode(fmt, language, key, fallback, options);
  const combine = (parts) => joinTranslatedLabels(fmt, language, parts);

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
  const fallbackSpanDetails = fallbackSegments.length > 0 ? fallbackSegments.join('\n') : '';

  const spanDetails = isChinese
    ? buildLocalizedSpanDetails(guard.span, fmt, language) || fallbackSpanDetails
    : formatSpanDetails(guard.span) || fallbackSpanDetails;

  const guardrailLabel = translate('guardrail', 'Guardrails');

  const columnLabels = {
    check: translate('check', 'Check'),
    status: translate('status', 'Status'),
    details: translate('details', 'Details')
  };

  const tableRows = [];

  tableRows.push({
    [columnLabels.check]: translate('span', 'Span'),
    [columnLabels.status]: formatStatusValue(guard.span.status, fmt, language),
    [columnLabels.details]: spanDetails
  });

  tableRows.push({
    [columnLabels.check]: translate('hash', 'Hash'),
    [columnLabels.status]: formatStatusValue(guard.hash.status, fmt, language),
    [columnLabels.details]: formatHashDetails(guard.hash, fmt, language)
  });

  tableRows.push({
    [columnLabels.check]: translate('path_signature', 'Path'),
    [columnLabels.status]: formatStatusValue(guard.path.status, fmt, language),
    [columnLabels.details]: guard.path.signature || ''
  });

  tableRows.push({
    [columnLabels.check]: translate('syntax', 'Syntax'),
    [columnLabels.status]: formatStatusValue(guard.syntax.status, fmt, language),
    [columnLabels.details]: formatSyntaxDetails(guard.syntax, fmt, language)
  });

  const resultLabel = combine([
    { key: 'result', fallback: 'Result' },
    { key: 'hash', fallback: 'Hash' }
  ]);

  tableRows.push({
    [columnLabels.check]: resultLabel,
    [columnLabels.status]: formatStatusValue(guard.result.status, fmt, language),
    [columnLabels.details]: formatResultDetails(guard.result, fmt, language)
  });

  if (guard.newline) {
    tableRows.push({
      [columnLabels.check]: translate('newlines', 'Newlines'),
      [columnLabels.status]: formatStatusValue(guard.newline.status || 'unknown', fmt, language),
      [columnLabels.details]: formatNewlineSummary(guard.newline, fmt, language)
    });
  }

  fmt.section(guardrailLabel);
  fmt.table(tableRows, {
    columns: [columnLabels.check, columnLabels.status, columnLabels.details]
  });
}

function showFunctionContext(options, source, functionRecords, selector) {
  const { resolveMatches, defaultContextPadding } = requireDeps();
  const resolved = resolveMatches(functionRecords, selector, options, { operation: 'context' });
  const contextResult = buildContextEntries(resolved, source, options);
  const plan = maybeEmitPlan('context-function', options, selector, resolved, [], [], {
    entity: 'function',
    padding: {
      requestedBefore: Number.isFinite(options.contextBefore) && options.contextBefore >= 0
        ? Math.floor(options.contextBefore)
        : defaultContextPadding,
      requestedAfter: Number.isFinite(options.contextAfter) && options.contextAfter >= 0
        ? Math.floor(options.contextAfter)
        : defaultContextPadding,
      appliedBefore: contextResult.before,
      appliedAfter: contextResult.after
    },
    enclosingMode: options.contextEnclosing
  });
  if (plan) {
    // plan emitted for telemetry; payload already returned if json was requested
  }
  renderContextResults('function', selector, options, contextResult);
}

function showVariableContext(options, source, variableRecords, selector) {
  const { resolveVariableMatches, defaultContextPadding } = requireDeps();
  const resolved = resolveVariableMatches(variableRecords, selector, options, { operation: 'context-variable' });
  const contextResult = buildContextEntries(resolved, source, options);
  const plan = maybeEmitPlan('context-variable', options, selector, resolved, [], [], {
    entity: 'variable',
    padding: {
      requestedBefore: Number.isFinite(options.contextBefore) && options.contextBefore >= 0
        ? Math.floor(options.contextBefore)
        : defaultContextPadding,
      requestedAfter: Number.isFinite(options.contextAfter) && options.contextAfter >= 0
        ? Math.floor(options.contextAfter)
        : defaultContextPadding,
      appliedBefore: contextResult.before,
      appliedAfter: contextResult.after
    },
    enclosingMode: options.contextEnclosing
  });
  if (plan) {
    // plan emitted for telemetry; payload already returned if json was requested
  }
  renderContextResults('variable', selector, options, contextResult);
}

module.exports = {
  init,
  getEnclosingContexts,
  findEnclosingContext,
  cloneEnclosingContexts,
  computeAggregateSpan,
  formatAggregateSpan,
  formatSpanRange,
  formatSpanDetails,
  formatNewlineSummary,
  buildPlanPayload,
  maybeEmitPlan,
  renderGuardrailSummary,
  showFunctionContext,
  showVariableContext
};
