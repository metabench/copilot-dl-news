'use strict';

const path = require('path');
const { resolveLanguageContext } = require('../../i18n/helpers');

let deps = null;

function init(newDeps) {
  deps = { ...newDeps };
}

function formatPlanOutput(fmt, path, englishFirst) {
  const planLabel = fmt.translateLabel('plan', 'Plan', { englishFirst });
  const outputLabel = fmt.translateLabel('output', 'Output', { englishFirst });
  return `${planLabel} ${outputLabel}: ${path}`;
}

function formatDigestSnapshot(fmt, stage, path, englishFirst) {
  const digestLabel = fmt.translateLabel('digest', 'Digest', { englishFirst });
  const stageLabel = stage === 'before'
    ? fmt.translateLabel('before', 'Before', { englishFirst })
    : fmt.translateLabel('after', 'After', { englishFirst });
  return `${digestLabel} (${stageLabel}): ${path}`;
}

function formatModeValue(applied, context) {
  if (applied) {
    return context.isChinese ? '实写' : 'applied';
  }
  return context.isChinese ? '演' : 'dry-run';
}

function formatTargetMode(targetMode, requestedMode, context) {
  if (!requestedMode || requestedMode === targetMode) {
    return targetMode;
  }
  if (context.isChinese) {
    return `${targetMode}（需 ${requestedMode}）`;
  }
  return `${targetMode} (requested ${requestedMode})`;
}

function formatDryRunWarning(context) {
  return context.isChinese
    ? '演: 未写入任何更改。使用 --改 应用。'
    : 'Dry-run: no changes were written. Re-run with --fix to apply.';
}

function formatSuccessMessage(filePath, context) {
  return context.isChinese ? `已更新 ${filePath}` : `Updated ${filePath}`;
}

