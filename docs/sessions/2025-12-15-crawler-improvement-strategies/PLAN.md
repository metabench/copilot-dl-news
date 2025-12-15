# Plan – Crawler Improvement Strategies - Deep Research & Lab Proposals

## Objective
Research improvement opportunities, document current status vs roadmap, and propose lab experiments for safe integration

## Done When
- [x] Deep research on all 7 original improvements documented
- [x] Current state vs. expected state matrix created
- [x] Lab experiment proposals for each improvement
- [x] Implementation order recommendation
- [x] Strategy document created at `docs/designs/CRAWLER_IMPROVEMENT_STRATEGIES.md`
- [x] Extended with 3 additional improvements (Boolean, Puppeteer Pool, CSS)
- [x] Extended with Decision Visibility & Config-Driven Architecture (Improvement 11)
- [x] GOFAI integration status documented

## Key Finding
**SkeletonHash, SkeletonDiff, and layout_signatures already exist with real data!**
The Phase 2 roadmap shows these as "not started" but they are already implemented:
- `src/analysis/structure/SkeletonHash.js` - Level 1 & 2 hashing
- `src/analysis/structure/SkeletonDiff.js` - Mask generation
- `layout_signatures` table - 30 rows of Guardian article signatures

**Decision infrastructure is more complete than expected!**
- DecisionConfigSet with versioned config, clone/diff/promote
- Decision Tree Viewer at port 3030
- PlannerHost GOFAI architecture with 4 active plugins
- DecisionLogger for audit logging (exists but not wired to UI)

## Change Set
- `docs/designs/CRAWLER_IMPROVEMENT_STRATEGIES.md` - Comprehensive strategy document (1240+ lines)

## Research Summary

| Improvement | Expected | Actual | Priority |
|-------------|----------|--------|----------|
| 1. Puppeteer Teacher | Not started | Patterns exist in lab/tests | HIGH |
| 2. Confidence Scoring | Not started | **Already in CrawlPlaybookService** | HIGH |
| 3. Incremental Sitemaps | Not started | Batch-only (5000 limit) | MEDIUM |
| 4. Domain Rate Learning | Partial | **Mature DomainThrottleManager** | HIGH |
| 5. Robots.txt Caching | Not started | No caching | LOW |
| 6. Content Deduplication | Not started | URL-only dedup | MEDIUM |
| 7. Adaptive Concurrency | Not started | Static maxConcurrency | MEDIUM |
| BONUS: SkeletonHash | Not started | **✅ EXISTS WITH DATA** | IMMEDIATE |
| 8. Boolean Decision Pipeline | Partial | ArticleSignalsService exists | HIGH |
| 9. Persistent Puppeteer Pool | Not started | Per-invocation launch | HIGH |
| 10. CSS Analysis (Optional) | Not started | No CSS extraction | MEDIUM |
| 11. Decision Visibility | Partial | DecisionConfigSet + Viewer | **VERY HIGH** |

## Lab Experiments Proposed
1. **030-puppeteer-teacher-minimal** - Browser pool + SkeletonHash
2. **031-confidence-scoring-calibration** - Confidence formula testing
3. **032-streaming-sitemap** - SAX-based streaming parser
4. **033-rate-learning-sim** - Rate limit learning simulator
5. **034-robots-txt-parser** - Enhanced robots.txt parsing
6. **035-content-hashing** - Content deduplication strategies
7. **036-adaptive-concurrency** - Concurrency feedback loop
8. **037-skeleton-hash-integration** - Integrate existing SkeletonHash into ArticleProcessor
9. **038-boolean-signal-profiler** - Profile signal costs and accuracy
10. **039-puppeteer-pool-memory** - Validate persistent browser pool
11. **040-css-signal-value** - Assess CSS analysis value (optional)
12. **041-config-driven-signals** - Migrate ArticleSignalsService to config (NEW)
13. **042-decision-audit-perf** - Validate audit logging performance (NEW)
14. **043-decision-tree-editor** - Prototype interactive tree editing (NEW)

## Recommended Implementation Order
1. **Week 1**: SkeletonHash integration, Confidence scoring, Robots.txt caching
2. **Week 2**: Puppeteer Pool, Puppeteer Teacher, Soft failure queue
3. **Week 3**: Boolean Signals, Rate learning, Domain persistence
4. **Week 4**: Streaming sitemaps, Adaptive concurrency
5. **Week 5**: Config-Driven Signals, Decision Audit, Decision Studio (ongoing)

## Risks & Mitigations
- **Puppeteer memory usage**: Limit browser pool to 2-3 instances
- **Rate learning instability**: Add bounds (min 10, max 60 RPM)
- **Sitemap streaming complexity**: Start with simple sitemaps, add index support later

## Tests / Validation
- Each lab experiment has defined success criteria
- Integration tests after each phase
- Memory profiling for Puppeteer Teacher
