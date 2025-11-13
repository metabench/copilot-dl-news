# Recipe Format Specification & Guide

**Date:** November 11, 2025  
**Purpose:** Detailed specification for the refactor recipe system that chains js-edit and js-scan operations

This guide explains how to write, compose, and execute refactor recipes—reusable sequences of operations that solve complex refactoring tasks in a single command.

---

## Table of Contents

1. [Overview](#overview)
2. [Recipe Structure](#recipe-structure)
3. [Operation Reference](#operation-reference)
4. [Data Flow & Variables](#data-flow--variables)
5. [Conditional Logic](#conditional-logic)
6. [Built-in Recipes](#built-in-recipes)
7. [Advanced Techniques](#advanced-techniques)
8. [Troubleshooting](#troubleshooting)

---

## Overview

### What Is a Recipe?

A recipe is a declarative JSON/YAML file that chains multiple js-edit and js-scan operations into a single reusable workflow. Each step can feed its output to the next step, enabling complex refactorings without manual orchestration.

### Recipe Execution

```bash
# Execute a recipe with default parameters
node tools/dev/js-edit.js --recipe recipes/rename-and-move.json --fix

# Execute with parameter overrides
node tools/dev/js-edit.js --recipe recipes/extract-service.json \
  --param function-name="processOrder" \
  --param target-module="src/services/OrderService.js" \
  --fix

# Dry-run with diffs
node tools/dev/js-edit.js --recipe recipes/large-refactor.json \
  --dry-run --emit-diff --emit-summary
```

### Recipes vs. CLI Commands

| Scenario | Approach |
|----------|----------|
| Single, simple operation | Direct CLI command |
| 2-3 related operations | CLI composition/script |
| Complex, multi-step refactor | Recipe file |
| Team-shared workflows | Recipe library |
| Parameterized refactors | Recipe with variables |

---

## Recipe Structure

### Basic Schema

```json
{
  "version": "1.0",
  "name": "Extract and consolidate utility module",
  "description": "Move related functions to new module and update all imports",
  "parameters": {
    "sourceFile": {
      "type": "string",
      "description": "File to extract functions from",
      "default": "src/utils/index.js"
    },
    "functions": {
      "type": "array",
      "description": "Functions to extract",
      "default": []
    }
  },
  "steps": [
    {
      "name": "Discover usage sites",
      "operation": "js-scan",
      "search": "${functions[0]}",
      "scope": "src/",
      "emit": "usage_sites"
    },
    {
      "name": "Move function",
      "operation": "js-edit",
      "move-function": "${functions[0]}",
      "from": "${sourceFile}",
      "to": "src/utils/${functions[0]}.js",
      "trace-deps": true,
      "emit": "move_result"
    }
  ]
}
```

### Root-Level Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `version` | string | Yes | Recipe format version (currently "1.0") |
| `name` | string | Yes | Human-readable name for the recipe |
| `description` | string | No | Detailed description of what the recipe does |
| `parameters` | object | No | Parameterization schema (see below) |
| `steps` | array | Yes | Array of operation steps |
| `validation` | object | No | Pre-execution checks (see below) |

### Parameters

Parameters allow recipes to be reused with different inputs:

```json
{
  "parameters": {
    "functionName": {
      "type": "string",
      "description": "Name of function to rename",
      "default": "oldName",
      "required": true
    },
    "newName": {
      "type": "string",
      "description": "New function name",
      "required": true
    },
    "scope": {
      "type": "string",
      "description": "Directory scope for search",
      "default": "src/"
    },
    "excludePatterns": {
      "type": "array",
      "description": "Patterns to exclude",
      "default": ["*.test.js", "*.mock.js"]
    }
  }
}
```

**Parameter types:**
- `string` — Plain text value
- `number` — Numeric value
- `boolean` — True/false
- `array` — List of values
- `file` — File path (validated to exist)
- `directory` — Directory path (validated to exist)

**Variable substitution in steps:**
```json
{
  "steps": [
    {
      "replace-function": "${functionName}",
      "to": "${newName}",
      "scope": "${scope}"
    }
  ]
}
```

### Validation

Pre-execution validation ensures the recipe can run safely:

```json
{
  "validation": {
    "checkFiles": [
      "src/utils/helpers.js",
      "src/api/handlers.js"
    ],
    "checkDependencies": ["lodash", "axios"],
    "checkDirExists": ["src/", "tests/"],
    "preflightChecks": [
      {
        "type": "file-contains",
        "file": "src/index.js",
        "pattern": "export.*processData"
      }
    ]
  }
}
```

---

## Operation Reference

### js-scan Operations

#### search
Discover functions matching a search term.

```json
{
  "name": "Find usage sites",
  "operation": "js-scan",
  "search": "${functionName}",
  "scope": "src/",
  "exclude-path": "*.test.js",
  "emit": "search_results"
}
```

**Available options:**
- `search` (required) — Search term
- `scope` — Directory to search
- `exclude-path` — Patterns to exclude
- `include-deprecated` — Include deprecated files
- `emit` — Variable name to store results

**Output structure:**
```json
{
  "search_results": {
    "matches": [
      { "file": "src/api.js", "name": "processData", "hash": "abc123", "line": 10 },
      { "file": "src/worker.js", "name": "processData", "hash": "abc123", "line": 45 }
    ],
    "count": 2
  }
}
```

#### find-hash
Resolve a hash to a specific function.

```json
{
  "name": "Locate function by hash",
  "operation": "js-scan",
  "find-hash": "abc123def456",
  "scope": "src/",
  "emit": "hash_location"
}
```

#### ripple-analysis
Analyze impact of changes to a function.

```json
{
  "name": "Analyze ripple effects",
  "operation": "js-scan",
  "ripple-analysis": "${functionName}",
  "file": "${sourceFile}",
  "scope": "src/",
  "emit": "ripple_report"
}
```

**Output includes:**
- Call sites and usage locations
- Test coverage information
- Risk assessment (safe to modify? safe to remove?)
- Suggestion for impact zones

### js-edit Operations

#### locate-function
Find a function and return guard metadata.

```json
{
  "name": "Locate target function",
  "operation": "js-edit",
  "locate-function": "${functionName}",
  "file": "${sourceFile}",
  "emit": "location_data"
}
```

**Output:**
```json
{
  "location_data": {
    "file": "src/utils/helpers.js",
    "name": "processData",
    "hash": "abc123",
    "span": { "start": 100, "end": 500 },
    "line": 10,
    "column": 2
  }
}
```

#### move-function
Move a function from one file to another.

```json
{
  "name": "Move function to new module",
  "operation": "js-edit",
  "move-function": "${functionName}",
  "from": "${sourceFile}",
  "to": "${targetFile}",
  "insert-before": "export function validate",
  "trace-deps": true,
  "update-calls": true,
  "emit": "move_result"
}
```

**Options:**
- `move-function` (required) — Function name to move
- `from` (required) — Source file
- `to` (required) — Target file
- `insert-before` — Insert before this pattern
- `insert-after` — Insert after this pattern
- `trace-deps` — Include dependency analysis
- `update-calls` — Update call sites in source file

#### extract-to-module
Extract multiple functions to a new module.

```json
{
  "name": "Extract utilities",
  "operation": "js-edit",
  "extract-to-module": "${newModulePath}",
  "functions": "${functionList}",
  "from": "${sourceFile}",
  "include-deps": true,
  "update-all-imports": true,
  "emit": "extraction_result"
}
```

#### replace-across-files
Rename or update a function globally.

```json
{
  "name": "Rename function globally",
  "operation": "js-edit",
  "rename-global": "${functionName}",
  "to": "${newName}",
  "search-scope": "src/",
  "exclude-patterns": ["*.test.js"],
  "emit": "rename_result"
}
```

#### batch
Apply the same transformation to multiple files.

```json
{
  "name": "Add logger import to all API files",
  "operation": "js-edit",
  "batch": true,
  "pattern": "src/**/*.handler.js",
  "exclude": "*.test.js",
  "add-import": "const { logger } = require('../utils/log');",
  "insert-after": "^use strict",
  "skip-if-exists": true,
  "emit": "batch_result"
}
```

#### consolidate-imports
Normalize imports across files.

```json
{
  "name": "Consolidate imports",
  "operation": "js-edit",
  "consolidate-imports": "${moduleName}",
  "from-exports": "${moduleFile}",
  "canonical-path": "${canonicalPath}",
  "scope": "src/",
  "emit": "consolidate_result"
}
```

---

## Data Flow & Variables

### Step-to-Step Communication

Each step can emit results that subsequent steps consume:

```json
{
  "steps": [
    {
      "name": "Step 1: Find functions",
      "operation": "js-scan",
      "search": "format",
      "scope": "src/",
      "emit": "found_functions"
    },
    {
      "name": "Step 2: Use first match",
      "operation": "js-edit",
      "locate-function": "${found_functions.matches[0].name}",
      "file": "${found_functions.matches[0].file}",
      "emit": "located"
    },
    {
      "name": "Step 3: Extract first located function",
      "operation": "js-edit",
      "extract-function": "${located.name}",
      "file": "${located.file}",
      "output": "tmp/${located.name}.js"
    }
  ]
}
```

### Variable Access

Variables are accessed using `${path.to.value}` syntax:

```
${functionName}                 # Direct parameter
${found_functions.matches}      # Nested object access
${found_functions.matches[0]}   # Array indexing
${found_functions.count}        # Property access
${found_functions.matches[*].name}  # Map over array (returns array)
```

### Built-in Variables

These are available in all recipes:

| Variable | Example | Description |
|----------|---------|-------------|
| `${NOW}` | `2025-11-11T14:30:00Z` | Current timestamp |
| `${TODAY}` | `2025-11-11` | Current date |
| `${WORKSPACE}` | `/home/user/project` | Workspace root |
| `${BRANCH}` | `feature/refactor` | Current git branch |

### Aggregating Results

Collect results from multiple steps:

```json
{
  "steps": [
    {
      "operation": "js-scan",
      "search": "processData",
      "scope": "src/",
      "emit": "process_data_refs"
    },
    {
      "operation": "js-scan",
      "search": "formatData",
      "scope": "src/",
      "emit": "format_data_refs"
    }
  ],
  "aggregateOutput": {
    "allRefs": ["${process_data_refs.matches}", "${format_data_refs.matches}"]
  }
}
```

---

## Conditional Logic

### Step Conditions

Skip or repeat steps based on results:

```json
{
  "steps": [
    {
      "name": "Check if function exists",
      "operation": "js-scan",
      "search": "${functionName}",
      "scope": "${sourceFile}",
      "emit": "existence_check"
    },
    {
      "name": "Move only if function found",
      "operation": "js-edit",
      "move-function": "${functionName}",
      "from": "${sourceFile}",
      "to": "${targetFile}",
      "condition": "${existence_check.count > 0}"
    },
    {
      "name": "Report if not found",
      "operation": "report",
      "message": "Function not found, skipping move",
      "condition": "${existence_check.count == 0}"
    }
  ]
}
```

**Condition syntax:**
- Comparisons: `==`, `!=`, `>`, `<`, `>=`, `<=`
- Logical: `&&`, `||`, `!`
- Array: `.length`, `.count`, `.includes(value)`
- String: `.includes(substring)`

### Loops

Repeat an operation for each item in an array:

```json
{
  "steps": [
    {
      "name": "Find all handlers",
      "operation": "js-scan",
      "pattern": "handler",
      "scope": "src/api",
      "emit": "handlers"
    },
    {
      "name": "Update each handler signature",
      "operation": "js-edit",
      "forEach": "${handlers.matches}",
      "item": "handler",
      "steps": [
        {
          "replace-signature": "${handler.name}",
          "from": "(req, res)",
          "to": "(req, res, next)"
        }
      ]
    }
  ]
}
```

### Error Handling

Control behavior when errors occur:

```json
{
  "steps": [
    {
      "operation": "js-edit",
      "move-function": "critical",
      "from": "src/critical.js",
      "to": "src/moved/critical.js",
      "onError": "abort",
      "description": "Stop recipe if this fails"
    },
    {
      "operation": "js-edit",
      "consolidate-imports": "utils",
      "scope": "src/",
      "onError": "continue",
      "description": "Continue if this fails"
    }
  ]
}
```

**Options:** `abort` (stop recipe), `continue` (skip and go to next), `retry` (try again)

---

## Built-in Recipes

The framework includes a recipe library for common tasks:

### recipes/rename-globally.json
Rename a function across all files.

```bash
node tools/dev/js-edit.js --recipe recipes/rename-globally.json \
  --param oldName="fetchData" \
  --param newName="fetchUserData" \
  --fix
```

### recipes/move-and-update.json
Move function with automatic import updates.

```bash
node tools/dev/js-edit.js --recipe recipes/move-and-update.json \
  --param function="processOrder" \
  --param fromFile="src/orders.js" \
  --param toFile="src/services/OrderService.js" \
  --fix
```

### recipes/extract-service.json
Extract related functions to new service module.

```bash
node tools/dev/js-edit.js --recipe recipes/extract-service.json \
  --param functions="validateUser,createUser,updateUser" \
  --param sourceFile="src/handlers/user.js" \
  --param serviceName="UserService" \
  --fix
```

### recipes/consolidate-imports.json
Normalize imports of a module across codebase.

```bash
node tools/dev/js-edit.js --recipe recipes/consolidate-imports.json \
  --param module="lodash-es" \
  --param scope="src/" \
  --fix
```

### recipes/large-refactor.json
Complex multi-step refactoring workflow.

```bash
node tools/dev/js-edit.js --recipe recipes/large-refactor.json \
  --param step="2" \
  --dry-run --emit-diff
```

---

## Advanced Techniques

### Conditional Recipe Paths

Branch logic based on detected code patterns:

```json
{
  "steps": [
    {
      "operation": "js-scan",
      "pattern": "async + ~try",
      "scope": "${targetFile}",
      "emit": "unprotected_async"
    },
    {
      "name": "Add error handling if needed",
      "condition": "${unprotected_async.count > 0}",
      "operation": "js-edit",
      "batch": true,
      "pattern": "${targetFile}",
      "add-wrapper": "try/catch",
      "for-pattern": "async"
    }
  ]
}
```

### Multi-Phase Refactoring

Break large refactors into phases that can be reviewed separately:

```json
{
  "name": "Large codebase refactor",
  "phases": [
    {
      "name": "Phase 1: Analysis",
      "description": "Gather metrics and identify issues",
      "steps": [
        {
          "operation": "js-scan",
          "health-check": true,
          "scope": "src/",
          "emit": "health_report"
        }
      ]
    },
    {
      "name": "Phase 2: Fixes",
      "description": "Apply discovered fixes",
      "condition": "${health_report.issues > 0}",
      "steps": [
        {
          "operation": "js-edit",
          "apply-fixes": "${health_report.suggestions}"
        }
      ]
    }
  ]
}
```

### Dry-Run Validation

Validate changes before applying:

```json
{
  "steps": [
    {
      "operation": "js-edit",
      "move-function": "${func}",
      "from": "${src}",
      "to": "${dst}",
      "emit": "preview"
    },
    {
      "operation": "validate",
      "checkSyntax": true,
      "checkImports": true,
      "data": "${preview}",
      "failIf": "errors > 0"
    },
    {
      "operation": "report",
      "format": "diff",
      "data": "${preview}",
      "condition": "${validation.passed}"
    }
  ]
}
```

---

## Examples

### Example 1: Rename & Move

Move a function and update all references:

```json
{
  "version": "1.0",
  "name": "Rename and move utility function",
  "parameters": {
    "oldName": { "type": "string", "required": true },
    "newName": { "type": "string", "required": true },
    "fromFile": { "type": "file", "required": true },
    "toFile": { "type": "file", "required": true }
  },
  "steps": [
    {
      "operation": "js-edit",
      "move-function": "${oldName}",
      "from": "${fromFile}",
      "to": "${toFile}",
      "rename": "${newName}",
      "update-calls": true,
      "emit": "move_result"
    },
    {
      "operation": "js-edit",
      "rename-global": "${oldName}",
      "to": "${newName}",
      "search-scope": "src/",
      "verify-hash": "${move_result.newHash}"
    }
  ]
}
```

**Usage:**
```bash
node tools/dev/js-edit.js --recipe rename-and-move.json \
  --param oldName="fetchData" \
  --param newName="getUserData" \
  --param fromFile="src/api/users.js" \
  --param toFile="src/services/UserService.js" \
  --fix
```

### Example 2: Extract Service

Extract functions to new service module:

```json
{
  "version": "1.0",
  "name": "Extract functions to new service",
  "parameters": {
    "functions": { "type": "array", "required": true },
    "sourceFile": { "type": "file", "required": true },
    "serviceName": { "type": "string", "required": true }
  },
  "steps": [
    {
      "name": "Create service module",
      "operation": "js-edit",
      "extract-to-module": "src/services/${serviceName}.js",
      "functions": "${functions}",
      "from": "${sourceFile}",
      "include-deps": true,
      "emit": "service_created"
    },
    {
      "name": "Update all imports",
      "operation": "js-edit",
      "consolidate-imports": "${serviceName}",
      "from-exports": "${service_created.file}",
      "scope": "src/",
      "emit": "imports_updated"
    }
  ]
}
```

### Example 3: Large Refactor with Phases

```json
{
  "version": "1.0",
  "name": "Multi-phase API refactor",
  "phases": [
    {
      "name": "Audit current state",
      "steps": [
        {
          "operation": "js-scan",
          "health-check": true,
          "scope": "src/api",
          "emit": "baseline_health"
        }
      ]
    },
    {
      "name": "Move handlers",
      "steps": [
        {
          "operation": "js-edit",
          "batch": true,
          "pattern": "src/api/*.handler.js",
          "move-to": "src/handlers/",
          "emit": "move_result"
        }
      ]
    },
    {
      "name": "Fix imports",
      "steps": [
        {
          "operation": "js-edit",
          "consolidate-imports": true,
          "scope": "src/",
          "emit": "consolidate_result"
        }
      ]
    },
    {
      "name": "Verify health",
      "steps": [
        {
          "operation": "js-scan",
          "health-check": true,
          "scope": "src/api",
          "emit": "final_health"
        }
      ]
    }
  ]
}
```

---

## Troubleshooting

### "Variable not found"
```
Error: Variable '${functionName}' not defined
```
**Solution:** Check spelling and ensure the step that emits this variable ran successfully.

### "Condition syntax error"
```
Error: Invalid condition syntax in step 2
```
**Solution:** Review condition format. Use `&&`, `||`, `!` for logic and proper comparison operators.

### "Recipe failed at step 3"
```
Error: Step 3 failed: function not found
```
**Solution:** 
1. Check previous steps' output (use `--emit-diff` to see diffs)
2. Verify parameters are correct
3. Use `--dry-run` first to preview

### "Recipe is slow"
**Solution:** Break into smaller phases, add `--use-cache`, or reduce scope with pattern matching.

