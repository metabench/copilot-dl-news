# Working Notes – Session Bootstrap CLI & Micro Task Policy

- 09:40 — Session initialized to cover CLI + policy work. Need automation plus doc updates.
- 09:50 — Drafted CLI spec: `node tools/dev/session-init.js --slug <slug> [--title "..."] [--objective "..."] [--reuse] [--force]`.
	- Generates directory `docs/sessions/<date>-<slug>/` with `INDEX.md`, `PLAN.md`, `WORKING_NOTES.md`, `SESSION_SUMMARY.md`, `DECISIONS.md`, `FOLLOW_UPS.md`.
	- Uses template partials from `tools/dev/session-templates/*.md`; placeholders replaced with CLI args + timestamps.
	- Updates `docs/sessions/SESSIONS_HUB.md` by inserting/refreshing entry; refuses to overwrite existing entries unless `--reuse`.
	- Supports `--open` hook later (out of scope) but prints next steps instructions for now.
