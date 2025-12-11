# Session Summary – AGENTS: Research Gap Protocol

## Accomplishments
- Updated AGENTS.md with:
	- “Unexpected issues → research gap protocol” (search docs/sessions, minimal repro, then research session if needed)
	- Accuracy-first default (correctness over speed unless explicitly asked)
	- Evidence contract (hypothesis + proof + falsification)
	- Validation ladder (checks → targeted tests → broader suites)
	- Stop/document triggers + basic quality metrics

## Metrics / Evidence
- Documentation-only change (no runtime behavior change).

## Decisions
- No architectural decisions; added an accuracy-first workflow guardrail.

## Next Steps
- If this pattern proves useful, consider adding a small doc index pointer (e.g., in docs/INDEX.md) to "how to run md-scan for prior art".
