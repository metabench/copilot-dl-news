# Decisions

| Date | Context | Decision | Consequences |
| --- | --- | --- | --- |
| 2025-11-19 | Guardian crawl exiting at 51 downloads even with cap=2,000. | Queue exhaustion is expected while `features.totalPrioritisation` stays enabled, because QueueManager drops all non-country URLs and the planner stops after ~150 country hubs. Leave the flag on when testing country coverage; disable or override it only when general article harvesting is required. | Explains current behavior and sets expectation that higher download counts demand either toggling the feature off or raising the planner's target counts. |
