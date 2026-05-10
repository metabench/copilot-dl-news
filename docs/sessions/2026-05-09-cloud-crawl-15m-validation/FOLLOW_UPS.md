# Follow Ups – Cloud Crawl 15m Validation

- 2026-05-09 16:41 — 
## 2026-05-09 Workflow Doc Gap
- `docs/workflows/WORKFLOW_REGISTRY.md` and `docs/workflows/continuous-crawl-repair-loop.md` are referenced by repo instructions but are absent in this checkout. Used `tools/crawl/AGENT.md` plus `docs/INDEX.md` snippets as the available workflow source for this session.

## 2026-05-10 Ledger Recovery UX
- Add a first-class crawl CLI command to inspect unconfirmed ledger entries, target-repull their exact watermark window, verify local persistence, and mark superseded entries explicitly. This session proved the manual sequence works, but it should be operator-safe and repeatable.
