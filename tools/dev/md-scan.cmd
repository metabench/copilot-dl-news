@echo off
REM md-scan.cmd - Run md-scan with proper UTF-8 encoding
REM Usage: md-scan --dir docs --search "testing" "async"

chcp 65001 >nul 2>&1
node "%~dp0md-scan.js" %*
