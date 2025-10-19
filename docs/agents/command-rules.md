---
title: Command Execution Rules for AI Agents
intent: Prevent VS Code approval dialogs by using safe command patterns and tools
audience: agents
owner: AI Agent Team
last_review: 2025-10-19
tags: [commands, tools, powershell, approval]
supersedes: []
related: [command-execution-guide]
---

## Summary

This document outlines critical rules for executing commands in VS Code terminals to avoid user approval dialogs. AI agents must use safe patterns and tools instead of complex PowerShell commands that trigger security prompts.

## When to use

- When you need to run terminal commands
- When editing files or searching code
- When executing scripts or build processes
- When you encounter approval dialog blocks

## Procedure

### NEVER USE These PowerShell Patterns

- `Get-Content | Set-Content` pipelines
- Complex regex with `-replace`
- Chained commands with semicolons (`;`)
- Piping to `Select-String`, `ForEach-Object`
- Multi-line commands with backticks (`` ` ``)

### USE TOOLS Instead (PRIMARY APPROACH)

- ✅ `replace_string_in_file` - for editing files (95% of cases)
- ✅ `read_file` - for reading file contents
- ✅ `grep_search` - for searching in files
- ✅ `file_search` - for finding files

### Safe Commands (OK to run)

- `Test-Path "file.js"`
- `Get-ChildItem`
- `node script.js arg1 arg2`
- `npm run test:file "pattern"`

### Critical Rules

1. ❌ Never run commands in terminals with background processes (kills the server)
2. ❌ PowerShell `curl` is NOT Unix curl (use E2E tests instead)
3. ✅ Use `get_terminal_output` tool to check background process logs (read-only)

### Decision Rule

If command is >1 line OR uses piping/chaining → Use a tool instead.

## Gotchas

- **Background processes get killed** when running ANY command in the same terminal
- **PowerShell curl syntax differs** from Unix curl - use E2E tests for HTTP testing
- **Complex regex triggers approval** - use `replace_string_in_file` for file edits
- **Multi-line commands require approval** - use tools instead
- **Piping always requires approval** - use tools instead

## Examples

### ✅ RIGHT: Use replace_string_in_file
```javascript
replace_string_in_file({
  filePath: "file.js",
  oldString: "old code",
  newString: "new code"
})
```

### ❌ WRONG: Complex PowerShell
```powershell
(Get-Content "file.js") -replace 'pattern', 'replacement' | Set-Content "file.js"
```

## Related Documentation

- `docs/COMMAND_EXECUTION_GUIDE.md` - Complete guide with examples and decision trees