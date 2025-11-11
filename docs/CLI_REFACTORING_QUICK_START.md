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

## Bilingual CLI Shortcuts

- Tools such as `js-scan`, `js-edit`, `md-scan`, and `md-edit` accept the two-character Chinese aliases (`--搜`, `--函列`, `--链图`, `--节列`, etc.) without extra flags. Any glyph token automatically enables the terse Chinese formatter, so day-to-day runs rarely need an explicit `--lang zh`.
- JavaScript search example: `node tools/dev/js-scan.js --搜 telemetry --视 简 --域 location,name,hash` prints compact match lines with Chinese headers while keeping hash metadata intact for guarded workflows.
- JavaScript editing example: `node tools/dev/js-edit.js --文 src/example.js --函列 --紧凑` inventories functions using glyph-based flags; swap to English at any time with `--lang en`.
- Markdown tooling: `node tools/dev/md-scan.js --径 docs --搜 planner` and `node tools/dev/md-edit.js docs/AGENTS.md --节列 --紧凑` lean on the same alias map, plus `--助 --语 zh` renders the bilingual help grids when you need the two-character references.
- Add `--lang en` (or `--lang bilingual`) only when you must force a locale while mixing English and Chinese options; otherwise the formatter negotiates automatically. Use `--依` (`--follow-deps`) with `js-scan` to chase relative imports without leaving the dense bilingual output mode.
- When you do supply `--lang zh`, all discovery CLIs surface matching bilingual stats: `js-scan` headlines `搜果`/`匹数`, `md-scan` labels sections with `节`, and `md-edit` mirrors headers for inventories, searches, and stats while keeping JSON payloads unchanged.

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
- Variable bindings now participate in the guarded workflow: `--locate-variable`, `--extract-variable`, and `--replace-variable` share selectors/guards with function operations, and `--variable-target <binding|declarator|declaration>` lets you choose whether to guard just the identifier, the declarator, or the entire statement.
- Recognised call-site callbacks (`describe`, `it`, `test`, `beforeEach`, `afterAll`, etc.) are emitted with canonical `call:*` selectors. These callbacks participate in the guarded replace workflow, so you can patch Jest/Mocha hooks with the same hash/span guardrails used for declarations.
- All replaceable functions now report `identifierSpan` metadata in guard summaries and JSON payloads, including variable-assigned functions (`const gamma = () => {}`), CommonJS exports (`module.exports.handler`, `exports.worker`), and call-site callbacks. This metadata enables downstream rename workflows and identifier-level audits without requiring additional parsing; `--replace-variable` remains available for non-function variable bindings only.
- Locate/context tables and JSON payloads expose both character-based offsets (UTF-16 code units) and raw byte offsets; summaries include `charSpanRange` and `byteSpanRange` so newline conversions or multi-byte glyphs are visible before edits land.
- Disambiguate collisions with `--select <index>` (1-based source order) or `--select hash:<value>` when you already captured a guard hash from `--list-functions`/`--locate`; mixing selectors with hash pins is the fastest path back to an exact node after text searches or multi-match queries.
- `--with-file <relativePath>` resolves replacement snippets relative to the target file’s directory, so temp copies and co-located patches can be applied without guessing the repo root.
- Emits locate tables and JSON payloads via `CliFormatter`, making automation straightforward.
- Enforces guardrails (span/hash/path/syntax, plus `identifierSpan` validation for all replaceable functions) before writing; results appear in a dedicated table and JSON block, and optional `--expect-hash`/`--expect-span` inputs let you replay the exact metadata captured during a prior locate run.
- Hashes shown in locate/context/plan payloads are eight-byte base64 digests (12-character strings with padding) so agents get concise guard tokens. Adjust `tools/dev/shared/hashConfig.js` if you need a different encoding or slice length for specialised workflows.

**Lightweight discovery helpers.** `--preview <selector>` / `--preview-variable <selector>` emit short snippets (default 240 chars) alongside the same hash/path/span metadata reported by `--locate`, making it easy to confirm a match before running a heavier context or locate command. `--search-text <substring>` performs a plain-text scan that highlights each hit, surfaces enclosing function/variable guard hashes, and respects `--search-limit` / `--search-context` knobs so automation can pivot from a literal search directly into guarded edits. JSON payloads now include suggested follow-up commands (e.g., `--locate … --select hash:<value>`) so you can jump straight from a literal hit into a guarded locate invocation without copying hashes manually.

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

Guard summaries and plans now report dual span metrics (`charSpanRange` + `byteSpanRange`) alongside individual offsets, ensuring drift caused by newline normalization or multi-byte glyphs is obvious during review.

