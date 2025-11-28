# CSS/JS Separation - Working Notes

## Session Context

Started: 2025-11-28
Goal: Separate inline CSS/JS from server files and controls into dedicated files

---

## Discovery Notes

### Current Patterns Found

1. **geoImportServer.js**:
   - `getStyles()` function returns ~500 lines of CSS as template literal
   - `getClientScript()` function returns ~500 lines of JS as template literal
   - CSS includes database selector styles loaded from control

2. **DatabaseSelector.js**:
   - `DatabaseSelector.getStyles = function() { return \`...\`; }` pattern
   - ~400 lines of CSS embedded
   - Follows jsgui3 convention but CSS is inline

3. **diagramAtlasServer.js**:
   - `buildBaseStyles()` function with inline CSS
   - Similar pattern to geoImportServer

4. **Existing build scripts**:
   - `scripts/build-ui-client.js` - Uses esbuild, good template
   - `scripts/build-facts-client.js` - Similar pattern
   - `scripts/build-docs-viewer-client.js` - More complex example

### jsgui3-server Analysis

Key files examined in `metabench/jsgui3-server`:

1. **CSS_And_JS_From_JS_String_Using_AST_Node_Extractor.js**:
   - Uses custom `JS_AST_Node` for AST parsing
   - Deep iteration over AST to find `.css` assignments
   - Extracts template literal content
   - Tracks position spans for removal from JS

2. **Advanced_JS_Bundler_Using_ESBuild.js**:
   - Uses esbuild for fast bundling
   - Separates CSS extraction as second step
   - Supports both minified and non-minified output

3. **Pattern detected**:
   ```javascript
   if (node.type === 'AssignmentExpression') {
     const [node_assigned_to, node_assigned] = node.child_nodes;
     if (node_assigned.type === 'TemplateLiteral') {
       if (node_assigned_to.type === 'MemberExpression') {
         const last_me_child = node_assigned_to.child_nodes[last];
         if (last_me_child.source === 'css') {
           // This is a CSS assignment!
           css_ae_nodes.push(node);
         }
       }
     }
   }
   ```

### Performance Considerations

jsgui3-server notes mention:
- Browserify is slow
- AST parsing can be slow but faster than full Babel compilation
- Regex-based extraction could be faster for simple patterns

Our approach:
- Use esbuild for bundling (very fast)
- Use regex for initial CSS extraction (our patterns are predictable)
- Fall back to AST only if regex insufficient

---

## Implementation Progress

### Phase 1: Setup ✅
- [x] Created session folder
- [x] Created architecture SVG
- [x] Created detailed PLAN.md

### Phase 2: CSS Extraction
- [ ] Create css-extractor.js tool
- [ ] Test on DatabaseSelector.js
- [ ] Extract geoImportServer styles

### Phase 3: Build Integration
- [ ] Create build-ui-css.js
- [ ] Integrate with existing build

---

## Code Snippets

### Regex-based CSS Extractor

```javascript
/**
 * Extract CSS from JavaScript files using regex patterns
 * Fast alternative to full AST parsing
 */
function extractCSSFromJS(jsContent) {
  const results = [];
  
  // Pattern 1: ClassName.css = `...`
  const cssAssignmentRegex = /(\w+)\.css\s*=\s*`([\s\S]*?)`\s*;?/g;
  let match;
  while ((match = cssAssignmentRegex.exec(jsContent)) !== null) {
    results.push({
      className: match[1],
      css: match[2].trim(),
      start: match.index,
      end: match.index + match[0].length,
      pattern: 'static-property'
    });
  }
  
  // Pattern 2: ClassName.getStyles = function() { return `...`; }
  const getStylesRegex = /(\w+)\.getStyles\s*=\s*function\s*\(\)\s*\{\s*return\s*`([\s\S]*?)`\s*;?\s*\}/g;
  while ((match = getStylesRegex.exec(jsContent)) !== null) {
    results.push({
      className: match[1],
      css: match[2].trim(),
      start: match.index,
      end: match.index + match[0].length,
      pattern: 'getStyles-method'
    });
  }
  
  return results;
}
```

### CSS File Discovery

```javascript
const path = require('path');
const fs = require('fs');
const glob = require('glob');

function discoverCSSFiles(baseDir) {
  const patterns = [
    'src/ui/controls/**/*.css',
    'src/ui/server/**/*.css',
    'src/ui/client/**/*.css'
  ];
  
  const files = [];
  for (const pattern of patterns) {
    const fullPattern = path.join(baseDir, pattern);
    files.push(...glob.sync(fullPattern));
  }
  
  return files;
}
```

---

## Questions to Resolve

1. **CSS Load Order**: How to ensure correct cascade order?
   - Solution: Define explicit manifest or naming convention

2. **CSS Variables**: Where should `:root` variables live?
   - Solution: Dedicated `base.css` loaded first

3. **Server-specific vs Shared CSS**: How to organize?
   - Solution: `shared/` folder for common, `geoImport/` etc for specific

4. **Hot Reload**: How to support CSS hot reload in dev?
   - Solution: Watch mode + browser refresh or CSS injection

---

## Next Steps

1. Create `tools/build/css-extractor.js`
2. Test extraction on DatabaseSelector.js
3. Create `src/ui/css/` directory structure
4. Extract geoImportServer styles to files
5. Update server to load from files
6. Create unified build script
