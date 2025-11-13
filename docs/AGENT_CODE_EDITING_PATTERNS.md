# JavaScript Code Editing Patterns for Agents

**For**: AI agents performing focused code changes  
**Purpose**: Quick reference for common refactoring patterns  
**Status**: Ready for immediate use

---

## 🎯 Quick Pattern Reference

### Pattern 1: Find and Replace a Single Function

```bash
# 1. Discover the function
node js-scan.js --dir src --search myFunction --json > search.json

# 2. Extract metadata (file + hash)
FILE=$(jq -r '.matches[0].file' search.json)
HASH=$(jq -r '.matches[0].hash' search.json)

# 3. Extract current implementation
node js-edit.js --file "$FILE" --extract myFunction --json > current.json

# 4. Replace with new implementation (dry-run first!)
node js-edit.js --file "$FILE" \
  --replace myFunction \
  --with-file new-implementation.js \
  --expect-hash "$HASH" \
  --dry-run --emit-diff --json

# 5. If diff looks good, apply
node js-edit.js --file "$FILE" \
  --replace myFunction \
  --with-file new-implementation.js \
  --expect-hash "$HASH" \
  --fix
```

---

### Pattern 2: Rename a Function Across Files

```bash
# 1. Find all occurrences
node js-scan.js --dir src --search oldName --json > usages.json

# 2. Extract each file's version for context
for file in $(jq -r '.matches[].file' usages.json | sort -u); do
  echo "=== $file ==="
  node js-edit.js --file "$file" --extract oldName --json
done

# 3. For each file, validate and apply rename
jq -r '.matches[].file' usages.json | sort -u | while read file; do
  echo "Renaming in $file..."
  node js-edit.js --file "$file" \
    --locate oldName \
    --rename oldName newName \
    --dry-run --json | jq '.'
  
  # If looks good, apply
  node js-edit.js --file "$file" \
    --rename oldName newName \
    --fix
done

# 4. Verify tests pass
npm run test:by-path tests/**/*.test.js
```

---

### Pattern 3: Extract a Helper Function

```bash
# 1. Locate where to extract from
node js-edit.js --file src/app.js --list-functions --json | \
  jq '.functions[] | select(.name | contains("handler"))'

# 2. Find the code block to extract
node js-edit.js --file src/app.js \
  --locate myHandler \
  --preview --json > handler.json

# 3. Extract the snippet
SNIPPET='if (x > 10) { return x * 2; } else { return x; }'

node js-edit.js --file src/app.js \
  --locate myHandler \
  --extract-helper \
  --with-code "$SNIPPET" \
  --helper-name "calculateValue" \
  --dry-run --emit-diff

# 4. Apply if looks good
node js-edit.js --file src/app.js \
  --locate myHandler \
  --extract-helper \
  --with-code "$SNIPPET" \
  --helper-name "calculateValue" \
  --fix
```

---

### Pattern 4: Update a Class Method

```bash
# 1. Find the class
node js-edit.js --file src/User.js \
  --list-functions --json | jq '.functions[] | select(.kind == "method")'

# 2. Get method context
node js-edit.js --file src/User.js \
  --locate "name:/User/validate" \
  --context-function \
  --json

# 3. Replace with new implementation
node js-edit.js --file src/User.js \
  --replace "path:/class/method/validate" \
  --with-file new-validate.js \
  --emit-plan plan.json \
  --dry-run

# 4. If plan looks good
node js-edit.js --file src/User.js \
  --replace "path:/class/method/validate" \
  --with-file new-validate.js \
  --fix
```

---

### Pattern 5: Multi-file Refactor (Coordinated)

