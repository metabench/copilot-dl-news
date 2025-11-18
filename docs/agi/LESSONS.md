# Lessons & Patterns (Rolling)

## 2025-11-16
- **Document-First Success**: Creating `/docs/agi` before coding changes keeps AGI initiatives decoupled from production flows.
- **Tool Awareness**: Re-reading `AGENTS.md` plus GitHub Copilot instructions provided enough context; no need for deep code scans yet. Respect the "stop researching early" directive.
- **Journal Discipline**: Logging plan + open questions in `journal/2025-11-16.md` made the rest of the work straightforward and should remain standard practice.
- **Static Analysis Focus**: Reiterating `js-scan`/`js-edit` as Tier-1 tools prevents scope creep toward unsupported tooling (e.g., Python scripts).
- **Existing Agent Review**: Always scan canonical specs in `docs/agents/` (e.g., `agent_policy`, `docs_indexer_and_agents_refactorer`) before drafting new personas so proposals inherit current governance.
- **Meta-Tooling Insight**: Running js-scan against the tooling sources (`tools/dev/js-scan/**`) reveals dependency risk before modifying the scanners themselves—capture these findings in `docs/agi/tools/*` to keep institutional memory tight.
- **Guard Replay Discipline**: Documented `js-edit` guard plans plus storage locations (e.g., `docs/sessions/<date>`) so future agents can replay edits without recomputing selectors; skip this step only if re-locating is trivial.

## 2025-11-20
- **Token Payloads Need Context**: Continuation tokens are only useful when they carry the absolute file, selector, and guard hash—embed the `match` snapshot at creation time so replay steps never re-scan unless inputs are missing.
- **Handlers Before Features**: Implement practical action handlers (`analyze`, `trace`, `ripple`) before adding new token types; tests now exercise each path so regressions surface immediately.
- **Record Commands Inline**: Session notes now log both the discovery run and the replay/test commands; this keeps token strings + JSON outputs paired for future verification.
- **Warn on Drift**: Digest comparisons (`RESULTS_DIGEST_MISMATCH`) give downstream agents an immediate signal that cached selectors are stale, so refresh tokens before touching js-edit.

## 2025-11-21
- **Relationship results need parity**: `what-imports`/`export-usage` already return importer metadata, but without tokenization those lists cannot flow into downstream automation—treat each importer/usage row like a search match (file, specifier, digest) so continuation tooling applies uniformly.
- **js-edit should trust snapshots, not humans**: The `match` payload and `jsEditHint` already contain enough guard info for edits; lacking an ingestion flag just forces extra `--locate` runs. Building a token/snapshot entry point unlocks single-pass Sense→Act loops.
- **Digest everything**: When relationship payloads start emitting tokens, compute and store a composite digest (sorted importer list hash) so stale tokens trigger the same `RESULTS_DIGEST_MISMATCH` warning that protects search tokens today.
- **Cap tokens for ergonomics**: Limiting importer/usage actions to 10 per request balances usefulness with compact `_ai_native_cli` payloads; agents can always rerun with narrower filters if they need more snapshots.
- **Session breadcrumbs matter**: Pair every tooling push with a fresh journal entry + session folder and link it from `SESSIONS_HUB.md`; future agents depend on those breadcrumbs to resume the work without rediscovery.
- **Smoke it where it hurts**: Extending the AI-native smoke suite immediately after wiring snapshot ingestion caught a regression around hash mismatches; keep the suite as the canonical repro for Sense→Act handoffs instead of ad-hoc manual runs.
