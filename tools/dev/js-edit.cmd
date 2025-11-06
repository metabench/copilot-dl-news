@echo off
REM js-edit.cmd - Run js-edit with proper UTF-8 encoding
REM Usage: js-edit src/crawl.js --list-functions

chcp 65001 >nul 2>&1
node "%~dp0js-edit.js" %*