function sanitizeFileComponent(value, fallback) {
  const input = typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  if (!input) {
    return 'target';
  }
  const token = input
    .replace(/[^0-9A-Za-z._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 64);
  return token || 'target';
}

function compactGuardForDigest(guard) {
  if (!guard || typeof guard !== 'object') {
    return null;
  }
  const summary = {
    span: guard.span || null,
    hash: guard.hash || null,
    path: guard.path || null,
    newline: guard.newline || null
  };
  return summary;
}

function generateUnifiedDiff(beforeText, afterText, context = {}) {
  const beforeLines = beforeText.split('\n');
  const afterLines = afterText.split('\n');
  const contextLines = context.contextLines || 3;
  const label = context.label || 'snippet';
  
  // Simple line-by-line diff without external library
  const diffLines = [];
  diffLines.push(`--- ${label} (before)`);
  diffLines.push(`+++ ${label} (after)`);
  
  let i = 0;
  let j = 0;
  const changes = [];
  
  // Find changed regions
  while (i < beforeLines.length || j < afterLines.length) {
    if (i >= beforeLines.length) {
      // Remaining additions
      changes.push({ type: 'add', beforeIdx: i, afterIdx: j, line: afterLines[j] });
      j++;
    } else if (j >= afterLines.length) {
      // Remaining deletions
      changes.push({ type: 'del', beforeIdx: i, afterIdx: j, line: beforeLines[i] });
      i++;
    } else if (beforeLines[i] === afterLines[j]) {
      // Unchanged line
      changes.push({ type: 'ctx', beforeIdx: i, afterIdx: j, line: beforeLines[i] });
      i++;
      j++;
    } else {
      // Changed line - look ahead to find next match
      let foundMatch = false;
      const lookahead = Math.min(5, Math.max(beforeLines.length - i, afterLines.length - j));
      
      for (let la = 1; la <= lookahead; la++) {
        if (i + la < beforeLines.length && beforeLines[i + la] === afterLines[j]) {
          // Deletions followed by match
          for (let k = 0; k < la; k++) {
            changes.push({ type: 'del', beforeIdx: i + k, afterIdx: j, line: beforeLines[i + k] });
          }
          i += la;
          foundMatch = true;
          break;
        } else if (j + la < afterLines.length && beforeLines[i] === afterLines[j + la]) {
          // Additions followed by match
          for (let k = 0; k < la; k++) {
            changes.push({ type: 'add', beforeIdx: i, afterIdx: j + k, line: afterLines[j + k] });
          }
          j += la;
          foundMatch = true;
          break;
        }
      }
      
      if (!foundMatch) {
        // Treat as replacement
        changes.push({ type: 'del', beforeIdx: i, afterIdx: j, line: beforeLines[i] });
        changes.push({ type: 'add', beforeIdx: i + 1, afterIdx: j, line: afterLines[j] });
        i++;
        j++;
      }
    }
  }
  
  // Group changes into hunks with context
  const hunks = [];
  let currentHunk = null;
  
  for (let idx = 0; idx < changes.length; idx++) {
    const change = changes[idx];
    
    if (change.type !== 'ctx') {
      // Start new hunk or extend existing
      if (!currentHunk) {
        const startBefore = Math.max(0, change.beforeIdx - contextLines);
        const startAfter = Math.max(0, change.afterIdx - contextLines);
        currentHunk = {
          startBefore,
          startAfter,
          lines: []
        };
        
        // Add leading context
        for (let c = startBefore; c < change.beforeIdx; c++) {
          if (c < beforeLines.length) {
            currentHunk.lines.push({ type: 'ctx', line: beforeLines[c] });
          }
        }
      }
      
      currentHunk.lines.push({ type: change.type, line: change.line });
    } else if (currentHunk) {
      // Add context line to current hunk
      currentHunk.lines.push({ type: 'ctx', line: change.line });
      
      // Check if we should close this hunk
      let hasMoreChanges = false;
      for (let look = idx + 1; look < Math.min(idx + 1 + contextLines * 2, changes.length); look++) {
        if (changes[look].type !== 'ctx') {
          hasMoreChanges = true;
          break;
        }
      }
      
      if (!hasMoreChanges) {
        // Trim trailing context to contextLines
        const ctxCount = currentHunk.lines.filter(l => l.type === 'ctx').length;
        const excessCtx = ctxCount - contextLines * 2;
        if (excessCtx > 0) {
          let removed = 0;
          for (let r = currentHunk.lines.length - 1; r >= 0 && removed < excessCtx; r--) {
            if (currentHunk.lines[r].type === 'ctx') {
              currentHunk.lines.splice(r, 1);
              removed++;
            }
          }
        }
        
        hunks.push(currentHunk);
        currentHunk = null;
      }
    }
  }
  
  if (currentHunk) {
    hunks.push(currentHunk);
  }
  
  // Format hunks
  for (const hunk of hunks) {
    const beforeCount = hunk.lines.filter(l => l.type === 'ctx' || l.type === 'del').length;
    const afterCount = hunk.lines.filter(l => l.type === 'ctx' || l.type === 'add').length;
    diffLines.push(`@@ -${hunk.startBefore + 1},${beforeCount} +${hunk.startAfter + 1},${afterCount} @@`);
    
    for (const line of hunk.lines) {
      const prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
      diffLines.push(`${prefix}${line.line}`);
    }
  }
  
  return diffLines.join('\n');
}

function maybeWriteDigestSnapshots(operation, options, selector, context) {
  if (!options.emitDigests || !options.digestDir) {
    return null;
  }

  const {
    writeOutputFile
  } = requireDeps();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileToken = sanitizeFileComponent(path.basename(options.filePath), 'file');
  const selectorToken = sanitizeFileComponent(selector || '', 'selector');
  const nameToken = sanitizeFileComponent(context.canonicalName || context.recordName, 'target');
  const hashToken = sanitizeFileComponent(context.beforeHash ? context.beforeHash.slice(0, 12) : '', 'hash');

  const baseParts = [timestamp, operation, fileToken, nameToken];
  if (hashToken && hashToken !== 'hash') {
    baseParts.push(hashToken);
  }
  const baseName = baseParts.filter(Boolean).join('__');

  const beforePath = path.join(options.digestDir, `${baseName}--before.json`);
  const afterPath = path.join(options.digestDir, `${baseName}--after.json`);

  const basePayload = {
    version: 1,
    timestamp,
    operation,
    file: options.filePath,
    selector: selector || null,
    mode: options.fix ? 'write' : 'dry-run',
    record: {
      canonicalName: context.canonicalName || null,
      name: context.recordName || null,
      kind: context.kind || null,
      pathSignature: context.pathSignature || null,
      targetMode: context.targetMode || null
    },
    guard: compactGuardForDigest(context.guard),
    plan: context.plan || null,
    extras: context.extras || null
  };

  const beforePayload = {
    ...basePayload,
    stage: 'before',
    hash: context.beforeHash,
    span: context.beforeSpan || null,
    snippet: context.includeSnippets ? context.beforeSnippet : undefined
  };
  if (beforePayload.snippet === undefined) {
    delete beforePayload.snippet;
  }
  if (!beforePayload.plan) {
    delete beforePayload.plan;
  }
  if (!beforePayload.extras) {
    delete beforePayload.extras;
  }

  const afterPayload = {
    ...basePayload,
    plan: undefined,
    extras: undefined,
    stage: 'after',
    hash: context.afterHash,
    span: context.afterSpan || null,
    snippet: context.includeSnippets ? context.afterSnippet : undefined
  };
  delete afterPayload.plan;
  delete afterPayload.extras;
  if (afterPayload.snippet === undefined) {
    delete afterPayload.snippet;
  }

  writeOutputFile(beforePath, `${JSON.stringify(beforePayload, null, 2)}\n`);
  writeOutputFile(afterPath, `${JSON.stringify(afterPayload, null, 2)}\n`);

  return { beforePath, afterPath, baseName };
}

function requireDeps() {
  if (!deps) {
    throw new Error('js-edit mutation operations not initialized. Call init() before use.');
  }
  return deps;
}

function locateFunctions(options, functionRecords, selector) {
  const {
    resolveMatches,
    maybeEmitPlan,
    computeAggregateSpan,
    outputJson,
    fmt,
    formatSpanRange,
    formatAggregateSpan
  } = requireDeps();

  const resolved = resolveMatches(functionRecords, selector, options, { operation: 'locate' });
  const plan = maybeEmitPlan('locate', options, selector, resolved);
  const spanRange = computeAggregateSpan(resolved.map((record) => (record?.span ? record.span : null)));

  const matches = resolved.map((record) => {
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
  });

  const payload = {
    file: options.filePath,
    selector,
    summary: {
      matchCount: resolved.length,
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

  if (options.quiet) {
    return;
  }

  const language = resolveLanguageContext(fmt);
  const headerTitle = `${fmt.translateLabel('function', 'Function', { englishFirst: language.englishFirst })} ${fmt.translateLabel('locate', 'Locate', { englishFirst: language.englishFirst })}`.trim();
  fmt.header(headerTitle);

  const selectorLabel = fmt.translateLabel('selector', 'Selector', { englishFirst: language.englishFirst });
  fmt.section(`${selectorLabel}: ${selector}`);

  const columnLabels = {
    index: fmt.translateLabel('index', 'Index', { englishFirst: language.englishFirst }),
    name: fmt.translateLabel('name', 'Name', { englishFirst: language.englishFirst }),
    kind: fmt.translateLabel('kind', 'Kind', { englishFirst: language.englishFirst }),
    line: fmt.translateLabel('lines', 'Line', { englishFirst: language.englishFirst }),
    column: fmt.translateLabel('columns', 'Column', { englishFirst: language.englishFirst }),
    chars: fmt.translateLabel('chars', 'Chars', { englishFirst: language.englishFirst }),
    bytes: fmt.translateLabel('byte_length', 'Bytes', { englishFirst: language.englishFirst }),
    path: fmt.translateLabel('path_signature', 'Path', { englishFirst: language.englishFirst }),
    hash: fmt.translateLabel('hash', 'Hash', { englishFirst: language.englishFirst })
  };

  const tableRows = matches.map((match, index) => {
    const charSummary = formatSpanRange('chars', match.span.start, match.span.end, match.span.length);
    const byteSummary = formatSpanRange('bytes', match.span.byteStart, match.span.byteEnd, match.span.byteLength);

    return {
      [columnLabels.index]: index + 1,
      [columnLabels.name]: match.canonicalName || match.name,
      [columnLabels.kind]: match.kind,
      [columnLabels.line]: match.line,
      [columnLabels.column]: match.column,
      [columnLabels.chars]: charSummary || '-',
      [columnLabels.bytes]: byteSummary || '-',
      [columnLabels.path]: match.pathSignature,
      [columnLabels.hash]: match.hash.slice(0, 12)
    };
  });

  fmt.table(tableRows, {
    columns: [
      columnLabels.index,
      columnLabels.name,
      columnLabels.kind,
      columnLabels.line,
      columnLabels.column,
      columnLabels.chars,
      columnLabels.bytes,
      columnLabels.path,
      columnLabels.hash
    ]
  });

  fmt.stat(fmt.translateLabel('matches', 'Matches', { englishFirst: language.englishFirst }), payload.summary.matchCount, 'number');
  const formattedSpanRange = formatAggregateSpan(payload.summary.spanRange);
  if (formattedSpanRange) {
    const spanLabel = fmt.translateLabel('span', 'Span', { englishFirst: language.englishFirst });
    const rangeLabel = fmt.translateLabel('range', 'Range', { englishFirst: language.englishFirst });
    fmt.stat(`${spanLabel} ${rangeLabel}`, formattedSpanRange);
  }
  if (options.emitPlanPath) {
    fmt.info(formatPlanOutput(fmt, options.emitPlanPath, language.englishFirst));
  }
  fmt.footer();
}

function locateVariables(options, variableRecords, selector) {
  const {
    resolveVariableMatches,
    resolveVariableTargetInfo,
    maybeEmitPlan,
    computeAggregateSpan,
    outputJson,
    fmt,
    formatSpanRange,
    formatAggregateSpan
  } = requireDeps();

  const resolved = resolveVariableMatches(variableRecords, selector, options, { operation: 'locate-variable' });
  const targets = resolved.map((record) => resolveVariableTargetInfo(record, options.variableTarget));
  const expectedHashes = targets.map((target) => target.hash);
  const expectedSpans = targets.map((target) => target.span);
  const plan = maybeEmitPlan('locate-variable', options, selector, resolved, expectedHashes, expectedSpans, {
    entity: 'variable',
    targetMode: options.variableTarget
  });

  const spanRange = computeAggregateSpan(targets.map((target) => (target?.span ? target.span : null)));

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

  if (options.quiet) {
    return;
  }

  const language = resolveLanguageContext(fmt);
  const headerTitle = `${fmt.translateLabel('variable', 'Variable', { englishFirst: language.englishFirst })} ${fmt.translateLabel('locate', 'Locate', { englishFirst: language.englishFirst })}`.trim();
  fmt.header(headerTitle);

  const selectorLabel = fmt.translateLabel('selector', 'Selector', { englishFirst: language.englishFirst });
  fmt.section(`${selectorLabel}: ${selector}`);

  const targetModeLabel = `${fmt.translateLabel('target', 'Target', { englishFirst: language.englishFirst })} ${fmt.translateLabel('mode', 'Mode', { englishFirst: language.englishFirst })}`;
  fmt.stat(targetModeLabel, `${options.variableTarget}`);

  const columnLabels = {
    index: fmt.translateLabel('index', 'Index', { englishFirst: language.englishFirst }),
    name: fmt.translateLabel('name', 'Name', { englishFirst: language.englishFirst }),
    kind: fmt.translateLabel('kind', 'Kind', { englishFirst: language.englishFirst }),
    line: fmt.translateLabel('lines', 'Line', { englishFirst: language.englishFirst }),
    column: fmt.translateLabel('columns', 'Column', { englishFirst: language.englishFirst }),
    mode: fmt.translateLabel('mode', 'Mode', { englishFirst: language.englishFirst }),
    chars: fmt.translateLabel('chars', 'Chars', { englishFirst: language.englishFirst }),
    bytes: fmt.translateLabel('byte_length', 'Bytes', { englishFirst: language.englishFirst }),
    path: fmt.translateLabel('path_signature', 'Path', { englishFirst: language.englishFirst }),
    hash: fmt.translateLabel('hash', 'Hash', { englishFirst: language.englishFirst })
  };

  const tableRows = matches.map((match, index) => {
    const charSummary = formatSpanRange('chars', match.span.start, match.span.end, match.span.length);
    const byteSummary = formatSpanRange('bytes', match.span.byteStart, match.span.byteEnd, match.span.byteLength);

    return {
      [columnLabels.index]: index + 1,
      [columnLabels.name]: match.name,
      [columnLabels.kind]: match.kind,
      [columnLabels.line]: match.line,
      [columnLabels.column]: match.column,
      [columnLabels.mode]: match.targetMode,
      [columnLabels.chars]: charSummary || '-',
      [columnLabels.bytes]: byteSummary || '-',
      [columnLabels.path]: match.pathSignature,
      [columnLabels.hash]: match.hash ? match.hash.slice(0, 12) : '-'
    };
  });

  fmt.table(tableRows, {
    columns: [
      columnLabels.index,
      columnLabels.name,
      columnLabels.kind,
      columnLabels.line,
      columnLabels.column,
      columnLabels.mode,
      columnLabels.chars,
      columnLabels.bytes,
      columnLabels.path,
      columnLabels.hash
    ]
  });

  fmt.stat(fmt.translateLabel('matches', 'Matches', { englishFirst: language.englishFirst }), payload.summary.matchCount, 'number');
  const formattedSpanRange = formatAggregateSpan(payload.summary.spanRange);
  if (formattedSpanRange) {
    const spanLabel = fmt.translateLabel('span', 'Span', { englishFirst: language.englishFirst });
    const rangeLabel = fmt.translateLabel('range', 'Range', { englishFirst: language.englishFirst });
    fmt.stat(`${spanLabel} ${rangeLabel}`, formattedSpanRange);
  }
  if (options.emitPlanPath) {
    fmt.info(formatPlanOutput(fmt, options.emitPlanPath, language.englishFirst));
  }
  fmt.footer();
}

function extractFunction(options, source, record, selector) {
  const {
    extractCode,
    maybeEmitPlan,
    writeOutputFile,
    outputJson,
    fmt
  } = requireDeps();

  const { filePath, outputPath, json, quiet } = options;
  const snippet = extractCode(source, record.span, options.sourceMapper);

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

  if (quiet) {
    return;
  }

  const language = resolveLanguageContext(fmt);
  const headerTitle = `${fmt.translateLabel('function', 'Function', { englishFirst: language.englishFirst })} ${fmt.translateLabel('extract', 'Extract', { englishFirst: language.englishFirst })}`.trim();
  fmt.header(headerTitle);

  const functionLabel = fmt.translateLabel('function', 'Function', { englishFirst: language.englishFirst });
  fmt.section(`${functionLabel}: ${record.canonicalName || record.name}`);
  fmt.stat(fmt.translateLabel('kind', 'Kind', { englishFirst: language.englishFirst }), record.kind);
  fmt.stat(fmt.translateLabel('location', 'Location', { englishFirst: language.englishFirst }), `${record.line}:${record.column}`);
  if (record.exportKind) {
    fmt.stat(fmt.translateLabel('exported_as', 'Exported As', { englishFirst: language.englishFirst }), record.exportKind);
  }
  fmt.stat(fmt.translateLabel('path_signature', 'Path', { englishFirst: language.englishFirst }), record.pathSignature);
  fmt.stat(fmt.translateLabel('hash', 'Hash', { englishFirst: language.englishFirst }), record.hash);
  if (outputPath) {
    fmt.stat(fmt.translateLabel('output', 'Output', { englishFirst: language.englishFirst }), outputPath);
  }
  if (options.emitPlanPath) {
    fmt.info(formatPlanOutput(fmt, options.emitPlanPath, language.englishFirst));
  }
  fmt.section(fmt.translateLabel('source', 'Source', { englishFirst: language.englishFirst }));
  process.stdout.write(`${snippet}\n`);
  fmt.footer();
}

function extractVariable(options, source, record, selector) {
  const {
    resolveVariableTargetInfo,
    extractCode,
    maybeEmitPlan,
    writeOutputFile,
    outputJson,
    fmt
  } = requireDeps();

  const { filePath, outputPath, json, quiet } = options;
  const target = resolveVariableTargetInfo(record, options.variableTarget);
  const snippet = extractCode(source, target.span, options.sourceMapper);

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

  if (quiet) {
    return;
  }

  const language = resolveLanguageContext(fmt);
  const headerTitle = `${fmt.translateLabel('variable', 'Variable', { englishFirst: language.englishFirst })} ${fmt.translateLabel('extract', 'Extract', { englishFirst: language.englishFirst })}`.trim();
  fmt.header(headerTitle);

  const variableLabel = fmt.translateLabel('variable', 'Variable', { englishFirst: language.englishFirst });
  fmt.section(`${variableLabel}: ${record.canonicalName || record.name}`);
  fmt.stat(fmt.translateLabel('kind', 'Kind', { englishFirst: language.englishFirst }), record.kind);
  fmt.stat(fmt.translateLabel('location', 'Location', { englishFirst: language.englishFirst }), `${record.line}:${record.column}`);
  if (record.initializerType) {
    fmt.stat(fmt.translateLabel('initializer', 'Initializer', { englishFirst: language.englishFirst }), record.initializerType);
  }
  fmt.stat(
    `${fmt.translateLabel('target', 'Target', { englishFirst: language.englishFirst })} ${fmt.translateLabel('mode', 'Mode', { englishFirst: language.englishFirst })}`,
    formatTargetMode(target.mode, target.requestedMode, language)
  );
  fmt.stat(fmt.translateLabel('path_signature', 'Path', { englishFirst: language.englishFirst }), target.pathSignature);
  fmt.stat(fmt.translateLabel('hash', 'Hash', { englishFirst: language.englishFirst }), target.hash);
  fmt.stat(fmt.translateLabel('span', 'Span', { englishFirst: language.englishFirst }), `${target.span.start}:${target.span.end}`);
  if (outputPath) {
    fmt.stat(fmt.translateLabel('output', 'Output', { englishFirst: language.englishFirst }), outputPath);
  }
  if (options.emitPlanPath) {
    fmt.info(formatPlanOutput(fmt, options.emitPlanPath, language.englishFirst));
  }
  fmt.section(fmt.translateLabel('source', 'Source', { englishFirst: language.englishFirst }));
  process.stdout.write(`${snippet}\n`);
  fmt.footer();
}

function replaceVariable(options, source, record, replacementPath, selector) {
  const {
    resolveVariableTargetInfo,
    extractCode,
    createDigest,
    replaceSpan,
    parseModule,
    collectVariables,
    buildVariableRecords,
    variableRecordMatchesPath,
    maybeEmitPlan,
    createNewlineGuard,
    prepareNormalizedSnippet,
    getReplacementSource,
    writeOutputFile,
    computeNewlineStats,
    outputJson,
    fmt,
    renderGuardrailSummary
  } = requireDeps();

  const target = resolveVariableTargetInfo(record, options.variableTarget);
  const snippetBefore = extractCode(source, target.span, options.sourceMapper);
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
  const replacementSource = getReplacementSource(options);
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

  const newSource = replaceSpan(source, target.span, workingSnippet, options.sourceMapper);

  let parsedAst;
  try {
    parsedAst = parseModule(newSource, options.filePath);
    guard.syntax = { status: 'ok' };
  } catch (error) {
    guard.syntax = { status: 'error', message: error.message };
    throw new Error(`Replacement produced invalid JavaScript: ${error.message}`);
  }

  let postTarget = null;
  let postMapper = null;
  let pathMatchFound = false;
  let fallbackUsed = false;

  if (target.pathSignature) {
    const { variables: postVariables, mapper } = collectVariables(parsedAst, newSource);
    postMapper = mapper;
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
      snippetAfter = extractCode(newSource, postTarget.span, postMapper);
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

  const digestInfo = maybeWriteDigestSnapshots('replace-variable', options, selector, {
    canonicalName: record.canonicalName || record.name,
    recordName: record.name,
    kind: record.kind,
    pathSignature: target.pathSignature || null,
    targetMode: target.mode,
    guard,
    plan,
    beforeHash,
    afterHash,
    beforeSpan: target.span,
    afterSpan: (postTarget && postTarget.span) || fallbackTarget.span,
    beforeSnippet: snippetBefore,
    afterSnippet: snippetAfter,
    includeSnippets: Boolean(options.digestIncludeSnippets),
    extras: {
      fallbackUsed,
      postResolved: Boolean(postTarget),
      applied: Boolean(options.fix)
    }
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

  if (digestInfo) {
    payload.digests = digestInfo;
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

  if (options.quiet) {
    return;
  }

  const language = resolveLanguageContext(fmt);
  const headerTitle = `${fmt.translateLabel('variable', 'Variable', { englishFirst: language.englishFirst })} ${fmt.translateLabel('replace', 'Replacement', { englishFirst: language.englishFirst })}`.trim();
  fmt.header(headerTitle);

  const variableLabel = fmt.translateLabel('variable', 'Variable', { englishFirst: language.englishFirst });
  fmt.section(`${variableLabel}: ${record.canonicalName || record.name}`);
  fmt.stat(fmt.translateLabel('kind', 'Kind', { englishFirst: language.englishFirst }), record.kind);
  fmt.stat(fmt.translateLabel('location', 'Location', { englishFirst: language.englishFirst }), `${record.line}:${record.column}`);
  if (record.initializerType) {
    fmt.stat(fmt.translateLabel('initializer', 'Initializer', { englishFirst: language.englishFirst }), record.initializerType);
  }
  fmt.stat(
    `${fmt.translateLabel('target', 'Target', { englishFirst: language.englishFirst })} ${fmt.translateLabel('mode', 'Mode', { englishFirst: language.englishFirst })}`,
    formatTargetMode(target.mode, target.requestedMode, language)
  );
  fmt.stat(fmt.translateLabel('path_signature', 'Path', { englishFirst: language.englishFirst }), target.pathSignature || '(unavailable)');
  fmt.stat(fmt.translateLabel('hash', 'Hash', { englishFirst: language.englishFirst }), target.hash);
  fmt.stat(fmt.translateLabel('mode', 'Mode', { englishFirst: language.englishFirst }), formatModeValue(Boolean(options.fix), language));
  renderGuardrailSummary(guard, options);
  if (digestInfo) {
    fmt.info(formatDigestSnapshot(fmt, 'before', digestInfo.beforePath, language.englishFirst));
    fmt.info(formatDigestSnapshot(fmt, 'after', digestInfo.afterPath, language.englishFirst));
  }
  if (options.emitPlanPath) {
    fmt.info(formatPlanOutput(fmt, options.emitPlanPath, language.englishFirst));
  }
  if (options.previewEdit && !options.fix) {
    const previewLabel = fmt.translateLabel('preview', 'Preview', { englishFirst: language.englishFirst });
    fmt.section(`${previewLabel} (Unified Diff)`);
    const diff = generateUnifiedDiff(snippetBefore, workingSnippet, {
      label: `${record.canonicalName || record.name}`,
      contextLines: 3
    });
    process.stdout.write(`${diff}\n`);
  } else if (options.emitDiff) {
    fmt.section(fmt.translateLabel('original', 'Original', { englishFirst: language.englishFirst }));
    process.stdout.write(`${snippetBefore}\n`);
    fmt.section(fmt.translateLabel('replace', 'Replacement', { englishFirst: language.englishFirst }));
    process.stdout.write(`${snippetAfter}\n`);
  }
  if (!options.fix) {
    fmt.warn(formatDryRunWarning(language));
  } else {
    fmt.success(formatSuccessMessage(options.filePath, language));
  }
  fmt.footer();
}

function replaceFunction(options, source, record, replacementPath, selector) {
  const {
    extractCode,
    createDigest,
    replaceSpan,
    parseModule,
    collectFunctions,
    maybeEmitPlan,
    createNewlineGuard,
    prepareNormalizedSnippet,
    getReplacementSource,
    writeOutputFile,
    outputJson,
    fmt,
    renderGuardrailSummary,
    formatSpanDetails,
    applyRenameToSnippet,
    computeNewlineStats
  } = requireDeps();

  if (!record.replaceable) {
    throw new Error(
      `Function "${record.canonicalName || record.name}" is not currently replaceable. js-edit supports replacements for function declarations, variable-assigned function and arrow expressions (including nested bindings), CommonJS export assignments, ES module default exports, class methods, and recognised call-site callbacks (describe/test hooks).`
    );
  }

  const snippetBefore = extractCode(source, record.span, options.sourceMapper);
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
    const rangeReplacementSource = getReplacementSource(options);
    const normalizedRangeReplacement = prepareNormalizedSnippet(
      rangeReplacementSource,
      fileNewlineStats.style
    );
    workingSnippet = `${workingSnippet.slice(0, start)}${normalizedRangeReplacement.text}${workingSnippet.slice(end)}`;
    replacementMeta = normalizedRangeReplacement;
  } else if (options.replacementPath || options.replacementCode) {
    const replacementSource = getReplacementSource(options);
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

  const newSource = replaceSpan(source, record.span, workingSnippet, options.sourceMapper);

  let parsedAst;
  try {
    parsedAst = parseModule(newSource, options.filePath);
    guard.syntax = { status: 'ok' };
  } catch (error) {
    guard.syntax = { status: 'error', message: error.message };
    throw new Error(`Replacement produced invalid JavaScript: ${error.message}`);
  }

  const { functions: postFunctions, mapper: postMapper } = collectFunctions(parsedAst, newSource);
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

  const snippetAfter = postRecord ? extractCode(newSource, postRecord.span, postMapper) : workingSnippet;
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

  const fallbackAfterSpan = () => {
    const span = {
      start: record.span.start,
      end: record.span.start + (snippetAfter ? snippetAfter.length : workingSnippet.length)
    };
    if (typeof record.span.byteStart === 'number') {
      const byteLength = Buffer.byteLength(snippetAfter || workingSnippet, 'utf8');
      span.byteStart = record.span.byteStart;
      span.byteEnd = record.span.byteStart + byteLength;
    }
    return span;
  };

  const digestInfo = maybeWriteDigestSnapshots('replace-function', options, selector, {
    canonicalName: record.canonicalName || record.name,
    recordName: record.name,
    kind: record.kind,
    pathSignature: record.pathSignature || null,
    guard,
    plan,
    beforeHash,
    afterHash,
    beforeSpan: record.span,
    afterSpan: postRecord ? postRecord.span : fallbackAfterSpan(),
    beforeSnippet: snippetBefore,
    afterSnippet: snippetAfter,
    includeSnippets: Boolean(options.digestIncludeSnippets),
    extras: {
      postResolved: Boolean(postRecord),
      applied: Boolean(options.fix),
      renameTo: options.renameTo || null,
      identifierSpan: record.identifierSpan ? toSpanPayload(record.identifierSpan) : null
    }
  });

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
      hash: record.hash,
      identifierSpan: record.identifierSpan ? toSpanPayload(record.identifierSpan) : null
    },
    applied: Boolean(options.fix),
    guard
  };

  if (plan) {
    payload.plan = plan;
  }

  if (digestInfo) {
    payload.digests = digestInfo;
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

  if (options.quiet) {
    return;
  }

  const language = resolveLanguageContext(fmt);
  const headerTitle = `${fmt.translateLabel('function', 'Function', { englishFirst: language.englishFirst })} ${fmt.translateLabel('replace', 'Replacement', { englishFirst: language.englishFirst })}`.trim();
  fmt.header(headerTitle);

  const functionLabel = fmt.translateLabel('function', 'Function', { englishFirst: language.englishFirst });
  fmt.section(`${functionLabel}: ${record.canonicalName || record.name}`);
  fmt.stat(fmt.translateLabel('kind', 'Kind', { englishFirst: language.englishFirst }), record.kind);
  fmt.stat(fmt.translateLabel('location', 'Location', { englishFirst: language.englishFirst }), `${record.line}:${record.column}`);
  if (record.exportKind) {
    fmt.stat(fmt.translateLabel('exported_as', 'Exported As', { englishFirst: language.englishFirst }), record.exportKind);
  }
  const replaceableLabel = fmt.translateLabel('replaceable', 'Replaceable', { englishFirst: language.englishFirst });
  const replaceableValue = record.replaceable
    ? fmt.translateLabel('yes', 'Yes', { englishFirst: language.englishFirst })
    : fmt.translateLabel('no', 'No', { englishFirst: language.englishFirst });
  fmt.stat(replaceableLabel, replaceableValue);
  if (record.identifierSpan) {
    const identifierLabel = fmt.translateLabel('identifier', 'Identifier', { englishFirst: language.englishFirst });
    fmt.stat(identifierLabel, formatSpanDetails(toSpanPayload(record.identifierSpan)));
  }
  fmt.stat(fmt.translateLabel('path_signature', 'Path', { englishFirst: language.englishFirst }), record.pathSignature);
  fmt.stat(fmt.translateLabel('hash', 'Hash', { englishFirst: language.englishFirst }), record.hash);
  fmt.stat(fmt.translateLabel('mode', 'Mode', { englishFirst: language.englishFirst }), formatModeValue(Boolean(options.fix), language));
  renderGuardrailSummary(guard, options);
  if (digestInfo) {
    fmt.info(formatDigestSnapshot(fmt, 'before', digestInfo.beforePath, language.englishFirst));
    fmt.info(formatDigestSnapshot(fmt, 'after', digestInfo.afterPath, language.englishFirst));
  }
  if (options.emitPlanPath) {
    fmt.info(formatPlanOutput(fmt, options.emitPlanPath, language.englishFirst));
  }
  if (options.previewEdit && !options.fix) {
    const previewLabel = fmt.translateLabel('preview', 'Preview', { englishFirst: language.englishFirst });
    fmt.section(`${previewLabel} (Unified Diff)`);
    const diff = generateUnifiedDiff(snippetBefore, workingSnippet, {
      label: `${record.canonicalName || record.name}`,
      contextLines: 3
    });
    process.stdout.write(`${diff}\n`);
  } else if (options.emitDiff) {
    fmt.section(fmt.translateLabel('original', 'Original', { englishFirst: language.englishFirst }));
    process.stdout.write(`${snippetBefore}\n`);
    fmt.section(fmt.translateLabel('replace', 'Replacement', { englishFirst: language.englishFirst }));
    process.stdout.write(`${snippetAfter}\n`);
  }
  if (!options.fix) {
    fmt.warn(formatDryRunWarning(language));
  } else {
    fmt.success(formatSuccessMessage(options.filePath, language));
  }
  fmt.footer();
}



function toSpanPayload(span) {
  if (!span || typeof span !== 'object') {
    return {
      start: null,
      end: null,
      length: null,
      byteStart: null,
      byteEnd: null,
      byteLength: null
    };
  }

  const start = typeof span.start === 'number' ? span.start : null;
  const end = typeof span.end === 'number' ? span.end : null;
  const length = start !== null && end !== null ? Math.max(0, end - start) : null;
  const byteStart = typeof span.byteStart === 'number' ? span.byteStart : null;
  const byteEnd = typeof span.byteEnd === 'number' ? span.byteEnd : null;
  const byteLength = byteStart !== null && byteEnd !== null ? Math.max(0, byteEnd - byteStart) : null;

  return { start, end, length, byteStart, byteEnd, byteLength };
}

function scanVariableTargets(options, variableRecords, selector) {
  const {
    resolveVariableMatches,
    resolveVariableTargetInfo,
    maybeEmitPlan,
    computeAggregateSpan,
    outputJson,
    fmt,
    formatSpanRange,
    formatAggregateSpan
  } = requireDeps();

  const resolved = resolveVariableMatches(variableRecords, selector, options, { operation: 'scan-targets-variable', allowMultiple: true });
  const targets = resolved.map((record) => resolveVariableTargetInfo(record, options.variableTarget));
  const expectedHashes = targets.map((target) => target.hash || null);
  const expectedSpans = targets.map((target) => target.span || null);
  const plan = maybeEmitPlan('scan-targets', options, selector, resolved, expectedHashes, expectedSpans, {
    entity: 'variable',
    targetMode: options.variableTarget
  });

  const matches = resolved.map((record, index) => {
    const target = targets[index];
    return {
      name: record.canonicalName || record.name,
      originalName: record.name,
      kind: record.kind,
      initializerType: record.initializerType || null,
      scopeChain: record.scopeChain,
      bindingPath: record.pathSignature || null,
      targetMode: target.mode,
      requestedMode: target.requestedMode,
      targetPath: target.pathSignature,
      hash: target.hash,
      span: toSpanPayload(target.span)
    };
  });

  const spanRange = computeAggregateSpan(targets.map((target) => (target?.span ? target.span : null)));

  const payload = {
    file: options.filePath,
    selector,
    kind: 'variable',
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

  if (options.quiet) {
    return;
  }

  const language = resolveLanguageContext(fmt);
  const headerTitle = `${fmt.translateLabel('scan_targets', 'Scan Targets', { englishFirst: language.englishFirst })} (${fmt.translateLabel('variable', 'Variables', { englishFirst: language.englishFirst })})`;
  fmt.header(headerTitle);

  const selectorLabel = fmt.translateLabel('selector', 'Selector', { englishFirst: language.englishFirst });
  fmt.section(`${selectorLabel}: ${selector}`);

  const targetModeLabel = `${fmt.translateLabel('target', 'Target', { englishFirst: language.englishFirst })} ${fmt.translateLabel('mode', 'Mode', { englishFirst: language.englishFirst })}`;
  fmt.stat(targetModeLabel, options.variableTarget);

  const columnLabels = {
    index: fmt.translateLabel('index', 'Index', { englishFirst: language.englishFirst }),
    name: fmt.translateLabel('name', 'Name', { englishFirst: language.englishFirst }),
    kind: fmt.translateLabel('kind', 'Kind', { englishFirst: language.englishFirst }),
    mode: fmt.translateLabel('mode', 'Mode', { englishFirst: language.englishFirst }),
    chars: fmt.translateLabel('chars', 'Chars', { englishFirst: language.englishFirst }),
    bytes: fmt.translateLabel('byte_length', 'Bytes', { englishFirst: language.englishFirst }),
    targetPath: `${fmt.translateLabel('target', 'Target', { englishFirst: language.englishFirst })} ${fmt.translateLabel('path', 'Path', { englishFirst: language.englishFirst })}`,
    hash: fmt.translateLabel('hash', 'Hash', { englishFirst: language.englishFirst })
  };

  const tableRows = matches.map((match, index) => {
    const charSummary = formatSpanRange('chars', match.span.start, match.span.end, match.span.length);
    const byteSummary = formatSpanRange('bytes', match.span.byteStart, match.span.byteEnd, match.span.byteLength);
    return {
      [columnLabels.index]: index + 1,
      [columnLabels.name]: match.name,
      [columnLabels.kind]: match.kind,
      [columnLabels.mode]: match.targetMode,
      [columnLabels.chars]: charSummary || '-',
      [columnLabels.bytes]: byteSummary || '-',
      [columnLabels.targetPath]: match.targetPath || '-',
      [columnLabels.hash]: match.hash ? match.hash.slice(0, 12) : '-'
    };
  });

  fmt.table(tableRows, {
    columns: [
      columnLabels.index,
      columnLabels.name,
      columnLabels.kind,
      columnLabels.mode,
      columnLabels.chars,
      columnLabels.bytes,
      columnLabels.targetPath,
      columnLabels.hash
    ]
  });

  fmt.stat(fmt.translateLabel('matches', 'Matches', { englishFirst: language.englishFirst }), payload.summary.matchCount, 'number');
  const formattedSpanRange = formatAggregateSpan(payload.summary.spanRange);
  if (formattedSpanRange) {
    const spanLabel = fmt.translateLabel('span', 'Span', { englishFirst: language.englishFirst });
    const rangeLabel = fmt.translateLabel('range', 'Range', { englishFirst: language.englishFirst });
    fmt.stat(`${spanLabel} ${rangeLabel}`, formattedSpanRange);
  }
  if (options.emitPlanPath) {
    fmt.info(formatPlanOutput(fmt, options.emitPlanPath, language.englishFirst));
  }
  fmt.footer();
}

module.exports = {
  init,
  locateFunctions,
  locateVariables,
  extractFunction,
  extractVariable,
  replaceVariable,
  replaceFunction,
  scanVariableTargets
};
