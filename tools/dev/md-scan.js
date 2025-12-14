#!/usr/bin/env node
'use strict';

/**
 * md-scan: Multi-file Markdown documentation discovery tool
 * 
 * Helps AI agents and developers quickly find relevant documentation across
 * large doc sets without reading everything.
 * 
 * Features:
 * - Multi-term search with relevance ranking
 * - Section-level discovery across files
 * - Priority-aware filtering (⭐ markers)
 * - Cross-reference detection
 * - Metadata extraction ("When to Read", frontmatter)
 */

// Fix PowerShell encoding for Unicode box-drawing characters
const { setupPowerShellEncoding } = require('./shared/powershellEncoding');
setupPowerShellEncoding();

const fs = require('fs');
const path = require('path');
const { CliFormatter } = require('../../src/utils/CliFormatter');
const { CliArgumentParser } = require('../../src/utils/CliArgumentParser');
const { translateCliArgs } = require('./i18n/dialect');
const { extractLangOption, deriveLanguageModeHint } = require('./i18n/language');
const { resolveLanguageContext, translateLabelWithMode, joinTranslatedLabels } = require('./i18n/helpers');
const { getPrimaryAlias } = require('./i18n/lexicon');
const {
  parseMarkdown,
  collectSections,
  collectCodeBlocks,
  computeMarkdownStats
} = require('./lib/markdownAst');

const fmt = new CliFormatter();

function decodeEncodedSearchTerm(term) {
  if (typeof term !== 'string') {
    return term;
  }

  const trimmed = term.trim();
  const b16Match = trimmed.match(/^(?:b16|hex):(.+)$/i);
  if (b16Match) {
    const rawHex = b16Match[1].replace(/\s+/g, '').replace(/^0x/i, '');
    if (!rawHex) {
      throw new Error('Invalid b16: search term: empty payload');
    }
    if (rawHex.length % 2 !== 0) {
      throw new Error(`Invalid b16: search term: expected even-length hex, got ${rawHex.length}`);
    }
    if (!/^[0-9a-f]+$/i.test(rawHex)) {
      throw new Error('Invalid b16: search term: payload must be hex');
    }
    return Buffer.from(rawHex, 'hex').toString('utf8');
  }

  const b64Match = trimmed.match(/^(?:b64|base64):(.+)$/i);
  if (b64Match) {
    const rawBase64 = b64Match[1].trim().replace(/\s+/g, '');
    if (!rawBase64) {
      throw new Error('Invalid b64: search term: empty payload');
    }
    const normalized = rawBase64.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(normalized, 'base64').toString('utf8');
  }

  return term;
}

function shouldUseWordBoundaries(term) {
  if (typeof term !== 'string') {
    return false;
  }

  // Only apply \b...\b when the token is purely word-like.
  // This keeps emoji/punctuation searches reliable (\b does not behave as expected for them).
  return /^[A-Za-z0-9_]+$/.test(term);
}

function buildEmojiRegex() {
  // Prefer Unicode property escapes (handles many emoji sequences); fall back to a coarse range regex.
  try {
    return new RegExp(
      '(?:' +
        // Flags
        '\\p{Regional_Indicator}{2}' +
        '|' +
        // Keycaps
        '[0-9#*]\\uFE0F?\\u20E3' +
        '|' +
        // ZWJ sequences + modifiers
        '\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?(?:\\p{Emoji_Modifier})?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?(?:\\p{Emoji_Modifier})?)*' +
      ')',
      'gu'
    );
  } catch {
    // Covers many common emoji blocks, but will miss complex sequences.
    return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  }
}

function buildLineIndex(source) {
  const lineStarts = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') {
      lineStarts.push(i + 1);
    }
  }

  function locate(offset) {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const start = lineStarts[mid];
      const nextStart = mid + 1 < lineStarts.length ? lineStarts[mid + 1] : source.length + 1;
      if (offset < start) {
        high = mid - 1;
      } else if (offset >= nextStart) {
        low = mid + 1;
      } else {
        return { line: mid + 1, column: offset - start + 1 };
      }
    }
    return { line: 1, column: offset + 1 };
  }

  return { locate };
}

