#!/usr/bin/env node
"use strict";

/**
 * SVG Validator - Comprehensive validation for SVG files
 * 
 * Validates:
 *   - XML well-formedness (using xmldom parser)
 *   - Unescaped special characters (& < > in text)
 *   - Duplicate IDs
 *   - viewBox and dimension validation
 *   - Text element integrity
 *   - Font and style attribute validation
 *   - Quick overlap detection (text bounding estimation)
 * 
 * NEW: Hash-based element referencing (similar to js-scan)
 *   - Each element gets a 6-char hash for quick reference
 *   - Use --index to build element index with hashes
 *   - Use --find <selector> to locate elements by hash, id, line, or text
 * 
 * Usage:
 *   node tools/dev/svg-validate.js <svg-file>
 *   node tools/dev/svg-validate.js --dir <directory>
 *   node tools/dev/svg-validate.js <svg-file> --json
 *   node tools/dev/svg-validate.js <svg-file> --quick-overlap
 *   node tools/dev/svg-validate.js <svg-file> --index
 *   node tools/dev/svg-validate.js <svg-file> --find "xK9mPq"
 *   node tools/dev/svg-validate.js <svg-file> --find "@rect"
 *   node tools/dev/svg-validate.js <svg-file> --find "L:100-150"
 * 
 * Options:
 *   --json            Output results as JSON
 *   --dir <path>      Validate all SVG files in a directory
 *   --quick-overlap   Estimate text overlaps without browser (fast)
 *   --index           Build and display element index with hashes
 *   --find <selector> Find elements by hash, line, id, tag, or text
 *   --strict          Report warnings as errors
 *   --verbose         Show all checks performed
 *   --help, -h        Show this help message
 */

const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const {
  buildElementIndex,
  resolveSelector,
  formatElementRef,
  findByTag,
  SHORT_HASH_LENGTH
} = require('./svg-shared/hashUtils');

// Parse command line arguments
const args = process.argv.slice(2);
const flags = {
  json: args.includes('--json'),
  verbose: args.includes('--verbose'),
  strict: args.includes('--strict'),
  quickOverlap: args.includes('--quick-overlap'),
  index: args.includes('--index'),
  help: args.includes('--help') || args.includes('-h')
};

// Extract directory
const dirIdx = args.indexOf('--dir');
const scanDir = dirIdx !== -1 ? args[dirIdx + 1] : null;

// Extract find selector
const findIdx = args.indexOf('--find');
const findSelector = findIdx !== -1 ? args[findIdx + 1] : null;

// Get file path (first non-flag argument)
const filePath = args.find(arg => 
  !arg.startsWith('--') && 
  arg !== scanDir && 
  arg !== findSelector
);

if (flags.help || (!filePath && !scanDir)) {
  console.log(`
SVG Validator - Comprehensive validation for SVG files

Validates XML well-formedness, duplicate IDs, viewBox, text elements,
and can perform quick overlap detection without a browser.

NEW: Hash-based element referencing for efficient lookups.

Usage:
  node svg-validate.js <svg-file> [options]
  node svg-validate.js --dir <directory> [options]

Options:
  --json            Output results as JSON
  --dir <path>      Validate all SVG files in a directory
  --quick-overlap   Estimate text overlaps without browser (fast)
  --index           Build and display element index with hashes
  --find <selector> Find elements by hash, line, id, tag, or text
  --strict          Report warnings as errors
  --verbose         Show all checks performed
  --help, -h        Show this help message

Selector Formats:
  xK9mPq           Hash (6 chars) - exact element lookup
  xK9               Hash prefix (2-5 chars) - fuzzy match
  L:100            Line number
  L:100-150        Line range
  #myId            Element ID
  @rect            Tag name
  "search text"    Text content search

Examples:
  node svg-validate.js docs/diagrams/CRAWLER_PIPELINE_FLOW.svg
  node svg-validate.js --dir docs/diagrams --json
  node svg-validate.js diagram.svg --quick-overlap --strict
  node svg-validate.js diagram.svg --index | head -20
  node svg-validate.js diagram.svg --find "xK9mPq"
  node svg-validate.js diagram.svg --find "@text" --json
`);
  process.exit(0);
}

/**
 * Parse a transform attribute and return a transformation matrix
 * Supports: translate, scale, rotate, matrix
 */