```bash
# 1. Plan phase: discover impact
node js-scan.js --dir src \
  --search targetFunction \
  --view detailed --json > impact.json

# 2. Extract all versions
jq -r '.matches[].file' impact.json | sort -u | while read file; do
  echo "# File: $file"
  node js-edit.js --file "$file" \
    --extract targetFunction \
    --json | jq '.source'
done > all-versions.txt

# 3. Review all versions (check for variations)
echo "Review these variations before proceeding"
cat all-versions.txt

# 4. Apply same change to all files
jq -r '.matches[].file' impact.json | sort -u | while read file; do
  node js-edit.js --file "$file" \
    --replace targetFunction \
    --with-file unified-implementation.js \
    --emit-plan "plan-$file.json" \
    --dry-run --json | jq '.status'
done

# 5. Review all plans before committing
echo "Reviewing all plans..."
for plan in plan-*.json; do
  echo "=== $plan ==="
  jq '.status' "$plan"
done

# 6. If all plans valid, apply all
jq -r '.matches[].file' impact.json | sort -u | while read file; do
  node js-edit.js --file "$file" \
    --replace targetFunction \
    --with-file unified-implementation.js \
    --fix
done

# 7. Comprehensive testing
npm run test:all
```

---

### Pattern 6: Safe In-Place Edits with Guards

```bash
# 1. Get current hash/location
node js-edit.js --file src/app.js \
  --locate myFunction \
  --json > target.json

HASH=$(jq -r '.hash' target.json)
SPAN=$(jq -r '.span' target.json)

# 2. Prepare replacement
cat > replacement.js <<'EOF'
function myFunction(arg1, arg2) {
  // New implementation here
  return processData(arg1, arg2);
}
EOF

# 3. Replace with guards (double-check we're editing the right thing)
node js-edit.js --file src/app.js \
  --replace myFunction \
  --with-file replacement.js \
  --expect-hash "$HASH" \
  --expect-span "$SPAN" \
  --dry-run --emit-diff --json

# 4. Apply when confident
node js-edit.js --file src/app.js \
  --replace myFunction \
  --with-file replacement.js \
  --expect-hash "$HASH" \
  --expect-span "$SPAN" \
  --fix
```

---

## 🔍 Selector Patterns

### Function Selectors

```bash
# By exact name (case-insensitive)
--locate "name:/myFunction"

# Exported function
--locate "name:/exports/myFunction"

# Class method
--locate "path:/class/methodName"

# By hash (when you have it)
--locate "hash:abc123xyz"

# Anonymous/arrow (by context)
--locate "path:/const/arrow/mapper"

# Constructor
--locate "path:/class/constructor"
```

### Variable Selectors

```bash
# By variable name
--locate-variable "myVar"

# Exported variable
--locate-variable "exports/CONFIG"

# Const/let/var (specific kind)
--locate-variable "const/DEBUG_MODE"
```

---

## 🛡️ Safety Patterns

### Dry-Run First (Always!)

```bash
# GOOD: Dry-run to preview
node js-edit.js --file src/app.js \
  --replace myFunc \
  --with-code "new implementation" \
  --dry-run --emit-diff

# BAD: Direct file modification without preview
node js-edit.js --file src/app.js \
  --replace myFunc \
  --with-code "new implementation" \
  --fix
```

### Guard Every Edit

```bash
# GOOD: Use guards to verify we're editing the right thing
node js-edit.js --file src/app.js \
  --replace myFunc \
  --with-file new.js \
  --expect-hash "abc123" \
  --fix

# BAD: Edit without guards (could hit wrong function)
node js-edit.js --file src/app.js \
  --replace myFunc \
  --with-file new.js \
  --fix
```

### Plan Before Multi-file

```bash
# GOOD: Create and review plan first
node js-edit.js --file src/a.js \
  --replace targetFunc \
  --with-file new.js \
  --emit-plan plan.json \
  --dry-run

# Review plan.json, then apply

# BAD: Apply multi-file changes blindly
# (no rollback if something goes wrong)
```

---

## ⚡ Performance Tips

### Batch Discovery (Faster!)

```bash
# Instead of multiple js-scan calls:
node js-scan.js --dir src --search func1 --json
node js-scan.js --dir src --search func2 --json
node js-scan.js --dir src --search func3 --json

# Use single js-scan with multiple terms (MORE EFFICIENT)
node js-scan.js --dir src --search func1 func2 func3 --json
```

### Use Hashes When Available

```bash
# Instead of discovering every time:
node js-scan.js --dir src --search myFunc --json > result.json
HASH=$(jq '.matches[0].hash' result.json)
node js-edit.js --file src/app.js --locate hash:$HASH

# COMING SOON: Direct hash index lookup (even faster)
```