**Targeted edits:** Add `--replace-range start:end` (0-based, end-exclusive, relative to the located function) when you only need to swap a specific slice of the function body using `--with <file>` or `--with-file <relativePath>`. For identifier-only tweaks, use `--rename <identifier>` with `--replace <selector>`—no snippet required, and the helper updates just the declaration name while guardrails ensure the rest of the function remains untouched.

**Search-to-Guarded Edit Workflow.** The `suggestions` array returned by `--search-text --json` bridges literal matches to guarded commands:

1. Run `node tools/dev/js-edit.js --file src/example.js --search-text dispatchAction --json > tmp/search.json`.
2. Pick a match and copy one of the generated suggestions, e.g. `js-edit --file "src/example.js" --locate "exports.Widget > #render" --select hash:TsFu9ZSc`.
3. Execute the suggestion to jump directly to the recorded guard hash without retyping the selector or scanning tables.
4. Follow up with a dry-run replacement (`--replace`, `--expect-hash`, `--emit-diff`) or context inspection as usual.

**Relative snippet replacement.** When you keep patch files next to the target file, `--with-file` resolves the path for you:

```powershell
$temp = Copy-Item src/example.js (Join-Path $env:TEMP 'example.js') -PassThru
Set-Content (Join-Path (Split-Path $temp -Parent) 'render.patch.js') "export function render() {\n  return dispatchAction();\n}\n"
node tools/dev/js-edit.js --file $temp.FullName --replace exports.render --with-file render.patch.js --expect-hash TsFu9ZSc --emit-diff --json --fix
```

The CLI reports the resolved snippet path in the guard summary, making audits straightforward even when replacements originate from temporary directories.

### Variable Guardrail Flow

```powershell
# 1. Locate the declarator (captures hash/span/path for the requested target mode)
node tools/dev/js-edit.js --file src/example.js --locate-variable "exports.settings" --variable-target declarator --json --emit-plan tmp/settings.plan.json > locate-variable.json

# 2. Dry-run the replacement with guard hash/path checks
node tools/dev/js-edit.js --file src/example.js --replace-variable "exports.settings" --variable-target declarator --with tmp/settings.snippet.js --expect-hash <hash-from-step-1> --emit-diff --json

# 3. Apply after the guard summary reports OK/bypass as expected
node tools/dev/js-edit.js --file src/example.js --replace-variable "exports.settings" --variable-target declarator --with tmp/settings.snippet.js --expect-hash <hash-from-step-1> --emit-diff --fix
```

Variable plans honour the resolved mode (`binding`, `declarator`, or `declaration`) and embed the exact hash/span/path metadata for that span so automation can replay the edit safely. Replacement guard summaries mirror the function flow while referencing the chosen target mode.

### Context Inspection

- `--context-function <selector>` / `--context-variable <selector>` emit padded snippets (default ±512 characters) with hashes and path signatures so you can review targets without opening an editor.
- `--context-before <n>` / `--context-after <n>` override padding while preserving multi-byte characters; zero padding keeps the output tight when you only care about enclosing structures.
- `--context-enclosing <mode>` widens the window: `exact` sticks to the node span, `class` wraps the nearest class, and **`function` wraps the closest enclosing function or class method**, making nested helpers easy to audit. JSON payloads expose both the entire enclosing stack and the specific context used (`selectedEnclosingContext`).
- **Context operations support plan emission**: Add `--emit-plan <file>` to `--context-function` or `--context-variable` commands to capture guard metadata with enhanced summary information (`matchCount`, `allowMultiple`, `spanRange`) plus context-specific details (`entity`, `padding`, `enclosingMode`).
- Combine context inspection with guard plans to capture review windows, hashes, and spans before attempting replacements, especially useful for batch editing workflows with `--allow-multiple`.

Context summaries follow the same dual-span convention, surfacing both character and byte aggregates so downstream consumers can reconcile padding and newline adjustments precisely.

### Context Plan Example

```powershell
# Get context with plan emission for batch preparation
node tools/dev/js-edit.js --file src/example.js --context-function "Widget" --allow-multiple --emit-plan tmp/context-plan.json --json

# Plan payload includes enhanced summary for multi-match scenarios:
# - summary.matchCount: number of functions matched
# - summary.spanRange: aggregate span data (start/end/totalLength)  
# - entity: "function" or "variable"
# - padding: requested vs applied context padding
# - enclosingMode: context expansion setting
```

---

## Reference

**Full API:** See `src/utils/CliFormatter.js` for all 15+ methods with JSDoc  
**Examples:** See `CLI_OUTPUT_SAMPLES.md` for before/after from 3 real tools  
**Analysis:** See `CLI_REFACTORING_ANALYSIS.md` for library comparison and design patterns