const CHINESE_HELP_ROWS = Object.freeze([
  { flag: '--dir', lexKey: 'path', note: '径: 设定目录' },
  { flag: '--search', lexKey: 'search', note: '搜: 多词检索' },
  { flag: '--find-sections', lexKey: 'find_sections', note: '搜节: 按标题匹配' },
  { flag: '--build-index', lexKey: 'index', note: '索: 输出索引' },
  { flag: '--map-links', lexKey: 'map_links', note: '链图: 引用图谱' },
  { flag: '--priority-only', lexKey: 'priority_only', note: '优专: 仅⭐文件' },
  { flag: '--lang', lexKey: 'lang', note: '语: en/zh/bi' }
]);

const CHINESE_HELP_EXAMPLES = Object.freeze([
  'node tools/dev/md-scan.js --径 docs --搜 planner roadmap',
  'node tools/dev/md-scan.js --径 docs --搜 节点 --优专 --紧凑'
]);

function resolveAliasLabel(lexKey) {
  const alias = getPrimaryAlias(lexKey);
  return alias ? `--${alias}` : '';
}

function printChineseHelp(languageMode) {
  fmt.header(languageMode === 'bilingual' ? 'md-scan 助理 (英/中)' : 'md-scan 中文速查');
  fmt.info('核心命令与别名');
  CHINESE_HELP_ROWS.forEach((row) => {
    const aliasLabel = resolveAliasLabel(row.lexKey);
    const flagDisplay = fmt.COLORS.cyan(row.flag.padEnd(18));
    const aliasDisplay = aliasLabel ? fmt.COLORS.accent(aliasLabel.padEnd(10)) : fmt.COLORS.muted(''.padEnd(10));
    console.log(`${flagDisplay} ${aliasDisplay} ${row.note}`);
  });
  fmt.section('示例');
  CHINESE_HELP_EXAMPLES.forEach((example) => {
    console.log(`  ${fmt.COLORS.muted(example)}`);
  });
  fmt.blank();
  console.log(fmt.COLORS.muted('提示: 任意中文别名会启用中文模式 (--语 zh 可强制)'));
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

/**
 * Recursively find all .md files in a directory
 */
function findMarkdownFiles(dirPath, options = {}) {
  const results = [];
  const exclude = options.exclude || [];
  
  function scan(currentPath) {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(dirPath, fullPath);
        
        // Skip excluded patterns
        if (exclude.some(pattern => relativePath.includes(pattern))) {
          continue;
        }
        
        if (entry.isDirectory()) {
          // Skip node_modules, .git, etc.
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            scan(fullPath);
          }
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          results.push(fullPath);
        }
      }
    } catch (error) {
      if (options.verbose) {
        fmt.warn(`Cannot read directory ${currentPath}: ${error.message}`);
      }
    }
  }
  
  scan(dirPath);
  return results;
}

/**
 * Parse a markdown file and extract searchable content
 */
function parseDocumentFile(filePath, options = {}) {
  try {
    const source = fs.readFileSync(filePath, 'utf8');
    const ast = parseMarkdown(source);
    const sections = collectSections(ast, source);
    const codeBlocks = collectCodeBlocks(ast);
    const stats = computeMarkdownStats(source, sections, codeBlocks);
    
    // Extract metadata
    const metadata = extractMetadata(source, sections);
    
    // Extract links
    const links = extractLinks(source);
    
    return {
      filePath,
      source,
      ast,
      sections,
      codeBlocks,
      stats,
      metadata,
      links
    };
  } catch (error) {
    if (options.verbose) {
      fmt.error(`Failed to parse ${filePath}: ${error.message}`);
    }
    return null;
  }
}

/**
 * Extract metadata from document (frontmatter, "When to Read", priority markers)
 */
function extractMetadata(source, sections) {
  const metadata = {
    frontmatter: null,
    whenToRead: null,
    hasPriorityMarker: false,
    priorityCount: 0
  };
  
  // Extract YAML frontmatter
  const frontmatterMatch = source.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    metadata.frontmatter = frontmatterMatch[1];
  }
  
  // Find "When to Read" section
  const whenToReadSection = sections.find(s => 
    /when to read/i.test(s.heading)
  );
  if (whenToReadSection) {
    metadata.whenToRead = whenToReadSection.content.slice(0, 200);
  }
  
  // Count priority markers
  metadata.priorityCount = (source.match(/⭐/g) || []).length;
  metadata.hasPriorityMarker = metadata.priorityCount > 0;
  
  return metadata;
}

/**
 * Extract markdown links from source
 */
