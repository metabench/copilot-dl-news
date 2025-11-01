#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CliFormatter } = require('../../src/utils/CliFormatter');
const { CliArgumentParser } = require('../../src/utils/CliArgumentParser');
const { parseModule, collectFunctions, extractCode, replaceSpan } = require('./lib/swcAst');

const fmt = new CliFormatter();

function computeHash(snippet) {
  return crypto.createHash('sha256').update(snippet).digest('hex');
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

  const requireUnique = operation === 'locate' ? !options.allowMultiple : true;

  if (requireUnique && resolved.length !== 1) {
    const details = resolved
      .map((record) => `${record.canonicalName} (${record.kind}) @ ${record.line}:${record.column}`)
      .join('\n  - ');
    throw new Error(`Selector "${selector}" matched ${resolved.length} functions. Use --select or --select-path to disambiguate.\n  - ${details}`);
  }

  return requireUnique ? resolved.slice(0, 1) : resolved;
}

function renderGuardrailSummary(guard, options) {
  if (options.json || options.quiet) {
    return;
  }

  fmt.section('Guardrails');
  fmt.table([
    {
      check: 'Span',
      status: guard.span.status.toUpperCase(),
      details: `${guard.span.start}-${guard.span.end}`
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

function buildPlanPayload(operation, options, selector, records, expectedHashes = []) {
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
      expectedHash: expectedHashes[index] || record.hash
    }))
  };
}

function maybeEmitPlan(operation, options, selector, records, expectedHashes = []) {
  if (!options.emitPlanPath || !records || records.length === 0) {
    return null;
  }

  const plan = buildPlanPayload(operation, options, selector, records, expectedHashes);
  writeOutputFile(options.emitPlanPath, `${JSON.stringify(plan, null, 2)}\n`);
  return plan;
}

function parseCliArgs(argv) {
  const parser = new CliArgumentParser(
    'js-edit',
    'Inspect and edit JavaScript functions using SWC AST tooling.'
  );

  parser
    .add('--file <path>', 'JavaScript file to inspect or modify')
    .add('--list-functions', 'List detected functions', false, 'boolean')
    .add('--extract <selector>', 'Extract the function matching the selector')
    .add('--replace <selector>', 'Replace the function matching the selector')
    .add('--locate <selector>', 'Locate functions matching the provided selector')
    .add('--with <path>', 'Replacement source snippet for --replace')
    .add('--replace-range <start:end>', 'Replace only the relative character range within the located function (0-based, end-exclusive)')
    .add('--rename <identifier>', 'Rename the targeted function identifier instead of supplying a replacement snippet')
    .add('--output <path>', 'Write extracted function to this file instead of stdout')
    .add('--emit-plan <path>', 'Write resolved guard metadata to a JSON plan file')
    .add('--emit-diff', 'Show before/after snippets for replacements', false, 'boolean')
    .add('--fix', 'Apply changes to the target file (default is dry-run)', false, 'boolean')
    .add('--expect-hash <sha256>', 'Require the target to match the provided hash before replacing')
    .add('--force', 'Bypass guardrail validation (hash/path checks)', false, 'boolean')
    .add('--json', 'Emit JSON output instead of formatted text', false, 'boolean')
    .add('--quiet', 'Suppress formatted output (implies --json)', false, 'boolean')
    .add('--benchmark', 'Measure parse time for the input file', false, 'boolean')
    .add('--select <index>', 'Select the nth match when a selector resolves to multiple results')
    .add('--select-path <signature>', 'Force selection to the function with the given path signature')
    .add('--allow-multiple', 'Allow selectors to resolve to multiple matches (skip uniqueness guard)', false, 'boolean');

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
    Boolean(resolved.extract),
    Boolean(resolved.replace),
    Boolean(resolved.locate)
  ].filter(Boolean);
  if (operations.length === 0) {
    throw new Error('Provide one of --list-functions, --extract <selector>, --replace <selector>, or --locate <selector>.');
  }
  if (operations.length > 1) {
    throw new Error('Only one operation may be specified at a time. Choose one of --list-functions, --extract, --replace, or --locate.');
  }

  const json = Boolean(resolved.json || resolved.quiet);
  const quiet = Boolean(resolved.quiet);
  const emitDiff = Boolean(resolved.emitDiff);
  const benchmark = Boolean(resolved.benchmark);
  const fix = Boolean(resolved.fix);
  const force = Boolean(resolved.force);
  const allowMultiple = Boolean(resolved.allowMultiple);
  const expectHash = resolved.expectHash ? String(resolved.expectHash).trim() : null;
  if (expectHash && !/^[0-9a-f]{64}$/i.test(expectHash)) {
    throw new Error('--expect-hash must be a 64-character hex string (sha256).');
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
    selectIndex,
    selectPath,
    allowMultiple,
    replaceRange,
    renameTo
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
    functions: functions.map((fn) => ({
      name: fn.name,
      canonicalName: fn.canonicalName,
      kind: fn.kind,
      exportKind: fn.exportKind,
      replaceable: fn.replaceable,
      line: fn.line,
      column: fn.column,
      scopeChain: fn.scopeChain,
      pathSignature: fn.pathSignature,
      hash: fn.hash
    }))
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
      replaceable: fn.replaceable ? 'yes' : 'no'
    })), {
      columns: ['name', 'kind', 'export', 'line', 'column', 'replaceable']
    });
    fmt.stat('Total functions', functions.length, 'number');
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

function replaceFunction(options, source, record, replacementPath, selector) {
  if (!record.replaceable) {
    throw new Error(`Function "${record.canonicalName || record.name}" is not currently replaceable (only standard function declarations and default exports are supported).`);
  }

  const snippetBefore = extractCode(source, record.span);
  const beforeHash = computeHash(snippetBefore);
  const expectedHash = options.expectHash || record.hash;
  const hashStatus = beforeHash === expectedHash ? 'ok' : options.force ? 'bypass' : 'mismatch';

  const guard = {
    span: {
      status: 'ok',
      start: record.span.start,
      end: record.span.end
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
  const afterHash = postRecord ? postRecord.hash : computeHash(snippetAfter);
  guard.result = {
    status: afterHash === beforeHash ? 'unchanged' : 'changed',
    before: beforeHash,
    after: afterHash
  };

  const plan = maybeEmitPlan('replace', options, selector, [record], [expectedHash]);

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
    const functionRecords = buildFunctionRecords(functions);

    if (options.benchmark && !options.json && !options.quiet) {
      fmt.info(`Parse time: ${durationMs.toFixed(2)} ms`);
    }

    if (options.list) {
      listFunctions(options, source, functions);
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
