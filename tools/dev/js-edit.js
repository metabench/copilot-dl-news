#!/usr/bin/env node
'use strict';

// Fix PowerShell encoding for Unicode box-drawing characters
const { setupPowerShellEncoding } = require('./shared/powershellEncoding');
setupPowerShellEncoding();

const path = require('path');
const { CliFormatter } = require('../../src/utils/CliFormatter');
const { CliArgumentParser } = require('../../src/utils/CliArgumentParser');
const { translateCliArgs } = require('./i18n/dialect');
const { extractLangOption, deriveLanguageModeHint } = require('./i18n/language');
const { getPrimaryAlias } = require('./i18n/lexicon');
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
const { HASH_CHARSETS } = require('./shared/hashConfig');
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
const {
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
} = require('./js-edit/shared/selector');

const fmt = new CliFormatter();
const DEFAULT_CONTEXT_PADDING = 512;
const DEFAULT_PREVIEW_CHARS = 240;
const DEFAULT_SEARCH_LIMIT = 20;
const DEFAULT_SEARCH_CONTEXT = 60;

const CONTEXT_ENCLOSING_MODES = new Set(['exact', 'class', 'function']);

const CHINESE_HELP_ROWS = Object.freeze([
  { flag: '--list-functions', lexKey: 'list_functions', note: '函列: 函数清单' },
  { flag: '--list-variables', lexKey: 'list_variables', note: '变列: 变量清单' },
  { flag: '--search-text', lexKey: 'search_text', note: '文搜: 片段检索' },
  { flag: '--context-function', lexKey: 'context_function', note: '函邻: 上下文' },
  { flag: '--replace', lexKey: 'replace', note: '替: 结合 --以档/--以码' },
  { flag: '--emit-plan', lexKey: 'emit_plan', note: '出计: 审核计划' },
  { flag: '--lang', lexKey: 'lang', note: '语: en/zh/bi' }
]);

const CHINESE_HELP_EXAMPLES = Object.freeze([
  'node tools/dev/js-edit.js --文 src/app.js --函列',
  'node tools/dev/js-edit.js --文 src/app.js --替 exports.alpha --以档 replacements/alpha.js --改'
]);

function resolveAliasLabel(lexKey) {
  const alias = getPrimaryAlias(lexKey);
  return alias ? `--${alias}` : '';
}

function printChineseHelp(languageMode) {
  fmt.header(languageMode === 'bilingual' ? 'js-edit 助理 (英/中)' : 'js-edit 中文速查');
  fmt.info('核心命令与速记别名');
  CHINESE_HELP_ROWS.forEach((row) => {
    const aliasLabel = resolveAliasLabel(row.lexKey);
    const flagDisplay = fmt.COLORS.cyan(row.flag.padEnd(22));
    const aliasDisplay = aliasLabel ? fmt.COLORS.accent(aliasLabel.padEnd(10)) : fmt.COLORS.muted(''.padEnd(10));
    console.log(`${flagDisplay} ${aliasDisplay} ${row.note}`);
  });
  fmt.section('示例');
  CHINESE_HELP_EXAMPLES.forEach((example) => {
    console.log(`  ${fmt.COLORS.muted(example)}`);
  });
  fmt.blank();
  console.log(fmt.COLORS.muted('提示: 使用任意中文别名会自动启用精简模式 (--语 zh 可强制中文)'));
}

