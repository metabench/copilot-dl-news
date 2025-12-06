# Plan – Project Direction: Reliable News Crawler Scope

## Objective
Define scope and roadmap for a reliable, domain-aware news crawler system targeting the "general long tail" of news, utilizing a hybrid architecture (fast fetch + selective headless analysis).

## User Requirements Analysis
1.  **Target**: General long-tail news sites (not just major outlets).
    *   *Implication*: Heuristic-driven, adaptive extraction; no hardcoded site rules.
2.  **Reliability**: High extraction quality + "Tenacity" (always downloading N documents when requested).
    *   *Implication*: Robust queue management, archive discovery, and recovery from stalls.
3.  **Architecture**: Hybrid approach.
    *   *Fast Path*: `fetch` + `cheerio` for bulk downloads (default).
    *   *Smart Path*: Headless browser (Puppeteer) for layout learning/analysis, only when necessary.
    *   *Constraint*: Accurate layout matching without headless overhead on every page.

## Strategy
1.  **Define Hybrid Architecture**: Create a design for the "Teacher/Worker" model where a headless browser learns layout templates that the fast crawler applies.
2.  **Define Reliability Metrics**: Specify metrics for "Tenacity" (queue health) and "Quality" (extraction verification).
3.  **Roadmap Creation**: Break this down into phases (e.g., Phase 1: Headless Integration, Phase 2: Layout Learning, Phase 3: Tenacity Improvements).

## Change Set
- `docs/sessions/2025-12-06-project-direction-reliable-news-crawler/PLAN.md` (Updated)
- `docs/designs/HYBRID_CRAWLER_ARCHITECTURE.md` (New)
- `docs/goals/RELIABLE_CRAWLER_ROADMAP.md` (New)

## Risks & Mitigations
- **Complexity**: Adding Puppeteer increases build/runtime complexity.
    *   *Mitigation*: Keep Puppeteer as an optional/separate service or strictly isolated module.
- **Performance**: Headless analysis is slow.
    *   *Mitigation*: Strict caching of layout templates; only run on new domains or when extraction confidence is low.

## Tests / Validation
- Review design docs with user.
- Prototype a simple "Layout Fingerprint" script to prove we can match layouts without rendering.
