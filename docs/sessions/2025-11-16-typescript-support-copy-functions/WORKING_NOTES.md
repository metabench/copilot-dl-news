# Working Notes: TypeScript Support and Function Copying

## External Repo Analysis (metabench-oracle-cloud-connector)

### TypeScript Support Implementation
**Pattern**: Environment variable driven language switching
- `ts-edit.js`/`ts-scan.js`: Simple wrappers that set env vars and require js versions
- Environment variables:
  - `TSNJS_EDIT_LANGUAGE=typescript` / `TSNJS_SCAN_LANGUAGE=typescript`
  - `TSNJS_EDIT_COMMAND=ts-edit` / `TSNJS_SCAN_COMMAND=ts-scan`
- js-edit.js/js-scan.js: Check env vars to conditionally load TypeScript AST parser

**Key Files**:
- `lib/swcTs.js`: Extends base swcAst with TypeScript parsing
- Uses `@swc/core` with `syntax: 'typescript'`, `tsx: true`, `decorators: true`
- Supports `.ts`, `.tsx`, `.d.ts` files

### Architecture Insights
- Clean separation: Language-specific parsing vs. core operations
- Environment variables avoid CLI flag proliferation
- Backward compatible: JS tools work unchanged
- Minimal wrapper scripts (12-15 lines each)

## Implementation Plan

### Phase 1: TypeScript Support
1. Create `tools/dev/lib/swcTs.js` - TypeScript AST parser
2. Modify `tools/dev/js-edit.js` - Add env var checks and conditional loading
3. Modify `tools/dev/js-scan.js` - Add env var checks and conditional loading  
4. Create `tools/dev/ts-edit.js` and `tools/dev/ts-scan.js` wrappers
5. Update dependencies and imports

### Phase 2: Function Copying
1. Add `--copy-from <source-file> --selectors <selectors>` flag to js-edit
2. Implement copy operation in `js-edit/operations/mutation.js`
3. Add batch copying support via `--copy-batch <json-file>`

### Implementation status
- [x] Implemented a `--copy-batch <plan>` prototype that converts `copy` operations into BatchDryRunner changes. It normalizes newlines and emits guards using function hashes. See `tools/dev/js-edit.js` and `tools/dev/js-edit/BatchDryRunner.js` for details.
4. Integrate with js-scan to generate copy operation batches

### Phase 3: Integration
1. Add js-scan operation to export copyable items
2. Create workflow: scan → select → batch copy
3. Add tests and documentation

## Copy Operation Design

**Basic Usage**:
```bash
# Copy single function
node tools/dev/js-edit.js --file target.js --copy-from source.js --selectors "myFunction"

# Copy multiple items
node tools/dev/js-edit.js --file target.js --copy-batch operations.json
```

**Batch Format**:
```json
[
  {
    "sourceFile": "utils.js",
    "selectors": ["helper1", "helper2"],
    "targetLocation": "end"
  },
  {
    "sourceFile": "constants.js", 
    "selectors": ["CONFIG", "DEFAULTS"],
    "targetLocation": "top"
  }
]
```

**Integration with js-scan**:
```bash
# Find functions to copy
node tools/dev/js-scan.js --dir source-dir --search "helper" --exported --json > candidates.json

# Generate copy batch
node tools/dev/js-scan.js --generate-copy-batch candidates.json --target target.js > copy-batch.json

# Execute copy
node tools/dev/js-edit.js --copy-batch copy-batch.json --fix
```

## Files to Create/Modify
- `tools/dev/lib/swcTs.js` (new)
- `tools/dev/ts-edit.js` (new) 
- `tools/dev/ts-scan.js` (new)
- `tools/dev/js-edit.js` (modify)
- `tools/dev/js-scan.js` (modify)
- `tools/dev/js-edit/operations/mutation.js` (add copy operation)
- `tools/dev/js-edit/shared/copy.js` (new shared utilities)