#!/usr/bin/env node
'use strict';

/**
 * js-scan constants module
 * 常量模块 — View modes, field aliases, help text
 */

// View mode configurations
const VIEW_MODES = Object.freeze(['detailed', 'terse', 'summary']);

const VIEW_MODE_KEYWORDS = Object.freeze({
  detailed: Object.freeze(['detailed', 'detail', 'full', 'normal', 'default', 'auto', '默认', '詳', '详']),
  terse: Object.freeze(['terse', 'compact', 'brief', 'concise', 'short', '简', '緊', '紧']),
  summary: Object.freeze(['summary', 'overview', 'rollup', 'aggregate', '概', '總', '总', '汇'])
});

// Build lookup map for view keywords
const VIEW_KEYWORD_MAP = new Map();
Object.entries(VIEW_MODE_KEYWORDS).forEach(([mode, keywords]) => {
  keywords.forEach((keyword) => {
    if (typeof keyword !== 'string') return;
    VIEW_KEYWORD_MAP.set(keyword, mode);
    VIEW_KEYWORD_MAP.set(keyword.toLowerCase(), mode);
  });
});

// Terse output field configurations
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
  'location', 'file', 'line', 'column', 'name', 'canonical',
  'selector', 'kind', 'hash', 'rank', 'score', 'exported',
  'async', 'generator', 'terms'
]);

const DEFAULT_TERSE_FIELDS = Object.freeze(['location', 'name', 'hash', 'exported']);

// Chinese help text
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
  include_paths: ['含径 要: 仅含 路片; 令 --含径 片'],
  exclude_path: ['除径 要: 排除 路片; 令 --除径 片'],
  include_deprecated: ['含旧 要: 扫旧 目录'],
  deprecated_only: ['旧专 要: 仅扫 旧径'],
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

const MAX_RELATIONSHIP_ACTIONS = 10;

module.exports = {
  VIEW_MODES,
  VIEW_MODE_KEYWORDS,
  VIEW_KEYWORD_MAP,
  TERSE_FIELD_ALIASES,
  SUPPORTED_TERSE_FIELDS,
  DEFAULT_TERSE_FIELDS,
  CHINESE_HELP_ROWS,
  CHINESE_HELP_DETAILS,
  MAX_RELATIONSHIP_ACTIONS
};
