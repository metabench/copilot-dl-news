# PowerShell Unicode Encoding Fix

## Problem

Windows PowerShell defaults to a legacy encoding (Windows-1252 or similar) that mangles Unicode characters. When Node.js CLI tools output box-drawing characters (─, │, ┌, ┐, └, ┘), emojis, or international text, PowerShell displays them as garbled text like `Ôöî`, `ÔòÉ`, `Ôû¬`.

## Root Cause

PowerShell's console code page defaults to the system's ANSI code page (usually 437 or 1252 on Windows), not UTF-8 (code page 65001). When Node.js outputs UTF-8 text, PowerShell interprets it with the wrong code page.

## ✅ **DEFINITIVE SOLUTION: Use `chcp 65001`**

### For Current Session (Quick Fix)

Run this once at the start of your PowerShell session:

```powershell
chcp 65001
```

Then all subsequent commands will display Unicode correctly:

```powershell
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --outline
node tools/dev/js-edit.js src/crawl.js --list-functions
```

### Permanent Fix (Recommended)

Add to your PowerShell profile:

```powershell
# Edit profile
notepad $PROFILE

# Add this line at the top:
chcp 65001 > $null

# Save and restart PowerShell
```

### Per-Command Fix

Use the provided .cmd wrappers that set encoding automatically:

```cmd
tools\dev\md-edit.cmd docs/CHANGE_PLAN.md --outline
tools\dev\js-edit.cmd src/crawl.js --list-functions
```

## Testing the Fix

After running `chcp 65001`, test with:

```powershell
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --stats
```

You should see proper box-drawing characters:
```
┌ Statistics: docs/CHANGE_PLAN.md ═════════════════════════════════════
Total lines:      1099
  Prose lines:    817
```

If you still see `Ôöî`, `ÔòÉ`, the code page wasn't set correctly.

## ⚠️ Important: Piping to PowerShell Cmdlets

**PowerShell pipelines reinterpret output with the current encoding.** Even with `chcp 65001`, piping to `Select-Object`, `Where-Object`, etc. may still mangle Unicode because PowerShell converts the byte stream internally.

### Problem:
```powershell
chcp 65001
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --outline | Select-Object -First 10
# Still shows garbled: Ôöî ÔòÉ
```

### Solutions:
1. **Don't pipe to PowerShell cmdlets** - Let Node output directly to console
2. **Use Out-String wrapper**:
   ```powershell
   chcp 65001
   node tools/dev/md-edit.js docs/CHANGE_PLAN.md --outline | Out-String | Select-Object -First 10
   ```
3. **Redirect to file instead**:
   ```powershell
   node tools/dev/md-edit.js docs/CHANGE_PLAN.md --outline > output.txt
   cat output.txt | Select-Object -First 10
   ```

## Why Other Solutions Don't Work

| Approach | Why It Fails |
|----------|-------------|
| Setting `$OutputEncoding` | Only affects PowerShell's own output, not how it reads from child processes |
| Node.js encoding setup | Node outputs UTF-8 correctly, but PowerShell interprets with wrong code page |
| npm scripts with encoding | npm creates nested shells that reset encoding |
| `.ps1` wrapper scripts | PowerShell scripts run in subshells with default encoding |

## Alternative: Use cmd.exe

cmd.exe (Command Prompt) respects `chcp 65001` more reliably:

```cmd
chcp 65001
node tools\dev\md-edit.js docs\CHANGE_PLAN.md --outline
```

## Alternative: Use Windows Terminal

Windows Terminal (default on Windows 11) handles UTF-8 better than the legacy PowerShell console. It automatically uses UTF-8 for most operations.

## Quick Reference

| Method | Reliability | When to Use |
|--------|-------------|-------------|
| `chcp 65001` at session start | ⭐⭐⭐⭐⭐ | Best for all scenarios |
| Add to `$PROFILE` | ⭐⭐⭐⭐⭐ | Permanent fix |
| Use .cmd wrappers | ⭐⭐⭐⭐ | Per-command convenience |
| Out-String wrapper | ⭐⭐⭐ | When piping is necessary |
| Windows Terminal | ⭐⭐⭐⭐⭐ | Upgrade your terminal |

## Technical Details

- **Code Page 65001**: Windows' UTF-8 code page identifier
- **chcp command**: Changes the active console code page
- **File**: `tools/dev/shared/powershellEncoding.js` - Node.js-side helpers (limited effectiveness)
- **Wrappers**: `tools/dev/md-edit.cmd`, `tools/dev/js-edit.cmd` - Set code page before running Node

## Related Files

- `tools/dev/shared/powershellEncoding.js` - Node.js encoding utilities
- `tools/dev/run-with-utf8.ps1` - PowerShell wrapper (less reliable than chcp)
- `tools/dev/md-edit.cmd` - Batch wrapper with chcp 65001
- `tools/dev/js-edit.cmd` - Batch wrapper with chcp 65001
- `tools/dev/md-edit.js` - Markdown editing CLI
- `tools/dev/js-edit.js` - JavaScript editing CLI

## Summary

**The permanent solution is to run `chcp 65001` once per session or add it to your PowerShell profile.**

```powershell
# Run once per session
chcp 65001

# Or add to profile for permanent fix
echo "chcp 65001 > `$null" | Out-File -Append $PROFILE
```

After that, all Unicode output from Node.js tools will display correctly.
