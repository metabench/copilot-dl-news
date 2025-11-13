# AST Pattern Matching Guide for js-scan

**Date:** November 11, 2025  
**Purpose:** Detailed specification and examples for AST-based pattern search in js-scan

This guide explains how to use Abstract Syntax Tree (AST) patterns to find semantic code patterns (not just text matches) across your codebase.

---

## Table of Contents

1. [What Are AST Patterns?](#what-are-ast-patterns)
2. [Pattern Syntax](#pattern-syntax)
3. [Common Patterns](#common-patterns)
4. [Advanced Patterns](#advanced-patterns)
5. [Performance Considerations](#performance-considerations)
6. [Troubleshooting](#troubleshooting)

---

## What Are AST Patterns?

### Background

The Abstract Syntax Tree (AST) is the parse tree that represents your code's structure. Each piece of code (a function, variable, call expression, etc.) becomes a node in this tree with semantic meaning.

**Text search** finds strings:
```javascript
// Searching for "error" finds all mentions
const myError = new Error();  // ✓ Found
logger.error("message");       // ✓ Found (false positive)
const errorCount = 0;         // ✓ Found (false positive)
```

**AST pattern search** finds semantic structures:
```javascript
// Pattern: "functions that call error.log"
const myError = new Error();  // ✗ Not a function call
logger.error("message");       // ✓ Found (semantic match)
const errorCount = 0;         // ✗ Not a function
```

### Why AST Patterns Matter

- **Reduce false positives:** Find only the code you actually want
- **Cross-boundary search:** Find calls regardless of import path (e.g., `logger.error`, `console.error`, `errors.log`)
- **Structural matching:** Find patterns like "async functions that don't have error handling"
- **Refactoring confidence:** Know exactly which code to update

---

## Pattern Syntax

### Basic Pattern DSL

The pattern DSL is designed to be readable while capturing AST structure. Here's the grammar:

```
PATTERN := EXPRESSION | EXPRESSION '+' EXPRESSION | EXPRESSION '|' EXPRESSION
EXPRESSION := [MODIFIER] NODE ['(' ARGS ')']
MODIFIER := '~' (negation) | '*' (zero or more) | '+' (one or more)
NODE := node type (function, call, await, async, etc.)
ARGS := ARG_LIST
ARG_LIST := ARG | ARG ',' ARG_LIST
ARG := string | regex | pattern
```

### Pattern Components

#### Node Types

These map to SWC AST node types:

| Node Type | Matches | Example |
|-----------|---------|---------|
| `function` | Function declarations and arrow functions | `function foo() {}` or `const foo = () => {}` |
| `async` | Async functions | `async function foo() {}` |
| `call` | Function calls | `logger.error()` |
| `await` | Await expressions | `await promise()` |
| `promise` | Promise-returning functions or `.then()` | `new Promise()` |
| `class` | Class declarations | `class MyClass {}` |
| `try` | Try/catch blocks | `try { ... } catch` |
| `throw` | Throw statements | `throw new Error()` |
| `return` | Return statements | `return value` |
| `assign` | Assignment expressions | `x = 5` or `x += 3` |
| `update` | Update expressions | `x++` or `--y` |
| `member` | Member access | `obj.prop` or `obj['prop']` |
| `computed` | Computed member access | `obj[key]` |

#### Modifiers

| Modifier | Meaning | Example |
|----------|---------|---------|
| (none) | Exactly one | `function` matches 1 function |
| `*` | Zero or more | `*call` matches any number of calls |
| `+` | One or more | `+await` matches one or more awaits |
| `~` | Negation (NOT) | `~try` matches code without try/catch |

#### Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `+` | Sequence (must appear in order) | `async + call` = async function calls |
| `\|` | Alternation (either/or) | `error\|warn\|log` = any of these |

### Simple Examples

```javascript
// Find all functions
--pattern "function"

// Find all async functions
--pattern "async"

// Find all function calls
--pattern "call"

// Find async functions that return promises
--pattern "async + promise"

// Find calls to error or log
--pattern "call('error' | 'log')"

// Find try/catch blocks
--pattern "try"

// Find code without error handling (try/catch)
--pattern "~try"
```

---

## Common Patterns

### Error Handling Patterns

**Find all error handlers:**
```bash
node tools/dev/js-scan.js --pattern "catch|throw" \
  --cross-module --scope src/
```

**Find functions that handle errors:**
```bash
node tools/dev/js-scan.js --pattern "function + try" \
  --cross-module --scope src/
```

**Find async functions WITHOUT error handling:**
```bash
node tools/dev/js-scan.js --pattern "async + ~try" \
  --cross-module --scope src/
```

**Find specific error logging calls:**
```bash
node tools/dev/js-scan.js --pattern "call('logger.error')" \
  --cross-module --scope src/
```

### Database Access Patterns

**Find all database queries:**
```bash
node tools/dev/js-scan.js --pattern "call('db.query'|'db.execute'|'db.find')" \
  --cross-module --scope src/api
```

**Find async database operations:**
```bash
node tools/dev/js-scan.js --pattern "async + call('db.')" \
  --cross-module --scope src/
```

**Find database calls in try/catch:**
```bash
node tools/dev/js-scan.js --pattern "try + call('db.')" \
  --cross-module --scope src/
```

### State Management Patterns

**Find all state updates:**
```bash
node tools/dev/js-scan.js --pattern "call('setState'|'updateState')" \
  --cross-module --scope src/ui
```

**Find state assignments:**
```bash
node tools/dev/js-scan.js --pattern "assign('.*State')" \
  --cross-module --scope src/
```

**Find state mutations (assignments without proper update pattern):**
```bash
node tools/dev/js-scan.js --pattern "assign('state\\.') + ~call('setState')" \
  --cross-module --scope src/
```

### Async/Promise Patterns

**Find all async functions:**
```bash
node tools/dev/js-scan.js --pattern "async" \
  --cross-module --scope src/
```

**Find functions that return promises:**
```bash
node tools/dev/js-scan.js --pattern "promise" \
  --cross-module --scope src/
```

**Find promise chains (.then):**
```bash
node tools/dev/js-scan.js --pattern "call('then'|'catch'|'finally')" \
  --cross-module --scope src/
```

**Find mixed async/promise usage (potential issues):**
```bash
node tools/dev/js-scan.js --pattern "async + call('then')" \
  --cross-module --scope src/
```

### Class/Constructor Patterns

**Find class constructors:**
```bash
node tools/dev/js-scan.js --pattern "class" \
  --cross-module --scope src/
```

**Find classes that extend other classes:**
```bash
node tools/dev/js-scan.js --pattern "class + extend" \
  --cross-module --scope src/
```

**Find singleton patterns (static properties):**
```bash
node tools/dev/js-scan.js --pattern "class + member('static')" \
  --cross-module --scope src/
```

---

## Advanced Patterns

### Pattern Composition

Patterns can be combined to express complex queries:

**Async functions that call database AND have error handling:**
```bash
node tools/dev/js-scan.js \
  --pattern "async + call('db.') + try" \
  --cross-module --scope src/
```

**Export functions that DON'T use try/catch:**
```bash
node tools/dev/js-scan.js \
  --pattern "export + function + ~try" \
  --cross-module --exports-only --scope src/
```

**Classes with specific parent class:**
```bash
node tools/dev/js-scan.js \
  --pattern "class('.*Controller')" \
  --cross-module --scope src/api
```

### Negation Patterns

Negation helps find gaps or violations:

**Async functions without await:**
```bash
node tools/dev/js-scan.js --pattern "async + ~await" \
  --cross-module --scope src/
```

**Functions that call external APIs without error handling:**
```bash
node tools/dev/js-scan.js \
  --pattern "call('fetch'|'axios'|'request') + ~try" \
  --cross-module --scope src/
```

**Database calls without validation:**
```bash
node tools/dev/js-scan.js \
  --pattern "call('db.') + ~call('validate')" \
  --cross-module --scope src/
```

### Argument Matching

Patterns can match specific arguments:

**Logger calls with specific levels:**
```bash
node tools/dev/js-scan.js \
  --pattern "call('logger', 'error')" \
  --cross-module --scope src/
```

**Calls to specific named arguments:**
```bash
node tools/dev/js-scan.js \
  --pattern "call('setTimeout', _, '5000')" \
  --cross-module --scope src/
```

---

## Performance Considerations

### Pattern Complexity vs. Performance

| Pattern Complexity | Typical Time (1000 files) | Notes |
|-------------------|--------------------------|-------|
| Simple (e.g., `function`) | < 1 second | Fast, broad matches |
| Moderate (e.g., `async + call('db.')`) | 2-5 seconds | Reasonable for CI |
| Complex (e.g., `async + call + try + member`) | 5-15 seconds | Suitable for one-off analysis |
| Very Complex (deep nesting, many alternations) | 30+ seconds | Consider splitting into steps |

### Optimization Tips

**Use specific patterns first:**
```bash
# Slower: Find everything then filter
node tools/dev/js-scan.js --pattern "function" \
  --scope src/ | grep -i error

# Faster: Specific pattern
node tools/dev/js-scan.js --pattern "function + call('error')" \
  --scope src/
```

**Narrow scope when possible:**
```bash
# Slower: Scan entire codebase
node tools/dev/js-scan.js --pattern "async + call('db.')" \
  --scope src/

# Faster: Scan API layer only
node tools/dev/js-scan.js --pattern "async + call('db.')" \
  --scope src/api
```

**Cache results for repeated queries:**
```bash
# First run caches the pattern
node tools/dev/js-scan.js --pattern "async + try" \
  --scope src/ --use-cache

# Subsequent runs are faster
node tools/dev/js-scan.js --pattern "async + try" \
  --scope src/ --use-cache
```

### When Patterns Are Too Slow

If your pattern takes longer than expected:

1. **Split into multiple passes:**
   ```bash
   # Instead of one complex pattern:
   node tools/dev/js-scan.js --pattern "async + db-call + try + error-log" --scope src/
   
   # Do it in steps:
   node tools/dev/js-scan.js --pattern "async + call('db.')" --scope src/ > step1.json
   node tools/dev/js-scan.js --pattern "try" --scope src/ > step2.json
   # Then correlate in post-processing
   ```

2. **Use smaller scopes:**
   ```bash
   # Scan specific directories first
   node tools/dev/js-scan.js --pattern "complex-pattern" \
     --scope src/api --scope src/services
   ```

3. **Request optimization:**
   If a particular pattern is frequently slow, file an issue to add it as a built-in optimization.

---

## Troubleshooting

### Common Issues

**Pattern Syntax Error**
```
Error: Invalid pattern syntax "function("
```
**Solution:** Check parentheses and quotes. Use `function` for the node type, not a call.

**No Matches Found**
```
$ node tools/dev/js-scan.js --pattern "call('nonexistent')"
✗ No matches found
```
**Solution:** 
- Verify the function name is correct (case-sensitive)
- Check if the function is actually called in the scope
- Try a simpler pattern first: `--pattern "call"`
- Use `--json` to see detailed output

**Too Many Matches**
```
✗ Result set exceeds 500 matches, truncated
```
**Solution:**
- Narrow your pattern: `async` → `async + call('db.')`
- Reduce scope: `--scope src/api` instead of `--scope src/`
- Filter by export status: `--exports-only`
- Use `--exclude-path` to skip test files

**Performance Issues**
```
(Waiting > 30 seconds)
```
**Solution:** See "When Patterns Are Too Slow" above.

### Debugging Patterns

**Verify what nodes exist in a file:**
```bash
# See all top-level nodes
node tools/dev/js-edit.js --file src/example.js --outline

# Get detailed AST info for a function
node tools/dev/js-edit.js --file src/example.js \
  --context-function "myFunction" --json
```

**Test a simple pattern first:**
```bash
# Start simple
node tools/dev/js-scan.js --pattern "function" --scope src/ --limit 10

# Then add criteria
node tools/dev/js-scan.js --pattern "async" --scope src/ --limit 10

# Then combine
node tools/dev/js-scan.js --pattern "async + call" --scope src/ --limit 10
```

**Review matched code:**
```bash
# See actual code for matches
node tools/dev/js-scan.js --pattern "async + ~try" \
  --scope src/ --include-context --no-snippets=false
```

---

## Reference: Node Type Details

### function
Matches both declarations and expressions:
```javascript
function myFunc() { }           // ✓ Matched
const fn = function() { }       // ✓ Matched
const arrow = () => { }         // ✓ Matched
```

### async
Matches async keyword on functions and methods:
```javascript
async function fetch() { }      // ✓ Matched
const asyncArrow = async () => {} // ✓ Matched
async method() { }              // ✓ Matched
```

### call
Matches function/method invocations:
```javascript
logger.error()                  // ✓ Matched
func()                          // ✓ Matched
obj.method()                    // ✓ Matched
new Class()                     // ✓ Matched (constructor call)
```

### await
Matches await expressions:
```javascript
await promise()                 // ✓ Matched
await asyncFunc()               // ✓ Matched
const x = await fetch()         // ✓ Matched
```

### promise
Matches promise-returning expressions:
```javascript
new Promise()                   // ✓ Matched
promise.then()                  // ✓ Matched
async function returns promise  // ✓ Matched (implicit)
```

### try
Matches try/catch blocks:
```javascript
try { } catch { }               // ✓ Matched
try { } catch (e) { }           // ✓ Matched
try { } catch (e) { } finally {} // ✓ Matched
```

### throw
Matches throw statements:
```javascript
throw new Error()               // ✓ Matched
throw error                     // ✓ Matched
```

### class
Matches class declarations:
```javascript
class MyClass { }               // ✓ Matched
class Child extends Parent { }  // ✓ Matched
```

---

## Examples: End-to-End Scenarios

### Scenario 1: Audit All Unprotected API Calls

**Goal:** Find all fetch/axios calls without error handling

```bash
node tools/dev/js-scan.js \
  --pattern "call('fetch'|'axios'|'request') + ~try" \
  --cross-module --scope src/ --json > api-audit.json
```

**Next step:** Review and wrap unsafe calls with try/catch

### Scenario 2: Find Legacy Promise Usage

**Goal:** Identify places where promises are mixed with async/await

```bash
node tools/dev/js-scan.js \
  --pattern "function + async + call('then')" \
  --cross-module --scope src/ --no-snippets
```

**Next step:** Migrate to pure async/await syntax

### Scenario 3: State Management Compliance

**Goal:** Find direct state mutations (should use setState instead)

```bash
node tools/dev/js-scan.js \
  --pattern "assign('state\\.') + ~call('setState')" \
  --cross-module --scope src/ui
```

**Next step:** Create refactoring recipe to update to setState

### Scenario 4: Database Query Risk Assessment

**Goal:** Find unprotected database operations

```bash
node tools/dev/js-scan.js \
  --pattern "call('db.') + ~call('validate')" \
  --cross-module --scope src/api
```

**Next step:** Add validation layer or wrapper

---

## Tips for Writing Good Patterns

1. **Start simple:** Begin with basic patterns and add complexity
2. **Test incrementally:** Run with `--limit 5` first to see what matches
3. **Use negation strategically:** `~try` finds gaps, not just violations
4. **Document your patterns:** Save useful patterns in `recipes/` for reuse
5. **Combine with other tools:** Use patterns with `--ripple-analysis` to understand impact

