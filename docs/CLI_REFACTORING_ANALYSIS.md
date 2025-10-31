# CLI Refactoring Analysis: Modules & Output Formatting

**Date:** October 30, 2025  
**Focus:** CLI argument parsing, output formatting modularization, and beautiful console output

---

## Executive Summary

The codebase has **good foundations** but **inconsistent patterns**:
- ✅ Already uses `chalk` for colored output (available in dependencies)
- ✅ LogCondenser.js shows structured logging patterns
- ✅ crawl-place-hubs.js shows creative emoji + color usage
- ❌ CLI argument parsing varies across tools (no unified approach)
- ❌ Output formatting scattered (no centralized formatting library)
- ❌ No modularized output presentation layer

**Recommendation:** Create a unified **CliFormatter** module to standardize output across all tools.

---

## Part 1: CLI Argument Parsing Modules

### Current State

**Problem in tools (e.g., `validate-gazetteer.js`):**
```javascript
function parseArgs(argv) {
  const args = { details: false, json: false };
  for (const a of argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) args[m[1]] = m[2]; else if (a.startsWith('--')) args[a.slice(2)] = true;
  }
  // normalize booleans
  args.details = args.details === true || String(args.details).toLowerCase() === '1' || String(args.details).toLowerCase() === 'true';
  args.json = args.json === true || String(args.json).toLowerCase() === '1' || String(args.json).toLowerCase() === 'true';
  return args;
}
```

**Issues:**
- ❌ No schema validation
- ❌ No type coercion
- ❌ No help generation
- ❌ Repeated in every tool
- ❌ No required field validation

### Option A: commander.js (Recommended for this codebase)

**Why it's perfect:**
- ✅ Lightweight (11KB gzipped)
- ✅ Zero extra dependencies
- ✅ Can be added to package.json with one line
- ✅ Handles help auto-generation
- ✅ Type validation + coercion
- ✅ Subcommands (for future scaling)
- ✅ Excellent documentation

**Example with commander.js:**
```javascript
const { program } = require('commander');

program
  .name('validate-gazetteer')
  .description('Validate gazetteer data quality')
  .option('--db <path>', 'Database path', 'data/gazetteer.db')
  .option('--details', 'Print detailed validation results', false)
  .option('--json', 'Output as JSON', false)
  .option('--limit <number>', 'Limit results (for testing)', '0')
  .parse(process.argv);

const options = program.opts();
// options.db, options.details, options.json, options.limit already validated
```

**Pros:**
- Auto-generated help: `--help` works immediately
- Type coercion: `--limit 5` becomes `options.limit = 5` (number)
- Less code per tool
- Professional CLI feel

**Cons:**
- Adds new dependency (but small)
- Slight learning curve

### Option B: Custom CliArgumentParser (Lightweight alternative)

**If you want to avoid external dependency:**
```javascript
// src/utils/CliArgumentParser.js
class CliArgumentParser {
  constructor(schema = {}) {
    this.schema = schema;
    this.args = {};
  }

  parse(argv) {
    const args = { ...this.schema }; // Start with defaults
    
    for (let i = 2; i < argv.length; i++) {
      const arg = argv[i];
      
      if (arg === '--help' || arg === '-h') {
        this.printHelp();
        process.exit(0);
      }
      
      if (arg.startsWith('--')) {
        const [key, value] = arg.slice(2).split('=');
        const schema = this.schema[key];
        
        if (!schema) {
          console.error(`Unknown option: --${key}`);
          this.printHelp();
          process.exit(1);
        }
        
        if (schema.type === 'boolean') {
          args[key] = true;
        } else if (schema.type === 'number') {
          args[key] = parseInt(value, 10);
        } else {
          args[key] = value;
        }
      }
    }
    
    // Validate required fields
    for (const [key, schema] of Object.entries(this.schema)) {
      if (schema.required && !args[key]) {
        console.error(`Missing required argument: --${key}`);
        this.printHelp();
        process.exit(1);
      }
    }
    
    return args;
  }

  printHelp() {
    console.log(`Usage: ${process.argv[1]} [options]\n`);
    for (const [key, schema] of Object.entries(this.schema)) {
      const required = schema.required ? ' (required)' : '';
      console.log(`  --${key}${required}: ${schema.description}`);
    }
  }
}

module.exports = { CliArgumentParser };
```

