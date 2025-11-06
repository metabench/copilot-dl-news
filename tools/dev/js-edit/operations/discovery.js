'use strict';

const {
  LIST_OUTPUT_STYLES,
  DEFAULT_LIST_OUTPUT_STYLE
} = require('../shared/constants');

function globToRegex(pattern) {
  if (!pattern || typeof pattern !== 'string') {
    return null;
  }
  
  let regexStr = '^';
  let i = 0;
  
  while (i < pattern.length) {
    const char = pattern[i];
    
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        regexStr += '.*';
        i += 2;
      } else {
        regexStr += '[^.]*';
        i += 1;
      }
    } else if (char === '?') {
      regexStr += '[^.]';
      i += 1;
    } else if ('.^$+{}[]()\\|'.includes(char)) {
      regexStr += '\\' + char;
      i += 1;
    } else {
      regexStr += char;
      i += 1;
    }
  }
  
  regexStr += '$';
  
  try {
    return new RegExp(regexStr, 'i');
  } catch (e) {
    return null;
  }
}

function matchesPattern(value, pattern) {
  if (!value || typeof value !== 'string') {
    return false;
  }
  if (!pattern) {
    return true;
  }
  
  const regex = globToRegex(pattern);
  if (!regex) {
    return value.toLowerCase().includes(pattern.toLowerCase());
  }
  
  return regex.test(value);
}

function resolveListOutputStyle(options) {
  if (options && typeof options.listOutputStyle === 'string') {
    const normalized = options.listOutputStyle.trim().toLowerCase();
    if (LIST_OUTPUT_STYLES.has(normalized)) {
      return normalized;
    }
  }
  return DEFAULT_LIST_OUTPUT_STYLE;
}

