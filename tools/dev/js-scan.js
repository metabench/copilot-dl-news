#!/usr/bin/env node
'use strict';

const path = require('path');
const { setupPowerShellEncoding } = require('./shared/powershellEncoding');
setupPowerShellEncoding();

const { CliFormatter } = require('../../src/utils/CliFormatter');
const { CliArgumentParser } = require('../../src/utils/CliArgumentParser');
const TokenCodec = require('../../src/codec/TokenCodec');
const { translateCliArgs } = require('./i18n/dialect');
const { extractLangOption, deriveLanguageModeHint } = require('./i18n/language');
const { resolveLanguageContext, translateLabelWithMode, joinTranslatedLabels } = require('./i18n/helpers');
const { scanWorkspace } = require('./js-scan/shared/scanner');
const { runSearch } = require('./js-scan/operations/search');
const { runHashLookup } = require('./js-scan/operations/hashLookup');
const { buildIndex } = require('./js-scan/operations/indexing');
const { runPatternSearch } = require('./js-scan/operations/patterns');
const { runDependencySummary } = require('./js-scan/operations/dependencies');
const { analyzeRipple } = require('./js-scan/operations/rippleAnalysis');
const RelationshipAnalyzer = require('./js-scan/operations/relationships');
const { contextSlice } = require('./js-scan/operations/contextSlice');
const { impactPreview } = require('./js-scan/operations/impactPreview');
const {
  buildCallGraph,
  selectNode,
  traverseCallGraph,
  computeHotPaths,
  findDeadCode
} = require('./js-scan/operations/callGraph');

const fmt = new CliFormatter();

const CHINESE_HELP_ROWS = Object.freeze([
  { lexKey: 'search', alias: '搜', summary: '搜函', params: '[搜文 限数 片显]' },
  { lexKey: 'hash', alias: '哈', summary: '定函', params: '[函哈]' },
  { lexKey: 'pattern', alias: '型', summary: '型函', params: '[模式 限数]' },
  { lexKey: 'index', alias: '索', summary: '索览', params: '[限数]' },
  { lexKey: 'include_paths', alias: '含径', summary: '含径', params: '[径片]' },
  { lexKey: 'exclude_path', alias: '除径', summary: '除径', params: '[径片]' },
  { lexKey: 'include_deprecated', alias: '含旧', summary: '含旧', params: '' },
  { lexKey: 'deprecated_only', alias: '旧专', summary: '旧专', params: '' },
  { lexKey: 'lang', alias: '语', summary: '设模', params: '[英 中 双 自]' },
  { lexKey: 'source_language', alias: '码', summary: '码模', params: '[js ts 自]' },
  { lexKey: 'view', alias: '视', summary: '视模', params: '[详 简 概]' },
  { lexKey: 'fields', alias: '域', summary: '简列', params: '[location name hash]'},
  { lexKey: 'follow_deps', alias: '依', summary: '依扫', params: '' },
    { lexKey: 'dependency_depth', alias: '层', summary: '层限', params: '[数]' },
    { lexKey: 'deps_of', alias: 'dep', summary: '提要求法', params: '[path|hash]' },
    { lexKey: 'deps_parse_errors', alias: '错', summary: '依错详', params: '' }
]);

const CHINESE_HELP_DETAILS = Object.freeze({
  search: [
    '搜要: 搜文 限数 片显',
    '示: node tools/dev/js-scan.js --搜 service'
  ],
  pattern: [
    '型要: 模式 选函 限数',
    '示: node tools/dev/js-scan.js --型 "*Controller"'
  ],
  index: [
    '索要: 构索 函览',
    '示: node tools/dev/js-scan.js --索 --限 50'
  ],
  include_paths: [
    '含径 要: 仅含 路片; 令 --含径 片'
  ],
  exclude_path: [
    '除径 要: 排除 路片; 令 --除径 片'
  ],
  include_deprecated: [
    '含旧 要: 扫旧 目录'
  ],
  deprecated_only: [
    '旧专 要: 仅扫 旧径'
  ],
  lang: [
    '语 要: 设模 英 中 双 自',
    '双语: 可混用中英别名; --lang zh 强制中文输出'
  ],
  view: [
    '视 要: 详 简 概',
    '示: node tools/dev/js-scan.js --视 简'
  ],
  source_language: [
    '码要: js/ts/自',
    '示: node tools/dev/js-scan.js --码 ts --搜 service',
    '提示: --码 ts 可扫描 .ts/.tsx, --码 自 按扩展自检'
  ],
  fields: [
    '域 要: 简列 逗分',
    '示: node tools/dev/js-scan.js --视 简 --域 location,name,hash'
  ],
  follow_deps: [
    '依 要: 扫描相对依赖 一并输出',
    '示: node tools/dev/js-scan.js --依 --视 简'
  ],
  dependency_depth: [
    '层 要: 限制依赖层数 (0=不限)',
    '示: node tools/dev/js-scan.js --依 --层 2'
  ],
  deps_of: [
    '依需: 查看指定文件的导入与被依赖关系',
    '示: node tools/dev/js-scan.js --deps-of src/app.js'
  ],
  deps_parse_errors: [
    '错详: 依赖摘要后显示解析错误细节',
    '示: node tools/dev/js-scan.js --deps-of src/app.js --deps-parse-errors'
  ]
});

const VIEW_MODES = Object.freeze(['detailed', 'terse', 'summary']);

const VIEW_MODE_KEYWORDS = Object.freeze({
  detailed: Object.freeze(['detailed', 'detail', 'full', 'normal', 'default', 'auto', '默认', '詳', '详']),
  terse: Object.freeze(['terse', 'compact', 'brief', 'concise', 'short', '简', '緊', '紧']),
  summary: Object.freeze(['summary', 'overview', 'rollup', 'aggregate', '概', '總', '总', '汇'])
});

const VIEW_KEYWORD_MAP = new Map();
Object.entries(VIEW_MODE_KEYWORDS).forEach(([mode, keywords]) => {
  keywords.forEach((keyword) => {
    if (typeof keyword !== 'string') {
      return;
    }
    VIEW_KEYWORD_MAP.set(keyword, mode);
    VIEW_KEYWORD_MAP.set(keyword.toLowerCase(), mode);
  });
});

const TERSE_FIELD_ALIASES = Object.freeze({
  default: 'default',
  auto: 'default',
  location: 'location',
  loc: 'location',
  file: 'file',
  filepath: 'file',
  path: 'file',
  line: 'line',
  ln: 'line',
  lines: 'line',
  column: 'column',
  col: 'column',
  name: 'name',
  fn: 'name',
  function: 'name',
  canonical: 'canonical',
  'canonical-name': 'canonical',
  selector: 'selector',
  hash: 'hash',
  digest: 'hash',
  rank: 'rank',
  stars: 'rank',
  score: 'score',
  exported: 'exported',
  export: 'exported',
  internal: 'exported',
  async: 'async',
  generator: 'generator',
  gen: 'generator',
  kind: 'kind',
  terms: 'terms',
  matches: 'terms',
  keywords: 'terms'
});

const SUPPORTED_TERSE_FIELDS = Object.freeze([
  'location',
  'file',
  'line',
  'column',
  'name',
  'canonical',
  'selector',
  'kind',
  'hash',
  'rank',
  'score',
  'exported',
  'async',
  'generator',
  'terms'
]);

const DEFAULT_TERSE_FIELDS = Object.freeze(['location', 'name', 'hash', 'exported']);
const MAX_RELATIONSHIP_ACTIONS = 10;

function normalizeBooleanOption(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized.length === 0) {
      return false;
    }
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y';
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return Boolean(value);
}

function normalizeViewMode(raw) {
  if (raw === undefined || raw === null) {
    return 'detailed';
  }
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = String(candidate).trim();
  if (trimmed.length === 0) {
    return 'detailed';
  }
  const lower = trimmed.toLowerCase();
  if (VIEW_KEYWORD_MAP.has(lower)) {
    return VIEW_KEYWORD_MAP.get(lower);
  }
  if (VIEW_KEYWORD_MAP.has(trimmed)) {
    return VIEW_KEYWORD_MAP.get(trimmed);
  }
  if (VIEW_MODES.includes(lower)) {
    return lower;
  }
  return null;
}

/**
 * Find the repository root by walking up the directory tree
 * looking for package.json or .git
 * @param {string} startDir - Starting directory
 * @returns {string} Repository root path
 */