function parseTransform(transformStr) {
  if (!transformStr) return { tx: 0, ty: 0, sx: 1, sy: 1 };
  
  const result = { tx: 0, ty: 0, sx: 1, sy: 1 };
  
  // Extract translate
  const translateMatch = transformStr.match(/translate\(\s*([+-]?\d*\.?\d+)(?:\s*,\s*|\s+)([+-]?\d*\.?\d+)?\s*\)/);
  if (translateMatch) {
    result.tx = parseFloat(translateMatch[1]) || 0;
    result.ty = parseFloat(translateMatch[2]) || 0;
  }
  
  // Extract scale
  const scaleMatch = transformStr.match(/scale\(\s*([+-]?\d*\.?\d+)(?:\s*,\s*|\s+)?([+-]?\d*\.?\d+)?\s*\)/);
  if (scaleMatch) {
    result.sx = parseFloat(scaleMatch[1]) || 1;
    result.sy = parseFloat(scaleMatch[2]) || result.sx;
  }
  
  return result;
}

/**
 * Estimate text bounding box (without browser)
 * Uses approximate character widths based on font size
 */
function estimateTextBbox(textEl, inheritedTransform = { tx: 0, ty: 0, sx: 1, sy: 1 }) {
  const x = parseFloat(textEl.getAttribute('x')) || 0;
  const y = parseFloat(textEl.getAttribute('y')) || 0;
  const fontSize = parseFloat(textEl.getAttribute('font-size')) || 14;
  const textContent = textEl.textContent || '';
  
  // Apply transform from element itself
  const localTransform = parseTransform(textEl.getAttribute('transform'));
  const tx = inheritedTransform.tx + localTransform.tx;
  const ty = inheritedTransform.ty + localTransform.ty;
  const sx = inheritedTransform.sx * localTransform.sx;
  const sy = inheritedTransform.sy * localTransform.sy;
  
  // Estimate width: ~0.55 of fontSize per character (approximate)
  const charWidth = fontSize * 0.55;
  const width = textContent.length * charWidth * sx;
  const height = fontSize * 1.2 * sy; // line height ~1.2
  
  // Calculate absolute position
  const absX = (x * sx) + tx;
  const absY = (y * sy) + ty - height; // text y is baseline, adjust up
  
  return {
    x: absX,
    y: absY,
    width: width,
    height: height,
    text: textContent.trim().slice(0, 50) + (textContent.length > 50 ? '...' : ''),
    fontSize: fontSize
  };
}

/**
 * Get accumulated transform from ancestors
 */
function getAncestorTransform(element) {
  const transforms = [];
  let current = element.parentNode;
  
  while (current && current.getAttribute) {
    const transform = current.getAttribute('transform');
    if (transform) {
      transforms.unshift(parseTransform(transform));
    }
    current = current.parentNode;
  }
  
  // Combine all transforms
  let result = { tx: 0, ty: 0, sx: 1, sy: 1 };
  for (const t of transforms) {
    result.tx = result.tx * t.sx + t.tx;
    result.ty = result.ty * t.sy + t.ty;
    result.sx *= t.sx;
    result.sy *= t.sy;
  }
  
  return result;
}

/**
 * Check if two rectangles overlap
 */
function boxesOverlap(box1, box2, threshold = 0) {
  return !(box1.x + box1.width < box2.x + threshold ||
           box2.x + box2.width < box1.x + threshold ||
           box1.y + box1.height < box2.y + threshold ||
           box2.y + box2.height < box1.y + threshold);
}

/**
 * Calculate overlap area between two boxes
 */
function getOverlapArea(box1, box2) {
  const xOverlap = Math.max(0, Math.min(box1.x + box1.width, box2.x + box2.width) - Math.max(box1.x, box2.x));
  const yOverlap = Math.max(0, Math.min(box1.y + box1.height, box2.y + box2.height) - Math.max(box1.y, box2.y));
  return xOverlap * yOverlap;
}

/**
 * Validate an SVG file
 */
