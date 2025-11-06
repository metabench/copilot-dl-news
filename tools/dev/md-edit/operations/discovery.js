'use strict';

const { filterSectionsByPattern } = require('../../lib/markdownAst');
const { resolveLanguageContext, translateLabelWithMode } = require('../../i18n/helpers');

/**
 * List all sections with optional filtering
 */
function listSections(sections, options, fmt) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;
  let filtered = sections;

  // Apply filters
  if (options.match) {
    filtered = filterSectionsByPattern(filtered, options.match, false);
  }

  if (options.exclude) {
    filtered = filterSectionsByPattern(filtered, options.exclude, true);
  }

  if (options.level) {
    filtered = filtered.filter(s => s.level === options.level);
  }

  if (options.minLevel) {
    filtered = filtered.filter(s => s.level >= options.minLevel);
  }

  if (options.maxLevel) {
    filtered = filtered.filter(s => s.level <= options.maxLevel);
  }

  if (options.json) {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }

  const headerTitle = isChinese
    ? `${translateLabelWithMode(fmt, language, 'section', 'sections')}:${filtered.length}`
    : `Found ${filtered.length} section(s)`;
  fmt.header(headerTitle);
  
  filtered.forEach((section, idx) => {
    const indent = '  '.repeat(section.level - 1);
    const levelMarker = `[H${section.level}]`;
    const lineInfo = isChinese
      ? `(${translateLabelWithMode(fmt, language, 'span', 'range')}:${section.startLine}-${section.endLine}, ${translateLabelWithMode(fmt, language, 'lines', 'lines')}:${section.lineCount})`
      : `(L${section.startLine}-${section.endLine}, ${section.lineCount} lines)`;
    const hashInfo = options.verbose ? ` ${section.hash}` : '';
    
    console.log(`${indent}${levelMarker} ${section.heading} ${lineInfo}${hashInfo}`);
  });
}

/**
 * List all code blocks
 */
function listCodeBlocks(codeBlocks, options, fmt) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;
  if (options.json) {
    console.log(JSON.stringify(codeBlocks, null, 2));
    return;
  }

  const headerTitle = isChinese
    ? `${translateLabelWithMode(fmt, language, 'code', 'Code')}${translateLabelWithMode(fmt, language, 'block', 'Block')}:${codeBlocks.length}`
    : `Found ${codeBlocks.length} code block(s)`;
  fmt.header(headerTitle);

  codeBlocks.forEach((block, idx) => {
    const lang = block.language || 'text';
    const lineInfo = `L${block.startLine}-${block.endLine}`;
    const sizeInfo = isChinese
      ? `(${translateLabelWithMode(fmt, language, 'lines', 'lines')}:${block.lineCount})`
      : `(${block.lineCount} lines)`;
    
    console.log(`${idx + 1}. [${lang}] ${lineInfo} ${sizeInfo}`);
    
    if (options.verbose) {
      const preview = block.content.split('\n').slice(0, 3).join('\n');
      console.log(`   ${preview}`);
      if (block.lineCount > 3) {
        console.log(isChinese
          ? `   ... (${translateLabelWithMode(fmt, language, 'lines', 'lines')}:${block.lineCount - 3})`
          : `   ... (${block.lineCount - 3} more lines)`);
      }
    }
  });
}

/**
 * Show document outline (headings only)
 */
function showOutline(sections, options, fmt) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;
  if (options.json) {
    const outline = sections.map(s => ({
      level: s.level,
      heading: s.heading,
      lineNumber: s.startLine
    }));
    console.log(JSON.stringify(outline, null, 2));
    return;
  }

  const headerTitle = isChinese
    ? `${translateLabelWithMode(fmt, language, 'document', 'Doc')}${translateLabelWithMode(fmt, language, 'outline', 'Outline')}`
    : 'Document Outline';
  fmt.header(headerTitle);
  
  sections.forEach(section => {
    const indent = '  '.repeat(section.level - 1);
    const bullet = ['', '•', '◦', '▪', '▫', '·', '‣'][section.level] || '-';
    const lineNum = `L${section.startLine}`;
    
    console.log(`${indent}${bullet} ${section.heading} ${lineNum}`);
  });
}

/**
 * Display document statistics
 */
