# CLI Output Samples — Before & After Refactoring

**Date:** October 30, 2025  
**Focus:** Beautiful formatted output with consistent colors, emojis, and structure

---

## Tool 1: validate-gazetteer.js

### Before (Plain Text)
```
# Gazetteer validation
Nameless places: 42
Bad canonical refs: 15
Regions missing codes: 8
Countries missing/invalid code: 2
Orphan hierarchy edges: 0
Two-node cycles: 0
Long cycles (depth<=20): 0
Duplicate names (by norm/lang/kind): 0
Missing normalized: 0
External IDs linked to >1 place: 0

## Nameless places
{"id": 123, "wikidata_id": "Q123", ...}
{"id": 456, "wikidata_id": "Q456", ...}
...
```

**Issues:**
- ❌ No visual hierarchy
- ❌ No status indication
- ❌ Difficult to scan results
- ❌ No color coding
- ❌ Inconsistent formatting

### After (CliFormatter)
```
╔ Gazetteer Validation Report ══════════════════════════════════════════════

Issues Summary
──────────────────
  Nameless places                 42
  Bad canonical refs              15
  Regions missing codes            8
  Countries invalid/missing code   2
  Orphan hierarchy edges           0
  Two-node cycles                  0
  Long cycles (depth ≤ 20)         0
  Duplicate names                  0
  Missing normalized               0
  Duplicate external IDs           0

⚠ [WARN] Found 67 total issues
ℹ [INFO] Run with --details to see full issue lists

═════════════════════════════════════════════════════════════════════════════
```

**Improvements:**
- ✅ Clear visual header with decorative box
- ✅ Organized stats section with alignment
- ✅ Status emoji (⚠) with color warning
- ✅ Helpful next steps guidance
- ✅ Professional appearance

### With `--details` flag:
```
╔ Gazetteer Validation Report ══════════════════════════════════════════════

Issues Summary
──────────────────
  [stats from above]

Nameless places
───────────────
ℹ [INFO] 42 total

  • {"id": 123, "wikidata_id": "Q123"}
  • {"id": 456, "wikidata_id": "Q456"}
  • {"id": 789, "wikidata_id": "Q789"}
  ... and 39 more

Bad canonical refs
──────────────────
ℹ [INFO] 15 total

  • {"place_id": 100, "ref": "invalid_code"}
  • {"place_id": 101, "ref": "null"}
  ... and 13 more

[more sections...]

═════════════════════════════════════════════════════════════════════════════
```

---

## Tool 2: analyze-domains.js

### Before (Tab-Separated)
```
bbc.com	news	0.987	429rpm15=0.000	429rpm60=0.000
theguardian.com	news	0.945	429rpm15=0.004	429rpm60=0.012
example.com	other	0.234	429rpm15=1.500	429rpm60=2.300
reuters.com	news	0.992	429rpm15=0.001	429rpm60=0.002
...
```

**Issues:**
- ❌ No headers
- ❌ Hard to parse visually
- ❌ No status codes or meanings
- ❌ No summary statistics
- ❌ Difficult to scan for problems

### After (CliFormatter Table)
```
╔ Domain Analysis Results ══════════════════════════════════════════════════

⚙ [CFG] Analyzing 4 domain(s)...

  domain              │ type     │ score  │ articles │ sections │ 429/15m │ 429/60m
  ────────────────────┼──────────┼────────┼──────────┼──────────┼─────────┼─────────
  bbc.com             │ ✓ news   │ 0.987  │ 5234     │ 12       │ 0.00    │ 0.00
  theguardian.com     │ ✓ news   │ 0.945  │ 8234     │ 19       │ 0.00    │ 0.01
  example.com         │ ✗ other  │ 0.234  │ 45       │ 2        │ ⚠ 1.50  │ ⚠ 2.30
  reuters.com         │ ✓ news   │ 0.992  │ 12891    │ 34       │ 0.00    │ 0.00

Summary
────────
  Total domains                        1234
  News domains                         1189
  Other domains                        45
  Analyzed in                          2025-10-30T14:23:45.123Z

═════════════════════════════════════════════════════════════════════════════
```

