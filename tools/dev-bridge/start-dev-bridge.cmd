@echo off
title Dev Bridge (Cowork sandbox link)
cd /d "%~dp0"
set BRIDGE_SUPERVISED=1
echo Dev bridge supervisor: restarts the bridge whenever it exits
echo (remote restart-bridge action, crash, or code update). Ctrl+C to stop.
:loop
node dev-bridge.js
echo Bridge exited; restarting in 2s (Ctrl+C to stop)...
timeout /t 2 /nobreak >nul
goto loop
