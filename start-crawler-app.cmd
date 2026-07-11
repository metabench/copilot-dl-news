@echo off
title Crawler Desktop App (Electron)
cd /d "%~dp0"
REM Electron main spawns its own UI server; DB defaults to data\news.db
REM (see src\ui\electron\unifiedApp\main.js). Override: set DB_PATH=...
REM Opens directly on the live crawl view; --allow-multi-jobs enables the
REM batch launcher (multiple concurrent crawl jobs).
call node_modules\.bin\electron.cmd src\ui\electron\unifiedApp\main.js --port 3170 --app crawl-status --allow-multi-jobs
pause