function printHelpOutput(languageMode, parser) {
  const program = parser.getProgram();
  if (languageMode === 'zh') {
    printChineseHelp(languageMode);
    return;
  }
  if (languageMode === 'bilingual') {
    if (program && typeof program.helpInformation === 'function') {
      console.log(program.helpInformation());
      console.log('');
    }
    printChineseHelp(languageMode);
    return;
  }
  if (program && typeof program.helpInformation === 'function') {
    console.log(program.helpInformation());
    // Add custom help sections
    const helpSections = [
      '',
      'Examples:',
      '  js-edit --file src/example.js --list-functions',
      '  js-edit --file src/example.js --locate exports.alpha --json',
      '  js-edit --file src/example.js --replace exports.alpha --with replacements/alpha.js --fix',
      '',
      'Discovery commands:',
      '  --list-functions (函列)    Inspect functions with metadata',
      '  --list-variables (变列)    Enumerate variable declarations',
      '  --context-function (函邻)  Show padded context around a match',
      '  --scan-targets (扫标)      Inspect replaceable spans inside a function',
      '',
      'Guardrails and plans:',
      '  --emit-plan (出计)         Write a guarded plan for review',
      '  --expect-hash (预哈)       Enforce content integrity before replace',
      '  --expect-span (预段)       Enforce span alignment during replace',
      '  --allow-multiple (多)      Opt into multi-target operations',
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
      '  --with-code                Inline replacement snippet (newline guarded)',
      '',
      'Bilingual mode:',
      '  Use Chinese aliases (如 --函列, --文) for terse output; --lang zh forces Chinese'
    ].join('\n');
    console.log(helpSections);
  }
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

  const languageMode = typeof fmt.getLanguageMode === 'function' ? fmt.getLanguageMode() : 'en';
  const isChinese = languageMode === 'zh';
  const englishFirst = languageMode !== 'zh';

  const headerTitle = isChinese
    ? `${fmt.translateLabel('extract', 'Extract', { chineseOnly: true })}${fmt.translateLabel('hash', 'Hash', { chineseOnly: true })}`
    : fmt.translateLabel('extract_hashes', 'Hash Extraction', { englishFirst });
  fmt.header(headerTitle);
  fmt.stat(fmt.translateLabel('extract_hashes', 'Hash requests', { englishFirst }), hashes.length, 'number');
  fmt.stat(fmt.translateLabel('matches', 'Matches', { englishFirst }), results.length, 'number');

  results.forEach((entry, index) => {
    const fn = entry.record;
    const displayName = fn.canonicalName || fn.name || '(anonymous)';
    const matchLabel = fmt.translateLabel('matches', 'Match', { englishFirst });
    const sectionTitle = `${matchLabel} ${index + 1}: ${displayName} [${entry.hash}]`;
    fmt.section(sectionTitle);
    fmt.stat(fmt.translateLabel('kind', 'Kind', { englishFirst }), fn.kind || '-');
    if (fn.exportKind) {
      fmt.stat(fmt.translateLabel('exports', 'Export', { englishFirst }), fn.exportKind);
    }
    fmt.stat(fmt.translateLabel('location', 'Location', { englishFirst }), `${fn.line}:${fn.column}`);
    if (fn.pathSignature) {
      fmt.stat(fmt.translateLabel('path_signature', 'Path signature', { englishFirst }), fn.pathSignature);
    }
    const replaceableLabel = isChinese ? '可替' : 'Replaceable';
    const yesLabel = isChinese ? '是' : 'yes';
    const noLabel = isChinese ? '否' : 'no';
    fmt.stat(replaceableLabel, fn.replaceable ? yesLabel : noLabel);
    const sourceLabel = fmt.translateLabel('snippet', 'Snippet', { englishFirst });
    fmt.section(sourceLabel);
    process.stdout.write(`${entry.code}\n`);
  });

  if (options.emitPlanPath) {
    const planLabel = fmt.translateLabel('plan', 'Plan', { englishFirst });
    const writtenLabel = isChinese ? '写入' : 'written to';
    fmt.info(`${planLabel} ${writtenLabel} ${options.emitPlanPath}`);
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

  const program = parser.getProgram();
  if (program && typeof program.helpOption === 'function') {
    program.helpOption(false);
  }
  if (program && typeof program.addHelpCommand === 'function') {
    program.addHelpCommand(false);
  }

  parser
    .add('--help', 'Show this help message', false, 'boolean')
    .add('--lang <code>', 'Output language (en, zh, bilingual, auto)', 'auto')
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
    '  --list-functions (函列)    Inspect functions with metadata',
    '  --list-variables (变列)    Enumerate variable declarations',
    '  --context-function (函邻)  Show padded context around a match',
    '  --scan-targets (扫标)      Inspect replaceable spans inside a function',
    '',
    'Guardrails and plans:',
    '  --emit-plan (出计)         Write a guarded plan for review',
    '  --expect-hash (预哈)       Enforce content integrity before replace',
    '  --expect-span (预段)       Enforce span alignment during replace',
    '  --allow-multiple (多)      Opt into multi-target operations',
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
    '  --with-code                Inline replacement snippet (newline guarded)',
    '',
    'Bilingual mode:',
    '  Use Chinese aliases (如 --函列, --文) for terse output; --lang zh forces Chinese'
  ].join('\n');

  parser.getProgram().addHelpText('after', helpSections);

  const parsedOptions = parser.parse(argv);
  return { options: parsedOptions, parser };
}

async function main() {
  const originalTokens = process.argv.slice(2);
  const translation = translateCliArgs('js-edit', originalTokens);
  const langOverride = extractLangOption(translation.argv);
  const languageHint = deriveLanguageModeHint(langOverride, translation);
  fmt.setLanguageMode(languageHint);

  let parseResult;
  try {
    parseResult = parseCliArgs(translation.argv);
  } catch (error) {
    fmt.error(error.message || String(error));
    process.exitCode = 1;
    return;
  }

  const { options: rawOptions, parser } = parseResult;

  if (rawOptions.help) {
    printHelpOutput(languageHint, parser);
    return;
  }

  let options;
  try {
    options = normalizeOptions(rawOptions);
  } catch (error) {
    fmt.error(error.message || String(error));
    process.exitCode = 1;
    return;
  }

  options.lang = langOverride || rawOptions.lang || 'auto';
  options.languageMode = fmt.getLanguageMode();
  options._i18n = translation;

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
    buildSearchSnippet,
    positionFromIndex,
    findFunctionOwner,
    findVariableOwner,
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
    DEFAULT_SEARCH_CONTEXT,
    DEFAULT_SEARCH_LIMIT,
    createPreviewSnippet,
    buildLineIndex
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