function findRepositoryRoot(startDir) {
  const fs = require('fs');
  let currentDir = path.resolve(startDir);

  while (currentDir !== path.dirname(currentDir)) {
    // Check for package.json or .git as repo markers
    if (fs.existsSync(path.join(currentDir, 'package.json')) ||
        fs.existsSync(path.join(currentDir, '.git'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  // Fallback to the provided directory if no repo marker found
  return startDir;
}

function formatLimitValue(limit, isChinese) {
  if (limit === 0) {
    return isChinese ? '∞' : 'unlimited';
  }
  return limit;
}

function parseTerseFields(raw) {
  if (raw === undefined || raw === null) {
    return Array.from(DEFAULT_TERSE_FIELDS);
  }

  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = String(value).trim();
  if (trimmed.length === 0) {
    return Array.from(DEFAULT_TERSE_FIELDS);
  }

  const lowerTrimmed = trimmed.toLowerCase();
  if (TERSE_FIELD_ALIASES[lowerTrimmed] === 'default') {
    return Array.from(DEFAULT_TERSE_FIELDS);
  }

  const tokens = trimmed.split(/[\s,|]+/);
  const resolved = [];
  tokens.forEach((token) => {
    if (!token) {
      return;
    }
    const normalized = token.trim().toLowerCase();
    if (!normalized) {
      return;
    }
    const mapped = TERSE_FIELD_ALIASES[normalized] || normalized;
    if (SUPPORTED_TERSE_FIELDS.includes(mapped) && !resolved.includes(mapped)) {
      resolved.push(mapped);
    }
  });

  if (resolved.length === 0) {
    return Array.from(DEFAULT_TERSE_FIELDS);
  }

  return resolved;
}

function formatTerseMatch(match, fields, language, formatter = fmt) {
  const isChinese = language && language.isChinese;
  const resolvedFields = Array.isArray(fields) && fields.length > 0
    ? [...fields]
    : Array.from(DEFAULT_TERSE_FIELDS);
  const hasLocation = resolvedFields.some((field) => field === 'location' || field === 'file' || field === 'line' || field === 'column');
  if (!hasLocation) {
    resolvedFields.unshift('location');
  }
  if (!resolvedFields.includes('hash')) {
    resolvedFields.push('hash');
  }
  const segments = [];

  let pendingLocation = null;

  const flushPendingLocation = () => {
    if (!pendingLocation) {
      return;
    }
    const parts = [];
    if (pendingLocation.file) {
      parts.push(formatter.COLORS.cyan(pendingLocation.file));
    }
    if (pendingLocation.line !== undefined && pendingLocation.line !== null) {
      parts.push(formatter.COLORS.muted(String(pendingLocation.line)));
    }
    if (pendingLocation.column !== undefined && pendingLocation.column !== null) {
      parts.push(formatter.COLORS.muted(String(pendingLocation.column)));
    }
    if (parts.length > 0) {
      segments.push(parts.join(':'));
    }
    pendingLocation = null;
  };

  const queueLocationPart = (part, value) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    if (!pendingLocation) {
      pendingLocation = { file: null, line: null, column: null };
    }
    pendingLocation[part] = value;
  };

  const directLocationString = () => {
    const parts = [];
    parts.push(formatter.COLORS.cyan(match.file));
    if (match.function.line !== undefined && match.function.line !== null) {
      parts.push(formatter.COLORS.muted(String(match.function.line)));
    }
    if (match.function.column !== undefined && match.function.column !== null) {
      parts.push(formatter.COLORS.muted(String(match.function.column)));
    }
    return parts.join(':');
  };

  resolvedFields.forEach((field) => {
    switch (field) {
      case 'location':
        flushPendingLocation();
        segments.push(directLocationString());
        break;
      case 'file':
        queueLocationPart('file', match.file);
        break;
      case 'line':
        queueLocationPart('line', match.function.line);
        break;
      case 'column':
        queueLocationPart('column', match.function.column);
        break;
      case 'name':
        flushPendingLocation();
        segments.push(formatter.COLORS.bold(match.function.name || '(anonymous)'));
        break;
      case 'canonical':
        flushPendingLocation();
        if (match.function.canonicalName) {
          segments.push(formatter.COLORS.muted(match.function.canonicalName));
        }
        break;
      case 'selector':
        flushPendingLocation();
        {
          const selectorValue = match.function.canonicalName
            || match.function.pathSignature
            || match.function.name
            || '(anonymous)';
          segments.push(formatter.COLORS.muted(selectorValue));
        }
        break;
      case 'kind':
        flushPendingLocation();
        if (match.function.kind) {
          segments.push(formatter.COLORS.muted(match.function.kind));
        }
        break;
      case 'hash':
        flushPendingLocation();
        if (match.function.hash) {
          segments.push(formatter.COLORS.accent(`#${match.function.hash}`));
        }
        break;
      case 'rank':
        flushPendingLocation();
        {
          const stars = match.rank > 0 ? '★'.repeat(match.rank) : '·';
          segments.push(formatter.COLORS.accent(stars));
        }
        break;
      case 'score':
        flushPendingLocation();
        if (typeof match.score === 'number') {
          segments.push(formatter.COLORS.accent(match.score.toFixed(2)));
        }
        break;
      case 'exported':
        flushPendingLocation();
        {
          const label = match.function.exported
            ? (isChinese ? '出' : 'exp')
            : (isChinese ? '内' : 'int');
          const color = match.function.exported ? formatter.COLORS.success : formatter.COLORS.muted;
          segments.push(color(label));
        }
        break;
      case 'async':
        flushPendingLocation();
        {
          const isAsync = Boolean(match.function.isAsync);
          const label = isAsync ? (isChinese ? '异' : 'async') : (isChinese ? '常' : 'sync');
          const color = isAsync ? formatter.COLORS.cyan : formatter.COLORS.muted;
          segments.push(color(label));
        }
        break;
      case 'generator':
        flushPendingLocation();
        if (match.function.isGenerator) {
          segments.push(formatter.COLORS.cyan(isChinese ? '生' : 'gen'));
        }
        break;
      case 'terms':
        flushPendingLocation();
        {
          const terms = Array.isArray(match.context.matchTerms) ? match.context.matchTerms : [];
          const rendered = terms.length > 0 ? terms.join('/') : '-';
          segments.push(formatter.COLORS.muted(`~${rendered}`));
        }
        break;
      default:
        break;
    }
  });

  flushPendingLocation();

  return segments;
}

function printSearchSummary(result, options, language, limitDisplay) {
  const { isChinese } = language;
  const headerLabel = translateLabelWithMode(fmt, language, 'search', 'Search');
  console.log(fmt.COLORS.bold(fmt.COLORS.accent(headerLabel)));

  const segments = isChinese
    ? [
        `${translateLabelWithMode(fmt, language, 'match_count', 'matches')}:${result.stats.matchCount}`,
        `${translateLabelWithMode(fmt, language, 'list', 'shown')}:${result.matches.length}`,
        `${translateLabelWithMode(fmt, language, 'search_limit', 'limit')}:${limitDisplay}`,
        `${translateLabelWithMode(fmt, language, 'exports', 'exported')}:${result.stats.exportedMatches}`,
        `${translateLabelWithMode(fmt, language, 'async', 'async')}:${result.stats.asyncMatches}`,
        `${translateLabelWithMode(fmt, language, 'files_total', 'files')}:${result.stats.filesConsidered}`
      ]
    : [
        `matches=${result.stats.matchCount}`,
        `shown=${result.matches.length}`,
        `limit=${limitDisplay}`,
        `exported=${result.stats.exportedMatches}`,
        `async=${result.stats.asyncMatches}`,
        `files=${result.stats.filesConsidered}`
      ];

  console.log(fmt.COLORS.muted(segments.join(' ')));

  if (Array.isArray(result.terms) && result.terms.length > 0) {
    const termsLabel = isChinese
      ? `${translateLabelWithMode(fmt, language, 'search_text', 'terms')}:`
      : 'terms=';
    console.log(fmt.COLORS.muted(`${termsLabel}${result.terms.join(',')}`));
  }

  if (result.matches.length === 0) {
    fmt.warn(isChinese ? '无匹' : 'No matches found.');
  } else {
    const top = result.matches[0];
    const locationLabel = translateLabelWithMode(fmt, language, 'location', 'location');
    console.log(fmt.COLORS.muted(`${locationLabel}:${top.file}:${top.function.line}`));
  }

  if (result.guidance && result.guidance.triggered && !options.noGuidance) {
    const guidanceLabel = translateLabelWithMode(fmt, language, 'guidance', 'Guidance');
    result.guidance.suggestions.forEach((suggestion) => {
      const suggestionText = isChinese
        ? `${guidanceLabel}:${suggestion.example}`
        : `${suggestion.rationale} ${fmt.COLORS.accent(suggestion.example)}`;
      fmt.info(suggestionText);
    });
  }
}

function printSearchTerse(result, options, language, limitDisplay) {
  const { isChinese } = language;
  const summarySegments = isChinese
    ? [
        `${translateLabelWithMode(fmt, language, 'match_count', 'matches')}:${result.stats.matchCount}`,
        `${translateLabelWithMode(fmt, language, 'list', 'shown')}:${result.matches.length}`,
        `${translateLabelWithMode(fmt, language, 'search_limit', 'limit')}:${limitDisplay}`
      ]
    : [
        `matches=${result.stats.matchCount}`,
        `shown=${result.matches.length}`,
        `limit=${limitDisplay}`
      ];

  const headerLabel = translateLabelWithMode(fmt, language, 'search', 'Search');
  console.log(fmt.COLORS.bold(fmt.COLORS.accent(headerLabel)));
  console.log(fmt.COLORS.muted(summarySegments.join(' ')));

  if (result.matches.length === 0) {
    fmt.warn(isChinese ? '无匹' : 'No matches found.');
    return;
  }

  const maxLines = typeof options.maxLines === 'number' && options.maxLines >= 0 ? options.maxLines : 200;
  const fields = Array.isArray(options.terseFields) && options.terseFields.length > 0
    ? options.terseFields
    : Array.from(DEFAULT_TERSE_FIELDS);

  let matches = result.matches;
  let truncated = false;
  if (maxLines > 0 && matches.length > maxLines) {
    matches = matches.slice(0, maxLines);
    truncated = true;
  }

  fmt.denseList(matches, {
    labelFormatter: (_, index) => (isChinese ? `${index + 1}` : `${index + 1}.`),
    renderSegments: (match) => formatTerseMatch(match, fields, language, fmt),
    joiner: ' ',
    indent: 2,
    emptyMessage: isChinese ? '无匹' : 'No matches found.'
  });

  if (truncated) {
    fmt.warn(isChinese ? '截限' : `Truncated to ${maxLines} rows.`);
  }

  if (result.guidance && result.guidance.triggered && !options.noGuidance) {
    const guidanceLabel = translateLabelWithMode(fmt, language, 'guidance', 'Guidance');
    console.log(fmt.COLORS.muted(`${guidanceLabel}:`));
    result.guidance.suggestions.forEach((suggestion) => {
      const snippet = isChinese
        ? fmt.COLORS.muted(suggestion.example)
        : `${suggestion.rationale} ${fmt.COLORS.accent(suggestion.example)}`;
      console.log(`  ${snippet}`);
    });
  }
}

function printChineseHelp(detailLexKeys = []) {
  const header = `${fmt.translateLabel('help', 'Help', { chineseOnly: true })} js-scan`;
  console.log(fmt.COLORS.bold(header));

  CHINESE_HELP_ROWS.forEach((row) => {
    const alias = fmt.COLORS.accent(row.alias.padEnd(2, ' '));
    const summary = row.summary.padEnd(4, ' ');
    const params = row.params ? ` ${fmt.COLORS.muted(row.params.trim())}` : '';
    console.log(`${alias} ${summary}${params}`.trimEnd());
  });

  const filteredDetails = Array.from(new Set(detailLexKeys)).filter((key) => key && key !== 'help');
  if (filteredDetails.length > 0) {
    console.log('');
    filteredDetails.forEach((key) => {
      const detailLines = CHINESE_HELP_DETAILS[key];
      if (Array.isArray(detailLines)) {
        detailLines.forEach((line) => {
          console.log(fmt.COLORS.muted(line));
        });
      }
    });
  }

  console.log('');
  console.log(fmt.COLORS.muted('多助: --help --搜'));
  console.log(fmt.COLORS.muted('英助: --help --lang en'));
}

function printHelpOutput(languageMode, parser, translationMeta) {
  const program = parser.getProgram();
  const detailLexKeys = translationMeta ? translationMeta.lexKeys : [];

  if (languageMode === 'zh') {
    printChineseHelp(detailLexKeys);
    return;
  }

  if (languageMode === 'bilingual') {
    if (program && typeof program.helpInformation === 'function') {
      console.log(program.helpInformation());
      console.log('');
    }
    printChineseHelp(detailLexKeys);
    return;
  }

  if (program && typeof program.helpInformation === 'function') {
    console.log(program.helpInformation());
  }
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
}

function createParser() {
  const parser = new CliArgumentParser(
    'js-scan',
    'Multi-file JavaScript discovery tool'
  );

  parser
    .add('--dir <path>', 'Directory to scan (default: current directory)', process.cwd())
    .add('--exclude <pattern>', 'Exclude directories containing pattern (repeatable)', [])
    .add('--include-path <fragment>', 'Only include files whose path contains fragment', [])
    .add('--exclude-path <fragment>', 'Exclude files whose path contains fragment', [])
    .add('--include-deprecated', 'Include deprecated directories in the scan', false, 'boolean')
    .add('--deprecated-only', 'Scan only deprecated directories', false, 'boolean')
    .add('--lang <code>', 'Output language (en, zh, bilingual, auto)', 'auto')
    .add('--source-language <mode>', 'Source parser language (javascript, typescript, auto)', 'auto')
    .add('--kind <kind>', 'Filter by function kind (function, method, class, constructor)', [])
    .add('--exported', 'Only include exported symbols', false, 'boolean')
    .add('--internal', 'Only include internal (non-exported) symbols', false, 'boolean')
    .add('--async', 'Only include async functions', false, 'boolean')
    .add('--generator', 'Only include generator functions', false, 'boolean')
    .add('--limit <n>', 'Maximum matches to display (0 = unlimited)', 20, 'number')
    .add('--max-lines <n>', 'Maximum text output lines (0 = unlimited)', 200, 'number')
    .add('--no-snippets', 'Omit code snippets in text output', false, 'boolean')
    .add('--no-guidance', 'Suppress agent guidance suggestions', false, 'boolean')
    .add('--hashes-only', 'Only output hash list (text mode)', false, 'boolean')
    .add('--json', 'Emit JSON output', false, 'boolean')
    .add('--show-parse-errors', 'Display parse error details after results', false, 'boolean')
    .add('--deps-parse-errors', 'Display parse error details after dependency summaries', false, 'boolean')
    .add('--view <mode>', 'Output view (detailed, terse, summary)', 'detailed')
    .add('--fields <list>', 'Comma-separated fields for terse view', '')
    .add('--follow-deps', 'Follow relative dependencies discovered in scanned files', false, 'boolean')
    .add('--dep-depth <n>', 'Maximum dependency depth when following dependencies (0 = unlimited)', 0, 'number')
    .add('--search <term...>', 'Search terms (space-separated)')
    .add('--find-hash <hash>', 'Find function by hash value')
    .add('--find-pattern <pattern...>', 'Find functions matching glob/regex patterns')
    .add('--deps-of <target>', 'Summarize dependencies for a file (imports and dependents)')
    .add('--depends-on <target>', '[Gap 5] List transitive dependencies imported by target')
    .add('--impacts <target>', '[Gap 5] List files transitively impacted by target (dependents)')
    .add('--ripple-analysis <file>', 'Analyze refactoring ripple effects for a file')
    .add('--what-imports <target>', '[Gap 2] Find all files that import/require this target')
    .add('--what-calls <function>', '[Gap 2] Find all functions called by this target')
    .add('--export-usage <target>', '[Gap 2] Comprehensive usage analysis of export (imports + calls + re-exports)')
    .add('--call-graph <target>', '[Gap 6] Build call graph traversal for provided function')
    .add('--hot-paths', '[Gap 6] List functions with highest inbound call counts', false, 'boolean')
    .add('--dead-code', '[Gap 6] Detect functions with zero inbound calls', false, 'boolean')
    .add('--dead-code-include-exported', 'Include exported functions when reporting dead code', false, 'boolean')
    .add('--context-slice <function>', '[NEW] Extract minimal context for a function (function + deps)')
    .add('--impact-preview <file>', '[NEW] Analyze risk of modifying a file (usage counts per export)')
    .add('--include-code', 'Include assembled code in context-slice output', true, 'boolean')
    .add('--file <path>', 'Target file for context-slice operation')
    .add('--build-index', 'Build module index', false, 'boolean')
    .add('--ai-mode', '[AI-Native] Include continuation tokens in JSON output', false, 'boolean')
    .add('--continuation <token>', '[AI-Native] Resume from continuation token');

  return parser;
}

function ensureSingleOperation(options) {
  const provided = [];
  if (options.search && options.search.length > 0) provided.push('search');
  if (options.findHash) provided.push('find-hash');
  if (options.findPattern && options.findPattern.length > 0) provided.push('find-pattern');
  if (options.depsOf) provided.push('deps-of');
  if (options.dependsOn) provided.push('depends-on');
  if (options.impacts) provided.push('impacts');
  if (options.rippleAnalysis) provided.push('ripple-analysis');
  if (options.whatImports) provided.push('what-imports');
  if (options.whatCalls) provided.push('what-calls');
  if (options.exportUsage) provided.push('export-usage');
  if (options.callGraph) provided.push('call-graph');
  if (options.hotPaths) provided.push('hot-paths');
  if (options.deadCode) provided.push('dead-code');
  if (options.contextSlice) provided.push('context-slice');
  if (options.impactPreview) provided.push('impact-preview');
  if (options.buildIndex) provided.push('build-index');
  if (provided.length > 1) {
    throw new Error(`Only one operation can be specified at a time. Provided: ${provided.join(', ')}`);
  }
  if (provided.length === 0) {
    return 'build-index-default';
  }
  return provided[0];
}

function printSearchResult(result, options) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;
  const limitDisplay = formatLimitValue(result.stats.limit, isChinese);
  const viewMode = options.view || 'detailed';

  if (options.hashesOnly) {
    if (result.matches.length === 0) {
      const message = isChinese ? '无匹' : 'No matches found.';
      fmt.warn(message);
      return;
    }
    const uniqueHashes = Array.from(new Set(result.matches.map((match) => match.function.hash)));
    uniqueHashes.forEach((hash) => {
      console.log(hash);
    });
    return;
  }

  if (viewMode === 'summary') {
    printSearchSummary(result, options, language, limitDisplay);
    return;
  }

  if (viewMode === 'terse') {
    printSearchTerse(result, options, language, limitDisplay);
    return;
  }

  const headerLabel = joinTranslatedLabels(fmt, language, [
    { key: 'search', fallback: 'Search' },
    { key: 'result', fallback: 'Results' }
  ]);

  if (isChinese) {
    console.log(fmt.COLORS.bold(fmt.COLORS.accent(headerLabel)));
  } else {
    const matchLabel = translateLabelWithMode(fmt, language, 'matches', 'matches', { englishOnly: true });
    fmt.header(`${headerLabel} (${result.stats.matchCount} ${matchLabel}, limit ${limitDisplay})`);
  }

  if (result.matches.length === 0) {
    const message = isChinese ? '无匹' : 'No matches found.';
    fmt.warn(message);
    if (result.guidance && result.guidance.triggered && !options.noGuidance) {
      result.guidance.suggestions.forEach((suggestion) => {
        const guidanceText = isChinese
          ? `${translateLabelWithMode(fmt, language, 'guidance', 'Guidance')}:${suggestion.example}`
          : `${suggestion.rationale} Try ${suggestion.example}.`;
        fmt.info(guidanceText);
      });
    }
    return;
  }

  let linesPrinted = 0;
  const maxLines = typeof options.maxLines === 'number' && options.maxLines >= 0 ? options.maxLines : 200;

  if (isChinese) {
    const summaryLine = `${translateLabelWithMode(fmt, language, 'matches', 'matches')}:${result.stats.matchCount} ${translateLabelWithMode(fmt, language, 'search_limit', 'limit')}:${limitDisplay} ${translateLabelWithMode(fmt, language, 'files_total', 'files')}:${result.stats.filesConsidered}`;
    console.log(fmt.COLORS.muted(summaryLine));
  } else {
    const summaryLine = `${result.matches.length} shown of ${result.stats.matchCount} matches (files scanned: ${result.stats.filesConsidered})`;
    console.log(fmt.COLORS.muted(summaryLine));
  }

  linesPrinted += 1;

  for (const match of result.matches) {
    if (maxLines > 0 && linesPrinted >= maxLines) {
      const message = isChinese
        ? '截限'
        : `Output truncated at ${maxLines} lines. Use --max-lines to adjust.`;
      fmt.warn(message);
      break;
    }
    const starDisplay = match.rank > 0 ? fmt.COLORS.accent('★'.repeat(match.rank)) : ' ';
    const exportedLabelKey = match.function.exported ? 'exports' : 'internal';
    const exportedLabel = translateLabelWithMode(
      fmt,
      language,
      exportedLabelKey,
      match.function.exported ? 'exported' : 'internal',
      isChinese ? { chineseOnly: true } : {}
    );
    const exportedTag = match.function.exported ? fmt.COLORS.success(exportedLabel) : fmt.COLORS.muted(exportedLabel);
    const asyncTag = match.function.isAsync
      ? fmt.COLORS.cyan(translateLabelWithMode(fmt, language, 'async', 'async'))
      : null;
    const kindTag = isChinese ? null : fmt.COLORS.muted(match.function.kind);
    const tags = [exportedTag, asyncTag, kindTag].filter(Boolean).join(isChinese ? '' : ' ');
    console.log(`${fmt.COLORS.cyan(match.file)}:${fmt.COLORS.muted(match.function.line)}  ${starDisplay}  ${fmt.COLORS.bold(match.function.name)}  ${tags}`);
    linesPrinted += 1;
    if (!options.noSnippets && match.context.snippet) {
      const snippetLine = `    ${fmt.COLORS.muted(match.context.snippet)}`;
      if (maxLines === 0 || linesPrinted + 1 <= maxLines) {
        console.log(snippetLine);
        linesPrinted += 1;
      } else {
        const warnMessage = isChinese ? '片截' : 'Snippet omitted due to line limit.';
        fmt.warn(warnMessage);
      }
    }
  }

  if (result.guidance && result.guidance.triggered && !options.noGuidance) {
    const sectionLabel = translateLabelWithMode(fmt, language, 'guidance', 'Guidance');
    fmt.section(sectionLabel);
    result.guidance.suggestions.forEach((suggestion) => {
      console.log(`  • ${suggestion.rationale} ${fmt.COLORS.accent(suggestion.example)}`);
    });
  }
}

function printHashLookup(result) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;

  const headerTitle = isChinese
    ? joinTranslatedLabels(fmt, language, [
        { key: 'hash', fallback: 'Hash' },
        { key: 'search', fallback: 'Search' }
      ])
    : translateLabelWithMode(fmt, language, 'hash', 'Hash Lookup');

  fmt.header(headerTitle);
  fmt.stat(translateLabelWithMode(fmt, language, 'hash', 'Hash'), result.hash);
  fmt.stat(translateLabelWithMode(fmt, language, 'matches', 'Matches'), result.matchCount, 'number');
  const encodingLabel = isChinese ? '编码' : 'Encoding';
  fmt.stat(encodingLabel, result.encoding || 'unknown');

  if (!result.found) {
    const noMatchMessage = isChinese ? '无匹' : 'No matches found.';
    fmt.warn(`${noMatchMessage} ${fmt.COLORS.accent(result.hash)}`.trim());
    fmt.footer();
    return;
  }

  if (result.collision) {
    const collisionMessage = isChinese
      ? '多匹哈，注意冲突。'
      : 'Multiple matches found for this hash (possible collision).';
    fmt.warn(collisionMessage);
  }

  result.matches.forEach((match) => {
    const location = `${fmt.COLORS.cyan(match.file)}:${fmt.COLORS.muted(match.function.line)}`;
    const name = fmt.COLORS.bold(match.function.name || '(anonymous)');
    const hashTag = match.function.hash ? ` ${fmt.COLORS.accent(`#${match.function.hash}`)}` : '';
    const exportLabel = translateLabelWithMode(
      fmt,
      language,
      match.function.exported ? 'exports' : 'internal',
      match.function.exported ? 'exported' : 'internal'
    );
    const exportTag = match.function.exported
      ? fmt.COLORS.success(exportLabel)
      : fmt.COLORS.muted(exportLabel);
    const kindTag = match.function.kind ? fmt.COLORS.muted(match.function.kind) : '';
    const tags = [exportTag, kindTag].filter(Boolean).join(isChinese ? '' : ' ');
    console.log(`${location}  ${name}${hashTag}  ${tags}`.trim());
  });

  fmt.footer();
}

function printIndex(result) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;

  const headerTitle = isChinese
    ? joinTranslatedLabels(fmt, language, [
        { key: 'module', fallback: 'Module' },
        { key: 'index', fallback: 'Index' }
      ])
    : translateLabelWithMode(fmt, language, 'index', 'Module Index Summary');

  fmt.header(headerTitle);

  const summaryTitle = translateLabelWithMode(fmt, language, 'summary', 'Summary');
  fmt.section(summaryTitle);
  fmt.stat(translateLabelWithMode(fmt, language, 'files_total', 'Files'), result.stats.files, 'number');
  fmt.stat(translateLabelWithMode(fmt, language, 'entry_points', 'Entry points'), result.stats.entryPoints, 'number');
  fmt.stat(translateLabelWithMode(fmt, language, 'priority_files', 'Priority files'), result.stats.priorityFiles, 'number');
  fmt.stat(translateLabelWithMode(fmt, language, 'function', 'Functions'), result.stats.functions, 'number');
  fmt.stat(translateLabelWithMode(fmt, language, 'class', 'Classes'), result.stats.classes, 'number');
  fmt.stat(translateLabelWithMode(fmt, language, 'exports', 'Exports'), result.stats.exports, 'number');

  if (!Array.isArray(result.entries) || result.entries.length === 0) {
    const message = isChinese ? '未索引模块。' : 'No modules indexed.';
    fmt.warn(message);
    fmt.footer();
    return;
  }

  result.entries.forEach((entry) => {
    const markers = [];
    if (entry.entryPoint) markers.push(fmt.ICONS.arrow);
    if (entry.priority) markers.push('⭐');
    const markerDisplay = markers.length > 0 ? `${markers.join(' ')} ` : '';

    console.log(`\n${markerDisplay}${fmt.COLORS.cyan(entry.file)} ${fmt.COLORS.muted(`(${entry.moduleKind || 'unknown'})`)}`);

    const statsLine = [
      `${translateLabelWithMode(fmt, language, 'function', 'Functions')}:${entry.stats.functions}`,
      `${translateLabelWithMode(fmt, language, 'exports', 'Exports')}:${entry.stats.exports}`,
      `${translateLabelWithMode(fmt, language, 'class', 'Classes')}:${entry.stats.classes}`
    ].join(isChinese ? ' ' : ', ');
    console.log(`  ${fmt.COLORS.muted(statsLine)}`);

    const importLabel = translateLabelWithMode(fmt, language, 'imports', 'Imports');
    const requireLabel = translateLabelWithMode(fmt, language, 'requires', 'Requires');
    if (Array.isArray(entry.dependencies.imports) && entry.dependencies.imports.length > 0) {
      console.log(`  ${importLabel}: ${entry.dependencies.imports.join(', ')}`);
    }
    if (Array.isArray(entry.dependencies.requires) && entry.dependencies.requires.length > 0) {
      console.log(`  ${requireLabel}: ${entry.dependencies.requires.join(', ')}`);
    }
  });

  fmt.footer();
}

