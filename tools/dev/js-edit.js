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

function getConfiguredHashEncodings() {
  const encodings = new Set([HASH_PRIMARY_ENCODING, HASH_FALLBACK_ENCODING]);
  return Array.from(encodings).filter((encoding) => HASH_LENGTH_BY_ENCODING[encoding]);
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
  const length = record.identifierSpan.end - record.identifierSpan.start;
  const relativeEnd = relativeStart + length;

  if (relativeStart < 0 || relativeEnd > snippet.length) {
    throw new Error('Unable to map identifier span while renaming. The function structure may have changed.');
  }

  const original = snippet.slice(relativeStart, relativeEnd);
  const leading = original.match(/^\s+/)?.[0] ?? '';
  const trailing = original.match(/\s+$/)?.[0] ?? '';
  const nameStart = relativeStart + leading.length;
  const nameEnd = relativeEnd - trailing.length;

  if (nameStart > nameEnd) {
    throw new Error('Unable to compute identifier bounds while renaming.');
  }

  return `${snippet.slice(0, nameStart)}${newName}${snippet.slice(nameEnd)}`;
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
        baseEnd: entry.relativeBaseEnd
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
    fmt.stat('Applied padding', `${entry.appliedBefore} leading / ${entry.appliedAfter} trailing`);
    fmt.section('Context Snippet');
    process.stdout.write(`${entry.contextSnippet}\n`);
    fmt.section('Base Snippet');
    process.stdout.write(`${entry.baseSnippet}\n`);
  });

  fmt.stat('Matches', contextResult.entries.length, 'number');
  fmt.footer();
}

function renderGuardrailSummary(guard, options) {
  if (options.json || options.quiet) {
    return;
  }

  fmt.section('Guardrails');
  const spanDetails = guard.span.expectedStart !== null && guard.span.expectedEnd !== null
    ? `${guard.span.start}-${guard.span.end} (expected ${guard.span.expectedStart}-${guard.span.expectedEnd})`
    : `${guard.span.start}-${guard.span.end}`;
  fmt.table([
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
  ], {
    columns: ['check', 'status', 'details']
  });
}

function buildPlanPayload(operation, options, selector, records, expectedHashes = [], expectedSpans = []) {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    operation,
    file: options.filePath,
    selector: selector || null,
    matches: records.map((record, index) => ({
      canonicalName: record.canonicalName,
      kind: record.kind,
      exportKind: record.exportKind,
      replaceable: record.replaceable,
      scopeChain: record.scopeChain,
      pathSignature: record.pathSignature,
      span: {
        start: record.span.start,
        end: record.span.end
      },
      identifierSpan: record.identifierSpan
        ? {
            start: record.identifierSpan.start,
            end: record.identifierSpan.end
          }
        : null,
      line: record.line,
      column: record.column,
      hash: record.hash,
      expectedHash: expectedHashes[index] || record.hash,
      expectedSpan: expectedSpans[index] || null
    }))
  };
}

function maybeEmitPlan(operation, options, selector, records, expectedHashes = [], expectedSpans = []) {
  if (!options.emitPlanPath || !records || records.length === 0) {
    return null;
  }

  const plan = buildPlanPayload(operation, options, selector, records, expectedHashes, expectedSpans);
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
    .add('--list-variables', 'List variable bindings with scope, initializer, and hash metadata', false, 'boolean')
    .add('--context-function <selector>', 'Show surrounding source for the function matching the selector (±512 chars by default)')
    .add('--context-variable <selector>', 'Show surrounding source for the variable binding matching the selector (±512 chars by default)')
    .add('--context-before <chars>', 'Override leading context character count (default 512)', undefined, 'number')
    .add('--context-after <chars>', 'Override trailing context character count (default 512)', undefined, 'number')
    .add('--context-enclosing <mode>', 'Expand context to enclosing structures (modes: exact, class, function). Default: exact.', 'exact')
    .add('--extract <selector>', 'Extract the function matching the selector (safe, read-only)')
    .add('--replace <selector>', 'Replace the function matching the selector (requires --with or --rename)')
    .add('--locate <selector>', 'Show guardrail metadata for functions matching the selector')
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
    .add('--allow-multiple', 'Allow selectors to resolve to multiple matches (locate/context/extract)', false, 'boolean');

  return parser.parse(argv);
}

