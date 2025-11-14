# Roadmap

## Now
- ✅ Parsed crawl telemetry and defaults; documented that the Guardian run used `basicArticleDiscovery` with the 2,000 download ceiling yet exited via `queue-exhausted` at 51 downloads.
- ✅ Verified total prioritisation is active and aggressively dropping non-country work, explaining the limited queue size.

## Next
- Decide whether to run Guardian crawls with total prioritisation disabled when broad article coverage is needed (temporary override vs. config flip).
- Prototype a higher/dynamic `countryHubTargetCount` so planners keep producing work beyond ~150 hubs.

## Later
- Consider scripted regression tests (or telemetry alarms) that fail if total-prioritisation drops exceed a threshold or if queue exhaustion occurs before a configurable download count.
