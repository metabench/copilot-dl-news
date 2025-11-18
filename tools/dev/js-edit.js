#!/usr/bin/env node
'use strict';

// Fix PowerShell encoding for Unicode box-drawing characters
const { setupPowerShellEncoding } = require('./shared/powershellEncoding');
setupPowerShellEncoding();

const path = require('path');
const fs = require('fs');
const { CliFormatter } = require('../../src/utils/CliFormatter');
const { CliArgumentParser } = require('../../src/utils/CliArgumentParser');
const { translateCliArgs } = require('./i18n/dialect');
const { extractLangOption, deriveLanguageModeHint } = require('./i18n/language');
const { getPrimaryAlias } = require('./i18n/lexicon');
const TokenCodec = require('../../src/codec/TokenCodec');

// TypeScript support via environment variables (similar to external repo)
const EDIT_LANGUAGE = process.env.TSNJS_EDIT_LANGUAGE === 'typescript' ? 'typescript' : 'javascript';
const EDIT_COMMAND_NAME = process.env.TSNJS_EDIT_COMMAND || 'js-edit';
const swcRuntime = EDIT_LANGUAGE === 'typescript' ? require('./lib/swcTs') : require('./lib/swcAst');

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
} = swcRuntime;
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
const RecipeEngine = require('./js-edit/recipes/RecipeEngine');
const OperationDispatcher = require('./js-edit/recipes/OperationDispatcher');
const BatchDryRunner = require('./js-edit/BatchDryRunner');

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
  { flag: '--match-snapshot', lexKey: 'match_snapshot', note: '摄取: 载入 js-scan 匹配' },
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

let cachedStdinData = null;

function readAllStdin() {
  if (cachedStdinData !== null) {
    return Promise.resolve(cachedStdinData);
  }
  return new Promise((resolve, reject) => {
    if (!process.stdin) {
      cachedStdinData = '';
      resolve('');
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('error', (error) => {
      reject(error);
    });
    process.stdin.on('end', () => {
      cachedStdinData = data;
      resolve(data);
    });
    try {
      process.stdin.resume();
    } catch (err) {
      cachedStdinData = '';
      resolve('');
    }
  });
}

async function readSnapshotJsonInput(ref) {
  if (!ref) {
    throw new Error('Provide a snapshot file path or "-" to read from stdin.');
  }
  if (ref === '-') {
    const stdinPayload = await readAllStdin();
    if (!stdinPayload || !stdinPayload.trim()) {
      throw new Error('No match snapshot data received from stdin. Pipe js-scan JSON output into --match-snapshot -.');
    }
    try {
      return JSON.parse(stdinPayload);
    } catch (error) {
      throw new Error(`Failed to parse match snapshot JSON from stdin: ${error.message}`);
    }
  }
  const absolute = path.isAbsolute(ref) ? ref : path.resolve(process.cwd(), ref);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Match snapshot file not found: ${absolute}`);
  }
  const raw = fs.readFileSync(absolute, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse match snapshot JSON from ${absolute}: ${error.message}`);
  }
}

async function readTokenInput(ref) {
  if (!ref) {
    throw new Error('Provide a continuation token reference or "-" to read from stdin.');
  }
  if (ref === '-') {
    const stdinPayload = await readAllStdin();
    const token = typeof stdinPayload === 'string' ? stdinPayload.trim() : '';
    if (!token) {
      throw new Error('No continuation token provided via stdin. Pipe the js-scan token into --from-token -.');
    }
    return token;
  }
  const absolute = path.isAbsolute(ref) ? ref : path.resolve(process.cwd(), ref);
  if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
    const tokenFromFile = fs.readFileSync(absolute, 'utf8').trim();
    if (!tokenFromFile) {
      throw new Error(`Continuation token file ${absolute} is empty.`);
    }
    return tokenFromFile;
  }
  return ref.trim();
}

function extractMatchSnapshotPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  if (payload.match && typeof payload.match === 'object') {
    return payload.match;
  }
  if (payload.snapshot && typeof payload.snapshot === 'object') {
    return payload.snapshot;
  }
  if (payload.relationship && payload.relationship.entry && payload.relationship.entry.match) {
    return payload.relationship.entry.match;
  }
  if (payload.file && typeof payload.file === 'string') {
    return payload;
  }
  return null;
}

function normalizeMatchSnapshotForIngestion(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }
  const clone = { ...snapshot };
  const candidateFile = typeof clone.file === 'string' && clone.file.length > 0
    ? clone.file
    : (typeof clone.relativeFile === 'string' ? path.resolve(process.cwd(), clone.relativeFile) : null);
  if (candidateFile) {
    clone.file = path.isAbsolute(candidateFile) ? candidateFile : path.resolve(process.cwd(), candidateFile);
    clone.relativeFile = clone.relativeFile || path.relative(process.cwd(), clone.file);
  }
  return clone;
}

