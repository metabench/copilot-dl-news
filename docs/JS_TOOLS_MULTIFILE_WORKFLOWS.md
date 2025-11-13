# Multi-File Workflow Examples & Walkthroughs

**Date:** November 11, 2025  
**Purpose:** Step-by-step examples of complex multi-file operations (1.1-1.4 from brainstorm)

This guide walks through real-world scenarios showing how to use js-edit's multi-file capabilities to accomplish large refactoring tasks efficiently.

---

## Table of Contents

1. [Multi-File Extract & Move](#multi-file-extract--move)
2. [Multi-File Search & Replace (Rename Globally)](#multi-file-search--replace)
3. [Multi-File Import Consolidation](#multi-file-import-consolidation)
4. [Extract to New Module](#extract-to-new-module)
5. [Complex Scenarios](#complex-scenarios)
6. [Troubleshooting Multi-File Operations](#troubleshooting-multi-file-operations)

---

## Multi-File Extract & Move

### Problem

You have a utility function in `src/utils/helpers.js` that should live in a dedicated module `src/utils/date.js` for better organization. The function is used in 5 different files.

**Current state:**
```javascript
// src/utils/helpers.js
export function formatDate(date, format) {
  return date.toLocaleDateString(format);
}

export function parseDate(dateStr) {
  return new Date(dateStr);
}

// 5 other files import and use formatDate and parseDate
```

### Step-by-Step Solution

#### 1. Analyze the Impact

First, understand what depends on these functions:

```bash
# Find all usage of formatDate
node tools/dev/js-scan.js --ripple-analysis "formatDate" \
  --file src/utils/helpers.js \
  --scope src/

# Find all usage of parseDate
node tools/dev/js-scan.js --ripple-analysis "parseDate" \
  --file src/utils/helpers.js \
  --scope src/
```

**Output tells you:**
- How many files import these functions
- Usage depth (direct callers, indirect callers)
- Whether they're exported publicly
- Test coverage

#### 2. Create the Recipe

Create `recipes/move-date-utils.json`:

```json
{
  "version": "1.0",
  "name": "Move date utilities to dedicated module",
  "description": "Extract formatDate and parseDate to src/utils/date.js",
  "parameters": {
    "sourceFile": {
      "type": "file",
      "default": "src/utils/helpers.js"
    },
    "targetFile": {
      "type": "file",
      "default": "src/utils/date.js"
    },
    "functions": {
      "type": "array",
      "default": ["formatDate", "parseDate"]
    }
  },
  "steps": [
    {
      "name": "Move formatDate to new module",
      "operation": "js-edit",
      "move-function": "${functions[0]}",
      "from": "${sourceFile}",
      "to": "${targetFile}",
      "insert-after": "// Date utilities",
      "trace-deps": true,
      "update-calls": true,
      "emit": "formatDate_moved"
    },
    {
      "name": "Move parseDate to new module",
      "operation": "js-edit",
      "move-function": "${functions[1]}",
      "from": "${sourceFile}",
      "to": "${targetFile}",
      "insert-after": "export function formatDate",
      "trace-deps": true,
      "update-calls": true,
      "emit": "parseDate_moved"
    },
    {
      "name": "Consolidate imports across codebase",
      "operation": "js-edit",
      "consolidate-imports": "formatDate",
      "from-exports": "${targetFile}",
      "canonical-path": "../utils/date",
      "scope": "src/",
      "emit": "imports_consolidated"
    },
    {
      "name": "Consolidate parseDate imports",
      "operation": "js-edit",
      "consolidate-imports": "parseDate",
      "from-exports": "${targetFile}",
      "canonical-path": "../utils/date",
      "scope": "src/",
      "emit": "imports_consolidated_2"
    },
    {
      "name": "Verify health",
      "operation": "js-scan",
      "health-check": true,
      "scope": "src/",
      "emit": "final_health"
    }
  ]
}
```

#### 3. Dry-Run to Preview Changes

```bash
node tools/dev/js-edit.js --recipe recipes/move-date-utils.json \
  --dry-run --emit-diff

# Output:
# Step 1: formatDate moved
# ---/src/utils/helpers.js (before)
# +++/src/utils/helpers.js (after)
# - export function formatDate(date, format) { ... }
#
# +++/src/utils/date.js (new file)
# + export function formatDate(date, format) { ... }
#
# Step 2: Imports consolidated in 5 files
# - import { formatDate } from './helpers';
# + import { formatDate } from './date';
```

#### 4. Review and Apply

```bash
# If diffs look good, apply the changes
node tools/dev/js-edit.js --recipe recipes/move-date-utils.json --fix

# Output:
# ✓ Step 1: formatDate moved to src/utils/date.js
# ✓ Step 2: parseDate moved to src/utils/date.js
# ✓ Step 3: Consolidated imports (5 files updated)
# ✓ Step 4: Consolidated imports (parseDate, 2 files)
# ✓ Step 5: Health check passed (no issues)
# All changes applied successfully
```

#### 5. Verify Changes

```bash
# Check the new file
cat src/utils/date.js
# Output:
# export function formatDate(date, format) { ... }
# export function parseDate(dateStr) { ... }

# Check that imports updated
grep -r "from.*date" src/ | grep import

# Run tests to ensure nothing broke
npm test -- src/utils
```

---

## Multi-File Search & Replace

### Problem

You renamed a service class from `UserFetcher` to `UserService` and now need to update all references across the codebase (30+ files, 50+ call sites).

**Current state:**
```javascript
// src/api/UserFetcher.js
export class UserFetcher {
  async fetch(id) { }
}

// 30+ files have:
// import { UserFetcher } from './UserFetcher';
// const fetcher = new UserFetcher();
// const user = await fetcher.fetch(id);
```

### Step-by-Step Solution

#### 1. Locate the Class and Get Its Hash

```bash
node tools/dev/js-edit.js --file src/api/UserFetcher.js \
  --locate-function "UserFetcher" --json

# Output:
# {
#   "name": "UserFetcher",
#   "file": "src/api/UserFetcher.js",
#   "hash": "x1y2z3a4",
#   "span": { "start": 50, "end": 200 },
#   "exportKind": "named"
# }
```

#### 2. Find All Usage Sites

```bash
node tools/dev/js-scan.js --ripple-analysis "UserFetcher" \
  --file src/api/UserFetcher.js \
  --scope src/ --json

# Output tells you:
# - 30 files import it
# - 50 call sites
# - 12 test files cover it
# - It's exported (public API)
# - Risk: MEDIUM
```

#### 3. Create Recipe for Global Rename

```json
{
  "version": "1.0",
  "name": "Rename UserFetcher to UserService",
  "parameters": {
    "oldName": { "type": "string", "default": "UserFetcher" },
    "newName": { "type": "string", "default": "UserService" },
    "sourceFile": { "type": "file", "default": "src/api/UserFetcher.js" },
    "scope": { "type": "string", "default": "src/" }
  },
  "steps": [
    {
      "name": "Rename class declaration",
      "operation": "js-edit",
      "replace-function": "${oldName}",
      "file": "${sourceFile}",
      "rename": "${newName}",
      "emit": "class_renamed"
    },
    {
      "name": "Update all references globally",
      "operation": "js-edit",
      "rename-global": "${oldName}",
      "to": "${newName}",
      "search-scope": "${scope}",
      "exclude-patterns": ["*.backup.js"],
      "verify-hash": "${class_renamed.hash}",
      "emit": "rename_result"
    },
    {
      "name": "Consolidate imports",
      "operation": "js-edit",
      "consolidate-imports": "${newName}",
      "from-exports": "${sourceFile}",
      "canonical-path": "../api/UserService",
      "scope": "${scope}",
      "emit": "consolidate_result"
    }
  ]
}
```

#### 4. Preview the Scope

```bash
node tools/dev/js-edit.js --recipe rename-user-service.json \
  --param oldName="UserFetcher" \
  --param newName="UserService" \
  --dry-run --emit-summary

# Output:
# Step 1: Rename class in src/api/UserFetcher.js
# Step 2: Update 50 call sites across 30 files
# Step 3: Consolidate 30 import statements
# Total files affected: 31
# Total changes: 82 (1 declaration + 50 calls + 30 imports + 1 export update)
```

#### 5. Apply Changes

```bash
node tools/dev/js-edit.js --recipe rename-user-service.json \
  --param oldName="UserFetcher" \
  --param newName="UserService" \
  --fix

# Output:
# ✓ Renamed class declaration
# ✓ Updated 50 call sites across 30 files
# ✓ Consolidated imports (all now use canonical path)
# All 82 changes applied successfully
```

#### 6. Verification

```bash
# Verify no references to old name remain
grep -r "UserFetcher" src/ || echo "✓ All references updated"

# Run tests to ensure nothing broke
npm test

# Check git diff to see all changes
git diff --stat  # 31 files changed
```

---

## Multi-File Import Consolidation

### Problem

Your module `src/validators/email.js` is imported in inconsistent ways:

```javascript
// Some files use:
import { validateEmail } from '../validators/email.js';

// Others use:
import { validateEmail } from '../validators/email';

// And some use:
import validateEmail from '../validators/email';

// And some use absolute paths:
import { validateEmail } from 'src/validators/email';
```

This inconsistency makes refactoring harder and violates style guidelines.

### Step-by-Step Solution

#### 1. Scan to Find All Import Variations

```bash
node tools/dev/js-scan.js --cross-module-search \
  --pattern "import.*validateEmail" \
  --scope src/ \
  --json > tmp/import-variations.json

# Review the variations and count occurrences
```

#### 2. Create Consolidation Recipe

```json
{
  "version": "1.0",
  "name": "Consolidate email validator imports",
  "parameters": {
    "functionName": { "type": "string", "default": "validateEmail" },
    "sourceFile": { "type": "file", "default": "src/validators/email.js" },
    "canonicalPath": { "type": "string", "default": "../validators/email" },
    "scope": { "type": "string", "default": "src/" }
  },
  "steps": [
    {
      "name": "Find all import variations",
      "operation": "js-scan",
      "cross-module-search": "import.*${functionName}",
      "scope": "${scope}",
      "emit": "import_variations"
    },
    {
      "name": "Consolidate all imports to canonical path",
      "operation": "js-edit",
      "consolidate-imports": "${functionName}",
      "from-exports": "${sourceFile}",
      "canonical-path": "${canonicalPath}",
      "scope": "${scope}",
      "normalize-style": "es6-named",
      "emit": "consolidation_result"
    },
    {
      "name": "Verify consolidation",
      "operation": "js-scan",
      "cross-module-search": "import.*${functionName}",
      "scope": "${scope}",
      "emit": "verification"
    }
  ]
}
```

#### 3. Execute

```bash
node tools/dev/js-edit.js --recipe consolidate-imports.json \
  --param functionName="validateEmail" \
  --param canonicalPath="../validators/email" \
  --dry-run --emit-diff

# Shows all normalized imports

node tools/dev/js-edit.js --recipe consolidate-imports.json \
  --param functionName="validateEmail" \
  --fix

# ✓ Found 12 files with inconsistent imports
# ✓ Updated all to canonical path: ../validators/email
# ✓ Verified all imports are now consistent
```

---

## Extract to New Module

### Problem

Your `src/handlers/user.js` file has grown to 500+ lines and contains unrelated logic:
- User authentication
- User profile management
- User preferences handling

You want to split this into three focused modules:
- `src/handlers/auth.js`
- `src/handlers/profile.js`
- `src/handlers/preferences.js`

### Step-by-Step Solution

#### 1. Identify Functions to Extract

```bash
# List all functions in the file
node tools/dev/js-edit.js --file src/handlers/user.js \
  --list-functions --json

# Output:
# [
#   { "name": "login", "kind": "export", "line": 10 },
#   { "name": "logout", "kind": "export", "line": 25 },
#   { "name": "getProfile", "kind": "export", "line": 40 },
#   { "name": "updateProfile", "kind": "export", "line": 55 },
#   { "name": "getPreferences", "kind": "export", "line": 100 },
#   { "name": "updatePreferences", "kind": "export", "line": 120 },
#   ...
# ]
```

#### 2. Create Extraction Recipe

```json
{
  "version": "1.0",
  "name": "Extract handler functions to focused modules",
  "steps": [
    {
      "name": "Extract auth functions",
      "operation": "js-edit",
      "extract-to-module": "src/handlers/auth.js",
      "functions": ["login", "logout", "refreshToken"],
      "from": "src/handlers/user.js",
      "include-deps": true,
      "update-all-imports": true,
      "emit": "auth_extracted"
    },
    {
      "name": "Extract profile functions",
      "operation": "js-edit",
      "extract-to-module": "src/handlers/profile.js",
      "functions": ["getProfile", "updateProfile", "deleteProfile"],
      "from": "src/handlers/user.js",
      "include-deps": true,
      "update-all-imports": true,
      "emit": "profile_extracted"
    },
    {
      "name": "Extract preference functions",
      "operation": "js-edit",
      "extract-to-module": "src/handlers/preferences.js",
      "functions": ["getPreferences", "updatePreferences", "resetPreferences"],
      "from": "src/handlers/user.js",
      "include-deps": true,
      "update-all-imports": true,
      "emit": "prefs_extracted"
    },
    {
      "name": "Create barrel export for backward compatibility",
      "operation": "js-edit",
      "add-to-file": "src/handlers/user.js",
      "content": "// Re-export for backward compatibility\nexport * from './auth';\nexport * from './profile';\nexport * from './preferences';",
      "emit": "barrel_created"
    },
    {
      "name": "Update index file",
      "operation": "js-edit",
      "consolidate-imports": true,
      "scope": "src/",
      "emit": "index_updated"
    }
  ]
}
```

#### 3. Execute and Verify

```bash
# Preview changes
node tools/dev/js-edit.js --recipe extract-handlers.json \
  --dry-run --emit-diff

# Apply changes
node tools/dev/js-edit.js --recipe extract-handlers.json --fix

# Verify files were created
ls -la src/handlers/
# auth.js
# profile.js
# preferences.js
# user.js (now mostly re-exports)

# Run tests
npm test -- src/handlers

# Check that imports still work
grep -r "from.*handlers" src/ | head -20
```

---

## Complex Scenarios

### Scenario: Multi-Step Refactor with Verification

Complex refactors often need intermediate steps with verification:

```json
{
  "version": "1.0",
  "name": "Large API refactor with phases",
  "phases": [
    {
      "name": "Phase 1: Analysis & Validation",
      "steps": [
        {
          "operation": "js-scan",
          "health-check": true,
          "scope": "src/api",
          "emit": "baseline"
        }
      ]
    },
    {
      "name": "Phase 2: Extract common logic",
      "steps": [
        {
          "operation": "js-edit",
          "extract-to-module": "src/api/middleware/errorHandler.js",
          "functions": ["handleErrors", "formatErrors"],
          "from": "src/api/handlers.js",
          "update-all-imports": true,
          "emit": "errors_extracted"
        }
      ]
    },
    {
      "name": "Phase 3: Verify",
      "steps": [
        {
          "operation": "js-scan",
          "health-check": true,
          "scope": "src/api",
          "emit": "health_after_extraction"
        }
      ]
    },
    {
      "name": "Phase 4: Consolidate imports",
      "steps": [
        {
          "operation": "js-edit",
          "consolidate-imports": true,
          "scope": "src/api"
        }
      ]
    }
  ]
}
```

### Scenario: Conditional Extraction

Extract functions only if they meet certain criteria:

```json
{
  "steps": [
    {
      "name": "Find unused internal functions",
      "operation": "js-scan",
      "ripple-analysis": "*",
      "file": "src/module.js",
      "scope": "src/",
      "emit": "analysis"
    },
    {
      "name": "Extract only unused functions",
      "condition": "${analysis.unused_functions.length > 0}",
      "operation": "js-edit",
      "remove-functions": "${analysis.unused_functions}",
      "from": "src/module.js",
      "emit": "cleanup"
    }
  ]
}
```

---

## Troubleshooting Multi-File Operations

### Common Issues

#### 1. "Import path resolution failed"

**Error:**
```
Error: Could not resolve import path ../utils/helpers
```

**Solution:**
```bash
# Check if the file exists
ls src/utils/helpers.js

# Verify the relative path from source to target
node -e "console.log(require('path').relative(
  'src/handlers',
  'src/utils/helpers.js'
))"
# Output: ../utils/helpers

# Use the correct path in recipe
```

#### 2. "Circular dependency detected"

**Error:**
```
Error: Circular dependency: A → B → C → A
```

**Solution:**
- Move function to shared module instead
- Extract shared code to new module that doesn't import from either
- Review architecture for circular imports

#### 3. "Update failed: 5 files, 1 succeeded"

**Error:**
```
Partial failure in batch operation
✓ src/a.js updated
✗ src/b.js failed (syntax error)
✗ src/c.js failed (import not found)
```

**Solution:**
```bash
# Revert changes
node tools/dev/js-edit.js --rollback-last

# Fix issues one by one
node tools/dev/js-edit.js --file src/b.js --lint

# Re-run with updated recipe
```

#### 4. "Too many files affected"

**Error:**
```
Consolidation would affect 500+ files
Aborting for safety (use --force to override)
```

**Solution:**
```bash
# Review impact first
node tools/dev/js-edit.js --recipe recipe.json \
  --dry-run --emit-summary

# Split into smaller batches
node tools/dev/js-edit.js --recipe recipe.json \
  --scope "src/api" --dry-run  # API layer only

node tools/dev/js-edit.js --recipe recipe.json \
  --scope "src/services" --fix  # Services layer

# Or use --force if confident
node tools/dev/js-edit.js --recipe recipe.json --force --fix
```

### Debugging Strategies

**1. Start with dry-run:**
```bash
node tools/dev/js-edit.js --recipe recipe.json --dry-run --emit-diff
```

**2. Check individual steps:**
```bash
# Test just the first step
node tools/dev/js-edit.js --recipe recipe.json \
  --steps "1" --dry-run
```

**3. Review generated files:**
```bash
# Look at actual generated content
node tools/dev/js-edit.js --file target.js --context-function "myFunc"
```

**4. Enable detailed logging:**
```bash
DEBUG=js-edit:* node tools/dev/js-edit.js --recipe recipe.json \
  --verbose --dry-run
```

---

## Tips for Success

1. **Always dry-run first** — Preview diffs before applying
2. **Use recipes** — Reusable, testable, shareable
3. **Break into phases** — Easier to debug and verify
4. **Test after each step** — Catch issues early
5. **Check git diffs** — Verify changes are correct before commit
6. **Use version control** — Easy rollback if something goes wrong

