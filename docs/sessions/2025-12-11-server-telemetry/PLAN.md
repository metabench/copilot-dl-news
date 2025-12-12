# Plan – Standard server telemetry + z-server ingestion

## Objective
Add shared structured telemetry (logs + status/health) so z-server can reliably observe and display server activity.

## Done When
- [ ] Telemetry standard is documented as a guide (“small book”).
- [ ] z-server ingestion strategy is documented (JSON logs + HTTP polling for non-child processes).
- [ ] A minimal adoption checklist exists for server entrypoints.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `docs/guides/SERVER_TELEMETRY_STANDARD.md` (new)
- `docs/INDEX.md` (add guide link)
- Session docs (this folder)

## Risks & Mitigations
- Risk: z-server can only capture stdout/stderr for processes it spawns.
	- Mitigation: standardize an HTTP `/api/status` endpoint so z-server can poll *any* running server, plus optionally standardize file-based JSONL logs.
- Risk: “structured logs” become too heavyweight across many small servers.
	- Mitigation: define a minimal v1 schema (lifecycle + http + error) and keep everything optional/extendable.
- Risk: Windows quirks (ports, process detection, encoding).
	- Mitigation: keep output JSON-lines UTF-8; keep schema stable; prefer short fields and bounded payloads.

## Tests / Validation
- Evidence: guide references current z-server capture mechanics and recommends concrete integration points.
- Optional: future implementation can be validated by (a) z-server showing parsed JSON events, (b) `curl http://localhost:<port>/api/status` returning a consistent payload.
