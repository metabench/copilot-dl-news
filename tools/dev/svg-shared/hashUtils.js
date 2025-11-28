#!/usr/bin/env node
'use strict';

/**
 * SVG Hash Utilities
 * 
 * Provides short hash digests for SVG elements to enable efficient referencing.
 * Similar pattern to js-scan/js-edit but optimized for SVG document structure.
 * 
 * Hash format: 8-character base64 digest (same as js-edit)
 * Example: "xK9mPqL2" uniquely identifies an SVG element
 * 
 * Usage:
 *   const { createElementHash, buildElementIndex } = require('./svg-shared/hashUtils');
 *   const hash = createElementHash(element, lineNumber);
 *   const index = buildElementIndex(svgContent);
 */

const crypto = require('crypto');

// Hash configuration (matches js-edit for consistency)
const HASH_BYTE_LENGTH = 8;
const HASH_ENCODING = 'base64';
const HASH_LENGTH = Math.ceil(HASH_BYTE_LENGTH / 3) * 4; // 12 chars for base64

// Shorter hash for display (6 chars is enough for most SVGs)
const SHORT_HASH_LENGTH = 6;

/**
 * Create a SHA-256 based hash digest
 * @param {string} text - Content to hash
 * @param {number} length - Output length (default: SHORT_HASH_LENGTH)
 * @returns {string} Hash digest
 */
