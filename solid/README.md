# `solid/` — Production-Ready Subsystems

This directory is a **promotion target** for code, docs, or assets that have been:
- Battle-tested in production (or its closest equivalent — driving real crawls against `data/news.db`)
- Documented (JSDoc on public API, an entry in `docs/INDEX.md` if user-facing)
- Covered by tests under `tests/` (or co-located `checks/`)
- Reviewed and approved as the canonical implementation in their domain

## What lives here today

Nothing yet. This directory was created on 2026-04-24 during the repo slim-down to give us a clear destination for "promoted" work-in-progress items from `wip/`.

## Promotion checklist (wip → solid)

Before moving anything here, confirm:

- [ ] All consumers updated — `node tools/dev/js-scan.js --what-imports <path> --json` returns only intended call sites.
- [ ] Tests added/passing under `tests/` (`npm run test:by-path <path>`).
- [ ] At least one entry in `docs/INDEX.md` or a path-local `AGENT.md` describes how to use it.
- [ ] No TODO / FIXME / "draft" comments in the public surface.
- [ ] An ADR-lite under `docs/decisions/` documents the promotion if the design is non-obvious.

## Why the split?

- **`src/`** is the active codebase. Everything in `src/` is assumed live.
- **`wip/`** is the experimentation zone. Things here may break, change shape, or be deleted.
- **`solid/`** is a curated zone for cross-cutting reference implementations (e.g., a shared SDK, golden recipes, design language) that we want clearly separated from `src/` because they are **stable artifacts**, not active code.

If something is "stable" but lives inside an active subsystem, it stays in `src/`. `solid/` is for stand-alone promotable packages.

See `wip/README.md` for the inverse convention.
