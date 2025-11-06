'use strict';

const RAW_LEXICON = Object.freeze({
  file: Object.freeze(['文', '档']),
  path: Object.freeze(['径', '路']),
  include: Object.freeze(['含', '并']),
  include_paths: Object.freeze(['含径']),
  exclude_path: Object.freeze(['除径']),
  list: Object.freeze(['列']),
  bytes: Object.freeze(['字节']),
  name: Object.freeze(['名']),
  list_functions: Object.freeze(['函列']),
  list_variables: Object.freeze(['变列']),
  list_constructors: Object.freeze(['构列']),
  list_sections: Object.freeze(['节列']),
  list_code_blocks: Object.freeze(['码列']),
  document: Object.freeze(['文档']),
  outline: Object.freeze(['纲']),
  section: Object.freeze(['节']),
  function: Object.freeze(['函']),
  variable: Object.freeze(['变']),
  scope: Object.freeze(['域']),
  syntax: Object.freeze(['句']),
  hash: Object.freeze(['哈', '散']),
  byte_length: Object.freeze(['长']),
  metadata: Object.freeze(['元']),
  code: Object.freeze(['代码']),
  block: Object.freeze(['块']),
  filter: Object.freeze(['滤']),
  filter_text: Object.freeze(['文滤', '滤文']),
  match: Object.freeze(['配']),
  exclude: Object.freeze(['排']),
  include_internals: Object.freeze(['内含']),
  list_output: Object.freeze(['列式']),
  function_summary: Object.freeze(['函汇', '汇']),
  context: Object.freeze(['邻', '境']),
  context_function: Object.freeze(['函邻']),
  context_variable: Object.freeze(['变邻']),
  context_before: Object.freeze(['邻前']),
  context_after: Object.freeze(['邻后']),
  before: Object.freeze(['前']),
  after: Object.freeze(['后']),
  enclosing: Object.freeze(['括']),
  preview: Object.freeze(['预']),
  preview_variable: Object.freeze(['变预']),
  preview_edit: Object.freeze(['预改']),
  preview_chars: Object.freeze(['预长', '预字']),
  snipe: Object.freeze(['点寻']),
  search: Object.freeze(['搜', '查']),
  search_text: Object.freeze(['文搜', '搜文']),
  search_limit: Object.freeze(['限']),
  search_context: Object.freeze(['搜邻']),
  search_headings: Object.freeze(['搜题']),
  find_sections: Object.freeze(['搜节']),
  selector: Object.freeze(['选']),
  select: Object.freeze(['选']),
  select_path: Object.freeze(['选径']),
  check: Object.freeze(['检']),
  details: Object.freeze(['详']),
  signature: Object.freeze(['签']),
  path_signature: Object.freeze(['径签']),
  scan: Object.freeze(['扫']),
  scan_targets: Object.freeze(['扫标']),
  scan_target_kind: Object.freeze(['标类']),
  target: Object.freeze(['标', '靶']),
  kind: Object.freeze(['类', '种']),
  extract: Object.freeze(['取', '抽']),
  extract_hashes: Object.freeze(['取哈']),
  extract_variable: Object.freeze(['取变']),
  extract_section: Object.freeze(['取节']),
  replace: Object.freeze(['替', '换']),
  replace_variable: Object.freeze(['替变']),
  replace_range: Object.freeze(['段换', '换段']),
  replace_section: Object.freeze(['替节']),
  requested: Object.freeze(['求']),
  locate: Object.freeze(['定']),
  locate_variable: Object.freeze(['定变']),
  rename: Object.freeze(['改名']),
  remove_section: Object.freeze(['删节']),
  show_section: Object.freeze(['显节']),
  with: Object.freeze(['以', '用']),
  with_file: Object.freeze(['以档']),
  with_code: Object.freeze(['以码']),
  with_neighbors: Object.freeze(['带邻']),
  output: Object.freeze(['出', '写']),
  emit: Object.freeze(['出']),
  emit_plan: Object.freeze(['出计']),
  emit_diff: Object.freeze(['出异']),
  digest: Object.freeze(['摘']),
  emit_digests: Object.freeze(['出摘']),
  digest_dir: Object.freeze(['摘目']),
  no_digests: Object.freeze(['无摘']),
  digest_include_snippets: Object.freeze(['摘含片']),
  snippet: Object.freeze(['片']),
  fix: Object.freeze(['改', '写']),
  dry_run: Object.freeze(['演']),
  expect: Object.freeze(['预']),
  expect_hash: Object.freeze(['预哈']),
  expect_span: Object.freeze(['预段']),
  span: Object.freeze(['段']),
  force: Object.freeze(['强']),
  applied: Object.freeze(['用']),
  words: Object.freeze(['词']),
  prose: Object.freeze(['散']),
  total: Object.freeze(['总']),
  json: Object.freeze(['机读']),
  quiet: Object.freeze(['静']),
  compact: Object.freeze(['紧凑']),
  verbose: Object.freeze(['详尽']),
  benchmark: Object.freeze(['测', '准']),
  allow_multiple: Object.freeze(['多']),
  variable_target: Object.freeze(['变段', '变位']),
  binding: Object.freeze(['绑']),
  declarator: Object.freeze(['宣']),
  declaration: Object.freeze(['告']),
  effective: Object.freeze(['效']),
  help: Object.freeze(['助', '帮']),
  version: Object.freeze(['版']),
  discovery: Object.freeze(['探']),
  editing: Object.freeze(['编', '改']),
  guardrail: Object.freeze(['护栏']),
  guard_metadata: Object.freeze(['护元']),
  plan: Object.freeze(['计']),
  padding: Object.freeze(['垫']),
  mode: Object.freeze(['模']),
  chars: Object.freeze(['字']),
  within: Object.freeze(['中', '内', '其中']),
  selection: Object.freeze(['选区', '区']),
  window: Object.freeze(['窗']),
  module: Object.freeze(['模']),
  class: Object.freeze(['类']),
  command: Object.freeze(['令', '命']),
  option: Object.freeze(['项', '选']),
  args: Object.freeze(['参']),
  result: Object.freeze(['果']),
  status: Object.freeze(['态']),
  summary: Object.freeze(['要', '概']),
  stats: Object.freeze(['统']),
  guidance: Object.freeze(['导']),
  warning: Object.freeze(['警']),
  error: Object.freeze(['错']),
  success: Object.freeze(['成']),
  info: Object.freeze(['讯']),
  matches: Object.freeze(['匹']),
  match_count: Object.freeze(['匹数']),
  range: Object.freeze(['范围']),
  files_total: Object.freeze(['档总']),
  lines: Object.freeze(['行']),
  newlines: Object.freeze(['换行']),
  columns: Object.freeze(['列']),
  context_lines: Object.freeze(['邻行']),
  level: Object.freeze(['级']),
  min_level: Object.freeze(['低级']),
  max_level: Object.freeze(['高级']),
  imports: Object.freeze(['引']),
  exports: Object.freeze(['出']),
  exported_as: Object.freeze(['出名']),
  requires: Object.freeze(['需']),
  initializer: Object.freeze(['初值']),
  entries: Object.freeze(['项']),
  duration: Object.freeze(['时']),
  status_ok: Object.freeze(['安']),
  status_fail: Object.freeze(['败']),
  status_bypass: Object.freeze(['越']),
  status_mismatch: Object.freeze(['差']),
  status_skipped: Object.freeze(['略']),
  status_converted: Object.freeze(['转']),
  status_none: Object.freeze(['无']),
  status_unknown: Object.freeze(['未']),
  status_changed: Object.freeze(['变']),
  status_unchanged: Object.freeze(['稳']),
  pending: Object.freeze(['待', '等']),
  settings: Object.freeze(['设']),
  index: Object.freeze(['索']),
  entry_points: Object.freeze(['入口']),
  priority_files: Object.freeze(['优档']),
  pattern: Object.freeze(['型']),
  map_links: Object.freeze(['链图']),
  priority_only: Object.freeze(['优专']),
  case_sensitive: Object.freeze(['敏字']),
  deprecated: Object.freeze(['旧']),
  include_deprecated: Object.freeze(['含旧']),
  deprecated_only: Object.freeze(['旧专']),
  lang: Object.freeze(['语']),
  internal: Object.freeze(['内']),
  async: Object.freeze(['异']),
  generator: Object.freeze(['生']),
  view: Object.freeze(['视', '观']),
  fields: Object.freeze(['域']),
  source: Object.freeze(['源']),
  original: Object.freeze(['原']),
  updated: Object.freeze(['更']),
  actual: Object.freeze(['实']),
  anonymous_class: Object.freeze(['匿名类']),
  location: Object.freeze(['址']),
  base: Object.freeze(['基']),
  expanded_to: Object.freeze(['扩至']),
  follow_deps: Object.freeze(['依']),
  dependency_depth: Object.freeze(['层'])
});