### Limit Results Strategically

```bash
# Too much output (default 20 matches)
node js-scan.js --dir src --search common --json | wc -l

# Better: Limit and use view modes
node js-scan.js --dir src --search common --limit 5 --view terse --json

# Or filter by kind
node js-scan.js --dir src --search common --kind function --limit 10 --json
```

---

## 🐛 Debugging Workflows

### "Multiple Matches" Disambiguation

```bash
# Problem: Multiple functions named "handler"
node js-edit.js --file src/app.js --locate handler
# Error: Multiple matches found

# Solution 1: Use --select with index
node js-edit.js --file src/app.js --locate handler --select 1  # First match
node js-edit.js --file src/app.js --locate handler --select 2  # Second match

# Solution 2: Be more specific with selectors
node js-edit.js --file src/app.js --locate "path:/class/method/handler"

# Solution 3: Use hash if available from scan
node js-scan.js --search handler --json | jq '.matches[].hash'
node js-edit.js --file src/app.js --locate hash:abc123
```

### "Hash Mismatch" Recovery

```bash
# Problem: Guard failed - code changed since discovery
# Error: expect-hash failed (was abc123, now xyz789)

# Solution: Re-discover to get fresh hash
node js-scan.js --dir src --search myFunc --json > fresh.json
FRESH_HASH=$(jq -r '.matches[0].hash' fresh.json)

# Try again with fresh hash
node js-edit.js --file src/app.js \
  --replace myFunc \
  --with-file new.js \
  --expect-hash "$FRESH_HASH" \
  --dry-run
```

### "No Matches" Investigation

```bash
# Problem: Selector returns no results
# Reason: Function moved, renamed, or deleted?

# Investigate:
# 1. Check if still exists in file
node js-edit.js --file src/app.js --list-functions --match "similar*"

# 2. Search across repo
node js-scan.js --dir src --search oldName --json

# 3. Check by hash (if you have old hash)
node js-scan.js --dir src --find-hash oldHashValue --json
```

---

## 📋 Checklist for Safe Code Changes

Before applying any change:

- [ ] **Discovered correctly**: Verified function location and hash
- [ ] **Dry-run passed**: `--dry-run --emit-diff` shows expected changes only
- [ ] **Guards in place**: Using `--expect-hash` or `--expect-span`
- [ ] **Plan reviewed**: `--emit-plan` output makes sense
- [ ] **Test impact assessed**: Know which tests will be affected
- [ ] **Rollback path exists**: Can revert if tests fail
- [ ] **Single responsibility**: Each edit targets ONE function/file
- [ ] **Syntax valid**: Replacement code is valid JavaScript
- [ ] **Imports updated**: If renaming, check dependents
- [ ] **Tests green**: Run relevant tests after each change

---

## 🎓 Learning Path for Agents

### Level 1: Basic (Start Here)
- [ ] Pattern 1: Find and replace single function
- [ ] Understand selector syntax
- [ ] Practice dry-run workflow

### Level 2: Intermediate
- [ ] Pattern 2: Rename function across files
- [ ] Use guards (--expect-hash)
- [ ] Multi-step workflows

### Level 3: Advanced
- [ ] Pattern 5: Coordinated multi-file refactor
- [ ] Pattern 6: Complex guards with spans
- [ ] Batch operations (coming soon)

### Level 4: Expert
- [ ] Dependency graph analysis (coming soon)
- [ ] Interactive mode workflows (coming soon)
- [ ] Hash index optimization (coming soon)

---

## 📖 Related Documentation

- **CLI Tool Testing**: `/docs/CLI_TOOL_TESTING_GUIDE.md`
- **Token System**: `/docs/COMPACT_TOKENS_IMPLEMENTATION.md`
- **AGENTS.md**: `/AGENTS.md` (CLI Tooling section)
- **js-scan README**: `/tools/dev/README.md`
- **js-edit README**: `/tools/dev/README.md`

---

**Last Updated**: November 13, 2025  
**Status**: Ready for agent use  
**Questions?**: See `/docs/CLI_TOOL_TESTING_GUIDE.md` or error recovery guide
