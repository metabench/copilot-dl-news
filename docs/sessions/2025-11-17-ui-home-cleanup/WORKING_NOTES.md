# Working Notes — 2025-11-17 ui-home-cleanup

## Discovery
- Re-read PLAN.md and noticed `renderDashboardView` already sets `layoutMode: "dashboard"` and `hideListingPanel: true`, implying the renderer should be able to hide the table.
- Found a duplicated legacy `renderHtml` definition near the bottom of `src/ui/render-url-table.js` that always rendered the meta/table shell. Because it appeared after the newer implementation, it won the hoist and forced the home page to keep the table chrome.

## Changes
- Removed the stale `renderHtml` re-definition so the dashboard-aware version remains active.
- Added `tmp/render-home-check.js` to render a static home snapshot for future verifications without spinning up the server (uses `renderDashboardView` + `renderHtml`).

## Verification
- Started the UI server inside a PowerShell job, fetched `/` and `/urls`, then shut it down:
  ```pwsh
  $job = Start-Job -ScriptBlock { Set-Location C:\Users\james\Documents\repos\copilot-dl-news; node src/ui/server/dataExplorerServer.js };
  Start-Sleep -Seconds 3;
  Invoke-WebRequest -Uri http://127.0.0.1:4600/ -OutFile tmp\home.html;
  Invoke-WebRequest -Uri http://127.0.0.1:4600/urls -OutFile tmp\urls.html;
  Stop-Job $job; Receive-Job $job
  ```
- Confirmed `tmp/home.html` contains no `.panel` / `table-wrapper` markup, while `tmp/urls.html` still renders the full table.

## Follow-ups
- None required right now; consider deleting `tmp/render-home-check.js` once a more permanent check script exists under `src/ui/server/checks/`.
