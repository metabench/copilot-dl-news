#!/usr/bin/env node
'use strict';

/**
 * md-edit: CLI tool for managing and refactoring Markdown documentation
 * 
 * Architecture mirrors js-edit:
 * - Discovery operations: list sections, search content, extract by pattern
 * - Context operations: show section with neighbors, emit plans
 * - Mutation operations: remove sections, replace content, reorder
 * 
 * Uses markdown-it for parsing with custom state tracking for section boundaries
 */

// Fix PowerShell encoding for Unicode box-drawing characters
const { setupPowerShellEncoding } = require('./shared/powershellEncoding');
setupPowerShellEncoding();

const path = require('path');
const fs = require('fs');
const { CliFormatter } = require('../../src/shared/utils/CliFormatter');
const { CliArgumentParser } = require('../../src/shared/utils/CliArgumentParser');
const { translateCliArgs } = require('./i18n/dialect');
const { extractLangOption, deriveLanguageModeHint } = require('./i18n/language');
const { getPrimaryAlias } = require('./i18n/lexicon');
const {
  parseMarkdown,
  collectSections,
  collectCodeBlocks,
  extractSection,
  removeSection,
  replaceSection,
  createSectionHash,
  computeMarkdownStats
} = require('./lib/markdownAst');
const discoveryOperations = require('./md-edit/operations/discovery');
const contextOperations = require('./md-edit/operations/context');
const mutationOperations = require('./md-edit/operations/mutation');
const {
  readSource,
  writeOutputFile,
  outputJson
} = require('./md-edit/shared/io');

const fmt = new CliFormatter();
const DEFAULT_SEARCH_LIMIT = 20;
const DEFAULT_CONTEXT_LINES = 5;
const DEFAULT_PREVIEW_LINES = 10;
const DEFAULT_BATCH_MAX_FILES = 500;
const DEFAULT_DIFF_CONTEXT_LINES = 3;

const CHINESE_HELP_ROWS = Object.freeze([
  { flag: '--list-sections', lexKey: 'list_sections', note: '节列: 标题清单' },
  { flag: '--stats', lexKey: 'stats', note: '统: 文档统计' },
  { flag: '--search', lexKey: 'search', note: '搜: 全文检索' },
  { flag: '--search-headings', lexKey: 'search_headings', note: '搜题: 只搜标题' },
  { flag: '--show-section', lexKey: 'show_section', note: '显节: 展示片段' },
  { flag: '--replace-section', lexKey: 'replace_section', note: '替节: 结合 --以/--以档' },
  { flag: '--lang', lexKey: 'lang', note: '语: en/zh/bi' }
]);

const CHINESE_HELP_EXAMPLES = Object.freeze([
  'node tools/dev/md-edit.js docs/AGENTS.md --节列 --紧凑',
  'node tools/dev/md-edit.js docs/AGENTS.md --替节 "Validation" --以档 replacements/validation.md --改'
]);

function resolveAliasLabel(lexKey) {
  const alias = getPrimaryAlias(lexKey);
  return alias ? `--${alias}` : '';
}

function printChineseHelp(languageMode) {
  fmt.header(languageMode === 'bilingual' ? 'md-edit 助理 (英/中)' : 'md-edit 中文速查');
  fmt.info('核心命令与别名');
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
  console.log(fmt.COLORS.muted('提示: 中文别名自动启用精简模式 (--语 zh 可强制)'));
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
  }
}