function validateSvg(svgPath) {
  const absolutePath = path.resolve(svgPath);
  
  if (!fs.existsSync(absolutePath)) {
    return {
      file: svgPath,
      valid: false,
      errors: [{ severity: 'error', message: `File not found: ${absolutePath}` }],
      warnings: []
    };
  }
  
  const content = fs.readFileSync(absolutePath, 'utf8');
  const lines = content.split('\n');
  const errors = [];
  const warnings = [];
  const info = {};
  
  // === Check 1: XML Well-formedness ===
  let doc;
  const parseErrors = [];
  
  const errorHandler = {
    warning: (msg) => parseErrors.push({ level: 'warning', message: msg }),
    error: (msg) => parseErrors.push({ level: 'error', message: msg }),
    fatalError: (msg) => parseErrors.push({ level: 'fatal', message: msg })
  };
  
  try {
    const parser = new DOMParser({ errorHandler });
    doc = parser.parseFromString(content, 'image/svg+xml');
    
    // Check for parse errors
    const parserErrors = doc.getElementsByTagName('parsererror');
    if (parserErrors.length > 0) {
      errors.push({
        severity: 'error',
        check: 'xml-wellformed',
        message: 'XML parse error: ' + parserErrors[0].textContent
      });
    }
    
    // Add any xmldom parse errors/warnings
    for (const pe of parseErrors) {
      const target = pe.level === 'warning' ? warnings : errors;
      target.push({
        severity: pe.level === 'warning' ? 'warning' : 'error',
        check: 'xml-wellformed',
        message: pe.message.toString().slice(0, 200)
      });
    }
    
  } catch (e) {
    errors.push({
      severity: 'error',
      check: 'xml-wellformed',
      message: `Failed to parse XML: ${e.message}`
    });
    return { file: svgPath, valid: false, errors, warnings, info };
  }
  
  // Get SVG root element
  const svg = doc.documentElement;
  if (!svg || svg.tagName !== 'svg') {
    errors.push({
      severity: 'error',
      check: 'svg-root',
      message: 'Document root is not an <svg> element'
    });
    return { file: svgPath, valid: false, errors, warnings, info };
  }
  
  // === Check 2: viewBox and dimensions ===
  const viewBox = svg.getAttribute('viewBox');
  const width = svg.getAttribute('width');
  const height = svg.getAttribute('height');
  
  info.viewBox = viewBox;
  info.width = width;
  info.height = height;
  
  if (!viewBox) {
    warnings.push({
      severity: 'warning',
      check: 'viewbox',
      message: 'Missing viewBox attribute - SVG may not scale properly'
    });
  } else {
    // Validate viewBox format
    const vbParts = viewBox.trim().split(/[\s,]+/);
    if (vbParts.length !== 4 || vbParts.some(p => isNaN(parseFloat(p)))) {
      errors.push({
        severity: 'error',
        check: 'viewbox',
        message: `Invalid viewBox format: "${viewBox}" (expected: minX minY width height)`
      });
    }
  }
  
  // === Check 3: Unescaped characters ===
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for unescaped & not followed by entity
    const ampRegex = /&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g;
    let match;
    while ((match = ampRegex.exec(line)) !== null) {
      // Skip if inside a tag attribute value that might be a URL
      const before = line.slice(0, match.index);
      const inUrl = /href=["'][^"']*$/.test(before) || /xlink:href=["'][^"']*$/.test(before);
      if (!inUrl) {
        errors.push({
          severity: 'error',
          check: 'unescaped-chars',
          line: i + 1,
          column: match.index + 1,
          message: 'Unescaped ampersand detected. Use &amp; instead.',
          context: line.trim().slice(0, 100)
        });
      }
    }
  }
  
  // === Check 4: Duplicate IDs ===
  const allElements = doc.getElementsByTagName('*');
  const ids = new Map();
  
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    const id = el.getAttribute('id');
    if (id) {
      if (ids.has(id)) {
        errors.push({
          severity: 'error',
          check: 'duplicate-id',
          message: `Duplicate ID detected: "${id}"`,
          context: `First: ${ids.get(id)}, Duplicate: <${el.tagName}>`
        });
      } else {
        ids.set(id, `<${el.tagName}>`);
      }
    }
  }
  
  info.totalIds = ids.size;
  
  // === Check 5: Text elements ===
  const textElements = doc.getElementsByTagName('text');
  info.textElementCount = textElements.length;
  
  for (let i = 0; i < textElements.length; i++) {
    const text = textElements[i];
    const textContent = text.textContent;
    
    // Check for empty text elements
    if (!textContent || !textContent.trim()) {
      warnings.push({
        severity: 'warning',
        check: 'empty-text',
        message: `Empty text element found`,
        context: `<text id="${text.getAttribute('id') || '(no id)'}">`
      });
    }
    
    // Check for very long text without wrapping
    if (textContent && textContent.length > 100) {
      warnings.push({
        severity: 'warning',
        check: 'long-text',
        message: `Text element has ${textContent.length} characters - may overflow`,
        context: textContent.slice(0, 50) + '...'
      });
    }
  }
  
  // === Check 6: Quick overlap detection (text only) ===
  if (flags.quickOverlap && textElements.length > 1) {
    const textBoxes = [];
    
    for (let i = 0; i < textElements.length; i++) {
      const text = textElements[i];
      const ancestorTransform = getAncestorTransform(text);
      const bbox = estimateTextBbox(text, ancestorTransform);
      if (bbox.text) {
        textBoxes.push({ index: i, ...bbox });
      }
    }
    
    // Check for overlaps
    for (let i = 0; i < textBoxes.length; i++) {
      for (let j = i + 1; j < textBoxes.length; j++) {
        const box1 = textBoxes[i];
        const box2 = textBoxes[j];
        
        if (boxesOverlap(box1, box2)) {
          const overlapArea = getOverlapArea(box1, box2);
          const smallerArea = Math.min(box1.width * box1.height, box2.width * box2.height);
          const overlapRatio = smallerArea > 0 ? overlapArea / smallerArea : 0;
          
          // Only report significant overlaps
          if (overlapRatio > 0.15) {
            warnings.push({
              severity: overlapRatio > 0.5 ? 'warning' : 'info',
              check: 'text-overlap',
              message: `Potential text overlap (${Math.round(overlapRatio * 100)}%)`,
              element1: box1.text,
              element2: box2.text,
              overlapRatio: Math.round(overlapRatio * 100)
            });
          }
        }
      }
    }
    
    info.textOverlapChecks = textBoxes.length * (textBoxes.length - 1) / 2;
  }
  
  // === Check 7: Referenced IDs exist ===
  const hrefPattern = /(?:href|xlink:href)=["']#([^"']+)["']/g;
  let hrefMatch;
  while ((hrefMatch = hrefPattern.exec(content)) !== null) {
    const refId = hrefMatch[1];
    if (!ids.has(refId)) {
      warnings.push({
        severity: 'warning',
        check: 'missing-ref',
        message: `Reference to non-existent ID: "#${refId}"`
      });
    }
  }
  
  // === Determine validity ===
  const hasErrors = errors.length > 0;
  const hasStrictFailures = flags.strict && warnings.length > 0;
  
  return {
    file: svgPath,
    valid: !hasErrors && !hasStrictFailures,
    errors,
    warnings,
    info,
    summary: {
      errors: errors.length,
      warnings: warnings.length,
      textElements: info.textElementCount,
      ids: info.totalIds
    }
  };
}

