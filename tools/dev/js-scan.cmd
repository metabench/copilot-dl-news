@echo off
REM js-scan.cmd - Run js-scan with UTF-8 encoding
REM Usage: js-scan --dir src --search utilities

chcp 65001 >nul 2>&1
node "%~dp0js-scan.js" %*
