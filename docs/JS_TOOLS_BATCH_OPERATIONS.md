# Batch Operations Architecture & Guide

**Date:** November 11, 2025  
**Purpose:** Detailed explanation of batch operations, error handling, rollback capability, and manifest format

This guide explains how to safely execute large-scale transformations across multiple files using batch mode, with emphasis on safety features and error recovery.

---

## Table of Contents

1. [Batch Operations Overview](#batch-operations-overview)
2. [Batch Mode Architecture](#batch-mode-architecture)
3. [Manifest Format](#manifest-format)
4. [Error Handling Strategy](#error-handling-strategy)
5. [Rollback Mechanism](#rollback-mechanism)
6. [Command Reference](#command-reference)
7. [Practical Examples](#practical-examples)
8. [Performance Optimization](#performance-optimization)

---

## Batch Operations Overview

### What Is Batch Mode?

Batch mode applies the same transformation to multiple files in a single operation. Instead of:

```bash
# Manual approach (tedious):
js-edit --file file1.js --add-import "logger" --fix
js-edit --file file2.js --add-import "logger" --fix
js-edit --file file3.js --add-import "logger" --fix
# ... repeat 50 times
```

You do:
```bash
# Batch approach (one command):
js-edit --batch --pattern "src/**/*.handler.js" \
  --add-import "const logger = require('../log');" \
  --fix --emit-summary
```

### Batch vs. Recipe

| Feature | Batch Mode | Recipe Mode |
|---------|-----------|------------|
| **Use case** | Same transformation, many files | Complex multi-step workflow |
| **Command count** | 1 | 1 (but executes many steps) |
| **Reusability** | Manual parameter passing | Save recipe file, reuse later |
| **Flexibility** | Fixed transformation | Conditional logic, data flow |
| **Error handling** | Per-file tracking | Per-step error handling |
| **Best for** | Quick, uniform changes | Planned, coordinated refactors |

---

## Batch Mode Architecture

### Execution Pipeline

```
1. Parse Arguments
   ↓
2. Build File Pattern
   ↓
3. Validate Pattern (dry-run)
   ↓
4. Pre-Batch Checks
   ├─ File access verification
   ├─ Pattern match count check
   └─ Syntax validation on samples
   ↓
5. Enter Transaction Context (optional)
   ├─ Setup rollback tracking
   ├─ Create backup directory
   └─ Initialize manifest
   ↓
6. For Each Matched File:
   ├─ Load file
   ├─ Parse AST
   ├─ Apply transformation
   ├─ Validate result
   ├─ Track status (success/fail)
   └─ Store diff/error
   ↓
7. Commit or Rollback
   ├─ If all succeeded: write all changes
   ├─ If partial failure: rollback all
   └─ Generate summary manifest
   ↓
8. Report Results
   ├─ Print summary
   ├─ Save detailed manifest
   └─ Suggest next steps
```

### Transaction Context

Batch operations support atomic semantics (all-or-nothing):

```bash
# Atomic batch (default):
# If ANY file fails, ALL changes are rolled back
js-edit --batch --pattern "src/**/*.js" \
  --transformation "..." \
  --atomic --fix

# Best effort (continue on error):
js-edit --batch --pattern "src/**/*.js" \
  --transformation "..." \
  --on-error continue --fix
```

### Parallel Execution Strategy

For large batches, files are processed in parallel when safe:

```bash
# Parallel execution (default, configurable):
js-edit --batch --pattern "src/**/*.js" \
  --max-parallel 4 \  # 4 files at once
  --transformation "..." \
  --fix

# Single-threaded (safe for dependent transformations):
js-edit --batch --pattern "src/**/*.js" \
  --sequential \
  --transformation "..." \
  --fix
```

---

## Manifest Format

### Manifest Structure

After a batch operation, a manifest file is created documenting all changes:

```json
{
  "version": "1.0",
  "metadata": {
    "timestamp": "2025-11-11T14:30:45Z",
    "operationId": "20251111-143045-batch-add-logger",
    "command": "js-edit --batch --pattern 'src/**/*.handler.js' --add-import ...",
    "user": "agent",
    "branch": "main",
    "dryRun": false
  },
  "configuration": {
    "pattern": "src/**/*.handler.js",
    "exclude": "*.test.js,*.mock.js",
    "transformation": "add-import",
    "transformationParams": {
      "import": "const { logger } = require('../log');",
      "insertAfter": "^use strict"
    },
    "mode": "atomic",
    "maxParallel": 4
  },
  "summary": {
    "filesMatched": 12,
    "filesProcessed": 12,
    "succeeded": 12,
    "failed": 0,
    "skipped": 0,
    "totalChanges": 12
  },
  "results": [
    {
      "file": "src/api/users.handler.js",
      "status": "success",
      "changes": {
        "added": 1,
        "removed": 0,
        "modified": 0
      },
      "diff": {
        "before": "#!/usr/bin/env node\n'use strict';",
        "after": "#!/usr/bin/env node\n'use strict';\nconst { logger } = require('../log');"
      },
      "validation": {
        "syntaxValid": true,
        "importsValid": true,
        "guardrails": {
          "hash": "abc123",
          "span": { "start": 0, "end": 50 }
        }
      }
    },
    {
      "file": "src/api/products.handler.js",
      "status": "success",
      "changes": { "added": 1, "removed": 0, "modified": 0 },
      "diff": { ... }
    },
    // ... more files
  ],
  "rollbackInfo": {
    "canRollback": true,
    "rollbackId": "20251111-143045-batch-add-logger",
    "backupLocation": ".js-edit-rollback/20251111-143045-batch-add-logger/",
    "originalHashes": {
      "src/api/users.handler.js": "xyzabc123",
      "src/api/products.handler.js": "xyzdef456"
    }
  },
  "suggestions": [
    "All 12 files updated successfully",
    "Run 'npm test' to verify changes",
    "Review diffs: git diff --stat",
    "If issues arise, run: js-edit --rollback 20251111-143045-batch-add-logger"
  ]
}
```

### Manifest Properties

| Property | Type | Description |
|----------|------|-------------|
| `version` | string | Manifest format version |
| `metadata` | object | When, how, by whom |
| `configuration` | object | What transformation was applied |
| `summary` | object | Counts (succeeded, failed, etc.) |
| `results` | array | Per-file details with diffs |
| `rollbackInfo` | object | Data needed for rollback |
| `suggestions` | array | Recommended next steps |

### Aggregated Manifest

For batch operations with multiple transformation types:

```json
{
  "operation": "batch-mixed-transformations",
  "phases": [
    {
      "phase": 1,
      "transformation": "add-import",
      "files": 12,
      "succeeded": 12
    },
    {
      "phase": 2,
      "transformation": "rename-function",
      "files": 12,
      "succeeded": 10,
      "failed": 2,
      "errors": [...]
    }
  ],
  "totalFilesAffected": 12,
  "totalChanges": 24
}
```

---

## Error Handling Strategy

### Error Types

| Error Type | Severity | Behavior | Recovery |
|-----------|----------|----------|----------|
| **Syntax Error** | Critical | Stop (atomic) or skip (best-effort) | Fix file manually or rollback |
| **Import Error** | High | Stop (atomic) or skip | Verify import paths |
| **Pattern Not Found** | Low | Skip file (pattern optional) | Review pattern, adjust |
| **File Access** | Critical | Stop | Check permissions, file exists |
| **AST Parse Error** | High | Stop or skip | Check syntax, try linting first |

### Error Handling Modes

#### 1. Atomic Mode (Default - Safe)

```bash
# If ANY file fails, roll back ALL changes
js-edit --batch --pattern "src/**/*.js" \
  --transformation "..." \
  --atomic --fix

# Behavior:
# ✗ File 1: SUCCESS
# ✗ File 2: SUCCESS
# ✗ File 3: FAILED (syntax error)
# ✗ File 4: SKIPPED (rolled back due to atomic mode)
# Result: All changes reverted, no files modified
```

**Use when:**
- Changes must be consistent across all files
- Failure in one file means batch is invalid
- Running in CI/CD pipeline

#### 2. Best-Effort Mode

```bash
# Skip failed files, continue with others
js-edit --batch --pattern "src/**/*.js" \
  --transformation "..." \
  --on-error continue --fix

# Behavior:
# ✓ File 1: SUCCESS (written)
# ✓ File 2: SUCCESS (written)
# ✗ File 3: FAILED (NOT written, error logged)
# ✓ File 4: SUCCESS (written)
# Result: 3 files modified, 1 skipped with error report
```

**Use when:**
- Some failures are expected (old syntax, exceptions)
- Partial success is acceptable
- Manual cleanup is OK for failed files

#### 3. Strict Mode

```bash
# Fail on any warning, not just errors
js-edit --batch --pattern "src/**/*.js" \
  --transformation "..." \
  --strict --fix

# Behavior:
# ✓ File 1: SUCCESS (all checks pass)
# ✗ File 2: FAILED (warning: unused import created)
# Result: Stop, print detailed warnings
```

**Use when:**
- Code quality standards are strict
- Need to fix all issues in one pass

### Error Recovery

```bash
# 1. Check what failed
node tools/dev/js-edit.js --manifest-report tmp/manifest.json \
  --filter "status=failed" --json

# 2. Fix the failed files manually
editor src/failing-file.js

# 3. Retry the batch
node tools/dev/js-edit.js --batch --pattern "src/**/*.js" \
  --transformation "..." \
  --skip-succeeded --fix  # Only process previously failed files

# 4. Or rollback everything and retry
node tools/dev/js-edit.js --rollback 20251111-143045-batch-op
node tools/dev/js-edit.js --batch --pattern "src/**/*.js" \
  --transformation "..." --fix
```

---

## Rollback Mechanism

### How Rollback Works

1. **Before batch execution:**
   - Creates rollback ID (timestamp-based)
   - Creates directory `.js-edit-rollback/<rollback-id>/`
   - Stores original file contents before any changes

2. **During batch execution:**
   - Each successful write is tracked
   - Manifest records file hashes before/after

3. **After batch execution:**
   - If success: manifests kept, backups can be cleaned up
   - If failure: can restore from backups

### Rollback Commands

```bash
# List recent rollback points
js-edit --rollback-list

# Rollback most recent operation
js-edit --rollback-last

# Rollback specific operation
js-edit --rollback "20251111-143045-batch-add-logger"

# Partial rollback (specific files only)
js-edit --rollback "20251111-143045-batch-add-logger" \
  --files "src/api/users.handler.js,src/api/products.handler.js"

# Preview rollback without applying
js-edit --rollback "20251111-143045-batch-add-logger" \
  --dry-run --emit-diff
```

### Rollback Storage

```
.js-edit-rollback/
├── 20251111-143045-batch-add-logger/
│   ├── manifest.json
│   ├── original-hashes.json
│   └── backups/
│       ├── src-api-users.handler.js
│       ├── src-api-products.handler.js
│       └── ... (copy of each modified file)
├── 20251111-150000-rename-global/
│   ├── manifest.json
│   ├── original-hashes.json
│   └── backups/
└── ...
```

### Rollback Cleanup

```bash
# Clean up old rollback data (keep last 10)
js-edit --cleanup-rollbacks --keep 10

# Remove specific rollback
js-edit --rollback-delete "20251111-143045-batch-add-logger"

# Show rollback storage size
du -sh .js-edit-rollback/
```

### Safety Guarantees

- **Rollback is atomic:** Either all files restored or none
- **Data is immutable:** Backups are read-only until cleanup
- **Hash verification:** Validates file hasn't changed since backup
- **Automatic cleanup:** Old rollbacks deleted after configured period (default 30 days)

---

## Command Reference

### Basic Batch Syntax

```bash
js-edit --batch \
  --pattern <filePattern> \
  --<transformation> <args> \
  [--exclude <patterns>] \
  [--on-error atomic|continue|strict] \
  [--dry-run] \
  [--emit-diff] \
  [--emit-summary] \
  [--enable-rollback] \
  [--fix]
```

### Common Batch Transformations

#### Add Import

```bash
js-edit --batch --pattern "src/**/*.js" \
  --add-import "const { logger } = require('../log');" \
  --insert-after "^use strict" \
  --skip-if-exists \
  --fix
```

#### Remove Import

```bash
js-edit --batch --pattern "src/**/*.js" \
  --remove-import "oldModule" \
  --remove-unused \
  --fix
```

#### Replace Function Call

```bash
js-edit --batch --pattern "src/**/*.js" \
  --replace-calls "console.log" \
  --to "logger.debug" \
  --fix
```

#### Rename Function

```bash
js-edit --batch --pattern "src/**/*.js" \
  --rename-function "oldName" \
  --to "newName" \
  --verify-hash <hash> \
  --fix
```

#### Update Signature

```bash
js-edit --batch --pattern "src/**/*.handler.js" \
  --update-signature "handler(req, res)" \
  --to "handler(req, res, next)" \
  --update-calls \
  --fix
```

#### Add Wrapper

```bash
js-edit --batch --pattern "src/**/*.js" \
  --wrap-calls "fetch" \
  --with "withErrorHandler(fetch)" \
  --fix
```

---

## Practical Examples

### Example 1: Add Logger Import to All Handlers

**Goal:** Add logger import to 20 handler files, skip if already present

```bash
js-edit --batch --pattern "src/**/*.handler.js" \
  --exclude "*.test.js" \
  --add-import "const { logger } = require('../utils/logger');" \
  --insert-after "^use strict" \
  --skip-if-exists \
  --dry-run --emit-diff

# Review diffs, then apply:
js-edit --batch --pattern "src/**/*.handler.js" \
  --exclude "*.test.js" \
  --add-import "const { logger } = require('../utils/logger');" \
  --insert-after "^use strict" \
  --skip-if-exists \
  --enable-rollback \
  --fix --emit-summary
```

**Manifest shows:**
```
20 files matched
20 files processed
20 succeeded
0 failed

Can rollback with: js-edit --rollback <id>
```

### Example 2: Remove Deprecated Function Calls

**Goal:** Replace all calls to deprecated `format()` with `formatNew()`

```bash
# First, verify the pattern
js-edit --batch --pattern "src/**/*.js" \
  --search-calls "format" \
  --dry-run --max-results 100

# Then replace
js-edit --batch --pattern "src/**/*.js" \
  --replace-calls "format(" \
  --to "formatNew(" \
  --exclude "*.test.js,*.mock.js,deprecated/*" \
  --enable-rollback \
  --fix --emit-summary

# If tests fail, rollback:
js-edit --rollback-last
```

### Example 3: Update Function Signatures

**Goal:** Add `async` to 15 handler functions and update call sites

```bash
js-edit --batch --pattern "src/api/**/*.js" \
  --update-signature "handler(req, res)" \
  --to "async handler(req, res)" \
  --update-calls \
  --strict \
  --enable-rollback \
  --dry-run

# Review diffs thoroughly, then:
js-edit --batch --pattern "src/api/**/*.js" \
  --update-signature "handler(req, res)" \
  --to "async handler(req, res)" \
  --update-calls \
  --enable-rollback \
  --fix
```

---

## Performance Optimization

### Batch Size Recommendations

| File Count | Recommended Approach | Parallel Jobs | Expected Time |
|-----------|----------------------|---------------|---------------|
| 1-5 files | Single operation | 1 | <1s |
| 5-20 files | Batch, atomic | 4 | 1-2s |
| 20-100 files | Batch, best-effort | 8 | 3-10s |
| 100-1000 files | Multiple smaller batches | 8+ | 10-30s per batch |
| 1000+ files | Staged approach | 16+ | Minutes, with phases |

### Large-Scale Refactors

For massive refactors (1000+ files), stage the changes:

```bash
# Phase 1: Core modules (50 files)
js-edit --batch --pattern "src/core/**/*.js" --transformation X --fix

# Phase 2: API layer (200 files)
js-edit --batch --pattern "src/api/**/*.js" --transformation X --fix

# Phase 3: Services (300 files)
js-edit --batch --pattern "src/services/**/*.js" --transformation X --fix

# Phase 4: Handlers (500 files)
js-edit --batch --pattern "src/handlers/**/*.js" --transformation X --fix

# Run tests after each phase
npm test
```

### Parallel Execution Tuning

```bash
# Too many parallel jobs = CPU thrashing, slow
js-edit --batch --pattern "src/**/*.js" \
  --max-parallel 128 --fix

# Good balance (use half your CPU cores)
js-edit --batch --pattern "src/**/*.js" \
  --max-parallel 4 --fix  # On 8-core machine

# CPU-heavy transformation = fewer parallel jobs
js-edit --batch --pattern "src/**/*.js" \
  --max-parallel 2 \  # More AST parsing = less parallelism
  --fix

# I/O-heavy transformation = more parallel jobs
js-edit --batch --pattern "src/**/*.js" \
  --max-parallel 16 \  # File writes are fast
  --fix
```

### Caching for Speed

```bash
# First batch pass (cold cache)
time js-edit --batch --pattern "src/**/*.js" \
  --transformation X --use-cache --dry-run
# Real: 12s, User: 11s, Sys: 1s

# Second batch pass (warm cache)
time js-edit --batch --pattern "src/**/*.js" \
  --transformation X --use-cache --dry-run
# Real: 3s, User: 2.8s, Sys: 0.2s  (4x faster!)

# Clear cache if needed
js-edit --clear-cache
```

---

## Troubleshooting Batch Operations

### "Some files failed, rolling back all changes"

```bash
# Review the failed files
js-edit --manifest-report tmp/manifest.json --failures-only

# Check error messages
cat tmp/manifest.json | jq '.results[] | select(.status=="failed")'

# Fix the issues
# Then retry with --skip-succeeded to only fix failures
```

### "Batch taking too long"

```bash
# Reduce parallel jobs
js-edit --batch --pattern "src/**/*.js" \
  --max-parallel 2 --fix

# Or reduce file count
js-edit --batch --pattern "src/api/**/*.js" \
  --max-parallel 4 --fix
```

### "Out of memory with large batches"

```bash
# Split into smaller batches
js-edit --batch --pattern "src/a/**/*.js" --fix
js-edit --batch --pattern "src/b/**/*.js" --fix

# Or process sequentially
js-edit --batch --pattern "src/**/*.js" \
  --sequential --fix
```