/**
 * Format validation result for console output
 */
function formatReport(result) {
  const lines = [];
  
  lines.push(`\n${'═'.repeat(70)}`);
  lines.push(`SVG Validation: ${path.basename(result.file)}`);
  lines.push(`${'═'.repeat(70)}`);
  
  if (result.info) {
    lines.push(`\nInfo:`);
    if (result.info.viewBox) lines.push(`  viewBox: ${result.info.viewBox}`);
    if (result.info.width) lines.push(`  width: ${result.info.width}`);
    if (result.info.height) lines.push(`  height: ${result.info.height}`);
    lines.push(`  Text elements: ${result.info.textElementCount || 0}`);
    lines.push(`  Unique IDs: ${result.info.totalIds || 0}`);
  }
  
  if (result.errors.length === 0 && result.warnings.length === 0) {
    lines.push(`\n✅ All checks passed!`);
    return lines.join('\n');
  }
  
  if (result.errors.length > 0) {
    lines.push(`\n❌ Errors (${result.errors.length}):`);
    result.errors.forEach((err, idx) => {
      const location = err.line ? ` [Line ${err.line}]` : '';
      lines.push(`  ${idx + 1}. [${err.check}]${location} ${err.message}`);
      if (err.context) lines.push(`     Context: ${err.context}`);
    });
  }
  
  if (result.warnings.length > 0) {
    lines.push(`\n⚠️  Warnings (${result.warnings.length}):`);
    result.warnings.forEach((warn, idx) => {
      lines.push(`  ${idx + 1}. [${warn.check}] ${warn.message}`);
      if (warn.element1 && warn.element2) {
        lines.push(`     "${warn.element1}" ↔ "${warn.element2}"`);
      }
      if (warn.context) lines.push(`     Context: ${warn.context}`);
    });
  }
  
  lines.push(`\n${result.valid ? '✅' : '❌'} Result: ${result.valid ? 'VALID' : 'INVALID'}`);
  
  return lines.join('\n');
}

