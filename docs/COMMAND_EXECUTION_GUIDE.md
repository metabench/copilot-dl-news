# Command Execution Guide for AI Agents

**When to Read**: Before running ANY PowerShell commands or terminal operations

**Purpose**: Prevent approval dialogs, use tools correctly, avoid command pitfalls

---

## Critical Rules

### ❌ NEVER Use Commands That Require Approval

**THE GOLDEN RULE**: If a PowerShell command might require user approval, DON'T USE IT. Use a tool instead.

### Tools vs Commands Decision Tree

```
Need to edit a file?
  ✅ Use: replace_string_in_file tool (95% of cases)
  ❌ Don't: Get-Content | Set-Content pipelines

Need to read a file?
  ✅ Use: read_file tool
  ❌ Don't: Get-Content with complex logic

Need to search files?
  ✅ Use: grep_search tool
  ❌ Don't: Select-String with regex

Need to find files?
  ✅ Use: file_search tool
  ❌ Don't: Get-ChildItem with ForEach-Object
```

---

## Commands That ALWAYS Require Approval (NEVER USE)

```powershell
# ❌ Complex regex replace with piping
(Get-Content "file.js") -replace 'pattern', 'replacement' | Set-Content "file.js"

# ❌ Multi-line commands with backticks
Get-Content "file.js" `
  -replace 'pattern1', 'replacement1' | Set-Content "file.js"

# ❌ Commands with complex escaping
(Get-Content "file.js") -replace 'const config = JSON\.parse\(.*\);', 'new code' | Set-Content "file.js"

# ❌ Chained commands with semicolons (complex operations)
command1; Start-Sleep -Seconds N; command2 | ConvertFrom-Json

# ❌ Multi-command pipelines
Start-Job -ScriptBlock { ... } | Out-Null; Start-Sleep -Seconds 3; curl http://...

# ❌ ForEach-Object with complex logic
Get-ChildItem | ForEach-Object { ... complex logic ... }

# ❌ Complex string manipulation
Get-Content "file.js" | Select-String -Pattern "complex.*regex" | ForEach-Object { ... }

# ❌ Output parsing or chaining (triggers approval)
npm test 2>&1 | Select-String -Pattern "..."
Get-Content file.js | Select-String "..." # Use grep_search tool instead
```

---

## Simple Commands That Are OK

```powershell
# ✅ Single file checks
Test-Path "file.js"
Get-Content "file.log"
Get-Content "file.log" | Select-Object -Last 20
Get-ChildItem "directory"

# ✅ Simple process operations
node server.js --detached --auto-shutdown-seconds 10
npm test
npm run build
node tools/some-script.js

# ✅ Simple output formatting (no complex logic)
command 2>&1 | Select-String "simple-pattern"
command | Select-Object -First 10
```

---

## Background Processes - CRITICAL

### Rule: NEVER Run Commands in Terminals with Background Processes

When you start a background server with `--detached` or `isBackground: true`, that terminal becomes **dedicated to that background process**. Running ANY subsequent command in that same terminal can:

- Interrupt or terminate the background process
- Kill the detached server
- Cause the background process to lose its output stream

```powershell
# ❌ WRONG: Running commands in a terminal with a background server
Terminal ID: abc123
> node server.js --detached --auto-shutdown-seconds 30  # Server starts
> curl http://localhost:3000/api/test  # ← KILLS THE SERVER!

# ✅ RIGHT: Check background process output, don't run new commands
Terminal ID: abc123
> node server.js --detached --auto-shutdown-seconds 30
# Use get_terminal_output tool to check server logs
# DON'T run any more commands in this terminal!

# ✅ RIGHT: Use a different approach
# Run the E2E test suite instead (it manages server lifecycle)
# Or read existing server logs from log files
```

**Best practice**: 
- ❌ **NEVER run additional commands in a terminal that has a background process**
- ✅ Use `get_terminal_output` tool to check background process logs (read-only)
- ✅ Run E2E tests instead of starting servers manually
- ✅ Read existing log files from disk
- ✅ Add debugging code to source files (console.error writes to process stderr)

---

## PowerShell curl Is NOT Unix curl

PowerShell has a `curl` alias that points to `Invoke-WebRequest` with **completely different syntax**:

```powershell
# ❌ WRONG: Unix curl syntax (will fail in PowerShell)
curl -X POST http://localhost:3000/api/crawl -H "Content-Type: application/json" -d '{"key":"value"}'
# Error: "Cannot bind parameter 'Headers'" 

