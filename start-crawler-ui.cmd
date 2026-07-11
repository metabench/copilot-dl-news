@echo off
title Crawler Unified UI (news.db)
cd /d "%~dp0"
set UI_ALLOW_MULTI_JOBS=true
REM Uses the production 27GB DB by default. To use a sample DB instead:
REM   set DB_PATH=data\samples\dev-sample.db
if "%DB_PATH%"=="" set DB_PATH=data\news.db
echo Unified UI starting on http://localhost:3000  (DB: %DB_PATH%)
node src\ui\server\unifiedApp\server.js --port 3000
pause