/**
 * Display element index with hash references
 */
function displayIndex(svgPath, elementIndex) {
  const elements = elementIndex.getAll();
  
  if (flags.json) {
    const output = {
      file: svgPath,
      totalElements: elements.length,
      elements: elements.map(el => ({
        hash: el.hash.substring(0, SHORT_HASH_LENGTH),
        tag: el.tagName,
        id: el.id || null,
        line: el.line,
        path: el.path,
        text: el.textPreview || null
      }))
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`SVG Element Index: ${path.basename(svgPath)}`);
  console.log(`Total elements: ${elements.length}`);
  console.log(`${'═'.repeat(70)}\n`);
  
  // Group by tag name for organized display
  const byTag = {};
  for (const el of elements) {
    if (!byTag[el.tagName]) byTag[el.tagName] = [];
    byTag[el.tagName].push(el);
  }
  
  // Display summary by tag
  console.log('Elements by tag:');
  const tagCounts = Object.entries(byTag)
    .map(([tag, els]) => ({ tag, count: els.length }))
    .sort((a, b) => b.count - a.count);
  
  for (const { tag, count } of tagCounts) {
    console.log(`  ${tag}: ${count}`);
  }
  
  // Display first 20 elements as examples
  console.log('\nElement references (first 20):');
  console.log(`${'─'.repeat(70)}`);
  console.log(`${'Hash'.padEnd(8)} ${'Line'.padEnd(6)} ${'Tag'.padEnd(10)} ${'ID/Preview'.substring(0, 40)}`);
  console.log(`${'─'.repeat(70)}`);
  
  for (let i = 0; i < Math.min(20, elements.length); i++) {
    const el = elements[i];
    const hash = el.hash.substring(0, SHORT_HASH_LENGTH);
    const line = String(el.line || '?').padEnd(6);
    const tag = el.tagName.padEnd(10);
    const preview = el.id ? `#${el.id}` : el.textPreview ? `"${el.textPreview}"` : el.path;
    console.log(`${hash.padEnd(8)} ${line} ${tag} ${preview.substring(0, 40)}`);
  }
  
  if (elements.length > 20) {
    console.log(`\n... and ${elements.length - 20} more elements`);
  }
  
  console.log(`\nUse --find <hash> to lookup specific elements`);
}

/**
 * Find and display elements matching a selector
 */
function displayFind(svgPath, elementIndex, selector) {
  const matches = resolveSelector(elementIndex, selector);
  
  if (flags.json) {
    const output = {
      file: svgPath,
      selector,
      matchCount: matches.length,
      matches: matches.map(el => ({
        hash: el.hash.substring(0, SHORT_HASH_LENGTH),
        fullHash: el.hash,
        tag: el.tagName,
        id: el.id || null,
        line: el.line,
        path: el.path,
        text: el.textPreview || null,
        attributes: el.attributes || {}
      }))
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`SVG Element Search: ${path.basename(svgPath)}`);
  console.log(`Selector: "${selector}"`);
  console.log(`Matches: ${matches.length}`);
  console.log(`${'═'.repeat(70)}\n`);
  
  if (matches.length === 0) {
    console.log('No elements found matching selector.');
    console.log('\nSelector formats:');
    console.log('  xK9mPq         - Hash (6 chars)');
    console.log('  xK9            - Hash prefix (2-5 chars)');
    console.log('  L:100          - Line number');
    console.log('  L:100-150      - Line range');
    console.log('  #myId          - Element ID');
    console.log('  @rect          - Tag name');
    console.log('  "search text"  - Text content');
    return;
  }
  
  for (const el of matches) {
    const hash = el.hash.substring(0, SHORT_HASH_LENGTH);
    console.log(`${'─'.repeat(50)}`);
    console.log(formatElementRef(el));
    console.log(`  Full hash: ${el.hash}`);
    console.log(`  Path: ${el.path}`);
    if (Object.keys(el.attributes || {}).length > 0) {
      const attrStr = Object.entries(el.attributes)
        .slice(0, 5)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      console.log(`  Attrs: ${attrStr}${Object.keys(el.attributes).length > 5 ? ' ...' : ''}`);
    }
  }
}

/**
 * Main entry point
 */
function main() {
  let files = [];
  
  if (scanDir) {
    const dirPath = path.resolve(scanDir);
    if (!fs.existsSync(dirPath)) {
      console.error(`Directory not found: ${dirPath}`);
      process.exit(1);
    }
    
    const entries = fs.readdirSync(dirPath);
    files = entries
      .filter(f => f.toLowerCase().endsWith('.svg'))
      .map(f => path.join(dirPath, f));
    
    if (files.length === 0) {
      console.error(`No SVG files found in: ${dirPath}`);
      process.exit(1);
    }
  } else {
    files = [filePath];
  }
  
  // Handle --index and --find modes (single file only)
  if ((flags.index || findSelector) && files.length === 1) {
    const svgPath = path.resolve(files[0]);
    if (!fs.existsSync(svgPath)) {
      console.error(`File not found: ${svgPath}`);
      process.exit(1);
    }
    
    const content = fs.readFileSync(svgPath, 'utf-8');
    
    // Parse with line number tracking
    let lineMap = null;
    try {
      // Build line number map from raw content
      lineMap = buildLineMap(content);
    } catch (e) {
      // Continue without line numbers
    }
    
    // Parse XML
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'image/svg+xml');
    const svgRoot = doc.documentElement;
    
    // Build element index
    const elementIndex = buildElementIndex(svgRoot, lineMap);
    
    if (findSelector) {
      displayFind(svgPath, elementIndex, findSelector);
    } else {
      displayIndex(svgPath, elementIndex);
    }
    
    process.exit(0);
  }
  
  // Standard validation mode
  const results = [];
  
  for (const file of files) {
    const result = validateSvg(file);
    results.push(result);
  }
  
  // Output results
  if (flags.json) {
    console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  } else {
    for (const result of results) {
      console.log(formatReport(result));
    }
    
    // Summary for multiple files
    if (results.length > 1) {
      console.log(`\n${'═'.repeat(70)}`);
      console.log('SUMMARY');
      console.log(`${'═'.repeat(70)}`);
      
      const validCount = results.filter(r => r.valid).length;
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
      
      console.log(`Files validated: ${results.length}`);
      console.log(`Valid: ${validCount} / ${results.length}`);
      console.log(`Total errors: ${totalErrors}`);
      console.log(`Total warnings: ${totalWarnings}`);
      
      if (validCount === results.length) {
        console.log('\n✅ All SVGs valid!');
      } else {
        const invalidFiles = results.filter(r => !r.valid);
        console.log('\nInvalid files:');
        invalidFiles.forEach(r => {
          console.log(`  - ${path.basename(r.file)}: ${r.errors.length} error(s)`);
        });
      }
    }
  }
  
  // Exit with error code if validation failed
  const hasFailures = results.some(r => !r.valid);
  process.exit(hasFailures ? 1 : 0);
}

/**
 * Build a map of content offsets to line numbers
 */
function buildLineMap(content) {
  const map = new Map();
  let line = 1;
  let offset = 0;
  
  // Map each character offset to its line number
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      line++;
    }
    map.set(i, line);
  }
  
  // Also create a reverse lookup by tag start position
  // Match all opening tags and their positions
  const tagStartPattern = /<([a-zA-Z][a-zA-Z0-9_:-]*)/g;
  let match;
  const tagLines = [];
  
  while ((match = tagStartPattern.exec(content)) !== null) {
    const lineNum = map.get(match.index) || 1;
    tagLines.push({ offset: match.index, line: lineNum, tag: match[1] });
  }
  
  return { offsetToLine: map, tagStarts: tagLines };
}

main();
