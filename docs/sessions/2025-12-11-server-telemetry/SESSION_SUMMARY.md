# Session Summary – Standard server telemetry + z-server ingestion

## Outcome

- Defined a minimal v1 server telemetry standard for this repo: JSONL events + `/api/health` + `/api/status`.
- Documented z-server constraints (can only capture stdout/stderr for processes it spawns) and the recommended mitigation (status polling and/or file tailing).

## Key Artifacts

- Telemetry guide: `docs/guides/SERVER_TELEMETRY_STANDARD.md`
- Index link added: `docs/INDEX.md`

## Notes

- This session is a research + documentation pass. Implementation work (shared helper + server roll-out + z-server UI parsing) is intentionally left as follow-up so scope stays controlled.

## Accomplishments
- _Fill in key deliverables and outcomes._

## Metrics / Evidence
- _Link to tests, benchmarks, or telemetry supporting the results._

## Decisions
- _Reference entries inside `DECISIONS.md`._

## Next Steps
- _Summarize remaining work or follow-ups._
