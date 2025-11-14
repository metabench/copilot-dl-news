# Working Notes — Guardian Crawl Verification

## 2025-11-13
- Initialized session to capture telemetry for a `--max-downloads 100` crawl on The Guardian.
- Prior 10-download verification confirmed CLI summary prints `downloaded 51/2,000 pages • visited 127 pages • saved 51 articles` (limit reflected from shared overrides); expect similar format for 100-download run.
- Next step: run `node crawl.js --max-downloads 100` and log any anomalies (e.g., queue exhaustion vs cap, HTTP 404 clusters, hub reseeding hints).
- Ran `node crawl.js --max-downloads 100` at 23:26 UTC; crawl exited via `queue-exhausted` after 28.7s with **visited 127 / downloaded 51 / saved 51** despite the higher cap, mirroring the shared global max of 51 downloads.
- Error sampling showed repeated HTTP 404s on Guardian archive hubs (`/world/video`, `/world/live`, `/world/gallery`, `/world/ng-interactive` and their 2025/nov paths) but no hard failures on article fetches.
- Goals tracker keeps requesting top-level hub coverage; sitemap seeding keeps re-adding those hubs, so queue drained after available article seeds without breaching per-host limits.