function createCliParser() {
  const parser = new CliArgumentParser(
    'md-edit',
    'Manage and refactor Markdown documentation with precision'
  );

  const program = parser.getProgram();
  if (program && typeof program.helpOption === 'function') {
    program.helpOption(false);
  }
  if (program && typeof program.addHelpCommand === 'function') {
    program.addHelpCommand(false);
  }

  // Discovery operations
  parser
    .add('--help', 'Show this help message', false, 'boolean')
    .add('--lang <code>', 'Output language (en, zh, bilingual, auto)', 'auto')
    .add('--list-sections', 'List all sections (headings) in the document', false, 'boolean')
    .add('--list-code-blocks', 'List all code blocks with language tags', false, 'boolean')
    .add('--outline', 'Show document outline (headings only)', false, 'boolean')
    .add('--stats', 'Display document statistics (lines, sections, words)', false, 'boolean')
    .add('--search <pattern>', 'Search for text patterns in the document')
    .add('--search-headings <pattern>', 'Search only in section headings')
    .add('--search-limit <n>', 'Maximum search results to display', DEFAULT_SEARCH_LIMIT, 'number')
    .add('--match <pattern>', 'Filter sections by heading pattern (glob)')
    .add('--exclude <pattern>', 'Exclude sections by heading pattern (glob)')
    .add('--level <n>', 'Filter sections by heading level (1-6)', null, 'number')
    .add('--min-level <n>', 'Minimum heading level to include', null, 'number')
    .add('--max-level <n>', 'Maximum heading level to include', null, 'number')

  // Context operations
    .add('--show-section <selector>', 'Display a specific section by heading or hash')
    .add('--context-lines <n>', 'Lines of context before/after selections', DEFAULT_CONTEXT_LINES, 'number')
    .add('--with-neighbors', 'Include neighboring sections in context', false, 'boolean')
    .add('--emit-plan <path>', 'Save section metadata plan (JSON) for batch operations')

  // Mutation operations
    .add('--remove-section <selector>', 'Remove a section by heading or hash')
    .add('--extract-section <selector>', 'Extract a section to stdout or --output')
    .add('--replace-section <selector>', 'Replace a section with content from --with or --with-file')
    .add('--with <text>', 'Replacement text for mutation operations')
    .add('--with-file <path>', 'Read replacement content from file')
    .add('--expect-hash <hash>', 'Guard: require section hash to match before mutation')
    .add('--allow-multiple', 'Allow operations on multiple matching sections', false, 'boolean')
    .add('--allow-missing', 'Treat missing section as a no-op (batch-safe)', false, 'boolean')
    .add('--fix', 'Write changes to file (default is dry-run preview)', false, 'boolean')

  // Batch options (mutation-only)
    .add('--dir <path>', 'Batch: apply mutation ops to all .md files under directory')
    .add('--include-path <pattern>', 'Batch: include only files whose relative path contains this substring (comma-separated)')
    .add('--exclude-path <pattern>', 'Batch: exclude files whose relative path contains this substring (comma-separated)')
    .add('--max-files <n>', 'Batch: maximum number of files to process', DEFAULT_BATCH_MAX_FILES, 'number')
    .add('--emit-manifest <path>', 'Batch: write per-file results manifest JSON')
    .add('--emit-diff', 'Include unified diffs in output (batch + single-file previews)', false, 'boolean')
    .add('--diff-context <n>', 'Unified diff context lines', DEFAULT_DIFF_CONTEXT_LINES, 'number')
    .add('--max-diffs <n>', 'Batch: maximum diffs to print (still stored in manifest/json)', 10, 'number')
    .add('--diff-max-lines <n>', 'Diff truncation: maximum lines per diff', 500, 'number')
    .add('--diff-max-chars <n>', 'Diff truncation: maximum characters per diff', 20000, 'number')

  // I/O options
    .add('--output <path>', 'Write result to file instead of stdout')
    .add('--json', 'Output results as JSON', false, 'boolean')
    .add('--compact', 'Use compact output format', false, 'boolean')
    .add('--verbose', 'Show detailed processing information', false, 'boolean');

  return parser;
}