function normalizeOptions(raw) {
  const resolved = { ...raw };
  if (!resolved.file) {
    throw new Error('Missing required option: --file <path>');
  }

  const filePath = path.isAbsolute(resolved.file)
    ? resolved.file
    : path.resolve(process.cwd(), resolved.file);

  const operations = [
    Boolean(resolved.listFunctions),
    Boolean(resolved.listVariables),
    Boolean(resolved.contextFunction),
    Boolean(resolved.contextVariable),
    Boolean(resolved.extract),
    Boolean(resolved.replace),
    Boolean(resolved.locate)
  ].filter(Boolean);
  if (operations.length === 0) {
    throw new Error('Provide one of --list-functions, --list-variables, --context-function <selector>, --context-variable <selector>, --extract <selector>, --replace <selector>, or --locate <selector>.');
  }
  if (operations.length > 1) {
    throw new Error('Only one operation may be specified at a time. Choose one of --list-functions, --list-variables, --context-function, --context-variable, --extract, --replace, or --locate.');
  }

  const json = Boolean(resolved.json || resolved.quiet);
  const quiet = Boolean(resolved.quiet);
  const emitDiff = Boolean(resolved.emitDiff);
  const benchmark = Boolean(resolved.benchmark);
  const fix = Boolean(resolved.fix);
  const force = Boolean(resolved.force);
  const allowMultiple = Boolean(resolved.allowMultiple);
  const expectHash = resolved.expectHash ? String(resolved.expectHash).trim() : null;
  const allowedHashEncodings = getConfiguredHashEncodings();
  if (expectHash && !isValidExpectedHash(expectHash, allowedHashEncodings)) {
    const descriptor = formatHashDescriptor(allowedHashEncodings);
    throw new Error(`--expect-hash must match the configured guard hash (${descriptor}).`);
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

  const selectPath = resolved.selectPath ? String(resolved.selectPath).trim() : null;

  let contextFunctionSelector = null;
  if (resolved.contextFunction !== undefined && resolved.contextFunction !== null) {
    contextFunctionSelector = String(resolved.contextFunction).trim();
    if (!contextFunctionSelector) {
      throw new Error('Provide a non-empty selector for --context-function.');
    }
  }

  let contextVariableSelector = null;
  if (resolved.contextVariable !== undefined && resolved.contextVariable !== null) {
    contextVariableSelector = String(resolved.contextVariable).trim();
    if (!contextVariableSelector) {
      throw new Error('Provide a non-empty selector for --context-variable.');
    }
  }

  let contextBefore = null;
  if (resolved.contextBefore !== undefined && resolved.contextBefore !== null) {
    contextBefore = Number(resolved.contextBefore);
    if (!Number.isFinite(contextBefore) || contextBefore < 0) {
      throw new Error('--context-before must be a non-negative integer.');
    }
  }

  let contextAfter = null;
  if (resolved.contextAfter !== undefined && resolved.contextAfter !== null) {
    contextAfter = Number(resolved.contextAfter);
    if (!Number.isFinite(contextAfter) || contextAfter < 0) {
      throw new Error('--context-after must be a non-negative integer.');
    }
  }

  const contextEnclosingRaw = resolved.contextEnclosing
    ? String(resolved.contextEnclosing).trim().toLowerCase()
    : 'exact';
  if (!CONTEXT_ENCLOSING_MODES.has(contextEnclosingRaw)) {
    throw new Error('--context-enclosing must be one of: exact, class, function.');
  }

  let extractSelector = null;
  if (resolved.extract) {
    extractSelector = String(resolved.extract).trim();
    if (!extractSelector) {
      throw new Error('Provide a non-empty selector for --extract.');
    }
  }

  let replaceSelector = null;
  let replacementPath = null;
  let replaceRange = null;
  let renameTo = null;
  if (resolved.replace) {
    replaceSelector = String(resolved.replace).trim();
    if (!replaceSelector) {
      throw new Error('Provide a non-empty selector for --replace.');
    }
    if (resolved.replaceRange) {
      const parts = String(resolved.replaceRange).split(':');
      if (parts.length !== 2) {
        throw new Error('--replace-range must be supplied as start:end (for example, 12:48).');
      }
      const [rawStart, rawEnd] = parts;
      const start = Number(rawStart);
      const end = Number(rawEnd);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
        throw new Error('--replace-range values must be non-negative integers where start < end.');
      }
      replaceRange = { start, end };
    }

    if (resolved.rename) {
      renameTo = String(resolved.rename).trim();
      if (!renameTo) {
        throw new Error('--rename requires a non-empty identifier.');
      }
      if (!/^[$A-Za-z_][0-9$A-Za-z_]*$/.test(renameTo)) {
        throw new Error('--rename expects a valid JavaScript identifier (letters, digits, $, _).');
      }
    }

    if (replaceRange && !resolved.with) {
      throw new Error('--replace-range requires --with <path> containing the replacement snippet.');
    }

    if (renameTo && resolved.with) {
      throw new Error('Provide either --rename or --with/--replace-range in a single command, not both.');
    }

    if (!resolved.with && !renameTo) {
      throw new Error('Replacing a function requires either --with <path> or --rename <identifier>.');
    }

    if (resolved.with) {
      replacementPath = path.isAbsolute(resolved.with)
        ? resolved.with
        : path.resolve(process.cwd(), resolved.with);
    }
  }
  if (expectSpan && !replaceSelector) {
    throw new Error('--expect-span can only be used alongside --replace.');
  }

  let locateSelector = null;
  if (resolved.locate) {
    locateSelector = String(resolved.locate).trim();
    if (!locateSelector) {
      throw new Error('Provide a non-empty selector for --locate.');
    }
  }

  let outputPath = null;
  if (resolved.output) {
    outputPath = path.isAbsolute(resolved.output)
      ? resolved.output
      : path.resolve(process.cwd(), resolved.output);
  }

  let emitPlanPath = null;
  if (resolved.emitPlan) {
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
    contextBefore,
    contextAfter,
    contextEnclosing: contextEnclosingRaw
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
      byteLength: variable.byteLength
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
  const payload = {
    file: options.filePath,
    selector,
    matches: resolved.map((record) => ({
      name: record.name,
      canonicalName: record.canonicalName,
      kind: record.kind,
      exportKind: record.exportKind,
      line: record.line,
      column: record.column,
      pathSignature: record.pathSignature,
      hash: record.hash,
      scopeChain: record.scopeChain
    }))
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
    fmt.table(payload.matches.map((match, index) => ({
      index: index + 1,
      name: match.canonicalName || match.name,
      kind: match.kind,
      line: match.line,
      column: match.column,
      path: match.pathSignature,
      hash: match.hash.slice(0, 12)
    })), {
      columns: ['index', 'name', 'kind', 'line', 'column', 'path', 'hash']
    });
    fmt.stat('Matches', payload.matches.length, 'number');
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

function showFunctionContext(options, source, functionRecords, selector) {
  const resolved = resolveMatches(functionRecords, selector, options, { operation: 'context' });
  const contextResult = buildContextEntries(resolved, source, options);
  renderContextResults('function', selector, options, contextResult);
}

function showVariableContext(options, source, variableRecords, selector) {
  const resolved = resolveVariableMatches(variableRecords, selector, options, { operation: 'context-variable' });
  const contextResult = buildContextEntries(resolved, source, options);
  renderContextResults('variable', selector, options, contextResult);
}

function replaceFunction(options, source, record, replacementPath, selector) {
  if (!record.replaceable) {
    throw new Error(`Function "${record.canonicalName || record.name}" is not currently replaceable (only standard function declarations and default exports are supported).`);
  }

  const snippetBefore = extractCode(source, record.span);
  const beforeHash = createDigest(snippetBefore);
  const expectedHash = options.expectHash || record.hash;
  const hashStatus = beforeHash === expectedHash ? 'ok' : options.force ? 'bypass' : 'mismatch';

  const expectedSpan = options.expectSpan;
  const actualStart = record.span.start;
  const actualEnd = record.span.end;
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
      expectedStart: expectedSpan ? expectedSpan.start : null,
      expectedEnd: expectedSpan ? expectedSpan.end : null
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
    }
  };

  if (guard.hash.status === 'mismatch') {
    throw new Error(`Hash mismatch for "${record.canonicalName || record.name}". Expected ${expectedHash} but file contains ${beforeHash}. Re-run --locate and retry or pass --force to override.`);
  }

  let workingSnippet = snippetBefore;

  if (options.replaceRange) {
    const { start, end } = options.replaceRange;
    if (end > workingSnippet.length) {
      throw new Error(`--replace-range end (${end}) exceeds the length of the target snippet (${workingSnippet.length}).`);
    }
    const rangeReplacement = loadReplacementSource(replacementPath);
    workingSnippet = `${workingSnippet.slice(0, start)}${rangeReplacement}${workingSnippet.slice(end)}`;
  } else if (replacementPath) {
    const replacement = loadReplacementSource(replacementPath);
    workingSnippet = replacement.endsWith('\n') ? replacement : `${replacement}\n`;
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

  const plan = maybeEmitPlan('replace', options, selector, [record], [expectedHash], [expectedSpan || null]);

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

    const { functions } = collectFunctions(ast, source);
    const { variables } = collectVariables(ast, source);
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
    }
  } catch (error) {
    fmt.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main(process.argv);
}
