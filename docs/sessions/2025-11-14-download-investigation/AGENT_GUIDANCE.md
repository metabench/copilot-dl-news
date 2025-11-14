# Agent Guidance

- Always capture the run context (CLI command, environment variables, config manifest) before drawing conclusions.
- Use crawl telemetry (PAGE, QUEUE, PROGRESS lines) to reason about downloader throughput and exit reasons.
- If adjustments are needed, edit crawl configs rather than hacking core logic unless a defect is confirmed.
- Document evidence in WORKING_NOTES so future agents can see how the diagnosis was made.
