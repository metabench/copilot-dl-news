# js-edit Move Capability Design

**Status**: Gap identified, implementation planned  
**Date**: 2024-12-02  
**Author**: 简令 Agent

## Problem Statement

When refactoring JavaScript code to be more modular, the most common operation is **moving functions between files**. This requires coordinated changes to multiple files:

1. **Extract** the function source from the origin file
2. **Insert** into the target file (with proper positioning)
3. **Delete** from the origin file  
4. **Add export** in the target file (if function was internal)
5. **Add import** in the origin file (to maintain references)
6. **Update imports** in any file that imported from origin (if exported)

Currently, js-edit only supports:
- `--copy` - Copies function to target (steps 1-2 only)
- `--extract` - Prints function to stdout

Missing: deletion, import/export management, true multi-file atomic operations.

## Proposed Solution

### New CLI Flags

```bash
# Basic move (internal function)
node js-edit.js --move "functionName" \
  --from source.js \
  --to target.js

# Move with explicit export (make it public in target)
node js-edit.js --move "functionName" \
  --from source.js \
  --to target.js \
  --add-export

# Move multiple functions
node js-edit.js --move-batch moves.json

# Dry-run to preview changes
node js-edit.js --move "functionName" \
  --from source.js \
  --to target.js \
  --dry-run
```

### 简令 Chinese Aliases

| English | 简令 | Meaning |
|---------|------|---------|
| `--move` | `--移` | move/transfer |
| `--from` | `--源` | source/origin |
| `--to` | `--标` | target/destination |
| `--add-export` | `--出` | add export |
| `--add-import` | `--入` | add import |
| `--move-batch` | `--移批` | batch move |

### Move Batch JSON Format

```json
{
  "moves": [
    {
      "function": "normalizeOptions",
      "from": "tools/dev/js-edit.js",
      "to": "tools/dev/js-edit/shared/options.js",
      "addExport": true,
      "position": "end"
    },
    {
      "function": "parseCliArgs",
      "from": "tools/dev/js-edit.js",
      "to": "tools/dev/js-edit/cli.js",
      "addExport": true
    }
  ],
  "updateImports": true
}
```

## Implementation Plan

### Phase 1: Core Move (Single Function)

1. **Extend mutation operations** (`js-edit/operations/mutation.js`)
   - Add `deleteSpan(source, startLine, endLine)` 
   - Add `insertAtPosition(source, code, position)`
   - Add `addExportStatement(source, functionName)`
   - Add `addImportStatement(source, modulePath, imports)`

2. **Create move orchestrator** (`js-edit/operations/move.js`)
   ```javascript
   async function moveFunction(options) {
     const { functionName, fromPath, toPath, addExport } = options;
     
     // 1. Extract function source
     const extracted = extractFunction(fromPath, functionName);
     
     // 2. Prepare target file
     const targetSource = fs.readFileSync(toPath, 'utf-8');
     const newTarget = insertAtPosition(targetSource, extracted.code, 'end');
     if (addExport) {
       newTarget = addExportStatement(newTarget, functionName);
     }
     
     // 3. Prepare source file (delete + add import)
     let newSource = deleteSpan(sourceContent, extracted.start, extracted.end);
     newSource = addImportStatement(newSource, toPath, [functionName]);
     
     // 4. Write atomically (or return for dry-run)
     return { fromContent: newSource, toContent: newTarget };
   }
   ```

3. **Add CLI dispatch** in main js-edit.js

### Phase 2: Batch Operations

1. Parse JSON batch file
2. Calculate all changes before applying
3. Detect conflicts (same line edited twice)
4. Apply atomically or roll back

### Phase 3: Import Graph Updates

1. Use js-scan `--what-imports` to find all consumers
2. Update import paths in affected files
3. Handle re-exports

## Risk Analysis

| Risk | Mitigation |
|------|------------|
| Partial failure leaves inconsistent state | Use dry-run first; write temp files then rename |
| Function has dependencies not moved | Warn if function calls internal helpers |
| Circular imports created | Detect cycles before applying |
| Wrong function selected (ambiguous name) | Require hash confirmation for duplicates |

## Success Criteria

1. ✅ `--move` successfully relocates a function
2. ✅ Origin file compiles after move
3. ✅ Target file compiles after move
4. ✅ All tests pass after move
5. ✅ `--dry-run` shows accurate preview
6. ✅ Chinese aliases work for terse mode

## Example Workflow (After Implementation)

```bash
# 1. Discover what to move
node js-scan.js --搜 "normalizeOptions" --限 5

# 2. Check dependencies
node js-scan.js --what-calls "normalizeOptions" --json

# 3. Preview the move
node js-edit.js --移 "normalizeOptions" \
  --源 tools/dev/js-edit.js \
  --标 tools/dev/js-edit/shared/options.js \
  --出 --dry-run

# 4. Execute the move
node js-edit.js --移 "normalizeOptions" \
  --源 tools/dev/js-edit.js \
  --标 tools/dev/js-edit/shared/options.js \
  --出 --fix

# 5. Verify
node tools/dev/js-edit.js --help
```

## Related

- Gap 2: Semantic relationship queries (complete)
- Gap 3: Batch dry-run + recovery (complete)
- Gap 4: Plans integration (complete)
- **Gap 7**: Multi-file move operations (this document)
