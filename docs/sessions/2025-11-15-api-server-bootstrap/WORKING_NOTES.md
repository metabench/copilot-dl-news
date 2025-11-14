# Working Notes

## 2025-11-15
- Created session folder and logged objective.
- Reviewing legacy bootstrap code in `src/deprecated-ui/express/server.js` to extract required wiring steps.
- Noted dependencies: `JobRegistry`, `RealtimeBroadcaster`, `BackgroundTaskManager`, task registrations, database handles.
- Implemented helper bootstrap functions inside `src/api/server.js` to instantiate job registry, realtime broadcaster, and background task manager with default task registrations.
- Ran a start/stop smoke test via `node -e "startApiServer(...)"` to confirm bootstrap executes without runtime errors.
