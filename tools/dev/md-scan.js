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
const {
  parseMarkdown,
  collectSections,
  collectCodeBlocks,
  computeMarkdownStats
} = require('./lib/markdownAst');

const fmt = new CliFormatter();

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
      // Escape special regex characters and add word boundaries for whole-word matching
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = `\\b${escapedTerm}\\b`;
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

/**
 * Display search results
 */
function displaySearchResults(results, terms, options = {}) {
  const totalFiles = results.length;
  const totalMatches = results.reduce((sum, r) => sum + r.totalMatches, 0);
  
  fmt.header(`Search Results (${terms.length} terms, ${totalFiles} files, ${totalMatches} matches)`);
  
  if (results.length === 0) {
    fmt.info('No matches found');
    fmt.blank();
    return;
  }
  
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const stars = '★'.repeat(Math.min(5, Math.ceil(result.totalMatches / 3)));
    const priority = result.hasPriority ? ' ⭐' : '';
    
    console.log(`\n${fmt.COLORS.cyan(`├─ ${result.relativePath}`)} ${fmt.COLORS.accent(stars)}${priority} ${fmt.COLORS.muted(`(${result.totalMatches} matches)`)}`);
    
    // Show matches per term
    for (const [term, matches] of Object.entries(result.termMatches)) {
      const lineRefs = matches.slice(0, 5).map(m => `L${m.line}`).join(', ');
      const more = matches.length > 5 ? `, ... ${matches.length - 5} more` : '';
      console.log(`${fmt.COLORS.muted('│  ├─')} "${term}" ${fmt.COLORS.muted(`(${matches.length} matches)`)} ${lineRefs}${more}`);
      
      // Show first match context if not compact
      if (!options.compact && matches.length > 0) {
        const context = matches[0].context.trim();
        const preview = context.length > 100 ? context.slice(0, 100) + '...' : context;
        console.log(`${fmt.COLORS.muted('│  │  ')}${preview}`);
      }
    }
    
    // Show matched sections
    if (result.matchedSections.size > 0) {
      const sectionList = Array.from(result.matchedSections).slice(0, 3).join(', ');
      const moreCount = result.matchedSections.size > 3 ? ` + ${result.matchedSections.size - 3} more` : '';
      console.log(`${fmt.COLORS.muted('│  └─ Sections:')} ${sectionList}${moreCount}`);
    }
  }
  
  fmt.blank();
}

/**
 * Display section finder results
 */
function displaySectionResults(results, patterns, options = {}) {
  const totalFiles = results.length;
  const totalSections = results.reduce((sum, r) => sum + r.sections.length, 0);
  
  fmt.header(`Section Search (${patterns.length} patterns, ${totalSections} sections in ${totalFiles} files)`);
  
  if (results.length === 0) {
    fmt.info('No matching sections found');
    fmt.blank();
    return;
  }
  
  for (const result of results) {
    const priority = result.hasPriority ? ' ⭐' : '';
    console.log(`\n${fmt.COLORS.cyan(`├─ ${result.relativePath}`)}${priority} ${fmt.COLORS.muted(`(${result.sections.length} sections)`)}`);
    
    for (const section of result.sections) {
      const levelPrefix = '  '.repeat(section.level - 1);
      console.log(`${fmt.COLORS.muted('│  ├─')} ${levelPrefix}${section.heading} ${fmt.COLORS.muted(`L${section.startLine}-${section.endLine}`)}`);
      
      if (!options.compact) {
        const preview = section.contentPreview.trim();
        if (preview) {
          console.log(`${fmt.COLORS.muted('│  │  ')}${preview}`);
        }
      }
    }
  }
  
  fmt.blank();
}

/**
 * Build and display document index
 */
function displayIndex(documents, options = {}) {
  fmt.header(`Documentation Index (${documents.length} files)`);
  
  // Group by priority
  const priorityDocs = documents.filter(d => d.metadata.hasPriorityMarker);
  const regularDocs = documents.filter(d => !d.metadata.hasPriorityMarker);
  
  if (priorityDocs.length > 0) {
    fmt.section('Priority Documents ⭐');
    for (const doc of priorityDocs) {
      const relPath = path.relative(process.cwd(), doc.filePath);
      const stars = '⭐'.repeat(Math.min(3, doc.metadata.priorityCount));
      const lines = doc.stats && doc.stats.totalLines ? doc.stats.totalLines : '?';
      const sectionCount = doc.sections ? doc.sections.length : 0;
      console.log(`  ${stars} ${relPath} ${fmt.COLORS.muted(`(${lines} lines, ${sectionCount} sections)`)}`);
    }
  }
  
  if (!options.priorityOnly) {
    fmt.section('All Documents');
    for (const doc of regularDocs) {
      const relPath = path.relative(process.cwd(), doc.filePath);
      const lines = doc.stats && doc.stats.totalLines ? doc.stats.totalLines : '?';
      const sectionCount = doc.sections ? doc.sections.length : 0;
      console.log(`  ${relPath} ${fmt.COLORS.muted(`(${lines} lines, ${sectionCount} sections)`)}`);
    }
  }
  
  fmt.blank();
  fmt.summary({
    'Total files': documents.length,
    'Priority files': priorityDocs.length,
    'Total sections': documents.reduce((sum, d) => sum + (d.sections ? d.sections.length : 0), 0),
    'Total lines': documents.reduce((sum, d) => sum + (d.stats && d.stats.totalLines ? d.stats.totalLines : 0), 0)
  });
}

function createCliParser() {
  const parser = new CliArgumentParser(
    'md-scan',
    'Multi-file Markdown documentation discovery tool'
  );

  parser
    // Input
    .add('--dir <path>', 'Directory to scan (default: current directory)', process.cwd())
    .add('--exclude <pattern>', 'Exclude paths containing pattern (can use multiple times)', [])
    
    // Operations (note: --search expects full terms as separate invocations)
    .add('--search <term...>', 'Search terms (space-separated or multiple --search flags)')
    .add('--find-sections <pattern...>', 'Find sections matching patterns')
    .add('--build-index', 'Build and display document index', false, 'boolean')
    .add('--map-links', 'Show cross-reference map', false, 'boolean')
    
    // Filters
    .add('--priority-only', 'Show only documents with priority markers (⭐)', false, 'boolean')
    .add('--case-sensitive', 'Use case-sensitive search', false, 'boolean')
    
    // Output
    .add('--search-limit <n>', 'Maximum search results to display', 20, 'number')
    .add('--compact', 'Use compact output format', false, 'boolean')
    .add('--json', 'Output results as JSON', false, 'boolean')
    .add('--verbose', 'Show detailed processing information', false, 'boolean');

  return parser;
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

  // Find all markdown files
  const dirPath = path.resolve(options.dir);
  
  if (!fs.existsSync(dirPath)) {
    fmt.error(`Directory not found: ${dirPath}`);
    process.exitCode = 1;
    return;
  }

  if (options.verbose) {
    fmt.info(`Scanning directory: ${dirPath}`);
  }

  const files = findMarkdownFiles(dirPath, options);
  
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