function printPatternResult(result) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;

  const headerTitle = isChinese
    ? joinTranslatedLabels(fmt, language, [
        { key: 'pattern', fallback: 'Pattern' },
        { key: 'matches', fallback: 'Matches' }
      ])
    : translateLabelWithMode(fmt, language, 'pattern', 'Pattern Matches');

  fmt.header(headerTitle);
  const patternList = Array.isArray(result.patterns) && result.patterns.length > 0
    ? result.patterns.join(isChinese ? '、' : ', ')
    : (isChinese ? '无模式' : 'None');
  fmt.stat(translateLabelWithMode(fmt, language, 'pattern', 'Patterns'), patternList);
  fmt.stat(translateLabelWithMode(fmt, language, 'match_count', 'Match count'), result.matchCount, 'number');

  if (result.matchCount === 0) {
    const message = isChinese ? '无匹' : 'No matches found for provided patterns.';
    fmt.warn(message);
    fmt.footer();
    return;
  }

  result.matches.forEach((match) => {
    const location = `${fmt.COLORS.cyan(match.file)}:${fmt.COLORS.muted(match.function.line)}`;
    const name = fmt.COLORS.bold(match.function.name || '(anonymous)');
    const hashTag = match.function.hash ? ` ${fmt.COLORS.accent(`#${match.function.hash}`)}` : '';
    const exportLabel = translateLabelWithMode(
      fmt,
      language,
      match.function.exported ? 'exports' : 'internal',
      match.function.exported ? 'exported' : 'internal'
    );
    const exportTag = match.function.exported
      ? fmt.COLORS.success(exportLabel)
      : fmt.COLORS.muted(exportLabel);
    const kindTag = match.function.kind ? fmt.COLORS.muted(match.function.kind) : '';
    const tags = [exportTag, kindTag].filter(Boolean).join(isChinese ? '' : ' ');
    console.log(`${location}  ${name}${hashTag}  ${tags}`.trim());
  });

  fmt.footer();
}

function formatDependencyRows(rows, showVia) {
  return rows.map((entry, index) => {
    const display = {
      '#': String(index + 1),
      File: entry.exists ? fmt.COLORS.cyan(entry.file) : fmt.COLORS.muted(entry.file),
      Imports: entry.importCount > 0 ? fmt.COLORS.success(String(entry.importCount)) : '',
      Requires: entry.requireCount > 0 ? fmt.COLORS.accent(String(entry.requireCount)) : '',
      Hop: entry.hop > 1 ? fmt.COLORS.muted(String(entry.hop)) : '1'
    };
    if (showVia) {
      display.Via = entry.via ? fmt.COLORS.muted(entry.via) : '';
    }
    return display;
  });
}

function formatTraversalRows(rows, includePath) {
  return rows.map((entry, index) => {
    const pathDisplay = includePath && Array.isArray(entry.path)
      ? fmt.COLORS.muted(entry.path.join(' → '))
      : '';
    return {
      '#': String(index + 1),
      File: entry.exists ? fmt.COLORS.cyan(entry.file) : fmt.COLORS.muted(entry.file),
      Hop: entry.hop > 1 ? fmt.COLORS.muted(String(entry.hop)) : '1',
      Imports: entry.importCount > 0 ? fmt.COLORS.success(String(entry.importCount)) : '',
      Requires: entry.requireCount > 0 ? fmt.COLORS.accent(String(entry.requireCount)) : '',
      Path: pathDisplay
    };
  });
}

