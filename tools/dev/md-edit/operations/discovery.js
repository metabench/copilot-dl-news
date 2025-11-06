'use strict';

const { filterSectionsByPattern } = require('../../lib/markdownAst');

/**
 * List all sections with optional filtering
 */
function listSections(sections, options, fmt) {
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

  fmt.header(`Found ${filtered.length} section(s)`);
  
  filtered.forEach((section, idx) => {
    const indent = '  '.repeat(section.level - 1);
    const levelMarker = `[H${section.level}]`;
    const lineInfo = `(L${section.startLine}-${section.endLine}, ${section.lineCount} lines)`;
    const hashInfo = options.verbose ? ` ${section.hash}` : '';
    
    console.log(`${indent}${levelMarker} ${section.heading} ${lineInfo}${hashInfo}`);
  });
}

/**
 * List all code blocks
 */
function listCodeBlocks(codeBlocks, options, fmt) {
  if (options.json) {
    console.log(JSON.stringify(codeBlocks, null, 2));
    return;
  }

  fmt.header(`Found ${codeBlocks.length} code block(s)`);

  codeBlocks.forEach((block, idx) => {
    const lang = block.language || 'text';
    const lineInfo = `L${block.startLine}-${block.endLine}`;
    const sizeInfo = `(${block.lineCount} lines)`;
    
    console.log(`${idx + 1}. [${lang}] ${lineInfo} ${sizeInfo}`);
    
    if (options.verbose) {
      const preview = block.content.split('\n').slice(0, 3).join('\n');
      console.log(`   ${preview}`);
      if (block.lineCount > 3) {
        console.log(`   ... (${block.lineCount - 3} more lines)`);
      }
    }
  });
}

/**
 * Show document outline (headings only)
 */
function showOutline(sections, options, fmt) {
  if (options.json) {
    const outline = sections.map(s => ({
      level: s.level,
      heading: s.heading,
      lineNumber: s.startLine
    }));
    console.log(JSON.stringify(outline, null, 2));
    return;
  }

  fmt.header('Document Outline');
  
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
  if (options.json) {
    console.log(JSON.stringify({ filename, stats }, null, 2));
    return;
  }

  fmt.header(`Statistics: ${filename}`);
  
  console.log(`Total lines:      ${stats.totalLines}`);
  console.log(`  Prose lines:    ${stats.proseLines}`);
  console.log(`  Code lines:     ${stats.codeLines}`);
  console.log(`Total words:      ${stats.totalWords}`);
  console.log(`Total sections:   ${stats.totalSections}`);
  
  if (Object.keys(stats.sectionsByLevel).length > 0) {
    console.log(`\nSections by level:`);
    for (let level = 1; level <= 6; level++) {
      const count = stats.sectionsByLevel[level] || 0;
      if (count > 0) {
        console.log(`  H${level}: ${count}`);
      }
    }
  }
  
  console.log(`\nCode blocks:      ${stats.codeBlocks}`);
  console.log(`Avg section size: ${stats.avgSectionLength} lines`);
}

/**
 * Search content with context
 */
function searchContent(source, sections, options, fmt) {
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

  fmt.header(`Search: "${pattern}" (${results.length} match${results.length !== 1 ? 'es' : ''})`);

  if (limited.length === 0) {
    fmt.warn('No matches found');
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
    fmt.info(`... and ${results.length - limited.length} more results (use --search-limit to show more)`);
  }
}

/**
 * Search only in section headings
 */
function searchHeadings(sections, options, fmt) {
  const pattern = options.searchHeadings;
  const regex = new RegExp(pattern, 'i');
  const matches = sections.filter(s => regex.test(s.heading));

  if (options.json) {
    console.log(JSON.stringify({ pattern, matches }, null, 2));
    return;
  }

  fmt.header(`Heading search: "${pattern}" (${matches.length} match${matches.length !== 1 ? 'es' : ''})`);

  if (matches.length === 0) {
    fmt.warn('No matches found');
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
