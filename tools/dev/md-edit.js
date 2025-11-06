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
const { CliFormatter } = require('../../src/utils/CliFormatter');
const { CliArgumentParser } = require('../../src/utils/CliArgumentParser');
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

function createCliParser() {
  const parser = new CliArgumentParser(
    'md-edit',
    'Manage and refactor Markdown documentation with precision'
  );

  // Discovery operations
  parser
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
    .add('--fix', 'Write changes to file (default is dry-run preview)', false, 'boolean')

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

  return errors;
}

async function main() {
  const parser = createCliParser();
  let options;

  try {
    options = parser.parse(process.argv.slice(2));
  } catch (error) {
    fmt.error(error.message || String(error));
    process.exitCode = 1;
    return;
  }

  const validationErrors = validateOptions(options);
  if (validationErrors.length > 0) {
    validationErrors.forEach((err) => fmt.error(err));
    process.exitCode = 1;
    return;
  }

  const positional = options.positional || [];
  const inputFile = positional[0];

  if (!inputFile) {
    fmt.error('Usage: md-edit <file.md> [options]');
    fmt.info('Run with --help for usage information');
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