function printDependencyTraversal(payload, direction) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;

  const headerLabel = direction === 'outgoing'
    ? (isChinese ? '依赖追踪' : 'Transitive Dependencies')
    : (isChinese ? '影响范围' : 'Impacted Files');
  fmt.header(headerLabel);

  const target = payload.target || {};
  const targetLabel = translateLabelWithMode(fmt, language, 'target', 'Target');
  const fileDisplay = target.exists
    ? fmt.COLORS.bold(fmt.COLORS.cyan(target.file))
    : fmt.COLORS.muted(target.file || '(unknown)');
  const matchedSuffix = target.matchedBy
    ? fmt.COLORS.muted(` (${target.matchedBy})`)
    : '';
  console.log(`  ${targetLabel}: ${fileDisplay}${matchedSuffix}`.trimEnd());

  const depthLabel = translateLabelWithMode(fmt, language, 'depth', 'Depth');
  const limitLabel = translateLabelWithMode(fmt, language, 'limit', 'Limit');
  const countLabel = direction === 'outgoing'
    ? translateLabelWithMode(fmt, language, 'imports', 'Dependencies')
    : translateLabelWithMode(fmt, language, 'dependents', 'Dependents');

  const depthValue = payload.stats.depth === 0
    ? (isChinese ? '无限' : 'unbounded')
    : payload.stats.depth;
  const limitValue = payload.stats.limit === 0
    ? (isChinese ? '无限' : 'unlimited')
    : payload.stats.limit;

  fmt.stat(countLabel, payload.stats.total, 'number');
  fmt.stat(depthLabel, depthValue);
  fmt.stat(limitLabel, limitValue);

  const rows = Array.isArray(payload.dependencies) ? payload.dependencies : [];
  const includePath = rows.some((entry) => Array.isArray(entry.path) && entry.path.length > 0);

  if (rows.length === 0) {
    const emptyMessage = direction === 'outgoing'
      ? (isChinese ? '未发现更多依赖。' : 'No transitive dependencies discovered.')
      : (isChinese ? '没有文件依赖此目标。' : 'No files are impacted by this target.');
    fmt.info(emptyMessage);
    fmt.footer();
    return;
  }

  const columns = includePath
    ? ['#', 'File', 'Hop', 'Imports', 'Requires', 'Path']
    : ['#', 'File', 'Hop', 'Imports', 'Requires'];

  fmt.table(formatTraversalRows(rows, includePath), { columns });
  fmt.footer();
}

function printDependencySummary(result) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;

  const headerLabel = translateLabelWithMode(fmt, language, 'dependencies', 'Dependencies');
  fmt.header(headerLabel);

  const targetLabel = translateLabelWithMode(fmt, language, 'target', 'Target');
  const fileDisplay = result.target.exists
    ? fmt.COLORS.bold(fmt.COLORS.cyan(result.target.file))
    : fmt.COLORS.muted(result.target.file);
  const matchedSuffix = result.target.matchedBy
    ? fmt.COLORS.muted(` (${result.target.matchedBy})`)
    : '';
  console.log(`  ${targetLabel}: ${fileDisplay}${matchedSuffix}`.trimEnd());

  if (result.target.function) {
    const func = result.target.function;
    const funcLabel = translateLabelWithMode(fmt, language, 'function', 'Function');
    const hashDisplay = func.hash ? fmt.COLORS.accent(`#${func.hash}`) : '';
    console.log(`  ${funcLabel}: ${fmt.COLORS.bold(func.name || '(anonymous)')} ${hashDisplay}`.trim());
  }

  const fanOutLabel = translateLabelWithMode(fmt, language, 'fan_out', 'Fan-out');
  const fanInLabel = translateLabelWithMode(fmt, language, 'fan_in', 'Fan-in');
  fmt.stat(fanOutLabel, result.stats.fanOut, 'number');
  fmt.stat(fanInLabel, result.stats.fanIn, 'number');

  const depthValue = result.stats.depth === 0
    ? (isChinese ? '无限' : 'unbounded')
    : result.stats.depth;
  const limitValue = result.stats.limit === 0
    ? (isChinese ? '无限' : 'unlimited')
    : result.stats.limit;
  fmt.stat(translateLabelWithMode(fmt, language, 'depth', 'Depth'), depthValue);
  fmt.stat(translateLabelWithMode(fmt, language, 'limit', 'Limit'), limitValue);

  const showViaOutgoing = result.outgoing.some((entry) => entry.hop > 1 && entry.via);
  const outgoingColumns = showViaOutgoing
    ? ['#', 'File', 'Via', 'Imports', 'Requires', 'Hop']
    : ['#', 'File', 'Imports', 'Requires', 'Hop'];

  const outgoingLabel = translateLabelWithMode(fmt, language, 'imports', 'Imports');
  fmt.section(`${outgoingLabel} (${result.outgoing.length})`);
  if (result.outgoing.length === 0) {
    const noneMessage = isChinese ? '无导入文件。' : 'No imports discovered for this file.';
    fmt.warn(noneMessage);
  } else {
    fmt.table(formatDependencyRows(result.outgoing, showViaOutgoing), { columns: outgoingColumns });
  }

  const showViaIncoming = result.incoming.some((entry) => entry.hop > 1 && entry.via);
  const incomingColumns = showViaIncoming
    ? ['#', 'File', 'Via', 'Imports', 'Requires', 'Hop']
    : ['#', 'File', 'Imports', 'Requires', 'Hop'];

  const dependentsLabel = translateLabelWithMode(fmt, language, 'dependents', 'Dependents');
  fmt.section(`${dependentsLabel} (${result.incoming.length})`);
  if (result.incoming.length === 0) {
    const noneMessage = isChinese
      ? '无文件依赖此模块。考虑检查同级目录或入口文件。'
      : 'No files import this module. Consider reviewing sibling directories or entry points.';
    fmt.info(noneMessage);
  } else {
    fmt.table(formatDependencyRows(result.incoming, showViaIncoming), { columns: incomingColumns });
  }

  fmt.footer();
}

function printParseErrorSummary(errors, options = {}) {
  const entries = Array.isArray(errors) ? errors : [];
  if (entries.length === 0) {
    return;
  }

  const suppressed = Boolean(options.suppressed);
  const showDetails = Boolean(options.showDetails);
  if (!suppressed && !showDetails) {
    return;
  }

  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;
  const countMessage = isChinese
    ? `${entries.length} \u4e2a\u6587\u4ef6\u65e0\u6cd5\u89e3\u6790\u3002`
    : `${entries.length} files could not be parsed.`;
  const hintFlag = typeof options.hintFlag === 'string' && options.hintFlag.trim().length > 0
    ? options.hintFlag.trim()
    : '--show-parse-errors';

  if (showDetails) {
    fmt.warn(countMessage);
    const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 5;
    const samples = entries.slice(0, limit);
    samples.forEach((entry) => {
      const filePath = entry && entry.filePath ? entry.filePath : 'unknown';
      const message = entry && entry.error && entry.error.message
        ? entry.error.message
        : String(entry && entry.error ? entry.error : 'Unknown error');
      fmt.info(`${filePath}: ${message}`);
    });
    if (entries.length > samples.length) {
      const extraMessage = isChinese
        ? `\u8fd8\u6709 ${entries.length - samples.length} \u4e2a\u9519\u8bef\u5df2\u7701\u7565\u3002`
        : `Additional ${entries.length - samples.length} errors omitted.`;
      fmt.info(extraMessage);
    }
    return;
  }

  if (!suppressed) {
    return;
  }

  const hint = isChinese
    ? `${countMessage} \u4f7f\u7528 ${hintFlag} \u67e5\u770b\u8be6\u60c5\u3002`
    : `${countMessage} Use ${hintFlag} for details.`;
  fmt.info(hint);
}

/**
 * Print ripple analysis results in human-readable format
 * @param {Object} result - Ripple analysis result from analyzeRipple()
 * @param {Object} options - CLI options
 */
function printRippleAnalysis(result, options) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;

  const headerLabel = isChinese ? '纹波分析' : 'Ripple Analysis';
  fmt.header(headerLabel);

  if (!result.success && result.error) {
    fmt.error(result.error);
    return;
  }

  console.log(`  ${fmt.COLORS.cyan(result.targetFile)}`);
  console.log();

  // Print graph metadata
  const graphLabel = isChinese ? '依赖图' : 'Dependency Graph';
  fmt.stat(graphLabel, '');
  fmt.stat('  Nodes', result.graph.nodeCount, 'number');
  fmt.stat('  Edges', result.graph.edgeCount, 'number');
  fmt.stat('  Depth', result.graph.depth, 'number');
  fmt.stat('  Has Cycles', result.graph.hasCycles ? fmt.COLORS.error('YES') : fmt.COLORS.success('NO'));
  console.log();

  // Print risk assessment
  const riskLabel = isChinese ? '风险评分' : 'Risk Assessment';
  fmt.stat(riskLabel, '');
  const riskColor = result.risk.level === 'GREEN'
    ? fmt.COLORS.success(result.risk.level)
    : result.risk.level === 'YELLOW'
      ? fmt.COLORS.accent(result.risk.level)
      : fmt.COLORS.error(result.risk.level);
  fmt.stat('  Level', riskColor);
  fmt.stat('  Score', `${result.risk.score}/100`, 'number');
  
  if (result.risk.factors) {
    fmt.stat('  Factors', '');
    Object.entries(result.risk.factors).forEach(([key, value]) => {
      fmt.stat(`    ${key}`, `${value}%`, 'number');
    });
  }
  console.log();

  // Print safety assertions
  const safetyLabel = isChinese ? '安全检查' : 'Safety Checks';
  fmt.stat(safetyLabel, '');
  const checks = [
    { name: 'Rename', value: result.safetyAssertions.canRename },
    { name: 'Delete', value: result.safetyAssertions.canDelete },
    { name: 'Modify Signature', value: result.safetyAssertions.canModifySignature },
    { name: 'Extract', value: result.safetyAssertions.canExtract }
  ];
  checks.forEach(({ name, value }) => {
    const status = value ? fmt.COLORS.success('✓') : fmt.COLORS.error('✗');
    fmt.stat(`  ${name}`, status);
  });
  console.log();

  // Print recommendations
  if (result.risk.recommendations && result.risk.recommendations.length > 0) {
    const recLabel = isChinese ? '建议' : 'Recommendations';
    fmt.stat(recLabel, '');
    result.risk.recommendations.forEach((rec, idx) => {
      console.log(`  ${idx + 1}. ${rec}`);
    });
    console.log();
  }

  // Print cycle information
  if (result.cycles && result.cycles.hasCycles && result.cycles.cycles.length > 0) {
    const cycleLabel = isChinese ? '循环依赖' : 'Circular Dependencies';
    fmt.stat(cycleLabel, `${result.cycles.cycleCount} found`);
    result.cycles.cycles.slice(0, 3).forEach((cycle, idx) => {
      const path = Array.isArray(cycle) ? cycle.join(' → ') : String(cycle);
      console.log(`  ${idx + 1}. ${path}`);
    });
    if (result.cycles.cycles.length > 3) {
      const omitted = result.cycles.cycles.length - 3;
      fmt.muted(`  ... and ${omitted} more`);
    }
    console.log();
  }

  fmt.footer();
}

/**
 * Generate next action tokens for search results.
 * @param {Object} searchResult - Search result from runSearch
 * @param {Object} options - CLI options
 * @returns {Array} Array of {id, label, description} objects
 */
function generateNextActions(searchResult, options) {
  const actions = [];
  
  if (!searchResult.matches || searchResult.matches.length === 0) {
    return actions;
  }

  // Add analyze action for each match
  searchResult.matches.forEach((match, idx) => {
    actions.push({
      id: `analyze:${idx}`,
      label: `Analyze match #${idx}`,
      description: `Show detailed info about ${match.function.name || match.hash}`,
      guard: false
    });
  });

  // Add trace action for first match
  if (searchResult.matches.length > 0) {
    actions.push({
      id: 'trace:0',
      label: 'Trace callers',
      description: 'Show callers of first match',
      guard: false
    });
  }

  // Add ripple analysis for first match
  if (searchResult.matches.length > 0) {
    actions.push({
      id: 'ripple:0',
      label: 'Ripple analysis',
      description: 'Analyze refactoring impact for first match',
      guard: false
    });
  }

  return actions;
}

function normalizeSearchTerms(terms) {
  if (Array.isArray(terms)) {
    return terms
      .map((term) => (typeof term === 'string' ? term : String(term)))
      .map((term) => term.trim())
      .filter(Boolean);
  }
  if (typeof terms === 'string') {
    return terms
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);
  }
  return [];
}

function snapshotSearchOptions(options = {}) {
  return {
    limit: typeof options.limit === 'number' ? options.limit : undefined,
    maxLines: typeof options.maxLines === 'number' ? options.maxLines : undefined,
    noSnippets: !!options.noSnippets,
    noGuidance: !!options.noGuidance,
    filters: {
      exportedOnly: !!options.exported,
      internalOnly: !!options.internal,
      asyncOnly: !!options.async,
      generatorOnly: !!options.generator,
      kinds: Array.isArray(options.kind) ? options.kind.slice() : [],
      includePaths: Array.isArray(options.includePath) ? options.includePath.slice() : [],
      excludePaths: Array.isArray(options.excludePath) ? options.excludePath.slice() : []
    }
  };
}

function snapshotScanContext(options = {}) {
  const scopeDir = options.dir ? path.resolve(options.dir) : process.cwd();
  return {
    dir: scopeDir,
    exclude: Array.isArray(options.exclude) ? options.exclude.slice() : [],
    includeDeprecated: !!options.includeDeprecated,
    deprecatedOnly: !!options.deprecatedOnly,
    followDependencies: !!options.followDeps,
    dependencyDepth: typeof options.depDepth === 'number' ? options.depDepth : undefined,
    language: typeof options.sourceLanguage === 'string' ? options.sourceLanguage : 'auto'
  };
}

