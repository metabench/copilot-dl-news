# CSS Extraction Technical Design

## Overview

This document describes the technical approach for extracting CSS from JavaScript files in this repository, inspired by the jsgui3-server approach but optimized for speed using esbuild and regex-based pattern matching.

---

## Pattern Analysis

### Pattern 1: Static Property Assignment

```javascript
// Most common in jsgui3 controls
DatabaseSelector.css = `
  .database-selector {
    background: var(--surface-color);
  }
  
  .db-item {
    padding: 12px;
  }
`;
```

**Regex**: `/(\w+)\.css\s*=\s*`([\s\S]*?)`\s*;?/g`

### Pattern 2: getStyles Method

```javascript
// Used in this repo's controls
DatabaseSelector.getStyles = function() {
  return `
    .database-selector {
      background: var(--surface-color);
    }
  `;
};
```

**Regex**: `/(\w+)\.getStyles\s*=\s*function\s*\(\)\s*\{\s*return\s*`([\s\S]*?)`\s*;?\s*\}/g`

### Pattern 3: Inline Function in Server

```javascript
// Server files like geoImportServer.js
function getStyles() {
  return `
    :root {
      --bg-color: #0d1117;
    }
    .dashboard {
      max-width: 1200px;
    }
  `;
}
```

**Regex**: `/function\s+getStyles\s*\(\)\s*\{\s*return\s*`([\s\S]*?)`\s*;?\s*\}/g`

---

## Extraction Algorithm

### Step 1: File Discovery

```javascript
const glob = require('glob');
const path = require('path');

function discoverSourceFiles(rootDir) {
  const patterns = [
    'src/ui/controls/**/*.js',
    'src/ui/server/**/*.js',
    '!**/*.test.js',
    '!**/checks/**'
  ];
  
  let files = [];
  for (const pattern of patterns) {
    const matches = glob.sync(path.join(rootDir, pattern), {
      ignore: ['**/node_modules/**']
    });
    files = files.concat(matches);
  }
  
  return files;
}
```

### Step 2: CSS Extraction

```javascript
const fs = require('fs');

const PATTERNS = [
  // Pattern 1: ClassName.css = `...`
  {
    name: 'static-css-property',
    regex: /(\w+)\.css\s*=\s*`([\s\S]*?)`\s*;?/g,
    getClassName: (match) => match[1],
    getCSS: (match) => match[2]
  },
  // Pattern 2: ClassName.getStyles = function() { return `...`; }
  {
    name: 'getStyles-method',
    regex: /(\w+)\.getStyles\s*=\s*function\s*\(\)\s*\{\s*return\s*`([\s\S]*?)`\s*;?\s*\}/g,
    getClassName: (match) => match[1],
    getCSS: (match) => match[2]
  },
  // Pattern 3: function getStyles() { return `...`; }
  {
    name: 'getStyles-function',
    regex: /function\s+getStyles\s*\(\)\s*\{\s*return\s*`([\s\S]*?)`\s*;?\s*\}/g,
    getClassName: () => 'server',
    getCSS: (match) => match[1]
  }
];

function extractCSS(jsContent, filePath) {
  const results = [];
  
  for (const pattern of PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;
    
    while ((match = regex.exec(jsContent)) !== null) {
      results.push({
        file: filePath,
        pattern: pattern.name,
        className: pattern.getClassName(match),
        css: pattern.getCSS(match).trim(),
        start: match.index,
        end: match.index + match[0].length,
        fullMatch: match[0]
      });
    }
  }
  
  return results;
}
```

### Step 3: CSS Aggregation

```javascript
function aggregateCSS(extractions, options = {}) {
  const { addSourceComments = true } = options;
  
  const cssBlocks = [];
  
  // Group by source file
  const byFile = new Map();
  for (const extraction of extractions) {
    if (!byFile.has(extraction.file)) {
      byFile.set(extraction.file, []);
    }
    byFile.get(extraction.file).push(extraction);
  }
  
  // Generate combined CSS
  for (const [file, extracts] of byFile) {
    if (addSourceComments) {
      cssBlocks.push(`/* Source: ${path.relative(process.cwd(), file)} */`);
    }
    
    for (const extract of extracts) {
      if (addSourceComments && extract.className !== 'server') {
        cssBlocks.push(`/* ${extract.className} */`);
      }
      cssBlocks.push(extract.css);
      cssBlocks.push('');
    }
  }
  
  return cssBlocks.join('\n');
}
```

### Step 4: JS Cleanup (Optional)

