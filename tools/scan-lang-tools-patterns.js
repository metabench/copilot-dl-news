#!/usr/bin/env node
/**
 * Lang-Tools Pattern Scanner
 * 
 * Scans a JavaScript file for opportunities to apply lang-tools patterns.
 * Reports forEach, typeof, Array.isArray, and null/undefined checks.
 * 
 * Usage:
 *   node tools/scan-lang-tools-patterns.js <file.js>
 *   node tools/scan-lang-tools-patterns.js src/core/crawler/**\/*.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {glob} = require('glob');

// Pattern detectors
const PATTERNS = {
  forEach: {
    regex: /\.forEach\(/g,
    replacement: 'each()',
    description: 'Array/Object iteration with early exit support'
  },
  objectEntries: {
    regex: /Object\.entries\([^)]+\)\.forEach\(/g,
    replacement: 'each(obj, (key, value) => ...)',
    description: 'Direct object iteration (no Object.entries needed)'
  },
  typeof: {
    regex: /typeof\s+[^=\s]+\s*[!=]==?\s*['"][^'"]+['"]/g,
    replacement: 'tof(x) === "type"',
    description: 'Consistent type checking'
  },
  arrayIsArray: {
    regex: /Array\.isArray\(/g,
    replacement: 'is_array()',
    description: 'Shorter array type check'
  },
  nullUndefined: {
    regex: /([^=!])===?\s*(null|undefined)|null|undefined)\s*[!=]==?\s*([^=])/g,
    replacement: 'is_defined()',
    description: 'Concise null/undefined guard'
  }
};

// Scan a single file
function scanFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`❌ Error reading ${filePath}: ${err.message}`);
    return null;
  }

  const lines = content.split('\n');
  const findings = [];

  // Check for forEach
  let match;
  while ((match = PATTERNS.forEach.regex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    findings.push({
      pattern: 'forEach',
      line: lineNum,
      snippet: lines[lineNum - 1].trim(),
      ...PATTERNS.forEach
    });
  }

  // Check for Object.entries + forEach
  PATTERNS.objectEntries.regex.lastIndex = 0;
  while ((match = PATTERNS.objectEntries.regex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    findings.push({
      pattern: 'Object.entries + forEach',
      line: lineNum,
      snippet: lines[lineNum - 1].trim(),
      ...PATTERNS.objectEntries
    });
  }

  // Check for typeof
  PATTERNS.typeof.regex.lastIndex = 0;
  while ((match = PATTERNS.typeof.regex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    findings.push({
      pattern: 'typeof',
      line: lineNum,
      snippet: lines[lineNum - 1].trim(),
      ...PATTERNS.typeof
    });
  }

  // Check for Array.isArray
  PATTERNS.arrayIsArray.regex.lastIndex = 0;
  while ((match = PATTERNS.arrayIsArray.regex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    findings.push({
      pattern: 'Array.isArray',
      line: lineNum,
      snippet: lines[lineNum - 1].trim(),
      ...PATTERNS.arrayIsArray
    });
  }

  // Check for null/undefined
  PATTERNS.nullUndefined.regex.lastIndex = 0;
  while ((match = PATTERNS.nullUndefined.regex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    const snippet = lines[lineNum - 1].trim();
    // Filter out docs/comments
    if (snippet.startsWith('//') || snippet.startsWith('*')) continue;
    findings.push({
      pattern: 'null/undefined check',
      line: lineNum,
      snippet,
      ...PATTERNS.nullUndefined
    });
  }

  return findings;
}

// Format findings report
function formatFindings(filePath, findings) {
  if (!findings || findings.length === 0) {
    return `✅ ${filePath}\n   No lang-tools opportunities found.\n`;
  }

  const counts = findings.reduce((acc, f) => {
    acc[f.pattern] = (acc[f.pattern] || 0) + 1;
    return acc;
  }, {});

  let output = `📋 ${filePath}\n`;
  output += `   Total opportunities: ${findings.length}\n\n`;

  // Summary by pattern
  Object.entries(counts).forEach(([pattern, count]) => {
    const example = findings.find(f => f.pattern === pattern);
    output += `   ${pattern} (${count})\n`;
    output += `     → Replace with: ${example.replacement}\n`;
  });

  output += `\n   Details:\n`;
  findings.forEach((f, idx) => {
    if (idx < 5) { // Show first 5 examples
      output += `     Line ${f.line}: ${f.snippet.substring(0, 80)}${f.snippet.length > 80 ? '...' : ''}\n`;
    }
  });

  if (findings.length > 5) {
    output += `     ... and ${findings.length - 5} more\n`;
  }

  return output + '\n';
}

// Main
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node scan-lang-tools-patterns.js <file-or-glob>');
    console.error('Example: node scan-lang-tools-patterns.js src/core/crawler/**/*.js');
    process.exit(1);
  }

  const pattern = args[0];
  let files;

  // Check if it's a glob or single file
  if (pattern.includes('*')) {
    files = await glob(pattern, { ignore: ['node_modules/**', '**/node_modules/**'] });
  } else {
    files = [pattern];
  }

  if (files.length === 0) {
    console.error(`No files found matching: ${pattern}`);
    process.exit(1);
  }

  console.log(`\n🔍 Scanning ${files.length} file(s) for lang-tools patterns...\n`);

  const allFindings = [];
  files.forEach(file => {
    const findings = scanFile(file);
    if (findings) {
      allFindings.push({ file, findings });
      console.log(formatFindings(file, findings));
    }
  });

  // Overall summary
  const totalOpportunities = allFindings.reduce((sum, f) => sum + f.findings.length, 0);
  const filesWithOpportunities = allFindings.filter(f => f.findings.length > 0).length;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Summary`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Files scanned: ${files.length}`);
  console.log(`Files with opportunities: ${filesWithOpportunities}`);
  console.log(`Total opportunities: ${totalOpportunities}`);
  
  if (totalOpportunities > 0) {
    console.log(`\n💡 Next steps:`);
    console.log(`   1. Review LANG_TOOLS_AUDIT.md for migration strategy`);
    console.log(`   2. Start with high-priority files (see Phase 1)`);
    console.log(`   3. Import: const {each, tof, is_array, is_defined} = require('lang-tools');`);
    console.log(`   4. Run tests after each file to verify no behavior changes`);
  }

  console.log('');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

