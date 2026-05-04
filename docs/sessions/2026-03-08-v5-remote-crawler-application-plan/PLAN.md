# Plan – V5 Remote Crawler Application

## Objective
Turn the repo's scattered remote crawler, UI, export, article-browsing, and hub-intelligence ideas into a concrete v5 plan for a remotely operated crawler application, without implementing it yet.

## Linked Long-Term Session
- `docs/sessions/long-term/lt-001-advanced-crawler-ui/`

## Done When
- [x] Existing v5-related docs and plans are inventoried and reconciled with the current remote crawler review.
- [x] A concrete v5 plan exists that covers remote UI, crawl control, bundle export, and on-server article browsing.
- [x] The v5 plan promotes the previously soft operator requirements into explicit first-class requirements.
- [x] Intelligent place/topic hub guessing is framed as a core v5 feature instead of separate analyst tooling.
- [x] The missing long-term session anchor for LT-001 is materialized and updated with this milestone.
- [x] The v5 plan is discoverable from the docs/books/index/roadmap/session hub surfaces.

## Change Set
- `docs/books/v5-crawler-architecture.md`
- `docs/books/README.md`
- `docs/ROADMAP.md`
- `docs/INDEX.md`
- `docs/sessions/SESSIONS_HUB.md`
- `docs/sessions/2026-03-08-v5-remote-crawler-application-plan/*`
- `docs/sessions/long-term/lt-001-advanced-crawler-ui/*`

## Risks & Assumptions
- Risk: repo docs still talk about `v4`, `v5`, and `remote-crawler-v2` as if they are one coherent stack. Mitigation: explicitly separate "current reusable assets" from "target v5 product shape."
- Risk: planning drifts into greenfield architecture. Mitigation: reuse named existing assets first: `deploy/remote-crawler-v2`, unified shell, Data Explorer, Article Viewer, download evidence APIs.
- Risk: plan points to missing docs/paths. Mitigation: repair the missing v5 book and long-term session links as part of this pass.
- Risk: intelligent crawling could drift into a greenfield "AI" rewrite. Mitigation: explicitly reuse existing country-hub analysis, pattern learning, and hub-guessing surfaces first.

## Validation
- Code/document inspection only.
- No source implementation changes.
