# Roadmap — Guardian Crawl Verification

## Current Tasks
1. **Run 100-download crawl** — Execute `node crawl.js --max-downloads 100` and capture telemetry/log output.
2. **Document telemetry** — Append key stats (visited, downloaded, saved, exit reason) to Working Notes + Session Summary.
3. **Report results** — Share findings with the requester, highlighting the final `Final stats` line.

## Next Steps (if issues found)
- Investigate queue exhaustion or early termination causes.
- Adjust overrides (start URL, concurrency) if required.
- File follow-up issues in FOLLOW_UPS.md.