const PRIMARY_ALIAS = Object.freeze(
  Object.fromEntries(
    Object.entries(RAW_LEXICON).map(([key, aliases]) => [key, aliases[0] || null])
  )
);

const ALIAS_TO_KEY = Object.freeze(
  Object.fromEntries(
    Object.entries(RAW_LEXICON).flatMap(([key, aliases]) => aliases.map((alias) => [alias, key]))
  )
);

const ALIAS_SET = new Set(Object.keys(ALIAS_TO_KEY));

const CHINESE_CHAR_PATTERN = /[\u3400-\u9FFF]/;

function getAliases(key) {
  const aliases = RAW_LEXICON[key];
  return Array.isArray(aliases) ? aliases : [];
}

function getPrimaryAlias(key) {
  return PRIMARY_ALIAS[key] || null;
}

function hasAlias(key, candidate) {
  if (!candidate) {
    return false;
  }
  const normalized = normalizeCandidate(candidate);
  return getAliases(key).includes(normalized);
}

function normalizeCandidate(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/^[-–—\s]+/, '').trim();
}

function isAlias(candidate) {
  if (!candidate) {
    return false;
  }
  const normalized = normalizeCandidate(candidate);
  return ALIAS_SET.has(normalized);
}

function lookupKeyForAlias(candidate) {
  if (!candidate) {
    return null;
  }
  const normalized = normalizeCandidate(candidate);
  return ALIAS_TO_KEY[normalized] || null;
}

function containsChineseGlyph(text) {
  if (typeof text !== 'string') {
    return false;
  }
  return CHINESE_CHAR_PATTERN.test(text);
}

function shouldUseChinese(inputTokens) {
  const tokens = Array.isArray(inputTokens) ? inputTokens : [inputTokens];
  for (const token of tokens) {
    if (isAlias(token) || containsChineseGlyph(token)) {
      return true;
    }
  }
  return false;
}

function formatLabel(key, options = {}) {
  const { english = key, chineseOnly = false, englishFirst = true } = options;
  const alias = getPrimaryAlias(key);
  if (!alias) {
    return english;
  }
  if (chineseOnly) {
    return alias;
  }
  if (englishFirst) {
    return `${english} (${alias})`;
  }
  return `${alias} (${english})`;
}

module.exports = {
  RAW_LEXICON,
  getAliases,
  getPrimaryAlias,
  hasAlias,
  isAlias,
  lookupKeyForAlias,
  containsChineseGlyph,
  shouldUseChinese,
  formatLabel,
  PRIMARY_ALIAS,
  ALIAS_TO_KEY,
  ALIAS_SET
};
