# Gazetteer Correction Tools

Data quality tools for fixing common issues in the gazetteer database.

## Philosophy

**Viewing tools should be dumb.** When data quality issues are discovered (e.g., incorrect classifications, missing normalizations), the solution is NOT to add special case logic to viewing/listing tools. Instead:

1. **Diagnose root cause**: Why was the data ingested incorrectly?
2. **Fix at source**: Improve ingestor robustness for future data
3. **Correct historical data**: Use tools in this directory to fix existing data
4. **Validate**: Add validation to prevent recurrence

## 🔧 Available Tools

### 1. fix-canonical-names.js ⭐
**Sets canonical_name_id for places missing it**

Places with NULL canonical_name_id appear as "unnamed" in queries, causing artificial separation from duplicates.

```bash
# Preview all places needing fixes
node tools/corrections/fix-canonical-names.js

# Fix all places
node tools/corrections/fix-canonical-names.js --fix

# Fix only capital cities
node tools/corrections/fix-canonical-names.js --fix --kind=city --role=capital
```

### 2. fix-duplicate-places.js ⭐
**Advanced deduplication with coordinate proximity matching**

Merges places that are clearly the same (same name + country + within ~5.5km).

```bash
# Preview all duplicates
node tools/corrections/fix-duplicate-places.js

# Fix duplicate capitals
node tools/corrections/fix-duplicate-places.js --fix --kind=city --role=capital

# Fix specific country
node tools/corrections/fix-duplicate-places.js --fix --country=GB

# Adjust proximity threshold
node tools/corrections/fix-duplicate-places.js --proximity=0.1  # ~11km
```

### 3. fix-place-hub-names.js
**Normalizes place hub slugs to match gazetteer**

Fixes cases like "srilanka" → "sri-lanka" to match gazetteer "Sri Lanka".

```bash
# Preview changes
node tools/corrections/fix-place-hub-names.js

# Apply fixes
node tools/corrections/fix-place-hub-names.js --fix
```

### 4. fix-duplicate-capitals.js (Legacy)
**Basic duplicate merger - superseded by fix-duplicate-places.js**

Use fix-duplicate-places.js instead for better results.

## 🎯 Recommended Workflow

**Complete Data Cleanup for Capital Cities**:

```bash
# Step 1: Backup database
cp data/news.db data/news.db.backup

# Step 2: Fix canonical names
node tools/corrections/fix-canonical-names.js --fix --kind=city --role=capital

# Step 3: Deduplicate
node tools/corrections/fix-duplicate-places.js --fix --kind=city --role=capital

# Step 4: Verify
node tools/gazetteer/list-capital-cities.js --with-country
```

**Expected Results** (October 2025):
- Before: 255 capitals (8 duplicates: GB×4, IE×4)
- After: 249 capitals (1 London, 1 Dublin)

## ⚙️ Tool Conventions

All correction tools follow these conventions:

- **Default behavior**: Dry run (safe preview)
- **Apply changes**: Requires `--fix` flag
- **Output**: Clear indication of what will/did change
- **Safety**: No destructive operations without explicit confirmation

## 📖 Common Issues

### Issue: "Would keep multiple records"
**Cause**: Records lack canonical_name_id  
**Solution**: Run fix-canonical-names.js first

### Issue: "Duplicates not detected"
**Cause**: Coordinates too far apart (>5.5km)  
**Solution**: Increase proximity threshold: `--proximity=0.1`

### Issue: "Still seeing duplicates after fix"
**Cause**: Different names in place_names table  
**Solution**: Check place_names entries, may need manual merge

## 🔍 Debugging

**Check canonical names**:
```bash
node tools/db-query.js "SELECT id, kind, country_code, canonical_name_id FROM places WHERE canonical_name_id IS NULL LIMIT 10"
```

**Check for duplicates**:
```bash
node tools/db-query.js "SELECT country_code, COUNT(*) as count FROM places WHERE kind='city' AND json_extract(extra, '$.role')='capital' GROUP BY country_code HAVING count > 1"
```

