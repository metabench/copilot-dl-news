# Working Notes – Past/Present/Future view for what-next

- 2025-12-06 — Session created via CLI. Add incremental notes here.
- 2025-12-06 — Implemented past/present/future timeline in `what-next` (slug stem matching for related sessions, next task/test extraction, follow-ups surfaced). Added timeline to JSON and human views; selection now falls back to historical sessions when requested.
- 2025-12-06 — Validation: `node tools/dev/what-next.js --json --session what-next-past-present-future` returns timeline with next task/test populated (no related past sessions yet); output remains parseable JSON.
