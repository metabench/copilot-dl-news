# Process Status API

To enable a unified dashboard/tray monitor for various long-running background processes (crawlers, analysis, migrations), we define a standard file-based API for status reporting.

## Location

Status files are stored in `tmp/status/`.
Each process writes to its own JSON file: `tmp/status/<process-id>.json`.

## Schema

```json
{
  "id": "analysis-daemon",      // Unique ID for the process type
  "pid": 12345,                 // Process ID
  "name": "Analysis Daemon",    // Human-readable name
  "status": "running",          // running, paused, stopped, error, completed
  "startTime": "2025-01-05T10:00:00.000Z",
  "updatedAt": 1736071200000,   // Timestamp of last update
  "progress": {
    "current": 50,
    "total": 100,
    "percent": 0.5,             // 0.0 to 1.0
    "unit": "records"
  },
  "message": "Processing item 50/100",
  "metrics": {
    "speed": "10 rec/s",
    "eta": "5m"
  },
  "error": null                 // Error message if status is 'error'
}
```

## Lifecycle

1.  **Start**: Process creates/overwrites `tmp/status/<id>.json` with status `running`.
2.  **Update**: Process updates the file periodically (e.g., every 1s).
3.  **Stop**: Process updates status to `stopped` or `completed` before exiting.
4.  **Crash**: Monitor detects stale `updatedAt` (e.g., > 30s old) and marks as `unresponsive`.

## Monitor Behavior

The Tray Monitor (or other dashboards) watches `tmp/status/*.json`.
It aggregates all valid status files to show a list of active processes.