**Improvements:**
- ✅ Clear column headers with alignment
- ✅ Unicode borders for visual structure
- ✅ Status icons (✓/✗) with color coding
- ✅ Highlighted 429 errors in yellow
- ✅ Summary statistics at end
- ✅ Professional table layout
- ✅ Easy to scan and analyze

---

## Tool 3: detect-articles.js

### Before (Inline Output)
```
ARTICLE  https://www.bbc.com/news/article1
ARTICLE  https://www.bbc.com/news/article2
NOT      https://example.com/about
ARTICLE  https://www.theguardian.com/world/article3

Processed 100 URLs. Detected 87 articles, rejected 13.
```

**Issues:**
- ❌ No visual feedback
- ❌ Hard to identify failures
- ❌ No confidence scores visible
- ❌ Minimal details about reasoning
- ❌ Poor summary

### After (CliFormatter with Sections)

#### Simple Mode (default):
```
╔ Article Detection Analysis ═══════════════════════════════════════════════

ℹ [INFO] Filters: host = bbc.com, limit = 100
ℹ [INFO] Filters: Analyzing all URLs...

⏳ [WAIT] Loading 100 candidate(s)...

  status │ url                                    │ title
  ───────┼────────────────────────────────────────┼──────────────────────────
  ✓      │ https://www.bbc.com/news/article1     │ Breaking News: Major Event
  ✓      │ https://www.bbc.com/news/article2     │ World News Update
  ✖      │ https://example.com/about              │ About Us
  ✓      │ https://www.theguardian.com/world/a   │ Global Analysis Report
  ✓      │ https://www.bbc.com/sport/article4    │ Sports Update: Match Result
  ...    │ (96 more)                              │ ...

Summary
────────
  Total processed                      100
  Articles detected                    87
  Not articles                         13
  Detection rate                       87.0%

═════════════════════════════════════════════════════════════════════════════
```

#### Explain Mode (`--explain`):
```
╔ Article Detection Analysis ═══════════════════════════════════════════════

ℹ [INFO] Filters: explain mode, limit = 10, sample = true

✓ https://www.bbc.com/news/article1

  Title: Breaking News: Major Event
  Score: 0.95
  Confidence: 0.92

  Reasons:
    • Content length 1245 words (typical article)
    • Date pattern detected in URL
    • Schema.org markup present
    • Navigation link count: 8 (normal)

  Signals: wordCount=1245, navLinks=8, articleLinks=12, confidence=0.92, latest=article

─────────────────────────────────────────────────────────────────────────────

✖ https://example.com/about

  Title: About Us
  Rejections:
    • Content too short (180 words, minimum 300)
    • No date pattern in URL
    • No article schema markup
    • High navigation ratio

  Signals: wordCount=180, navLinks=45, articleLinks=2, confidence=0.08, source=structure

─────────────────────────────────────────────────────────────────────────────

Summary
────────
  Total processed                      100
  Articles detected                    87
  Not articles                         13
  Detection rate                       87.0%

═════════════════════════════════════════════════════════════════════════════
```

**Improvements:**
- ✅ Color-coded status icons (✓ green, ✖ red)
- ✅ Clear section headers
- ✅ Detailed reasoning visible with --explain
- ✅ Confidence scores shown
- ✅ Organized signal display
- ✅ Professional visual hierarchy
- ✅ Progress bar for long runs
- ✅ Summary statistics

---

## Key Formatting Features Used

### Colors
- 🟢 **Success** (green) — Valid, passing, positive outcomes
- 🔴 **Error** (red) — Failures, errors, invalid data
- 🟡 **Warning** (yellow) — Caution, high values, issues to review
- 🔵 **Info** (blue) — Informational messages, status
- 🔲 **Muted** (gray) — Less important details, secondary information
- 🟣 **Accent** (magenta) — Section headers, emphasis

### Emojis
- `✓` — Success, valid item
- `✖` — Error, invalid item, failure
- `⚠` — Warning, caution
- `ℹ` — Information, status message
- `⏳` — Pending, processing, waiting
- `✅` — Complete, done
- `⚙` — Settings, configuration
- `🌍` — Geography, location
- `🗂` — Database, schema
- `📊` — Tables, statistics
- `•` — Bullet points, lists