function showStats(stats, filename, options, fmt) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;
  if (options.json) {
    console.log(JSON.stringify({ filename, stats }, null, 2));
    return;
  }

  const headerTitle = isChinese
    ? `${translateLabelWithMode(fmt, language, 'stats', 'Stats')}:${filename}`
    : `Statistics: ${filename}`;
  fmt.header(headerTitle);
  
  const lineLabel = translateLabelWithMode(fmt, language, 'lines', 'lines');
  const wordsLabel = translateLabelWithMode(fmt, language, 'words', 'words');
  const sectionLabel = translateLabelWithMode(fmt, language, 'section', 'sections');
  console.log(`${translateLabelWithMode(fmt, language, 'total', 'Total')} ${lineLabel}:      ${stats.totalLines}`);
  console.log(`  ${translateLabelWithMode(fmt, language, 'prose', 'Prose')} ${lineLabel}:    ${stats.proseLines}`);
  console.log(`  ${translateLabelWithMode(fmt, language, 'code', 'Code')} ${lineLabel}:     ${stats.codeLines}`);
  console.log(`${translateLabelWithMode(fmt, language, 'total', 'Total')} ${wordsLabel}:      ${stats.totalWords}`);
  console.log(`${translateLabelWithMode(fmt, language, 'total', 'Total')} ${sectionLabel}:   ${stats.totalSections}`);
  
  if (Object.keys(stats.sectionsByLevel).length > 0) {
    console.log(`\n${sectionLabel} by level:`);
    for (let level = 1; level <= 6; level++) {
      const count = stats.sectionsByLevel[level] || 0;
      if (count > 0) {
        console.log(`  H${level}: ${count}`);
      }
    }
  }
  
  const codeBlockLabel = `${translateLabelWithMode(fmt, language, 'code', 'Code')} ${translateLabelWithMode(fmt, language, 'block', 'Block')}`;
  console.log(`\n${codeBlockLabel}:      ${stats.codeBlocks}`);
  console.log(`Avg section size: ${stats.avgSectionLength} ${lineLabel}`);
}

/**
 * Search content with context
 */
function searchContent(source, sections, options, fmt) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;
  const pattern = options.search;
  const regex = new RegExp(pattern, 'gi');
  const lines = source.split('\n');
  const results = [];

  lines.forEach((line, lineNum) => {
    if (regex.test(line)) {
      // Find which section this line belongs to
      const section = sections.find(s => 
        lineNum >= s.startLine && lineNum < s.endLine
      );

      results.push({
        lineNum: lineNum + 1,
        line,
        section: section ? section.heading : null,
        sectionLevel: section ? section.level : null
      });
    }
  });

  const limited = results.slice(0, options.searchLimit || 20);

  if (options.json) {
    console.log(JSON.stringify({ pattern, total: results.length, results: limited }, null, 2));
    return;
  }

  const headerTitle = isChinese
    ? `${translateLabelWithMode(fmt, language, 'search', 'Search')}:"${pattern}" (${translateLabelWithMode(fmt, language, 'match_count', 'matches')}:${results.length})`
    : `Search: "${pattern}" (${results.length} match${results.length !== 1 ? 'es' : ''})`;
  fmt.header(headerTitle);

  if (limited.length === 0) {
    fmt.warn(isChinese ? '无匹' : 'No matches found');
    return;
  }

  limited.forEach(result => {
    const lineInfo = `L${result.lineNum}`;
    const sectionInfo = result.section 
      ? `[${result.section}]`
      : '';
    
    console.log(`${lineInfo} ${sectionInfo}`);
    console.log(`  ${result.line.trim()}`);
  });

  if (results.length > limited.length) {
    fmt.info(isChinese
      ? `… ${results.length - limited.length} 余 (用 --search-limit 展开)`
      : `... and ${results.length - limited.length} more results (use --search-limit to show more)`);
  }
}

/**
 * Search only in section headings
 */
function searchHeadings(sections, options, fmt) {
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;
  const pattern = options.searchHeadings;
  const regex = new RegExp(pattern, 'i');
  const matches = sections.filter(s => regex.test(s.heading));

  if (options.json) {
    console.log(JSON.stringify({ pattern, matches }, null, 2));
    return;
  }

  const headerTitle = isChinese
    ? `${translateLabelWithMode(fmt, language, 'search', 'Search')} 标题:"${pattern}" (${translateLabelWithMode(fmt, language, 'match_count', 'matches')}:${matches.length})`
    : `Heading search: "${pattern}" (${matches.length} match${matches.length !== 1 ? 'es' : ''})`;
  fmt.header(headerTitle);

  if (matches.length === 0) {
    fmt.warn(isChinese ? '无匹' : 'No matches found');
    return;
  }

  matches.forEach(section => {
    const levelMarker = `[H${section.level}]`;
    const lineInfo = `L${section.startLine}`;
    const hashInfo = options.verbose ? ` ${section.hash}` : '';
    
    console.log(`${levelMarker} ${section.heading} ${lineInfo}${hashInfo}`);
  });
}

module.exports = {
  listSections,
  listCodeBlocks,
  showOutline,
  showStats,
  searchContent,
  searchHeadings
};
