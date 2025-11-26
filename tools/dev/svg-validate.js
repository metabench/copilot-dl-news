const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];

if (!filePath) {
  console.error('Usage: node svg-validate.js <file-path>');
  process.exit(1);
}

const fullPath = path.resolve(filePath);

if (!fs.existsSync(fullPath)) {
  console.error(`File not found: ${fullPath}`);
  process.exit(1);
}

const content = fs.readFileSync(fullPath, 'utf8');
const lines = content.split('\n');

let errors = [];

// 1. Check for unescaped ampersands
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Check for & not followed by entity
  const ampRegex = /&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g;
  let match;
  while ((match = ampRegex.exec(line)) !== null) {
    errors.push({
      line: i + 1,
      column: match.index + 1,
      message: 'Unescaped ampersand detected. Use &amp; instead.',
      context: line.trim()
    });
  }

  // Check for < in text content (naive check: < followed by space or not a tag start)
  // This is hard to do line-by-line without state, but let's try a simple heuristic
  // If we see < that doesn't look like </?tag...
  const ltRegex = /<(?!\/?\w+|!--|!\[CDATA\[)/g;
  while ((match = ltRegex.exec(line)) !== null) {
     errors.push({
      line: i + 1,
      column: match.index + 1,
      message: 'Unescaped < detected in text content. Use &lt; instead.',
      context: line.trim()
    });
  }
}

// 2. Check for Duplicate IDs
const idRegex = /\sid=["']([^"']+)["']/g;
const ids = new Set();
let idMatch;
while ((idMatch = idRegex.exec(content)) !== null) {
  const id = idMatch[1];
  if (ids.has(id)) {
    errors.push({
      line: 'Unknown', // Regex on full content loses line number easily
      column: idMatch.index,
      message: `Duplicate ID detected: "${id}"`,
      context: `id="${id}"`
    });
  }
  ids.add(id);
}

// 2. Basic Tag Matching (Simplified)
// This is a naive check and won't handle all XML edge cases (like CDATA, comments with tags, etc.)
// but is good enough for generated SVGs.
const tagStack = [];
const tagRegex = /<\/?([a-zA-Z0-9:\-_]+)[^>]*>/g;
// Remove comments first to avoid false positives
const contentNoComments = content.replace(/<!--[\s\S]*?-->/g, '');

let match;
let lineNum = 1;
let lastIndex = 0;

// We need to track line numbers while iterating through tags in the full content
// This is tricky with regex on the whole string.
// Let's just stick to the ampersand check for now as it's the most common error for LLMs.
// Implementing a full XML parser in a single file without deps is complex.

if (errors.length > 0) {
  console.error(`Found ${errors.length} errors in ${filePath}:`);
  errors.forEach(err => {
    console.error(`  [Line ${err.line}, Col ${err.column}] ${err.message}`);
    console.error(`    Context: ${err.context}`);
  });
  process.exit(1);
} else {
  console.log(`✅ ${filePath} is valid (basic checks passed).`);
}