function formatLocation(line, column) {
  const lineNumber = typeof line === 'number' ? line : Number(line);
  const columnNumber = typeof column === 'number' ? column : Number(column);
  const hasLine = Number.isFinite(lineNumber);
  const hasColumn = Number.isFinite(columnNumber);
  if (hasLine && hasColumn) {
    return `${lineNumber}:${columnNumber}`;
  }
  if (hasLine) {
    return `${lineNumber}`;
  }
  if (hasColumn) {
    return `:${columnNumber}`;
  }
  return '-';
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
let deps = null;

function init(newDeps) {
  deps = { ...newDeps };
}

function requireDeps() {
  if (!deps) {
    throw new Error('js-edit discovery operations not initialized. Call init() before use.');
  }
  return deps;
}

function listFunctions(options, source, functions) {
  const { fmt, outputJson } = requireDeps();
  const { filePath, json, quiet, filterText, matchPattern, excludePattern, includePaths } = options;
  const normalizedFilter = filterText ? filterText.toLowerCase() : null;

  const matchesFilter = (fn) => {
    if (!normalizedFilter) {
      return true;
    }
    const haystacks = [
      fn.name,
      fn.canonicalName,
      fn.kind,
      fn.exportKind,
      fn.pathSignature,
      fn.hash,
      Array.isArray(fn.scopeChain) ? fn.scopeChain.join(' > ') : null
    ];
    return haystacks.some((value) => typeof value === 'string' && value.toLowerCase().includes(normalizedFilter));
  };

  const matchesIncludeExclude = (fn) => {
    const primaryNames = [fn.name, fn.canonicalName].filter(Boolean);
    
    if (matchPattern) {
      const matched = primaryNames.some((name) => matchesPattern(name, matchPattern));
      if (!matched) {
        return false;
      }
    }
    
    if (excludePattern) {
      const excluded = primaryNames.some((name) => matchesPattern(name, excludePattern));
      if (excluded) {
        return false;
      }
    }
    
    return true;
  };

  const mapRecord = (fn) => {
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
  };

  const filtered = normalizedFilter ? functions.filter(matchesFilter) : functions.slice();
  const patternFiltered = (matchPattern || excludePattern) 
    ? filtered.filter(matchesIncludeExclude)
    : filtered;
  const filteredRecords = patternFiltered.map(mapRecord);

  const payload = {
    file: filePath,
    filterText: filterText || null,
    matchPattern: matchPattern || null,
    excludePattern: excludePattern || null,
    totalFunctions: functions.length,
    matchedFunctions: patternFiltered.length,
    functions: filteredRecords
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

    const filterMessages = [];
    if (filterText) {
      filterMessages.push(`Filter "${filterText}" matched ${filtered.length} functions`);
    }
    if (matchPattern) {
      filterMessages.push(`Match pattern "${matchPattern}" applied`);
    }
    if (excludePattern) {
      filterMessages.push(`Exclude pattern "${excludePattern}" applied`);
    }
    if (filterMessages.length > 0) {
      fmt.info(`${filterMessages.join(', ')} => ${patternFiltered.length} of ${functions.length} total.`);
    }

    fmt.section('Detected Functions');
    if (patternFiltered.length === 0) {
      fmt.warn('No functions matched the current filters.');
    } else {
      const listStyle = resolveListOutputStyle(options);
      const tableRows = filteredRecords.map((record, index) => {
        const original = patternFiltered[index] || null;
        const span = original && original.span ? original.span : null;
        const charLength = span && typeof span.start === 'number' && typeof span.end === 'number'
          ? Math.max(0, span.end - span.start)
          : null;
        const lineValue = Number.isFinite(original?.line) ? original.line : null;
        const columnValue = Number.isFinite(original?.column) ? original.column : null;
        const row = {
          index: index + 1,
          name: record.name,
          hash: record.hash || '-',
          kind: record.kind,
          export: record.exportKind || '-',
          line: Number.isFinite(lineValue) ? lineValue : '-',
          column: Number.isFinite(columnValue) ? columnValue : '-'
        };

        const byteLength = Number.isFinite(record.byteLength) ? record.byteLength : charLength ?? 0;
        row.bytes = byteLength;
        row.replaceable = record.replaceable ? 'yes' : 'no';
        row.location = formatLocation(lineValue, columnValue);

        if (includePaths) {
          row.path = record.pathSignature || '-';
        }
        return row;
      });

      if (listStyle === 'dense') {
        fmt.denseList(tableRows, {
          labelFormatter: (row) => `${row.index}.`,
          renderSegments: (row) => {
            const segments = [
              row.name || '(anonymous)',
              row.kind ? `kind=${row.kind}` : null,
              row.hash && row.hash !== '-' ? `hash=${row.hash}` : null,
              row.export && row.export !== '-' ? `export=${row.export}` : null,
              `loc=${row.location}`,
              `bytes=${row.bytes}`,
              `replaceable=${row.replaceable}`
            ];
            if (includePaths && row.path && row.path !== '-') {
              segments.push(`path=${row.path}`);
            }
            return segments;
          }
        });
      } else {
        const columns = ['index', 'name', 'hash', 'kind', 'export', 'line', 'column', 'bytes', 'replaceable'];
        if (includePaths) {
          columns.push('path');
        }
        fmt.table(tableRows, { columns });
      }
    }
    fmt.stat('Total functions', functions.length, 'number');
    if (filterText || matchPattern || excludePattern) {
      fmt.stat('Matched functions', patternFiltered.length, 'number');
    }
    fmt.footer();
  }
}

function scanFunctionTargets(options, functionRecords, selector) {
  const {
    fmt,
    outputJson,
    resolveMatches,
    maybeEmitPlan,
    computeAggregateSpan,
    formatSpanRange,
    formatAggregateSpan
  } = requireDeps();

  const resolved = resolveMatches(functionRecords, selector, options, { operation: 'scan-targets', allowMultiple: true });
  const expectedHashes = resolved.map((record) => record.hash || null);
  const expectedSpans = resolved.map((record) => record.span || null);
  const plan = maybeEmitPlan('scan-targets', options, selector, resolved, expectedHashes, expectedSpans, {
    entity: 'function'
  });

  const matches = resolved.map((record) => ({
    name: record.canonicalName || record.name,
    originalName: record.name,
    kind: record.kind,
    exportKind: record.exportKind,
    replaceable: Boolean(record.replaceable),
    line: record.line,
    column: record.column,
    pathSignature: record.pathSignature,
    hash: record.hash,
    span: toSpanPayload(record.span),
    identifierSpan: toSpanPayload(record.identifierSpan)
  }));

  const spanRange = computeAggregateSpan(matches.map((match) => (match.span ? match.span : null)));

  const payload = {
    file: options.filePath,
    selector,
    kind: 'function',
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

  fmt.header('Scan Targets (Functions)');
  fmt.section(`Selector: ${selector}`);
  fmt.table(matches.map((match, index) => {
    const charSummary = formatSpanRange('chars', match.span.start, match.span.end, match.span.length);
    const byteSummary = formatSpanRange('bytes', match.span.byteStart, match.span.byteEnd, match.span.byteLength);
    return {
      index: index + 1,
      name: match.name,
      kind: match.kind,
      line: match.line,
      column: match.column,
      chars: charSummary || '-',
      bytes: byteSummary || '-',
      path: match.pathSignature || '-',
      hash: match.hash ? match.hash.slice(0, 12) : '-'
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

function listConstructors(options, functionRecords, classMetadataMap) {
  const {
    fmt,
    outputJson,
    spanKey
  } = requireDeps();
  const { filePath, json, quiet, filterText, matchPattern, excludePattern, includePaths, includeInternals } = options;
  const normalizedFilter = filterText ? filterText.toLowerCase() : null;

  const metadataMap = classMetadataMap || new Map();
  const classRecordsBySpan = new Map();
  const constructorsByClass = new Map();

  functionRecords.forEach((record) => {
    const recordKey = spanKey(record.span);
    if (record.kind === 'class' && recordKey) {
      classRecordsBySpan.set(recordKey, record);
    }

    if (record.kind === 'class-method' && Array.isArray(record.scopeChain)) {
      const lastSegment = record.scopeChain[record.scopeChain.length - 1] || '';
      if (typeof lastSegment === 'string' && lastSegment.toLowerCase() === '#constructor') {
        const classKey = spanKey(record.enclosingSpan);
        if (!classKey) {
          return;
        }
        if (!constructorsByClass.has(classKey)) {
          constructorsByClass.set(classKey, []);
        }
        constructorsByClass.get(classKey).push(record);
      }
    }
  });

  for (const list of constructorsByClass.values()) {
    list.sort((a, b) => {
      const aStart = a?.span?.start ?? 0;
      const bStart = b?.span?.start ?? 0;
      return aStart - bStart;
    });
  }

  const normalizeToken = (value) => {
    if (!value || typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const segments = trimmed.split(/[^A-Za-z0-9_$]+/).filter(Boolean);
    if (segments.length === 0) {
      return trimmed.toLowerCase();
    }
    return segments[segments.length - 1].toLowerCase();
  };

  const heritageTokens = new Set();
  const registerHeritage = (value) => {
    const normalized = normalizeToken(value);
    if (normalized) {
      heritageTokens.add(normalized);
    }
  };

  for (const metadata of metadataMap?.values?.() || []) {
    if (metadata.superClass) {
      registerHeritage(metadata.superClass);
    }
    if (Array.isArray(metadata.implements)) {
      metadata.implements.forEach(registerHeritage);
    }
  }

  const copySpan = (span) => {
    if (!span || typeof span !== 'object') {
      return null;
    }
    return {
      start: typeof span.start === 'number' ? span.start : null,
      end: typeof span.end === 'number' ? span.end : null,
      byteStart: typeof span.byteStart === 'number' ? span.byteStart : null,
      byteEnd: typeof span.byteEnd === 'number' ? span.byteEnd : null
    };
  };

  const buildClassTokens = (className, canonicalName) => {
    const tokens = new Set();
    const add = (value) => {
      const normalized = normalizeToken(value);
      if (normalized) {
        tokens.add(normalized);
      }
    };
    add(className);
    add(canonicalName);
    if (typeof canonicalName === 'string') {
      canonicalName.split(/[^A-Za-z0-9_$]+/).forEach(add);
    }
    return tokens;
  };

  const includeInternalsFlag = Boolean(includeInternals);
  const entries = [];

  const buildEntry = (classInfo, constructorRecord, constructorMetaMap, kind) => {
    const constructorKey = constructorRecord ? spanKey(constructorRecord.span) : null;
    const metadata = constructorKey && constructorMetaMap ? constructorMetaMap.get(constructorKey) : null;
    const rawParams = Array.isArray(metadata?.params)
      ? metadata.params.filter((value) => typeof value === 'string' && value.length > 0)
      : [];
    let params;
    if (kind === 'implicit') {
      params = '(implicit)';
    } else if (rawParams.length === 0) {
      params = '(none)';
    } else {
      params = rawParams.join(', ');
    }

    const line = Number.isFinite(constructorRecord?.line) ? constructorRecord.line : classInfo.line;
    const column = Number.isFinite(constructorRecord?.column) ? constructorRecord.column : classInfo.column;

    return {
      classInfo,
      constructorRecord,
      constructorKind: kind,
      constructorParams: params,
      constructorHash: constructorRecord?.hash || null,
      constructorCanonicalName: constructorRecord?.canonicalName || null,
      constructorScopeChain: Array.isArray(constructorRecord?.scopeChain) ? constructorRecord.scopeChain : null,
      constructorPathSignature: constructorRecord?.pathSignature || null,
      constructorLine: line ?? null,
      constructorColumn: column ?? null,
      constructorByteLength: Number.isFinite(constructorRecord?.byteLength) ? constructorRecord.byteLength : null,
      constructorSpan: copySpan(constructorRecord?.span)
    };
  };

  for (const [classKey, metadata] of (metadataMap?.entries?.() || [])) {
    const classRecord = classRecordsBySpan.get(classKey) || null;
    const constructors = constructorsByClass.get(classKey) || [];
    const className =
      classRecord?.name ||
      metadata?.name ||
      (constructors[0]?.enclosingName) ||
      '(anonymous class)';
    const canonicalName = classRecord?.canonicalName || className;
    const exportKind = classRecord?.exportKind || null;
    const scopeChain = Array.isArray(classRecord?.scopeChain) ? classRecord.scopeChain : null;
    const pathSignature = classRecord?.pathSignature || null;
    const line = Number.isFinite(classRecord?.line) ? classRecord.line : null;
    const column = Number.isFinite(classRecord?.column) ? classRecord.column : null;
    const implementsList = Array.isArray(metadata?.implements) ? metadata.implements.filter(Boolean) : [];
    const extendsValue = metadata?.superClass || null;
    const classTokens = buildClassTokens(className, canonicalName);
    const isReferenced = [...classTokens].some((token) => heritageTokens.has(token));
    const hasHeritage = Boolean(extendsValue) || implementsList.length > 0;
    const isExported = Boolean(exportKind) || (scopeChain && scopeChain[0] === 'exports');
    const isInternal = !isExported && !hasHeritage && !isReferenced;

    if (!includeInternalsFlag && isInternal) {
      continue;
    }

    const classInfo = {
      key: classKey,
      name: className,
      canonicalName,
      exportKind,
      scopeChain,
      pathSignature,
      line,
      column,
      implementsList,
      extendsValue,
      span: metadata?.span ? copySpan(metadata.span) : null,
      isInternal
    };

    const constructorMetaMap = metadata?.constructors || new Map();

    if (constructors.length === 0) {
      entries.push(buildEntry(classInfo, null, constructorMetaMap, 'implicit'));
    } else {
      constructors.forEach((ctorRecord) => {
        entries.push(buildEntry(classInfo, ctorRecord, constructorMetaMap, 'explicit'));
      });
    }
  }

  entries.sort((a, b) => {
    const aStart = a.constructorRecord?.span?.start ?? a.classInfo?.span?.start ?? 0;
    const bStart = b.constructorRecord?.span?.start ?? b.classInfo?.span?.start ?? 0;
    if (aStart !== bStart) {
      return aStart - bStart;
    }
    const aName = a.classInfo?.name || '';
    const bName = b.classInfo?.name || '';
    return aName.localeCompare(bName);
  });

  const matchesFilter = (entry) => {
    if (!normalizedFilter) {
      return true;
    }
    const implementsJoined = entry.classInfo.implementsList.length > 0
      ? entry.classInfo.implementsList.join(', ')
      : null;
    const scopeChainLabel = entry.constructorScopeChain
      ? entry.constructorScopeChain.join(' > ')
      : entry.classInfo.scopeChain
        ? entry.classInfo.scopeChain.join(' > ')
        : null;

    const haystacks = [
      entry.classInfo.name,
      entry.classInfo.canonicalName,
      entry.classInfo.exportKind,
      entry.classInfo.extendsValue,
      implementsJoined,
      entry.constructorParams,
      entry.constructorHash,
      entry.constructorCanonicalName,
      scopeChainLabel,
      entry.constructorPathSignature,
      entry.classInfo.pathSignature,
      entry.constructorKind,
      entry.classInfo.isInternal ? 'internal' : null
    ];

    return haystacks.some((value) => typeof value === 'string' && value.toLowerCase().includes(normalizedFilter));
  };

  const matchesIncludeExclude = (entry) => {
    const primaryNames = [entry.classInfo.name, entry.classInfo.canonicalName].filter(Boolean);
    
    if (matchPattern) {
      const matched = primaryNames.some((name) => matchesPattern(name, matchPattern));
      if (!matched) {
        return false;
      }
    }
    
    if (excludePattern) {
      const excluded = primaryNames.some((name) => matchesPattern(name, excludePattern));
      if (excluded) {
        return false;
      }
    }
    
    return true;
  };

  const filteredEntries = normalizedFilter ? entries.filter(matchesFilter) : entries.slice();
  const patternFiltered = (matchPattern || excludePattern)
    ? filteredEntries.filter(matchesIncludeExclude)
    : filteredEntries;

  const serializeEntry = (entry) => {
    const classImplements = entry.classInfo.implementsList.length > 0 ? entry.classInfo.implementsList.slice() : null;
    return {
      class: {
        name: entry.classInfo.name,
        canonicalName: entry.classInfo.canonicalName,
        exportKind: entry.classInfo.exportKind || null,
        extends: entry.classInfo.extendsValue || null,
        implements: classImplements,
        scopeChain: entry.classInfo.scopeChain,
        pathSignature: entry.classInfo.pathSignature || null,
        line: entry.classInfo.line,
        column: entry.classInfo.column,
        span: entry.classInfo.span,
        internal: entry.classInfo.isInternal
      },
      constructor: {
        kind: entry.constructorKind,
        canonicalName: entry.constructorCanonicalName,
        hash: entry.constructorHash,
        params: entry.constructorParams,
        scopeChain: entry.constructorScopeChain,
        pathSignature: entry.constructorPathSignature,
        line: entry.constructorLine,
        column: entry.constructorColumn,
        byteLength: entry.constructorByteLength,
        span: entry.constructorSpan
      }
    };
  };

  const payload = {
    file: filePath,
    filterText: filterText || null,
    matchPattern: matchPattern || null,
    excludePattern: excludePattern || null,
    includeInternals: includeInternalsFlag,
    totalConstructors: entries.length,
    matchedConstructors: patternFiltered.length,
    constructors: patternFiltered.map(serializeEntry)
  };

  if (json) {
    outputJson(payload);
    return;
  }

  if (!quiet) {
    fmt.header('Constructor Inventory');
    if (entries.length === 0) {
      fmt.warn('No classes with constructors detected in the supplied file.');
      return;
    }

    const filterMessages = [];
    if (filterText) {
      filterMessages.push(`Filter "${filterText}" matched ${filteredEntries.length} constructors`);
    }
    if (matchPattern) {
      filterMessages.push(`Match pattern "${matchPattern}" applied`);
    }
    if (excludePattern) {
      filterMessages.push(`Exclude pattern "${excludePattern}" applied`);
    }
    if (filterMessages.length > 0) {
      fmt.info(`${filterMessages.join(', ')} => ${patternFiltered.length} of ${entries.length} total.`);
    }

    fmt.section('Detected Constructors');
    if (patternFiltered.length === 0) {
      fmt.warn('No constructors matched the current filters.');
    } else {
      const listStyle = resolveListOutputStyle(options);
      const tableRows = patternFiltered.map((entry, index) => {
        const implementsLabel = entry.classInfo.implementsList.length > 0
          ? entry.classInfo.implementsList.join(', ')
          : '-';
        const classLine = Number.isFinite(entry.classInfo.line) ? entry.classInfo.line : null;
        const classColumn = Number.isFinite(entry.classInfo.column) ? entry.classInfo.column : null;
        const ctorLine = Number.isFinite(entry.constructorLine) ? entry.constructorLine : classLine;
        const ctorColumn = Number.isFinite(entry.constructorColumn) ? entry.constructorColumn : classColumn;

        const row = {
          index: index + 1,
          class: entry.classInfo.canonicalName || entry.classInfo.name,
          export: entry.classInfo.exportKind || '-',
          extends: entry.classInfo.extendsValue || '-',
          implements: implementsLabel,
          params: entry.constructorParams,
          hash: entry.constructorHash || '-',
          kind: entry.constructorKind,
          line: Number.isFinite(ctorLine) ? ctorLine : '-',
          column: Number.isFinite(ctorColumn) ? ctorColumn : '-',
          internal: entry.classInfo.isInternal ? 'yes' : 'no',
          location: formatLocation(ctorLine, ctorColumn)
        };

        if (includePaths) {
          row.classPath = entry.classInfo.pathSignature || '-';
          row.constructorPath = entry.constructorPathSignature || '-';
        }

        return row;
      });

      if (listStyle === 'dense') {
        fmt.denseList(tableRows, {
          labelFormatter: (row) => `${row.index}.`,
          renderSegments: (row) => {
            const segments = [
              row.class || '(anonymous class)',
              row.hash && row.hash !== '-' ? `hash=${row.hash}` : null,
              row.params ? `params=${row.params}` : null,
              row.extends && row.extends !== '-' ? `extends=${row.extends}` : null,
              row.implements && row.implements !== '-' ? `implements=${row.implements}` : null,
              row.kind ? `kind=${row.kind}` : null,
              `loc=${row.location}`,
              `internal=${row.internal}`
            ];
            if (includePaths) {
              if (row.classPath && row.classPath !== '-') {
                segments.push(`classPath=${row.classPath}`);
              }
              if (row.constructorPath && row.constructorPath !== '-') {
                segments.push(`ctorPath=${row.constructorPath}`);
              }
            }
            return segments;
          }
        });
      } else {
        const columns = ['index', 'class', 'export', 'extends', 'implements', 'params', 'hash', 'kind', 'line', 'column'];
        if (includePaths) {
          columns.push('classPath', 'constructorPath');
        }
        columns.push('internal');

        fmt.table(tableRows, { columns });
      }
    }

    fmt.stat('Total constructors', entries.length, 'number');
    if (filterText || matchPattern || excludePattern) {
      fmt.stat('Matched constructors', patternFiltered.length, 'number');
    }
    fmt.footer();
  }
}

function listVariables(options, source, variables) {
  const { fmt, outputJson, toReadableScope } = requireDeps();
  const { filePath, json, quiet, filterText, matchPattern, excludePattern } = options;
  const normalizedFilter = filterText ? filterText.toLowerCase() : null;

  const matchesFilter = (variable) => {
    if (!normalizedFilter) {
      return true;
    }

    const haystacks = [
      variable.name,
      variable.kind,
      variable.exportKind,
      variable.initializerType,
      variable.pathSignature,
      variable.hash,
      variable.declarationHash,
      variable.declaratorHash,
      Array.isArray(variable.scopeChain) ? variable.scopeChain.join(' > ') : null
    ];

    return haystacks.some((value) => typeof value === 'string' && value.toLowerCase().includes(normalizedFilter));
  };

  const matchesIncludeExclude = (variable) => {
    const primaryName = variable.name;
    
    if (matchPattern) {
      const matched = matchesPattern(primaryName, matchPattern);
      if (!matched) {
        return false;
      }
    }
    
    if (excludePattern) {
      const excluded = matchesPattern(primaryName, excludePattern);
      if (excluded) {
        return false;
      }
    }
    
    return true;
  };

  const mapRecord = (variable) => {
    const byteLength = typeof variable.byteLength === 'number'
      ? variable.byteLength
      : Math.max(0, (variable.span?.end ?? 0) - (variable.span?.start ?? 0));

    return {
      name: variable.name,
      kind: variable.kind,
      exportKind: variable.exportKind,
      initializerType: variable.initializerType,
      line: variable.line,
      column: variable.column,
      scopeChain: variable.scopeChain,
      pathSignature: variable.pathSignature,
      hash: variable.hash,
      byteLength,
      declaratorSpan: variable.declaratorSpan,
      declaratorHash: variable.declaratorHash,
      declaratorByteLength: variable.declaratorByteLength,
      declaratorPathSignature: variable.declaratorPathSignature,
      declarationSpan: variable.declarationSpan,
      declarationHash: variable.declarationHash,
      declarationByteLength: variable.declarationByteLength,
      declarationPathSignature: variable.declarationPathSignature
    };
  };

  const filtered = normalizedFilter ? variables.filter(matchesFilter) : variables.slice();
  const patternFiltered = (matchPattern || excludePattern)
    ? filtered.filter(matchesIncludeExclude)
    : filtered;

  const payload = {
    file: filePath,
    filterText: filterText || null,
    matchPattern: matchPattern || null,
    excludePattern: excludePattern || null,
    totalVariables: variables.length,
    matchedVariables: patternFiltered.length,
    variables: patternFiltered.map(mapRecord)
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

    const filterMessages = [];
    if (filterText) {
      filterMessages.push(`Filter "${filterText}" matched ${filtered.length} variables`);
    }
    if (matchPattern) {
      filterMessages.push(`Match pattern "${matchPattern}" applied`);
    }
    if (excludePattern) {
      filterMessages.push(`Exclude pattern "${excludePattern}" applied`);
    }
    if (filterMessages.length > 0) {
      fmt.info(`${filterMessages.join(', ')} => ${patternFiltered.length} of ${variables.length} total.`);
    }

    fmt.section('Detected Variables');
    if (patternFiltered.length === 0) {
      fmt.warn('No variables matched the current filters.');
    } else {
      fmt.table(patternFiltered.map((variable) => ({
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
    }

    fmt.stat('Total variables', variables.length, 'number');
    if (filterText || matchPattern || excludePattern) {
      fmt.stat('Matched variables', patternFiltered.length, 'number');
    }
    fmt.footer();
  }
}

function previewFunction(options, source, functionRecords, selector) {
  const {
    resolveMatches,
    extractCode,
    createPreviewSnippet,
    maybeEmitPlan,
    outputJson,
    fmt,
    formatSpanDetails
  } = requireDeps();

  const [record] = resolveMatches(functionRecords, selector, options, { operation: 'preview' });
  const snippet = extractCode(source, record.span, options.sourceMapper);
  const preview = createPreviewSnippet(snippet, options.previewChars);

  const payload = {
    file: options.filePath,
    selector,
    entity: 'function',
    function: {
      name: record.name,
      canonicalName: record.canonicalName,
      kind: record.kind,
      exportKind: record.exportKind || null,
      line: record.line,
      column: record.column,
      scopeChain: record.scopeChain,
      pathSignature: record.pathSignature,
      hash: record.hash,
      span: record.span
    },
    preview: {
      text: preview.text,
      truncated: preview.truncated,
      totalChars: preview.totalChars,
      limit: preview.limit
    }
  };

  const plan = maybeEmitPlan('preview', options, selector, [record]);
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

  fmt.header('Function Preview');
  fmt.section(`Selector: ${selector}`);
  fmt.stat('Name', record.canonicalName || record.name);
  fmt.stat('Kind', record.kind);
  if (record.exportKind) {
    fmt.stat('Export', record.exportKind);
  }
  fmt.stat('Location', `${record.line}:${record.column}`);
  if (Array.isArray(record.scopeChain) && record.scopeChain.length > 0) {
    fmt.stat('Scope', record.scopeChain.join(' > '));
  }
  fmt.stat('Path', record.pathSignature);
  fmt.stat('Hash', record.hash);
  const spanDetails = formatSpanDetails(record.span);
  if (spanDetails) {
    fmt.stat('Span', spanDetails);
  }
  const displayedChars = Math.min(preview.limit, preview.totalChars);
  fmt.stat('Preview length', `${displayedChars} of ${preview.totalChars}`);
  if (preview.truncated) {
    fmt.warn(`Preview truncated to ${preview.limit} characters. Use --preview-chars to extend.`);
  }
  fmt.section('Preview Snippet');
  fmt.codeBlock(preview.text);
  if (options.emitPlanPath) {
    fmt.info(`Plan written to ${options.emitPlanPath}`);
  }
  fmt.footer();
}

function previewVariable(options, source, variableRecords, selector) {
  const {
    resolveVariableMatches,
    resolveVariableTargetInfo,
    extractCode,
    createPreviewSnippet,
    maybeEmitPlan,
    outputJson,
    fmt,
    formatSpanDetails
  } = requireDeps();

  const [record] = resolveVariableMatches(variableRecords, selector, options, { operation: 'preview-variable' });
  const target = resolveVariableTargetInfo(record, options.variableTarget);
  const snippet = extractCode(source, target.span, options.sourceMapper);
  const preview = createPreviewSnippet(snippet, options.previewChars);

  const payload = {
    file: options.filePath,
    selector,
    entity: 'variable',
    variable: {
      name: record.name,
      canonicalName: record.canonicalName,
      kind: record.kind,
      initializerType: record.initializerType || null,
      line: record.line,
      column: record.column,
      scopeChain: record.scopeChain,
      targetMode: target.mode,
      requestedMode: target.requestedMode,
      pathSignature: target.pathSignature,
      hash: target.hash,
      span: target.span,
      byteLength: target.byteLength
    },
    preview: {
      text: preview.text,
      truncated: preview.truncated,
      totalChars: preview.totalChars,
      limit: preview.limit
    }
  };

  const plan = maybeEmitPlan('preview-variable', options, selector, [record], [target.hash], [target.span], {
    entity: 'variable',
    targetMode: target.mode
  });
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

  fmt.header('Variable Preview');
  fmt.section(`Selector: ${selector}`);
  fmt.stat('Name', record.canonicalName || record.name);
  fmt.stat('Kind', record.kind);
  if (record.initializerType) {
    fmt.stat('Initializer', record.initializerType);
  }
  fmt.stat('Location', `${record.line}:${record.column}`);
  if (Array.isArray(record.scopeChain) && record.scopeChain.length > 0) {
    fmt.stat('Scope', record.scopeChain.join(' > '));
  }
  fmt.stat('Target Mode', `${target.mode} (requested ${target.requestedMode})`);
  fmt.stat('Path', target.pathSignature || '(unavailable)');
  fmt.stat('Hash', target.hash);
  const spanDetails = formatSpanDetails(target.span);
  if (spanDetails) {
    fmt.stat('Span', spanDetails);
  }
  const displayedChars = Math.min(preview.limit, preview.totalChars);
  fmt.stat('Preview length', `${displayedChars} of ${preview.totalChars}`);
  if (preview.truncated) {
    fmt.warn(`Preview truncated to ${preview.limit} characters. Use --preview-chars to extend.`);
  }
  fmt.section('Preview Snippet');
  fmt.codeBlock(preview.text);
  if (options.emitPlanPath) {
    fmt.info(`Plan written to ${options.emitPlanPath}`);
  }
  fmt.footer();
}

function searchTextMatches(options, source, functionRecords, variableRecords) {
  const {
    fmt,
    outputJson,
    DEFAULT_SEARCH_LIMIT,
    DEFAULT_SEARCH_CONTEXT,
    buildLineIndex,
    positionFromIndex,
    buildSearchSnippet,
    findFunctionOwner,
    findVariableOwner,
    resolveVariableTargetInfo,
    formatSpanRange
  } = requireDeps();

  const query = options.searchText;
  const limit = Number.isInteger(options.searchLimit) && options.searchLimit > 0
    ? options.searchLimit
    : DEFAULT_SEARCH_LIMIT;
  const contextChars = Number.isFinite(options.searchContext) && options.searchContext >= 0
    ? Math.floor(options.searchContext)
    : DEFAULT_SEARCH_CONTEXT;

  const matches = [];
  let truncated = false;
  const lineOffsets = buildLineIndex(source);
  const step = Math.max(1, query.length);
  let searchIndex = 0;

  while (searchIndex <= source.length) {
    const matchIndex = source.indexOf(query, searchIndex);
    if (matchIndex === -1) {
      break;
    }

    const matchEnd = matchIndex + query.length;

    if (matches.length < limit) {
      const location = positionFromIndex(matchIndex, lineOffsets);
      const snippet = buildSearchSnippet(source, matchIndex, matchEnd, contextChars);
      const functionOwner = findFunctionOwner(functionRecords, matchIndex);
      const variableOwner = findVariableOwner(variableRecords, matchIndex);

      const functionGuard = functionOwner
        ? {
            name: functionOwner.name,
            canonicalName: functionOwner.canonicalName,
            kind: functionOwner.kind,
            line: functionOwner.line,
            column: functionOwner.column,
            pathSignature: functionOwner.pathSignature,
            hash: functionOwner.hash
          }
        : null;

      let variableGuard = null;
      if (variableOwner) {
        let targetInfo = null;
        try {
          targetInfo = resolveVariableTargetInfo(variableOwner, options.variableTarget);
        } catch (error) {
          targetInfo = null;
        }
        variableGuard = {
          name: variableOwner.name,
          canonicalName: variableOwner.canonicalName,
          kind: variableOwner.kind,
          line: variableOwner.line,
          column: variableOwner.column,
          pathSignature: targetInfo?.pathSignature || variableOwner.pathSignature,
          hash: targetInfo?.hash || variableOwner.hash,
          targetMode: targetInfo?.mode || options.variableTarget,
          span: targetInfo?.span || variableOwner.span
        };
      }

      const suggestionEntry = buildSearchSuggestionsForMatch({
        matchIndex,
        query,
        functionOwner,
        variableOwner,
        options,
        contextChars
      });

      matches.push({
        index: matches.length + 1,
        charStart: matchIndex,
        charEnd: matchEnd,
        line: location.line,
        column: location.column,
        snippet,
        guard: {
          function: functionGuard,
          variable: variableGuard
        },
        suggestions: suggestionEntry
      });
    } else {
      truncated = true;
      break;
    }

    searchIndex = matchIndex + step;
  }

  const payloadMatches = matches.map((match) => ({
    index: match.index,
    charStart: match.charStart,
    charEnd: match.charEnd,
    line: match.line,
    column: match.column,
    snippet: {
      before: match.snippet.before,
      match: match.snippet.match,
      after: match.snippet.after,
      truncatedBefore: match.snippet.truncatedBefore,
      truncatedAfter: match.snippet.truncatedAfter,
      highlighted: match.snippet.highlighted,
      range: match.snippet.range
    },
    guard: match.guard,
    suggestions: match.suggestions
  }));

  const payload = {
    file: options.filePath,
    query,
    limit,
    contextChars,
    matches: payloadMatches,
    matchCount: payloadMatches.length,
    truncated
  };

  if (options.json) {
    outputJson(payload);
    return;
  }

  if (options.quiet) {
    return;
  }

  fmt.header('Text Search');
  fmt.section(`Query: "${query}"`);
  fmt.stat('Matches reported', payload.matchCount, 'number');
  fmt.stat('Limit', limit, 'number');
  fmt.stat('Context chars', contextChars, 'number');

  if (payload.matchCount === 0) {
    fmt.warn('No matches found.');
    if (options.emitPlanPath) {
      fmt.info(`Plan written to ${options.emitPlanPath}`);
    }
    fmt.footer();
    return;
  }

  fmt.section('Match Overview');
  fmt.table(payloadMatches.map((match) => ({
    index: match.index,
    line: match.line,
    column: match.column,
    function: match.guard.function
      ? (match.guard.function.canonicalName || match.guard.function.name || '-')
      : '-',
    variable: match.guard.variable
      ? (match.guard.variable.canonicalName || match.guard.variable.name || '-')
      : '-'
  })), {
    columns: ['index', 'line', 'column', 'function', 'variable']
  });

  if (truncated) {
    fmt.warn('Additional matches were omitted. Increase --search-limit to capture more results.');
  }

  matches.forEach((match) => {
    fmt.section(`Match ${match.index}`);
    fmt.stat('Location', `${match.line}:${match.column}`);
    const spanSummary = formatSpanRange('chars', match.charStart, match.charEnd, match.charEnd - match.charStart);
    if (spanSummary) {
      fmt.stat('Span', spanSummary);
    }

    if (match.guard.function) {
      const fnGuard = match.guard.function;
      const hashPreview = fnGuard.hash ? fnGuard.hash.slice(0, 12) : '(unknown)';
      fmt.stat('Function guard', `${fnGuard.canonicalName || fnGuard.name} (${hashPreview})`);
      fmt.stat('Function path', fnGuard.pathSignature);
    }

    if (match.guard.variable) {
      const varGuard = match.guard.variable;
      const hashPreview = varGuard.hash ? varGuard.hash.slice(0, 12) : '(unknown)';
      fmt.stat('Variable guard', `${varGuard.canonicalName || varGuard.name} (${hashPreview})`);
      fmt.stat('Variable path', varGuard.pathSignature || '(unavailable)');
      if (varGuard.targetMode) {
        fmt.stat('Target mode', varGuard.targetMode);
      }
    }

    const contextSummary = formatSpanRange('chars', match.snippet.range.start, match.snippet.range.end, match.snippet.range.end - match.snippet.range.start);
    if (contextSummary) {
      fmt.stat('Context window', contextSummary);
    }

    fmt.section('Snippet');
    fmt.codeBlock(match.snippet.highlighted);

    const suggestionCommands = buildSearchSuggestions(match, options);
    if (suggestionCommands && suggestionCommands.length > 0) {
      fmt.list('Follow-up commands', suggestionCommands.map((command) => `js-edit ${command}`));
    }
  });

  if (options.emitPlanPath) {
    fmt.info(`Plan written to ${options.emitPlanPath}`);
  }

  fmt.footer();
}

function buildSearchSuggestions(match) {
  if (Array.isArray(match.suggestions) && match.suggestions.length > 0) {
    return match.suggestions;
  }
  return [];
}

function buildSearchSuggestionsForMatch({ query, functionOwner, variableOwner, options, contextChars }) {
  const { DEFAULT_SEARCH_CONTEXT } = requireDeps();
  const commands = [];
  const baseArgs = [`--file "${options.filePath}"`];

  if (functionOwner && functionOwner.hash) {
    const selector = functionOwner.canonicalName || functionOwner.name;
    if (selector) {
      commands.push(`${baseArgs.join(' ')} --locate "${escapeSuggestionValue(selector)}" --select hash:${functionOwner.hash}`);
    }
  }

  if (variableOwner && variableOwner.hash) {
    const selector = variableOwner.canonicalName || variableOwner.name;
    if (selector) {
      commands.push(`${baseArgs.join(' ')} --locate-variable "${escapeSuggestionValue(selector)}" --select hash:${variableOwner.hash}`);
    }
  }

  if (commands.length === 0) {
    const resolvedContext = Number.isFinite(contextChars) && contextChars >= 0 ? contextChars : DEFAULT_SEARCH_CONTEXT;
    commands.push(`${baseArgs.join(' ')} --search-text "${escapeSuggestionValue(query)}" --search-context ${resolvedContext}`);
  }

  return commands;
}

function escapeSuggestionValue(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/"/g, '\"');
}

function snipeSymbol(options, source, functionRecords, variableRecords, position) {
  const { fmt, outputJson } = requireDeps();
  const { filePath, json, quiet } = options;

  const parsedPosition = parsePosition(position, source);
  if (!parsedPosition) {
    throw new Error(`Invalid position format: "${position}". Use line:col (e.g., 10:5) or byte offset (e.g., 500)`);
  }

  const { byteOffset, line, column } = parsedPosition;
  const rangeSelector = `@range=${byteOffset}-${byteOffset}`;

  const matchingFunctions = functionRecords.filter(record => {
    const span = record.span;
    if (!span || typeof span.byteStart !== 'number' || typeof span.byteEnd !== 'number') {
      return false;
    }
    return span.byteStart <= byteOffset && span.byteEnd >= byteOffset;
  });

  const matchingVariables = variableRecords.filter(record => {
    const span = record.span;
    if (!span || typeof span.byteStart !== 'number' || typeof span.byteEnd !== 'number') {
      return false;
    }
    return span.byteStart <= byteOffset && span.byteEnd >= byteOffset;
  });

  const allMatches = [
    ...matchingFunctions.map(r => ({ ...r, symbolType: 'function' })),
    ...matchingVariables.map(r => ({ ...r, symbolType: 'variable' }))
  ].sort((a, b) => {
    const aSize = (a.span.byteEnd - a.span.byteStart);
    const bSize = (b.span.byteEnd - b.span.byteStart);
    return aSize - bSize;
  });

  if (allMatches.length === 0) {
    if (json) {
      outputJson({
        file: filePath,
        position: { line, column, byteOffset },
        matches: []
      });
      return;
    }
    fmt.header('Symbol Snipe');
    fmt.warn(`No symbol found at ${line}:${column} (byte ${byteOffset})`);
    fmt.footer();
    return;
  }

  const nearest = allMatches[0];

  if (json) {
    outputJson({
      file: filePath,
      position: { line, column, byteOffset },
      symbol: {
        type: nearest.symbolType,
        name: nearest.name,
        canonicalName: nearest.canonicalName,
        kind: nearest.kind,
        hash: nearest.hash,
        line: nearest.line,
        column: nearest.column,
        span: toSpanPayload(nearest.span)
      }
    });
    return;
  }

  if (!quiet) {
    fmt.header('Symbol Snipe');
    fmt.info(`Position: ${line}:${column} (byte ${byteOffset})`);
    fmt.section('Nearest Symbol');
    fmt.table([{
      type: nearest.symbolType,
      name: nearest.canonicalName || nearest.name,
      kind: nearest.kind,
      hash: nearest.hash || '-',
      line: nearest.line,
      column: nearest.column,
      bytes: `${nearest.span.byteStart}-${nearest.span.byteEnd}`
    }], {
      columns: ['type', 'name', 'kind', 'hash', 'line', 'column', 'bytes']
    });
    fmt.footer();
  }
}

function parsePosition(position, source) {
  if (!position || typeof position !== 'string') {
    return null;
  }

  const colonMatch = position.match(/^(\d+):(\d+)$/);
  if (colonMatch) {
    const line = parseInt(colonMatch[1], 10);
    const column = parseInt(colonMatch[2], 10);
    if (!Number.isInteger(line) || !Number.isInteger(column) || line < 1 || column < 1) {
      return null;
    }
    const byteOffset = lineColToByteOffset(source, line, column);
    return { line, column, byteOffset };
  }

  const byteMatch = position.match(/^(\d+)$/);
  if (byteMatch) {
    const byteOffset = parseInt(byteMatch[1], 10);
    if (!Number.isInteger(byteOffset) || byteOffset < 0) {
      return null;
    }
    const { line, column } = byteOffsetToLineCol(source, byteOffset);
    return { line, column, byteOffset };
  }

  return null;
}

function lineColToByteOffset(source, line, column) {
  const lines = source.split('\n');
  let byteOffset = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    byteOffset += Buffer.byteLength(lines[i], 'utf8') + 1;
  }
  if (line - 1 < lines.length) {
    const lineText = lines[line - 1];
    const colText = lineText.substring(0, column - 1);
    byteOffset += Buffer.byteLength(colText, 'utf8');
  }
  return byteOffset;
}

function byteOffsetToLineCol(source, byteOffset) {
  const lines = source.split('\n');
  let currentOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineBytes = Buffer.byteLength(lines[i], 'utf8');
    if (currentOffset + lineBytes >= byteOffset) {
      const lineStart = currentOffset;
      const byteInLine = byteOffset - lineStart;
      let column = 1;
      let accumulated = 0;
      for (const char of lines[i]) {
        if (accumulated >= byteInLine) break;
        accumulated += Buffer.byteLength(char, 'utf8');
        column++;
      }
      return { line: i + 1, column };
    }
    currentOffset += lineBytes + 1;
  }
  return { line: lines.length, column: 1 };
}

function outlineSymbols(options, source, functionRecords, variableRecords) {
  const { fmt, outputJson } = requireDeps();
  const { filePath, json, quiet } = options;

  const isTopLevel = (record) => {
    if (!Array.isArray(record.scopeChain)) {
      return true;
    }
    return record.scopeChain.length === 0 || 
           (record.scopeChain.length === 1 && ['exports', 'module.exports'].includes(record.scopeChain[0]));
  };

  const topLevelFunctions = functionRecords.filter(isTopLevel);
  const topLevelVariables = variableRecords.filter(isTopLevel);

  const symbols = [
    ...topLevelFunctions.map(r => ({
      type: 'function',
      name: r.canonicalName || r.name,
      kind: r.kind,
      line: r.line,
      column: r.column,
      byteStart: r.span?.byteStart,
      byteEnd: r.span?.byteEnd,
      byteLength: r.span ? (r.span.byteEnd - r.span.byteStart) : 0
    })),
    ...topLevelVariables.map(r => ({
      type: 'variable',
      name: r.name,
      kind: r.kind,
      line: r.line,
      column: r.column,
      byteStart: r.span?.byteStart,
      byteEnd: r.span?.byteEnd,
      byteLength: r.span ? (r.span.byteEnd - r.span.byteStart) : 0
    }))
  ].sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });

  if (json) {
    outputJson({
      file: filePath,
      totalSymbols: functionRecords.length + variableRecords.length,
      topLevelSymbols: symbols.length,
      symbols
    });
    return;
  }

  if (!quiet) {
    fmt.header('Symbol Outline');
    if (symbols.length === 0) {
      fmt.warn('No top-level symbols detected');
      fmt.footer();
      return;
    }

    fmt.section('Top-Level Symbols');
    fmt.table(symbols.map((sym, idx) => ({
      index: idx + 1,
      type: sym.type,
      name: sym.name,
      kind: sym.kind,
      line: sym.line,
      column: sym.column,
      bytes: sym.byteLength,
      location: formatLocation(sym.line, sym.column)
    })), {
      columns: ['index', 'type', 'name', 'kind', 'line', 'column', 'bytes']
    });

    fmt.stat('Total symbols', functionRecords.length + variableRecords.length, 'number');
    fmt.stat('Top-level symbols', symbols.length, 'number');
    fmt.footer();
  }
}

module.exports = {
  init,
  listFunctions,
  scanFunctionTargets,
  listConstructors,
  listVariables,
  previewFunction,
  previewVariable,
  searchTextMatches,
  snipeSymbol,
  outlineSymbols,
  buildSearchSuggestions,
  buildSearchSuggestionsForMatch,
  escapeSuggestionValue
};
