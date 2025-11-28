# Template Literal & CSS Tooling Enhancements

**Created**: 2025-11-27  
**Status**: Proposal  
**Author**: UI Singularity Agent  
**Problem Statement**: js-scan and js-edit are AST-focused but cannot operate on content within template literals, limiting their utility for CSS theming and large string refactors.

---

## The Gap

### Current Capability
- `js-scan`: Finds functions, variables, imports, exports, dependencies
- `js-edit`: Replaces function bodies, extracts code, batch operations on AST nodes

### Missing Capability
- Cannot search within template literal strings
- Cannot batch-replace patterns inside template literals
- No CSS-aware operations (color extraction, variable mapping)

### Real-World Impact (2025-11-27 Example)

Converting 800 lines of hardcoded CSS to CSS variables required:
- Manual rewrite of entire `buildCss()` function
- No tooling verification of color→variable mapping
- No dry-run preview of changes
- Error-prone, time-consuming process

**Time spent**: ~45 minutes manual work  
**Time with proper tooling**: ~10 minutes (estimated)

---

## Proposed Enhancements

### 1. js-scan: Template Literal Content Search

**New flags**:
```bash
--search-template <pattern>   # Regex search within template literals
--extract-templates           # List all template literals with metadata
--find-css-patterns           # Preset patterns for CSS values (colors, fonts, etc.)
```

**Example usage**:
```bash
# Find all hex colors in template literals
node tools/dev/js-scan.js --search-template "#[0-9a-fA-F]{3,8}" --json

# Output:
{
  "matches": [
    {
      "file": "src/ui/render-url-table.js",
      "function": "buildCss",
      "line": 312,
      "column": 15,
      "match": "#0f172a",
      "context": "color: #0f172a;"
    }
  ],
  "summary": {
    "uniqueMatches": 47,
    "filesScanned": 12,
    "templateLiteralsFound": 23
  }
}
```

**Implementation sketch**:
```javascript
// In js-scan/operations/templateSearch.js
function searchTemplateLiterals(ast, pattern, options = {}) {
  const matches = [];
  const regex = new RegExp(pattern, 'g');
  
  walk(ast, {
    TemplateLiteral(node) {
      node.quasis.forEach(quasi => {
        const text = quasi.value.raw;
        let match;
        while ((match = regex.exec(text)) !== null) {
          matches.push({
            file: options.filePath,
            line: quasi.loc.start.line + countNewlines(text.slice(0, match.index)),
            column: match.index,
            match: match[0],
            context: getContext(text, match.index, 40)
          });
        }
      });
    }
  });
  
  return matches;
}
```

### 2. js-edit: Template Literal Replacement

**New flags**:
```bash
--replace-in-template <old>   # Pattern to find in template literals
--with-template <new>         # Replacement value
--template-batch <file.json>  # Batch replacements from mapping file
--dry-run-template            # Preview template literal changes
```

**Example usage**:
```bash
# Single replacement
node tools/dev/js-edit.js \
  --file src/ui/render-url-table.js \
  --replace-in-template '#0f172a' \
  --with-template 'var(--theme-primary-dark)' \
  --dry-run --json

# Batch from mapping file
cat > color-map.json << 'EOF'
{
  "replacements": [
    { "from": "#0f172a", "to": "var(--theme-primary-dark)" },
    { "from": "#4b5563", "to": "var(--theme-text-secondary)" },
    { "from": "#2563eb", "to": "var(--theme-accent)" }
  ]
}
EOF

node tools/dev/js-edit.js \
  --file src/ui/render-url-table.js \
  --template-batch color-map.json \
  --dry-run --json
```

**Output format**:
```json
{
  "dryRun": true,
  "file": "src/ui/render-url-table.js",
  "templateLiteralsModified": 1,
  "replacementsApplied": 47,
  "preview": [
    {
      "line": 312,
      "before": "color: #0f172a;",
      "after": "color: var(--theme-primary-dark);"
    }
  ],
  "wouldWrite": true
}
```

### 3. CSS-Specific Presets

**New command**:
```bash
node tools/dev/js-scan.js --css-audit <path>
```

**Extracts**:
- All hardcoded colors (hex, rgb, hsl)
- All font declarations
- All px/rem/em values
- All timing values (transitions, animations)

**Output**:
```json
{
  "audit": {
    "colors": {
      "#0f172a": { "count": 12, "locations": [...] },
      "#4b5563": { "count": 8, "locations": [...] }
    },
    "fonts": {
      "sans-serif": { "count": 3, "locations": [...] }
    },
    "sizing": {
      "16px": { "count": 5, "locations": [...] }
    }
  },
  "suggestions": {
    "colorVariables": [
      { "hex": "#0f172a", "suggestedName": "--theme-dark-900" }
    ]
  }
}
```

### 4. md-scan/md-edit: Documentation Sync

**New capability**: Keep CSS variable documentation in sync with code.

```bash
# Find all --theme-* variables mentioned in docs
node tools/dev/md-scan.js --find-pattern '--theme-[a-z-]+' --dir docs/

# Update variable names across docs
node tools/dev/md-edit.js \
  --replace-pattern '--old-variable-name' \
  --with '--new-variable-name' \
  --dir docs/ \
  --dry-run
```

---

## Implementation Roadmap

### Phase 1: Template Literal Search (js-scan)
**Effort**: 4-6 hours  
**Dependencies**: None  
**Files**:
- `tools/dev/js-scan/operations/templateSearch.js` (new)
- `tools/dev/js-scan.js` (add flags)

### Phase 2: Template Literal Replace (js-edit)
**Effort**: 6-8 hours  
**Dependencies**: Phase 1 (for pattern testing)  
**Files**:
- `tools/dev/js-edit/operations/templateMutation.js` (new)
- `tools/dev/js-edit.js` (add flags)
- `tools/dev/js-edit/BatchDryRunner.js` (extend)

### Phase 3: CSS Audit Preset
**Effort**: 2-4 hours  
**Dependencies**: Phase 1  
**Files**:
- `tools/dev/js-scan/presets/cssAudit.js` (new)

### Phase 4: md-scan/md-edit Pattern Support
**Effort**: 4-6 hours  
**Dependencies**: None  
**Files**:
- `tools/dev/md-scan.js` (extend)
- `tools/dev/md-edit.js` (extend or create)

---

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| Time to theme 800-line CSS file | 45 min | 10 min |
| Color mapping errors | Manual verification | Automated |
| Dry-run coverage | None for template literals | Full |
| Documentation sync | Manual | Automated |

---

## Toward AI Singularity

These tools contribute to agent autonomy by:

1. **Reducing manual work** — Agents can perform complex refactors without human intervention
2. **Providing verification** — Dry-run and audit capabilities let agents validate their work
3. **Enabling iteration** — Fast feedback loops (scan → map → replace → verify) support autonomous improvement
4. **Self-documentation** — Output formats suitable for agent consumption and session logging

The ultimate goal: an agent can receive "convert this codebase to themed CSS" and execute it end-to-end with tooling support, logging every step, and producing verifiable results.

---

## Related Documents

- `AGENTS.md` — Core agent workflows
- `.github/agents/💡UI Singularity💡.agent.md` — UI specialist patterns
- `tools/dev/README.md` — Current CLI tool documentation
- `docs/AGENT_REFACTORING_PLAYBOOK.md` — Refactoring workflows
