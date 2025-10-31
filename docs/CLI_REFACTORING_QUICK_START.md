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

## Reference

**Full API:** See `src/utils/CliFormatter.js` for all 15+ methods with JSDoc  
**Examples:** See `CLI_OUTPUT_SAMPLES.md` for before/after from 3 real tools  
**Analysis:** See `CLI_REFACTORING_ANALYSIS.md` for library comparison and design patterns