function validateOptions(options) {
  const errors = [];

  if (options.level && (options.level < 1 || options.level > 6)) {
    errors.push('--level must be between 1 and 6');
  }

  if (options.minLevel && (options.minLevel < 1 || options.minLevel > 6)) {
    errors.push('--min-level must be between 1 and 6');
  }

  if (options.maxLevel && (options.maxLevel < 1 || options.maxLevel > 6)) {
    errors.push('--max-level must be between 1 and 6');
  }

  if (options.minLevel && options.maxLevel && options.minLevel > options.maxLevel) {
    errors.push('--min-level cannot be greater than --max-level');
  }

  if (options.replaceSection && !options.with && !options.withFile) {
    errors.push('--replace-section requires --with or --with-file');
  }

  if (options.with && options.withFile) {
    errors.push('Cannot use both --with and --with-file');
  }

  const mutationOps = [
    options.removeSection,
    options.extractSection,
    options.replaceSection
  ].filter(Boolean);

  if (mutationOps.length > 1) {
    errors.push('Cannot combine multiple mutation operations');
  }

  if (options.expectHash && mutationOps.length === 0) {
    errors.push('--expect-hash requires a mutation operation');
  }

  if (options.fix && mutationOps.length === 0) {
    errors.push('--fix requires a mutation operation');
  }

  if (options.dir && mutationOps.length === 0) {
    errors.push('--dir is only supported with a mutation operation');
  }

  if (options.emitManifest && !options.dir) {
    errors.push('--emit-manifest requires --dir (batch mode)');
  }

  if (options.emitDiff && mutationOps.length === 0) {
    errors.push('--emit-diff requires a mutation operation');
  }

  if (options.maxFiles !== null && options.maxFiles !== undefined) {
    const max = Number(options.maxFiles);
    if (!Number.isFinite(max) || max <= 0) {
      errors.push('--max-files must be a positive number');
    }
  }

  if (options.diffContext !== null && options.diffContext !== undefined) {
    const ctx = Number(options.diffContext);
    if (!Number.isFinite(ctx) || ctx < 0 || ctx > 20) {
      errors.push('--diff-context must be between 0 and 20');
    }
  }

  if (options.maxDiffs !== null && options.maxDiffs !== undefined) {
    const maxDiffs = Number(options.maxDiffs);
    if (!Number.isFinite(maxDiffs) || maxDiffs < 0) {
      errors.push('--max-diffs must be a non-negative number');
    }
  }

  if (options.diffMaxLines !== null && options.diffMaxLines !== undefined) {
    const maxLines = Number(options.diffMaxLines);
    if (!Number.isFinite(maxLines) || maxLines <= 0) {
      errors.push('--diff-max-lines must be a positive number');
    }
  }

  if (options.diffMaxChars !== null && options.diffMaxChars !== undefined) {
    const maxChars = Number(options.diffMaxChars);
    if (!Number.isFinite(maxChars) || maxChars <= 0) {
      errors.push('--diff-max-chars must be a positive number');
    }
  }

  return errors;
}

function findMarkdownFiles(dirPath, options = {}) {
  const results = [];

  function scan(currentPath) {
    let entries;
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') {
          continue;
        }
        scan(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        results.push(fullPath);
      }
    }
  }

  scan(dirPath);
  if (options.sort !== false) {
    results.sort();
  }
  return results;
}

