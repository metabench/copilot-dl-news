# Decisions: Five-Site Cloud Crawl UI

## Add A Compact Panel Instead Of Replacing Crawl Status

Context: the user asked for a responsive, concise, basic UI while explicitly saying not to delete existing layouts.

Options:
- Rewrite `/crawl-status` to be simpler.
- Add a separate compact jsgui3 control and mount it in the unified shell.
- Create a standalone app outside the unified shell.

Decision: add a separate `CloudCrawlPanelControl` and mount it at `/?app=cloud-crawl`.

Consequences: existing crawl layouts remain available; the compact route is screenshot-friendly; future agents can swap or promote the control without losing the old operational page.

## Use Local DB Evidence As The UI Source Of Truth

Context: remote status proves crawl completion, but the user needs UI evidence and durable local persistence.

Options:
- Show remote counters only.
- Query only global local download totals.
- Query target-domain local HTTP responses, scoped by date when needed.

Decision: back `/api/cloud-crawl/status` with local `data/news.db` via `getCloudCrawlStatusSnapshot()` and sync remote results before screenshot capture.

Consequences: the UI displays persisted local evidence; screenshot analysis can verify the same rows used by later analysis; remote status remains an operational input rather than the only proof.

## Default The Compact Panel To The Current Batch Window

Context: the first screenshot pass showed `134875 / 25`, an all-time count that was technically true but poor for concise operator judgement.

Options:
- Leave all-time as default.
- Hard-code `2026-05-04` in the API.
- Let the jsgui3 panel carry a default `since` date and query the existing API with explicit filters.

Decision: the panel now emits `data-cloud-crawl-since` using the current ISO date, and the activator reads panel-level data attributes to build the status URL.

Consequences: the compact panel shows the current day's batch as `25 / 25`; the API still supports all-time or custom windows via query parameters.

## Forward `--max-concurrent` Through The Remote CLI

Context: the remote server already supports runtime concurrency, but the local CLI did not forward a concurrency override.

Options:
- Manually call the remote HTTP endpoint.
- Change remote server defaults.
- Add CLI forwarding for `--max-concurrent`.

Decision: extend `tools/crawl/crawl-remote.js` to parse and forward `--max-concurrent` for `start`, `run`, and `bounded` flows.

Consequences: the five-site command remains the canonical CLI path and can drive cloud-side parallel downloads without a bespoke one-off script.