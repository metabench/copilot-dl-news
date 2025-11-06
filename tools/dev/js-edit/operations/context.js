'use strict';

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

  const { fmt } = requireDeps();
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

  fmt.section('Guardrails');
  fmt.table(rows, {
    columns: ['check', 'status', 'details']
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
