# Quick Start: CLI Refactoring Pattern

**For using CliFormatter and CliArgumentParser in new tools**

---

## One-Minute TL;DR

```javascript
const { CliFormatter } = require('../utils/CliFormatter');
const { CliArgumentParser } = require('../utils/CliArgumentParser');

// Parse arguments
const parser = new CliArgumentParser('tool-name', 'description');
parser.add('--option <value>', 'Help text', 'default');
const args = parser.parse(process.argv);

// Output beautifully
const fmt = new CliFormatter();
fmt.header('My Tool');
fmt.stat('Result', someValue);
fmt.table(rows);
fmt.success('Done!');
fmt.footer();
```

---

## Common Patterns

### Validation Report
```javascript
fmt.header('Validation Report');
fmt.section('Summary');
fmt.stat('Total items', count);
fmt.stat('Valid', validCount);
fmt.stat('Invalid', invalidCount);

if (validCount === count) {
  fmt.success('All items valid');
} else {
  fmt.warn(`Found ${invalidCount} issues`);
}
fmt.footer();
```

### Analysis Results Table
```javascript
const results = data.map(d => ({
  id: d.id,
  name: d.name,
  status: d.status,
  score: d.score.toFixed(2)
}));

fmt.table(results, {
  format: {
    status: (v) => v === 'error' ? fmt.COLORS.error(v) : fmt.COLORS.success(v)
  }
});
```

### Progress Tracking
```javascript
for (let i = 0; i < total; i++) {
  // do work...
  if (i % 50 === 0) {
    fmt.progress('Processing', i, total);
  }
}
```

### Detailed Output with List
```javascript
fmt.header('Analysis Results');
fmt.list('Issues found', [
  'Item 1 has problem A',
  'Item 2 has problem B',
  'Item 3 has problem C'
]);
fmt.info('See --details for more information');
fmt.footer();
```

---

## Colors & Icons

### Colors
- `fmt.COLORS.success` → Green
- `fmt.COLORS.error` → Red
- `fmt.COLORS.warning` → Yellow
- `fmt.COLORS.info` → Blue
- `fmt.COLORS.muted` → Gray
- `fmt.COLORS.accent` → Magenta
- `fmt.COLORS.cyan` → Cyan

### Icons
- `fmt.ICONS.success` → ✓
- `fmt.ICONS.error` → ✖
- `fmt.ICONS.warning` → ⚠
- `fmt.ICONS.info` → ℹ
- `fmt.ICONS.pending` → ⏳
- `fmt.ICONS.complete` → ✅
- `fmt.ICONS.bullet` → •
- `fmt.ICONS.arrow` → →

---

## Argument Parsing

### Simple Option
```javascript
parser.add('--option <value>', 'Help text', 'default-value');
```

### Boolean Flag
```javascript
parser.add('--verbose', 'Enable verbose output', false, 'boolean');
```

### Numeric Argument
```javascript
parser.add('--limit <number>', 'Limit results', 100, 'number');
```

### Multi-flag
```javascript
parser
  .add('--db <path>', 'Database path', 'default.db')
  .add('--limit <n>', 'Result limit', 100, 'number')
  .add('--json', 'JSON output', false, 'boolean');
```

---

## Import Paths

```javascript
// From src/tools/ (1 level up from utils)
const { CliFormatter } = require('../utils/CliFormatter');
const { CliArgumentParser } = require('../utils/CliArgumentParser');

// From other locations
const { CliFormatter } = require('./src/utils/CliFormatter');
const { CliArgumentParser } = require('./src/utils/CliArgumentParser');
```

---

## Full Example

```javascript
#!/usr/bin/env node

const { CliFormatter } = require('../utils/CliFormatter');
const { CliArgumentParser } = require('../utils/CliArgumentParser');

function parseArgs(argv) {
  const parser = new CliArgumentParser(
    'my-tool',
    'Tool that does something useful'
  );

  parser
    .add('--db <path>', 'Database path', 'data/default.db')
    .add('--limit <number>', 'Limit results', 100, 'number')
    .add('--verbose', 'Verbose output', false, 'boolean');

  return parser.parse(argv);
}

function main() {
  const args = parseArgs(process.argv);
  const fmt = new CliFormatter();

  fmt.header('My Tool Results');
  fmt.settings(`Database: ${args.db}`);
  fmt.blank();

  // Do work...
  const results = []; // your data

  fmt.table(results);
  fmt.summary({
    'Total processed': results.length,
    'Successful': results.filter(r => r.ok).length,
    'Duration': '2.5s'
  });
  fmt.footer();
}

if (require.main === module) main();
```

---

## What to Replace

