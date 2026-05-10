# Plan: Batch crawl CLI + crawler quality review + platform awareness

Date: 2026-05-08
Mode: Endurance Brain

## Objective

Three deliverables in one slice:

1. **Batch crawl CLI** — single-command launch of N crawls against the unified UI's `/api/v1/crawl/operations/:op/start`. Concurrency, retries, machine-readable output, named presets.
2. **API + implementation review** — quick audit of the v1 crawl API contract and the in-process job pipeline, document gaps (the Crawl Status table shows `0` for visited/downloaded/errors), and capture findings.
3. **Platform awareness rules** — bake explicit Windows-vs-Linux command-shape rules into Copilot instructions so future agents stop emitting POSIX commands into PowerShell.

## Done when

- [x] `tools/crawl/crawl-batch.js` exists, `--help` works, `--dry-run` prints the planned plan, real run starts N jobs through the v1 HTTP API.
- [x] Registered in `tools/crawl/index.js` TOOL_REGISTRY (alias `batch`).
- [x] Profile `tools/crawl/profiles/news-10x1000.json` runs `crawl-batch` for the canonical 10 sites × 1000 pages set.
- [x] `tools/crawl/AGENT.md` "Decision Tree" includes a `batch` branch.
- [x] API quick-reference doc lists the real v1 endpoints + body shapes.
- [x] Crawler quality review captured (file: `CRAWLER_REVIEW.md` in this session folder).
- [x] `.github/instructions/GitHub Copilot.instructions.md` has a self-contained "Platform-aware command shape" rule block.

## Risks / assumptions

- Unified UI must be running on the configured host:port; CLI must fail loudly if not.
- The v1 API returns immediate `running` status; we do NOT block on completion (jobs are long-running).
- `UI_ALLOW_MULTI_JOBS=true` must be set on the server for parallel jobs.

## Validation

```powershell
; node tools/crawl/crawl-batch.js --help
; node tools/crawl/crawl-batch.js --preset news-10 --max-pages 1000 --dry-run --json
; node tools/crawl/crawl-batch.js --preset news-10 --max-pages 1000 --json
; node tools/crawl/index.js list  # confirm `batch` alias appears
```