function createAiNativeEnvelope(result, continuationTokens) {
  const actionIds = Object.keys(continuationTokens);
  return {
    ...result,
    continuation_tokens: continuationTokens,
    version: 1,
    available_actions: actionIds,
    _ai_native_cli: {
      mode: 'ai-native',
      version: 1,
      available_actions: actionIds,
      token_count: actionIds.length
    }
  };
}

function captureImporterSnapshot(importer, scopeDir) {
  if (!importer) {
    return null;
  }
  const absoluteFile = path.isAbsolute(importer.file)
    ? importer.file
    : path.resolve(scopeDir, importer.file);
  const firstImport = importer.imports && importer.imports[0];
  return {
    type: 'importer',
    file: absoluteFile,
    relativeFile: path.relative(scopeDir, absoluteFile),
    displayFile: importer.file,
    count: importer.count || (importer.imports ? importer.imports.length : 0),
    importSpecifiers: (importer.imports || []).map((imp) => ({
      specifier: imp.specifier,
      source: imp.source,
      line: imp.line
    })),
    jsEditHint: firstImport && firstImport.line
      ? {
          command: 'node tools/dev/js-edit.js',
          args: [
            '--file',
            path.relative(scopeDir, absoluteFile),
            '--snipe-position',
            `${firstImport.line}:1`
          ],
          description: 'Jump to import statement for guarded edit'
        }
      : null
  };
}

function captureUsageCallSnapshot(entry, scopeDir) {
  if (!entry) {
    return null;
  }
  const absoluteFile = path.isAbsolute(entry.file)
    ? entry.file
    : path.resolve(scopeDir, entry.file);
  const firstCall = entry.calls && entry.calls[0];
  return {
    type: 'usage-call',
    file: absoluteFile,
    relativeFile: path.relative(scopeDir, absoluteFile),
    displayFile: entry.file,
    count: entry.count || (entry.calls ? entry.calls.length : 0),
    calls: (entry.calls || []).map((call) => ({
      line: call.line,
      context: call.context
    })),
    jsEditHint: firstCall && firstCall.line
      ? {
          command: 'node tools/dev/js-edit.js',
          args: [
            '--file',
            path.relative(scopeDir, absoluteFile),
            '--snipe-position',
            `${firstCall.line}:1`
          ],
          description: 'Jump to first usage call for guarded edit'
        }
      : null
  };
}

function captureReexportSnapshot(filePath, scopeDir) {
  if (!filePath) {
    return null;
  }
  const absoluteFile = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(scopeDir, filePath);
  return {
    type: 'usage-reexport',
    file: absoluteFile,
    relativeFile: path.relative(scopeDir, absoluteFile),
    displayFile: filePath,
    jsEditHint: {
      command: 'node tools/dev/js-edit.js',
      args: [
        '--file',
        path.relative(scopeDir, absoluteFile),
        '--outline'
      ],
      description: 'Outline file to locate re-export'
    }
  };
}

function buildRelationshipActionEntries(operation, result, options, scopeDir) {
  const entries = [];
  const hardLimit = Math.max(1, Math.min(MAX_RELATIONSHIP_ACTIONS, options.limit && options.limit > 0 ? options.limit : MAX_RELATIONSHIP_ACTIONS));

  if (operation === 'what-imports' && Array.isArray(result.importers)) {
    result.importers.slice(0, hardLimit).forEach((importer, idx) => {
      const snapshot = captureImporterSnapshot(importer, scopeDir);
      entries.push({
        actionId: `importer-analyze:${idx}`,
        actionType: 'importer-analyze',
        entryKind: 'importer',
        entryIndex: idx,
        label: `Importer ${idx + 1}`,
        description: `Inspect ${path.basename(importer.file)}`,
        matchSnapshot: snapshot,
        entryPayload: importer
      });
    });
  }

  if (operation === 'export-usage' && result.usage) {
    const directImports = Array.isArray(result.usage.directImports) ? result.usage.directImports : [];
    directImports.slice(0, hardLimit).forEach((importer, idx) => {
      const snapshot = captureImporterSnapshot(importer, scopeDir);
      entries.push({
        actionId: `usage-import:${idx}`,
        actionType: 'usage-import',
        entryKind: 'usage-direct',
        entryIndex: idx,
        label: `Direct Import ${idx + 1}`,
        description: `Inspect importer ${path.basename(importer.file)}`,
        matchSnapshot: snapshot,
        entryPayload: importer
      });
    });

    const functionCalls = Array.isArray(result.usage.functionCalls) ? result.usage.functionCalls : [];
    functionCalls.slice(0, hardLimit).forEach((callEntry, idx) => {
      const snapshot = captureUsageCallSnapshot(callEntry, scopeDir);
      entries.push({
        actionId: `usage-call:${idx}`,
        actionType: 'usage-call',
        entryKind: 'usage-call',
        entryIndex: idx,
        label: `Call Site ${idx + 1}`,
        description: `Calls within ${path.basename(callEntry.file)}`,
        matchSnapshot: snapshot,
        entryPayload: callEntry
      });
    });

    const reexports = Array.isArray(result.usage.reexports) ? result.usage.reexports : [];
    reexports.slice(0, hardLimit).forEach((filePath, idx) => {
      const snapshot = captureReexportSnapshot(filePath, scopeDir);
      entries.push({
        actionId: `usage-reexport:${idx}`,
        actionType: 'usage-reexport',
        entryKind: 'usage-reexport',
        entryIndex: idx,
        label: `Re-export ${idx + 1}`,
        description: `Re-export in ${path.basename(filePath)}`,
        matchSnapshot: snapshot,
        entryPayload: { file: filePath }
      });
    });
  }

  return entries;
}

function generateRelationshipTokens(operation, result, options) {
  const scopeDir = options.dir ? path.resolve(options.dir) : process.cwd();
  const entries = buildRelationshipActionEntries(operation, result, options, scopeDir);
  if (!entries.length) {
    return { tokens: {}, actionIds: [] };
  }

  const tokens = {};
  const requestId = TokenCodec.generateRequestId('js-scan');
  const scanContextSnapshot = snapshotScanContext(options);
  const resultsDigest = TokenCodec.computeDigest(result);
  const repoRoot = findRepositoryRoot(scopeDir);
  const target = result.target || options.whatImports || options.exportUsage || options.search;
  const nextActionsMetadata = entries.map((entry) => ({
    id: entry.actionId,
    label: entry.label,
    description: entry.description,
    guard: false
  }));

  entries.forEach((entry) => {
    try {
      const payload = {
        command: 'js-scan',
        action: entry.actionType,
        context: {
          request_id: requestId,
          source_token: null,
          results_digest: resultsDigest
        },
        parameters: {
          relationship: operation,
          target,
          entry_kind: entry.entryKind,
          entry_index: entry.entryIndex,
          scope: scopeDir,
          match: entry.matchSnapshot,
          entry_payload: entry.entryPayload,
          scanContext: scanContextSnapshot
        },
        next_actions: nextActionsMetadata
      };

      const token = TokenCodec.encode(payload, {
        secret_key: TokenCodec.deriveSecretKey({ repo_root: repoRoot }),
        ttl_seconds: 3600
      });

      tokens[entry.actionId] = token;
    } catch (error) {
      console.error(`Warning: Failed to generate relationship token for ${entry.actionId}: ${error.message}`);
    }
  });

  return { tokens, actionIds: Object.keys(tokens) };
}

function sanitizeRelationshipEntry(entryKind, entry) {
  if (!entry) {
    return null;
  }
  if (entryKind === 'importer' || entryKind === 'usage-direct') {
    return {
      file: entry.file,
      count: entry.count,
      imports: (entry.imports || []).map((imp) => ({
        specifier: imp.specifier,
        source: imp.source,
        line: imp.line
      }))
    };
  }
  if (entryKind === 'usage-call') {
    return {
      file: entry.file,
      count: entry.count,
      calls: (entry.calls || []).map((call) => ({
        line: call.line,
        context: call.context
      }))
    };
  }
  if (entryKind === 'usage-reexport') {
    if (typeof entry === 'string') {
      return { file: entry };
    }
    return { file: entry.file };
  }
  return entry;
}

async function replayRelationshipContinuation(parameters, scopeDir) {
  const analyzer = new RelationshipAnalyzer(scopeDir, { verbose: false });
  const relationshipType = parameters.relationship;
  const target = parameters.target || parameters.search;
  if (!relationshipType || !target) {
    return {
      result: null,
      entry: null,
      matchSnapshot: null,
      replayDigest: null
    };
  }

  const result = relationshipType === 'what-imports'
    ? await analyzer.whatImports(target)
    : relationshipType === 'export-usage'
      ? await analyzer.exportUsage(target)
      : null;

  if (!result) {
    return {
      result: null,
      entry: null,
      matchSnapshot: null,
      replayDigest: null
    };
  }

  const entryIndex = typeof parameters.entry_index === 'number'
    ? parameters.entry_index
    : parseInt(parameters.entry_index || '0', 10) || 0;
  const entryKind = parameters.entry_kind;
  let entry = null;
  let snapshot = null;

  if (relationshipType === 'what-imports' && Array.isArray(result.importers)) {
    entry = result.importers[entryIndex] || null;
    snapshot = captureImporterSnapshot(entry, scopeDir);
  } else if (relationshipType === 'export-usage' && result.usage) {
    if (entryKind === 'usage-direct' && Array.isArray(result.usage.directImports)) {
      entry = result.usage.directImports[entryIndex] || null;
      snapshot = captureImporterSnapshot(entry, scopeDir);
    } else if (entryKind === 'usage-call' && Array.isArray(result.usage.functionCalls)) {
      entry = result.usage.functionCalls[entryIndex] || null;
      snapshot = captureUsageCallSnapshot(entry, scopeDir);
    } else if (entryKind === 'usage-reexport' && Array.isArray(result.usage.reexports)) {
      const filePath = result.usage.reexports[entryIndex];
      if (filePath) {
        entry = { file: filePath };
        snapshot = captureReexportSnapshot(filePath, scopeDir);
      }
    }
  }

  return {
    result,
    entry,
    matchSnapshot: snapshot,
    replayDigest: TokenCodec.computeDigest(result)
  };
}

function parseMatchIndex(actionId) {
  if (!actionId || typeof actionId !== 'string') {
    return 0;
  }
  const [, suffix] = actionId.split(':');
  if (typeof suffix === 'undefined') {
    return 0;
  }
  const index = parseInt(suffix, 10);
  return Number.isNaN(index) ? 0 : index;
}

function captureMatchSnapshot(match, scopeDir) {
  if (!match) {
    return null;
  }
  const absoluteFile = path.isAbsolute(match.file)
    ? match.file
    : path.resolve(scopeDir, match.file);
  return {
    file: absoluteFile,
    relativeFile: path.relative(scopeDir, absoluteFile),
    displayFile: match.file,
    hash: match.function && match.function.hash ? match.function.hash : null,
    name: match.function && match.function.name ? match.function.name : null,
    canonicalName: match.function && match.function.canonicalName ? match.function.canonicalName : null,
    kind: match.function && match.function.kind ? match.function.kind : null,
    line: match.function && typeof match.function.line === 'number' ? match.function.line : null,
    column: match.function && typeof match.function.column === 'number' ? match.function.column : null,
    traits: match.function
      ? {
          exported: !!match.function.exported,
          isAsync: !!match.function.isAsync,
          isGenerator: !!match.function.isGenerator
        }
      : null,
    jsEditHint: match.jsEditHint || null
  };
}

function normalizeMatchSnapshot(match, scopeDir) {
  if (!match) {
    return null;
  }
  const absoluteFile = path.isAbsolute(match.file)
    ? match.file
    : path.resolve(scopeDir, match.file);
  return {
    ...match,
    file: absoluteFile,
    relativeFile: match.relativeFile || path.relative(scopeDir, absoluteFile)
  };
}

function replaySearchForContinuation(parameters, scopeDir) {
  if (parameters.match && parameters.match.file) {
    return {
      matchSnapshot: normalizeMatchSnapshot(parameters.match, scopeDir),
      replay: null,
      replayDigest: null
    };
  }

  const searchTerms = parameters.search_terms || normalizeSearchTerms(parameters.search);
  if (!searchTerms.length) {
    return { matchSnapshot: null, replay: null };
  }

  const replayScan = parameters.scanContext || {};
  const scanResult = scanWorkspace({
    dir: replayScan.dir || scopeDir,
    rootDir: replayScan.dir || scopeDir,
    exclude: replayScan.exclude || [],
    includeDeprecated: !!replayScan.includeDeprecated,
    deprecatedOnly: !!replayScan.deprecatedOnly,
    followDependencies: !!replayScan.followDependencies,
    dependencyDepth: typeof replayScan.dependencyDepth === 'number' ? replayScan.dependencyDepth : undefined,
    language: replayScan.language || 'auto'
  });

  const searchOptions = parameters.searchOptions || {};
  const filters = searchOptions.filters || {};
  const replayResult = runSearch(scanResult.files, searchTerms, {
    exportedOnly: !!filters.exportedOnly,
    internalOnly: !!filters.internalOnly,
    asyncOnly: !!filters.asyncOnly,
    generatorOnly: !!filters.generatorOnly,
    kinds: filters.kinds || [],
    includePaths: filters.includePaths || [],
    excludePaths: filters.excludePaths || [],
    limit: typeof searchOptions.limit === 'number' ? searchOptions.limit : parameters.limit,
    maxLines: searchOptions.maxLines,
    noSnippets: !!searchOptions.noSnippets,
    noGuidance: !!searchOptions.noGuidance
  });

  const idx = typeof parameters.match_index === 'number'
    ? parameters.match_index
    : parseInt(parameters.match_index || '0', 10) || 0;

  return {
    matchSnapshot: captureMatchSnapshot(replayResult.matches && replayResult.matches[idx], scopeDir),
    replay: replayResult,
    replayDigest: TokenCodec.computeDigest(replayResult)
  };
}