**Usage:**
```javascript
const parser = new CliArgumentParser({
  db: { type: 'string', default: 'data/gazetteer.db', description: 'Database path' },
  details: { type: 'boolean', default: false, description: 'Print details' },
  json: { type: 'boolean', default: false, description: 'Output as JSON' }
});

const args = parser.parse(process.argv);
```

---

### Recommendation: Use commander.js

**Reasoning:**
- Clean, professional APIs
- Less code per tool
- Auto-generated help
- Subcommand support (scalable)
- Industry standard (used by create-react-app, prettier, eslint)

**Installation:**
```bash
npm install commander
```

**Package.json addition:**
```json
{
  "dependencies": {
    "commander": "^12.0.0"
  }
}
```

---

## Part 2: Output Formatting & Presentation Layer

### Current State (What Works Well)

**LogCondenser.js example:**
```javascript
// Format: [ 1.2s] [✔] STEP 1: Doing something
const line = `${color(`[${statusIndicator}]`)} ${time} ${type.padEnd(10)} ${message}\n`;
process.stderr.write(line);
```

**crawl-place-hubs.js example:**
```javascript
const CLI_COLORS = {
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
  progress: chalk.cyan,
  muted: chalk.gray,
  accent: chalk.magenta,
};

const CLI_ICONS = {
  info: 'ℹ',
  success: '✓',
  warning: '⚠',
  error: '✖',
  complete: '✅',
  geography: '🌍',
  compass: '🧭',
};

const log = {
  success: (msg) => console.log(CLI_COLORS.success(CLI_ICONS.success), msg),
  error: (msg) => console.log(CLI_COLORS.error(CLI_ICONS.error), msg),
};
```

**What's good:**
- ✅ Uses chalk for colors (already in dependencies!)
- ✅ Emoji support for visual hierarchy
- ✅ Consistent color schemes
- ✅ Multiple output formats (progress bars, stats)

**What's missing:**
- ❌ Not centralized (duplication across files)
- ❌ No consistent table formatting
- ❌ No JSON output helpers
- ❌ No formatting templates
- ❌ Inconsistent header/footer patterns

---

### Recommendation: Create CliFormatter Module

**Path:** `src/utils/CliFormatter.js`

**Core Features:**
1. **Color palette** — Centralized, consistent colors
2. **Icon set** — Emoji + unicode symbols
3. **Output formatters** — Tables, lists, sections, progress
4. **Preset styles** — Success, error, warning, info
5. **Templates** — Common patterns (headers, footers, status)

**Example Usage:**
```javascript
const fmt = new CliFormatter();

// Simple messages
fmt.success('Processing completed');
fmt.error('Database connection failed');
fmt.warn('Low disk space');
fmt.info('Starting analysis');

// Detailed output
fmt.header('Gazetteer Validation Report');
fmt.section('Summary');
fmt.stat('Total places', 1234567);
fmt.stat('Nameless places', 42);
fmt.list('Issues found', ['Bad refs', 'Orphan edges', 'Duplicates']);

// Tables
fmt.table([
  { domain: 'bbc.com', status: 'active', articles: 5234 },
  { domain: 'theguardian.com', status: 'active', articles: 12891 },
  { domain: 'example.com', status: 'error', articles: 0 }
]);

// Progress tracking
fmt.progress('Processing articles', 250, 1000); // Shows: [████████░░░░░░░░░░] 25%

// Final summary box
fmt.summary({
  'Total processed': 1000,
  'Successful': 950,
  'Failed': 50,
  'Duration': '2.5s'
});
```

---

## Part 3: Proposed CliFormatter Implementation

### Core Module Structure

