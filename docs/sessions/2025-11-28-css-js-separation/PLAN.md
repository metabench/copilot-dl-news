# CSS/JS Separation Refactoring Plan

**Session**: 2025-11-28-css-js-separation  
**Status**: Planning  
**Priority**: High  

## Objective

Separate CSS and JavaScript from inline template literals in server files and controls into dedicated files, using a fast esbuild-based build process with AST-based CSS extraction.

## Done When

- [ ] CSS lives in `.css` files alongside controls (not embedded in JS)
- [ ] Server files load styles from external files, not inline functions
- [ ] Client JS is bundled separately from CSS
- [ ] Build process extracts CSS from controls automatically
- [ ] Express servers serve static CSS/JS files instead of inline content
- [ ] Watch mode supports fast incremental rebuilds

---

## Architecture Overview

See `architecture.svg` for visual diagram.

### Current State (Problems)

1. **Inline CSS in server files**: `geoImportServer.js` has ~500 lines of CSS in `getStyles()` function
2. **Inline client JS**: `getClientScript()` returns ~500 lines of JS as template literal
3. **CSS in control classes**: `DatabaseSelector.getStyles()` returns CSS as string
4. **No separation at build time**: CSS and JS shipped together
5. **Hard to maintain**: Changes require editing large template literals
6. **No CSS tooling**: Can't use CSS linting, formatting, or IDE features

### Target State (Solution)

1. **External CSS files**: `src/ui/server/geoImport/styles.css`, `src/ui/controls/DatabaseSelector.css`
2. **External client JS**: `src/ui/client/geoImport/index.js` → built to `public/assets/`
3. **Build-time extraction**: esbuild bundles JS, custom extractor pulls CSS
4. **Static file serving**: Express serves from `public/assets/`
5. **Pattern matching**: Support both `ClassName.css = \`...\`` and `ClassName.getStyles()` patterns

---

## Patterns from jsgui3-server

From analysis of `metabench/jsgui3-server`:

### CSS Extraction Method

The `CSS_And_JS_From_JS_String_Using_AST_Node_Extractor` class:

1. **Parses JS to AST** using custom `JS_AST_Node`
2. **Traverses AST** looking for `AssignmentExpression` nodes
3. **Identifies patterns**: `MemberExpression` where last child is `css`
4. **Extracts content**: Template literal values from these assignments
5. **Removes from JS**: Tracks position spans and rebuilds JS without CSS

```javascript
// Pattern detected:
ClassName.css = `
  .selector { ... }
`;

// After extraction:
// CSS → css file
// JS → ClassName.css removed
```

### Performance Concern

jsgui3-server uses Browserify which is slow. We'll use **esbuild** which is 10-100x faster.

### Our Approach: esbuild + Regex/Simple AST

Instead of full AST parsing (slower), we can:

1. **Use esbuild** for bundling (fast)
2. **Use regex or simple parsing** for CSS extraction (fast enough for our patterns)
3. **Cache results** with file hashes (avoid redundant work)

---

## Implementation Phases

### Phase 1: Extract CSS to Separate Files (Manual)

**Goal**: Move existing inline CSS to `.css` files alongside source files.

**Tasks**:
- [x] Create `src/ui/server/geoImport/styles.css` from `getStyles()` content
- [x] Create `src/ui/server/geoImport/dashboard.css` for dashboard-specific styles
- [x] Create `src/ui/controls/DatabaseSelector.css` from `getStyles()` method
- [x] Keep backward compatibility (load from file in existing functions)

**File Structure**:
```
src/ui/
├── controls/
│   ├── DatabaseSelector.js
│   ├── DatabaseSelector.css     ← NEW
│   ├── GeoImportDashboard.js
│   └── GeoImportDashboard.css   ← NEW
├── server/
│   ├── geoImportServer.js
│   └── geoImport/
│       ├── styles.css           ← NEW
│       └── client.js            ← NEW (extracted from server)
└── client/
    └── geoImport/
        └── index.js             ← NEW entry point
```

### Phase 2: Build Script for CSS Bundling

**Goal**: Create build script that bundles CSS from all controls.

**Tasks**:
- [x] Create `scripts/build-ui-css.js`
- [x] Implement CSS file discovery (find all `.css` files in controls dir)
- [x] Concatenate CSS files in dependency order
- [x] Output to `public/assets/controls.css`
- [x] Add npm script: `"ui:css-build": "node scripts/build-ui-css.js"`

**Build Script Features**:
```javascript
// scripts/build-ui-css.js
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function buildCSS() {
  // 1. Find all .css files in src/ui/controls/
  // 2. Find all .css files in src/ui/server/*/
  // 3. Concatenate with header comments
  // 4. Optionally minify for production
  // 5. Write to public/assets/controls.css
}
```

### Phase 3: CSS Extractor for Legacy Patterns

**Goal**: Extract CSS from controls that still use `ClassName.css = \`...\`` pattern.

**Tasks**:
- [x] Create `tools/build/css-extractor.js`
- [x] Implement pattern detection using regex (fast)
- [x] Extract CSS content, write to `.css` files
- [x] Optionally remove CSS from source JS (with backup)

