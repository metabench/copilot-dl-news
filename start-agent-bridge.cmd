@echo off
REM DEPRECATED: agent-bridge was merged into tools\dev-bridge (v4).
REM This launcher now starts the canonical dev-bridge supervisor.
cd /d "%~dp0tools\dev-bridge"
call start-dev-bridge.cmd %*
