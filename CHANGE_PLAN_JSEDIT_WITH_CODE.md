# Implementation Plan: `--with-code` Feature for js-edit

## Executive Summary

**Goal**: Add `--with-code` flag to js-edit allowing inline code snippets via command line, reducing need for temporary files during imports/require path updates.

**Example Usage**:
```bash
# OLD: Requires temporary file
echo "const { slugify } = require('../utils/text/slugify');" > tmp/snippet.js
node tools/dev/js-edit.js --file app.js --replace-variable "slugify" --with tmp/snippet.js --fix

# NEW: Direct inline code
node tools/dev/js-edit.js --file app.js --replace-variable "slugify" \
  --with-code "const { slugify } = require('../utils/text/slugify');" \
  --fix
```

**Benefits**:
- ✅ No temporary files needed
- ✅ Simpler for shell loops and batch operations
- ✅ Cleaner command history/logging
- ✅ Easier for documentation examples
- ✅ Enables future migration orchestration scripts

---

## Design Decisions

### 1. Syntax & Escaping Rules

**Primary Syntax**: Double-quote delimited
```bash
--with-code "const x = require('../utils');"
```

**Escaping Rules**:
- `\"` → `"` (escaped double quote)
- `\\` → `\` (escaped backslash)
- `${}` → literal (PowerShell/bash may interpolate, user escapes if needed)
- `\n` → NOT interpreted as newline (literal backslash-n, use quoted multiline on POSIX shells)
- Backticks → literal (no template substitution)

**Examples**:
```bash
# Simple require
--with-code "const x = require('../utils');"

# With escaped quotes
--with-code "const msg = \"hello\";"

# With escaped backslashes
--with-code "const path = 'C:\\\\Users\\\\file.js';"

# Complex object (quotes inside quotes)
--with-code "module.exports = { helper: () => {} };"

# Multiple statements (on one line or use shell newlines)
--with-code "const a = 1; const b = 2;"
```

### 2. Validation

- **Syntax validation**: Parse code with SWC to detect errors before applying
- **Newline handling**: Ensure trailing newline consistent with target file
- **Empty code check**: Reject empty code snippets
- **Mutual exclusivity**: `--with` and `--with-code` cannot both be supplied

### 3. Mutual Exclusivity Rules

**Error cases**:
```
--with file.js --with-code "..." → Error: choose one
--replace FOO --with file.js --with-code "..." → Error: choose one
--with-code "..." (no --replace) → Error: --with-code requires --replace
```

### 4. Integration Points

**Current Flow**:
1. Parse args → `--with <path>`
2. Normalize → resolve path
3. Load replacement → `loadReplacementSource(path)`
4. Apply → `replaceFunction()` / `replaceVariable()`

**New Flow**:
1. Parse args → `--with-code <string>` OR `--with <path>`
2. Normalize → inline code as string OR resolve path
3. Load replacement → use string directly OR `loadReplacementSource(path)`
4. Apply → same as before (guardrails unchanged)

---

## Implementation Steps

### Phase 1: Add CLI Argument Support

**File**: `tools/dev/js-edit.js`

**Changes**:
1. Add `--with-code <code>` argument to parser in `parseCliArgs()`
2. Parse `--with-code` into a value alongside `--with`
3. Handle mutual exclusivity in `normalizeOptions()`
4. Return `replacementCode` (inline) OR `replacementPath` (file) in options

**Code location**: Around line 1615 (argument definitions)

### Phase 2: Implement Quote Escaping Logic

**New file**: `tools/dev/lib/codeEscaper.js`

**Functions**:
```javascript
/**
 * Unescape a command-line code string.
 * Supports: \" -> ", \\ -> \
 * Other backslashes remain literal (e.g., \n stays \n)
 */