function deriveSnapshotHints(snapshot) {
  const hints = {
    selector: null,
    selectHash: null,
    selectIndex: null,
    selectPath: null,
    expectHash: null
  };
  if (!snapshot || typeof snapshot !== 'object') {
    return hints;
  }
  const plan = snapshot.jsEditHint && snapshot.jsEditHint.plan ? snapshot.jsEditHint.plan : null;
  if (plan) {
    if (plan.selector && typeof plan.selector === 'string') {
      hints.selector = plan.selector;
    }
    if (plan.select && typeof plan.select === 'string') {
      const selectValue = plan.select.trim();
      const lower = selectValue.toLowerCase();
      if (lower.startsWith('hash:')) {
        hints.selectHash = selectValue.slice(selectValue.indexOf(':') + 1).trim();
      } else if (/^\d+$/.test(selectValue)) {
        hints.selectIndex = parseInt(selectValue, 10);
      } else if (lower.startsWith('path:')) {
        hints.selectPath = selectValue;
      }
    }
    if (plan.expectHash && typeof plan.expectHash === 'string') {
      hints.expectHash = plan.expectHash;
    }
  }

  if (!hints.selector) {
    if (snapshot.canonicalName) {
      hints.selector = snapshot.canonicalName;
    } else if (snapshot.name) {
      hints.selector = snapshot.name;
    } else if (snapshot.hash) {
      hints.selector = `hash:${snapshot.hash}`;
    }
  }

  if (!hints.selectHash && snapshot.hash) {
    hints.selectHash = snapshot.hash;
  }

  if (!hints.expectHash && snapshot.hash) {
    hints.expectHash = snapshot.hash;
  }

  return hints;
}