```javascript
function removeCSS(jsContent, extractions) {
  // Sort by position descending (remove from end first to preserve positions)
  const sorted = [...extractions].sort((a, b) => b.start - a.start);
  
  let result = jsContent;
  for (const extraction of sorted) {
    // Replace with empty string or comment
    const before = result.slice(0, extraction.start);
    const after = result.slice(extraction.end);
    result = before + `/* CSS extracted to ${extraction.className}.css */` + after;
  }
  
  return result;
}
```

---

## Build Script Structure

### Main Build Script

```javascript
// scripts/build-ui-css.js
'use strict';

const fs = require('fs');
const path = require('path');
const { extractCSS, aggregateCSS } = require('../tools/build/css-extractor');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'public', 'assets');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'controls.css');

async function build() {
  console.log('🎨 Building CSS bundle...');
  
  // 1. Discover source files
  const sourceFiles = discoverSourceFiles(ROOT_DIR);
  console.log(`   Found ${sourceFiles.length} source files`);
  
  // 2. Extract CSS from each
  const extractions = [];
  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const results = extractCSS(content, file);
    extractions.push(...results);
  }
  console.log(`   Extracted ${extractions.length} CSS blocks`);
  
  // 3. Aggregate into single CSS
  const combinedCSS = aggregateCSS(extractions);
  
  // 4. Write output
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, combinedCSS);
  
  console.log(`   Output: ${OUTPUT_FILE} (${combinedCSS.length} bytes)`);
  console.log('✅ CSS build complete');
}

build().catch(err => {
  console.error('❌ CSS build failed:', err);
  process.exit(1);
});
```

---

## File Organization

### Recommended Structure

```
src/ui/
├── controls/
│   ├── DatabaseSelector.js      # Control logic
│   ├── DatabaseSelector.css     # Extracted CSS (new)
│   ├── GeoImportDashboard.js
│   └── GeoImportDashboard.css   # Extracted CSS (new)
│
├── server/
│   ├── geoImportServer.js       # Server (no inline CSS)
│   └── geoImport/
│       ├── styles.css           # Extracted server CSS (new)
│       └── client.js            # Extracted client JS (new)
│
├── client/
│   ├── index.js                 # Main client entry
│   ├── geoImport/
│   │   ├── index.js             # Per-server client entry
│   │   └── sse.js               # SSE handling
│   └── shared/
│       └── formatters.js        # Shared utilities
│
└── css/
    ├── base.css                 # CSS variables, resets
    └── manifest.json            # CSS load order (optional)

public/assets/
├── controls.css                 # Built: all control CSS
├── ui-client.js                 # Built: bundled client JS
└── ui-client.js.map             # Source map
```

---

## Integration with Express

### Loading External CSS

```javascript
// Before: Inline CSS
const css = getStyles();
const html = `<style>${css}</style>`;

// After: External CSS
const html = `<link rel="stylesheet" href="/assets/controls.css">`;
```

### Static File Serving

```javascript
const express = require('express');
const path = require('path');

const app = express();

// Serve static assets
app.use('/assets', express.static(path.join(__dirname, '..', '..', '..', 'public', 'assets')));
```

---

## Watch Mode

### Development Hot Reload

```javascript
const chokidar = require('chokidar');

function watch() {
  const watcher = chokidar.watch([
    'src/ui/controls/**/*.{js,css}',
    'src/ui/server/**/*.css'
  ], {
    persistent: true,
    ignoreInitial: true
  });
  
  watcher.on('change', (filePath) => {
    console.log(`Changed: ${filePath}`);
    build();
  });
  
  console.log('👁️ Watching for changes...');
}
```

---

## Performance Considerations

### Why Regex Over AST?

| Approach | Pros | Cons |
|----------|------|------|
| Full AST (Babel) | Accurate, handles edge cases | Slow (~500ms per file) |
| Custom AST (jsgui3) | Faster than Babel | Still complex, medium speed |
| Regex | Very fast (~5ms per file) | May miss complex patterns |

Our patterns are predictable and well-defined, making regex sufficient.

### Caching

```javascript
const crypto = require('crypto');

const cache = new Map();

function getCachedExtraction(file) {
  const content = fs.readFileSync(file, 'utf8');
  const hash = crypto.createHash('md5').update(content).digest('hex');
  
  if (cache.has(file) && cache.get(file).hash === hash) {
    return cache.get(file).extractions;
  }
  
  const extractions = extractCSS(content, file);
  cache.set(file, { hash, extractions });
  return extractions;
}
```

---

## Migration Path

### Step 1: Extract Without Removing

1. Run extractor to create `.css` files
2. Keep inline CSS in JS (backward compat)
3. Test that external CSS works

### Step 2: Switch to External

1. Update servers to use `<link>` tags
2. Verify styling unchanged
3. Test all UI functionality

### Step 3: Remove Inline CSS

1. Remove `getStyles()` functions
2. Remove `ClassName.css` assignments
3. Final cleanup and testing