### Structure
- **Header** — Tool name in decorative box with line
- **Sections** — Grouped related content with underline
- **Tables** — Aligned columns with borders and headers
- **Stats** — Right-aligned values with labels
- **Lists** — Bullet points for grouped items
- **Progress** — Visual bar for long operations
- **Footer** — Closing divider line

### Indentation
- 0 spaces — Main headers
- 2 spaces — Section content, stats, table data
- 4+ spaces — Nested details, reasons, signals

---

## API Usage Examples

### Basic Usage
```javascript
const { CliFormatter } = require('../utils/CliFormatter');
const fmt = new CliFormatter();

// Simple messages
fmt.success('Operation completed');
fmt.error('Something went wrong');
fmt.warn('Be careful with this');
fmt.info('For your information');

// Structured output
fmt.header('My Report');
fmt.section('Summary');
fmt.stat('Total items', 1234);
fmt.stat('Success rate', '95.2%');
```

### Tables
```javascript
fmt.table([
  { name: 'Item 1', status: 'ok', count: 42 },
  { name: 'Item 2', status: 'error', count: 0 }
], {
  columns: ['name', 'status', 'count'],
  format: {
    status: (v) => v === 'error' ? fmt.COLORS.error(v) : fmt.COLORS.success(v)
  }
});
```

### Progress
```javascript
for (let i = 0; i < total; i++) {
  // do work...
  if (i % 50 === 0) {
    fmt.progress('Processing', i, total);
  }
}
```

### Custom Status Lines
```javascript
fmt.statusLine('geography', 'info', 'GEO', 'Loading countries');
fmt.statusLine('database', 'warning', 'DB', 'Connection slow');
fmt.statusLine('complete', 'success', 'OK', 'All systems go');
```

---

## Argument Parsing Examples

### Before (Manual)
```javascript
function parseArgs(argv) {
  const args = { details: false, json: false };
  for (const a of argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) args[m[1]] = m[2];
    else if (a.startsWith('--')) args[a.slice(2)] = true;
  }
  args.details = String(args.details).toLowerCase() === 'true';
  args.json = String(args.json).toLowerCase() === 'true';
  return args;
}

const args = parseArgs(process.argv);
```

### After (CliArgumentParser)
```javascript
const { CliArgumentParser } = require('../utils/CliArgumentParser');

const parser = new CliArgumentParser('my-tool', 'Tool description');
parser
  .add('--db <path>', 'Database path', 'default.db')
  .add('--details', 'Show details', false, 'boolean')
  .add('--json', 'JSON output', false, 'boolean')
  .add('--limit <number>', 'Result limit', 100, 'number');

const args = parser.parse(process.argv);
```

**Benefits:**
- ✅ Automatic help generation (`--help`)
- ✅ Type coercion and validation
- ✅ Default values handled
- ✅ Clean, readable code
- ✅ Industry-standard pattern (commander.js)

---

## Integration Checklist

When refactoring a CLI tool:

- [ ] Import `CliFormatter` and `CliArgumentParser`
- [ ] Replace manual `parseArgs()` with `CliArgumentParser`
- [ ] Add `fmt.header()` at start
- [ ] Convert print statements to `fmt.success()`, `fmt.error()`, etc.
- [ ] Replace simple output with `fmt.stat()` calls
- [ ] Convert data listing to `fmt.table()`
- [ ] Add `fmt.summary()` with final stats
- [ ] Add `fmt.footer()` at end
- [ ] Use consistent emoji for status (✓/✖/⚠)
- [ ] Use consistent colors (green/red/yellow/blue)
- [ ] Test with `--help` to verify argument parsing
- [ ] Test color output in actual terminal
- [ ] Update tool's JSDoc comments
- [ ] Add before/after examples to documentation

---

## Next Steps

1. **Apply to more tools** — Iterate these patterns across remaining CLI tools
2. **Create standard templates** — Develop common layouts (validation report, analysis table, progress tracking)
3. **Add theme support** — Create dark/light mode themes
4. **Export functionality** — Add CSV, JSON, log file export
5. **Performance monitoring** — Track execution time and add timing info to output