function findRepositoryRoot(startDir) {
  let currentDir = path.resolve(startDir);
  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, 'package.json')) || fs.existsSync(path.join(currentDir, '.git'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  return startDir;
}

async function hydrateMatchSnapshotContext(options) {
  if (!options.matchSnapshotInput && !options.fromTokenInput) {
    return;
  }

  let rawPayload;
  let ingestSource = 'snapshot';
  let tokenMetadata = null;

  if (options.matchSnapshotInput) {
    rawPayload = await readSnapshotJsonInput(options.matchSnapshotInput);
  } else {
    ingestSource = 'token';
    const tokenString = await readTokenInput(options.fromTokenInput);
    let decoded;
    try {
      decoded = TokenCodec.decode(tokenString);
    } catch (error) {
      throw new Error(`Failed to decode continuation token: ${error.message}`);
    }
    const repoRoot = findRepositoryRoot(process.cwd());
    const secretKey = TokenCodec.deriveSecretKey({ repo_root: repoRoot });
    const validation = TokenCodec.validate(decoded, { secret_key: secretKey });
    if (!validation.valid) {
      throw new Error(validation.error || 'Continuation token validation failed.');
    }
    rawPayload = decoded.payload && decoded.payload.parameters
      ? { match: decoded.payload.parameters.match }
      : null;
    tokenMetadata = {
      tokenId: decoded._token_id || null,
      action: decoded.payload ? decoded.payload.action : null,
      requestId: decoded.payload && decoded.payload.context ? decoded.payload.context.request_id : null
    };
  }

  const snapshot = normalizeMatchSnapshotForIngestion(extractMatchSnapshotPayload(rawPayload));
  if (!snapshot || !snapshot.file) {
    throw new Error('Match snapshot payload is missing file metadata. Re-run js-scan --continuation --json to refresh tokens.');
  }

  if (!fs.existsSync(snapshot.file)) {
    throw new Error(`Snapshot target file not found: ${snapshot.file}`);
  }

  const hints = deriveSnapshotHints(snapshot);
  if (!hints.selector) {
    throw new Error('Snapshot missing selector hints; rerun js-scan with --ai-mode to capture canonical selectors.');
  }

  if (options.filePath) {
    const normalizedFile = path.isAbsolute(options.filePath)
      ? options.filePath
      : path.resolve(process.cwd(), options.filePath);
    if (path.normalize(normalizedFile) !== path.normalize(snapshot.file)) {
      throw new Error(`Snapshot points to ${snapshot.file}, but --file was set to ${options.filePath}. Run the command without --file or provide the matching path.`);
    }
    options.filePath = normalizedFile;
  } else {
    options.filePath = snapshot.file;
  }
  options.matchSnapshotContext = {
    snapshot,
    selector: hints.selector,
    selectHash: hints.selectHash,
    selectIndex: hints.selectIndex,
    selectPath: hints.selectPath,
    expectHash: hints.expectHash,
    source: ingestSource,
    tokenMetadata,
    warnings: []
  };

  if (!options.selectHash && hints.selectHash) {
    options.selectHash = hints.selectHash;
  }
  if (!options.selectIndex && typeof hints.selectIndex === 'number') {
    options.selectIndex = hints.selectIndex;
  }
  if (!options.selectPath && hints.selectPath) {
    options.selectPath = hints.selectPath;
  }
  if (!options.expectHash && hints.expectHash) {
    options.expectHash = hints.expectHash;
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

  const hasSnapshotArg = resolved.matchSnapshot !== undefined && resolved.matchSnapshot !== null;
  const hasTokenArg = resolved.fromToken !== undefined && resolved.fromToken !== null;

  if (hasSnapshotArg && hasTokenArg) {
    throw new Error('Use either --match-snapshot or --from-token, not both in the same invocation.');
  }

  const matchSnapshotInput = hasSnapshotArg ? String(resolved.matchSnapshot).trim() : null;
  if (matchSnapshotInput !== null && matchSnapshotInput.length === 0) {
    throw new Error('--match-snapshot requires a file path or "-" for stdin.');
  }
  const fromTokenInput = hasTokenArg ? String(resolved.fromToken).trim() : null;
  if (fromTokenInput !== null && fromTokenInput.length === 0) {
    throw new Error('--from-token requires a compact token id, file path, or "-" for stdin.');
  }

  // Recipe mode and batch operations don't require --file
  let filePath = null;
  const isBatchOperation = Boolean(resolved.dryRun || resolved.recalculateOffsets || resolved.fromPlan || resolved.copyBatch);
  const isSnapshotIngest = Boolean(matchSnapshotInput || fromTokenInput);
  if (!resolved.recipe && !isBatchOperation && !isSnapshotIngest) {
    const fileInput = resolved.file ? String(resolved.file).trim() : '';
    if (!fileInput) {
      throw new Error('Missing required option: --file <path>');
    }

    filePath = path.isAbsolute(fileInput)
      ? fileInput
      : path.resolve(process.cwd(), fileInput);

    resolved.filePath = filePath;
  } else if (resolved.file) {
    // For batch operations, still store the file path if provided
    const fileInput = String(resolved.file).trim();
    if (fileInput) {
      filePath = path.isAbsolute(fileInput)
        ? fileInput
        : path.resolve(process.cwd(), fileInput);
      resolved.filePath = filePath;
    }
  }

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

  const hasMatchSnapshotOperation = Boolean(matchSnapshotInput);
  const hasTokenIngestOperation = Boolean(fromTokenInput);

  const operationMatrix = [
    ['--recipe', resolved.recipe !== undefined && resolved.recipe !== null],
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
    ['--copy', resolved.copy !== undefined && resolved.copy !== null],
    ['--replace', resolved.replace !== undefined && resolved.replace !== null],
    ['--locate', resolved.locate !== undefined && resolved.locate !== null],
    ['--locate-variable', resolved.locateVariable !== undefined && resolved.locateVariable !== null],
    ['--extract-variable', resolved.extractVariable !== undefined && resolved.extractVariable !== null],
    ['--replace-variable', resolved.replaceVariable !== undefined && resolved.replaceVariable !== null],
    ['--dry-run', Boolean(resolved.dryRun)],
    ['--recalculate-offsets', Boolean(resolved.recalculateOffsets)],
    ['--from-plan', resolved.fromPlan !== undefined && resolved.fromPlan !== null],
    ['--match-snapshot', hasMatchSnapshotOperation],
    ['--from-token', hasTokenIngestOperation]
    ,['--copy-batch', resolved.copyBatch !== undefined && resolved.copyBatch !== null]
  ];

  const enabledOperations = operationMatrix.filter(([, flag]) => Boolean(flag));
  if (enabledOperations.length === 0) {
    throw new Error('Provide one of --list-functions, --list-constructors, --function-summary, --extract-hashes <hashes>, --list-variables, --outline, --context-function <selector>, --context-variable <selector>, --preview <selector>, --preview-variable <selector>, --snipe <position>, --search-text <substring>, --scan-targets <selector>, --extract <selector>, --replace <selector>, --locate <selector>, --locate-variable <selector>, --extract-variable <selector>, --replace-variable <selector>, --dry-run, --recalculate-offsets, --from-plan, --match-snapshot <path>, --from-token <ref>, or --recipe <path>.');
  }
  if (enabledOperations.length > 1) {
    const flags = enabledOperations.map(([flag]) => flag).join(', ');
    throw new Error(`Only one operation may be specified at a time. Found: ${flags}.`);
  }
  // Store param array
  resolved.param = Array.isArray(resolved.param) ? resolved.param : [];

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
  const copySelector = parseSelector(resolved.copy, '--copy');
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
  const hasCopy = Boolean(copySelector);

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

  if (hasCopy && !resolved.copyToFile) {
    throw new Error('--copy requires --copy-to-file option.');
  }

  let copyToFile = null;
  let copyToPosition = null;
  if (resolved.copyToFile !== undefined && resolved.copyToFile !== null) {
    const raw = String(resolved.copyToFile).trim();
    if (!raw) {
      throw new Error('--copy-to-file requires a file path.');
    }
    copyToFile = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  }

  if (resolved.copyToPosition !== undefined && resolved.copyToPosition !== null) {
    const posValue = String(resolved.copyToPosition).trim();
    if (!posValue) {
      throw new Error('--copy-to-position requires a non-empty value.');
    }

    // allow numeric position or descriptive tokens
    const numeric = Number(posValue);
    if (Number.isFinite(numeric) && Number.isInteger(numeric) && numeric >= 0) {
      copyToPosition = numeric;
    } else {
      const allowed = ['after-last-import', 'before-first-function'];
      if (!allowed.includes(posValue)) {
        throw new Error(`--copy-to-position must be one of: ${allowed.join(', ')} or a non-negative integer.`);
      }
      copyToPosition = posValue;
    }
  }

  let copyBatch = null;
  if (resolved.copyBatch !== undefined && resolved.copyBatch !== null) {
    const batchPath = String(resolved.copyBatch).trim();
    if (!batchPath) {
      throw new Error('--copy-batch requires a file path');
    }
    copyBatch = path.isAbsolute(batchPath) ? batchPath : path.resolve(process.cwd(), batchPath);
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
    copySelector,
    copyToFile,
    copyToPosition,
    copyBatch,
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
    listOutputStyle,
    recipe: resolved.recipe,
    param: Array.isArray(resolved.param) ? resolved.param : [],
    dryRun: Boolean(resolved.dryRun),
    recalculateOffsets: Boolean(resolved.recalculateOffsets),
    changes: resolved.changes,
    fromPlan: resolved.fromPlan, // Keep as string (file path), not boolean
    matchSnapshotInput,
    fromTokenInput
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
    .add('--copy <selector>', 'Copy a function from one file to another')
    .add('--copy-to-file <path>', 'Target file to copy the function to')
    .add('--copy-to-position <position>', 'Position to insert the function: number, "after-last-import", "before-first-function" (default: end of file)')
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
    .add('--match-snapshot <path>', 'Load a js-scan match snapshot JSON payload (use "-" for stdin)')
    .add('--from-token <ref>', 'Decode a js-scan continuation token (file path, literal id, or "-" for stdin)')
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
    .add('--recipe <path>', 'Load and execute a recipe JSON file for multi-step refactoring')
    .add(
      '--param <key=value>',
      'Override recipe parameter (repeatable)',
      [],
      (value, previous) => {
        const list = Array.isArray(previous) ? [...previous] : [];
        list.push(value);
        return list;
      }
    )
    .add('--benchmark', 'Show benchmark timing for parsing', false, 'boolean')
    .add('--dry-run', 'Preview batch changes without modifying files (requires --changes)', false, 'boolean')
    .add('--recalculate-offsets', 'Recompute line/column offsets after batch changes (Gap 3)', false, 'boolean')
    .add('--changes <path>', 'JSON file containing batch changes: [{ file, startLine, endLine, replacement }]')
    .add('--copy-batch <path>', 'JSON plan file containing copy operations for batch insertion')
    .add('--from-plan <path>', 'Load and apply a saved operation plan with guard verification (Gap 4)');

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
    '  --match-snapshot <path>    Ingest js-scan match snapshots ("-" for stdin)',
    '  --from-token <ref>         Decode js-scan continuation tokens to plans',
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


/**
 * Handle recipe mode execution
 * Loads a recipe JSON file and executes multi-step refactoring workflow
 * @param {Object} options - CLI options including recipe path and params
 */
async function handleRecipeMode(options) {
  try {
    const recipePath = path.isAbsolute(options.recipe)
      ? options.recipe
      : path.resolve(process.cwd(), options.recipe);

    // Create operation dispatcher
    const dispatcher = new OperationDispatcher({
      logger: options.verbose ? console.log : () => {},
      verbose: options.verbose || false
    });

    const engine = new RecipeEngine(recipePath, {
      dispatcher,
      verbose: options.verbose,
      dryRun: !options.fix
    });

    await engine.load();
    const recipeDefinition = engine.recipe || {};

    // Parse --param arguments into parameter overrides
    const paramOverrides = {};
    const cliParams = Array.isArray(options.param)
      ? options.param
      : (typeof options.param === 'string' ? [options.param] : []);

    cliParams.forEach((param) => {
      const [rawKey, rawValue] = param.split('=', 2);
      if (!rawKey || rawValue === undefined) {
        return;
      }

      const key = rawKey.trim();
      let value = rawValue.trim();
      const quoted = (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith('\'') && value.endsWith('\''));
      if (quoted && value.length >= 2) {
        value = value.slice(1, -1);
      }

      if (key) {
        paramOverrides[key] = value;
      }
    });

    await engine.validate();

    if (!options.json) {
      console.log('Recipe validated successfully');

      fmt.header('Recipe Execution');
      const recipeName = recipeDefinition.name || path.basename(recipePath);
      const stepCount = Array.isArray(recipeDefinition.steps) ? recipeDefinition.steps.length : 0;
      fmt.stat('Recipe', recipeName);
      fmt.stat('Steps', stepCount, 'number');
      console.log();
    }

    await engine.execute(Object.keys(paramOverrides).length > 0 ? { params: paramOverrides } : {});
    const baseResult = engine.getResults();
    const result = {
      ...baseResult,
      recipeFile: recipePath,
      builtInVariables: { ...engine.builtInVariables },
      parameters: engine.manifest?.parameters || {}
    };

    // Print results
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printRecipeResult(result);
    }

    if (result.status === 'failed') {
      process.exitCode = 1;
    }
  } catch (error) {
    fmt.error(`Recipe execution failed: ${error.message}`);
    if (error.stack && options.verbose) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  }
}



/**
 * Print recipe execution results in human-readable format
 * @param {Object} result - Result from engine.execute()
 */
function printRecipeResult(result) {
  const stepResults = result.stepResults || [];
  const isChinese = fmt.getLanguageMode() === 'zh';

  fmt.stat('Status', result.status === 'success' ? fmt.COLORS.success('SUCCESS') : fmt.COLORS.error('FAILED'));
  fmt.stat('Total Duration', `${result.totalDuration}ms`, 'number');
  fmt.stat('Steps Executed', stepResults.length, 'number');

  if (result.errorCount > 0) {
    fmt.stat('Errors', fmt.COLORS.error(result.errorCount), 'number');
  }

  console.log();

  // Show per-step results
  if (stepResults.length > 0) {
    const stepsLabel = isChinese ? '步骤结果' : 'Step Results';
    fmt.header(stepsLabel);
    stepResults.forEach((step, idx) => {
      const status = step.status === 'success'
        ? fmt.COLORS.success('✓')
        : step.status === 'skipped'
          ? fmt.COLORS.muted('○')
          : fmt.COLORS.error('✗');
      const stepNum = fmt.COLORS.muted(`[${idx + 1}]`);
      const stepName = step.stepName || 'unnamed';
      const duration = step.duration ? ` (${step.duration}ms)` : '';

      console.log(`  ${stepNum} ${status} ${stepName}${duration}`);

      if (step.error) {
        fmt.warn(`     Error: ${step.error}`);
      }
    });
  }

  fmt.footer();
}

/**
 * Print dry-run preview results
 * Shows proposed changes and any conflicts detected
 */
function printDryRunResult(result, options) {
  const isChinese = fmt.getLanguageMode() === 'zh';
  
  if (options.json) {
    outputJson(result);
    return;
  }

  const status = result.success ? fmt.COLORS.success('✓') : fmt.COLORS.error('✗');
  fmt.stat('Dry-Run Status', status);
  fmt.stat('Changes to Apply', result.changeCount, 'number');
  fmt.stat('Conflicts Detected', result.conflicts.length, 'number');
  
  if (result.conflicts.length > 0) {
    console.log();
    const conflictsLabel = isChinese ? '冲突' : 'Conflicts';
    fmt.header(conflictsLabel);
    result.conflicts.forEach((conflict, idx) => {
      fmt.warn(`  [${idx + 1}] File: ${conflict.file}`);
      fmt.warn(`      Lines ${conflict.startLine}-${conflict.endLine}: ${conflict.reason}`);
    });
  }

  if (result.preview && result.preview.length > 0) {
    console.log();
    const previewLabel = isChinese ? '变更预览' : 'Preview';
    fmt.header(previewLabel);
    result.preview.forEach((change, idx) => {
      fmt.stat(`Change ${idx + 1}`, `${change.file}:${change.startLine}`, 'muted');
      console.log(`  Before: ${change.before.substring(0, 60)}...`);
      console.log(`  After:  ${change.after.substring(0, 60)}...`);
    });
  }

  fmt.footer();
}

/**
 * Print offset recalculation results
 * Shows updated line/column positions after cascading changes
 */
function printRecalculateOffsetsResult(result, options) {
  const isChinese = fmt.getLanguageMode() === 'zh';
  
  if (options.json) {
    outputJson(result);
    return;
  }

  fmt.stat('Offsets Recalculated', result.success ? fmt.COLORS.success('✓') : fmt.COLORS.error('✗'));
  fmt.stat('Changes Adjusted', result.adjustedCount, 'number');
  fmt.stat('Total Line Shift', result.totalLineShift, 'number');
  fmt.stat('Max Column Shift', result.maxColumnShift, 'number');

  if (result.adjustments && result.adjustments.length > 0) {
    console.log();
    const adjustLabel = isChinese ? '偏移调整' : 'Offset Adjustments';
    fmt.header(adjustLabel);
    result.adjustments.forEach((adj, idx) => {
      fmt.stat(`Adjustment ${idx + 1}`, `Lines +${adj.lineShift}, Cols +${adj.columnShift}`, 'muted');
    });
  }

  fmt.footer();
}

/**
 * Print plan application results
 * Shows which changes were applied, any failures, and guard verification
 */
function printPlanResult(result, options) {
  const isChinese = fmt.getLanguageMode() === 'zh';
  
  if (options.json) {
    outputJson(result);
    return;
  }

  const status = result.success ? fmt.COLORS.success('✓') : fmt.COLORS.error('✗');
  fmt.stat('Plan Status', status);
  fmt.stat('Applied', result.applied, 'number');
  fmt.stat('Failed', result.failed, 'number');
  
  if (result.changes && result.changes.length > 0) {
    console.log();
    const changesLabel = isChinese ? '应用结果' : 'Application Results';
    fmt.header(changesLabel);
    result.changes.forEach((change, idx) => {
      const changeStatus = change.status === 'applied'
        ? fmt.COLORS.success('✓')
        : fmt.COLORS.error('✗');
      fmt.stat(`[${idx + 1}]`, `${change.description || 'Change'} ${changeStatus}`, 'muted');
      if (change.error) {
        fmt.warn(`     ${change.error}`);
      }
    });
  }

  if (result.resultPlan) {
    console.log();
    const planLabel = isChinese ? '结果计划' : 'Result Plan Emitted';
    fmt.stat(planLabel, 'Ready for next operation', 'success');
  }

  fmt.footer();
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

  try {
    await hydrateMatchSnapshotContext(options);
  } catch (error) {
    fmt.error(error.message || String(error));
    process.exitCode = 1;
    return;
  }

  // Handle recipe mode first (doesn't need file processing)
  if (options.recipe) {
    return handleRecipeMode(options);
  }

  // Handle batch operations (Gap 3)
  if (options.dryRun || options.recalculateOffsets || options.fromPlan || options.copyBatch) {
    try {
      const batchRunner = new BatchDryRunner();
      
      // For dry-run: load changes file and preview without modifying
      if (options.dryRun && options.changes) {
        const fs = require('fs');
        const changesPath = path.isAbsolute(options.changes)
          ? options.changes
          : path.resolve(process.cwd(), options.changes);
        
        const changesData = JSON.parse(fs.readFileSync(changesPath, 'utf8'));
        batchRunner.loadChanges(changesData, { baseDir: path.dirname(changesPath) });
        const result = batchRunner.dryRun();
        printDryRunResult(result, options);
        return;
      }

      // For recalculate-offsets: recompute positions after cascading changes
      if (options.recalculateOffsets && options.changes) {
        const fs = require('fs');
        const changesPath = path.isAbsolute(options.changes)
          ? options.changes
          : path.resolve(process.cwd(), options.changes);
        
        const changesData = JSON.parse(fs.readFileSync(changesPath, 'utf8'));
        batchRunner.loadChanges(changesData, { baseDir: path.dirname(changesPath) });
        const result = batchRunner.recalculateOffsets();
        printRecalculateOffsetsResult(result, options);
        return;
      }

      // New: handle copy-batch plan (prototype)
      if (options.copyBatch) {
        const fs = require('fs');
        const planPath = path.isAbsolute(options.copyBatch) ? options.copyBatch : path.resolve(process.cwd(), options.copyBatch);
        const planData = JSON.parse(fs.readFileSync(planPath, 'utf8'));

        // Validate plan structure
        if (!Array.isArray(planData.operations)) {
          throw new Error('--copy-batch plan must contain an "operations" array');
        }

        // Build file-scoped batch runners so each target file is processed
        // with its own source snapshot (BatchDryRunner is single-file aware).
        const runnersByFile = Object.create(null);

        for (const op of planData.operations) {
          if (!op || op.type !== 'copy') continue;

          // Required: op.source.file and op.source.selector
          const sourceFile = op.source && op.source.file ? (path.isAbsolute(op.source.file) ? op.source.file : path.resolve(path.dirname(planPath), op.source.file)) : null;
          const sourceSelector = op.source && op.source.selector ? op.source.selector : null;
          if (!sourceFile || !sourceSelector) {
            throw new Error('copy-batch operations require source.file and source.selector values');
          }

          const sourceText = fs.readFileSync(sourceFile, 'utf8');
          const sourceAst = parseModule(sourceText, sourceFile);
          const { functions: sourceFunctions } = collectFunctions(sourceAst, sourceText);
          const sourceRecords = buildFunctionRecords(sourceFunctions);
          const [matchedRecord] = resolveMatches(sourceRecords, sourceSelector, options, { operation: 'copy-batch' });
          if (!matchedRecord) throw new Error(`No function matches selector ${sourceSelector} in ${sourceFile}`);

          const snippet = extractCode(sourceText, matchedRecord.span);

          // Determine target insertion line value
          const targetFile = op.target && op.target.file ? (path.isAbsolute(op.target.file) ? op.target.file : path.resolve(path.dirname(planPath), op.target.file)) : null;
          const targetPosition = op.target && op.target.position ? op.target.position : 'end-of-file';
          if (!targetFile) throw new Error('copy-batch target.file is required');

          const targetText = fs.readFileSync(targetFile, 'utf8');
          const targetLineOffsets = buildLineIndex(targetText);

          let insertChar = targetText.length; // default end-of-file
          if (typeof targetPosition === 'number') {
            insertChar = targetPosition;
          } else if (targetPosition === 'after-last-import') {
            const importRegex = /^(?:import\s+.*?\s+from\s+['"`][^'"`]*['"`];?\s*$|const\s+.*?=\s*require\(['"`][^'"`]*['"`]\)\s*;?\s*$)/gm;
            let last = null;
            let m;
            while ((m = importRegex.exec(targetText))) last = m;
            if (last) insertChar = last.index + last[0].length;
          } else if (targetPosition === 'before-first-function') {
            const functionRegex = /^(?:function\s+\w+|const\s+\w+\s*=\s*(?:\([^)]*\)\s*=>|function))/gm;
            const m = functionRegex.exec(targetText);
            if (m) insertChar = m.index;
          }

          // Compute insertion line index from char offset
          const lineIndex = (function findLineIndex(offset) {
            let idx = 0;
            for (; idx < targetLineOffsets.length; idx++) {
              if (targetLineOffsets[idx] > offset) break;
            }
            return Math.max(0, idx - 1);
          }(insertChar));

          // Normalize snippet newline to target file style
          const newlineStats = computeNewlineStats(targetText);
          const normalized = prepareNormalizedSnippet(snippet, newlineStats.style, { ensureTrailingNewline: true });

          const change = {
            file: targetFile,
            startLine: lineIndex,
            endLine: lineIndex - 1, // insertion
            replacement: normalized.text,
            id: op.id || `copy-${matchedRecord.name}-${Date.now()}`,
            description: op.description || `copy ${matchedRecord.canonicalName || matchedRecord.name} -> ${path.basename(targetFile)}`,
            guards: {
              sourceHash: matchedRecord.hash,
              sourceFile: sourceFile
            }
          };

          if (!runnersByFile[change.file]) {
            const fileSource = fs.readFileSync(change.file, 'utf8');
            runnersByFile[change.file] = new BatchDryRunner(fileSource, { verbose: options.verbose });
          }
          runnersByFile[change.file].addChange(change);
        }

        // Dry-run or apply (process each file runner independently)
        const aggregated = {
          success: true,
          changeCount: 0,
          applied: 0,
          failed: 0,
          preview: [],
          conflicts: []
        };

        for (const file of Object.keys(runnersByFile)) {
          const runner = runnersByFile[file];
          if (options.fix) {
            const result = await runner.apply({ force: options.force, continueOnError: options.continueOnError || false, emitPlan: options.emitPlan });
            aggregated.applied += result.applied || 0;
            aggregated.failed += result.failed || 0;
            aggregated.changeCount += result.changes ? result.changes.length : 0;
          } else {
            const result = runner.dryRun();
            aggregated.preview = aggregated.preview.concat(result.preview || []);
            aggregated.conflicts = aggregated.conflicts.concat(result.conflicts || []);
            aggregated.changeCount += result.changeCount || 0;
          }
        }

        if (options.fix) {
          printPlanResult({ success: aggregated.failed === 0, applied: aggregated.applied, failed: aggregated.failed, changes: [] }, options);
        } else {
          printDryRunResult({ success: aggregated.conflicts.length === 0, changeCount: aggregated.changeCount, preview: aggregated.preview, conflicts: aggregated.conflicts }, options);
        }
        return;
      }

      // For from-plan: load and apply a saved operation plan (Gap 4)
      if (options.fromPlan) {
        const fs = require('fs');
        
        // --from-plan <path> is the plan file itself
        const planPath = path.isAbsolute(options.fromPlan)
          ? options.fromPlan
          : path.resolve(process.cwd(), options.fromPlan);
        
        const planData = JSON.parse(fs.readFileSync(planPath, 'utf8'));
        
        // Reconstruct BatchDryRunner from plan data
        const batchRunnerFromPlan = new BatchDryRunner('', { verbose: options.verbose });
        
        // Load changes from plan
        if (planData.changes && Array.isArray(planData.changes)) {
          planData.changes.forEach(change => batchRunnerFromPlan.addChange(change));
        }
        
        // Verify guards before applying
        const guardResult = batchRunnerFromPlan.verifyGuards();
        if (!guardResult.valid && !options.force) {
          fmt.warn(`Guard verification failed: ${guardResult.failed} checks failed`);
          if (options.json) {
            console.log(JSON.stringify(guardResult, null, 2));
          }
          process.exitCode = 1;
          return;
        }

          // New: handle copy-batch plan
          if (options.copyBatch) {
            const fs = require('fs');
            const planPath = path.isAbsolute(options.copyBatch) ? options.copyBatch : path.resolve(process.cwd(), options.copyBatch);
            const planData = JSON.parse(fs.readFileSync(planPath, 'utf8'));

            // Validate plan structure
            if (!Array.isArray(planData.operations)) {
              throw new Error('--copy-batch plan must contain an "operations" array');
            }

            const batchRunner = new BatchDryRunner('', { verbose: options.verbose });

            for (const op of planData.operations) {
              if (!op || op.type !== 'copy') continue;

              // Required: op.source.file and op.source.selector
              const sourceFile = op.source && op.source.file ? (path.isAbsolute(op.source.file) ? op.source.file : path.resolve(path.dirname(planPath), op.source.file)) : null;
              const sourceSelector = op.source && op.source.selector ? op.source.selector : null;
              if (!sourceFile || !sourceSelector) {
                throw new Error('copy-batch operations require source.file and source.selector values');
              }

              const sourceText = fs.readFileSync(sourceFile, 'utf8');
              const sourceAst = parseModule(sourceText, sourceFile);
              const { functions: sourceFunctions } = collectFunctions(sourceAst, sourceText);
              const sourceRecords = buildFunctionRecords(sourceFunctions);
              const [matchedRecord] = resolveMatches(sourceRecords, sourceSelector, options, { operation: 'copy-batch' });
              if (!matchedRecord) throw new Error(`No function matches selector ${sourceSelector} in ${sourceFile}`);

              const snippet = extractCode(sourceText, matchedRecord.span);

              // Determine target insertion line value
              const targetFile = op.target && op.target.file ? (path.isAbsolute(op.target.file) ? op.target.file : path.resolve(path.dirname(planPath), op.target.file)) : null;
              const targetPosition = op.target && op.target.position ? op.target.position : 'end-of-file';
              if (!targetFile) throw new Error('copy-batch target.file is required');

              const targetText = fs.readFileSync(targetFile, 'utf8');
              const targetLineOffsets = buildLineIndex(targetText);

              let insertChar = targetText.length; // default end-of-file
              if (typeof targetPosition === 'number') {
                insertChar = targetPosition;
              } else if (targetPosition === 'after-last-import') {
                const importRegex = /^(?:import\s+.*?\s+from\s+['"`][^'"`]*['"`];?\s*$|const\s+.*?=\s*require\(['"`][^'"`]*['"`]\)\s*;?\s*$)/gm;
                let last = null;
                let m;
                while ((m = importRegex.exec(targetText))) last = m;
                if (last) insertChar = last.index + last[0].length;
              } else if (targetPosition === 'before-first-function') {
                const functionRegex = /^(?:function\s+\w+|const\s+\w+\s*=\s*(?:\([^)]*\)\s*=>|function))/gm;
                const m = functionRegex.exec(targetText);
                if (m) insertChar = m.index;
              }

              // Compute insertion line index from char offset
              const lineIndex = (function findLineIndex(offset) {
                let idx = 0;
                for (; idx < targetLineOffsets.length; idx++) {
                  if (targetLineOffsets[idx] > offset) break;
                }
                return Math.max(0, idx - 1);
              }(insertChar));

              // Normalize snippet newline to target file style
              const newlineStats = computeNewlineStats(targetText);
              const normalized = prepareNormalizedSnippet(snippet, newlineStats.style, { ensureTrailingNewline: true });

              const change = {
                file: targetFile,
                startLine: lineIndex,
                endLine: lineIndex - 1, // insertion
                replacement: normalized.text,
                id: op.id || `copy-${matchedRecord.name}-${Date.now()}`,
                description: op.description || `copy ${matchedRecord.canonicalName || matchedRecord.name} -> ${path.basename(targetFile)}`,
                guards: {
                  sourceHash: matchedRecord.hash,
                  sourceFile: sourceFile
                }
              };

              batchRunner.addChange(change);
            }

            // Dry-run or apply
            if (options.fix) {
              const result = await batchRunner.apply({ force: options.force, continueOnError: options.continueOnError || false, emitPlan: options.emitPlan });
              printPlanResult(result, options);
            } else {
              const result = batchRunner.dryRun();
              printDryRunResult(result, options);
            }
            return;
          }
        
        // Apply changes if --fix flag is provided
        if (options.fix) {
          const result = await batchRunnerFromPlan.apply({
            force: options.force,
            continueOnError: options.continueOnError || false,
            emitPlan: options.emitPlan
          });
          printPlanResult(result, options);
          
          // If requested, write result plan to file
          if (result.resultPlan && options.emitPlan) {
            const planOutputPath = path.isAbsolute(options.emitPlan)
              ? options.emitPlan
              : path.resolve(process.cwd(), options.emitPlan);
            fs.writeFileSync(planOutputPath, JSON.stringify(result.resultPlan, null, 2), 'utf8');
            if (!options.quiet) {
              fmt.stat('Result plan written', planOutputPath);
            }
          }
        } else {
          // Dry-run mode: show what would happen
          const result = batchRunnerFromPlan.dryRun();
          printDryRunResult(result, options);
        }
        return;
      }

      // Missing required flags
      fmt.error('Gap 3 batch operations require: --dry-run <changes>, --recalculate-offsets <changes>, or --from-plan <plan>');
      process.exitCode = 1;
      return;
    } catch (error) {
      fmt.error(`Batch operation error: ${error.message}`);
      if (process.env.DEBUG) {
        console.error(error);
      }
      process.exitCode = 1;
      return;
    }
  }

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

  if (options.matchSnapshotContext) {
    return mutationOperations.ingestMatchSnapshot(options, functionRecords);
  }

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

  if (options.copySelector) {
    const [record] = resolveMatches(functionRecords, options.copySelector, options, { operation: 'copy-function' });
    return mutationOperations.copyFunction(options, source, record, options.copySelector);
  }
}

main().catch((error) => {
  fmt.error(error.message);
  if (process.env.DEBUG) {
    console.error(error);
  }
  process.exit(1);
});
