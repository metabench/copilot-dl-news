# Lab 039 — Large Artifacts Pruner (Observable → SSE → UI)

This lab demonstrates the wiring pattern:

- `fnl` observable (backend work + progress events)
- Server-Sent Events (`/events`) streaming JSON events
- Browser `EventSource` updating a small UI model

## Safety

- Default mode is **dry-run**.
- Apply mode is **disabled** unless you set `LAB_039_ALLOW_APPLY=1`.

## Run the check

```powershell
node src/ui/lab/experiments/039-large-artifacts-pruner-observable-ui/check.js
```

## Manual run

This lab server is started by the check script.
If you want to start it manually, create a small runner that calls `startServer()` in `server.js`.