/**
 * Generate continuation tokens for each available action.
 * @param {string} command - CLI command (js-scan, js-edit, etc.)
 * @param {string} action - Current action (search, locate, etc.)
 * @param {Array} searchTerms - Original search terms
 * @param {Object} result - Result object
 * @param {Array} nextActions - Available next actions
 * @param {string} resultsDigest - Digest of results
 * @param {Object} options - CLI options
 * @returns {Object} Map of action id -> token
 */
function generateTokens(command, action, searchTerms, result, nextActions, resultsDigest, options) {
  const tokens = {};
  const requestId = TokenCodec.generateRequestId(command);
  const scopeDir = options.dir ? path.resolve(options.dir) : process.cwd();
  const normalizedTerms = normalizeSearchTerms(searchTerms);
  const searchOptionsSnapshot = snapshotSearchOptions(options);
  const scanContextSnapshot = snapshotScanContext(options);

  nextActions.forEach(nextAction => {
    try {
      const matchIndex = parseMatchIndex(nextAction.id);
      const matchSnapshot = captureMatchSnapshot(
        result.matches && result.matches[matchIndex],
        scopeDir
      );

      const tokenPayload = {
        command,
        action: nextAction.id.split(':')[0], // e.g., 'analyze' from 'analyze:0'
        context: {
          request_id: requestId,
          source_token: null,
          results_digest: resultsDigest
        },
        parameters: {
          search: Array.isArray(searchTerms) ? searchTerms.join(' ') : searchTerms,
          search_terms: normalizedTerms,
          scope: scopeDir,
          limit: options.limit,
          match_index: matchIndex,
          searchOptions: searchOptionsSnapshot,
          scanContext: scanContextSnapshot,
          match: matchSnapshot
        },
        next_actions: nextActions.map(a => ({
          id: a.id,
          label: a.label,
          description: a.description,
          guard: a.guard || false
        }))
      };

      const repoRoot = findRepositoryRoot(scopeDir);
      const token = TokenCodec.encode(tokenPayload, {
        secret_key: TokenCodec.deriveSecretKey({ repo_root: repoRoot }),
        ttl_seconds: 3600
      });

      tokens[nextAction.id] = token;
    } catch (err) {
      console.error(`Warning: Failed to generate token for ${nextAction.id}: ${err.message}`);
    }
  });

  return tokens;
}

/**
 * Handle continuation token for resuming a multi-step workflow.
 * Validates the token, extracts action, and executes it.
 * @param {string} token - Continuation token (Base64URL)
 * @param {Object} options - CLI options
 * @returns {Object} Result of the resumed action
 * @throws {Error} If token is invalid or action fails
 */
async function handleContinuationToken(token, options) {
  try {
    const decoded = TokenCodec.decode(token);
    const repoRoot = findRepositoryRoot(options.dir || process.cwd());
    const secretKey = TokenCodec.deriveSecretKey({ repo_root: repoRoot });
    const validation = TokenCodec.validate(decoded, {
      secret_key: secretKey
    });

    if (!validation.valid) {
      throw new Error(validation.error || 'Token validation failed');
    }

    const payload = decoded.payload;
    const parameters = payload.parameters || {};
    const action = payload.action;
    const scopeDir = parameters.scope ? path.resolve(parameters.scope) : path.resolve(options.dir || process.cwd());
    const expectedDigest = payload.context ? payload.context.results_digest : null;

    const warnings = [];
    let effectiveMatch = null;
    let replayDigest = null;
    let searchReplayResult = null;
    let relationshipReplay = null;
    const isRelationshipToken = Boolean(parameters.relationship);

    if (isRelationshipToken) {
      relationshipReplay = await replayRelationshipContinuation(parameters, scopeDir);
      effectiveMatch = relationshipReplay.matchSnapshot;
      replayDigest = relationshipReplay.replayDigest;
    } else {
      searchReplayResult = replaySearchForContinuation(parameters, scopeDir);
      effectiveMatch = searchReplayResult.matchSnapshot;
      replayDigest = searchReplayResult.replayDigest;
    }

    if (expectedDigest && replayDigest && expectedDigest !== replayDigest) {
      warnings.push({
        code: 'RESULTS_DIGEST_MISMATCH',
        message: 'Search results changed since this token was issued. Re-run js-scan with --ai-mode to refresh selectors and tokens.',
        expected_digest: expectedDigest,
        actual_digest: replayDigest
      });
    }

    const response = {
      status: 'token_accepted',
      action,
      scope: scopeDir,
      parameters: {
        search: parameters.search || null,
        search_terms: parameters.search_terms || normalizeSearchTerms(parameters.search),
        match_index: typeof parameters.match_index === 'number'
          ? parameters.match_index
          : parseInt(parameters.match_index || '0', 10) || 0,
        limit: parameters.limit || null
      },
      match: effectiveMatch || null,
      continuation: {
        source_token: token,
        issued_at: payload.issued_at || null,
        expires_at: payload.expires_at || null,
        available_actions: payload.next_actions || []
      },
      next_tokens: (payload.next_actions || []).map((a) => ({ id: a.id, label: a.label })),
      warnings: warnings.length ? warnings : undefined
    };

    if (!isRelationshipToken && action === 'analyze') {
      if (!effectiveMatch) {
        throw new Error('Match metadata unavailable; rerun js-scan with --ai-mode to refresh this token.');
      }
      response.analysis = {
        file: effectiveMatch.file,
        hash: effectiveMatch.hash,
        name: effectiveMatch.name || effectiveMatch.canonicalName,
        line: effectiveMatch.line,
        jsEditHint: effectiveMatch.jsEditHint || null
      };
      return response;
    }

    if (!isRelationshipToken && action === 'trace') {
      if (!effectiveMatch || !(effectiveMatch.name || effectiveMatch.canonicalName)) {
        throw new Error('Trace continuation requires a function name; rerun the originating search.');
      }
      const analyzer = new RelationshipAnalyzer(scopeDir, { verbose: false });
      response.trace = await analyzer.whatCalls(effectiveMatch.name || effectiveMatch.canonicalName);
      return response;
    }

    if (!isRelationshipToken && action === 'ripple') {
      if (!effectiveMatch || !effectiveMatch.file) {
        throw new Error('Ripple continuation requires file metadata; rerun the originating search.');
      }
      response.ripple = await analyzeRipple(effectiveMatch.file, {
        workspaceRoot: scopeDir,
        depth: (parameters.searchOptions && parameters.searchOptions.rippleDepth) || 4
      });
      return response;
    }

    if (isRelationshipToken) {
      const relationshipEntry = relationshipReplay ? relationshipReplay.entry : null;
      if (!relationshipEntry) {
        throw new Error('Relationship entry unavailable; rerun js-scan with --ai-mode to refresh tokens.');
      }
      if (action === 'importer-analyze' || action === 'usage-import' || action === 'usage-call' || action === 'usage-reexport') {
        response.relationship = {
          type: parameters.relationship,
          target: parameters.target || parameters.search || null,
          entryKind: parameters.entry_kind || null,
          entryIndex: typeof parameters.entry_index === 'number'
            ? parameters.entry_index
            : parseInt(parameters.entry_index || '0', 10) || 0,
          entry: sanitizeRelationshipEntry(parameters.entry_kind, relationshipEntry)
        };
        return response;
      }
      if (action === 'importer-ripple') {
        if (!relationshipEntry.file) {
          throw new Error('Ripple continuation requires file metadata.');
        }
        response.relationship = {
          type: parameters.relationship,
          target: parameters.target || parameters.search || null,
          entryKind: parameters.entry_kind || null,
          entryIndex: typeof parameters.entry_index === 'number'
            ? parameters.entry_index
            : parseInt(parameters.entry_index || '0', 10) || 0,
          entry: sanitizeRelationshipEntry(parameters.entry_kind, relationshipEntry)
        };
        response.ripple = await analyzeRipple(relationshipEntry.file, {
          workspaceRoot: scopeDir,
          depth: 4
        });
        return response;
      }
    }

    response.warning = `No handler implemented for action "${action}"`;
    return response;
  } catch (err) {
    throw new Error(`Token processing failed: ${err.message}`);
  }
}

/**
 * Print results from whatImports query
 */
function printWhatImports(result, options) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;

  const headerLabel = isChinese ? '导入者' : 'What Imports';
  fmt.header(`${headerLabel}: ${result.target}`);

  if (result.warning) {
    fmt.warn(result.warning);
    return;
  }

  if (result.error) {
    fmt.error(result.error);
    return;
  }

  if (result.importers.length === 0) {
    const msg = isChinese ? '未找到导入者' : 'No importers found';
    fmt.info(msg);
    return;
  }

  console.log(`\n${fmt.COLORS.muted(`Found ${result.importerCount} files importing this target`)}\n`);

  result.importers.forEach((importer, idx) => {
    console.log(`${fmt.COLORS.bold(`${idx + 1}. ${importer.file}`)}`);
    importer.imports.forEach(imp => {
      console.log(`   ${fmt.COLORS.cyan(imp.specifier)} from ${fmt.COLORS.muted(`line ${imp.line}`)}`);
    });
    console.log();
  });

  if (result.importSummary && Object.keys(result.importSummary).length > 0) {
    fmt.stat('Summary', '');
    Object.entries(result.importSummary).forEach(([spec, count]) => {
      fmt.stat(`  ${spec}`, count, 'number');
    });
  }
  fmt.footer();
}

/**
 * Print results from whatCalls query
 */
function printWhatCalls(result, options) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;

  const headerLabel = isChinese ? '函数调用' : 'What Calls';
  fmt.header(`${headerLabel}: ${result.targetFunction}`);

  if (result.warning) {
    fmt.warn(result.warning);
    return;
  }

  if (result.error) {
    fmt.error(result.error);
    return;
  }

  if (result.callees.length === 0) {
    const msg = isChinese ? '无调用' : 'No function calls found';
    fmt.info(msg);
    return;
  }

  console.log(`\n${fmt.COLORS.muted(`Function makes ${result.callCount} calls (${result.internalCallCount} internal, ${result.externalCallCount} external)`)}\n`);

  if (result.internalCalls.length > 0) {
    fmt.stat('Internal Calls', result.internalCalls.length);
    result.internalCalls.slice(0, 10).forEach(call => {
      console.log(`  ${fmt.COLORS.cyan(call.name)} (line ${call.line})`);
    });
    if (result.internalCalls.length > 10) {
      fmt.muted(`  ... and ${result.internalCalls.length - 10} more`);
    }
    console.log();
  }

  if (result.externalCalls.length > 0) {
    fmt.stat('External Calls', result.externalCalls.length);
    result.externalCalls.slice(0, 10).forEach(call => {
      console.log(`  ${fmt.COLORS.accent(call.name)} (line ${call.line})`);
    });
    if (result.externalCalls.length > 10) {
      fmt.muted(`  ... and ${result.externalCalls.length - 10} more`);
    }
  }
  fmt.footer();
}

/**
 * Print results from exportUsage query
 */
function printExportUsage(result, options) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;

  const headerLabel = isChinese ? '导出使用' : 'Export Usage';
  fmt.header(`${headerLabel}: ${result.target}`);

  if (result.error) {
    fmt.error(result.error);
    return;
  }

  const riskColor = result.riskLevel === 'HIGH' 
    ? fmt.COLORS.error
    : result.riskLevel === 'MEDIUM'
      ? fmt.COLORS.accent
      : fmt.COLORS.success;

  console.log(`\n${fmt.COLORS.muted(`Risk Level: ${riskColor(result.riskLevel)}`)}`);
  console.log(`${fmt.COLORS.muted(`Total Usage Count: ${result.totalUsageCount}`)}\n`);

  if (result.recommendation) {
    fmt.info(`Recommendation: ${result.recommendation}`);
    console.log();
  }

  if (result.usage.directImports.length > 0) {
    fmt.stat('Direct Importers', result.usage.directImports.length);
    result.usage.directImports.slice(0, 5).forEach(imp => {
      console.log(`  ${fmt.COLORS.cyan(imp.file)}`);
    });
    if (result.usage.directImports.length > 5) {
      fmt.muted(`  ... and ${result.usage.directImports.length - 5} more`);
    }
    console.log();
  }

  if (result.usage.functionCalls.length > 0) {
    fmt.stat('Function Calls', result.usage.functionCalls.length);
    result.usage.functionCalls.slice(0, 5).forEach(call => {
      console.log(`  ${fmt.COLORS.cyan(call.file)} (${call.count} calls)`);
    });
    if (result.usage.functionCalls.length > 5) {
      fmt.muted(`  ... and ${result.usage.functionCalls.length - 5} more`);
    }
    console.log();
  }

  if (result.usage.reexports.length > 0) {
    fmt.stat('Re-exports', result.usage.reexports.length);
    result.usage.reexports.slice(0, 5).forEach(re => {
      console.log(`  ${fmt.COLORS.accent(re)}`);
    });
    if (result.usage.reexports.length > 5) {
      fmt.muted(`  ... and ${result.usage.reexports.length - 5} more`);
    }
  }
  fmt.footer();
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW PRINT FUNCTIONS: Context Slice & Impact Preview
// ═══════════════════════════════════════════════════════════════════════════

