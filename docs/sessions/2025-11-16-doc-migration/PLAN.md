# Plan: doc-migration
Objective: Relocate misplaced root-level documentation files (including `AGENT_TOOLING_ENHANCEMENTS_PROPOSAL.md`) into `docs/` while keeping references and guidance consistent with AGENTS.md.

Done when:
- Session folder links into `docs/sessions/SESSIONS_HUB.md` with this plan recorded.
- All documentation-only files currently in repository root are evaluated; any that lack a strong reason to live at root are moved under `docs/`.
- Key references (e.g., `AGENTS.md`, `docs/INDEX.md`, or other callers) reflect new locations.
- Session summary captures moves + remaining follow-ups.

Change set:
- docs/sessions/2025-11-16-doc-migration/*
- docs/INDEX.md (if needed)
- AGENTS.md (if references change)
- docs/<new locations for moved files>

Risks/assumptions:
- Some historic files might be referenced by tooling/scripts; must confirm before moving.
- Need to avoid overwriting concurrent edits.

Tests: Not applicable (doc/file-structure task) but will verify via `git status` mindset once complete.

Docs to update:
- `docs/sessions/SESSIONS_HUB.md`
- Any index referencing relocated files.