### Old Argument Parsing
```javascript
// ❌ OLD: Manual regex parsing
function parseArgs(argv) {
  const args = {};
  for (const a of argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

// ✅ NEW: Use CliArgumentParser
const parser = new CliArgumentParser('tool', 'desc');
parser.add('--db <path>', 'Database', 'default.db');
const args = parser.parse(process.argv);
```

### Old Output
```javascript
// ❌ OLD: Plain console.log
console.log('Result: ' + value);
console.log('Total: ' + count);

// ✅ NEW: Use CliFormatter
fmt.header('Results');
fmt.stat('Value', value);
fmt.stat('Total', count);
fmt.footer();
```

### Old Tables
```javascript
// ❌ OLD: Tab-separated
process.stdout.write(`${col1}\t${col2}\t${col3}\n`);

// ✅ NEW: Use fmt.table()
fmt.table([
  { col1: val1, col2: val2, col3: val3 }
]);
```

---

## Case Study: `js-edit` Guardrail Workflow

`js-edit` (see `tools/dev/js-edit.js`) demonstrates how to combine rich argument parsing with defensive output. The CLI:

- Accepts selectors (`alpha`, `Class#method`, `path:…`, `hash:…`) normalized through `CliArgumentParser` options.
- Resolves both ES module exports and CommonJS assignments (`module.exports`, `module.exports.handler`, `exports.worker`) using the same selector syntax, so mixed modules require no extra flags.
- Variable inventory mode lists CommonJS bindings as well (`module.exports = …`, `exports.value = …`) with hashes and scope metadata, making the exported surface inspectable without hand-parsing assignments.
- Emits locate tables and JSON payloads via `CliFormatter`, making automation straightforward.
- Enforces guardrails (span/hash/path/syntax) before writing; results appear in a dedicated table and JSON block, and optional `--expect-hash`/`--expect-span` inputs let you replay the exact metadata captured during a prior locate run.
- Hashes shown in locate/context/plan payloads are base64 digests trimmed to eight characters by default so agents get concise guard tokens; switch the constants in `tools/dev/lib/swcAst.js` to fall back to a longer base16 form if a workflow needs it.

### Selector + Guardrail Flow

```powershell
# 1. Capture selectors + hashes (optionally persist a guard plan)
node tools/dev/js-edit.js --file src/example.js --locate "exports.Widget > #render" --json --emit-plan tmp/render.plan.json > locate.json

# 2. Dry-run replacement with diff preview, guard hash/span, and plan emission
node tools/dev/js-edit.js --file src/example.js --replace "exports.Widget > #render" --with tmp/render.js --expect-hash <hash-from-step-1> --expect-span <start:end-from-step-1> --emit-diff --emit-plan tmp/render.plan.json --json

# 3. Apply once guard summary reports all checks OK (reuse the plan for auditing)
node tools/dev/js-edit.js --file src/example.js --replace "exports.Widget > #render" --with tmp/render.js --expect-hash <hash-from-step-1> --expect-span <start:end-from-step-1> --emit-diff --emit-plan tmp/render.plan.json --fix
```

If a hash or path mismatch occurs, the CLI exits non-zero with actionable messaging (e.g., “Hash mismatch… Re-run --locate and retry”). `--force` is available for intentional bypasses, but pair it with `--expect-hash`/`--expect-span` so the guard summary clearly records which expectations were intentionally skipped.

Guard plans mirror the JSON payload’s `plan` block and include the selector, expected hash, expected span offsets, and path signature. They provide a hand-off artifact for other operators or future automation runs to verify the same guardrails before mutating a file.

**Targeted edits:** Add `--replace-range start:end` (0-based, end-exclusive, relative to the located function) when you only need to swap a specific slice of the function body using `--with <file>`. For identifier-only tweaks, use `--rename <identifier>` with `--replace <selector>`—no snippet required, and the helper updates just the declaration name while guardrails ensure the rest of the function remains untouched.

### Context Inspection

- `--context-function <selector>` / `--context-variable <selector>` emit padded snippets (default ±512 characters) with hashes and path signatures so you can review targets without opening an editor.
- `--context-before <n>` / `--context-after <n>` override padding while preserving multi-byte characters; zero padding keeps the output tight when you only care about enclosing structures.
- `--context-enclosing <mode>` widens the window: `exact` sticks to the node span, `class` wraps the nearest class, and **`function` wraps the closest enclosing function or class method**, making nested helpers easy to audit. JSON payloads expose both the entire enclosing stack and the specific context used (`selectedEnclosingContext`).
- Combine context inspection with guard plans to capture review windows, hashes, and spans before attempting replacements.

---

## Reference

**Full API:** See `src/utils/CliFormatter.js` for all 15+ methods with JSDoc  
**Examples:** See `CLI_OUTPUT_SAMPLES.md` for before/after from 3 real tools  
**Analysis:** See `CLI_REFACTORING_ANALYSIS.md` for library comparison and design patterns