```javascript
// src/utils/CliFormatter.js

const chalk = require('chalk');

const COLORS = {
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
  muted: chalk.gray,
  accent: chalk.magenta,
  cyan: chalk.cyan,
  bold: chalk.bold,
  dim: chalk.dim
};

const ICONS = {
  // Status
  success: '✓',
  error: '✖',
  warning: '⚠',
  info: 'ℹ',
  pending: '⏳',
  complete: '✅',
  
  // Domain-specific
  geography: '🌍',
  compass: '🧭',
  database: '🗄',
  schema: '🗂',
  table: '📊',
  list: '📋',
  
  // Connectors
  arrow: '→',
  bullet: '•',
  dash: '─',
  pipe: '│'
};

class CliFormatter {
  constructor(options = {}) {
    this.indent = options.indent || 0;
    this.width = options.width || 80;
    this.useEmojis = options.useEmojis !== false;
  }

  _format(color, icon, label, content) {
    const iconStr = this.useEmojis && icon ? `${icon} ` : '';
    const prefix = `${color(`[${iconStr}${label}]`)} `;
    return `${prefix}${content}`;
  }

  // Basic messages
  success(message) {
    console.log(this._format(COLORS.success, ICONS.complete, 'OK', message));
  }

  error(message) {
    console.log(this._format(COLORS.error, ICONS.error, 'ERROR', message));
  }

  warn(message) {
    console.log(this._format(COLORS.warning, ICONS.warning, 'WARN', message));
  }

  info(message) {
    console.log(this._format(COLORS.info, ICONS.info, 'INFO', message));
  }

  // Structural elements
  header(title) {
    const line = '═'.repeat(this.width - 4);
    console.log(`\n${COLORS.bold(COLORS.cyan(`╔ ${title}`))} ${COLORS.cyan(line)}`);
  }

  footer() {
    const line = '═'.repeat(this.width);
    console.log(COLORS.cyan(line) + '\n');
  }

  section(title) {
    console.log(`\n${COLORS.bold(COLORS.accent(title))}`);
    console.log(COLORS.dim('─'.repeat(title.length)));
  }

  // Data display
  stat(label, value, format = 'default') {
    const padded = String(label).padEnd(20);
    const colored = format === 'number' ? COLORS.cyan(value) : value;
    console.log(`  ${padded} ${colored}`);
  }

  list(title, items) {
    console.log(`\n${title}:`);
    for (const item of items) {
      console.log(`  ${COLORS.muted(ICONS.bullet)} ${item}`);
    }
  }

  table(rows, options = {}) {
    if (!rows || rows.length === 0) {
      console.log('  (no data)');
      return;
    }

    const cols = Object.keys(rows[0]);
    const colWidths = {};
    
    // Calculate column widths
    for (const col of cols) {
      colWidths[col] = Math.max(
        col.length,
        ...rows.map(r => String(r[col]).length)
      );
    }

    // Header
    const header = cols.map(col => COLORS.bold(col.padEnd(colWidths[col]))).join(' │ ');
    console.log(`\n  ${header}`);
    console.log(`  ${cols.map(col => '─'.repeat(colWidths[col])).join('─┼─')}`);

    // Rows
    for (const row of rows) {
      const line = cols.map(col => {
        const val = String(row[col]);
        const colored = col === 'status' && row[col] === 'error' 
          ? COLORS.error(val) 
          : val;
        return colored.padEnd(colWidths[col]);
      }).join(' │ ');
      console.log(`  ${line}`);
    }
    console.log();
  }

  progress(label, current, total) {
    const pct = Math.round((current / total) * 100);
    const filled = Math.floor(pct / 5);
    const empty = 20 - filled;
    const bar = `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
    console.log(`  ${label} ${COLORS.cyan(`[${bar}]`)} ${pct.toString().padStart(3)}%`);
  }

  summary(stats) {
    this.section('Summary');
    for (const [label, value] of Object.entries(stats)) {
      this.stat(label, value);
    }
  }

  // Utility
  blank() {
    console.log();
  }

  box(content, options = {}) {
    const lines = content.split('\n');
    const maxWidth = Math.max(...lines.map(l => l.length));
    const borderColor = options.color || COLORS.muted;
    
    console.log(borderColor('┌' + '─'.repeat(maxWidth + 2) + '┐'));
    for (const line of lines) {
      console.log(borderColor('│') + ' ' + line.padEnd(maxWidth) + ' ' + borderColor('│'));
    }
    console.log(borderColor('└' + '─'.repeat(maxWidth + 2) + '┘'));
  }
}

