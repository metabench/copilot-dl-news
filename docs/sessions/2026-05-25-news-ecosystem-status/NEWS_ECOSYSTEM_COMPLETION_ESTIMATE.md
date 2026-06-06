# News Ecosystem Completion Estimate

Date: 2026-05-25

Scope: news and crawling ecosystem only. This excludes jsgui3 platform/UI-platform completion. Percentages are engineering estimates from local files, tests, docs, and recent session notes, not release commitments.

## Summary Table

| Area | Estimate | Confidence | Current read |
| --- | ---: | --- | --- |
| Crawl operations and remote crawler tooling | 78% | Medium-high | Remote v4 tooling, sync, status/watch, deploy preflight, prune/ledger, and focused tests exist. Current remote server is healthy and idle. |
| Production crawl corpus | 63% | Medium | `data/news.db` is large. After rebuilding the sibling DB native module, recent-download and host breakdown checks work; the broad aggregate stats command was stopped because it was still scanning the large DB. |
| DB ownership and query boundary | 82% | High | Active runtime/check/tool DB ownership is marked migrated to `news-crawler-db`; remaining broad SQL/driver matches are classified residuals. |
| DB access API maturity | 68% | Medium | `news-crawler-db` exposes broad access modules, but public types still include `any` placeholders and analysis/graph read models are not yet clean first-class contracts. |
| Backend core runtime/library | 85% | Medium | The new backend core completed Phase 8 verification with runtime factories, server wrapper, plugins, tasks, API composer, and compatibility docs. It still needs real integration pressure from this repo. |
| DB-backed analysis bridge | 55% | Medium | `news-db-analysis` has services, docs, CLI, and a strong requirements inventory. It is not yet the obvious default surface for all high-value DB-derived datasets. |
| Pure analysis algorithms | 60% | Medium | `news-db-pure-analysis` has real pure algorithms and tests. It is useful, but graph/knowledge-representation routines are still early relative to the available link data. |
| URL intelligence | 70% | Medium | URL fact/classification machinery exists and is aligned with the facts-vs-classifications doctrine. Deeper integration into crawl prioritisation remains incomplete. |
| Document intelligence | 58% | Medium-low | Parser/fact/engine scaffolding and tests exist, but older docs lag current state and production use needs validation. |
| General intelligence fusion | 62% | Medium | Multi-analyzer and fact-fusion code exists. The missing piece is making fused outputs operationally central rather than side analysis. |
| Places intelligence | 48% | Medium-low | Place matching/index/persistence modules exist. It needs tighter corpus-wide evaluation and crawl feedback loops. |
| Graph and knowledge representation | 25% | Medium | The DB has valuable link data and access to links, URLs, documents, content, places, and classifications. Dedicated graph read models, low-storage datasets, centrality/hub/orphan analysis, and knowledge-graph style APIs are still mostly to build. |
| Test and developer workflow | 74% | Medium | Session discipline, crawler tests, DB-boundary checks, and tooling docs are strong. Cross-repo integration tests remain the main gap. |

## Overall Estimate

The news/crawling ecosystem is about 62% complete overall.

That number hides an important split:

- Crawl acquisition and DB ownership are substantially advanced.
- Analysis, graph distillation, and knowledge-representation surfaces are still the biggest leverage gap.
- The system has a lot of raw and semi-structured data, but not enough stable "derived views" that other services can consume without knowing SQL or schema details.

## Main Blockers To Higher Completion

1. `news-crawler-db` has broad access coverage but needs stricter public DTOs and fewer `any` escape hatches.
2. Graph analysis is not yet a first-class read surface even though link data already exists.
3. `news-db-analysis` should become the primary DB-backed analysis facade, with `news-db-pure-analysis` reserved for no-IO algorithms.
4. Cross-repo integration needs to prove that crawler output, DB access, backend core, and analysis services compose cleanly.
5. Large aggregate DB scans need bounded, indexed query paths or streaming implementations before they are used as normal agent fast paths.

## Recommended Completion Path

1. Harden query contracts in `news-crawler-db`.
2. Add read-only graph access models over existing link/page/domain data.
3. Build DB-backed analysis services that consume only DB access APIs.
4. Export low-storage analysis datasets as streams, snapshots, or compact summaries.
5. Connect analysis outputs back into crawl prioritisation and knowledge representation.
