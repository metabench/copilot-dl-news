@echo off
:: Agent Rename Tool - Windows Batch Wrapper
:: 
:: CRITICAL: This wrapper exists to safely handle emoji filenames.
:: PowerShell's native Rename-Item/Move-Item CORRUPT Unicode:
::   🧠 → ð§   (mojibake)
::
:: This wrapper invokes Node.js which uses the proper Windows API.
::
:: Usage:
::   agent-rename --list
::   agent-rename --search "Brain"
::   agent-rename --from "Old Name" --to "🧠 New Name 🧠" --dry-run
::   agent-rename --from "Old Name" --to "🧠 New Name 🧠"

chcp 65001 >nul 2>&1
node "%~dp0agent-rename.js" %*