module.exports = { CliFormatter };
```

---

## Part 4: Integration Examples

### Example 1: Before (Current)
```javascript
// src/tools/validate-gazetteer.js
function printHuman(summary, details) {
  const lines = [];
  lines.push(`# Gazetteer validation`);
  const add = (label, arr) => lines.push(`${label}: ${arr.length}`);
  add('Nameless places', details.nameless);
  add('Bad canonical refs', details.badCanonical);
  console.log(lines.join('\n'));
}
```

**Output:**
```
# Gazetteer validation
Nameless places: 42
Bad canonical refs: 15
...
```

### Example 1: After (With CliFormatter)
```javascript
// src/tools/validate-gazetteer.js
const { CliFormatter } = require('../utils/CliFormatter');

const fmt = new CliFormatter();

function printHuman(summary, details) {
  fmt.header('Gazetteer Validation Report');
  
  fmt.section('Issues Found');
  fmt.stat('Nameless places', details.nameless.length);
  fmt.stat('Bad canonical refs', details.badCanonical.length);
  fmt.stat('Regions missing codes', details.badRegions.length);
  fmt.stat('Countries with invalid code', details.badCountries.length);
  fmt.stat('Orphan hierarchy edges', details.orphanEdges.length);
  
  fmt.blank();
  fmt.list('Top issues (first 5)', [
    `${details.nameless.length} nameless places`,
    `${details.badCanonical.length} bad canonical references`,
    `${details.badRegions.length} regions missing codes`
  ]);
  
  if (summary.allValid) {
    fmt.success('All validations passed');
  } else {
    fmt.warn(`Found ${summary.totalIssues} issues`);
  }
  
  fmt.footer();
}
```

**Output:**
```
╔ Gazetteer Validation Report ═══════════════════════════════════════════════

Issues Found
──────────────
  Nameless places              42
  Bad canonical refs           15
  Regions missing codes        8
  Countries with invalid code  2
  Orphan hierarchy edges       0

Topics:
  • 42 nameless places
  • 15 bad canonical references
  • 8 regions missing codes

⚠ [WARN] Found 67 issues
═══════════════════════════════════════════════════════════════════════════
```

---

### Example 2: Domain Analysis

**Before:**
```javascript
for (const host of hosts) {
  const result = analyze(host);
  process.stdout.write(`${host}\t${result.kind}\t${result.score.toFixed(3)}\n`);
}
```

**After:**
```javascript
const fmt = new CliFormatter();

fmt.header('Domain Analysis Results');

const rows = hosts.map(host => {
  const result = analyze(host);
  return {
    domain: host,
    kind: result.kind === 'news' ? fmt.COLORS.success(result.kind) : result.kind,
    score: result.score.toFixed(3),
    '429rpm': result.http429.windows.m60.rpm.toFixed(2)
  };
});

fmt.table(rows);
fmt.summary({
  'Total domains': hosts.length,
  'News sites': rows.filter(r => r.kind === 'news').length,
  'Non-news': rows.filter(r => r.kind !== 'news').length
});
fmt.footer();
```

**Output:**
```
╔ Domain Analysis Results ══════════════════════════════════════════════════

  domain                        │ kind        │ score   │ 429rpm
  ──────────────────────────────┼─────────────┼─────────┼─────────
  bbc.com                       │ news        │ 0.987   │ 0.00
  theguardian.com               │ news        │ 0.945   │ 0.12
  example.com                   │ other       │ 0.234   │ 1.50

Summary
──────────
  Total domains                1234
  News sites                   1189
  Non-news                     45