function printContextSlice(result, options) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;

  const headerLabel = isChinese ? '上下文切片' : 'Context Slice';
  fmt.header(`${headerLabel}: ${result.target}`);

  if (result.error) {
    fmt.error(result.error);
    return;
  }

  const slice = result.slice;
  
  // Show reduction stats
  const reductionLabel = isChinese ? '减少' : 'Reduction';
  const linesLabel = isChinese ? '行' : 'lines';
  console.log(`\n${fmt.COLORS.success(`✓ ${slice.sliceLines} ${linesLabel} / ${slice.totalLines} ${linesLabel} (${slice.reduction} ${reductionLabel})`)}`);

  // Target function
  const targetLabel = isChinese ? '目标函数' : 'Target Function';
  fmt.stat(targetLabel, `${result.target} (lines ${slice.targetFunction.startLine}-${slice.targetFunction.endLine})`);

  // Imports
  if (slice.imports.length > 0) {
    const importsLabel = isChinese ? '相关导入' : 'Relevant Imports';
    console.log(`\n${fmt.COLORS.accent(importsLabel)}:`);
    slice.imports.forEach(imp => {
      const specs = imp.specifiers.map(s => s.local).join(', ');
      console.log(`  ${fmt.COLORS.cyan(imp.source)} → { ${specs} }`);
    });
  }

  // Constants
  if (slice.constants.length > 0) {
    const constantsLabel = isChinese ? '使用的常量' : 'Used Constants';
    console.log(`\n${fmt.COLORS.accent(constantsLabel)}:`);
    slice.constants.forEach(c => {
      console.log(`  ${fmt.COLORS.muted(`line ${c.startLine}:`)} ${c.name}`);
    });
  }

  // Called functions
  if (slice.functions.length > 0) {
    const functionsLabel = isChinese ? '调用的函数' : 'Called Functions';
    console.log(`\n${fmt.COLORS.accent(functionsLabel)}:`);
    slice.functions.forEach(fn => {
      console.log(`  ${fmt.COLORS.muted(`lines ${fn.startLine}-${fn.endLine}:`)} ${fn.name}`);
    });
  }

  // Dependencies summary
  if (result.dependencies.externalImports.length > 0) {
    const externalLabel = isChinese ? '外部依赖' : 'External Dependencies';
    console.log(`\n${fmt.COLORS.accent(externalLabel)}: ${result.dependencies.externalImports.join(', ')}`);
  }

  // Optional: show code
  if (result.code && options.includeCode !== false) {
    const codeLabel = isChinese ? '组装代码' : 'Assembled Code';
    console.log(`\n${'─'.repeat(70)}`);
    console.log(fmt.COLORS.muted(codeLabel + ':'));
    console.log(result.code);
  }

  fmt.footer();
}

function printImpactPreview(result, options) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;

  const headerLabel = isChinese ? '影响预览' : 'Impact Preview';
  fmt.header(`${headerLabel}: ${result.file}`);

  if (result.error) {
    fmt.error(result.error);
    return;
  }

  const summary = result.summary;
  
  // Risk summary
  const riskLabel = isChinese ? '风险摘要' : 'Risk Summary';
  console.log(`\n${fmt.COLORS.accent(riskLabel)}:`);
  console.log(`  ${fmt.COLORS.error('🔴 HIGH')}: ${summary.highRisk} exports`);
  console.log(`  ${fmt.COLORS.accent('🟡 MEDIUM')}: ${summary.mediumRisk} exports`);
  console.log(`  ${fmt.COLORS.success('🟢 LOW')}: ${summary.lowRisk} exports`);
  console.log(`  ${fmt.COLORS.muted('⚪ NONE')}: ${summary.safeToModify.length} exports`);

  // Exports detail
  if (result.exports.length > 0) {
    const exportsLabel = isChinese ? '导出详情' : 'Export Details';
    console.log(`\n${fmt.COLORS.accent(exportsLabel)}:`);
    
    // Sort by risk level
    const sortedExports = [...result.exports].sort((a, b) => {
      const riskOrder = { HIGH: 0, MEDIUM: 1, LOW: 2, NONE: 3 };
      return (riskOrder[a.risk] || 99) - (riskOrder[b.risk] || 99);
    });

    for (const exp of sortedExports) {
      const riskIcon = exp.risk === 'HIGH' ? '🔴' : exp.risk === 'MEDIUM' ? '🟡' : exp.risk === 'LOW' ? '🟢' : '⚪';
      const usageLabel = isChinese ? '使用' : 'usages';
      console.log(`  ${riskIcon} ${fmt.COLORS.cyan(exp.name)} (${exp.type}) - ${exp.usageCount} ${usageLabel}`);
      
      if (exp.usedBy && exp.usedBy.length > 0 && exp.usedBy.length <= 5) {
        exp.usedBy.forEach(file => {
          console.log(`      ${fmt.COLORS.muted('→')} ${file}`);
        });
      } else if (exp.usedBy && exp.usedBy.length > 5) {
        exp.usedBy.slice(0, 3).forEach(file => {
          console.log(`      ${fmt.COLORS.muted('→')} ${file}`);
        });
        console.log(`      ${fmt.COLORS.muted(`... and ${exp.usedBy.length - 3} more`)}`);
      }
    }
  }

  // Recommendations
  if (result.recommendations.length > 0) {
    const recLabel = isChinese ? '建议' : 'Recommendations';
    console.log(`\n${fmt.COLORS.accent(recLabel)}:`);
    result.recommendations.forEach(rec => {
      const icon = rec.type === 'warning' ? '⚠️' : 'ℹ️';
      console.log(`  ${icon} ${rec.message}`);
    });
  }

  // Safe to modify
  if (summary.safeToModify.length > 0) {
    const safeLabel = isChinese ? '可安全修改' : 'Safe to Modify';
    console.log(`\n${fmt.COLORS.success(safeLabel)}: ${summary.safeToModify.join(', ')}`);
  }

  fmt.footer();
}

// ═══════════════════════════════════════════════════════════════════════════
// GAP 6 PRINT FUNCTIONS: Call Graph, Hot Paths, Dead Code
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Print call graph traversal results in human-readable format
 * @param {Object} result - Result from traverseCallGraph
 * @param {Object} startNode - The starting node for the traversal
 * @param {Object} options - CLI options
 */
function printCallGraph(result, startNode, options) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;

  const headerLabel = isChinese ? '调用图' : 'Call Graph';
  fmt.header(`${headerLabel}: ${startNode.id}`);

  // Start node info
  const startLabel = isChinese ? '起始函数' : 'Start Function';
  console.log(`\n${fmt.COLORS.accent(startLabel)}:`);
  console.log(`  ${fmt.COLORS.cyan(startNode.name)} @ ${startNode.file}:${startNode.line}`);
  if (startNode.exported) {
    console.log(`  ${fmt.COLORS.success('✓ exported')}`);
  }
  if (startNode.isAsync) {
    console.log(`  ${fmt.COLORS.muted('async')}`);
  }

  // Stats
  const statsLabel = isChinese ? '统计' : 'Stats';
  console.log(`\n${fmt.COLORS.accent(statsLabel)}:`);
  console.log(`  ${isChinese ? '节点' : 'Nodes'}: ${result.nodes.length}`);
  console.log(`  ${isChinese ? '边' : 'Edges'}: ${result.edges.length}`);
  if (result.depth > 0) {
    console.log(`  ${isChinese ? '深度限制' : 'Depth limit'}: ${result.depth}`);
  }

  // Edges (calls)
  if (result.edges.length > 0) {
    const callsLabel = isChinese ? '调用关系' : 'Call Relationships';
    console.log(`\n${fmt.COLORS.accent(callsLabel)}:`);
    
    const limit = options.limit || 50;
    const edgesToShow = result.edges.slice(0, limit);
    
    edgesToShow.forEach(edge => {
      const sourceShort = edge.sourceId.split('::').pop();
      const targetShort = edge.targetId.split('::').pop();
      console.log(`  ${fmt.COLORS.muted(sourceShort)} → ${fmt.COLORS.cyan(targetShort)} (${edge.count}x)`);
    });

    if (result.edges.length > limit) {
      console.log(`  ${fmt.COLORS.muted(`... and ${result.edges.length - limit} more`)}`);
    }
  }

  // Unresolved calls
  if (result.unresolved && result.unresolved.length > 0) {
    const unresolvedLabel = isChinese ? '未解析调用' : 'Unresolved Calls';
    console.log(`\n${fmt.COLORS.accent(unresolvedLabel)}:`);
    const unresolvedToShow = result.unresolved.slice(0, 10);
    unresolvedToShow.forEach(entry => {
      console.log(`  ${fmt.COLORS.muted('?')} ${entry.call} (${entry.count}x from ${entry.sourceId.split('::').pop()})`);
    });
    if (result.unresolved.length > 10) {
      console.log(`  ${fmt.COLORS.muted(`... and ${result.unresolved.length - 10} more`)}`);
    }
  }

  fmt.footer();
}

/**
 * Print hot paths (most called functions) in human-readable format
 * @param {Array} hotPaths - Result from computeHotPaths
 * @param {Object} stats - Graph stats
 * @param {Object} options - CLI options
 */
function printHotPaths(hotPaths, stats, options) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;

  const headerLabel = isChinese ? '热路径' : 'Hot Paths';
  fmt.header(headerLabel);

  // Stats
  console.log(`\n${fmt.COLORS.muted(isChinese 
    ? `总节点: ${stats.nodeCount} | 总边: ${stats.edgeCount}` 
    : `Total nodes: ${stats.nodeCount} | Total edges: ${stats.edgeCount}`)}`);

  if (hotPaths.length === 0) {
    console.log(`\n${fmt.COLORS.muted(isChinese ? '未发现热路径' : 'No hot paths found.')}`);
    fmt.footer();
    return;
  }

  // Hot paths list
  const listLabel = isChinese ? '最常调用函数' : 'Most Called Functions';
  console.log(`\n${fmt.COLORS.accent(listLabel)}:`);

  hotPaths.forEach((entry, index) => {
    const rank = index + 1;
    const exportedTag = entry.exported ? fmt.COLORS.success(' [exported]') : '';
    const countLabel = isChinese ? '次调用' : 'calls';
    console.log(`  ${rank}. ${fmt.COLORS.cyan(entry.name)} - ${entry.count} ${countLabel}${exportedTag}`);
    console.log(`     ${fmt.COLORS.muted(entry.file)}`);
  });

  fmt.footer();
}

/**
 * Print dead code (functions with zero inbound calls) in human-readable format
 * @param {Array} deadCode - Result from findDeadCode
 * @param {Object} stats - Graph stats
 * @param {Object} options - CLI options
 */
function printDeadCode(deadCode, stats, options) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;

  const headerLabel = isChinese ? '死代码' : 'Dead Code';
  fmt.header(headerLabel);

  // Stats
  const includeExported = options.deadCodeIncludeExported;
  console.log(`\n${fmt.COLORS.muted(isChinese 
    ? `总节点: ${stats.nodeCount} | 包含导出: ${includeExported ? '是' : '否'}` 
    : `Total nodes: ${stats.nodeCount} | Include exported: ${includeExported ? 'yes' : 'no'}`)}`);

  if (deadCode.length === 0) {
    console.log(`\n${fmt.COLORS.success(isChinese ? '✓ 未发现死代码' : '✓ No dead code found.')}`);
    fmt.footer();
    return;
  }

  // Summary
  const exportedCount = deadCode.filter(d => d.exported).length;
  const internalCount = deadCode.length - exportedCount;
  
  console.log(`\n${fmt.COLORS.accent(isChinese ? '摘要' : 'Summary')}:`);
  console.log(`  ${isChinese ? '未调用函数' : 'Uncalled functions'}: ${deadCode.length}`);
  if (exportedCount > 0) {
    console.log(`  ${fmt.COLORS.accent(isChinese ? '导出(可能是API)' : 'Exported (possibly API)')}: ${exportedCount}`);
  }
  console.log(`  ${isChinese ? '内部' : 'Internal'}: ${internalCount}`);

  // Dead code list
  const listLabel = isChinese ? '未调用函数列表' : 'Uncalled Functions';
  console.log(`\n${fmt.COLORS.accent(listLabel)}:`);

  deadCode.forEach((entry, index) => {
    const exportedTag = entry.exported ? fmt.COLORS.accent(' [exported]') : '';
    console.log(`  ${index + 1}. ${fmt.COLORS.cyan(entry.name)}${exportedTag}`);
    console.log(`     ${fmt.COLORS.muted(entry.file)}`);
  });

  // Guidance
  if (internalCount > 0) {
    console.log(`\n${fmt.COLORS.muted(isChinese 
      ? '💡 内部未调用函数可能可以安全删除' 
      : '💡 Internal uncalled functions may be safely removable')}`);
  }

  fmt.footer();
}

