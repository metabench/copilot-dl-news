# Command Execution Guide for AI Agents

**When to Read**: Before running ANY PowerShell commands or terminal operations

**Purpose**: Prevent approval dialogs, use tools correctly, avoid command pitfalls

---

## 🖥️ OS AWARENESS - CRITICAL FIRST STEP

**ALWAYS REMEMBER**: This repository runs on **Windows** with **PowerShell** as the default shell.

### Current Environment
- **OS**: Windows (PowerShell v5.1)
- **Shell**: `powershell.exe`
- **Path Separator**: `\` (backslash)
- **Line Endings**: CRLF (`\r\n`)
- **File Paths**: Use absolute paths with `c:\` prefix

### OS-Specific Command Rules
- ✅ **Prefer Node.js commands**: Use `node <script>` directly for cross-platform compatibility
- ✅ **Use PowerShell syntax when needed**: `Get-Content`, `Set-Content`, `Select-String`
- ❌ **Don't use Unix commands**: No `cat`, `grep`, `sed`, `awk` (they may not exist or behave differently)
- ✅ **Simple commands only**: Avoid complex pipes that may cause encoding issues
- ⚠️ **UTF-8 encoding for Unicode output**: Set `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` before running tools that output Unicode characters
- ✅ **Windows paths**: Use `c:\path\to\file.js` format
- ✅ **Test commands first**: Verify they work in PowerShell before using

### Cross-Platform Code Considerations
When writing Node.js code that might run elsewhere:
- Use `path.join()` for path construction (works on all OSes)
- Use `os.platform()` to detect OS if needed
- Prefer Node.js APIs over shell commands

---

## Critical Rules

### ❌ NEVER Use Commands That Require Approval

**THE GOLDEN RULE**: If a PowerShell command might require user approval, DON'T USE IT. Use a tool instead.

### Tools vs Commands Decision Tree

```
Need to edit a file?
  ✅ Use: apply_patch tool (95% of cases)
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

# ✅ Simple directory listings
Get-ChildItem "directory"

# ✅ Simple PowerShell cmdlet usage (when properly configured)
# Set UTF-8 encoding first for Unicode output:
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Get-Content "file.log" | Select-Object -Last 20
command | Select-Object -First 10

# ✅ Simple process operations (cross-platform Node.js preferred)
node server.js --detached --auto-shutdown-seconds 10
npm test
npm run build
node tools/some-script.js

# ✅ Simple text filtering with proper encoding
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
command 2>&1 | Select-String "simple-pattern"

# ⚠️ IMPORTANT: Avoid piping Node.js Unicode output through PowerShell
# BAD:  node tools/dev/js-edit.js --help | Select-Object -First 20  # May corrupt Unicode
# GOOD: node tools/dev/js-edit.js --help  # Let Node.js handle its own output
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

## 🚨 Server Verification - CRITICAL FOR AGENTS 🚨

### The Problem

Servers are **long-running processes**. Running `node server.js` blocks the terminal forever until manually stopped. This causes agents to **hang indefinitely** waiting for the command to complete.

### The Solution: `--check` Flag

All servers in this codebase should support `--check`:

```bash
# ✅ CORRECT: Verify server starts, then exit immediately
node src/ui/server/goalsExplorer/server.js --check  # Exits in ~500ms
node src/ui/server/dataExplorerServer.js --check

# ❌ WRONG: Starts server and hangs forever
node src/ui/server/goalsExplorer/server.js  # Never returns!
```

**What `--check` does:**
1. Starts the server normally
2. Verifies the server responds on its port (HTTP request to `/`)
3. Shuts down the server immediately
4. Exits with code 0 (success) or 1 (failure)

### Implementation

Use the server startup check utility:

```javascript
// src/ui/server/utils/serverStartupCheck.js
const { wrapServerForCheck } = require("./utils/serverStartupCheck");

// In your server's CLI section:
if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  
  if (args.check) {
    process.env.SERVER_NAME = "My Server";
  }
  
  // wrapServerForCheck handles --check mode automatically
  const server = wrapServerForCheck(app, port, host, () => {
    if (!args.check) {
      console.log("Server started on port " + port);
    }
  });
}
```

### Agent Workflow for Server Work

1. **Verify server starts**: Run with `--check` flag (finishes quickly)
2. **Run tests**: Use E2E tests that manage their own server lifecycle
3. **Check script**: Run the check script (e.g., `node checks/server.check.js`)
4. **Never start servers directly** unless using `--detached` or `isBackground: true`

```bash
# Agent workflow example:
node src/ui/server/myServer.js --check           # Step 1: Verify startup
node src/ui/server/checks/myServer.check.js     # Step 2: Verify rendering
npm run test:by-path tests/server/myServer.e2e.test.js  # Step 3: Full E2E
```

### When You MUST Run a Long-Running Server

Prefer the server's own lifecycle flags when available:

- `--detached` starts the server in the background (survives running other commands)
- `--status` reports whether the detached server is running
- `--stop` shuts down the detached server
- `--auto-shutdown-seconds <n>` runs temporarily then exits (useful for smoke checks)

Examples:

```bash
node server.js --detached --auto-shutdown-seconds 10
node server.js --status
node server.js --stop
```

If a server does **not** implement these flags, fall back to starting it as a background process (see below).

Use `isBackground: true` in run_in_terminal:

```javascript
// This returns immediately, server runs in background
run_in_terminal({
  command: "node src/ui/server/myServer.js",
  isBackground: true,
  explanation: "Start server in background for E2E testing"
});

// Later, check output with get_terminal_output
// Prefer a server's own --stop flag when available.
// Otherwise stop with: Stop-Process -Name node -Force

### Restart After Code Changes

Servers do not automatically reload server-side changes.

- If the server supports detached mode: `--stop` then start again with `--detached`.
- If you started it as a background process: stop it (server flag or `Stop-Process`) then start it again.

Example (detached mode):

```bash
node src/ui/server/dataExplorerServer.js --stop
node src/ui/server/dataExplorerServer.js --detached --port 4600
```
```

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

### Primary Tool: apply_patch

**Use for 95% of file editing operations:**

```javascript
// Instead of PowerShell replace commands
apply_patch({
  input: `*** Begin Patch
*** Update File: c:\\path\\to\\file.js
@@
-old line
+new line
*** End Patch`
});
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

1. ✅ Can I use `apply_patch` tool? (95% of cases - PRIMARY)
2. ✅ Can I use `read_file` tool? (not Get-Content with logic)
3. ✅ Can I use `grep_search` tool? (not Select-String with regex)
4. ✅ Can I use `file_search` tool? (not Get-ChildItem with ForEach)
5. ✅ If pattern appears multiple times, call tool sequentially
6. ✅ If unsure about pattern match, `read_file` first to verify
7. ❌ **NEVER** use Get-Content piped to Set-Content for code changes
8. ❌ **NEVER** use complex regex in PowerShell commands
9. ❌ **NEVER** chain multiple commands with semicolons
10. ❌ **NEVER** use ForEach-Object with complex logic

**Note**: In this repo's agent tooling, file edits are performed via `apply_patch`.

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
