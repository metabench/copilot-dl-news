# Session Summary · 2025-11-14 Crawl Download Investigation

## Highlights
- Verified the Guardian crawl exited via `queue-exhausted` after 28.7s with 51 downloads / 127 visits / 51 saves despite a 2,000 download ceiling.
- Confirmed `features.totalPrioritisation` is enabled in `config/priority-config.json`, so QueueManager only accepts country/country-related URLs and drops everything else.
- Linked the hard 51-download plateau to the country-hub planner cap (~150 hubs) described in the 2025-11-16 intelligent-crawl diagnostics.

## Outcomes
- Root cause identified: total prioritisation plus the static `countryHubTargetCount` leaves only a small pool of eligible URLs; once those are fetched, the queue empties and the run ends regardless of the max-download budget.
- Evidence captured in WORKING_NOTES referencing `config.json`, `QueueManager` drop logic, and prior telemetry from the Guardian verification session.

## Next Steps
- Decide whether Guardian runs should disable total prioritisation (flip the flag in `config/priority-config.json` or supply a temporary override) when broader article harvesting is needed.
- Consider raising or making dynamic the `countryHubTargetCount` so the planner continues producing work once known hubs are exhausted.
- Track the `total-prioritisation-filter` drop rate in telemetry to know when the queue is being trimmed aggressively.