function splitPatterns(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveBatchFiles(options) {
  const dirRoot = path.resolve(process.cwd(), options.dir);
  const include = splitPatterns(options.includePath);
  const exclude = splitPatterns(options.excludePath);
  const maxFiles = Number(options.maxFiles || DEFAULT_BATCH_MAX_FILES);

  let files = findMarkdownFiles(dirRoot);

  files = files.filter((filePath) => {
    const rel = path.relative(dirRoot, filePath).replace(/\\/g, '/');
    if (include.length > 0 && !include.some((p) => rel.includes(p))) {
      return false;
    }
    if (exclude.length > 0 && exclude.some((p) => rel.includes(p))) {
      return false;
    }
    return true;
  });

  if (files.length > maxFiles) {
    throw new Error(`Batch resolved ${files.length} files, exceeding --max-files ${maxFiles}`);
  }

  return { dirRoot, files };
}

async function main() {
  const parser = createCliParser();
  const originalTokens = process.argv.slice(2);
  const translation = translateCliArgs('md-edit', originalTokens);
  const langOverride = extractLangOption(translation.argv);
  const languageHint = deriveLanguageModeHint(langOverride, translation);
  fmt.setLanguageMode(languageHint);

  let options;

  try {
    options = parser.parse(translation.argv);
  } catch (error) {
    fmt.error(error.message || String(error));
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    printHelpOutput(languageHint, parser);
    return;
  }

  options.lang = langOverride || options.lang || 'auto';
  options.languageMode = fmt.getLanguageMode();
  options._i18n = translation;

  const validationErrors = validateOptions(options);
  if (validationErrors.length > 0) {
    validationErrors.forEach((err) => fmt.error(err));
    process.exitCode = 1;
    return;
  }

  const positional = options.positional || [];
  const inputFile = positional[0];

  const batchFromPositionals = positional.length > 1;

  if (!inputFile && !options.dir) {
    fmt.error('Usage: md-edit <file.md> [options]');
    fmt.info('Run with --help for usage information');
    process.exitCode = 1;
    return;
  }

  if (options.dir) {
    // Batch mode (directory)
    try {
      const { dirRoot, files } = resolveBatchFiles(options);

      if (options.removeSection) {
        await mutationOperations.removeSectionBatch(files, { ...options, _batch: { dirRoot } }, fmt);
        return;
      }

      if (options.replaceSection) {
        await mutationOperations.replaceSectionBatch(files, { ...options, _batch: { dirRoot } }, fmt);
        return;
      }

      if (options.extractSection) {
        fmt.error('--extract-section is not supported with --dir (batch mode)');
        process.exitCode = 1;
        return;
      }
    } catch (error) {
      fmt.error(error.message || String(error));
      process.exitCode = 1;
      return;
    }
  }

  if (batchFromPositionals) {
    fmt.error('Batch mode from multiple positional files is not implemented yet; use --dir for batch mutations.');
    process.exitCode = 1;
    return;
  }

  let source;
  try {
    source = readSource(inputFile);
  } catch (error) {
    fmt.error(`Failed to read ${inputFile}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  let ast, sections, codeBlocks;
  try {
    ast = parseMarkdown(source);
    sections = collectSections(ast, source);
    codeBlocks = collectCodeBlocks(ast);
  } catch (error) {
    fmt.error(`Failed to parse ${inputFile}: ${error.message}`);
    if (options.verbose && error.stack) {
      fmt.error(error.stack);
    }
    process.exitCode = 1;
    return;
  }

  // Discovery operations
  if (options.listSections) {
    discoveryOperations.listSections(sections, options, fmt);
    return;
  }

  if (options.listCodeBlocks) {
    discoveryOperations.listCodeBlocks(codeBlocks, options, fmt);
    return;
  }

  if (options.outline) {
    discoveryOperations.showOutline(sections, options, fmt);
    return;
  }

  if (options.stats) {
    const stats = computeMarkdownStats(source, sections, codeBlocks);
    discoveryOperations.showStats(stats, inputFile, options, fmt);
    return;
  }

  if (options.search) {
    discoveryOperations.searchContent(source, sections, options, fmt);
    return;
  }

  if (options.searchHeadings) {
    discoveryOperations.searchHeadings(sections, options, fmt);
    return;
  }

  // Context operations
  if (options.showSection) {
    contextOperations.showSection(source, sections, options, fmt);
    return;
  }

  if (options.emitPlan) {
    contextOperations.emitPlan(sections, options, fmt);
    return;
  }

  // Mutation operations
  if (options.removeSection) {
    await mutationOperations.removeSection(source, sections, inputFile, options, fmt);
    return;
  }

  if (options.extractSection) {
    await mutationOperations.extractSection(source, sections, options, fmt);
    return;
  }

  if (options.replaceSection) {
    await mutationOperations.replaceSection(source, sections, inputFile, options, fmt);
    return;
  }

  // Default: show stats
  const stats = computeMarkdownStats(source, sections, codeBlocks);
  discoveryOperations.showStats(stats, inputFile, options, fmt);
}

if (require.main === module) {
  main().catch((error) => {
    fmt.error(error.message || String(error));
    if (error.stack) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  });
}

module.exports = {
  createCliParser,
  validateOptions
};