function extractLinks(source) {
  const links = [];
  // Match [text](url) and [text](url "title")
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  
  while ((match = linkRegex.exec(source)) !== null) {
    links.push({
      text: match[1],
      url: match[2],
      line: source.substring(0, match.index).split('\n').length
    });
  }
  
  return links;
}

/**
 * Search for multiple terms across document set
 */
function multiTermSearch(documents, terms, options = {}) {
  const results = [];
  const caseSensitive = options.caseSensitive || false;
  const searchLimit = options.searchLimit || 20;
  
  for (const doc of documents) {
    const matches = {
      filePath: doc.filePath,
      relativePath: path.relative(process.cwd(), doc.filePath),
      totalMatches: 0,
      termMatches: {},
      matchedSections: new Set(),
      hasPriority: doc.metadata.hasPriorityMarker,
      priorityCount: doc.metadata.priorityCount
    };
    
    for (const term of terms) {
      if (!term) {
        continue;
      }

      // Escape special regex characters; only apply word boundaries for word-like tokens.
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = shouldUseWordBoundaries(term) ? `\\b${escapedTerm}\\b` : escapedTerm;
      const regex = new RegExp(
        pattern,
        caseSensitive ? 'g' : 'gi'
      );
      
      const termMatches = [];
      let match;
      
      while ((match = regex.exec(doc.source)) !== null) {
        const line = doc.source.substring(0, match.index).split('\n').length;
        
        // Find which section this match is in
        const section = doc.sections.find(s => 
          line >= s.startLine && line <= s.endLine
        );
        
        if (section) {
          matches.matchedSections.add(section.heading);
        }
        
        // Extract context (50 chars before and after)
        const start = Math.max(0, match.index - 50);
        const end = Math.min(doc.source.length, match.index + match[0].length + 50);
        const context = doc.source.substring(start, end).replace(/\n/g, ' ');
        
        termMatches.push({
          line,
          context,
          sectionHeading: section ? section.heading : '(no section)'
        });
        
        matches.totalMatches++;
      }
      
      if (termMatches.length > 0) {
        matches.termMatches[term] = termMatches;
      }
    }
    
    if (matches.totalMatches > 0) {
      results.push(matches);
    }
  }
  
  // Sort by relevance: total matches, then priority markers
  results.sort((a, b) => {
    if (b.totalMatches !== a.totalMatches) {
      return b.totalMatches - a.totalMatches;
    }
    return b.priorityCount - a.priorityCount;
  });
  
  return results.slice(0, searchLimit);
}

/**
 * Find sections by heading pattern across all documents
 */
function findSections(documents, patterns, options = {}) {
  const results = [];
  
  for (const doc of documents) {
    const matchedSections = [];
    
    for (const section of doc.sections) {
      for (const pattern of patterns) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(section.heading)) {
          matchedSections.push({
            heading: section.heading,
            level: section.level,
            startLine: section.startLine,
            endLine: section.endLine,
            contentPreview: section.content.slice(0, 150).replace(/\n/g, ' ')
          });
          break; // Only count each section once
        }
      }
    }
    
    if (matchedSections.length > 0) {
      results.push({
        filePath: doc.filePath,
        relativePath: path.relative(process.cwd(), doc.filePath),
        sections: matchedSections,
        hasPriority: doc.metadata.hasPriorityMarker
      });
    }
  }
  
  // Sort by priority first, then by number of matched sections
  results.sort((a, b) => {
    if (a.hasPriority !== b.hasPriority) {
      return b.hasPriority ? 1 : -1;
    }
    return b.sections.length - a.sections.length;
  });
  
  return results;
}

