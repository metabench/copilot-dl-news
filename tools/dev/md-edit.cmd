@echo off
REM md-edit.cmd - Run md-edit with proper UTF-8 encoding
REM Usage: md-edit docs/CHANGE_PLAN.md --outline

chcp 65001 >nul 2>&1
node "%~dp0md-edit.js" %*