═════════════════════════════════════════════════════════════════════════════
```

---

## Part 5: Comparison Table

| Aspect | commander.js | Custom Parser | Current State |
|---|---|---|---|
| **Learning curve** | Gentle | Very easy | N/A |
| **Help generation** | Automatic | Manual | None |
| **Type validation** | Built-in | Manual | None |
| **Code per tool** | ~5 lines | ~15 lines | ~30 lines |
| **Extensibility** | Excellent (subcommands) | Good | Poor |
| **External deps** | 1 (small) | 0 | 0 |
| **Industry standard** | Yes | No | N/A |

---

## Part 6: Implementation Roadmap

### Phase 1: Foundation (2 hours)
1. Create `src/utils/CliFormatter.js`
2. Create `src/utils/CliArgumentParser.js` (if custom) OR add commander.js
3. Write unit tests for formatters
4. Create sample output file (`CLI_OUTPUT_SAMPLES.md`)

### Phase 2: Migrate One Tool (1 hour)
1. Pick `validate-gazetteer.js` as pilot
2. Refactor using CliFormatter + argument parser
3. Test output manually
4. Document patterns

### Phase 3: Standardize (3 hours)
1. Migrate remaining tools (`analyze-domains.js`, `detect-articles.js`, etc.)
2. Create shared templates for common patterns
3. Update all CLI tools incrementally

### Phase 4: Enhance (2 hours)
1. Add JSON output support
2. Add CSV export
3. Add log file generation
4. Create CLI theme system (dark/light)

---

## Part 7: Recommendation Summary

### What to Do

**Option 1: Recommended (commander.js)**
```bash
npm install commander
```
- Use for all new CLI tools
- Professional CLI feel
- Auto-generated help
- Type validation

**Option 2: Lightweight (Custom CliArgumentParser)**
- Use if you want zero new dependencies
- Still get schema validation
- More control over parsing

### What to Create

**Create `CliFormatter` module:**
- Centralize all color/icon usage
- Provide reusable output components (tables, sections, progress)
- Make beautiful output the default

**Create output sample file:**
- Show what good output looks like
- Use as goal/template for other tools
- Help standardize appearance

### Beautiful Output Standards

1. **Headers** — Use boxes with emojis
2. **Stats** — Right-aligned values with icons
3. **Lists** — Bullet points with hierarchy
4. **Tables** — ASCII borders, colored headers
5. **Status** — Progress bars with percentage
6. **Errors** — Clear red, with error icon
7. **Success** — Green with checkmark emoji
8. **Warnings** — Yellow with caution icon

---

## Sample Goals/Templates

### Goal: Validation Report
```
╔ Gazetteer Validation Report ══════════════════════════════════════════════

Issues Summary
──────────────
  ✓ Passed checks                  8 / 10
  ✖ Failed checks                  2 / 10
  ⚠ Warnings                       3

Details
───────
  • Nameless places: 42 places
  • Bad references: 15 refs
  • Orphan edges: 0 edges

Recommendation
───────────────
  Run with --fix to automatically repair issues

═════════════════════════════════════════════════════════════════════════════
```

### Goal: Analysis Results Table
```
╔ Domain Analysis Results ══════════════════════════════════════════════════

  domain              │ type     │ score  │ articles │ rate 429/m
  ────────────────────┼──────────┼────────┼──────────┼────────────
  bbc.com             │ ✓ news   │ 0.98   │ 12,891   │ 0.00
  theguardian.com     │ ✓ news   │ 0.94   │ 8,234    │ 0.12
  example.com         │ ✗ error  │ 0.00   │ —        │ —

Legend: ✓ = passed, ✗ = failed

═════════════════════════════════════════════════════════════════════════════
```

### Goal: Progress Output
```
[⚙] Starting analysis...

  Processing domains  [████████░░░░░░░░░░] 40%
  Validating schemas  [══════════════════░░] 90%

[✓] Complete!
```

---

## Next Steps

1. **Review this analysis** — Does this match your vision?
2. **Pick approach** — commander.js or custom parser?
3. **Create samples** — Show me what beautiful output means to you
4. **Build CliFormatter** — Start with core module
5. **Migrate tools** — Do 1-2 as examples, then iterate

Would you like me to:
- Create the CliFormatter module with full implementation?
- Install commander.js and create refactored examples?
- Create sample output files showing your goals?
- All of the above?