function unescapeCodeString(input) {
  if (typeof input !== 'string') return input;
  
  let result = '';
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '\\' && i + 1 < input.length) {
      const next = input[i + 1];
      if (next === '"') {
        result += '"';
        i++; // skip next
      } else if (next === '\\') {
        result += '\\';
        i++; // skip next
      } else {
        result += char; // keep literal
      }
    } else {
      result += char;
    }
  }
  return result;
}

/**
 * Validate code syntax (parse with SWC).
 */
function validateCodeSyntax(code, filePath) {
  const { parseModule } = require('./swcAst');
  try {
    parseModule(code, filePath);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
```

### Phase 3: Update normalizeOptions()

**Location**: Line ~1850

**Changes**:
```javascript
// Add new fields to parser
parser.add('--with-code <code>', 'Inline replacement snippet (alternative to --with)');

// In normalizeOptions():
let replacementPath = null;
let replacementCode = null;

if (resolved.with !== undefined && resolved.with !== null) {
  // Existing: handle --with
  replacementPath = ... // resolve path
}

if (resolved.withCode !== undefined && resolved.withCode !== null) {
  if (replacementPath) {
    throw new Error('Cannot supply both --with and --with-code.');
  }
  const rawCode = String(resolved.withCode).trim();
  if (!rawCode) {
    throw new Error('--with-code requires non-empty code.');
  }
  replacementCode = rawCode;
}

// Validation: require --replace or --replace-variable
if (replacementCode && !hasFunctionReplace && !hasVariableReplace) {
  throw new Error('--with-code can only be used with --replace or --replace-variable.');
}

// Return both fields:
return {
  ...existing,
  replacementPath,
  replacementCode
};
```

### Phase 4: Update loadReplacementSource()

**Location**: Line ~2035

**Add companion function**:
```javascript
/**
 * Get replacement code from either file path or inline string.
 * Applies quote unescaping to inline code.
 */
function getReplacementSource(options) {
  if (options.replacementCode) {
    const { unescapeCodeString } = require('./lib/codeEscaper');
    return unescapeCodeString(options.replacementCode);
  }
  if (options.replacementPath) {
    return loadReplacementSource(options.replacementPath);
  }
  throw new Error('No replacement source provided.');
}
```

### Phase 5: Update replaceFunction() & replaceVariable()

**Locations**: Line ~3100 (replaceVariable), Line ~3250 (replaceFunction)

**Changes**:
```javascript
// OLD:
const replacementSource = loadReplacementSource(replacementPath);

// NEW:
const replacementSource = getReplacementSource(options);
```

This change applies to:
- `replaceVariable()` at line 3025
- `replaceFunction()` at line 3296 (range replacement)
- `replaceFunction()` at line 3304 (full replacement)

### Phase 6: Update main() dispatch

**Location**: Line ~3400

**No changes needed** — dispatch already passes `options` to replace functions.

---

## Testing Strategy

### Test Structure

**File**: `tests/tools/__tests__/js-edit.test.js`

**New test suite**: "js-edit --with-code inline code"

### Test Cases

#### 1. Basic Inline Code Replacement
```javascript
test('--with-code replaces with inline string (basic)', () => {
  const result = runJsEdit([
    '--file', targetFile,
    '--replace-variable', 'slugify',
    '--with-code', 'const { slugify } = require("../utils/text/slugify");',
    '--json',
    '--fix'
  ]);
  
  expect(result.status).toBe(0);
  const payload = JSON.parse(result.stdout);
  expect(payload.applied).toBe(true);
  expect(payload.guard.result.status).toBe('changed');
  
  const updated = fs.readFileSync(targetFile, 'utf8');
  expect(updated).toContain('../utils/text/slugify');
});
```

#### 2. Escaped Double Quotes
```javascript
test('--with-code handles escaped double quotes', () => {
  const code = 'const msg = \\"hello world\\";';
  const result = runJsEdit([
    '--file', targetFile,
    '--replace-variable', 'x',
    '--with-code', code,
    '--json',
    '--fix'
  ]);
  
  expect(result.status).toBe(0);
  const updated = fs.readFileSync(targetFile, 'utf8');
  expect(updated).toContain('const msg = "hello world";');
});
```

#### 3. Escaped Backslashes
```javascript
test('--with-code handles escaped backslashes', () => {
  const code = 'const path = \\"C:\\\\Users\\\\file.js\\";';
  const result = runJsEdit([
    '--file', targetFile,
    '--replace-variable', 'filePath',
    '--with-code', code,
    '--json',
    '--fix'
  ]);
  
  expect(result.status).toBe(0);
  const updated = fs.readFileSync(targetFile, 'utf8');
  expect(updated).toContain('const path = "C:\\Users\\file.js";');
});
```

#### 4. Mutual Exclusivity (--with vs --with-code)
```javascript
test('--with-code rejects if --with also provided', () => {
  const result = runJsEdit([
    '--file', targetFile,
    '--replace-variable', 'x',
    '--with', 'file.js',
    '--with-code', 'const y = 1;'
  ]);
  
  expect(result.status).toNotBe(0);
  expect(result.stderr).toContain('Cannot supply both --with and --with-code');
});
```

#### 5. Invalid Syntax Detection
```javascript
test('--with-code rejects invalid JavaScript', () => {
  const result = runJsEdit([
    '--file', targetFile,
    '--replace-variable', 'x',
    '--with-code', 'const x = {',  // Incomplete object
    '--json',
    '--fix'
  ]);
  
  expect(result.status).toNotBe(0);
  expect(result.stderr).toContain('Replacement produced invalid JavaScript');
});
```

#### 6. Newline Handling
```javascript
test('--with-code ensures trailing newline', () => {
  // Code without trailing newline
  const result = runJsEdit([
    '--file', targetFile,
    '--replace-variable', 'x',
    '--with-code', 'const x = 1;',
    '--json',
    '--fix'
  ]);
  
  expect(result.status).toBe(0);
  const updated = fs.readFileSync(targetFile, 'utf8');
  // Should have newline added by normalization
  expect(updated.match(/const x = 1;\n/)).toBeDefined();
});
```

#### 7. Complex Code (Multi-statement)
```javascript
test('--with-code supports multi-statement code', () => {
  const code = 'const a = 1; const b = 2;';
  const result = runJsEdit([
    '--file', targetFile,
    '--replace-variable', 'setup',
    '--with-code', code,
    '--json',
    '--fix'
  ]);
  
  expect(result.status).toBe(0);
  const updated = fs.readFileSync(targetFile, 'utf8');
  expect(updated).toContain('const a = 1; const b = 2;');
});
```

#### 8. Function Replacement (not just variables)
```javascript
test('--with-code works with --replace (functions)', () => {
  const newFunc = 'function alpha() { return "updated"; }';
  const result = runJsEdit([
    '--file', targetFile,
    '--replace', 'exports.alpha',
    '--with-code', newFunc,
    '--json',
    '--fix'
  ]);
  
  expect(result.status).toBe(0);
  const updated = fs.readFileSync(targetFile, 'utf8');
  expect(updated).toContain('"updated"');
});
```

#### 9. Empty Code Rejection
```javascript
test('--with-code rejects empty code', () => {
  const result = runJsEdit([
    '--file', targetFile,
    '--replace-variable', 'x',
    '--with-code', ''
  ]);
  
  expect(result.status).toNotBe(0);
  expect(result.stderr).toContain('--with-code requires non-empty code');
});
```

#### 10. Dry-Run with --emit-diff
```javascript
test('--with-code shows diff without --fix', () => {
  const code = 'const { helper } = require("../new/path");';
  const result = runJsEdit([
    '--file', targetFile,
    '--replace-variable', 'helper',
    '--with-code', code,
    '--emit-diff',
    '--json'
  ]);
  
  expect(result.status).toBe(0);
  const payload = JSON.parse(result.stdout);
  expect(payload.diff).toBeDefined();
  expect(payload.diff.after).toContain('../new/path');
  
  // File should not be modified
  const content = fs.readFileSync(targetFile, 'utf8');
  expect(content).not.toContain('../new/path');
});
```

---

## Documentation Updates

### Update README.md

**Add new section**: "Inline Code (`--with-code`)"

```markdown
### Inline Code Replacement (`--with-code`)

Supply code directly via command line instead of a file:

```bash
node tools/dev/js-edit.js --file app.js \
  --replace-variable "slugify" \
  --with-code "const { slugify } = require('../utils/text/slugify');" \
  --fix
```

#### Escaping Rules

- `\"` → `"` (escaped double quote)
- `\\` → `\` (escaped backslash)  
- Other backslashes remain literal (e.g., `\n` is two characters)
- Backticks and `${}` are literal (no template expansion)

#### Examples

**Simple require path update**:
```bash
--with-code "const { helper } = require('../utils/helpers');"
```

**With escaped quotes**:
```bash
--with-code "const msg = \"hello\";"
```

**With escaped backslashes (Windows paths)**:
```bash
--with-code "const path = \"C:\\\\Users\\\\file.js\";"
```

**Complex object**:
```bash
--with-code "module.exports = { a: 1, b: () => {} };"
```

#### Mutual Exclusivity

- Cannot use both `--with` and `--with-code`
- `--with-code` requires either `--replace` or `--replace-variable`
- `--with-code` works with `--rename` (no, wait — only `--replace`, not `--rename`)

#### Validation

- Code is validated for syntax before applying
- Trailing newline is automatically normalized
- Invalid JavaScript is rejected before file modification
```

---

## Implementation Order

1. ✅ **Create codeEscaper.js** (new utility module)
2. ✅ **Update parseCliArgs()** (add --with-code argument)
3. ✅ **Update normalizeOptions()** (validate, mutual exclusivity)
4. ✅ **Add getReplacementSource()** (abstraction layer)
5. ✅ **Update replaceFunction()** (use getReplacementSource)
6. ✅ **Update replaceVariable()** (use getReplacementSource)
7. ✅ **Write comprehensive tests** (all 10 test cases)
8. ✅ **Update README.md** (documentation with examples)
9. ✅ **Update AGENTS.md** (reference new feature)

---

## Testing Checklist

- [ ] Basic inline code replacement works
- [ ] Escaped quotes handled correctly
- [ ] Escaped backslashes handled correctly
- [ ] Mutual exclusivity errors thrown
- [ ] Invalid syntax rejected
- [ ] Newlines normalized
- [ ] Multi-statement code works
- [ ] Works with both --replace and --replace-variable
- [ ] Dry-run with --emit-diff works
- [ ] Empty code rejected
- [ ] Help text mentions --with-code

---

## Success Criteria

✅ **All tests pass**  
✅ **No regressions to existing --with functionality**  
✅ **Help text updated**  
✅ **README.md documents escaping rules**  
✅ **Example commands work without temp files**  
✅ **Guard rails (hash/span/path) unaffected**  

---

## Example: Import Path Update Script

**After this feature**, batch update imports via loop:

```bash
#!/bin/bash

# Migrate all requires from ../tools/slugify to ../utils/text/slugify
FILES=$(find src -name "*.js" -type f)

for file in $FILES; do
  node tools/dev/js-edit.js --file "$file" \
    --locate-variable "slugify" \
    --json 2>/dev/null | jq -r '.variable.hash' | read hash
  
  [ -z "$hash" ] && continue
  
  node tools/dev/js-edit.js --file "$file" \
    --replace-variable "slugify" \
    --with-code "const { slugify } = require('../utils/text/slugify');" \
    --expect-hash "$hash" \
    --fix
done
```

This script demonstrates the value: no temp files, clear intent, easily auditable.