**Verify place names**:
```bash
node tools/db-query.js "SELECT p.id, pn.name, pn.normalized, p.canonical_name_id FROM places p JOIN place_names pn ON p.id = pn.place_id WHERE p.id = <ID>"
```

## 📚 Documentation

- **Complete Guide**: `docs/GAZETTEER_DEDUPLICATION_IMPLEMENTATION.md`
- **Architecture**: `AGENTS.md` - "Tools and Correction Scripts" section
- **Database Schema**: `docs/DATABASE_SCHEMA_ERD.md`

## 🧪 Testing

All tools support dry-run mode by default. Always preview before applying:

```bash
# SAFE: Preview changes
node tools/corrections/fix-duplicate-places.js

# CAREFUL: Apply changes
node tools/corrections/fix-duplicate-places.js --fix
```

## 🚨 Important Notes

1. **Always backup** before running with `--fix`
2. **Preview first** - run without `--fix` to see what will change
3. **Order matters** - fix canonical names before deduplication
4. **Verify results** - check counts and sample data after fixes
5. **Check warnings** - Node.js warnings indicate real problems

## Creating New Correction Tools

### Pattern

1. **Name**: `fix-{specific-issue}.js` (e.g., `fix-duplicate-articles.js`)
2. **Documentation**: Header comment explaining:
   - What problem it fixes
   - Why the problem occurred
   - How it corrects the data
   - Usage examples
3. **Dry run mode**: Default mode shows what would change (no --fix flag)
4. **Apply mode**: `--fix` flag applies changes
5. **Idempotent**: Safe to run multiple times
6. **Transaction**: Use SQLite transactions for atomic updates
7. **Reporting**: Show counts, examples, success/failure

### Template

```javascript
#!/usr/bin/env node

/**
 * fix-{issue}.js - One-line description
 * 
 * Problem: Detailed explanation of the issue
 * 
 * Solution: How this tool fixes it
 * 
 * Usage:
 *   node tools/corrections/fix-{issue}.js        # Dry run
 *   node tools/corrections/fix-{issue}.js --fix  # Apply changes
 */

const path = require('path');
const { ensureDatabase } = require('../../src/db/sqlite');

// Parse args
const args = process.argv.slice(2);
const applyFix = args.includes('--fix');

// Initialize database
const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');
const db = ensureDatabase(dbPath);

console.log('\n🔍 Analyzing...\n');

// Find issues
const issues = db.prepare(`
  SELECT * FROM table WHERE condition
`).all();

console.log(`Found ${issues.length} issue${issues.length === 1 ? '' : 's'}\n`);

if (issues.length > 0) {
  // Show what would be fixed
  issues.forEach((issue, i) => {
    console.log(`${i + 1}. ${issue.description}`);
  });
  
  if (applyFix) {
    console.log('\n🔧 Applying corrections...\n');
    
    const updateStmt = db.prepare(`UPDATE table SET field = ? WHERE id = ?`);
    const updateMany = db.transaction((issues) => {
      for (const issue of issues) {
        updateStmt.run(issue.newValue, issue.id);
      }
    });
    
    updateMany(issues);
    console.log(`✅ Fixed ${issues.length} issue${issues.length === 1 ? '' : 's'}!\n`);
  } else {
    console.log('\nℹ️  Dry run - no changes applied. Use --fix to apply.\n');
  }
}

db.close();
```

## When to Create Correction Tools

Create a correction tool when:

- ✅ Data quality issue affects multiple records
- ✅ Issue is systematic (pattern exists)
- ✅ Future data should be fixed at ingestion time
- ✅ Historical data needs one-time correction

Don't create a correction tool when:

- ❌ Issue affects 1-2 records (manually fix in SQL)
- ❌ No clear pattern (investigate root cause first)
- ❌ Problem is in viewing logic (fix the view, not the data)