function createDigest(text, length = SHORT_HASH_LENGTH) {
  const hash = crypto.createHash('sha256').update(text, 'utf8').digest('base64');
  // Make URL-safe by replacing + and /
  return hash.replace(/\+/g, '-').replace(/\//g, '_').slice(0, length);
}

/**
 * Create a hash for an SVG element based on its content and position
 * @param {Object} options - Element info
 * @param {string} options.tagName - Element tag name
 * @param {string} options.content - Element's outer XML or significant attributes
 * @param {number} options.line - Line number in source
 * @param {string} [options.id] - Element's id attribute if present
 * @returns {string} 6-character hash
 */
function createElementHash({ tagName, content, line, id }) {
  // If element has an id, use a deterministic hash based on id + tag
  // This ensures the same element gets the same hash across runs
  if (id) {
    return createDigest(`${tagName}#${id}`, SHORT_HASH_LENGTH);
  }
  
  // For elements without id, include line number for disambiguation
  // Use first 200 chars of content to keep hash stable but unique
  const contentSample = (content || '').slice(0, 200);
  return createDigest(`${tagName}:${line}:${contentSample}`, SHORT_HASH_LENGTH);
}

/**
 * Extract line number from a character position in text
 * @param {string} text - Full text content
 * @param {number} charIndex - Character index
 * @returns {number} 1-based line number
 */
function getLineNumber(text, charIndex) {
  if (charIndex <= 0) return 1;
  const beforeText = text.slice(0, charIndex);
  return (beforeText.match(/\n/g) || []).length + 1;
}

/**
 * Build a line index for fast line number lookups
 * @param {string} text - Full text content
 * @returns {number[]} Array of character positions where each line starts
 */
function buildLineIndex(text) {
  const lineStarts = [0];
  let pos = 0;
  while ((pos = text.indexOf('\n', pos)) !== -1) {
    lineStarts.push(pos + 1);
    pos++;
  }
  return lineStarts;
}

/**
 * Get line number using a pre-built line index (O(log n) binary search)
 * @param {number[]} lineIndex - Line start positions
 * @param {number} charIndex - Character index
 * @returns {number} 1-based line number
 */
function getLineFromIndex(lineIndex, charIndex) {
  let low = 0;
  let high = lineIndex.length - 1;
  
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (lineIndex[mid] <= charIndex) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  
  return low + 1; // 1-based
}

/**
 * Get column number (1-based) from character position
 * @param {number[]} lineIndex - Line start positions
 * @param {number} charIndex - Character index
 * @returns {number} 1-based column number
 */
function getColumnFromIndex(lineIndex, charIndex) {
  const lineNum = getLineFromIndex(lineIndex, charIndex);
  const lineStart = lineIndex[lineNum - 1] || 0;
  return charIndex - lineStart + 1;
}

/**
 * Element record with hash and location info
 * @typedef {Object} ElementRecord
 * @property {string} hash - 6-char hash digest
 * @property {string} tagName - Element tag name
 * @property {string|null} id - Element id attribute
 * @property {number} line - 1-based line number
 * @property {number} column - 1-based column number
 * @property {number} startPos - Character position of opening tag
 * @property {number} endPos - Character position after closing tag
 * @property {string} path - CSS-like path (e.g., "svg > g:nth-of-type(2) > rect")
 * @property {string} [textContent] - For text elements, the text content
 * @property {Object} [bbox] - Bounding box if computed
 */

/**
 * Element index for fast lookups
 * @typedef {Object} ElementIndex
 * @property {Map<string, ElementRecord>} byHash - Lookup by hash
 * @property {Map<number, ElementRecord[]>} byLine - Lookup by line number
 * @property {Map<string, ElementRecord[]>} byTag - Lookup by tag name
 * @property {Map<string, ElementRecord>} byId - Lookup by element id
 * @property {Map<string, ElementRecord>} byPath - Lookup by CSS path
 * @property {ElementRecord[]} all - All elements in document order
 * @property {number[]} lineIndex - Line start positions
 */

/**
 * Build element index from DOM node (xmldom or browser DOM)
 * @param {Element} root - Root SVG element from DOM parser
 * @param {Object} [lineMap] - Optional line number mapping
 * @returns {ElementIndex} Element index
 */
function buildElementIndexFromDOM(root, lineMap = null) {
  const byHash = new Map();
  const byLine = new Map();
  const byTag = new Map();
  const byId = new Map();
  const byPath = new Map();
  const all = [];
  
  let tagStartIndex = 0; // Track position in lineMap.tagStarts
  
  function processNode(node, pathStack, tagCounts) {
    if (node.nodeType !== 1) return; // Only process element nodes
    
    const tagName = node.tagName || node.nodeName;
    if (!tagName || tagName.startsWith('#')) return;
    
    // Count siblings of same tag type at this level
    const siblingCount = (tagCounts.get(tagName) || 0) + 1;
    tagCounts.set(tagName, siblingCount);
    
    // Build CSS-like path
    const pathPart = siblingCount > 1
      ? `${tagName}:nth-of-type(${siblingCount})`
      : tagName;
    const path = [...pathStack, pathPart].join(' > ');
    
    // Get id
    const id = node.getAttribute && node.getAttribute('id');
    
    // Get text content for text elements
    let textPreview = null;
    if (tagName === 'text' || tagName === 'tspan') {
      textPreview = (node.textContent || '').trim().replace(/<[^>]+>/g, '').slice(0, 50);
    }
    
    // Estimate line number from lineMap if available
    let line = null;
    if (lineMap && lineMap.tagStarts) {
      // Find the matching tag start
      while (tagStartIndex < lineMap.tagStarts.length) {
        const tagInfo = lineMap.tagStarts[tagStartIndex];
        if (tagInfo.tag === tagName) {
          line = tagInfo.line;
          tagStartIndex++;
          break;
        }
        tagStartIndex++;
      }
    }
    
    // Collect attributes
    const attributes = {};
    if (node.attributes) {
      for (let i = 0; i < node.attributes.length; i++) {
        const attr = node.attributes[i];
        attributes[attr.name] = attr.value;
      }
    }
    
    // Create hash based on element content
    const hash = createElementHash({
      tagName,
      content: path + JSON.stringify(attributes),
      line: line || 0,
      id
    });
    
    const record = {
      hash,
      tagName,
      id,
      line,
      path,
      textPreview,
      attributes
    };
    
    // Add to indexes
    byHash.set(hash, record);
    
    if (line) {
      if (!byLine.has(line)) byLine.set(line, []);
      byLine.get(line).push(record);
    }
    
    if (!byTag.has(tagName)) byTag.set(tagName, []);
    byTag.get(tagName).push(record);
    
    if (id) byId.set(id, record);
    byPath.set(path, record);
    
    all.push(record);
    
    // Process children
    const childCounts = new Map();
    const children = node.childNodes || [];
    for (let i = 0; i < children.length; i++) {
      processNode(children[i], [...pathStack, pathPart], childCounts);
    }
  }
  
  processNode(root, [], new Map());
  
  return {
    byHash,
    byLine,
    byTag,
    byId,
    byPath,
    all,
    getAll: () => all,
    stats: {
      totalElements: all.length,
      uniqueTags: byTag.size,
      elementsWithId: byId.size
    }
  };
}

/**
 * Parse SVG and build element index with hashes
 * Uses regex-based parsing for speed (no DOM needed for indexing)
 * @param {string|Element} svgContentOrElement - Raw SVG content or DOM element
 * @param {Object} [lineMap] - Optional line number mapping (for DOM mode)
 * @returns {ElementIndex} Element index
 */
function buildElementIndex(svgContentOrElement, lineMap = null) {
  // If it's a DOM element, use DOM-based indexing
  if (typeof svgContentOrElement !== 'string') {
    return buildElementIndexFromDOM(svgContentOrElement, lineMap);
  }
  
  const svgContent = svgContentOrElement;
  const lineIndex = buildLineIndex(svgContent);
  
  const byHash = new Map();
  const byLine = new Map();
  const byTag = new Map();
  const byId = new Map();
  const byPath = new Map();
  const all = [];
  
  // Track path components for CSS-like paths
  const pathStack = [];
  const tagCounts = [new Map()]; // Stack of sibling counts per depth
  
  // Regex to find opening and self-closing tags
  const tagRegex = /<(\/?)([\w:-]+)([^>]*?)(\/?)>/g;
  let match;
  
  while ((match = tagRegex.exec(svgContent)) !== null) {
    const [fullMatch, isClosing, tagName, attrs, isSelfClosing] = match;
    const startPos = match.index;
    const line = getLineFromIndex(lineIndex, startPos);
    const column = getColumnFromIndex(lineIndex, startPos);
    
    if (isClosing) {
      // Closing tag - pop from path stack
      pathStack.pop();
      tagCounts.pop();
      continue;
    }
    
    // Opening or self-closing tag
    // Count siblings of same tag type
    const currentCounts = tagCounts[tagCounts.length - 1];
    const siblingCount = (currentCounts.get(tagName) || 0) + 1;
    currentCounts.set(tagName, siblingCount);
    
    // Build CSS-like path
    const pathPart = siblingCount > 1 
      ? `${tagName}:nth-of-type(${siblingCount})`
      : tagName;
    const path = [...pathStack, pathPart].join(' > ');
    
    // Extract id attribute
    const idMatch = attrs.match(/\bid=["']([^"']+)["']/);
    const id = idMatch ? idMatch[1] : null;
    
    // Extract text content for text elements
    let textContent = null;
    if (tagName === 'text' || tagName === 'tspan') {
      const closeTagPos = svgContent.indexOf(`</${tagName}>`, startPos);
      if (closeTagPos !== -1) {
        const innerStart = startPos + fullMatch.length;
        textContent = svgContent.slice(innerStart, closeTagPos).trim();
        // Remove nested tags
        textContent = textContent.replace(/<[^>]+>/g, '').trim();
      }
    }
    
    // Create element record
    const hash = createElementHash({
      tagName,
      content: fullMatch + (textContent || ''),
      line,
      id
    });
    
    const record = {
      hash,
      tagName,
      id,
      line,
      column,
      startPos,
      endPos: startPos + fullMatch.length,
      path,
      textContent,
      attrs: attrs.trim()
    };
    
    // Add to indexes
    byHash.set(hash, record);
    
    if (!byLine.has(line)) byLine.set(line, []);
    byLine.get(line).push(record);
    
    if (!byTag.has(tagName)) byTag.set(tagName, []);
    byTag.get(tagName).push(record);
    
    if (id) byId.set(id, record);
    byPath.set(path, record);
    
    all.push(record);
    
    // If not self-closing, push to path stack
    if (!isSelfClosing) {
      pathStack.push(pathPart);
      tagCounts.push(new Map());
    }
  }
  
  return {
    byHash,
    byLine,
    byTag,
    byId,
    byPath,
    all,
    lineIndex,
    stats: {
      totalElements: all.length,
      uniqueTags: byTag.size,
      elementsWithId: byId.size,
      lineCount: lineIndex.length
    }
  };
}

/**
 * Find element by hash (exact match)
 * @param {ElementIndex} index - Element index
 * @param {string} hash - Hash to find
 * @returns {ElementRecord|null} Element record or null
 */
function findByHash(index, hash) {
  return index.byHash.get(hash) || null;
}

/**
 * Find elements by partial hash (prefix match)
 * @param {ElementIndex} index - Element index
 * @param {string} hashPrefix - Hash prefix (2+ chars)
 * @returns {ElementRecord[]} Matching elements
 */
function findByHashPrefix(index, hashPrefix) {
  if (hashPrefix.length < 2) return [];
  
  const matches = [];
  for (const [hash, record] of index.byHash) {
    if (hash.startsWith(hashPrefix)) {
      matches.push(record);
    }
  }
  return matches;
}

/**
 * Find elements by line number
 * @param {ElementIndex} index - Element index
 * @param {number} line - Line number (1-based)
 * @returns {ElementRecord[]} Elements on that line
 */
function findByLine(index, line) {
  return index.byLine.get(line) || [];
}

/**
 * Find elements by line range
 * @param {ElementIndex} index - Element index
 * @param {number} startLine - Start line (1-based, inclusive)
 * @param {number} endLine - End line (1-based, inclusive)
 * @returns {ElementRecord[]} Elements in range
 */
function findByLineRange(index, startLine, endLine) {
  const results = [];
  for (let line = startLine; line <= endLine; line++) {
    const elements = index.byLine.get(line);
    if (elements) results.push(...elements);
  }
  return results;
}

/**
 * Find elements by tag name
 * @param {ElementIndex} index - Element index
 * @param {string} tagName - Tag name
 * @returns {ElementRecord[]} Elements with that tag
 */
function findByTag(index, tagName) {
  return index.byTag.get(tagName) || [];
}

/**
 * Find element by id
 * @param {ElementIndex} index - Element index
 * @param {string} id - Element id
 * @returns {ElementRecord|null} Element or null
 */
function findById(index, id) {
  return index.byId.get(id) || null;
}

/**
 * Find element by CSS-like path
 * @param {ElementIndex} index - Element index
 * @param {string} path - CSS-like path
 * @returns {ElementRecord|null} Element or null
 */
function findByPath(index, path) {
  return index.byPath.get(path) || null;
}

/**
 * Search text content of text elements
 * @param {ElementIndex} index - Element index
 * @param {string} searchText - Text to search for
 * @param {Object} [options] - Search options
 * @param {boolean} [options.caseSensitive=false] - Case sensitive search
 * @param {number} [options.limit=20] - Max results
 * @returns {ElementRecord[]} Matching text elements
 */
function searchTextFn(index, searchText, options = {}) {
  const { caseSensitive = false, limit = 20 } = options;
  const needle = caseSensitive ? searchText : searchText.toLowerCase();
  
  const results = [];
  const textElements = [...(index.byTag.get('text') || []), ...(index.byTag.get('tspan') || [])];
  
  for (const record of textElements) {
    // Support both textContent (string indexer) and textPreview (DOM indexer)
    const textValue = record.textContent || record.textPreview;
    if (!textValue) continue;
    const haystack = caseSensitive ? textValue : textValue.toLowerCase();
    if (haystack.includes(needle)) {
      results.push(record);
      if (results.length >= limit) break;
    }
  }
  
  return results;
}

/**
 * Format element reference for display
 * @param {ElementRecord} record - Element record
 * @param {Object} [options] - Format options
 * @param {boolean} [options.showPath=false] - Include full path
 * @param {boolean} [options.showContent=false] - Include text content
 * @returns {string} Formatted reference
 */
function formatElementRef(record, options = {}) {
  const { showPath = false, showContent = false } = options;
  
  let ref = `${record.hash} ${record.tagName}`;
  if (record.id) ref += `#${record.id}`;
  ref += ` [L${record.line}:${record.column}]`;
  
  if (showPath) ref += ` ${record.path}`;
  if (showContent && record.textContent) {
    const preview = record.textContent.slice(0, 30);
    ref += ` "${preview}${record.textContent.length > 30 ? '...' : ''}"`;
  }
  
  return ref;
}

/**
 * Parse a selector string that may be hash, id, line, or path
 * @param {string} selector - Selector string
 * @returns {Object} Parsed selector info
 */
function parseSelector(selector) {
  const trimmed = (selector || '').trim();
  
  // Hash: 6-char alphanumeric starting with letter (but not all numeric after first)
  if (/^[a-zA-Z][a-zA-Z0-9_-]{5}$/.test(trimmed) && !/^\d/.test(trimmed)) {
    return { type: 'hash', value: trimmed };
  }
  
  // Hash prefix: 2-5 chars (but not line-like patterns)
  if (/^[a-zA-Z][a-zA-Z0-9_-]{1,4}$/.test(trimmed) && !/^[Ll]:?\d/.test(trimmed)) {
    return { type: 'hashPrefix', value: trimmed };
  }
  
  // Line range: L:10-20, L10-20, :10-20
  const rangeMatch = trimmed.match(/^[Ll]:?(\d+)-(\d+)$/);
  if (rangeMatch) {
    return { type: 'lineRange', start: parseInt(rangeMatch[1], 10), end: parseInt(rangeMatch[2], 10) };
  }
  
  // Line number: L:123, L123, :123
  const lineMatch = trimmed.match(/^[Ll]:?(\d+)$/);
  if (lineMatch) {
    return { type: 'line', value: parseInt(lineMatch[1], 10) };
  }
  
  // ID: #myId
  if (trimmed.startsWith('#')) {
    return { type: 'id', value: trimmed.slice(1) };
  }
  
  // Tag: @rect, @text, etc.
  if (trimmed.startsWith('@')) {
    return { type: 'tag', value: trimmed.slice(1) };
  }
  
  // CSS path: contains " > "
  if (trimmed.includes(' > ')) {
    return { type: 'path', value: trimmed };
  }
  
  // Default: treat as search text
  return { type: 'search', value: trimmed };
}

/**
 * Resolve a selector to matching elements
 * @param {ElementIndex} index - Element index
 * @param {string} selector - Selector string
 * @param {Object} [options] - Resolution options
 * @returns {ElementRecord[]} Matching elements
 */
function resolveSelector(index, selector, options = {}) {
  const parsed = parseSelector(selector);
  
  switch (parsed.type) {
    case 'hash': {
      const record = findByHash(index, parsed.value);
      return record ? [record] : [];
    }
    case 'hashPrefix':
      return findByHashPrefix(index, parsed.value);
    case 'line':
      return findByLine(index, parsed.value);
    case 'lineRange':
      return findByLineRange(index, parsed.start, parsed.end);
    case 'id': {
      const record = findById(index, parsed.value);
      return record ? [record] : [];
    }
    case 'tag':
      return findByTag(index, parsed.value);
    case 'path': {
      const record = findByPath(index, parsed.value);
      return record ? [record] : [];
    }
    case 'search':
      return searchTextFn(index, parsed.value, options);
    default:
      return [];
  }
}

module.exports = {
  // Hash functions
  createDigest,
  createElementHash,
  SHORT_HASH_LENGTH,
  
  // Line utilities
  buildLineIndex,
  getLineNumber,
  getLineFromIndex,
  getColumnFromIndex,
  
  // Index building
  buildElementIndex,
  
  // Lookups
  findByHash,
  findByHashPrefix,
  findByLine,
  findByLineRange,
  findByTag,
  findById,
  findByPath,
  searchText: searchTextFn,
  
  // Selectors
  parseSelector,
  resolveSelector,
  
  // Formatting
  formatElementRef
};