**Extractor Patterns**:
```javascript
// Pattern 1: Static property assignment
const cssAssignmentPattern = /(\w+)\.css\s*=\s*`([^`]+)`/gs;

// Pattern 2: getStyles method
const getStylesPattern = /(\w+)\.getStyles\s*=\s*function\s*\(\)\s*\{\s*return\s*`([^`]+)`\s*;?\s*\}/gs;
```

### Phase 4: Update Server Files to Load External CSS

**Goal**: Change servers to serve CSS from files instead of inline.

**Tasks**:
- [ ] Create `src/ui/server/shared/cssLoader.js` utility
- [x] Update `geoImportServer.js` to use cssLoader
- [ ] Update `diagramAtlasServer.js` similarly
- [ ] Update `dataExplorerServer.js` similarly
- [ ] Add Express static middleware for `/assets/`

**CSS Loader Utility**:
```javascript
// src/ui/server/shared/cssLoader.js
const fs = require('fs');
const path = require('path');

const cssCache = new Map();

function loadCSS(cssPath, options = {}) {
  const { cache = true, minify = false } = options;
  
  if (cache && cssCache.has(cssPath)) {
    return cssCache.get(cssPath);
  }
  
  const fullPath = path.resolve(__dirname, '..', '..', cssPath);
  let css = fs.readFileSync(fullPath, 'utf8');
  
  if (minify) {
    css = css.replace(/\s+/g, ' ').replace(/\s*([{}:;,])\s*/g, '$1');
  }
  
  if (cache) {
    cssCache.set(cssPath, css);
  }
  
  return css;
}

module.exports = { loadCSS };
```

### Phase 5: Extract Client JS to Separate Files

**Goal**: Move inline client scripts to external JS files.

**Tasks**:
- [x] Create `src/ui/client/geoImport/index.js` from `getClientScript()`
- [ ] Create `src/ui/client/geoImport/sse.js` for SSE handling
- [ ] Create `src/ui/client/geoImport/ui.js` for UI updates
- [x] Update build script to bundle client JS per-server
- [x] Update servers to serve bundled JS

**Client JS Structure**:
```
src/ui/client/
├── geoImport/
│   ├── index.js      ← Entry point
│   ├── sse.js        ← SSE connection handling
│   ├── ui.js         ← UI state updates
│   └── toast.js      ← Toast notifications
├── dataExplorer/
│   ├── index.js
│   └── ...
└── shared/
    ├── eventSource.js
    └── formatters.js
```

### Phase 6: Unified Build Script

**Goal**: Single command to build all CSS and JS assets.

**Tasks**:
- [ ] Create `scripts/build-ui-assets.js`
- [ ] Bundle CSS: controls + server-specific
- [ ] Bundle JS: per-server client bundles
- [ ] Support watch mode for development
- [ ] Generate source maps for debugging
- [ ] Add npm scripts

**npm Scripts**:
```json
{
  "scripts": {
    "ui:build": "node scripts/build-ui-assets.js",
    "ui:watch": "node scripts/build-ui-assets.js --watch",
    "ui:build:prod": "NODE_ENV=production node scripts/build-ui-assets.js"
  }
}
```

### Phase 7: Clean Up Inline CSS/JS

**Goal**: Remove now-unused inline CSS/JS from server files.

**Tasks**:
- [x] Remove `getStyles()` functions from servers
- [x] Remove `getClientScript()` functions from servers
- [x] Remove `ClassName.getStyles()` methods from controls
- [x] Update HTML generation to use `<link>` and `<script>` tags
- [x] Verify all servers work with external files

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CSS order matters | Medium | High | Maintain explicit ordering in build |
| Cache invalidation | Low | Medium | Use file hashes in URLs |
| Dev/prod parity | Medium | Medium | Use same build for both |
| Breaking changes | High | High | Keep backward compat initially |

---

## Dependencies

**Required packages** (already installed):
- `esbuild` - Fast bundler

**Optional packages** (consider adding):
- `chokidar` - File watcher for dev mode
- `clean-css` - CSS minification (esbuild handles this too)

---

## Success Metrics

1. **Build time**: < 500ms for full CSS/JS build
2. **File size**: CSS < 50KB, JS per-server < 100KB
3. **Cache hit rate**: > 90% in watch mode
4. **Zero regressions**: All existing functionality preserved

---

## Timeline Estimate

| Phase | Effort | Priority |
|-------|--------|----------|
| Phase 1: Extract CSS | 2-3 hours | High |
| Phase 2: CSS Build | 1-2 hours | High |
| Phase 3: CSS Extractor | 2-3 hours | Medium |
| Phase 4: Server Updates | 2-3 hours | High |
| Phase 5: Client JS | 3-4 hours | Medium |
| Phase 6: Unified Build | 2-3 hours | High |
| Phase 7: Cleanup | 1-2 hours | Low |

**Total**: ~15-20 hours

---

## References

- `metabench/jsgui3-server` - CSS extraction patterns
- `docs/bundling-system-deep-dive.md` in jsgui3-server
- `scripts/build-ui-client.js` - Existing esbuild usage
- `src/ui/controls/DatabaseSelector.js` - Current CSS pattern example
