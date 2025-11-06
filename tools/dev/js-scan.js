#!/usr/bin/env node
'use strict';

const path = require('path');
const { setupPowerShellEncoding } = require('./shared/powershellEncoding');
setupPowerShellEncoding();

const { CliFormatter } = require('../../src/utils/CliFormatter');
const { CliArgumentParser } = require('../../src/utils/CliArgumentParser');
const { translateCliArgs } = require('./i18n/dialect');
const { extractLangOption, deriveLanguageModeHint } = require('./i18n/language');
const { resolveLanguageContext, translateLabelWithMode, joinTranslatedLabels } = require('./i18n/helpers');
const { scanWorkspace } = require('./js-scan/shared/scanner');
const { runSearch } = require('./js-scan/operations/search');
const { runHashLookup } = require('./js-scan/operations/hashLookup');
const { buildIndex } = require('./js-scan/operations/indexing');
const { runPatternSearch } = require('./js-scan/operations/patterns');

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
  { lexKey: 'view', alias: '视', summary: '视模', params: '[详 简 概]' },
  { lexKey: 'fields', alias: '域', summary: '简列', params: '[location name hash]'},
  { lexKey: 'follow_deps', alias: '依', summary: '依扫', params: '' },
  { lexKey: 'dependency_depth', alias: '层', summary: '层限', params: '[数]'}
]);

const CHINESE_HELP_DETAILS = Object.freeze({
  search: [
    '搜要: 搜文 限数 片显',
    '示: node tools/dev/js-scan.js --搜 service'
  ],
  hash: [
    '哈要: 以哈 定函',
    '示: node tools/dev/js-scan.js --哈 1a2b3c4d'
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
    '语 要: 设模 英 中 双 自'
  ],
  view: [
    '视 要: 详 简 概',
    '示: node tools/dev/js-scan.js --视 简'
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

  fields.forEach((field) => {
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
    .add('--view <mode>', 'Output view (detailed, terse, summary)', 'detailed')
    .add('--fields <list>', 'Comma-separated fields for terse view', '')
    .add('--follow-deps', 'Follow relative dependencies discovered in scanned files', false, 'boolean')
    .add('--dep-depth <n>', 'Maximum dependency depth when following dependencies (0 = unlimited)', 0, 'number')
    .add('--search <term...>', 'Search terms (space-separated)')
    .add('--find-hash <hash>', 'Find function by hash value')
    .add('--find-pattern <pattern...>', 'Find functions matching glob/regex patterns')
    .add('--build-index', 'Build module index', false, 'boolean');

  return parser;
}

function ensureSingleOperation(options) {
  const provided = [];
  if (options.search && options.search.length > 0) provided.push('search');
  if (options.findHash) provided.push('find-hash');
  if (options.findPattern && options.findPattern.length > 0) provided.push('find-pattern');
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

  const operation = ensureSingleOperation(options);

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
      dependencyDepth: options.depDepth
    });
  } catch (error) {
    fmt.error(error.message || String(error));
    process.exitCode = 1;
    return;
  }

  if (scanResult.errors.length > 0) {
    fmt.warn(`${scanResult.errors.length} files could not be parsed.`);
    scanResult.errors.slice(0, 5).forEach((entry) => {
      fmt.info(`${entry.filePath}: ${entry.error.message}`);
    });
    if (scanResult.errors.length > 5) {
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
        console.log(JSON.stringify(result, null, 2));
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