# ✅ RIGHT: Use Invoke-WebRequest with PowerShell syntax
Invoke-WebRequest -Uri "http://localhost:3000/api/crawl" -Method POST -ContentType "application/json" -Body '{"key":"value"}' -UseBasicParsing

# ✅ EVEN BETTER: Don't test APIs manually - use E2E tests or read logs
```

---

## Use Tools Instead of Commands

### Primary Tool: replace_string_in_file

**Use for 95% of file editing operations:**

```javascript
// Instead of PowerShell replace commands
replace_string_in_file({
  filePath: "c:\\path\\to\\file.js",
  oldString: "exact text to replace\nincluding newlines",
  newString: "replacement text\nalso with newlines"
})

// For multiple replacements in same file
replace_string_in_file({ filePath, oldString: "pattern1", newString: "replacement1" })
replace_string_in_file({ filePath, oldString: "pattern2", newString: "replacement2" })
```

### Why Tools Don't Require Approval

- Uses VS Code's internal file editing API
- No shell command execution
- No regex parsing complexity
- Validation built into the tool

### Why PowerShell Commands DO Require Approval

- Shell command execution with potential side effects
- Complex regex patterns with escaping
- Piping through Get-Content/Set-Content
- String interpolation and special characters

---

## Configuration-Based Test Execution

**CRITICAL**: Use configuration-based test runner to avoid PowerShell confirmation dialogs.

```bash
# ✅ CORRECT: Configuration-based (no confirmation)
node tests/run-tests.js e2e
node tests/run-tests.js unit

# ❌ WRONG: Environment variables (requires confirmation)
cross-env E2E=1 npm test
GEOGRAPHY_E2E=1 npm test
```

**See**: `tests/README.md` for complete test runner documentation.

---

## When Tempted to Use Complex PowerShell

**STOP and follow this checklist:**

1. ✅ Can I use `replace_string_in_file` tool? (95% of cases - PRIMARY)
2. ✅ Can I use `read_file` tool? (not Get-Content with logic)
3. ✅ Can I use `grep_search` tool? (not Select-String with regex)
4. ✅ Can I use `file_search` tool? (not Get-ChildItem with ForEach)
5. ✅ If pattern appears multiple times, call tool sequentially
6. ✅ If unsure about pattern match, `read_file` first to verify
7. ❌ **NEVER** use Get-Content piped to Set-Content for code changes
8. ❌ **NEVER** use complex regex in PowerShell commands
9. ❌ **NEVER** chain multiple commands with semicolons
10. ❌ **NEVER** use ForEach-Object with complex logic

**Key Principle**: If you're about to write a PowerShell command longer than ONE line or with ANY piping beyond simple filtering, STOP and use a tool instead.

---

## VS Code Approval Mechanism (Research Notes - October 2025)

- **Auto-Approve Setting**: `terminal.integrated.enableAutoApprove` (default: `true`)
- **Simple commands DON'T need approval**: `node script.js arg1 arg2`
- **Commands that REQUIRE approval**: Piping, chaining, output parsing, complex shell operations
- **Our tools are simple Node commands**: Should NOT trigger approval
- **If approval appears**: User may have disabled auto-approve, or VS Code is processing output
- **Source**: VS Code `runInTerminalTool.ts`, `terminalConfiguration.ts`

---

## Related Documentation

- **Test execution**: `tests/README.md` - Configuration-based test runner
- **Testing guidelines**: `docs/TESTING_QUICK_REFERENCE.md` - Test workflow patterns
- **Database tools**: `tools/debug/README.md` - DB inspection without approval
- **General workflow**: See AGENTS.md "Core Workflow Rules" for autonomous operation patterns