async function main() {
  const parser = createParser();
  let options;
  const originalArgv = process.argv;
  const translated = translateCliArgs('js-scan', originalArgv.slice(2));
  const argvForParse = originalArgv.slice(0, 2).concat(translated.argv);
  const argTokens = argvForParse.slice(2);
  const langOverride = extractLangOption(argTokens);
  const languageHint = deriveLanguageModeHint(langOverride, translated);
  const hasHelpFlag = argTokens.some((token) => token === '--help');

  if (hasHelpFlag) {
    fmt.setLanguageMode(languageHint);
    printHelpOutput(languageHint, parser, translated);
    return;
  }
  fmt.setLanguageMode(languageHint);
  try {
    options = parser.parse(argvForParse);
  } catch (error) {
    fmt.error(error.message || String(error));
    process.exitCode = 1;
    return;
  }

  options.showParseErrors = normalizeBooleanOption(options.showParseErrors);
  options.depsParseErrors = normalizeBooleanOption(options.depsParseErrors);

  const operation = ensureSingleOperation(options);

  // Handle --continuation flag for token-based continuation
  if (options.continuation) {
    try {
      // Support reading from stdin when --continuation - is used
      let token = options.continuation;
      if (token === '-' && !process.stdin.isTTY) {
        // Read token from stdin
        token = '';
        for await (const chunk of process.stdin) {
          token += chunk.toString();
        }
        token = token.trim();
      }
      
      const continuationResult = await handleContinuationToken(token, options);
      if (options.json) {
        console.log(JSON.stringify(continuationResult, null, 2));
      } else {
        console.log(JSON.stringify(continuationResult, null, 2)); // Default to JSON for now
      }
      return;
    } catch (err) {
      fmt.error(`Failed to process continuation token: ${err.message}`);
      process.exitCode = 1;
      return;
    }
  }

  if (options.includeDeprecated && options.deprecatedOnly) {
    fmt.error('Use either --include-deprecated or --deprecated-only, not both.');
    process.exitCode = 1;
    return;
  }

  if (!path.isAbsolute(options.dir)) {
    options.dir = path.resolve(process.cwd(), options.dir);
  }

  options.exclude = toArray(options.exclude);
  options.includePath = toArray(options.includePath);
  options.excludePath = toArray(options.excludePath);
  options.kind = toArray(options.kind);
  options.search = toArray(options.search);
  options.findPattern = toArray(options.findPattern);

  const resolvedView = normalizeViewMode(options.view);
  if (!resolvedView) {
    fmt.error('Invalid --view value. Use detailed, terse, or summary.');
    process.exitCode = 1;
    return;
  }
  options.view = resolvedView;
  options.terseFields = parseTerseFields(options.fields);
  options.sourceLanguage = typeof options.sourceLanguage === 'string'
    ? options.sourceLanguage.trim().toLowerCase()
    : 'auto';

  const langOption = typeof options.lang === 'string' ? options.lang.trim().toLowerCase() : 'auto';
  let languageMode = 'en';
  if (langOption === 'zh' || langOption === 'cn') {
    languageMode = 'zh';
  } else if (langOption === 'bilingual' || langOption === 'en-zh' || langOption === 'zh-en') {
    languageMode = 'bilingual';
  } else if (langOption === 'en') {
    languageMode = 'en';
  } else {
    if (translated.aliasUsed || translated.glyphDetected) {
      languageMode = 'zh';
    }
  }

  fmt.setLanguageMode(languageMode);
  options.lang = langOption;
  options.languageMode = languageMode;
  options._i18n = translated;

  let scanResult;
  try {
    scanResult = scanWorkspace({
      dir: options.dir,
      rootDir: options.dir,
      exclude: options.exclude,
      includeDeprecated: options.includeDeprecated,
      deprecatedOnly: options.deprecatedOnly,
      followDependencies: options.followDeps,
      dependencyDepth: options.depDepth,
      language: options.sourceLanguage
    });
  } catch (error) {
    fmt.error(error.message || String(error));
    process.exitCode = 1;
    return;
  }

  const parseErrors = Array.isArray(scanResult.errors) ? scanResult.errors : [];
  const dependencyOperation = operation === 'deps-of';
  const dependencyParseDetailRequested = dependencyOperation && (options.depsParseErrors || options.showParseErrors);
  const suppressDependencyParseDetails = dependencyOperation && !dependencyParseDetailRequested;

  if (parseErrors.length > 0 && !dependencyOperation && !options.json) {
    fmt.warn(`${parseErrors.length} files could not be parsed.`);
    parseErrors.slice(0, 5).forEach((entry) => {
      fmt.info(`${entry.filePath}: ${entry.error.message}`);
    });
    if (parseErrors.length > 5) {
      fmt.info('Additional parse errors omitted.');
    }
  }

  const sharedFilters = {
    exportedOnly: options.exported,
    internalOnly: options.internal,
    asyncOnly: options.async,
    generatorOnly: options.generator,
    kinds: options.kind,
    includePaths: options.includePath,
    excludePaths: options.excludePath
  };

  try {
    if (operation === 'search') {
      const result = runSearch(scanResult.files, options.search, {
        ...sharedFilters,
        limit: options.limit,
        maxLines: options.maxLines,
        noSnippets: options.noSnippets,
        noGuidance: options.noGuidance
      });
      
      if (options.json) {
        // If --ai-mode is enabled, add continuation tokens
        if (options.aiMode) {
          const resultsDigest = TokenCodec.computeDigest(result);
          const nextActions = generateNextActions(result, options);
          const continuationTokens = generateTokens(
            'js-scan',
            'search',
            options.search,
            result,
            nextActions,
            resultsDigest,
            options
          );
          const augmentedResult = createAiNativeEnvelope(result, continuationTokens);
          console.log(JSON.stringify(augmentedResult, null, 2));
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
      } else {
        printSearchResult(result, options);
      }
      return;
    }

    if (operation === 'find-hash') {
      const result = runHashLookup(scanResult.files, options.findHash);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printHashLookup(result, options);
      }
      return;
    }

    if (operation === 'deps-of') {
      const result = runDependencySummary(scanResult.files, options.depsOf, {
        rootDir: scanResult.rootDir,
        depth: options.depDepth,
        limit: options.limit
      });
      if (options.json) {
        if (parseErrors.length > 0) {
          result.parseErrors = {
            count: parseErrors.length
          };
          if (dependencyParseDetailRequested) {
            const samples = parseErrors.slice(0, 5).map((entry) => ({
              file: entry.filePath,
              message: entry.error && entry.error.message ? entry.error.message : String(entry.error || 'Unknown error')
            }));
            result.parseErrors.samples = samples;
            if (parseErrors.length > samples.length) {
              result.parseErrors.omitted = parseErrors.length - samples.length;
            }
          }
        }
        console.log(JSON.stringify(result, null, 2));
      } else {
        printDependencySummary(result);
        printParseErrorSummary(parseErrors, {
          suppressed: suppressDependencyParseDetails,
          showDetails: dependencyParseDetailRequested,
          hintFlag: '--deps-parse-errors'
        });
      }
      return;
    }

    if (operation === 'depends-on' || operation === 'impacts') {
      const summaryTarget = operation === 'depends-on' ? options.dependsOn : options.impacts;
      const direction = operation === 'depends-on' ? 'outgoing' : 'incoming';
      const result = runDependencySummary(scanResult.files, summaryTarget, {
        rootDir: scanResult.rootDir,
        depth: options.depDepth,
        limit: options.limit
      });

      const payload = {
        operation,
        target: result.target,
        stats: {
          direction,
          depth: result.stats.depth,
          limit: result.stats.limit,
          total: direction === 'outgoing' ? result.outgoing.length : result.incoming.length,
          fanOut: result.stats.fanOut,
          fanIn: result.stats.fanIn
        },
        dependencies: direction === 'outgoing' ? result.outgoing : result.incoming
      };

      if (options.json) {
        if (parseErrors.length > 0) {
          payload.parseErrors = {
            count: parseErrors.length
          };
        }
        console.log(JSON.stringify(payload, null, 2));
      } else {
        printDependencyTraversal(payload, direction);
        printParseErrorSummary(parseErrors, {
          suppressed: direction === 'incoming',
          showDetails: options.depsParseErrors || options.showParseErrors,
          hintFlag: '--deps-parse-errors'
        });
      }
      return;
    }

    if (operation === 'build-index' || operation === 'build-index-default') {
      const result = buildIndex(scanResult.files, { limit: options.limit });
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printIndex(result, options);
      }
      return;
    }

    if (operation === 'find-pattern') {
      const result = runPatternSearch(scanResult.files, options.findPattern, {
        ...sharedFilters,
        limit: options.limit
      });
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printPatternResult(result, options);
      }
      return;
    }

    if (operation === 'ripple-analysis') {
      const result = await analyzeRipple(options.rippleAnalysis, {
        workspaceRoot: options.dir,
        depth: options.depDepth || 4
      });
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printRippleAnalysis(result, options);
      }
      return;
    }

    if (operation === 'what-imports') {
      const analyzer = new RelationshipAnalyzer(options.dir, { verbose: false });
      const result = await analyzer.whatImports(options.whatImports);
      if (options.json) {
        if (options.aiMode) {
          const { tokens } = generateRelationshipTokens('what-imports', result, options);
          console.log(JSON.stringify(createAiNativeEnvelope(result, tokens), null, 2));
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
      } else {
        printWhatImports(result, options);
      }
      return;
    }

    if (operation === 'what-calls') {
      const analyzer = new RelationshipAnalyzer(options.dir, { verbose: false });
      const result = await analyzer.whatCalls(options.whatCalls);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printWhatCalls(result, options);
      }
      return;
    }

    if (operation === 'export-usage') {
      const analyzer = new RelationshipAnalyzer(options.dir, { verbose: false });
      const result = await analyzer.exportUsage(options.exportUsage);
      if (options.json) {
        if (options.aiMode) {
          const { tokens } = generateRelationshipTokens('export-usage', result, options);
          console.log(JSON.stringify(createAiNativeEnvelope(result, tokens), null, 2));
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
      } else {
        printExportUsage(result, options);
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // NEW OPERATIONS: Context Slice & Impact Preview
    // ═══════════════════════════════════════════════════════════════════════

    if (operation === 'context-slice') {
      // Parse target: --context-slice functionName --file path
      // Or: --context-slice path:functionName
      let targetFile = options.file || options.dir;
      let targetFunction = options.contextSlice;

      // Handle path:function format
      if (targetFunction && targetFunction.includes(':')) {
        const parts = targetFunction.split(':');
        targetFile = parts[0];
        targetFunction = parts[1];
      }

      if (!targetFile) {
        fmt.error('--context-slice requires --file <path> or use format: --context-slice path:functionName');
        process.exitCode = 1;
        return;
      }

      const result = await contextSlice(targetFile, targetFunction, {
        includeCode: options.includeCode !== false,
        workspaceRoot: options.dir
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printContextSlice(result, options);
      }
      return;
    }

    if (operation === 'impact-preview') {
      const result = await impactPreview(options.impactPreview, {
        workspaceRoot: options.dir
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printImpactPreview(result, options);
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GAP 6 OPERATIONS: Call Graph, Hot Paths, Dead Code
    // ═══════════════════════════════════════════════════════════════════════

    if (operation === 'call-graph') {
      const callGraph = buildCallGraph(scanResult.files);
      const startNode = selectNode(callGraph, options.callGraph);
      const result = traverseCallGraph(callGraph, startNode.id, options.depDepth || 0);

      if (options.json) {
        console.log(JSON.stringify({
          operation: 'call-graph',
          target: options.callGraph,
          startNode: {
            id: startNode.id,
            name: startNode.name,
            file: startNode.file,
            line: startNode.line,
            exported: startNode.exported,
            hash: startNode.hash
          },
          stats: {
            nodes: result.nodes.length,
            edges: result.edges.length,
            depth: result.depth,
            unresolvedCalls: result.unresolved.length
          },
          nodes: result.nodes.map(n => ({
            id: n.id,
            name: n.name,
            file: n.file,
            line: n.line,
            exported: n.exported,
            hash: n.hash
          })),
          edges: result.edges,
          unresolved: result.unresolved
        }, null, 2));
      } else {
        printCallGraph(result, startNode, options);
      }
      return;
    }

    if (operation === 'hot-paths') {
      const callGraph = buildCallGraph(scanResult.files);
      const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 20;
      const hotPaths = computeHotPaths(callGraph, limit);

      if (options.json) {
        console.log(JSON.stringify({
          operation: 'hot-paths',
          stats: {
            nodeCount: callGraph.stats.nodeCount,
            edgeCount: callGraph.stats.edgeCount,
            limit
          },
          hotPaths
        }, null, 2));
      } else {
        printHotPaths(hotPaths, callGraph.stats, options);
      }
      return;
    }

    if (operation === 'dead-code') {
      const callGraph = buildCallGraph(scanResult.files);
      const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 50;
      const includeExported = options.deadCodeIncludeExported || false;
      const deadCode = findDeadCode(callGraph, { includeExported, limit });

      if (options.json) {
        console.log(JSON.stringify({
          operation: 'dead-code',
          stats: {
            nodeCount: callGraph.stats.nodeCount,
            edgeCount: callGraph.stats.edgeCount,
            includeExported,
            limit
          },
          summary: {
            total: deadCode.length,
            exported: deadCode.filter(d => d.exported).length,
            internal: deadCode.filter(d => !d.exported).length
          },
          deadCode
        }, null, 2));
      } else {
        printDeadCode(deadCode, callGraph.stats, options);
      }
      return;
    }
  } catch (error) {
    fmt.error(error.message || String(error));
    if (error.stack) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  extractLangOption,
  deriveLanguageModeHint,
  normalizeViewMode,
  parseTerseFields,
  formatTerseMatch
};
