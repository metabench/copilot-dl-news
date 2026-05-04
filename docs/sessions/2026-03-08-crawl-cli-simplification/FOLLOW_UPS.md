# Follow Ups – Crawl CLI Simplification

- Add one or two more high-frequency JSON profiles only after operators demonstrate repeated use patterns worth standardising.
- Consider a future `describe <profile>` view if operators need per-profile resolved arguments or profile-file provenance beyond the current `list --json` inventory.
- Revisit tool/profile name collision handling only if a new profile needs the same top-level name as an existing tool.
- Reserve launcher keywords (`list`, `help`, `profile`, `run`) unless there is a deliberate need to add explicit escaping for those profile names later.
