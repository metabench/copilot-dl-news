# DB Query And Analysis Focus

Date: 2026-05-25

## Objective

Make the database query system the stable foundation for the rest of the news ecosystem, then expose low-storage analysis datasets that distill the existing crawl corpus, especially graph-derived properties from page and site links.

## Boundary Rules

1. All DB reads and writes go through `news-crawler-db`.
2. `copilot-dl-news` services, tools, crawler code, backend code, and analysis consumers must not issue raw SQLite/Postgres/driver queries directly.
3. `news-db-analysis` may depend on `news-crawler-db` access APIs, but should not know concrete schema details unless wrapped by typed DB access contracts.
4. `news-db-pure-analysis` remains IO-free. It should receive arrays, iterables, or plain DTOs and return deterministic analysis results.
5. Derived datasets should be streamed or recomputed by default. Persist only compact summaries, checkpoints, fingerprints, or cache metadata when recomputation is too expensive.
6. Do not duplicate existing page, link, document, or content bodies into new analysis tables.

## Current Position

The DB boundary migration is strong for active ownership: recent session status marks active runtime/check/tool DB ownership as complete, with remaining broad SQL/driver-pattern matches classified as docs, static/generated bundles, dev tooling, UI fixtures, regex parsers, SPARQL query text, or deprecated helpers.

The next level is not another broad migration. It is contract hardening:

- make public access DTOs explicit,
- remove or narrow public `any` types,
- add graph-oriented read models,
- make analysis services consume those read models without leaking SQL knowledge,
- add tests that prove non-DB packages can get useful datasets through stable APIs.

## Workstream A: Query Contract Hardening

Target repo: `../news-crawler-db`

Primary goal: make DB access easy and safe for other packages to consume.

Recommended steps:

1. Inventory `news-db-analysis/docs/analysis-requirements.md` against existing `news-crawler-db` access modules.
2. Mark each requirement as covered, partially covered, or missing.
3. Replace public `any` placeholders in `src/db/types.ts` where they affect analysis-facing or crawler-facing APIs.
4. Add explicit DTOs for link/page/domain/document analysis reads.
5. Add an automated boundary check in this repo that fails on raw SQLite/Postgres driver usage outside approved DB modules, while preserving the existing residual classification file.
6. Prefer streaming/iterator access for large reads instead of bulk "load everything" helpers.

Suggested first contracts:

```ts
interface Link_Edge_Row {
  source_url_id: number;
  target_url_id: number | null;
  source_url: string;
  target_url: string;
  source_host: string;
  target_host: string | null;
  link_text?: string | null;
  rel?: string | null;
}

interface Site_Graph_Summary {
  host: string;
  page_count: number;
  internal_edge_count: number;
  external_edge_count: number;
  orphan_page_count: number;
  dead_end_page_count: number;
  candidate_hub_count: number;
}
```

## Workstream B: First-Class Graph Access

Target repo: `../news-crawler-db`

Add a read-only graph access surface over existing link, URL, document, content, classification, and place data.

Suggested module:

- `src/db/sqlite/access/graph.ts`
- `GraphAccess` exported through the DB adapter surface.

Suggested methods:

```ts
iterate_page_edges(options)
get_site_graph_summary(host, options)
get_host_edge_counts(options)
rank_pages_by_inbound_links(host, options)
rank_pages_by_outbound_links(host, options)
find_orphan_pages(host, options)
find_dead_end_pages(host, options)
find_hub_candidates(host, options)
iterate_crawl_priority_features(host, options)
```

The point is not to create a new graph database. The point is to expose graph-shaped read models from the relational data that already exists.

Storage policy:

- Use existing `links`, URL, response, document, content, classification, and place data.
- Avoid materialized edge duplicates.
- If a cache is necessary, store compact metrics keyed by host, source data version, and analysis version.
- Prefer NDJSON or async iterators for large datasets.

## Workstream C: DB-Backed Analysis Facade

Target repo: `../news-db-analysis`

Make analysis easier to obtain by turning graph and corpus questions into named service methods.

Suggested services:

- `Website_Graph_Analysis_Service`
- `Corpus_Graph_Analysis_Service`
- `Crawl_Priority_Dataset_Service`
- `Coverage_Gap_Analysis_Service`

Suggested methods:

```ts
summarize_site_graph(host, options)
get_domain_link_graph(host, options)
find_hub_candidates(host, options)
find_orphan_pages(host, options)
rank_pages_by_graph_importance(host, options)
get_cross_domain_linking(host, options)
build_crawl_priority_dataset(host, options)
build_knowledge_seed_dataset(options)
```

The services should consume `news-crawler-db` access APIs only. Any centrality, clustering, ranking, or graph scoring algorithm that does not need IO should live in `news-db-pure-analysis`.

## Workstream D: Low-Storage Derived Datasets

The system should expose useful datasets without inflating the DB.

Recommended dataset pattern:

```ts
interface Analysis_Dataset_Manifest {
  name: string;
  source_access_methods: string[];
  parameters: Record<string, unknown>;
  freshness_policy: "live" | "ttl-cache" | "manual-snapshot";
  storage_policy: "none" | "compact-summary" | "small-checkpoint";
  output_format: "json" | "ndjson";
}
```

High-value datasets:

1. Site graph summary per host.
2. Page adjacency stream per host.
3. Host-to-host link graph.
4. Hub candidate pages.
5. Orphan and dead-end pages.
6. Inbound-link ranking.
7. Crawl-priority feature dataset.
8. Coverage-gap dataset by topic/place/site.
9. Knowledge seed dataset combining pages, links, places, facts, classifications, and confidence.

These should be generated from existing data and exposed as streams or compact JSON summaries.

## Workstream E: Crawl Feedback Loop

The analysis output should eventually guide crawling.

Useful feedback signals:

- pages with high internal inbound links but missing content,
- hubs with many article-like outbound links,
- hosts with strong cross-domain references,
- pages linking to new domains or places,
- dead ends that may indicate parser or link extraction gaps,
- article clusters with thin source coverage,
- places/topics with high mention density but weak crawling depth.

These should become facts or crawl-priority features, not ad hoc one-off scripts.

## Acceptance Criteria For The Next Implementation Phase

1. `news-crawler-db` exposes a typed `GraphAccess` read surface.
2. At least five graph questions can be answered without raw SQL outside the DB module:
   - site graph summary,
   - page edges,
   - host edge counts,
   - hub candidates,
   - orphan/dead-end pages.
3. `news-db-analysis` wraps the graph access surface in named analysis service methods.
4. Large datasets are available as iterators or NDJSON streams.
5. No large derived tables are added.
6. Tests prove consumers can obtain graph-derived analysis without schema knowledge.
7. The existing DB-boundary residual classifier remains current.

## Immediate Next Task

Implement `GraphAccess` in `news-crawler-db` as a read-only adapter contract, then add `Website_Graph_Analysis_Service` in `news-db-analysis` that consumes it. This directly addresses both priorities: DB queries stay behind the DB module, and graph-derived analysis becomes easy for the rest of the system to use.

## Review Note: Legacy Raw SQL Pattern

`news-db-analysis` currently exposes `query` and `execute` on its local `NewsDbAdapter` contract, and older docs describe services as constructing SQL. Treat that as legacy compatibility for existing services. New graph-analysis services should establish the cleaner pattern: depend on typed `news-crawler-db` accessors, not raw SQL strings.