function findEmojiInventory(documents, options = {}) {
  const occurrenceLimit = typeof options.emojiOccurrenceLimit === 'number' ? options.emojiOccurrenceLimit : 25;
  const emojiRegex = buildEmojiRegex();

  const byEmoji = new Map();
  let totalMatches = 0;

  for (const doc of documents) {
    const relPath = path.relative(process.cwd(), doc.filePath);
    const lineIndex = buildLineIndex(doc.source);
    emojiRegex.lastIndex = 0;

    let match;
    while ((match = emojiRegex.exec(doc.source)) !== null) {
      const emoji = match[0];
      const offset = match.index;
      const { line, column } = lineIndex.locate(offset);
      totalMatches += 1;

      let entry = byEmoji.get(emoji);
      if (!entry) {
        const utf8 = Buffer.from(emoji, 'utf8');
        entry = {
          emoji,
          count: 0,
          utf8Hex: utf8.toString('hex'),
          utf8Base64: utf8.toString('base64'),
          codepoints: Array.from(emoji).map((ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase()}`),
          occurrences: []
        };
        byEmoji.set(emoji, entry);
      }

      entry.count += 1;
      if (entry.occurrences.length < occurrenceLimit) {
        entry.occurrences.push({ relativePath: relPath, line, column });
      }
    }
  }

  const emojis = Array.from(byEmoji.values()).sort((a, b) => b.count - a.count);
  return {
    operation: 'find-emojis',
    scannedFiles: documents.length,
    uniqueEmojis: emojis.length,
    totalMatches,
    occurrenceLimit,
    emojis
  };
}

/**
 * Display search results
 */
function displaySearchResults(results, terms, options = {}) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;
  const totalFiles = results.length;
  const totalMatches = results.reduce((sum, r) => sum + r.totalMatches, 0);

  const headerLabel = joinTranslatedLabels(fmt, language, [
    { key: 'search', fallback: 'Search' },
    { key: 'result', fallback: 'Results' }
  ]);

  if (isChinese) {
    fmt.header(headerLabel);
    const summaryLine = [
      `${translateLabelWithMode(fmt, language, 'search_text', 'terms')}:${terms.length}`,
      `${translateLabelWithMode(fmt, language, 'files_total', 'files')}:${totalFiles}`,
      `${translateLabelWithMode(fmt, language, 'match_count', 'matches')}:${totalMatches}`
    ].join(' ');
    fmt.info(fmt.COLORS.muted(summaryLine));
  } else {
    fmt.header(`Search Results (${terms.length} terms, ${totalFiles} files, ${totalMatches} matches)`);
  }

  if (results.length === 0) {
    fmt.info(isChinese ? '无匹' : 'No matches found');
    fmt.blank();
    return;
  }

  results.forEach((result) => {
    const stars = '★'.repeat(Math.min(5, Math.ceil(result.totalMatches / 3)));
    const priorityMark = result.hasPriority ? ' ⭐' : '';
    const matchSummary = isChinese
      ? fmt.COLORS.muted(`(${translateLabelWithMode(fmt, language, 'match_count', 'matches')}:${result.totalMatches})`)
      : fmt.COLORS.muted(`(${result.totalMatches} matches)`);
    console.log(`\n${fmt.COLORS.cyan(`├─ ${result.relativePath}`)} ${fmt.COLORS.accent(stars)}${priorityMark} ${matchSummary}`);

    for (const [term, matches] of Object.entries(result.termMatches)) {
      const lineRefs = matches.slice(0, 5).map((m) => `L${m.line}`).join(', ');
      const more = matches.length > 5
        ? isChinese
          ? `, … ${matches.length - 5}`
          : `, ... ${matches.length - 5} more`
        : '';
      const countDisplay = isChinese
        ? `${translateLabelWithMode(fmt, language, 'match_count', 'matches')}:${matches.length}`
        : `(${matches.length} matches)`;
      console.log(`${fmt.COLORS.muted('│  ├─')} "${term}" ${fmt.COLORS.muted(countDisplay)} ${lineRefs}${more}`.trim());

      if (!options.compact && matches.length > 0) {
        const context = matches[0].context.trim();
        const preview = context.length > 100 ? `${context.slice(0, 100)}...` : context;
        console.log(`${fmt.COLORS.muted('│  │  ')}${preview}`);
      }
    }

    if (result.matchedSections.size > 0) {
      const sectionList = Array.from(result.matchedSections).slice(0, 3).join(isChinese ? '、' : ', ');
      const moreCount = result.matchedSections.size > 3
        ? isChinese
          ? ` + ${result.matchedSections.size - 3}`
          : ` + ${result.matchedSections.size - 3} more`
        : '';
      const sectionLabel = isChinese ? '节' : 'Sections';
      console.log(`${fmt.COLORS.muted('│  └─')} ${sectionLabel}: ${sectionList}${moreCount}`.trim());
    }
  });

  fmt.blank();
}

/**
 * Display section finder results
 */
function displaySectionResults(results, patterns, options = {}) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;
  const totalFiles = results.length;
  const totalSections = results.reduce((sum, r) => sum + r.sections.length, 0);

  const headerLabel = joinTranslatedLabels(fmt, language, [
    { key: 'section', fallback: 'Section' },
    { key: 'search', fallback: 'Search' }
  ]);

  if (isChinese) {
    fmt.header(headerLabel);
    const summaryLine = [
      `${translateLabelWithMode(fmt, language, 'pattern', 'patterns')}:${patterns.length}`,
      `${translateLabelWithMode(fmt, language, 'match_count', 'matches')}:${totalSections}`,
      `${translateLabelWithMode(fmt, language, 'files_total', 'files')}:${totalFiles}`
    ].join(' ');
    fmt.info(fmt.COLORS.muted(summaryLine));
  } else {
    fmt.header(`Section Search (${patterns.length} patterns, ${totalSections} sections in ${totalFiles} files)`);
  }

  if (results.length === 0) {
    fmt.info(isChinese ? '无节匹' : 'No matching sections found');
    fmt.blank();
    return;
  }

  results.forEach((result) => {
    const priority = result.hasPriority ? ' ⭐' : '';
    const sectionCountLabel = isChinese
      ? `${translateLabelWithMode(fmt, language, 'section', 'sections')}:${result.sections.length}`
      : `(${result.sections.length} sections)`;
    console.log(`\n${fmt.COLORS.cyan(`├─ ${result.relativePath}`)}${priority} ${fmt.COLORS.muted(sectionCountLabel)}`);

    result.sections.forEach((section) => {
      const levelPrefix = '  '.repeat(section.level - 1);
      const rangeLabel = isChinese
        ? `${translateLabelWithMode(fmt, language, 'span', 'range')}:${section.startLine}-${section.endLine}`
        : `L${section.startLine}-${section.endLine}`;
      console.log(`${fmt.COLORS.muted('│  ├─')} ${levelPrefix}${section.heading} ${fmt.COLORS.muted(rangeLabel)}`);

      if (!options.compact) {
        const preview = section.contentPreview.trim();
        if (preview) {
          console.log(`${fmt.COLORS.muted('│  │  ')}${preview}`);
        }
      }
    });
  });

  fmt.blank();
}

/**
 * Build and display document index
 */
function displayIndex(documents, options = {}) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;

  const headerTitle = isChinese
    ? `${translateLabelWithMode(fmt, language, 'document', 'Docs')}${translateLabelWithMode(fmt, language, 'index', 'Index')}`
    : `Documentation Index (${documents.length} files)`;
  fmt.header(headerTitle);

  const priorityDocs = documents.filter((d) => d.metadata.hasPriorityMarker);
  const regularDocs = documents.filter((d) => !d.metadata.hasPriorityMarker);

  if (priorityDocs.length > 0) {
    const priorityLabel = isChinese ? '优档 ⭐' : 'Priority Documents ⭐';
    fmt.section(priorityLabel);
    priorityDocs.forEach((doc) => {
      const relPath = path.relative(process.cwd(), doc.filePath);
      const stars = '⭐'.repeat(Math.min(3, doc.metadata.priorityCount));
      const lines = doc.stats && doc.stats.totalLines ? doc.stats.totalLines : '?';
      const sectionCount = doc.sections ? doc.sections.length : 0;
      const detail = isChinese
        ? `${translateLabelWithMode(fmt, language, 'lines', 'lines')}:${lines} ${translateLabelWithMode(fmt, language, 'section', 'sections')}:${sectionCount}`
        : `(${lines} lines, ${sectionCount} sections)`;
      console.log(`  ${stars} ${relPath} ${fmt.COLORS.muted(detail)}`);
    });
  }

  if (!options.priorityOnly) {
    const allLabel = isChinese ? '全档' : 'All Documents';
    fmt.section(allLabel);
    regularDocs.forEach((doc) => {
      const relPath = path.relative(process.cwd(), doc.filePath);
      const lines = doc.stats && doc.stats.totalLines ? doc.stats.totalLines : '?';
      const sectionCount = doc.sections ? doc.sections.length : 0;
      const detail = isChinese
        ? `${translateLabelWithMode(fmt, language, 'lines', 'lines')}:${lines} ${translateLabelWithMode(fmt, language, 'section', 'sections')}:${sectionCount}`
        : `(${lines} lines, ${sectionCount} sections)`;
      console.log(`  ${relPath} ${fmt.COLORS.muted(detail)}`);
    });
  }

  fmt.blank();
  const summaryData = {
    [isChinese ? `${translateLabelWithMode(fmt, language, 'files_total', 'files')}` : 'Total files']: documents.length,
    [isChinese ? `${translateLabelWithMode(fmt, language, 'priority_files', 'Priority files')}` : 'Priority files']: priorityDocs.length,
    [isChinese ? `${translateLabelWithMode(fmt, language, 'section', 'sections')}${translateLabelWithMode(fmt, language, 'total', ' total')}` : 'Total sections']:
      documents.reduce((sum, d) => sum + (d.sections ? d.sections.length : 0), 0),
    [isChinese ? `${translateLabelWithMode(fmt, language, 'lines', 'lines')}${translateLabelWithMode(fmt, language, 'total', ' total')}` : 'Total lines']:
      documents.reduce((sum, d) => sum + (d.stats && d.stats.totalLines ? d.stats.totalLines : 0), 0)
  };
  fmt.summary(summaryData);
}

function createCliParser() {
  const parser = new CliArgumentParser(
    'md-scan',
    'Multi-file Markdown documentation discovery tool'
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
    // Input
    .add('--dir <path>', 'Directory to scan (default: current directory)', process.cwd())
    .add('--exclude <pattern>', 'Exclude paths containing pattern (can use multiple times)', [])
    
    // Operations (note: --search expects full terms as separate invocations)
    .add('--search <term...>', 'Search terms (space-separated or multiple --search flags)')
    .add('--find-sections <pattern...>', 'Find sections matching patterns')
    .add('--find-emojis', 'Find all emojis in scanned markdown files', false, 'boolean')
    .add('--build-index', 'Build and display document index', false, 'boolean')
    .add('--map-links', 'Show cross-reference map', false, 'boolean')
    
    // Filters
    .add('--priority-only', 'Show only documents with priority markers (⭐)', false, 'boolean')
    .add('--case-sensitive', 'Use case-sensitive search', false, 'boolean')
    .add('--guide', 'Search only in docs/guides/ (fast satellite lookup)', false, 'boolean')
    
    // Output
    .add('--search-limit <n>', 'Maximum search results to display', 20, 'number')
    .add('--emoji-occurrence-limit <n>', 'Max locations stored per emoji (for --find-emojis)', 25, 'number')
    .add('--compact', 'Use compact output format', false, 'boolean')
    .add('--json', 'Output results as JSON', false, 'boolean')
    .add('--verbose', 'Show detailed processing information', false, 'boolean');

  return parser;
}

async function main() {
  const parser = createCliParser();
  const originalTokens = process.argv.slice(2);
  const translation = translateCliArgs('md-scan', originalTokens);
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

  // Normalize exclude patterns to array
  if (typeof options.exclude === 'string') {
    options.exclude = [options.exclude];
  }
  
  // Normalize search terms to array (handle both space-separated and array input)
  if (options.search) {
    if (typeof options.search === 'string') {
      options.search = [options.search];
    } else if (!Array.isArray(options.search)) {
      options.search = [];
    }
  } else {
    options.search = [];
  }

  try {
    options.search = options.search.map(decodeEncodedSearchTerm);
  } catch (error) {
    fmt.error(error.message || String(error));
    process.exitCode = 1;
    return;
  }
  
  // Normalize find-sections patterns
  if (options.findSections) {
    if (typeof options.findSections === 'string') {
      options.findSections = [options.findSections];
    } else if (!Array.isArray(options.findSections)) {
      options.findSections = [];
    }
  } else {
    options.findSections = [];
  }

  try {
    options.findSections = options.findSections.map(decodeEncodedSearchTerm);
  } catch (error) {
    fmt.error(error.message || String(error));
    process.exitCode = 1;
    return;
  }

  // Find all markdown files
  const dirPath = path.resolve(options.dir);
  
  // Handle --guide shortcut: search only in docs/guides/
  if (options.guide) {
    const guidesPath = path.resolve(process.cwd(), 'docs', 'guides');
    if (fs.existsSync(guidesPath)) {
      options.dir = guidesPath;
      if (options.verbose) {
        fmt.info(`--guide flag: Restricting search to ${guidesPath}`);
      }
    } else {
      fmt.warn(`docs/guides/ not found, searching in ${dirPath} instead`);
    }
  }
  
  const effectiveDirPath = options.guide && fs.existsSync(path.resolve(process.cwd(), 'docs', 'guides')) 
    ? path.resolve(process.cwd(), 'docs', 'guides')
    : dirPath;
  
  if (!fs.existsSync(effectiveDirPath)) {
    fmt.error(`Directory not found: ${effectiveDirPath}`);
    process.exitCode = 1;
    return;
  }

  if (options.verbose) {
    fmt.info(`Scanning directory: ${effectiveDirPath}`);
  }

  const files = findMarkdownFiles(effectiveDirPath, options);
  
  if (files.length === 0) {
    fmt.warn('No markdown files found');
    process.exitCode = 1;
    return;
  }

  if (options.verbose) {
    fmt.info(`Found ${files.length} markdown files`);
  }

  // Parse all documents
  const documents = files
    .map(f => parseDocumentFile(f, options))
    .filter(d => d !== null);

  if (documents.length === 0) {
    fmt.error('Failed to parse any documents');
    process.exitCode = 1;
    return;
  }

  // Execute operations
  if (options.findEmojis) {
    if (options.search.length > 0 || options.findSections.length > 0 || options.buildIndex || options.mapLinks) {
      fmt.error('Operation flags are mutually exclusive. Use only one of --search, --find-sections, --find-emojis, --build-index, --map-links.');
      process.exitCode = 1;
      return;
    }

    const inventory = findEmojiInventory(documents, options);
    if (options.json) {
      console.log(JSON.stringify(inventory, null, 2));
    } else {
      fmt.header('Emoji Inventory');
      fmt.summary({
        'Scanned files': inventory.scannedFiles,
        'Unique emojis': inventory.uniqueEmojis,
        'Total matches': inventory.totalMatches,
        'Occurrences stored per emoji': inventory.occurrenceLimit
      });

      const limit = options.searchLimit || 20;
      const slice = inventory.emojis.slice(0, limit);
      slice.forEach((entry) => {
        const first = entry.occurrences[0];
        const loc = first ? `${first.relativePath}:${first.line}:${first.column}` : '';
        console.log(`  ${entry.emoji}  ${fmt.COLORS.muted(`count=${entry.count}`)}  ${fmt.COLORS.muted(entry.utf8Hex)}  ${fmt.COLORS.muted(loc)}`);
      });
      if (inventory.emojis.length > slice.length) {
        fmt.blank();
        fmt.info(`Showing first ${slice.length} of ${inventory.emojis.length} emojis (use --search-limit to adjust)`);
      }
    }
    return;
  }

  if (options.search.length > 0) {
    const results = multiTermSearch(documents, options.search, options);
    
    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      displaySearchResults(results, options.search, options);
    }
    return;
  }

  if (options.findSections.length > 0) {
    const results = findSections(documents, options.findSections, options);
    
    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      displaySectionResults(results, options.findSections, options);
    }
    return;
  }

  if (options.buildIndex) {
    if (options.json) {
      const index = documents.map(d => ({
        filePath: d.filePath,
        relativePath: path.relative(process.cwd(), d.filePath),
        sections: d.sections.map(s => ({
          heading: s.heading,
          level: s.level,
          startLine: s.startLine,
          endLine: s.endLine
        })),
        stats: d.stats,
        metadata: d.metadata,
        links: d.links
      }));
      console.log(JSON.stringify(index, null, 2));
    } else {
      displayIndex(documents, options);
    }
    return;
  }

  if (options.mapLinks) {
    // Build reference graph
    const graph = {};
    
    for (const doc of documents) {
      const relPath = path.relative(process.cwd(), doc.filePath);
      graph[relPath] = {
        outgoing: doc.links.filter(l => l.url.endsWith('.md')).map(l => l.url),
        priority: doc.metadata.hasPriorityMarker
      };
    }
    
    if (options.json) {
      console.log(JSON.stringify(graph, null, 2));
    } else {
      fmt.header('Cross-Reference Map');
      
      for (const [file, data] of Object.entries(graph)) {
        if (data.outgoing.length > 0) {
          const priority = data.priority ? ' ⭐' : '';
          console.log(`\n${fmt.COLORS.cyan(file)}${priority}`);
          for (const link of data.outgoing) {
            console.log(`  ${fmt.COLORS.muted('├─→')} ${link}`);
          }
        }
      }
      fmt.blank();
    }
    return;
  }

  // Default: show index
  displayIndex(documents, options);
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
  findMarkdownFiles,
  parseDocumentFile,
  multiTermSearch,
  findSections,
  extractMetadata,
  extractLinks
};
